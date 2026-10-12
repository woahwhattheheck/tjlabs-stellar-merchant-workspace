"""MIT. Original IATI CLI bindings for saved publisher refresh history."""
from pathlib import Path

from refresh import InputError, KINDS, page
from workspace import load_json


def json_file(path):
    with Path(path).open("rb") as stream:
        data = stream.read(131073)
    if len(data) > 131072:
        raise InputError("Use one complete saved refresh input within 128 KiB")
    return load_json(data)


def register(sub):
    sub.add_parser("refresh-context")
    for name in ("refresh-plans", "refresh-history", "refresh-runs", "refresh-run-history"):
        selected = sub.add_parser(name)
        if name != "refresh-plans":
            selected.add_argument("--plan", required=True)
        if name == "refresh-run-history":
            selected.add_argument("--id", required=True)
        selected.add_argument("--offset", type=int, default=0)
        selected.add_argument("--limit", type=int, default=50)
        selected.add_argument("--snapshot")
    for name in ("refresh-plan", "refresh-run"):
        selected = sub.add_parser(name)
        selected.add_argument("--id", required=True)
        selected.add_argument("--revision", type=int)
        if name == "refresh-run":
            selected.add_argument("--plan", required=True)
    selected = sub.add_parser("refresh-status"); selected.add_argument("--plan", required=True)
    for name in ("refresh-request", "refresh-resume"):
        selected = sub.add_parser(name); selected.add_argument("--request-id", required=True)
    for action in sorted(KINDS):
        selected = sub.add_parser("refresh-" + action); selected.add_argument("--file", required=True)
    selected = sub.add_parser("refresh-preview"); selected.add_argument("--file", required=True)
    selected = sub.add_parser("refresh-export")
    selected.add_argument("--plan", required=True); selected.add_argument("--snapshot"); selected.add_argument("--out", required=True)
    selected = sub.add_parser("refresh-receive"); selected.add_argument("--file", required=True)


def command(ws, args):
    work, name = ws.refresh, args.command.removeprefix("refresh-")
    if name == "context":
        return work.context()
    if name == "status":
        return work.status(args.plan)
    if name == "plan":
        return work.plan(args.id, args.revision)
    if name == "run":
        return work.run(args.plan, args.id, args.revision)
    if name == "request":
        return work.request(args.request_id)
    if name == "resume":
        return work.resume(args.request_id)
    if name in KINDS:
        return work.save(name, json_file(args.file))
    if name == "preview":
        return work.preview(json_file(args.file))
    if name == "export":
        return work.export(args.plan, Path(args.out).expanduser().absolute(), args.snapshot)
    if name == "receive":
        return work.receive(Path(args.file))
    inventories = {"plans": lambda: work.plans(), "history": lambda: work.history(args.plan),
                   "runs": lambda: work.runs(args.plan), "run-history": lambda: work.run_history(args.plan, args.id)}
    if name not in inventories:
        raise InputError("Unknown original publisher-refresh command")
    return page(inventories[name](), args.offset, args.limit, args.snapshot)
