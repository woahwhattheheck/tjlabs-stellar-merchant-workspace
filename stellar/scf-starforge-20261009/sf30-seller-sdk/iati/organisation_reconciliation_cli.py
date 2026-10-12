"""MIT. Financial coverage operations in the original IATI command."""
from pathlib import Path
import sys
from iati_workspace import InputError, MAX_METADATA, load_json
from organisation_cli import output_file

def register(sub):
    root = sub.add_parser("reconciliation", help="Review organisation-to-activity financial coverage")
    commands = root.add_subparsers(dest="reconciliation_command", required=True)
    commands.add_parser("status")
    for name in ("catalog", "preview", "save", "review", "compare"):
        command = commands.add_parser(name)
        command.add_argument("--input", required=True, help="Complete JSON file, or - for stdin")
    command = commands.add_parser("request")
    command.add_argument("--request-id", required=True)
    for name in ("plan", "history", "rows", "file", "export"):
        command = commands.add_parser(name)
        command.add_argument("--id", required=True)
        if name != "history":
            command.add_argument("--revision", type=int, required=name == "rows")
        if name == "rows":
            command.add_argument("--section", required=True, choices=["comparisons", "activity", "issues", "decisions"])
            command.add_argument("--offset", type=int, default=0)
            command.add_argument("--limit", type=int, default=50)
            command.add_argument("--expected-snapshot")
        if name == "file":
            command.add_argument("--kind", required=True, choices=["report", "csv", "json"])
        if name in {"file", "export"}:
            command.add_argument("--output", required=True)
    command = commands.add_parser("receive")
    command.add_argument("--input", required=True, help="Complete financial comparison receiving ZIP")

def input_json(path):
    if path == "-":
        raw = sys.stdin.buffer.read(MAX_METADATA + 1)
    else:
        with Path(path).open("rb") as source:
            raw = source.read(MAX_METADATA + 1)
    if len(raw) > MAX_METADATA:
        raise InputError("The complete comparison request exceeds 64 MiB")
    value = load_json(raw)
    if not isinstance(value, dict):
        raise InputError("Use a complete financial comparison JSON object")
    return value

def command(workspace, args):
    work = workspace.reconciliation
    action = args.reconciliation_command
    if action == "status":
        return work.status()
    if action in {"catalog", "preview", "save", "review", "compare"}:
        return getattr(work, action)(input_json(args.input))
    if action == "request":
        return work.request(args.request_id)
    if action == "history":
        return {"history": work.history(args.id)}
    if action == "plan":
        return work.plan(args.id, args.revision)
    if action == "rows":
        raw = {"id": args.id, "revision": args.revision, "section": args.section, "offset": args.offset, "limit": args.limit}
        if args.expected_snapshot is not None:
            raw["expectedSnapshot"] = args.expected_snapshot
        return work.rows(raw)
    if action == "file":
        return output_file(work.file({"id": args.id, "revision": args.revision, "kind": args.kind}), args.output)
    if action == "export":
        return work.export({"id": args.id, "revision": args.revision, "output": Path(args.output).expanduser().absolute()})
    if action == "receive":
        return work.receive({"path": Path(args.input).expanduser().absolute()})
    raise InputError("Unknown IATI financial comparison command")
