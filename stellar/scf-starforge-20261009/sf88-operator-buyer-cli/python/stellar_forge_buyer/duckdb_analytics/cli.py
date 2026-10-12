"""Complete analytical workbook commands in the original DuckDB CLI."""
from __future__ import annotations

from pathlib import Path

from ..storage import parse, read
from .contracts import fail
from .model import Analytics
from .package import export_report, inspect_package, receive_package

MAX_BODY = 1024 * 1024


def add_parser(commands):
    parser = commands.add_parser("analytics", help="Create, run, publish and receive analytical workbooks")
    actions = parser.add_subparsers(dest="analytics_command", required=True)
    actions.add_parser("status")
    catalog = actions.add_parser("catalog", help="Page every saved definition, result, workbook or report")
    catalog.add_argument("kind", choices=("analyses", "workbooks", "results", "comparisons", "reports", "operations"))
    catalog.add_argument("--offset", type=int, default=0)
    catalog.add_argument("--limit", type=int, default=25)
    record = actions.add_parser("record", help="Read the current object or an exact definition revision")
    record.add_argument("kind", choices=("analyses", "workbooks", "results", "comparisons", "reports"))
    record.add_argument("id")
    record.add_argument("--revision", type=int)
    source = actions.add_parser("source", help="Read original meanings, null counts and distinct values")
    source.add_argument("edition_id")
    source.add_argument("--column")
    source.add_argument("--offset", type=int, default=0)
    source.add_argument("--limit", type=int, default=50)
    review = actions.add_parser("review", help="Review an exact native definition before saving")
    review.add_argument("--definition-file", required=True)
    for name in ("save-analysis", "run", "compare", "save-workbook", "publish"):
        selected = actions.add_parser(name, help="Use the original immutable request body and workspace identity")
        selected.add_argument("--request-file", required=True)
    rows = actions.add_parser("rows", help="Page the full retained native result")
    rows.add_argument("kind", choices=("results", "comparisons"))
    rows.add_argument("id")
    rows.add_argument("--offset", type=int, default=0)
    rows.add_argument("--limit", type=int, default=100)
    request = actions.add_parser("request", help="Read one original operation without replay")
    request.add_argument("request_id")
    resume = actions.add_parser("resume", help="Resume the same retained original request")
    resume.add_argument("request_id")
    resume.add_argument("--workspace-id", required=True)
    exported = actions.add_parser("export", help="Export complete HTML, CSV/Parquet, sources, application and editable warehouse ZIP")
    exported.add_argument("--request-file", required=True, help="Original JSON {request_id,report_id}")
    exported.add_argument("--destination", required=True)
    inspected = actions.add_parser("inspect-package", help="Read and verify an existing whole customer package")
    inspected.add_argument("--directory", required=True)
    inspected.add_argument("--manifest-sha256")
    received = actions.add_parser("receive", help="Reopen the package as a distinct working warehouse")
    received.add_argument("--directory", required=True)
    received.add_argument("--destination", required=True)
    received.add_argument("--manifest-sha256", required=True)
    received.add_argument("--workspace-id")
    return parser


def _body(path):
    return parse(read(Path(path).expanduser(), MAX_BODY))


def dispatch(workspace, args):
    model, command = Analytics(workspace), args.analytics_command
    if command == "status":
        return model.status()
    if command == "catalog":
        return model.catalog(args.kind, offset=args.offset, limit=args.limit)
    if command == "record":
        return model.record(args.kind, args.id, args.revision)
    if command == "source":
        return model.source(args.edition_id, column=args.column, offset=args.offset, limit=args.limit)
    if command == "review":
        return model.review(_body(args.definition_file))
    actions = {"save-analysis": "analyses", "run": "run", "compare": "compare", "save-workbook": "workbooks", "publish": "publish"}
    if command in actions:
        return model.perform(actions[command], _body(args.request_file))
    if command == "rows":
        return model.grid(args.kind, args.id, offset=args.offset, limit=args.limit)
    if command == "request":
        return model.request(args.request_id)
    if command == "resume":
        return model.resume(args.request_id, args.workspace_id)
    if command == "export":
        return export_report(workspace, _body(args.request_file), args.destination)
    if command == "inspect-package":
        return inspect_package(args.directory, expected_manifest_sha256=args.manifest_sha256)
    if command == "receive":
        return receive_package(args.directory, args.destination, expected_manifest_sha256=args.manifest_sha256,
                               expected_workspace_id=args.workspace_id)
    fail("COMMAND_NOT_FOUND")
