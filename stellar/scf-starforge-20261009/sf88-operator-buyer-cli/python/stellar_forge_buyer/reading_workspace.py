"""Complete-file reading on retained SF88 resources. Python 3.11+, SQLite FTS5.

The original ResourceLibrary remains responsible for file delivery, annotations,
collections and review decisions. This module owns only its derived passage index,
immutable reading snapshots, saved searches and reading-list revisions.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import sqlite3
import stat
import threading
from typing import Any, Iterator
import uuid

SCHEMA = "stellar-forge.sf88.reading-workspace.v1"
HASH = re.compile(r"^[0-9a-f]{64}$")
CHUNK = 32768
OVERLAP = 4096
MAX_QUERY = 512


class ReadingError(ValueError):
    """Stable actionable error code; no credentials or native filesystem paths."""
    def __init__(self, code: str, detail: str = ""):
        self.code, self.detail = code, detail
        super().__init__(code + (": " + detail if detail else ""))


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def text(value: Any, label: str, maximum: int, *, empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()) or "\x00" in value:
        raise ReadingError("INVALID_INPUT", label)
    return value


def identity(value: Any) -> str:
    value = text(value, "identifier", 128)
    if not re.fullmatch(r"[A-Za-z0-9._:-]+", value):
        raise ReadingError("INVALID_IDENTIFIER")
    return value


def query_expression(query: str) -> str:
    """Literal AND terms, with quoted phrases. Never accepts raw FTS/SQL syntax."""
    query = text(query, "query (up to 512 characters)", MAX_QUERY)
    try:
        lexer = shlex.shlex(query, posix=True)
        lexer.whitespace_split, lexer.commenters, lexer.quotes, lexer.escape = True, "", '"', ""
        parts = list(lexer)
    except ValueError as exc:
        raise ReadingError("QUERY_QUOTES", "Close the quotation marks around a phrase.") from exc
    if not parts or len(parts) > 32 or any(not any(c.isalnum() for c in part) for part in parts):
        raise ReadingError("QUERY_WORDS", "Use words or quoted phrases; at most 32 terms.")
    return " AND ".join('"' + p.replace('"', '""') + '"' for p in parts)


def file_digest(path: Path) -> tuple[str, int]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags), "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ReadingError("REGULAR_FILE_REQUIRED")
        value = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
        after = os.fstat(stream.fileno())
        if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise ReadingError("SOURCE_CHANGED")
        return value.hexdigest(), before.st_size


def passages(path: Path) -> Iterator[dict[str, Any]]:
    """Stream the entire UTF-8 original with exact byte spans and LF line numbers.

    Segments overlap so ordinary phrases at a segment boundary remain searchable.
    Long unbroken tokens are subject to SQLite's tokenizer limits. Memory use is
    independent of file length. No replacement decoding or truncated text is used.
    """
    offset, line, ordinal = 0, 1, 0
    with path.open("rb") as stream:
        data = stream.read(CHUNK + 4)
        while data:
            end = min(CHUNK, len(data))
            while end < len(data) and data[end] & 0xC0 == 0x80:
                end -= 1
            block = data[:end]
            body = block.decode("utf-8", errors="strict")
            if "\x00" in body:
                raise ReadingError("NON_TEXT_SOURCE", "The original contains NUL bytes.")
            yield {"ordinal": ordinal, "start_byte": offset, "end_byte": offset + end,
                   "start_line": line, "end_line": line + block.count(b"\n"),
                   "sha256": hashlib.sha256(block).hexdigest(), "body": body}
            if end == len(data):
                break
            step = max(1, end - OVERLAP)
            while step < end and data[step] & 0xC0 == 0x80:
                step += 1
            line += data[:step].count(b"\n")
            offset += step
            ordinal += 1
            data = data[step:] + stream.read(CHUNK + 4 - len(data[step:]))


_DDL = """
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(sha TEXT PRIMARY KEY, bytes INTEGER NOT NULL, state TEXT NOT NULL,
  reason TEXT NOT NULL, passages INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS passages(sha TEXT NOT NULL, ordinal INTEGER NOT NULL, start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, digest TEXT NOT NULL,
  PRIMARY KEY(sha, ordinal));
CREATE VIRTUAL TABLE IF NOT EXISTS passage_search USING fts5(sha UNINDEXED, ordinal UNINDEXED, body,
  tokenize='unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS resources(id TEXT PRIMARY KEY, sha TEXT, metadata TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS resources_sha ON resources(sha);
CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, label TEXT NOT NULL, created TEXT NOT NULL,
  source_identity TEXT NOT NULL, native_generation TEXT, counts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshot_resources(snapshot TEXT NOT NULL, resource TEXT NOT NULL,
  metadata TEXT NOT NULL, PRIMARY KEY(snapshot,resource));
CREATE TABLE IF NOT EXISTS syncs(id TEXT PRIMARY KEY, request_digest TEXT NOT NULL, plan TEXT NOT NULL,
  state TEXT NOT NULL, completed INTEGER NOT NULL, total INTEGER NOT NULL, error TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS revisions(kind TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
  created TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,id,revision));
CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries(id TEXT PRIMARY KEY, request TEXT NOT NULL, state TEXT NOT NULL, result TEXT);
"""


class ReadingWorkspace:
    """A durable, independently reopenable reading workspace. Use as a context manager.

    SQLite transactions and an advisory POSIX lock coordinate processes. Readers
    use short snapshot transactions. An interrupted sync keeps the last complete
    snapshot searchable and resumes at the first unfinished verified source.
    """
    def __init__(self, directory: str | Path, *, create: bool = True):
        raw = Path(directory).absolute()
        if raw.is_symlink() or raw.resolve() != raw:
            raise ReadingError("CANONICAL_DIRECTORY_REQUIRED")
        if not raw.exists():
            if not create:
                raise ReadingError("WORKSPACE_NOT_FOUND")
            raw.mkdir(parents=True, mode=0o700)
        if not raw.is_dir():
            raise ReadingError("DIRECTORY_REQUIRED")
        self.directory = raw
        self.assets = raw / "originals"
        self.assets.mkdir(mode=0o700, exist_ok=True)
        if self.assets.is_symlink():
            raise ReadingError("CANONICAL_DIRECTORY_REQUIRED")
        self.database = raw / "reading.sqlite"
        if not create and not self.database.exists():
            raise ReadingError("WORKSPACE_NOT_FOUND")
        if self.database.is_symlink():
            raise ReadingError("CANONICAL_DATABASE_REQUIRED")
        self._mutex = threading.RLock()
        self._lockfd = os.open(raw / ".reading.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        self._closed = False
        with self._exclusive():
            db = sqlite3.connect(self.database)
            try:
                db.execute("PRAGMA journal_mode=WAL")
                db.execute("PRAGMA synchronous=FULL")
                db.executescript(_DDL)
                row = db.execute("SELECT value FROM metadata WHERE key='schema'").fetchone()
                if row and json.loads(row[0]) != SCHEMA:
                    raise ReadingError("WORKSPACE_VERSION")
                for key, value in (("schema", SCHEMA), ("id", str(uuid.uuid4())), ("created", now())):
                    db.execute("INSERT OR IGNORE INTO metadata VALUES(?,?)", (key, canonical(value)))
                db.commit()
                os.chmod(self.database, 0o600)
            finally:
                db.close()

    @contextmanager
    def _exclusive(self):
        with self._mutex:
            if self._closed:
                raise ReadingError("WORKSPACE_CLOSED")
            fcntl.flock(self._lockfd, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(self._lockfd, fcntl.LOCK_UN)

    @contextmanager
    def _db(self, *, write: bool = False):
        if self._closed:
            raise ReadingError("WORKSPACE_CLOSED")
        db = sqlite3.connect(self.database, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def close(self):
        with self._mutex:
            if not self._closed:
                os.close(self._lockfd)
                self._closed = True

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    @staticmethod
    def _meta(db, key, default=None):
        row = db.execute("SELECT value FROM metadata WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    @staticmethod
    def _set(db, key, value):
        db.execute("INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, canonical(value)))

    def status(self) -> dict[str, Any]:
        with self._db() as db:
            meta = {r["key"]: json.loads(r["value"]) for r in db.execute("SELECT * FROM metadata")}
            snapshots = [dict(r) for r in db.execute("SELECT * FROM snapshots ORDER BY created DESC,id")]
            for row in snapshots:
                row["counts"] = json.loads(row["counts"])
            return {**meta, "snapshots": snapshots,
                    "assets": {
                        "files": db.execute("SELECT count(*) FROM assets").fetchone()[0],
                        "bytes": db.execute("SELECT coalesce(sum(bytes),0) FROM assets").fetchone()[0],
                        "passages": db.execute("SELECT coalesce(sum(passages),0) FROM assets").fetchone()[0]},
                    "syncs": [dict(r) for r in db.execute("SELECT id,state,completed,total,error FROM syncs ORDER BY rowid DESC LIMIT 20")],
                    "saved_searches": self._heads(db, "search"), "reading_lists": self._heads(db, "list")}

    @staticmethod
    def _heads(db, kind):
        return [json.loads(r[0]) for r in db.execute("SELECT payload FROM revisions r WHERE kind=? AND revision=(SELECT max(revision) FROM revisions WHERE kind=r.kind AND id=r.id) ORDER BY id", (kind,))]

    @staticmethod
    def _resource_metadata(record):
        # Native path bindings stay with the original library. Portable documents
        # retain public source and immutable identities, never replay local paths.
        keys = ("id", "intentId", "inboxId", "configSha256", "createdAt", "queueState", "url", "name",
                "bytes", "sha256", "contentType", "deliveryStatus", "buyerStatus", "httpStatus", "status", "annotation")
        return {k: record[k] for k in keys if k in record}

    def _index(self, sha: str, size: int, *, cancel_event=None):
        if not HASH.fullmatch(sha):
            raise ReadingError("INVALID_SOURCE_HASH")
        path = self.assets / sha
        if file_digest(path) != (sha, size):
            raise ReadingError("ORIGINAL_HASH_MISMATCH")
        with self._db() as db:
            if db.execute("SELECT 1 FROM assets WHERE sha=?", (sha,)).fetchone():
                return False
        count, state, reason = 0, "indexed", ""
        try:
            with self._db(write=True) as db:
                for p in passages(path):
                    if cancel_event is not None and cancel_event.is_set():
                        raise ReadingError("CANCELLED", "Sync can resume with the same operation identifier.")
                    db.execute("INSERT INTO passages VALUES(?,?,?,?,?,?,?)", (sha, p["ordinal"], p["start_byte"], p["end_byte"], p["start_line"], p["end_line"], p["sha256"]))
                    db.execute("INSERT INTO passage_search VALUES(?,?,?)", (sha, p["ordinal"], p["body"]))
                    count += 1
                if file_digest(path) != (sha, size):
                    raise ReadingError("ORIGINAL_HASH_MISMATCH")
                db.execute("INSERT INTO assets VALUES(?,?,?,?,?)", (sha, size, state, reason, count))
        except (UnicodeDecodeError, ReadingError) as exc:
            if not isinstance(exc, UnicodeDecodeError) and exc.code != "NON_TEXT_SOURCE":
                raise
            state, reason, count = "download-only", "Original is not NUL-free UTF-8 text.", 0
            with self._db(write=True) as db:
                db.execute("INSERT INTO assets VALUES(?,?,?,?,?)", (sha, size, state, reason, count))
        return True

    def sync(self, library, *, operation_id: str, label: str, cancel_event=None, progress=None) -> dict[str, Any]:
        """Receive complete originals through the existing ResourceLibrary only.

        Reusing an operation resumes its frozen plan. A new operation explicitly
        adopts the library's current complete scan. Shared bytes are received once.
        """
        operation_id, label = identity(operation_id), text(label, "snapshot label", 160)
        native = library.status()
        source = digest({k: native["config"].get(k) for k in ("kind", "source", "roots")})
        request_digest = digest({"source": source, "label": label})
        with self._exclusive():
            with self._db() as db:
                bound = self._meta(db, "source_identity")
                existing = db.execute("SELECT * FROM syncs WHERE id=?", (operation_id,)).fetchone()
                if bound and bound != source:
                    raise ReadingError("DIFFERENT_LIBRARY", "Use a separate workspace for another source library.")
                if existing and existing["request_digest"] != request_digest:
                    raise ReadingError("OPERATION_CONFLICT")
                if existing and existing["state"] == "complete":
                    return json.loads(existing["result"])
            if existing:
                plan = json.loads(existing["plan"])
            else:
                if not native.get("scan", {}).get("generation"):
                    raise ReadingError("SCAN_REQUIRED", "Scan the original resource library before synchronizing.")
                records = [self._resource_metadata(r) for r in library.iter_resources()]
                generation = native["scan"]["generation"]
                if library.status()["scan"]["generation"] != generation:
                    raise ReadingError("LIBRARY_CHANGED", "Synchronize the new completed scan.")
                plan = {"source": source, "generation": generation, "records": records, "label": label, "created": now()}
                with self._db(write=True) as db:
                    self._set(db, "source_identity", source)
                    db.execute("INSERT INTO syncs VALUES(?,?,?,'receiving',0,?,NULL,NULL)", (operation_id, request_digest, canonical(plan), len(records)))
            counts = {"resources": len(plan["records"]), "indexed": 0, "download_only": 0, "unavailable": 0, "bytes": 0, "passages": 0}
            try:
                for position, record in enumerate(plan["records"]):
                    if cancel_event is not None and cancel_event.is_set():
                        raise ReadingError("CANCELLED", "Sync can resume with the same operation identifier.")
                    sha, size = record.get("sha256"), record.get("bytes")
                    if not isinstance(sha, str) or not HASH.fullmatch(sha) or type(size) is not int or size < 0 or (record.get("status") != "VERIFIED" and not (self.assets / sha).exists()):
                        counts["unavailable"] += 1
                    else:
                        path = self.assets / sha
                        if not path.exists():
                            # Native transfer owns resumability, validation and create-only output.
                            copied = library.download_resource(record["id"], path, cancel_event=cancel_event)
                            if copied.sha256 != sha or copied.bytes != size:
                                raise ReadingError("ORIGINAL_HASH_MISMATCH")
                        self._index(sha, size, cancel_event=cancel_event)
                        with self._db() as db:
                            asset = db.execute("SELECT * FROM assets WHERE sha=?", (sha,)).fetchone()
                        counts["indexed" if asset["state"] == "indexed" else "download_only"] += 1
                        counts["bytes"] += size
                        counts["passages"] += asset["passages"]
                    with self._db(write=True) as db:
                        db.execute("UPDATE syncs SET state='receiving',completed=?,error=NULL WHERE id=?", (position + 1, operation_id))
                    if progress:
                        progress({"completed": position + 1, "total": len(plan["records"]), "name": record.get("name", "Source file")})
                result = {"id": operation_id, "label": label, "created": plan["created"], "source_identity": source,
                          "native_generation": plan["generation"], "counts": counts}
                with self._db(write=True) as db:
                    db.execute("INSERT INTO snapshots VALUES(?,?,?,?,?,?)", (operation_id, label, plan["created"], source, plan["generation"], canonical(counts)))
                    for r in plan["records"]:
                        db.execute("INSERT OR IGNORE INTO resources VALUES(?,?,?)", (r["id"], r.get("sha256"), canonical(r)))
                        db.execute("INSERT INTO snapshot_resources VALUES(?,?,?)", (operation_id, r["id"], canonical(r)))
                    self._set(db, "current_snapshot", operation_id)
                    db.execute("UPDATE syncs SET state='complete',result=?,error=NULL WHERE id=?", (canonical(result), operation_id))
                return result
            except BaseException as exc:
                with self._db(write=True) as db:
                    db.execute("UPDATE syncs SET state='interrupted',error=? WHERE id=?", (getattr(exc, "code", type(exc).__name__), operation_id))
                raise

    def _snapshot(self, db, snapshot):
        selected = snapshot or self._meta(db, "current_snapshot")
        if selected is None:
            return None
        if not db.execute("SELECT 1 FROM snapshots WHERE id=?", (selected,)).fetchone():
            raise ReadingError("SNAPSHOT_NOT_FOUND")
        return selected

    def resources(self, *, snapshot=None, offset=0, limit=100):
        self._page(offset, limit)
        with self._db() as db:
            selected = self._snapshot(db, snapshot)
            total = db.execute("SELECT count(*) FROM snapshot_resources WHERE snapshot=?", (selected,)).fetchone()[0]
            rows = db.execute("SELECT sr.metadata,a.state,a.reason,a.passages FROM snapshot_resources sr JOIN resources r ON r.id=sr.resource LEFT JOIN assets a ON a.sha=r.sha WHERE sr.snapshot=? ORDER BY r.id LIMIT ? OFFSET ?", (selected, limit, offset))
            return {"snapshot": selected, "total": total, "offset": offset, "items": [{**json.loads(r["metadata"]), "reading_state": r["state"] or "unavailable", "reading_reason": r["reason"] or "", "passages": r["passages"] or 0} for r in rows]}

    @staticmethod
    def _page(offset, limit):
        if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 200:
            raise ReadingError("INVALID_PAGE")

    def search(self, query: str, *, snapshot=None, resource_id=None, offset=0, limit=30):
        expression = query_expression(query)
        self._page(offset, limit)
        with self._db() as db:
            selected = self._snapshot(db, snapshot)
            where, binds = "passage_search MATCH ? AND sr.snapshot=?", [expression, selected]
            if resource_id:
                where += " AND r.id=?"
                binds.append(resource_id)
            join = " FROM passage_search JOIN resources r ON r.sha=passage_search.sha JOIN snapshot_resources sr ON sr.resource=r.id JOIN passages p ON p.sha=r.sha AND p.ordinal=CAST(passage_search.ordinal AS INTEGER) WHERE " + where
            total = db.execute("SELECT count(*)" + join, binds).fetchone()[0]
            rows = db.execute("SELECT r.id AS resource_id,r.sha,p.*,sr.metadata,snippet(passage_search,2,'[',']',' … ',40) AS excerpt" + join + " ORDER BY r.id,p.ordinal LIMIT ? OFFSET ?", [*binds, limit, offset])
            items = []
            for row in rows:
                item = dict(row)
                metadata = json.loads(item.pop("metadata"))
                item.update(name=metadata.get("name") or "Source file", content_type=metadata.get("contentType") or "", snapshot=selected)
                items.append(item)
            return {"query": query, "snapshot": selected, "total": total, "offset": offset, "limit": limit, "items": items}

    def passage(self, resource_id: str, ordinal: int, *, expected_sha=None):
        if type(ordinal) is not int or ordinal < 0:
            raise ReadingError("INVALID_PASSAGE")
        with self._db() as db:
            row = db.execute("SELECT r.id AS resource_id,r.metadata,p.* FROM resources r JOIN passages p ON p.sha=r.sha WHERE r.id=? AND p.ordinal=?", (resource_id, ordinal)).fetchone()
            if not row:
                raise ReadingError("PASSAGE_NOT_FOUND")
            result = dict(row)
        metadata = json.loads(result.pop("metadata"))
        if expected_sha and result["sha"] != expected_sha:
            raise ReadingError("SELECTION_CHANGED")
        path = self.assets / result["sha"]
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "rb") as source:
            source.seek(result["start_byte"])
            raw = source.read(result["end_byte"] - result["start_byte"])
        if hashlib.sha256(raw).hexdigest() != result["digest"]:
            raise ReadingError("PASSAGE_HASH_MISMATCH")
        return {**result, "name": metadata.get("name") or "Source file", "body": raw.decode("utf-8", "strict")}

    def source_file(self, resource_id):
        with self._db() as db:
            row = db.execute("SELECT r.metadata,r.sha,a.bytes FROM resources r JOIN assets a ON a.sha=r.sha WHERE r.id=?", (resource_id,)).fetchone()
        if not row:
            raise ReadingError("ORIGINAL_UNAVAILABLE")
        path = self.assets / row["sha"]
        if file_digest(path) != (row["sha"], row["bytes"]):
            raise ReadingError("ORIGINAL_HASH_MISMATCH")
        return path, json.loads(row["metadata"])

    def head(self, kind: str, record_id: str, *, revision=None):
        if kind not in ("search", "list"):
            raise ReadingError("INVALID_RECORD_KIND")
        with self._db() as db:
            sql, args = "SELECT payload FROM revisions WHERE kind=? AND id=?", [kind, record_id]
            if revision is not None:
                sql += " AND revision=?"
                args.append(revision)
            row = db.execute(sql + " ORDER BY revision DESC LIMIT 1", args).fetchone()
            if not row:
                raise ReadingError("RECORD_NOT_FOUND")
            return json.loads(row[0])

    def history(self, kind: str, record_id: str):
        with self._db() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM revisions WHERE kind=? AND id=? ORDER BY revision", (kind, record_id))]

    def _save(self, kind, record_id, payload, expected_revision, operation_id):
        record_id, operation_id = identity(record_id), identity(operation_id)
        if type(expected_revision) is not int or expected_revision < 0:
            raise ReadingError("INVALID_REVISION")
        request = digest({"kind": kind, "id": record_id, "expected_revision": expected_revision, "payload": payload})
        with self._exclusive(), self._db(write=True) as db:
            receipt = db.execute("SELECT * FROM receipts WHERE id=?", (operation_id,)).fetchone()
            if receipt:
                if receipt["digest"] != request:
                    raise ReadingError("OPERATION_CONFLICT")
                return json.loads(receipt["result"])
            actual = db.execute("SELECT coalesce(max(revision),0) FROM revisions WHERE kind=? AND id=?", (kind, record_id)).fetchone()[0]
            if actual != expected_revision:
                raise ReadingError("REVISION_CONFLICT", f"Expected revision {expected_revision}; current revision is {actual}. Reload before saving.")
            result = {**payload, "id": record_id, "kind": kind, "revision": actual + 1, "created": now()}
            db.execute("INSERT INTO revisions VALUES(?,?,?,?,?)", (kind, record_id, actual + 1, result["created"], canonical(result)))
            db.execute("INSERT INTO receipts VALUES(?,?,?)", (operation_id, request, canonical(result)))
            return result

    def save_search(self, *, record_id, name, query, expected_revision, operation_id, snapshot=None, resource_id=None):
        query_expression(query)
        with self._db() as db:
            selected = self._snapshot(db, snapshot)
            if not selected:
                raise ReadingError("SNAPSHOT_REQUIRED")
            if resource_id and not db.execute("SELECT 1 FROM snapshot_resources WHERE snapshot=? AND resource=?", (selected, resource_id)).fetchone():
                raise ReadingError("RESOURCE_NOT_IN_SNAPSHOT")
        payload = {"name": text(name, "name", 160), "query": query, "snapshot": selected, "resource_id": resource_id}
        return self._save("search", record_id, payload, expected_revision, operation_id)

    def run_search(self, record_id, *, revision=None, offset=0, limit=30):
        record = self.head("search", record_id, revision=revision)
        return self.search(record["query"], snapshot=record["snapshot"], resource_id=record["resource_id"], offset=offset, limit=limit)

    def save_list(self, *, record_id, name, items, expected_revision, operation_id, note=""):
        if not isinstance(items, list) or len(items) > 10000:
            raise ReadingError("INVALID_READING_LIST")
        selected, seen = [], set()
        for item in items:
            p = self.passage(item["resource_id"], item["ordinal"], expected_sha=item.get("sha"))
            key = (p["resource_id"], p["ordinal"])
            if key in seen:
                raise ReadingError("DUPLICATE_PASSAGE")
            seen.add(key)
            selected.append({k: p[k] for k in ("resource_id", "sha", "ordinal", "digest", "start_byte", "end_byte", "start_line", "end_line", "name")} | {"note": text(item.get("note", ""), "passage note", 10000, empty=True)})
        payload = {"name": text(name, "name", 160), "note": text(note, "list note", 50000, empty=True), "items": selected}
        return self._save("list", record_id, payload, expected_revision, operation_id)

    def publish_collection(self, library, *, list_id, list_revision, collection_id, expected_revision, operation_id):
        """Publish an explicit reading selection through the ORIGINAL collection writer.

        A retained pending request is replayed byte-for-byte after a lost response;
        it never silently adopts a different annotation revision on retry.
        """
        record = self.head("list", list_id, revision=list_revision)
        if not isinstance(collection_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}", collection_id):
            raise ReadingError("COLLECTION_IDENTIFIER", "Use letters, digits, dots, underscores or hyphens; at most 96 characters.")
        if len(record["note"].encode()) > 32768:
            raise ReadingError("COLLECTION_INTRODUCTION", "The original collection accepts an introduction up to 32 KiB. Shorten the list introduction before publication; full passage notes remain in this project.")
        operation_id = identity(operation_id)
        request = {"list_id": list_id, "list_revision": list_revision, "collection_id": collection_id,
                   "expected_revision": expected_revision, "operation_id": operation_id}
        with self._exclusive():
            with self._db() as db:
                existing = db.execute("SELECT * FROM deliveries WHERE id=?", (operation_id,)).fetchone()
                bound = self._meta(db, "source_identity")
            native = library.status()
            if digest({k: native["config"].get(k) for k in ("kind", "source", "roots")}) != bound:
                raise ReadingError("DIFFERENT_LIBRARY")
            if existing:
                prepared = json.loads(existing["request"])
                if prepared["request"] != request:
                    raise ReadingError("OPERATION_CONFLICT")
                if existing["state"] == "complete":
                    return json.loads(existing["result"])
            else:
                members, seen = [], set()
                for item in record["items"]:
                    if item["resource_id"] in seen:
                        continue
                    source = library.resource(item["resource_id"])
                    if source["sha256"] != item["sha"]:
                        raise ReadingError("SELECTION_CHANGED")
                    seen.add(item["resource_id"])
                    members.append({"id": source["id"], "sha256": source["sha256"], "annotationRevision": source["annotation"]["revision"]})
                prepared = {"request": request, "native": {"collection_id": collection_id, "name": record["name"],
                    "members": members, "expected_revision": expected_revision, "operation_id": operation_id,
                    "note": record["note"]}}
                with self._db(write=True) as db:
                    db.execute("INSERT INTO deliveries VALUES(?,?,'pending',NULL)", (operation_id, canonical(prepared)))
            result = library.save_collection(**prepared["native"])
            with self._db(write=True) as db:
                db.execute("UPDATE deliveries SET state='complete',result=? WHERE id=?", (canonical(result), operation_id))
            return result
