#!/usr/bin/env python3
"""Original merchant authority and gateway lifecycle for the API merchant workspace."""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import signal
import sqlite3
import stat
import sys
import threading
import time
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api-access"))
import receiver
import access
import pass_store
import gateway

spec = importlib.util.spec_from_file_location("sf101_checkout_application", ROOT / "checkout-application.py")
checkout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkout)
LIMIT = 20 * 1024 * 1024
CLAIM_ENV = "SF101_WORKSPACE_ORDER_CLAIM"


def need(value, code, status=400):
    if not value:
        raise pass_store.PassError(code, status)


def compact(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def private_file(raw, limit=LIMIT):
    need(isinstance(raw, str) and os.path.isabs(raw) and os.path.normpath(raw) == raw,
         "API_MERCHANT_ABSOLUTE_PATH_REQUIRED")
    fd = os.open(raw, os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as source:
        before = os.fstat(source.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and not before.st_mode & 0o077
             and before.st_size <= limit and before.st_uid == os.getuid(),
             "API_MERCHANT_PRIVATE_FILE_REQUIRED")
        body = source.read(limit + 1)
        after = os.fstat(source.fileno())
        need(len(body) == before.st_size and len(body) <= limit
             and (before.st_dev, before.st_ino, before.st_mtime_ns, before.st_ctime_ns)
             == (after.st_dev, after.st_ino, after.st_mtime_ns, after.st_ctime_ns)
             and os.path.realpath(raw) == raw, "API_MERCHANT_SOURCE_CHANGED", 409)
        return body


def context(value):
    selected = value["context"]
    need(isinstance(selected, dict), "API_MERCHANT_CHECKOUT_CONTEXT_REQUIRED")
    root = receiver.require_private_dir(selected["state"])
    return root, selected


def matching_order(value, *, token=None):
    root, selected = context(value)
    ref = value["orderReference"]
    need(receiver.is_match(receiver.REF_RE, ref), "ORDER_REFERENCE_INVALID")
    db = receiver.connect(root)
    try:
        row = db.execute("SELECT * FROM orders WHERE order_ref=?", (ref,)).fetchone()
    finally:
        db.close()
    if row is None:
        return None
    expected = {
        "route_id": selected["routeId"], "method": selected["method"],
        "network": selected["network"], "amount_atomic": selected["amountAtomic"],
        "asset_digest": selected["assetDigest"], "recipient_digest": selected["recipientDigest"],
        "file_sha256": value["planSha256"], "file_bytes": value["planBytes"],
    }
    need(all(row[key] == expected_value for key, expected_value in expected.items()),
         "API_MERCHANT_ORIGINAL_ORDER_BINDING_CHANGED", 409)
    if token is not None:
        need(hmac.compare_digest(row["token_sha256"], receiver.sha(token.encode("utf-8"))),
             "API_MERCHANT_ORIGINAL_CLAIM_CHANGED", 409)
    return checkout.describe(str(root), ref)


def enroll(value):
    root, selected = context(value)
    claim_bytes = private_file(value["claimFile"], 4096)
    claim = json.loads(claim_bytes.decode("utf-8"))
    need(isinstance(claim, dict) and claim.get("orderReference") == value["orderReference"]
         and isinstance(claim.get("token"), str), "API_MERCHANT_RETAINED_CLAIM_REQUIRED")
    os.environ[CLAIM_ENV] = claim["token"]
    token = receiver.get_private_env(CLAIM_ENV)
    source = private_file(value["planFile"], pass_store.MAX_PLAN_BYTES)
    need(len(source) == value["planBytes"] and hashlib.sha256(source).hexdigest() == value["planSha256"],
         "API_MERCHANT_RETAINED_PLAN_CHANGED", 409)
    pass_store.validate_plan(json.loads(source.decode("utf-8")))
    prior = matching_order(value, token=token)
    if prior is not None:
        return {"order": prior, "replayed": True}
    arguments = argparse.Namespace(ref=value["orderReference"], route=selected["routeId"],
        method=selected["method"], network=selected["network"], amount=selected["amountAtomic"],
        asset_digest=selected["assetDigest"], recipient_digest=selected["recipientDigest"],
        file=value["planFile"], claim_env=CLAIM_ENV)
    try:
        receiver.enroll(arguments, root)
    except Exception:
        # The original INSERT may have committed before its caller lost the reply.
        # Only the exact retained claim, native terms and enrolled plan can reopen it.
        completed = matching_order(value, token=token)
        if completed is None:
            raise
        return {"order": completed, "replayed": True}
    return {"order": matching_order(value, token=token), "replayed": False}


def inspect_order(value):
    root, _ = context(value)
    ref = value["orderReference"]
    native = access.show_order(root, ref)
    result = {"order": checkout.describe(str(root), ref), "native": native, "pass": None,
              "calls": {"calls": [], "nextAfter": None}}
    try:
        result["pass"] = pass_store.show_pass(str(root), ref)
        result["calls"] = pass_store.list_calls(str(root), ref,
            after=value.get("after"), limit=value.get("limit", 100))
    except pass_store.PassError as error:
        if error.code != "PASS_NOT_ATTACHED":
            raise
    return result


@contextmanager
def retained_stream(raw):
    raw = str(raw)
    need(os.path.isabs(raw) and os.path.normpath(raw) == raw,
         "API_MERCHANT_ABSOLUTE_PATH_REQUIRED")
    fd = os.open(raw, os.O_RDONLY | os.O_NOFOLLOW | getattr(os, "O_NONBLOCK", 0))
    with os.fdopen(fd, "rb") as source:
        before = os.fstat(source.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and not before.st_mode & 0o077
             and before.st_uid == os.getuid() and os.path.realpath(raw) == raw,
             "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)
        yield source, before
        after = os.fstat(source.fileno())
        named = os.lstat(raw)
        stamp = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_nlink,
                              item.st_mode, item.st_mtime_ns, item.st_ctime_ns)
        need(stamp(before) == stamp(after) == stamp(named),
             "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)


def archive(value):
    """One complete ZIP of the exact original encrypted bundle, without buffering its objects."""
    root = receiver.require_private_dir(value["directory"])
    destination = Path(value["destination"])
    need(destination.is_absolute() and str(destination) == os.path.normpath(str(destination))
         and not destination.is_symlink(), "API_MERCHANT_ARCHIVE_DESTINATION_REQUIRED")
    receiver.require_private_dir(str(destination.parent))
    need(os.path.realpath(destination.parent) == str(destination.parent),
         "API_MERCHANT_ARCHIVE_DESTINATION_REQUIRED")
    manifest = private_file(str(root / "manifest.json"), 12 * 1024 * 1024)
    need(hashlib.sha256(manifest).hexdigest() == value["manifestSha256"],
         "API_MERCHANT_ENCRYPTED_MANIFEST_CHANGED", 409)
    metadata = json.loads(manifest.decode("utf-8"))
    need(metadata.get("schema") == "stellar-forge.merchant-recovery.v1"
         and isinstance(metadata.get("entries"), list), "API_MERCHANT_ENCRYPTED_BUNDLE_REQUIRED")
    expected = {"manifest.json": (len(manifest), value["manifestSha256"])}
    for entry in metadata["entries"]:
        if entry.get("kind") != "file":
            continue
        name, size, sha256 = entry.get("object"), entry.get("size"), entry.get("cipherSha256")
        need(isinstance(name, str) and len(name) == 18 and name.startswith("objects/")
             and name.endswith(".gcm") and name[8:14].isdigit() and name not in expected
             and isinstance(size, int) and not isinstance(size, bool) and 0 <= size <= 2 * 1024 ** 3
             and isinstance(sha256, str) and len(sha256) == 64
             and all(c in "0123456789abcdef" for c in sha256),
             "API_MERCHANT_ENCRYPTED_BUNDLE_REQUIRED")
        expected[name] = (size, sha256)
    need(1 < len(expected) <= 10001, "API_MERCHANT_ENCRYPTED_BUNDLE_REQUIRED")
    actual = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs:
            info = os.lstat(Path(directory) / name)
            need(stat.S_ISDIR(info.st_mode) and not info.st_mode & 0o077
                 and info.st_uid == os.getuid(), "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)
        for name in names:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            need(relative in expected, "API_MERCHANT_ARCHIVE_SOURCE_INVALID")
            actual.append(relative)
    entries = sorted(expected)
    need(sorted(actual) == entries, "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)
    guide = value["guide"].encode("utf-8")
    need(len(guide) <= 131072, "API_MERCHANT_RECEIVING_GUIDE_TOO_LARGE")

    def member_bytes(name, retained=None, target=None):
        digest = hashlib.sha256()
        copied = 0
        with retained_stream(root / name) as (source, before):
            need(before.st_size == expected[name][0], "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)
            while chunk := source.read(1048576):
                digest.update(chunk)
                copied += len(chunk)
                if retained is not None:
                    need(retained.read(len(chunk)) == chunk, "API_MERCHANT_ARCHIVE_CHANGED", 409)
                if target is not None:
                    target.write(chunk)
            need(copied == expected[name][0] and digest.hexdigest() == expected[name][1],
                 "API_MERCHANT_ARCHIVE_SOURCE_CHANGED", 409)
            if retained is not None:
                need(retained.read(1) == b"", "API_MERCHANT_ARCHIVE_CHANGED", 409)

    temporary = destination.with_name(destination.name + ".incomplete")
    try:
        info = temporary.lstat()
    except FileNotFoundError:
        info = None
    if info is not None:
        need(stat.S_ISREG(info.st_mode) and info.st_nlink in (1, 2) and not info.st_mode & 0o077
             and info.st_uid == os.getuid(), "API_MERCHANT_ARCHIVE_TEMP_CHANGED", 409)
        if info.st_nlink == 2:
            named = destination.lstat()
            need(stat.S_ISREG(named.st_mode) and named.st_nlink == 2
                 and (named.st_dev, named.st_ino) == (info.st_dev, info.st_ino),
                 "API_MERCHANT_ARCHIVE_TEMP_CHANGED", 409)
        temporary.unlink()
    if destination.exists():
        with retained_stream(destination) as (source, _), zipfile.ZipFile(source) as saved:
            need(saved.namelist() == ["RECEIVING.md"] + ["bundle/" + name for name in entries],
                 "API_MERCHANT_ARCHIVE_CHANGED", 409)
            need(saved.read("RECEIVING.md") == guide, "API_MERCHANT_ARCHIVE_CHANGED", 409)
            for name in entries:
                with saved.open("bundle/" + name) as retained:
                    member_bytes(name, retained=retained)
    else:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "wb") as target:
                with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as bundle:
                    def info(name):
                        entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                        entry.external_attr = 0o600 << 16
                        return entry
                    bundle.writestr(info("RECEIVING.md"), guide)
                    for name in entries:
                        with bundle.open(info("bundle/" + name), "w", force_zip64=True) as member:
                            member_bytes(name, target=member)
                target.flush()
                os.fsync(target.fileno())
            os.link(temporary, destination)
            temporary.unlink()
        finally:
            if temporary.exists():
                temporary.unlink()
    directory_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    digest = hashlib.sha256()
    size = 0
    with retained_stream(destination) as (source, before):
        while chunk := source.read(1048576):
            digest.update(chunk)
            size += len(chunk)
        need(size == before.st_size, "API_MERCHANT_ARCHIVE_CHANGED", 409)
    return {"path": str(destination), "bytes": size, "sha256": digest.hexdigest(),
            "contentType": "application/zip", "files": len(entries) + 1}


def restored_order_mapping(value):
    """Select only captured orders whose current durable usage still matches this image."""
    refs = value["orderReferences"]
    need(isinstance(refs, list) and len(refs) <= 10000 and len(set(refs)) == len(refs)
         and all(receiver.is_match(receiver.REF_RE, ref) for ref in refs),
         "API_MERCHANT_ORDER_REFERENCES_REQUIRED")
    result = []
    for ref in refs:
        captured_context = {**value["restored"], "orderReference": ref}
        captured = matching_order(captured_context)
        if captured is None:
            result.append({"orderReference": ref, "status": "PRESERVED", "reason": "MISSING_AT_CAPTURE"})
            continue
        try:
            captured_state = pass_store.export_pass(captured_context["context"]["state"], ref,
                max_bytes=LIMIT - 1024)["snapshot"]
        except pass_store.PassError as error:
            if error.code != "PASS_NOT_ATTACHED":
                raise
            result.append({"orderReference": ref, "status": "PRESERVED", "reason": "PASS_NOT_ATTACHED_AT_CAPTURE"})
            continue
        try:
            current_context = {**value["current"], "orderReference": ref}
            current = matching_order(current_context)
            need(current is not None, "ORDER_NOT_FOUND", 404)
            current_state = pass_store.export_pass(current_context["context"]["state"], ref,
                max_bytes=LIMIT - 1024)["snapshot"]
        except Exception as error:
            code, _ = gateway.error_fields(error)
            result.append({"orderReference": ref, "status": "PRESERVED", "reason": "CURRENT_STATE_UNAVAILABLE",
                           "capturedStateSha256": captured_state["stateSha256"], "error": code})
            continue
        same = current_state["stateSha256"] == captured_state["stateSha256"]
        result.append({"orderReference": ref, "status": "SELECTED" if same else "PRESERVED",
                       "reason": "SAME_ORIGINAL_SNAPSHOT" if same else "CURRENT_STATE_CHANGED",
                       "currentStateSha256": current_state["stateSha256"],
                       "capturedStateSha256": captured_state["stateSha256"],
                       "currentObservedAt": current_state["capturedAt"],
                       "capturedObservedAt": captured_state["capturedAt"]})
    return {"orders": result}


def execute(action, value):
    if action == "plan":
        return pass_store.validate_plan(value["plan"])
    if action == "initialize":
        root = receiver.require_private_dir(value["state"], create=True)
        receiver.init_state(root)
        return {"state": str(root)}
    if action == "enroll":
        return enroll(value)
    if action == "adopt":
        order = matching_order(value)
        need(order is not None, "ORDER_NOT_FOUND", 404)
        return {"order": order}
    if action == "order":
        return inspect_order(value)
    if action == "orders":
        root = receiver.require_private_dir(value["state"])
        return access.list_orders(root, after=value.get("after"), limit=value.get("limit", 100))
    if action == "attach":
        return pass_store.attach_pass(value["state"], value["orderReference"])
    if action == "access":
        need(value["action"] in {"suspend", "resume", "expire", "clear-expiry"}, "INVALID_ACTION")
        root = receiver.require_private_dir(value["state"])
        return access.change_access(root, ref=value["orderReference"],
            expected_revision=value["accessRevision"], operation_id=value["operationId"],
            actor=value["actor"], reason=value["reason"], action=value["action"],
            expires_at=value.get("expiresAt"))
    if action == "usage":
        return pass_store.export_pass(value["state"], value["orderReference"], max_bytes=LIMIT - 1024)
    if action == "archive":
        return archive(value)
    if action == "restored-order-mapping":
        return restored_order_mapping(value)
    raise pass_store.PassError("API_MERCHANT_NATIVE_ACTION_REQUIRED")


def serve(value):
    config = gateway.load_config(value["gateway"])
    stopped = threading.Event()
    def parent_input():
        # The parent owns this pipe. EOF means its workspace has ended.
        try:
            while sys.stdin.buffer.read(1):
                pass
        finally:
            stopped.set()
    def ready(session):
        threading.Thread(target=parent_input, daemon=True).start()
        print(compact({"schema": "stellar-forge.sf101.api-merchant-gateway.v1",
                       "apiUrl": session["apiUrl"], "consoleUrl": session["consoleUrl"],
                       "pid": os.getpid()}), flush=True)
    gateway.serve(config, api_port=value["apiPort"], console_port=value.get("consolePort", 0),
                  on_ready=ready, stopping=stopped)

def main():
    action = sys.argv[1] if len(sys.argv) == 2 else ""
    if action == "gateway":
        raw = sys.stdin.buffer.readline(65537)
        need(raw.endswith(b"\n") and len(raw) <= 65536, "API_MERCHANT_GATEWAY_CONFIGURATION_REQUIRED")
        serve(json.loads(raw))
        return
    raw = sys.stdin.buffer.read(LIMIT + 1)
    need(len(raw) <= LIMIT, "API_MERCHANT_NATIVE_REQUEST_TOO_LARGE", 413)
    value = json.loads(raw)
    need(isinstance(value, dict), "API_MERCHANT_NATIVE_REQUEST_REQUIRED")
    print(compact(execute(action, value)), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code, status = gateway.error_fields(error)
        if isinstance(error, ValueError) and str(error).isupper() and len(str(error)) <= 120:
            code, status = str(error), 409
        print(compact({"error": code, "status": status}), file=sys.stderr, flush=True)
        sys.exit(1)
