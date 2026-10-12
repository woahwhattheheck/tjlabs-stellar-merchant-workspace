"""MIT. Complete organisation planning through the original IATI command."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import shutil
import tempfile
from iati_source import InputError
from workspace import file_digest, load_json, sync_dir

MAX_METADATA = 64 * 1024 * 1024
MAX_PACKET = 4 * 1024 * 1024 * 1024
ACTIONS = ("save", "review", "release", "compare")


def register(sub):
    sub.add_parser("organisation-status")
    item = sub.add_parser("organisation-profile")
    item.add_argument("--source", required=True)
    item = sub.add_parser("organisation-request")
    item.add_argument("--request-id", required=True)
    for name in ("plan", "history", "export", "file"):
        item = sub.add_parser("organisation-" + name)
        item.add_argument("--id", required=True)
        if name != "history":
            item.add_argument("--revision", type=int)
        if name in {"export", "file"}:
            item.add_argument("--out", required=True)
        if name == "file":
            item.add_argument("--kind", required=True,
                choices=["source", "candidate", "report", "budgets", "documents"])
    for name in ("rows", "detail"):
        item = sub.add_parser("organisation-" + name)
        chosen = item.add_mutually_exclusive_group(required=True)
        chosen.add_argument("--source")
        chosen.add_argument("--id")
        item.add_argument("--revision", type=int)
        item.add_argument("--view", choices=["source", "candidate"])
        item.add_argument("--organisation-key")
        item.add_argument("--expected-snapshot")
        if name == "rows":
            item.add_argument("--section", required=True, choices=["budgets", "documents", "issues"])
            item.add_argument("--offset", type=int, default=0)
            item.add_argument("--limit", type=int, default=50)
        else:
            item.add_argument("--row-id", required=True)
            item.add_argument("--target-id")
    for name in (*ACTIONS, "receive"):
        item = sub.add_parser("organisation-" + name)
        item.add_argument("--file", required=True)


def original(path):
    with Path(path).open("rb") as source:
        raw = source.read(MAX_METADATA + 1)
    if len(raw) > MAX_METADATA:
        raise InputError("The complete organisation request exceeds 64 MiB")
    value = load_json(raw)
    if not isinstance(value, dict):
        raise InputError("Use a complete organisation action object")
    return value


def output_file(descriptor, destination):
    """Copy the exact selected full file to a new operator-selected destination."""
    source = Path(descriptor["path"])
    target = Path(destination).expanduser().absolute()
    if target.parent.resolve(strict=True) != target.parent or target.is_symlink():
        raise InputError("Choose an original output directory without path aliases")
    expected = descriptor["sha256"]
    if file_digest(source, MAX_PACKET) != expected or source.stat().st_size != descriptor["bytes"]:
        raise InputError("The selected complete organisation file differs")
    if target.exists():
        if file_digest(target, MAX_PACKET) != expected or target.stat().st_size != descriptor["bytes"]:
            raise InputError("The selected output already contains different complete work")
        return {**{k: v for k, v in descriptor.items() if k != "path"}, "path": str(target), "reused": True}
    descriptor_fd, temporary = tempfile.mkstemp(prefix=".iati-organisation-", dir=target.parent)
    temporary = Path(temporary)
    reused = False
    try:
        with source.open("rb") as incoming, os.fdopen(descriptor_fd, "wb") as outgoing:
            checksum = hashlib.sha256()
            count = 0
            for block in iter(lambda: incoming.read(65536), b""):
                count += len(block)
                if count > descriptor["bytes"]:
                    raise InputError("The selected organisation file changed while receiving")
                checksum.update(block)
                outgoing.write(block)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        if count != descriptor["bytes"] or checksum.hexdigest() != expected:
            raise InputError("The complete organisation output differs from its selected identity")
        try:
            os.link(temporary, target, follow_symlinks=False)
        except FileExistsError:
            if file_digest(target, MAX_PACKET) != expected or target.stat().st_size != descriptor["bytes"]:
                raise InputError("The selected output already contains different complete work")
            reused = True
        sync_dir(target.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return {**{k: v for k, v in descriptor.items() if k != "path"}, "path": str(target), "reused": reused}


def command(workspace, args):
    action = args.command.removeprefix("organisation-")
    work = workspace.organisation
    if action == "status":
        return work.status()
    if action == "profile":
        return work.profile(args.source)
    if action == "request":
        return work.request(args.request_id)
    if action == "plan":
        return work.plan(args.id, args.revision)
    if action == "history":
        return {"history": work.history(args.id)}
    if action in {"rows", "detail"}:
        if args.source and args.revision is not None or args.id and args.revision is None:
            raise InputError("Select one original source or an exact saved plan revision")
        value = {"sourceId": args.source} if args.source else {"id": args.id, "revision": args.revision}
        for name, key in (("view", "view"), ("organisation_key", "organisationKey"), ("expected_snapshot", "expectedSnapshot")):
            selected = getattr(args, name)
            if selected is not None:
                value[key] = selected
        if action == "rows":
            value.update(section=args.section, offset=args.offset, limit=args.limit)
            return work.rows(value)
        value["rowId"] = args.row_id
        if args.target_id is not None:
            value["targetId"] = args.target_id
        return work.detail(value)
    if action in {"export", "file"}:
        value = {"id": args.id}
        if args.revision is not None:
            value["revision"] = args.revision
        if action == "export":
            value["output"] = Path(args.out).expanduser().absolute()
            return work.export(value)
        value["kind"] = args.kind
        return output_file(work.file(value), args.out)
    if action == "receive":
        return work.receive({"path": Path(args.file).expanduser().absolute()})
    if action in ACTIONS:
        return getattr(work, action)(original(args.file))
    raise InputError("Unknown organisation planning command")
