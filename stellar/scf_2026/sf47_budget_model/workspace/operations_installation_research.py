"""Economic Research sources on the original Installation Source Desk.

Complete native Research files remain private case/draft-scoped sidecars. The
original Node readers validate their full bytes; the existing Source Desk and
Operations writers own all revisions, commercial records and Installation saves.
"""
from __future__ import annotations
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import uuid
import zipfile
from urllib.parse import parse_qs
from html import escape
from model import Problem, canonical, digest
import operations_flowable_sources as files
import operations_installations as installations
import operations_workshare_installations as workshares

SCHEMA = "stellar-forge.research-installation-source-desk.v1"
SELECTION = "stellar-forge.research-installation-selection.v1"
INSPECTION = "stellar-forge.research-installation-inspection.v1"
ARCHIVE = "stellar-forge.research-installation-archive.v1"
LIMITS = {"project": 480 * 1024 * 1024, "issued-package": 256 * 1024 * 1024,
          "customer-return": 256 * 1024 * 1024}
MAX_JSON = 64 * 1024 * 1024
MAX_SELECTION = 8 * 1024 * 1024
MAX_ARCHIVE = 2 * 1024 * 1024 * 1024
MAX_LEDGER = MAX_ARCHIVE
MAX_ORIGINALS = sum(LIMITS.values())
SHA = re.compile(r"[a-f0-9]{64}")
FILE_ID = re.compile(r"research-[a-f0-9]{64}")
DRAFT = re.compile(r"source-desk-[a-f0-9]{32}")
UUID = re.compile(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")
ROUTE = re.compile(r"^/api/operations/(operation-[a-f0-9]{32})/installation-sources/(source-desk-[a-f0-9]{32})/research(?:/(.*))?$")
ROOT = Path(__file__).resolve().parents[2] / "sf49_data_commissioning" / "installation-workorders"
PROFILE = ROOT / "economic-research.json"
ENGINE = ROOT / "research-installation-source.mjs"

def need(value, message, code="RESEARCH_INSTALLATION_INVALID", status=422):
    if not value:
        raise Problem(message, status, code)

def exact(value, keys, label):
    need(isinstance(value, dict) and set(value) == set(keys), "Retain every " + label + " field.")

def _json(raw):
    return files._json(raw)

def _bytes(value):
    return (canonical(value) + "\n").encode("utf-8")

def _text(value, label, maximum=4000):
    need(isinstance(value, str) and value.strip() and len(value) <= maximum and "\0" not in value,
         "Record the explicit " + label + ".")
    return value

def _sha(raw):
    return hashlib.sha256(raw).hexdigest()

def profile():
    from operations_installation_sources import native
    reader, _ = native()
    raw = reader.stable_file(PROFILE, 2 * 1024 * 1024)
    value = _json(raw)
    need(value.get("schema") == "stellar-forge.installation-workorder-profile.v1" and value.get("id") == "economic-research",
         "Install the complete original Economic Research profile.")
    return {"profile": value, "bytes": len(raw), "sha256": _sha(raw)}

def engine():
    members = []
    for path in (Path(__file__).resolve(), ENGINE, PROFILE):
        from operations_installation_sources import native
        reader, _ = native()
        raw = reader.stable_file(path, 2 * 1024 * 1024)
        members.append({"path": path.name, "bytes": len(raw), "sha256": _sha(raw)})
    return {"kind": "economic-research", "files": members, "sha256": digest(members)}

def _stream_file(path, maximum, expected=None):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid == os.getuid() and
             not before.st_mode & 0o077 and 0 < before.st_size <= maximum,
             "Keep the complete private original regular file.", status=413)
        h = hashlib.sha256()
        size = 0
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            size += len(block)
            h.update(block)
        named = os.lstat(path)
        result = {"bytes": size, "sha256": h.hexdigest()}
        need(size == before.st_size and files._identity(before) == files._identity(os.fstat(fd))
             and (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino),
             "The retained original source changed.", "RESEARCH_INSTALLATION_CHANGED", 409)
        if expected is not None:
            need(result == {k: expected[k] for k in ("bytes", "sha256")},
                 "The complete original differs from its retained selection.", "RESEARCH_INSTALLATION_CHANGED", 409)
        os.lseek(fd, 0, os.SEEK_SET)
        return fd, before, result
    except BaseException:
        os.close(fd)
        raise

def _keep_stream(path, stream, size, sha256):
    staging = files._directory(path.parent / ".staging")
    temporary = staging / (uuid.uuid4().hex + ".partial")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        remaining, hashed = size, hashlib.sha256()
        while remaining:
            block = stream.read(min(1024 * 1024, remaining))
            need(isinstance(block, bytes) and 0 < len(block) <= remaining,
                 "The complete original upload was interrupted.", "RESEARCH_INSTALLATION_UPLOAD_INCOMPLETE", 400)
            remaining -= len(block)
            hashed.update(block)
            view = memoryview(block)
            while view:
                count = os.write(fd, view)
                need(count > 0, "The retained file write did not advance.")
                view = view[count:]
        need(hashed.hexdigest() == sha256, "The uploaded original SHA256 differs.", "RESEARCH_INSTALLATION_CHANGED", 409)
        os.fsync(fd)
        os.close(fd)
        fd = None
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            existing, _, _ = _stream_file(path, size, {"bytes": size, "sha256": sha256})
            os.close(existing)
        files._sync(path.parent)
    finally:
        if fd is not None:
            os.close(fd)
        try:
            temporary.unlink()
            files._sync(staging)
        except FileNotFoundError:
            pass

class ResearchIntake:
    def __init__(self, operations):
        self.ops = operations
        self.workspace = operations.workspace

    def _desk(self):
        from operations_installation_sources import SourceDesk
        return SourceDesk(self.ops)

    def _root(self, case_id, draft_id):
        need(isinstance(draft_id, str) and DRAFT.fullmatch(draft_id), "Select the original Source Desk draft.")
        with self.workspace.mutex:
            self._desk()._state(case_id, draft_id)
        base = Path(self.workspace.root).absolute()
        need(base.resolve() == base and (base / "planning.sqlite3").is_file(),
             "Open the complete existing native Operations workspace.")
        root = files._directory(base / "research-source-desk")
        return files._directory(files._directory(root / case_id) / draft_id)

    def _intent(self, case_id, draft_id, request_id, actor):
        need(isinstance(request_id, str) and UUID.fullmatch(request_id), "Retain the original upload request UUID.")
        _text(actor, "original operator", 300)
        root = self._root(case_id, draft_id)
        path = files._directory(root / "uploads") / (request_id + ".json")
        intent = _json(files._read(path, MAX_SELECTION))
        need(intent.get("caseId") == case_id and intent.get("draftId") == draft_id and
             intent.get("requestId") == request_id and intent.get("actor") == actor,
             "This retained upload belongs to another case, draft or original actor.", "RESEARCH_INSTALLATION_REQUEST_CONFLICT", 409)
        return root, intent

    def _engine(self, case_id, draft_id, action, value):
        root = self._root(case_id, draft_id)
        calls = files._directory(root / "native-calls")
        raw = _bytes({"action": action, "input": value})
        need(len(raw) <= MAX_SELECTION, "Retain the compact original native selection separately from whole files.", status=413)
        source = files._publish(calls / (_sha(raw) + ".json"), raw)
        attempt = uuid.uuid4().hex
        stdout, stderr = calls / (attempt + ".stdout"), calls / (attempt + ".stderr")
        selected = os.environ.get("GRANT_RESEARCH_NODE", "node")
        node = shutil.which(selected)
        need(node is not None and ENGINE.is_file(), "Select the installed original Research Node runtime and complete application source.",
             "RESEARCH_INSTALLATION_ENGINE_UNAVAILABLE", 503)
        child = None
        with open(stdout, "xb", buffering=0) as out, open(stderr, "xb", buffering=0) as err:
            os.chmod(stdout, 0o600)
            os.chmod(stderr, 0o600)
            try:
                child = subprocess.Popen([str(Path(node).resolve()), str(ENGINE), "--input", str(source)],
                    stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True,
                    env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
                try:
                    child.wait(timeout=1800)
                except subprocess.TimeoutExpired as error:
                    files._stop(child)
                    raise Problem("The original native inspection has not returned. Resume the same retained file request.",
                                  504, "RESEARCH_INSTALLATION_OUTCOME_UNKNOWN") from error
                out.flush()
                err.flush()
                os.fsync(out.fileno())
                os.fsync(err.fileno())
                if child.returncode:
                    try:
                        error = _json(files._read(stderr, MAX_JSON))
                    except (ValueError, UnicodeError):
                        error = {}
                    raise Problem(str(error.get("message", "The original native Research reader did not complete."))[:12000],
                                  error.get("status", 502) if type(error.get("status")) is int else 502,
                                  str(error.get("code", "RESEARCH_INSTALLATION_ENGINE_FAILED")))
                return _json(files._read(stdout, MAX_JSON))
            finally:
                if child is not None:
                    files._stop(child)

    def _origin(self, case_id, draft_id):
        with self.ops.workspace.mutex:
            state = self._desk()._state(case_id, draft_id)
            return deepcopy(state.get("receivedFrom") or {})

    def _file(self, case_id, draft_id, file_id):
        need(isinstance(file_id, str) and FILE_ID.fullmatch(file_id), "Select an original retained Research file.")
        root = self._root(case_id, draft_id)
        file = _json(files._read(files._directory(root / "files") / (file_id + ".json"), MAX_SELECTION))
        exact(file, ("id", "caseId", "draftId", "requestId", "actor", "kind", "name", "bytes", "sha256", "sourceUrl", "observedAt"), "original Research file metadata")
        need(isinstance(file["requestId"], str) and UUID.fullmatch(file["requestId"]) and
             file["kind"] in LIMITS and type(file["bytes"]) is int and 0 < file["bytes"] <= LIMITS[file["kind"]] and
             isinstance(file["sha256"], str) and SHA.fullmatch(file["sha256"]) and
             isinstance(file["caseId"], str) and re.fullmatch(r"operation-[a-f0-9]{32}", file["caseId"]) and
             isinstance(file["draftId"], str) and DRAFT.fullmatch(file["draftId"]),
             "Keep the original native source identity and safe custody path.")
        original_intent = {"schema": SCHEMA, **{k: v for k, v in file.items() if k != "id"}}
        need(file_id == "research-" + digest(original_intent),
             "The retained file ID differs from its complete original upload intent.", "RESEARCH_INSTALLATION_CHANGED", 409)
        intent = _json(files._read(root / "uploads" / (file["requestId"] + ".json"), MAX_SELECTION))
        need(intent == original_intent, "Keep the exact original upload intent beside its full source.")
        need(file.get("id") == file_id and file.get("caseId") in [case_id, self._origin(case_id, draft_id).get("caseId"), *self._origin(case_id, draft_id).get("custodyCaseIds", [])] and file.get("draftId") == draft_id,
             "The retained source belongs to another original draft.", "RESEARCH_INSTALLATION_CHANGED", 409)
        path = root / "uploads" / (file["requestId"] + ".source")
        fd, _, _ = _stream_file(path, LIMITS[file["kind"]], file)
        os.close(fd)
        return file, path

    def upload(self, case_id, draft_id, stream, *, request_id, actor, kind, name, size, sha256, source_url, observed_at):
        from operations import domain
        need(isinstance(request_id, str) and UUID.fullmatch(request_id), "Retain the original upload request UUID.")
        _text(actor, "original operator", 300)
        need(kind in LIMITS and type(size) is int and 0 < size <= LIMITS[kind] and
             isinstance(sha256, str) and SHA.fullmatch(sha256),
             "Select the full original Research input within its declared per-kind capacity.", status=413)
        need(isinstance(name, str) and 0 < len(name) <= 200 and name not in (".", "..") and
             not re.search(r"[/\\\x00-\x1f\x7f]", name), "Keep the plain original receiving filename.")
        source_url = domain.url(source_url, "Original source URL")
        observed_at = domain.timestamp(observed_at, "Actual source observation")
        root = self._root(case_id, draft_id)
        uploads = files._directory(root / "uploads")
        intent = {"schema": SCHEMA, "caseId": case_id, "draftId": draft_id, "requestId": request_id,
                  "actor": actor, "kind": kind, "name": name, "bytes": size, "sha256": sha256,
                  "sourceUrl": source_url, "observedAt": observed_at}
        files._publish(uploads / (request_id + ".json"), _bytes(intent))
        _keep_stream(uploads / (request_id + ".source"), stream, size, sha256)
        return self.resume(case_id, draft_id, request_id, actor)

    def request(self, case_id, draft_id, request_id, actor):
        try:
            root, intent = self._intent(case_id, draft_id, request_id, actor)
        except FileNotFoundError:
            return {"schema": SCHEMA, "caseId": case_id, "draftId": draft_id, "requestId": request_id,
                    "actor": actor, "status": "NOT_RECORDED"}
        target = root / "uploads" / (request_id + ".source")
        try:
            fd, _, _ = _stream_file(target, LIMITS[intent["kind"]], intent)
            os.close(fd)
        except FileNotFoundError:
            return {**intent, "status": "NOT_RECORDED", "inputIntentRetained": True}
        result_path = root / "uploads" / (request_id + ".result.json")
        try:
            result = _json(files._read(result_path, MAX_JSON))
        except FileNotFoundError:
            return {**intent, "status": "INPUT_RETAINED"}
        need(result.get("request") == intent, "The saved original upload receipt changed.", "RESEARCH_INSTALLATION_CHANGED", 409)
        self._file(case_id, draft_id, result["file"]["id"])
        return result

    def resume(self, case_id, draft_id, request_id, actor):
        current = self.request(case_id, draft_id, request_id, actor)
        if current["status"] == "COMPLETE":
            return current
        need(current["status"] == "INPUT_RETAINED", "Reselect the exact original file; no full upload has been retained.",
             "RESEARCH_INSTALLATION_INPUT_MISSING", 409)
        root, intent = self._intent(case_id, draft_id, request_id, actor)
        file = {"id": "research-" + digest(intent),
                **{k: intent[k] for k in ("caseId", "draftId", "requestId", "actor", "kind", "name", "bytes", "sha256", "sourceUrl", "observedAt")}}
        native = {**file, "path": str(root / "uploads" / (request_id + ".source"))}
        inspected = self._engine(case_id, draft_id, "inspect", {"file": native,
            "directory": str(files._directory(root / "inspection") / file["id"])})
        need(inspected.get("schema") == INSPECTION and inspected.get("kind") == file["kind"],
             "Retain the original complete Research inspection.", "RESEARCH_INSTALLATION_ENGINE_RESPONSE", 502)
        files._publish(files._directory(root / "files") / (file["id"] + ".json"), _bytes(file))
        files._publish(root / "files" / (file["id"] + ".inspection.json"), _bytes(inspected))
        result = {"schema": SCHEMA, "caseId": case_id, "draftId": draft_id, "requestId": request_id,
                  "actor": actor, "status": "COMPLETE", "request": intent, "file": file, "inspection": inspected}
        files._publish(root / "uploads" / (request_id + ".result.json"), _bytes(result))
        return result

    def inspect(self, case_id, draft_id, body):
        exact(body, ("fileId", "expectedSha256"), "original inspection selection")
        file, _ = self._file(case_id, draft_id, body["fileId"])
        need(file["sha256"] == body["expectedSha256"], "The original source selection changed.", "RESEARCH_INSTALLATION_CHANGED", 409)
        result = _json(files._read(self._root(case_id, draft_id) / "files" / (file["id"] + ".inspection.json"), MAX_JSON))
        need(result.get("schema") == INSPECTION, "Retain the original Research inspection.")
        return {"file": file, "inspection": result}

    def template(self, case_id, draft_id, body):
        self._root(case_id, draft_id)
        with self.ops._snapshot():
            context = self.ops._context(case_id)
            seed = workshares.seed(self.ops, context, body)
            doc = deepcopy(seed["document"])
            selected = profile()["profile"]
            for section in ("task", "source", "receiving"):
                for key, value in selected[section].items():
                    if key in doc[section] and not doc[section][key]:
                        doc[section][key] = deepcopy(value)
            if doc["source"]["mode"] == "UNSELECTED":
                doc["source"]["mode"] = "SNAPSHOT"
            doc = installations.normalized(context, doc)
            workshares.verify_document(self.ops, context, doc)
            return {**seed, "document": doc, "profile": selected, "engine": engine()}

    def file_descriptor(self, case_id, draft_id, file_id, expected_sha256):
        file, path = self._file(case_id, draft_id, file_id)
        need(file["sha256"] == expected_sha256, "The exact original download selection changed.", "RESEARCH_INSTALLATION_CHANGED", 409)
        return {"file": file, "path": str(path)}

def _report(value):
    e = lambda v: escape(str(v), quote=True)
    rows = "".join("<tr><td>" + e(r["original"]["definition"]["title"]) + "</td><td>" + e(r["purpose"]) +
        "</td><td>" + e(r["authorityReference"]) + "</td><td>" + e(r["redistribution"]) +
        "</td><td>" + e(r["retention"]) + "</td></tr>" for r in value["sourceUses"])
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Economic Research installation source</title><style>body{font:16px/1.55 system-ui;margin:0 auto;padding:32px;max-width:1120px;color:#222}'
        'table{border-collapse:collapse;width:100%}td,th{padding:12px;border:1px solid #ccc;text-align:left;vertical-align:top}'
        '.table{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:650px){body{padding:16px}table{min-width:650px}}'
        '@media print{body{font-size:10pt}.table{overflow:visible}tr{break-inside:avoid}}</style><h1>' + e(value["title"]) +
        '</h1><p>' + e(value["qualification"]) + '</p><h2>Explicit original source use</h2><div class="table"><table>'
        '<thead><tr><th>Source</th><th>Purpose</th><th>Authority</th><th>Redistribution</th><th>Retention</th></tr></thead><tbody>' +
        rows + '</tbody></table></div><h2>Selected issued product</h2><pre>' +
        e(json.dumps(value["product"], ensure_ascii=False, indent=2)) + '</pre></html>\n').encode()

def prepare(desk, state, context, data):
    selected = state["selection"]
    need(selected.get("schema") == SELECTION and data["expectedSelectionSha256"] == digest(selected),
         "Retain and review the complete Research selection.", "RESEARCH_INSTALLATION_CHANGED", 409)
    need(not state.get("requiresCurrentTemplate"), "Review a fresh current-case Workshare template and save its complete current selection before preparing a received draft.", "RESEARCH_INSTALLATION_REBASE_REQUIRED", 409)
    receipt = engine()
    need(data["expectedEngineSha256"] == receipt["sha256"] and data["expectedProfiles"] == {},
         "Reopen the original complete installed Research preparation source.", "RESEARCH_INSTALLATION_ENGINE_CHANGED", 409)
    intake = ResearchIntake(desk.ops)
    root = intake._root(state["caseId"], state["id"])
    native_files = []
    for row in selected["inputs"]:
        file, path = intake._file(state["caseId"], state["id"], row["fileId"])
        need(file["sha256"] == row["sha256"] and file["kind"] == row["role"],
             "Retain the exact selected whole Research inputs.", "RESEARCH_INSTALLATION_CHANGED", 409)
        native_files.append({**file, "path": str(path)})
    current = desk.ops._context(state["caseId"])
    installations._current(current, selected["expectedVersion"])
    document = installations.normalized(current, selected["document"])
    need(document == selected["document"] and document.get("workshare"), "Receive the complete original Workshare-seeded Installation.")
    workshares.verify_document(desk.ops, current, document)
    for section, keys in (("source", ("authority", "changePolicy")),
                           ("receiving", ("application", "host", "operator", "acceptanceRule", "changeAndWithdraw", "recovery", "maintenance")),
                           ("payment", ("authority",))):
        for key in keys:
            _text(document[section][key], section + "." + key)
    result = intake._engine(state["caseId"], state["id"], "prepare", {"inputs": native_files,
        "selection": selected, "directory": str(files._directory(root / "inspection"))})
    need(result.get("schema") == "stellar-forge.research-installation-preparation.v1",
         "The original Research preparation did not return its complete result.", "RESEARCH_INSTALLATION_ENGINE_RESPONSE", 502)
    preview = installations.preview(desk.ops, current, {"expectedVersion": selected["expectedVersion"],
        "installationId": selected["installationId"], "expectedRevision": selected["expectedInstallationRevision"],
        "document": document})
    ident = "preparation-" + digest({"draft": state["id"], "requestId": context["requestId"], "selectionSha256": digest(selected)})
    outputs = {"Research_Selection.json": _bytes(selected), "Research_Inspection.json": _bytes(result),
               "Research_Installation.html": _report(result), "installation-input.json": _bytes(document),
               "installation-preview.json": _bytes(preview)}
    dest = files._directory(files._directory(root / "preparations") / ident)
    descriptors = []
    for name, raw in outputs.items():
        need(len(raw) <= MAX_JSON, "The complete native preparation metadata exceeds 64 MiB.", status=413)
        files._publish(dest / name, raw)
        descriptors.append({"filename": name, "bytes": len(raw), "sha256": _sha(raw),
                            "mediaType": "text/html" if name.endswith(".html") else "application/json"})
    prepared = {"schema": "stellar-forge.installation-source-desk-preparation.v1", "id": ident,
        "caseId": state["caseId"], "draftId": state["id"], "draftRevision": state["revision"],
        "selectionSha256": digest(selected), "engine": receipt, "actor": context["actor"], "preparedAt": context["at"],
        "state": "PREPARED_SOURCE", "kind": "economic-research", "files": descriptors,
        "selection": deepcopy(selected), "inspection": {k: deepcopy(result[k]) for k in ("schema", "product", "title", "sha256", "qualification")},
        "originals": [{k: f[k] for k in ("id", "name", "kind", "bytes", "sha256", "sourceUrl", "observedAt")} for f in native_files],
        "installation": {"document": document, "preview": preview, "source": installations._source(current)}, "nativePreview": preview}
    desk.db.execute("INSERT INTO ops_installation_source_preparations VALUES(?,?,?,?)",
                    (state["caseId"], state["id"], ident, canonical(prepared)))
    state["preparations"].append({k: deepcopy(prepared[k]) for k in ("id", "draftRevision", "selectionSha256", "preparedAt", "state")})
    return prepared

def output(desk, prepared, filename):
    need(isinstance(prepared.get("id"), str) and re.fullmatch(r"preparation-[a-f0-9]{64}", prepared["id"]) and
         filename in ("Research_Selection.json", "Research_Inspection.json", "Research_Installation.html",
                      "installation-input.json", "installation-preview.json"),
         "Select an original named Research preparation output.")
    row = next((r for r in prepared["files"] if r["filename"] == filename), None)
    need(row is not None, "Select an original complete preparation output.", "RESEARCH_INSTALLATION_NOT_FOUND", 404)
    path = ResearchIntake(desk.ops)._root(prepared["caseId"], prepared["draftId"]) / "preparations" / prepared["id"] / filename
    raw = files._read(path, MAX_JSON)
    need(len(raw) == row["bytes"] and _sha(raw) == row["sha256"], "The full original preparation output changed.",
         "RESEARCH_INSTALLATION_CHANGED", 409)
    return deepcopy(row), raw

def attach(desk, state, context, data):
    exact(data, ("preparationId", "expectedVersion"), "reviewed Research attachment")
    prepared = desk._preparation(state["caseId"], state["id"], data["preparationId"])
    need(prepared.get("kind") == "economic-research", "Select the complete original Research preparation.")
    current = desk.ops._context(state["caseId"])
    installations._current(current, data["expectedVersion"])
    need(data["expectedVersion"] == prepared["selection"]["expectedVersion"],
         "The original case changed; retain this preparation and review the current case.", "RESEARCH_INSTALLATION_CHANGED", 409)
    intake = ResearchIntake(desk.ops)
    for f in prepared["originals"]:
        actual, _ = intake._file(state["caseId"], state["id"], f["id"])
        need(all(actual[k] == f[k] for k in f), "An original large source changed.")
    for f in prepared["files"]:
        output(desk, prepared, f["filename"])
    descriptor = {"schema": ARCHIVE + ".source", "caseId": state["caseId"], "draftId": state["id"],
        "preparationId": prepared["id"], "selection": prepared["selection"], "inspection": prepared["inspection"],
        "originals": prepared["originals"], "files": prepared["files"],
        "qualification": "Complete original files remain in this draft's native custody and whole receiving archive. This source does not establish accepted rights, work or payment."}
    raw = _bytes(descriptor)
    need(len(raw) <= 8 * 1024 * 1024, "Keep the source reference metadata within the original case source allowance.", status=413)
    import base64
    receipt = desk.ops.command(state["caseId"], {"requestId": context["requestId"],
        "expectedVersion": data["expectedVersion"], "actor": context["actor"], "note": context["note"],
        "action": "source.add", "data": {"filename": "Research_Installation_Source.json", "kind": "other",
        "mediaType": "application/json", "sourceUrl": "", "observedAt": context["at"],
        "contentBase64": base64.b64encode(raw).decode()}}, _within_transaction=True)
    updated = desk.ops._context(state["caseId"])
    source, source_raw = desk.ops.source(state["caseId"], receipt["recordId"])
    need(source_raw == raw, "Retain the exact newly attached original source.")
    document = deepcopy(prepared["installation"]["document"])
    for section in ("source", "receiving"):
        document[section]["sourceIds"] = list(dict.fromkeys(document[section]["sourceIds"] + [source["id"]]))
    preview = installations.preview(desk.ops, updated, {"expectedVersion": updated["program"]["version"],
        "installationId": prepared["selection"]["installationId"], "expectedRevision": prepared["selection"]["expectedInstallationRevision"],
        "document": document})
    result = {"state": "ATTACHED_RESEARCH_INSTALLATION", "preparationId": prepared["id"], "caseId": state["caseId"],
              "draftId": state["id"], "source": deepcopy(source), "receipt": receipt,
              "installation": {"document": document, "preview": preview, "source": installations._source(updated)},
              "nativePreview": preview}
    state.setdefault("researchAttachments", []).append(deepcopy(result))
    return result

def verify_receipt(desk, result):
    source = result["source"]
    metadata, raw = desk.ops.source(result["caseId"], source["id"])
    need(metadata == source and _sha(raw) == source["sha256"], "The retained original Research source reference changed.",
         "RESEARCH_INSTALLATION_CHANGED", 409)
    prepared = desk._preparation(result["caseId"], result["draftId"], result["preparationId"])
    for row in prepared["originals"]:
        file, _ = ResearchIntake(desk.ops)._file(result["caseId"], result["draftId"], row["id"])
        need(all(file[k] == row[k] for k in row), "The full original Research source changed.")
    return result


def _regular_tree(root):
    """Only completed immutable source files; interrupted private staging stays outside delivery."""
    rows = []
    if not root.exists():
        return rows
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in (".staging", "native-calls", "inspection", "exports") for part in relative.parts):
            continue
        st = path.lstat()
        need(not stat.S_ISLNK(st.st_mode), "Keep the complete source custody free of symbolic links.")
        if stat.S_ISDIR(st.st_mode):
            continue
        need(stat.S_ISREG(st.st_mode), "Keep only original regular source files.")
        fd, _, identity = _stream_file(path, MAX_ARCHIVE)
        os.close(fd)
        rows.append({"path": "custody/" + relative.as_posix(), **identity, "source": path})
    return rows

def _write_archive(path, members, manifest):
    staging = files._directory(path.parent / ".staging")
    temporary = staging / (uuid.uuid4().hex + ".zip")
    try:
        with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            os.chmod(temporary, 0o600)
            for row in members:
                info = zipfile.ZipInfo(row["path"], (2026, 1, 1, 0, 0, 0))
                info.external_attr = 0o100600 << 16
                if "body" in row:
                    raw = row["body"]
                    need(len(raw) == row["bytes"] and _sha(raw) == row["sha256"], "An original archive member changed.")
                    archive.writestr(info, raw)
                else:
                    fd, before, _ = _stream_file(row["source"], MAX_ARCHIVE, row)
                    try:
                        with archive.open(info, "w", force_zip64=True) as out:
                            while True:
                                block = os.read(fd, 1024 * 1024)
                                if not block:
                                    break
                                out.write(block)
                        need(files._identity(before) == files._identity(os.fstat(fd)), "An original source changed during export.")
                    finally:
                        os.close(fd)
            info = zipfile.ZipInfo("MANIFEST.json", (2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o100600 << 16
            archive.writestr(info, _bytes(manifest))
        fd, _, identity = _stream_file(temporary, MAX_ARCHIVE)
        os.fsync(fd)
        os.close(fd)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            fd, _, _ = _stream_file(path, MAX_ARCHIVE, identity)
            os.close(fd)
        files._sync(path.parent)
        return identity
    finally:
        try:
            temporary.unlink()
            files._sync(staging)
        except FileNotFoundError:
            pass

def _ledger(desk, case_id, draft_id):
    with desk.workspace.mutex:
        state = desk._state(case_id, draft_id)
        revisions = [{"revision": r[0], "body_json": r[1], "sha256": r[2]} for r in desk.db.execute(
            "SELECT revision,body_json,sha256 FROM ops_installation_source_revisions WHERE program_id=? AND id=? ORDER BY revision",
            (case_id, draft_id))]
        preparations = [{"id": r[0], "body_json": r[1]} for r in desk.db.execute(
            "SELECT id,body_json FROM ops_installation_source_preparations WHERE program_id=? AND draft_id=? ORDER BY id",
            (case_id, draft_id))]
        requests = []
        for row in desk.db.execute("SELECT request_id,fingerprint,result_json FROM requests ORDER BY request_id"):
            result = _json(row[2])
            if (isinstance(result, dict) and result.get("schema") == "stellar-forge.installation-source-desk.v1"
                    and result.get("draft", {}).get("caseId") == case_id and result["draft"].get("id") == draft_id):
                requests.append({"request_id": row[0], "fingerprint": row[1], "result_json": row[2]})
        blobs, members = [], []
        for h, size, body in desk.db.execute(
                "SELECT sha256,bytes,content FROM ops_installation_source_blobs WHERE program_id=? AND draft_id=? ORDER BY sha256",
                (case_id, draft_id)):
            raw = bytes(body)
            need(len(raw) == size and _sha(raw) == h, "The complete original SourceDesk blob changed.")
            path = "source-desk/blobs/" + h
            blobs.append({"path": path, "bytes": size, "sha256": h})
            members.append({"path": path, "bytes": size, "sha256": h, "body": raw})
        value = {"schema": ARCHIVE + ".original-ledger", "caseId": case_id, "draftId": draft_id,
                 "state": deepcopy(state), "revisions": revisions, "preparations": preparations,
                 "requests": requests, "blobs": blobs}
        raw = _bytes(value)
        members.append({"path": "source-desk/original-ledger.json", "bytes": len(raw), "sha256": _sha(raw), "body": raw})
        return value, members

def export_installation(self, case_id, draft_id, preparation_id, installation_id, revision, directory):
    need(type(revision) is int and revision > 0, "Select the actual saved Installation revision.")
    desk = self._desk()
    root = self._root(case_id, draft_id)
    with self.ops._snapshot():
        prepared = desk._preparation(case_id, draft_id, preparation_id)
        need(prepared.get("kind") == "economic-research", "Select the original complete Research preparation.")
        saved = installations.get(self.ops, case_id, installation_id, revision)
        state = desk._state(case_id, draft_id)
        attached = next((r for r in state.get("researchAttachments", []) if r["preparationId"] == preparation_id
                         and r["installation"]["document"] == saved["preview"]["document"]), None)
        need(attached is not None, "Select the actual saved Installation from this original source preparation.")
        verify_receipt(desk, attached)
        original = self.ops.export_installation(case_id, installation_id, revision)
        ledger, members = _ledger(desk, case_id, draft_id)
    # The export identity freezes its selected source revision and actual saved case; later edits make another edition.
    members.insert(0, {"path": "original-installation-case.zip", "bytes": len(original), "sha256": _sha(original), "body": original})
    members += _regular_tree(root)
    paths = [r["path"] for r in members]
    need(len(paths) == len(set(paths)) and len(paths) <= 100000, "Keep each complete receiving member once.")
    need(sum(r["bytes"] for r in members) < MAX_ARCHIVE - 32 * 1024 * 1024,
         "The full original case, source history and Research files exceed the declared 2 GiB delivery capacity.", status=413)
    manifest = {"schema": ARCHIVE, "caseId": case_id, "draftId": draft_id, "draftRevision": ledger["state"]["revision"],
                "preparationId": preparation_id, "installation": {k: saved[k] for k in ("id", "revision", "sha256")},
                "files": [{k: row[k] for k in ("path", "bytes", "sha256")} for row in members],
                "originals": deepcopy(prepared["originals"]), "sourceSelection": deepcopy(prepared["selection"]),
                "qualification": "Original complete data and records; native receiving does not claim commissioning, accepted source rights or payment."}
    manifest["sha256"] = digest(manifest)
    output = Path(directory).absolute()
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    files._directory(output)
    name = "Research_Installation_" + manifest["sha256"] + ".zip"
    path = output / name
    identity = _write_archive(path, members, manifest)
    result = {"file": {"name": name, **identity, "kind": "installation-archive"}, "path": str(path), "manifest": manifest}
    # The exact described archive remains addressable after later unrelated case edits.
    files._publish(output / (identity["sha256"] + ".json"), _bytes(result))
    return result

ResearchIntake.export_installation = export_installation

def retained_archive(self, case_id, draft_id, preparation_id, installation_id, revision, expected_sha256):
    need(isinstance(expected_sha256, str) and SHA.fullmatch(expected_sha256), "Retain the described complete archive SHA256.")
    output = files._directory(self._root(case_id, draft_id) / "exports")
    result = _json(files._read(output / (expected_sha256 + ".json"), MAX_JSON))
    manifest, descriptor = result["manifest"], result["file"]
    need(manifest.get("schema") == ARCHIVE and manifest.get("caseId") == case_id and
         manifest.get("draftId") == draft_id and manifest.get("preparationId") == preparation_id and
         manifest.get("installation", {}).get("id") == installation_id and manifest["installation"].get("revision") == revision and
         descriptor.get("sha256") == expected_sha256 and manifest.get("sha256") == digest({k: v for k, v in manifest.items() if k != "sha256"}),
         "The described archive belongs to another original selected Installation.", "RESEARCH_INSTALLATION_CHANGED", 409)
    path = output / ("Research_Installation_" + manifest["sha256"] + ".zip")
    need(result["path"] == str(path) and descriptor["name"] == path.name, "Keep the original described archive location.")
    fd, _, _ = _stream_file(path, MAX_ARCHIVE, descriptor)
    os.close(fd)
    return result

ResearchIntake.retained_archive = retained_archive

def _unpack_archive(path, expected_sha256, directory):
    need(isinstance(expected_sha256, str) and SHA.fullmatch(expected_sha256), "Keep the original complete archive SHA256.")
    fd, before, identity = _stream_file(path, MAX_ARCHIVE)
    need(identity["sha256"] == expected_sha256, "The complete receiving archive differs from its declared original.", "RESEARCH_INSTALLATION_CHANGED", 409)
    try:
        with os.fdopen(os.dup(fd), "rb") as source, zipfile.ZipFile(source) as archive:
            info = archive.infolist()
            names = [r.filename for r in info]
            need(len(names) == len(set(names)) and len(names) <= 100001 and "MANIFEST.json" in names,
                 "Retain the exact complete receiving member inventory.")
            need(archive.getinfo("MANIFEST.json").file_size <= 32 * 1024 * 1024,
                 "Retain the complete bounded archive manifest.", status=413)
            manifest = _json(archive.read("MANIFEST.json"))
            need(isinstance(manifest, dict) and manifest.get("schema") == ARCHIVE and
                 manifest.get("sha256") == digest({k: v for k, v in manifest.items() if k != "sha256"}),
                 "The complete original archive manifest changed.")
            rows = manifest["files"]
            need(isinstance(rows, list) and len(rows) == len(names) - 1 and
                 {r["path"] for r in rows} == set(names) - {"MANIFEST.json"} and
                 sum(r["bytes"] for r in rows) < MAX_ARCHIVE,
                 "Retain every original source member within the full receiving capacity.")
            for row in rows:
                relative = row["path"]
                need(isinstance(relative, str) and relative and not relative.startswith("/") and "\\" not in relative and
                     not re.search(r"[\x00-\x1f\x7f]", relative) and all(p not in ("", ".", "..") for p in relative.split("/")),
                     "Use only complete safe original relative member names.")
                entry = archive.getinfo(relative)
                need(type(row["bytes"]) is int and entry.file_size == row["bytes"] and
                     isinstance(row["sha256"], str) and SHA.fullmatch(row["sha256"]) and
                     not stat.S_ISLNK(entry.external_attr >> 16),
                     "An original complete member descriptor differs.")
                target = directory / relative
                current = directory
                for part in Path(relative).parts[:-1]:
                    current = files._directory(current / part)
                with archive.open(entry) as stream:
                    _keep_stream(target, stream, row["bytes"], row["sha256"])
            need(files._identity(before) == files._identity(os.fstat(fd)), "The original archive changed during receiving.")
            files._publish(directory / "MANIFEST.json", _bytes(manifest))
            return manifest, identity
    finally:
        os.close(fd)

def _validate_ledger(ledger, manifest):
    """Validate original table identities before translating only current routing."""
    schema = "stellar-forge.installation-source-desk.v1"
    need(isinstance(ledger, dict) and ledger.get("schema") == ARCHIVE + ".original-ledger" and
         ledger.get("caseId") == manifest["caseId"] and ledger.get("draftId") == manifest["draftId"],
         "The complete original SourceDesk ledger identity changed.")
    state, revisions = ledger.get("state"), ledger.get("revisions")
    need(isinstance(state, dict) and state.get("schema") == schema and state.get("caseId") == ledger["caseId"] and
         state.get("id") == ledger["draftId"] and type(state.get("revision")) is int and
         isinstance(revisions, list) and len(revisions) == state["revision"] == manifest["draftRevision"] and
         0 < len(revisions) <= 10000, "Retain the complete original source draft revision sequence.")
    for index, row in enumerate(revisions, 1):
        need(isinstance(row, dict) and row.get("revision") == index and isinstance(row.get("body_json"), str) and
             row.get("sha256") == _sha(row["body_json"].encode()), "An original source draft revision changed.")
        old = _json(row["body_json"])
        need(old.get("schema") == schema and old.get("caseId") == ledger["caseId"] and
             old.get("id") == ledger["draftId"] and old.get("revision") == index and
             isinstance(old.get("history"), list) and len(old["history"]) == index,
             "Retain each complete original draft and its request history.")
        if index == len(revisions):
            need(old == state, "The current original draft differs from its final saved revision.")
    for name in ("preparations", "requests", "blobs"):
        need(isinstance(ledger.get(name), list), "Retain the complete original " + name + ".")
    seen = set()
    for row in ledger["preparations"]:
        value = _json(row["body_json"])
        need(row["id"] not in seen and value.get("id") == row["id"] and value.get("caseId") == ledger["caseId"]
             and value.get("draftId") == ledger["draftId"], "Keep each original preparation identity once.")
        seen.add(row["id"])
    need(manifest["preparationId"] in seen, "Retain the selected original preparation.")
    seen = set()
    for row in ledger["requests"]:
        result = _json(row["result_json"])
        need(isinstance(row.get("request_id"), str) and row["request_id"] not in seen and
             isinstance(row.get("fingerprint"), str) and SHA.fullmatch(row["fingerprint"]) and
             result.get("schema") == schema and result.get("draft", {}).get("caseId") == ledger["caseId"] and
             result["draft"].get("id") == ledger["draftId"], "Retain each exact original request receipt once.")
        seen.add(row["request_id"])
    declared = {row["path"]: row for row in manifest["files"]}
    seen = set()
    for row in ledger["blobs"]:
        need(isinstance(row.get("sha256"), str) and SHA.fullmatch(row["sha256"]) and row["sha256"] not in seen and
             row.get("path") == "source-desk/blobs/" + row["sha256"] and
             declared.get(row["path"]) == {k: row[k] for k in ("path", "bytes", "sha256")},
             "Retain each complete original SourceDesk blob and exact declared path.")
        seen.add(row["sha256"])

def _restore_desk(ops, case_id, manifest, originals, request_id):
    from operations_installation_sources import SourceDesk
    desk = SourceDesk(ops)
    ledger_path = originals / "source-desk" / "original-ledger.json"
    ledger_raw = files._read(ledger_path, MAX_LEDGER)
    ledger = _json(ledger_raw)
    _validate_ledger(ledger, manifest)
    need(ledger.get("schema") == ARCHIVE + ".original-ledger" and ledger.get("caseId") == manifest["caseId"]
         and ledger.get("draftId") == manifest["draftId"], "The complete original SourceDesk ledger changed.")
    draft_id = ledger["draftId"]
    origin = {"schema": ARCHIVE + ".origin", "caseId": manifest["caseId"], "draftId": draft_id,
              "manifestSha256": manifest["sha256"], "ledgerSha256": _sha(ledger_raw),
              "originalDraftSha256": digest(ledger["state"]), "requestIds": list(dict.fromkeys([r["request_id"] for r in ledger["requests"]] + (ledger["state"].get("receivedFrom") or {}).get("requestIds", []))),
              "custodyCaseIds": list(dict.fromkeys([manifest["caseId"], *((ledger["state"].get("receivedFrom") or {}).get("custodyCaseIds", [])), *(([(ledger["state"].get("receivedFrom") or {})["caseId"]]) if (ledger["state"].get("receivedFrom") or {}).get("caseId") else [])]))}
    def relocated(value):
        value = deepcopy(value)
        need(value.get("caseId") == manifest["caseId"], "Retain the original routing case in its exact source ledger.")
        value["caseId"] = case_id
        for attachment in value.get("researchAttachments", []):
            old_case = attachment["caseId"]
            original_receipt_sha256 = digest(attachment)
            attachment["caseId"] = case_id
            attachment["receivedRouting"] = {"originCaseId": old_case, "currentCaseId": case_id,
                "originalReceiptSha256": original_receipt_sha256,
                "manifestSha256": manifest["sha256"], "requiresCurrentTemplate": True}
            # Its saved document, preview, source and Operations receipt remain exact historical records.
        value["receivedFrom"] = deepcopy(origin)
        # Original selection/preparation/accepted hashes remain unmodified records under explicit provenance.
        value["requiresCurrentTemplate"] = True
        return value
    def apply():
        need(desk.db.execute("SELECT 1 FROM ops_installation_source_drafts WHERE program_id=? AND id=?",
                            (case_id, draft_id)).fetchone() is None, "The received current draft already exists.", status=409)
        for row in ledger["revisions"]:
            need(_sha(row["body_json"].encode()) == row["sha256"], "An original source revision hash changed.")
            old = _json(row["body_json"])
            current = relocated(old)
            raw = canonical(current)
            desk.db.execute("INSERT INTO ops_installation_source_revisions VALUES(?,?,?,?,?)",
                            (case_id, draft_id, row["revision"], raw, _sha(raw.encode())))
        state = relocated(ledger["state"])
        desk.db.execute("INSERT INTO ops_installation_source_drafts VALUES(?,?,?,?)",
                        (case_id, draft_id, state["revision"], canonical(state)))
        for row in ledger["preparations"]:
            value = relocated(_json(row["body_json"]))
            desk.db.execute("INSERT INTO ops_installation_source_preparations VALUES(?,?,?,?)",
                            (case_id, draft_id, row["id"], canonical(value)))
        for row in ledger["blobs"]:
            raw = files._read(originals / row["path"], MAX_JSON)
            need(len(raw) == row["bytes"] and _sha(raw) == row["sha256"], "A full original source blob changed.")
            desk.db.execute("INSERT INTO ops_installation_source_blobs VALUES(?,?,?,?,?)",
                            (case_id, draft_id, row["sha256"], row["bytes"], raw))
        return {"caseId": case_id, "draftId": draft_id, "revision": state["revision"], "origin": origin}
    payload = {"schema": ARCHIVE + ".source-desk-receive", "caseId": case_id, "draftId": draft_id,
               "manifestSha256": manifest["sha256"], "ledgerSha256": _sha(ledger_raw)}
    result = ops.workspace._transaction(request_id, payload, apply)
    # Exact sidecars are copied without translating any original upload intent, file receipt or native input.
    root = ResearchIntake(ops)._root(case_id, draft_id)
    custody = originals / "custody"
    if custody.exists():
        for row in manifest["files"]:
            if not row["path"].startswith("custody/"):
                continue
            relative = row["path"][len("custody/"):]
            target = root / relative
            current = root
            for part in Path(relative).parts[:-1]:
                current = files._directory(current / part)
            fd, _, _ = _stream_file(originals / row["path"], MAX_ARCHIVE, row)
            try:
                with os.fdopen(os.dup(fd), "rb") as stream:
                    _keep_stream(target, stream, row["bytes"], row["sha256"])
            finally:
                os.close(fd)
    received = files._directory(files._directory(root / "received") / manifest["sha256"])
    files._publish(received / "origin.json", _bytes(origin))
    files._publish(received / "original-ledger.json", ledger_raw)
    return result

def receive_installation(operations, archive_path, expected_sha256, *, request_id, actor, name, directory):
    need(isinstance(request_id, str) and UUID.fullmatch(request_id), "Keep the original receiving UUID.")
    _text(actor, "receiving operator", 300)
    _text(name, "receiving case name", 300)
    root = Path(directory).absolute()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    files._directory(root)
    selection = {"schema": ARCHIVE + ".receiving-selection", "requestId": request_id, "actor": actor,
                 "name": name, "archiveSha256": expected_sha256, "workspace": str(Path(operations.workspace.root).resolve())}
    files._publish(root / "selection.json", _bytes(selection))
    original = files._directory(root / "original")
    manifest, identity = _unpack_archive(Path(archive_path), expected_sha256, original)
    # Retain the whole incoming archive separately, not just expanded summaries.
    fd, _, _ = _stream_file(Path(archive_path), MAX_ARCHIVE, identity)
    try:
        with os.fdopen(os.dup(fd), "rb") as stream:
            _keep_stream(root / "Research_Installation_Original.zip", stream, identity["bytes"], identity["sha256"])
    finally:
        os.close(fd)
    _validate_ledger(_json(files._read(original / "source-desk" / "original-ledger.json", MAX_LEDGER)), manifest)
    native_path = original / "original-installation-case.zip"
    native = files._read(native_path, 320 * 1024 * 1024)
    case = operations.import_bundle(native, name, request_id, actor)
    saved = installations.get(operations, case["id"], manifest["installation"]["id"], manifest["installation"]["revision"])
    need({k: saved[k] for k in ("id", "revision", "sha256")} == manifest["installation"],
         "The received original Installation edition differs.")
    draft = _restore_desk(operations, case["id"], manifest, original,
                          str(uuid.uuid5(uuid.UUID(request_id), "source-desk-receiving")))
    intake = ResearchIntake(operations)
    projects = []
    for selected in manifest["originals"]:
        file, path = intake._file(case["id"], draft["draftId"], selected["id"])
        need(all(file[k] == selected[k] for k in selected), "The received selected whole Research source differs.")
        projects.append(intake._engine(case["id"], draft["draftId"], "receive", {"file": {**file, "path": str(path)},
            "directory": str(files._directory(root / "projects") / file["id"])}))
    result = {"schema": ARCHIVE + ".receiving", "state": "RECEIVED", "directory": str(root),
              "archive": identity, "manifestSha256": manifest["sha256"], "case": case,
              "installation": manifest["installation"], "draft": draft, "projects": projects,
              "files": manifest["files"], "originalLedger": {"path": "source-desk/original-ledger.json", "sha256": draft["origin"]["ledgerSha256"]}}
    # Later native project edits remain intact; receipt identity does not absorb current mutable revisions.
    prior_path = root / "received.json"
    if prior_path.exists():
        prior = _json(files._read(prior_path, MAX_JSON))
        need(all(prior.get(k) == result[k] for k in ("schema", "archive", "manifestSha256", "case", "installation", "draft", "files", "originalLedger")),
             "Keep this receiving directory bound to its original complete package.", "RESEARCH_INSTALLATION_RECEIVING_CONFLICT", 409)
        return prior
    files._publish(prior_path, _bytes(result))
    return result

ResearchIntake.receive_installation = staticmethod(receive_installation)


def _query(parsed, allowed, required=()):
    query = parse_qs(parsed.query, keep_blank_values=True)
    need(not set(query) - set(allowed) and all(len(v) == 1 for v in query.values()) and
         all(k in query for k in required), "Keep the exact original declared query.")
    return {k: v[0] for k, v in query.items()}

def _download(handler, descriptor, maximum, describe=False):
    file, path = descriptor["file"], Path(descriptor["path"])
    fd, before, _ = _stream_file(path, maximum, file)
    started = False
    try:
        if describe:
            handler.send(200, file)
            return
        name = file.get("name") or file.get("filename") or "Research_Source.bin"
        name = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
        handler.send_response(200)
        handler.send_header("Content-Type", "application/zip" if file.get("kind") == "installation-archive" else "application/octet-stream")
        handler.send_header("Content-Length", str(file["bytes"]))
        handler.send_header("Content-Disposition", 'attachment; filename="' + name + '"')
        handler.send_header("X-Content-SHA256", file["sha256"])
        handler.send_header("Cache-Control", "no-store")
        handler.send_header("X-Content-Type-Options", "nosniff")
        handler.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
        handler.end_headers()
        started = True
        if handler.command == "HEAD":
            return
        h, remaining = hashlib.sha256(), file["bytes"]
        while remaining:
            block = os.read(fd, min(1024 * 1024, remaining))
            need(bool(block), "The complete original download was interrupted.")
            remaining -= len(block)
            h.update(block)
            if remaining == 0:
                need(h.hexdigest() == file["sha256"] and files._identity(before) == files._identity(os.fstat(fd)),
                     "The original source changed during complete streaming.")
            handler.wfile.write(block)
    except BaseException as error:
        handler.close_connection = True
        if started:
            raise ConnectionResetError("The original whole download was interrupted.") from error
        raise
    finally:
        os.close(fd)

def register_static(static):
    static["/operations_installation_research.mjs"] = ("operations_installation_research.mjs", "text/javascript; charset=utf-8")
    static["/operations_installation_research.css"] = ("operations_installation_research.css", "text/css; charset=utf-8")
    static["/RESEARCH_INSTALLATION.md"] = ("RESEARCH_INSTALLATION.md", "text/markdown; charset=utf-8")

def handle(handler, parsed, operations, method):
    match = ROUTE.fullmatch(parsed.path)
    if not match:
        return False
    case_id, draft_id, action = match[1], match[2], match[3] or ""
    intake = ResearchIntake(operations)
    if method == "POST" and action == "import":
        keys = {"requestId", "actor", "kind", "name", "bytes", "sha256", "sourceUrl", "observedAt"}
        q = _query(parsed, keys, keys)
        need(handler.headers.get_content_type() == "application/octet-stream" and
             not handler.headers.get("Transfer-Encoding") and len(handler.headers.get_all("Content-Length", [])) == 1,
             "Send the complete original raw body with one Content-Length.", status=415)
        need(q["bytes"].isdigit() and handler.headers["Content-Length"].isdigit() and
             int(q["bytes"]) == int(handler.headers["Content-Length"]),
             "The original byte count differs from Content-Length.", status=400)
        result = intake.upload(case_id, draft_id, handler.rfile, request_id=q["requestId"], actor=q["actor"],
            kind=q["kind"], name=q["name"], size=int(q["bytes"]), sha256=q["sha256"],
            source_url=q["sourceUrl"], observed_at=q["observedAt"])
        handler.send(200, result)
    elif method == "GET" and re.fullmatch(r"requests/[^/]+", action):
        q = _query(parsed, {"actor"}, {"actor"})
        handler.send(200, intake.request(case_id, draft_id, action.split("/")[1], q["actor"]))
    elif method == "POST" and re.fullmatch(r"requests/[^/]+/resume", action):
        _query(parsed, set())
        body = handler.json_body()
        exact(body, ("actor",), "retained input resume")
        handler.send(200, intake.resume(case_id, draft_id, action.split("/")[1], body["actor"]))
    elif method == "GET" and re.fullmatch(r"original-requests/[^/]+", action):
        _query(parsed, set())
        root = intake._root(case_id, draft_id)
        origin = intake._origin(case_id, draft_id)
        request_id = action.split("/")[1]
        need(request_id in origin.get("requestIds", []), "Select a retained original request in this received source history.", status=404)
        selected, seen = origin["manifestSha256"], set()
        row, original_case = None, None
        while selected is not None:
            need(isinstance(selected, str) and SHA.fullmatch(selected) and selected not in seen,
                 "Keep the complete acyclic original receiving provenance.")
            seen.add(selected)
            ledger = _json(files._read(root / "received" / selected / "original-ledger.json", MAX_LEDGER))
            row = next((r for r in ledger["requests"] if r["request_id"] == request_id), None)
            if row is not None:
                original_case = ledger["caseId"]
                break
            selected = (ledger["state"].get("receivedFrom") or {}).get("manifestSha256")
        need(row is not None, "The original request is not present in this received source ledger.", status=404)
        handler.send(200, {"schema": ARCHIVE + ".original-request", "caseId": case_id,
                          "originCaseId": original_case, "draftId": draft_id, "record": row,
                          "qualification": "Immutable original receipt; never replay this original write as a new receiving-case operation."})
    elif method == "POST" and action in ("inspect", "template"):
        _query(parsed, set())
        fn = intake.inspect if action == "inspect" else intake.template
        handler.send(200, fn(case_id, draft_id, handler.json_body()))
    elif method == "GET" and re.fullmatch(r"files/research-[a-f0-9]{64}", action):
        q = _query(parsed, {"expectedSha256", "describe"}, {"expectedSha256"})
        value = intake.file_descriptor(case_id, draft_id, action.split("/")[1], q["expectedSha256"])
        _download(handler, value, LIMITS[value["file"]["kind"]], q.get("describe") == "1")
    elif method == "GET" and re.fullmatch(r"preparations/preparation-[a-f0-9]{64}/archive", action):
        q = _query(parsed, {"installationId", "revision", "describe", "expectedSha256"}, {"installationId", "revision"})
        need(q["revision"].isdigit(), "Select the actual saved Installation revision.")
        if q.get("expectedSha256"):
            value = intake.retained_archive(case_id, draft_id, action.split("/")[1], q["installationId"],
                int(q["revision"]), q["expectedSha256"])
        else:
            need(q.get("describe") == "1", "Describe the complete original archive, then download with that exact expectedSha256.", status=409)
            value = intake.export_installation(case_id, draft_id, action.split("/")[1], q["installationId"], int(q["revision"]),
                files._directory(intake._root(case_id, draft_id) / "exports"))
        _download(handler, value, MAX_ARCHIVE, q.get("describe") == "1")
    else:
        need(False, "Use the declared Research Installation source route.", "RESEARCH_INSTALLATION_ROUTE", 405)
    return True
