"""MIT. Complete editable support handovers around the original native ALM delivery."""
from __future__ import annotations

from contextlib import nullcontext
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sqlite3
import stat
import tempfile
import zipfile

from domain import MAX_PACKET, canonical, digest, identifier, operation, parse, require, sha
from native_sources import file_info
from dataverse_contract import json_bytes as native_json_bytes, parse_json as native_parse_json
from support_domain import SCHEMA, clone, report_html, source_objects
from support_workspace import checked_record, contract, _expected, _insert_event, _insert_record

PACKET = SCHEMA + ".complete-packet"
BLOCK = 1024 * 1024


def _name(name):
    require(isinstance(name, str) and name and "\\" not in name and not name.startswith("/")
            and all(p not in ("", ".", "..") for p in name.split("/"))
            and not any(ord(c) < 32 for c in name), "Unsafe support handover member")
    return PurePosixPath(name)


def _write(path, data):
    from workspace import immutable
    immutable(path, data)


def _copy(source, target, expected):
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if target.exists():
        require(target.is_file() and not target.is_symlink() and file_info(target) == expected,
                "A frozen original support member differs", "SUPPORT_FROZEN_FILE_CHANGED", 409)
        return
    fd, temporary = tempfile.mkstemp(prefix=".support-copy-", dir=target.parent)
    try:
        with os.fdopen(fd, "wb") as output, Path(source).open("rb") as stream:
            hasher, size = hashlib.sha256(), 0
            while block := stream.read(BLOCK):
                output.write(block)
                hasher.update(block)
                size += len(block)
            output.flush()
            os.fsync(output.fileno())
        require({"sha256": hasher.hexdigest(), "bytes": size} == expected,
                "A source member changed during complete support handover")
        os.link(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _latest(rows):
    result = {}
    for row in rows:
        if row["id"] not in result or row["revision"] > result[row["id"]]["revision"]:
            result[row["id"]] = row
    return [result[key] for key in sorted(result)]


def _history(workspace, selected, database=None):
    with (nullcontext(database) if database is not None else workspace.reader()) as db:
        contracts = [parse(r[0]) for r in db.execute(
            "SELECT body FROM support_contracts WHERE id=? AND revision<=? ORDER BY revision",
            (selected["id"], selected["revision"]))]
        issues = [parse(r[0]) for r in db.execute(
            "SELECT body FROM support_issues WHERE contract_id=? ORDER BY id,revision", (selected["id"],))]
        ids = {x["id"] for x in issues}
        events = [parse(r[0]) for r in db.execute("SELECT body FROM support_events ORDER BY kind,entity_id,revision,origin,operation_id")
                  if (lambda e: e["entityId"] == selected["id"] if e["kind"] == "contract" else e["entityId"] in ids)(parse(r[0]))]
        requests = []
        keys = set()
        for event in events:
            key = (event["originWorkspaceId"], event["operationId"])
            require(key not in keys, "The support event history repeats an operation")
            keys.add(key)
            if key[0] == workspace.marker["workspaceId"]:
                row = db.execute("SELECT body FROM requests WHERE id=?", (key[1],)).fetchone()
            else:
                row = db.execute("SELECT body FROM original_requests WHERE origin=? AND id=?", key).fetchone()
            require(row is not None, "Retain the actual original operation for every support revision")
            request = parse(row[0])
            require(request["state"] == "COMPLETED" and request["inputSha256"] == event["inputSha256"],
                    "A support revision lacks its actual completed original action")
            requests.append({"origin": key[0], "request": request})
    return {"contracts": contracts, "issues": issues, "events": events, "requests": requests}


def _validate_history(data, selection):
    require(isinstance(data, dict) and set(data) == {"contracts", "issues", "events", "requests"},
            "Retain every complete support history table")
    for key in data:
        require(isinstance(data[key], list), "Support history tables must be arrays")
    records, chains = {}, {}
    for kind, values in (("contract", data["contracts"]), ("issue", data["issues"])):
        for raw in values:
            value = checked_record(raw)
            require(value["schema"] == SCHEMA + "." + kind, "A support record has another kind")
            require(value["id"] == selection["id"] if kind == "contract" else value["contractId"] == selection["id"],
                    "The support handover contains another service contract")
            key = (kind, value["id"])
            previous = chains.get(key)
            require(value["revision"] == (previous["revision"] + 1 if previous else 1)
                    and value["previousSha256"] == (previous["sha256"] if previous else None),
                    "The complete support revision sequence is broken", "SUPPORT_HISTORY_SEQUENCE", 409)
            if kind == "issue":
                cycles = value["cycles"]
                require(isinstance(cycles, list) and cycles and [x["number"] for x in cycles] == list(range(1, len(cycles) + 1)),
                        "The retained support report cycles differ")
            chains[key] = value
            record_key = (kind, value["id"], value["revision"])
            require(record_key not in records, "A support revision repeats")
            records[record_key] = value
    selected = chains.get(("contract", selection["id"]))
    require(selected and selected["revision"] == selection["revision"] and selected["sha256"] == selection["sha256"],
            "The complete selected support contract differs")
    parents = {}
    for item in data["requests"]:
        require(set(item) == {"origin", "request"}, "The original support action needs its origin")
        identifier(item["origin"])
        request = item["request"]
        key = (item["origin"], request["id"])
        require(key not in parents and request["state"] == "COMPLETED"
                and request["inputSha256"] == digest(request["input"])
                and request["input"]["operationId"] == request["id"]
                and request["action"] == request["input"]["action"],
                "The original support action history differs")
        parents[key] = request
    covered = set()
    for event in data["events"]:
        require(event["schema"] == SCHEMA + ".event" and event["inputSha256"] == digest(event["input"]),
                "The original support event input differs")
        key = (event["kind"], event["entityId"], event["revision"])
        parent = parents.get((event["originWorkspaceId"], event["operationId"]))
        row = records.get(key)
        require(key not in covered and row and parent
                and event["recordSha256"] == row["sha256"] and event["previousSha256"] == row["previousSha256"]
                and event["input"] == parent["input"] and parent.get("result", {}).get("record") == row
                and row["operationId"] == event["operationId"]
                and row["originWorkspaceId"] == event["originWorkspaceId"]
                and row["inputSha256"] == parent["inputSha256"],
                "The complete support revision does not match its original completed action")
        covered.add(key)
    require(covered == set(records) and len(parents) == len(covered),
            "Every support revision needs exactly one original completed operation")
    return {"contract": selected, "issues": _latest(data["issues"])}



NATIVE_CONTEXT = "native-evidence/context.json"


def _native_references(data, context, rows):
    """Bind every historical Support reference to original retained native bytes."""
    from dataverse_contract import identity as native_identity, canonical as native_canonical, target_identity
    from staff_native import verify_capture, _selected_correction
    by_id = {value["id"]: value for value in rows["records"]}
    corrections = {}
    def release(reference):
        if reference is None:
            return
        value = by_id.get(reference["recordId"])
        require(value and native_identity(value) == reference["recordSha256"],
                "A support release reference is missing from the complete native evidence",
                "SUPPORT_NATIVE_REFERENCE", 409)
    def correction(reference):
        if reference is None:
            return
        key = digest(reference)
        if key in corrections:
            return
        matches = []
        for value in rows["records"]:
            if value["kind"] != "staff-history":
                continue
            selection = value["value"].get("selection", {})
            if (selection.get("commandOperationId") != reference["operationId"]
                    or selection.get("projectRecordId") != reference["projectRecordId"]
                    or selection.get("historyStateVersion") != reference["stateVersion"]):
                continue
            checked = verify_capture(value["value"], value["portfolio"])
            require(checked["member_refs"]["after"]["sha256"] == reference["historySha256"],
                    "The retained original correction history differs", "SUPPORT_NATIVE_REFERENCE", 409)
            actual = _selected_correction(checked, reference)
            matches.append((native_canonical(actual), native_canonical(checked["receipt"]),
                            value["portfolio"], target_identity(checked["profile"])))
        require(matches and all(value == matches[0] for value in matches),
                "The support correction has missing or ambiguous original native history",
                "SUPPORT_NATIVE_REFERENCE", 409)
        corrections[key] = True
    for value in data["issues"]:
        release(value.get("affectedRelease"))
        for cycle in value["cycles"]:
            linked = cycle.get("correction")
            if linked:
                correction(linked["reference"])
            validated = cycle.get("validation")
            if validated:
                release(validated["installation"])
                correction(validated["correction"])


def _native_evidence(archive, manifest, data, native):
    """Read the same native table format; no provider request is made runnable."""
    from dataverse_contract import parse_json, json_bytes, identity as native_identity
    from dataverse_portable import TABLE_FILES, MAX_ROW, _rows, _validate_tables
    require(NATIVE_CONTEXT in manifest["files"], "Retain the complete native evidence context")
    raw = archive.read(NATIVE_CONTEXT)
    context = parse_json(raw, maximum=MAX_ROW)
    require(raw == json_bytes(context) and context.get("schema") == PACKET + ".native-evidence"
            and context["workspace_id"] == manifest["workspaceId"]
            and context["portfolio"] == manifest["portfolio"]
            and set(context["tables"]) == set(TABLE_FILES),
            "The complete native evidence context differs")
    rows = {}
    for key, relative in TABLE_FILES.items():
        name = "native-evidence/" + relative
        stats = context["tables"][key]
        require(manifest["files"].get(name) == {k: stats[k] for k in ("sha256", "bytes")},
                "A retained native table descriptor differs")
        with archive.open(name) as stream:
            rows[key] = list(_rows(stream))
        require(type(stats["rows"]) is int and stats["rows"] == len(rows[key]),
                "A complete native evidence table has another row count")
    require({name for name in manifest["files"] if name.startswith("native-evidence/")}
            == {NATIVE_CONTEXT} | {"native-evidence/" + name for name in TABLE_FILES.values()},
            "Retain exactly the complete native evidence tables")
    _validate_tables(rows, context)
    require(any(value["id"] == native["id"] and native_identity(value) == native_identity(native)
                for value in rows["records"]),
            "The selected native handover record is absent from the complete retained history")
    _native_references(data, context, rows)
    return {"context": context, "rows": rows}


def _adopt_native_evidence(workspace, evidence, source_object):
    """Retain original wrappers and histories inside the caller's transaction."""
    from dataverse_contract import identity as native_identity, json_bytes
    from dataverse_portable import _retain_original
    from dataverse_workspace import _parse_row
    require(workspace.db.in_transaction, "Native support evidence needs the original receiving transaction")
    origin = evidence["context"]["workspace_id"]
    for kind, rows in evidence["rows"].items():
        for value in rows:
            if kind == "originals":
                _retain_original(workspace, value["origin"], value["kind"], value["id"], value["body"])
                continue
            ident = value["id"] if kind in ("records", "requests") else native_identity(
                {k: value[k] for k in ("operation_id",
                 "request_id" if kind == "native_requests" else "key" if kind == "steps" else "sequence")})
            if kind in ("requests", "native_requests"):
                ident += ":" + native_identity(value)
            _retain_original(workspace, origin, kind, ident, value)
            if kind == "records":
                prior = workspace.db.execute("SELECT body_sha256,body FROM dataverse_records WHERE id=?",
                                             (value["id"],)).fetchone()
                require(prior is None or prior["body_sha256"] == native_identity(value)
                        and _parse_row(prior) == value,
                        "The original native Support reference conflicts", "SUPPORT_NATIVE_CONFLICT", 409)
                workspace.db.execute("INSERT OR IGNORE INTO dataverse_records VALUES(?,?,?,?,?,?,?)",
                    (value["id"], value["kind"], value["operation_id"], value["portfolio"]["id"],
                     value["portfolio"]["revision"], native_identity(value), json_bytes(value).decode("utf-8")))
    _retain_original(workspace, origin, "support-evidence", source_object, evidence["context"])


def prepare_delivery(workspace, original):
    payload = original["input"]["payload"]
    selected = contract(workspace, payload["contractId"])
    _expected(selected, payload["expectedContractRevision"])
    from dataverse_workspace import record
    from dataverse_contract import identity as native_identity
    from dataverse_portable import delivery_file as native_delivery_file, inspect_delivery
    native = record(workspace, payload["delivery"]["recordId"])
    require(native_identity(native) == payload["delivery"]["recordSha256"]
            and native["kind"] in ("delivery", "receiving"),
            "Select the actual complete managed/unmanaged application handover")
    require(native["portfolio"] == selected["portfolio"],
            "Use the complete ALM handover for this exact reviewed portfolio revision", "SUPPORT_DELIVERY_SCOPE", 409)
    native_file = native_delivery_file(workspace, native["id"])
    inspected_native = inspect_delivery(native_file["path"])
    selection = {"id": selected["id"], "revision": selected["revision"], "sha256": selected["sha256"]}
    folder = workspace.root / "support-deliveries" / digest({"operationId": original["id"]})
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    capture_file = folder / "capture.json"
    if capture_file.exists():
        capture = parse(capture_file.read_bytes())
        require(capture["inputSha256"] == original["inputSha256"] and capture["contract"] == selection,
                "This support handover already captured another original input")
    else:
        files_root = folder / "files"
        if files_root.exists():
            # Only this operation's reproducible, not-yet-published capture is discarded.
            require(files_root.is_dir() and not files_root.is_symlink() and not (folder / "complete.zip").exists(),
                    "The original published capture cannot be replaced")
            shutil.rmtree(files_root)
        files_root.mkdir(mode=0o700)
        from dataverse_portable import _frozen_database, _snapshot_evidence, _validate_tables, _object_ids, TABLE_FILES
        from dataverse_contract import json_bytes as native_json_bytes
        portfolio = workspace.portfolio(selected["portfolio"]["id"], selected["portfolio"]["revision"])
        frozen, frozen_info = _frozen_database(workspace, original, portfolio, folder)
        database = sqlite3.connect("file:" + str(frozen) + "?mode=ro", uri=True)
        database.row_factory = sqlite3.Row
        try:
            frozen_contract = contract(workspace, selected["id"], db=database)
            require(frozen_contract == selected, "The frozen support contract differs from its original selection")
            data = _history(workspace, selected, database)
        finally:
            database.close()
        heads = _validate_history(data, selection)
        records, native_rows, native_stats = _snapshot_evidence(
            workspace, frozen, portfolio, files_root / "native-evidence")
        native_context = {"schema": PACKET + ".native-evidence",
            "workspace_id": workspace.marker["workspaceId"], "portfolio": clone(selected["portfolio"]),
            "selected_record_ids": clone(inspected_native["manifest"]["selected_record_ids"]),
            "export_pairs": clone(inspected_native["manifest"]["export_pairs"]),
            "tables": native_stats}
        _validate_tables(native_rows, native_context)
        require(any(row["id"] == native["id"] and native_identity(row) == native_identity(native) for row in records),
                "The original selected native handover is missing from the frozen workspace")
        _native_references(data, native_context, native_rows)
        files = {}
        def add_bytes(name, body):
            path = files_root / _name(name)
            _write(path, body)
            files[name] = file_info(path)
        def add_file(name, path, expected=None):
            info = expected or file_info(path)
            _copy(path, files_root / _name(name), info)
            files[name] = info
        add_file("application/native-application.zip", native_file["path"],
                 {k: native_file[k] for k in ("sha256", "bytes")})
        add_bytes("application/native-record.json", native_json_bytes(native))
        add_bytes("support/history.json", canonical(data))
        add_bytes(NATIVE_CONTEXT, native_json_bytes(native_context))
        for key, relative in TABLE_FILES.items():
            files["native-evidence/" + relative] = {k: native_stats[key][k] for k in ("bytes", "sha256")}
        add_bytes("Support_Handover.html", report_html(heads["contract"], heads["issues"], data["events"], original["createdAt"]))
        add_bytes("RECEIVING.md", ("# Complete defect support handover\n\n"
            "Open the maintained grant-portfolio application and use Support > Receive complete handover. "
            "The original complete native application, managed/unmanaged solution packages, portfolio, "
            "support terms, cases, every revision and original operation are retained. Receiving imports "
            "the saved application and support history into the same editable workspace. It starts no "
            "historical tenant action and records no new customer acceptance. Continue with a new actual "
            "support action and the received record revision. See runtime/sf30-seller-sdk/grant-portfolio/SUPPORT.md.\n").encode())
        native_objects = _object_ids(native_rows)
        # The selected native archive is already included in full above and is
        # uploaded through that same member during receiving.
        for object_id in sorted((source_objects(data) | native_objects) - {native_file["sha256"]}):
            add_file("objects/" + object_id, workspace.object(object_id))
        from managed import sourceFileList
        from workspace import SDK
        source_names = sourceFileList()
        require("grant-portfolio/support_workspace.py" in source_names
                and "grant-portfolio/support_portable.py" in source_names
                and "grant-portfolio/source-files.json" in source_names,
                "The maintained application source list must include the complete support implementation")
        for name in source_names:
            add_file("runtime/sf30-seller-sdk/" + str(_name(name)), SDK / name)
        capture = {"schema": PACKET + ".capture", "operationId": original["id"],
                   "inputSha256": original["inputSha256"], "workspaceId": workspace.marker["workspaceId"],
                   "createdAt": original["createdAt"], "contract": selection, "portfolio": clone(selected["portfolio"]),
                   "nativeDelivery": {"recordId": native["id"], "recordSha256": native_identity(native),
                                      "file": "application/native-application.zip",
                                      "sha256": native_file["sha256"], "bytes": native_file["bytes"],
                                      "manifestSha256": inspected_native["manifest_sha256"]},
                   "counts": {key: len(value) for key, value in data.items()}, "files": files}
        _write(capture_file, canonical(capture))
    manifest = {**capture, "schema": PACKET}
    target = folder / "complete.zip"
    if not target.exists():
        fd, temporary = tempfile.mkstemp(prefix="support-archive-", suffix=".partial", dir=folder)
        os.close(fd)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                for name, expected in sorted(manifest["files"].items()):
                    source = folder / "files" / _name(name)
                    require(file_info(source) == expected, "A complete frozen support file changed")
                    info = zipfile.ZipInfo(name)
                    info.external_attr = 0o100600 << 16
                    with archive.open(info, "w", force_zip64=True) as output, source.open("rb") as stream:
                        shutil.copyfileobj(stream, output, BLOCK)
                archive.writestr("manifest.json", canonical(manifest))
            require(Path(temporary).stat().st_size <= MAX_PACKET, "The complete support handover exceeds 4 GiB")
            inspect_delivery_packet(Path(temporary))
            with Path(temporary).open("rb") as stream:
                os.fsync(stream.fileno())
            os.link(temporary, target)
        finally:
            Path(temporary).unlink(missing_ok=True)
    inspected = inspect_delivery_packet(target)
    require(inspected["manifest"] == manifest, "The retained support handover has another original manifest")
    with target.open("rb") as stream:
        uploaded = workspace.upload(stream, target.stat().st_size)
    return {"kind": "delivery", "expectedContract": selection,
            "result": {"schema": PACKET + ".record", "object": uploaded["sha256"], "bytes": uploaded["bytes"],
                       "filename": "Support_" + selected["id"] + "_r" + str(selected["revision"]) + ".zip",
                       "manifestSha256": digest(manifest), "contract": selection, "portfolio": clone(selected["portfolio"]),
                       "nativeDelivery": clone(manifest["nativeDelivery"]), "counts": clone(manifest["counts"]),
                       "operationId": original["id"], "inputSha256": original["inputSha256"]}}


def inspect_delivery_packet(path):
    require(Path(path).is_file() and not Path(path).is_symlink()
            and Path(path).stat().st_size <= MAX_PACKET, "Select a complete regular support archive")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        require(0 < len(entries) <= 100000, "Invalid support archive member count")
        names, size = set(), 0
        for entry in entries:
            _name(entry.filename)
            require(entry.filename not in names and not entry.is_dir()
                    and not stat.S_ISLNK(entry.external_attr >> 16) and not entry.flag_bits & 1,
                    "The support archive contains an unsafe or repeated member")
            names.add(entry.filename)
            size += entry.file_size
        require(size <= 8 * MAX_PACKET and "manifest.json" in names
                and archive.getinfo("manifest.json").file_size <= 64 * 1024 * 1024,
                "The complete support manifest or expanded archive is invalid")
        manifest = parse(archive.read("manifest.json"))
        require(manifest.get("schema") == PACKET and isinstance(manifest.get("files"), dict)
                and set(manifest["files"]) == names - {"manifest.json"},
                "Every support handover member must be declared once")
        for name, expected in manifest["files"].items():
            require(isinstance(expected, dict) and set(expected) == {"sha256", "bytes"}
                    and type(expected["bytes"]) is int and expected["bytes"] == archive.getinfo(name).file_size,
                    "A support member length differs")
            sha(expected["sha256"])
            hasher, count = hashlib.sha256(), 0
            with archive.open(name) as stream:
                while block := stream.read(BLOCK):
                    hasher.update(block)
                    count += len(block)
            require({"sha256": hasher.hexdigest(), "bytes": count} == expected,
                    "The complete support member bytes differ: " + name)
        required = {"application/native-application.zip", "application/native-record.json",
                    "support/history.json", "Support_Handover.html", "RECEIVING.md",
                    "runtime/sf30-seller-sdk/grant-portfolio/source-files.json"}
        require(required <= names, "The support handover omits complete application or receiving files")
        identifier(manifest["workspaceId"]), operation(manifest["operationId"]), sha(manifest["inputSha256"])
        heads = _validate_history(parse(archive.read("support/history.json")), manifest["contract"])
        require(heads["contract"]["portfolio"] == manifest["portfolio"], "Support and portfolio selections differ")
        source_list = parse(archive.read("runtime/sf30-seller-sdk/grant-portfolio/source-files.json"))
        require(source_list.get("schema") == "stellar-forge.grant-portfolio-source-files.v1"
                and isinstance(source_list.get("files"), list) and source_list["files"] == sorted(set(source_list["files"])),
                "The editable support source closure is invalid")
        expected_source = {"runtime/sf30-seller-sdk/" + str(_name(x)) for x in source_list["files"]}
        require(expected_source == {name for name in names if name.startswith("runtime/")},
                "Retain every declared original application source file")
        data = parse(archive.read("support/history.json"))
        require(manifest["counts"] == {key: len(value) for key, value in data.items()}, "The complete support counts differ")
        native = native_parse_json(archive.read("application/native-record.json"))
        from dataverse_contract import identity as native_identity
        require(native["id"] == manifest["nativeDelivery"]["recordId"]
                and native_identity(native) == manifest["nativeDelivery"]["recordSha256"]
                and native["portfolio"] == manifest["portfolio"]
                and native["kind"] in ("delivery", "receiving"),
                "The original complete native application selection differs")
        require(manifest["nativeDelivery"]["file"] == "application/native-application.zip",
                "The complete native application member path differs")
        require(manifest["files"][manifest["nativeDelivery"]["file"]] ==
                {key: manifest["nativeDelivery"][key] for key in ("sha256", "bytes")},
                "The original complete application archive differs")
        native_value = native["value"]
        require(native_value["object"] == manifest["nativeDelivery"]["sha256"]
                and native_value["manifest_sha256"] == manifest["nativeDelivery"]["manifestSha256"]
                and (native["kind"] != "delivery" or native_value["bytes"] == manifest["nativeDelivery"]["bytes"]),
                "The retained native record names another complete application archive")
        evidence = _native_evidence(archive, manifest, data, native)
        from dataverse_portable import _object_ids
        objects = (source_objects(data) | _object_ids(evidence["rows"])) - {manifest["nativeDelivery"]["sha256"]}
        require({name for name in names if name.startswith("objects/")} == {"objects/" + x for x in objects},
                "The complete support/native source objects are missing or unrelated")
    return {"manifest": manifest, "archive": file_info(path), "nativeEvidence": evidence}

def prepare_receiving(workspace, original):
    object_id = original["input"]["payload"]["object"]
    packet = workspace.object(object_id)
    inspected = inspect_delivery_packet(packet)
    require(inspected["archive"]["sha256"] == object_id, "The original support input archive changed")
    manifest = inspected["manifest"]
    folder = workspace.root / "support-received" / object_id
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    with zipfile.ZipFile(packet) as archive:
        for name, expected in manifest["files"].items():
            target = folder / _name(name)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if target.exists():
                require(target.is_file() and not target.is_symlink() and file_info(target) == expected,
                        "The retained incoming support file changed", "SUPPORT_RECEIVED_FILE_CHANGED", 409)
                continue
            fd, temporary = tempfile.mkstemp(prefix=".support-incoming-", dir=target.parent)
            try:
                with os.fdopen(fd, "wb") as output, archive.open(name) as stream:
                    shutil.copyfileobj(stream, output, BLOCK)
                    output.flush()
                    os.fsync(output.fileno())
                require(file_info(temporary) == expected, "The received support member differs")
                os.link(temporary, target)
            finally:
                Path(temporary).unlink(missing_ok=True)
    _write(folder / "manifest.json", canonical(manifest))
    data = parse((folder / "support/history.json").read_bytes())
    heads = _validate_history(data, manifest["contract"])
    from dataverse_portable import _object_ids
    complete_objects = (source_objects(data) | _object_ids(inspected["nativeEvidence"]["rows"])) - {manifest["nativeDelivery"]["sha256"]}
    for object_id_value in sorted(complete_objects):
        path = folder / "objects" / object_id_value
        with path.open("rb") as stream:
            uploaded = workspace.upload(stream, path.stat().st_size)
        require(uploaded["sha256"] == object_id_value, "A retained support evidence object differs")
    native_path = folder / manifest["nativeDelivery"]["file"]
    with native_path.open("rb") as stream:
        native_object = workspace.upload(stream, native_path.stat().st_size)
    require(native_object["sha256"] == manifest["nativeDelivery"]["sha256"],
            "The complete native application archive changed during receiving")
    from dataverse_portable import prepare_receiving as prepare_native
    prepared_native = prepare_native(workspace, original, native_object["sha256"])
    require(prepared_native["manifest"]["portfolio"] == manifest["portfolio"]
            and prepared_native["result"]["manifest_sha256"] == manifest["nativeDelivery"]["manifestSha256"],
            "The original native receiver selected another portfolio or complete manifest")
    # This is verified source/history adoption, never a new native tenant action.
    return {"kind": "receiving", "native": prepared_native, "nativeEvidence": inspected["nativeEvidence"], "history": data, "manifest": manifest,
            "result": {"schema": PACKET + ".received", "object": object_id,
                       "sourceWorkspaceId": manifest["workspaceId"], "workspaceId": workspace.marker["workspaceId"],
                       "contract": clone(manifest["contract"]), "portfolio": clone(manifest["portfolio"]),
                       "manifestSha256": digest(manifest), "counts": clone(manifest["counts"]),
                       "bytes": inspected["archive"]["bytes"],
                       "filename": "Support_Received_" + heads["contract"]["id"] + ".zip",
                       "operationId": original["id"], "inputSha256": original["inputSha256"],
                       "providerRequestsReplayed": 0, "editableSupport": True}}


def commit_delivery(workspace, original, prepared):
    selected = prepared["expectedContract"]
    current = contract(workspace, selected["id"], db=workspace.db)
    require(current["revision"] == selected["revision"] and current["sha256"] == selected["sha256"],
            "The contract changed before complete support delivery committed", "SUPPORT_REVISION_CONFLICT", 409)
    result = prepared["result"]
    prior = workspace.db.execute("SELECT body FROM support_deliveries WHERE object=?", (result["object"],)).fetchone()
    require(prior is None or parse(prior[0]) == result,
            "The original complete support delivery result differs", "SUPPORT_DELIVERY_CONFLICT", 409)
    workspace.db.execute("INSERT OR IGNORE INTO support_deliveries VALUES(?,?)",
                         (result["object"], canonical(result).decode()))
    return clone(result)


def commit_receiving(workspace, original, prepared):
    from dataverse_portable import adopt_receiving
    adopted = adopt_receiving(workspace, prepared["native"])
    _adopt_native_evidence(workspace, prepared["nativeEvidence"], prepared["result"]["object"])
    # The source/portfolio and support adoption share the caller's original transaction.
    for value in prepared["history"]["contracts"]:
        _insert_record(workspace, "contract", value)
    for value in prepared["history"]["issues"]:
        _insert_record(workspace, "issue", value)
    for value in prepared["history"]["events"]:
        _insert_event(workspace, value)
    for item in prepared["history"]["requests"]:
        origin, request = item["origin"], item["request"]
        previous = workspace.db.execute("SELECT body FROM original_requests WHERE origin=? AND id=?",
                                         (origin, request["id"])).fetchone()
        require(previous is None or parse(previous[0]) == request,
                "The original received support action history conflicts", "SUPPORT_REQUEST_CONFLICT", 409)
        workspace.db.execute("INSERT OR IGNORE INTO original_requests VALUES(?,?,?,?)",
            (origin, request["id"], request["inputSha256"], canonical(request).decode()))
    result = {**prepared["result"], "nativeReceiving": clone(adopted)}
    previous = workspace.db.execute("SELECT body FROM support_deliveries WHERE object=?", (result["object"],)).fetchone()
    if previous is not None:
        retained = parse(previous[0])
        # One immutable file descriptor can serve several actual receiving operations,
        # including a receive back into its source workspace. Each original request
        # retains its own result and native adoption, never another operation's ID.
        require(all(retained.get(key) == result.get(key) for key in
                    ("object", "bytes", "manifestSha256", "contract", "portfolio")),
                "The original support archive descriptor conflicts", "SUPPORT_RECEIVING_CONFLICT", 409)
    else:
        workspace.db.execute("INSERT INTO support_deliveries VALUES(?,?)", (result["object"], canonical(result).decode()))
    return result


def delivery_file(workspace, object_id):
    sha(object_id)
    with workspace.reader() as db:
        row = db.execute("SELECT body FROM support_deliveries WHERE object=?", (object_id,)).fetchone()
    require(row is not None, "The completed support handover was not found", "SUPPORT_DELIVERY_NOT_FOUND", 404)
    saved = parse(row[0])
    path = workspace.object(object_id)
    info = file_info(path)
    require(info["sha256"] == object_id and info["bytes"] == saved["bytes"], "The original support download changed")
    return {"kind": "file", "path": path,
            "descriptor": {**info, "filename": saved["filename"]}, "content_type": "application/zip"}
