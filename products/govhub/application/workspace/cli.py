#!/usr/bin/env python3
"""Initialize, operate and export the same private multi-site service workspace."""
from __future__ import annotations
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import signal
import sys
import threading

from server import add_paths, open_store, Sessions, HttpProblem


def password(args, initializing=False):
    if args.password_env:
        value = os.environ.get(args.password_env)
        if value is None:
            raise HttpProblem("The named password environment variable is unavailable.")
        return value
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    return getpass.getpass("New workspace password: " if initializing else "Workspace password: ")


def actor(workspace, args):
    user = workspace.authenticate(args.username, password(args))
    if not user or Sessions(workspace).disabled(user["name"]):
        raise HttpProblem("Username or password was not recognized.", 401)
    return user


def export_files(workspace, export_id, destination, user):
    destination = Path(destination)
    if not destination.is_absolute() or destination.exists() or destination.is_symlink():
        raise HttpProblem("Choose a new absolute export directory.")
    parent = destination.parent.resolve(strict=True)
    destination = parent / destination.name
    # The final directory is create-only; a partial transfer remains recognizable.
    destination.mkdir(mode=0o700)
    incomplete = destination / "TRANSFER_INCOMPLETE"
    incomplete.write_text("Complete this transfer before using the files.\n")
    artifacts = workspace.dispatch("exports.list", {}, user)["exports"]
    selected = next((item for item in artifacts if item["id"] == export_id), None)
    if not selected:
        raise HttpProblem("Choose a retained handover.")
    receipts = []
    for expected in selected["files"]:
        name = expected["name"]
        if Path(name).name != name or name in (".", ".."):
            raise HttpProblem("The handover includes an invalid filename.", 503)
        source = workspace.export_file(export_id, name)
        digest = hashlib.sha256()
        size = 0
        fd = os.open(destination / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with Path(source["path"]).open("rb") as original, os.fdopen(fd, "wb") as output:
            for block in iter(lambda: original.read(1024 * 1024), b""):
                output.write(block)
                digest.update(block)
                size += len(block)
            output.flush()
            os.fsync(output.fileno())
        if digest.hexdigest() != expected["sha256"] or size != expected["size"]:
            raise HttpProblem("A retained handover file changed. The transfer remains marked incomplete.", 503)
        receipts.append({"name": name, "size": size, "sha256": digest.hexdigest()})
    incomplete.unlink()
    directory_fd = os.open(destination, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return {"export_id": export_id, "destination": str(destination), "files": receipts}


def run_worker(workspace, until_idle):
    """Run the same durable queue from an operator's native terminal."""
    stop = threading.Event()
    def stopping(_signal, _frame):
        stop.set()
    signal.signal(signal.SIGINT, stopping)
    signal.signal(signal.SIGTERM, stopping)
    with workspace.service_lease():
        workspace.start_worker()
        try:
            while not stop.wait(1):
                if until_idle:
                    # Accepted provider work remains owned while its original
                    # workflow is pollable, including a scheduled next poll.
                    with workspace.connect(snapshot=True) as db:
                        rows = db.execute(
                            "SELECT data FROM govhub_operations "
                            "WHERE state IN ('QUEUED','RUNNING','WAITING_NATIVE')"
                        ).fetchall()
                    active = False
                    for row in rows:
                        operation = json.loads(row[0])
                        if operation["state"] in ("QUEUED", "RUNNING") or (
                            operation["state"] == "WAITING_NATIVE"
                            and not operation.get("cancel_requested")
                            and workspace._native().can_poll(operation.get("resume_checkpoint") or {})
                        ):
                            active = True
                            break
                    if not active:
                        break
        finally:
            workspace.stop_worker()
    return {"worker": "stopped", "operations": workspace.snapshot()["govhub"]["operations"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--username", required=True)
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--password-env", help="Name of a private environment variable containing the password.")
    credentials.add_argument("--password-stdin", action="store_true", help="Read one password line from standard input.")
    sub = parser.add_subparsers(dest="command", required=True)
    initialize = sub.add_parser("init")
    initialize.add_argument("--name", default="GovHub cutover operations")
    initialize.add_argument("--mode", choices=("SUPPLIED", "PILOT"), default="SUPPLIED")
    call = sub.add_parser("call")
    call.add_argument("operation")
    call.add_argument("--input", type=Path, help="JSON request file; omit for an empty object.")
    export = sub.add_parser("export")
    export.add_argument("export_id")
    export.add_argument("--destination", type=Path, required=True)
    backup = sub.add_parser("backup")
    backup.add_argument("--destination", type=Path, required=True)
    worker = sub.add_parser("worker", help="Run the original durable native queue on this host.")
    worker.add_argument("--until-idle", action="store_true", help="Return after queued work and accepted provider workflows settle, or a saved operation needs operator input.")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command == "init":
            target = Path(args.workspace)
            if (target / "assessment.sqlite3").exists():
                raise HttpProblem("This workspace already exists. Open it or choose a new private directory.")
            args.source_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            value = password(args, True)
            if not 12 <= len(value) <= 1024:
                raise HttpProblem("Use a password of 12–1024 characters.")
            workspace = open_store(args, True)
            workspace.add_user(args.username, value, "admin")
            result = {"initialized": True, "workspace": str(args.workspace), "username": args.username}
        else:
            workspace = open_store(args)
            user = actor(workspace, args)
            if args.command == "call":
                payload = json.loads(args.input.read_text()) if args.input else {}
                if not isinstance(payload, dict):
                    raise HttpProblem("The request file must contain a JSON object.")
                result = workspace.dispatch(args.operation, payload, user)
            elif args.command == "export":
                workspace.dispatch("exports.list", {}, user)
                result = export_files(workspace, args.export_id, args.destination, user)
            elif args.command == "worker":
                result = run_worker(workspace, args.until_idle)
            else:
                result = workspace.dispatch("workspace.backup", {"destination": str(args.destination)}, user)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
