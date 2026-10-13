"""MIT. Full native document evidence through the original IATI command."""
from __future__ import annotations
from pathlib import Path
from iati_source import InputError
from organisation_cli import original, output_file

ACTIONS = ("save", "note", "observe", "review", "compare")


def register(sub):
    sub.add_parser("document-evidence-status")
    item = sub.add_parser("document-evidence-request")
    item.add_argument("--request-id", required=True)
    for name in ("plan", "history", "observation", "comparison", "correction", "export", "file"):
        item = sub.add_parser("document-evidence-" + name)
        item.add_argument("--id", required=True)
        if name in {"plan", "export", "correction", "file"}:
            item.add_argument("--revision", type=int, required=name in {"correction", "file"})
        if name in {"export", "file"}:
            item.add_argument("--out", required=True)
        if name == "file":
            item.add_argument("--kind", required=True, choices=["report", "register", "plan", "correction"])
    item = sub.add_parser("document-evidence-body")
    item.add_argument("--observation-id", required=True)
    item.add_argument("--out", required=True)
    for name in ("rows", "detail"):
        item = sub.add_parser("document-evidence-" + name)
        item.add_argument("--id", required=True)
        item.add_argument("--revision", required=True, type=int)
        item.add_argument("--expected-snapshot")
        if name == "rows":
            item.add_argument("--offset", type=int, default=0)
            item.add_argument("--limit", type=int, default=100)
        else:
            item.add_argument("--row-id", required=True)
    for name in (*ACTIONS, "receive"):
        item = sub.add_parser("document-evidence-" + name)
        item.add_argument("--file", required=True)


def command(workspace, args):
    work, action = workspace.document_evidence, args.command.removeprefix("document-evidence-")
    if action == "status":
        return work.status()
    if action == "request":
        return work.request(args.request_id)
    if action == "plan":
        return work.plan(args.id, args.revision)
    if action == "history":
        return {"history": work.history(args.id)}
    if action in {"observation", "comparison"}:
        return getattr(work, action)(args.id)
    if action == "correction":
        return work.correction(args.id, args.revision)
    if action in {"rows", "detail"}:
        value = {"id": args.id, "revision": args.revision}
        if args.expected_snapshot is not None:
            value["expectedSnapshot"] = args.expected_snapshot
        if action == "rows":
            value.update(offset=args.offset, limit=args.limit)
        else:
            value["rowId"] = args.row_id
        return getattr(work, action)(value)
    if action == "body":
        return output_file(work.body(args.observation_id), args.out)
    if action == "file":
        return output_file(work.file({"id": args.id, "revision": args.revision, "kind": args.kind}), args.out)
    if action == "export":
        value = {"id": args.id, "output": Path(args.out).expanduser().absolute()}
        if args.revision is not None:
            value["revision"] = args.revision
        return work.export(value)
    if action == "receive":
        return work.receive({"path": Path(args.file).expanduser().absolute()})
    if action in ACTIONS:
        return getattr(work, action)(original(args.file))
    raise InputError("Unknown original document-evidence command")
