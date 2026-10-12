"""Complete source/context export and create-only, resumable receiving. MIT.

The archive contains plain JSON records and exact content objects, never a foreign
executable SQLite database. Receiving rebuilds the derived index with our parser.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
import zipfile
from typing import Any

from dbt_store import ProjectError, require, stamp, sha, identity, json_bytes, hash_id, text, regular_open, create_file, fsync_dir, FORMAT, rename_directory_new
from dbt_core import Project, _pairs


def strict_json(body):
    return json.loads(body, object_pairs_hook=_pairs, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))

PORTABLE = "stellar-forge.dbt-project-transfer.v1"
TABLES = ("artifacts", "editions", "reviews", "review_heads", "results", "requests", "audit")


def file_digest(path: Path) -> dict:
    h, size = hashlib.sha256(), 0
    with regular_open(path) as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            h.update(chunk)
            size += len(chunk)
    return {"sha256": h.hexdigest(), "bytes": size}


def _snapshot(project: Project):
    with project.connect() as db:
        db.execute("BEGIN")
        data = {table: [dict(row) for row in db.execute("SELECT * FROM " + table +
                (" ORDER BY seq" if table == "audit" else " ORDER BY name" if table == "review_heads" else " ORDER BY id"))]
                for table in TABLES}
    objects = {row["id"] for row in data["artifacts"]}
    for row in data["results"]:
        record = strict_json(row["body"])
        for kind in ("file", "query", "provenance"):
            objects.add(hash_id(record[kind]["sha256"]))
    return data, sorted(objects)


def export_project(project: Project, output: str, expected_archive_sha: str | None = None) -> dict:
    dest = Path(output).absolute()
    if dest.exists():
        require(expected_archive_sha is not None, "OUTPUT_EXISTS", "Choose a new output path or supply the original completed archive digest.", 409)
        actual = file_digest(dest)
        require(actual["sha256"] == hash_id(expected_archive_sha), "OUTPUT_CHANGED", status=409)
        return {"path": str(dest), **actual, "recovered": True}
    require(dest.parent.is_dir(), "OUTPUT_DIRECTORY_NOT_FOUND")
    state, objects = _snapshot(project)
    state_body = json_bytes({"schema": PORTABLE, "tables": state})
    workspace_body = json_bytes(project.info)
    files = [{"name": "state.json", "sha256": sha(state_body), "bytes": len(state_body)},
             {"name": "workspace.json", "sha256": sha(workspace_body), "bytes": len(workspace_body)}]
    for digest in objects:
        files.append({"name": "objects/" + digest, **project.verify_object(digest)})
    manifest = {"schema": PORTABLE, "workspace_id": project.info["id"], "created_at": stamp(), "files": files}
    fd, tmp = tempfile.mkstemp(prefix=".dbt-export-", suffix=".zip", dir=dest.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as archive:
            archive.writestr("manifest.json", json_bytes(manifest))
            archive.writestr("workspace.json", workspace_body)
            archive.writestr("state.json", state_body)
            for digest in objects:
                with regular_open(project.object_path(digest)) as src, archive.open("objects/" + digest, "w", force_zip64=True) as dst:
                    h = hashlib.sha256()
                    for chunk in iter(lambda: src.read(1024 * 1024), b""):
                        dst.write(chunk)
                        h.update(chunk)
                    require(h.hexdigest() == digest, "OBJECT_CHANGED_DURING_EXPORT", status=409)
        with open(tmp, "rb") as src:
            os.fsync(src.fileno())
        result = file_digest(Path(tmp))
        try:
            os.link(tmp, dest)
        except FileExistsError as exc:
            raise ProjectError("OUTPUT_EXISTS", status=409) from exc
        fsync_dir(dest.parent)
        return {"schema": PORTABLE, "path": str(dest), **result, "workspace_id": project.info["id"],
                "objects": len(objects), "editions": len(state["editions"]), "reviews": len(state["reviews"])}
    finally:
        Path(tmp).unlink(missing_ok=True)


def _validate_state(state: dict, objects: dict) -> dict:
    require(isinstance(state, dict) and state.get("schema") == PORTABLE and isinstance(state.get("tables"), dict), "INVALID_TRANSFER_STATE")
    tables = state["tables"]
    require(set(tables) == set(TABLES) and all(isinstance(tables[x], list) for x in TABLES), "INVALID_TRANSFER_TABLES")
    expected_columns = {
        "artifacts": {"id", "kind", "version", "bytes", "name", "imported_at", "metadata", "supported", "node_count", "warnings"},
        "editions": {"id", "title", "created_at", "manifest", "catalog", "runs", "freshness", "context"},
        "reviews": {"id", "name", "revision", "previous", "created_at", "body"},
        "review_heads": {"name", "id"}, "results": {"id", "edition", "uid", "created_at", "body"},
        "requests": {"id", "action", "input_sha", "result", "created_at"},
        "audit": {"seq", "action", "reference", "at"}}
    for table, rows in tables.items():
        for row in rows:
            require(isinstance(row, dict) and set(row) == expected_columns[table], "INVALID_TRANSFER_ROW")
    artifacts = {}
    for a in tables["artifacts"]:
        require(a["id"] not in artifacts, "DUPLICATE_TRANSFER_ARTIFACT")
        artifacts[a["id"]] = a
        obj = objects.get("objects/" + hash_id(a["id"]))
        require(obj is not None and obj["bytes"] == a["bytes"], "TRANSFER_OBJECT_MISSING")
        text(a["name"], "artifact_name")
    editions = {}
    for ed in tables["editions"]:
        runs, fresh = strict_json(ed["runs"]), strict_json(ed["freshness"])
        require(isinstance(runs, list) and isinstance(fresh, list), "INVALID_TRANSFER_EDITION")
        payload = {"title": ed["title"], "manifest": ed["manifest"], "catalog": ed["catalog"], "runs": runs, "freshness": fresh}
        require(identity(payload) == ed["id"] and ed["id"] not in editions, "EDITION_IDENTITY_MISMATCH")
        require(all(x in artifacts for x in [ed["manifest"]] + ([ed["catalog"]] if ed["catalog"] else []) + runs + fresh), "EDITION_SOURCE_MISSING")
        editions[ed["id"]] = ed
    reviews = {}
    for row in tables["reviews"]:
        value = strict_json(row["body"])
        expected = value.pop("id", None)
        require(expected == row["id"] and identity(value) == expected and expected not in reviews, "REVIEW_IDENTITY_MISMATCH")
        require(value.get("schema") == "stellar-forge.dbt-review.v1" and value.get("edition") in editions and
                (not value.get("baseline") or value["baseline"] in editions), "REVIEW_EDITION_MISSING")
        require(all(value.get(k) == row[k] for k in ("name", "revision", "previous", "created_at")), "REVIEW_RECORD_MISMATCH")
        require(type(row["revision"]) is int and row["revision"] >= 1, "INVALID_REVIEW_REVISION")
        reviews[row["id"]] = value
    for rid, value in reviews.items():
        previous = reviews.get(value["previous"])
        require(value["revision"] == 1 and previous is None and value["previous"] is None or previous is not None
                and previous["name"] == value["name"] and previous["revision"] + 1 == value["revision"], "REVIEW_HISTORY_BROKEN")
    for head in tables["review_heads"]:
        require(head["id"] in reviews and reviews[head["id"]]["name"] == head["name"], "REVIEW_HEAD_MISMATCH")
        require(reviews[head["id"]]["revision"] == max(r["revision"] for r in reviews.values() if r["name"] == head["name"]), "REVIEW_HEAD_NOT_CURRENT")
    for row in tables["results"]:
        value = strict_json(row["body"])
        payload = {k: v for k, v in value.items() if k not in ("id", "schema", "created_at")}
        require(value.get("id") == row["id"] == identity(payload) and value.get("edition") == row["edition"]
                and value.get("uid") == row["uid"] and row["edition"] in editions, "RESULT_IDENTITY_MISMATCH")
        for kind in ("file", "query", "provenance"):
            descriptor = value[kind]
            obj = objects.get("objects/" + hash_id(descriptor["sha256"]))
            require(obj is not None and obj["bytes"] == descriptor["bytes"], "RESULT_OBJECT_MISSING")
    for request in tables["requests"]:
        text(request["id"], "request_id", 160)
        hash_id(request["input_sha"])
        require(isinstance(strict_json(request["result"]), dict), "INVALID_SAVED_REQUEST")
    return tables


def _receive_project(archive_file: str, destination: str, expected_sha: str) -> dict:
    archive_path, dest = Path(archive_file).absolute(), Path(destination).absolute()
    expected_sha = hash_id(expected_sha)
    actual = file_digest(archive_path)
    require(actual["sha256"] == expected_sha, "ARCHIVE_DIGEST_MISMATCH", status=409)
    if dest.exists():
        try:
            with regular_open(dest / "receiving.json") as src:
                marker = strict_json(src.read())
        except (OSError, ProjectError, ValueError) as exc:
            raise ProjectError("DESTINATION_EXISTS", "Receiving never replaces an existing workspace.", 409) from exc
        require(marker.get("archive_sha256") == expected_sha and marker.get("state") == "complete", "DESTINATION_EXISTS", status=409)
        project = Project(dest)
        return {"path": str(dest), "workspace_id": project.info["id"], "archive_sha256": expected_sha, "recovered": True, **project.status()["counts"]}
    require(dest.parent.is_dir() and not dest.is_symlink(), "DESTINATION_PARENT_REQUIRED")
    stage = dest.parent / (".dbt-receive-" + identity({"archive": expected_sha, "destination": str(dest)})[:24])
    stage.mkdir(mode=0o700, exist_ok=True)
    require(not stage.is_symlink(), "RECEIVING_SYMLINK")
    incoming = stage / "incoming"
    incoming.mkdir(mode=0o700, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        require(len({m.filename for m in members}) == len(members), "DUPLICATE_ARCHIVE_MEMBER")
        require(all(not m.is_dir() and not m.flag_bits & 1 and
                    ((m.external_attr >> 16) & 0o170000) not in (0o120000, 0o060000, 0o020000) for m in members), "UNSUPPORTED_ARCHIVE_MEMBER")
        require("manifest.json" in archive.namelist(), "TRANSFER_MANIFEST_MISSING")
        manifest_info = archive.getinfo("manifest.json")
        require(manifest_info.file_size <= 64 * 1024 * 1024, "TRANSFER_MANIFEST_TOO_LARGE")
        manifest = strict_json(archive.read("manifest.json"))
        require(manifest.get("schema") == PORTABLE and isinstance(manifest.get("files"), list), "TRANSFER_FORMAT_UNSUPPORTED")
        files = {}
        for descriptor in manifest["files"]:
            name = descriptor.get("name")
            require(isinstance(name, str) and (name in ("state.json", "workspace.json") or
                    name.startswith("objects/") and len(name) == 72 and hash_id(name[8:])), "UNSAFE_ARCHIVE_PATH")
            require(name not in files and type(descriptor.get("bytes")) is int and descriptor["bytes"] >= 0, "INVALID_TRANSFER_FILE")
            hash_id(descriptor.get("sha256"))
            if name.startswith("objects/"):
                require(name[8:] == descriptor["sha256"], "OBJECT_PATH_IDENTITY_MISMATCH")
            files[name] = descriptor
        require(set(archive.namelist()) == set(files) | {"manifest.json"} and {"state.json", "workspace.json"} <= files.keys(), "TRANSFER_CLOSURE_MISMATCH")
        for name, descriptor in files.items():
            info = archive.getinfo(name)
            require(info.file_size == descriptor["bytes"], "ARCHIVE_LENGTH_MISMATCH")
            path = incoming / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            require(not path.is_symlink() and not path.parent.is_symlink(), "RECEIVING_SYMLINK")
            if path.exists():
                old = file_digest(path)
                if old == {k: descriptor[k] for k in ("sha256", "bytes")}:
                    continue
                path.unlink()
            temporary = path.with_name(path.name + ".partial")
            require(not temporary.is_symlink(), "RECEIVING_SYMLINK")
            h = hashlib.sha256()
            with archive.open(info) as src, open(temporary, "wb") as dst:
                os.chmod(temporary, 0o600)
                for chunk in iter(lambda: src.read(1024 * 1024), b""):
                    h.update(chunk)
                    dst.write(chunk)
                dst.flush()
                os.fsync(dst.fileno())
            require(h.hexdigest() == descriptor["sha256"], "TRANSFER_FILE_DIGEST_MISMATCH")
            os.replace(temporary, path)
            fsync_dir(path.parent)
    with regular_open(incoming / "workspace.json") as src:
        info = strict_json(src.read())
    require(info.get("schema") == FORMAT and info.get("id") == manifest.get("workspace_id"), "TRANSFER_WORKSPACE_IDENTITY_MISMATCH")
    with regular_open(incoming / "state.json") as src:
        tables = _validate_state(strict_json(src.read()), files)
    work = stage / "workspace"
    if not work.exists():
        work.mkdir(mode=0o700)
        create_file(work / "workspace.json", json_bytes(info))
    project = Project(work)
    for descriptor in files.values():
        if descriptor["name"].startswith("objects/"):
            project.put_file(incoming / descriptor["name"], descriptor["sha256"])
    # Rebuild with current trusted code, never execute a foreign SQLite schema.
    for artifact in tables["artifacts"]:
        rebuilt = project.import_file(project.object_path(artifact["id"]), artifact["id"])
        require(rebuilt["kind"] == artifact["kind"] and rebuilt["version"] == artifact["version"]
                and rebuilt["bytes"] == artifact["bytes"] and rebuilt["node_count"] == artifact["node_count"]
                and rebuilt["supported"] == bool(artifact["supported"]), "RECEIVED_PROJECTION_MISMATCH")
    with project.transaction() as db:
        for table in reversed(TABLES[1:]):
            db.execute("DELETE FROM " + table)
        for artifact in tables["artifacts"]:
            db.execute("UPDATE artifacts SET name=?,imported_at=? WHERE id=?", (artifact["name"], artifact["imported_at"], artifact["id"]))
        for table in TABLES[1:]:
            # SQLite foreign-key relationships have the same source order.
            for row in tables[table]:
                columns = list(row)
                db.execute("INSERT INTO " + table + "(" + ",".join(columns) + ") VALUES(" + ",".join("?" for _ in columns) + ")", [row[k] for k in columns])
        require(not db.execute("PRAGMA foreign_key_check").fetchall(), "RECEIVED_REFERENCE_MISMATCH")
        # Revalidate selected IDs after rebuilding the trusted source projection.
        for row in tables["reviews"]:
            record = strict_json(row["body"])
            ed = project._edition(db, record["edition"])
            allowed = {r[0] for r in db.execute("SELECT uid FROM nodes WHERE artifact=?", (ed["manifest"],))}
            if record.get("baseline"):
                before = project._edition(db, record["baseline"])
                allowed.update(r[0] for r in db.execute("SELECT uid FROM nodes WHERE artifact=?", (before["manifest"],)))
            selected, decisions = record.get("selection"), record.get("decisions")
            require(isinstance(selected, list) and all(isinstance(x, str) and x in allowed for x in selected)
                    and len(selected) == len(set(selected)) and isinstance(decisions, dict)
                    and set(decisions) <= allowed, "RECEIVED_REVIEW_RESOURCE_MISSING")
            for decision in decisions.values():
                require(isinstance(decision, dict) and set(decision) <= {"status", "note", "proposed_code"}
                        and decision.get("status") in ("accepted", "investigate", "excluded", "correction-proposed"), "RECEIVED_DECISION_INVALID")
        for row in tables["results"]:
            ed = project._edition(db, row["edition"])
            require(db.execute("SELECT 1 FROM nodes WHERE artifact=? AND uid=?", (ed["manifest"], row["uid"])).fetchone() is not None, "RESULT_RESOURCE_MISSING")
    for ed in project.editions():
        for artifact in [ed["manifest"]] + ([ed["catalog"]] if ed["catalog"] else []) + ed["runs"] + ed["freshness"]:
            require(project.artifact(artifact)["supported"], "RECEIVED_SELECTION_UNSUPPORTED")
    with project.connect() as db:
        db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        require(db.execute("PRAGMA integrity_check").fetchone()[0] == "ok", "RECEIVED_INDEX_INVALID")
    marker = {"schema": PORTABLE, "archive_sha256": expected_sha, "state": "complete", "received_at": stamp()}
    marker_path = work / "receiving.json"
    if marker_path.exists():
        marker_path.unlink()
    create_file(marker_path, json_bytes(marker))
    require(not dest.exists(), "DESTINATION_EXISTS", status=409)
    rename_directory_new(work, dest)
    fsync_dir(dest.parent)
    shutil.rmtree(stage)
    result = Project(dest)
    return {"path": str(dest), "workspace_id": result.info["id"], "archive_sha256": expected_sha,
            **result.status()["counts"]}


def receive_project(archive_file: str, destination: str, expected_sha: str) -> dict:
    """One original receiver per destination; retry resumes its same staged bytes."""
    import contextlib
    destination_path = Path(destination).absolute()
    require(destination_path.parent.is_dir(), "DESTINATION_PARENT_NOT_FOUND")
    lock_path = destination_path.parent / (".dbt-receiver-" + identity(str(destination_path))[:24] + ".lock")
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if os.name == "posix":
            import fcntl
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ProjectError("RECEIVER_ACTIVE", "The original receiving operation is still active.", 409) from exc
        else:
            import msvcrt
            try:
                msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise ProjectError("RECEIVER_ACTIVE", status=409) from exc
        return _receive_project(archive_file, destination, expected_sha)
    finally:
        os.close(fd)
