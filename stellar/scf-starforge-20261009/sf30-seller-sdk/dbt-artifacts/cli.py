#!/usr/bin/env python3
"""Native dbt project commands. JSON stdout; errors on stderr; no dependencies. MIT."""
from __future__ import annotations
import argparse
import json
import signal
import sys
from pathlib import Path
from dbt_core import Project
from dbt_store import ProjectError, create_file, json_bytes
from dbt_portable import receive_project
from operations import invoke, ACTIONS


def parser():
    p = argparse.ArgumentParser(description="Starforge dbt project operations", allow_abbrev=False)
    p.add_argument("--project", help="Private initialized project directory")
    commands = p.add_subparsers(dest="command", required=True)
    init = commands.add_parser("create", help="Create an empty private project")
    init.add_argument("--title", required=True)
    call = commands.add_parser("invoke", help="Invoke the same native operation used by browser and SDK")
    call.add_argument("action", choices=sorted(ACTIONS))
    incoming = call.add_mutually_exclusive_group()
    incoming.add_argument("--input", help="JSON input filename; '-' reads stdin")
    incoming.add_argument("--json", help="Inline JSON input; use --input for private configuration")
    call.add_argument("--output", help="Create-only complete operation response file")
    cmd = commands.add_parser("import", help="Retain complete original artifact files")
    cmd.add_argument("files", nargs="+")
    cmd.add_argument("--expected-sha", help="Single-file digest binding")
    commands.add_parser("status", help="Read the existing original project")
    copy = commands.add_parser("receive", help="Receive a complete editable project into a new directory")
    copy.add_argument("archive")
    copy.add_argument("--destination", required=True)
    copy.add_argument("--expected-sha", required=True)
    serve = commands.add_parser("serve", help="Open the existing project in its original private loopback owner")
    serve.add_argument("--port", type=int, default=0)
    serve.add_argument("--token-file", help="Existing private bearer token file; generated privately if omitted")
    serve.add_argument("--receive-root", help="Existing parent for browser create-only receiving")
    serve.add_argument("--expected-binding-sha256")
    serve.add_argument("--max-upload-bytes", type=int, default=8 * 1024**3)
    return p


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if args.command == "receive":
            result = receive_project(args.archive, args.destination, args.expected_sha)
        else:
            if not args.project:
                raise ProjectError("PROJECT_REQUIRED", "Pass --project with the original private workspace.")
            project = Project(args.project, create=args.command == "create", title=getattr(args, "title", "dbt project"))
            if args.command in ("create", "status"):
                result = project.status()
            elif args.command == "import":
                if args.expected_sha and len(args.files) != 1:
                    raise ProjectError("SINGLE_FILE_DIGEST_REQUIRED")
                result = [project.import_file(path, args.expected_sha) for path in args.files]
            elif args.command == "serve":
                from dbt_http import serve
                return serve(project, port=args.port, token_file=args.token_file, receive_root=args.receive_root,
                             expected_binding=args.expected_binding_sha256, max_upload=args.max_upload_bytes)
            else:
                if args.input:
                    raw = sys.stdin.buffer.read() if args.input == "-" else Path(args.input).read_bytes()
                    value = json.loads(raw)
                else:
                    value = json.loads(args.json or "{}")
                result = invoke(project, args.action, value)
                if args.output:
                    create_file(Path(args.output), json_bytes(result))
        sys.stdout.buffer.write(json_bytes(result) + b"\n")
        sys.stdout.buffer.flush()
        return 0
    except (ProjectError, OSError, ValueError, KeyError, TypeError) as exc:
        sys.stderr.buffer.write(json_bytes({"error": getattr(exc, "code", "INVALID_OPERATION"), "message": str(exc)}) + b"\n")
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
