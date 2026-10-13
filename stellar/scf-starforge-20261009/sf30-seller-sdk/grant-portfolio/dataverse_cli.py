#!/usr/bin/env python3
"""Original-workspace Dataverse operator CLI. Python 3.11+; no tenant call on read."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

from dataverse_contract import parse_json, json_bytes, require, sha256
from dataverse_solution import compiler_contract, compile_solution
from dataverse_packages import inspect_solution, MAX_NATIVE_ZIP
from dataverse_portable import inspect_delivery, delivery_file, _write, _copy, _info
from dataverse_workspace import record, list_records
from dataverse_http import record_view, evidence_file, events_view

def _input(path, maximum=64 * 1024 * 1024):
    selected = Path(path).expanduser().absolute()
    require(selected.is_file() and not selected.is_symlink() and selected.stat().st_size <= maximum,
            "CLI_INPUT", "Select one complete ordinary bounded input file.")
    return selected.read_bytes()

def _json(path):
    return parse_json(_input(path))

def _emit(value, output=None):
    raw = json_bytes(value)
    if output:
        selected = Path(output).expanduser().absolute()
        require(selected.parent.exists(), "CLI_OUTPUT", "Create the intended receiving directory first.")
        _write(selected, raw)
        print(json_bytes({"file": str(selected), "bytes": len(raw), "sha256": sha256(raw)}).decode(), end="")
    else:
        sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()

def _parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Original private grant-portfolio workspace.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("contract")
    compile_command = commands.add_parser("compile")
    compile_command.add_argument("--spec", required=True)
    compile_command.add_argument("--snapshot", required=True)
    compile_command.add_argument("--output", required=True)
    for name in ("inspect-solution", "inspect-delivery"):
        selected = commands.add_parser(name)
        selected.add_argument("--file", required=True)
        selected.add_argument("--output")
    commands.add_parser("init")
    commands.add_parser("state")
    upload = commands.add_parser("upload")
    upload.add_argument("--file", required=True)
    upload.add_argument("--sha256")
    for name in ("admit", "action"):
        selected = commands.add_parser(name)
        selected.add_argument("--input", required=True)
    for name in ("request", "resume"):
        selected = commands.add_parser(name)
        selected.add_argument("--operation-id", required=True)
    records = commands.add_parser("records")
    records.add_argument("--portfolio-id")
    records.add_argument("--revision", type=int)
    records.add_argument("--kind")
    records.add_argument("--offset", type=int, default=0)
    records.add_argument("--limit", type=int, default=50)
    selected = commands.add_parser("record")
    selected.add_argument("--id", required=True)
    selected.add_argument("--output", help="Write the complete exact native JSON; without it return the file descriptor.")
    events = commands.add_parser("events")
    events.add_argument("--operation-id", required=True)
    events.add_argument("--offset", type=int, default=0)
    events.add_argument("--limit", type=int, default=50)
    evidence = commands.add_parser("evidence")
    evidence.add_argument("--operation-id", required=True)
    evidence.add_argument("--kind", choices=("native-request", "step", "event"), required=True)
    evidence.add_argument("--key", required=True)
    evidence.add_argument("--output", required=True)
    download = commands.add_parser("download")
    download.add_argument("--record-id", required=True)
    download.add_argument("--output", required=True)
    receive = commands.add_parser("receive")
    receive.add_argument("--file", required=True)
    receive.add_argument("--sha256", required=True)
    receive.add_argument("--operation-id", required=True)
    receive.add_argument("--actor", required=True)
    receive.add_argument("--expected-revision", type=int)
    return parser

def run(args):
    if args.command == "contract":
        from dataverse_workspace import NATIVE_PARENT_ACTIONS as ACTIONS
        return {"compiler": compiler_contract(), "actions": list(ACTIONS)}
    if args.command == "compile":
        result = compile_solution(_json(args.spec), _json(args.snapshot))
        _emit(result, args.output)
        return None
    if args.command == "inspect-solution":
        result = inspect_solution(_input(args.file, MAX_NATIVE_ZIP))
        _emit(result, args.output)
        return None
    if args.command == "inspect-delivery":
        result = inspect_delivery(Path(args.file).expanduser().absolute())
        _emit(result, args.output)
        return None
    require(args.workspace is not None, "CLI_WORKSPACE", "Select the existing original workspace.")
    from workspace import Workspace
    from domain import parse as original_parse
    with Workspace(args.workspace, create=args.command == "init") as workspace:
        if args.command in ("init", "state"):
            return workspace.state()
        if args.command == "upload":
            path = Path(args.file).expanduser().absolute()
            descriptor = _info(path)
            if args.sha256 is not None:
                require(descriptor["sha256"] == args.sha256, "CLI_SOURCE_HASH", "The selected original file differs.")
            with path.open("rb") as stream:
                result = workspace.upload(stream, descriptor["bytes"])
            require(result["sha256"] == descriptor["sha256"], "CLI_SOURCE_CHANGED", "The original file changed during upload.")
            return result
        if args.command in ("admit", "action"):
            original = original_parse(_input(args.input, 1024 * 1024))
            admitted = workspace.admit(original)
            _emit({"phase": "original_action_admitted", "operationId": admitted["id"],
                   "workspaceId": workspace.marker["workspaceId"], "state": admitted["state"],
                   "inputSha256": admitted["inputSha256"], "pid": os.getpid()})
            return admitted if args.command == "admit" else workspace.execute(admitted["id"])
        if args.command in ("request", "resume"):
            original = workspace.request(args.operation_id)
            if args.command == "request":
                return original
            _emit({"phase": "original_action_continuing", "operationId": original["id"],
                   "inputSha256": original["inputSha256"], "workspaceId": workspace.marker["workspaceId"], "pid": os.getpid()})
            return workspace.execute(original["id"])
        if args.command == "records":
            return list_records(workspace, portfolio_id=args.portfolio_id, revision=args.revision,
                                kind=args.kind, offset=args.offset, limit=args.limit)
        if args.command == "record":
            if args.output:
                _emit(record(workspace, args.id), args.output)
                return None
            return record_view(workspace, args.id)
        if args.command == "events":
            return events_view(workspace, args.operation_id, args.offset, args.limit)
        if args.command == "evidence":
            selected = evidence_file(workspace, args.operation_id, args.kind, args.key)
            output = Path(args.output).expanduser().absolute()
            _copy(selected["path"], output, selected["descriptor"])
            return {"path": str(output), **selected["descriptor"]}
        if args.command == "download":
            selected = delivery_file(workspace, args.record_id)
            output = Path(args.output).expanduser().absolute()
            _copy(selected["path"], output, selected)
            return {"path": str(output), **{k: selected[k] for k in ("bytes", "sha256", "filename")}}
        if args.command == "receive":
            path = Path(args.file).expanduser().absolute()
            descriptor = _info(path)
            require(descriptor["sha256"] == args.sha256, "CLI_SOURCE_HASH", "The received original archive differs.")
            inspect_delivery(path)
            with path.open("rb") as stream:
                uploaded = workspace.upload(stream, descriptor["bytes"])
            require(uploaded["sha256"] == args.sha256, "CLI_SOURCE_CHANGED", "The received original archive changed.")
            value = {"operationId": args.operation_id, "action": "dataverse.delivery.receive",
                     "payload": {"actor": args.actor, "object": args.sha256}}
            if args.expected_revision is not None:
                value["expectedRevision"] = args.expected_revision
            admitted = workspace.admit(value)
            _emit({"phase": "original_receiving_admitted", "operationId": admitted["id"],
                   "inputSha256": admitted["inputSha256"], "workspaceId": workspace.marker["workspaceId"], "pid": os.getpid()})
            return workspace.execute(admitted["id"])
    raise ValueError("Unsupported original action.")

def main(argv=None):
    try:
        value = run(_parser().parse_args(argv))
        if value is not None:
            _emit(value)
            return 2 if isinstance(value, dict) and value.get("state") == "FAILED" else 0
        return 0
    except Exception as error:
        _emit({"state": "FAILED", "error": {"code": getattr(error, "code", type(error).__name__),
               "message": str(error), "details": getattr(error, "details", {})}})
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
