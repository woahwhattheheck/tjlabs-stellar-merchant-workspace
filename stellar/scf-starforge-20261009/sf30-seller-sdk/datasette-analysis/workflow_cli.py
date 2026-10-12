#!/usr/bin/env python3
"""Operate complete source/report workflows and their original API/JMS requests."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from workflow_engine import (CONFIG_SCHEMA, SCHEMA, Workflow, WorkflowError,
                             atomic_json, canonical, file_descriptor, read_json)


def parser():
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    def command(name, help_text, *, request=False):
        item = commands.add_parser(name, help=help_text)
        item.add_argument("--workspace", required=True, help="Canonical private workflow directory")
        if request:
            item.add_argument("--request-id", required=True, help="Original business request ID")
        return item

    accept = command("accept", "Retain the complete original API or JMS request")
    accept.add_argument("--request", required=True, help="Original business request JSON file")
    accept.add_argument("--transport", help="Complete original native JMSMessage JSON file")
    accept.add_argument("--execution-id", help="Original Kestra execution ID")
    run = command("run", "Acquire the selected source, run native analysis and retain the full delivery", request=True)
    run.add_argument("--configuration", required=True, help="Installed profile JSON; retained with this original request")
    state = command("status", "Read original requests, native outcomes and delivery attempts")
    state.add_argument("--request-id")
    state.add_argument("--history", action="store_true")
    publish = command("publish", "Prepare the exact native JMS result for its retained attempt", request=True)
    publish.add_argument("--attempt-id", required=True)
    publish.add_argument("--output", required=True, help="Write the native JMS from item here")
    published = command("published", "Record the original JMS producer's actual result", request=True)
    published.add_argument("--attempt-id", required=True)
    published.add_argument("--count", type=int)
    published.add_argument("--receipt", help="Original producer JSON result, including messagesCount")
    callback = command("callback", "Send or resume the configured original callback", request=True)
    callback.add_argument("--attempt-id", required=True)
    acknowledged = command("acknowledge", "Record the customer's exact received-result reply", request=True)
    acknowledged.add_argument("--receipt", required=True)
    reconcile = command("reconcile", "Reconcile the original receiver or producer result", request=True)
    reconcile.add_argument("--receipt", required=True)
    reconcile.add_argument("--attempt-id", help="Required for a producer result")
    export = command("export", "Deliver source, full native workspace, outputs, history and flows", request=True)
    export.add_argument("--destination", required=True, help="Complete handover ZIP filename")
    export.add_argument("--source-archive", help="Original built product source archive; otherwise use retained configuration")
    receive = command("receive", "Independently receive and reopen a complete original project")
    receive.add_argument("--archive", required=True)
    receive.add_argument("--sha256", required=True)
    receive.add_argument("--analysis-workspace", help="Also reopen the original native Analysis archive here")
    result = command("receive-result", "Receive and deduplicate the complete correlated business result")
    result.add_argument("--message", required=True)
    result.add_argument("--request-id")
    result.add_argument("--correlation-id")
    result.add_argument("--delivery-id")
    result.add_argument("--expected-result-sha256")
    result.add_argument("--correlation-mode", choices=["business-properties", "native-header"])
    serve = command("serve", "Open the original request, result and delivery operator")
    serve.add_argument("--configuration", help="Installed profile JSON for native execution")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--open", action="store_true")
    configure = commands.add_parser("configure", help="Bind an installed profile to its actual original source files")
    configure.add_argument("--template", required=True)
    configure.add_argument("--source-archive", help="Complete built product source archive")
    configure.add_argument("--output", required=True)
    return root


def configure(args):
    configuration = read_json(args.template)
    if not isinstance(configuration, dict) or not configuration.get("profile"):
        raise WorkflowError("WORKFLOW_CONFIGURATION", "Select the complete installed profile template.")
    configuration["schema"] = CONFIG_SCHEMA
    source = configuration.get("source", {})
    if source.get("kind") in {"handover", "native-edition"}:
        field = "path" if source["kind"] == "handover" else "edition"
        original = file_descriptor(source[field], expected_sha256=source.get("sha256"))
        source[field], source["sha256"] = original["path"], original["sha256"]
    if args.source_archive:
        configuration["sourceArchive"] = file_descriptor(args.source_archive)
    elif isinstance(configuration.get("sourceArchive"), str):
        configuration["sourceArchive"] = file_descriptor(configuration["sourceArchive"])
    elif isinstance(configuration.get("sourceArchive"), dict):
        selected = configuration["sourceArchive"]
        configuration["sourceArchive"] = file_descriptor(selected["path"], expected_sha256=selected.get("sha256"))
    atomic_json(args.output, configuration)
    return {"schema": SCHEMA, "profile": configuration["profile"],
            "configuration": file_descriptor(args.output)}


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "configure":
            value = configure(args)
        elif args.command == "serve":
            from workflow_server import serve
            serve(args.workspace, configuration_path=args.configuration, port=args.port, open_browser=args.open)
            return 0
        elif args.command == "receive":
            value = Workflow.receive(args.archive, args.workspace, expected_sha256=args.sha256,
                                     analysis_destination=args.analysis_workspace)
        else:
            with Workflow(args.workspace) as workflow:
                if args.command == "accept":
                    value = workflow.accept(read_json(args.request), execution_id=args.execution_id,
                                            transport=read_json(args.transport) if args.transport else None)
                elif args.command == "run":
                    value = workflow.run(args.request_id, read_json(args.configuration))
                elif args.command == "status":
                    value = workflow.status(args.request_id, history=args.history)
                elif args.command == "publish":
                    value = workflow.publish(args.request_id, args.attempt_id)
                    atomic_json(args.output, value["jms"])
                    value["output"] = file_descriptor(args.output)
                elif args.command == "published":
                    original = read_json(args.receipt) if args.receipt else None
                    count = args.count if args.count is not None else (original or {}).get("messagesCount")
                    value = workflow.published(args.request_id, args.attempt_id, count=count, response=original)
                elif args.command == "callback":
                    value = workflow.callback(args.request_id, args.attempt_id)
                elif args.command == "acknowledge":
                    value = workflow.acknowledge(args.request_id, read_json(args.receipt))
                elif args.command == "reconcile":
                    original = read_json(args.receipt)
                    if original.get("schema") == "stellar-forge.source-workflow-receipt.v1":
                        value = workflow.acknowledge(args.request_id, original)
                    else:
                        if not args.attempt_id:
                            raise WorkflowError("WORKFLOW_ATTEMPT_REQUIRED", "Select the original publication attempt ID.")
                        value = workflow.published(args.request_id, args.attempt_id,
                                                   count=original.get("messagesCount"), response=original)
                elif args.command == "export":
                    value = workflow.export(args.request_id, args.destination, source_archive=args.source_archive)
                elif args.command == "receive-result":
                    value = workflow.receive_result(
                        read_json(args.message), request_id=args.request_id, correlation_id=args.correlation_id,
                        delivery_id=args.delivery_id, expected_result_sha256=args.expected_result_sha256,
                        correlation_mode=args.correlation_mode)
                else:
                    raise WorkflowError("WORKFLOW_COMMAND", "Select an original workflow command.")
        print(canonical(value), flush=True)
        return 0
    except KeyboardInterrupt:
        print(canonical({"schema": SCHEMA, "error": "WORKFLOW_INTERRUPTED",
                         "message": "Continue the same request and original native operation IDs."}), file=sys.stderr)
        return 130
    except Exception as error:
        print(canonical({"schema": SCHEMA, "error": getattr(error, "code", type(error).__name__),
                         "message": str(error), "requestId": getattr(error, "request_id", None)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
