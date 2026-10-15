#!/usr/bin/env python3
"""Continue one reviewed target-environment course in an existing workspace.

Uses the same authenticated domain and durable native queue as the browser.
This script neither fabricates native captures nor creates a new native host.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

from govhub import open_workspace, json_bytes, packed
from cli import run_worker


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def regular(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise ValueError("Use an original regular file: " + str(path))
    return path.read_bytes()


def retain(path, raw):
    """Create-only publication; exact same content resumes, conflicts survive."""
    if path.exists() or path.is_symlink():
        if regular(path) != raw:
            raise ValueError("Retained original differs: " + str(path))
        return
    fd, temporary = tempfile.mkstemp(prefix=".course-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if regular(path) != raw:
                raise ValueError("Concurrent retained original differs: " + str(path))
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.unlink(temporary)


def encode(value):
    return (packed(value) + "\n").encode("utf-8")


def retained_json(path):
    return json_bytes(regular(path))


def original_request(root, phase, value):
    path = root / (phase + "-request.json")
    if path.exists() or path.is_symlink():
        return retained_json(path)
    retain(path, encode(value))
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password-env", required=True, help="Existing environment variable name, never its value.")
    parser.add_argument("--input", type=Path, required=True, help="Complete target-environment-course/1 input.")
    parser.add_argument("--out", type=Path, required=True, help="Same private course directory on every continuation.")
    parser.add_argument("phase", choices=("prepare", "approve", "queue", "worker", "observe", "handover", "status"))
    parser.add_argument("--reason", help="Named reviewer rationale for approve.")
    parser.add_argument("--observation", type=Path, help="Actual restored snapshot/capture selection JSON for observe.")
    args = parser.parse_args()
    os.umask(0o077)
    for path in (args.workspace, args.source_root, args.input, args.out):
        if not path.is_absolute():
            raise ValueError("All paths must be absolute.")
    root = args.out
    if root.is_symlink():
        raise ValueError("The course directory cannot be a symlink.")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.resolve() != root or root.stat().st_mode & 0o077:
        raise ValueError("Use the canonical private course directory.")
    if root == args.workspace.resolve() or root.is_relative_to(args.workspace.resolve()):
        raise ValueError("Keep the course output outside the private workspace.")
    lock = os.open(root / "course.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        raw = regular(args.input)
        spec = json_bytes(raw)
        allowed = {"format", "name", "plan_id", "environment_id", "purpose", "urls", "reason",
                   "authorization_reference", "agency_ids", "backup_sha256", "target_fingerprint",
                   "native_action", "parent_id"}
        if not isinstance(spec, dict) or set(spec) - allowed or spec.get("format") != "target-environment-course/1":
            raise ValueError("Use the exact target-environment-course/1 contract.")
        workspace = open_workspace(args.workspace, source_root_path=args.source_root)
        password = os.environ.get(args.password_env)
        user = workspace.authenticate(args.username, password) if password is not None else None
        if not user:
            raise ValueError("The named existing workspace account could not authenticate.")
        workspace_id = workspace.snapshot()["workspace"]["id"]
        if not (root / "owner.json").exists():
            unknown = [p.name for p in root.iterdir() if p.name != "course.lock" and not p.name.startswith(".course-")]
            if unknown:
                raise ValueError("An unowned course directory already contains files: " + ", ".join(unknown))
        retain(root / "owner.json", encode({"format": "target-environment-course-owner/1", "workspace_id": workspace_id, "input_sha256": sha(raw)}))
        retain(root / "original-input.json", raw)
        receipt_path = root / (args.phase + "-receipt.json")
        # Queue/create/review/export requests are source-bound, replayable API operations.
        def call(action, value):
            return workspace.dispatch(action, value, user)
        def receipt(phase):
            return retained_json(root / (phase + "-receipt.json"))
        def request(phase, value):
            value = {**value, "request_key": "target-course:" + sha(raw)[:24] + ":" + sha(str(root).encode())[:16] + ":" + phase}
            return original_request(root, phase, value)
        if args.phase == "prepare":
            if receipt_path.exists():
                result = receipt("prepare")
                current = call("target-expectations.get", {"expectation_id": result["expectation"]["id"]})["expectations"][0]
                if current["expectation"] != result["expectation"]:
                    raise ValueError("The original saved expectation changed.")
            else:
                context = call("target-expectations.context", spec)
                candidate = {k: spec[k] for k in ("name", "plan_id", "environment_id", "purpose", "urls", "reason")}
                candidate.update(expected_revision=context["plan"]["revision"], environment_revision=context["environment"]["revision"],
                                 config_sha256=context["profile"]["revision"], parent_id=spec.get("parent_id"))
                pending = root / "prepare-request.json"
                if pending.exists():
                    candidate = retained_json(pending)
                else:
                    preview = call("target-expectations.preview", candidate)
                    retain(root / "complete-preview.json", encode(preview))
                    candidate = request("prepare", {**candidate, "preview_sha256": preview["preview_sha256"]})
                result = call("target-expectations.save", candidate)
                retain(receipt_path, encode(result))
        elif args.phase == "approve":
            expectation = receipt("prepare")["expectation"]
            current = call("target-expectations.get", {"expectation_id": expectation["id"]})["expectations"][0]
            if not args.reason and not (root / "approve-request.json").exists():
                raise ValueError("Supply the actual reviewer rationale with --reason.")
            value = request("approve", {"expectation_id": expectation["id"], "expectation_sha256": expectation["sha256"],
                "previous_review_id": (current.get("latest_review") or {}).get("id"), "decision": "APPROVE", "reason": args.reason or ""})
            result = call("target-expectations.review", value)
            retain(receipt_path, encode(result))
        elif args.phase == "queue":
            expectation = receipt("prepare")["expectation"]
            review = receipt("approve")["review"]
            value = {"plan_id": expectation["plan_id"], "expected_revision": expectation["plan_revision"],
                     "environment_id": expectation["environment_id"], "environment_revision": expectation["environment_revision"],
                     "config_sha256": expectation["config_sha256"], "type": expectation["purpose"],
                     "authorization_reference": spec.get("authorization_reference", ""),
                     "target_expectation_id": expectation["id"], "target_expectation_review_id": review["id"]}
            value.update({k: spec[k] for k in ("agency_ids", "backup_sha256", "target_fingerprint", "native_action") if k in spec})
            result = call("operations.create", request("queue", value))
            retain(receipt_path, encode(result))
        elif args.phase == "worker":
            operation_id = receipt("queue")["operation"]["id"]
            # This is the existing durable worker. Interrupted or uncertain native
            # actions retain their original checkpoint; no new queue is created.
            with workspace.connect(snapshot=True) as db:
                active = [json.loads(row[0]) for row in db.execute("SELECT data FROM govhub_operations WHERE state IN ('QUEUED','RUNNING','WAITING_NATIVE')")]
            if any(o["id"] != operation_id for o in active):
                raise ValueError("Other retained native work is active. Use its existing worker owner instead of starting this course worker.")
            result = run_worker(workspace, True)
            result["selected_operation"] = call("operations.get", {"operation_id": operation_id})
        elif args.phase == "observe":
            operation_id = receipt("queue")["operation"]["id"]
            pending = root / "observe-request.json"
            if pending.exists():
                value = retained_json(pending)
                if args.observation and regular(args.observation) != regular(root / "original-observation-selection.json"):
                    raise ValueError("Continue with the original actual observation selection.")
            else:
                if not args.observation:
                    raise ValueError("Select the actual retained RESTORED snapshot with --observation.")
                observed_raw = regular(args.observation)
                value = json_bytes(observed_raw)
                if not isinstance(value, dict) or set(value) - {"restored_snapshot_id", "capture_file_id", "actual_started_at", "actual_finished_at", "notes"}:
                    raise ValueError("Select actual restored_snapshot_id, optional original capture/times, and notes.")
                retain(root / "original-observation-selection.json", observed_raw)
                current = call("operations.get", {"operation_id": operation_id})["operation"]
                value = {**value, "operation_id": operation_id, "expected_revision": current["revision"]}
                retain(pending, encode(value))
            current = call("operations.get", {"operation_id": operation_id})
            matches = [x for x in current["observations"]
                       if x["restored_snapshot_id"] == value.get("restored_snapshot_id")
                       and x["capture_file_id"] == (value.get("capture_file_id") or current["operation"].get("native_capture_file_id"))
                       and x["notes"] == value.get("notes", "").strip()]
            if matches:
                result = {"operation": current["operation"], "observation": matches[-1]}
            else:
                result = call("operations.observe", value)
            # Store the first exact observed receipt. A later corrected inventory
            # is a new deliberate browser/API observation, never a replaced file.
            if receipt_path.exists():
                original = receipt("observe")
                if original["observation"] != result["observation"]:
                    raise ValueError("The original observed receipt differs.")
                result = original
            else:
                retain(receipt_path, encode(result))
        elif args.phase == "handover":
            result = call("exports.create", request("handover", {"name": spec["name"], "plan_ids": [spec["plan_id"]], "include_sources": True}))
            retain(receipt_path, encode(result))
            export = result["export"]
            for item in export["files"]:
                name = item["name"]
                if Path(name).name != name:
                    raise ValueError("Unexpected export filename.")
                original = workspace.export_file(export["id"], name)
                body = regular(Path(original["path"]))
                if len(body) != item["size"] or sha(body) != item["sha256"]:
                    raise ValueError("A handover original failed its byte/hash identity.")
                retain(root / name, body)
            # Reopen the actual same persistent workspace using the installed full source.
            reopened = open_workspace(args.workspace, source_root_path=args.source_root)
            selected = receipt("prepare")["expectation"]["id"]
            observed = reopened.dispatch("target-expectations.get", {"expectation_id": selected}, user)
            if observed["expectations"][0]["expectation"] != receipt("prepare")["expectation"]:
                raise ValueError("Independent workspace reopen changed the original expectation.")
            result = {**result, "independent_reopen": "exact", "download_directory": str(root)}
        else:
            result = {"owner": retained_json(root / "owner.json"),
                      "retained_phases": [p.name for p in sorted(root.glob("*-receipt.json"))]}
            if (root / "queue-receipt.json").exists():
                result["selected_operation"] = call("operations.get", {"operation_id": receipt("queue")["operation"]["id"]})
        print(packed(result))
    finally:
        os.close(lock)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error), "code": getattr(error, "code", type(error).__name__)}))
        raise SystemExit(2)
