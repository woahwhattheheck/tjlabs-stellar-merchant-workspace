"""Research desk -> original collection -> editable reading project -> complete return."""
from __future__ import annotations

import argparse
from contextlib import ExitStack
import json
from pathlib import Path
import sys

from .reading_workspace import ReadingWorkspace
from .reading_exchange import (inspect_handover, pack_handover, receive_handover,
                               export_return, receive_return, publish_return)


def parser():
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    for name in ("index", "saved", "capture", "prepare", "download", "operations", "export"):
        p = commands.add_parser(name)
        p.add_argument("--checkout", type=Path, required=True)
        p.add_argument("--library-state", type=Path, required=True)
        p.add_argument("--node", default="node")
        if name in ("capture", "export"):
            p.add_argument("--name", required=True)
            p.add_argument("--note", default="")
            query = p.add_mutually_exclusive_group(required=True)
            query.add_argument("--query")
            query.add_argument("--saved-query")
            p.add_argument("--saved-revision", type=int)
            p.add_argument("--mode", choices=("all", "any"), default="all")
            p.add_argument("--build")
            p.add_argument("--resource-id")
            p.add_argument("--selection-mode", choices=("passage", "excerpt"), default="passage")
            p.add_argument("--items", type=Path, help="Original [{resourceId, ordinal, kind, note}] choices; query membership is checked.")
        if name in ("prepare", "export"):
            p.add_argument("--collection", required=True)
            p.add_argument("--expected-revision", type=int, required=True)
            p.add_argument("--operation", required=True)
        if name == "prepare":
            p.add_argument("--capture", required=True)
        if name == "download":
            p.add_argument("--operation", required=True)
        if name in ("download", "export"):
            p.add_argument("--out", type=Path, required=True)
    p = commands.add_parser("inspect")
    p.add_argument("archive", type=Path)
    p = commands.add_parser("receive")
    p.add_argument("archive", type=Path)
    p.add_argument("directory", type=Path)
    p.add_argument("--checkout", type=Path, required=True)
    p.add_argument("--node", default="node")
    p.add_argument("--resume", action="store_true")
    p = commands.add_parser("pack", help=argparse.SUPPRESS)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--source-archive", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    for name in ("return", "publish-return"):
        p = commands.add_parser(name)
        p.add_argument("directory", type=Path)
        p.add_argument("--list", required=True)
        p.add_argument("--revision", type=int, required=True)
        if name == "return":
            p.add_argument("--out", type=Path, required=True)
        else:
            p.add_argument("--checkout", type=Path, required=True)
            p.add_argument("--library-state", type=Path, required=True)
            p.add_argument("--node", default="node")
            p.add_argument("--collection", required=True)
            p.add_argument("--expected-revision", type=int, required=True)
            p.add_argument("--operation", required=True)
    p = commands.add_parser("receive-return")
    p.add_argument("archive", type=Path)
    p.add_argument("directory", type=Path)
    return root


def main(argv=None):
    a = parser().parse_args(argv)
    try:
        if a.command == "inspect":
            result = inspect_handover(a.archive)
        elif a.command == "pack":
            result = pack_handover(a.manifest, a.source_archive, a.out)
        elif a.command == "receive":
            result = receive_handover(a.archive, a.directory, checkout=a.checkout, node=a.node, resume=a.resume)
        elif a.command == "receive-return":
            result = receive_return(a.archive, a.directory)
        elif a.command in ("return", "publish-return"):
            with ReadingWorkspace(a.directory, create=False) as workspace:
                if a.command == "return":
                    result = export_return(workspace, a.out, list_id=a.list, list_revision=a.revision)
                else:
                    from .review_library import ResourceLibrary
                    with ResourceLibrary(checkout=a.checkout.resolve(), state=a.library_state.resolve(), node=a.node) as library:
                        result = publish_return(workspace, library, list_id=a.list, list_revision=a.revision,
                            collection_id=a.collection, expected_revision=a.expected_revision, operation_id=a.operation)
        else:
            from .review_library import ResourceLibrary
            with ResourceLibrary(checkout=a.checkout.resolve(), state=a.library_state.resolve(), node=a.node) as library:
                if a.command == "index":
                    result = library.research_index()
                elif a.command == "saved":
                    result = library.research_saved()
                elif a.command == "operations":
                    result = library.reading_handover_status()
                elif a.command == "download":
                    result = vars(library.download_reading_handover(a.operation, a.out))
                else:
                    if a.command in ("capture", "export"):
                        items = json.loads(a.items.read_text(encoding="utf-8")) if a.items else None
                        result = library.capture_reading(name=a.name, note=a.note, query=a.query, mode=a.mode,
                            build=a.build, resource_id=a.resource_id, saved_query_id=a.saved_query,
                            saved_query_revision=a.saved_revision, selection_mode=a.selection_mode, items=items)
                        capture = result["captureSha256"]
                    else:
                        capture = a.capture
                    if a.command in ("prepare", "export"):
                        result = library.prepare_reading(capture, collection_id=a.collection,
                            expected_revision=a.expected_revision, operation_id=a.operation)
                    if a.command == "export":
                        output = library.download_reading_handover(a.operation, a.out)
                        result = {"handover": result, "download": {"path": str(output.path), "bytes": output.bytes, "sha256": output.sha256}}
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False, default=str))
        return 0
    except (ValueError, OSError, RuntimeError) as exc:
        print(json.dumps({"error": getattr(exc, "code", type(exc).__name__), "detail": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
