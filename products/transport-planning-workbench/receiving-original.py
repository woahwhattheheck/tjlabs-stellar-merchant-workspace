#!/usr/bin/env python3
"""Receive complete original transportation applications, workspaces and saved command histories."""
from __future__ import annotations
import argparse
import base64
import contextlib
import copy
import fcntl
import hashlib
import importlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import runpy
import signal
import sqlite3
import stat
import sys
import zipfile

SCHEMA = "stellar-forge.transport-planning-original-receiving.v1"
SOURCE_SCHEMA = "stellar-forge.transport-planning-workbench-source.v1"
SHA = re.compile(r"[0-9a-f]{64}\Z")
IDENTIFIER = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}\Z")
MAX_JSON = 512 * 1024 * 1024
MAX_ARCHIVE = 9007199254740991

def need(value, message):
    if not value:
        raise ValueError(message)

def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")

def digest_bytes(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def read_json(path):
    path = regular(path)
    need(path.stat().st_size <= MAX_JSON, "JSON selection exceeds the complete helper capacity")
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result, "Duplicate JSON member: " + key)
            result[key] = value
        return result
    return json.loads(path.read_bytes(), object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Non-finite JSON: " + value)))

def regular(value):
    path = Path(value)
    need(path.is_absolute(), "Use an absolute selected file path")
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink(), "Select an ordinary file: " + str(path))
    need(path.resolve() == path, "Select the canonical ordinary file path: " + str(path))
    return path

def directory(value, create=False, private=True):
    path = Path(value)
    need(path.is_absolute(), "Use an absolute directory")
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and path.resolve() == path, "Select a canonical ordinary directory")
    if private:
        need(info.st_uid == os.geteuid() and not (info.st_mode & 0o077), "Use an owned private receiving directory")
    return path

def relative(value):
    need(isinstance(value, str) and value and "\\" not in value and "\x00" not in value,
         "Invalid relative member")
    parts = value.split("/")
    need(not value.startswith("/") and all(p not in ("", ".", "..") for p in parts),
         "Unsafe relative member: " + value)
    return value

def identity(path):
    path = regular(path)
    before = path.stat()
    check = hashlib.sha256()
    count = 0
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1048576), b""):
            count += len(block)
            check.update(block)
    after = path.stat()
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) and count == after.st_size,
         "Selected file changed while reading")
    return {"path": str(path), "bytes": count, "sha256": check.hexdigest()}

def descriptor(value):
    need(isinstance(value, dict) and isinstance(value.get("bytes"), int)
         and not isinstance(value["bytes"], bool) and value["bytes"] >= 0
         and isinstance(value.get("sha256"), str) and SHA.fullmatch(value["sha256"]),
         "Invalid selected file descriptor")
    actual = identity(value["path"])
    need(actual["bytes"] == value["bytes"] and actual["sha256"] == value["sha256"],
         "Selected file bytes changed: " + str(value["path"]))
    return actual

def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def keep_bytes(path, raw):
    path = Path(path)
    directory(str(path.parent), create=True)
    if path.exists():
        need(regular(path).read_bytes() == raw, "Immutable output differs: " + str(path))
        return identity(path)
    temporary = path.with_name(path.name + "." + secrets.token_hex(12) + ".writing")
    with temporary.open("xb") as output:
        os.chmod(temporary, 0o600)
        output.write(raw)
        output.flush()
        os.fsync(output.fileno())
    try:
        try:
            os.link(temporary, path)
        except FileExistsError:
            need(regular(path).read_bytes() == raw, "Concurrent immutable output differs")
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return identity(path)

def keep_json(path, value):
    return keep_bytes(path, canonical(value))

def copy_exact(source, destination, expected=None):
    source = regular(source)
    chosen = identity(source)
    if expected is not None:
        need(chosen["bytes"] == expected["bytes"] and chosen["sha256"] == expected["sha256"],
             "Copy source differs from the selected bytes")
    destination = Path(destination)
    directory(str(destination.parent), create=True)
    if destination.exists():
        observed = identity(destination)
        need(all(observed[key] == chosen[key] for key in ("bytes", "sha256")), "Closed copied output differs")
        return observed
    temporary = destination.with_name(destination.name + "." + secrets.token_hex(12) + ".writing")
    with source.open("rb") as incoming, temporary.open("xb") as output:
        os.chmod(temporary, 0o600)
        shutil.copyfileobj(incoming, output, 1048576)
        output.flush()
        os.fsync(output.fileno())
    actual = identity(temporary)
    need(all(actual[key] == chosen[key] for key in ("bytes", "sha256")), "Copy changed")
    try:
        try:
            os.link(temporary, destination)
        except FileExistsError:
            observed = identity(destination)
            need(all(observed[key] == chosen[key] for key in ("bytes", "sha256")), "Closed copy collision")
        fsync_directory(destination.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return identity(destination)

@contextlib.contextmanager
def lock(path):
    path = Path(path)
    directory(str(path.parent), create=True)
    flags = os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags, 0o600)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1
             and not (info.st_mode & 0o077), "Unsafe operation lock")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        selected = path.lstat()
        need(path.resolve() == path and not path.is_symlink()
             and (selected.st_dev, selected.st_ino) == (info.st_dev, info.st_ino),
             "The selected original operation lock was replaced")
        yield fd
    finally:
        os.close(fd)

def archive_inventory(path):
    path = regular(path)
    need(path.stat().st_size <= MAX_ARCHIVE, "Archive exceeds selected reader capacity")
    rows = []
    seen = set()
    total = 0
    with zipfile.ZipFile(path) as archive:
        need(len(archive.infolist()) <= 100000, "Archive has too many members")
        for info in archive.infolist():
            name = info.filename.rstrip("/") if info.is_dir() else info.filename
            relative(name)
            need(name.casefold() not in seen, "Duplicate archive member")
            seen.add(name.casefold())
            mode = info.external_attr >> 16
            need(not stat.S_ISLNK(mode) and stat.S_IFMT(mode) in (0, stat.S_IFREG, stat.S_IFDIR),
                 "Archive contains a special file")
            if info.is_dir():
                continue
            total += info.file_size
            need(total <= MAX_ARCHIVE and info.file_size <= MAX_ARCHIVE, "Expanded archive exceeds capacity")
            check = hashlib.sha256()
            count = 0
            with archive.open(info) as incoming:
                for block in iter(lambda: incoming.read(1048576), b""):
                    check.update(block)
                    count += len(block)
            need(count == info.file_size, "Truncated ZIP member")
            rows.append({"path": info.filename, "bytes": count, "sha256": check.hexdigest()})
    return rows

def extract_member(archive_path, member, destination, expected=None):
    relative(member)
    destination = Path(destination)
    if destination.exists():
        actual = identity(destination)
        if expected:
            need(all(actual[k] == expected[k] for k in ("bytes", "sha256")), "Retained extracted member differs")
        else:
            with zipfile.ZipFile(archive_path) as archive, archive.open(member) as stream:
                h, size = hashlib.sha256(), 0
                for chunk in iter(lambda: stream.read(1048576), b""):
                    h.update(chunk); size += len(chunk)
            need({"bytes": size, "sha256": h.hexdigest()} == {k: actual[k] for k in ("bytes", "sha256")}, "Retained extracted member changed")
        return actual
    directory(str(destination.parent), create=True)
    temporary = destination.with_name(destination.name + "." + secrets.token_hex(12) + ".writing")
    with zipfile.ZipFile(archive_path) as archive, archive.open(member) as incoming, temporary.open("xb") as output:
        os.chmod(temporary, 0o600)
        shutil.copyfileobj(incoming, output, 1048576)
        output.flush()
        os.fsync(output.fileno())
    actual = identity(temporary)
    if expected:
        need(all(actual[k] == expected[k] for k in ("bytes", "sha256")), "Extracted member differs")
    try:
        result = copy_exact(temporary, destination, actual)
    finally:
        temporary.unlink(missing_ok=True)
    return result

def finish(stage, request, value, artifacts):
    result = {"schema": "stellar-forge.transport-planning-original-result.v1",
              "requestSha256": digest_bytes(canonical(request))["sha256"],
              "action": request["action"], "id": request["id"],
              "value": value, "artifacts": artifacts}
    keep_json(stage / "candidate.json", result)
    return reopen_candidate(stage, request)

def reopen_candidate(stage, request):
    candidate = stage / "candidate.json"
    result_path = stage / "result.json"
    if not candidate.exists():
        need(not result_path.exists(), "Result has no retained candidate")
        return None
    result = read_json(candidate)
    need(result.get("schema") == "stellar-forge.transport-planning-original-result.v1"
         and result.get("requestSha256") == digest_bytes(canonical(request))["sha256"]
         and result.get("action") == request["action"] and result.get("id") == request["id"],
         "Completed helper selection differs")
    for row in result["artifacts"]:
        descriptor(row)
    keep_json(result_path, result)
    return {**result, "resultFile": identity(result_path)}



TABLES = ("meta", "config", "sources", "records", "history", "commands", "events", "dataset_rows")
IMMUTABLE_KEYS = {"meta": ("key",), "config": ("revision",), "sources": ("id",),
                  "history": ("id", "revision"), "commands": ("id",),
                  "events": ("seq",), "dataset_rows": ("dataset_id", "row_no")}
EDITIONS = ("performance", "scenario_edition", "plan", "report")

def source_selection(selected):
    need(set(selected) == {"schema", "applicationDirectory", "sourceManifestFile",
                          "sourceManifestSha256", "python", "node"} and selected["schema"] == SCHEMA,
         "Select the complete original source and both prepared runtimes.")
    need(sys.version_info >= (3, 12) and os.path.samefile(selected["python"], sys.executable),
         "Run the original helper with the selected CPython3.12+ invocation.")
    regular(selected["node"])
    need(os.access(selected["node"], os.X_OK), "Retain the actual selected Node executable.")
    os.environ.pop("NODE_OPTIONS", None)
    os.environ["TRANSPORT_NODE"] = selected["node"]
    bridge = runpy.run_path(str(Path(__file__).with_name("managed_host.py")), run_name="transport_receiving_support")
    manifest = bridge["source"](selected)
    rows = {row["path"]: row for row in manifest["files"]}
    api = {"core": bridge["module"]("workspace"), "app": bridge["module"]("operations"),
           "delivery": bridge["module"]("delivery"), "exports": bridge["module"]("exports"), "bridge": bridge}
    return Path(selected["applicationDirectory"]), rows, api

def native_archive(selected, kind, rows, api, current_source=True):
    chosen = descriptor(selected)
    need(kind in ("application", "recovery"), "Select the original complete archive reader.")
    name, format_name = (("delivery-manifest.json", "transport-production.delivery.v1") if kind == "application"
                         else ("manifest.json", "transport-production.backup.v1"))
    with zipfile.ZipFile(chosen["path"]) as archive:
        manifest, expected = api["core"].archive_manifest(archive, name, format_name)
        if kind == "application":
            need(type(manifest.get("includes_working_data")) is bool and
                 manifest["includes_working_data"] == ("workspace-recovery.zip" in expected),
                 "The original working-data declaration differs.")
            need(set(rows) <= set(expected), "The full original application source is absent.")
            need(set(expected) == set(rows) | ({"workspace-recovery.zip"} if manifest["includes_working_data"] else set()),
                 "The original application archive contains another source population.")
            if current_source:
                for path, row in rows.items():
                    need(expected[path] == (row["bytes"], row["sha256"]), "The archived original source differs: " + path)
        else:
            need(set(expected) == {"workspace.sqlite"}, "Select the complete original recovery database.")
        for member, binding in expected.items():
            with archive.open(member) as incoming:
                api["core"].copy_hashed(incoming, expected=binding)
    need(descriptor(chosen) == chosen, "The original archive changed while being checked.")
    return chosen, manifest, expected

def source_blob(connection, row, path, api):
    if path.exists():
        saved = identity(path)
        need(saved["bytes"] == row["size"] and saved["sha256"] == row["sha"], "Retained original source bytes changed.")
        return saved
    directory(str(path.parent), create=True)
    temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".writing")
    try:
        with connection.blobopen("sources", "body", row["rowid"], readonly=True) as incoming, temporary.open("xb") as output:
            os.chmod(temporary, 0o600)
            checked = api["core"].copy_hashed(incoming, output, (row["size"], row["sha"]))
            output.flush(); os.fsync(output.fileno())
        return copy_exact(temporary, path, checked)
    finally:
        temporary.unlink(missing_ok=True)

def snapshot(workspace, stage, api):
    directory(str(workspace))
    database = regular(str(Path(workspace) / "workspace.sqlite"))
    observed = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    try:
        tables = {row[0] for row in observed.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        need(set(TABLES) <= tables, "Observe an existing complete original workspace; do not initialize an audit target.")
        format_row = observed.execute("SELECT value FROM meta WHERE key='format'").fetchone()
        identity_row = observed.execute("SELECT value FROM meta WHERE key='workspace_id'").fetchone()
        need(format_row is not None and format_row[0] == "transport-production.workspace.v1" and identity_row is not None and identity_row[0],
             "Select the existing original transportation workspace identity.")
    finally:
        observed.close()
    w = api["core"].Workspace(workspace)
    app = api["app"].Operations(w)
    full_tables, objects, records, artifacts = {}, {}, [], []
    with w.db() as connection:
        connection.execute("BEGIN")
        app.audit(connection)
        state = app.state(connection)
        for table in TABLES:
            values = []
            if table == "sources":
                for source in connection.execute("SELECT rowid,id,sha,kind,url,at,mime,length(body) AS size FROM sources"):
                    source = dict(source)
                    path = stage / "sources" / (source["sha"] + ".bin")
                    file = source_blob(connection, source, path, api)
                    artifacts.append(file)
                    objects[source["id"]] = {"bytes": file["bytes"], "sha256": file["sha256"],
                                             "mime": source["mime"], "kind": source["kind"], "url": source["url"]}
                    values.append({key: source[key] for key in ("id", "sha", "kind", "url", "at", "mime")})
                    values[-1]["body"] = {"bytes": file["bytes"], "sha256": file["sha256"]}
            else:
                values = [dict(row) for row in connection.execute("SELECT * FROM " + table)]
            values.sort(key=api["core"].canonical)
            full_tables[table] = values
        for selected in connection.execute("SELECT id FROM records ORDER BY created,id"):
            record = w.get(connection, selected["id"])
            record["history"] = w.history(connection, record["id"])
            records.append(record)
        commands = {row["id"]: {"hash": row["hash"], "result": json.loads(row["result"]), "at": row["at"]}
                    for row in full_tables["commands"]}
    fingerprints = {table: {"rows": len(values), "sha256": api["core"].digest(values)}
                    for table, values in full_tables.items()}
    value = {"schema": "stellar-forge.transport-planning-original-snapshot.v1",
             "workspaceId": state["workspace_id"], "state": state, "tables": full_tables,
             "records": records, "commands": commands, "objects": objects, "fingerprints": fingerprints,
             "engine": app.engine_binding()}
    selected = keep_json(stage / "snapshot.json", value)
    artifacts.append(selected)
    return value, selected, artifacts

def load_snapshot(selected):
    descriptor(selected)
    value = read_json(selected["path"])
    need(value.get("schema") == "stellar-forge.transport-planning-original-snapshot.v1" and
         set(value.get("tables", {})) == set(TABLES), "Select the complete original table snapshot.")
    return value

def compare_prefix(before, after):
    need(before["workspaceId"] == after["workspaceId"] and before["engine"] == after["engine"],
         "Original workspace or evaluator identity changed.")
    for table, fields in IMMUTABLE_KEYS.items():
        old = {tuple(row[key] for key in fields): row for row in before["tables"][table]}
        new = {tuple(row[key] for key in fields): row for row in after["tables"][table]}
        need(len(old) == len(before["tables"][table]) and len(new) == len(after["tables"][table]),
             "Original table key population differs.")
        for key, row in old.items():
            need(new.get(key) == row, "Original complete history changed: " + table)
        if table == "meta":
            need(old == new, "Original workspace metadata changed.")
    current = {row["id"]: row for row in after["records"]}
    for row in before["records"]:
        selected = current.get(row["id"])
        need(selected is not None and selected["kind"] == row["kind"] and selected["created"] == row["created"] and
             selected["revision"] >= row["revision"] and selected["history"][:len(row["history"])] == row["history"],
             "Original record identity or full revision history changed.")
        if selected["revision"] == row["revision"]:
            need(selected == row, "An original record changed without its native revision.")
    for key, value in before["objects"].items():
        need(after["objects"].get(key) == value, "An original source object changed.")
    return {"workspaceId": after["workspaceId"], "preservedOriginalHistory": True}

def compare_action(before, after, operation, api):
    compare_prefix(before, after)
    need(set(operation) == {"request", "actor"}, "Retain the complete original native request and operator.")
    request, actor = operation["request"], operation["actor"]
    need(request.get("command") == "action_save" and isinstance(request.get("args"), dict),
         "The installed receiving course appends an explicit action note through action_save.")
    args, rid = request["args"], request["id"]
    need(rid not in before["commands"] and set(after["commands"]) == set(before["commands"]) | {rid},
         "Exactly one explicit native command must be appended.")
    receipt = after["commands"][rid]
    need(receipt["hash"] == api["core"].digest({"request": request, "actor": actor}),
         "The saved native command fingerprint differs.")
    old = next((row for row in before["records"] if row["id"] == args.get("record_id")), None)
    new = next((row for row in after["records"] if row["id"] == args.get("record_id")), None)
    need(old is not None and old["kind"] == "action" and new is not None and args.get("expected") == old["revision"] and
         new["revision"] == old["revision"] + 1, "Retain the selected original action and its next revision.")
    expected_value = copy.deepcopy(old["value"])
    expected_value["decision_note"] = args.get("decision_note", "").strip()
    need(new["value"] == expected_value, "This receiving note changed a business decision or action definition.")
    need(new["history"][-1]["actor"] == actor and new["history"][-1]["value"] == expected_value,
         "The native action history lost its operator or complete value.")
    actual_result = {key: value for key, value in new.items() if key != "history"}
    need(receipt["result"] == actual_result, "The original complete command reply differs from its saved record.")
    for row in before["records"]:
        if row["id"] != old["id"]:
            need(row == next((x for x in after["records"] if x["id"] == row["id"]), None),
                 "The receiving note changed another original record.")
    need(len(before["records"]) == len(after["records"]), "The receiving note created another record.")
    for table in ("meta", "config", "sources", "dataset_rows"):
        need(before["tables"][table] == after["tables"][table], "The note changed original source or configuration.")
    need(len(after["tables"]["history"]) == len(before["tables"]["history"]) + 1 and
         len(after["tables"]["events"]) == len(before["tables"]["events"]) + 1,
         "The native note must append one history revision and one audit event.")
    return {"workspaceId": after["workspaceId"], "requestId": rid, "recordId": old["id"],
            "revision": new["revision"], "receipt": receipt}

def check_expected(selected, current, exact=True, operation=None, api=None):
    if selected is None:
        return None
    original = load_snapshot(selected)
    if operation is not None:
        return compare_action(original, current, operation, api)
    if exact:
        need(original == current, "The complete original workspace snapshot differs.")
        return {"exact": True, "workspaceId": current["workspaceId"]}
    return compare_prefix(original, current)

def receive_receipt(destination):
    return destination.parent / (".transport-planning-received-" + hashlib.sha256(str(destination).encode()).hexdigest() + ".json")

def received(selected, kind, destination, stage, rows, api, expected=None, current_source=True, preserve_later=False):
    chosen, manifest, members = native_archive(selected, kind, rows, api, current_source)
    destination = Path(destination)
    need(destination.is_absolute() and destination.resolve() == destination, "Select a canonical complete receiving destination.")
    directory(str(destination.parent))
    receipt_path = receive_receipt(destination)
    binding = {"schema": "stellar-forge.transport-planning-native-receiving.v1", "kind": kind,
               "archiveSha256": chosen["sha256"], "archiveBytes": chosen["bytes"], "directory": str(destination)}
    lease = api["bridge"]["receive_lock"](destination)
    artifacts = [chosen]
    try:
        previous = receipt_path.exists()
        if previous:
            need(read_json(receipt_path) == binding, "The receiving destination belongs to another original archive.")
        else:
            need(not destination.exists() or destination.is_dir() and not any(destination.iterdir()),
                 "Start original receiving in a new empty directory.")
            keep_json(receipt_path, binding)
        empty = not destination.exists() or not any(destination.iterdir())
        if empty:
            if kind == "application":
                result = api["delivery"].receive_file(chosen["path"], destination)
                need(result["workspace"] is not None, "Installed receiving requires the original working-data archive.")
                work = Path(result["workspace"])
            else:
                work = api["core"].Workspace.restore_file(chosen["path"], destination).directory
        else:
            directory(str(destination))
            work = destination / "workspace" if kind == "application" else destination
            need((work / "workspace.sqlite").exists(), "The selected original receive has no complete native database.")
        source_directory = destination / "application" if kind == "application" else None
        if source_directory is not None:
            for name, (size, sha) in members.items():
                observed = identity(source_directory / name)
                need(observed["bytes"] == size and observed["sha256"] == sha, "Received complete application member changed: " + name)
            need(read_json(source_directory / "delivery-manifest.json") == manifest, "The received complete source manifest changed.")
        directory(str(work))
        with lock(work / "transport-planning-operator.lock"):
            current, snapshot_file, captured = snapshot(work, stage / "received-state", api)
            check_expected(expected, current, exact=not preserve_later, api=api)
        artifacts.extend(captured)
        artifacts.append(identity(receipt_path))
        need(descriptor(chosen) == chosen, "The archive changed during original receiving.")
        return {"directory": str(destination), "workspace": str(work), "workspaceId": current["workspaceId"],
                "sourceDirectory": str(source_directory) if source_directory else None,
                "snapshot": snapshot_file, "archive": chosen, "manifest": manifest}, artifacts
    finally:
        os.close(lease)

def edition_exports(current, stage, api):
    values, artifacts = [], []
    for record in current["records"]:
        if record["kind"] not in EDITIONS:
            continue
        original = {key: value for key, value in record.items() if key != "history"}
        for format_ in ("zip", "html", "json", "csv"):
            body, filename, mime = api["exports"].edition_bytes(original, format_)
            file = keep_bytes(stage / "editions" / (record["id"] + "." + format_), body)
            values.append({"recordId": record["id"], "format": format_, "filename": filename, "mediaType": mime, "file": file})
            artifacts.append(file)
    return values, artifacts

def archive_export(path, invoke, kind, rows, api):
    if not path.exists():
        invoke(path)
    selected = identity(path)
    native_archive(selected, kind, rows, api)
    return selected

def original_donor(request, stage, rows, api):
    outer = descriptor(request["archive"])
    roster = archive_inventory(outer["path"])
    indexed = {row["path"]: row for row in roster}
    members = {}
    for field in ("outcomeMember", "exampleResultMember", "applicationMember", "recoveryMember"):
        name = relative(request[field])
        need(name in indexed, "The complete original donor omits: " + name)
        members[field] = extract_member(outer["path"], name, stage / "original" / name, indexed[name])
    outcome, example = read_json(members["outcomeMember"]["path"]), read_json(members["exampleResultMember"]["path"])
    need(outcome.get("operation") == request["operationId"] == example.get("operation") and outcome.get("business") == example,
         "The completed original programme identity or full result differs.")
    browser = outcome.get("browser")
    need(isinstance(browser, dict) and browser.get("exit_code") == 0 and not browser.get("error") and
         browser.get("errors") == [] and isinstance(browser.get("closed"), str),
         "Use the actual complete original browser result from its existing operation.")
    pages = ("overview", "sources", "services", "performance", "scenarios", "actions", "reports", "delivery")
    expected_views = {(mode, name) for mode in ("desktop", "phone") for name in pages}
    observed_views = {(view.get("mode"), view.get("name")) for view in browser.get("views", [])}
    need(observed_views == expected_views and len(browser["views"]) == len(expected_views) and
         not any(view.get("overflow") for view in browser["views"]), "Retain all original desktop and phone application views.")
    def original_member(file, base):
        path = relative(base + "/" + Path(file).name)
        need(path in indexed, "Original output is absent from the full donor: " + path)
        return path, indexed[path]
    for view in browser["views"]:
        original_member(view["file"], "screens")
    for download in browser.get("downloads", []):
        original_member(download["file"], "screens")
    for doc in outcome.get("documents", []):
        name, selected = original_member(doc["pdf"], "commercial")
        need(all(doc[key] == selected[key] for key in ("bytes", "sha256")), "Original commercial document bytes differ.")
    for field, original in (("applicationMember", example["application"]), ("recoveryMember", example["recovery"])):
        need(all(members[field][key] == original[key] for key in ("bytes", "sha256")), "Original native archive descriptor differs.")
    for edition in example.get("editions", []):
        name, selected = original_member(edition["file"], "programme/outputs")
        need(all(edition[key] == selected[key] for key in ("bytes", "sha256")), "An original complete edition differs.")
    application, app_manifest, _ = native_archive(members["applicationMember"], "application", rows, api)
    recovery, recovery_manifest, _ = native_archive(members["recoveryMember"], "recovery", rows, api)
    app, app_artifacts = received(application, "application", stage / "original-application", stage / "application-check",
                                  rows, api)
    recovering, recovery_artifacts = received(recovery, "recovery", stage / "original-recovery", stage / "recovery-check",
                                             rows, api, expected=app["snapshot"])
    current = load_snapshot(app["snapshot"])
    need(current["fingerprints"] == example["workspace_fingerprints"] and current["engine"] == example["engine"] and
         current["state"]["commands"] == example["commands"] and len(current["records"]) == example["records"] and
         app["workspaceId"] == recovering["workspaceId"] == recovery_manifest["workspace_id"],
         "The complete original programme differs from both independently received workspaces.")
    report = next((row for row in current["records"] if row["id"] == example["report"]), None)
    need(report is not None and report["kind"] == "report", "The original final report is absent.")
    complete_formats = {(record["id"], format_) for record in current["records"] if record["kind"] in EDITIONS
                        for format_ in ("zip", "html", "json", "csv")}
    need({(row["record_id"], row["format"]) for row in example["editions"]} == complete_formats and
         len(example["editions"]) == len(complete_formats), "Retain every original published edition and all four formats.")
    for item in example["editions"]:
        record = next(row for row in current["records"] if row["id"] == item["record_id"])
        raw, _, _ = api["exports"].edition_bytes({key: value for key, value in record.items() if key != "history"}, item["format"])
        need(digest_bytes(raw) == {key: item[key] for key in ("bytes", "sha256")}, "Original edition bytes differ from the saved native record.")
    inventory = keep_json(stage / "original-inventory.json", {"archive": outer, "files": roster})
    artifacts = [outer, inventory, *members.values(), *app_artifacts, *recovery_artifacts]
    return {"operationId": request["operationId"], "outer": outer, "outcome": members["outcomeMember"],
            "exampleResult": members["exampleResultMember"], "application": application, "recovery": recovery,
            "snapshot": app["snapshot"], "inventory": inventory, "workspaceId": current["workspaceId"]}, artifacts

def bundle(request, stage):
    files = request["files"]
    need(isinstance(files, list) and files, "Select the whole outgoing artifact population.")
    names = set()
    for row in files:
        name = relative(row["name"])
        need(name not in names and name != "HANDOVER-MANIFEST.json", "Duplicate outgoing member.")
        names.add(name); descriptor(row)
    manifest = {"schema": "stellar-forge.transport-planning-installed-handover.v1",
                "files": [{"path": row["name"], "bytes": row["bytes"], "sha256": row["sha256"]} for row in files]}
    output = stage / "installed-handover.zip"
    expected = {row["path"]: row for row in manifest["files"]}
    expected["HANDOVER-MANIFEST.json"] = {"path": "HANDOVER-MANIFEST.json", **digest_bytes(canonical(manifest))}
    if not output.exists():
        with api_atomic_output(output) as temporary:
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                for row in files:
                    with Path(row["path"]).open("rb") as incoming, archive.open(row["name"], "w", force_zip64=True) as target:
                        check, size = hashlib.sha256(), 0
                        for chunk in iter(lambda: incoming.read(1048576), b""):
                            target.write(chunk); check.update(chunk); size += len(chunk)
                        need(size == row["bytes"] and check.hexdigest() == row["sha256"], "A selected outgoing file changed.")
                archive.writestr("HANDOVER-MANIFEST.json", canonical(manifest))
    roster = archive_inventory(output)
    need({row["path"] for row in roster} == set(expected) and all(
        row["bytes"] == expected[row["path"]]["bytes"] and row["sha256"] == expected[row["path"]]["sha256"] for row in roster),
        "The complete outgoing archive differs.")
    inventory = keep_json(stage / "outgoing-inventory.json", roster)
    return {"archive": identity(output), "inventory": inventory, "manifest": manifest}, [identity(output), inventory]

@contextlib.contextmanager
def api_atomic_output(output):
    temporary = output.with_name(output.name + "." + secrets.token_hex(8) + ".writing")
    try:
        yield temporary
        os.chmod(temporary, 0o600)
        with temporary.open("rb") as incoming:
            os.fsync(incoming.fileno())
        need(not output.exists(), "The outgoing archive was already published.")
        os.link(temporary, output); fsync_directory(output.parent)
    finally:
        temporary.unlink(missing_ok=True)

def operate(request, stage, rows, api):
    action = request["action"]
    artifacts = []
    if action == "inspect-original":
        value, artifacts = original_donor(request, stage, rows, api)
    elif action in ("receive", "inspect-archive", "replay-receive"):
        destination = stage / "archive-workspace" if action == "inspect-archive" else Path(request["directory"])
        value, artifacts = received(request["archive"], request["kind"], destination, stage, rows, api,
                                    expected=request.get("expectedSnapshot"), current_source=request.get("currentSource", True),
                                    preserve_later=action == "replay-receive")
        roster = archive_inventory(request["archive"]["path"])
        value["inventory"] = keep_json(stage / "archive-inventory.json", roster)
        artifacts.append(value["inventory"])
    elif action in ("audit", "export", "replay-command"):
        work = directory(request["workspace"])
        with lock(work / "transport-planning-operator.lock"):
            before, snap, captured = snapshot(work, stage / "before", api)
            artifacts.extend(captured)
            check_expected(request.get("expectedSnapshot"), before, exact=request.get("exact", True),
                           operation=request.get("operation") if action == "audit" else None, api=api)
            value = {"workspace": str(work), "workspaceId": before["workspaceId"], "snapshot": snap}
            if action == "export":
                application = archive_export(stage / "application.zip",
                    lambda path: api["delivery"].package_to(path, api["core"].Workspace(work)), "application", rows, api)
                recovery = archive_export(stage / "recovery.zip",
                    lambda path: api["core"].Workspace(work).export_to(path), "recovery", rows, api)
                editions, outgoing = edition_exports(before, stage, api)
                after, after_file, after_artifacts = snapshot(work, stage / "after", api)
                need(before == after, "Original source changed while exporting.")
                value.update(application=application, recovery=recovery, editions=editions,
                    sources=[{"id": source_id, "file": next(row for row in captured
                        if row["sha256"] == selected["sha256"] and row["bytes"] == selected["bytes"])}
                             for source_id, selected in before["objects"].items()])
                artifacts.extend([application, recovery, *outgoing, *after_artifacts])
            elif action == "replay-command":
                operation = request["operation"]
                rid = operation["request"]["id"]
                receipt = before["commands"].get(rid)
                need(receipt is not None and receipt["hash"] == api["core"].digest(operation),
                     "Replay only the exact command already saved by the original workspace.")
                result = api["core"].Workspace(work).command(operation["request"], operation["actor"])
                need(result == receipt["result"], "The exact saved original reply changed.")
                after, after_file, after_artifacts = snapshot(work, stage / "after", api)
                need(after == before, "An original command replay changed the workspace.")
                value.update(result=result, receipt=receipt, reused=True)
                artifacts.extend(after_artifacts)
    elif action == "compare":
        before, after = load_snapshot(request["before"]), load_snapshot(request["after"])
        value = (compare_action(before, after, request["operation"], api) if request.get("operation")
                 else compare_prefix(before, after))
        artifacts.extend([descriptor(request["before"]), descriptor(request["after"])])
    elif action == "bundle":
        value, artifacts = bundle(request, stage)
    else:
        raise ValueError("Unsupported original receiving action.")
    unique = {}
    for row in artifacts:
        key = row["path"]
        need(key not in unique or unique[key] == row, "An output path changed during receiving.")
        unique[key] = row
    return finish(stage, request, value, list(unique.values()))

def stopped(signum, frame):
    raise KeyboardInterrupt("The original receiving helper was stopped.")

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--selection", required=True)
    parser.add_argument("--request", required=True)
    parser.add_argument("--directory", required=True)
    args = parser.parse_args(argv)
    for selected_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(selected_signal, stopped)
    selected = read_json(args.selection)
    root = directory(args.directory, create=True)
    request = read_json(args.request)
    need(isinstance(request.get("id"), str) and IDENTIFIER.fullmatch(request["id"]), "Invalid retained step identity.")
    need(request.get("action") in ("inspect-original", "receive", "inspect-archive", "audit",
         "export", "replay-command", "replay-receive", "compare", "bundle"), "Unsupported original receiving action.")
    with lock(root / "helper.lock"):
        keep_json(root / "source-selection.json", selected)
        _, rows, api = source_selection(selected)
        stage = directory(str(root / "steps" / request["id"]), create=True)
        keep_json(stage / "request.json", request)
        result = reopen_candidate(stage, request)
        if result is None:
            result = operate(request, stage, rows, api)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return result

if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        print(json.dumps({"ok": False, "error": {"type": type(error).__name__, "message": str(error)}}),
              file=sys.stderr, flush=True)
        raise SystemExit(1)
