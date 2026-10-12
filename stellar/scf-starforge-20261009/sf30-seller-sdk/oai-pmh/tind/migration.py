"""MIT. Complete TIND migration workspace on the original reviewed OAI engine."""
from __future__ import annotations
import csv
from datetime import datetime, timezone
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import tempfile
from urllib.parse import urlsplit
import uuid
import zipfile
from workspace import Workspace
from bridge import storage, InputError
from harvest import jbytes, decode, sha, stamp, plain, page_values
from marc import access, canonical, default_profile, doi, field_key, grouped, identifiers
from marc import mapped_record, marcxml, merge_records, native_id, normalize_profile, normalize_record, parse_marc

SCHEMA = "stellar-forge.tind-migration.v1"
MAX_JSON = 8 * 1024 * 1024
MAX_OBJECT = 256 * 1024 * 1024
MAX_FILE = 1024 * 1024 * 1024 * 1024
MAX_PACKAGE = 4 * MAX_FILE

def member(value):
    if not isinstance(value, str) or not value or len(value) > 1024 or "\\" in value or "\x00" in value:
        raise InputError("Use a relative package member")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(x in {"", ".", ".."} for x in path.parts):
        raise InputError("Use a normalized relative package member")
    return value

def https_url(value, name="source URL"):
    plain(value, name, 8192)
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise InputError("Use an HTTPS " + name + " without credentials or a fragment")
    return value

def timestamp(value, name):
    plain(value, name, 128)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise InputError("Use an ISO timestamp with its timezone for " + name) from error
    if parsed.tzinfo is None:
        raise InputError("Include the timezone for " + name)
    return parsed.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def export_scope(value):
    """Retain the institution's actual export visibility separately from pagination."""
    if not isinstance(value, dict):
        raise InputError("Retain the original native export authority")
    coverage = value.get("fieldCoverage", "selected")
    if coverage not in {"public", "selected", "complete"}:
        raise InputError("Choose public, selected or complete native field coverage")
    authority = value.get("authority", "")
    if coverage == "complete":
        plain(authority, "actual staff/export permissions covering the selected records and fields", 8192)
    elif authority:
        plain(authority, "native export permissions", 8192)
    version = value.get("instanceVersion", "")
    if version:
        plain(version, "selected native instance version", 128)
    return {"fieldCoverage": coverage, "authority": authority, "instanceVersion": version}

def file_digest(path, limit=MAX_FILE):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise InputError("Select a regular source file")
    before = path.stat()
    if before.st_size > limit:
        raise InputError("File exceeds the selected transfer limit")
    h = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            count += len(block)
            if count > limit:
                raise InputError("File exceeds the selected transfer limit")
            h.update(block)
    after = path.stat()
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise InputError("Source file changed during the retained read")
    return {"sha256": h.hexdigest(), "bytes": count}

def file_receiving(entry, observed=None, target_id=None):
    """Compare the retained native observation with this exact planned file."""
    observed = observed if observed is not None else entry.get("destination")
    identity = bool(observed and observed.get("sha256") == entry["sha256"] and observed.get("bytes") == entry["bytes"])
    binding = bool(identity and target_id and observed.get("nativeRecordId") == target_id)
    attachment = observed.get("attachment") if observed else None
    policy = bool(binding and isinstance(attachment, dict) and
                  attachment.get("role") == entry["role"] and
                  attachment.get("access") == entry["access"])
    return {"bytesObserved": identity, "recordMatched": binding,
            "bytesConfirmed": binding, "policyObserved": isinstance(attachment, dict),
            "policyConfirmed": policy, "complete": binding and policy}

class ObjectWriter:
    def __init__(self, owner):
        self.owner = owner
        fd, name = tempfile.mkstemp(dir=owner.area / "tmp")
        os.chmod(name, 0o600)
        self.path, self.stream = Path(name), os.fdopen(fd, "wb")
        self.hash, self.size = hashlib.sha256(), 0

    def write(self, value):
        self.size += len(value)
        if self.size > MAX_OBJECT:
            raise InputError("Split this metadata object into files below 256 MiB")
        self.hash.update(value)
        self.stream.write(value)

    def finish(self):
        self.stream.flush()
        os.fsync(self.stream.fileno())
        self.stream.close()
        digest = self.hash.hexdigest()
        target = self.owner.area / "objects" / digest
        if target.exists():
            if file_digest(target, MAX_OBJECT) != {"sha256": digest, "bytes": self.size}:
                raise InputError("A retained object changed")
            self.path.unlink()
        else:
            os.replace(self.path, target)
            storage.sync_dir(target.parent)
        return {"sha256": digest, "bytes": self.size}

    def discard(self):
        if not self.stream.closed:
            self.stream.close()
        self.path.unlink(missing_ok=True)

class ArchiveWriter:
    """Hash an original non-seeking ZIP stream while it is written."""
    def __init__(self, stream):
        self.stream, self.hash, self.bytes = stream, hashlib.sha256(), 0

    def write(self, data):
        if self.bytes + len(data) > MAX_PACKAGE:
            raise InputError("The complete archive exceeds the 4 TiB output limit")
        count = self.stream.write(data)
        if count != len(data):
            raise InputError("The complete archive bytes could not be written")
        self.hash.update(data); self.bytes += count
        return count

    def tell(self):
        return self.bytes

    def seek(self, *_):
        raise OSError("This original archive is a forward-only stream")

    def flush(self):
        self.stream.flush()

class RowObjects:
    """Write complete JSON lines to bounded immutable metadata parts."""
    def __init__(self, owner, filename, kind):
        self.owner, self.filename, self.kind = owner, filename, kind
        self.writer, self.parts = None, []
        self.finished = False

    def _close_part(self):
        if self.writer is None:
            return
        index = len(self.parts) + 1
        stem, suffix = self.filename.rsplit(".", 1)
        name = self.filename if index == 1 else stem + "-" + str(index).zfill(5) + "." + suffix
        self.parts.append({"name": name, "kind": self.kind, **self.writer.finish()})
        self.writer = None

    def write(self, value):
        if self.finished:
            raise InputError("This frozen metadata stream is complete")
        if self.writer is not None and self.writer.size and self.writer.size + len(value) > 64 * 1024 * 1024:
            self._close_part()
        if self.writer is None:
            self.writer = ObjectWriter(self.owner)
        self.writer.write(value)

    def finish(self):
        if not self.finished:
            if self.writer is None and not self.parts:
                self.writer = ObjectWriter(self.owner)
            self._close_part()
            self.finished = True
        return self.parts

    def discard(self):
        if self.writer is not None:
            self.writer.discard()

class Migration:
    def __init__(self, root, create=False):
        self.ws = Workspace(root, create=create)
        self.db, self.mutex, self.root = self.ws.db, self.ws.mutex, self.ws.root
        self.area = self.ws.area / "tind"
        self.area.mkdir(mode=0o700, exist_ok=True)
        for name in ("objects", "tmp"):
            path = self.area / name
            path.mkdir(mode=0o700, exist_ok=True)
            if path.is_symlink():
                raise InputError("TIND working directories must be real directories")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS tind_projects(id TEXT PRIMARY KEY,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tind_records(project_id TEXT NOT NULL,identifier TEXT NOT NULL,
                observation_id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(project_id,identifier));
            CREATE TABLE IF NOT EXISTS tind_source_ids(project_id TEXT NOT NULL,namespace TEXT NOT NULL,
                value TEXT NOT NULL,identifier TEXT NOT NULL,PRIMARY KEY(project_id,namespace,value,identifier));
            CREATE INDEX IF NOT EXISTS tind_source_match ON tind_source_ids(project_id,namespace,value);
            CREATE TABLE IF NOT EXISTS tind_snapshots(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tind_destination_records(snapshot_id TEXT NOT NULL,native_id TEXT NOT NULL,
                body TEXT NOT NULL,PRIMARY KEY(snapshot_id,native_id));
            CREATE TABLE IF NOT EXISTS tind_destination_ids(snapshot_id TEXT NOT NULL,namespace TEXT NOT NULL,
                value TEXT NOT NULL,native_id TEXT NOT NULL,PRIMARY KEY(snapshot_id,namespace,value,native_id));
            CREATE INDEX IF NOT EXISTS tind_destination_match ON tind_destination_ids(snapshot_id,namespace,value);
            CREATE TABLE IF NOT EXISTS tind_files(project_id TEXT NOT NULL,identifier TEXT NOT NULL,id TEXT NOT NULL,
                body TEXT NOT NULL,PRIMARY KEY(project_id,identifier,id));
            CREATE TABLE IF NOT EXISTS tind_batches(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tind_batch_records(batch_id TEXT NOT NULL,identifier TEXT NOT NULL,body TEXT NOT NULL,
                PRIMARY KEY(batch_id,identifier));
            CREATE TABLE IF NOT EXISTS tind_receipts(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS tind_file_receipts(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,
                identifier TEXT NOT NULL,file_id TEXT NOT NULL,body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS tind_file_receiving ON tind_file_receipts(project_id,identifier,file_id);
            CREATE TABLE IF NOT EXISTS tind_operations(id TEXT PRIMARY KEY,request_sha TEXT NOT NULL,response TEXT NOT NULL);
        """)

    def close(self):
        self.ws.close()

    def _get(self, table, identity):
        row = self.db.execute("SELECT body FROM " + table + " WHERE id=?", (identity,)).fetchone()
        if not row:
            raise InputError("Retained " + table.removeprefix("tind_") + " was not found")
        return decode(row["body"])

    def project(self, identity):
        return self._get("tind_projects", identity)

    def batch(self, identity):
        return self._get("tind_batches", identity)

    def put_project(self, value):
        self.db.execute("INSERT INTO tind_projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                        (value["id"], jbytes(value).decode()))

    def object(self, content):
        writer = ObjectWriter(self)
        try:
            writer.write(content)
            return writer.finish()
        finally:
            writer.discard()

    def object_path(self, value):
        digest = value["sha256"] if isinstance(value, dict) else value
        storage.checked_id(digest)
        path = self.area / "objects" / digest
        actual = file_digest(path, MAX_OBJECT)
        if actual["sha256"] != digest or isinstance(value, dict) and actual["bytes"] != value["bytes"]:
            raise InputError("The retained native/source object changed")
        return path

    def apply(self, request):
        if not isinstance(request, dict) or set(request) != {"operationId", "kind", "projectId", "expectedRevision", "input"}:
            raise InputError("Supply operationId, kind, projectId, expectedRevision and input")
        operation = plain(request["operationId"], "one stable operation ID", 128)
        if not all(c.isalnum() or c in "._:-" for c in operation):
            raise InputError("Use an operation ID made of letters, numbers, dots, colons, dashes or underscores")
        encoded = jbytes(request)
        if len(encoded) > MAX_JSON:
            raise InputError("The complete save request exceeds 8 MiB")
        request_sha = sha(encoded)
        with self.mutex, self.db:
            old = self.db.execute("SELECT * FROM tind_operations WHERE id=?", (operation,)).fetchone()
            if old:
                if old["request_sha"] != request_sha:
                    raise InputError("This operation ID already belongs to different exact inputs")
                return decode(old["response"])
            kind, value, project_id = request["kind"], request["input"], request["projectId"]
            if not isinstance(value, dict):
                raise InputError("Operation input must be an object")
            project = None
            if kind == "create":
                if project_id or request["expectedRevision"] is not None:
                    raise InputError("A new migration starts without a project ID or prior revision")
            else:
                project = self.project(project_id)
                if type(request["expectedRevision"]) is not int or request["expectedRevision"] != project["revision"]:
                    raise InputError("The migration changed. Reload its current revision before editing")
            methods = {
                "create": self._create, "edition": self._edition, "profile": self._profile,
                "review": self._review, "review-many": self._review_many,
                "destination": self._destination, "destination-file": self._destination_file,
                "files": self._files, "file-root": self._file_root, "verify-files": self._verify_files,
                "prepare": self._prepare, "receipt": self._receipt, "file-receipt": self._file_receipt,
                "reconcile": self._reconcile, "withdraw-batch": self._withdraw_batch
            }
            if kind not in methods:
                raise InputError("Unknown TIND operation")
            result = methods[kind](project, value, operation)
            project = result.pop("_project", None) or project
            if project is not None:
                project["revision"] += 1
                project["updatedAt"] = stamp()
                self.put_project(project)
            response = {"operationId": operation, "kind": kind, "projectId": project["id"],
                        "revision": project["revision"], "result": result}
            self.db.execute("INSERT INTO tind_operations VALUES(?,?,?)", (operation, request_sha, jbytes(response).decode()))
            return response

    def _create(self, _, value, operation):
        edition = self.ws.edition(value["editionId"])
        profile = normalize_profile(value.get("profile") or default_profile())
        https_url(profile["instance"], "selected TIND instance URL")
        identity = sha(jbytes(["tind-project", operation]))
        project = {"schema": SCHEMA, "id": identity, "title": plain(value.get("title"), "migration title", 256),
                   "revision": 0, "createdAt": stamp(), "updatedAt": stamp(), "editionId": edition["id"],
                   "profile": profile, "snapshotId": None, "fileRoot": None, "fileRootIdentity": None}
        self.put_project(project)
        count = self._load_edition(project, edition)
        return {"_project": project, "records": count, "edition": edition}

    def _load_edition(self, project, edition):
        old_edition = self.ws.edition(project["editionId"])
        if (edition["repository"]["id"], edition["selection"].get("metadataPrefix"), edition["selection"].get("set")) != (
            old_edition["repository"]["id"], old_edition["selection"].get("metadataPrefix"), old_edition["selection"].get("set")):
            raise InputError("A migration continues the same original repository, metadata format and set")
        self.db.execute("DELETE FROM tind_source_ids WHERE project_id=?", (project["id"],))
        count = 0
        rows = self.db.execute("SELECT identifier,observation_id FROM oai_edition_records WHERE edition_id=? ORDER BY identifier", (edition["id"],))
        for row in rows:
            existing = self.db.execute("SELECT body FROM tind_records WHERE project_id=? AND identifier=?", (project["id"], row["identifier"])).fetchone()
            body = decode(existing["body"]) if existing else {"staff": {}, "baseline": None, "deliveries": []}
            observation = self.ws.observation(row["observation_id"])
            body["sourceStatus"] = observation["status"]
            body["sourceDatestamp"] = observation["datestamp"]
            body["setSpecs"] = observation.get("setSpecs", [])
            mapped = body["staff"].get("mappedOverride") or mapped_record(observation, project["profile"], body["staff"])
            body["title"] = next((s["value"] for f in mapped["fields"] if f["tag"] == "245" for s in f.get("subfields", []) if s["code"] == "a"), row["identifier"])
            self.db.execute("INSERT INTO tind_records VALUES(?,?,?,?) ON CONFLICT(project_id,identifier) DO UPDATE SET observation_id=excluded.observation_id,body=excluded.body",
                            (project["id"], row["identifier"], row["observation_id"], jbytes(body).decode()))
            for namespace, value in identifiers(mapped):
                self.db.execute("INSERT OR IGNORE INTO tind_source_ids VALUES(?,?,?,?)", (project["id"], namespace, value, row["identifier"]))
            count += 1
        # An OAI edition carries retained baseline records; a fresh unrelated edition must not erase them.
        orphaned = self.db.execute("""SELECT COUNT(*) FROM tind_records t WHERE project_id=? AND NOT EXISTS
            (SELECT 1 FROM oai_edition_records e WHERE e.edition_id=? AND e.identifier=t.identifier)""", (project["id"], edition["id"])).fetchone()[0]
        if orphaned:
            raise InputError("Choose the retained incremental OAI edition containing this migration's original identifiers")
        project["editionId"] = edition["id"]
        return count

    def _edition(self, project, value, _):
        edition = self.ws.edition(value["editionId"])
        count = self._load_edition(project, edition)
        return {"records": count, "edition": edition}

    def _profile(self, project, value, _):
        incoming = normalize_profile(value["profile"])
        https_url(incoming["instance"], "selected TIND instance URL")
        if incoming["instance"] != project["profile"]["instance"] and (project.get("snapshotId") or self.db.execute("SELECT 1 FROM tind_batches WHERE project_id=? LIMIT 1", (project["id"],)).fetchone()):
            raise InputError("Continue a different native institution in a separate migration")
        project["profile"] = incoming
        count = self._load_edition(project, self.ws.edition(project["editionId"]))
        return {"records": count, "profile": project["profile"]}

    def _record_row(self, project, identifier):
        row = self.db.execute("SELECT * FROM tind_records WHERE project_id=? AND identifier=?", (project["id"], identifier)).fetchone()
        if not row:
            raise InputError("Source record is outside this migration")
        return row, decode(row["body"])

    def _review(self, project, value, _):
        identifier = plain(value.get("identifier"), "exact source identifier", 4096)
        row, body = self._record_row(project, identifier)
        staff = value.get("staff")
        if not isinstance(staff, dict):
            raise InputError("Supply the complete staff record")
        if set(staff) - {"action", "targetId", "access", "hierarchy", "decisions", "note", "reviewer", "mappedOverride", "reviewedAt"}:
            raise InputError("Unknown staff record field")
        staff = dict(staff)
        if staff.get("action", "migrate") not in {"migrate", "exclude", "withdraw"}:
            raise InputError("Choose migrate, exclude or withdraw")
        staff["action"] = staff.get("action", "migrate")
        plain(staff.get("reviewer"), "staff reviewer", 256)
        plain(staff.get("note"), "staff decision note", 16384)
        staff["access"] = access(staff.get("access", project["profile"]["defaultAccess"]))
        if staff.get("targetId"):
            plain(staff["targetId"], "native destination record ID", 4096)
        if staff.get("mappedOverride") is not None:
            staff["mappedOverride"] = normalize_record(staff["mappedOverride"])
            if native_id(staff["mappedOverride"]) is not None:
                raise InputError("Select the destination ID separately from editable source metadata")
        if not isinstance(staff.get("hierarchy", {}), dict) or not isinstance(staff.get("decisions", {}), dict):
            raise InputError("Hierarchy and merge decisions must be objects")
        staff["reviewedAt"] = stamp()
        # reviewedAt is retained internally rather than accepted from a later browser edit.
        body["staff"] = staff
        self.db.execute("UPDATE tind_records SET body=? WHERE project_id=? AND identifier=?", (jbytes(body).decode(), project["id"], identifier))
        observation = self.ws.observation(row["observation_id"])
        mapped = staff.get("mappedOverride") or mapped_record(observation, project["profile"], staff)
        body["title"] = next((s["value"] for f in mapped["fields"] if f["tag"] == "245" for s in f.get("subfields", []) if s["code"] == "a"), identifier)
        self.db.execute("UPDATE tind_records SET body=? WHERE project_id=? AND identifier=?", (jbytes(body).decode(), project["id"], identifier))
        self.db.execute("DELETE FROM tind_source_ids WHERE project_id=? AND identifier=?", (project["id"], identifier))
        for namespace, identity in identifiers(mapped):
            self.db.execute("INSERT OR IGNORE INTO tind_source_ids VALUES(?,?,?,?)", (project["id"], namespace, identity, identifier))
        return {"identifier": identifier, "staff": staff}

    def _review_many(self, project, value, operation):
        rows = value.get("records")
        if not isinstance(rows, list) or not 1 <= len(rows) <= 5000:
            raise InputError("Receive 1–5,000 complete staff records per transaction")
        seen = set()
        for row in rows:
            if row.get("identifier") in seen:
                raise InputError("Bulk decisions contain a duplicate source identifier")
            seen.add(row.get("identifier"))
            self._review(project, row, operation)
        return {"reviewed": len(rows)}

    def _receive_destination(self, project, stream, provenance, operation):
        if not isinstance(provenance, dict):
            raise InputError("Retain the original destination export details")
        https_url(provenance.get("url"), "destination export URL")
        if urlsplit(provenance["url"]).netloc.casefold() != urlsplit(project["profile"]["instance"]).netloc.casefold():
            raise InputError("Receive the selected TIND institution's own native export")
        provenance = {**provenance, **export_scope(provenance), "retrievedAt": timestamp(provenance.get("retrievedAt"), "destination retrieval time")}
        plain(provenance.get("scope"), "exact export selection and permissions", 8192)
        plain(provenance.get("reviewer"), "receiving operator", 256)
        if type(provenance.get("complete")) is not bool:
            raise InputError("Record whether the whole selected native export has been received")
        expected = provenance.get("recordCount")
        if type(expected) is not int or expected < 0:
            raise InputError("Supply the record count reported by the native export")
        writer = ObjectWriter(self)
        try:
            while block := stream.read(65536):
                writer.write(block)
            original = writer.finish()
        finally:
            writer.discard()
        identity = sha(jbytes(["tind-destination", project["id"], original, provenance]))
        old = self.db.execute("SELECT body FROM tind_snapshots WHERE id=?", (identity,)).fetchone()
        if old:
            project["snapshotId"] = identity
            return decode(old["body"])
        duplicates = []
        def receive(record):
            target_id = native_id(record)
            prior = self.db.execute("SELECT body FROM tind_destination_records WHERE snapshot_id=? AND native_id=?", (identity, target_id)).fetchone()
            if prior:
                duplicates.append(target_id)
                raise InputError("Destination export repeats native record " + target_id)
            self.db.execute("INSERT INTO tind_destination_records VALUES(?,?,?)", (identity, target_id, jbytes(record).decode()))
            for namespace, value in identifiers(record):
                self.db.execute("INSERT OR IGNORE INTO tind_destination_ids VALUES(?,?,?,?)", (identity, namespace, value, target_id))
        with self.object_path(original).open("rb") as source:
            result = parse_marc(source, receive)
        if result["records"] != expected:
            raise InputError("Received MARCXML count differs from the native export count")
        snapshot = {"schema": "stellar-forge.tind-destination.v1", "id": identity, "projectId": project["id"],
                    "original": original, "provenance": provenance, "records": result["records"], "receivedAt": stamp()}
        self.db.execute("INSERT INTO tind_snapshots VALUES(?,?,?)", (identity, project["id"], jbytes(snapshot).decode()))
        project["snapshotId"] = identity
        return snapshot

    def _destination(self, project, value, operation):
        content = plain(value.get("marcxml"), "complete native MARCXML export", MAX_JSON)
        return self._receive_destination(project, io.BytesIO(content.encode()), value.get("provenance"), operation)

    def _destination_file(self, project, value, operation):
        path = Path(value["path"]).expanduser().resolve(strict=True)
        file_digest(path, MAX_OBJECT)
        with path.open("rb") as source:
            return self._receive_destination(project, source, value.get("provenance"), operation)

    def _files(self, project, value, _):
        files = value.get("files")
        if not isinstance(files, list) or not 1 <= len(files) <= 5000:
            raise InputError("Receive 1–5,000 exact file rows")
        seen = set()
        for original in files:
            if not isinstance(original, dict):
                raise InputError("A file manifest row must be an object")
            row = dict(original)
            identifier = plain(row.get("identifier"), "source file's exact record identifier", 4096)
            self._record_row(project, identifier)
            file_id = plain(row.get("id"), "stable source file ID", 256)
            key = (identifier, file_id)
            if key in seen:
                raise InputError("A file manifest repeats a source file ID")
            seen.add(key)
            row["filename"] = plain(row.get("filename"), "source file name", 1024)
            row["role"] = plain(row.get("role"), "file role, such as article or full issue", 256)
            row["mediaType"] = plain(row.get("mediaType"), "source media type", 256)
            storage.checked_id(row.get("sha256"))
            if type(row.get("bytes")) is not int or not 0 <= row["bytes"] <= MAX_FILE:
                raise InputError("Supply exact file bytes within the 1 TiB per-file transfer limit")
            if row.get("path"):
                member(row["path"])
            if row.get("url"):
                https_url(row["url"], "original source file URL")
            if not row.get("path") and not row.get("url"):
                raise InputError("Retain the original file path or URL")
            row["access"] = access(row.get("access", project["profile"]["defaultAccess"]))
            if "verified" in row or "destination" in row:
                raise InputError("Verification and native destination values are recorded by their separate operations")
            row["receivedAt"] = stamp()
            old = self.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?", (project["id"], identifier, file_id)).fetchone()
            if old:
                previous = decode(old["body"])
                if (previous["sha256"], previous["bytes"]) == (row["sha256"], row["bytes"]):
                    for name in ("verified", "destination"):
                        if name in previous:
                            row[name] = previous[name]
            self.db.execute("INSERT INTO tind_files VALUES(?,?,?,?) ON CONFLICT(project_id,identifier,id) DO UPDATE SET body=excluded.body",
                            (project["id"], identifier, file_id, jbytes(row).decode()))
        return {"files": len(files)}

    def _file_root(self, project, value, _):
        path = Path(value["path"]).expanduser().resolve(strict=True)
        if not path.is_dir():
            raise InputError("Select the source file directory")
        info = path.stat()
        project["fileRoot"] = str(path)
        project["fileRootIdentity"] = {"device": info.st_dev, "inode": info.st_ino}
        return {"directory": str(path), "identity": project["fileRootIdentity"]}

    def _source_file(self, project, entry):
        if not project.get("fileRoot") or not entry.get("path"):
            raise InputError("Bind the original local file tree and retain each relative file path")
        root = Path(project["fileRoot"]).resolve(strict=True)
        info = root.stat()
        if project["fileRootIdentity"] != {"device": info.st_dev, "inode": info.st_ino}:
            raise InputError("The original file directory changed; select the intended directory again")
        relative = member(entry["path"])
        path = root / relative
        current = root
        for part in PurePosixPath(relative).parts:
            current = current / part
            if current.is_symlink():
                raise InputError("Use original regular files beneath the selected file directory")
        resolved = path.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise InputError("Source file escaped the selected file directory")
        return resolved

    def _verify_files(self, project, value, _):
        identifier = value.get("identifier")
        args, clause = [project["id"]], "project_id=?"
        if identifier:
            self._record_row(project, identifier)
            clause += " AND identifier=?"; args.append(identifier)
        count = total = 0
        for row in self.db.execute("SELECT identifier,id,body FROM tind_files WHERE " + clause + " ORDER BY identifier,id", args):
            entry = decode(row["body"])
            path = self._source_file(project, entry)
            actual = file_digest(path)
            if (actual["sha256"], actual["bytes"]) != (entry["sha256"], entry["bytes"]):
                raise InputError("Source file differs from its retained manifest: " + entry["identifier"] + " / " + entry["id"])
            entry["verified"] = {"checkedAt": stamp(), **actual}
            self.db.execute("UPDATE tind_files SET body=? WHERE project_id=? AND identifier=? AND id=?",
                            (jbytes(entry).decode(), project["id"], row["identifier"], row["id"]))
            count += 1; total += actual["bytes"]
        return {"verifiedFiles": count, "bytes": total}

    def preview(self, project, identifier):
        row, body = self._record_row(project, identifier)
        observation = self.ws.observation(row["observation_id"])
        staff = body.get("staff") or {}
        mapped_source = mapped_record(observation, project["profile"], staff)
        source = staff.get("mappedOverride") or mapped_source
        action = staff.get("action", "migrate")
        visibility = access(staff.get("access", project["profile"]["defaultAccess"]))
        matches = set()
        snapshot = self._get("tind_snapshots", project["snapshotId"]) if project.get("snapshotId") else None
        for namespace, value in identifiers(source):
            if snapshot:
                matches.update(r[0] for r in self.db.execute("SELECT native_id FROM tind_destination_ids WHERE snapshot_id=? AND namespace=? AND value=?",
                                                           (snapshot["id"], namespace, value)))
        target_id = staff.get("targetId")
        issues = []
        if target_id is None and len(matches) == 1:
            target_id = next(iter(matches))
        elif target_id is None and len(matches) > 1:
            issues.append({"kind": "identity", "message": "DOI/OAI identities point to multiple destination records", "candidates": sorted(matches)})
        target = None
        if target_id:
            found = self.db.execute("SELECT body FROM tind_destination_records WHERE snapshot_id=? AND native_id=?",
                                    (project.get("snapshotId"), target_id)).fetchone()
            if found:
                target = decode(found["body"])
            else:
                issues.append({"kind": "identity", "message": "Receive the selected native target record in the destination export", "targetId": target_id})
        elif snapshot is None or not snapshot["provenance"]["complete"]:
            issues.append({"kind": "destination", "message": "Receive the complete selected native export before preparing new records"})
        if snapshot is not None and snapshot["provenance"].get("fieldCoverage") != "complete":
            issues.append({"kind": "destination_fields", "message": "Receive the selected institution's complete record fields with their actual export permissions before preparing native replacement"})
        for namespace, value in identifiers(source):
            if namespace == "native":
                continue
            others = self.db.execute("""SELECT s.identifier,t.body FROM tind_source_ids s JOIN tind_records t
                ON t.project_id=s.project_id AND t.identifier=s.identifier WHERE s.project_id=? AND s.namespace=? AND s.value=? AND s.identifier<>?""",
                (project["id"], namespace, value, identifier))
            active = [r["identifier"] for r in others if decode(r["body"]).get("staff", {}).get("action") != "exclude"]
            if active and action != "exclude":
                issues.append({"kind": "source_identity", "message": "Source records share " + namespace + " " + value, "identifiers": active})
        if observation["status"] == "deleted" and action == "migrate":
            issues.append({"kind": "withdrawal", "message": "Choose a staff withdrawal or exclusion for the explicit OAI deletion"})
        if action == "withdraw" and (target is None or not staff.get("reviewer")):
            issues.append({"kind": "withdrawal", "message": "Bind the native record and staff withdrawal decision"})
        if action == "migrate" and not any(f["tag"] == "245" for f in source["fields"]):
            issues.append({"kind": "mapping", "message": "Map the original record title to MARC 245"})
        if action == "migrate" and visibility["metadata"] == "unreviewed":
            issues.append({"kind": "access", "message": "Choose metadata visibility from the original access terms"})
        files = [decode(r[0]) for r in self.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? ORDER BY id", (project["id"], identifier))]
        for entry in files:
            if entry["access"]["files"] in {"unreviewed", "none"}:
                issues.append({"kind": "file_access", "message": "Choose the original file visibility for " + entry["filename"]})
        merge = merge_records(source, body.get("baseline"), target, staff.get("decisions", {}))
        issues.extend({"kind": "stale_decision", "message": "Refresh the earlier field decision for " + key.replace(" ", "_")} for key in merge["staleDecisions"])
        issues.extend({"kind": "field", "message": "Choose the current " + conflict["key"].replace(" ", "_") + " metadata", **conflict} for conflict in merge["conflicts"])
        return {"identifier": identifier, "observationId": row["observation_id"], "sourceStatus": observation["status"],
                "sourceDatestamp": observation["datestamp"], "setSpecs": observation.get("setSpecs", []),
                "title": body.get("title", identifier), "action": action, "staff": staff, "access": visibility,
                "source": source, "mappedSource": mapped_source, "baseline": body.get("baseline"), "destination": target, "targetId": target_id,
                "candidates": sorted(matches), "proposed": merge["record"], "issues": issues, "files": files,
                "ready": action != "exclude" and not issues, "deliveries": body.get("deliveries", [])}

    def records(self, project_id, offset=0, limit=50, query=""):
        page_values(offset, limit)
        project = self.project(project_id)
        if not isinstance(query, str) or len(query) > 4096:
            raise InputError("Record query exceeds the supported length")
        clause, args = "project_id=?", [project_id]
        if query:
            clause += " AND (instr(identifier,?)>0 OR instr(body,?)>0)"; args += [query, query]
        total = self.db.execute("SELECT COUNT(*) FROM tind_records WHERE " + clause, args).fetchone()[0]
        rows = self.db.execute("SELECT identifier FROM tind_records WHERE " + clause + " ORDER BY identifier LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
        items = []
        for row in rows:
            view = self.preview(project, row["identifier"])
            items.append({k: view[k] for k in ("identifier", "title", "sourceStatus", "action", "targetId", "ready", "issues", "sourceDatestamp")})
        return {"items": items, "total": total, "offset": offset, "next": offset + len(items) if offset + len(items) < total else None}

    def _prepare(self, project, value, operation):
        selection = value.get("identifiers", "ready")
        if selection != "ready" and (not isinstance(selection, list) or not 1 <= len(selection) <= 10000 or len(selection) != len(set(selection))):
            raise InputError("Choose every ready record or an explicit unique selection of up to 10,000 identifiers")
        reviewer = plain(value.get("reviewer"), "batch preparer", 256)
        note = plain(value.get("note"), "batch scope and handover note", 16384)
        identity = sha(jbytes(["tind-batch", operation, project["id"], project["revision"]]))
        if selection == "ready":
            rows = self.db.execute("SELECT identifier FROM tind_records WHERE project_id=? ORDER BY identifier", (project["id"],))
            selected = (r[0] for r in rows)
        else:
            selected = sorted(selection)
        files, parts, counts = [], {}, {"create": 0, "update": 0, "withdraw": 0, "excluded": 0, "unresolved": 0, "files": 0}
        plan = RowObjects(self, "records.jsonl", "working-records")
        file_manifest = RowObjects(self, "files.jsonl", "file-manifest")
        withdrawals = RowObjects(self, "withdrawals.jsonl", "staff-withdrawals")
        writer = None
        native_count = part_count = 0
        part_name = None
        def close_part():
            nonlocal writer, part_count
            if writer is not None:
                writer.write(b"</collection>\n")
                entry = writer.finish()
                files.append({"name": part_name, "kind": "marcxml", "records": part_count, **entry})
                writer = None
        try:
            for identifier in selected:
                view = self.preview(project, identifier)
                if view["action"] == "exclude":
                    counts["excluded"] += 1
                    continue
                if not view["ready"]:
                    if selection != "ready":
                        raise InputError("Resolve this selected record before preparing it: " + identifier)
                    counts["unresolved"] += 1
                    continue
                if view["action"] == "withdraw":
                    withdrawals.write(jbytes({"identifier": identifier, "nativeId": view["targetId"], "review": view["staff"], "sourceObservationId": view["observationId"]}))
                    counts["withdraw"] += 1
                    xml_name = None
                else:
                    encoded = marcxml(view["proposed"]).encode()
                    if writer is None or part_count >= project["profile"]["batchRecords"] or writer.size + len(encoded) > 64 * 1024 * 1024:
                        close_part()
                        part_name = "records-" + str(len([x for x in files if x["kind"] == "marcxml"]) + 1).zfill(5) + ".xml"
                        writer = ObjectWriter(self)
                        writer.write(('<?xml version="1.0" encoding="UTF-8"?>\n<collection xmlns="http://www.loc.gov/MARC21/slim">\n').encode())
                        part_count = 0
                    writer.write(encoded); part_count += 1; native_count += 1
                    xml_name = part_name
                    counts["update" if view["targetId"] else "create"] += 1
                frozen = {"identifier": identifier, "observationId": view["observationId"], "sourceDatestamp": view["sourceDatestamp"],
                          "action": view["action"], "targetId": view["targetId"], "sourceMapped": view["source"],
                          "record": view["proposed"], "staff": view["staff"], "access": view["access"], "files": view["files"],
                          "xmlFile": xml_name, "status": "prepared"}
                self.db.execute("INSERT INTO tind_batch_records VALUES(?,?,?)", (identity, identifier, jbytes(frozen).decode()))
                plan.write(jbytes(frozen))
                for entry in view["files"]:
                    file_manifest.write(jbytes(entry)); counts["files"] += 1
            close_part()
            for stream in (plan, file_manifest, withdrawals):
                files.extend(stream.finish())
            if native_count + counts["withdraw"] == 0:
                raise InputError("Resolve the remaining source, identity and access decisions to prepare a batch")
            batch = {"schema": "stellar-forge.tind-batch.v1", "id": identity, "projectId": project["id"],
                     "title": project["title"], "editionId": project["editionId"], "snapshotId": project.get("snapshotId"),
                     "profile": project["profile"], "projectRevision": project["revision"], "createdAt": stamp(),
                     "reviewer": reviewer, "note": note, "selection": selection, "counts": counts,
                     "files": files, "status": "prepared", "receipts": [], "reconciliations": []}
            self.db.execute("INSERT INTO tind_batches VALUES(?,?,?)", (identity, project["id"], jbytes(batch).decode()))
            return batch
        finally:
            for stream in (writer, plan, file_manifest, withdrawals):
                if stream is not None:
                    stream.discard()

    def _save_batch(self, batch):
        self.db.execute("UPDATE tind_batches SET body=? WHERE id=?", (jbytes(batch).decode(), batch["id"]))

    def _owned_batch(self, project, identity):
        batch = self.batch(identity)
        if batch["projectId"] != project["id"]:
            raise InputError("Batch belongs to another migration")
        return batch

    def _receipt(self, project, value, operation):
        batch = self._owned_batch(project, value["batchId"])
        if batch["status"] == "withdrawn":
            raise InputError("This prepared batch was withdrawn before delivery")
        kind = value.get("status")
        if kind not in {"submitted", "completed", "failed", "unknown"}:
            raise InputError("Choose the observed native job state")
        plain(value.get("jobId"), "native batch uploader job ID", 4096)
        https_url(value.get("url"), "native job URL")
        plain(value.get("operator"), "receiving operator", 256)
        observed_at = timestamp(value.get("observedAt"), "native observation time")
        if observed_at < batch["createdAt"]:
            raise InputError("The native job observation must follow this prepared batch")
        if urlsplit(value["url"]).netloc.casefold() != urlsplit(project["profile"]["instance"]).netloc.casefold():
            raise InputError("Receive the selected institution's native job result")
        raw = plain(value.get("original"), "complete native receipt text", MAX_JSON)
        results = value.get("records", [])
        if not isinstance(results, list) or len(results) > 10000:
            raise InputError("Receive up to 10,000 native record results")
        seen = set()
        for result in results:
            identifier = result.get("identifier")
            if identifier in seen:
                raise InputError("Native results repeat a source identifier")
            seen.add(identifier)
            row = self.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=? AND identifier=?", (batch["id"], identifier)).fetchone()
            if not row:
                raise InputError("Native result names a source record outside the frozen batch")
            if result.get("status") not in {"accepted", "failed", "pending", "withdrawn"}:
                raise InputError("Choose the observed record result")
            if result.get("status") in {"accepted", "withdrawn"}:
                plain(result.get("nativeId"), "native record ID", 4096)
            if result.get("status") == "failed":
                plain(result.get("error"), "original native error", 16384)
        receipt = {"schema": "stellar-forge.tind-native-receipt.v1", "id": sha(jbytes(["tind-receipt", operation])),
                   "batchId": batch["id"], "jobId": value["jobId"], "url": value["url"], "operator": value["operator"],
                   "observedAt": observed_at, "receivedAt": stamp(), "status": kind, "records": results,
                   "original": self.object(raw.encode())}
        transfer_id = value.get("transferId")
        if transfer_id:
            transfer_row = self.db.execute("SELECT body FROM tind_native_transfers WHERE id=?", (transfer_id,)).fetchone()
            if not transfer_row:
                raise InputError("Select the retained native transfer operation")
            transfer = decode(transfer_row["body"])
            if transfer["projectId"] != project["id"] or transfer["batchId"] != batch["id"]:
                raise InputError("Native transfer belongs to another frozen batch")
            for result in results:
                frozen = decode(self.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=? AND identifier=?", (batch["id"], result["identifier"])).fetchone()[0])
                if frozen["xmlFile"] != transfer["file"]:
                    raise InputError("The native result names a record outside this exact transferred file")
            transfer["status"] = "received"
            transfer["receiptId"] = receipt["id"]
            receipt["transferId"] = transfer_id
            self.db.execute("UPDATE tind_native_transfers SET body=? WHERE id=?", (jbytes(transfer).decode(), transfer_id))
        self.db.execute("INSERT INTO tind_receipts VALUES(?,?,?)", (receipt["id"], batch["id"], jbytes(receipt).decode()))
        batch["receipts"].append(receipt["id"])
        batch["status"] = "submitted" if kind != "failed" else "native-errors"
        self._save_batch(batch)
        return receipt

    def _file_receipt(self, project, value, operation):
        identifier, file_id = value.get("identifier"), value.get("fileId")
        row = self.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?", (project["id"], identifier, file_id)).fetchone()
        if not row:
            raise InputError("Native file result must select a retained source file")
        entry = decode(row["body"])
        if value.get("sha256") != entry["sha256"] or value.get("bytes") != entry["bytes"]:
            raise InputError("Native file result must carry the retained file's exact checksum and byte count")
        destination = {"schema": "stellar-forge.tind-file-receipt.v1",
                       "id": sha(jbytes(["tind-file-receipt", operation])),
                       "projectId": project["id"], "identifier": identifier, "fileId": file_id,
                       "nativeRecordId": plain(value.get("nativeRecordId"), "native record ID", 4096),
                       "nativeFileId": plain(value.get("nativeFileId"), "native file/object ID", 4096),
                       "url": https_url(value.get("url"), "native file URL"),
                       "sha256": value["sha256"], "bytes": value["bytes"],
                       "observedAt": timestamp(value.get("observedAt"), "file observation time"),
                       "operator": plain(value.get("operator"), "file receiving operator", 256),
                       "original": self.object(plain(value.get("original"), "original native file result", MAX_JSON).encode()),
                       "operationId": operation}
        previous = entry.get("destination")
        if previous and not previous.get("id"):
            legacy = {**previous, "schema": "stellar-forge.tind-file-receipt.v1",
                      "id": sha(jbytes(["tind-file-receipt", previous["operationId"]])),
                      "projectId": project["id"], "identifier": identifier, "fileId": file_id}
            self.db.execute("INSERT OR IGNORE INTO tind_file_receipts VALUES(?,?,?,?,?)",
                            (legacy["id"], project["id"], identifier, file_id, jbytes(legacy).decode()))
        if previous and previous.get("attachment") and all(previous.get(key) == destination.get(key)
                for key in ("nativeRecordId", "nativeFileId", "sha256", "bytes")):
            destination["attachment"] = previous["attachment"]
        attachment = value.get("attachment")
        if attachment is not None:
            if not isinstance(attachment, dict):
                raise InputError("Supply the actual observed attachment role and access as an object")
            observed_access = access(attachment.get("access"))
            if "unreviewed" in (observed_access["metadata"], observed_access["files"]):
                raise InputError("Choose the actual observed native visibility")
            destination["attachment"] = {
                "role": plain(attachment.get("role"), "observed native attachment role", 256),
                "access": observed_access,
                "observedAt": timestamp(attachment.get("observedAt"), "attachment policy observation time"),
                "sourceUrl": https_url(attachment.get("sourceUrl"), "native attachment policy source URL"),
                "original": self.object(plain(attachment.get("original"), "original native attachment and access result", MAX_JSON).encode())
            }
        self.db.execute("INSERT INTO tind_file_receipts VALUES(?,?,?,?,?)",
                        (destination["id"], project["id"], identifier, file_id, jbytes(destination).decode()))
        entry["destination"] = destination
        self.db.execute("UPDATE tind_files SET body=? WHERE project_id=? AND identifier=? AND id=?", (jbytes(entry).decode(), project["id"], identifier, file_id))
        return {"identifier": identifier, "fileId": file_id, "destination": destination}

    def files(self, project_id, offset=0, limit=50, query=""):
        page_values(offset, limit)
        project = self.project(project_id)
        if not isinstance(query, str) or len(query) > 4096:
            raise InputError("File query exceeds the supported length")
        clause, args = "project_id=?", [project_id]
        if query:
            clause += " AND (instr(identifier,?)>0 OR instr(id,?)>0 OR instr(body,?)>0)"
            args += [query, query, query]
        total = self.db.execute("SELECT COUNT(*) FROM tind_files WHERE " + clause, args).fetchone()[0]
        rows = self.db.execute("SELECT body FROM tind_files WHERE " + clause + " ORDER BY identifier,id LIMIT ? OFFSET ?", args + [limit, offset]).fetchall()
        items, records = [], {}
        for row in rows:
            entry = decode(row["body"])
            identifier = entry["identifier"]
            if identifier not in records:
                records[identifier] = self.preview(project, identifier)
            target_id = records[identifier]["targetId"]
            items.append({"file": entry, "recordTitle": records[identifier]["title"], "targetId": target_id,
                          "receiving": file_receiving(entry, target_id=target_id)})
        return {"items": items, "total": total, "offset": offset,
                "next": offset + len(items) if offset + len(items) < total else None}

    def file_history(self, project_id, identifier, file_id, offset=0, limit=50):
        page_values(offset, limit)
        self.project(project_id)
        args = (project_id, identifier, file_id)
        total = self.db.execute("SELECT COUNT(*) FROM tind_file_receipts WHERE project_id=? AND identifier=? AND file_id=?", args).fetchone()[0]
        rows = self.db.execute("SELECT body FROM tind_file_receipts WHERE project_id=? AND identifier=? AND file_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?",
                               (*args, limit, offset)).fetchall()
        return {"items": [decode(row[0]) for row in rows], "total": total, "offset": offset,
                "next": offset + len(rows) if offset + len(rows) < total else None}

    def file_receipt(self, project_id, identity):
        receipt = self._get("tind_file_receipts", identity)
        if receipt["projectId"] != project_id:
            raise InputError("Native file result belongs to another migration")
        result = dict(receipt)
        result["originalText"] = self.object_path(receipt["original"]).read_text(encoding="utf-8")
        if receipt.get("attachment"):
            result["attachment"] = {**receipt["attachment"],
                "originalText": self.object_path(receipt["attachment"]["original"]).read_text(encoding="utf-8")}
        return result

    def _reconcile(self, project, value, operation):
        batch = self._owned_batch(project, value["batchId"])
        if batch["status"] == "withdrawn":
            raise InputError("Select a delivered batch")
        snapshot = self._get("tind_snapshots", project["snapshotId"])
        if snapshot["projectId"] != project["id"]:
            raise InputError("Destination export belongs to another migration")
        if not batch["receipts"]:
            raise InputError("Receive the native batch job result before reconciling delivery")
        results = {}
        for identity in batch["receipts"]:
            receipt = self._get("tind_receipts", identity)
            for row in receipt["records"]:
                results[row["identifier"]] = row
        counts = {"confirmed": 0, "remaining": 0, "fileBytesConfirmed": 0, "filePolicyConfirmed": 0, "filesConfirmed": 0}
        report = ObjectWriter(self)
        try:
            for row in self.db.execute("SELECT identifier,body FROM tind_batch_records WHERE batch_id=? ORDER BY identifier", (batch["id"],)):
                frozen = decode(row["body"])
                native_result = results.get(row["identifier"], {})
                target_id = native_result.get("nativeId") or frozen.get("targetId")
                issues = []
                if frozen.get("targetId") and native_result.get("nativeId") and native_result["nativeId"] != frozen["targetId"]:
                    issues.append("Native result names a different record than the reviewed destination")
                if frozen["action"] == "withdraw":
                    if native_result.get("status") != "withdrawn":
                        issues.append("Receive the native withdrawal result")
                else:
                    if native_result.get("status") != "accepted":
                        issues.append("Receive the native record acceptance")
                    target_row = self.db.execute("SELECT body FROM tind_destination_records WHERE snapshot_id=? AND native_id=?", (snapshot["id"], target_id)).fetchone()
                    if not target_row:
                        issues.append("Receive the destination record in the current native export")
                    else:
                        actual, expected = grouped(decode(target_row["body"])), grouped(frozen["record"])
                        before = {}
                        if frozen.get("targetId"):
                            before_row = self.db.execute(
                                "SELECT body FROM tind_destination_records WHERE snapshot_id=? AND native_id=?",
                                (batch.get("snapshotId"), frozen["targetId"])).fetchone()
                            if before_row:
                                before = grouped(decode(before_row["body"]))
                            else:
                                issues.append("Receive the original reviewed destination before-state")
                        for key in dict.fromkeys([*before, *expected]):
                            if key in {"001", "005"} or key.startswith("856"):
                                continue
                            if actual.get(key, []) != expected.get(key, []):
                                issues.append("Native field group differs: " + key.replace(" ", "_"))
                    for entry in frozen["files"]:
                        current = self.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?", (project["id"], row["identifier"], entry["id"])).fetchone()
                        observed = decode(current["body"]).get("destination") if current else None
                        receiving = file_receiving(entry, observed, target_id)
                        if receiving["bytesConfirmed"]:
                            counts["fileBytesConfirmed"] += 1
                        else:
                            issues.append("Receive native file identity and checksum: " + entry["id"])
                        if receiving["policyConfirmed"]:
                            counts["filePolicyConfirmed"] += 1
                        else:
                            issues.append("Receive the native attachment role and access terms: " + entry["id"])
                        if receiving["complete"]:
                            counts["filesConfirmed"] += 1
                if snapshot["provenance"].get("fieldCoverage") != "complete":
                    issues.append("Receive the actual native export with complete selected record fields and its permissions")
                if not issues:
                    counts["confirmed"] += 1
                    source_row, current = self._record_row(project, row["identifier"])
                    deliveries = current.setdefault("deliveries", [])
                    newest = max((item.get("projectRevision", -1) for item in deliveries), default=-1)
                    if not any(item["batchId"] == batch["id"] for item in deliveries):
                        deliveries.append({"batchId": batch["id"], "snapshotId": snapshot["id"], "projectRevision": batch["projectRevision"],
                                           "nativeId": target_id, "confirmedAt": stamp()})
                    if batch["projectRevision"] >= newest:
                        current["baseline"] = frozen["sourceMapped"]
                        # The native outcome advances delivery lineage, not a later
                        # operator's choice of target or field-level resolution.
                        if current.get("staff", {}) == frozen.get("staff", {}):
                            current.setdefault("staff", {})["targetId"] = target_id
                            current["staff"]["decisions"] = {}
                    self.db.execute("UPDATE tind_records SET body=? WHERE project_id=? AND identifier=?", (jbytes(current).decode(), project["id"], row["identifier"]))
                    frozen["status"] = "confirmed"
                else:
                    counts["remaining"] += 1
                    frozen["status"] = "receiving"
                frozen["receivingIssues"] = issues
                self.db.execute("UPDATE tind_batch_records SET body=? WHERE batch_id=? AND identifier=?", (jbytes(frozen).decode(), batch["id"], row["identifier"]))
                report.write(jbytes({"identifier": row["identifier"], "nativeId": target_id, "issues": issues}))
            receipt = {"operationId": operation, "snapshotId": snapshot["id"], "observedAt": stamp(), "counts": counts, "report": report.finish()}
            batch["reconciliations"].append(receipt)
            batch["status"] = "received" if counts["remaining"] == 0 else "receiving"
            self._save_batch(batch)
            return receipt
        finally:
            report.discard()

    def _withdraw_batch(self, project, value, _):
        batch = self._owned_batch(project, value["batchId"])
        sent = False
        tables = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if "tind_native_transfers" in tables:
            sent = any(decode(row[0]).get("batchId") == batch["id"] and
                       decode(row[0]).get("status") in {"sending", "unknown", "responded", "received"}
                       for row in self.db.execute("SELECT body FROM tind_native_transfers WHERE project_id=?", (project["id"],)))
        if batch["receipts"] or sent:
            raise InputError("Continue the existing native transfer result and prepare any replacement as a new batch")
        batch["status"] = "withdrawn"
        batch["withdrawal"] = {"operator": plain(value.get("operator"), "withdrawing operator", 256),
                               "note": plain(value.get("note"), "withdrawal reason", 16384), "recordedAt": stamp()}
        self._save_batch(batch)
        return batch

    def state(self, project_id=None):
        with self.mutex:
            projects = [decode(r[0]) for r in self.db.execute("SELECT body FROM tind_projects ORDER BY id")]
            result = {"schema": SCHEMA, "workspace": str(self.root),
                      "workspaceIdentity": sha(jbytes([str(self.root), self.root.stat().st_dev, self.root.stat().st_ino])),
                      "projects": [{k: p[k] for k in ("id", "title", "revision", "editionId", "updatedAt")} for p in projects],
                      "profileTemplate": default_profile(), "original": self.ws.state()}
            if project_id:
                project = self.project(project_id)
                result["project"] = project
                result["recordCount"] = self.db.execute("SELECT COUNT(*) FROM tind_records WHERE project_id=?", (project_id,)).fetchone()[0]
                result["fileCount"] = self.db.execute("SELECT COUNT(*) FROM tind_files WHERE project_id=?", (project_id,)).fetchone()[0]
                result["snapshots"] = [decode(r[0]) for r in self.db.execute("SELECT body FROM tind_snapshots WHERE project_id=? ORDER BY rowid DESC LIMIT 100", (project_id,))]
                result["batches"] = [decode(r[0]) for r in self.db.execute("SELECT body FROM tind_batches WHERE project_id=? ORDER BY rowid DESC LIMIT 100", (project_id,))]
            tables = {r[0] for r in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            for table, key in (("tind_native_searches", "nativeSearches"), ("tind_native_transfers", "nativeTransfers")):
                if table in tables and project_id:
                    result[key] = [decode(r[0]) for r in self.db.execute("SELECT body FROM " + table + " WHERE project_id=? ORDER BY rowid DESC LIMIT 50", (project_id,))]
            return result

    def export_batch(self, batch_id, output):
        output = Path(output).expanduser().absolute()
        with self.mutex:
            batch = self.batch(batch_id)
            with output.open("xb") as raw:
                os.chmod(output, 0o600)
                with zipfile.ZipFile(raw, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                    archive.writestr("batch.json", jbytes(batch))
                    for item in batch["files"]:
                        archive.write(self.object_path(item), member(item["name"]))
                    for identity in batch["receipts"]:
                        receipt = self._get("tind_receipts", identity)
                        archive.writestr("receipts/" + identity + ".json", jbytes(receipt))
                        archive.write(self.object_path(receipt["original"]), "receipts/" + identity + ".txt")
                    for index, receipt in enumerate(batch["reconciliations"]):
                        archive.write(self.object_path(receipt["report"]), "receiving/" + str(index + 1) + ".jsonl")
                    file_receipts = set()
                    for row in self.db.execute("SELECT body FROM tind_batch_records WHERE batch_id=?", (batch["id"],)):
                        frozen = decode(row[0])
                        for entry in frozen["files"]:
                            observations = self.db.execute("SELECT body FROM tind_file_receipts WHERE project_id=? AND identifier=? AND file_id=? ORDER BY rowid",
                                (batch["projectId"], frozen["identifier"], entry["id"]))
                            for original in observations:
                                receipt = decode(original[0])
                                if receipt["id"] in file_receipts or (receipt["sha256"], receipt["bytes"]) != (entry["sha256"], entry["bytes"]):
                                    continue
                                file_receipts.add(receipt["id"])
                                prefix = "file-receipts/" + receipt["id"]
                                archive.writestr(prefix + ".json", jbytes(receipt))
                                archive.write(self.object_path(receipt["original"]), prefix + ".txt")
                                if receipt.get("attachment"):
                                    archive.write(self.object_path(receipt["attachment"]["original"]), prefix + "-attachment.txt")
                raw.flush(); os.fsync(raw.fileno())
            return {"path": str(output), **file_digest(output, MAX_PACKAGE)}

    def handover(self, output, include_files=True):
        """Stream editable DB, original source/runtime and the complete referenced file tree."""
        output = Path(output).expanduser().absolute()
        source_root = Path(__file__).resolve().parent.parent.parent
        with self.mutex, tempfile.TemporaryDirectory(dir=self.area / "tmp") as directory:
            projects = [decode(r[0]) for r in self.db.execute("SELECT body FROM tind_projects")]
            temp = Path(directory)
            database = temp / "workspace.sqlite"
            storage.private_write(database, b"")
            copied = sqlite3.connect(database)
            try:
                self.db.backup(copied)
            finally:
                copied.close()
            members = {"workspace/workspace.sqlite": database}
            expected_bytes = {}
            for path in self.root.rglob("*"):
                relative = path.relative_to(self.root).as_posix()
                if path.is_symlink():
                    raise InputError("Resolve symbolic links before a whole workspace handover")
                if path.is_file() and relative not in {".lock", "workspace.sqlite", "workspace.sqlite-journal"} and not any(
                    relative == prefix or relative.startswith(prefix + "/") for prefix in ("tmp", "oai/tmp", "oai/tind/tmp")):
                    members["workspace/" + relative] = path
            runtime_members = []
            for relative in ("oai-pmh", "xml"):
                for path in (source_root / relative).rglob("*"):
                    if path.is_file() and "__pycache__" not in path.parts and path.suffix in {".py", ".mjs", ".js", ".html", ".css", ".md", ".json"}:
                        name = "source/" + path.relative_to(source_root).as_posix()
                        members[name] = path
                        runtime_members.append(name)
            path = source_root / "dataset-handler.mjs"
            if not path.is_file() or path.is_symlink():
                raise InputError("Include the original dataset-handler.mjs in this full source handover")
            members["source/dataset-handler.mjs"] = path
            guide_candidates = [source_root.parents[2] / "products" / "tind" / "OPERATING.md",
                                source_root.parent / "OPERATING.md"]
            guide = next((path for path in guide_candidates if path.is_file() and not path.is_symlink()), None)
            if guide is None:
                raise InputError("Include the complete products/tind/OPERATING.md with this selected source")
            guide_text = guide.read_text(encoding="utf-8")
            guide_text = guide_text.replace("../../stellar/scf-starforge-20261009/sf30-seller-sdk/", "source/")
            guide_text = guide_text.replace("../../stellar/scf-starforge-20261009/distribution/",
                "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/")
            storage.private_write(temp / "OPERATING.md", guide_text.encode())
            members["OPERATING.md"] = temp / "OPERATING.md"
            readme = ("# Received TIND migration\n\n"
                "The full operator guide is [OPERATING.md](OPERATING.md).\n\n"
                "Open the original source from this directory:\n\n"
                "```sh\npython3 source/oai-pmh/tind/cli.py --workspace workspace serve --port 8894\n```\n\n"
                "Use the absolute received workspace path when launching from another directory. "
                "The original OAI intake is source/oai-pmh/cli.py. Close the TIND desk before opening the same intake workspace.\n")
            storage.private_write(temp / "README.md", readme.encode())
            members["README.md"] = temp / "README.md"
            attachments = []
            for project in projects:
                for row in self.db.execute("SELECT body FROM tind_files WHERE project_id=? ORDER BY identifier,id", (project["id"],)):
                    entry = decode(row["body"])
                    item = {"projectId": project["id"], "identifier": entry["identifier"], "id": entry["id"],
                            "sha256": entry["sha256"], "bytes": entry["bytes"], "sourcePath": entry.get("path"), "sourceURL": entry.get("url")}
                    if include_files:
                        path = self._source_file(project, entry)
                        if path.stat().st_size != entry["bytes"]:
                            raise InputError("File length differs from the retained handover: " + entry["filename"])
                        name = "attachments/" + project["id"] + "/" + entry["sha256"] + "/" + member(entry.get("path") or entry["filename"])
                        members[name] = path
                        expected_bytes[name] = {"sha256": entry["sha256"], "bytes": entry["bytes"]}
                        item["member"] = name
                    attachments.append(item)
            manifest = {"schema": "stellar-forge.tind-handover.v1", "createdAt": stamp(), "includesFiles": include_files,
                        "attachments": attachments, "files": [], "projects": [p["id"] for p in projects],
                        "sourceEntrypoint": "source/oai-pmh/tind/cli.py"}
            total = 0
            with output.open("xb") as raw:
                os.chmod(output, 0o600)
                written = ArchiveWriter(raw)
                with zipfile.ZipFile(written, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                    for name, path in sorted(members.items()):
                        if path.is_symlink() or not path.is_file():
                            raise InputError("The original handover member must remain a regular file")
                        before = path.stat()
                        if before.st_size > MAX_FILE:
                            raise InputError("Handover member exceeds the 1 TiB per-file limit")
                        total += before.st_size
                        if total > MAX_PACKAGE:
                            raise InputError("Handover exceeds the selected 4 TiB package limit")
                        hashed, count = hashlib.sha256(), 0
                        with path.open("rb") as source, archive.open(member(name), "w", force_zip64=True) as target:
                            opened = os.fstat(source.fileno())
                            if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
                                raise InputError("A handover file was replaced before its read")
                            while block := source.read(1024 * 1024):
                                count += len(block)
                                if count > before.st_size:
                                    raise InputError("A handover member grew during transfer")
                                hashed.update(block); target.write(block)
                        after = path.stat()
                        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
                                after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) or count != before.st_size:
                            raise InputError("A file changed while writing the handover")
                        actual = {"sha256": hashed.hexdigest(), "bytes": count}
                        if name in expected_bytes and actual != expected_bytes[name]:
                            raise InputError("Original file bytes differ from their retained handover identity: " + name)
                        manifest["files"].append({"file": name, **actual})
                    archive.writestr("handover.json", jbytes(manifest))
                raw.flush(); os.fsync(raw.fileno())
            return {"path": str(output), "members": len(members), "includesFiles": include_files,
                    "sha256": written.hash.hexdigest(), "bytes": written.bytes}

    @classmethod
    def receive(cls, archive_path, destination):
        """Validate and relocate in staging, then publish one complete editable directory."""
        destination = Path(destination).expanduser().absolute()
        parent = destination.parent.resolve(strict=True)
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or "handover.json" not in names:
                raise InputError("Handover has duplicate members or no full manifest")
            if archive.getinfo("handover.json").file_size > MAX_OBJECT:
                raise InputError("Handover manifest exceeds 256 MiB")
            manifest = decode(archive.read("handover.json"))
            if manifest.get("schema") != "stellar-forge.tind-handover.v1":
                raise InputError("Receive an original TIND working handover")
            manifest_sha = sha(jbytes(manifest))
            receipt = {"schema": "stellar-forge.tind-received.v1", "manifestSha256": manifest_sha,
                       "includesFiles": manifest.get("includesFiles"), "receivedAt": stamp()}
            if destination.exists():
                marker = destination / "received.json"
                if destination.is_symlink() or not marker.is_file() or marker.stat().st_size > 16384:
                    raise InputError("Receive into a new handover directory")
                prior = decode(marker.read_bytes())
                if prior.get("schema") != receipt["schema"] or prior.get("manifestSha256") != manifest_sha:
                    raise InputError("This receiving directory belongs to another handover")
                restored = cls(destination / "workspace")
                try:
                    return {"directory": str(destination), "workspace": str(destination / "workspace"),
                            "source": str(destination / "source"), "includesFiles": prior["includesFiles"],
                            "receipt": prior, "resumed": True, "state": restored.state()}
                finally:
                    restored.close()
            files = manifest.get("files")
            if not isinstance(files, list) or type(manifest.get("includesFiles")) is not bool:
                raise InputError("Handover is missing its original source inventory")
            expected = {member(x["file"]): x for x in files}
            if len(expected) != len(files) or set(names) != {"handover.json", *expected}:
                raise InputError("Package members differ from the handover inventory")
            required = {"workspace/workspace.sqlite", "workspace/workspace.json", "source/oai-pmh/tind/cli.py",
                        "source/oai-pmh/tind/migration.py", "source/oai-pmh/workspace.py", "source/xml/workspace.py"}
            if not required <= set(expected):
                raise InputError("Receive the complete editable repository workspace and its source")
            total = 0
            for name, entry in expected.items():
                info = archive.getinfo(name)
                if type(entry.get("bytes")) is not int or not 0 <= entry["bytes"] <= MAX_FILE or info.file_size != entry["bytes"]:
                    raise InputError("Handover member size differs from its inventory")
                total += entry["bytes"]
                if total > MAX_PACKAGE:
                    raise InputError("Handover exceeds the 4 TiB receiving limit")
                storage.checked_id(entry.get("sha256"))
            available = shutil.disk_usage(parent).free
            if total > available:
                raise InputError("The receiving directory needs " + str(total) + " free bytes for this complete handover")
            with tempfile.TemporaryDirectory(dir=parent) as staging_name:
                staging = Path(staging_name)
                os.chmod(staging, 0o700)
                for name, entry in expected.items():
                    path = staging / name
                    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    h, count = hashlib.sha256(), 0
                    with archive.open(name) as source, path.open("xb") as out:
                        os.chmod(path, 0o600)
                        while block := source.read(1024 * 1024):
                            count += len(block)
                            if count > entry["bytes"]:
                                raise InputError("Handover member exceeds its declared length")
                            h.update(block); out.write(block)
                        out.flush(); os.fsync(out.fileno())
                    if count != entry["bytes"] or h.hexdigest() != entry["sha256"]:
                        raise InputError("Handover member differs from its retained original")
                storage.private_write(staging / "handover.json", jbytes(manifest))
                restored = cls(staging / "workspace")
                try:
                    with restored.mutex, restored.db:
                        actual_projects = {row[0] for row in restored.db.execute("SELECT id FROM tind_projects")}
                        if set(manifest.get("projects", [])) != actual_projects:
                            raise InputError("Handover project inventory differs from its native workspace")
                        for project_id in sorted(actual_projects):
                            project = restored.project(project_id)
                            project["fileRoot"] = None; project["fileRootIdentity"] = None
                            restored.put_project(project)
                        received_files = set()
                        if manifest["includesFiles"]:
                            for item in manifest.get("attachments", []):
                                key = (item["projectId"], item["identifier"], item["id"])
                                if key in received_files:
                                    raise InputError("Handover repeats a source attachment")
                                received_files.add(key)
                                project = restored.project(item["projectId"])
                                prefix = PurePosixPath("attachments") / project["id"]
                                attached = member(item["member"])
                                relative = str(PurePosixPath(attached).relative_to(prefix))
                                tree = staging / prefix
                                info = tree.stat()
                                project["fileRoot"] = str(destination / prefix)
                                project["fileRootIdentity"] = {"device": info.st_dev, "inode": info.st_ino}
                                restored.put_project(project)
                                row = restored.db.execute("SELECT body FROM tind_files WHERE project_id=? AND identifier=? AND id=?", key).fetchone()
                                if not row or attached not in expected:
                                    raise InputError("Attachment refers to an absent retained source file")
                                entry = decode(row["body"])
                                if (expected[attached]["sha256"], expected[attached]["bytes"]) != (entry["sha256"], entry["bytes"]):
                                    raise InputError("Received attachment differs from its original working record")
                                entry["path"] = member(relative)
                                restored.db.execute("UPDATE tind_files SET body=? WHERE project_id=? AND identifier=? AND id=?",
                                                    (jbytes(entry).decode(), *key))
                            actual_files = {tuple(row) for row in restored.db.execute("SELECT project_id,identifier,id FROM tind_files")}
                            if actual_files != received_files:
                                raise InputError("Receive every source file in this complete handover")
                        if restored.db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                            raise InputError("The received native workspace could not be reopened")
                finally:
                    restored.close()
                storage.private_write(staging / "received.json", jbytes(receipt))
                storage.sync_dir(staging)
                if destination.exists():
                    raise InputError("The chosen receiving directory was created by another operation")
                os.replace(staging, destination)
                storage.sync_dir(parent)
        restored = cls(destination / "workspace")
        try:
            return {"directory": str(destination), "workspace": str(destination / "workspace"),
                    "source": str(destination / "source"), "includesFiles": manifest["includesFiles"],
                    "receipt": receipt, "resumed": False, "state": restored.state()}
        finally:
            restored.close()
