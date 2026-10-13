"""Installed terminal operations for complete Research quotation programmes.

The global --directory belongs to the existing Python Research call journal.
Programme, package and receiving directories are explicit original native roots.
"""
from __future__ import annotations

from pathlib import Path
import signal
import threading

from .errors import StateError
from .research_workspace import ResearchWorkspace
from .research_customer_updates import _retained_json
from .research_quotes import COMMANDS, CASE_ACTIONS, PRICING_ACTIONS, _FILE_LIMIT
from .research_quotes_cli import _copy_file
from .research_quote_programmes import ResearchQuoteProgrammeHandover

QUOTE_PROGRAMME_COMMANDS = (
    "quotes-programme-create", "quotes-programme-state", "quotes-programme-step",
    "quotes-programme-submit", "quotes-programme-apply", "quotes-programme-replay",
    "quotes-programme-export", "quotes-programme-inspect", "quotes-programme-copy",
    "quotes-programme-receive-prepare", "quotes-programme-receive",
    "quotes-programme-receiving", "quotes-programme-saved", "quotes-programme-recover",
    "quotes-programme-open", "quotes-programme-file", "quotes-programme-case-record",
    "quotes-programme-operation-file", "quotes-programme-handover-step-input",
    "quotes-programme-step-input",
)
_OFFLINE = {
    "quotes-programme-open", "quotes-programme-file", "quotes-programme-case-record",
    "quotes-programme-operation-file", "quotes-programme-handover-step-input",
}


def _parser(commands, name, help_text):
    parser = commands.add_parser(name, help=help_text, description=help_text)
    parser.add_argument("--output", help="Save the complete reply with the original exclusive JSON publisher.")
    if name not in _OFFLINE:
        parser.add_argument("--expected-workspace-id",
                            help="Pin the original Research workspace on its first local selection.")
    return parser


def _input(parser):
    parser.add_argument("--input", required=True,
                        help="Complete original JSON file; its exact raw bytes are retained before dispatch.")
    parser.add_argument("--input-sha256", help="Expected SHA256 of the complete raw input file.")


def _write(parser):
    parser.add_argument("--call-id", required=True,
                        help="Stable original Python call ID. Native request IDs remain in the selected input.")
    parser.add_argument("--resume", action="store_true",
                        help="Continue this same saved call after an interrupted attempt.")


def _programme(parser):
    parser.add_argument("--programme-directory", required=True,
                        help="Original native programme directory, separate from the Python call journal.")


def _package(parser, *, required_hash=False):
    parser.add_argument("--package-directory", required=True,
                        help="Complete original handover directory containing quotation-programme.json.")
    parser.add_argument("--manifest-sha256", required=required_hash,
                        help="SHA256 of the complete original quotation-programme.json bytes.")


def add_quote_programme_commands(commands):
    parser = _parser(commands, "quotes-programme-create",
                     "Retain the original programme input and selected case/project identity.")
    _programme(parser); _input(parser); _write(parser)

    parser = _parser(commands, "quotes-programme-state",
                     "Read the original programme, all retained steps and current snapshot.")
    _programme(parser)

    for command in ("quotes-programme-step", "quotes-programme-step-input"):
        parser = _parser(commands, command,
                         "Open an original retained step or copy its complete raw input file.")
        _programme(parser)
        parser.add_argument("--step-id", required=True)
        if command.endswith("-input"):
            parser.add_argument("--file", required=True, help="Exclusive destination for the complete input.")

    parser = _parser(commands, "quotes-programme-submit",
                     "Submit one original native quotation command as a retained programme step.")
    _programme(parser); _input(parser); _write(parser)
    parser.add_argument("--step-id", required=True)
    parser.add_argument("--native-command", choices=COMMANDS, required=True)
    parser.add_argument("--action", help="Required original native-case or pricing action.")
    parser.add_argument("--profile", help="Required original pricing profile for a pricing step.")

    for command in ("quotes-programme-apply", "quotes-programme-replay"):
        parser = _parser(commands, command,
                         "Apply a displayed original review or replay an exact request in a distinct step.")
        _programme(parser); _write(parser)
        parser.add_argument("--source-step-id", required=True)
        parser.add_argument("--step-id", required=True)
        if command.endswith("-apply"):
            parser.add_argument("--review-sha256", required=True,
                                help="The exact review SHA displayed by the selected source step.")

    parser = _parser(commands, "quotes-programme-export",
                     "Capture the complete selected programme, native case and customer delivery.")
    parser.add_argument("--handover-directory", required=True,
                        help="Original export operation directory; the complete package is returned separately.")
    _input(parser); _write(parser)

    parser = _parser(commands, "quotes-programme-inspect",
                     "Run the original native semantic inspector over a complete handover.")
    _package(parser)

    parser = _parser(commands, "quotes-programme-copy",
                     "Copy/reopen one complete original handover using the native immutable publisher.")
    parser.add_argument("--target", required=True)
    parser.add_argument("--source-directory", help="Original complete package; omit on a retained exact reopen.")
    parser.add_argument("--manifest-sha256")
    _write(parser)

    parser = _parser(commands, "quotes-programme-receive-prepare",
                     "Retain complete receiving input and review against the selected destination.")
    parser.add_argument("--receiving-directory", required=True)
    parser.add_argument("--source-directory", help="Original package; the receiver retains its own complete copy.")
    parser.add_argument("--manifest-sha256")
    _input(parser); _write(parser)

    parser = _parser(commands, "quotes-programme-receive",
                     "Apply the exact displayed destination review through the original case and dossier writers.")
    parser.add_argument("--receiving-directory", required=True)
    parser.add_argument("--review-sha256", required=True)
    _write(parser)

    parser = _parser(commands, "quotes-programme-receiving",
                     "Read/recover the original receiving state and its complete retained package.")
    parser.add_argument("--receiving-directory", required=True)

    for command, description in (
        ("quotes-programme-saved", "Verify the first completed Python call and complete retained files without a host."),
        ("quotes-programme-recover", "Recover the same original call, input and native request.")):
        parser = _parser(commands, command, description)
        parser.add_argument("call_id")

    for command in _OFFLINE:
        parser = _parser(commands, command,
                         "Verify the complete handover offline and reopen its exact original files.")
        _package(parser, required_hash=True)
        if command != "quotes-programme-open":
            parser.add_argument("--file", required=True,
                                help="Exclusive destination; an existing exact file can be reopened.")
        if command == "quotes-programme-file":
            parser.add_argument("--name", required=True, help="Exact relative name from the full native roster.")
        elif command == "quotes-programme-operation-file":
            parser.add_argument("--id", required=True, help="Original native quotation operation UUID.")
        elif command == "quotes-programme-handover-step-input":
            parser.add_argument("--step-id", required=True)


def _submission(arguments):
    command = arguments.native_command
    if command == "native-case":
        if arguments.action not in CASE_ACTIONS or arguments.profile is not None:
            raise StateError("RESEARCH_QUOTE_CASE_ACTION_REQUIRED")
    elif command == "pricing":
        if arguments.action not in PRICING_ACTIONS or not arguments.profile:
            raise StateError("RESEARCH_QUOTE_PRICING_ACTION_REQUIRED")
    elif arguments.action is not None or arguments.profile is not None:
        raise StateError("RESEARCH_QUOTE_PROGRAMME_SELECTION_INVALID")


def _offline(arguments):
    package = ResearchQuoteProgrammeHandover.reopen(
        arguments.package_directory, expected_manifest_sha256=arguments.manifest_sha256)
    command = arguments.command
    if command == "quotes-programme-open":
        return {"schema": "sf88-research-quotation-handover-offline/v1",
                "manifest": package.manifest, **package.verify()}
    if command == "quotes-programme-case-record":
        file = package.case_record
        name = package.selection["caseRecord"]["name"]
    elif command == "quotes-programme-operation-file":
        file = package.operation_export(arguments.id)
        name = next(item["name"] for item in package.selection["operations"] if item["id"] == arguments.id)
    elif command == "quotes-programme-handover-step-input":
        file = package.step_input(arguments.step_id)
        name = "requests/" + arguments.step_id + ".json"
    else:
        name = arguments.name
        file = package.file(name)
    return {"schema": "sf88-research-quotation-handover-file/v1",
            "manifestSha256": arguments.manifest_sha256, "name": name,
            **_copy_file(file, arguments.file)}


def _native(arguments, client, event):
    command = arguments.command
    options = {"cancel_event": event}
    if command in {
        "quotes-programme-create", "quotes-programme-submit", "quotes-programme-apply",
        "quotes-programme-replay", "quotes-programme-export", "quotes-programme-copy",
        "quotes-programme-receive-prepare", "quotes-programme-receive",
    }:
        options.update(call_id=arguments.call_id, resume=arguments.resume)
    if command == "quotes-programme-create":
        return client.create(arguments.programme_directory, input_file=arguments.input,
                             expected_input_sha256=arguments.input_sha256, **options)
    if command == "quotes-programme-state":
        return client.state(arguments.programme_directory, **options)
    if command in {"quotes-programme-step", "quotes-programme-step-input"}:
        result = client.step(arguments.programme_directory, arguments.step_id, **options)
        if command == "quotes-programme-step":
            return result
        return {"schema": "sf88-research-quotation-programme-step-file/v1",
                "stepId": arguments.step_id, "selectionSha256": result["record"]["selectionSha256"],
                **_copy_file(client.step_input(result), arguments.file)}
    if command == "quotes-programme-submit":
        return client.submit(arguments.programme_directory, arguments.step_id,
                             arguments.native_command, input_file=arguments.input,
                             expected_input_sha256=arguments.input_sha256,
                             action=arguments.action, profile=arguments.profile, **options)
    if command == "quotes-programme-apply":
        return client.apply(arguments.programme_directory, arguments.source_step_id,
                            arguments.step_id, review_sha256=arguments.review_sha256, **options)
    if command == "quotes-programme-replay":
        return client.replay(arguments.programme_directory, arguments.source_step_id,
                             arguments.step_id, **options)
    if command == "quotes-programme-export":
        return client.export(arguments.handover_directory, input_file=arguments.input,
                             expected_input_sha256=arguments.input_sha256, **options)
    if command == "quotes-programme-inspect":
        return client.inspect(arguments.package_directory,
                              manifest_sha256=arguments.manifest_sha256, **options)
    if command == "quotes-programme-copy":
        return client.copy(arguments.target, source_directory=arguments.source_directory,
                           manifest_sha256=arguments.manifest_sha256, **options)
    if command == "quotes-programme-receive-prepare":
        return client.prepare_receiving(arguments.receiving_directory,
            input_file=arguments.input, expected_input_sha256=arguments.input_sha256,
            source_directory=arguments.source_directory,
            manifest_sha256=arguments.manifest_sha256, **options)
    if command == "quotes-programme-receive":
        return client.receive(arguments.receiving_directory,
                              review_sha256=arguments.review_sha256, **options)
    if command == "quotes-programme-receiving":
        return client.receiving(arguments.receiving_directory, **options)
    if command == "quotes-programme-saved":
        return client.saved(arguments.call_id)
    if command == "quotes-programme-recover":
        return client.recover(arguments.call_id, **options)
    raise StateError("RESEARCH_QUOTE_PROGRAMME_COMMAND_INVALID")


def run_quote_programme_command(arguments):
    command = arguments.command
    if command not in QUOTE_PROGRAMME_COMMANDS:
        raise StateError("RESEARCH_QUOTE_PROGRAMME_COMMAND_INVALID")
    if command == "quotes-programme-submit":
        _submission(arguments)
    if command in {"quotes-programme-apply", "quotes-programme-replay"}:
        if arguments.step_id == arguments.source_step_id:
            raise StateError("RESEARCH_QUOTE_PROGRAMME_DISTINCT_STEP_REQUIRED")
    if command not in _OFFLINE and not arguments.checkout:
        raise ValueError("--checkout selects the original installed Node runtime")

    event, previous = threading.Event(), {}
    if threading.current_thread() is threading.main_thread():
        for kind in (signal.SIGINT, signal.SIGTERM):
            previous[kind] = signal.signal(kind, lambda *_: event.set())
    try:
        if command in _OFFLINE:
            result = _offline(arguments)
        else:
            with ResearchWorkspace(
                checkout=arguments.checkout, node=arguments.node,
                connection_file=arguments.connection, directory=arguments.directory,
                timeout=arguments.timeout, request_timeout_ms=arguments.request_timeout_ms,
                expected_workspace_id=arguments.expected_workspace_id,
            ) as workspace:
                result = _native(arguments, workspace.quote_programmes(), event)
        # The complete native reply already belongs to its original call. Keep
        # this optional operator copy inside the same signal/output lifetime.
        if arguments.output:
            path = Path(arguments.output).expanduser().absolute()
            _retained_json(path, result, limit=_FILE_LIMIT)
            return {"state": "SAVED", "file": str(path), "command": command}
        return result
    finally:
        for kind, handler in previous.items():
            signal.signal(kind, handler)


def main(argv=None):
    from .research_cli import main as research_main
    return research_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
