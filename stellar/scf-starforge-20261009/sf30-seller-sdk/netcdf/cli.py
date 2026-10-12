#!/usr/bin/env python3
"""Native original NetCDF workspace CLI and retained JSON RPC. MIT."""
from __future__ import annotations
import argparse, json, pathlib, sys
from netcdf_workspace import Workspace, WorkspaceError, canonical, require

def main():
    parser = argparse.ArgumentParser(description="Retain native NetCDF scientific sources, review exact selections and receive complete editable projects")
    parser.add_argument("--workspace", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create"); create.add_argument("--title", default="Scientific data operations")
    invoke = sub.add_parser("invoke"); invoke.add_argument("operation"); invoke.add_argument("--json", default="{}")
    sub.add_parser("rpc")
    serve = sub.add_parser("serve"); serve.add_argument("--port", type=int, default=0); serve.add_argument("--receive-root"); serve.add_argument("--token-file"); serve.add_argument("--expected-binding-sha256")
    receive = sub.add_parser("receive"); receive.add_argument("archive"); receive.add_argument("--expected-sha", required=True)
    args = parser.parse_args()
    if args.command == "create": result = Workspace.create(args.workspace, args.title)
    elif args.command == "receive": result = Workspace.receive(args.archive, args.workspace, args.expected_sha)
    else:
        workspace = Workspace(args.workspace)
        if args.command == "invoke": result = workspace.invoke(args.operation, json.loads(args.json))
        elif args.command == "serve":
            if args.expected_binding_sha256: require(workspace.binding()["sha256"] == args.expected_binding_sha256, "The original workspace binding changed", "NETCDF_SOURCE_CHANGED")
            from netcdf_http import Server
            server = Server(workspace, args.port, args.receive_root, args.token_file)
            print(canonical(server.startup(private=True)), flush=True)
            try: server.serve_forever(poll_interval=0.25)
            except KeyboardInterrupt: pass
            finally: server.server_close()
            return 0
        elif args.command == "rpc":
            for line in sys.stdin:
                request = {}
                try:
                    request = json.loads(line); require(isinstance(request, dict), "RPC input must be an object")
                    result = workspace.invoke(request.get("method"), request.get("params", {}))
                    print(canonical({"id": request.get("id"), "result": result}), flush=True)
                except BaseException as error:
                    print(canonical({"id": request.get("id") if isinstance(request, dict) else None, "error": {"code": getattr(error, "code", "NETCDF_ERROR"), "message": str(error)}}), flush=True)
            return 0
    print(canonical(result), flush=True)
    return 0

if __name__ == "__main__":
    try: sys.exit(main())
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)): raise
        print(canonical({"error": {"code": getattr(error, "code", "NETCDF_ERROR"), "message": str(error)}}), file=sys.stderr)
        sys.exit(1)
