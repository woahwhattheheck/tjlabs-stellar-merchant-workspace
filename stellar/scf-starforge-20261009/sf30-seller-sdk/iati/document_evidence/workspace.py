"""MIT. Retained public-document evidence in the original IATI workspace."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import re
import stat
import threading
from urllib.parse import urlsplit

from iati_source import InputError
from workspace import (
    json_bytes, load_json, digest, checked_id, private_write, regular,
    file_digest, sync_dir,
)
from publishing import REQUEST
from .fetch import fetch_document

SCHEMA = "stellar-forge.iati-document-evidence.v1"
OBSERVATION = "stellar-forge.iati-document-observation.v1"
COMPARISON = "stellar-forge.iati-document-evidence-comparison.v1"
MAX_METADATA = 64 * 1024 * 1024
MAX_BODY = 64 * 1024 * 1024
MAX_PLAN_BYTES = 1024 * 1024 * 1024
MAX_DOCUMENTS = 500
DEFAULT_LIMITS = {"maxBytes": 16 * 1024 * 1024, "timeoutSeconds": 60,
                  "connectTimeoutSeconds": 10, "maxRedirects": 5}
LIMIT_RANGES = {"maxBytes": (1, MAX_BODY), "timeoutSeconds": (1, 120),
                "connectTimeoutSeconds": (1, 30), "maxRedirects": (0, 10)}
ACTION_FIELDS = {
    "save": {"requestId", "name", "selection", "documentRowIds", "limits", "notes", "actor"},
    "note": {"requestId", "id", "expectedRevision", "name", "notes", "actor"},
    "observe": {"requestId", "id", "expectedRevision", "rowIds", "acknowledgeNewObservation", "actor"},
    "review": {"requestId", "id", "expectedRevision", "actor", "note", "decisions"},
    "compare": {"requestId", "before", "after", "rowPairs", "actor", "notes"},
}
REVIEW_DECISIONS = {"usable", "needs_correction", "not_applicable", "deferred"}
FINAL_FETCH_STATES = {"COMPLETE", "TRUNCATED", "FAILED", "REFUSED"}
MEDIA_EXTENSIONS = {"application/pdf": ".pdf", "application/xml": ".xml", "text/xml": ".xml",
                    "text/html": ".html", "text/plain": ".txt", "application/json": ".json",
                    "text/csv": ".csv"}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def text(value, name, maximum=32000, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise InputError(name + " must be " + ("0" if empty else "1") + "–" + str(maximum) + " characters")
    return value if empty else value.strip()


def number(value, name="revision", minimum=1, maximum=None):
    if type(value) is not int or value < minimum or maximum is not None and value > maximum:
        raise InputError("Use a valid integer " + name)
    return value


def ids(value, name, maximum=MAX_DOCUMENTS, empty=False):
    if (not isinstance(value, list) or not empty and not value or len(value) > maximum
            or any(not isinstance(item, str) for item in value) or len(set(value)) != len(value)):
        raise InputError("Choose distinct " + name)
    for item in value:
        checked_id(item)
    return deepcopy(value)


def limits(value=None):
    if value is None:
        return dict(DEFAULT_LIMITS)
    if not isinstance(value, dict) or set(value) - set(DEFAULT_LIMITS):
        raise InputError("Unknown document acquisition limit")
    result = {**DEFAULT_LIMITS, **value}
    for key, (low, high) in LIMIT_RANGES.items():
        number(result[key], key, low, high)
    return result


def url_text(value):
    if not isinstance(value, str) or not value or len(value) > 16384 or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value):
        raise InputError("Use an explicit complete HTTP(S) URL without literal whitespace")
    try:
        parsed = urlsplit(value)
        valid = (parsed.scheme in {"http", "https"} and parsed.hostname
                 and parsed.username is None and parsed.password is None
                 and (parsed.port is None or 1 <= parsed.port <= 65535))
    except ValueError:
        valid = False
    if not valid:
        raise InputError("Use an explicit public HTTP(S) URL without credentials and with a valid port")
    return value


def sealed(value):
    result = deepcopy(value)
    result.pop("recordSha256", None)
    body = json_bytes(result)
    if len(body) + 128 > MAX_METADATA:
        raise InputError("The complete evidence record exceeds its 64 MiB metadata capacity")
    result["recordSha256"] = digest(body)
    return result


def verify_seal(value, schema):
    if not isinstance(value, dict) or value.get("schema") != schema:
        raise InputError("Unknown retained document-evidence schema")
    checked_id(value.get("id"))
    if sealed(value) != value:
        raise InputError("Retained document evidence differs from its immutable identity")
    return value


def selection_key(value):
    return {key: value[key] for key in ("id", "revision", "recordSha256")}


def row_observations(plan, row_id, observation):
    return [observation(ident) for ident in plan["observationIds"] if row_id in observation(ident)["rowIds"]]


def newest(plan, row_id, observation):
    for ident in reversed(plan["observationIds"]):
        value = observation(ident)
        if row_id in value["rowIds"]:
            return value
    return None


def document_complete(value):
    """Complete HTTP messages may still contain only a range or no document."""
    receipt, body = value.get("fetch") or {}, value.get("body")
    if (value.get("state") != "COMPLETE" or value.get("outcome") != "HTTP_SUCCESS"
            or receipt.get("status") in {204, 205, 206} or not body or not body.get("complete")):
        return False
    final = (receipt.get("hops") or [{}])[-1]
    return not any(str(key).lower() == "content-range" for key, _ in final.get("headers", []))


def observation_summary(value):
    if value is None:
        return None
    return {key: value[key] for key in ("id", "state", "outcome", "finishedAt", "body", "documentComplete")} | {
        "status": value["fetch"]["status"] if value.get("fetch") else None}


def evidence_binding(plan):
    return digest(json_bytes({key: plan[key] for key in ("selection", "documents", "observationIds")}))


class DocumentEvidence:
    """An additive model sharing the original mutex, database and workspace lease."""

    def __init__(self, workspace):
        self.ws = workspace
        self.root = workspace.root / "document-evidence"
        self.assets = self.root / "assets"
        self.requests_directory = self.root / "requests"
        for path in (self.root, self.assets, self.requests_directory):
            path.mkdir(mode=0o700, exist_ok=True)
            info = path.stat()
            if path.is_symlink() or path.resolve() != path or os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
                raise InputError("Document evidence must use the original private workspace directories")
        self.ws.db.executescript("""
          CREATE TABLE IF NOT EXISTS iati_document_evidence_plans(
            id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,revision));
          CREATE TABLE IF NOT EXISTS iati_document_evidence_requests(
            id TEXT PRIMARY KEY, input_sha TEXT NOT NULL, action TEXT NOT NULL, input TEXT NOT NULL,
            state TEXT NOT NULL, result TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_document_evidence_observations(id TEXT PRIMARY KEY, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_document_evidence_comparisons(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        """)
        self.active = set()
        self.closing = False
        self.condition = threading.Condition(self.ws.mutex)
        with self.ws.mutex:
            self._recover_interrupted()

    def close(self):
        with self.condition:
            self.closing = True
            while self.active:
                self.condition.wait(timeout=1)

    def _plan(self, raw):
        value = verify_seal(load_json(raw), SCHEMA)
        number(value.get("revision"))
        return value

    def plan(self, ident, revision=None):
        with self.ws.mutex:
            checked_id(ident)
            if revision is None:
                row = self.ws.db.execute("SELECT body FROM iati_document_evidence_plans WHERE id=? ORDER BY revision DESC LIMIT 1", (ident,)).fetchone()
            else:
                row = self.ws.db.execute("SELECT body FROM iati_document_evidence_plans WHERE id=? AND revision=?", (ident, number(revision))).fetchone()
            if row is None:
                raise InputError("Unknown saved document-evidence plan revision")
            return self._plan(row["body"])

    def history(self, ident):
        with self.ws.mutex:
            self.plan(ident)
            return [self._plan(row["body"]) for row in self.ws.db.execute(
                "SELECT body FROM iati_document_evidence_plans WHERE id=? ORDER BY revision", (ident,))]

    def observation(self, ident):
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT body FROM iati_document_evidence_observations WHERE id=?", (checked_id(ident),)).fetchone()
            if row is None:
                raise InputError("Unknown retained document observation")
            return verify_seal(load_json(row["body"]), OBSERVATION)

    def comparison(self, ident):
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT body FROM iati_document_evidence_comparisons WHERE id=?", (checked_id(ident),)).fetchone()
            if row is None:
                raise InputError("Unknown retained document-evidence comparison")
            return verify_seal(load_json(row["body"]), COMPARISON)

    def _summary(self, p):
        return {key: p[key] for key in ("id", "revision", "name", "state", "createdAt", "updatedAt", "selection", "recordSha256")} | {
            "documentCount": len(p["documents"]), "observationCount": len(p["observationIds"]),
            "reviewedCount": len(p["review"]["decisions"]) if p["review"] else 0,
            "retainedBodyBytes": self._used_bytes(p), "remainingBodyBytes": MAX_PLAN_BYTES - self._used_bytes(p)}

    def status(self):
        with self.ws.mutex:
            self._recover_interrupted()
            current = [self._plan(row["body"]) for row in self.ws.db.execute("""
                SELECT p.body FROM iati_document_evidence_plans p JOIN
                (SELECT id,MAX(revision) revision FROM iati_document_evidence_plans GROUP BY id) n
                ON p.id=n.id AND p.revision=n.revision ORDER BY p.id""")]
            parents = [{key: p[key] for key in ("id", "revision", "name", "state", "sourceId", "candidateSha256", "recordSha256")}
                       for p in self.ws.organisation.status()["plans"]]
            active = [self.request(row["id"]) for row in self.ws.db.execute(
                "SELECT id FROM iati_document_evidence_requests WHERE state='ACQUIRING' ORDER BY id")]
            return {"schema": SCHEMA, "workspaceSha256": self.ws.publishing.context()["workspaceSha256"],
                    "plans": [self._summary(p) for p in current], "organisationPlans": parents,
                    "activeRequests": active, "maxPlanBytes": MAX_PLAN_BYTES}

    def _result(self, selected):
        kind = selected["kind"]
        if kind == "comparison":
            return self.comparison(selected["id"])
        plan = self.plan(selected["planId"], selected["revision"])
        if kind == "observation":
            return {"plan": plan, "observation": self.observation(selected["id"])}
        return plan

    def request(self, request_id):
        if not isinstance(request_id, str) or not REQUEST.fullmatch(request_id):
            raise InputError("Use the original stable document-evidence requestId")
        with self.ws.mutex:
            self._recover_interrupted(request_id)
            row = self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE id=?", (request_id,)).fetchone()
            if row is None:
                return {"requestId": request_id, "state": "NOT_RECORDED"}
            value = {"requestId": request_id, "state": row["state"], "action": row["action"], "input": load_json(row["input"])}
            selected = load_json(row["result"])
            if row["state"] == "ACQUIRING":
                return {**value, "plan": self.plan(selected["planId"], selected["revision"]), "result": None}
            result = self._result(selected)
            plan = result["plan"] if selected["kind"] == "observation" else result if selected["kind"] == "plan" else None
            return {**value, "result": result, "plan": plan,
                    "observation": result["observation"] if selected["kind"] == "observation" else None}

    def _input(self, action, raw):
        if not isinstance(raw, dict) or set(raw) - ACTION_FIELDS[action]:
            raise InputError("Unknown document-evidence " + action + " fields")
        key = raw.get("requestId")
        if not isinstance(key, str) or not REQUEST.fullmatch(key):
            raise InputError("Use a stable document-evidence requestId")
        text(raw.get("actor"), "Named document-evidence operator", 160)
        body = json_bytes(raw)
        if len(body) > MAX_METADATA:
            raise InputError("The complete document-evidence request exceeds 64 MiB")
        row = self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE id=?", (key,)).fetchone()
        if row:
            if row["input_sha"] != digest(body) or row["action"] != action:
                raise InputError("This document-evidence requestId belongs to different complete input")
            self._recover_interrupted(key)
            row = self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE id=?", (key,)).fetchone()
            if row["state"] == "ACQUIRING":
                return self.request(key), body
            return self._result(load_json(row["result"])), body
        return None, body

    def _busy(self, ident):
        for row in self.ws.db.execute("SELECT result FROM iati_document_evidence_requests WHERE state='ACQUIRING'"):
            if load_json(row["result"])["planId"] == ident:
                return True
        return False

    def _previous(self, raw):
        p = self.plan(raw.get("id"))
        if number(raw.get("expectedRevision")) != p["revision"]:
            raise InputError("The document-evidence plan advanced; reopen its current revision before a new action")
        if self._busy(p["id"]):
            raise InputError("The original document acquisition is still settling for this plan")
        return p

    def _finish(self, value, previous, raw, action, at, origin=None):
        value = deepcopy(value)
        origin = previous["originWorkspace"] if previous else origin
        ident = previous["id"] if previous else digest(json_bytes({"schema": SCHEMA, "originWorkspace": origin, "requestId": raw["requestId"]}))
        value.update(schema=SCHEMA, id=ident, revision=previous["revision"] + 1 if previous else 1,
                     originWorkspace=origin, createdAt=previous["createdAt"] if previous else at, updatedAt=at,
                     actor=text(raw["actor"], "Named operator", 160),
                     previousRecordSha256=previous["recordSha256"] if previous else None,
                     event={"action": action, "requestId": raw["requestId"], "at": at, "actor": text(raw["actor"], "Named operator", 160)})
        return sealed(value)

    def _insert_plan(self, p, raw, action, body, selected=None, acquiring=False):
        result = selected or {"kind": "plan", "planId": p["id"], "revision": p["revision"]}
        with self.ws.db:
            self.ws.db.execute("INSERT INTO iati_document_evidence_plans VALUES(?,?,?)", (p["id"], p["revision"], json_bytes(p).decode()))
            if acquiring:
                self.ws.db.execute("UPDATE iati_document_evidence_requests SET state='RECORDED',result=? WHERE id=? AND state='ACQUIRING'",
                                   (json_bytes(result).decode(), raw["requestId"]))
            else:
                self.ws.db.execute("INSERT INTO iati_document_evidence_requests VALUES(?,?,?,?,?,?)",
                    (raw["requestId"], digest(body), action, body.decode(), "RECORDED", json_bytes(result).decode()))

    def _snapshot(self, raw):
        if not isinstance(raw, dict) or set(raw) != {"id", "revision", "view", "expectedSnapshot"}:
            raise InputError("Select the complete original organisation plan/revision/view/snapshot")
        checked_id(raw["id"]); number(raw["revision"]); checked_id(raw["expectedSnapshot"])
        if raw["view"] not in {"source", "candidate"}:
            raise InputError("Choose the original source or candidate document view")
        parent = self.ws.organisation.plan(raw["id"], raw["revision"])
        rows, offset = [], 0
        while True:
            page = self.ws.organisation.rows({**raw, "section": "documents", "offset": offset, "limit": 500})
            rows.extend(page["rows"])
            offset += len(page["rows"])
            if offset >= page["total"]:
                break
            if not page["rows"]:
                raise InputError("The original organisation document page made no progress")
        selection = {**deepcopy(raw), "recordSha256": parent["recordSha256"], "sourceId": parent["sourceId"],
                     "candidateSha256": parent["candidateSha256"],
                     "selectedSha256": parent["sourceId"] if raw["view"] == "source" else parent["candidateSha256"],
                     "organisationKeys": deepcopy(parent["organisationKeys"])}
        return parent, selection, rows

    def _new_plan(self, raw, at, origin):
        parent, selection, rows = self._snapshot(raw.get("selection"))
        selected = ids(raw.get("documentRowIds"), "original document row IDs")
        by_id = {r["id"]: r for r in rows}
        if any(ident not in by_id for ident in selected):
            raise InputError("A selected document is outside the original organisation snapshot")
        documents = []
        for ident in selected:
            detail = self.ws.organisation.detail({**raw["selection"], "rowId": ident})
            target = next((x for x in detail["targets"] if x["kind"] == "attribute" and x.get("attribute") == "url" and x["path"] == detail["targets"][0]["path"]), None)
            if target is None:
                raise InputError("The original document has no native URL correction target")
            documents.append({**deepcopy(by_id[ident]), "urlTarget": deepcopy(target)})
        value = {"name": text(raw.get("name"), "Document-evidence plan name", 160), "notes": text(raw.get("notes", ""), "Evidence notes", empty=True),
                 "selection": selection, "documents": documents, "limits": limits(raw.get("limits")),
                 "observationIds": [], "review": None, "state": "DRAFT"}
        return self._finish(value, None, raw, "save", at, origin)

    def save(self, raw):
        with self.ws.mutex:
            prior, body = self._input("save", raw)
            if prior is not None:
                return prior
            value = self._new_plan(raw, now(), self.ws.publishing.context()["workspaceSha256"])
            if self.ws.db.execute("SELECT 1 FROM iati_document_evidence_plans WHERE id=?", (value["id"],)).fetchone():
                raise InputError("This evidence identity already exists without its original save request")
            self._insert_plan(value, raw, "save", body)
            return value

    def _note_plan(self, raw, previous, at):
        value = {**previous, "name": text(raw.get("name"), "Evidence plan name", 160),
                 "notes": text(raw.get("notes", ""), "Evidence notes", empty=True)}
        return self._finish(value, previous, raw, "note", at)

    def note(self, raw):
        with self.ws.mutex:
            prior, body = self._input("note", raw)
            if prior is not None:
                return prior
            p = self._previous(raw)
            value = self._note_plan(raw, p, now())
            self._insert_plan(value, raw, "note", body)
            return value

    def _asset_path(self, descriptor):
        if not isinstance(descriptor, dict) or set(descriptor) - {"sha256", "bytes", "name", "media", "complete", "representation", "contentEncoding"}:
            raise InputError("Unknown retained document body descriptor")
        path = self.assets / (checked_id(descriptor["sha256"]) + ".bin")
        size = number(descriptor["bytes"], "body byte count", 0, MAX_METADATA)
        if file_digest(path, MAX_METADATA) != descriptor["sha256"] or path.stat().st_size != size:
            raise InputError("The retained document body differs from its complete declared bytes")
        return path

    def _retain_bytes(self, raw, name, media):
        if not isinstance(raw, bytes) or len(raw) > MAX_METADATA:
            raise InputError("The complete document-evidence output exceeds 64 MiB")
        key = digest(raw)
        path = self.assets / (key + ".bin")
        if path.exists() or path.is_symlink():
            if file_digest(path, MAX_METADATA) != key:
                raise InputError("Retained document-evidence output was changed")
        else:
            with self.ws.scratch() as temp:
                stage = temp / "document-evidence-output.bin"
                private_write(stage, raw)
                os.replace(stage, path)
                sync_dir(self.assets)
        return {"sha256": key, "bytes": len(raw), "name": name, "media": media}

    def _retain_file(self, path, ident, complete=False, encoding=None):
        size = regular(path, MAX_BODY).st_size
        key = file_digest(path, MAX_BODY)
        destination = self.assets / (key + ".bin")
        if destination.exists() or destination.is_symlink():
            if file_digest(destination, MAX_BODY) != key or destination.stat().st_size != size:
                raise InputError("A retained response asset changed")
        else:
            with self.ws.scratch() as temp:
                stage = temp / "document-response.bin"
                h, count = hashlib.sha256(), 0
                with path.open("rb") as incoming, os.fdopen(os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                    before = os.fstat(incoming.fileno())
                    while block := incoming.read(65536):
                        count += len(block)
                        if count > MAX_BODY:
                            raise InputError("The selected response exceeds its complete body limit")
                        h.update(block)
                        output.write(block)
                    after = os.fstat(incoming.fileno())
                    output.flush()
                    os.fsync(output.fileno())
                if (count != size or h.hexdigest() != key or
                    (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
                    (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)):
                    raise InputError("The original response body changed during retention")
                os.replace(stage, destination)
                sync_dir(self.assets)
        return {"sha256": key, "bytes": size, "name": "document-" + ident[:16] + (".bin" if complete else ".prefix.bin"),
                "media": "application/octet-stream", "complete": complete,
                "representation": "http-message-body", "contentEncoding": encoding}

    def _used_bytes(self, plan):
        bodies = {}
        for ident in plan["observationIds"]:
            body = self.observation(ident).get("body")
            if body is not None:
                bodies[body["sha256"]] = body["bytes"]
        return sum(bodies.values())

    def _observe_selection(self, raw, previous):
        selected = ids(raw.get("rowIds"), "document row IDs for one exact published URL")
        by_id = {row["id"]: row for row in previous["documents"]}
        if any(ident not in by_id for ident in selected):
            raise InputError("An observation row is outside the saved document selection")
        urls = {by_id[ident]["url"] for ident in selected}
        if len(urls) != 1:
            raise InputError("One observation must select rows sharing the exact same published URL")
        acknowledgement = raw.get("acknowledgeNewObservation", False)
        if type(acknowledgement) is not bool:
            raise InputError("Acknowledge a later document observation explicitly")
        if not acknowledgement and any(newest(previous, ident, self.observation) is not None for ident in selected):
            raise InputError("An earlier observation is retained; explicitly acknowledge a new network observation")
        return selected, next(iter(urls))

    def _observation_plan(self, raw, previous, observed, at):
        selected, published = self._observe_selection(raw, previous)
        if (observed["planId"] != previous["id"] or observed["requestId"] != raw["requestId"]
                or observed["rowIds"] != selected or observed["publishedUrl"] != published
                or observed["actor"] != text(raw["actor"], "Named operator", 160)):
            raise InputError("Observation identity differs from the original selected document request")
        value = {**previous, "observationIds": previous["observationIds"] + [observed["id"]],
                 "review": None, "state": "EVIDENCE_READY"}
        return self._finish(value, previous, raw, "observe", at)

    def _interrupted_body(self, reservation):
        """Read only the original carrier's identifiable bytes after owner exit."""
        directory = self.requests_directory / reservation["id"]
        if not directory.exists() and not directory.is_symlink():
            return None, "No response body was published before the acquisition ended."
        if directory.is_symlink() or directory.resolve(strict=True) != directory:
            raise InputError("The original interrupted acquisition directory is aliased")
        dinfo = directory.stat()
        if not stat.S_ISDIR(dinfo.st_mode) or os.name == "posix" and (dinfo.st_uid != os.getuid() or dinfo.st_mode & 0o077):
            raise InputError("The interrupted acquisition lost its original private directory")
        parent = os.open(directory, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0))
        try:
            opened_parent = os.fstat(parent)
            if (opened_parent.st_dev, opened_parent.st_ino) != (dinfo.st_dev, dinfo.st_ino):
                raise InputError("The interrupted acquisition directory changed while opening")
            names = os.listdir(parent)
            parts = sorted(name for name in names if re.fullmatch(r"\.iati-document-[0-9a-f]{32}\.part", name))
            known = (["body.bin"] if "body.bin" in names else []) + parts
            if not known:
                return None, "No identifiable response bytes were published. Unrecognized files remain in original custody."
            if len(parts) > 1:
                raise InputError("More than one interrupted response temporary remains; preserve and reconcile the original files before reopening")
            infos = {name: os.stat(name, dir_fd=parent, follow_symlinks=False) for name in known}
            signature = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
            first = infos[known[0]]
            expected_links = 2 if len(known) == 2 else 1
            for info in infos.values():
                if (not stat.S_ISREG(info.st_mode) or info.st_nlink != expected_links
                    or info.st_size > reservation["limits"]["maxBytes"]
                    or os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077)
                    or signature(info) != signature(first)):
                    raise InputError("Interrupted response files do not identify one original private byte source")
            fd = os.open(known[0], os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0), dir_fd=parent)
            try:
                if signature(os.fstat(fd)) != signature(first):
                    raise InputError("The interrupted response changed before its retained read")
                with self.ws.scratch() as temp:
                    copied = temp / "interrupted-response.bin"
                    with os.fdopen(os.open(copied, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                        count = 0
                        while block := os.read(fd, 65536):
                            count += len(block)
                            if count > reservation["limits"]["maxBytes"]:
                                raise InputError("The interrupted response grew beyond its frozen bound")
                            output.write(block)
                        output.flush()
                        os.fsync(output.fileno())
                    if count != first.st_size or signature(os.fstat(fd)) != signature(first):
                        raise InputError("The interrupted original response changed while being read")
                    for name in known:
                        if signature(os.stat(name, dir_fd=parent, follow_symlinks=False)) != signature(first):
                            raise InputError("An interrupted response name changed during retention")
                    parent_after = os.fstat(parent)
                    if (directory.resolve(strict=True) != directory
                        or (directory.stat().st_dev, directory.stat().st_ino) != (dinfo.st_dev, dinfo.st_ino)
                        or (parent_after.st_dev, parent_after.st_ino) != (dinfo.st_dev, dinfo.st_ino)):
                        raise InputError("The interrupted response parent changed during retention")
                    result = self._retain_file(copied, reservation["id"], complete=False)
            finally:
                os.close(fd)
            return result, "Actual bytes recovered from the original carrier. Their HTTP framing and receipt did not finish; even a zero-byte or published body remains incomplete."
        finally:
            os.close(parent)

    def _terminal_observation(self, reservation, raw, result=None, interrupted=False, reason=None):
        body_path = self.requests_directory / reservation["id"] / "body.bin"
        body = None
        if interrupted:
            body, prefix_note = self._interrupted_body(reservation)
            finished = now()
            value = {"schema": OBSERVATION, "id": reservation["id"], "requestId": raw["requestId"],
                     "planId": reservation["planId"], "rowIds": reservation["rowIds"],
                     "publishedUrl": reservation["publishedUrl"], "actor": text(raw["actor"], "Named operator", 160),
                     "startedAt": reservation["startedAt"], "finishedAt": finished,
                     "state": "INTERRUPTED", "outcome": "INTERRUPTED", "fetch": None, "body": body, "documentComplete": False,
                     "interruption": {"reconciledAt": finished, "reason": reason or "The original acquisition ended without a committed terminal receipt. No new request was made.", "retainedBytes": prefix_note}}
            return sealed(value)
        if not isinstance(result, dict) or result.get("schema") != "iati-public-document-fetch/1" or result.get("state") not in FINAL_FETCH_STATES:
            raise InputError("The original public-document carrier returned an unknown receipt")
        if result.get("requestedUrl") != reservation["publishedUrl"] or result.get("limits") != reservation["limits"]:
            raise InputError("The public-document receipt changed its frozen URL or limits")
        receipt = deepcopy(result)
        supplied_body = receipt.get("body")
        if supplied_body is not None:
            if not isinstance(supplied_body, dict) or Path(supplied_body.get("path", "")).absolute() != body_path:
                raise InputError("The document carrier returned another response body path")
            if type(supplied_body.get("complete")) is not bool or supplied_body.get("representation") != "http-message-body":
                raise InputError("The response body needs explicit completeness and representation")
            body = self._retain_file(body_path, reservation["id"], supplied_body["complete"], supplied_body.get("contentEncoding"))
            if supplied_body.get("sha256") != body["sha256"] or supplied_body.get("bytes") != body["bytes"]:
                raise InputError("The retained response differs from the actual carrier's bytes")
            if body["bytes"] > reservation["limits"]["maxBytes"]:
                raise InputError("The carrier exceeded the selected response prefix limit")
            receipt["body"] = deepcopy(body)
        elif body_path.exists():
            raise InputError("The carrier left response bytes outside its complete receipt")
        status = receipt.get("status")
        if status is not None:
            number(status, "HTTP status", 100, 599)
        state = receipt["state"]
        if state == "COMPLETE":
            if status is None or body is None or not body["complete"]:
                raise InputError("A completed HTTP receipt requires its complete actual body")
            outcome = "HTTP_SUCCESS" if 200 <= status < 300 else "HTTP_ERROR"
        elif state == "REFUSED":
            outcome = "REFUSED"
        elif body is not None or state == "TRUNCATED":
            outcome = "INCOMPLETE"
        else:
            outcome = "UNREACHABLE"
        if state != "COMPLETE" and body is not None and body["complete"]:
            raise InputError("An incomplete acquisition cannot declare a complete selected body")
        value = {"schema": OBSERVATION, "id": reservation["id"], "requestId": raw["requestId"],
                       "planId": reservation["planId"], "rowIds": reservation["rowIds"],
                       "publishedUrl": reservation["publishedUrl"], "actor": text(raw["actor"], "Named operator", 160),
                       "startedAt": reservation["startedAt"], "finishedAt": receipt["finishedAt"],
                       "state": state, "outcome": outcome, "fetch": receipt, "body": body}
        value["documentComplete"] = document_complete(value)
        return sealed(value)

    def _commit_observation(self, row, observed):
        raw = load_json(row["input"])
        reservation = load_json(row["result"])
        previous = self.plan(reservation["planId"])
        if previous["revision"] != reservation["revision"] or previous["recordSha256"] != reservation["recordSha256"]:
            raise InputError("The original evidence plan changed during its reserved acquisition")
        value = self._observation_plan(raw, previous, observed, observed["finishedAt"])
        selected = {"kind": "observation", "id": observed["id"], "planId": value["id"], "revision": value["revision"]}
        with self.ws.db:
            self.ws.db.execute("INSERT INTO iati_document_evidence_observations VALUES(?,?)", (observed["id"], json_bytes(observed).decode()))
            self.ws.db.execute("INSERT INTO iati_document_evidence_plans VALUES(?,?,?)", (value["id"], value["revision"], json_bytes(value).decode()))
            cursor = self.ws.db.execute("UPDATE iati_document_evidence_requests SET state='RECORDED',result=? WHERE id=? AND state='ACQUIRING'",
                                       (json_bytes(selected).decode(), row["id"]))
            if cursor.rowcount != 1:
                raise InputError("The original acquisition request no longer owns its reserved result")
        return {"plan": value, "observation": observed}

    def _recover_interrupted(self, request_id=None):
        if request_id is None:
            rows = list(self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE state='ACQUIRING' ORDER BY id"))
        else:
            rows = list(self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE state='ACQUIRING' AND id=?", (request_id,)))
        for row in rows:
            if row["id"] in self.active:
                continue
            raw, reservation = load_json(row["input"]), load_json(row["result"])
            observed = self._terminal_observation(reservation, raw, interrupted=True)
            self._commit_observation(row, observed)

    def observe(self, raw):
        with self.ws.mutex:
            prior, body = self._input("observe", raw)
            if prior is not None:
                return prior
            if self.closing:
                raise InputError("The original workspace is closing; reopen it before a new acquisition")
            previous = self._previous(raw)
            selected, published = self._observe_selection(raw, previous)
            if self._used_bytes(previous) + previous["limits"]["maxBytes"] > MAX_PLAN_BYTES:
                raise InputError("This evidence plan has insufficient remaining space for its selected capture bound; retain it and create a smaller explicit selection")
            ident = digest(json_bytes({"schema": OBSERVATION, "originWorkspace": previous["originWorkspace"], "requestId": raw["requestId"]}))
            reservation = {"kind": "acquiring", "id": ident, "planId": previous["id"], "revision": previous["revision"],
                           "recordSha256": previous["recordSha256"], "rowIds": selected, "publishedUrl": published,
                           "limits": previous["limits"], "startedAt": now()}
            with self.ws.db:
                self.ws.db.execute("INSERT INTO iati_document_evidence_requests VALUES(?,?,?,?,?,?)",
                    (raw["requestId"], digest(body), "observe", body.decode(), "ACQUIRING", json_bytes(reservation).decode()))
            self.active.add(raw["requestId"])
        try:
            directory = self.requests_directory / ident
            directory.mkdir(mode=0o700, exist_ok=False)
            if directory.resolve() != directory or directory.is_symlink():
                raise InputError("The original acquisition directory may not be aliased")
            result = fetch_document(published, directory / "body.bin", previous["limits"])
            with self.ws.mutex:
                current = self.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE id=?", (raw["requestId"],)).fetchone()
                if current is None or current["state"] != "ACQUIRING" or current["input_sha"] != digest(body):
                    raise InputError("The original acquisition request changed before its response was retained")
                observed = self._terminal_observation(reservation, raw, result=result)
                return self._commit_observation(current, observed)
        finally:
            with self.condition:
                self.active.discard(raw["requestId"])
                self.condition.notify_all()

    def _review_plan(self, raw, previous, at):
        decision_rows = raw.get("decisions")
        if not isinstance(decision_rows, list) or len(decision_rows) != len(previous["documents"]):
            raise InputError("Record exactly one named review decision for every selected document")
        by_id = {r["id"]: r for r in previous["documents"]}
        seen, decisions = set(), []
        for item in decision_rows:
            if not isinstance(item, dict) or set(item) - {"rowId", "observationId", "decision", "note", "correctedUrl"}:
                raise InputError("Unknown document review fields")
            row_id = checked_id(item.get("rowId"))
            if row_id not in by_id or row_id in seen:
                raise InputError("The document review repeats or adds a row outside this selection")
            seen.add(row_id)
            decision = item.get("decision")
            if decision not in REVIEW_DECISIONS:
                raise InputError("Choose an explicit document review decision")
            observation_id = item.get("observationId")
            if observation_id is not None:
                checked_id(observation_id)
                if observation_id not in previous["observationIds"] or row_id not in self.observation(observation_id)["rowIds"]:
                    raise InputError("The review observation belongs to another document or evidence revision")
            elif decision in {"usable", "needs_correction"}:
                raise InputError("This review decision needs an actual retained observation")
            if decision == "usable" and not self.observation(observation_id)["documentComplete"]:
                raise InputError("A usable decision requires a complete successful document response; retain other evidence as correction, deferred or not applicable")
            note = text(item.get("note", ""), "Document review note", 8000, decision == "usable")
            value = {"rowId": row_id, "observationId": observation_id, "decision": decision, "note": note}
            if "correctedUrl" in item:
                if decision != "needs_correction":
                    raise InputError("An explicit corrected URL belongs to a needs-correction decision")
                corrected = url_text(item["correctedUrl"])
                if corrected == by_id[row_id]["url"]:
                    raise InputError("A corrected URL must differ from the original published URL")
                value["correctedUrl"] = corrected
            decisions.append(value)
        decisions.sort(key=lambda d: next(i for i, r in enumerate(previous["documents"]) if r["id"] == d["rowId"]))
        review = {"actor": text(raw["actor"], "Named reviewer", 160), "note": text(raw.get("note", ""), "Complete evidence review note", empty=True),
                  "at": at, "decisions": decisions, "evidenceSha256": evidence_binding(previous)}
        review["id"] = digest(json_bytes({"planId": previous["id"], "requestId": raw["requestId"], **review}))
        value = {**previous, "review": review, "state": "REVIEWED"}
        return self._finish(value, previous, raw, "review", at)

    def review(self, raw):
        with self.ws.mutex:
            prior, body = self._input("review", raw)
            if prior is not None:
                return prior
            previous = self._previous(raw)
            value = self._review_plan(raw, previous, now())
            self._insert_plan(value, raw, "review", body)
            return value

    def _rows(self, plan):
        decisions = {item["rowId"]: item for item in (plan.get("review") or {}).get("decisions", [])}
        observed = {ident: self.observation(ident) for ident in plan["observationIds"]}
        result = []
        for row in plan["documents"]:
            related = [o for o in observed.values() if row["id"] in o["rowIds"]]
            result.append({**deepcopy(row), "observationIds": [o["id"] for o in related],
                "latestObservationSummary": observation_summary(related[-1] if related else None),
                "decision": deepcopy(decisions.get(row["id"]))})
        return result

    def _read_selection(self, raw, detail=False):
        allowed = {"id", "revision", "expectedSnapshot"} | ({"rowId"} if detail else {"offset", "limit"})
        if not isinstance(raw, dict) or set(raw) - allowed or not {"id", "revision"}.issubset(raw):
            raise InputError("Choose one complete saved evidence plan revision")
        plan = self.plan(raw["id"], number(raw["revision"]))
        if raw.get("expectedSnapshot") is not None and checked_id(raw["expectedSnapshot"]) != plan["recordSha256"]:
            raise InputError("The selected evidence page differs from its retained snapshot")
        return plan

    def rows(self, raw):
        with self.ws.mutex:
            plan = self._read_selection(raw)
            offset = number(raw.get("offset", 0), "page offset", 0)
            limit = number(raw.get("limit", 100), "page limit", 1, 500)
            rows = self._rows(plan)
            return {"rows": rows[offset:offset + limit], "total": len(rows),
                    "offset": offset, "limit": limit, "snapshotSha256": plan["recordSha256"]}

    def detail(self, raw):
        with self.ws.mutex:
            plan = self._read_selection(raw, detail=True)
            row = next((r for r in self._rows(plan) if r["id"] == checked_id(raw.get("rowId"))), None)
            if row is None:
                raise InputError("The document row is outside this saved evidence revision")
            selected = plan["selection"]
            original = self.ws.organisation.detail({key: selected[key] for key in
                ("id", "revision", "view", "expectedSnapshot")} | {"rowId": row["id"]})
            return {"row": row, "observations": [self.observation(key) for key in row["observationIds"]],
                    "snapshotSha256": plan["recordSha256"], "organisationDetail": original}

    def _comparison_selection(self, raw):
        if not isinstance(raw, dict) or set(raw) != {"id", "revision"}:
            raise InputError("Choose an explicit evidence plan ID and revision for each comparison side")
        return self.plan(raw["id"], number(raw["revision"]))

    def _automatic_pairs(self, before, after, left, right):
        if before["selection"]["sourceId"] != after["selection"]["sourceId"]:
            return [], {"mode": "UNPAIRED", "reason": "Different original publishers or editions require explicit row pairs."}
        parents, edits, changes = [], [], []
        for plan in (before, after):
            p = self.ws.organisation.plan(plan["selection"]["id"], plan["selection"]["revision"])
            parents.append(p)
            candidate = plan["selection"]["view"] == "candidate"
            edits.append(p["edits"] if candidate else [])
            changes.append(p["changes"] if candidate else [])
        shared = 0
        for x, y in zip(*edits):
            if x != y:
                break
            shared += 1
        # Same original rule as OrganisationPlanner: scalar changes and ordered
        # append preserve row paths; removal or organisation replacement may not.
        divergent = changes[0][shared:] + changes[1][shared:]
        structural = any(c["operation"] == "remove" or
            c["operation"] == "replace" and re.fullmatch(
                r"/iati-organisations\[1\]/iati-organisation\[[1-9][0-9]*\]", c["path"])
            for c in divergent)
        if structural:
            return [], {"mode": "UNPAIRED", "reason": "Divergent structural corrections require explicit original row pairs."}
        return [{"beforeRowId": key, "afterRowId": key} for key in sorted(set(left) & set(right))], {
            "mode": "SAME_SOURCE", "reason": "These cumulative changes preserve the original document row paths."}

    def _make_comparison(self, raw, before, after):
        left = {r["id"]: r for r in self._rows(before)}
        right = {r["id"]: r for r in self._rows(after)}
        pairs = raw.get("rowPairs")
        pairing = {"mode": "EXPLICIT", "reason": "Named operator selected these one-to-one original document rows."}
        if pairs is None:
            pairs, pairing = self._automatic_pairs(before, after, left, right)
        if not isinstance(pairs, list) or len(pairs) > MAX_DOCUMENTS:
            raise InputError("Use up to 500 explicit one-to-one document pairs")
        used_left, used_right, rows = set(), set(), []
        for pair in pairs:
            if not isinstance(pair, dict) or set(pair) != {"beforeRowId", "afterRowId"}:
                raise InputError("Each comparison pair selects two complete original row IDs")
            a, b = pair["beforeRowId"], pair["afterRowId"]
            checked_id(a); checked_id(b)
            if a not in left or b not in right or a in used_left or b in used_right:
                raise InputError("Comparison rows must be present and one-to-one")
            used_left.add(a); used_right.add(b)
            x, y = left[a], right[b]
            xo, yo = x["latestObservationSummary"], y["latestObservationSummary"]
            complete = xo and yo and xo["documentComplete"] and yo["documentComplete"]
            xb, yb = (xo or {}).get("body"), (yo or {}).get("body")
            encoding = lambda v: str((v or {}).get("contentEncoding") or "identity").strip().lower()
            comparable = complete and encoding(xb) == encoding(yb)
            content = ("same" if xb["sha256"] == yb["sha256"] else "changed") if comparable else "indeterminate"
            keys = sorted((set(x) | set(y)) - {"observationIds", "latestObservationSummary"})
            changes = [{"field": key, "before": deepcopy(x.get(key)), "after": deepcopy(y.get(key))}
                       for key in keys if x.get(key) != y.get(key)]
            if xo != yo:
                changes.append({"field": "observation", "before": deepcopy(xo), "after": deepcopy(yo)})
            rows.append({"beforeRowId": a, "afterRowId": b, "before": x, "after": y,
                         "content": content, "changes": changes})
        for key in sorted(set(left) - used_left):
            rows.append({"beforeRowId": key, "afterRowId": None, "before": left[key], "after": None,
                         "content": "removed", "changes": []})
        for key in sorted(set(right) - used_right):
            rows.append({"beforeRowId": None, "afterRowId": key, "before": None, "after": right[key],
                         "content": "added", "changes": []})
        identity = {"request": raw, "before": before["recordSha256"], "after": after["recordSha256"]}
        return sealed({"schema": COMPARISON, "id": digest(json_bytes(identity)),
            "before": selection_key(before), "after": selection_key(after), "rows": rows,
            "summary": {"pairs": len(pairs), "added": len(right) - len(used_right),
                        "removed": len(left) - len(used_left),
                        "sameCompleteBodies": sum(r["content"] == "same" for r in rows),
                        "changedCompleteBodies": sum(r["content"] == "changed" for r in rows),
                        "indeterminate": sum(r["content"] == "indeterminate" for r in rows)},
            "rowPairs": deepcopy(pairs), "automaticPairing": pairing,
            "actor": text(raw["actor"], "Named comparison operator", 160),
            "notes": text(raw.get("notes", ""), "Comparison notes", empty=True)})

    def compare(self, raw):
        with self.ws.mutex:
            prior, body = self._input("compare", raw)
            if prior is not None:
                return prior
            before, after = (self._comparison_selection(raw.get(key)) for key in ("before", "after"))
            result = self._make_comparison(raw, before, after)
            selected = {"kind": "comparison", "id": result["id"]}
            with self.ws.db:
                self.ws.db.execute("INSERT INTO iati_document_evidence_comparisons VALUES(?,?)",
                                   (result["id"], json_bytes(result).decode()))
                self.ws.db.execute("INSERT INTO iati_document_evidence_requests VALUES(?,?,?,?,?,?)",
                    (raw["requestId"], digest(body), "compare", body.decode(), "RECORDED", json_bytes(selected).decode()))
            return result

    def _correction(self, plan, current=True):
        selected = plan["selection"]
        parent = self.ws.organisation.plan(selected["id"], selected["revision"])
        if parent["recordSha256"] != selected["recordSha256"]:
            raise InputError("The original organisation correction base differs")
        actual = self.ws.organisation.plan(selected["id"]) if current else parent
        changes, edits = [], deepcopy(parent["edits"])
        rows = {row["id"]: row for row in plan["documents"]}
        review = plan.get("review")
        if review and review["evidenceSha256"] != evidence_binding(plan):
            raise InputError("The saved evidence review does not bind these observations")
        for item in (review or {}).get("decisions", []):
            if item.get("correctedUrl") is None:
                continue
            row = rows[item["rowId"]]
            target = row["urlTarget"]
            changes.append({"rowId": row["id"], "observationId": item["observationId"],
                "fromUrl": row["url"], "toUrl": item["correctedUrl"],
                "targetId": target["id"], "beforeSha256": target["beforeSha256"]})
            edits.append({"targetId": target["id"], "beforeSha256": target["beforeSha256"],
                          "operation": "attribute", "attribute": "url", "value": item["correctedUrl"]})
        reason = None
        if selected["view"] == "source" and parent["edits"] and changes:
            reason = "The selected source view precedes existing candidate edits. Select and review the candidate view before preparing a URL correction."
        request = None
        if changes and reason is None:
            request = {"requestId": "document-evidence-" + plan["id"] + "-" + str(plan["revision"]),
                       "id": parent["id"], "expectedRevision": parent["revision"], "name": parent["name"],
                       "sourceId": parent["sourceId"], "organisationKeys": deepcopy(parent["organisationKeys"]),
                       "assessment": deepcopy(parent["assessment"]), "acquisition": deepcopy(parent["acquisition"]),
                       "edits": edits, "notes": parent["notes"], "actor": review["actor"]}
        return {"schema": "stellar-forge.iati-document-correction-draft.v1",
                "evidence": {**selection_key(plan), "reviewId": review["id"] if review else None},
                "organisation": selection_key(parent), "currentOrganisationRevision": actual["revision"],
                "rebaseRequired": actual["revision"] != parent["revision"] or reason is not None,
                "request": request, "changes": changes,
                "requestSha256": digest(json_bytes(request)) if request is not None else None,
                "semantics": reason or ("Explicit draft for the original Organisation planner; the original revision guard and subsequent named review remain required. No XML was changed.")}

    def correction(self, ident, revision):
        with self.ws.mutex:
            return self._correction(self.plan(ident, number(revision)))

    def file(self, raw):
        with self.ws.mutex:
            if not isinstance(raw, dict) or set(raw) != {"id", "revision", "kind"}:
                raise InputError("Choose the exact evidence revision and original output kind")
            plan = self.plan(raw["id"], number(raw["revision"]))
            kind = raw["kind"]
            from .reports import report_html, register_csv
            if kind == "report":
                data = report_html(plan, self._rows(plan), [self.observation(i) for i in plan["observationIds"]])
                name, media = "document-evidence-report.html", "text/html; charset=utf-8"
            elif kind == "register":
                data = register_csv(plan, self._rows(plan))
                name, media = "document-evidence-register.csv", "text/csv; charset=utf-8"
            elif kind == "plan":
                data = json_bytes(plan)
                name, media = "document-evidence-plan.json", "application/json"
            elif kind == "correction":
                draft = self._correction(plan, current=False)
                if draft["request"] is None:
                    raise InputError("This revision has no applicable reviewed URL correction request")
                data = json_bytes(draft["request"])
                name, media = "organisation-url-correction-request.json", "application/json"
            else:
                raise InputError("Choose report, register, plan or correction")
            descriptor = self._retain_bytes(data, name, media)
            return {**descriptor, "path": str(self._asset_path(descriptor))}

    def body(self, observation_id):
        with self.ws.mutex:
            observed = self.observation(observation_id)
            if observed["body"] is None:
                raise InputError("This observation did not retain HTTP response bytes")
            descriptor = observed["body"]
            return {**descriptor, "path": str(self._asset_path(descriptor))}

    def export(self, raw):
        with self.ws.mutex:
            if not isinstance(raw, dict) or set(raw) - {"id", "revision", "output"} or not {"id", "output"}.issubset(raw):
                raise InputError("Choose one complete evidence plan ZIP output")
            selected = self.plan(raw["id"], raw.get("revision"))
            if self._busy(selected["id"]):
                raise InputError("The original acquisition is settling; reopen its retained request before exporting")
            from .portable import export_plan
            return export_plan(self, selected, raw["output"])

    def receive(self, raw):
        if not isinstance(raw, dict) or set(raw) != {"path"}:
            raise InputError("Receive the one complete original evidence packet path")
        with self.ws.mutex:
            from .portable import receive_plan
            return receive_plan(self, raw["path"])
