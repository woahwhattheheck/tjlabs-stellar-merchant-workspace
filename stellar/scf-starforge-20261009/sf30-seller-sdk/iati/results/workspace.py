"""MIT. Results work in the existing IATI workspace, mutex, database and lease."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import stat
import tempfile

from iati_source import InputError, fingerprint
from workspace import checked_id, digest, json_bytes, load_json, regular, file_digest, sync_dir
from .model import (
    CONTRACT, PROJECTION, project_source, selection, build_report, compare_reports,
)

EDITION = "stellar-forge.iati-results-edition.v1"
RECEIVING = "stellar-forge.iati-results-receipt.v1"
SNAPSHOT = "stellar-forge.iati-results-project.v1"
MAX_BODY = 64 * 1024 * 1024
REQUEST = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,159}\Z")


def utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def text(value, name, maximum=160, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise InputError(name + " requires " + ("nonempty " if not empty else "") + "bounded text")
    return value


def positive(value, name="revision"):
    if type(value) is not int or value < 1:
        raise InputError("Select an original positive " + name)
    return value


def object_input(raw, allowed, required):
    if not isinstance(raw, dict) or set(raw) - set(allowed) or set(required) - set(raw):
        raise InputError("Use the complete documented results input fields")


def review(value):
    object_input(value, {"status", "reviewer", "note"}, {"status", "reviewer", "note"})
    if value["status"] not in ("draft", "reviewed", "needs-correction"):
        raise InputError("Select draft, reviewed or needs-correction")
    return {"status": value["status"],
        "reviewer": text(value["reviewer"], "Named reviewer", 160, value["status"] == "draft"),
        "note": text(value["note"], "Review note", 16000, value["status"] == "draft")}


def verify_edition(value):
    required = {"schema", "id", "revision", "parentRevision", "createdAt", "savedAt",
        "definition", "projections", "report", "sha256"}
    if not isinstance(value, dict) or set(value) != required or value["schema"] != EDITION:
        raise InputError("Unsupported complete results edition")
    checked_id(value["id"])
    positive(value["revision"])
    if value["parentRevision"] is not None and (
        positive(value["parentRevision"]) >= value["revision"]):
        raise InputError("An edition parent must be an earlier original revision")
    actual = fingerprint({k: v for k, v in value.items() if k != "sha256"})
    if value["sha256"] != actual:
        raise InputError("A retained results edition changed")
    return value


class IatiResults:
    """One additive domain; the original Workspace owns process lifetime and locking."""
    def __init__(self, workspace):
        self.ws, self.db = workspace, workspace.db
        self.root = workspace.root / "results"
        with workspace.mutex:
            for path in (self.root, self.root / "blobs", self.root / "tmp"):
                path.mkdir(mode=0o700, exist_ok=True)
                info = path.lstat()
                if (not stat.S_ISDIR(info.st_mode) or path.is_symlink() or path.resolve() != path
                    or (os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077))):
                    raise InputError("Keep results in the original private operator-owned workspace")
            self.db.executescript("""
                CREATE TABLE IF NOT EXISTS iati_results_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_results_projections(
                    id TEXT PRIMARY KEY, source TEXT NOT NULL, metadata_sha TEXT NOT NULL, body TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS iati_results_projection_source ON iati_results_projections(source,metadata_sha);
                CREATE TABLE IF NOT EXISTS iati_results_editions(
                    id TEXT NOT NULL, revision INTEGER NOT NULL, sha TEXT NOT NULL, body TEXT NOT NULL,
                    PRIMARY KEY(id,revision));
                CREATE TABLE IF NOT EXISTS iati_results_heads(id TEXT PRIMARY KEY, revision INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_results_requests(
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, input_sha TEXT NOT NULL,
                    project TEXT NOT NULL, input TEXT NOT NULL, response TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_results_comparisons(
                    id TEXT PRIMARY KEY, project TEXT NOT NULL, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS iati_results_receipts(
                    id TEXT PRIMARY KEY, project TEXT NOT NULL, body TEXT NOT NULL);
            """)
            with self.db:
                self.db.execute("INSERT OR IGNORE INTO iati_results_metadata VALUES(?,?)",
                                ("workspace_id", digest(os.urandom(32))))
            self.workspace_id = self.db.execute("SELECT value FROM iati_results_metadata WHERE key=?",
                                                ("workspace_id",)).fetchone()["value"]

    def _encoded(self, value):
        encoded = json_bytes(value)
        if len(encoded) > MAX_BODY:
            raise InputError("The complete results record exceeds 64 MiB")
        return encoded

    def _blob(self, data):
        if not isinstance(data, bytes) or len(data) > MAX_BODY:
            raise InputError("The complete results object exceeds 64 MiB")
        identity = digest(data)
        path = self.root / "blobs" / (identity + ".json")
        if path.exists():
            if regular(path, MAX_BODY).st_size != len(data) or file_digest(path, MAX_BODY) != identity:
                raise InputError("An existing results object changed")
        else:
            fd, name = tempfile.mkstemp(prefix="results-", dir=self.root / "tmp")
            temporary = Path(name)
            try:
                with os.fdopen(fd, "wb") as output:
                    os.fchmod(output.fileno(), 0o600)
                    output.write(data)
                    output.flush()
                    os.fsync(output.fileno())
                # Original workspace lease + mutex owns this create-only identity.
                if path.exists():
                    if file_digest(path, MAX_BODY) != identity:
                        raise InputError("A results object identity conflicts")
                else:
                    os.replace(temporary, path)
                    sync_dir(path.parent)
            finally:
                temporary.unlink(missing_ok=True)
        return {"sha256": identity, "bytes": len(data)}

    def _blob_value(self, descriptor):
        if not isinstance(descriptor, dict) or set(descriptor) != {"sha256", "bytes"} or type(descriptor["bytes"]) is not int:
            raise InputError("Use the exact retained results object descriptor")
        path = self.root / "blobs" / (checked_id(descriptor["sha256"]) + ".json")
        if regular(path, MAX_BODY).st_size != descriptor["bytes"] or file_digest(path, MAX_BODY) != descriptor["sha256"]:
            raise InputError("The retained results object differs from its identity")
        return load_json(path.read_bytes())

    def _source_file(self, source_id):
        source = self.ws.source(source_id)
        path = self.ws.root / "sources" / (source_id + "." + self.ws.kind)
        if regular(path).st_size != source["bytes"] or file_digest(path) != source_id:
            raise InputError("The retained original publisher bytes changed")
        return path

    def _project(self, source):
        path = self._source_file(source["id"])
        before = path.stat()
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(fd, "rb") as stream:
            current = os.fstat(stream.fileno())
            if (current.st_dev, current.st_ino, current.st_size) != (before.st_dev, before.st_ino, before.st_size):
                raise InputError("The selected original publisher changed before projection")
            value = project_source(source, stream)
            after = os.fstat(stream.fileno())
            if (current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (
                    after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise InputError("The original publisher changed while it was being projected")
        return value

    def _retain_projection(self, value):
        if value["projectionSha256"] != fingerprint({k: v for k, v in value.items() if k != "projectionSha256"}):
            raise InputError("The complete original projection identity changed")
        encoded = self._encoded(value)
        descriptor = self._blob(encoded)
        record = {"id": value["projectionSha256"], "source": deepcopy(value["source"]),
                  "analysisContractSha256": fingerprint(value["analysisContract"]), "file": descriptor}
        prior = self.db.execute("SELECT body FROM iati_results_projections WHERE id=?", (record["id"],)).fetchone()
        if prior and load_json(prior["body"]) != record:
            raise InputError("An original projection identity has another descriptor")
        self.db.execute("INSERT OR IGNORE INTO iati_results_projections VALUES(?,?,?,?)",
            (record["id"], record["source"]["id"], fingerprint(record["source"]), self._encoded(record).decode()))
        return record

    def project_source(self, source_id):
        with self.ws.mutex:
            full = self.ws.source(source_id)
            source = {k: full[k] for k in ("id", "label", "name", "bytes")}
            prior = self.db.execute(
                "SELECT id FROM iati_results_projections WHERE source=? AND metadata_sha=? ORDER BY id",
                (source_id, fingerprint(source))).fetchall()
            for row in prior:
                record, value = self.projection(row["id"])
                if value["analysisContract"] == CONTRACT:
                    return {"projection": record, "counts": value["counts"], "findings": value["findings"],
                            "sourceMetadata": value["sourceMetadata"]}
            value = self._project(source)
            with self.db:
                record = self._retain_projection(value)
            return {"projection": record, "counts": value["counts"], "findings": value["findings"],
                    "sourceMetadata": value["sourceMetadata"]}

    def projection(self, ident):
        with self.ws.mutex:
            row = self.db.execute("SELECT body FROM iati_results_projections WHERE id=?", (checked_id(ident),)).fetchone()
            if row is None:
                raise InputError("Unknown original results projection")
            record = load_json(row["body"])
            value = self._blob_value(record["file"])
            if (value.get("schema") != PROJECTION or value["projectionSha256"] != ident
                or fingerprint({k: v for k, v in value.items() if k != "projectionSha256"}) != ident
                or value["source"] != record["source"]):
                raise InputError("The retained original projection changed")
            self._source_file(record["source"]["id"])
            return record, value

    def browse(self, projection_id, *, offset=0, limit=50, search="", measure=""):
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100:
            raise InputError("Choose an original nonnegative offset and 1–100 rows")
        text(search, "Search", 256, True)
        record, value = self.projection(projection_id)
        selected = [i for i in value["indicators"] if
                    (not measure or i["measure"] == measure) and
                    (not search or search.casefold() in " ".join((i["activityId"], i["title"], i["resultTitle"])).casefold())]
        rows = []
        for item in selected[offset:offset + limit]:
            rows.append({k: item[k] for k in ("key", "source", "locator", "activityId", "reportingOrgRef",
                "title", "resultTitle", "resultType", "measure", "measureLabel", "ascending", "aggregationStatus")})
            rows[-1].update(baselines=len(item["baselines"]), periods=len(item["periods"]),
                targets=sum(len(p["targets"]) for p in item["periods"]),
                actuals=sum(len(p["actuals"]) for p in item["periods"]))
        return {"projection": record, "sourceCounts": value["counts"], "rows": rows, "total": len(selected),
                "offset": offset, "nextOffset": offset + limit if offset + limit < len(selected) else None}

    def indicator(self, projection_id, key):
        _, value = self.projection(projection_id)
        item = next((i for i in value["indicators"] if i["key"] == checked_id(key)), None)
        if item is None:
            raise InputError("Indicator is outside that exact original projection")
        return deepcopy(item)

    def inventory(self):
        with self.ws.mutex:
            projects = []
            for row in self.db.execute("SELECT id,revision FROM iati_results_heads ORDER BY id"):
                edition = self.project(row["id"], row["revision"])
                projects.append({"id": edition["id"], "revision": edition["revision"],
                    "name": edition["definition"]["name"], "review": edition["definition"]["review"],
                    "savedAt": edition["savedAt"], "sha256": edition["sha256"],
                    "counts": edition["report"]["counts"]})
            return {"schema": "stellar-forge.iati-results-inventory.v1", "workspaceId": self.workspace_id, "analysisContract": CONTRACT,
                "projects": projects,
                "projections": [load_json(r["body"]) for r in self.db.execute(
                    "SELECT body FROM iati_results_projections ORDER BY source,id")],
                "receipts": [load_json(r["body"]) for r in self.db.execute(
                    "SELECT body FROM iati_results_receipts ORDER BY id")]}

    def _request(self, raw, kind):
        request = raw.get("requestId") if isinstance(raw, dict) else None
        if not isinstance(request, str) or not REQUEST.fullmatch(request):
            raise InputError("Choose a unique 1–160 character results requestId")
        encoded = self._encoded(raw)
        row = self.db.execute("SELECT * FROM iati_results_requests WHERE id=?", (request,)).fetchone()
        if row:
            if row["kind"] != kind or row["input_sha"] != digest(encoded):
                raise InputError("This results requestId already selects different work")
            response = load_json(row["response"])
            if kind != "cancel" and response.get("schema") == "stellar-forge.iati-results-cancelled-request.v1":
                raise InputError("This original results request was explicitly cancelled before commit")
            return request, digest(encoded), response
        return request, digest(encoded), None

    def operation(self, request):
        if not isinstance(request, str) or not REQUEST.fullmatch(request):
            raise InputError("Use the exact original request identifier")
        with self.ws.mutex:
            row = self.db.execute("SELECT * FROM iati_results_requests WHERE id=?", (request,)).fetchone()
            return {"requestId": request, "found": False} if row is None else {
                "requestId": request, "found": True, "kind": row["kind"],
                "inputSha256": row["input_sha"], "input": load_json(row["input"]),
                "response": load_json(row["response"]), "state": "CANCELLED" if load_json(row["response"]).get("schema") ==
                "stellar-forge.iati-results-cancelled-request.v1" else "COMPLETE"}

    def cancel(self, raw):
        """Cancel an exact uncommitted input under the same original workspace mutex."""
        with self.ws.mutex:
            request, input_sha, replay = self._request(raw, "cancel")
            if replay is not None:
                return replay
            object_input(raw, {"requestId", "targetKind", "targetInput", "reason"},
                               {"requestId", "targetKind", "targetInput", "reason"})
            kind, target = raw["targetKind"], raw["targetInput"]
            if kind not in ("save", "compare", "adopt") or not isinstance(target, dict):
                raise InputError("Cancel one exact original results edit, comparison or head selection")
            target_request = target.get("requestId")
            if not isinstance(target_request, str) or not REQUEST.fullmatch(target_request) or target_request == request:
                raise InputError("Select the original request ID and a distinct cancellation request ID")
            if self.db.execute("SELECT 1 FROM iati_results_requests WHERE id=?", (target_request,)).fetchone():
                raise InputError("The original request is already retained; read its exact result")
            project = target.get("id", "")
            if project:
                self.project(project)
            response = {"schema": "stellar-forge.iati-results-cancelled-request.v1",
                "requestId": target_request, "kind": kind, "project": project,
                "inputSha256": digest(self._encoded(target)), "cancelledAt": utc(),
                "cancellationRequestId": request, "reason": text(raw["reason"], "Cancellation reason", 4000)}
            with self.db:
                self._save_request(target_request, kind, response["inputSha256"], project, target, response)
                self._save_request(request, "cancel", input_sha, project, raw, response)
            return response

    def _save_request(self, request, kind, input_sha, project, raw, response):
        self.db.execute("INSERT INTO iati_results_requests VALUES(?,?,?,?,?,?)",
            (request, kind, input_sha, project, self._encoded(raw).decode(), self._encoded(response).decode()))

    def project(self, ident, revision=None):
        checked_id(ident)
        with self.ws.mutex:
            if revision is None:
                row = self.db.execute("SELECT revision FROM iati_results_heads WHERE id=?", (ident,)).fetchone()
                if row is None:
                    raise InputError("Unknown saved results project")
                revision = row["revision"]
            positive(revision)
            row = self.db.execute("SELECT body,sha FROM iati_results_editions WHERE id=? AND revision=?",
                                  (ident, revision)).fetchone()
            if row is None:
                raise InputError("Unknown original results revision")
            value = verify_edition(load_json(row["body"]))
            if value["sha256"] != row["sha"]:
                raise InputError("The retained results revision index changed")
            return value

    def history(self, ident):
        checked_id(ident)
        with self.ws.mutex:
            values = [verify_edition(load_json(r["body"])) for r in self.db.execute(
                "SELECT body FROM iati_results_editions WHERE id=? ORDER BY revision", (ident,))]
            if not values:
                raise InputError("Unknown saved results project")
            head = self.db.execute("SELECT revision FROM iati_results_heads WHERE id=?", (ident,)).fetchone()
            return {"id": ident, "headRevision": head["revision"], "editions": values}

    def _definition(self, raw):
        sources = raw["sources"]
        if not isinstance(sources, list) or not 1 <= len(sources) <= 32 or any(not isinstance(s, str) for s in sources) or len(set(sources)) != len(sources):
            raise InputError("Select 1–32 distinct complete original publisher source IDs")
        sources = sorted(checked_id(s) for s in sources)
        selected = selection(raw.get("selection", {}))
        return {"name": text(raw["name"], "Project name", 160),
            "notes": text(raw.get("notes", ""), "Project notes", 16000, True),
            "sources": sources, "selection": selected, "review": review(raw.get("review", {
                "status": "draft", "reviewer": "", "note": ""})),
            "interpretations": deepcopy(raw.get("interpretations", [])),
            "bindings": deepcopy(raw.get("bindings", []))}

    def preview(self, raw):
        with self.ws.mutex:
            object_input(raw, {"name", "notes", "sources", "selection", "review", "interpretations", "bindings"},
                               {"name", "sources"})
            definition = self._definition(raw)
            records, values = [], []
            for source in definition["sources"]:
                captured = self.project_source(source)
                record, value = self.projection(captured["projection"]["id"])
                records.append(record)
                values.append(value)
            report = build_report(definition, values)
            definition["interpretations"], definition["bindings"] = report["interpretations"], report["bindings"]
            return {"definition": definition, "projections": records, "report": report}

    def save(self, raw):
        with self.ws.mutex:
            request, input_sha, replay = self._request(raw, "save")
            if replay is not None:
                return replay
            object_input(raw, {"requestId", "id", "expectedRevision", "name", "notes", "sources",
                "selection", "review", "interpretations", "bindings"}, {"requestId", "name", "sources"})
            if ("id" in raw) != ("expectedRevision" in raw):
                raise InputError("An edit requires the exact original project and expectedRevision")
            previous = self.project(raw["id"]) if "id" in raw else None
            if previous and previous["revision"] != positive(raw["expectedRevision"]):
                raise InputError("Results project changed; current head revision is " + str(previous["revision"]))
            definition = self._definition(raw)
            descriptors, projections = [], []
            for source in definition["sources"]:
                created = self.project_source(source)
                descriptor, value = self.projection(created["projection"]["id"])
                descriptors.append(descriptor)
                projections.append(value)
            report = build_report(definition, projections)
            definition["interpretations"], definition["bindings"] = report["interpretations"], report["bindings"]
            ident = previous["id"] if previous else digest(os.urandom(32))
            maximum = self.db.execute("SELECT MAX(revision) AS n FROM iati_results_editions WHERE id=?", (ident,)).fetchone()["n"]
            revision = (maximum or 0) + 1
            now = utc()
            result = {"schema": EDITION, "id": ident, "revision": revision,
                "parentRevision": previous["revision"] if previous else None,
                "createdAt": previous["createdAt"] if previous else now, "savedAt": now,
                "definition": definition, "projections": descriptors, "report": report}
            result["sha256"] = fingerprint(result)
            with self.db:
                self.db.execute("INSERT INTO iati_results_editions VALUES(?,?,?,?)",
                    (ident, revision, result["sha256"], self._encoded(result).decode()))
                self.db.execute("INSERT INTO iati_results_heads VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision",
                                (ident, revision))
                self._save_request(request, "save", input_sha, ident, raw, result)
            return result

    def adopt(self, raw):
        with self.ws.mutex:
            request, input_sha, replay = self._request(raw, "adopt")
            if replay is not None:
                return replay
            object_input(raw, {"requestId", "id", "expectedRevision", "selectedRevision", "actor", "note"},
                               {"requestId", "id", "expectedRevision", "selectedRevision", "actor", "note"})
            current = self.project(raw["id"])
            if current["revision"] != positive(raw["expectedRevision"]):
                raise InputError("The original local project head changed")
            selected = self.project(raw["id"], raw["selectedRevision"])
            self.report(selected["id"], selected["revision"])
            result = {"schema": "stellar-forge.iati-results-head-selection.v1", "id": selected["id"],
                "previousRevision": current["revision"], "selectedRevision": selected["revision"],
                "selectedSha256": selected["sha256"], "actor": text(raw["actor"], "Actor"),
                "note": text(raw["note"], "Selection basis", 4000), "recordedAt": utc()}
            with self.db:
                self.db.execute("UPDATE iati_results_heads SET revision=? WHERE id=?",
                                (selected["revision"], selected["id"]))
                self._save_request(request, "adopt", input_sha, selected["id"], raw, result)
            return result

    def report(self, ident, revision=None):
        with self.ws.mutex:
            edition = self.project(ident, revision)
            projections = []
            for descriptor in edition["projections"]:
                stored, value = self.projection(descriptor["id"])
                if stored != descriptor:
                    raise InputError("An original edition projection reference changed")
                projections.append(value)
            actual = build_report(edition["definition"], projections)
            if actual != edition["report"]:
                raise InputError("The complete original results report differs from its retained source selection")
            return {"edition": edition, "report": actual}

    def compare(self, raw):
        with self.ws.mutex:
            request, input_sha, replay = self._request(raw, "compare")
            if replay is not None:
                return replay
            object_input(raw, {"requestId", "id", "beforeRevision", "afterRevision", "pairs"},
                               {"requestId", "id", "beforeRevision", "afterRevision", "pairs"})
            if positive(raw["beforeRevision"]) == positive(raw["afterRevision"]):
                raise InputError("Select two distinct retained revisions")
            before = self.report(raw["id"], raw["beforeRevision"])
            after = self.report(raw["id"], raw["afterRevision"])
            compared = compare_reports(before["report"], after["report"], raw["pairs"])
            result = {"schema": "stellar-forge.iati-results-saved-comparison.v1", "project": raw["id"],
                "beforeRevision": raw["beforeRevision"], "afterRevision": raw["afterRevision"],
                "beforeEditionSha256": before["edition"]["sha256"],
                "afterEditionSha256": after["edition"]["sha256"], "comparison": compared, "recordedAt": utc()}
            result["id"] = fingerprint(result)
            with self.db:
                self.db.execute("INSERT INTO iati_results_comparisons VALUES(?,?,?)",
                                (result["id"], raw["id"], self._encoded(result).decode()))
                self._save_request(request, "compare", input_sha, raw["id"], raw, result)
            return result

    def comparisons(self, ident):
        self.project(ident)
        with self.ws.mutex:
            return [load_json(r["body"]) for r in self.db.execute(
                "SELECT body FROM iati_results_comparisons WHERE project=? ORDER BY id", (ident,))]

    def snapshot(self, ident, revision=None):
        with self.ws.mutex:
            selected = self.report(ident, revision)["edition"]
            history = self.history(ident)["editions"]
            # Verify every included immutable edition against its complete original projection.
            for edition in history:
                self.report(ident, edition["revision"])
            projection_ids = sorted({p["id"] for e in history for p in e["projections"]})
            projections = [{"record": self.projection(p)[0], "projection": self.projection(p)[1]} for p in projection_ids]
            value = {"schema": SNAPSHOT, "id": ident, "originalWorkspaceId": self.workspace_id, "selectedRevision": selected["revision"],
                "selectedSha256": selected["sha256"], "analysisContract": CONTRACT,
                "editions": history, "projections": projections, "comparisons": self.comparisons(ident),
                "requests": [{"id": r["id"], "kind": r["kind"], "inputSha256": r["input_sha"],
                              "input": load_json(r["input"]), "response": load_json(r["response"])}
                             for r in self.db.execute("SELECT * FROM iati_results_requests WHERE project=? ORDER BY id", (ident,))],
                "receipts": [load_json(r["body"]) for r in self.db.execute(
                    "SELECT body FROM iati_results_receipts WHERE project=? ORDER BY id", (ident,))]}
            value["sha256"] = fingerprint(value)
            return value

    def validate_snapshot(self, snapshot, source_paths):
        """Validate every incoming source and report before any project/head adoption."""
        if (not isinstance(snapshot, dict) or snapshot.get("schema") != SNAPSHOT
            or snapshot.get("analysisContract") != CONTRACT
            or snapshot.get("sha256") != fingerprint({k: v for k, v in snapshot.items() if k != "sha256"})):
            raise InputError("Unsupported or changed complete results project snapshot")
        checked_id(snapshot["id"])
        checked_id(snapshot["originalWorkspaceId"])
        if not isinstance(snapshot["editions"], list) or not snapshot["editions"]:
            raise InputError("A receiving project needs its complete immutable edition history")
        projections = {}
        for pair in snapshot["projections"]:
            record, supplied = pair["record"], pair["projection"]
            source = supplied["source"]
            if record["id"] in projections:
                raise InputError("Receiving repeats an original projection identity")
            if (record["id"] != supplied["projectionSha256"] or record["source"] != source
                or record["analysisContractSha256"] != fingerprint(CONTRACT)
                or record["file"] != {"sha256": digest(self._encoded(supplied)), "bytes": len(self._encoded(supplied))}):
                raise InputError("Receiving changed an original projection descriptor")
            path = source_paths.get(source["id"])
            if path is None:
                raise InputError("Receiving lacks a complete original publisher document")
            with path.open("rb") as stream:
                actual = project_source(source, stream)
            if actual != supplied:
                raise InputError("Receiving projection differs from the complete original publisher bytes")
            projections[record["id"]] = (record, actual)
        editions = {}
        for edition in sorted(snapshot["editions"], key=lambda v: v["revision"]):
            verify_edition(edition)
            if edition["id"] != snapshot["id"] or edition["revision"] in editions:
                raise InputError("Receiving repeats or changes an original project/revision identity")
            if edition["parentRevision"] is not None and edition["parentRevision"] not in editions:
                raise InputError("Receiving lacks an original parent edition")
            if edition["parentRevision"] is None and editions:
                raise InputError("Receiving has multiple original root editions")
            definition = self._definition(edition["definition"])
            # The saved definition is already canonical; do not silently repair a packet.
            if definition != edition["definition"]:
                raise InputError("Receiving contains a noncanonical original results definition")
            review(definition["review"])
            values = []
            for ref in edition["projections"]:
                pair = projections.get(ref["id"])
                if pair is None or pair[0] != ref:
                    raise InputError("Receiving changes an edition's projection reference")
                values.append(pair[1])
            if sorted(p["source"]["id"] for p in values) != definition["sources"]:
                raise InputError("Receiving changes an edition's selected source closure")
            if build_report(definition, values) != edition["report"]:
                raise InputError("Receiving report differs from its original selected records")
            if not editions and (edition["revision"] != 1 or edition["parentRevision"] is not None):
                raise InputError("Receiving lacks the original first revision")
            if editions and edition["createdAt"] != editions[1]["createdAt"]:
                raise InputError("Receiving changes the original project creation identity")
            editions[edition["revision"]] = edition
        if sorted(editions) != list(range(1, max(editions) + 1)):
            raise InputError("Receiving omits part of the original revision history")
        used_projections = {p["id"] for e in editions.values() for p in e["projections"]}
        if used_projections != set(projections):
            raise InputError("Receiving contains projections outside the complete project history")
        selected = editions.get(snapshot["selectedRevision"])
        if selected is None or selected["sha256"] != snapshot["selectedSha256"]:
            raise InputError("Receiving lacks the exact selected original edition")
        for item in snapshot["comparisons"]:
            if item.get("project") != snapshot["id"] or item.get("id") != fingerprint({k: v for k, v in item.items() if k != "id"}):
                raise InputError("Receiving changed an original comparison identity")
            before, after = editions.get(item["beforeRevision"]), editions.get(item["afterRevision"])
            if before is None or after is None or before["sha256"] != item["beforeEditionSha256"] or after["sha256"] != item["afterEditionSha256"]:
                raise InputError("Receiving comparison selects a different original edition")
            original = item["comparison"]
            pairs = [{"before": p["before"], "after": p["after"], "note": p["note"]}
                     for p in original["pairs"] if p["before"] != p["after"]]
            if compare_reports(before["report"], after["report"], pairs) != original:
                raise InputError("Receiving comparison differs from its original source/report pair")
        request_ids = set()
        comparisons = {item["id"]: item for item in snapshot["comparisons"]}
        if len(comparisons) != len(snapshot["comparisons"]):
            raise InputError("Receiving repeats an original comparison")
        for item in snapshot["requests"]:
            if (not isinstance(item, dict) or set(item) != {"id", "kind", "inputSha256", "input", "response"}
                or not REQUEST.fullmatch(str(item.get("id", ""))) or item["id"] in request_ids
                or not isinstance(item["input"], dict) or item["input"].get("requestId") != item["id"]
                or digest(self._encoded(item["input"])) != item["inputSha256"]
                or item["kind"] not in ("save", "compare", "adopt", "cancel")
                or not isinstance(item["response"], dict)):
                raise InputError("Receiving changed an original request identity")
            request_ids.add(item["id"])
            response, raw, kind = item["response"], item["input"], item["kind"]
            cancelled = response.get("schema") == "stellar-forge.iati-results-cancelled-request.v1"
            if cancelled:
                target = raw["targetInput"] if kind == "cancel" else raw
                expected_kind = raw["targetKind"] if kind == "cancel" else kind
                if (response.get("requestId") != target.get("requestId") or response.get("kind") != expected_kind
                    or response.get("inputSha256") != digest(self._encoded(target))
                    or response.get("project") != snapshot["id"]):
                    raise InputError("Receiving changed the original cancellation binding")
            elif kind == "save":
                verify_edition(response)
                if response["id"] != snapshot["id"] or editions.get(response["revision"]) != response:
                    raise InputError("Receiving save response selects another original edition")
                normalized = self._definition(raw)
                replay_values = [projections[p["id"]][1] for p in response["projections"]]
                if build_report(normalized, replay_values) != response["report"]:
                    raise InputError("Receiving save request selects a different original report")
                normalized["interpretations"] = response["report"]["interpretations"]
                normalized["bindings"] = response["report"]["bindings"]
                if normalized != response["definition"]:
                    raise InputError("Receiving save request differs from its original saved definition")
                if response["parentRevision"] is None:
                    if "id" in raw or "expectedRevision" in raw:
                        raise InputError("Receiving root save claims another parent")
                elif raw.get("id") != snapshot["id"] or raw.get("expectedRevision") != response["parentRevision"]:
                    raise InputError("Receiving save request changed the original parent revision")
            elif kind == "compare":
                if comparisons.get(response.get("id")) != response or raw.get("id") != snapshot["id"] \
                    or raw.get("beforeRevision") != response["beforeRevision"] or raw.get("afterRevision") != response["afterRevision"]:
                    raise InputError("Receiving request selects another original comparison")
                if compare_reports(editions[response["beforeRevision"]]["report"],
                    editions[response["afterRevision"]]["report"], raw.get("pairs")) != response["comparison"]:
                    raise InputError("Receiving comparison request changes its original explicit mapping")
            elif kind == "adopt":
                chosen = editions.get(response.get("selectedRevision"))
                if (response.get("schema") != "stellar-forge.iati-results-head-selection.v1" or chosen is None
                    or response.get("id") != snapshot["id"] or response.get("selectedSha256") != chosen["sha256"]
                    or raw.get("id") != snapshot["id"] or raw.get("selectedRevision") != chosen["revision"]
                    or raw.get("expectedRevision") != response.get("previousRevision")
                    or raw.get("actor") != response.get("actor") or raw.get("note") != response.get("note")
                    or response.get("previousRevision") not in editions):
                    raise InputError("Receiving request changed an original explicit head selection")
            else:
                raise InputError("Receiving cancellation lacks its original cancellation result")
        return editions, projections

    def adopt_snapshot(self, snapshot, source_paths, receipt_input):
        with self.ws.mutex:
            # Pure validation is complete before original Workspace.add_source retains bytes.
            editions, projections = self.validate_snapshot(snapshot, source_paths)
            ident = snapshot["id"]
            for revision, value in editions.items():
                prior = self.db.execute("SELECT sha FROM iati_results_editions WHERE id=? AND revision=?",
                                        (ident, revision)).fetchone()
                if prior and prior["sha"] != value["sha256"]:
                    raise InputError("Receiving conflicts with an existing immutable local edition")
            for pair in projections.values():
                metadata = pair[1]["source"]
                with source_paths[metadata["id"]].open("rb") as stream:
                    retained = self.ws.add_source(stream, metadata["label"], metadata["name"])
                if retained["id"] != metadata["id"] or retained["bytes"] != metadata["bytes"]:
                    raise InputError("Original source receiving returned another identity")
            from .transfer import _original_receipt
            for original_receipt in snapshot["receipts"]:
                original_snapshot = self._blob_value(original_receipt["snapshotFile"])
                _original_receipt(original_receipt, original_snapshot)
            retained_snapshot = self._blob(self._encoded(snapshot))
            receipt_id = fingerprint({"snapshot": snapshot["sha256"], "file": receipt_input})
            prior_receipt = self.db.execute("SELECT body FROM iati_results_receipts WHERE id=?", (receipt_id,)).fetchone()
            if prior_receipt:
                return load_json(prior_receipt["body"])
            existing_head = self.db.execute("SELECT revision FROM iati_results_heads WHERE id=?", (ident,)).fetchone()
            receipt = {"schema": RECEIVING, "id": receipt_id, "project": ident,
                "snapshotSha256": snapshot["sha256"], "snapshotFile": retained_snapshot,
                "file": receipt_input, "receivedAt": utc(), "selectedRevision": snapshot["selectedRevision"],
                "selectedEditionSha256": snapshot["selectedSha256"],
                "localHeadBefore": existing_head["revision"] if existing_head else None,
                "localHeadAfter": existing_head["revision"] if existing_head else snapshot["selectedRevision"],
                "preservedExistingHead": existing_head is not None,
                "sourceIds": sorted(source_paths), "editions": sorted(editions),
                "reviewMeaning": "Original named reviews retained as provenance; receiving operator records any new local interpretation in a new revision.",
                "requestMeaning": "Original requests retained inside snapshotFile; they are not replayed into local operations."}
            with self.db:
                for _, projection in projections.values():
                    self._retain_projection(projection)
                for revision, value in editions.items():
                    self.db.execute("INSERT OR IGNORE INTO iati_results_editions VALUES(?,?,?,?)",
                        (ident, revision, value["sha256"], self._encoded(value).decode()))
                self.db.execute("INSERT OR IGNORE INTO iati_results_heads VALUES(?,?)",
                                (ident, snapshot["selectedRevision"]))
                for item in snapshot["comparisons"]:
                    prior = self.db.execute("SELECT body FROM iati_results_comparisons WHERE id=?", (item["id"],)).fetchone()
                    if prior and load_json(prior["body"]) != item:
                        raise InputError("Receiving comparison conflicts with the local original")
                    self.db.execute("INSERT OR IGNORE INTO iati_results_comparisons VALUES(?,?,?)",
                                    (item["id"], ident, self._encoded(item).decode()))
                self.db.execute("INSERT INTO iati_results_receipts VALUES(?,?,?)",
                                (receipt_id, ident, self._encoded(receipt).decode()))
            return receipt

    def export(self, ident, output, revision=None, *, report_only=False):
        from .transfer import export_project
        return export_project(self, ident, Path(output), revision, report_only=report_only)

    def receive(self, path, *, expected_sha256=None, expected_bytes=None):
        from .transfer import receive_project
        return receive_project(self, Path(path), expected_sha256=expected_sha256, expected_bytes=expected_bytes)
