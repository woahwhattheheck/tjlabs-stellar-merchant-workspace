"""MIT. DQA commands using the same IATI workspace and saved operations."""
from pathlib import Path
import os
import shutil
import tempfile
from dqa import MAX_BODY, InputError, page_values
from dqa_http import original_file
from workspace import file_digest, load_json, regular, sync_dir


def register(sub):
    for name in ("providers", "assessments", "cases"):
        sub.add_parser("dqa-" + name)
    for name in ("provider-save", "capture", "case-save", "receive"):
        selected = sub.add_parser("dqa-" + name)
        selected.add_argument("--file", required=True)
    for name in ("assessment", "case", "history", "findings", "comparison", "export", "file"):
        selected = sub.add_parser("dqa-" + name)
        selected.add_argument("--id", required=True)
        if name in {"case", "export"}:
            selected.add_argument("--revision", type=int)
        if name in {"findings", "comparison"}:
            selected.add_argument("--offset", type=int, default=0)
            selected.add_argument("--limit", type=int, default=50)
        if name == "findings":
            selected.add_argument("--status", default="", choices=("", "pass", "fail", "not_applicable"))
            selected.add_argument("--search", default="")
        if name in {"export", "file"}:
            selected.add_argument("--out", required=True)
        if name == "file":
            selected.add_argument("--kind", required=True, choices=("response", "request", "configuration-before", "configuration-after"))
    selected = sub.add_parser("dqa-compare")
    selected.add_argument("--before", required=True)
    selected.add_argument("--after", required=True)
    selected = sub.add_parser("dqa-operations")
    selected.add_argument("--offset", type=int, default=0)
    selected.add_argument("--limit", type=int, default=50)


def read_selection(filename):
    with Path(filename).open("rb") as stream:
        raw = stream.read(MAX_BODY + 1)
    if len(raw) > MAX_BODY:
        raise InputError("The full DQA selection exceeds 64 MiB")
    return load_json(raw)


def command(ws, args):
    dqa, name = ws.dqa, args.command.removeprefix("dqa-")
    if name in {"providers", "assessments", "cases"}:
        return getattr(dqa, name)()
    if name in {"provider-save", "capture", "case-save"}:
        return getattr(dqa, {"provider-save": "save_provider", "capture": "capture", "case-save": "save_case"}[name])(read_selection(args.file))
    if name == "assessment":
        return dqa.assessment(args.id)
    if name == "case":
        return dqa.case(args.id, args.revision)
    if name == "history":
        return dqa.history(args.id)
    if name == "findings":
        return dqa.findings(args.id, args.offset, args.limit, args.status, args.search)
    if name == "compare":
        return dqa.compare(args.before, args.after)
    if name == "comparison":
        return dqa.comparison(args.id, args.offset, args.limit)
    if name == "operations":
        return page_values(dqa.operations(), args.offset, args.limit)
    if name == "export":
        return dqa.export_case(args.id, Path(args.out).absolute(), args.revision)
    if name == "receive":
        return dqa.receive(Path(args.file))
    if name == "file":
        with ws.mutex:
            item = original_file(dqa, args.id, args.kind)
            source = dqa.blob_path(item)
            destination = Path(args.out).expanduser().absolute()
            if destination.parent.resolve(strict=True) != destination.parent:
                raise InputError("Choose the original full-file destination without directory aliases")
            if destination.exists():
                if regular(destination, MAX_BODY).st_size != item["bytes"] or file_digest(destination, MAX_BODY) != item["sha256"]:
                    raise InputError("The selected destination already contains a different original file")
            else:
                fd, temporary = tempfile.mkstemp(prefix=".iati-dqa-", dir=destination.parent)
                temp = Path(temporary)
                try:
                    with os.fdopen(fd, "wb") as out, source.open("rb") as inp:
                        shutil.copyfileobj(inp, out, 65536)
                        out.flush()
                        os.fsync(out.fileno())
                    # This path is private to the selected operator output.
                    if destination.exists():
                        raise InputError("The receiving output was created during delivery")
                    os.rename(temp, destination)
                    sync_dir(destination.parent)
                finally:
                    temp.unlink(missing_ok=True)
            return {"path": str(destination), **item}
    raise InputError("Unknown original DQA command")
