"""MIT. Complete geography operations in the original IATI command."""
from __future__ import annotations

from pathlib import Path

from iati_workspace import InputError, MAX_METADATA, load_json

def read_request(path):
    with Path(path).open("rb") as stream:
        body = stream.read(MAX_METADATA + 1)
    if len(body) > MAX_METADATA:
        raise InputError("The complete geography JSON request exceeds 64 MiB")
    value = load_json(body)
    if not isinstance(value, dict):
        raise InputError("Select a complete geography action object")
    return value

def register(sub):
    sub.add_parser("geography-state", help="List saved geography reviews and the source contract")
    for name in ("geography-save", "geography-rows", "geography-points", "geography-compare"):
        item = sub.add_parser(name)
        item.add_argument("--file", required=True, help="Complete original JSON request")
    for name in ("geography-review", "geography-report", "geography-history"):
        item = sub.add_parser(name)
        item.add_argument("--id", required=True)
        item.add_argument("--revision", type=int)
    item = sub.add_parser("geography-request")
    item.add_argument("--request-id", required=True)
    item = sub.add_parser("geography-comparison")
    item.add_argument("--id", required=True)
    item = sub.add_parser("geography-changes")
    item.add_argument("--id", required=True)
    item.add_argument("--native", required=True)
    item.add_argument("--offset", type=int, default=0)
    item.add_argument("--limit", type=int, default=50)
    item = sub.add_parser("geography-export")
    item.add_argument("--id", required=True)
    item.add_argument("--revision", type=int)
    item.add_argument("--format", choices=("packet", "geojson", "csv", "json", "html"), default="packet")
    item.add_argument("--out")
    item = sub.add_parser("geography-receive")
    item.add_argument("--file", required=True, help="Complete original geography ZIP")
    item = sub.add_parser("geography-download")
    item.add_argument("--id", required=True, help="Completed export artifact ID")

def command(ws, args):
    work, name = ws.geography, args.command
    if name == "geography-state":
        return work.state()
    if name == "geography-save":
        return work.save(read_request(args.file))
    if name in {"geography-rows", "geography-points"}:
        return work.rows(read_request(args.file), points=name == "geography-points")
    if name == "geography-compare":
        return work.compare(read_request(args.file))
    if name == "geography-review":
        return work.review(args.id, args.revision)
    if name == "geography-report":
        return work.report(args.id, args.revision)
    if name == "geography-history":
        return work.history(args.id, args.revision)
    if name == "geography-request":
        return work.request(args.request_id)
    if name == "geography-comparison":
        return work.comparison(args.id)
    if name == "geography-changes":
        return work.changes(args.id, args.native, args.offset, args.limit)
    if name == "geography-export":
        value = {"id": args.id, "format": args.format}
        if args.revision is not None:
            value["revision"] = args.revision
        if args.out is not None:
            value["output"] = args.out
        return work.export(value)
    if name == "geography-receive":
        return work.receive({"path": args.file})
    if name == "geography-download":
        return work.download(args.id)
    raise InputError("Unknown geography command")
