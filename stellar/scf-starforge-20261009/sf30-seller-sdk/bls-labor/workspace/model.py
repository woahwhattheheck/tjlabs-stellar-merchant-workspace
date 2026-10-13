"""Saved BLS source editions, regional analysis and complete editable receiving."""
from __future__ import annotations
import contextlib
import copy
import csv
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid

HERE = Path(__file__).resolve().parent
BLS = HERE.parent
SDK = BLS.parent
sys.path.insert(0, str(BLS))
sys.path.insert(0, str(SDK))
import capture
import project
import source_bundle_archive as archives
from regional_workspace import save_regional as save_regional_analysis, REGIONAL_FILES
from analysis import (PROJECTIONS, FILTER_COLUMNS, DERIVED_COLUMNS, encoded, filters,
                      report_input, briefing_rows, year_change, matches, compare_observation, methodology, html_document)

SCHEMA = "stellar-forge.bls-labor-workspace.v1"
HANDOVER_SCHEMA = "stellar-forge.bls-labor-workspace-handover.v1"
POLICY = archives.ArchivePolicy(HANDOVER_SCHEMA, max_expanded_bytes=8 * 1024**3,
                               max_file_bytes=4 * 1024**3, max_members=100000,
                               prefix="BLS_WORKSPACE")
ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}")
HEX = re.compile(r"[a-f0-9]{64}")
MAX_ROWS = 1000000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def stamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def identifier(value):
    require(isinstance(value, str) and ID.fullmatch(value), "Use an operation or edition ID of 1–100 letters, digits, underscores or hyphens.")
    return value


def private_path(value, *, directory=False, create=False):
    path = Path(value)
    require(path.is_absolute() and path.resolve() == path, "Use an absolute path without symbolic links.")
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)),
            "Choose an existing regular file or directory.")
    return path


def write_json(path, value):
    raw = (encoded(value) + "\n").encode("utf-8")
    atomic_bytes(path, raw)
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def atomic_bytes(path, raw):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".bls-writing-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        Path(temporary).unlink(missing_ok=True)


def read_json(path, maximum=8 * 1024**2):
    require(path.stat().st_size <= maximum, "The JSON file exceeds the selected size limit.")
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON.")))


def file_pin(path, *, maximum=None):
    value = archives.file_hash(path, POLICY, maximum=maximum)
    return {"bytes": int(value["bytes"]), "sha256": value["sha256"]}


class Workspace:
    def __init__(self, directory, *, create=False, name="Regional labor analysis"):
        self.directory = private_path(directory, directory=True, create=create)
        self.lock_fd = os.open(self.directory / ".bls-workspace.lock",
                               os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(self.lock_fd)
            raise ValueError("This original BLS workspace already has a running owner.")
        self.db = None
        self.db_lock = threading.RLock()
        self.work_lock = threading.Lock()
        self.publishers = {}
        self.worker = None
        self.native_child = None
        self.native_operation_id = None
        self.native_lock = threading.RLock()
        self.closing = False
        try:
            marker = self.directory / "workspace.json"
            if create:
                require(not marker.exists(), "Reopen the existing workspace without create.")
                require(set(p.name for p in self.directory.iterdir()) <= {".bls-workspace.lock"},
                        "Create the workspace in an empty directory.")
                require(isinstance(name, str) and 1 <= len(name.strip()) <= 250, "Enter a workspace name.")
                write_json(marker, {"schema": SCHEMA, "workspace_id": str(uuid.uuid4()),
                                    "name": name.strip(), "created_at": stamp()})
            self.marker = read_json(marker)
            require(self.marker.get("schema") == SCHEMA, "This is not the original BLS analyst workspace.")
            for part in ("sources", "reports", "publishers", "datasets", "outgoing"):
                (self.directory / part).mkdir(mode=0o700, exist_ok=True)
            database = self.directory / "analysis.sqlite"
            require(create or database.is_file(), "The original analysis database is missing.")
            self.db = sqlite3.connect(database, check_same_thread=False, isolation_level=None)
            os.chmod(database, 0o600)
            self.db.row_factory = sqlite3.Row
            self.db.executescript("""
                PRAGMA foreign_keys=ON;
                PRAGMA journal_mode=DELETE;
                PRAGMA synchronous=FULL;
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT OR IGNORE INTO settings VALUES('revision','0');
                CREATE TABLE IF NOT EXISTS editions(
                    id TEXT PRIMARY KEY, created TEXT NOT NULL, title TEXT NOT NULL,
                    capture_hash TEXT NOT NULL, source_hash TEXT NOT NULL, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS observations(
                    edition TEXT NOT NULL REFERENCES editions(id), projection TEXT NOT NULL,
                    id TEXT NOT NULL, county TEXT, measure TEXT, year INTEGER, period TEXT,
                    seasonal TEXT, industry TEXT, ownership TEXT, size TEXT, status TEXT,
                    data TEXT NOT NULL, PRIMARY KEY(edition,projection,id));
                CREATE INDEX IF NOT EXISTS observations_selection ON observations(edition,projection,county,year,period);
                CREATE TABLE IF NOT EXISTS notes(
                    id INTEGER PRIMARY KEY, subject TEXT NOT NULL, revision INTEGER NOT NULL,
                    created TEXT NOT NULL, text TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, UNIQUE(subject,revision));
                CREATE TABLE IF NOT EXISTS reports(
                    id TEXT PRIMARY KEY, created TEXT NOT NULL, title TEXT NOT NULL, edition TEXT NOT NULL,
                    kind TEXT NOT NULL, data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS operations(
                    id TEXT PRIMARY KEY, kind TEXT NOT NULL, input_hash TEXT NOT NULL, input TEXT NOT NULL,
                    expected_revision INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL,
                    state TEXT NOT NULL, result TEXT, error TEXT);
            """)
            self.db.execute("UPDATE operations SET state='interrupted',updated=? WHERE state IN ('running','pending')", (stamp(),))
            self.contract = capture.load_contract()
        except BaseException:
            self.close()
            raise

    def close(self):
        with self.db_lock:
            self.closing = True
            worker = self.worker
        self.stop_native_child()
        if worker and worker.is_alive() and worker is not threading.current_thread():
            worker.join()
        self.stop_publishers()
        if self.db is not None:
            self.db.close()
            self.db = None
        if self.lock_fd is not None:
            os.close(self.lock_fd)
            self.lock_fd = None

    def stop_native_child(self):
        with self.native_lock:
            child = self.native_child
        if child is None or child.poll() is not None:
            return
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=30)
        except subprocess.TimeoutExpired:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGKILL)
            child.wait()


    def stop_native_operation(self, operation_id):
        """Stop only this saved original native publication subprocess."""
        operation_id = identifier(operation_id)
        with self.native_lock:
            child = self.native_child
            if child is None or child.poll() is not None:
                operation = self.operation(operation_id)
                require(operation["kind"] == "native-receive", "Choose the original native receiving operation.")
                return {"operation_id": operation_id, "state": operation["state"], "signal_sent": False}
            require(self.native_operation_id == operation_id, "The live child belongs to another original operation.")
            with contextlib.suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGTERM)
            return {"operation_id": operation_id, "state": "stop-requested", "signal_sent": True}

    def revision(self):
        with self.db_lock:
            return int(self.db.execute("SELECT value FROM settings WHERE key='revision'").fetchone()[0])

    def source_pin(self):
        path = self.directory / "source.json"
        return file_pin(path)["sha256"] if path.exists() else "absent"

    def _edition(self, edition_id):
        identifier(edition_id)
        with self.db_lock:
            row = self.db.execute("SELECT * FROM editions WHERE id=?", (edition_id,)).fetchone()
        require(row is not None, "Choose a retained complete source edition.")
        return dict(row) | {"data": json.loads(row["data"])}

    def edition(self, edition_id):
        row = self._edition(edition_id)
        return {**row, "source_file": str(self.directory / "sources" / edition_id / "source.json")}

    def state(self, offset=0, limit=100):
        require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 500,
                "Use a nonnegative offset and a page limit from 1 to 500.")
        with self.db_lock:
            editions = []
            for raw in self.db.execute("SELECT * FROM editions ORDER BY created DESC,id LIMIT ? OFFSET ?", (limit, offset)):
                row = dict(raw)
                data = json.loads(row.pop("data"))
                row.update(counts=data["counts"], selection=data["manifest"]["selection"],
                           source_count=len(data["manifest"]["sources"]))
                editions.append(row)
            reports = []
            for raw in self.db.execute("SELECT * FROM reports ORDER BY created DESC,id LIMIT ? OFFSET ?", (limit, offset)):
                row = dict(raw)
                data = json.loads(row.pop("data"))
                row.update(row_count=data["row_count"], projection=data["projection"])
                reports.append(row)
            operations = [self._operation_row(row) for row in self.db.execute(
                "SELECT * FROM operations ORDER BY created DESC,id LIMIT ? OFFSET ?", (limit, offset))]
            totals = {table: self.db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                      for table in ("editions", "reports", "operations")}
            return {"schema": SCHEMA, **self.marker, "directory": str(self.directory),
                    "revision": self.revision(), "source_sha256": self.source_pin(),
                    "editions": editions, "reports": reports, "operations": operations,
                    "pages": {key: {"offset": offset, "total": count,
                                    "next_offset": offset + limit if offset + limit < count else None}
                              for key, count in totals.items()},
                    "publishers": self.publisher_state(),
                    "native_connection": {"path": str(self.directory / "bls-native.connection.json"),
                                          "configured": (self.directory / "bls-native.connection.json").is_file()}}

    def _operation_row(self, row):
        value = dict(row)
        value.pop("input", None)
        value["result"] = json.loads(value["result"]) if value["result"] else None
        if value["kind"] == "export":
            value["download_available"] = (self.directory / "outgoing" / value["id"] / "bls-workspace.zip").is_file()
        return value

    def operation(self, operation_id):
        with self.db_lock:
            row = self.db.execute("SELECT * FROM operations WHERE id=?", (identifier(operation_id),)).fetchone()
        require(row is not None, "The operation ID is not in this workspace.")
        return self._operation_row(row)

    def request(self, operation_id):
        """Recover the complete original request across listener or host restarts."""
        with self.db_lock:
            row = self.db.execute("SELECT id,kind,input,expected_revision FROM operations WHERE id=?",
                                  (identifier(operation_id),)).fetchone()
        require(row is not None, "The operation ID is not in this workspace.")
        return {"id": row["id"], "kind": row["kind"], "input": json.loads(row["input"]),
                "expected_revision": row["expected_revision"]}

    def begin(self, request, *, background=False):
        require(isinstance(request, dict) and set(request) == {"id", "kind", "input", "expected_revision"},
                "Use id, kind, input and expected_revision.")
        operation_id = identifier(request["id"])
        kind = request["kind"]
        require(kind in ("capture", "import", "select", "note", "report", "compare", "regional", "export", "publisher-open", "publisher-stop", "receive", "native-receive"),
                "Choose a supported BLS workspace operation.")
        require(isinstance(request["input"], dict), "Operation input must be an object.")
        require(type(request["expected_revision"]) is int and request["expected_revision"] >= 0,
                "Use the current workspace revision.")
        payload = encoded({"kind": kind, "input": request["input"]})
        require(len(payload.encode("utf-8")) <= 7 * 1024**2, "Operation input exceeds 7 MiB.")
        input_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        with self.db_lock:
            old = self.db.execute("SELECT * FROM operations WHERE id=?", (operation_id,)).fetchone()
            if old:
                require(old["input_hash"] == input_hash, "That operation ID already belongs to different input.")
                if old["state"] == "complete" or old["state"] in ("running", "pending"):
                    return self._operation_row(old)
            else:
                require(self.revision() == request["expected_revision"],
                        "The workspace changed; refresh it before saving this new operation.")
            require(not self.closing, "The workspace is closing.")
            require(self.work_lock.acquire(blocking=False), "An original workspace operation is still running.")
            try:
                now = stamp()
                if old:
                    self.db.execute("UPDATE operations SET state='pending',error=NULL,updated=? WHERE id=?", (now, operation_id))
                else:
                    self.db.execute("INSERT INTO operations VALUES(?,?,?,?,?,?,?,'pending',NULL,NULL)",
                                    (operation_id, kind, input_hash, encoded(request["input"]),
                                     request["expected_revision"], now, now))
            except BaseException:
                self.work_lock.release()
                raise
            if background:
                self.worker = threading.Thread(target=self._perform, args=(operation_id,), name="bls-operation", daemon=False)
                try:
                    self.worker.start()
                except BaseException:
                    self.db.execute("UPDATE operations SET state='interrupted',updated=? WHERE id=?", (stamp(), operation_id))
                    self.work_lock.release()
                    raise
                return self.operation(operation_id)
        self._perform(operation_id)
        result = self.operation(operation_id)
        if result["state"] == "failed":
            raise ValueError(result["error"])
        return result

    def _perform(self, operation_id):
        try:
            with self.db_lock:
                row = self.db.execute("SELECT * FROM operations WHERE id=?", (operation_id,)).fetchone()
                self.db.execute("UPDATE operations SET state='running',updated=? WHERE id=?", (stamp(), operation_id))
            request = json.loads(row["input"])
            action = {"capture": self.acquire, "import": self.acquire, "select": self.select,
                      "note": self.save_note, "report": self.save_report, "compare": self.save_comparison,
                      "regional": self.save_regional,
                      "export": self.export_project, "publisher-open": self.open_publisher,
                      "publisher-stop": self.stop_publisher, "receive": self.receive,
                      "native-receive": self.native_receive}[row["kind"]]
            result = action(operation_id, request, dict(row))
            with self.db_lock:
                self.db.execute("BEGIN IMMEDIATE")
                try:
                    self.db.execute("UPDATE settings SET value=CAST(value AS INTEGER)+1 WHERE key='revision'")
                    self.db.execute("UPDATE operations SET state='complete',result=?,error=NULL,updated=? WHERE id=?",
                                    (encoded(result), stamp(), operation_id))
                    self.db.execute("COMMIT")
                except BaseException:
                    self.db.execute("ROLLBACK")
                    raise
        except BaseException as error:
            with self.db_lock:
                self.db.execute("UPDATE operations SET state='failed',error=?,updated=? WHERE id=?",
                                (str(error)[:3000], stamp(), operation_id))
        finally:
            self.work_lock.release()

    def acquire(self, operation_id, value, operation):
        allowed = {"edition_id", "title", "selection", "laus_urls", "archive", "archive_sha256",
                   "activate", "expected_source_sha256"}
        require(set(value) <= allowed, "Unknown original-source intake field.")
        edition_id = identifier(value.get("edition_id", operation_id))
        selection = copy.deepcopy(value.get("selection", self.contract["selection"]))
        capture.validate_selection_value(selection, self.contract)
        title = value.get("title", edition_id)
        require(isinstance(title, str) and 1 <= len(title.strip()) <= 250, "Enter a source edition title.")
        root = self.directory / "sources" / edition_id
        root.mkdir(mode=0o700, exist_ok=True)
        destination = root / "capture"
        if operation["kind"] == "import":
            source = Path(value.get("archive", ""))
            private_path(source, directory=source.is_dir())
            digest = value.get("archive_sha256")
            if source.is_file():
                require(isinstance(digest, str) and HEX.fullmatch(digest), "Supply the original ZIP SHA-256.")
            received = capture.import_capture(source, destination, selection, self.contract, digest)
        else:
            urls = value.get("laus_urls")
            require(isinstance(urls, list) and 1 <= len(urls) <= 60 and all(isinstance(url, str) for url in urls),
                    "Select the original LAUS state-file URLs.")
            received = capture.network_capture(destination, urls, selection, self.contract)
        original_source = root / "source.json"
        capture.activate_capture(destination, original_source, "absent", self.contract)
        context = capture.load_source(original_source, self.contract)
        counts = self.index_edition(edition_id, title.strip(), context, operation["created"])
        selected = None
        if value.get("activate", True):
            selected = self.select(operation_id, {"edition_id": edition_id,
                                   "expected_source_sha256": value.get("expected_source_sha256")}, operation)
        return {"edition_id": edition_id, "capture_sha256": context["capture_sha256"],
                "source_sha256": context["source_hash"], "counts": counts,
                "source_result": received, "selected": selected}

    def index_edition(self, edition_id, title, context, created):
        with self.db_lock:
            old = self.db.execute("SELECT * FROM editions WHERE id=?", (edition_id,)).fetchone()
            if old:
                require(old["capture_hash"] == context["capture_sha256"] and old["source_hash"] == context["source_hash"],
                        "That edition ID is already bound to a different original capture.")
                return json.loads(old["data"])["counts"]
        index_db = sqlite3.connect(self.directory / "analysis.sqlite", isolation_level=None)
        try:
            index_db.execute("BEGIN IMMEDIATE")
            try:
                data = {"manifest": context["manifest"], "counts": {}}
                index_db.execute("INSERT INTO editions VALUES(?,?,?,?,?,?)",
                                (edition_id, created, title, context["capture_sha256"], context["source_hash"], encoded(data)))
                counts = {}
                total_bytes = 0
                for projection, generator in (("laus", project.laus_rows), ("qcew", project.qcew_rows)):
                    count = 0
                    for row in generator(context):
                        count += 1
                        require(count <= MAX_ROWS, "The selected original projection exceeds one million rows.")
                        raw = encoded(row)
                        total_bytes += len(raw.encode("utf-8"))
                        require(total_bytes <= 2 * 1024**3, "The complete analyst observation index exceeds 2 GiB.")
                        index_db.execute("INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (edition_id, projection, row["observation_id"],
                             row.get("county_fips", row.get("area_fips")), row.get("measure_code", row.get("metric")),
                             row["year"], row.get("period", str(row.get("quarter"))), row.get("seasonal", ""),
                             row.get("industry_code", ""), row.get("ownership_code", ""), row.get("size_code", ""),
                             row["value_status"], raw))
                    counts[projection] = count
                # Reopen the same original source after projection; retain its actual identity.
                after = capture.load_source(context["source_path"], self.contract)
                require(after["capture_sha256"] == context["capture_sha256"] and after["source_hash"] == context["source_hash"],
                        "The original source changed during observation indexing.")
                data["counts"] = counts
                index_db.execute("UPDATE editions SET data=? WHERE id=?", (encoded(data), edition_id))
                index_db.execute("COMMIT")
                return counts
            except BaseException:
                index_db.execute("ROLLBACK")
                raise
    
        finally:
            index_db.close()

    def select(self, operation_id, value, operation):
        require(set(value) == {"edition_id", "expected_source_sha256"}, "Select an edition and the current source SHA-256.")
        edition = self._edition(value["edition_id"])
        self.stop_publishers()
        result = capture.activate_capture(self.directory / "sources" / edition["id"] / "capture",
                                          self.directory / "source.json", value["expected_source_sha256"], self.contract)
        return {"edition_id": edition["id"], **result}

    def _query(self, edition_id, projection, selected):
        self._edition(edition_id)
        selected = filters(selected, projection)
        columns = {"county_fips": "county", "area_fips": "county", "measure_code": "measure", "metric": "measure",
                   "year": "year", "period": "period", "quarter": "period", "seasonal": "seasonal",
                   "industry_code": "industry", "ownership_code": "ownership", "size_code": "size", "value_status": "status"}
        clauses = ["edition=?", "projection=?"]
        values = [edition_id, projection]
        for name, picked in selected.items():
            clauses.append(columns[name] + " IN (" + ",".join("?" for _ in picked) + ")")
            values.extend(str(v) for v in picked) if name == "quarter" else values.extend(picked)
        return " AND ".join(clauses), values

    def row_iterator(self, edition_id, projection, selected=None):
        where, values = self._query(edition_id, projection, selected or {})
        reader = sqlite3.connect(self.directory / "analysis.sqlite")
        try:
            cursor = reader.execute("SELECT data FROM observations WHERE " + where + " ORDER BY county,year,period,measure,id", values)
            for row in cursor:
                yield json.loads(row[0])
        finally:
            reader.close()

    def observations(self, edition_id, projection, selected=None, offset=0, limit=100):
        require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 1000, "Use an observation page of 1–1000 rows.")
        where, values = self._query(edition_id, projection, selected or {})
        with self.db_lock:
            count = self.db.execute("SELECT COUNT(*) FROM observations WHERE " + where, values).fetchone()[0]
            rows = [json.loads(row[0]) for row in self.db.execute("SELECT data FROM observations WHERE " + where +
                " ORDER BY county,year,period,measure,id LIMIT ? OFFSET ?", values + [limit, offset])]
        return {"edition_id": edition_id, "projection": projection, "rows": rows, "total": count,
                "offset": offset, "next_offset": offset + limit if offset + limit < count else None}

    def note(self, subject):
        require(isinstance(subject, str) and 1 <= len(subject) <= 500, "Select a source edition or observation.")
        with self.db_lock:
            rows = [dict(row) for row in self.db.execute("SELECT * FROM notes WHERE subject=? ORDER BY revision DESC", (subject,))]
        return {"subject": subject, "revision": rows[0]["revision"] if rows else 0,
                "text": rows[0]["text"] if rows else "", "history": rows}

    def save_note(self, operation_id, value, operation):
        require(set(value) == {"subject", "text", "expected_note_revision"}, "Use subject, text and expected_note_revision.")
        with self.db_lock:
            retained = self.db.execute("SELECT subject,revision FROM notes WHERE operation=?", (operation_id,)).fetchone()
        if retained:
            return dict(retained)
        current = self.note(value["subject"])
        require(type(value["expected_note_revision"]) is int and value["expected_note_revision"] == current["revision"],
                "The original note changed; read its latest revision.")
        require(isinstance(value["text"], str) and len(value["text"]) <= 100000, "A note can contain up to 100,000 characters.")
        revision = current["revision"] + 1
        with self.db_lock:
            self.db.execute("INSERT INTO notes(subject,revision,created,text,operation) VALUES(?,?,?,?,?)",
                            (value["subject"], revision, operation["created"], value["text"], operation_id))
        return {"subject": value["subject"], "revision": revision}

    def report(self, report_id):
        with self.db_lock:
            row = self.db.execute("SELECT data FROM reports WHERE id=?", (identifier(report_id),)).fetchone()
        require(row is not None, "Choose a complete saved briefing or comparison.")
        return json.loads(row[0])

    def _report_files(self, report_id):
        root = self.directory / "reports" / identifier(report_id)
        root.mkdir(mode=0o700, exist_ok=True)
        return root

    def save_regional(self, operation_id, value, operation):
        return save_regional_analysis(self, operation_id, value, operation)

    def save_report(self, operation_id, value, operation):
        request = report_input(value)
        edition = self._edition(request["edition_id"])
        source = capture.load_source(self.directory / "sources" / edition["id"] / "source.json", self.contract)
        require(source["capture_sha256"] == edition["capture_hash"], "The selected original capture changed.")
        root = self._report_files(operation_id)
        metadata = {"schema": "stellar-forge.bls-labor-report.v1", "id": operation_id, "kind": "briefing",
                    "created_at": operation["created"], "title": request["title"], "narrative": request["narrative"],
                    "edition_id": edition["id"], "projection": request["projection"],
                    "request": request, "source": {"capture_sha256": edition["capture_hash"],
                        "source_sha256": edition["source_hash"], "manifest": edition["data"]["manifest"]},
                    "methodology": methodology(request["projection"], request["calculation"]), "row_count": 0}
        columns = list(self.contract["projections"][request["projection"]]["columns"])
        if request["calculation"] == "year-change":
            columns += list(DERIVED_COLUMNS)
        def selected_rows():
            for row in self.row_iterator(edition["id"], request["projection"], request["filters"]):
                if request["calculation"] == "original":
                    yield row
                    continue
                with self.db_lock:
                    candidates = [json.loads(item[0]) for item in self.db.execute(
                        "SELECT data FROM observations WHERE edition=? AND projection='laus' AND county=? AND measure=? AND year=? AND period=? AND seasonal=?",
                        (edition["id"], row["county_fips"], row["measure_code"], row["year"] - 1, row["period"], row["seasonal"]))]
                previous = [item for item in candidates if item["series_id"] == row["series_id"]]
                require(len(previous) <= 1, "The original prior LAUS period is ambiguous.")
                originals = {(item["series_id"], item["year"], item["period"]): item for item in previous}
                yield year_change(row, originals)
        path = root / "rows.jsonl"
        with path.open("w", encoding="utf-8", newline="\n") as output, (root / "report.csv").open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=columns, lineterminator="\r\n")
            writer.writeheader()
            for row in selected_rows():
                output.write(encoded(row) + "\n")
                writer.writerow(row)
                metadata["row_count"] += 1
            output.flush()
            os.fsync(output.fileno())
            csv_file.flush()
            os.fsync(csv_file.fileno())
        for file in (path, root / "report.csv"):
            os.chmod(file, 0o600)
        metadata["files"] = {"rows.jsonl": file_pin(path), "report.csv": file_pin(root / "report.csv")}
        def retained_rows():
            with path.open("r", encoding="utf-8") as stream:
                for line in stream:
                    yield json.loads(line)
        with (root / "report.json").open("w", encoding="utf-8") as stream:
            stream.write('{"metadata":' + encoded(metadata) + ',"rows":[')
            for index, row in enumerate(retained_rows()):
                stream.write(("," if index else "") + encoded(row))
            stream.write("]}\n")
            stream.flush()
            os.fsync(stream.fileno())
        with (root / "report.html").open("w", encoding="utf-8") as stream:
            for text in html_document(metadata, retained_rows()):
                stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        for name in ("report.json", "report.html"):
            os.chmod(root / name, 0o600)
            metadata["files"][name] = file_pin(root / name)
        write_json(root / "metadata.json", metadata)
        with self.db_lock:
            self.db.execute("INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?)",
                            (operation_id, operation["created"], request["title"], edition["id"], "briefing", encoded(metadata)))
        return metadata

    def save_comparison(self, operation_id, value, operation):
        require(set(value) <= {"before", "after", "projection", "title"} and {"before", "after", "projection"} <= set(value),
                "Choose before and after source editions and one original projection.")
        before, after = self._edition(value["before"]), self._edition(value["after"])
        require(before["id"] != after["id"], "Choose two different complete source editions.")
        projection = value["projection"]
        require(projection in PROJECTIONS, "Choose LAUS or QCEW.")
        for edition in (before, after):
            original = capture.load_source(self.directory / "sources" / edition["id"] / "source.json", self.contract)
            require(original["capture_sha256"] == edition["capture_hash"], "An original comparison source changed.")
        title = value.get("title", "Original source edition comparison")
        require(isinstance(title, str) and 1 <= len(title.strip()) <= 250, "Enter a comparison title.")
        root = self._report_files(operation_id)
        metadata = {"schema": "stellar-forge.bls-labor-comparison.v1", "id": operation_id, "kind": "comparison",
                    "created_at": operation["created"], "title": title.strip(), "edition_id": after["id"],
                    "projection": projection, "before": before["id"], "after": after["id"],
                    "source": {"before": before["data"]["manifest"], "after": after["data"]["manifest"]},
                    "row_count": 0, "counts": {"added": 0, "removed": 0, "changed": 0, "unchanged": 0}}
        sql = """SELECT a.id,a.data,b.data FROM observations a LEFT JOIN observations b
                 ON b.edition=? AND b.projection=a.projection AND b.id=a.id WHERE a.edition=? AND a.projection=?
                 UNION ALL SELECT b.id,NULL,b.data FROM observations b LEFT JOIN observations a
                 ON a.edition=? AND a.projection=b.projection AND a.id=b.id
                 WHERE b.edition=? AND b.projection=? AND a.id IS NULL ORDER BY 1"""
        with self.db_lock, (root / "rows.jsonl").open("w", encoding="utf-8") as output, (root / "report.csv").open("w", encoding="utf-8", newline="") as csv_file:
            writer = csv.writer(csv_file, lineterminator="\r\n")
            writer.writerow(["observation_id", "change", "changed_fields", "before", "after"])
            for row in self.db.execute(sql, (after["id"], before["id"], projection, before["id"], after["id"], projection)):
                previous = json.loads(row[1]) if row[1] is not None else None
                current = json.loads(row[2]) if row[2] is not None else None
                change, changed = compare_observation(previous, current)
                metadata["counts"][change] += 1
                item = {"observation_id": row[0], "change": change, "changed_fields": changed,
                        "before": previous, "after": current}
                output.write(encoded(item) + "\n")
                writer.writerow([row[0], change, encoded(changed), encoded(previous), encoded(current)])
                metadata["row_count"] += 1
            output.flush()
            os.fsync(output.fileno())
            csv_file.flush()
            os.fsync(csv_file.fileno())
        import html
        with (root / "report.json").open("w", encoding="utf-8") as out, (root / "report.html").open("w", encoding="utf-8") as view:
            out.write('{"metadata":' + encoded(metadata) + ',"rows":[')
            view.write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
                       html.escape(title) + '</title><style>body{font:15px/1.5 system-ui;max-width:1100px;margin:30px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{border:1px solid #aaa;margin:10px 0;padding:10px}</style><h1>' +
                       html.escape(title) + '</h1><p>Complete original observation comparison, including unchanged observations.</p><pre>' +
                       html.escape(encoded(metadata["counts"])) + '</pre>')
            with (root / "rows.jsonl").open("r", encoding="utf-8") as rows:
                for index, line in enumerate(rows):
                    item = json.loads(line)
                    out.write(("," if index else "") + encoded(item))
                    view.write("<details><summary>" + html.escape(item["change"] + " · " + item["observation_id"]) +
                               "</summary><pre>" + html.escape(json.dumps(item, ensure_ascii=False, indent=2)) + "</pre></details>")
            out.write("]}\n")
            view.write("</html>")
            for stream in (out, view):
                stream.flush()
                os.fsync(stream.fileno())
        metadata["files"] = {}
        for name in ("rows.jsonl", "report.csv", "report.json", "report.html"):
            os.chmod(root / name, 0o600)
            metadata["files"][name] = file_pin(root / name)
        write_json(root / "metadata.json", metadata)
        with self.db_lock:
            self.db.execute("INSERT OR REPLACE INTO reports VALUES(?,?,?,?,?,?)",
                            (operation_id, operation["created"], title.strip(), after["id"], "comparison", encoded(metadata)))
        return metadata

    def report_rows(self, report_id, offset=0, limit=100):
        metadata = self.report(report_id)
        require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 1000, "Use a report page of 1–1000 rows.")
        rows = []
        with (self.directory / "reports" / report_id / "rows.jsonl").open("r", encoding="utf-8") as source:
            for index, line in enumerate(source):
                if index >= offset + limit:
                    break
                if index >= offset:
                    rows.append(json.loads(line))
        return {"metadata": metadata, "rows": rows, "offset": offset, "total": metadata["row_count"],
                "next_offset": offset + limit if offset + limit < metadata["row_count"] else None}

    def publisher_state(self):
        return {key: {"url": item["url"], "running": item["process"].poll() is None}
                for key, item in self.publishers.items()}

    def open_publisher(self, operation_id, value, operation):
        require(set(value) <= {"projection", "node"}, "Choose the original publication projection.")
        projection = value.get("projection")
        require(projection in ("laus", "qcew", "source_files"), "Choose LAUS, QCEW or complete original source files.")
        require(self.source_pin() != "absent", "Select the complete original source edition first.")
        existing = self.publishers.get(projection)
        if existing and existing["process"].poll() is None:
            return {"projection": projection, "url": existing["url"]}
        node = value.get("node") or shutil.which("node")
        require(isinstance(node, str) and Path(node).is_absolute(), "Choose the existing Node executable.")
        node = str(Path(node).resolve())
        private_path(node)
        directory = self.directory / "publishers" / projection
        command = [node, str(HERE / "publisher.mjs"), "--workspace", str(directory),
                   "--source", str(self.directory / "source.json"), "--target", str(self.directory / "datasets" / projection),
                   "--projection", projection, "--port", "0"]
        error_path = self.directory / "outgoing" / (operation_id + "-publisher.log")
        error_stream = error_path.open("ab")
        os.chmod(error_path, 0o600)
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=error_stream,
                                 start_new_session=True, text=True, encoding="utf-8", bufsize=1)
        try:
            import selectors
            selector = selectors.DefaultSelector()
            selector.register(child.stdout, selectors.EVENT_READ)
            require(selector.select(timeout=30), "The original publisher did not announce its listener in 30 seconds.")
            line = child.stdout.readline(65537)
            require(len(line.encode("utf-8")) <= 65536 and line.endswith("\n"), "The original publisher returned an incomplete startup.")
            result = json.loads(line)
            require(result.get("schema") == "stellar-forge.bls-native-publisher-launch.v1" and
                    result.get("workspace") == str(directory) and result.get("projection") == projection,
                    "The publisher announcement differs from its selected original workspace.")
            from urllib.parse import urlsplit
            origin = urlsplit(result["url"])
            require(origin.scheme == "http" and origin.hostname == "127.0.0.1" and origin.port and
                    not origin.username and not origin.password, "The original publisher listener is not local.")
            self.publishers[projection] = {"process": child, "url": result["url"], "log": error_stream}
            return result
        except BaseException:
            child.terminate()
            with contextlib.suppress(subprocess.TimeoutExpired):
                child.wait(timeout=5)
            if child.poll() is None:
                child.kill()
                child.wait()
            error_stream.close()
            raise
        finally:
            if "selector" in locals():
                selector.close()

    def stop_publisher(self, operation_id, value, operation):
        require(set(value) <= {"projection"}, "Choose a publisher projection or stop all.")
        projection = value.get("projection")
        if projection is None:
            self.stop_publishers()
        else:
            require(projection in ("laus", "qcew", "source_files"), "Choose an original publisher projection.")
            self._stop(projection)
        return {"stopped": projection or "all"}

    def _stop(self, projection):
        item = self.publishers.pop(projection, None)
        if not item:
            return
        child = item["process"]
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=30)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        item["log"].close()
        child.stdout.close()

    def stop_publishers(self):
        for projection in list(self.publishers):
            self._stop(projection)

    def native_state(self, operation_id):
        operation = self.operation(operation_id)
        require(operation["kind"] == "native-receive", "Select an original native publication operation.")
        path = self.directory / "native-publications" / identifier(operation_id) / "state.json"
        if not path.exists():
            return {"operation_id": operation_id, "state": operation["state"], "phase": "starting", "projections": {}}
        value = read_json(path, 8 * 1024**2)
        require(value.get("schema") == "stellar-forge.bls-native-receiving-state.v1" and
                value.get("operation_id") == operation_id, "The saved original native state differs.")
        return value

    def native_receive(self, operation_id, value, operation):
        allowed = {"source_sha256", "projections", "reviewer", "note", "existing", "receive", "releases"}
        require(set(value) <= allowed and {"source_sha256", "projections", "reviewer", "note"} <= set(value),
                "Select original projections, source SHA-256, reviewer and publication note.")
        require(value["source_sha256"] == self.source_pin(), "The active original source changed; select its current edition.")
        projections = value["projections"]
        require(isinstance(projections, list) and bool(projections) and len(set(projections)) == len(projections) and
                all(item in ("laus", "qcew", "source_files") for item in projections),
                "Choose distinct original publication projections.")
        for projection in projections:
            self._stop(projection)
        node = shutil.which("node")
        require(node is not None, "The selected original environment needs its existing Node executable.")
        node = str(Path(node).resolve())
        private_path(node)
        root = self.directory / "outgoing" / operation_id
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        request_file = root / "native-request.json"
        request = {"id": operation_id, "input": value}
        if request_file.exists():
            require(read_json(request_file) == request, "The original native request changed.")
        else:
            write_json(request_file, request)
        command = [node, str(HERE / "native-receiving.mjs"), "--workspace", str(self.directory),
                   "--request", str(request_file)]
        connection = self.directory / "bls-native.connection.json"
        if connection.exists():
            private_path(connection)
            command.extend(["--connection", str(connection)])
        output_path, error_path = root / "native-output.json", root / "native-stderr.log"
        with output_path.open("wb") as output, error_path.open("ab") as errors:
            os.chmod(output_path, 0o600)
            os.chmod(error_path, 0o600)
            with self.native_lock:
                require(not self.closing, "The original workspace is closing.")
                child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=errors,
                                         start_new_session=True)
                self.native_child = child
                self.native_operation_id = operation_id
            try:
                code = child.wait()
            except BaseException:
                self.stop_native_child()
                raise
            finally:
                with self.native_lock:
                    if self.native_child is child:
                        self.native_child = None
                        self.native_operation_id = None
            for stream in (output, errors):
                stream.flush()
                os.fsync(stream.fileno())
        require(code == 0, "The original native publication stopped with status " + str(code) +
                "; its saved operation remains in native-publications/" + operation_id +
                ". Read " + str(error_path) + " and resume this same request.")
        result = read_json(output_path, 8 * 1024**2)
        current_source = read_json(self.directory / "source.json")
        require(isinstance(result, dict) and result.get("schema") == "stellar-forge.bls-native-receiving.v1" and
                result.get("operation_id") == operation_id and result.get("complete") is True and
                result.get("source_sha256") == value["source_sha256"] == self.source_pin() and
                result.get("capture_id") == current_source["captureSha256"],
                "The original native result differs from its source, capture or operation.")
        require(isinstance(result.get("projections"), list) and
                len(result["projections"]) == len(projections) and
                {item.get("projection") for item in result["projections"]} == set(projections) and
                all(item.get("complete") is True and item.get("native_state") == "PUBLISHED"
                    for item in result["projections"]), "The original native publication result is incomplete.")
        return result

    def export_project(self, operation_id, value, operation):
        require(set(value) <= {"label"}, "The complete project export accepts an optional label.")
        self.stop_publishers()
        root = self.directory / "outgoing" / operation_id
        stage = root / "project"
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        stage.mkdir(mode=0o700, exist_ok=True)
        retained_manifest = root / "manifest.json"
        if retained_manifest.exists():
            manifest = read_json(retained_manifest, 32 * 1024**2)
            require(manifest["workspace_id"] == self.marker["workspace_id"] and manifest["source_operation"] == operation_id,
                    "The saved export belongs to another original operation.")
            inventory = manifest["files"]
        else:
            inventory = []
            selected = []
            for path in sorted(self.directory.rglob("*")):
                relative = path.relative_to(self.directory)
                if relative.parts[0] == "outgoing" or path.name in {".bls-workspace.lock", "bls.connection.json",
                                                                  "received-handover.json", "analysis.sqlite", "bls-native.connection.json"}:
                    continue
                if any(part.startswith(".source-archive-") or part.startswith(".bls-writing-") for part in relative.parts):
                    continue
                if relative.parts[0] == "agent-requests" and path.name.endswith(".partial"):
                    continue
                info = path.lstat()
                if stat.S_ISDIR(info.st_mode):
                    continue
                require(stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode),
                        "Stop the original local service before exporting its complete project.")
                if path.name.endswith(".lock") or path.name in {".lock", "workspace.lock"}:
                    continue
                selected.append((path, relative, file_pin(path)))
            for path, relative, pin in selected:
                target = stage / relative
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with path.open("rb") as source, target.open("wb") as out:
                    shutil.copyfileobj(source, out, 1024 * 1024)
                    out.flush()
                    os.fsync(out.fileno())
                os.chmod(target, 0o600)
                require(file_pin(target) == pin, "An original project file changed during export.")
                inventory.append({"path": relative.as_posix(), "bytes": str(pin["bytes"]), "sha256": pin["sha256"]})
            with self.db_lock:
                (stage / "analysis.sqlite").unlink(missing_ok=True)
                saved = sqlite3.connect(stage / "analysis.sqlite")
                try:
                    self.db.backup(saved)
                    # This archive represents the completed product before its own packaging operation.
                    saved.execute("DELETE FROM operations WHERE id=?", (operation_id,))
                    saved.commit()
                finally:
                    saved.close()
            os.chmod(stage / "analysis.sqlite", 0o600)
            pin = file_pin(stage / "analysis.sqlite")
            inventory.append({"path": "analysis.sqlite", "bytes": str(pin["bytes"]), "sha256": pin["sha256"]})
            for path, _, expected in selected:
                require(file_pin(path) == expected, "The original project changed while the complete export was prepared.")
            inventory.sort(key=lambda item: item["path"])
            manifest = {"schema": HANDOVER_SCHEMA, "workspace_id": self.marker["workspace_id"],
                        "name": self.marker["name"], "created_at": operation["created"],
                        "source_operation": operation_id, "revision": self.revision(), "files": inventory}
            write_json(retained_manifest, manifest)
        result = archives.archive({"source": str(stage), "destination": str(root / "bls-workspace.zip"),
                                   "manifest": manifest, "inventory": inventory}, policy=POLICY)
        write_json(root / "result.json", {"workspace_id": self.marker["workspace_id"], **result})
        return {"workspace_id": self.marker["workspace_id"], "file": str(root / "bls-workspace.zip"),
                "relative_path": (root / "bls-workspace.zip").relative_to(self.directory).as_posix(), **result}

    def receive(self, operation_id, value, operation):
        require(set(value) == {"archive", "destination", "sha256"}, "Choose the complete ZIP, SHA-256 and receiving directory.")
        destination = Path(value["destination"])
        require(destination != self.directory and not destination.is_relative_to(self.directory),
                "Receive the complete project into a separate customer directory.")
        return receive_project(value["archive"], destination, value["sha256"])

    def file(self, kind, item_id, name):
        identifier(item_id)
        if kind == "report":
            metadata = self.report(item_id)
            allowed = REGIONAL_FILES if metadata.get("kind") == "regional" else ("rows.jsonl", "report.csv", "report.json", "report.html")
            require(name in allowed and name in metadata["files"],
                    "Choose an original saved report file.")
            path = self.directory / "reports" / item_id / name
            require(file_pin(path) == metadata["files"][name], "The complete report file changed.")
            return path
        if kind == "source":
            edition = self._edition(item_id)
            inventory = {item["path"]: item for item in edition["data"]["manifest"]["files"]}
            require(name in inventory or name == self.contract["manifest_path"], "Choose a retained original source member.")
            context = capture.load_source(self.directory / "sources" / item_id / "source.json", self.contract)
            return capture.member(context["directory"], name)
        if kind == "export":
            operation = self.operation(item_id)
            require(operation["state"] == "complete" and operation["kind"] == "export", "Choose a completed original project export.")
            expected_path = "outgoing/" + item_id + "/bls-workspace.zip"
            require(operation["result"]["relative_path"] == expected_path, "The original export path differs.")
            path = self.directory / expected_path
            expected = operation["result"]["archive"]
            require(file_pin(path, maximum=POLICY.max_archive_bytes) == {"bytes": int(expected["bytes"]), "sha256": expected["sha256"]},
                    "The complete workspace archive changed.")
            return path
        raise ValueError("Choose a report, source or complete project file.")


def receive_project(archive, destination, expected_sha256):
    archive = private_path(archive)
    require(isinstance(expected_sha256, str) and HEX.fullmatch(expected_sha256), "Supply the complete workspace ZIP SHA-256.")
    actual = file_pin(archive, maximum=POLICY.max_archive_bytes)
    require(actual["sha256"] == expected_sha256, "The selected complete workspace ZIP differs from its supplied SHA-256.")
    destination = Path(destination)
    require(destination.is_absolute() and destination.resolve() == destination, "Choose an absolute receiving directory.")
    inspected = archives.inspect({"archive": str(archive)}, policy=POLICY)
    manifest = inspected["manifest"]
    require("workspace.json" in {item["path"] for item in manifest["files"]} and
            "analysis.sqlite" in {item["path"] for item in manifest["files"]}, "The complete original working project is missing.")
    result = archives.extract({"archive": str(archive), "destination": str(destination)}, policy=POLICY)
    with contextlib.closing(Workspace(destination)) as workspace:
        require(workspace.marker["workspace_id"] == manifest["workspace_id"], "The received workspace identity differs.")
        # Every source edition is reopened through the original BLS verifier.
        with workspace.db_lock:
            editions = list(workspace.db.execute("SELECT id,capture_hash FROM editions"))
        for edition in editions:
            source = capture.load_source(destination / "sources" / edition["id"] / "source.json", workspace.contract)
            require(source["capture_sha256"] == edition["capture_hash"], "A received original source edition changed.")
        state = workspace.state()
    return {"workspace": str(destination), "workspace_id": manifest["workspace_id"],
            "archive": result["archive"], "state": state}
