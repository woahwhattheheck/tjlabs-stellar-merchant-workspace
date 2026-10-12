"""Saved, disk-backed CSV blending. Python standard library; SQLite >= 3.39.

Source tables and completed editions are immutable. All mutations use the same
OS-released workspace lock; metadata publication follows durable file creation.
No arbitrary SQL, implicit coercion, network acquisition, or payment code.
"""
from __future__ import annotations
import base64
import contextlib
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile
import time
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Iterator

SCHEMA = "stellar-forge.data-blends.v1"
NAME = re.compile(r"[a-z][a-z0-9_]{0,47}\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")
MAX_COLUMNS = 128
MAX_CELL = 2 * 1024 * 1024
csv.field_size_limit(MAX_CELL)

class BlendError(ValueError):
    def __init__(self, message: str, code: str = "BLEND_INPUT", status: int = 422):
        super().__init__(message)
        self.code, self.status = code, status

def require(condition: Any, message: str, code: str = "BLEND_INPUT", status: int = 422) -> None:
    if not condition:
        raise BlendError(message, code, status)

def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def row_batches(cursor, maximum: int = 1000):
    """Bound the retained batch by actual Python value size, not row count alone."""
    batch, size = [], 0
    for row in cursor:
        added = 64 + sum(sys.getsizeof(value) for value in row)
        if batch and (len(batch) >= maximum or size + added > 8 * 1024 * 1024):
            yield batch
            batch, size = [], 0
        batch.append(row); size += added
    if batch:
        yield batch

def complete_row_page(records):
    """Return complete rows within the control page; never shorten a cell."""
    result, size = [], 0
    for record in records:
        added = len(canonical(record).encode("utf-8"))
        if size + added > 8 * 1024 * 1024:
            require(result, "This record exceeds the 8 MiB preview page. Read its complete CSV or SQLite export instead.", "BLEND_PREVIEW_SIZE", 413)
            break
        result.append(record); size += added
    return result

def uid(value: str | None = None) -> str:
    if value is None:
        return str(uuid.uuid4())
    try:
        parsed = str(uuid.UUID(value))
    except (ValueError, AttributeError):
        raise BlendError("Use a UUID operation or record identifier.") from None
    require(parsed == value, "Use a canonical lowercase UUID.")
    return value

def ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'

def durable_json(path: Path, value: Any) -> None:
    with path.open("x", encoding="utf-8") as f:
        os.chmod(path, 0o600)
        f.write(canonical(value) + "\n")
        f.flush()
        os.fsync(f.fileno())

def sync_directory(path: Path) -> None:
    if os.name != "nt":
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

@contextlib.contextmanager
def private_lock(root: Path) -> Iterator[None]:
    path = root / ".writer.lock"
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "r+b") as f:
        if os.name == "nt":
            import msvcrt
            if not f.read(1):
                f.write(b"0"); f.flush()
            f.seek(0)
            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                raise BlendError("Another operation is writing this workspace. Retry it with the same operation ID.", "BLEND_BUSY", 409) from None
            try:
                yield
            finally:
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise BlendError("Another operation is writing this workspace. Retry it with the same operation ID.", "BLEND_BUSY", 409) from None
            try:
                yield
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)

class Workspace:
    def __init__(self, directory: str | Path):
        require(sqlite3.sqlite_version_info >= (3, 39), "SQLite 3.39+ is required for full outer joins.")
        supplied = Path(directory).absolute()
        require(not supplied.is_symlink(), "Workspace cannot be a symbolic link.")
        self.root = supplied.resolve()
        require(self.root.is_dir() and (self.root / "workspace.sqlite").is_file(), "Initialize or receive the workspace first.")
        require(not (self.root / "workspace.sqlite").is_symlink(), "Workspace database cannot be a symbolic link.")
        if os.name != "nt":
            require(self.root.stat().st_mode & 0o077 == 0, "Private workspace needs mode 0700.")
        with self.db() as db:
            row = db.execute("SELECT value FROM meta WHERE key='identity'").fetchone()
            require(row is not None, "Missing workspace identity.")
            self.identity = json.loads(row[0])
            require(self.identity["schema"] == SCHEMA, "Unsupported workspace format.")

    @staticmethod
    def create(directory: str | Path, label: str) -> "Workspace":
        require(sqlite3.sqlite_version_info >= (3, 39), "SQLite 3.39+ is required for full outer joins.")
        require(isinstance(label, str) and 0 < len(label.strip()) <= 160, "Name the workspace (1–160 characters).")
        root = Path(directory).absolute()
        root.mkdir(mode=0o700, parents=False, exist_ok=False)
        try:
            for folder in ["originals", "editions", "exports", "staging"]:
                (root / folder).mkdir(mode=0o700)
            db = sqlite3.connect(root / "workspace.sqlite")
            try:
                os.chmod(root / "workspace.sqlite", 0o600)
                db.executescript('''
                    PRAGMA journal_mode=WAL;
                    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                    CREATE TABLE sources(id TEXT PRIMARY KEY,body TEXT NOT NULL);
                    CREATE TABLE recipes(id TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,version));
                    CREATE TABLE editions(id TEXT PRIMARY KEY,body TEXT NOT NULL);
                    CREATE TABLE reviews(edition TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(edition,revision));
                    CREATE TABLE requests(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,result TEXT,action TEXT NOT NULL,input TEXT NOT NULL,created TEXT NOT NULL);
                ''')
                db.execute("INSERT INTO meta VALUES('identity',?)", (canonical({"schema": SCHEMA, "id": uid(), "label": label.strip(), "created": now()}),))
                db.commit()
            finally:
                db.close()
        except BaseException:
            shutil.rmtree(root)
            raise
        return Workspace(root)

    @contextlib.contextmanager
    def db(self, readonly: bool = False) -> Iterator[sqlite3.Connection]:
        uri = (self.root / "workspace.sqlite").as_uri() + ("?mode=ro" if readonly else "?mode=rw")
        db = sqlite3.connect(uri, uri=True, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA cache_size=-16384")
        db.execute("PRAGMA temp_store=FILE")
        try:
            yield db
        finally:
            db.close()

    def binding(self) -> dict:
        value = {"schema": SCHEMA, "workspaceId": self.identity["id"], "directory": str(self.root)}
        return {**value, "sha256": hashlib.sha256(canonical(value).encode()).hexdigest()}

    def _record(self, db: sqlite3.Connection, table: str, record: str) -> dict:
        require(table in {"sources", "editions"}, "Invalid record type.")
        row = db.execute(f"SELECT body FROM {table} WHERE id=?", (uid(record),)).fetchone()
        require(row is not None, "The selected record no longer exists.", "BLEND_NOT_FOUND", 404)
        return json.loads(row[0])

    def _request(self, db: sqlite3.Connection, request: str, action: str, body: Any) -> dict | None:
        uid(request)
        fingerprint = hashlib.sha256(canonical([action, body]).encode()).hexdigest()
        row = db.execute("SELECT * FROM requests WHERE id=?", (request,)).fetchone()
        if row:
            require(row["fingerprint"] == fingerprint, "This operation ID belongs to different input. Use a new ID for a new action.", "BLEND_REQUEST_CONFLICT", 409)
            return json.loads(row["result"]) if row["result"] else None
        db.execute("INSERT INTO requests VALUES(?,?,NULL,?,?,?)", (request, fingerprint, action, canonical(body), now()))
        db.commit()
        return None

    def _finish(self, db: sqlite3.Connection, request: str, result: Any) -> Any:
        db.execute("UPDATE requests SET result=? WHERE id=?", (canonical(result), request))
        db.commit()
        return result

    def state(self, offset: int = 0, limit: int = 100) -> dict:
        require(type(offset) is int and offset >= 0 and type(limit) is int and 1 <= limit <= 500, "Choose a valid page (1–500 records).")
        out = {"workspace": self.identity, "sources": [], "recipes": [], "editions": [], "pagination": {}}
        with self.db(True) as db:
            queries = {
                "sources": "SELECT body FROM sources ORDER BY rowid",
                "recipes": "SELECT r.body FROM recipes r WHERE version=(SELECT MAX(version) FROM recipes x WHERE x.id=r.id) ORDER BY rowid",
                "editions": "SELECT body FROM editions ORDER BY rowid DESC"
            }
            for key, sql in queries.items():
                total = db.execute("SELECT COUNT(*) FROM (" + sql + ")").fetchone()[0]
                out[key] = [json.loads(row[0]) for row in db.execute(sql + " LIMIT ? OFFSET ?", (limit, offset))]
                out["pagination"][key] = {"total": total, "offset": offset, "nextOffset": offset + limit if offset + limit < total else None}
            out["pending"] = [{"id": r["id"], "action": r["action"], "created": r["created"]} for r in db.execute("SELECT id,action,created FROM requests WHERE result IS NULL ORDER BY created DESC LIMIT 50")]
            for edition in out["editions"]:
                edition["review"] = self._review(db, edition["id"])
        return out

    def import_csv(self, file: str, label: str, request: str, delimiter: str = ",", null_token: str | None = None,
                   expected_sha256: str | None = None, source_reference: str = "") -> dict:
        require(isinstance(label, str) and 0 < len(label.strip()) <= 160, "Name this input (1–160 characters).")
        require(isinstance(delimiter, str) and delimiter in [",", ";", "\t", "|"], "Choose comma, semicolon, tab or pipe.")
        require(null_token is None or isinstance(null_token, str) and 1 <= len(null_token) <= 80, "Null marker must be a nonempty string, or omitted.")
        require(isinstance(source_reference, str) and len(source_reference) <= 2000, "Source reference is too long.")
        path = Path(file)
        require(path.is_file() and not path.is_symlink(), "Choose an existing regular CSV file.")
        with private_lock(self.root), self.db() as db:
            temp = self.root / "staging" / (uid(request) + ".input")
            h = hashlib.sha256()
            with path.open("rb") as reader, temp.open("wb") as writer:
                os.chmod(temp, 0o600)
                for block in iter(lambda: reader.read(1024 * 1024), b""):
                    h.update(block); writer.write(block)
                writer.flush(); os.fsync(writer.fileno())
            sha = h.hexdigest()
            try:
                require(expected_sha256 is None or expected_sha256 == sha, "The CSV changed from the selected source digest.", "BLEND_SOURCE_CHANGED", 409)
                original = self.root / "originals" / (sha + ".csv")
                if original.exists():
                    require(digest(original) == sha, "Retained original has changed.")
                else:
                    os.replace(temp, original); sync_directory(original.parent)
                old = self._request(db, request, "import", [sha, label, delimiter, null_token, source_reference])
                if old:
                    return old
                table = "s_" + request.replace("-", "")
                db.execute("BEGIN IMMEDIATE")
                with original.open("r", encoding="utf-8-sig", newline="") as f:
                    reader = csv.reader(f, delimiter=delimiter, strict=True)
                    headers = next(reader, None)
                    require(headers is not None and 1 <= len(headers) <= MAX_COLUMNS, "CSV must have 1–128 named columns.")
                    require(all(0 < len(v) <= 240 and "\0" not in v for v in headers), "CSV column names must be nonempty, at most 240 characters, and contain no null byte.")
                    require(len(set(headers)) == len(headers), "CSV has repeated column names. Rename them explicitly before importing.")
                    db.execute(f"CREATE TABLE {ident(table)}(_row INTEGER PRIMARY KEY," + ",".join(f'c{i} TEXT' for i in range(len(headers))) + ")")
                    insert = f"INSERT INTO {ident(table)} VALUES(" + ",".join("?" for _ in range(len(headers) + 1)) + ")"
                    batch, rows, batch_bytes = [], 0, 0
                    for values in reader:
                        rows += 1
                        require(len(values) == len(headers), f"CSV record {rows} has {len(values)} fields; expected {len(headers)}. Original bytes are retained.")
                        require(all("\0" not in v for v in values), f"CSV record {rows} contains a null byte.")
                        batch.append([rows, *[None if null_token is not None and v == null_token else v for v in values]])
                        batch_bytes += 64 + sum(sys.getsizeof(v) for v in values)
                        if len(batch) == 500 or batch_bytes >= 8 * 1024 * 1024:
                            db.executemany(insert, batch); batch.clear(); batch_bytes = 0
                    if batch:
                        db.executemany(insert, batch)
                result = {"id": request, "label": label.strip(), "headers": headers, "rows": rows,
                          "sha256": sha, "bytes": original.stat().st_size, "delimiter": delimiter,
                          "nullToken": null_token, "reference": source_reference, "created": now(), "table": table}
                db.execute("INSERT INTO sources VALUES(?,?)", (request, canonical(result)))
                return self._finish(db, request, result)
            except BaseException:
                db.rollback()
                raise
            finally:
                temp.unlink(missing_ok=True)

    def source_rows(self, source: str, after: int = 0, limit: int = 100) -> dict:
        require(type(after) is int and after >= 0 and type(limit) is int and 1 <= limit <= 200, "Choose a row page of 1–200 rows.")
        with self.db(True) as db:
            item = self._record(db, "sources", source)
            cursor = db.execute(f"SELECT * FROM {ident(item['table'])} WHERE _row>? ORDER BY _row LIMIT ?", (after, limit))
            rows = complete_row_page({"row": r[0], "values": list(r)[1:]} for r in cursor)
            return {"source": source, "headers": item["headers"], "rows": rows,
                    "next": rows[-1]["row"] if rows and rows[-1]["row"] < item["rows"] else None, "total": item["rows"]}

    def _compile(self, db: sqlite3.Connection, spec: dict) -> tuple[str, list, list, dict]:
        require(isinstance(spec, dict), "Recipe must be an object.")
        require(isinstance(spec.get("name"), str) and 0 < len(spec["name"].strip()) <= 160, "Name the recipe.")
        require(isinstance(spec.get("base"), dict) and isinstance(spec.get("joins", []), list) and len(spec.get("joins", [])) <= 7, "Choose a base and up to seven joins.")
        aliases: dict[str, dict] = {}
        stages, indexes = [], []
        def source(entry: dict) -> tuple[str, dict]:
            require(isinstance(entry, dict) and isinstance(entry.get("as"), str) and NAME.fullmatch(entry["as"]) and entry["as"] != "row_number" and entry["as"] not in aliases, "Each table needs a distinct lowercase alias (letters, digits, underscores); row_number is reserved.")
            item = self._record(db, "sources", entry.get("source", ""))
            alias = entry["as"]; aliases[alias] = item
            return alias, item
        def column(alias: str, header: str) -> str:
            require(alias in aliases and header in aliases[alias]["headers"], "Select an existing source column.")
            return ident(alias) + "." + ident("c" + str(aliases[alias]["headers"].index(header)))
        base, item = source(spec["base"])
        from_sql = ident(item["table"]) + " AS " + ident(base)
        for stage in spec.get("joins", []):
            prior = set(aliases)
            alias, item = source(stage)
            kind = stage.get("kind")
            require(kind in ["inner", "left", "full"], "Join kind must be inner, left or full.")
            require(stage.get("emptyKeys", "unmatched") in ["unmatched", "match"], "Choose how empty-string keys match.")
            keys = stage.get("on")
            require(isinstance(keys, list) and 1 <= len(keys) <= 16, "Each join needs 1–16 key pairs.")
            conditions, right_columns = [], []
            for key in keys:
                require(isinstance(key, dict) and key.get("leftAlias") in prior, "A join key must refer to a previously selected table.")
                left = column(key["leftAlias"], key.get("leftColumn"))
                right = column(alias, key.get("rightColumn"))
                conditions.append(left + "=" + right + " COLLATE BINARY")
                if stage.get("emptyKeys", "unmatched") == "unmatched":
                    conditions.append(left + "<>'' AND " + right + "<>''")
                right_columns.append("c" + str(item["headers"].index(key["rightColumn"])))
                left_source = aliases[key["leftAlias"]]
                indexes.append((left_source["table"], ["c" + str(left_source["headers"].index(key["leftColumn"]))]))
            require(stage.get("cardinality", "many-to-many") in ["many-to-one", "many-to-many"], "Choose many-to-one or many-to-many cardinality.")
            indexes.append((item["table"], right_columns))
            stages.append({"alias": alias, "source": item, "keys": right_columns, "kind": kind,
                           "cardinality": stage.get("cardinality", "many-to-many"), "emptyKeys": stage.get("emptyKeys", "unmatched")})
            from_sql += " " + {"inner": "INNER", "left": "LEFT", "full": "FULL OUTER"}[kind] + " JOIN " + ident(item["table"]) + " AS " + ident(alias) + " ON " + " AND ".join("(" + c + ")" for c in conditions)
        outputs = spec.get("columns")
        require(isinstance(outputs, list) and 1 <= len(outputs) <= MAX_COLUMNS, "Select 1–128 output columns.")
        names, projections = set(), []
        for out in outputs:
            require(isinstance(out, dict) and isinstance(out.get("name"), str) and NAME.fullmatch(out["name"]), "Output names use lowercase letters, digits and underscores; begin with a letter.")
            require(out["name"] not in names and out["name"] not in {"rowid", "oid", "_rowid_"}, "Output column names must be unique and cannot shadow SQLite row identifiers.")
            names.add(out["name"])
            projections.append(column(out.get("source"), out.get("column")))
        origins = [ident(a) + "._row" for a in aliases]
        sql = "SELECT " + ",".join(projections + origins) + " FROM " + from_sql + " ORDER BY " + ",".join(origins)
        return sql, stages, indexes, aliases

    def save_recipe(self, spec: dict, request: str, recipe: str | None = None, expected_version: int = 0) -> dict:
        recipe = uid(recipe) if recipe else uid(request)
        require(type(expected_version) is int and expected_version >= 0, "Expected version must be a nonnegative integer.")
        with private_lock(self.root), self.db() as db:
            old = self._request(db, request, "recipe", [recipe, expected_version, spec])
            if old:
                return old
            self._compile(db, spec)
            version = db.execute("SELECT COALESCE(MAX(version),0) FROM recipes WHERE id=?", (recipe,)).fetchone()[0]
            require(version == expected_version, "Recipe changed in another editor. Reload before saving.", "BLEND_VERSION_CONFLICT", 409)
            result = {"id": recipe, "version": version + 1, "spec": spec, "created": now()}
            db.execute("INSERT INTO recipes VALUES(?,?,?)", (recipe, version + 1, canonical(result)))
            return self._finish(db, request, result)

    def recipe(self, recipe: str, version: int | None = None) -> dict:
        with self.db(True) as db:
            if version is None:
                row = db.execute("SELECT body FROM recipes WHERE id=? ORDER BY version DESC LIMIT 1", (uid(recipe),)).fetchone()
            else:
                require(type(version) is int and version > 0, "Select a positive recipe version.")
                row = db.execute("SELECT body FROM recipes WHERE id=? AND version=?", (uid(recipe), version)).fetchone()
            require(row, "Recipe version was not found.", "BLEND_NOT_FOUND", 404)
            return json.loads(row[0])

    def run(self, recipe: str, version: int, request: str) -> dict:
        selected = self.recipe(recipe, version)
        with private_lock(self.root), self.db() as db:
            old = self._request(db, request, "run", selected)
            if old:
                return old
            final = self.root / "editions" / uid(request)
            partial = self.root / "staging" / (request + ".run")
            if final.exists():
                result = json.loads((final / "edition.json").read_text("utf-8"))
                require(result["recipe"] == selected and result["id"] == request and digest(final / "data.sqlite") == result["sqliteSha256"], "Completed edition differs from the original operation.")
                db.execute("INSERT OR IGNORE INTO editions VALUES(?,?)", (request, canonical(result)))
                return self._finish(db, request, result)
            if partial.exists():
                shutil.rmtree(partial)
            partial.mkdir(mode=0o700)
            sql, stages, indexes, aliases = self._compile(db, selected["spec"])
            started = time.monotonic()
            target = partial / "data.sqlite"
            output = sqlite3.connect(target)
            os.chmod(target, 0o600)
            try:
                # Persistent indexes can be reused by later editions. All generated
                # names derive solely from retained table and column identities.
                for table, columns in indexes:
                    name = "idx_" + hashlib.sha256(canonical([table, columns]).encode()).hexdigest()[:24]
                    db.execute(f"CREATE INDEX IF NOT EXISTS {ident(name)} ON {ident(table)}(" + ",".join(map(ident, columns)) + ")")
                db.commit()
                diagnostics = []
                for stage in stages:
                    columns = ",".join(map(ident, stage["keys"]))
                    predicates = [ident(c) + " IS NOT NULL" for c in stage["keys"]]
                    if stage["emptyKeys"] == "unmatched":
                        predicates += [ident(c) + "<>''" for c in stage["keys"]]
                    duplicates = db.execute("SELECT COUNT(*),COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM " + ident(stage["source"]["table"]) + " WHERE " + " AND ".join(predicates) + " GROUP BY " + columns + " HAVING COUNT(*)>1)").fetchone()
                    diagnostic = {"alias": stage["alias"], "kind": stage["kind"], "duplicateKeyGroups": duplicates[0], "extraMatchingRows": duplicates[1]}
                    diagnostics.append(diagnostic)
                    require(stage["cardinality"] != "many-to-one" or duplicates[0] == 0,
                            f"{stage['alias']} has {duplicates[0]} duplicate key groups. Keep all matches by choosing many-to-many, or select a unique-key source.", "BLEND_CARDINALITY")
                names = [c["name"] for c in selected["spec"]["columns"]]
                output.execute("PRAGMA cache_size=-16384")
                output.execute("PRAGMA temp_store=FILE")
                output.execute("CREATE TABLE data(" + ",".join(ident(n) + " TEXT" for n in names) + ")")
                output.execute("CREATE TABLE origins(row_number INTEGER PRIMARY KEY," + ",".join(ident(a) + " INTEGER" for a in aliases) + ")")
                output.execute("CREATE TABLE edition_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
                data_insert = "INSERT INTO data VALUES(" + ",".join("?" for _ in names) + ")"
                origin_insert = "INSERT INTO origins VALUES(" + ",".join("?" for _ in range(len(aliases) + 1)) + ")"
                cursor = db.execute(sql)
                rows = 0
                unmatched = {a: 0 for a in aliases}
                for batch in row_batches(cursor):
                    output.executemany(data_insert, (tuple(r[:len(names)]) for r in batch))
                    origins = []
                    for row in batch:
                        rows += 1
                        values = list(row)[len(names):]
                        for alias, value in zip(aliases, values):
                            if value is None:
                                unmatched[alias] += 1
                        origins.append([rows, *values])
                    output.executemany(origin_insert, origins)
                metadata = {"id": request, "recipe": selected, "sources": {a: {k: v for k, v in s.items() if k != "table"} for a, s in aliases.items()},
                            "sourceOrder": list(aliases), "rows": rows, "columns": names, "diagnostics": diagnostics, "missingSourceRows": unmatched,
                            "created": now(), "elapsedSeconds": round(time.monotonic() - started, 3), "schema": SCHEMA}
                output.execute("INSERT INTO edition_metadata VALUES('edition',?)", (canonical(metadata),))
                output.commit(); output.close(); output = None
                with target.open("rb") as f:
                    os.fsync(f.fileno())
                metadata["sqliteSha256"] = digest(target)
                durable_json(partial / "edition.json", metadata)
                sync_directory(partial)
                os.rename(partial, final); sync_directory(final.parent)
                db.execute("INSERT INTO editions VALUES(?,?)", (request, canonical(metadata)))
                return self._finish(db, request, metadata)
            except BaseException:
                db.rollback()
                raise
            finally:
                if output is not None:
                    output.close()
                # A failed/interrupted request retains its identity. Calling run with
                # that ID restarts its unpublished stage from the same immutable input.

    def edition(self, edition: str) -> dict:
        with self.db(True) as db:
            result = self._record(db, "editions", edition)
            return {**result, "review": self._review(db, edition)}

    def edition_path(self, edition: str) -> Path:
        self.edition(edition)
        path = self.root / "editions" / uid(edition) / "data.sqlite"
        require(path.is_file() and not path.is_symlink(), "Edition file is missing.")
        return path

    def rows(self, edition: str, after: int = 0, limit: int = 100) -> dict:
        require(type(after) is int and after >= 0 and type(limit) is int and 1 <= limit <= 200, "Choose a row page of 1–200 rows.")
        meta = self.edition(edition)
        db = sqlite3.connect(self.edition_path(edition).as_uri() + "?mode=ro", uri=True)
        try:
            cursor = db.execute("SELECT rowid,* FROM data WHERE rowid>? ORDER BY rowid LIMIT ?", (after, limit))
            origin_names = meta["sourceOrder"]
            origins = dict((r[0], dict(zip(origin_names, r[1:]))) for r in db.execute("SELECT * FROM origins WHERE row_number>? ORDER BY row_number LIMIT ?", (after, limit)))
            rows = complete_row_page({"row": r[0], "values": list(r[1:]), "origins": origins[r[0]]} for r in cursor)
            return {"edition": edition, "columns": meta["columns"], "rows": rows, "total": meta["rows"],
                    "next": rows[-1]["row"] if rows and rows[-1]["row"] < meta["rows"] else None}
        finally:
            db.close()

    def _review(self, db: sqlite3.Connection, edition: str) -> dict:
        row = db.execute("SELECT body FROM reviews WHERE edition=? ORDER BY revision DESC LIMIT 1", (edition,)).fetchone()
        return json.loads(row[0]) if row else {"revision": 0, "decision": "unreviewed", "note": "", "reviewer": ""}

    def review(self, edition: str, decision: str, note: str, reviewer: str, expected_revision: int, request: str) -> dict:
        require(decision in ["accepted", "needs-work", "archived"], "Select accepted, needs-work or archived.")
        require(isinstance(note, str) and len(note) <= 10000 and isinstance(reviewer, str) and 0 < len(reviewer.strip()) <= 160, "Supply a reviewer and a note of at most 10,000 characters.")
        require(type(expected_revision) is int and expected_revision >= 0, "Review revision must be nonnegative.")
        with private_lock(self.root), self.db() as db:
            old = self._request(db, request, "review", [edition, decision, note, reviewer, expected_revision])
            if old:
                return old
            self._record(db, "editions", edition)
            current = self._review(db, edition)
            require(current["revision"] == expected_revision, "Review changed. Reload its latest edition before saving.", "BLEND_VERSION_CONFLICT", 409)
            result = {"revision": current["revision"] + 1, "decision": decision, "note": note, "reviewer": reviewer.strip(), "created": now()}
            db.execute("INSERT INTO reviews VALUES(?,?,?)", (edition, result["revision"], canonical(result)))
            return self._finish(db, request, result)

    def _export_file(self, db: sqlite3.Connection, path: Path, kind: str, request: str) -> dict:
        with path.open("rb") as retained:
            os.fsync(retained.fileno())
        result = {"id": request, "kind": kind, "filename": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}
        return self._finish(db, request, result)

    def export(self, edition: str, kind: str, request: str, null_token: str = "\\N") -> dict:
        require(kind in ["csv", "sqlite", "customer"], "Choose csv, sqlite or customer.")
        require(isinstance(null_token, str) and 1 <= len(null_token) <= 80 and "\0" not in null_token, "Choose a nonempty CSV null marker.")
        with private_lock(self.root), self.db() as db:
            old = self._request(db, request, "export", [edition, kind, null_token])
            if old:
                require((self.root / "exports" / old["filename"]).is_file(), "Export is missing; create a new export operation.")
                return old
            meta = self.edition(edition)
            source = self.edition_path(edition)
            temp = self.root / "staging" / (uid(request) + ".export")
            if temp.exists():
                shutil.rmtree(temp)
            temp.mkdir(mode=0o700)
            dbin = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
            try:
                schema = {"schema": "stellar-forge.data-blend-delivery.v1", "name": meta["recipe"]["spec"]["name"], "rows": meta["rows"],
                          "columns": [{"name": n, "type": "string", "nullable": True} for n in meta["columns"]],
                          "csv": {"encoding": "UTF-8", "delimiter": ",", "nullToken": null_token, "emptyString": "empty field", "header": True},
                          "sqlite": {"table": "data", "valueType": "TEXT", "null": "SQL NULL"}}
                if kind in ["csv", "customer"]:
                    # Refuse ambiguous loss of literal values equal to the chosen null
                    # marker, rather than silently equating text with missing values.
                    conflict = dbin.execute("SELECT 1 FROM data WHERE " + " OR ".join(ident(n) + "=?" for n in meta["columns"]) + " LIMIT 1", [null_token] * len(meta["columns"])).fetchone()
                    require(not conflict, "A literal value equals the CSV null marker. Choose a different marker or export SQLite.", "BLEND_NULL_MARKER_COLLISION")
                    with (temp / "data.csv").open("w", encoding="utf-8", newline="") as f:
                        writer = csv.writer(f, lineterminator="\r\n")
                        writer.writerow(meta["columns"])
                        for row in dbin.execute("SELECT * FROM data ORDER BY rowid"):
                            writer.writerow([null_token if v is None else v for v in row])
                        f.flush(); os.fsync(f.fileno())
                if kind in ["sqlite", "customer"]:
                    out = sqlite3.connect(temp / "data.sqlite")
                    try:
                        out.execute("CREATE TABLE data(" + ",".join(ident(n) + " TEXT" for n in meta["columns"]) + ")")
                        insert = "INSERT INTO data VALUES(" + ",".join("?" for _ in meta["columns"]) + ")"
                        cursor = dbin.execute("SELECT * FROM data ORDER BY rowid")
                        for batch in row_batches(cursor):
                            out.executemany(insert, batch)
                        out.commit()
                    finally:
                        out.close()
                if kind == "customer":
                    durable_json(temp / "schema.json", schema)
                    (temp / "READING.md").write_text(
                        "# Reading the dataset\n\nThis package contains the selected output columns as UTF-8 CSV and SQLite. "
                        "The SQLite table is `data`; its columns preserve text exactly, and missing join values use SQL NULL. "
                        "`schema.json` specifies the CSV null marker. Empty fields are empty strings, not missing values. "
                        "No automatic trimming, case folding, numeric conversion or deduplication is applied.\n\n"
                        "Import CSV columns as text to preserve leading zeros and large identifiers. Use a data importer rather than "
                        "opening untrusted CSV directly in a spreadsheet: literal values may begin with spreadsheet formula characters. "
                        "The original values are intentionally not rewritten.\n\n"
                        "The package excludes original input files, row provenance, private notes, source locations and workspace credentials. "
                        "`manifest.json` gives the exact length and SHA-256 of each delivered file.\n", "utf-8")
                    durable_json(temp / "manifest.json", {"schema": "stellar-forge.data-blend-files.v1", "files": {p.name: {"bytes": p.stat().st_size, "sha256": digest(p)} for p in temp.iterdir()}})
                    candidate = temp / "customer.zip"
                    with zipfile.ZipFile(candidate, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
                        for p in sorted(temp.iterdir()):
                            if p != candidate:
                                z.write(p, p.name)
                else:
                    candidate = temp / ("data." + kind)
                final = self.root / "exports" / (request + {"customer": ".zip", "csv": ".csv", "sqlite": ".sqlite"}[kind])
                os.chmod(candidate, 0o600)
                # The original operation can recreate an unpublished export after a
                # crash; only this UUID's output is replaced, never another export.
                os.replace(candidate, final); sync_directory(final.parent)
                return self._export_file(db, final, kind, request)
            finally:
                dbin.close()
                shutil.rmtree(temp, ignore_errors=True)

    def backup(self, request: str) -> dict:
        with private_lock(self.root), self.db() as db:
            old = self._request(db, request, "backup", self.identity["id"])
            if old:
                require((self.root / "exports" / old["filename"]).is_file(), "Backup is missing. Use a new operation ID.")
                return old
            stage = self.root / "staging" / (uid(request) + ".backup")
            if stage.exists():
                shutil.rmtree(stage)
            stage.mkdir(mode=0o700)
            snap = sqlite3.connect(stage / "workspace.sqlite")
            try:
                db.backup(snap)
            finally:
                snap.close()
            candidate = stage / "workspace.zip"
            try:
                source_hashes = {json.loads(r[0])["sha256"] for r in db.execute("SELECT body FROM sources")}
                source_hashes.update(json.loads(r[0])[0] for r in db.execute("SELECT input FROM requests WHERE action='import'"))
                originals = []
                for sha in sorted(source_hashes):
                    require(HEX.fullmatch(sha), "Invalid retained original identity.")
                    path = self.root / "originals" / (sha + ".csv")
                    require(path.is_file() and not path.is_symlink() and digest(path) == sha, "A retained original changed or is missing.")
                    originals.append(path)
                editions = [self.root / "editions" / r[0] / leaf for r in db.execute("SELECT id FROM editions") for leaf in ["data.sqlite", "edition.json"]]
                files = [(stage / "workspace.sqlite", "workspace.sqlite")] + [(p, str(p.relative_to(self.root)).replace(os.sep, "/")) for p in dict.fromkeys(originals + editions)]
                manifest = {"schema": "stellar-forge.data-blend-backup.v1", "workspaceId": self.identity["id"],
                            "files": {name: {"bytes": p.stat().st_size, "sha256": digest(p)} for p, name in files}}
                with zipfile.ZipFile(candidate, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as z:
                    for p, name in files:
                        z.write(p, name)
                    z.writestr("backup.json", canonical(manifest))
                final = self.root / "exports" / (request + ".workspace.zip")
                os.chmod(candidate, 0o600); os.replace(candidate, final); sync_directory(final.parent)
                return self._export_file(db, final, "workspace", request)
            finally:
                shutil.rmtree(stage, ignore_errors=True)

    @staticmethod
    def receive(file: str, directory: str, expected_sha256: str) -> "Workspace":
        source, target = Path(file), Path(directory).absolute()
        require(HEX.fullmatch(expected_sha256 or "") and digest(source) == expected_sha256, "Backup file changed from its expected digest.", "BLEND_SOURCE_CHANGED", 409)
        require(not target.exists() and not target.is_symlink(), "Receive into a new directory.", "BLEND_DESTINATION_EXISTS", 409)
        stage = Path(tempfile.mkdtemp(prefix=".blend-receive-", dir=target.parent))
        os.chmod(stage, 0o700)
        try:
            with zipfile.ZipFile(source) as z:
                names = z.namelist()
                require(len(names) == len(set(names)) and "backup.json" in names, "Backup has duplicate or missing members.")
                require(z.getinfo("backup.json").file_size <= 16 * 1024 * 1024, "Backup index is too large.")
                manifest = json.loads(z.read("backup.json"))
                require(manifest.get("schema") == "stellar-forge.data-blend-backup.v1" and isinstance(manifest.get("files"), dict), "Unsupported private backup.")
                require(set(names) == set(manifest["files"]) | {"backup.json"}, "Backup inventory does not match its members.")
                for name, item in manifest["files"].items():
                    allowed = name == "workspace.sqlite" or re.fullmatch(r"originals/[a-f0-9]{64}\.csv", name) or re.fullmatch(r"editions/[a-f0-9-]{36}/(data\.sqlite|edition\.json)", name)
                    require(allowed and z.getinfo(name).file_size == item["bytes"], "Invalid backup member or length.")
                    require((z.getinfo(name).external_attr >> 16) & 0o170000 != 0o120000, "Backup contains a symbolic link.")
                    path = stage / name
                    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with z.open(name) as inp, path.open("xb") as out:
                        os.chmod(path, 0o600); shutil.copyfileobj(inp, out, 1024 * 1024)
                        out.flush(); os.fsync(out.fileno())
                    require(digest(path) == item["sha256"], "Backup member digest does not match.")
            for folder in ["originals", "editions", "exports", "staging"]:
                (stage / folder).mkdir(mode=0o700, exist_ok=True)
            received = Workspace(stage)
            require(received.identity["id"] == manifest["workspaceId"], "Backup workspace identity differs.")
            with received.db() as db:
                require(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "Backup metadata could not be reopened.")
                for row in db.execute("SELECT body FROM sources"):
                    record = json.loads(row[0])
                    require(digest(stage / "originals" / (record["sha256"] + ".csv")) == record["sha256"], "Original input changed.")
                    require(db.execute("SELECT COUNT(*) FROM " + ident(record["table"])).fetchone()[0] == record["rows"], "Retained source table has a different row count.")
                for row in db.execute("SELECT body FROM editions"):
                    record = json.loads(row[0])
                    require(digest(stage / "editions" / uid(record["id"]) / "data.sqlite") == record["sqliteSha256"], "Edition file differs from its metadata.")
                # Exports are regenerable and intentionally not recursively backed up.
                # Forget only export/backup receipts whose files were not transferred.
                db.execute("DELETE FROM requests WHERE action IN ('backup','export')")
                db.commit(); db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            # Reserve the destination exclusively. Publish the database last, so
            # readers cannot open the workspace until every retained member is in place.
            target.mkdir(mode=0o700, exist_ok=False)
            try:
                for member in sorted(stage.iterdir(), key=lambda p: p.name == "workspace.sqlite"):
                    if member.is_dir():
                        for folder in sorted((p for p in member.rglob("*") if p.is_dir()), reverse=True):
                            sync_directory(folder)
                        sync_directory(member)
                    os.rename(member, target / member.name)
                sync_directory(target); sync_directory(target.parent)
                result = Workspace(target)
            except BaseException:
                shutil.rmtree(target)
                raise
            return result
        finally:
            if stage.exists():
                shutil.rmtree(stage)

    def locate_export(self, request: str) -> Path:
        with self.db(True) as db:
            row = db.execute("SELECT result FROM requests WHERE id=?", (uid(request),)).fetchone()
            require(row and row[0], "Export not found.", "BLEND_NOT_FOUND", 404)
            result = json.loads(row[0])
            require(result.get("kind") in ["csv", "sqlite", "customer", "workspace"] and Path(result["filename"]).name == result["filename"], "Record is not an export.")
            path = self.root / "exports" / result["filename"]
            require(path.is_file() and not path.is_symlink() and path.stat().st_size == result["bytes"], "Export file changed or is missing.")
            return path

    def operation(self, request: str) -> dict:
        with self.db(True) as db:
            row = db.execute("SELECT * FROM requests WHERE id=?", (uid(request),)).fetchone()
            require(row, "Operation was not found.", "BLEND_NOT_FOUND", 404)
            return {"id": request, "action": row["action"], "input": json.loads(row["input"]), "created": row["created"],
                    "state": "complete" if row["result"] is not None else "pending", "result": json.loads(row["result"]) if row["result"] else None}

    def resume(self, request: str):
        operation = self.operation(request)
        if operation["state"] == "complete":
            return operation["result"]
        action, value = operation["action"], operation["input"]
        if action == "import":
            sha, label, delimiter, null_token, reference = value
            return self.import_csv(str(self.root / "originals" / (sha + ".csv")), label, request, delimiter, null_token, sha, reference)
        if action == "recipe":
            recipe, version, spec = value
            return self.save_recipe(spec, request, recipe, version)
        if action == "run":
            return self.run(value["id"], value["version"], request)
        if action == "review":
            edition, decision, note, reviewer, version = value
            return self.review(edition, decision, note, reviewer, version, request)
        if action == "export":
            edition, kind, marker = value
            return self.export(edition, kind, request, marker)
        if action == "backup":
            return self.backup(request)
        raise BlendError("Unsupported saved operation.")

    def dismiss(self, request: str) -> dict:
        with private_lock(self.root), self.db() as db:
            row = db.execute("SELECT result,action FROM requests WHERE id=?", (uid(request),)).fetchone()
            require(row, "Operation was not found.", "BLEND_NOT_FOUND", 404)
            if row[0]:
                return json.loads(row[0])
            return self._finish(db, request, {"state": "dismissed", "action": row[1], "created": now()})
