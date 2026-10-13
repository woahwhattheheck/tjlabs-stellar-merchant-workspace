#!/usr/bin/env python3
"""DNN Maintenance Desk: the original private store, a dedicated staff interface and Windows receiving."""
from __future__ import annotations
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import signal
import sys
import tempfile
import threading
from urllib.parse import unquote

ENGINE = Path(__file__).resolve().parent.parent
if str(ENGINE) not in sys.path:
    sys.path.insert(0, str(ENGINE))
from server import Server as OriginalServer, Handler as OriginalHandler, HttpProblem, Sessions
from govhub import open_workspace
from dnn_maintenance import service

ROOT = Path(__file__).resolve().parent
STATIC = {"desk.js": "text/javascript; charset=utf-8", "desk.css": "text/css; charset=utf-8"}

class Handler(OriginalHandler):
    server_version = "DnnMaintenanceDesk/1"

    def do_GET(self):
        try:
            self.boundary()
            parts, query = self.parts()
            if not parts or parts == ["index.html"]:
                self.send((ROOT / "web" / "index.html").read_bytes(), mime="text/html; charset=utf-8")
                return
            if len(parts) == 2 and parts[0] == "dnn-static" and parts[1] in STATIC:
                self.send((ROOT / "web" / parts[1]).read_bytes(), mime=STATIC[parts[1]])
                return
            if parts == ["api", "dnn", "snapshot"]:
                self.user()
                self.send(service.snapshot(self.server.workspace))
                return
            if len(parts) == 4 and parts[:3] == ["api", "dnn", "download"]:
                self.user()
                from dnn_maintenance.delivery import download_handoff
                self.download_file(download_handoff(self.server.workspace, parts[3]))
                return
            if len(parts) == 4 and parts[:3] == ["api", "dnn", "history"]:
                self.user()
                kind = query.get("kind")
                if kind not in ("site", "ticket", "release"):
                    raise HttpProblem("Choose a versioned DNN record.")
                with self.server.workspace.connect(snapshot=True) as db:
                    records = self.server.workspace._objects(db, "dnn_" + kind, parts[3])
                self.send({"records": records})
                return
            if parts[:2] in (["api", "session"], ["api", "staff"], ["api", "activity"], ["api", "files"]):
                return super().do_GET()
            raise HttpProblem("This desk view does not exist.", 404)
        except Exception as error:
            self.fail(error)

    do_HEAD = do_GET

    def stream_upload(self, actor):
        workspace = self.server.workspace
        if self.headers.get("Content-Type", "").split(";")[0] != "application/octet-stream" or self.headers.get("Transfer-Encoding"):
            raise HttpProblem("Send the selected source file with its fixed content length.", 415)
        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            raise HttpProblem("The original source length is required.", 411)
        if not 0 < length <= 128 * 1024**3:
            raise HttpProblem("Select a source file within the native receiving size.", 413)
        name = unquote(self.headers.get("X-Filename", ""))
        key = self.headers.get("X-Request-Key", "")
        category = self.headers.get("X-Category", "Evidence")
        if category not in ("Evidence", "Inventory", "Extract"):
            raise HttpProblem("Choose a source category.")
        if not name or Path(name).name != name or "\\" in name or len(name) > 500 or not key:
            raise HttpProblem("The source needs its plain original filename and retry identity.")
        self.connection.settimeout(300)
        with tempfile.NamedTemporaryFile(prefix="dnn-intake-", dir=workspace.root) as output:
            remaining, digest = length, hashlib.sha256()
            while remaining:
                block = self.rfile.read(min(1024 * 1024, remaining))
                if not block:
                    raise HttpProblem("The source transfer was interrupted. Retry the same selected file.")
                output.write(block)
                digest.update(block)
                remaining -= len(block)
            output.flush()
            os.fsync(output.fileno())
            payload = {"request_key": key, "dnn_action": "file.upload", "filename": name,
                       "bytes": length, "sha256": digest.hexdigest(), "category": category}
            with workspace.connect(write=True) as db:
                request, fingerprint, previous = workspace._request(db, payload, actor)
                if previous is not None:
                    self.send(previous)
                    return
                item = workspace._register(db, Path(output.name), name, actor, category, "DNN desk source",
                                           expected_sha=digest.hexdigest())
                workspace._remember(db, request, fingerprint, item, actor)
                workspace._changed(db, actor, "DNN source retained", "files", item["id"],
                                   {"sha256": item["sha256"], "bytes": item["bytes"]})
            self.send(item, 201)

    def do_POST(self):
        try:
            self.boundary(True)
            parts, _ = self.parts()
            if parts == ["api", "dnn", "upload"]:
                self.stream_upload(self.user())
                return
            if len(parts) == 3 and parts[:2] == ["api", "dnn"]:
                self.send(service.dispatch(self.server.workspace, parts[2], self.body(), self.user()))
                return
            if parts in (["api", "login"], ["api", "logout"], ["api", "staff"]):
                return super().do_POST()
            raise HttpProblem("This desk action does not exist.", 404)
        except Exception as error:
            self.fail(error)

class Server(OriginalServer):
    def __init__(self, workspace, port=0):
        super().__init__(workspace, port)
        self.RequestHandlerClass = Handler

def password(args, initializing=False):
    if args.password_env:
        value = os.environ.get(args.password_env)
        if value is None:
            raise HttpProblem("The selected private password variable is unavailable.")
        return value
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    return getpass.getpass("New desk password: " if initializing else "Desk password: ")

def connect(args, create=False):
    return open_workspace(args.workspace, args.intake, args.assessment_core, create=create,
                          name=getattr(args, "name", "DNN Maintenance Desk"), mode="SUPPLIED")

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--intake", type=Path, required=True)
    parser.add_argument("--assessment-core", type=Path, default=ENGINE / "vendor" / "assessment-core")
    parser.add_argument("--username", default="operator")
    credential = parser.add_mutually_exclusive_group()
    credential.add_argument("--password-env")
    credential.add_argument("--password-stdin", action="store_true")
    actions = parser.add_subparsers(dest="command", required=True)
    initialize = actions.add_parser("init")
    initialize.add_argument("--name", default="DNN Maintenance Desk")
    host = actions.add_parser("serve")
    host.add_argument("--port", type=int, default=8798)
    call = actions.add_parser("call")
    call.add_argument("action")
    call.add_argument("--input", type=Path)
    export = actions.add_parser("export")
    export.add_argument("--out", type=Path, required=True)
    export.add_argument("--source-root", type=Path, default=ENGINE)
    restore = actions.add_parser("restore")
    restore.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args(argv)
    os.umask(0o077)
    try:
        if not args.workspace.is_absolute() or not args.intake.is_absolute():
            raise HttpProblem("Choose absolute workspace and intake directories.")
        if args.command == "restore":
            from dnn_maintenance.delivery import restore_archive
            result = restore_archive(args.archive, args.workspace, args.intake)
        elif args.command == "init":
            if (args.workspace / "assessment.sqlite3").exists():
                raise HttpProblem("This desk already exists. Open its current workspace.")
            args.intake.mkdir(parents=True, exist_ok=True, mode=0o700)
            secret = password(args, True)
            if not 12 <= len(secret) <= 1024:
                raise HttpProblem("Use a desk password of 12–1024 characters.")
            workspace = connect(args, True)
            workspace.add_user(args.username, secret, "admin")
            result = {"initialized": True, "workspace": str(args.workspace), "name": args.name}
        else:
            workspace = connect(args)
            if args.command == "serve":
                if not 0 <= args.port <= 65535:
                    raise HttpProblem("Use a local port from 0 to 65535.")
                with workspace.service_lease():
                    server = Server(workspace, args.port)
                    def stop(*_):
                        threading.Thread(target=server.shutdown, daemon=True).start()
                    signal.signal(signal.SIGTERM, stop)
                    signal.signal(signal.SIGINT, stop)
                    print(json.dumps({"url": server.origin, "workspace": str(args.workspace),
                                      "application": "DNN Maintenance Desk"}), flush=True)
                    try:
                        server.serve_forever(poll_interval=0.2)
                    finally:
                        server.server_close()
                return 0
            actor = workspace.authenticate(args.username, password(args))
            if not actor or Sessions(workspace).disabled(actor["name"]):
                raise HttpProblem("Desk username or password was not recognized.", 401)
            if args.command == "call":
                payload = json.loads(args.input.read_text()) if args.input else {}
                result = service.dispatch(workspace, args.action, payload, actor)
            else:
                workspace._authorize(actor, "admin")
                from dnn_maintenance.delivery import export_workspace
                result = export_workspace(workspace, args.source_root, args.out)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
