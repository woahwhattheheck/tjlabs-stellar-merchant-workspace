"""Complete Dataverse delivery beside the original grant-portfolio receiver.

A handover freezes one selected original portfolio, all related native evidence,
both explicitly selected native solution formats and the declared application
source. Receiving uses the original source projector/revision commit functions.
It never dispatches a tenant request or makes received old operations runnable.
"""
from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import sqlite3
import stat
import tempfile
import uuid
import zipfile

from dataverse_contract import (
    DataverseError, require, parse_json, json_bytes, identity, sha256, clone,
    exact_keys, identifier, HASH, binary, validate_exchange, validate_snapshot,
)
from dataverse_packages import inspect_solution, MAX_NATIVE_ZIP
from dataverse_solution import validate_spec, verify_plan
from dataverse_client import now
from dataverse_workspace import (
    WORKSPACE_EXTENSION_SCHEMA, NATIVE_PARENT_ACTIONS, record, record_identity,
    put_record, _parse_row,
)

DELIVERY_SCHEMA = "tjlabs.pmrs.dataverse-delivery/v1"
MAX_PACKET = 4 * 1024 * 1024 * 1024
MAX_MEMBERS = 200000
MAX_ROW = 256 * 1024 * 1024
BLOCK = 131072
TABLE_FILES = {
    "records": "evidence/records.jsonl",
    "requests": "evidence/requests.jsonl",
    "native_requests": "evidence/native-requests.jsonl",
    "steps": "evidence/steps.jsonl",
    "events": "evidence/events.jsonl",
    "originals": "evidence/received-originals.jsonl",
}
MANDATORY_SOURCE = [
    "grant-portfolio/workspace.py", "grant-portfolio/domain.py",
    "grant-portfolio/managed.py", "grant-portfolio/source-files.json",
    "grant-portfolio/dataverse_contract.py", "grant-portfolio/dataverse_solution.py",
    "grant-portfolio/dataverse_security.py",
    "grant-portfolio/dataverse_client.py", "grant-portfolio/dataverse_runtime.py",
    "grant-portfolio/dataverse_packages.py", "grant-portfolio/dataverse_workspace.py",
    "grant-portfolio/dataverse_portable.py", "grant-portfolio/dataverse_cli.py",
    "grant-portfolio/workspace_extensions.py", "grant-portfolio/dataverse_http.py",
    "grant-portfolio/staff_native.py", "grant-portfolio/staff_programme.py",
    "grant-portfolio/DATAVERSE_RECEIVING.md",
]

def _name(value):
    require(isinstance(value, str) and value and len(value) <= 2048
            and not value.startswith("/") and "\\" not in value and ":" not in value
            and all(x not in ("", ".", "..") and not x.endswith((" ", ".")) for x in value.split("/"))
            and not any(ord(x) < 32 for x in value), "DELIVERY_PATH", "Use ordinary portable relative member names.")
    return value

def _directory(path):
    path = Path(path)
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(path.is_dir() and not path.is_symlink()
            and path.resolve() == path.absolute(), "DELIVERY_DIRECTORY", "Retain an ordinary private delivery directory.")
    path.chmod(0o700)
    return path

def _sync(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def _info(path):
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode), "DELIVERY_FILE", "The declared member must be an ordinary complete file.")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            size, digest = 0, hashlib.sha256()
            while block := stream.read(BLOCK):
                size += len(block)
                digest.update(block)
        after = os.fstat(descriptor)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
                and size == after.st_size, "DELIVERY_FILE_CHANGED", "A declared file changed during its complete read.")
        return {"bytes": size, "sha256": digest.hexdigest()}
    finally:
        os.close(descriptor)

def _file_equals(path, expected):
    actual = _info(path)
    require(actual == {"bytes": expected["bytes"], "sha256": expected["sha256"]},
            "DELIVERY_FILE_CHANGED", "The complete retained member differs.", file=Path(path).name)
    return actual

def _publish(temporary, target, expected):
    temporary, target = Path(temporary), Path(target)
    _file_equals(temporary, expected)
    with temporary.open("rb") as stream:
        os.fsync(stream.fileno())
    try:
        os.link(temporary, target)
    except FileExistsError:
        _file_equals(target, expected)
    _file_equals(target, expected)
    _sync(target.parent)
    # Only this completed, verified duplicate is retired. Failed prefixes are
    # preserved with their original unique attempt filenames.
    temporary.unlink()
    _sync(target.parent)
    return target

def _write(target, data):
    target = Path(target)
    _directory(target.parent)
    expected = {"bytes": len(data), "sha256": sha256(data)}
    if target.exists():
        _file_equals(target, expected)
        _sync(target.parent)
        return target
    descriptor, name = tempfile.mkstemp(prefix="attempt-", suffix=".partial", dir=target.parent)
    with os.fdopen(descriptor, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    return _publish(name, target, expected)

def _copy(source, target, expected):
    target = Path(target)
    _directory(target.parent)
    if target.exists():
        _file_equals(target, expected)
        _sync(target.parent)
        return target
    descriptor, name = tempfile.mkstemp(prefix="attempt-", suffix=".partial", dir=target.parent)
    origin = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(origin)
        require(stat.S_ISREG(before.st_mode), "DELIVERY_SOURCE", "Select an ordinary original file.")
        with os.fdopen(descriptor, "wb") as output, os.fdopen(origin, "rb", closefd=False) as stream:
            while block := stream.read(BLOCK):
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
        after = os.fstat(origin)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                "DELIVERY_SOURCE_CHANGED", "The selected original changed while copying.")
    finally:
        os.close(origin)
    return _publish(name, target, expected)

def _json(path):
    path = Path(path)
    require(path.stat().st_size <= MAX_ROW, "DELIVERY_JSON_SIZE", "The complete receiving JSON exceeds the declared bound.")
    raw = path.read_bytes()
    value = parse_json(raw, maximum=MAX_ROW)
    require(raw == json_bytes(value), "DELIVERY_CANONICAL", "Retain the exact canonical manifest bytes.")
    return value

def _rows(stream):
    while True:
        line = stream.readline(MAX_ROW + 1)
        if not line:
            break
        require(len(line) <= MAX_ROW and line.endswith(b"\n"), "DELIVERY_ROW_SIZE", "A retained original row is incomplete or oversized.")
        value = parse_json(line, maximum=MAX_ROW)
        require(line == json_bytes(value), "DELIVERY_CANONICAL_ROW", "A retained original row has another byte representation.")
        yield value

def _save_rows(path, rows):
    path = Path(path)
    _directory(path.parent)
    descriptor, name = tempfile.mkstemp(prefix="rows-", suffix=".partial", dir=path.parent)
    count, digest, size = 0, hashlib.sha256(), 0
    with os.fdopen(descriptor, "wb") as output:
        for row in rows:
            data = json_bytes(row)
            require(len(data) <= MAX_ROW, "DELIVERY_ROW_SIZE", "A complete retained row exceeds the declared receiving bound.")
            output.write(data)
            digest.update(data)
            count += 1
            size += len(data)
            require(size <= MAX_PACKET, "DELIVERY_TABLE_SIZE", "A complete evidence table exceeds the handover bound.")
        output.flush()
        os.fsync(output.fileno())
    expected = {"bytes": size, "sha256": digest.hexdigest()}
    _publish(name, path, expected)
    return {**expected, "rows": count}

def _scope(wrapper, selected):
    binding = wrapper.get("portfolio")
    return bool(binding and binding["id"] == selected["id"] and binding["revision"] <= selected["revision"])

def _parent_rows(db, selected):
    from domain import parse
    for row in db.execute("SELECT body FROM requests ORDER BY id"):
        original = parse(row["body"])
        payload = original.get("input", {}).get("payload", {})
        binding = payload.get("portfolio")
        if original.get("action") == "dataverse.delivery.receive" and original.get("state") == "COMPLETED":
            binding = original.get("result", {}).get("portfolio")
        if original.get("action") in NATIVE_PARENT_ACTIONS and binding and binding.get("id") == selected["id"] \
                and isinstance(binding.get("revision"), int) and binding["revision"] <= selected["revision"]:
            yield original

def _frozen_database(workspace, original, selected, folder):
    target = folder / "original-selection.sqlite"
    def verify(path):
        connection = sqlite3.connect("file:" + str(path) + "?mode=ro", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            from domain import parse, digest
            marker = connection.execute("SELECT value FROM meta WHERE key='workspaceId'").fetchone()
            require(marker and marker[0] == workspace.marker["workspaceId"], "DELIVERY_WORKSPACE", "The frozen original workspace differs.")
            row = connection.execute("SELECT body FROM requests WHERE id=?", (original["id"],)).fetchone()
            require(row is not None, "DELIVERY_REQUEST", "The frozen database omits its original admitted request.")
            request = parse(row[0])
            require(request["input"] == original["input"] and request["inputSha256"] == original["inputSha256"]
                    == digest(request["input"]), "DELIVERY_REQUEST", "The original frozen request differs.")
            retained = workspace.portfolio(selected["id"], selected["revision"], connection)
            require(retained == selected, "DELIVERY_PORTFOLIO", "The frozen original selected portfolio differs.")
            return {"workspace_revision": workspace.current_revision(connection), "database": _info(path)}
        finally:
            connection.close()
    if target.exists():
        return target, verify(target)
    # Workspace.execute holds the existing execution lock; no outer write
    # transaction is open. The snapshot uses the same SQLite/owner lock.
    with workspace.mutex:
        descriptor, temporary = tempfile.mkstemp(prefix="snapshot-", suffix=".partial", dir=folder)
        os.close(descriptor)
        destination = sqlite3.connect(temporary, isolation_level=None)
        try:
            with workspace.reader() as source:
                source.execute("SELECT value FROM meta WHERE key='revision'").fetchone()
                source.backup(destination)
            destination.execute("PRAGMA journal_mode=DELETE")
        finally:
            destination.close()
        expected = _info(temporary)
        verify(temporary)
        _publish(temporary, target, expected)
    return target, verify(target)

def _snapshot_evidence(workspace, frozen, selected, files_root):
    database = sqlite3.connect("file:" + str(frozen) + "?mode=ro", uri=True)
    database.row_factory = sqlite3.Row
    try:
        records = [_parse_row(row) for row in database.execute(
            "SELECT body FROM dataverse_records WHERE portfolio_id=? AND portfolio_revision<=? ORDER BY id",
            (selected["id"], selected["revision"]))]
        for item in records:
            require(_scope(item, selected), "DELIVERY_SCOPE", "A native record lies outside the frozen portfolio history.")
        requests = list(_parent_rows(database, selected))
        operations = {x["id"] for x in requests}
        all_ids = {x["operation_id"] for x in records if x["workspace_id"] == workspace.marker["workspaceId"]}
        require(all_ids <= operations, "DELIVERY_PARENT_MISSING", "An original native record has no retained admitted operation.")
        table_rows = {
            "records": records, "requests": requests,
            "native_requests": [], "steps": [], "events": [], "originals": [],
        }
        for operation_id in sorted(operations):
            for key, table in (("native_requests", "dataverse_native_requests"),
                               ("steps", "dataverse_steps"), ("events", "dataverse_events")):
                order = "request_id" if key == "native_requests" else "key" if key == "steps" else "sequence"
                for row in database.execute("SELECT * FROM " + table + " WHERE operation_id=? ORDER BY " + order,
                                            (operation_id,)):
                    value = dict(row)
                    value["body"] = _parse_row(row)
                    table_rows[key].append(value)
        # Received histories remain original provenance. Include each complete
        # source handover containing a selected record; never recast its old
        # provider requests as requests admitted by this receiving workspace.
        wanted = {x["id"] for x in records if x["workspace_id"] != workspace.marker["workspaceId"]}
        origins = set()
        all_originals = list(database.execute("SELECT * FROM dataverse_originals ORDER BY origin,kind,id"))
        for row in all_originals:
            if row["kind"] == "records" and row["id"] in wanted:
                origins.add(row["origin"])
        for row in all_originals:
            if row["origin"] in origins:
                value = dict(row)
                value["body"] = _parse_row(row)
                table_rows["originals"].append(value)
        stats = {}
        for key, name in TABLE_FILES.items():
            stats[key] = _save_rows(files_root / name, table_rows[key])
        return records, table_rows, stats
    finally:
        database.close()

def _object_ids(table_rows):
    result = set()
    def add(value):
        require(isinstance(value, str) and HASH.fullmatch(value), "DELIVERY_OBJECT_REFERENCE",
                "Retain the exact original native object's SHA-256.")
        result.add(value)
    def native_record(wrapper):
        kind, value = wrapper["kind"], wrapper["value"]
        if kind in ("spec", "profile", "delivery", "receiving"):
            add(value["object"])
        if kind == "export":
            add(value["archive_object"]["sha256"])
    def native_request(original):
        payload = original["input"]["payload"]
        for key in ("object", "archiveObject", "settingsObject", "programmeObject"):
            if key in payload:
                add(payload[key])
    for value in table_rows["records"]:
        native_record(value)
    for value in table_rows["requests"]:
        native_request(value)
    for row in table_rows["originals"]:
        if row["kind"] == "records":
            native_record(row["body"])
        elif row["kind"] == "requests":
            native_request(row["body"])
        elif row["kind"] == "handover":
            add(row["body"]["source_archive_sha256"])
    return result

def _export_pairs(records, record_ids):
    by_id = {row["id"]: row for row in records}
    require(isinstance(record_ids, list) and record_ids and len(record_ids) <= 2000
            and len(record_ids) == len(set(record_ids)), "DELIVERY_SELECTION", "Select distinct complete native record IDs.")
    require(set(record_ids) <= set(by_id), "DELIVERY_RECORD_MISSING", "A selected native record is absent from the frozen portfolio history.")
    snapshots = {row["value"]["id"]: row["value"] for row in records if row["kind"] == "snapshot"}
    groups = {}
    for ident in record_ids:
        wrapper = by_id[ident]
        value = wrapper["value"]
        require(value.get("state", "COMPLETE") == "COMPLETE", "DELIVERY_INCOMPLETE_RECORD",
                "A selected acceptance record has not completed; its pending evidence remains in history.", record_id=ident)
        if wrapper["kind"] != "export":
            continue
        raw = binary(value["archive"], "native selected export", MAX_NATIVE_ZIP)
        inspection = inspect_solution(raw)
        require(inspection == value["inspection"], "DELIVERY_EXPORT_CHANGED", "The actual selected solution ZIP inspection differs.")
        solution = inspection["solution"]
        snapshot = snapshots.get(value["binding"]["snapshot_id"])
        require(snapshot and identity(snapshot) == value["binding"]["snapshot_sha256"],
                "DELIVERY_EXPORT_SOURCE", "The actual export's original target capture is missing.")
        before, after = value["source_before"]["solution"], value["source_after"]["solution"]
        require(before == after and value["source_bracket_equal"] is True
                and before.get("uniquename") == solution["unique_name"]
                and before.get("version") == solution["version"], "DELIVERY_EXPORT_BRACKET",
                "The selected native export has a changed or unmatched source solution bracket.")
        signature = {"unique_name": solution["unique_name"], "version": solution["version"],
                     "publisher_unique_name": solution["publisher_unique_name"],
                     "customization_prefix": solution["customization_prefix"],
                     "organization_id": snapshot["profile"]["organization_id"],
                     "source_solution_id": before.get("solutionid")}
        require(signature["source_solution_id"], "DELIVERY_EXPORT_SOURCE", "The native source solution ID is missing.")
        key = identity(signature)
        group = groups.setdefault(key, {"solution": signature})
        mode = "managed" if solution["managed"] else "unmanaged"
        require(mode not in group, "DELIVERY_EXPORT_PAIR", "Select one actual export of each format per solution release.")
        group[mode] = {"record_id": ident, "bytes": len(raw), "sha256": inspection["sha256"],
                       "native_return": value["native_return"]}
    require(groups and all("managed" in x and "unmanaged" in x for x in groups.values()),
            "DELIVERY_BOTH_FORMATS", "The handover requires both actual managed and unmanaged exports of the same source solution release.")
    return [groups[key] for key in sorted(groups)]

def _application_inventory():
    from managed import sourceFileList
    from workspace import SDK
    names = list(sourceFileList())
    require(names and names == sorted(set(names)) and set(MANDATORY_SOURCE) <= set(names),
            "DELIVERY_APPLICATION_CLOSURE", "Install the complete declared ALM and original application source before delivery.")
    folded = set()
    result = {}
    for name in names:
        _name(name)
        require(name.casefold() not in folded, "DELIVERY_APPLICATION_PATH", "Declared application names collide on receiving platforms.")
        folded.add(name.casefold())
        path = SDK / PurePosixPath(name)
        require(path.resolve() == path.absolute(), "DELIVERY_APPLICATION_ALIAS", "Declared application files must be ordinary original paths.")
        result[name] = _info(path)
    return result

def _validate_frozen_file(path, descriptor):
    _file_equals(path, descriptor)

def _capture(workspace, original, selected, record_ids, folder):
    complete = folder / "capture.json"
    if complete.exists():
        capture = _json(complete)
        require(capture["operation_id"] == original["id"]
                and capture["input_sha256"] == original["inputSha256"]
                and capture["portfolio"] == {k: selected[k] for k in ("id", "revision", "snapshot")}
                and capture["selected_record_ids"] == record_ids, "DELIVERY_CAPTURE_INPUT",
                "This original delivery already froze another complete input.")
        for name, descriptor in capture["files"].items():
            _validate_frozen_file(folder / "files" / _name(name), descriptor)
        return capture
    database, frozen = _frozen_database(workspace, original, selected, folder)
    inventory_path = folder / "application-intent.json"
    if inventory_path.exists():
        application = _json(inventory_path)
    else:
        application = {"schema": DELIVERY_SCHEMA + ".application", "files": _application_inventory()}
        _write(inventory_path, json_bytes(application))
    files_root = _directory(folder / "files")
    records, table_rows, stats = _snapshot_evidence(workspace, database, selected, files_root)
    pairs = _export_pairs(records, record_ids)
    # Call the original complete portfolio exporter unchanged. It chooses its
    # own immutable revision archive; the outer handover preserves those bytes.
    native = workspace._prepare_export({"portfolioId": selected["id"], "revision": selected["revision"]})
    require(native["portfolioId"] == selected["id"] and native["revision"] == selected["revision"]
            and native["snapshot"] == selected["snapshot"], "DELIVERY_ORIGINAL_EXPORT", "The original portfolio export differs.")
    native_path = workspace.root / "exports" / selected["snapshot"] / "grant-portfolio-complete.zip"
    portfolio_name = "portfolio/grant-portfolio-complete.zip"
    _copy(native_path, files_root / portfolio_name, native)
    files = {name: {k: stats[key][k] for k in ("bytes", "sha256")} for key, name in TABLE_FILES.items()}
    files[portfolio_name] = {k: native[k] for k in ("bytes", "sha256")}
    object_ids = _object_ids(table_rows)
    for digest in sorted(object_ids):
        path = workspace.object(digest)
        descriptor = _info(path)
        require(descriptor["sha256"] == digest, "DELIVERY_OBJECT", "An original native source object changed.")
        name = "objects/" + digest
        _copy(path, files_root / name, descriptor)
        files[name] = descriptor
    from workspace import SDK
    for name, descriptor in application["files"].items():
        target = files_root / "application" / PurePosixPath(name)
        # Once a complete frozen member exists it is verified independently of
        # any subsequently deployed application source.
        if target.exists():
            _file_equals(target, descriptor)
        else:
            _copy(SDK / PurePosixPath(name), target, descriptor)
        files["application/" + name] = descriptor
    application_name = "application-source.json"
    _write(files_root / application_name, json_bytes(application))
    files[application_name] = _info(files_root / application_name)
    guide = (
        "# Complete Dataverse and grant-portfolio handover\n\n"
        "Start with application/grant-portfolio/DATAVERSE_RECEIVING.md. Verify this whole archive, "
        "then receive its exact original portfolio through the same maintained Workspace. "
        "Both selected native solution formats are complete provider exports. Their source solution identity, "
        "version and before/after metadata agree; they are separate exports, not an atomic tenant snapshot. "
        "All related original request, target, import-job and correction observations remain evidence. "
        "A received target profile contains an environment-variable name, never its bearer-token value. "
        "Reopening does not authenticate, apply metadata, import solutions or replay old provider requests. "
        "An administrator must explicitly save a local target profile and select a new native action. "
        "Continue ordinary portfolio edits and reviews using their original revision rules.\n"
    ).encode()
    _write(files_root / "README.md", guide)
    files["README.md"] = _info(files_root / "README.md")
    capture = {"schema": DELIVERY_SCHEMA + ".capture", "operation_id": original["id"],
               "input_sha256": original["inputSha256"], "original_input": clone(original["input"]),
               "created_at": original["createdAt"], "workspace_id": workspace.marker["workspaceId"],
               "workspace_revision": frozen["workspace_revision"],
               "portfolio": {k: selected[k] for k in ("id", "revision", "snapshot")},
               "selected_record_ids": clone(record_ids), "export_pairs": pairs, "tables": stats,
               "portfolio_archive": {"file": portfolio_name, **native}, "application_manifest": application_name,
               "files": dict(sorted(files.items()))}
    _write(complete, json_bytes(capture))
    return capture

def prepare_delivery(workspace, original, selected, record_ids):
    folder = _directory(workspace.root / "dataverse-deliveries" / identity({"operation_id": original["id"]}))
    capture = _capture(workspace, original, selected, record_ids, folder)
    manifest = {k: clone(v) for k, v in capture.items() if k != "schema"}
    manifest["schema"] = DELIVERY_SCHEMA
    manifest = {"id": "delivery-" + identity(manifest), **manifest}
    _write(folder / "manifest.json", json_bytes(manifest))
    target = folder / "dataverse-complete.zip"
    if target.exists():
        inspected = inspect_delivery(target)
        require(inspected["manifest"] == manifest, "DELIVERY_PUBLICATION_CONFLICT", "The original delivery already has another complete archive.")
        _sync(folder)
    else:
        descriptor, temporary = tempfile.mkstemp(prefix="archive-", suffix=".partial", dir=folder)
        os.close(descriptor)
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            for name, expected in manifest["files"].items():
                path = folder / "files" / _name(name)
                _file_equals(path, expected)
                info = zipfile.ZipInfo(name)
                info.external_attr = 0o100600 << 16
                with archive.open(info, "w", force_zip64=True) as output, path.open("rb") as stream:
                    digest, size = hashlib.sha256(), 0
                    while block := stream.read(BLOCK):
                        output.write(block)
                        digest.update(block)
                        size += len(block)
                require({"bytes": size, "sha256": digest.hexdigest()} == expected,
                        "DELIVERY_SOURCE_CHANGED", "A frozen member changed while archiving.")
            info = zipfile.ZipInfo("manifest.json")
            info.external_attr = 0o100600 << 16
            archive.writestr(info, json_bytes(manifest))
        info = _info(temporary)
        require(info["bytes"] <= MAX_PACKET, "DELIVERY_SIZE", "The complete selected handover exceeds 4 GiB.")
        inspect_delivery(Path(temporary))
        _publish(temporary, target, info)
    descriptor = _info(target)
    with target.open("rb") as stream:
        uploaded = workspace.upload(stream, descriptor["bytes"])
    require(uploaded["sha256"] == descriptor["sha256"], "DELIVERY_UPLOAD_CHANGED", "The original delivery retained another archive.")
    value = {"schema": DELIVERY_SCHEMA + ".record", "id": manifest["id"], "state": "COMPLETE",
             "object": uploaded["sha256"], "bytes": descriptor["bytes"], "manifest_sha256": identity(manifest),
             "portfolio": manifest["portfolio"], "selected_record_ids": manifest["selected_record_ids"],
             "export_pairs": manifest["export_pairs"], "source_archive_sha256": uploaded["sha256"],
             "filename": "Dataverse_" + selected["id"] + "_r" + str(selected["revision"]) + ".zip"}
    return put_record(workspace, original, "delivery", value, selected)

def _validate_tables(table_rows, manifest):
    from domain import digest as original_digest
    records = table_rows["records"]
    by_id = {}
    for value in records:
        exact_keys(value, ["schema", "id", "kind", "operation_id", "parent_input_sha256",
                          "workspace_id", "created_at", "portfolio", "value"],
                         ["schema", "id", "kind", "operation_id", "parent_input_sha256",
                          "workspace_id", "created_at", "portfolio", "value"])
        require(value["schema"] == WORKSPACE_EXTENSION_SCHEMA + ".record"
                and value["id"] == record_identity(value["kind"], value["value"], value["workspace_id"], value["portfolio"])
                and _scope(value, manifest["portfolio"]) and value["id"] not in by_id,
                "DELIVERY_RECORD_IDENTITY", "A complete original native record has another scope or identity.")
        by_id[value["id"]] = value
        if value["kind"] == "spec":
            require(validate_spec(value["value"]["spec"]) == value["value"]["spec"], "DELIVERY_SPEC", "The complete original specification differs.")
        elif value["kind"] == "snapshot":
            validate_snapshot(value["value"])
        elif value["kind"] == "staff-history":
            # Complete original native read exchanges and all five immutable
            # members are inline. No tenant read is performed by this verifier.
            from staff_native import verify_capture
            verify_capture(value["value"], value["portfolio"])
        elif value["kind"] == "staff-programme":
            from staff_programme import verify_programme
            verify_programme(value["value"], value["portfolio"])
        elif value["kind"] == "export":
            require(inspect_solution(binary(value["value"]["archive"], "native original export", MAX_NATIVE_ZIP))
                    == value["value"]["inspection"], "DELIVERY_NATIVE_ZIP", "The complete original native export differs.")
    require(_export_pairs(records, manifest["selected_record_ids"]) == manifest["export_pairs"],
            "DELIVERY_EXPORT_PAIR", "The declared managed/unmanaged native export pair differs.")
    requests = {}
    for value in table_rows["requests"]:
        require(value["id"] not in requests and value["action"] in NATIVE_PARENT_ACTIONS
                and value["input"]["operationId"] == value["id"] and value["input"]["action"] == value["action"]
                and value["inputSha256"] == original_digest(value["input"]),
                "DELIVERY_PARENT_IDENTITY", "An original admitted native action has another identity.")
        binding = value["input"]["payload"].get("portfolio")
        if value["action"] == "dataverse.delivery.receive" and value.get("state") == "COMPLETED":
            binding = value.get("result", {}).get("portfolio")
        require(binding and binding["id"] == manifest["portfolio"]["id"]
                and binding["revision"] <= manifest["portfolio"]["revision"],
                "DELIVERY_PARENT_SCOPE", "The native parent belongs to another selected portfolio.")
        requests[value["id"]] = value
    for value in records:
        if value["workspace_id"] == manifest["workspace_id"]:
            parent = requests.get(value["operation_id"])
            require(parent and parent["inputSha256"] == value["parent_input_sha256"],
                    "DELIVERY_RECORD_PARENT", "The native record lacks its exact original admitted action.")
    seen = set()
    for row in table_rows["native_requests"]:
        value, operation_id = row["body"], row["operation_id"]
        key = (operation_id, row["request_id"])
        require(key not in seen and operation_id in requests
                and value["request_id"] == row["request_id"] and value["operation_id"] == operation_id
                and value["parent_input_sha256"] == requests[operation_id]["inputSha256"]
                and row["intent_sha256"] == identity(value["intent"]),
                "DELIVERY_NATIVE_REQUEST", "A complete provider request differs from its original parent.")
        seen.add(key)
        if value.get("exchange") is not None:
            from dataverse_workspace import WorkspaceJournal
            WorkspaceJournal._verify_return(value, value["exchange"])
    seen = set()
    for row in table_rows["steps"]:
        key = (row["operation_id"], row["key"])
        require(key not in seen and row["operation_id"] in requests and row["body_sha256"] == identity(row["body"]),
                "DELIVERY_STEP", "A complete original step result differs.")
        seen.add(key)
    chains = {}
    for row in table_rows["events"]:
        operation_id, body = row["operation_id"], row["body"]
        prior_seq, prior_sha = chains.get(operation_id, (0, None))
        require(operation_id in requests and row["sequence"] == prior_seq + 1
                and row["previous_sha256"] == prior_sha and row["sha256"] == identity(body)
                and body["operation_id"] == operation_id and body["sequence"] == row["sequence"]
                and body["previous_sha256"] == prior_sha, "DELIVERY_EVENT_CHAIN", "The complete native event history is broken.")
        chains[operation_id] = (row["sequence"], row["sha256"])
    origins = set()
    for row in table_rows["originals"]:
        key = (row["origin"], row["kind"], row["id"])
        require(key not in origins and row["body_sha256"] == identity(row["body"]),
                "DELIVERY_ORIGINAL_HISTORY", "A previously received original evidence row differs.")
        origins.add(key)
    # Validate saved plans against the exact source specification/capture leaves.
    for wrapper in records:
        if wrapper["kind"] == "plan":
            value = wrapper["value"]
            spec = by_id.get(value["spec_record_id"])
            snapshot = by_id.get(value["snapshot_record_id"])
            require(spec and snapshot and spec["kind"] == "spec" and snapshot["kind"] == "snapshot",
                    "DELIVERY_PLAN_SOURCE", "The complete original plan source is missing.")
            verify_plan(value["plan"], spec["value"]["spec"], snapshot["value"])

def inspect_delivery(path):
    path = Path(path)
    info = _info(path)
    require(0 < info["bytes"] <= MAX_PACKET, "DELIVERY_SIZE", "Select a complete bounded handover archive.")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        require(len(entries) <= MAX_MEMBERS, "DELIVERY_MEMBERS", "The complete handover has too many entries.")
        names, folded, expanded = set(), set(), 0
        for entry in entries:
            name = _name(entry.filename)
            require(name not in names and name.casefold() not in folded and not entry.is_dir()
                    and not entry.flag_bits & 1 and stat.S_ISREG(entry.external_attr >> 16),
                    "DELIVERY_MEMBER", "The complete handover has repeated, linked, encrypted or non-file members.")
            names.add(name)
            folded.add(name.casefold())
            expanded += entry.file_size
            require(expanded <= MAX_PACKET, "DELIVERY_EXPANSION", "The complete handover exceeds the expanded bound.")
        require("manifest.json" in names and archive.getinfo("manifest.json").file_size <= MAX_ROW,
                "DELIVERY_MANIFEST", "The original complete manifest is missing or oversized.")
        raw = archive.read("manifest.json")
        manifest = parse_json(raw, maximum=MAX_ROW)
        require(raw == json_bytes(manifest) and manifest["schema"] == DELIVERY_SCHEMA
                and manifest["id"] == "delivery-" + identity({k: v for k, v in manifest.items() if k != "id"}),
                "DELIVERY_MANIFEST_IDENTITY", "The original canonical delivery manifest differs.")
        require(names == set(manifest["files"]) | {"manifest.json"}, "DELIVERY_CLOSURE",
                "Retain exactly every declared original member.")
        for name, descriptor in manifest["files"].items():
            exact_keys(descriptor, ["bytes", "sha256"], ["bytes", "sha256"])
            require(type(descriptor["bytes"]) is int and 0 <= descriptor["bytes"] <= MAX_PACKET
                    and HASH.fullmatch(str(descriptor["sha256"])) and archive.getinfo(name).file_size == descriptor["bytes"],
                    "DELIVERY_DESCRIPTOR", "An original complete file descriptor differs.")
            digest, size = hashlib.sha256(), 0
            with archive.open(name) as stream:
                while block := stream.read(BLOCK):
                    size += len(block)
                    digest.update(block)
            require({"bytes": size, "sha256": digest.hexdigest()} == descriptor, "DELIVERY_MEMBER_CHANGED",
                    "An original complete member differs.", file=name)
        table_rows = {}
        for key, name in TABLE_FILES.items():
            require(name in names and manifest["tables"][key]["bytes"] == manifest["files"][name]["bytes"]
                    and manifest["tables"][key]["sha256"] == manifest["files"][name]["sha256"],
                    "DELIVERY_TABLE", "A declared complete evidence table differs.")
            with archive.open(name) as stream:
                table_rows[key] = list(_rows(stream))
            require(len(table_rows[key]) == manifest["tables"][key]["rows"], "DELIVERY_TABLE_ROWS", "The complete evidence row count differs.")
        _validate_tables(table_rows, manifest)
        from domain import digest as original_digest
        require(manifest["operation_id"] == manifest["original_input"]["operationId"]
                and manifest["original_input"]["action"] == "dataverse.delivery.prepare"
                and manifest["input_sha256"] == original_digest(manifest["original_input"])
                and manifest["original_input"]["payload"]["portfolio"] == manifest["portfolio"]
                and manifest["original_input"]["payload"]["recordIds"] == manifest["selected_record_ids"],
                "DELIVERY_REQUEST_IDENTITY", "The complete handover differs from its original admitted request.")
        require(manifest["portfolio_archive"]["file"] in names, "DELIVERY_PORTFOLIO", "The original portfolio ZIP is missing.")
        portfolio_info = manifest["files"][manifest["portfolio_archive"]["file"]]
        require(all(manifest["portfolio_archive"][k] == v for k, v in portfolio_info.items())
                and manifest["portfolio_archive"]["portfolioId"] == manifest["portfolio"]["id"]
                and manifest["portfolio_archive"]["revision"] == manifest["portfolio"]["revision"]
                and manifest["portfolio_archive"]["snapshot"] == manifest["portfolio"]["snapshot"],
                "DELIVERY_PORTFOLIO", "The original portfolio receipt binding differs.")
        app_name = manifest["application_manifest"]
        require(app_name == "application-source.json" and app_name in names, "DELIVERY_APPLICATION", "The complete application manifest is missing.")
        app_raw = archive.read(app_name)
        application = parse_json(app_raw, maximum=MAX_ROW)
        require(app_raw == json_bytes(application) and application["schema"] == DELIVERY_SCHEMA + ".application"
                and set(MANDATORY_SOURCE) <= set(application["files"]), "DELIVERY_APPLICATION", "The original complete declared application is missing.")
        for name, descriptor in application["files"].items():
            _name(name)
            require(manifest["files"].get("application/" + name) == descriptor,
                    "DELIVERY_APPLICATION_CLOSURE", "The exact declared application source closure differs.")
        source_name = "application/grant-portfolio/source-files.json"
        source_manifest = parse_json(archive.read(source_name), maximum=MAX_ROW)
        require(source_manifest.get("schema") == "stellar-forge.grant-portfolio-source-files.v1"
                and source_manifest.get("files") == sorted(application["files"]),
                "DELIVERY_APPLICATION_LIST", "The original managed source list differs from the declared whole application.")
        expected = set(TABLE_FILES.values()) | {"README.md", app_name, manifest["portfolio_archive"]["file"]}
        expected |= {"application/" + name for name in application["files"]}
        objects = _object_ids(table_rows)
        expected |= {"objects/" + digest for digest in objects}
        require(set(manifest["files"]) == expected, "DELIVERY_DECLARED_CLOSURE", "The complete original data/application closure differs.")
    return {"schema": DELIVERY_SCHEMA + ".inspection", "archive": info, "manifest_sha256": sha256(raw),
            "manifest": manifest, "complete": True}

def _extract(workspace, packet, inspected, folder):
    files_root = _directory(folder / "files")
    with zipfile.ZipFile(packet) as archive:
        for name, expected in inspected["manifest"]["files"].items():
            target = files_root / _name(name)
            if target.exists():
                _file_equals(target, expected)
                _sync(target.parent)
                continue
            _directory(target.parent)
            descriptor, temporary = tempfile.mkstemp(prefix="received-", suffix=".partial", dir=target.parent)
            with os.fdopen(descriptor, "wb") as output, archive.open(name) as source:
                while block := source.read(BLOCK):
                    output.write(block)
                output.flush()
                os.fsync(output.fileno())
            _publish(temporary, target, expected)
    _write(folder / "manifest.json", json_bytes(inspected["manifest"]))
    return files_root

def prepare_receiving(workspace, original, object_id):
    packet = workspace.object(object_id)
    inspected = inspect_delivery(packet)
    require(inspected["archive"]["sha256"] == object_id, "RECEIVING_SOURCE", "The uploaded original handover differs.")
    manifest = inspected["manifest"]
    folder = _directory(workspace.root / "dataverse-received" / object_id)
    files_root = _extract(workspace, packet, inspected, folder)
    # No provider calls occur. Every retained object is copied directly to the
    # existing native object store, then the original portfolio receiver runs.
    for name, expected in manifest["files"].items():
        if name.startswith("objects/"):
            with (files_root / name).open("rb") as stream:
                uploaded = workspace.upload(stream, expected["bytes"])
            require(uploaded["sha256"] == name.split("/", 1)[1], "RECEIVING_OBJECT", "An original source object differs.")
    portfolio_name = manifest["portfolio_archive"]["file"]
    with (files_root / portfolio_name).open("rb") as stream:
        uploaded = workspace.upload(stream, manifest["files"][portfolio_name]["bytes"])
    require(uploaded["sha256"] == manifest["portfolio_archive"]["sha256"],
            "RECEIVING_PORTFOLIO_OBJECT", "The original portfolio archive differs.")
    native = workspace._prepare_receive({"object": uploaded["sha256"]})
    require(native["result"]["portfolioId"] == manifest["portfolio"]["id"]
            and native["result"]["revision"] == manifest["portfolio"]["revision"]
            and native["result"]["snapshot"] == manifest["portfolio"]["snapshot"],
            "RECEIVING_PORTFOLIO_IDENTITY", "The original receiver reconstructed another portfolio revision.")
    rows = {}
    for key, name in TABLE_FILES.items():
        with (files_root / name).open("rb") as stream:
            rows[key] = list(_rows(stream))
    # Path-bearing native prepared objects are deliberately kept only in this
    # current call. A restart verifies/reopens the same archive through the
    # original receiver; it does not serialize a host path as portable state.
    return {"native": native, "rows": rows, "manifest": manifest,
            "result": {"schema": DELIVERY_SCHEMA + ".received", "id": "received-" + identity(
                {"workspace_id": workspace.marker["workspaceId"], "operation_id": original["id"], "object": object_id}),
                "state": "COMPLETE", "object": object_id, "source_archive_sha256": object_id,
                "manifest_sha256": inspected["manifest_sha256"], "delivery_id": manifest["id"],
                "source_workspace_id": manifest["workspace_id"], "workspace_id": workspace.marker["workspaceId"],
                "portfolio": clone(manifest["portfolio"]), "native_receiving": native["result"],
                "provider_requests_replayed": 0, "historical_native_evidence_only": True,
                "editable_portfolio": True}}

def _retain_original(workspace, origin, kind, ident, value):
    body, digest = json_bytes(value).decode("utf-8"), identity(value)
    previous = workspace.db.execute("SELECT body_sha256,body FROM dataverse_originals WHERE origin=? AND kind=? AND id=?",
                                    (origin, kind, ident)).fetchone()
    require(previous is None or previous["body_sha256"] == digest and _parse_row(previous) == value,
            "RECEIVING_HISTORY_CONFLICT", "A received original evidence identity has another complete body.")
    workspace.db.execute("INSERT OR IGNORE INTO dataverse_originals VALUES(?,?,?,?,?)", (origin, kind, ident, digest, body))

def adopt_receiving(workspace, prepared):
    """Adopt verified originals inside the caller's existing atomic transaction.

    Support receiving uses this same adoption without creating a synthetic ALM
    child action. It retains the returned original manifest/archive identity in
    its own admitted request result. No provider request is made runnable.
    """
    require(workspace.db.in_transaction, "RECEIVING_TRANSACTION",
            "Adopt the complete original handover inside its existing workspace transaction.")
    from domain import parse, canonical as original_canonical
    native, manifest = prepared["native"], prepared["manifest"]
    for source in native["sources"].values():
        workspace._commit_source(source)
    for revision in native["history"]:
        workspace._commit_revision(revision)
    for original_row in native["originalRequests"]:
        origin, value = original_row["origin"], original_row["request"]
        previous = workspace.db.execute("SELECT body FROM original_requests WHERE origin=? AND id=?",
                                        (origin, value["id"])).fetchone()
        require(previous is None or parse(previous[0]) == value,
                "ORIGINAL_REQUEST_CONFLICT", "The original portfolio request history conflicts.")
        workspace.db.execute("INSERT OR IGNORE INTO original_requests VALUES(?,?,?,?)",
            (origin, value["id"], value["inputSha256"], original_canonical(value).decode("utf-8")))
    origin = manifest["workspace_id"]
    for kind, rows in prepared["rows"].items():
        for index, value in enumerate(rows):
            if kind == "originals":
                _retain_original(workspace, value["origin"], value["kind"], value["id"], value["body"])
                continue
            ident = value["id"] if kind in ("records", "requests") else identity(
                {k: value[k] for k in ("operation_id", "request_id" if kind == "native_requests" else "key" if kind == "steps" else "sequence")})
            # Provider request rows and original parent states can acquire new
            # observations in later source handovers. Preserve every captured
            # edition, not an overwritten latest state.
            if kind in ("requests", "native_requests"):
                ident += ":" + identity(value)
            _retain_original(workspace, origin, kind, ident, value)
            if kind == "records":
                prior = workspace.db.execute("SELECT body_sha256,body FROM dataverse_records WHERE id=?", (value["id"],)).fetchone()
                require(prior is None or prior["body_sha256"] == identity(value) and _parse_row(prior) == value,
                        "RECEIVING_RECORD_CONFLICT", "The original immutable native record conflicts.")
                workspace.db.execute("INSERT OR IGNORE INTO dataverse_records VALUES(?,?,?,?,?,?,?)",
                    (value["id"], value["kind"], value["operation_id"], value["portfolio"]["id"],
                     value["portfolio"]["revision"], identity(value), json_bytes(value).decode("utf-8")))
    _retain_original(workspace, origin, "handover", manifest["id"],
        {"manifest": manifest, "source_archive_sha256": prepared["result"]["object"]})
    return clone(prepared["result"])

def commit_receiving(workspace, original, prepared):
    """The ordinary ALM action adds its local receipt in the same transaction."""
    value = adopt_receiving(workspace, prepared)
    native, manifest = prepared["native"], prepared["manifest"]
    binding = manifest["portfolio"]
    ident = record_identity("receiving", value, workspace.marker["workspaceId"], binding)
    wrapper = {"schema": WORKSPACE_EXTENSION_SCHEMA + ".record", "id": ident, "kind": "receiving",
               "operation_id": original["id"], "parent_input_sha256": original["inputSha256"],
               "workspace_id": workspace.marker["workspaceId"], "created_at": original["createdAt"],
               "portfolio": binding, "value": value}
    previous = workspace.db.execute("SELECT body_sha256,body FROM dataverse_records WHERE id=?", (ident,)).fetchone()
    require(previous is None or previous["body_sha256"] == identity(wrapper) and _parse_row(previous) == wrapper,
            "RECEIVING_RECEIPT_CONFLICT", "The original receiving result differs.")
    workspace.db.execute("INSERT OR IGNORE INTO dataverse_records VALUES(?,?,?,?,?,?,?)",
        (ident, "receiving", original["id"], binding["id"], binding["revision"], identity(wrapper), json_bytes(wrapper).decode("utf-8")))
    return {"id": ident, "kind": "receiving", "sha256": identity(wrapper), "state": "COMPLETE",
            "portfolio": binding, "native_receiving": clone(native["result"]), "provider_requests_replayed": 0}

def delivery_file(workspace, record_id):
    saved = record(workspace, record_id)
    require(saved["kind"] in ("delivery", "receiving"), "DELIVERY_FILE", "Select a complete original handover or receiving receipt.")
    value = saved["value"]
    path = workspace.object(value["object"])
    info = _info(path)
    return {"path": path, "filename": (value["filename"] if "filename" in value else "Dataverse_Received_" + value["delivery_id"] + ".zip"),
            "content_type": "application/zip", **info}
