"""Customer CLI: complete-file reading, original-library receiving and handover."""
from __future__ import annotations

import argparse
from contextlib import ExitStack
import json
import signal
from pathlib import Path
import sys

from .reading_workspace import ReadingWorkspace, ReadingError
from .reading_delivery import export_project, receive_project, export_report


def parser():
    root = argparse.ArgumentParser(description="Search complete retained files and manage portable reading projects.")
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("status", "sources", "search", "read", "save-search", "run-search", "save-list", "history", "report", "export", "sync", "publish-collection", "serve"):
        p = commands.add_parser(name)
        p.add_argument("directory", type=Path)
        if name in ("sources", "search", "run-search"):
            p.add_argument("--offset", type=int, default=0)
            p.add_argument("--limit", type=int, default=30)
        if name in ("sources", "search", "save-search", "report"):
            p.add_argument("--snapshot")
        if name in ("search", "save-search"):
            p.add_argument("query")
            p.add_argument("--resource-id")
        if name in ("save-search", "save-list"):
            p.add_argument("--id", required=True)
            p.add_argument("--name", required=True)
            p.add_argument("--expected-revision", required=True, type=int)
            p.add_argument("--operation", required=True)
        if name == "save-list":
            p.add_argument("--items", type=Path, required=True, help="JSON array of {resource_id, ordinal, note}; preserve sha when selecting from search.")
            p.add_argument("--note", default="")
        if name == "read":
            p.add_argument("resource_id")
            p.add_argument("ordinal", type=int)
        if name == "run-search":
            p.add_argument("id")
            p.add_argument("--revision", type=int)
        if name == "history":
            p.add_argument("kind", choices=("list", "search"))
            p.add_argument("id")
        if name == "report":
            selector = p.add_mutually_exclusive_group(required=True)
            selector.add_argument("--list-id")
            selector.add_argument("--query")
            p.add_argument("--revision", type=int)
            p.add_argument("--format", choices=("html", "csv", "json"), default="html")
            p.add_argument("--out", type=Path, required=True)
        if name == "export":
            p.add_argument("out", type=Path)
        if name in ("sync", "publish-collection", "serve"):
            p.add_argument("--checkout", type=Path, required=name != "serve")
            p.add_argument("--library-state", type=Path, required=name != "serve")
            p.add_argument("--node", default="node")
        if name == "sync":
            p.add_argument("--operation", required=True)
            p.add_argument("--label", required=True)
        if name == "publish-collection":
            p.add_argument("--list-id", required=True)
            p.add_argument("--list-revision", required=True, type=int)
            p.add_argument("--collection-id", required=True)
            p.add_argument("--expected-revision", required=True, type=int)
            p.add_argument("--operation", required=True)
        if name == "serve":
            p.add_argument("--port", type=int, default=0)
    p = commands.add_parser("receive")
    p.add_argument("archive", type=Path)
    p.add_argument("directory", type=Path)
    p.add_argument("--max-total-bytes", type=int, default=20 * 1024**3)
    return root


def main(argv=None):
    a = parser().parse_args(argv)
    try:
        if a.command == "receive":
            result = receive_project(a.archive, a.directory, max_total_bytes=a.max_total_bytes)
        else:
            with ExitStack() as stack:
                w = stack.enter_context(ReadingWorkspace(a.directory, create=a.command == "sync"))
                library = None
                if a.command in ("sync", "publish-collection", "serve"):
                    if bool(a.checkout) != bool(a.library_state):
                        raise ReadingError("LIBRARY_CONFIGURATION", "Pass both --checkout and --library-state.")
                    if a.checkout:
                        from .review_library import ResourceLibrary
                        library = stack.enter_context(ResourceLibrary(checkout=a.checkout.resolve(), state=a.library_state.resolve(), node=a.node))
                if a.command == "status":
                    result = w.status()
                elif a.command == "sources":
                    result = w.resources(snapshot=a.snapshot, offset=a.offset, limit=a.limit)
                elif a.command == "search":
                    result = w.search(a.query, snapshot=a.snapshot, resource_id=a.resource_id, offset=a.offset, limit=a.limit)
                elif a.command == "read":
                    result = w.passage(a.resource_id, a.ordinal)
                elif a.command == "save-search":
                    result = w.save_search(record_id=a.id, name=a.name, query=a.query, snapshot=a.snapshot, resource_id=a.resource_id, expected_revision=a.expected_revision, operation_id=a.operation)
                elif a.command == "run-search":
                    result = w.run_search(a.id, revision=a.revision, offset=a.offset, limit=a.limit)
                elif a.command == "save-list":
                    with a.items.open(encoding="utf-8") as source:
                        items = json.load(source)
                    result = w.save_list(record_id=a.id, name=a.name, note=a.note, items=items, expected_revision=a.expected_revision, operation_id=a.operation)
                elif a.command == "history":
                    result = w.history(a.kind, a.id)
                elif a.command == "report":
                    result = export_report(w, a.out, format=a.format, list_id=a.list_id, list_revision=a.revision, query=a.query, snapshot=a.snapshot)
                elif a.command == "export":
                    result = export_project(w, a.out)
                elif a.command == "sync":
                    result = w.sync(library, operation_id=a.operation, label=a.label)
                elif a.command == "publish-collection":
                    result = w.publish_collection(library, list_id=a.list_id, list_revision=a.list_revision, collection_id=a.collection_id, expected_revision=a.expected_revision, operation_id=a.operation)
                else:
                    from .reading_server import create_server
                    server = create_server(w, port=a.port, library=library)
                    print(json.dumps({"url": server.reading_url, "message": "Open this private local launch URL in your browser. Press Ctrl-C to stop."}), flush=True)
                    previous_term = signal.getsignal(signal.SIGTERM)
                    def terminate(*_):
                        raise KeyboardInterrupt
                    signal.signal(signal.SIGTERM, terminate)
                    try:
                        server.serve_forever()
                    except KeyboardInterrupt:
                        pass
                    finally:
                        server.server_close()
                        signal.signal(signal.SIGTERM, previous_term)
                    return 0
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        print(json.dumps({"error": getattr(exc, "code", type(exc).__name__), "detail": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
