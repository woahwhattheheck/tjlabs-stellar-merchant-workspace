#!/usr/bin/env python3
"""Operate the complete original BLS regional labor workspace."""
from __future__ import annotations
import argparse
import contextlib
import json
from pathlib import Path
import sys
from model import Workspace, encoded, read_json, receive_project
from managed import binding


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("init")
    create.add_argument("--name", default="Regional labor analysis")
    commands.add_parser("binding")
    status = commands.add_parser("status")
    status.add_argument("--offset", type=int, default=0)
    status.add_argument("--limit", type=int, default=100)
    server = commands.add_parser("serve")
    server.add_argument("--port", type=int, default=0)
    server.add_argument("--expected-binding")
    server.add_argument("--startup-format", choices=["json"], default="json")
    operation = commands.add_parser("operate")
    operation.add_argument("--input", required=True)
    recover = commands.add_parser("operation")
    recover.add_argument("--id", required=True)
    observations = commands.add_parser("observations")
    observations.add_argument("--edition", required=True)
    observations.add_argument("--projection", choices=["laus", "qcew"], required=True)
    observations.add_argument("--filters")
    observations.add_argument("--offset", type=int, default=0)
    observations.add_argument("--limit", type=int, default=100)
    receive = commands.add_parser("receive")
    receive.add_argument("--archive", required=True)
    receive.add_argument("--sha256", required=True)
    receive.add_argument("--destination", required=True)
    run = commands.add_parser("receive-original")
    run.add_argument("--archive", required=True)
    run.add_argument("--sha256", required=True)
    run.add_argument("--name", default="Northeast Kingdom labor analysis")
    run.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.command == "receive":
        return receive_project(args.archive, args.destination, args.sha256)
    if not args.workspace:
        parser.error("--workspace is required for this command")
    if args.command == "binding":
        return binding(args.workspace)
    if args.command == "receive-original":
        from receiving import receive_original
        return receive_original(args.workspace, args.archive, args.sha256, args.out, args.name)
    workspace = Workspace(args.workspace, create=args.command == "init", name=getattr(args, "name", "Regional labor analysis"))
    if args.command == "serve":
        from server import serve
        if not 0 <= args.port <= 65535:
            raise ValueError("Choose a local port from 0 to 65535.")
        serve(workspace, args.port, args.expected_binding)
        return None
    with contextlib.closing(workspace):
        if args.command in ("init", "status"):
            return workspace.state(getattr(args, "offset", 0), getattr(args, "limit", 100))
        if args.command == "operate":
            return workspace.begin(read_json(Path(args.input)))
        if args.command == "operation":
            return workspace.operation(args.id)
        if args.command == "observations":
            selected = read_json(Path(args.filters)) if args.filters else {}
            return workspace.observations(args.edition, args.projection, selected, args.offset, args.limit)


if __name__ == "__main__":
    try:
        result = main()
        if result is not None:
            print(encoded(result))
    except Exception as error:
        print(encoded({"error": "BLS_WORKSPACE_OPERATION", "message": str(error)}), file=sys.stderr)
        sys.exit(1)
