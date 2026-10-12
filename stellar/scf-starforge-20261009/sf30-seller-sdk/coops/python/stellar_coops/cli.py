# MIT. Operator CLI; all financial, source and study decisions remain native.
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path
from .client import CoastalReceiver
from .transport import ReceivingError, atomic_json, decode_json, file_identity


def parser():
    p = argparse.ArgumentParser(
        description="Receive complete reviewed coastal model inputs from the original CO-OPS console.",
        epilog="Use the original console's private startup JSON. Every mutation requires a stable --intent; repeat it to recover the same original request.")
    p.add_argument("--directory", required=True, help="Owned private receiving directory, retained across sessions")
    p.add_argument("--startup", help="Current original console startup JSON; omitted for offline verify/status")
    p.add_argument("--adopt-origin", action="store_true", help="Explicitly adopt a new origin for the same original workspace")
    p.add_argument("--origin-note", default="", help="Reason for the selected same-workspace origin change")
    p.add_argument("--wait-seconds", type=float, default=60, help="Read the original pending operation for this long after dispatch")
    p.add_argument("--output", help="Write complete JSON output to this selected file, printing only its identity")
    commands = p.add_subparsers(dest="command", required=True)
    commands.add_parser("connect", help="Bind or reopen the original workspace without changing it")
    commands.add_parser("status", help="Read this receiver's binding and operation states")
    commands.add_parser("verify", help="Stream every received file and original archive member without a connection")
    item = commands.add_parser("receive-study", help="Receive all five files of one immutable reviewed study release")
    item.add_argument("--release", required=True)
    item = commands.add_parser("prepare-dataset", help="Prepare the original native dataset from that complete reviewed CSV")
    item.add_argument("--release", required=True)
    item.add_argument("--name", required=True)
    item.add_argument("--intent", required=True)
    item = commands.add_parser("receive-dataset", help="Receive metadata for an already prepared native study dataset")
    item.add_argument("--dataset", required=True)
    item = commands.add_parser("query", help="Use original field/filter/sort/cursor query semantics")
    item.add_argument("--dataset", required=True)
    item.add_argument("--query", default="limit=20", help="Original URL-encoded native query")
    item.add_argument("--intent", required=True)
    item.add_argument("--all", action="store_true", help="Retain every selected cursor page as complete CSV and JSONL")
    item = commands.add_parser("return-file", help="Retain/compare an actual selected CSV or JSONL; omit --file to resume")
    item.add_argument("--release", required=True)
    item.add_argument("--intent", required=True)
    item.add_argument("--file")
    item.add_argument("--format", choices=("csv", "jsonl"))
    item.add_argument("--note", default="")
    item = commands.add_parser("inspect-return", help="Receive the full comparison and current decision for explicit review")
    item.add_argument("--return-id", required=True)
    item = commands.add_parser("decide", help="Submit one explicitly recorded receiving decision")
    item.add_argument("--intent", required=True)
    item.add_argument("--decision", required=True, help="Actual complete receiving-decision JSON")
    item = commands.add_parser("resume", help="Reconcile one exact issued native action from its retained local key")
    item.add_argument("--key", required=True)
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        with CoastalReceiver(args.directory, args.startup, adopt_origin=args.adopt_origin,
                             origin_note=args.origin_note, wait_seconds=args.wait_seconds) as client:
            command = args.command
            if command == "connect":
                client.online()
                result = {"schema": "stellar-forge.coops-python-connection.v1", "status": "CONNECTED",
                          "workspaceId": client.binding["workspaceId"], "receiverId": client.binding["receiverId"],
                          "origin": client.binding["origin"]}
            elif command == "status":
                result = {"schema": "stellar-forge.coops-python-status.v1", "binding": client.binding,
                          "operations": client.operation_summary(), "online": client.session is not None}
            elif command == "verify":
                result = client.verify()
            elif command == "receive-study":
                result = client.receive_release(args.release)
            elif command == "prepare-dataset":
                result = client.prepare_dataset(args.release, args.name, args.intent)
            elif command == "receive-dataset":
                result = client.receive_dataset(args.dataset)
            elif command == "query":
                result = client.export_query(args.dataset, args.query, args.intent) if args.all else client.query(args.dataset, args.query, args.intent)
            elif command == "return-file":
                result = client.return_file(args.release, args.intent, args.file, format=args.format, note=args.note)
            elif command == "inspect-return":
                result = client.receive_return(args.return_id)
            elif command == "decide":
                result = client.record_decision(args.intent, args.decision)
            elif command == "resume":
                record = client.saved_action(args.key)
                if record is None:
                    raise ReceivingError("COOPS_PY_INTENT", "Select a retained original action key from status.")
                if record["state"] == "COMPLETE":
                    from .transport import digest, stable, require
                    require(record.get("localResultSha256") == digest(stable(record["result"]).encode("utf-8")),
                            "COOPS_PY_JOURNAL", "The retained original action result changed.")
                    result = record["result"]
                else:
                    request = decode_json(record["requestBody"])
                    result = client.action(args.key, request["action"], request["payload"])
            if args.output:
                path = Path(os.path.abspath(args.output))
                path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
                atomic_json(path, result)
                printed = {"schema": result.get("schema"), "status": result.get("status", "COMPLETE"),
                           "output": str(path), **file_identity(path)}
            else:
                printed = result
            print(json.dumps(printed, ensure_ascii=False, indent=2, allow_nan=False))
            return 0
    except ReceivingError as error:
        print(json.dumps(error.as_dict(), ensure_ascii=False), file=sys.stderr)
        return 3 if error.code in ("COOPS_PY_PENDING", "COOPS_PY_CONNECTION", "SESSION_REQUIRED") else 2
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": "COOPS_PY_LOCAL_STATE", "message": str(error),
                          "recovery": "Preserve the original receiving directory and intent. Inspect local capacity or the selected source before resuming."}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
