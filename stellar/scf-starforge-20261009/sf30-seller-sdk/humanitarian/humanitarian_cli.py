#!/usr/bin/env python3
"""MIT. Retain, map and review complete humanitarian table editions."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import signal
import sys

from humanitarian_workspace import (
    HumanitarianWorkspace, InputError, MAX_REQUEST, strict_json,
)
from humanitarian_http import HumanitarianServer


def read_input(path):
    with Path(path).open("rb") as stream:
        body = stream.read(MAX_REQUEST + 1)
    if len(body) > MAX_REQUEST:
        raise InputError("Complete JSON input exceeds 1 MiB")
    return strict_json(body)


def call(ws, operation, args):
    if not isinstance(args, dict):
        raise InputError("Operation arguments must be a complete object")
    if operation == "state":
        return ws.state()
    if operation == "source":
        return ws.source(args["id"])
    if operation == "source.add":
        path = Path(args["file"])
        with path.open("rb") as stream:
            return ws.add_source(stream, args.get("label", path.name), args.get("name", path.name))
    if operation == "source.table":
        return ws.table_rows(args["source"], args.get("table", "data"),
                             args.get("offset", 0), args.get("limit", 8))
    if operation == "reference.save":
        return ws.save_reference(args)
    if operation == "reference":
        return ws.reference(args["id"])
    if operation == "mapping.save":
        return ws.save_mapping(args)
    if operation == "mapping":
        return ws.mapping(args["id"])
    if operation == "alias.save":
        return ws.save_alias(args)
    if operation == "alias":
        return ws.alias(args["id"])
    if operation == "review.save":
        return ws.save_review(args)
    if operation == "review":
        return ws.review(args["id"], args.get("revision"))
    if operation == "reviews":
        return ws.reviews()
    if operation == "history":
        return ws.history(args["id"])
    if operation == "report":
        return ws.report(args["id"], args.get("revision"))
    if operation == "rows":
        return ws.rows(
            args["id"], args.get("revision"), args.get("edition", 0),
            args.get("offset", 0), args.get("limit", 50), args.get("issues", False),
        )
    if operation == "output.rows":
        return ws.output_rows(args["id"], args.get("revision"), args.get("edition", 0),
                              args.get("output"), args.get("offset", 0), args.get("limit", 50))
    if operation == "comparison.rows":
        return ws.comparison_rows(args["id"], args.get("revision"),
                                  args.get("offset", 0), args.get("limit", 50))
    if operation == "request":
        return ws.request(args["id"])
    if operation == "review.export":
        return ws.export_review(args["id"], Path(args["output"]), args.get("revision"))
    if operation == "report.export":
        return ws.write_report(args["id"], Path(args["output"]), args.get("revision"))
    if operation == "receive":
        return ws.receive_review(Path(args["file"]))
    if operation == "query":
        return ws.query(args["build"], args.get("query", {}))
    if operation == "dataset.export":
        return ws.export_dataset(args["build"], Path(args["output"]))
    raise InputError("Unknown documented humanitarian operation: " + str(operation))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="Original private humanitarian workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create the private source and review workspace")
    sub.add_parser("list", help="Read the complete saved source, reference, mapping and review inventory")
    sub.add_parser("binding", aliases=["bind"], help="Read the original managed source and workspace binding")
    action = sub.add_parser("call", help="Run one operation with its complete {operation,args} JSON")
    action.add_argument("--input", required=True)
    source = sub.add_parser("source", help="Retain and inventory a complete original table source")
    source.add_argument("--file", required=True)
    source.add_argument("--label", required=True)
    for kind in ("reference", "mapping", "alias", "review"):
        save = sub.add_parser("save-" + kind, help="Save the complete original " + kind + " request")
        save.add_argument("--input", required=True)
    for name in ("reference", "mapping", "alias", "review", "history", "report", "export", "report-export"):
        command = sub.add_parser(name)
        command.add_argument("--id", required=True)
        if name in {"review", "report", "export", "report-export"}:
            command.add_argument("--revision", type=int)
        if name in {"export", "report-export"}:
            command.add_argument("--output", required=True)
    rows = sub.add_parser("rows", help="Read original normalized rows and resolution issues")
    rows.add_argument("--id", required=True)
    rows.add_argument("--revision", type=int)
    rows.add_argument("--edition", type=int, default=0)
    rows.add_argument("--offset", type=int, default=0)
    rows.add_argument("--limit", type=int, default=50)
    rows.add_argument("--issues", action="store_true")
    for name in ("output-rows", "comparison-rows"):
        page = sub.add_parser(name, help="Read a complete saved reporting page")
        page.add_argument("--id", required=True)
        page.add_argument("--revision", type=int)
        page.add_argument("--offset", type=int, default=0)
        page.add_argument("--limit", type=int, default=50)
        if name == "output-rows":
            page.add_argument("--edition", type=int, default=0)
            page.add_argument("--output", required=True)
    table = sub.add_parser("source-table", help="Read full original physical table rows")
    table.add_argument("--source", required=True)
    table.add_argument("--table", default="data")
    table.add_argument("--offset", type=int, default=0)
    table.add_argument("--limit", type=int, default=8)
    request = sub.add_parser("request", help="Read the result of an original request identifier")
    request.add_argument("--id", required=True)
    receive = sub.add_parser("receive", help="Reconstruct a complete source and review-history package")
    receive.add_argument("--file", required=True)
    query = sub.add_parser("query", help="Query one original Dataset build")
    query.add_argument("--build", required=True)
    query.add_argument("--params", default="{}")
    dataset = sub.add_parser("dataset", help="Export the complete original Dataset files")
    dataset.add_argument("--build", required=True)
    dataset.add_argument("--output", required=True)
    serve = sub.add_parser("serve", help="Open the original authenticated private console")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--expected-binding")
    serve.add_argument("--startup-format", choices=["json"], default="json")
    args = parser.parse_args(argv)
    if args.command in {"bind", "binding"}:
        from humanitarian_managed import inspect_binding
        print(json.dumps(inspect_binding(args.workspace), ensure_ascii=False, allow_nan=False))
        return
    if args.command == "serve":
        from humanitarian_managed import require_binding
        binding = require_binding(args.workspace, args.expected_binding)
    with HumanitarianWorkspace(args.workspace, create=args.command == "init") as ws:
        command = args.command
        if command in {"init", "list"}:
            result = ws.state()
        elif command == "call":
            original = read_input(args.input)
            if not isinstance(original, dict) or set(original) != {"operation", "args"}:
                raise InputError("Call input must contain its exact operation and complete arguments")
            result = call(ws, original["operation"], original["args"])
        elif command == "source":
            path = Path(args.file)
            with path.open("rb") as stream:
                result = ws.add_source(stream, args.label, path.name)
        elif command.startswith("save-"):
            method = {
                "save-reference": ws.save_reference, "save-mapping": ws.save_mapping,
                "save-alias": ws.save_alias, "save-review": ws.save_review,
            }[command]
            result = method(read_input(args.input))
        elif command in {"reference", "mapping", "alias", "request", "history"}:
            result = getattr(ws, command)(args.id)
        elif command in {"review", "report"}:
            result = getattr(ws, command)(args.id, args.revision)
        elif command == "rows":
            result = ws.rows(args.id, args.revision, args.edition, args.offset, args.limit, args.issues)
        elif command == "output-rows":
            result = ws.output_rows(args.id, args.revision, args.edition, args.output, args.offset, args.limit)
        elif command == "comparison-rows":
            result = ws.comparison_rows(args.id, args.revision, args.offset, args.limit)
        elif command == "source-table":
            result = ws.table_rows(args.source, args.table, args.offset, args.limit)
        elif command == "export":
            result = ws.export_review(args.id, Path(args.output), args.revision)
        elif command == "report-export":
            result = ws.write_report(args.id, Path(args.output), args.revision)
        elif command == "receive":
            result = ws.receive_review(Path(args.file))
        elif command == "query":
            result = ws.query(args.build, strict_json(args.params))
        elif command == "dataset":
            result = ws.export_dataset(args.build, Path(args.output))
        elif command == "serve":
            if not 0 <= args.port <= 65535:
                raise InputError("Port must be from 0 to 65535")
            server = HumanitarianServer(ws, args.port, binding)
            print(json.dumps(server.launch_record, ensure_ascii=False, separators=(",", ":"), allow_nan=False), flush=True)

            def terminate(_signal, _frame):
                raise KeyboardInterrupt

            previous = signal.signal(signal.SIGTERM, terminate)
            try:
                server.serve_forever(poll_interval=0.2)
            except KeyboardInterrupt:
                pass
            finally:
                signal.signal(signal.SIGTERM, signal.SIG_IGN)
                signal.signal(signal.SIGINT, signal.SIG_IGN)
                try:
                    server.server_close()
                finally:
                    signal.signal(signal.SIGTERM, previous)
            return
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError, KeyError) as error:
        print("Humanitarian: " + str(error), file=sys.stderr)
        sys.exit(1)
