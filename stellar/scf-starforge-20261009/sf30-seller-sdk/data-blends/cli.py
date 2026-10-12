"""CLI and persistent JSON-lines adapter for the same saved blend workspace."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
from engine import Workspace, BlendError, canonical, require

ACTIONS = {"state", "binding", "source.rows", "source.import", "recipe.save", "recipe.read", "run",
           "edition", "rows", "review", "export", "backup", "receive", "export.path", "edition.path", "operation", "resume", "dismiss"}

def invoke(workspace: Workspace, action: str, data: dict):
    require(isinstance(data, dict), "Action input must be an object.")
    methods = {
        "state": workspace.state, "operation": workspace.operation, "resume": workspace.resume, "dismiss": workspace.dismiss, "binding": workspace.binding, "source.rows": workspace.source_rows,
        "source.import": workspace.import_csv, "recipe.save": workspace.save_recipe, "recipe.read": workspace.recipe,
        "run": workspace.run, "edition": workspace.edition, "rows": workspace.rows,
        "review": workspace.review, "export": workspace.export, "backup": workspace.backup,
        "export.path": lambda request: {"path": str(workspace.locate_export(request))},
        "edition.path": lambda edition: {"path": str(workspace.edition_path(edition))},
        "receive": lambda file, directory, expected_sha256: Workspace.receive(file, directory, expected_sha256).state()
    }
    require(action in methods, "Unknown workspace action.")
    return methods[action](**data)

def error_record(error: Exception) -> dict:
    return {"code": getattr(error, "code", "BLEND_OPERATION"), "message": str(error), "status": getattr(error, "status", 422)}

def main(argv=None):
    parser = argparse.ArgumentParser(description="Retain, join, review and deliver CSV data.")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="Create a private workspace")
    init.add_argument("--directory", required=True); init.add_argument("--name", required=True)
    receive = sub.add_parser("receive", help="Receive a complete private workspace into a new directory")
    receive.add_argument("--file", required=True); receive.add_argument("--directory", required=True); receive.add_argument("--sha256", required=True)
    for command in ["invoke", "bridge", "serve"]:
        p = sub.add_parser(command)
        p.add_argument("--directory", required=True)
        if command == "invoke":
            p.add_argument("action", choices=sorted(ACTIONS)); p.add_argument("--input", help="JSON argument file; otherwise stdin")
        if command == "serve":
            p.add_argument("--port", type=int, default=0)
            p.add_argument("--expected-binding-sha256")
            p.add_argument("--receive-root", help="Existing private parent used for browser backup receiving")
    args = parser.parse_args(argv)
    if args.command == "init":
        print(canonical(Workspace.create(args.directory, args.name).state())); return
    if args.command == "receive":
        print(canonical(Workspace.receive(args.file, args.directory, args.sha256).state())); return
    workspace = Workspace(args.directory)
    if args.command == "serve":
        from server import serve
        serve(workspace, args.port, args.expected_binding_sha256, args.receive_root); return
    if args.command == "invoke":
        data = json.loads(Path(args.input).read_text("utf-8")) if args.input else json.load(sys.stdin)
        print(canonical(invoke(workspace, args.action, data))); return
    # One retained process, one request at a time. Backpressure is the pipe rather
    # than unbounded task creation. Large data stays in retained files/pages.
    while line := sys.stdin.buffer.readline(20 * 1024 * 1024 + 1):
        request = None
        try:
            require(len(line) <= 20 * 1024 * 1024 and line.endswith(b"\n"), "Control request exceeds 20 MiB.")
            request = json.loads(line)
            require(isinstance(request, dict) and isinstance(request.get("id"), str), "Request needs an ID.")
            result = invoke(workspace, request.get("action"), request.get("input", {}))
            reply = {"id": request["id"], "result": result}
        except Exception as error:
            reply = {"id": request.get("id") if isinstance(request, dict) else None, "error": error_record(error)}
        print(canonical(reply), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(canonical({"error": error_record(error)}), file=sys.stderr)
        sys.exit(1)
