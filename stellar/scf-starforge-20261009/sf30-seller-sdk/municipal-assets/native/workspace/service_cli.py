"""Original municipal service source import, association review and full handoff."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
from .adapters import InvalidData
from .engine import Workspace


def publish(path, body):
    path = Path(path).absolute()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".service-assets-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.chmod(temporary, 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if path.is_symlink() or not path.is_file() or path.read_bytes() != body:
                raise InvalidData("Preserve the existing output; choose a distinct current export filename")
    finally:
        Path(temporary).unlink(missing_ok=True)
    return {"path": str(path), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--project", required=True)
    commands = parser.add_subparsers(dest="command", required=True)
    read = commands.add_parser("view")
    read.add_argument("--query", default="")
    read.add_argument("--page", type=int, default=0)
    read.add_argument("--page-size", type=int, default=50)
    read.add_argument("--row", type=int)
    imp = commands.add_parser("import")
    imp.add_argument("source", type=Path)
    imp.add_argument("--expected-sha256", required=True)
    mapping = commands.add_parser("mapping")
    review = commands.add_parser("review")
    review.add_argument("--row", type=int, required=True)
    review.add_argument("--binding-sha256", required=True)
    review.add_argument("--decision", choices=["linked", "unlinked", "deferred"], required=True)
    review.add_argument("--asset")
    review.add_argument("--work-order", action="append", default=[], help="exact existing order already assigned to this asset; repeat for several orders")
    review.add_argument("--note", required=True)
    for command in (imp, mapping, review):
        command.add_argument("--revision", type=int, required=True)
        command.add_argument("--actor", required=True)
        command.add_argument("--operation", required=True)
    export = commands.add_parser("export")
    export.add_argument("--output", type=Path, required=True)
    export.add_argument("--revision", type=int, required=True)
    export.add_argument("--kind", choices=["handoff", "report"], default="handoff")
    args = parser.parse_args()
    workspace = Workspace(args.directory)
    if args.command == "view":
        value = workspace.service_assets(args.project, args.query, args.page, args.page_size, args.row)
    elif args.command == "import":
        if args.source.exists():
            info = args.source.lstat()
            if not stat.S_ISREG(info.st_mode) or args.source.is_symlink() or not 0 < info.st_size <= 32 * 1024 * 1024:
                raise InvalidData("Select one complete regular original collection up to32MiB")
            body = args.source.read_bytes()
        else:
            # Recover an already committed source from the same original project;
            # the original operation/revision/filename still governs native replay.
            with workspace.connection() as db:
                row = db.execute("SELECT body FROM inputs WHERE project_id=? AND kind='requests' AND sha256=?",
                                 (args.project, args.expected_sha256)).fetchone()
            if row is None:
                raise InvalidData("The original source is absent; select its complete bytes")
            body = bytes(row["body"])
        if hashlib.sha256(body).hexdigest() != args.expected_sha256:
            raise InvalidData("The source differs from the original selected SHA256")
        value = workspace.import_data(args.project, args.revision, args.actor, args.operation,
                                      "requests", args.source.name, "open311-collection", body)
    elif args.command == "mapping":
        value = workspace.save_mapping(args.project, args.revision, args.actor, args.operation, "requests",
            {"fields": {field: field for field in ("id", "asset_id", "location_id", "summary", "status", "created_at")},
             "status_aliases": {}, "trim_ids": False})
    elif args.command == "review":
        value = workspace.review_service_asset(args.project, args.revision, args.actor, args.operation,
            args.row, args.binding_sha256, args.decision, args.note, args.asset, args.work_order)
    else:
        if workspace.project(args.project)["revision"] != args.revision:
            raise InvalidData("Select the actual current project revision")
        body = workspace.export(args.project) if args.kind == "handoff" else workspace.report(args.project)
        if workspace.project(args.project)["revision"] != args.revision:
            raise InvalidData("Project changed while exporting; preserve the current complete revision")
        value = publish(args.output, body)
    print(json.dumps(value, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
