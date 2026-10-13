"""Installed remote Research programme terminal over the original Node owner.

Global --directory selects the Python journal. Child --configuration selects the
original private two-host declaration. All replies remain complete verified
files; printing a reply is an explicit, bounded operation.
"""
from __future__ import annotations

import signal
import threading

from .errors import StateError
from .research_remote_programmes import (
    REMOTE_PROGRAMME_COMMANDS, REMOTE_REPLY_LIMIT, ResearchRemoteProgrammes,
)

REMOTE_PROGRAMME_CLI_COMMANDS = tuple(
    "quotes-remote-" + name.replace("_", "-") for name in REMOTE_PROGRAMME_COMMANDS
) + (
    "quotes-remote-saved", "quotes-remote-recover", "quotes-remote-replay",
    "quotes-remote-calls", "quotes-remote-configuration",
)


def _positive(value):
    number = int(value)
    if number < 1 or number > REMOTE_REPLY_LIMIT:
        raise ValueError("Choose a positive byte limit within REMOTE_REPLY_LIMIT.")
    return number


def _parser(commands, name, help_text, *, result=True):
    parser = commands.add_parser(name, help=help_text, description=help_text)
    parser.add_argument("--configuration",
                        help="Original private operator JSON; retained once by this Python journal.")
    if result:
        parser.add_argument("--json", action="store_true",
                            help="Also materialize the complete native JSON reply within --json-limit.")
        parser.add_argument("--json-limit", type=_positive, default=16 * 1024 * 1024,
                            help="Maximum complete reply bytes to print with --json (default 16 MiB).")
    return parser


def add_remote_programme_commands(commands):
    """Register the complete remote family on the original research_cli parser."""
    for native in REMOTE_PROGRAMME_COMMANDS:
        command = "quotes-remote-" + native.replace("_", "-")
        parser = _parser(commands, command,
            "Run original remote " + native + "; retain exact arguments, attempt and complete reply.")
        parser.add_argument("--workspace", required=True,
                            help="Declared alias from the original operator configuration.")
        parser.add_argument("--input",
                            help="Complete original command-arguments JSON; omitted means an empty object.")
        parser.add_argument("--input-sha256", help="SHA256 of the complete raw --input bytes.")
        parser.add_argument("--call-id", required=True,
                            help="Stable Python call ID; native job/operation IDs remain inside the input.")
        parser.add_argument("--resume", action="store_true",
                            help="Continue this same retained Python call after an incomplete attempt.")
        if native == "export":
            parser.add_argument("--file", required=True,
                                help="Exclusive absolute destination for the complete original member/archive.")

    for native, help_text in (
        ("saved", "Verify a completed call and complete exported bytes without Node or either host."),
        ("recover", "Retry the same retained call/configuration and original native identities.")):
        parser = _parser(commands, "quotes-remote-" + native, help_text)
        parser.add_argument("--call-id", required=True)

    parser = _parser(commands, "quotes-remote-replay",
                     "Make a distinct Python attempt of the exact retained underlying request.")
    parser.add_argument("--source-call-id", required=True)
    parser.add_argument("--call-id", required=True)
    parser.add_argument("--resume", action="store_true")

    parser = _parser(commands, "quotes-remote-calls",
                     "List original retained Python call identities without contacting either host.", result=False)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=100)

    _parser(commands, "quotes-remote-configuration",
            "Read the complete retained original operator declaration without opening a host.", result=False)


def run_remote_programme_command(arguments):
    """Return terminal output after this invocation's original owner is closed.

    The parent CLI owns stdout/stderr. Default output is the complete receipt and
    attempt, including the path/SHA/size of the whole native reply. A later
    output failure can be recovered through quotes-remote-saved.
    """
    if arguments.command not in REMOTE_PROGRAMME_CLI_COMMANDS:
        raise StateError("RESEARCH_REMOTE_COMMAND_INVALID")
    command = arguments.command[len("quotes-remote-"):].replace("-", "_")
    if getattr(arguments, "input_sha256", None) and not getattr(arguments, "input", None):
        raise StateError("RESEARCH_REMOTE_INPUT_FILE_REQUIRED")
    if command == "replay" and arguments.call_id == arguments.source_call_id:
        raise StateError("RESEARCH_REMOTE_DISTINCT_REPLAY_REQUIRED")

    event, previous = threading.Event(), {}
    if threading.current_thread() is threading.main_thread():
        for kind in (signal.SIGINT, signal.SIGTERM):
            previous[kind] = signal.signal(kind, lambda *_: event.set())
    try:
        with ResearchRemoteProgrammes(
            directory=arguments.directory, checkout=arguments.checkout,
            configuration_file=arguments.configuration, node=arguments.node,
            timeout=arguments.timeout,
        ) as client:
            if command == "configuration":
                result = client.configuration()
            elif command == "calls":
                result = client.calls(offset=arguments.offset, limit=arguments.limit)
            else:
                if command == "saved":
                    value = client.saved(arguments.call_id)
                elif command == "recover":
                    value = client.recover(arguments.call_id, cancel_event=event)
                elif command == "replay":
                    value = client.replay(arguments.source_call_id, call_id=arguments.call_id,
                                          resume=arguments.resume, cancel_event=event)
                else:
                    value = client.invoke(
                        arguments.workspace, command, input_file=arguments.input,
                        expected_input_sha256=arguments.input_sha256,
                        file=getattr(arguments, "file", None), call_id=arguments.call_id,
                        resume=arguments.resume, cancel_event=event,
                    )
                # Do not replace the saved record with a compact success label.
                # In particular, retain any completed reply's later native
                # stdout/cleanup/timeout attempt information.
                result = {"record": value.record}
                if arguments.json:
                    result["reply"] = value.json(limit=arguments.json_limit)
        if event.is_set():
            result = {**result, "cancelRequested": True}
        return result
    finally:
        for kind, handler in previous.items():
            signal.signal(kind, handler)


def main(argv=None):
    from .research_cli import main as research_main
    return research_main(argv)


if __name__ == "__main__":
    raise SystemExit(main())
