"""MIT. AMP commands on the original IATI CLI and workspace."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
from iati_source import InputError
from amp.codec import loads, MAX_JSON


def register(sub):
    sub.add_parser("amp-status")
    selected = sub.add_parser("amp-request"); selected.add_argument("--request", required=True)
    selected = sub.add_parser("amp-capture"); selected.add_argument("--id", required=True)
    for name in ("amp-plan", "amp-history", "amp-rows", "amp-export", "amp-file"):
        selected = sub.add_parser(name)
        selected.add_argument("--id", required=True)
        if name != "amp-history":
            selected.add_argument("--revision", type=int)
        if name == "amp-rows":
            selected.add_argument("--offset", type=int, default=0)
            selected.add_argument("--limit", type=int, default=50)
            selected.add_argument("--state", choices=["included", "excluded", "review"])
        if name in {"amp-export", "amp-file"}:
            selected.add_argument("--out", required=True)
        if name == "amp-file":
            selected.add_argument("--kind", choices=["analysis", "sourceRows", "comparison", "prepared", "report"], required=True)
    for name in ("amp-capture-import", "amp-save", "amp-review", "amp-prepare", "amp-decision-preview", "amp-decision-apply", "amp-advance",
                 "amp-native-capture", "amp-native-start", "amp-native-reconcile"):
        selected = sub.add_parser(name); selected.add_argument("--file", required=True)
        if name.startswith("amp-native-"):
            selected.add_argument("--credentials-file")
    selected = sub.add_parser("amp-native-continue")
    selected.add_argument("--run", required=True); selected.add_argument("--credentials-file")
    selected = sub.add_parser("amp-run"); selected.add_argument("--run", required=True)
    selected = sub.add_parser("amp-events"); selected.add_argument("--run", required=True)
    selected.add_argument("--after", type=int, default=0); selected.add_argument("--limit", type=int, default=100)
    selected = sub.add_parser("amp-receive"); selected.add_argument("--file", required=True)


def original_json(filename):
    with Path(filename).open("rb") as stream:
        raw = stream.read(MAX_JSON + 1)
    return loads(raw)


def credentials(args):
    if args.credentials_file:
        result = original_json(args.credentials_file)
        if not isinstance(result, dict) or set(result) != {"username", "passwordSha1"}:
            raise InputError("Use the existing native username/passwordSha1 credential object")
        return result
    username = os.environ.get("AMP_NATIVE_USERNAME", "")
    password_hash = os.environ.get("AMP_NATIVE_PASSWORD_SHA1", "")
    if not password_hash and os.environ.get("AMP_NATIVE_PASSWORD"):
        password_hash = hashlib.sha1(os.environ["AMP_NATIVE_PASSWORD"].encode("utf-8")).hexdigest()
    if not username or not password_hash:
        raise InputError("Supply --credentials-file or the existing AMP_NATIVE_USERNAME and AMP_NATIVE_PASSWORD_SHA1 environment values")
    return {"username": username, "passwordSha1": password_hash}


def command(ws, args):
    work, name = ws.amp, args.command
    if name == "amp-status":
        return work.status()
    if name == "amp-request":
        return work.request(args.request)
    if name == "amp-capture":
        return work.capture(args.id)
    if name == "amp-plan":
        return work.plan(args.id, args.revision)
    if name == "amp-history":
        return {"history": work.history(args.id)}
    if name == "amp-rows":
        return work.rows(args.id, args.revision, args.offset, args.limit, args.state)
    if name == "amp-export":
        return work.export(args.id, Path(args.out).expanduser().absolute(), args.revision)
    if name == "amp-file":
        descriptor = work.file(args.id, args.revision, args.kind)
        destination = Path(args.out).expanduser().absolute()
        with destination.open("xb") as output, descriptor["path"].open("rb") as source:
            destination.chmod(0o600)
            import shutil
            shutil.copyfileobj(source, output, 65536)
            output.flush(); os.fsync(output.fileno())
        return {**{k: descriptor[k] for k in ("name", "media", "bytes", "sha256")}, "path": str(destination)}
    if name == "amp-run":
        return work.run(args.run)
    if name == "amp-events":
        return work.events(args.run, args.after, args.limit)
    if name == "amp-receive":
        return work.receive(Path(args.file))
    if name in {"amp-capture-import", "amp-save", "amp-review", "amp-prepare", "amp-decision-preview", "amp-decision-apply", "amp-advance"}:
        actions = {"amp-capture-import": work.retain_capture, "amp-save": work.save,
                   "amp-review": work.review, "amp-prepare": work.prepare,
                   "amp-decision-preview": work.decision_preview, "amp-decision-apply": work.apply_decisions, "amp-advance": work.advance}
        return actions[name](original_json(args.file))
    if name.startswith("amp-native-"):
        secret = credentials(args)
        try:
            if name == "amp-native-continue":
                return work.execute(args.run, secret)
            raw = original_json(args.file)
            if name == "amp-native-capture":
                return work.native_capture(raw, secret)
            if name == "amp-native-start":
                prepared = work.start_run(raw)
                return work.execute(prepared["runId"], secret)
            if name == "amp-native-reconcile":
                return work.reconcile(raw, secret)
        finally:
            secret.clear()
    raise InputError("Unknown AMP commissioning command")
