"""Command line receiving, complete export, local review and portable restoration."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import signal
import sys
import threading
from typing import Any
import uuid

from .client import PaidReceiver, atomic_usdc, drain
from .delivery import export_workspace, restore_workspace, verify_archive
from .model import API_BASE, WorkspaceError, digest, encode, error_details
from .operator import Operator, retain_metadata
from .workspace import Workspace


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="revecs-events", description="Complete Biotech Catalyst Sentinel event receiving.")
    commands = result.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init", help="Create a private event workspace.")
    init.add_argument("directory", type=Path)
    init.add_argument("--name", default="Biotech event monitor")
    init.add_argument("--api-origin", default=API_BASE)
    init.add_argument("--ticker", help="Optional fixed provider-side ticker; local watchlists need no server filter.")
    init.add_argument("--limit", type=int, default=100)
    init.add_argument("--preview", action="store_true", help="Use the provider's free public example in its own workspace.")

    preview = commands.add_parser("preview", help="Receive the complete published sample into a preview workspace.")
    preview.add_argument("directory", type=Path)
    preview.add_argument("response", type=Path)
    preview.add_argument("--source-url", default=API_BASE + "/v1/events/sample")
    preview.add_argument("--operation")
    preview.add_argument("--metadata", type=Path, help="Also retain a complete previously received public /v1/meta response.")

    receive = commands.add_parser("receive", help="Receive complete cursor pages with the original x402 SDK and customer wallet.")
    receive.add_argument("directory", type=Path)
    receive.add_argument("--pages", required=True, type=int, help="Maximum new page requests authorized in this operation.")
    receive.add_argument("--max-usdc", required=True, help="Total amount this operation may authorize.")
    receive.add_argument("--max-page-usdc", default="0.05")
    receive.add_argument("--operation", help="Stable operation key. Repeating it reads the same operation without a new request.")
    receive.add_argument("--refresh", action="store_true", help="Receive a new full history edition from since=0.")

    serve = commands.add_parser("serve", help="Open the private local browser operator.")
    serve.add_argument("directory", type=Path)
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--open", action="store_true", help="Open the operator in the operating system's default browser.")

    status = commands.add_parser("status", help="Read the current workspace and complete receiving history as JSON.")
    status.add_argument("directory", type=Path)
    status.add_argument("--edition")
    status.add_argument("--timelines", action="store_true")

    watchlist = commands.add_parser("watchlist", help="Show or replace the local co-filer watchlist.")
    watchlist.add_argument("directory", type=Path)
    watchlist.add_argument("--set", nargs="*", metavar="TICKER", dest="tickers")

    for name, help_text in (("replay", "Rebuild an edition from complete retained pages with no provider request."),
                            ("verify", "Verify the complete database and every retained response.")):
        command = commands.add_parser(name, help=help_text)
        command.add_argument("directory", type=Path)
        if name == "replay":
            command.add_argument("--edition")

    meta = commands.add_parser("metadata", help="Receive and retain the provider's free public freshness response.")
    meta.add_argument("directory", type=Path)

    export = commands.add_parser("export", help="Create a complete portable workspace, reader and local operator.")
    export.add_argument("directory", type=Path)
    export.add_argument("output", type=Path)

    restore = commands.add_parser("restore", help="Verify and restore every member into a new directory.")
    restore.add_argument("archive", type=Path)
    restore.add_argument("destination", type=Path)
    archive = commands.add_parser("verify-export", help="Verify every member of a complete workspace ZIP.")
    archive.add_argument("archive", type=Path)

    response = commands.add_parser("response", help="Write the exact complete or partial response bytes.")
    response.add_argument("directory", type=Path)
    response.add_argument("response_id")
    response.add_argument("output", type=Path)
    return result


def write_result(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False), flush=True)


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "init":
            if (args.directory.expanduser().resolve() / "workspace.sqlite3").exists():
                raise WorkspaceError("WORKSPACE_EXISTS", "Open the existing workspace or choose a new directory.")
            workspace = Workspace(args.directory, create=True, name=args.name, base=args.api_origin,
                                  server_ticker=args.ticker, limit=args.limit, preview=args.preview)
            write_result(workspace.snapshot())
            return 0
        if args.command == "restore":
            write_result(restore_workspace(args.archive, args.destination))
            return 0
        if args.command == "verify-export":
            write_result(verify_archive(args.archive))
            return 0
        workspace = Workspace(args.directory)
        if args.command == "preview":
            body = args.response.read_bytes()
            result = workspace.preview(body, source_url=args.source_url,
                                       operation_key=args.operation or "public-preview-" + digest(body))
            if args.metadata:
                workspace.retain_public(url=workspace.configuration["base"] + "/v1/meta",
                                        body=args.metadata.read_bytes(), purpose="provider-meta",
                                        headers={"Content-Type": "application/json"})
            write_result(result)
        elif args.command == "receive":
            cancel = threading.Event()
            previous = signal.signal(signal.SIGINT, lambda *_: cancel.set())
            operation = args.operation or uuid.uuid4().hex
            print(encode({"operation": operation, "state": "starting"}), file=sys.stderr, flush=True)
            try:
                with PaidReceiver(workspace) as receiver:
                    result = drain(workspace, receiver, operation_key=operation, max_pages=args.pages,
                                   max_amount=atomic_usdc(args.max_usdc),
                                   max_page_amount=atomic_usdc(args.max_page_usdc),
                                   refresh=args.refresh, cancelled=cancel)
                write_result(result)
            finally:
                signal.signal(signal.SIGINT, previous)
        elif args.command == "serve":
            stopped = threading.Event()
            previous_int = signal.signal(signal.SIGINT, lambda *_: stopped.set())
            previous_term = signal.signal(signal.SIGTERM, lambda *_: stopped.set())
            try:
                with Operator(workspace, port=args.port) as operator:
                    print("Private event operator: " + operator.url, flush=True)
                    if args.open:
                        import webbrowser
                        webbrowser.open(operator.url)
                    while not stopped.wait(1):
                        pass
            finally:
                signal.signal(signal.SIGINT, previous_int)
                signal.signal(signal.SIGTERM, previous_term)
        elif args.command == "status":
            write_result(workspace.snapshot(edition_id=args.edition, include_timelines=args.timelines))
        elif args.command == "watchlist":
            write_result({"tickers": workspace.watchlist() if args.tickers is None else workspace.set_watchlist(args.tickers)})
        elif args.command == "replay":
            write_result(workspace.replay(args.edition))
        elif args.command == "verify":
            write_result(workspace.verify())
        elif args.command == "metadata":
            write_result(retain_metadata(workspace))
        elif args.command == "export":
            write_result(export_workspace(workspace, args.output))
        elif args.command == "response":
            record = workspace.freeze_response(args.response_id)
            import hashlib
            hasher, length = hashlib.sha256(), 0
            for chunk in workspace.iter_body(args.response_id, through_ordinal=record["last_chunk"]):
                hasher.update(chunk)
                length += len(chunk)
            if length != record["length"] or (record["complete"] and hasher.hexdigest() != record["sha256"]):
                raise WorkspaceError("RESPONSE_CHANGED", "The selected response prefix failed verification.")
            args.output.parent.mkdir(parents=True, exist_ok=True)
            import os
            fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as stream:
                for chunk in workspace.iter_body(args.response_id, through_ordinal=record["last_chunk"]):
                    stream.write(chunk)
            write_result({"path": str(args.output.resolve()), "response": record, "download_sha256": hasher.hexdigest()})
        return 0
    except Exception as error:
        write_result({"error": error_details(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
