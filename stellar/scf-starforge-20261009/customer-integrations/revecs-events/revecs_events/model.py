"""The provider's event contract, page validation and local current-state replay."""
from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import re
import traceback
from typing import Any
from urllib.parse import urlsplit, urlunsplit

CONTRACT = "Biotech Catalyst Sentinel 0.8.0"
API_BASE = "https://api.biotechcatalystsentinel.com"
EVENT_TYPES = {
    "new_date_assigned": "Date assigned",
    "date_extension": "FDA date extension",
    "decision_outcome": "Decision reported",
    "corrected": "Vendor data repair",
    "retracted": "Record withdrawn",
    "restored": "Record restored",
}


class WorkspaceError(Exception):
    """An actionable operation error with retained, structured context."""

    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code, self.details = code, details


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    answer: dict[str, Any] = {}
    for key, value in pairs:
        if key in answer:
            raise WorkspaceError("DUPLICATE_JSON_KEY", "A response repeats a JSON property.", key=key)
        answer[key] = value
    return answer


def decode(body: bytes) -> Any:
    def bad_constant(value: str) -> None:
        raise WorkspaceError("INVALID_JSON_NUMBER", "A response contains a non-finite number.", value=value)
    return json.loads(body.decode("utf-8"), object_pairs_hook=_pairs, parse_constant=bad_constant)


def integer(value: Any, name: str, minimum: int = 0, maximum: int = 2**63 - 1) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise WorkspaceError("INVALID_INTEGER", f"{name} must be an integer from {minimum} to {maximum}.")
    return value


def ticker(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not 1 <= len(value) <= 12 or re.search(r"\s", value):
        raise WorkspaceError("INVALID_TICKER", "A ticker must contain 1–12 characters without spaces.")
    return value.upper()


def api_base(value: str, *, allow_loopback: bool = False) -> str:
    parsed = urlsplit(value)
    local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise WorkspaceError("INVALID_API_ORIGIN", "Use an API origin without credentials, a path or a query.")
    if parsed.scheme != "https" and not (allow_loopback and local and parsed.scheme == "http"):
        raise WorkspaceError("INVALID_API_ORIGIN", "The API origin must use HTTPS.")
    if not parsed.hostname:
        raise WorkspaceError("INVALID_API_ORIGIN", "The API origin must include a host.")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def validate_page(body: bytes, since: int, limit: int) -> dict[str, Any]:
    """Validate a complete ascending cursor response, retaining unknown fields."""
    page = decode(body)
    if not isinstance(page, dict) or not isinstance(page.get("data"), list) or not isinstance(page.get("meta"), dict):
        raise WorkspaceError("INVALID_PAGE", "The response must contain an event list and metadata.")
    rows, meta = page["data"], page["meta"]
    if len(rows) > limit or meta.get("total") != len(rows) or type(meta.get("total")) is not int:
        raise WorkspaceError("INVALID_PAGE_COUNT", "The response count differs from its complete event list.")
    if meta.get("limit") != limit or type(meta.get("limit")) is not int:
        raise WorkspaceError("INVALID_PAGE_LIMIT", "The response limit differs from the requested limit.")
    if type(meta.get("has_more")) is not bool:
        raise WorkspaceError("NOT_A_CURSOR_PAGE", "The response must include cursor-mode has_more metadata.")
    previous = since
    for event in rows:
        if not isinstance(event, dict):
            raise WorkspaceError("INVALID_EVENT", "Every event must be an object.")
        event_id = integer(event.get("event_id"), "event_id", 1)
        integer(event.get("catalyst_id"), "catalyst_id", 1)
        if event_id <= previous:
            raise WorkspaceError("EVENT_ORDER", "Cursor events must be strictly ascending and newer than since.")
        previous = event_id
        if not isinstance(event.get("event_type"), str) or not event["event_type"]:
            raise WorkspaceError("INVALID_EVENT_TYPE", "Every event must have an event type.")
        for field in ("applied", "date_changed", "new_date_upcoming"):
            if field in event and type(event[field]) is not bool:
                raise WorkspaceError("INVALID_EVENT_FLAG", f"{field} must be a boolean.")
        if "tickers" in event and (
            not isinstance(event["tickers"], list) or any(not isinstance(v, str) for v in event["tickers"])
        ):
            raise WorkspaceError("INVALID_EVENT_TICKERS", "The event co-filer tickers must be a list of strings.")
        for field in ("prior_date", "new_date", "filed_at"):
            value = event.get(field)
            if value is not None:
                if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    raise WorkspaceError("INVALID_EVENT_DATE", f"{field} must be a calendar date.")
                dt.date.fromisoformat(value)
        if event.get("merged_into") is not None:
            integer(event["merged_into"], "merged_into", 1)
        for field in ("source_url", "source_quote", "drug_name", "company", "ticker", "outcome"):
            if event.get(field) is not None and not isinstance(event[field], str):
                raise WorkspaceError("INVALID_EVENT_TEXT", f"{field} must be text or null.")
    if integer(meta.get("next_since"), "next_since") != previous:
        raise WorkspaceError("CURSOR_MISMATCH", "next_since must identify this page's highest event, or echo an empty cursor.")
    if meta["has_more"] and not rows:
        raise WorkspaceError("EMPTY_CONTINUATION", "An empty page cannot advance a remaining backlog.")
    return page


def error_details(error: BaseException) -> dict[str, Any]:
    """Keep complete exception chains and useful values without capturing signer/session objects."""
    seen: set[int] = set()

    def value(item: Any) -> Any:
        if item is None or type(item) in (str, bool, int, float):
            try:
                encode(item)
                return item
            except (ValueError, TypeError):
                return repr(item)
        if isinstance(item, bytes):
            return {"encoding": "base64", "bytes": len(item), "value": base64.b64encode(item).decode()}
        if id(item) in seen:
            return {"reference": "already retained"}
        seen.add(id(item))
        if isinstance(item, (list, tuple)):
            return [value(v) for v in item]
        if isinstance(item, dict):
            return {str(k): value(v) for k, v in item.items()}
        if isinstance(item, BaseException):
            fields = {}
            for key, field in vars(item).items():
                if key in {"request", "session", "signer", "account", "payment_payload", "private_key"}:
                    fields[key] = {"type": type(field).__name__}
                else:
                    fields[key] = value(field)
            return {
                "type": f"{type(item).__module__}.{type(item).__name__}",
                "message": str(item), "arguments": value(item.args), "fields": fields,
                "traceback": "".join(traceback.format_exception(type(item), item, item.__traceback__, chain=False)),
                "cause": value(item.__cause__), "context": value(item.__context__),
            }
        return {"type": f"{type(item).__module__}.{type(item).__name__}"}
    return value(error)


def project(events: list[dict[str, Any]], *, today: dt.date | None = None) -> dict[str, Any]:
    """Replay observations, treating the structured lifecycle and applied flags as authoritative."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    ordered = sorted(events, key=lambda e: e["event_id"])
    latest_lifecycle: dict[int, dict[str, Any]] = {}
    for event in ordered:
        if event["event_type"] in ("retracted", "restored"):
            latest_lifecycle[event["catalyst_id"]] = event

    aliases = {
        ident: event["merged_into"]
        for ident, event in latest_lifecycle.items()
        if event["event_type"] == "retracted" and event.get("merged_into") is not None
    }

    def destination(ident: int) -> int:
        visited: set[int] = set()
        current = ident
        while current in aliases:
            if current in visited:
                raise WorkspaceError("MERGE_CYCLE", "The observed merge records contain a cycle.", catalyst_id=ident)
            visited.add(current)
            current = aliases[current]
        return current

    merged_cofilers: dict[int, set[str]] = {}
    for event in ordered:
        target = destination(event["catalyst_id"])
        if target != event["catalyst_id"]:
            values = event.get("tickers") or ([event["ticker"]] if event.get("ticker") else [])
            merged_cofilers.setdefault(target, set()).update(value.upper() for value in values)

    grouped: dict[int, list[dict[str, Any]]] = {}
    direct: dict[int, list[dict[str, Any]]] = {}
    for event in ordered:
        ident = event["catalyst_id"]
        direct.setdefault(ident, []).append(event)
        target = ident if event["event_type"] in ("retracted", "restored") else destination(ident)
        grouped.setdefault(target, []).append(event)
    states: list[dict[str, Any]] = []
    timelines: dict[str, list[dict[str, Any]]] = {}
    for ident in sorted(set(grouped) | set(direct)):
        history = sorted(grouped.get(ident, []), key=lambda e: e["event_id"])
        # A merge drops a loser's duplicate filing/type row. Prefer the observed
        # survivor's row; preserve every original row in its retained page/history.
        preferred = {
            (e.get("accession"), e["event_type"]): e["event_id"]
            for e in history if e["catalyst_id"] == ident and e.get("accession")
        }
        served: str | None = None
        date_event: dict[str, Any] | None = None
        outcome: str | None = None
        current: dict[str, Any] = {}
        cofilers: set[str] = set(merged_cofilers.get(ident, set()))
        extensions = repairs = 0
        display_history = []
        for event in history:
            cofilers.update(v.upper() for v in event.get("tickers", []))
            if not event.get("tickers") and event.get("ticker"):
                cofilers.add(event["ticker"].upper())
            duplicate = event["catalyst_id"] != ident and (
                event.get("accession"), event["event_type"]
            ) in preferred
            display = dict(event)
            display.update({
                "event_id": str(event["event_id"]), "catalyst_id": str(event["catalyst_id"]),
                "label": EVENT_TYPES.get(event["event_type"], "Provider event"),
                "duplicate_after_merge": duplicate,
                "observed_origin": str(event["catalyst_id"]),
            })
            if event.get("merged_into") is not None:
                display["merged_into"] = str(event["merged_into"])
            display_history.append(display)
            if duplicate:
                continue
            for key in ("drug_name", "company", "ticker", "indication", "application_number"):
                if event.get(key) is not None:
                    current[key] = event[key]
            if event.get("applied") is True and event.get("new_date") is not None:
                previous_date = served
                served, date_event = event["new_date"], event
                if event["event_type"] in ("new_date_assigned", "date_extension") and (
                    outcome is None or previous_date is None or served > previous_date
                ):
                    outcome = None  # A later goal date reopens the review; a restatement does not.
            if event["event_type"] == "decision_outcome" and event.get("outcome"):
                outcome = event["outcome"]
            if event["event_type"] == "date_extension" and event.get("applied") and event.get("date_changed"):
                extensions += 1
            if event["event_type"] == "corrected":
                repairs += 1
        # The provider reports each canonical record's current lead-filer metadata.
        # Older re-parented rows contribute history and co-filers, not a replacement lead.
        for event in direct.get(ident, []):
            for key in ("drug_name", "company", "ticker", "indication", "application_number"):
                if event.get(key) is not None:
                    current[key] = event[key]
        # Keep a merged-away card and its direct history discoverable by its co-filer.
        if ident in aliases:
            history = direct.get(ident, [])
            for event in history:
                cofilers.update(v.upper() for v in event.get("tickers", []))
                for key in ("drug_name", "company", "ticker", "indication", "application_number"):
                    if event.get(key) is not None:
                        current[key] = event[key]
            display_history = []
            for event in history:
                row = dict(event)
                row.update({"event_id": str(event["event_id"]), "catalyst_id": str(ident),
                            "label": EVENT_TYPES.get(event["event_type"], "Provider event")})
                if row.get("merged_into") is not None:
                    row["merged_into"] = str(row["merged_into"])
                display_history.append(row)
        lifecycle = latest_lifecycle.get(ident)
        withdrawn = bool(lifecycle and lifecycle["event_type"] == "retracted")
        if withdrawn:
            status = "Merged" if ident in aliases else "Withdrawn"
        elif outcome == "crl":
            status = "Awaiting resubmission"
        elif outcome == "approved":
            status = "Approval reported"
        elif outcome == "tentative":
            status = "Tentative approval"
        elif outcome == "none_found":
            status = "Decision unresolved"
        elif served:
            status = "Upcoming" if dt.date.fromisoformat(served) >= today else "Date passed"
        else:
            status = "Awaiting date"
        summary = {
            "id": str(ident), "name": current.get("drug_name") or current.get("company") or "Catalyst",
            "company": current.get("company"), "tickers": sorted(cofilers),
            "indication": current.get("indication"), "application_number": current.get("application_number"),
            "date": None if withdrawn else served,
            "days_to_date": None if withdrawn or served is None else (dt.date.fromisoformat(served) - today).days,
            "status": status, "outcome": outcome, "withdrawn": withdrawn,
            "merged_into": str(destination(ident)) if ident in aliases else None,
            "fda_extensions": extensions, "vendor_repairs": repairs,
            "source_url": date_event.get("source_url") if date_event and not withdrawn else None,
            "source_quote": date_event.get("source_quote") if date_event and not withdrawn else None,
            "source_kind": ("Vendor repair" if date_event and date_event["event_type"] == "corrected" else "Filing"),
            "filed_at": date_event.get("filed_at") if date_event else None,
            "date_confidence": date_event.get("date_confidence") if date_event else None,
            "last_observed": history[-1].get("detected_at") if history else None,
            "events": len(display_history),
        }
        states.append(summary)
        timelines[str(ident)] = list(reversed(display_history))
    states.sort(key=lambda s: (s["withdrawn"], s["date"] is None, s["date"] or "", s["name"], s["id"]))
    return {"catalysts": states, "timelines": timelines,
            "fda_extensions": sum(s["fda_extensions"] for s in states if not s["withdrawn"]),
            "vendor_repairs": sum(s["vendor_repairs"] for s in states if not s["withdrawn"])}
