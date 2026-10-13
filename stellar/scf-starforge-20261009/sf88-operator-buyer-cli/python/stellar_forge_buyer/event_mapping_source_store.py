"""Whole mapping working sources in the original Analysis SQLite snapshot.

This data store never executes an uploaded file. The authenticated EventProgrammes
owner checks programme/input access, runs its fixed installed validator/renderer,
and only then calls install_derived with that result. Source and HTML BLOBs travel
with the original datasets.sqlite3 backup and workspace archive.

API
---
create({id, programme, input_id, bytes, sha256, name}) -> status
put(id, {offset, base64, sha256}) -> status
status(id) -> descriptor + received/complete/chunk_bytes/derived
derived(id) -> {source, evidence, renderer_sources, html}, or None
read(id, offset, limit=65536, kind="source") -> selected file range
copy_to(id, fresh_path, kind="source") -> selected complete file descriptor
install_derived(id, {evidence, renderer_sources}, html_path) -> status

The source id is its full lowercase SHA256. Every create metadata field is
immutable, including the original filename and native selection. put permits
only a contiguous addition or a byte-exact replay of an existing whole chunk.
The final chunk and full UTF-8/hash validation commit atomically. Derived HTML and
its deterministic evidence commit together; a replay must match all bytes.
Ranges carry both the whole selected-file hash and their own range hash. A caller
must concatenate every range and verify the whole file before using a download.
"""
from __future__ import annotations

import base64
import binascii
import codecs
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat

from .errors import StateError

CHUNK = 64 * 1024
SOURCE_LIMIT = 192 * 1024 * 1024
HTML_LIMIT = 256 * 1024 * 1024
METADATA_LIMIT = 2 * 1024 * 1024
SCHEMA = "stellar-forge.event-mapping-source.v1"
RANGE_SCHEMA = "stellar-forge.event-mapping-source-range.v1"
_HASH = re.compile(r"[a-f0-9]{64}")
_ID = re.compile(r"[a-f0-9]{32}")
_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,23}")


def _need(ok, code):
    if not ok:
        raise StateError("EVENT_MAPPING_SOURCE_" + code)


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _canonical(value):
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False,
                          sort_keys=True, separators=(",", ":"))
    except (TypeError, ValueError, UnicodeError):
        raise StateError("EVENT_MAPPING_SOURCE_METADATA_INVALID") from None


def _utf8(value, code):
    try:
        return value.encode("utf-8", "strict")
    except (AttributeError, UnicodeError):
        raise StateError("EVENT_MAPPING_SOURCE_" + code) from None


def _identifier(value):
    _need(isinstance(value, str) and _HASH.fullmatch(value), "ID_REQUIRED")
    return value


def _kind(value):
    _need(value in ("source", "html"), "FILE_KIND_INVALID")
    return value


def _signature(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _decode(decoder, block, *, final=False):
    try:
        decoder.decode(block, final=final)
    except UnicodeError:
        raise StateError("EVENT_MAPPING_SOURCE_UTF8_REQUIRED") from None


def _descriptor(record):
    return {key: record[key] for key in
            ("schema", "id", "workspace_id", "programme", "input_id",
             "name", "bytes", "sha256", "created_at")}


class EventMappingSourceStore:
    """Two append-only data tables, under the original EventProgrammes RLock."""

    def __init__(self, database, workspace_id, lock):
        _need(isinstance(workspace_id, str) and _ID.fullmatch(workspace_id),
              "WORKSPACE_REQUIRED")
        self.database, self.workspace_id, self.lock = database, workspace_id, lock
        with self.lock, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""CREATE TABLE IF NOT EXISTS sf_event_mapping_sources(
                id TEXT PRIMARY KEY, record TEXT NOT NULL,
                received INTEGER NOT NULL DEFAULT 0,
                complete INTEGER NOT NULL DEFAULT 0,
                derived TEXT)""")
            db.execute("""CREATE TABLE IF NOT EXISTS sf_event_mapping_source_chunks(
                source_id TEXT NOT NULL, kind TEXT NOT NULL,
                offset INTEGER NOT NULL, body BLOB NOT NULL,
                sha256 TEXT NOT NULL, PRIMARY KEY(source_id,kind,offset),
                CHECK(kind IN ('source','html')), CHECK(offset>=0))""")
            db.commit()

    def _row(self, db, identifier):
        identifier = _identifier(identifier)
        row = db.execute("SELECT record,received,complete,derived "
                         "FROM sf_event_mapping_sources WHERE id=?",
                         (identifier,)).fetchone()
        _need(row is not None, "NOT_FOUND")
        try:
            record = json.loads(row["record"])
        except (TypeError, ValueError):
            raise StateError("EVENT_MAPPING_SOURCE_RECORD_CHANGED") from None
        _need(isinstance(record, dict) and record.get("schema") == SCHEMA
              and record.get("id") == identifier
              and record.get("sha256") == identifier
              and record.get("workspace_id") == self.workspace_id
              and isinstance(record.get("programme"), str)
              and _NAME.fullmatch(record["programme"])
              and isinstance(record.get("input_id"), str)
              and _ID.fullmatch(record["input_id"])
              and type(record.get("bytes")) is int
              and 0 < record["bytes"] <= SOURCE_LIMIT
              and isinstance(record.get("name"), str)
              and isinstance(record.get("created_at"), str),
              "RECORD_CHANGED")
        _need(type(row["received"]) is int and 0 <= row["received"] <= record["bytes"]
              and row["complete"] in (0, 1)
              and bool(row["complete"]) == (row["received"] == record["bytes"]),
              "RECEIVING_CHANGED")
        return record, row

    def _derived(self, record, row):
        if row["derived"] is None:
            return None
        try:
            value = json.loads(row["derived"])
        except (TypeError, ValueError):
            raise StateError("EVENT_MAPPING_SOURCE_DERIVED_CHANGED") from None
        _need(row["complete"] == 1 and isinstance(value, dict)
              and set(value) == {"source", "evidence", "renderer_sources", "html"}
              and value["source"] == _descriptor(record)
              and isinstance(value["evidence"], dict)
              and isinstance(value["renderer_sources"], (dict, list))
              and isinstance(value["html"], dict), "DERIVED_CHANGED")
        html = value["html"]
        _need(set(html) == {"name", "bytes", "sha256", "content_type"}
              and html["name"] == "mapping-working.html"
              and html["content_type"] == "text/html;charset=utf-8"
              and type(html["bytes"]) is int and 0 < html["bytes"] <= HTML_LIMIT
              and isinstance(html["sha256"], str) and _HASH.fullmatch(html["sha256"]),
              "DERIVED_CHANGED")
        return value

    def _status(self, db, identifier):
        record, row = self._row(db, identifier)
        return {**_descriptor(record), "received": row["received"],
                "complete": bool(row["complete"]), "chunk_bytes": CHUNK,
                "derived": self._derived(record, row)}

    def create(self, body):
        _need(isinstance(body, dict) and
              set(body) == {"id", "programme", "input_id", "bytes", "sha256", "name"},
              "DESCRIPTOR_REQUIRED")
        identifier = _identifier(body["id"])
        _need(body["sha256"] == identifier, "WHOLE_HASH_REQUIRED")
        _need(isinstance(body["programme"], str) and _NAME.fullmatch(body["programme"])
              and isinstance(body["input_id"], str) and _ID.fullmatch(body["input_id"]),
              "NATIVE_SELECTION_REQUIRED")
        _need(type(body["bytes"]) is int and 0 < body["bytes"] <= SOURCE_LIMIT,
              "SIZE_INVALID")
        label = body["name"]
        _need(isinstance(label, str) and 0 < len(_utf8(label, "LABEL_INVALID")) <= 240
              and not any(ord(c) < 32 or ord(c) == 127 for c in label),
              "LABEL_INVALID")
        record = {"schema": SCHEMA, **body, "workspace_id": self.workspace_id,
                  "created_at": datetime.now(timezone.utc).isoformat()}
        with self.lock, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT id FROM sf_event_mapping_sources WHERE id=?",
                             (identifier,)).fetchone()
            if old:
                original, _ = self._row(db, identifier)
                _need(all(original[key] == body[key] for key in body), "ID_REUSED")
            else:
                db.execute("INSERT INTO sf_event_mapping_sources(id,record) VALUES(?,?)",
                           (identifier, _canonical(record)))
            result = self._status(db, identifier)
            db.commit()
        return result

    def status(self, identifier):
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            return self._status(db, identifier)

    def derived(self, identifier):
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            record, row = self._row(db, identifier)
            return self._derived(record, row)

    def _selected(self, db, identifier, kind):
        kind = _kind(kind)
        record, row = self._row(db, identifier)
        _need(row["complete"] == 1, "COMPLETE_ORIGINAL_REQUIRED")
        if kind == "source":
            selected = {"name": record["name"], "bytes": record["bytes"],
                        "sha256": record["sha256"],
                        "content_type": "application/json;charset=utf-8"}
        else:
            derived = self._derived(record, row)
            _need(derived is not None, "DERIVED_REQUIRED")
            selected = derived["html"]
        return record, selected

    def _stream(self, db, identifier, kind, selected):
        """Yield bounded checked chunks, then check the complete UTF-8 identity."""
        offset, digest = 0, hashlib.sha256()
        decoder = codecs.getincrementaldecoder("utf-8")("strict")
        for row in db.execute("SELECT offset,body,sha256 FROM sf_event_mapping_source_chunks "
                              "WHERE source_id=? AND kind=? ORDER BY offset",
                              (identifier, kind)):
            block = row["body"]
            _need(isinstance(block, bytes) and 0 < len(block) <= CHUNK
                  and row["offset"] == offset and offset + len(block) <= selected["bytes"]
                  and _sha(block) == row["sha256"], "RETAINED_CHUNK_CHANGED")
            digest.update(block)
            _decode(decoder, block)
            offset += len(block)
            yield block
        _decode(decoder, b"", final=True)
        _need(offset == selected["bytes"] and digest.hexdigest() == selected["sha256"],
              "COMPLETE_FILE_CHANGED")

    def put(self, identifier, body):
        identifier = _identifier(identifier)
        _need(isinstance(body, dict) and set(body) == {"offset", "base64", "sha256"},
              "CHUNK_REQUIRED")
        offset = body["offset"]
        _need(type(offset) is int and offset >= 0, "OFFSET_REQUIRED")
        encoded, digest = body["base64"], body["sha256"]
        _need(isinstance(encoded, str) and 0 < len(encoded) <= ((CHUNK + 2) // 3) * 4
              and isinstance(digest, str) and _HASH.fullmatch(digest),
              "CHUNK_ENCODING_INVALID")
        try:
            block = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError, binascii.Error):
            raise StateError("EVENT_MAPPING_SOURCE_CHUNK_ENCODING_INVALID") from None
        _need(0 < len(block) <= CHUNK and _sha(block) == digest, "CHUNK_CHANGED")
        with self.lock, self.database._connection() as db:
            db.execute("BEGIN IMMEDIATE")
            record, row = self._row(db, identifier)
            previous = db.execute("SELECT body,sha256 FROM sf_event_mapping_source_chunks "
                                  "WHERE source_id=? AND kind='source' AND offset=?",
                                  (identifier, offset)).fetchone()
            if previous:
                _need(previous["body"] == block and previous["sha256"] == digest,
                      "ORIGINAL_CHUNK_REQUIRED")
            else:
                _need(row["complete"] == 0 and offset == row["received"]
                      and offset + len(block) <= record["bytes"],
                      "CONTIGUOUS_ORIGINAL_CHUNK_REQUIRED")
                db.execute("INSERT INTO sf_event_mapping_source_chunks "
                           "(source_id,kind,offset,body,sha256) VALUES(?,'source',?,?,?)",
                           (identifier, offset, block, digest))
                received = offset + len(block)
                if received == record["bytes"]:
                    for _ in self._stream(db, identifier, "source", record):
                        pass
                db.execute("UPDATE sf_event_mapping_sources SET received=?,complete=? WHERE id=?",
                           (received, int(received == record["bytes"]), identifier))
            result = self._status(db, identifier)
            db.commit()
        return result

    def read(self, identifier, offset, limit=CHUNK, kind="source"):
        identifier, kind = _identifier(identifier), _kind(kind)
        _need(type(offset) is int and offset >= 0 and
              type(limit) is int and 1 <= limit <= CHUNK, "RANGE_INVALID")
        with self.database._connection(readonly=True) as db:
            db.execute("BEGIN")
            record, selected = self._selected(db, identifier, kind)
            _need(offset <= selected["bytes"], "RANGE_INVALID")
            stop, cursor, parts = min(offset + limit, selected["bytes"]), offset, []
            for row in db.execute("SELECT offset,body,sha256 FROM sf_event_mapping_source_chunks "
                                  "WHERE source_id=? AND kind=? AND offset>=? AND offset<? ORDER BY offset",
                                  (identifier, kind, max(0, offset - CHUNK + 1), stop)):
                start, block = row["offset"], row["body"]
                _need(isinstance(block, bytes) and 0 < len(block) <= CHUNK
                      and start + len(block) <= selected["bytes"]
                      and _sha(block) == row["sha256"], "RETAINED_CHUNK_CHANGED")
                end = start + len(block)
                if end <= offset:
                    continue
                _need((start == cursor or cursor == offset and start <= offset < end)
                      and cursor < end, "RANGE_SOURCE_CHANGED")
                take_end = min(stop, end)
                parts.append(block[cursor - start:take_end - start])
                cursor = take_end
            _need(cursor == stop, "RANGE_SOURCE_CHANGED")
            content = b"".join(parts)
            return {"schema": RANGE_SCHEMA, "source": _descriptor(record), "kind": kind,
                    **selected, "offset": offset, "length": len(content),
                    "base64": base64.b64encode(content).decode("ascii"),
                    "range_sha256": _sha(content), "next_offset": stop,
                    "eof": stop == selected["bytes"]}

    def copy_to(self, identifier, path, kind="source"):
        """Publish one complete private file; no partial final name is visible."""
        identifier, kind = _identifier(identifier), _kind(kind)
        target = Path(path).expanduser().absolute()
        _need(target.name not in ("", ".", ".."), "OUTPUT_PATH_INVALID")
        flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
        directory = os.open(target.parent, flags)
        temporary = "." + target.name + "-" + secrets.token_hex(16) + ".tmp"
        descriptor = None
        try:
            _need(stat.S_ISDIR(os.fstat(directory).st_mode), "OUTPUT_DIRECTORY_REQUIRED")
            file_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                              getattr(os, "O_NOFOLLOW", 0), 0o600, dir_fd=directory)
            try:
                with os.fdopen(file_fd, "wb") as output:
                    with self.database._connection(readonly=True) as db:
                        db.execute("BEGIN")
                        record, selected = self._selected(db, identifier, kind)
                        for block in self._stream(db, identifier, kind, selected):
                            output.write(block)
                        descriptor = {"source": _descriptor(record), "kind": kind,
                                      **selected, "path": str(target)}
                    output.flush()
                    os.fsync(output.fileno())
                try:
                    os.link(temporary, target.name, src_dir_fd=directory,
                            dst_dir_fd=directory, follow_symlinks=False)
                except FileExistsError:
                    raise StateError("EVENT_MAPPING_SOURCE_OUTPUT_EXISTS") from None
                os.fsync(directory)
            finally:
                try:
                    os.unlink(temporary, dir_fd=directory)
                    os.fsync(directory)
                except FileNotFoundError:
                    pass
        finally:
            os.close(directory)
        return descriptor

    def install_derived(self, identifier, body, html_path):
        """Internal owner only: persist its fully validated installed-code result.

        Calling this method is not a substitute for the original semantic/source
        validator. It deliberately has no browser route or executable-source input.
        The HTML is kept as an immutable data download, including its exact trusted
        implementation; subsequent native validation always selects installed code.
        """
        identifier = _identifier(identifier)
        _need(isinstance(body, dict) and set(body) == {"evidence", "renderer_sources"}
              and isinstance(body["evidence"], dict)
              and isinstance(body["renderer_sources"], (dict, list)),
              "DERIVED_METADATA_REQUIRED")
        metadata = _canonical(body)
        _need(len(_utf8(metadata, "METADATA_INVALID")) <= METADATA_LIMIT, "METADATA_TOO_LARGE")
        checked = json.loads(metadata)
        path = Path(html_path).expanduser().absolute()
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        with os.fdopen(fd, "rb") as source:
            before = os.fstat(source.fileno())
            _need(stat.S_ISREG(before.st_mode) and 0 < before.st_size <= HTML_LIMIT,
                  "HTML_FILE_REQUIRED")
            with self.lock, self.database._connection() as db:
                db.execute("BEGIN IMMEDIATE")
                record, row = self._row(db, identifier)
                _need(row["complete"] == 1, "COMPLETE_ORIGINAL_REQUIRED")
                for _ in self._stream(db, identifier, "source", record):
                    pass
                previous = self._derived(record, row)
                if previous is not None:
                    _need(previous["evidence"] == checked["evidence"]
                          and previous["renderer_sources"] == checked["renderer_sources"],
                          "DERIVED_METADATA_CHANGED")
                else:
                    _need(db.execute("SELECT 1 FROM sf_event_mapping_source_chunks "
                                     "WHERE source_id=? AND kind='html' LIMIT 1",
                                     (identifier,)).fetchone() is None, "DERIVED_CHUNKS_CHANGED")
                offset, digest = 0, hashlib.sha256()
                decoder = codecs.getincrementaldecoder("utf-8")("strict")
                while block := source.read(CHUNK):
                    _need(offset + len(block) <= before.st_size, "HTML_FILE_CHANGED")
                    _decode(decoder, block)
                    digest.update(block)
                    chunk_sha = _sha(block)
                    if previous is not None:
                        saved = db.execute("SELECT body,sha256 FROM sf_event_mapping_source_chunks "
                                           "WHERE source_id=? AND kind='html' AND offset=?",
                                           (identifier, offset)).fetchone()
                        _need(saved is not None and saved["body"] == block
                              and saved["sha256"] == chunk_sha, "DERIVED_FILE_CHANGED")
                    else:
                        db.execute("INSERT INTO sf_event_mapping_source_chunks "
                                   "(source_id,kind,offset,body,sha256) VALUES(?,'html',?,?,?)",
                                   (identifier, offset, block, chunk_sha))
                    offset += len(block)
                _decode(decoder, b"", final=True)
                _need(offset == before.st_size and _signature(before) == _signature(os.fstat(source.fileno())),
                      "HTML_FILE_CHANGED")
                html = {"name": "mapping-working.html", "bytes": offset,
                        "sha256": digest.hexdigest(), "content_type": "text/html;charset=utf-8"}
                derived = {"source": _descriptor(record), **checked, "html": html}
                if previous is not None:
                    _need(previous == derived, "DERIVED_FILE_CHANGED")
                    for _ in self._stream(db, identifier, "html", html):
                        pass
                else:
                    db.execute("UPDATE sf_event_mapping_sources SET derived=? WHERE id=?",
                               (_canonical(derived), identifier))
                result = self._status(db, identifier)
                db.commit()
        return result
