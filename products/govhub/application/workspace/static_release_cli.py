#!/usr/bin/env python3
"""Read, operate, export and recover static releases in the original GovHub workspace."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

from server import add_paths, open_store
from cli import actor, run_worker
from static_releases.model import canonical
from static_releases.native import immutable_json, sync_dir
from static_releases.service import problem, MUTATIONS


def write_result(path, result):
    if path:
        destination = Path(path)
        if not destination.is_absolute() or not destination.parent.is_dir():
            problem("RESULT_PATH", "Choose an absolute result path in an existing directory.")
        immutable_json(destination, result)
    else:
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))


def request_file(ws, args, operation, payload, user):
    from govhub import json_bytes
    with ws.connect() as db:
        workspace_id = ws.meta(db)["workspace"]["id"]
    if not isinstance(payload.get("request_key"), str) or not payload["request_key"]:
        problem("REQUEST_KEY", "Supply the stable request_key in the original action JSON.")
    key = payload["request_key"]
    folder = ws.root / "static-requests"
    folder.mkdir(mode=0o700, exist_ok=True)
    if folder.is_symlink():
        problem("REQUEST_DIRECTORY", "Keep original request files inside the private workspace.")
    path = Path(args.request_file) if args.request_file else folder / (hashlib.sha256(key.encode()).hexdigest() + ".json")
    if not path.is_absolute() or not path.parent.is_dir():
        problem("REQUEST_PATH", "Choose an absolute request path in an existing directory.")
    envelope = {"schema": "govhub.static-cli-request.v1", "workspace_id": workspace_id,
                "actor": user["name"], "operation": operation, "payload": payload}
    immutable_json(path, envelope)
    return path


def download(ws, file_id, destination):
    path = Path(destination)
    if not path.is_absolute() or not path.parent.is_dir() or path.exists() or path.is_symlink():
        problem("DOWNLOAD_PATH", "Choose a new absolute output filename in an existing directory.")
    with ws.connect() as db:
        item = ws._file_row(db, file_id)
    original = ws._verify_file(item)
    temporary = path.with_name(path.name + ".partial")
    if temporary.exists() or temporary.is_symlink():
        problem("DOWNLOAD_PARTIAL", "A prior partial download is retained. Inspect it or choose a new filename.", 409)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    h, count = hashlib.sha256(), 0
    with os.fdopen(fd, "wb") as out, original.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            out.write(block)
            h.update(block)
            count += len(block)
        out.flush()
        os.fsync(out.fileno())
    if (h.hexdigest(), count) != (item["sha256"], item["bytes"]):
        problem("DOWNLOAD_IDENTITY", "The original source changed during transfer. The partial download remains retained.", 409)
    os.link(temporary, path)
    sync_dir(path.parent)
    temporary.unlink()
    return {"file_id": file_id, "path": str(path), "bytes": count, "sha256": h.hexdigest()}


def main():
    from govhub import json_bytes
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--username", required=True)
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--password-env")
    credentials.add_argument("--password-stdin", action="store_true")
    parser.add_argument("--output", type=Path, help="New absolute JSON result file; stdout otherwise.")
    parser.add_argument("--request-file", type=Path, help="Exact action request destination; a private retained file is created by default.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    for name in ("edition", "plan"):
        selected = sub.add_parser(name)
        selected.add_argument("id")
        selected.add_argument("--offset", type=int, default=0)
        selected.add_argument("--limit", type=int, default=100)
        selected.add_argument("--query", default="")
        selected.add_argument("--status", choices=("all", "added", "removed", "changed", "unchanged"), default="all")
    selected = sub.add_parser("target")
    selected.add_argument("id")
    selected.add_argument("--inspect", action="store_true")
    selected.add_argument("--revision")
    selected = sub.add_parser("request")
    selected.add_argument("id")
    selected = sub.add_parser("call")
    selected.add_argument("operation", help="Full static action, for example static.editions.receive.")
    selected.add_argument("--input", type=Path, required=True)
    selected = sub.add_parser("replay")
    selected.add_argument("request", type=Path)
    selected = sub.add_parser("download")
    selected.add_argument("file_id")
    selected.add_argument("--out", type=Path, required=True)
    selected = sub.add_parser("worker")
    selected.add_argument("--until-idle", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    retained = None
    try:
        ws = open_store(args)
        user = actor(ws, args)
        if args.command == "worker":
            result = run_worker(ws, args.until_idle)
        elif args.command == "download":
            result = download(ws, args.file_id, args.out)
        else:
            payload = {}
            if args.command == "list":
                operation = "static.list"
            elif args.command in ("edition", "plan"):
                operation = "static." + ("editions" if args.command == "edition" else "plans") + ".get"
                payload = {args.command + "_id": args.id, "offset": args.offset, "limit": args.limit,
                           "query": args.query, "status": args.status}
            elif args.command == "target":
                operation = "static.targets.inspect" if args.inspect else "static.targets.get"
                payload = {"target_id": args.id}
                if args.revision:
                    payload["revision"] = args.revision
            elif args.command == "request":
                operation, payload = "static.requests.get", {"request_key": args.id}
            elif args.command == "replay":
                envelope = json_bytes(args.request.read_bytes())
                with ws.connect() as db:
                    workspace_id = ws.meta(db)["workspace"]["id"]
                if envelope.get("schema") != "govhub.static-cli-request.v1" or envelope.get("workspace_id") != workspace_id or envelope.get("actor") != user["name"]:
                    problem("REQUEST_OWNER", "Reopen this exact request in its original workspace and account.", 409)
                operation, payload = envelope["operation"], envelope["payload"]
                retained = args.request
            else:
                operation, payload = args.operation, json_bytes(args.input.read_bytes())
            if not isinstance(payload, dict) or not (operation.startswith("static.") or operation in ("operations.get", "operations.cancel", "operations.resume")):
                problem("STATIC_ACTION", "Select a static action or control the original retained operation.")
            mutating = operation.removeprefix("static.") in MUTATIONS or operation in ("operations.cancel", "operations.resume")
            if mutating and retained is None:
                with ws.connect() as db:
                    workspace_id = ws.meta(db)["workspace"]["id"]
                payload = dict(payload, static_workspace_id=workspace_id, static_actor=user["name"])
                retained = request_file(ws, args, operation, payload, user)
            result = ws.dispatch(operation, payload, user)
            if retained:
                result = {"request_file": str(retained), **result}
        write_result(args.output, result)
        return 0
    except Exception as exc:
        failure = {"error": str(exc), "status": getattr(exc, "status", None)}
        if retained:
            failure["request_file"] = str(retained)
            failure["recovery"] = "Use request REQUEST_KEY or replay this exact request; do not create a replacement action."
        print(json.dumps(failure, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
