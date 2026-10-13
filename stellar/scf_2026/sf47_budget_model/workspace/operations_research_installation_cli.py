"""Complete Research source commands for the original Source Desk terminal."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import stat
from operations_installation_research import ResearchIntake, LIMITS, MAX_ARCHIVE, SHA, need, _stream_file, _keep_stream
import operations_flowable_sources as files

def _input(path, maximum, expected_sha256):
    need(isinstance(expected_sha256, str) and SHA.fullmatch(expected_sha256), "Retain the complete original input SHA256.")
    path = Path(path).expanduser().absolute()
    need(path.resolve() == path, "Select the original regular input without symbolic links.")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= maximum, "Select the complete bounded original input.", status=413)
        h, size = hashlib.sha256(), 0
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            size += len(block)
            h.update(block)
        named = os.lstat(path)
        need(size == before.st_size and h.hexdigest() == expected_sha256 and
             files._identity(before) == files._identity(os.fstat(fd)) and
             (before.st_dev, before.st_ino) == (named.st_dev, named.st_ino),
             "The selected complete input differs from its declared original.", "RESEARCH_INSTALLATION_CHANGED", 409)
        os.lseek(fd, 0, os.SEEK_SET)
        return fd, before, {"bytes": size, "sha256": h.hexdigest()}
    except BaseException:
        os.close(fd)
        raise

def _copy(value, destination, maximum):
    target = Path(destination).expanduser().absolute()
    files._directory(target.parent)
    fd, _, descriptor = _stream_file(Path(value["path"]), maximum, value["file"])
    try:
        with os.fdopen(os.dup(fd), "rb") as stream:
            _keep_stream(target, stream, descriptor["bytes"], descriptor["sha256"])
    finally:
        os.close(fd)
    return {"path": str(target), "filename": target.name, **descriptor}

def execute_research(desk, args, object_file):
    intake = ResearchIntake(desk.ops)
    action = args.command.removeprefix("research-")
    case, draft = args.case, getattr(args, "draft", None)
    if action == "import":
        fd, before, descriptor = _input(args.file, LIMITS[args.kind], args.expected_sha256)
        try:
            with os.fdopen(os.dup(fd), "rb") as stream:
                result = intake.upload(case, draft, stream, request_id=args.request_id, actor=args.actor,
                    kind=args.kind, name=args.filename or args.file.name, size=descriptor["bytes"],
                    sha256=descriptor["sha256"], source_url=args.source_url, observed_at=args.observed_at)
            need(files._identity(before) == files._identity(os.fstat(fd)),
                 "The original selected upload changed; retain its already recorded receipt and inspect the original input.")
            return result, None
        finally:
            os.close(fd)
    if action in ("request", "resume"):
        return getattr(intake, action)(case, draft, args.request_id, args.actor), None
    if action in ("inspect", "template"):
        return getattr(intake, action)(case, draft, object_file(args.request)), None
    if action == "file-describe":
        return intake.file_descriptor(case, draft, args.file_id, args.expected_sha256)["file"], None
    if action == "file":
        value = intake.file_descriptor(case, draft, args.file_id, args.expected_sha256)
        return _copy(value, args.destination, LIMITS[value["file"]["kind"]]), None
    if action == "export":
        value = intake.export_installation(case, draft, args.preparation, args.installation_id,
            args.installation_revision, files._directory(intake._root(case, draft) / "exports"))
        destination = Path(args.directory).expanduser().absolute()
        destination.mkdir(mode=0o700, parents=True, exist_ok=True)
        files._directory(destination)
        return {**value, "delivery": _copy(value, destination / value["file"]["name"], MAX_ARCHIVE)}, None
    if action == "archive":
        value = intake.retained_archive(case, draft, args.preparation, args.installation_id,
                                        args.installation_revision, args.expected_sha256)
        return _copy(value, args.destination, MAX_ARCHIVE), None
    if action == "receive":
        # The original incoming archive is copied create-only into the selected private receiving directory.
        # No compressed bytes pass through an agent JSON envelope or the ordinary 8 MiB upload route.
        receiving = Path(args.directory).expanduser().absolute()
        receiving.mkdir(mode=0o700, parents=True, exist_ok=True)
        files._directory(receiving)
        original = receiving / "Research_Installation_Input.zip"
        fd, before, descriptor = _input(args.file, MAX_ARCHIVE, args.expected_sha256)
        try:
            with os.fdopen(os.dup(fd), "rb") as stream:
                _keep_stream(original, stream, descriptor["bytes"], descriptor["sha256"])
            need(files._identity(before) == files._identity(os.fstat(fd)), "The complete original archive changed.")
        finally:
            os.close(fd)
        return ResearchIntake.receive_installation(desk.ops, original, args.expected_sha256,
            request_id=args.request_id, actor=args.actor, name=args.name, directory=receiving), None
    raise ValueError("Choose a declared complete Research source operation.")

def register_research_commands(sub):
    for action in ("import", "request", "resume", "inspect", "template", "file-describe", "file", "export", "archive", "receive"):
        command = sub.add_parser("research-" + action)
        if action != "receive":
            command.add_argument("--draft", required=True)
        if action in ("import", "request", "resume", "receive"):
            command.add_argument("--request-id", required=True, help="Exact original UUID; retain it before execution")
            command.add_argument("--actor", required=True, help="Actual original operating identity")
        if action in ("import", "receive"):
            command.add_argument("--file", required=True, type=Path)
        if action in ("import", "file", "file-describe", "archive", "receive"):
            command.add_argument("--expected-sha256", required=True)
        if action == "import":
            command.add_argument("--kind", required=True, choices=tuple(LIMITS))
            command.add_argument("--filename")
            command.add_argument("--source-url", required=True)
            command.add_argument("--observed-at", required=True)
        if action in ("inspect", "template"):
            command.add_argument("--request", required=True, type=Path)
        if action in ("file", "file-describe"):
            command.add_argument("--file-id", required=True)
        if action in ("file", "archive"):
            command.add_argument("--destination", required=True, type=Path,
                                 help="Complete create-only original output file; its parent must exist")
        if action in ("export", "archive"):
            command.add_argument("--preparation", required=True)
            command.add_argument("--installation-id", required=True)
            command.add_argument("--installation-revision", required=True, type=int)
        if action in ("export", "receive"):
            command.add_argument("--directory", required=True, type=Path)
        if action == "receive":
            command.add_argument("--name", required=True, help="Explicit name for the independently received Operations case")
