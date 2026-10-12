"""Original x402 Python signing/requests integration with durable response receiving."""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import os
import time
from typing import Any
from urllib.parse import parse_qsl, urlsplit
import uuid

from .model import WorkspaceError, encode, error_details
from .workspace import Workspace

NETWORK = "eip155:8453"
# Circle USDC on Base. The customer's selected network/asset and each current
# challenge are both checked before the original SDK creates a signature.
ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
DECIMALS = 6


def atomic_usdc(value: str) -> int:
    try:
        amount = Decimal(value) * 10**DECIMALS
        if not amount.is_finite() or amount < 0 or amount != amount.to_integral_value():
            raise ValueError
        return int(amount)
    except (InvalidOperation, ValueError, TypeError) as error:
        raise WorkspaceError("INVALID_AMOUNT", "Use a nonnegative USDC amount with at most six decimals.") from error


def _same_resource(left: str, right: str) -> bool:
    a, b = urlsplit(left), urlsplit(right)
    return (
        a.scheme.lower(), a.netloc.lower(), a.path, sorted(parse_qsl(a.query, keep_blank_values=True)), a.fragment
    ) == (
        b.scheme.lower(), b.netloc.lower(), b.path, sorted(parse_qsl(b.query, keep_blank_values=True)), b.fragment
    )


class PaidReceiver:
    """One original SDK client, one selected wallet, one durable workspace receiver."""

    def __init__(self, workspace: Workspace, *, private_key: str | None = None,
                 signer: Any = None, network: str = NETWORK, asset: str = ASSET,
                 timeout: float = 60, max_response_bytes: int = 64 * 1024 * 1024) -> None:
        if workspace.configuration["mode"] != "live":
            raise WorkspaceError("PREVIEW_IS_LOCAL", "Use a live workspace for paid receiving.")
        try:
            import requests
            from eth_account import Account
            from x402 import x402ClientSync
            from x402.http.clients.requests import x402HTTPAdapter
            from x402.mechanisms.evm.exact import register_exact_evm_client
            from x402.mechanisms.evm.signers import EthAccountSigner
        except ImportError as error:
            raise WorkspaceError("PAYMENT_DEPENDENCIES", "Install the included payment requirements before receiving.") from error
        self.workspace, self.network, self.asset = workspace, network, asset.lower()
        self.timeout, self.max_response_bytes = timeout, max_response_bytes
        self.attempt: dict[str, Any] | None = None
        self.observed: list[tuple[str, Any]] = []
        self.last_request_at = 0.0
        self.closed = False
        if signer is None:
            key = private_key if private_key is not None else os.environ.get("PAYER_PRIVATE_KEY", "").strip()
            if not key:
                raise WorkspaceError("WALLET_REQUIRED", "Set PAYER_PRIVATE_KEY in the receiving process environment.")
            signer = EthAccountSigner(Account.from_key(key))
        self.client = x402ClientSync(payment_requirements_selector=self._select)
        register_exact_evm_client(self.client, signer)
        self.client.on_before_payment_creation(self._before_payment)
        receiver = self

        class RetainingAdapter(x402HTTPAdapter):
            """Tap the original adapter's response stream; signing and request retries stay in the SDK."""

            def build_response(self, req: Any, resp: Any) -> Any:
                response = super().build_response(req, resp)
                if receiver.attempt is None:
                    response.close()
                    raise WorkspaceError("REQUEST_CONTEXT", "Start a retained receiving attempt before making a request.")
                response_id = workspace.begin_response(
                    receiver.attempt["id"], url=response.url, status=response.status_code,
                    headers=dict(response.headers), purpose="events")
                receiver.observed.append((response_id, response))
                # urllib3 can raise its length error while filling a read buffer,
                # before yielding an already received short prefix. Retain that
                # prefix first and enforce the same entity length at EOF below.
                response.raw.enforce_content_length = False
                original_stream = response.raw.stream

                def retain_stream(amt: int = 65536, decode_content: bool | None = None) -> Any:
                    for chunk in original_stream(amt=amt, decode_content=decode_content):
                        workspace.append(response_id, chunk)
                        retained = workspace.response(response_id)
                        if retained["length"] > receiver.max_response_bytes:
                            raise WorkspaceError("RESPONSE_SIZE", "The retained response exceeds the configured receiving size.",
                                                 response_id=response_id, received_bytes=retained["length"])
                        yield chunk  # A chunk reaches the SDK/application only after it is stored.
                    record = workspace.response(response_id)
                    expected = response.headers.get("Content-Length")
                    encoding = response.headers.get("Content-Encoding", "identity").lower()
                    if expected and encoding in ("", "identity") and (
                        not expected.isdecimal() or int(expected) != record["length"]
                    ):
                        raise WorkspaceError("RESPONSE_LENGTH", "The complete entity length differs from the HTTP response.",
                                             response_id=response_id, expected=expected, received=record["length"])
                    workspace.finish_response(response_id)

                response.raw.stream = retain_stream
                return response

        self.adapter = RetainingAdapter(self.client, max_retries=0)
        # This is the original x402_requests session assembly with its adapter
        # subclassed solely at build_response, before either SDK/body consumer.
        self.session = requests.Session()
        self.session.mount("https://", self.adapter)
        self.session.mount("http://", self.adapter)
        self.session.headers.update({"Accept": "application/json", "Accept-Encoding": "identity"})

    def _select(self, version: int, requirements: list[Any]) -> Any:
        if version != 2 or self.attempt is None:
            raise WorkspaceError("PAYMENT_PROTOCOL", "This receiving operation requires an x402 v2 event request.")
        run = self.workspace.run(self.attempt["run"])
        remaining = int(run["amount_limit"]) - int(run["reserved_amount"])
        valid = []
        for requirement in requirements:
            amount = int(requirement.get_amount())
            if (requirement.scheme == "exact" and requirement.network == self.network
                    and requirement.asset.lower() == self.asset
                    and (requirement.extra or {}).get("paymentFlow") in (None, "authorization")
                    and 0 <= amount <= min(int(run["page_amount_limit"]), remaining)):
                valid.append(requirement)
        if not valid:
            raise WorkspaceError("PAYMENT_LIMIT", "No current challenge matches the authorized network, asset and amount.")
        return min(valid, key=lambda requirement: int(requirement.get_amount()))

    def _before_payment(self, context: Any) -> None:
        if self.attempt is None:
            raise WorkspaceError("REQUEST_CONTEXT", "There is no active receiving attempt.")
        challenge = context.payment_required.model_dump(mode="json", by_alias=True)
        resource = (challenge.get("resource") or {}).get("url")
        if not resource or not _same_resource(resource, self.attempt["url"]):
            raise WorkspaceError("PAYMENT_RESOURCE", "The challenge does not identify this exact event request.")
        selected = context.selected_requirements
        # Recheck the selected original object before reserving any amount.
        if self._select(2, [selected]) is not selected:
            raise WorkspaceError("PAYMENT_REQUIREMENTS", "The selected payment requirement has changed.")
        requirements = selected.model_dump(mode="json", by_alias=True)
        requirements["amount"] = str(selected.get_amount())
        self.workspace.authorize(self.attempt["id"], requirements, challenge)

    def fetch(self, attempt: dict[str, Any]) -> str:
        if self.closed or self.attempt is not None:
            raise WorkspaceError("RECEIVER_STATE", "This receiver is closed or already receiving a page.")
        # Two HTTP requests can make up a paid page. At most two requests/second
        # per receiver leaves room below the provider's recommended five.
        delay = 1.0 - (time.monotonic() - self.last_request_at)
        if delay > 0:
            time.sleep(delay)
        self.last_request_at = time.monotonic()
        self.attempt, self.observed = attempt, []
        original_error: BaseException | None = None
        try:
            response = self.session.get(attempt["url"], timeout=self.timeout, stream=True, allow_redirects=False)
            for _chunk in response.iter_content(chunk_size=65536):
                pass
            matches = [ident for ident, observed in self.observed if observed is response]
            if len(matches) != 1:
                raise WorkspaceError("RESPONSE_CONTEXT", "The final response is not attached to the original request.")
            response_id = matches[0]
            self.workspace.accept_response(attempt["id"], response_id)
            return response_id
        except BaseException as error:
            original_error = error
            raise
        finally:
            cleanup = []
            for ident, response in self.observed:
                try:
                    response.close()
                except Exception as error:
                    cleanup.append({"response": ident, "error": error_details(error)})
            if cleanup:
                with self.workspace._tx() as db:
                    db.execute("INSERT INTO history(created,action,value) VALUES(datetime('now'),?,?)",
                               ("response_cleanup", encode({"attempt": attempt["id"], "errors": cleanup})))
                if original_error is not None:
                    original_error.cleanup_errors = cleanup
            self.attempt, self.observed = None, []

    def close(self) -> None:
        if not self.closed:
            self.closed = True
            self.session.close()

    def __enter__(self) -> "PaidReceiver":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


def drain(workspace: Workspace, receiver: Any, *, operation_key: str | None = None,
          max_pages: int, max_amount: int, max_page_amount: int = 50000,
          refresh: bool = False, cancelled: Any = None) -> dict[str, Any]:
    """Complete a forward drain within one explicit authorization, or retain its exact stopping point."""
    key = operation_key or uuid.uuid4().hex
    with workspace.receiving():
        recovered = workspace.recover_received()
        run, new = workspace.start_run(key, max_pages=max_pages, max_amount=max_amount,
                                       max_page_amount=max_page_amount, refresh=refresh)
        if not new:
            return {"run": workspace.run(key), "reused": True, "recovered": recovered}
        applied = 0
        for _ in range(max_pages):
            if cancelled is not None and cancelled.is_set():
                return {"run": workspace.finish_run(key, "stopped"), "pages": applied, "recovered": recovered}
            attempt = workspace.prepare_attempt(key)
            try:
                receiver.fetch(attempt)
                page = workspace.apply(attempt["id"])
                applied += 1
                if not page["has_more"]:
                    return {"run": workspace.finish_run(key, "caught_up"), "pages": applied, "recovered": recovered}
            except Exception as error:
                workspace.fail_attempt(attempt["id"], error)
                result = {"run": workspace.finish_run(key, "failed", error), "pages": applied,
                          "recovered": recovered, "attempt": attempt["id"]}
                error.receiving_result = result
                raise
        return {"run": workspace.finish_run(key, "page_limit"), "pages": applied, "recovered": recovered}
