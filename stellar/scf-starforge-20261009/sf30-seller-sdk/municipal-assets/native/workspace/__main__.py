"""Run with python -m workspace from the original opportunity directory."""
import argparse
import json
import os
from pathlib import Path
import secrets
import stat

from .engine import Workspace, restore_backup
from .server import Server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    initialize = commands.add_parser("init", help="create a private workspace and its operator password file")
    initialize.add_argument("directory", type=Path)
    serve = commands.add_parser("serve", help="run the authenticated local operator application")
    serve.add_argument("directory", type=Path)
    serve.add_argument("--port", type=int, default=8766)
    serve.add_argument("--password-file", type=Path)
    backup = commands.add_parser("backup", help="write a consistent private backup without stopping the app")
    backup.add_argument("directory", type=Path)
    backup.add_argument("output", type=Path)
    restore = commands.add_parser("restore", help="verify and recover a backup into a new directory")
    restore.add_argument("backup", type=Path)
    restore.add_argument("destination", type=Path)
    demo = commands.add_parser("demo", help="load the clearly labeled development operation into an existing workspace")
    demo.add_argument("directory", type=Path)
    capture = commands.add_parser("capture", help="receive a complete Belleville public capture and save its editable handoff")
    capture.add_argument("directory", type=Path)
    capture.add_argument("capture", type=Path, help="complete attribute directory, attribute/geometry carrier, or saved source transport")
    capture.add_argument("--output", type=Path, required=True)
    capture.add_argument("--actor", required=True)
    capture.add_argument("--operation", required=True)
    capture.add_argument("--project", help="existing project for a separately identified source edition")
    capture.add_argument("--reopen-at", type=Path, help="receive the saved backup in a separate original destination")
    refresh = commands.add_parser("refresh", help="refresh the complete City public source into the existing mapped project")
    refresh.add_argument("directory", type=Path)
    refresh.add_argument("--project", required=True)
    refresh.add_argument("--actor", required=True)
    refresh.add_argument("--operation", required=True)
    refresh.add_argument("--expected-revision", type=int, required=True)
    refresh.add_argument("--page-width", type=int, default=500)
    refresh.add_argument("--geometry-width", type=int, default=100)
    refresh.add_argument("--source-operation", help="receive this same project's already captured complete source using a distinct operation")
    refresh.add_argument("--no-wait", action="store_true", help="save and return at the actual provider retry time")
    resume = commands.add_parser("refresh-resume", help="continue one original saved refresh request")
    resume.add_argument("directory", type=Path)
    resume.add_argument("--operation", required=True)
    resume.add_argument("--no-wait", action="store_true")
    status = commands.add_parser("refresh-status", help="list complete saved refresh operations for a project")
    status.add_argument("directory", type=Path)
    status.add_argument("--project", required=True)
    args = parser.parse_args()
    if args.command == "restore":
        result = restore_backup(args.backup, args.destination)
        password_file = args.destination / "operator-password.txt"
        password_file.write_text(secrets.token_urlsafe(32) + "\n")
        os.chmod(password_file, 0o600)
        result["password_file"] = str(password_file.resolve())
        print(json.dumps(result, indent=2))
        return
    workspace = Workspace(args.directory, create=args.command == "init")
    if args.command == "init":
        password_file = workspace.root / "operator-password.txt"
        with password_file.open("x") as handle:
            os.chmod(password_file, 0o600)
            handle.write(secrets.token_urlsafe(32) + "\n")
        print(json.dumps({"directory": str(workspace.root), "password_file": str(password_file)}, indent=2))
    elif args.command == "backup":
        with args.output.open("xb") as handle:
            os.chmod(args.output, 0o600)
            handle.write(workspace.backup())
        print(json.dumps({"backup": str(args.output.resolve()), "bytes": args.output.stat().st_size}))
    elif args.command == "capture":
        from .capture_intake import intake
        print(json.dumps(intake(workspace, args.capture, args.output, args.actor, args.operation,
                                project_id=args.project, reopen_at=args.reopen_at), indent=2))
    elif args.command in ("refresh", "refresh-resume", "refresh-status"):
        from .public_refresh import prepare, run, list_jobs
        if args.command == "refresh-status":
            workspace.project(args.project)
            print(json.dumps({"refreshes": list_jobs(workspace, args.project)}, indent=2))
            return
        if args.command == "refresh":
            prepare(workspace, args.project, args.actor, args.operation, args.expected_revision,
                    args.page_width, args.geometry_width, args.source_operation)
        result = run(workspace, args.operation, wait=not args.no_wait)
        print(json.dumps(result, indent=2))
        if result["state"] not in ("completed", "waiting"):
            raise SystemExit(1)
    elif args.command == "demo":
        from .demo import load
        print(json.dumps(load(workspace), indent=2))
    else:
        password_file = args.password_file or workspace.root / "operator-password.txt"
        info = password_file.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
            raise ValueError("The operator password must be a private regular file (chmod 600)")
        password = password_file.read_text().strip()
        server = Server(("127.0.0.1", args.port), workspace, password)
        print(json.dumps({"url": server.origin, "password_file": str(password_file.resolve()), "workspace": str(workspace.root)}), flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
