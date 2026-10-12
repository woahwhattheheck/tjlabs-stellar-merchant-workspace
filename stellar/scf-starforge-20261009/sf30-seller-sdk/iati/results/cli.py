"""MIT. Additive results commands for the original IATI CLI."""
from pathlib import Path

from iati_source import InputError
from workspace import load_json
from . import get_results
from .workspace import MAX_BODY


def register(sub):
    sub.add_parser("results-list")
    source = sub.add_parser("results-source")
    source.add_argument("--source", required=True)
    rows = sub.add_parser("results-indicators")
    rows.add_argument("--projection", required=True)
    rows.add_argument("--offset", type=int, default=0)
    rows.add_argument("--limit", type=int, default=50)
    rows.add_argument("--search", default="")
    rows.add_argument("--measure", default="")
    indicator = sub.add_parser("results-indicator")
    indicator.add_argument("--projection", required=True)
    indicator.add_argument("--key", required=True)
    for name in ("preview", "save", "compare", "adopt", "cancel"):
        parser = sub.add_parser("results-" + name)
        parser.add_argument("--file", required=True)
    for name in ("project", "report", "export", "report-export"):
        parser = sub.add_parser("results-" + name)
        parser.add_argument("--id", required=True)
        parser.add_argument("--revision", type=int)
        if "export" in name:
            parser.add_argument("--out", required=True)
    for name in ("history", "comparisons"):
        parser = sub.add_parser("results-" + name)
        parser.add_argument("--id", required=True)
    receive = sub.add_parser("results-receive")
    receive.add_argument("--file", required=True)
    receive.add_argument("--sha256")
    receive.add_argument("--bytes", type=int)
    operation = sub.add_parser("results-operation")
    operation.add_argument("--request-id", required=True)


def original_json(filename):
    with Path(filename).open("rb") as stream:
        data = stream.read(MAX_BODY + 1)
    if len(data) > MAX_BODY:
        raise InputError("The complete results selection exceeds 64 MiB")
    return load_json(data)


def command(workspace, args):
    api = get_results(workspace)
    action = args.command.removeprefix("results-")
    if action == "list":
        return api.inventory()
    if action == "source":
        return api.project_source(args.source)
    if action == "indicators":
        return api.browse(args.projection, offset=args.offset, limit=args.limit, search=args.search, measure=args.measure)
    if action == "indicator":
        return api.indicator(args.projection, args.key)
    if action in ("preview", "save", "compare", "adopt", "cancel"):
        return getattr(api, action)(original_json(args.file))
    if action == "project":
        return api.project(args.id, args.revision)
    if action == "report":
        return api.report(args.id, args.revision)
    if action in ("history", "comparisons"):
        return getattr(api, action)(args.id)
    if action in ("export", "report-export"):
        return api.export(args.id, Path(args.out).expanduser().absolute(), args.revision, report_only=action == "report-export")
    if action == "receive":
        return api.receive(Path(args.file), expected_sha256=args.sha256, expected_bytes=args.bytes)
    if action == "operation":
        return api.operation(args.request_id)
    raise InputError("Unknown original results command")
