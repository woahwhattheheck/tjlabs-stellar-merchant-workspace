"""Retained scenario operations in the original customer analytical database.

An operation freezes one original SQLite backup, executes each saved analysis
through the original read-only SQL stream, and commits only complete cases.
Interrupted operations retain that frozen input and resume their uncompleted
cases. Completed operations retain every result row and release the extra input
copy; original imported versions remain in the analytical database.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
import fcntl
import stat
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import time

from .analysis_workspace import AnalysisWorkspace, _parameters
from .errors import StateError
from .query_stream import open_query
from .sqlite_dataset import DatasetDatabase
from .storage import private_directory
from .scenario_types import (SCHEMA, HASH, cell, checksum, compare_rows, definition,
                             effective_parameters, encode, fail, file_digest,
                             identifier, name, now, numeric, revision, row_key, text)


class ScenarioWorkspace:
    def __init__(self, directory_or_analysis, *, create: bool = False):
        self._owns_analysis = not isinstance(directory_or_analysis, AnalysisWorkspace)
        if self._owns_analysis and not create:
            DatasetDatabase(directory_or_analysis, create=False)
        self.analysis = (AnalysisWorkspace(directory_or_analysis)
                         if self._owns_analysis else directory_or_analysis)
        self._closed = False
        self._executor = None
        self._events = {}
        self._lease = None
        try:
            lock_path = self.analysis.database.directory / "scenario.lock"
            self._lease = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            info = os.fstat(self._lease)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
                fail("The scenario owner file must be private and regular.")
            try:
                fcntl.flock(self._lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                fail("This analytical workspace already has a scenario owner.")
            self.database = self.analysis.database
            self.guard = threading.RLock()
            self.work = private_directory(self.database.directory / "scenario-work")
            self.exports = private_directory(self.database.directory / "scenario-exports")
            self._events: dict[str, threading.Event] = {}
            self._futures = {}
            self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="customer-scenario")
            with self.database._connection() as db:
                db.execute("BEGIN IMMEDIATE")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_format(id INTEGER PRIMARY KEY CHECK(id=1),schema TEXT NOT NULL)")
                old = db.execute("SELECT schema FROM sf_scenario_format WHERE id=1").fetchone()
                if old is not None and old[0] != SCHEMA:
                    fail("This scenario database uses an unsupported format.")
                db.execute("INSERT OR IGNORE INTO sf_scenario_format VALUES(1,?)", (SCHEMA,))
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_definitions(sequence INTEGER PRIMARY KEY,name TEXT NOT NULL,revision INTEGER NOT NULL,request_id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,UNIQUE(name,revision))")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_runs(sequence INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,status TEXT NOT NULL,request TEXT NOT NULL,request_sha256 TEXT NOT NULL,created_at TEXT NOT NULL,finished_at TEXT,record TEXT,sha256 TEXT,error TEXT)")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_cases(run_id TEXT NOT NULL REFERENCES sf_scenario_runs(id),task INTEGER NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(run_id,task))")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_rows(run_id TEXT NOT NULL,task INTEGER NOT NULL,row_number INTEGER NOT NULL,key TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(run_id,task,row_number),UNIQUE(run_id,task,key),FOREIGN KEY(run_id,task) REFERENCES sf_scenario_cases(run_id,task))")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_comparisons(run_id TEXT NOT NULL REFERENCES sf_scenario_runs(id),pair INTEGER NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(run_id,pair))")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_comparison_rows(run_id TEXT NOT NULL,pair INTEGER NOT NULL,row_number INTEGER NOT NULL,status TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(run_id,pair,row_number),FOREIGN KEY(run_id,pair) REFERENCES sf_scenario_comparisons(run_id,pair))")
                db.execute("CREATE INDEX IF NOT EXISTS sf_scenario_comparison_filter ON sf_scenario_comparison_rows(run_id,pair,status,row_number)")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_reviews(run_id TEXT NOT NULL REFERENCES sf_scenario_runs(id),revision INTEGER NOT NULL,id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(run_id,revision))")
                db.execute("CREATE TABLE IF NOT EXISTS sf_scenario_exports(id TEXT PRIMARY KEY,request_sha256 TEXT NOT NULL,record TEXT NOT NULL,sha256 TEXT NOT NULL)")
                db.execute("UPDATE sf_scenario_runs SET status='INTERRUPTED',error='The previous process ended. Resume this retained input to continue.' WHERE status IN ('QUEUED','PREPARING','RUNNING','CANCEL_REQUESTED')")
                db.commit()
        except BaseException:
            self.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        self.close()

    def close(self):
        if self._closed:
            return
        self._closed = True
        for event in list(self._events.values()):
            event.set()
        if self._executor is not None:
            self._executor.shutdown(wait=True)
        if self._lease is not None:
            os.close(self._lease)
            self._lease = None
        if self._owns_analysis:
            self.analysis.close()

    @staticmethod
    def _record(row):
        if row is None:
            fail("The requested retained record was not found.")
        raw = row["record"]
        if raw is None or hashlib.sha256(raw.encode()).hexdigest() != row["sha256"]:
            fail("A retained record has changed.")
        return json.loads(raw)

    @staticmethod
    def _page(after, limit):
        if type(after) is not int or after < 0 or type(limit) is not int or not 1 <= limit <= 100:
            fail("Use a nonnegative page position and a page size from one to 100.")

    def definitions(self, *, after=0, limit=50):
        self._page(after, limit)
        with self.database._connection(readonly=True) as db:
            rows = db.execute("SELECT d.* FROM sf_scenario_definitions d JOIN (SELECT name,MAX(revision) revision FROM sf_scenario_definitions GROUP BY name) h USING(name,revision) WHERE d.sequence>? ORDER BY d.sequence LIMIT ?", (after, limit + 1)).fetchall()
            entries = [{"sequence": r["sequence"], "definition": self._record(r), "sha256": r["sha256"]} for r in rows[:limit]]
        return {"items": entries, "next_after": rows[limit-1]["sequence"] if len(rows) > limit else None}

    def save(self, value):
        if not isinstance(value, dict):
            fail("A definition request is required.")
        request_id, key = identifier(value.get("id")), name(value.get("name"))
        expected = revision(value.get("expected_revision"), zero=True)
        proposed = definition(value)
        request_sha = checksum({"id": request_id, "name": key, "expected_revision": expected, **proposed})
        with self.guard, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM sf_scenario_definitions WHERE request_id=?", (request_id,)).fetchone()
            if old:
                if old["request_sha256"] != request_sha:
                    fail("This save identifier already belongs to a different definition.")
                return {"definition": self._record(old), "sha256": old["sha256"]}
            head = db.execute("SELECT MAX(revision) FROM sf_scenario_definitions WHERE name=?", (key,)).fetchone()[0] or 0
            if head != expected:
                fail("The definition changed. Load its current revision before saving.")
            for measure in proposed["measures"]:
                original = db.execute("SELECT record FROM sf_analysis_query_history WHERE name=? AND revision=?", (measure["query_name"], measure["query_revision"])).fetchone()
                if original is None:
                    fail("A selected saved SQL revision was not found.")
                measure["query"] = json.loads(original[0])
                measure["query_sha256"] = hashlib.sha256(original[0].encode()).hexdigest()
                for case in proposed["cases"]:
                    _parameters(effective_parameters(measure, case))
            record = {"schema": SCHEMA + "/definition", "name": key, "revision": expected + 1,
                      "saved_at": now(), **proposed}
            raw = encode(record)
            sha = hashlib.sha256(raw.encode()).hexdigest()
            db.execute("INSERT INTO sf_scenario_definitions(name,revision,request_id,request_sha256,record,sha256) VALUES(?,?,?,?,?,?)", (key, expected + 1, request_id, request_sha, raw, sha))
            db.commit()
        return {"definition": record, "sha256": sha}

    def get_definition(self, key, version=None):
        key = name(key)
        if version is not None:
            revision(version)
        with self.database._connection(readonly=True) as db:
            row = (db.execute("SELECT * FROM sf_scenario_definitions WHERE name=? ORDER BY revision DESC LIMIT 1", (key,)).fetchone() if version is None else
                   db.execute("SELECT * FROM sf_scenario_definitions WHERE name=? AND revision=?", (key, version)).fetchone())
            result = {"definition": self._record(row), "sha256": row["sha256"]}
            result["head_revision"] = db.execute("SELECT MAX(revision) FROM sf_scenario_definitions WHERE name=?", (key,)).fetchone()[0]
            return result

    def plan(self, key, version=None):
        selected = self.get_definition(key, version)
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            views = self.database._views(db)
            sources = [self.database._version(db, v["version_id"]) for v in views]
        return {**selected, "expected_views": views, "sources": sources,
                "task_count": len(selected["definition"]["cases"]) * len(selected["definition"]["measures"])}

    @staticmethod
    def _options(value):
        value = {} if value is None else value
        if not isinstance(value, dict) or set(value) - {"query_timeout_seconds", "result_limit_bytes"}:
            fail("Scenario execution options are invalid.")
        timeout, limit = value.get("query_timeout_seconds", 300), value.get("result_limit_bytes", 1024**3)
        if type(timeout) not in (float, int) or not 1 <= timeout <= 86400 or type(limit) is not int or not 1024 <= limit <= 1024**4:
            fail("Choose a query timeout from one second to one day and a result limit from 1 KiB to 1 TiB.")
        return {"query_timeout_seconds": timeout, "result_limit_bytes": limit}

    def start(self, value):
        if not isinstance(value, dict):
            fail("A reviewed execution request is required.")
        run_id = identifier(value.get("id"))
        selected = self.get_definition(value.get("name"), revision(value.get("revision")))
        if selected["sha256"] != value.get("definition_sha256"):
            fail("The reviewed definition digest does not match.")
        views = value.get("expected_views")
        if not isinstance(views, list) or len(encode(views).encode()) > 262144:
            fail("Review the current data selection before running.")
        request = {"id": run_id, "name": selected["definition"]["name"], "revision": selected["definition"]["revision"],
                   "definition_sha256": selected["sha256"], "expected_views": views, "options": self._options(value.get("options"))}
        request_sha = checksum(request)
        with self.guard, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM sf_scenario_runs WHERE id=?", (run_id,)).fetchone()
            if old:
                if old["request_sha256"] != request_sha:
                    fail("This run identifier belongs to a different reviewed request.")
                return self._run_record(db, old)
            db.execute("INSERT INTO sf_scenario_runs(id,status,request,request_sha256,created_at) VALUES(?,'QUEUED',?,?,?)", (run_id, encode(request), request_sha, now()))
            db.commit()
            self._submit(run_id)
        return self.run(run_id)

    def _submit(self, run_id):
        if self._closed:
            fail("This scenario workspace is closed.")
        if run_id in self._futures and not self._futures[run_id].done():
            return
        event = self._events[run_id] = threading.Event()
        self._futures[run_id] = self._executor.submit(self._execute, run_id, event)

    def resume(self, run_id):
        run_id = identifier(run_id)
        with self.guard, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM sf_scenario_runs WHERE id=?", (run_id,)).fetchone()
            if row is None:
                fail("The retained run was not found.")
            if row["status"] == "COMPLETE":
                return self._run_record(db, row)
            if row["status"] in ("QUEUED", "PREPARING", "RUNNING", "CANCEL_REQUESTED"):
                return self._run_record(db, row)
            db.execute("UPDATE sf_scenario_runs SET status='QUEUED',error=NULL,finished_at=NULL WHERE id=?", (run_id,))
            db.commit()
            self._submit(run_id)
        return self.run(run_id)

    def cancel(self, run_id):
        run_id = identifier(run_id)
        with self.guard:
            self.run(run_id)
            if run_id in self._events:
                self._events[run_id].set()
            with self.database._connection() as db:
                db.execute("UPDATE sf_scenario_runs SET status='CANCEL_REQUESTED' WHERE id=? AND status IN ('QUEUED','PREPARING','RUNNING')", (run_id,))
        return self.run(run_id)

    def _run_record(self, db, row):
        request = json.loads(row["request"])
        if checksum(request) != row["request_sha256"]:
            fail("The retained run request has changed.")
        definition_row = db.execute("SELECT * FROM sf_scenario_definitions WHERE name=? AND revision=?", (request["name"], request["revision"])).fetchone()
        spec = self._record(definition_row)
        if definition_row["sha256"] != request["definition_sha256"]:
            fail("The retained run definition has changed.")
        tasks = [self._record(r) for r in db.execute("SELECT * FROM sf_scenario_cases WHERE run_id=? ORDER BY task", (row["id"],))]
        result = self._record(row) if row["record"] is not None else None
        review = db.execute("SELECT * FROM sf_scenario_reviews WHERE run_id=? ORDER BY revision DESC LIMIT 1", (row["id"],)).fetchone()
        return {"sequence": row["sequence"], "id": row["id"], "status": row["status"], "request": request,
                "created_at": row["created_at"], "finished_at": row["finished_at"], "error": row["error"],
                "definition": spec, "completed_tasks": len(tasks), "task_count": len(spec["cases"]) * len(spec["measures"]),
                "cases": tasks, "result": result, "result_sha256": row["sha256"],
                "review": self._record(review) if review else None}

    def run(self, run_id):
        run_id = identifier(run_id)
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            row = db.execute("SELECT * FROM sf_scenario_runs WHERE id=?", (run_id,)).fetchone()
            if row is None:
                fail("The retained run was not found.")
            return self._run_record(db, row)

    def runs(self, *, after=0, limit=25):
        self._page(after, limit)
        with self.database._connection(readonly=True) as db:
            rows = db.execute("SELECT * FROM sf_scenario_runs WHERE sequence>? ORDER BY sequence LIMIT ?", (after, limit + 1)).fetchall()
            return {"items": [{key: r[key] for key in ("sequence", "id", "status", "created_at", "finished_at", "error")} |
                              {"name": json.loads(r["request"])["name"]} for r in rows[:limit]],
                    "next_after": rows[limit-1]["sequence"] if len(rows) > limit else None}

    def _status(self, run_id, status, error=None):
        with self.guard, self.database._connection() as db:
            db.execute("UPDATE sf_scenario_runs SET status=?,error=?,finished_at=? WHERE id=? AND status!='COMPLETE'", (status, error, now() if status in ("FAILED", "CANCELLED") else None, run_id))

    @staticmethod
    def _check_cancel(event):
        if event.is_set():
            fail("The run was cancelled. Its completed cases and frozen input remain available for resume.")

    def _freeze(self, run, event):
        run_id, request = run["id"], run["request"]
        folder = private_directory(self.work / run_id)
        snapshot_dir = private_directory(folder / "input")
        frozen = snapshot_dir / "datasets.sqlite3"
        metadata = folder / "input.json"
        self._check_cancel(event)
        if not frozen.exists():
            if metadata.exists() or run["completed_tasks"]:
                fail("The retained input snapshot is missing; it cannot be replaced with current data.")
            self.database.backup(snapshot_dir)
        snapshot = DatasetDatabase(snapshot_dir, create=False)
        with snapshot._connection(readonly=True) as db:
            db.execute("BEGIN")
            if snapshot._views(db) != request["expected_views"]:
                fail("The data selection changed before this run was frozen. Prepare a new reviewed run.")
            workspace_id = db.execute("SELECT workspace_id FROM sf_analysis_format WHERE id=1").fetchone()[0]
            selected = db.execute("SELECT * FROM sf_scenario_definitions WHERE name=? AND revision=?", (request["name"], request["revision"])).fetchone()
            if selected is None or selected["sha256"] != request["definition_sha256"] or self._record(selected) != run["definition"]:
                fail("The frozen definition does not match this operation.")
        summary = {"schema": SCHEMA + "/input", "workspace_id": workspace_id, "request_sha256": checksum(request),
                   "database_sha256": file_digest(frozen), "bytes": frozen.stat().st_size}
        if metadata.exists():
            if metadata.is_symlink() or json.loads(metadata.read_text()) != summary:
                fail("The retained input snapshot has changed.")
        else:
            self._write_private(metadata, encode(summary).encode())
        return snapshot, summary

    @staticmethod
    def _write_private(path, data):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())

    def _execute(self, run_id, event):
        try:
            self._status(run_id, "PREPARING")
            run = self.run(run_id)
            with self.guard:
                folder = self.work / run_id
                if folder.exists():
                    import stat
                    for partial in folder.glob(".case-*"):
                        info = partial.lstat()
                        if stat.S_ISREG(info.st_mode) and info.st_nlink == 1:
                            partial.unlink()
                snapshot, frozen = self._freeze(run, event)
            self._status(run_id, "RUNNING")
            task = 0
            for case in run["definition"]["cases"]:
                for measure in run["definition"]["measures"]:
                    self._check_cancel(event)
                    self._case(run, snapshot, task, case, measure, event)
                    task += 1
            self._check_cancel(event)
            self._finish(run, frozen, event)
            # Only the managed extra input copy is retired. All original imported
            # versions, complete rows, definitions and review history remain.
            with self.guard:
                folder = self.work / run_id
                for path in (folder / "input" / "datasets.sqlite3", folder / "input.json"):
                    if path.is_file() and not path.is_symlink():
                        path.unlink()
                for path in (folder / "input", folder):
                    try:
                        path.rmdir()
                    except OSError:
                        pass
        except BaseException as exc:
            cancelled = event.is_set()
            message = str(exc) if isinstance(exc, StateError) else "The operation stopped: " + type(exc).__name__ + ". Its complete cases remain available."
            self._status(run_id, "CANCELLED" if cancelled else "FAILED", message)

    def _case(self, run, snapshot, task, case, measure, event):
        run_id = run["id"]
        with self.database._connection(readonly=True) as db:
            old = db.execute("SELECT * FROM sf_scenario_cases WHERE run_id=? AND task=?", (run_id, task)).fetchone()
            if old is not None:
                self._verify_case(db, run_id, task, self._record(old))
                return
            used = sum(self._record(r)["row_bytes"] for r in db.execute("SELECT * FROM sf_scenario_cases WHERE run_id=?", (run_id,)))
        params = effective_parameters(measure, case)
        fd, temporary = tempfile.mkstemp(prefix=".case-", dir=self.work / run_id)
        checksum_rows, count, size = hashlib.sha256(), 0, 0
        try:
            with os.fdopen(fd, "w+b") as spool:
                with snapshot._connection(readonly=True) as db:
                    db.execute("BEGIN")
                    with open_query(snapshot, db, measure["query"]["sql"], _parameters(params),
                                    expected_views=run["request"]["expected_views"],
                                    timeout=run["request"]["options"]["query_timeout_seconds"], cancel=event.is_set) as stream:
                        columns = list(stream.columns)
                        if not columns or len(columns) != len(set(columns)):
                            fail("Every result column must have a distinct name. Add SQL aliases to duplicate names.")
                        required = set(measure["keys"]) | {m["column"] for m in measure["metrics"]}
                        if required - set(columns):
                            fail("The result does not contain every selected key and metric column.")
                        positions = [columns.index(key) for key in measure["keys"]]
                        metrics = [(columns.index(m["column"]), m["kind"]) for m in measure["metrics"]]
                        for values in stream:
                            count += 1
                            cells = [cell(value) for value in values]
                            key = row_key(cells, positions, count)
                            if len(key.encode()) > 1024 * 1024:
                                fail("A row key exceeds 1 MiB; select shorter identifying columns.")
                            for index, kind in metrics:
                                numeric(cells[index], kind)
                            raw = encode(cells)
                            line = encode({"row_number": count, "key": key, "record": raw}) + "\n"
                            size += len(line.encode())
                            if used + size > run["request"]["options"]["result_limit_bytes"]:
                                fail("The configured complete-result storage limit was reached. Earlier complete cases remain available; increase the limit in a new run.")
                            spool.write(line.encode())
                            checksum_rows.update(raw.encode() + b"\n")
                        sources = [{k: v for k, v in source.items() if k not in ("sourceDirectory", "sequence")}
                                   for source in stream.source_versions()]
                        read_tables = list(stream.read_tables)
                self._check_cancel(event)
                result = {"task": task, "case": case["name"], "measure": measure["name"], "columns": columns,
                          "parameters_text": params, "query_sha256": measure["query_sha256"],
                          "row_count": count, "row_bytes": size, "rows_sha256": checksum_rows.hexdigest(),
                          "read_tables": read_tables, "sources": sources, "completed_at": now()}
                raw_result = encode(result)
                spool.flush()
                spool.seek(0)
                with self.guard, self.database._connection() as db:
                    db.execute("BEGIN IMMEDIATE")
                    db.execute("INSERT INTO sf_scenario_cases VALUES(?,?,?,?)", (run_id, task, raw_result, hashlib.sha256(raw_result.encode()).hexdigest()))
                    for line in spool:
                        item = json.loads(line)
                        try:
                            db.execute("INSERT INTO sf_scenario_rows VALUES(?,?,?,?,?,?)", (run_id, task, item["row_number"], item["key"], item["record"], hashlib.sha256(item["record"].encode()).hexdigest()))
                        except sqlite3.IntegrityError:
                            fail("The selected row keys are not unique. Choose a complete unique key; this case was not partially committed.")
                    self._verify_case(db, run_id, task, result)
                    self._check_cancel(event)
                    db.commit()
        finally:
            Path(temporary).unlink(missing_ok=True)

    def _verify_case(self, db, run_id, task, result):
        digest, count = hashlib.sha256(), 0
        for row in db.execute("SELECT * FROM sf_scenario_rows WHERE run_id=? AND task=? ORDER BY row_number", (run_id, task)):
            self._record(row)
            count += 1
            if row["row_number"] != count:
                fail("The retained row sequence has changed.")
            digest.update(row["record"].encode() + b"\n")
        if count != result["row_count"] or digest.hexdigest() != result["rows_sha256"]:
            fail("A completed case has changed; it will not be silently rerun.")

    def _finish(self, run, frozen, event):
        run_id, spec = run["id"], run["definition"]
        with self.guard, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            tasks = {r["task"]: self._record(r) for r in db.execute("SELECT * FROM sf_scenario_cases WHERE run_id=? ORDER BY task", (run_id,))}
            expected_count = len(spec["cases"]) * len(spec["measures"])
            if set(tasks) != set(range(expected_count)):
                fail("Every selected case must complete before comparison.")
            for task, result in tasks.items():
                self._verify_case(db, run_id, task, result)
            db.execute("DELETE FROM sf_scenario_comparison_rows WHERE run_id=?", (run_id,))
            db.execute("DELETE FROM sf_scenario_comparisons WHERE run_id=?", (run_id,))
            baseline_index = next(i for i, c in enumerate(spec["cases"]) if c["name"] == spec["baseline"])
            pairs, comparison_bytes = [], 0
            used = sum(r["row_bytes"] for r in tasks.values())
            for case_index, case in enumerate(spec["cases"]):
                if case_index == baseline_index:
                    continue
                for measure_index, measure in enumerate(spec["measures"]):
                    pair = len(pairs)
                    left_task = baseline_index * len(spec["measures"]) + measure_index
                    right_task = case_index * len(spec["measures"]) + measure_index
                    counts = {key: 0 for key in ("added", "removed", "changed", "unchanged")}
                    placeholder = encode({"pending": True})
                    db.execute("INSERT INTO sf_scenario_comparisons VALUES(?,?,?,?)", (run_id, pair, placeholder, hashlib.sha256(placeholder.encode()).hexdigest()))
                    sql = """SELECT l.key,l.row_number ln,l.record lr,l.sha256 lh,r.row_number rn,r.record rr,r.sha256 rh
                    FROM sf_scenario_rows l LEFT JOIN sf_scenario_rows r ON r.run_id=l.run_id AND r.task=? AND r.key=l.key
                    WHERE l.run_id=? AND l.task=?
                    UNION ALL SELECT r.key,NULL,NULL,NULL,r.row_number,r.record,r.sha256
                    FROM sf_scenario_rows r LEFT JOIN sf_scenario_rows l ON l.run_id=r.run_id AND l.task=? AND l.key=r.key
                    WHERE r.run_id=? AND r.task=? AND l.row_number IS NULL ORDER BY 1"""
                    total, digest = 0, hashlib.sha256()
                    for row in db.execute(sql, (right_task, run_id, left_task, left_task, run_id, right_task)):
                        self._check_cancel(event)
                        left = {"columns": tasks[left_task]["columns"], "row_number": row["ln"], "cells": json.loads(row["lr"])} if row["lr"] is not None else None
                        right = {"columns": tasks[right_task]["columns"], "row_number": row["rn"], "cells": json.loads(row["rr"])} if row["rr"] is not None else None
                        result = {"key": json.loads(row["key"]), **compare_rows(left, right, measure)}
                        counts[result["status"]] += 1
                        total += 1
                        raw = encode(result)
                        comparison_bytes += len(raw.encode())
                        if used + comparison_bytes > run["request"]["options"]["result_limit_bytes"]:
                            fail("The complete comparison reached the configured storage limit. No partial comparison was published.")
                        digest.update(raw.encode() + b"\n")
                        db.execute("INSERT INTO sf_scenario_comparison_rows VALUES(?,?,?,?,?,?)", (run_id, pair, total, result["status"], raw, hashlib.sha256(raw.encode()).hexdigest()))
                    pair_result = {"pair": pair, "measure": measure["name"], "baseline": spec["baseline"], "candidate": case["name"],
                                   "baseline_task": left_task, "candidate_task": right_task,
                                   "row_count": total, "counts": counts, "rows_sha256": digest.hexdigest()}
                    raw = encode(pair_result)
                    db.execute("UPDATE sf_scenario_comparisons SET record=?,sha256=? WHERE run_id=? AND pair=?", (raw, hashlib.sha256(raw.encode()).hexdigest(), run_id, pair))
                    pairs.append(pair_result)
            record = {"schema": SCHEMA + "/result", "run_id": run_id, "definition_sha256": run["request"]["definition_sha256"],
                      "frozen_input": frozen, "views": run["request"]["expected_views"], "tasks": list(tasks.values()),
                      "comparisons": pairs, "total_result_rows": sum(r["row_count"] for r in tasks.values()),
                      "comparison_bytes": comparison_bytes, "completed_at": now(),
                      "arithmetic": {"delta": "decimal difference of original scalar text", "percentage": "100 * delta / absolute baseline; 28 significant decimal digits; zero baseline is unavailable"}}
            raw = encode(record)
            db.execute("UPDATE sf_scenario_runs SET status='COMPLETE',record=?,sha256=?,finished_at=?,error=NULL WHERE id=?", (raw, hashlib.sha256(raw.encode()).hexdigest(), record["completed_at"], run_id))
            db.commit()

    def rows(self, run_id, task, *, after=0, limit=50):
        self._page(after, limit)
        identifier(run_id)
        if type(task) is not int or task < 0:
            fail("The case selection is invalid.")
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            selected = db.execute("SELECT * FROM sf_scenario_cases WHERE run_id=? AND task=?", (run_id, task)).fetchone()
            info = self._record(selected)
            rows = db.execute("SELECT * FROM sf_scenario_rows WHERE run_id=? AND task=? AND row_number>? ORDER BY row_number LIMIT ?", (run_id, task, after, limit + 1)).fetchall()
            return {"case": info, "items": [{"row_number": r["row_number"], "key": json.loads(r["key"]), "cells": self._record(r)} for r in rows[:limit]],
                    "next_after": rows[limit-1]["row_number"] if len(rows) > limit else None}

    def comparison(self, run_id, pair, *, after=0, limit=50, status="all"):
        self._page(after, limit)
        identifier(run_id)
        if type(pair) is not int or pair < 0 or status not in ("all", "different", "added", "removed", "changed", "unchanged"):
            fail("The comparison selection is invalid.")
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            info = self._record(db.execute("SELECT * FROM sf_scenario_comparisons WHERE run_id=? AND pair=?", (run_id, pair)).fetchone())
            clause = "" if status == "all" else " AND status!='unchanged'" if status == "different" else " AND status=?"
            args = (run_id, pair, after) + ((status,) if status not in ("all", "different") else ()) + (limit + 1,)
            rows = db.execute("SELECT * FROM sf_scenario_comparison_rows WHERE run_id=? AND pair=? AND row_number>?" + clause + " ORDER BY row_number LIMIT ?", args).fetchall()
            return {"comparison": info, "status": status,
                    "items": [{"row_number": r["row_number"], **self._record(r)} for r in rows[:limit]],
                    "next_after": rows[limit-1]["row_number"] if len(rows) > limit else None}

    def review(self, run_id, value):
        identifier(run_id)
        if not isinstance(value, dict):
            fail("A review request is required.")
        request_id = identifier(value.get("id"))
        expected = revision(value.get("expected_revision"), zero=True)
        reviewer = text(value.get("reviewer", ""), "Reviewer label", 200)
        note = text(value.get("note"), "Review note", 16000, required=True)
        selected_case = value.get("selected_case")
        normalized = {"id": request_id, "run_id": run_id, "expected_revision": expected,
                      "result_sha256": value.get("result_sha256"), "reviewer": reviewer, "note": note, "selected_case": selected_case}
        request_sha = checksum(normalized)
        with self.guard, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM sf_scenario_reviews WHERE id=?", (request_id,)).fetchone()
            if old:
                if old["request_sha256"] != request_sha:
                    fail("This review identifier belongs to a different review.")
                return self._record(old)
            run_row = db.execute("SELECT * FROM sf_scenario_runs WHERE id=?", (run_id,)).fetchone()
            if run_row is None or run_row["status"] != "COMPLETE" or run_row["sha256"] != value.get("result_sha256"):
                fail("Review the exact completed result before saving a decision.")
            run = self._run_record(db, run_row)
            if selected_case is not None and selected_case not in {c["name"] for c in run["definition"]["cases"]}:
                fail("Select one of this run's scenarios, or leave the decision open.")
            head = db.execute("SELECT MAX(revision) FROM sf_scenario_reviews WHERE run_id=?", (run_id,)).fetchone()[0] or 0
            if head != expected:
                fail("The review changed. Load its current revision before saving.")
            record = {"schema": SCHEMA + "/review", **normalized, "revision": head + 1, "reviewed_at": now(),
                      "reviewer_attribution": "operator-supplied label"}
            raw = encode(record)
            db.execute("INSERT INTO sf_scenario_reviews VALUES(?,?,?,?,?,?)", (run_id, head + 1, request_id, request_sha, raw, hashlib.sha256(raw.encode()).hexdigest()))
            db.commit()
            return record

    def reviews(self, run_id, *, after=0, limit=50):
        identifier(run_id)
        self._page(after, limit)
        with self.database._connection(readonly=True) as db:
            rows = db.execute("SELECT * FROM sf_scenario_reviews WHERE run_id=? AND revision>? ORDER BY revision LIMIT ?", (run_id, after, limit + 1)).fetchall()
            return {"items": [self._record(r) for r in rows[:limit]],
                    "next_after": rows[limit-1]["revision"] if len(rows) > limit else None}
