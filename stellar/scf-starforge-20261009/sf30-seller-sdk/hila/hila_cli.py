#!/usr/bin/env python3
"""MIT. Complete HILA source, edition, review and portable operator."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import signal
import sys

from hila_workspace import HilaWorkspace, InputError, META_LIMIT, strict_json
from hila_rules import template, validate_rules
from hila_http import HilaServer


def read_input(path):
    file = Path(path)
    if file.stat().st_size > META_LIMIT:
        raise InputError("Complete JSON input exceeds 64 MiB")
    return strict_json(file.read_bytes())


def call(ws, operation, args):
    if not isinstance(args, dict):
        raise InputError("Operation arguments must be a complete object")
    if operation == "state":
        return ws.state()
    if operation == "questionnaire":
        return ws.questionnaire(args["id"])
    if operation == "acquisition":
        return ws.acquisition(args["id"])
    if operation == "questionnaire.add":
        with Path(args["file"]).open("rb") as stream:
            return ws.add_questionnaire(stream, args["provenance"])
    if operation == "source.add":
        with Path(args["file"]).open("rb") as stream:
            return ws.add_source(stream, args.get("label"), Path(args["file"]).name)
    if operation == "source":
        return ws.source(args["id"])
    if operation == "mapping":
        return ws.mapping(args["questionnaire"], args["source"])
    if operation == "rules.template":
        return template(ws.questionnaire(args["questionnaire"]))
    if operation == "rules.validate":
        return validate_rules(args["rules"], ws.questionnaire(args["questionnaire"]))
    if operation == "edition.save":
        return ws.save_edition(args)
    if operation == "edition":
        return ws.edition(args["id"])
    if operation == "editions":
        return ws.editions()
    if operation == "rows":
        return ws.respondent_page(args["edition"], args.get("offset", 0), args.get("limit", 50))
    if operation == "query":
        return ws.query(args["build"], args.get("query", {}))
    if operation == "review.save":
        return ws.save_review(args)
    if operation == "review":
        return ws.review(args["id"], args.get("revision"))
    if operation == "reviews":
        return ws.reviews()
    if operation == "history":
        return ws.history(args["id"])
    if operation == "request":
        return ws.request(args["id"])
    if operation == "report":
        return ws.report(args["id"], args.get("revision"), args.get("public", False))
    if operation == "report.export":
        return ws.write_report(args["id"], Path(args["output"]), args.get("revision"), args.get("public", False))
    if operation == "review.export":
        return ws.export_review(args["id"], Path(args["output"]), args.get("revision"))
    if operation == "receive":
        return ws.import_packet(Path(args["file"]))
    if operation == "dataset.export":
        return ws.export_dataset(args["build"], Path(args["output"]))
    if operation == "native.compare":
        return ws.compare(args["before"], args["after"])
    raise InputError("Unknown documented HILA operation: " + str(operation))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Retain and review complete source-bound HILA survey editions")
    parser.add_argument("--workspace", required=True, help="Original private HILA workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create the original private workspace")
    sub.add_parser("list", help="Read complete saved sources, editions and latest reviews")
    sub.add_parser("binding", aliases=["bind"], help="Inspect the original managed source/workspace binding")
    action = sub.add_parser("call", help="Run one documented operation with a complete JSON input")
    action.add_argument("--input", required=True, help="{operation,args} JSON file")
    form = sub.add_parser("questionnaire", help="Retain the complete original XForm and its provenance")
    form.add_argument("--file", required=True)
    form.add_argument("--provenance", required=True)
    intake = sub.add_parser("source", help="Retain and inventory a complete approved response edition")
    intake.add_argument("--file", required=True)
    intake.add_argument("--label", required=True)
    mapped = sub.add_parser("mapping", help="Inspect explicit field mapping suggestions")
    mapped.add_argument("--questionnaire", required=True)
    mapped.add_argument("--source", required=True)
    method = sub.add_parser("rules-template", help="Return the complete unconfigured original-item template")
    method.add_argument("--questionnaire", required=True)
    edition = sub.add_parser("save-edition")
    edition.add_argument("--input", required=True)
    review = sub.add_parser("save-review")
    review.add_argument("--input", required=True)
    for name in ("review", "history", "report", "export", "report-export"):
        command = sub.add_parser(name)
        command.add_argument("--id", required=True)
        if name != "history":
            command.add_argument("--revision", type=int)
        if name in {"report", "report-export"}:
            command.add_argument("--public", action="store_true")
        if name in {"export", "report-export"}:
            command.add_argument("--output", required=True)
    receive = sub.add_parser("receive")
    receive.add_argument("--file", required=True)
    query = sub.add_parser("query")
    query.add_argument("--build", required=True)
    query.add_argument("--params", default="{}")
    dataset = sub.add_parser("dataset")
    dataset.add_argument("--build", required=True)
    dataset.add_argument("--output", required=True)
    serve = sub.add_parser("serve", help="Open the original private local console")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--expected-binding")
    serve.add_argument("--startup-format", choices=["json"], default="json")
    args = parser.parse_args(argv)
    if args.command in {"bind", "binding"}:
        from hila_managed import inspect_binding
        print(json.dumps(inspect_binding(args.workspace), ensure_ascii=False, allow_nan=False))
        return
    if args.command == "serve":
        from hila_managed import require_binding
        binding = require_binding(args.workspace, args.expected_binding)
    with HilaWorkspace(args.workspace, create=args.command == "init") as ws:
        c = args.command
        if c in {"init", "list"}:
            result = ws.state()
        elif c == "call":
            original = read_input(args.input)
            if not isinstance(original, dict) or set(original) != {"operation", "args"}:
                raise InputError("Call input must contain its exact operation and complete arguments")
            result = call(ws, original["operation"], original["args"])
        elif c == "questionnaire":
            with Path(args.file).open("rb") as stream:
                result = ws.add_questionnaire(stream, read_input(args.provenance))
        elif c == "source":
            with Path(args.file).open("rb") as stream:
                result = ws.add_source(stream, args.label, Path(args.file).name)
        elif c == "mapping":
            result = ws.mapping(args.questionnaire, args.source)
        elif c == "rules-template":
            result = template(ws.questionnaire(args.questionnaire))
        elif c == "save-edition":
            result = ws.save_edition(read_input(args.input))
        elif c == "save-review":
            result = ws.save_review(read_input(args.input))
        elif c == "review":
            result = ws.review(args.id, args.revision)
        elif c == "history":
            result = ws.history(args.id)
        elif c == "report":
            result = ws.report(args.id, args.revision, args.public)
        elif c == "export":
            result = ws.export_review(args.id, Path(args.output), args.revision)
        elif c == "report-export":
            result = ws.write_report(args.id, Path(args.output), args.revision, args.public)
        elif c == "receive":
            result = ws.import_packet(Path(args.file))
        elif c == "query":
            result = ws.query(args.build, strict_json(args.params))
        elif c == "dataset":
            result = ws.export_dataset(args.build, Path(args.output))
        elif c == "serve":
            if not 0 <= args.port <= 65535:
                raise InputError("Port must be from 0 to 65535")
            server = HilaServer(ws, args.port, binding)
            print(json.dumps(server.launch_record, ensure_ascii=False, separators=(",", ":"), allow_nan=False), flush=True)
            def terminate(_signal, _frame):
                raise KeyboardInterrupt
            old = signal.signal(signal.SIGTERM, terminate)
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
                    signal.signal(signal.SIGTERM, old)
            return
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError) as error:
        print("HILA: " + str(error), file=sys.stderr)
        sys.exit(1)
