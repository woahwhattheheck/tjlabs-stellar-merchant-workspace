"""CLI for the same saved operator requests, source inspection and complete handover."""
import argparse
import contextlib
import hashlib
import os
import signal
import sys
import tempfile
import threading
from pathlib import Path
from .canonical import decode, encode, json_file, private_directory, read_bytes, ui_value, fsync_directory
from .errors import PMRSError, require
from .package import inspect_archive, receive_workspace
from .server import start_server
from .workspace import Workspace

def _copy_download(descriptor, destination):
    destination = Path(destination).absolute()
    private_directory(destination.parent)
    if destination.exists():
        require(destination.is_file() and not destination.is_symlink(), "DOWNLOAD_DESTINATION", "The selected output is not a regular file.")
        with destination.open("rb") as stream: actual = hashlib.file_digest(stream, "sha256").hexdigest()
        require(actual == descriptor["sha256"] and destination.stat().st_size == descriptor["bytes"],
                "DOWNLOAD_EXISTS", "An existing output differs from the original selected file.")
    else:
        fd, temporary = tempfile.mkstemp(prefix=".pmrs-download-", dir=destination.parent)
        try:
            h, length = hashlib.sha256(), 0
            with open(descriptor["path"], "rb") as inp, os.fdopen(fd, "wb") as out:
                while True:
                    block = inp.read(1024 * 1024)
                    if not block: break
                    h.update(block); length += len(block); out.write(block)
                out.flush(); os.fsync(out.fileno())
            require(h.hexdigest() == descriptor["sha256"] and length == descriptor["bytes"],
                    "DOWNLOAD_CHANGED", "The retained original file changed during copying.")
            os.link(temporary, destination); fsync_directory(destination.parent)
        finally:
            try: os.unlink(temporary)
            except FileNotFoundError: pass
    return {"path": str(destination), **{k: descriptor[k] for k in ("name", "mime", "bytes", "sha256")}}

def parser():
    result = argparse.ArgumentParser(description="Business Central source, reviewed project/grant finance and conditional Dataverse delivery.")
    result.add_argument("--directory", help="Original private PMRS workspace.")
    result.add_argument("--source-root", help="Complete product source root containing source-manifest.json.")
    result.add_argument("--connections", help="Launcher-owned private connection JSON outside the workspace.")
    commands = result.add_subparsers(dest="command", required=True)
    serve = commands.add_parser("serve", help="Open the retained local operator.")
    serve.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost"])
    serve.add_argument("--port", type=int, default=8893)
    serve.add_argument("--entry-file", required=True, help="Private external file receiving the operator URL and token.")
    serve.add_argument("--token-file", help="Optional private external file containing an existing operator token.")
    action = commands.add_parser("action", help="Execute/resume one exact saved request and wait for its original result.")
    action.add_argument("--request", required=True, help="JSON file containing {id,kind,arguments}.")
    read = commands.add_parser("action-read"); read.add_argument("--id", required=True)
    operation = commands.add_parser("operation"); operation.add_argument("--id", required=True)
    records = commands.add_parser("records")
    records.add_argument("--kind"); records.add_argument("--before", type=int); records.add_argument("--limit", type=int, default=25)
    record = commands.add_parser("record"); record.add_argument("--id", required=True)
    rows = commands.add_parser("source-rows")
    rows.add_argument("--id", required=True); rows.add_argument("--resource", required=True)
    rows.add_argument("--offset", type=int, default=0); rows.add_argument("--limit", type=int, default=25)
    schema = commands.add_parser("target-schema")
    schema.add_argument("--connection", required=True); schema.add_argument("--entity", required=True)
    selected = commands.add_parser("file")
    selected.add_argument("--family", choices=["record", "export"], required=True)
    selected.add_argument("--id", required=True); selected.add_argument("--name", required=True)
    selected.add_argument("--out", required=True)
    inspect = commands.add_parser("inspect-archive")
    inspect.add_argument("--archive", required=True); inspect.add_argument("--sha256", required=True)
    receive = commands.add_parser("receive")
    receive.add_argument("--archive", required=True); receive.add_argument("--sha256", required=True)
    receive.add_argument("--out", required=True)
    return result

def _emit(value):
    sys.stdout.buffer.write(encode(ui_value(value)) + b"\n"); sys.stdout.buffer.flush()

def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "inspect-archive":
            value = inspect_archive(args.archive, args.sha256)
            _emit({"archive": value["archive"], "manifest_sha256": value["manifest_sha256"],
                   "manifest": {k: v for k, v in value["manifest"].items() if k != "files"}})
            return 0
        if args.command == "receive":
            _emit(receive_workspace(args.archive, args.out, expected_sha256=args.sha256))
            return 0
        require(args.directory, "WORKSPACE_REQUIRED", "Select --directory for the original private workspace.")
        workspace = Workspace(args.directory, source_root=args.source_root, connections=args.connections)
        if args.command == "serve":
            entry = Path(args.entry_file).absolute()
            require(not entry.resolve().is_relative_to(workspace.root.resolve()), "ENTRY_PRIVATE",
                    "Keep the private operator entry outside the exported workspace.")
            token = None
            if args.token_file:
                token_path = Path(args.token_file).absolute()
                require(not token_path.resolve().is_relative_to(workspace.root.resolve()),
                        "TOKEN_REFERENCE", "Keep the operator token outside the workspace.")
                token = read_bytes(token_path, limit=32768).decode("utf-8").strip()
            with start_server(workspace, host=args.host, port=args.port, token=token) as owner:
                json_file(entry, {"schema": "commons.pmrs-local-entry.v1", "url": owner.url,
                    "token": owner.access_token, "workspace_id": owner.workspace_id, "pid": os.getpid()}, replace=True)
                stop = threading.Event()
                previous = {}
                def stopping(_signum, _frame):
                    workspace.stop_admission(); stop.set()
                for signum in (signal.SIGINT, signal.SIGTERM):
                    previous[signum] = signal.signal(signum, stopping)
                try:
                    _emit({"state": "READY", "url": owner.url, "entry_file": str(entry), "workspace_id": owner.workspace_id})
                    while not stop.is_set() and not owner.wait(0.5): pass
                finally:
                    for signum, handler in previous.items(): signal.signal(signum, handler)
            _emit({"state": "CLOSED", "workspace_id": workspace.store.identity["workspace_id"]})
            return 0
        if args.command == "action":
            body = decode(read_bytes(args.request, limit=8 * 1024 * 1024), limit=8 * 1024 * 1024)
            with workspace:
                value = workspace.run(body)
            _emit(value)
            return 0 if value["state"] == "COMPLETE" else 2 if value["state"] == "FAILED" else 3
        if args.command == "action-read": value = workspace.command(args.id)
        elif args.command == "operation": value = workspace.store.operation(args.id)
        elif args.command == "records":
            value = workspace.store.list_records(args.kind, before=args.before, limit=args.limit)
        elif args.command == "record": value = workspace.store.record(args.id)
        elif args.command == "source-rows":
            value = workspace.source_page(args.id, args.resource, offset=args.offset, limit=args.limit)
        elif args.command == "target-schema": value = workspace.target_schema(args.connection, args.entity)
        elif args.command == "file": value = _copy_download(workspace.file(args.family, args.id, args.name), args.out)
        else: raise PMRSError("CLI_COMMAND", "Unsupported original operator command.")
        _emit(value); return 0
    except PMRSError as error:
        _emit({"error": error.public()}); return 2
    except OSError as error:
        _emit({"error": {"code": type(error).__name__, "message": "The original file or process operation did not complete.",
                         "details": {"errno": error.errno, "recovery": "retain_and_resume_same_request"}}}); return 3
