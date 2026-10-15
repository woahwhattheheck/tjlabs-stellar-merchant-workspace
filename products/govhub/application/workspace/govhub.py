"""Retained multi-site cutover operations around the original GovHub auditor."""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import base64
import csv
import fcntl
import hashlib
import html
import importlib.util
import io
import json
import mimetypes
import os
import re
import stat
import sys
import tempfile
import threading
import uuid
import zipfile

import govhub_schema


SOURCE = {
    "title": "GTA-98000-eRFP-1022027: Managed Hosting Provider for GovHub",
    "issuer": "Georgia Technology Authority",
    "url": "https://ssl.doas.state.ga.us/gpr/eventDetails?eSourceNumber=GTA-98000-eRFP-1022027&sourceSystemType=jag",
    "service_url": "https://digital.georgia.gov/services/govhub",
    "declarations": [
        {"unit": "sites", "quantity": 92, "source": "Attachment A, section 1.2, page 2", "observed_at": "2026-10-11T19:27:00.394216Z"},
        {"unit": "Drupal major version", "quantity": 11, "source": "Attachment A, section 1.2, page 2", "observed_at": "2026-10-11T19:27:00.394216Z"},
        {"unit": "state agencies", "quantity": "more than 90", "source": "Solicitation notice; distinct agency count, not the attachment's site inventory"},
        {"unit": "sites", "quantity": "more than 80", "source": "Public GovHub service description; Attachment A supplies the dated current-estate count"},
    ],
    "current_estate": {
        "source_filename": "ATTACHMENT A - eRFP Document_Managed Hosting Provider for GovHub.pdf",
        "source_section": "1.2", "source_page": 2,
        "source_sha256": "779a36c310bddf0b03deb8728e1e96a384ea4d586deccfdc7697695446e44934",
        "source_bytes": 331928, "observed_at": "2026-10-11T19:27:00.394216Z",
        "sites": 92, "drupal_major": 11, "disk_gb": 800, "ram_gb": 64,
        "cache": "memcache", "waf": "Cloudflare", "waf_analytics_days": 30,
        "approximate_max_monthly_visits": 18390431,
        "approximate_max_monthly_pages_served": 52209442,
        "application_monitoring": "New Relic",
        "cohort_note": "The issued estate describes scope; each operation still uses explicitly supplied comparison identifiers.",
    },
    "comparison": "Original multi-site-cutover-evidence/1.0, unchanged",
}
MANIFEST_FIELDS = ("agency_id", "canonical_url", "export_sha256", "backup_sha256", "route_count", "observed_http_status")
APPROVAL_FIELDS = ("agency_id", "field", "before", "after", "reason", "approved_by")
KINDS = {"BASELINE", "CANDIDATE", "RESTORED"}
TERMINAL = {"COMPLETE", "FAILED", "CANCELLED"}
_CACHE, _LOAD_LOCK = {}, threading.Lock()


class GovHubError(Exception):
    def __init__(self, code, message, status=422, fields=None):
        super().__init__(message)
        self.code, self.message, self.status, self.fields = code, message, status, fields or {}


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode("utf-8")).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def ident(prefix=""):
    return prefix + uuid.uuid4().hex


def text(value, limit=16000, required=False):
    if not isinstance(value, str) or len(value.encode("utf-8")) > limit or re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", value):
        raise GovHubError("INVALID_TEXT", "Use plain text within the field size limit.")
    value = value.strip()
    if required and not value:
        raise GovHubError("REQUIRED", "Supply the required name, source, identifier or reason.")
    return value


def instant(value, required=False):
    value = text(value, 80, required)
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    except ValueError as exc:
        raise GovHubError("INVALID_TIME", "Use an actual date and time with its UTC offset.") from exc


def json_bytes(content):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Repeated JSON key: " + key)
            result[key] = value
        return result
    try:
        return json.loads(content.decode("utf-8-sig"), object_pairs_hook=unique,
                          parse_constant=lambda item: (_ for _ in ()).throw(ValueError("Non-finite number: " + item)))
    except (UnicodeError, ValueError) as exc:
        raise GovHubError("INVALID_JSON", "Supply a complete UTF-8 JSON source: " + str(exc)) from exc


def csv_bytes(rows, fields):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")


def file_digest(path):
    h, size = hashlib.sha256(), 0
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


def _load(directory):
    directory = Path(directory).expanduser()
    if not directory.is_absolute() or directory.is_symlink() or not directory.is_dir():
        raise GovHubError("ASSESSMENT_CORE", "Choose the explicit original two-file assessment-core directory.", 503)
    directory = directory.resolve()
    hashes = {}
    for filename in ("workspace.py", "schema.py"):
        path = directory / filename
        if path.is_symlink() or not path.is_file():
            raise GovHubError("ASSESSMENT_CORE", "The original core requires a regular " + filename + ".", 503)
        hashes[filename] = digest(path.read_bytes())
    key = digest(packed({"directory": str(directory), "hashes": hashes}))
    with _LOAD_LOCK:
        if key in _CACHE:
            return _CACHE[key]
        prefix = "_govhub_core_" + key[:20]
        spec = importlib.util.spec_from_file_location(prefix + "_schema", directory / "schema.py")
        schema = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = schema
        spec.loader.exec_module(schema)
        govhub_schema.configure(schema)
        prior = sys.modules.get("schema")
        sys.modules["schema"] = schema
        try:
            spec = importlib.util.spec_from_file_location(prefix + "_workspace", directory / "workspace.py")
            core = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = core
            spec.loader.exec_module(core)
        finally:
            if prior is None:
                sys.modules.pop("schema", None)
            else:
                sys.modules["schema"] = prior
        bound = type("GovHubWorkspace", (GovHubWorkspace, core.Workspace), {"_core": core, "_schema": schema, "core_sources": hashes})
        _CACHE[key] = bound
        return bound


def open_workspace(workspace_path, source_root_path=None, assessment_core_path=None, create=False, name="GovHub cutover", mode="SUPPLIED"):
    directory = assessment_core_path or os.environ.get("GOVHUB_ASSESSMENT_CORE") or str(Path(__file__).resolve().parent / "vendor" / "assessment-core")
    return _load(directory)(workspace_path, source_root_path, create=create, name=name, mode=mode)


from govhub_operations import OperationsMixin
from govhub_delivery import DeliveryMixin


from content_consolidation.service import ContentMixin
from pots.workspace import PotsMixin
from editorial_playbook.service import PlaybookMixin
from content_packages.service import PackagesMixin


class GovHubWorkspace(PackagesMixin, PlaybookMixin, PotsMixin, ContentMixin, OperationsMixin, DeliveryMixin):
    def __init__(self, workspace_path, source_root_path=None, create=False, name="GovHub cutover", mode="SUPPLIED"):
        if mode not in {"SUPPLIED", "PILOT"}:
            raise GovHubError("INPUT_MODE", "Choose SUPPLIED or explicitly operator-authored PILOT inputs.")
        self.source_root = None
        if source_root_path:
            source = Path(source_root_path)
            if not source.is_absolute() or source.is_symlink() or not source.is_dir():
                raise GovHubError("SOURCE_ROOT", "Choose an existing absolute source directory.")
            self.source_root = source.resolve()
        super().__init__(workspace_path, create=create, name=name, mode=mode)
        if self.source_root and (self.source_root == self.root or self.source_root.is_relative_to(self.root) or self.root.is_relative_to(self.source_root)):
            raise GovHubError("SOURCE_ROOT", "Keep original intake outside the private workspace and its containing directory.")
        statements = [
            "CREATE TABLE IF NOT EXISTS govhub_disabled_users(username TEXT PRIMARY KEY,disabled INTEGER NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_objects(seq INTEGER PRIMARY KEY,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,parent_id TEXT NOT NULL,data TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL)",
            "CREATE INDEX IF NOT EXISTS govhub_objects_kind ON govhub_objects(kind,parent_id,seq)",
            "CREATE TABLE IF NOT EXISTS govhub_plans(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_operations(id TEXT PRIMARY KEY,revision TEXT NOT NULL,state TEXT NOT NULL,data TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_requests(request_key TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_config(environment_id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS govhub_output_files(file_id TEXT PRIMARY KEY,owner_kind TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,UNIQUE(owner_kind,owner_id,name))",
        ]
        with self.connect(write=True) as db:
            for statement in statements:
                db.execute(statement)
            if self._setting(db, "settings") is None:
                self._set(db, "settings", {"input_mode": mode, "scope_file_id": "", "scope_reference": ""})
        self._worker = None
        self._worker_stop = threading.Event()
        self._worker_wake = threading.Event()
        self._worker_lock = None
        self._worker_owner = ident("worker-")
        self._worker_mutex = threading.Lock()
        path = Path(__file__).resolve().parent.parent / "cutover.py"
        if path.is_symlink() or not path.is_file():
            raise GovHubError("ORIGINAL_AUDITOR", "Install the unchanged original ../cutover.py next to this component.", 503)
        self.auditor_sha256 = digest(path.read_bytes())
        spec = importlib.util.spec_from_file_location("_govhub_original_" + self.auditor_sha256[:16], path)
        self.auditor = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.auditor)

    def _setting(self, db, key):
        row = db.execute("SELECT value FROM govhub_settings WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else None

    def _set(self, db, key, value):
        db.execute("INSERT INTO govhub_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, packed(value)))

    def _disabled(self, name):
        with self.connect() as db:
            row = db.execute("SELECT disabled FROM govhub_disabled_users WHERE username=?", (name,)).fetchone()
            return bool(row and row[0])

    def authenticate(self, name, password):
        actor = super().authenticate(name, password)
        return actor if actor and not self._disabled(actor["name"]) else None

    def _authorize(self, user, role="operator"):
        if not isinstance(user, dict) or not user.get("name"):
            raise GovHubError("AUTH_REQUIRED", "Sign in to the private workspace.", 401)
        current = self.user(user["name"])
        if not current or current.get("role") != user.get("role") or self._disabled(current["name"]):
            raise GovHubError("ACCOUNT_CHANGED", "This account changed. Sign in again.", 401)
        if current["role"] not in {"operator": {"operator", "reviewer", "admin"}, "reviewer": {"reviewer", "admin"}, "admin": {"admin"}}[role]:
            raise GovHubError("ROLE_REQUIRED", "This action requires a " + role + " account.", 403)
        return current

    def _object(self, db, kind, value, parent="", actor="", object_id=None):
        value = dict(value)
        value.setdefault("id", object_id or ident(kind + "-"))
        value.setdefault("created_at", now())
        value.setdefault("author", actor)
        sha = digest(packed(value))
        db.execute("INSERT INTO govhub_objects(id,kind,parent_id,data,sha256,created_at,author) VALUES(?,?,?,?,?,?,?)", (value["id"], kind, parent, packed(value), sha, value["created_at"], value["author"]))
        return dict(value, sha256=sha)

    def _get(self, db, kind, value):
        row = db.execute("SELECT data,sha256 FROM govhub_objects WHERE id=? AND kind=?", (value, kind)).fetchone()
        if not row:
            raise GovHubError("NOT_FOUND", "The selected " + kind + " does not exist.", 404)
        result = json.loads(row[0])
        if digest(packed(result)) != row[1]:
            raise GovHubError("RETAINED_IDENTITY", "The retained " + kind + " identity has changed.", 409)
        return dict(result, sha256=row[1])

    def _objects(self, db, kind, parent=None):
        query = "SELECT data,sha256 FROM govhub_objects WHERE kind=?"
        params = [kind]
        if parent is not None:
            query += " AND parent_id=?"
            params.append(parent)
        return [dict(json.loads(row[0]), sha256=row[1]) for row in db.execute(query + " ORDER BY seq", params)]

    def _request(self, db, payload, actor, required=True):
        key = text(payload.get("request_key", ""), 240, required)
        fingerprint = digest(packed({"payload": payload, "actor": actor["name"]}))
        row = db.execute("SELECT * FROM govhub_requests WHERE request_key=?", (key,)).fetchone() if key else None
        if row:
            if row["fingerprint"] != fingerprint:
                raise GovHubError("RETRY_CHANGED", "This request identity belongs to different input. Use the original input to reopen it or a new key for a new action.", 409)
            return key, fingerprint, json.loads(row["result"])
        return key, fingerprint, None

    def _remember(self, db, key, fingerprint, result, actor):
        if key:
            db.execute("INSERT INTO govhub_requests VALUES(?,?,?,?,?)", (key, fingerprint, packed(result), now(), actor["name"]))

    def _changed(self, db, actor, operation, kind="", entity_id="", details=None):
        self.log(db, actor["name"] if isinstance(actor, dict) else actor, operation, kind, entity_id, details=details or {})
        self.bump(db)

    def _record_db(self, db, kind, entity_id):
        row = db.execute("SELECT * FROM entities WHERE kind=? AND id=?", (kind, entity_id)).fetchone()
        if not row:
            raise GovHubError("RECORD_NOT_FOUND", "The selected " + kind + " record does not exist.", 404)
        return self._core.view_record(row)

    def save(self, kind, entity_id, payload, user):
        actor = self._authorize(user)
        if kind not in govhub_schema.SCHEMAS:
            return super().save(kind, entity_id, payload, actor)
        entity_id = self._schema.identity(entity_id)
        data = self._schema.validate(kind, payload.get("data"))
        with self.connect(write=True) as db:
            old = db.execute("SELECT * FROM entities WHERE kind=? AND id=?", (kind, entity_id)).fetchone()
            for field in govhub_schema.SCHEMAS[kind]["fields"]:
                if field["type"] not in {"reference", "references"}:
                    continue
                values = data[field["name"]] if field["type"] == "references" else [data[field["name"]]]
                for value in values:
                    if value and not db.execute("SELECT 1 FROM entities WHERE kind=? AND id=?", (field["ref"], value)).fetchone():
                        raise GovHubError("REFERENCE_NOT_FOUND", "Choose an existing " + field["ref"] + " record.", fields={field["name"]: "The reference is missing."})
            if kind == "sites":
                from urllib.parse import urlsplit
                parsed = urlsplit(data["canonical_url"])
                if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                    raise GovHubError("CANONICAL_URL", "Use the site's original HTTPS canonical URL.")
                for row in db.execute("SELECT id,data FROM entities WHERE kind='sites' AND id<>?", (entity_id,)):
                    if json.loads(row["data"])["comparison_id"] == data["comparison_id"]:
                        raise GovHubError("COMPARISON_ID", "This original comparison ID already belongs to site " + row["id"] + ".", 409)
            if kind == "migration_issues" and data["status"] in {"Resolved", "Accepted"} and (not data["resolution"] or not data["resolved_at"]):
                raise GovHubError("RESOLUTION_REQUIRED", "Retain the actual resolution or acceptance and its completion time.")
            if old and data.get("review_state") == "Reviewed" and data != json.loads(old["data"]):
                self._authorize(actor, "reviewer")
            self._write(db, kind, entity_id, data, actor, payload.get("expected_revision"), text(payload.get("note", "")), archived=bool(payload.get("archived", False)))
            self.bump(db)
        return self.record(kind, entity_id)

    def upload(self, payload, user):
        return super().upload(payload, self._authorize(user))

    def _file_row(self, db, file_id):
        row = db.execute("SELECT * FROM files WHERE id=?", (file_id,)).fetchone()
        if not row:
            raise GovHubError("SOURCE_NOT_FOUND", "The retained source file does not exist.", 404)
        return dict(row)

    def _verify_file(self, item):
        path = self.blobs / item["sha256"]
        if path.is_symlink() or not path.is_file():
            raise GovHubError("SOURCE_MISSING", "The retained original file is missing: " + item["filename"], 409)
        actual, size = file_digest(path)
        if actual != item["sha256"] or size != item["bytes"]:
            raise GovHubError("SOURCE_CHANGED", "The retained source bytes changed: " + item["filename"], 409)
        return path

    def _register(self, db, path, filename, actor, category="Evidence", label="", owner_kind=None, owner_id=None, output_name=None, expected_sha=None):
        """Stream one immutable artifact; no memory-size dependency on backups."""
        filename = text(filename, 500, True)
        if Path(filename).name != filename or filename in {".", ".."} or "\\" in filename:
            raise GovHubError("FILENAME", "Use a plain original filename.")
        self.blobs.mkdir(mode=0o700, exist_ok=True)
        temp_path = None
        try:
            with open(path, "rb") as source, tempfile.NamedTemporaryFile(dir=self.blobs, prefix=".govhub-", delete=False) as output:
                temp_path = Path(output.name)
                h, size = hashlib.sha256(), 0
                before = os.fstat(source.fileno())
                if not stat.S_ISREG(before.st_mode):
                    raise GovHubError("SOURCE_TYPE", "Select a regular source file.")
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    h.update(chunk)
                    size += len(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
                after = os.fstat(source.fileno())
                if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise GovHubError("SOURCE_MOVED", "The source changed during retention. Select its completed original version.", 409)
                sha = h.hexdigest()
                if expected_sha and expected_sha != sha:
                    raise GovHubError("SOURCE_HASH", "The actual retained bytes do not match the supplied artifact hash.", 409)
            destination = self.blobs / sha
            if destination.exists():
                actual, retained_size = file_digest(destination)
                if destination.is_symlink() or actual != sha or retained_size != size:
                    raise GovHubError("BLOB_CHANGED", "An existing content-addressed source is damaged.", 409)
                temp_path.unlink()
            else:
                os.replace(temp_path, destination)
                os.chmod(destination, 0o600)
                descriptor = os.open(self.blobs, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
            temp_path = None
            item = {"id": ident("file-"), "filename": filename, "sha256": sha, "bytes": size, "category": category, "source_label": label, "system_id": "", "created_at": now(), "author": actor["name"] if isinstance(actor, dict) else actor}
            db.execute("INSERT INTO files VALUES(:id,:filename,:sha256,:bytes,:category,:source_label,:system_id,:created_at,:author)", item)
            if owner_kind:
                name = output_name or filename
                db.execute("INSERT INTO govhub_output_files VALUES(?,?,?,?,?)", (item["id"], owner_kind, owner_id, name, mimetypes.guess_type(name)[0] or "application/octet-stream"))
            return item
        finally:
            if temp_path:
                temp_path.unlink(missing_ok=True)

    @contextmanager
    def _source_open(self, relative):
        if not self.source_root:
            raise GovHubError("SOURCE_ROOT", "Start the workspace with an explicit source-root directory.")
        relative = text(relative, 2000, True)
        path = Path(relative)
        if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts) or "\\" in relative:
            raise GovHubError("SOURCE_PATH", "Select a relative regular file under the configured source root.")
        descriptors = []
        try:
            descriptor = os.open(self.source_root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            descriptors.append(descriptor)
            for part in path.parts[:-1]:
                descriptor = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                descriptors.append(descriptor)
            final = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=descriptor)
            descriptors.append(final)
            if not stat.S_ISREG(os.fstat(final).st_mode):
                raise GovHubError("SOURCE_TYPE", "Select a regular original file.")
            yield Path("/proc/self/fd") / str(final)
        except OSError as exc:
            raise GovHubError("SOURCE_PATH", "The selected source is unavailable or traverses a symbolic link.") from exc
        finally:
            for descriptor in reversed(descriptors):
                os.close(descriptor)

    def _sources_list(self):
        values = []
        if self.source_root:
            for directory, folders, files in os.walk(self.source_root, followlinks=False):
                folders[:] = sorted(name for name in folders if not (Path(directory) / name).is_symlink())
                for name in sorted(files):
                    path = Path(directory) / name
                    if path.is_symlink() or not path.is_file():
                        continue
                    status = path.stat()
                    values.append({"path": str(path.relative_to(self.source_root)), "name": name, "bytes": status.st_size, "modified_at": datetime.fromtimestamp(status.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")})
        return {"root_configured": bool(self.source_root), "files": values}

    def _sources_retain(self, payload, actor):
        category = payload.get("category", "Evidence")
        if category not in {"Inventory", "Extract", "Evidence"}:
            raise GovHubError("CATEGORY", "Choose Inventory, Extract, or Evidence.")
        with self._source_open(payload.get("path", "")) as path:
            with self.connect(write=True) as db:
                item = self._register(db, path, Path(payload["path"]).name, actor, category, text(payload.get("source_label", "")))
                self._changed(db, actor, "Original source retained", "files", item["id"], {"sha256": item["sha256"], "bytes": item["bytes"]})
        return item

    def _sources_get(self, payload):
        with self.connect() as db:
            item = self._file_row(db, payload.get("file_id"))
        path = self._verify_file(item)
        result = {"file": item, "format": "binary"}
        suffix = Path(item["filename"]).suffix.lower()
        if suffix == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as source:
                reader = csv.DictReader(source)
                result.update(format="csv", headers=reader.fieldnames or [], preview=[])
                count = 0
                for row in reader:
                    count += 1
                    if len(result["preview"]) < 8:
                        result["preview"].append(row)
                result["rows"] = count
        elif suffix == ".json" and item["bytes"] <= 16 * 1024 * 1024:
            value = json_bytes(path.read_bytes())
            result.update(format="json", metadata={"type": "array" if isinstance(value, list) else "object" if isinstance(value, dict) else type(value).__name__, "keys": list(value)[:40] if isinstance(value, dict) else [], "length": len(value) if isinstance(value, (dict, list)) else None})
            result["preview"] = value[:8] if isinstance(value, list) else value if len(packed(value)) < 16000 else {key: value[key] for key in list(value)[:8] if len(packed(value[key])) < 3000} if isinstance(value, dict) else value
        elif suffix == ".pdf":
            result.update(format="pdf", metadata={"bytes": item["bytes"], "sha256": item["sha256"]})
        return result

    def _scope_save(self, payload, actor):
        with self.connect(write=True) as db:
            if payload.get("expected_head") != self.meta(db)["head"]:
                raise GovHubError("WORKSPACE_CHANGED", "The workspace changed. Reopen the current scope before saving.", 409)
            item = self._file_row(db, payload.get("file_id"))
            self._verify_file(item)
            settings = self._setting(db, "settings")
            settings.update(scope_file_id=item["id"], scope_reference=text(payload.get("reference", ""), 4000, True))
            self._set(db, "settings", settings)
            self._object(db, "scope", settings, actor=actor["name"])
            self._changed(db, actor, "Operating scope source retained", "files", item["id"])
            return {"settings": settings, "head": self.meta(db)["head"]}

    def _bindings(self, db, rows, requested):
        if not isinstance(requested, list):
            raise GovHubError("BINDINGS", "Supply an array of actual file bindings.")
        by_id = {row["agency_id"]: row for row in rows}
        result, seen, verified = [], set(), set()
        def verify(item):
            identity = (item["sha256"], item["bytes"])
            if identity not in verified:
                self._verify_file(item)
                verified.add(identity)
        for supplied in requested:
            if not isinstance(supplied, dict):
                raise GovHubError("BINDINGS", "Each file binding must name its original comparison ID.")
            supplied = dict(supplied)
            if supplied.get("capture_operation_id"):
                capture = self._operation(db, supplied["capture_operation_id"])
                if capture["type"] not in {"CAPTURE", "BACKUP_CREATE", "BACKUP_DOWNLOAD"} or capture["state"] != "COMPLETE":
                    raise GovHubError("CAPTURE_BINDING", "Choose a completed original native source operation.")
                artifacts = capture.get("retained_artifacts", [])
                expected_row = by_id.get(supplied.get("agency_id"), {})
                for role in ("export", "backup"):
                    matches = [item for item in artifacts if item["role"] == role]
                    if len(matches) == 1:
                        supplied.setdefault(role + "_file_id", matches[0]["file"]["id"])
                    elif len(matches) > 1 and not supplied.get(role + "_file_id"):
                        exact = [item for item in matches if item["file"]["sha256"] == expected_row.get(role + "_sha256")]
                        if len(exact) == 1:
                            supplied[role + "_file_id"] = exact[0]["file"]["id"]
                        else:
                            raise GovHubError("CAPTURE_BINDING", "Select the exact " + role + " matching this source inventory's hash.")
                primary_files = {supplied.get(role + "_file_id") for role in ("export", "backup")}
                original_extras = [{"role": item["role"], "file_id": item["file"]["id"]}
                                   for item in artifacts if item["file"]["id"] not in primary_files]
                explicit = supplied.get("files", [])
                if not isinstance(explicit, list):
                    raise GovHubError("BINDINGS", "Supplementary native bindings must be an array.")
                supplied["files"] = original_extras + [item for item in explicit if isinstance(item, dict) and item.get("file_id") not in {extra["file_id"] for extra in original_extras}]
            agency = text(supplied.get("agency_id", ""), 240, True)
            if agency in seen or agency not in by_id:
                raise GovHubError("BINDINGS", "Each supplied comparison ID may appear once and must belong to this original manifest.")
            seen.add(agency)
            value = {"agency_id": agency, "files": []}
            for role in ("export", "backup"):
                if supplied.get(role + "_file_id"):
                    item = self._file_row(db, supplied[role + "_file_id"])
                    verify(item)
                    if item["sha256"] != by_id[agency][role + "_sha256"]:
                        raise GovHubError("BINDING_HASH", "The actual " + role + " bytes differ from the original manifest for " + agency + ".", 409)
                    native = self._native_file_metadata(db, item["id"])
                    if native:
                        item["native"] = native
                    value[role] = item
            files = supplied.get("files", [])
            if not isinstance(files, list):
                raise GovHubError("BINDINGS", "Native supplementary files must be an array.")
            for extra in files:
                if not isinstance(extra, dict):
                    raise GovHubError("BINDINGS", "Each supplementary native file must name its role and retained file ID.")
                item = self._file_row(db, extra.get("file_id"))
                verify(item)
                native = self._native_file_metadata(db, item["id"])
                if extra.get("relative_path"):
                    relative = text(extra["relative_path"], 2000, True)
                    path = Path(relative)
                    if path.is_absolute() or ".." in path.parts or "\\" in relative:
                        raise GovHubError("NATIVE_RELATIVE_PATH", "Use the original relative path within the captured configuration or file tree.")
                    if native.get("relative_path") and native["relative_path"] != relative:
                        raise GovHubError("NATIVE_RELATIVE_PATH", "The supplied relative path differs from the original native capture.", 409)
                    native["relative_path"] = relative
                value["files"].append({"role": text(extra.get("role", ""), 120, True), "file": item, "native": native})
            result.append(value)
        return result

    def _native_file_metadata(self, db, file_id):
        row = db.execute("SELECT owner_id FROM govhub_output_files WHERE file_id=? AND owner_kind='operation'", (file_id,)).fetchone()
        if not row:
            return {}
        operation = self._operation(db, row[0])
        for artifact in operation.get("retained_artifacts", []):
            if artifact["file"]["id"] == file_id:
                value = dict(artifact.get("native", {}))
                value.setdefault("capture_operation_id", operation["id"])
                value.setdefault("provider_context", (operation.get("native_result") or {}).get("provider_context", {}))
                return value
        return {}

    def _inventories_preview(self, payload, actor):
        kind = payload.get("kind")
        if kind not in KINDS:
            raise GovHubError("SNAPSHOT_KIND", "Choose BASELINE, CANDIDATE, or RESTORED.")
        label = text(payload.get("label", ""), 500, True)
        observed = instant(payload.get("observed_at", ""), True)
        with self.connect(write=True) as db:
            item = self._file_row(db, payload.get("file_id"))
            if item["bytes"] > 32 * 1024 * 1024:
                raise GovHubError("MANIFEST_SIZE", "A manifest may be at most 32 MiB; retain larger actual site artifacts separately.", 413)
            try:
                rows = list(self.auditor.read_manifest(self._verify_file(item)).values())
            except ValueError as exc:
                raise GovHubError("NATIVE_MANIFEST", str(exc)) from exc
            bindings = self._bindings(db, rows, payload.get("bindings", []))
            value = {"label": label, "kind": kind, "file_id": item["id"], "source_sha256": item["sha256"], "observed_at": observed, "row_count": len(rows), "rows": rows, "bindings": bindings}
            fingerprint = digest(packed(value))
            for old in self._objects(db, "intake"):
                if old["fingerprint"] == fingerprint:
                    return {"intake": old}
            value["fingerprint"] = fingerprint
            intake = self._object(db, "intake", value, actor=actor["name"])
            self._changed(db, actor, "Original inventory preview retained", "intake", intake["id"], {"rows": len(rows), "source_sha256": item["sha256"]})
            return {"intake": intake}

    def _verify_snapshot(self, db, snapshot, deep=False, cohort=None):
        original = self._file_row(db, snapshot["file_id"])
        if original["sha256"] != snapshot["source_sha256"]:
            raise GovHubError("SNAPSHOT_SOURCE", "The selected snapshot's original source identity changed.", 409)
        path = self._verify_file(original)
        try:
            current = list(self.auditor.read_manifest(path).values())
        except ValueError as exc:
            raise GovHubError("NATIVE_MANIFEST", str(exc)) from exc
        if current != snapshot["rows"]:
            raise GovHubError("SNAPSHOT_ROWS", "The retained snapshot rows no longer match its original source.", 409)
        verified = {original["sha256"]: path}
        if not deep:
            return verified
        def verify(item):
            if item["sha256"] not in verified:
                verified[item["sha256"]] = self._verify_file(item)
        for binding in snapshot["bindings"]:
            if cohort is not None and binding["agency_id"] not in cohort:
                continue
            for role in ("export", "backup"):
                if binding.get(role):
                    verify(binding[role])
            for extra in binding.get("files", []):
                verify(extra["file"])
        return verified

    def _inventories_commit(self, payload, actor):
        with self.connect(write=True) as db:
            key, fingerprint, prior = self._request(db, payload, actor)
            if prior:
                return prior
            intake = self._get(db, "intake", payload.get("intake_id"))
            self._verify_snapshot(db, intake)
            existing = next((item for item in self._objects(db, "snapshot") if item["intake_id"] == intake["id"]), None)
            if existing:
                result = {"snapshot": existing}
            else:
                value = {key: value for key, value in intake.items() if key not in {"id", "sha256", "created_at", "author"}}
                value["intake_id"] = intake["id"]
                result = {"snapshot": self._object(db, "snapshot", value, actor=actor["name"])}
                self._changed(db, actor, "Complete source inventory accepted", "snapshot", result["snapshot"]["id"], {"source_sha256": intake["source_sha256"], "rows": intake["row_count"]})
            self._remember(db, key, fingerprint, result, actor)
            return result

    def _snapshot_summary(self, item):
        value = {key: item[key] for key in ("id", "label", "kind", "sha256", "file_id", "source_sha256", "observed_at", "created_at", "author", "row_count")}
        value.update(bound_exports=sum(bool(row.get("export")) for row in item["bindings"]), bound_backups=sum(bool(row.get("backup")) for row in item["bindings"]))
        return value

    @staticmethod
    def _compare_rows(before, after):
        a, b = {row["agency_id"]: row for row in before}, {row["agency_id"]: row for row in after}
        added, removed, changed, unchanged = [], [], [], []
        for key in sorted(set(a) | set(b)):
            if key not in a:
                added.append(b[key])
            elif key not in b:
                removed.append(a[key])
            else:
                fields = [{"field": field, "before": a[key][field], "after": b[key][field]} for field in MANIFEST_FIELDS if a[key][field] != b[key][field]]
                (changed if fields else unchanged).append({"agency_id": key, "fields": fields} if fields else key)
        return {"added": added, "removed": removed, "changed": changed, "unchanged": unchanged}

    def _inventories_compare(self, payload):
        with self.connect(snapshot=True) as db:
            before = self._get(db, "snapshot", payload.get("before_id"))
            after = self._get(db, "snapshot", payload.get("after_id"))
            return dict(before_id=before["id"], after_id=after["id"], **self._compare_rows(before["rows"], after["rows"]))

    def _plan(self, db, plan_id, revision=None):
        if revision:
            plan = self._get(db, "plan_version", revision)
            if plan["plan_id"] != plan_id:
                raise GovHubError("PLAN_REVISION", "This revision belongs to another plan.", 409)
            return dict(plan, id=plan_id, revision=revision, created_at=plan.get("plan_created_at", plan["created_at"]))
        row = db.execute("SELECT data,revision FROM govhub_plans WHERE id=?", (plan_id,)).fetchone()
        if not row:
            raise GovHubError("PLAN_NOT_FOUND", "The selected cohort plan does not exist.", 404)
        return dict(json.loads(row[0]), revision=row[1])

    def _expected(self, value, payload):
        if value["revision"] != payload.get("expected_revision"):
            raise GovHubError("REVISION_CHANGED", "A newer version exists. Keep your input and compare the current record before applying it.", 409)

    def _plan_input(self, db, payload):
        value = {key: text(payload.get(key, ""), 32000 if key == "notes" else 4000, key == "name") for key in ("name", "owner", "rollback_reference", "notes")}
        for key in ("baseline_id", "candidate_id"):
            snapshot = self._get(db, "snapshot", payload.get(key))
            value[key] = snapshot["id"]
        supplied = payload.get("agency_ids")
        if not isinstance(supplied, list) or not supplied or len(supplied) > 10000:
            raise GovHubError("COHORT_REQUIRED", "Choose the complete explicit comparison-ID cohort for this plan.")
        value["agency_ids"] = [text(item, 240, True) for item in supplied]
        if len(set(value["agency_ids"])) != len(value["agency_ids"]):
            raise GovHubError("DUPLICATE_COHORT", "Each original comparison ID must appear once in the plan.")
        value["agency_ids"] = sorted(value["agency_ids"])
        minimum = payload.get("min_agencies", len(value["agency_ids"]))
        if not isinstance(minimum, int) or isinstance(minimum, bool) or not 1 <= minimum <= len(value["agency_ids"]):
            raise GovHubError("COVERAGE", "Choose a positive expected baseline count within this explicit cohort.")
        value["min_agencies"] = minimum
        value["window_start"], value["window_end"] = instant(payload.get("window_start", "")), instant(payload.get("window_end", ""))
        if value["window_start"] and value["window_end"] and value["window_end"] <= value["window_start"]:
            raise GovHubError("WINDOW", "The agreed end time must follow the start time.")
        return value

    def _plans_save(self, payload, actor, revise=False):
        with self.connect(write=True) as db:
            old = self._plan(db, payload.get("plan_id")) if revise else None
            if old:
                self._expected(old, payload)
            value = self._plan_input(db, payload)
            timestamp = now()
            plan_id = old["id"] if old else ident("plan-")
            value.update(id=plan_id, created_at=old["created_at"] if old else timestamp, updated_at=timestamp, author=actor["name"])
            version = self._object(db, "plan_version", {**value, "id": ident("version-"), "plan_id": plan_id, "plan_created_at": value["created_at"], "created_at": timestamp, "parent_revision": old["revision"] if old else None, "reason": text(payload.get("reason", "Initial cohort plan"), 8000, revise)}, parent=plan_id, actor=actor["name"])
            revision = version["id"]
            value["revision"] = revision
            db.execute("INSERT INTO govhub_plans VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data", (plan_id, revision, packed(value)))
            self._changed(db, actor, "Cohort plan revised" if old else "Cohort plan created", "plan", plan_id, {"revision": revision, "cohort": value["agency_ids"]})
            return {"plan": self._plan_summary(db, value)}

    def _applicable(self, db, plan):
        before = {row["agency_id"]: row for row in self._get(db, "snapshot", plan["baseline_id"])["rows"]}
        after = {row["agency_id"]: row for row in self._get(db, "snapshot", plan["candidate_id"])["rows"]}
        latest = {}
        for approval in self._objects(db, "approval", plan["id"]):
            latest[(approval["agency_id"], approval["field"])] = approval
        revoked = {item["approval_id"] for item in self._objects(db, "revocation", plan["id"])}
        result = []
        for (agency, field), value in latest.items():
            if value["id"] in revoked or agency not in plan["agency_ids"] or agency not in before or agency not in after:
                continue
            if value["before"] == str(before[agency][field]) and value["after"] == str(after[agency][field]) and value["before"] != value["after"]:
                result.append(value)
        return sorted(result, key=lambda item: (item["agency_id"], item["field"]))

    def _current_audit(self, db, plan):
        identity = digest(packed([item["id"] for item in self._applicable(db, plan)]))
        matches = [item for item in self._objects(db, "audit", plan["id"]) if item["plan_revision"] == plan["revision"] and item["approval_identity"] == identity]
        return matches[-1] if matches else None

    def _current_review(self, db, plan, audit=None):
        audit = audit or self._current_audit(db, plan)
        if not audit:
            return None
        matches = [item for item in self._objects(db, "review", plan["id"]) if item["plan_revision"] == plan["revision"] and item["audit_id"] == audit["id"]]
        return matches[-1] if matches else None

    def _plan_summary(self, db, plan):
        audit = self._current_audit(db, plan)
        review = self._current_review(db, plan, audit)
        result = {key: plan[key] for key in ("id", "revision", "name", "baseline_id", "candidate_id", "agency_ids", "min_agencies", "updated_at", "author")}
        result.update(status="APPROVED" if review and review["decision"] == "APPROVE" else "CHANGES_REQUIRED" if (review and review["decision"] == "RETURN") or (audit and audit["status"] == "FAIL") else "READY_FOR_REVIEW" if audit else "DRAFT", latest_audit_id=audit["id"] if audit else None, latest_audit_status=audit["status"] if audit else None, latest_review=review)
        latest = {}
        for row in db.execute("SELECT data FROM govhub_operations WHERE state='COMPLETE'"):
            operation = json.loads(row[0])
            if operation["plan_id"] != plan["id"] or operation["plan_revision"] != plan["revision"] or operation["type"] not in {"CUTOVER", "ROLLBACK"}:
                continue
            stamp = operation.get("actual_finished_at") or operation["updated_at"]
            for agency in operation.get("agency_ids", operation["plan"]["agency_ids"]):
                if agency not in latest or latest[agency]["at"] < stamp:
                    latest[agency] = {"operation_id": operation["id"], "type": operation["type"], "at": stamp, "environment_id": operation["environment_id"]}
        result["execution"] = {"cutover_verified_ids": sorted(key for key, value in latest.items() if value["type"] == "CUTOVER"), "rollback_verified_ids": sorted(key for key, value in latest.items() if value["type"] == "ROLLBACK"), "unverified_ids": sorted(set(plan["agency_ids"]) - set(latest)), "latest_by_comparison_id": latest}
        return result

    def _plans_get(self, payload):
        with self.connect(snapshot=True) as db:
            plan = self._plan(db, payload.get("plan_id"), payload.get("revision"))
            result = {"plan": dict(plan, **self._plan_summary(db, plan)), "versions": self._objects(db, "plan_version", plan["id"]), "baseline": self._get(db, "snapshot", plan["baseline_id"]), "candidate": self._get(db, "snapshot", plan["candidate_id"]), "approvals": self._objects(db, "approval", plan["id"]), "revocations": self._objects(db, "revocation", plan["id"]), "applicable_approvals": self._applicable(db, plan), "audits": self._objects(db, "audit", plan["id"]), "reviews": self._objects(db, "review", plan["id"])}
            result["operations"] = [self._operation_summary(json.loads(row[0])) for row in db.execute("SELECT data FROM govhub_operations") if json.loads(row[0])["plan_id"] == plan["id"]]
            return result

    def _audits_run(self, payload, actor):
        with self.connect(write=True) as db:
            plan = self._plan(db, payload.get("plan_id"))
            self._expected(plan, payload)
            baseline, candidate = self._get(db, "snapshot", plan["baseline_id"]), self._get(db, "snapshot", plan["candidate_id"])
            self._verify_snapshot(db, baseline)
            self._verify_snapshot(db, candidate)
            previous = self._current_audit(db, plan)
            if previous:
                return {"audit": previous}
            approvals = self._applicable(db, plan)
            cohort = set(plan["agency_ids"])
            before = {row["agency_id"]: row for row in baseline["rows"] if row["agency_id"] in cohort}
            after = {row["agency_id"]: row for row in candidate["rows"] if row["agency_id"] in cohort}
            native = self.auditor.audit(before, after, {(item["agency_id"], item["field"]): item for item in approvals}, plan["min_agencies"])
            scope = [{"agency_id": agency, "code": "DECLARED_ID_MISSING", "message": "The declared comparison ID is missing from both pinned inventories."} for agency in sorted(cohort - set(before) - set(after))]
            inputs = {"baseline_sha256": baseline["source_sha256"], "candidate_sha256": candidate["source_sha256"], "approvals_sha256": digest(csv_bytes(approvals, APPROVAL_FIELDS)), "baseline_snapshot_id": baseline["id"], "candidate_snapshot_id": candidate["id"], "cohort": plan["agency_ids"], "auditor_sha256": self.auditor_sha256}
            report = {"tool": "multi-site-cutover-evidence/1.0", "generated_at": now(), "inputs": inputs, "summary": native, "limits": ["Compares the exact retained manifest fields and explicit selected cohort.", "Native execution and source-artifact completeness are retained separately in the linked operation history."]}
            value = {"plan_id": plan["id"], "plan_revision": plan["revision"], "approval_identity": digest(packed([item["id"] for item in approvals])), "approval_ids": [item["id"] for item in approvals], "status": "PASS" if native["status"] == "PASS" and not scope else "FAIL", "summary": native, "scope_issues": scope, "inputs": inputs, "report": report}
            audit = self._object(db, "audit", value, parent=plan["id"], actor=actor["name"])
            self._changed(db, actor, "Original cutover audit completed", "audit", audit["id"], {"status": audit["status"], "plan_revision": plan["revision"]})
            return {"audit": audit}

    def _approvals_save(self, payload, actor):
        self._authorize(actor, "reviewer")
        with self.connect(write=True) as db:
            plan = self._plan(db, payload.get("plan_id"))
            self._expected(plan, payload)
            agency = text(payload.get("agency_id", ""), 240, True)
            field = payload.get("field")
            if field not in self.auditor.COMPARE or agency not in plan["agency_ids"]:
                raise GovHubError("APPROVAL_FIELD", "Choose a changed comparable field within this exact plan.")
            before = {row["agency_id"]: row for row in self._get(db, "snapshot", plan["baseline_id"])["rows"]}
            after = {row["agency_id"]: row for row in self._get(db, "snapshot", plan["candidate_id"])["rows"]}
            if agency not in before or agency not in after:
                raise GovHubError("MISSING_SITE", "Restore the missing site inventory before reviewing field changes.")
            a, b = str(before[agency][field]), str(after[agency][field])
            if not isinstance(payload.get("before"), str) or not isinstance(payload.get("after"), str) or payload["before"] != a or payload["after"] != b or a == b:
                raise GovHubError("APPROVAL_VALUES", "Review the exact currently pinned differing before and after values.", 409)
            value = {"plan_id": plan["id"], "plan_revision": plan["revision"], "agency_id": agency, "field": field, "before": a, "after": b, "reason": text(payload.get("reason", ""), 12000, True), "approved_by": actor["name"]}
            approval = self._object(db, "approval", value, parent=plan["id"], actor=actor["name"])
            self._changed(db, actor, "Exact field change approved", "approval", approval["id"], {"plan_id": plan["id"], "agency_id": agency, "field": field})
            return {"approval": approval, "plan": self._plan_summary(db, plan)}

    def _approvals_revoke(self, payload, actor):
        self._authorize(actor, "reviewer")
        with self.connect(write=True) as db:
            approval = self._get(db, "approval", payload.get("approval_id"))
            existing = next((item for item in self._objects(db, "revocation", approval["plan_id"]) if item["approval_id"] == approval["id"]), None)
            if existing:
                return {"revocation": existing}
            value = self._object(db, "revocation", {"approval_id": approval["id"], "reason": text(payload.get("reason", ""), 12000, True)}, parent=approval["plan_id"], actor=actor["name"])
            self._changed(db, actor, "Field approval revoked", "approval", approval["id"])
            return {"revocation": value}

    def _reviews_save(self, payload, actor):
        self._authorize(actor, "reviewer")
        with self.connect(write=True) as db:
            plan = self._plan(db, payload.get("plan_id"))
            self._expected(plan, payload)
            audit = self._current_audit(db, plan)
            if not audit or audit["id"] != payload.get("audit_id"):
                raise GovHubError("AUDIT_CHANGED", "Review the current audit for this exact plan and approval set.", 409)
            decision = payload.get("decision")
            if decision not in {"APPROVE", "RETURN"}:
                raise GovHubError("REVIEW_DECISION", "Choose APPROVE or RETURN.")
            if decision == "APPROVE" and audit["status"] != "PASS":
                raise GovHubError("AUDIT_FINDINGS", "Correct the actual source or field discrepancies and rerun the original audit before approving cutover.", 409)
            review = self._object(db, "review", {"plan_id": plan["id"], "plan_revision": plan["revision"], "audit_id": audit["id"], "decision": decision, "reason": text(payload.get("reason", ""), 12000, True)}, parent=plan["id"], actor=actor["name"])
            self._changed(db, actor, "Cohort audit reviewed", "review", review["id"], {"decision": decision})
            return {"review": review, "plan": self._plan_summary(db, plan)}

    def snapshot(self):
        with self.connect(snapshot=True) as db:
            meta = self.meta(db)
            entities = {kind: [] for kind in [*self._schema.SCHEMAS, "profiles"]}
            for row in db.execute("SELECT * FROM entities ORDER BY kind,id"):
                entities.setdefault(row["kind"], []).append(self._core.view_record(row))
            generated = {row[0] for row in db.execute("SELECT file_id FROM govhub_output_files WHERE owner_kind='export'")}
            files = [dict(row) for row in db.execute("SELECT * FROM files ORDER BY rowid DESC") if row["id"] not in generated]
            imports = [dict(row, mapping=json.loads(row["mapping"]), result=json.loads(row["result"])) for row in db.execute("SELECT id,file_id,kind,mapping,result,created_at,author FROM imports ORDER BY rowid DESC")]
            snapshots = [self._snapshot_summary(item) for item in self._objects(db, "snapshot")]
            plans = [self._plan_summary(db, json.loads(row[0])) for row in db.execute("SELECT data FROM govhub_plans ORDER BY rowid DESC")]
            operations = [self._operation_summary(json.loads(row[0])) for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid DESC")]
            exports = self._objects(db, "export")
            intakes = [{key: item[key] for key in ("id", "label", "kind", "file_id", "source_sha256", "observed_at", "row_count", "created_at", "author")} for item in self._objects(db, "intake")]
            summary = {"sites": sum(not row["archived"] for row in entities["sites"]), "environments": sum(not row["archived"] for row in entities["environments"]), "snapshots": len(snapshots), "plans": len(plans), "open_issues": sum(not row["archived"] and row["data"]["status"] in {"Open", "In progress"} for row in entities["migration_issues"]), "active_operations": sum(row["state"] not in TERMINAL for row in operations), "handovers": len(exports)}
            govhub = {"settings": self._setting(db, "settings"), "summary": summary, "snapshots": list(reversed(snapshots)), "intakes": list(reversed(intakes)), "plans": plans, "operations": operations, "exports": list(reversed(exports)), "worker": {"running": bool(self._worker and self._worker.is_alive())}, "observed_at": now()}
            from visitor_journeys.workspace import summaries
            govhub["visitor"] = summaries(self, db)
            govhub["pots"] = self._pots_summary(db)
            govhub["editorial"] = self._playbook_summary(db)
            return dict(**meta, entities=entities, schemas=self._schema.SCHEMAS, files=files, imports=imports, runs=[], source=SOURCE, govhub=govhub, content_consolidation=self._content_summary(db), content_packages=self._packages_summary(db))

    def dispatch(self, operation, payload, user):
        actor = self._authorize(user)
        if not isinstance(payload, dict):
            raise GovHubError("ACTION_INPUT", "Supply a JSON object for the workspace action.")
        action = text(operation, 200, True).strip("/").replace("/", ".")
        if "static_workspace_id" in payload or "static_actor" in payload:
            with self.connect(snapshot=True) as db:
                workspace_id = self.meta(db)["workspace"]["id"]
            if payload.get("static_actor") != actor["name"] or payload.get("static_workspace_id") != workspace_id:
                raise GovHubError("STATIC_REQUEST_OWNER", "Recover this retained action in its original workspace and account.", 401)
        if action.startswith("static."):
            from static_releases.service import dispatch
            return dispatch(self, action, payload, actor)
        if action.startswith("playbook."):
            return self._playbook_dispatch(action[len("playbook."):], payload, actor)
        if action.startswith("pots."):
            return self._pots_dispatch(action[len("pots."):], payload, actor)
        if action.startswith("packages."):
            return self._packages_dispatch(action[len("packages."):], payload, actor)
        if action.startswith("content."):
            return self._content_dispatch(action[len("content."):], payload, actor)
        if action == "workspace.backup":
            self._authorize(actor, "admin")
            return self.backup(payload.get("destination", ""))
        if action.startswith("visitor."):
            from visitor_journeys.workspace import dispatch
            return dispatch(self, action, payload, actor)
        handlers = {
            "sources.list": lambda: self._sources_list(),
            "sources.retain": lambda: self._sources_retain(payload, actor),
            "sources.get": lambda: self._sources_get(payload),
            "sources.capture": lambda: self._operations_create(payload, actor, capture=True),
            "scope.save": lambda: self._scope_save(payload, actor),
            "inventories.preview": lambda: self._inventories_preview(payload, actor),
            "inventories.commit": lambda: self._inventories_commit(payload, actor),
            "inventories.compare": lambda: self._inventories_compare(payload),
            "plans.create": lambda: self._plans_save(payload, actor),
            "plans.revise": lambda: self._plans_save(payload, actor, revise=True),
            "plans.get": lambda: self._plans_get(payload),
            "audits.run": lambda: self._audits_run(payload, actor),
            "approvals.save": lambda: self._approvals_save(payload, actor),
            "approvals.revoke": lambda: self._approvals_revoke(payload, actor),
            "reviews.save": lambda: self._reviews_save(payload, actor),
            "target-expectations.context": lambda: self._target_expectations_context(payload),
            "target-expectations.preview": lambda: self._target_expectations_preview(payload),
            "target-expectations.save": lambda: self._target_expectations_save(payload, actor),
            "target-expectations.review": lambda: self._target_expectations_review(payload, actor),
            "target-expectations.get": lambda: self._target_expectations_get(payload),
            "operations.configure": lambda: self._operations_configure(payload, actor),
            "operations.capabilities": lambda: self._operations_capabilities(payload),
            "operations.create": lambda: self._operations_create(payload, actor),
            "operations.get": lambda: self._operations_get(payload),
            "operations.cancel": lambda: self._operations_cancel(payload, actor),
            "operations.resume": lambda: self._operations_resume(payload, actor),
            "operations.observe": lambda: self._operations_observe(payload, actor),
            "operations.compare": lambda: self._operations_compare(payload),
            "exports.create": lambda: self._exports_create(payload, actor),
            "exports.get": lambda: self._exports_get(payload),
            "exports.compare": lambda: self._exports_compare(payload),
        }
        if action in handlers:
            return handlers[action]()
        if action in {"inventories.get", "inventories.intake", "exports.list"}:
            with self.connect(snapshot=True) as db:
                if action == "inventories.get":
                    return {"snapshot": self._get(db, "snapshot", payload.get("snapshot_id"))}
                if action == "inventories.intake":
                    return {"intake": self._get(db, "intake", payload.get("intake_id"))}
                return {"exports": list(reversed(self._objects(db, "export")))}
        raise GovHubError("ACTION_NOT_FOUND", "This GovHub workspace action does not exist.", 404)
