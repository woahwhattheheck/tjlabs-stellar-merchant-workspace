"""Study Flow commands on the existing stellar-forge-research entry point."""
from __future__ import annotations

from pathlib import Path
from .research_study_flow import FLOW_SECTIONS, FLOW_FORMATS, FLOW_CSV_SECTIONS
from .research_workspace import ResearchWorkspace
from .storage import parse, read

_LIMIT = 16 * 1024 * 1024


def _dossier(command):
    command.add_argument("--dossier", required=True)


def _selection(command, *, required_revision=False):
    _dossier(command)
    command.add_argument("--revision", type=int, required=required_revision)
    command.add_argument("--flow-id")
    command.add_argument("--edition-id")


def _paging(command):
    command.add_argument("--offset", type=int, default=0)
    command.add_argument("--limit", type=int, default=30)


def add_study_flow_commands(commands):
    view = commands.add_parser("flow-view", help="Page saved flows, editions, source rows and operations.")
    _selection(view)
    _paging(view)
    view.add_argument("--section", choices=FLOW_SECTIONS, default="overview")

    sources = commands.add_parser("flow-sources", help="Page the dossier's original retained source occurrences.")
    _dossier(sources)
    _paging(sources)
    sources.add_argument("--revision", type=int)
    sources.add_argument("--question-id")
    sources.add_argument("--review-id")
    sources.add_argument("--work-set-id")

    report = commands.add_parser("flow-report", help="Read the complete selected native report and SVG.")
    _selection(report)

    preview = commands.add_parser("flow-preview", help="Preview a complete definition without saving history.")
    _dossier(preview)
    preview.add_argument("--definition", required=True, help="Original complete definition JSON file.")
    preview.add_argument("--expected-revision", type=int, required=True)
    preview.add_argument("--flow-id")
    preview.add_argument("--source-mode", choices=("current", "retained"), default="current")
    preview.add_argument("--basis-edition-id")

    counts = commands.add_parser("flow-import-counts", help="Parse an original UTF-8 count CSV without changing its bytes.")
    _dossier(counts)
    counts.add_argument("--expected-revision", type=int, required=True)
    counts.add_argument("--reason", required=True)
    counts.add_argument("--reference")
    counts.add_argument("file")

    review = commands.add_parser("flow-review", help="Retain and submit an exact save/review/withdraw request.")
    _dossier(review)
    review.add_argument("--request", required=True, help="Original requestId/expectedRevision/actor/action/data JSON.")
    review.add_argument("--resume", action="store_true", help="Resume this unchanged saved request after an interrupted reply.")

    for name in ("flow-saved-request", "flow-recover"):
        selected = commands.add_parser(name, help="Inspect or resume the selected saved native mutation.")
        _dossier(selected)
        selected.add_argument("--request-id", required=True)

    export = commands.add_parser("flow-export", help="Download the complete original JSON, SVG, HTML or CSV.")
    _selection(export, required_revision=True)
    export.add_argument("--format", choices=FLOW_FORMATS, default="json")
    export.add_argument("--section", choices=FLOW_CSV_SECTIONS, help="CSV section only; defaults to counts.")
    export.add_argument("--expected-sha256")
    export.add_argument("file")

    portable = commands.add_parser("flow-portable", help="Download the original full dossier and flow history.")
    _dossier(portable)
    portable.add_argument("--revision", type=int, required=True)
    portable.add_argument("--format", choices=("json", "json.gz"), default="json.gz")
    portable.add_argument("--expected-sha256")
    portable.add_argument("file")


def run_study_flow_command(arguments):
    if not arguments.checkout or not arguments.connection:
        raise ValueError("--checkout and --connection are required")
    with ResearchWorkspace(checkout=arguments.checkout, node=arguments.node,
            connection_file=arguments.connection, directory=arguments.directory,
            timeout=arguments.timeout, request_timeout_ms=arguments.request_timeout_ms) as workspace:
        flow = workspace.study_flow(arguments.dossier)
        command = arguments.command
        if command == "flow-view":
            return flow.read(revision=arguments.revision, flow_id=arguments.flow_id,
                edition_id=arguments.edition_id, section=arguments.section,
                offset=arguments.offset, limit=arguments.limit)
        if command == "flow-sources":
            return flow.sources(revision=arguments.revision, question_id=arguments.question_id,
                review_id=arguments.review_id, work_set_id=arguments.work_set_id,
                offset=arguments.offset, limit=arguments.limit)
        if command == "flow-report":
            return flow.report(revision=arguments.revision, flow_id=arguments.flow_id,
                               edition_id=arguments.edition_id)
        if command == "flow-preview":
            definition = parse(read(Path(arguments.definition), _LIMIT))
            return flow.preview(definition, expected_revision=arguments.expected_revision,
                flow_id=arguments.flow_id, source_mode=arguments.source_mode,
                basis_edition_id=arguments.basis_edition_id)
        if command == "flow-import-counts":
            return flow.import_counts_file(arguments.file,
                expected_revision=arguments.expected_revision, reason=arguments.reason,
                reference=arguments.reference)
        if command == "flow-review":
            request = parse(read(Path(arguments.request), _LIMIT))
            return flow.review(request, resume=arguments.resume)
        if command == "flow-saved-request":
            return flow.saved_request(arguments.request_id)
        if command == "flow-recover":
            return flow.recover(arguments.request_id)
        if command == "flow-export":
            return flow.export(arguments.file, revision=arguments.revision,
                flow_id=arguments.flow_id, edition_id=arguments.edition_id,
                format=arguments.format, section=arguments.section,
                expected_sha256=arguments.expected_sha256).native
        if command == "flow-portable":
            return flow.export_portable(arguments.file, revision=arguments.revision,
                format=arguments.format, expected_sha256=arguments.expected_sha256).native
        raise ValueError("Unknown Study Flow command")
