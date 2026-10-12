"""Private dbt artifact custody and transactional project storage. MIT license.

Artifact bodies are immutable inputs. The SQLite projection can be rebuilt; source
bytes, invocation identities, review history and delivered files are the records.
There is no database connector, SQL executor or background schedule in this layer.
"""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import stat
import tempfile
import time
import uuid
from typing import Any, Iterator

HASH = re.compile(r"^[0-9a-f]{64}$")
FORMAT = "stellar-forge.dbt-project.v1"


class ProjectError(Exception):
    def __init__(self, code: str, message: str | None = None, status: int = 400):
        super().__init__(message or code)
        self.code, self.status = code, status


def require(condition: bool, code: str, message: str | None = None, status: int = 400) -> None:
    if not condition:
        raise ProjectError(code, message, status)


def stamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                       allow_nan=False) + "\n").encode("utf-8")


def identity(value: Any) -> str:
    return sha(json_bytes(value))


def text(value: Any, label: str, maximum: int = 512, empty: bool = False) -> str:
    require(isinstance(value, str) and len(value) <= maximum and (empty or bool(value.strip()))
            and "\x00" not in value, "INVALID_" + label.upper())
    return value


def hash_id(value: Any) -> str:
    require(isinstance(value, str) and bool(HASH.fullmatch(value)), "INVALID_HASH")
    return value


def private_dir(path: Path, *, create: bool = False) -> Path:
    path = path.absolute()
    require(not path.is_symlink(), "DIRECTORY_SYMLINK")
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(path.is_dir(), "DIRECTORY_NOT_FOUND", str(path), 404)
    os.chmod(path, 0o700)
    return path


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def regular_open(path: Path):
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as exc:
        raise ProjectError("INPUT_UNAVAILABLE", "The selected regular file cannot be opened.", 404) from exc
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ProjectError("REGULAR_FILE_REQUIRED")
    return os.fdopen(fd, "rb")


def create_file(path: Path, data: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    fsync_dir(path.parent)


DDL = """
CREATE TABLE IF NOT EXISTS artifacts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, version INTEGER, bytes INTEGER NOT NULL,
 name TEXT NOT NULL, imported_at TEXT NOT NULL, metadata TEXT NOT NULL,
 supported INTEGER NOT NULL, node_count INTEGER NOT NULL, warnings TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS nodes (
 artifact TEXT NOT NULL, uid TEXT NOT NULL, section TEXT NOT NULL, name TEXT NOT NULL,
 type TEXT NOT NULL, package TEXT NOT NULL, path TEXT NOT NULL, description TEXT NOT NULL,
 database_name TEXT, schema_name TEXT, relation_name TEXT, definition_sha TEXT NOT NULL,
 compiled_sha TEXT NOT NULL, content_sha TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY (artifact,uid), FOREIGN KEY(artifact) REFERENCES artifacts(id));
CREATE INDEX IF NOT EXISTS nodes_kind ON nodes(artifact,type,name,uid);
CREATE TABLE IF NOT EXISTS edges (
 artifact TEXT NOT NULL, parent TEXT NOT NULL, child TEXT NOT NULL, origin TEXT NOT NULL,
 PRIMARY KEY(artifact,parent,child,origin), FOREIGN KEY(artifact) REFERENCES artifacts(id));
CREATE INDEX IF NOT EXISTS edges_child ON edges(artifact,child);
CREATE TABLE IF NOT EXISTS outcomes (
 artifact TEXT NOT NULL, ordinal INTEGER NOT NULL, uid TEXT NOT NULL, status TEXT,
 execution_time TEXT, body TEXT NOT NULL,
 PRIMARY KEY(artifact,ordinal), FOREIGN KEY(artifact) REFERENCES artifacts(id));
CREATE INDEX IF NOT EXISTS outcomes_uid ON outcomes(artifact,uid);
CREATE TABLE IF NOT EXISTS editions (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, manifest TEXT NOT NULL,
 catalog TEXT, runs TEXT NOT NULL, freshness TEXT NOT NULL, context TEXT NOT NULL,
 FOREIGN KEY(manifest) REFERENCES artifacts(id));
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, revision INTEGER NOT NULL, previous TEXT,
 created_at TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(name,revision));
CREATE TABLE IF NOT EXISTS review_heads (name TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES reviews(id));
CREATE TABLE IF NOT EXISTS results (
 id TEXT PRIMARY KEY, edition TEXT NOT NULL REFERENCES editions(id), uid TEXT NOT NULL,
 created_at TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, action TEXT NOT NULL, input_sha TEXT NOT NULL, result TEXT NOT NULL,
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS object_checks (
 id TEXT PRIMARY KEY, device TEXT NOT NULL, inode TEXT NOT NULL, bytes INTEGER NOT NULL,
 mtime TEXT NOT NULL, ctime TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, reference TEXT NOT NULL,
 at TEXT NOT NULL);
PRAGMA user_version=1;
"""


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


class Store:
    def __init__(self, root: str | Path, create: bool = False, title: str = "dbt Project"):
        self.root = Path(root).absolute()
        if create:
            require(not self.root.exists(), "WORKSPACE_EXISTS", "Choose a new workspace directory.", 409)
            self.root.mkdir(mode=0o700, parents=True)
            create_file(self.root / "workspace.json", json_bytes({"schema": FORMAT,
                        "id": str(uuid.uuid4()), "title": text(title, "title"), "created_at": stamp()}))
        private_dir(self.root)
        with regular_open(self.root / "workspace.json") as src:
            self.info = json.load(src)
        require(self.info.get("schema") == FORMAT, "WORKSPACE_SCHEMA_UNSUPPORTED")
        self.objects = private_dir(self.root / "objects", create=True)
        self.staging = private_dir(self.root / "staging", create=True)
        self.database = self.root / "project.sqlite"
        require(not self.database.is_symlink(), "DATABASE_SYMLINK")
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            require(version in (0, 1), "WORKSPACE_VERSION_UNSUPPORTED")
            db.executescript(DDL)
        os.chmod(self.database, 0o600)

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database, timeout=30, factory=ClosingConnection)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    @contextlib.contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def object_path(self, digest: str) -> Path:
        return self.objects / hash_id(digest)

    def verify_object(self, digest: str, expected_bytes: int | None = None) -> dict:
        # Cache only local immutable-file observations. This keeps chunk receiving
        # linear in payload size across short-lived CLI processes. ctime, mtime,
        # device, inode and length all invalidate the derived check; these cache
        # rows are not portable records and are rebuilt on the receiving host.
        def fingerprint(value):
            return (str(value.st_dev), str(value.st_ino), value.st_size,
                    str(value.st_mtime_ns), str(value.st_ctime_ns))
        with regular_open(self.object_path(digest)) as src:
            before = os.fstat(src.fileno())
            key = fingerprint(before)
            require(expected_bytes is None or before.st_size == expected_bytes,
                    "OBJECT_CHANGED", status=409)
            with self.connect() as db:
                cached = db.execute("SELECT device,inode,bytes,mtime,ctime FROM object_checks WHERE id=?", (digest,)).fetchone()
            if cached is not None and tuple(cached) == key:
                return {"sha256": digest, "bytes": before.st_size}
            h, total = hashlib.sha256(), 0
            for block in iter(lambda: src.read(1024 * 1024), b""):
                total += len(block)
                h.update(block)
            require(fingerprint(os.fstat(src.fileno())) == key and h.hexdigest() == digest and total == before.st_size,
                    "OBJECT_CHANGED", "Retained content no longer matches its identity.", 409)
        with self.transaction() as db:
            db.execute("INSERT INTO object_checks VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET device=excluded.device,inode=excluded.inode,bytes=excluded.bytes,mtime=excluded.mtime,ctime=excluded.ctime", (digest, *key))
        return {"sha256": digest, "bytes": total}

    def put_file(self, path: str | Path, expected_sha: str | None = None,
                 cancel=None) -> dict:
        path = Path(path)
        h, total = hashlib.sha256(), 0
        fd, temporary = tempfile.mkstemp(prefix="input-", dir=self.staging)
        try:
            with os.fdopen(fd, "wb") as dst, regular_open(path) as src:
                before = os.fstat(src.fileno())
                for block in iter(lambda: src.read(1024 * 1024), b""):
                    if cancel and cancel.is_set():
                        raise ProjectError("CANCELLED", status=409)
                    dst.write(block)
                    total += len(block)
                    h.update(block)
                after = os.fstat(src.fileno())
                require((before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                        (after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                        and total == before.st_size, "INPUT_CHANGED_DURING_READ", status=409)
                dst.flush()
                os.fsync(dst.fileno())
            digest = h.hexdigest()
            require(expected_sha is None or digest == hash_id(expected_sha), "INPUT_DIGEST_MISMATCH", status=409)
            dest = self.object_path(digest)
            try:
                os.link(temporary, dest)
                fsync_dir(self.objects)
            except FileExistsError:
                self.verify_object(digest, total)
            return {"sha256": digest, "bytes": total, "name": path.name}
        finally:
            Path(temporary).unlink(missing_ok=True)

    def put_bytes(self, data: bytes, name: str = "input.json") -> dict:
        fd, temporary = tempfile.mkstemp(prefix="body-", dir=self.staging)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(data)
            result = self.put_file(temporary)
            result["name"] = name
            return result
        finally:
            Path(temporary).unlink(missing_ok=True)

    @staticmethod
    def replay(db: sqlite3.Connection, request: str, action: str, payload: Any):
        text(request, "request_id", 160)
        old = db.execute("SELECT * FROM requests WHERE id=?", (request,)).fetchone()
        if old:
            require(old["action"] == action and old["input_sha"] == identity(payload),
                    "REQUEST_ID_REUSED", "This request ID already belongs to different input.", 409)
            return json.loads(old["result"])
        return None

    @staticmethod
    def finish(db: sqlite3.Connection, request: str, action: str, payload: Any, result: dict):
        db.execute("INSERT INTO requests VALUES(?,?,?,?,?)", (request, action, identity(payload),
                   json_bytes(result).decode(), stamp()))
        db.execute("INSERT INTO audit(action,reference,at) VALUES(?,?,?)", (action, request, stamp()))
        return result

    def status(self) -> dict:
        with self.connect() as db:
            counts = {t: db.execute("SELECT COUNT(*) FROM " + t).fetchone()[0]
                      for t in ("artifacts", "editions", "reviews", "results")}
            recent = [dict(r) for r in db.execute("SELECT * FROM audit ORDER BY seq DESC LIMIT 20")]
        return {**self.info, "counts": counts, "recent": recent}


def rename_directory_new(source: Path, destination: Path) -> None:
    """Publish a complete directory without ever replacing a concurrent target."""
    import sys
    if sys.platform.startswith("linux"):
        import ctypes
        libc = ctypes.CDLL(None, use_errno=True)
        rename = getattr(libc, "renameat2", None)
        require(rename is not None, "ATOMIC_DIRECTORY_PUBLICATION_UNAVAILABLE")
        rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        rename.restype = ctypes.c_int
        if rename(-100, os.fsencode(source), -100, os.fsencode(destination), 1) != 0:
            error = ctypes.get_errno()
            import errno
            if error in (errno.EEXIST, errno.ENOTEMPTY):
                raise ProjectError("DESTINATION_EXISTS", status=409)
            raise OSError(error, os.strerror(error))
    elif os.name == "nt":
        # Windows rename rejects an existing directory, unlike POSIX rename.
        os.rename(source, destination)
    else:
        raise ProjectError("ATOMIC_DIRECTORY_PUBLICATION_UNAVAILABLE", "Receiving currently requires Linux renameat2 or Windows no-replace rename.")
