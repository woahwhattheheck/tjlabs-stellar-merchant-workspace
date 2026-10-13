"""MIT. Original TIND migration, native transfer and complete receiving command."""
from __future__ import annotations
import argparse
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
OAI = HERE.parent
if str(OAI) not in sys.path:
    sys.path.insert(1, str(OAI))

from bridge import InputError, storage

def document(path, maximum=8 * 1024 * 1024):
    if path == "-":
        value = sys.stdin.buffer.read(maximum + 1)
    else:
        source = Path(path)
        if source.stat().st_size > maximum:
            raise InputError("The complete input document exceeds its byte limit")
        value = source.read_bytes()
    if len(value) > maximum:
        raise InputError("The complete input document exceeds its byte limit")
    return storage.load_json(value)

def main():
    parser = argparse.ArgumentParser(description="TIND scholarly migration and complete editable receiving")
    parser.add_argument("--workspace", help="Private original OAI/XML workspace")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    sub.add_parser("profile-template")
    command = sub.add_parser("state"); command.add_argument("--project")
    command = sub.add_parser("apply"); command.add_argument("--request", required=True, help="Exact operation JSON file, or - for stdin")
    command = sub.add_parser("records")
    command.add_argument("--project", required=True); command.add_argument("--offset", type=int, default=0)
    command.add_argument("--limit", type=int, default=50); command.add_argument("--query", default="")
    command = sub.add_parser("record"); command.add_argument("--project", required=True); command.add_argument("--identifier", required=True)
    command = sub.add_parser("source-cases")
    command.add_argument("--project", required=True); command.add_argument("--offset", type=int, default=0)
    command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("source-case"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("source-case-plan"); command.add_argument("--project", required=True)
    command.add_argument("--id", required=True); command.add_argument("--choices", required=True, help="Complete [{caseId,identifier}] JSON file")
    command = sub.add_parser("source-case-reviews"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("source-case-review"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("source-case-export"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("files")
    command.add_argument("--project", required=True); command.add_argument("--offset", type=int, default=0)
    command.add_argument("--limit", type=int, default=50); command.add_argument("--query", default="")
    command = sub.add_parser("file-history")
    command.add_argument("--project", required=True); command.add_argument("--identifier", required=True); command.add_argument("--file", required=True)
    command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("file-receipt"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("export-batch"); command.add_argument("--id", required=True); command.add_argument("--out", required=True)
    command = sub.add_parser("handover"); command.add_argument("--out", required=True); command.add_argument("--metadata-only", action="store_true")
    command = sub.add_parser("receive"); command.add_argument("--archive", required=True); command.add_argument("--destination", required=True)
    sub.add_parser("binding")
    command = sub.add_parser("serve")
    command.add_argument("--port", type=int, default=0); command.add_argument("--expected-binding")
    command.add_argument("--startup-format", choices=("json",))
    command = sub.add_parser("native-search")
    command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--selection", required=True); command.add_argument("--authorization-env")
    command.add_argument("--export-context", help="Actual native field coverage, permissions and instance version JSON")
    command.add_argument("--interval", type=float, default=2.1); command.add_argument("--page-size", type=int, default=100)
    command = sub.add_parser("native-send")
    command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--request", required=True); command.add_argument("--authorization-env")
    command = sub.add_parser("destination-jobs"); command.add_argument("--project", required=True)
    command.add_argument("--id"); command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("job-read"); command.add_argument("--project", required=True)
    command.add_argument("--job", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("job-preview"); command.add_argument("--project", required=True); command.add_argument("--input", required=True)
    command = sub.add_parser("job-export"); command.add_argument("--project", required=True)
    command.add_argument("--job", required=True); command.add_argument("--out", required=True)
    command = sub.add_parser("source-downloads"); command.add_argument("--project", required=True)
    command.add_argument("--id"); command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("source-download-run"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--only", help="JSON array of selected acquisition row IDs")
    command = sub.add_parser("source-download-export"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command = sub.add_parser("production-collections"); command.add_argument("--project", required=True)
    command = sub.add_parser("production-plans"); command.add_argument("--project", required=True); command.add_argument("--id")
    command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("production-wave"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--offset", type=int, default=0); command.add_argument("--limit", type=int, default=50)
    command = sub.add_parser("production-export"); command.add_argument("--project", required=True); command.add_argument("--id", required=True)
    command.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.command == "profile-template":
        from marc import default_profile
        result = default_profile()
    elif args.command == "receive":
        from migration import Migration
        result = Migration.receive(args.archive, args.destination)
    else:
        if not args.workspace:
            raise InputError("Select the original workspace with --workspace")
        if args.command == "binding":
            from managed import inspect_binding
            result = inspect_binding(args.workspace)
        elif args.command == "serve":
            from server import serve
            serve(args.workspace, args.port, expected_binding=args.expected_binding, startup_format=args.startup_format)
            return
        else:
            from migration import Migration
            workspace = Migration(args.workspace, create=args.command == "init")
            try:
                if args.command in {"init", "state"}:
                    result = workspace.state(getattr(args, "project", None))
                elif args.command == "apply":
                    result = workspace.apply(document(args.request))
                elif args.command == "records":
                    result = workspace.records(args.project, args.offset, args.limit, args.query)
                elif args.command == "source-cases":
                    from source_cases import list_collections
                    with workspace.mutex:
                        result = list_collections(workspace, args.project, args.offset, args.limit)
                elif args.command == "source-case":
                    from source_cases import view_collection
                    with workspace.mutex:
                        result = view_collection(workspace, args.project, args.id)
                elif args.command == "source-case-plan":
                    from source_cases import plan_many
                    with workspace.mutex:
                        result = plan_many(workspace, args.project, args.id, document(args.choices))
                elif args.command == "source-case-reviews":
                    from source_cases import reviews
                    with workspace.mutex:
                        result = reviews(workspace, args.project, args.id, args.offset, args.limit)
                elif args.command == "source-case-review":
                    from source_cases import review_document
                    with workspace.mutex:
                        result = review_document(workspace, args.project, args.id)
                elif args.command == "source-case-export":
                    from source_cases import collection
                    with workspace.mutex:
                        item, _ = collection(workspace, args.project, args.id)
                        result = storage.load_json(workspace.object_path(item["original"]).read_bytes())
                elif args.command == "production-collections":
                    from production_waves import collection_inventory
                    with workspace.mutex:
                        result = collection_inventory(workspace, args.project)
                elif args.command == "production-plans":
                    from production_waves import list_plans, plan_view
                    with workspace.mutex:
                        result = plan_view(workspace, args.project, args.id, args.offset, args.limit) if args.id else list_plans(workspace, args.project, args.offset, args.limit)
                elif args.command == "production-wave":
                    from production_waves import wave_view
                    with workspace.mutex:
                        result = wave_view(workspace, args.project, args.id, args.offset, args.limit)
                elif args.command == "production-export":
                    from production_waves import write_export
                    result = write_export(workspace, args.project, args.id, args.out)
                elif args.command == "destination-jobs":
                    from native_jobs import pages, view
                    with workspace.mutex:
                        result = view(workspace, args.project, args.id, args.offset, args.limit) if args.id else pages(workspace, args.project, offset=args.offset, limit=args.limit)
                elif args.command == "job-read":
                    from native_jobs import read
                    result = read(workspace, args.project, args.job, args.id)
                elif args.command == "job-preview":
                    from native_jobs import preview
                    with workspace.mutex:
                        result = preview(workspace, args.project, document(args.input))
                elif args.command == "job-export":
                    from native_jobs import write_export
                    result = write_export(workspace, args.project, args.job, args.out)
                elif args.command == "source-downloads":
                    from source_files import view, list_acquisitions
                    with workspace.mutex:
                        result = view(workspace, args.project, args.id, args.offset, args.limit) if args.id else list_acquisitions(workspace, args.project, args.offset, args.limit)
                elif args.command == "source-download-run":
                    from source_files import run
                    result = run(workspace, args.project, args.id, only=document(args.only) if args.only else None)
                elif args.command == "source-download-export":
                    from source_files import full_document
                    with workspace.mutex:
                        result = full_document(workspace, args.project, args.id)
                elif args.command == "files":
                    with workspace.mutex:
                        result = workspace.files(args.project, args.offset, args.limit, args.query)
                elif args.command == "file-history":
                    with workspace.mutex:
                        result = workspace.file_history(args.project, args.identifier, args.file, args.offset, args.limit)
                elif args.command == "file-receipt":
                    with workspace.mutex:
                        result = workspace.file_receipt(args.project, args.id)
                elif args.command == "record":
                    with workspace.mutex:
                        result = workspace.preview(workspace.project(args.project), args.identifier)
                elif args.command == "export-batch":
                    result = workspace.export_batch(args.id, args.out)
                elif args.command == "handover":
                    result = workspace.handover(args.out, include_files=not args.metadata_only)
                elif args.command == "native-search":
                    from native import search_export
                    result = search_export(workspace, args.project, args.id, document(args.selection),
                                           authorization_env=args.authorization_env, interval=args.interval, page_size=args.page_size,
                                           export_context=document(args.export_context) if args.export_context else None)
                elif args.command == "native-send":
                    from native import send_exact
                    result = send_exact(workspace, args.project, args.id, document(args.request), authorization_env=args.authorization_env)
            finally:
                workspace.close()
    print(storage.json_bytes(result).decode(), end="")

if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError, KeyError) as error:
        print(storage.json_bytes({"error": str(error)}).decode(), file=sys.stderr, end="")
        sys.exit(2)
