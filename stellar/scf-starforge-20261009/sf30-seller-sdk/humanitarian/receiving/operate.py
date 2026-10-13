#!/usr/bin/env python3
"""MIT. Operate and reopen one complete humanitarian receiving case."""
from __future__ import annotations

import argparse
import copy
import csv
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import shutil
import sqlite3
import tempfile
import subprocess
import sys
import uuid
import zipfile

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from humanitarian_workspace import (
    HumanitarianWorkspace, InputError, strict_json, canonical_json, MAX_SOURCE,
)
from humanitarian_reference import normalized_name
from humanitarian_handover import _archive, _unpack, _verify_retained_history

OPERATION = "HUMANITARIAN-COMPLETE-RECEIVING-7108-20261013"
REVIEW = "humanitarian-receiving-example"
FIELDS = ["record_id", "location_code", "location_name", "scope_code",
          "sector", "people", "amount", "currency"]
AFTER = [
    ("Currency", "currency"), ("Reported people", "people"),
    ("Location label", "location_name"), ("Record identifier", "record_id"),
    ("Amount in USD", "amount"), ("Parent code", "scope_code"),
    ("Programme sector", "sector"), ("Location code", "location_code"),
]


def check(condition, message):
    if not condition:
        raise InputError(message)


def encoded(value):
    return canonical_json(value)


def digest(body):
    return hashlib.sha256(body).hexdigest()


def identity(path):
    path = Path(path)
    info = path.lstat()
    check(stat.S_ISREG(info.st_mode) and not path.is_symlink(),
          "Retain an original regular file: " + str(path))
    h = hashlib.sha256()
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            h.update(block)
    return {"bytes": info.st_size, "sha256": h.hexdigest()}


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_directory(path):
    path = Path(path)
    if not path.exists():
        path.mkdir(parents=True, mode=0o700)
    info = path.lstat()
    check(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and
          info.st_uid == os.getuid() and not info.st_mode & 0o077,
          "The original operating directory must remain private and owned by this operator")
    check(path.resolve() == path.absolute(), "Select an original directory without symlink parents")
    return path


def retain(path, body):
    """Publish a complete immutable output under the held whole-case lease."""
    path = Path(path)
    private_directory(path.parent)
    expected = {"bytes": len(body), "sha256": digest(body)}
    if path.exists():
        check(identity(path) == expected and path.read_bytes() == body,
              "The retained original output differs: " + str(path))
        return expected
    temporary = path.with_name("." + path.name + ".stage-" + uuid.uuid4().hex)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    check(identity(temporary) == expected, "The complete private output failed readback")
    try:
        os.link(temporary, path)
    except FileExistsError:
        check(identity(path) == expected and path.read_bytes() == body,
              "Another complete output already occupies this original selection")
    fsync_directory(path.parent)
    temporary.unlink()
    fsync_directory(path.parent)
    return expected


def retained_json(path, value):
    retain(path, encoded(value))
    return value


def copy_original(source, target, limit):
    source, target = Path(source), Path(target)
    info = source.lstat()
    check(stat.S_ISREG(info.st_mode) and not source.is_symlink() and info.st_size <= limit,
          "Select the complete original regular input within its declared byte bound")
    body = source.read_bytes()
    check(len(body) == info.st_size and len(body) <= limit,
          "Original input changed while reading")
    retain(target, body)
    return {"name": source.name, **identity(target)}


def csv_bytes(rows, columns):
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow([label for label, _ in columns])
    for row in rows:
        writer.writerow([row[field] for _, field in columns])
    return stream.getvalue().encode("utf-8")


def mapping_request(reference, headers, names, name, request_id, level):
    kinds = {"people": "integer", "amount": "decimal"}
    tags = {"record_id": "#meta+id", "location_code": "#loc+code",
            "location_name": "#loc+name", "scope_code": "#loc+parent",
            "sector": "#sector", "people": "#affected", "amount": "#value",
            "currency": "#currency"}
    columns = [
        {"name": field, "index": names.index(field), "label": field.replace("_", " "),
         "type": kinds.get(field, "string"), "nullable": field in {"amount", "scope_code", "location_code"},
         "trim": True, "hxl": tags[field], "unit": "USD" if field == "amount" else ""}
        for field in FIELDS
    ]
    donor = {
        "id": "donor", "title": "Engineering example: sector and currency totals",
        "groupBy": ["sector", "currency"],
        "measures": [
            {"name": "total_people", "op": "sum", "field": "people", "label": "People", "hxl": "#affected"},
            {"name": "total_amount", "op": "sum", "field": "amount", "label": "Amount", "hxl": "#value"},
            {"name": "record_count", "op": "count", "field": None, "label": "Records", "hxl": "#meta+count"},
        ],
        "columns": [
            {"field": "sector", "label": "Sector", "hxl": "#sector"},
            {"field": "currency", "label": "Currency", "hxl": "#currency"},
            {"field": "total_people", "label": "People", "hxl": "#affected"},
            {"field": "total_amount", "label": "Amount", "hxl": "#value"},
            {"field": "record_count", "label": "Records", "hxl": "#meta+count"},
        ],
    }
    cluster_fields = FIELDS + ["admin_code", "admin_name", "admin_level", "admin_parent"]
    return {
        "requestId": request_id, "name": name, "reference": reference["id"],
        "plan": {
            "schema": "stellar-forge.humanitarian-table-plan.v1",
            "name": name, "table": "data", "headerRow": 1, "hxlRow": None,
            "expectedHeaders": headers, "columns": columns,
            "maxRows": 1000, "maxBytes": 1024 * 1024, "defaultLimit": 50, "maxLimit": 1000,
        },
        "admin": {"level": level, "codeField": "location_code",
                  "nameField": "location_name", "scopeCodeField": "scope_code"},
        "keyFields": ["record_id"],
        "outputs": [donor, {
            "id": "cluster", "title": "Engineering example: full canonical register",
            "columns": [{"field": field, "label": field.replace("_", " "),
                         "hxl": tags.get(field, "")} for field in cluster_fields],
        }],
    }


def original_action(ws, case, name, raw, method):
    retained_json(case / "requests" / (name + ".json"), raw)
    actual = method(raw)
    retained_json(case / "observations" / (name + ".json"), actual)
    received = ws.request(raw["requestId"])
    check(received["input"] == raw and received["inputSha256"] == digest(encoded(raw)) and
          received["result"] == actual and received["state"] == "completed",
          "The original native request and its full result do not agree")
    retained_json(case / "observations" / (name + "-request.json"), received)
    return actual


def verify_zip(path):
    """Read every selected member and its CRC; retain full archive membership."""
    names = []
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        check(len({item.filename for item in entries}) == len(entries),
              "A complete export contains duplicate member names")
        for item in entries:
            name = item.filename
            check(not item.is_dir() and "\\" not in name and not name.startswith("/") and
                  all(part not in {"", ".", ".."} for part in name.split("/")),
                  "A complete export has an unsafe member")
            h, size = hashlib.sha256(), 0
            with archive.open(item) as stream:
                while block := stream.read(1024 * 1024):
                    h.update(block)
                    size += len(block)
            check(size == item.file_size, "An archive member failed its full readback")
            names.append({"path": name, "bytes": size, "sha256": h.hexdigest()})
    return {"archive": identity(path), "files": sorted(names, key=lambda row: row["path"])}


def native_query(ws, case, edition):
    build = ws.build_view(edition["build"])
    result = ws.query(edition["build"], {"limit": "1000"})
    check(result.get("ok") is True and result.get("dataset") == build["native"],
          "The original Dataset returned another selected description")
    response = result.get("response", {})
    body = response.get("body", {})
    check(response.get("status") == 200 and body.get("page", {}).get("total") == 32 and
          body.get("page", {}).get("returned") == 32 and body["page"].get("nextCursor") is None and
          isinstance(body.get("rows"), list) and len(body["rows"]) == 32,
          "The original Dataset query must return all thirty-two selected records")
    path = case / "observations" / ("native-query-" + str(edition["id"]) + ".json")
    if path.exists():
        previous = strict_json(path.read_bytes())
        check({k: v for k, v in previous.items() if k != "id"} ==
              {k: v for k, v in result.items() if k != "id"},
              "The repeated native query changed beyond its original pipe sequence")
    else:
        retain(path, encoded(result))
    return {"build": build["id"], "dataset": build["native"], "rows": 32}


def archive_result(case, name, actual):
    path = Path(actual["path"])
    check(path.is_absolute() and path.parent == case / "exports",
          "The original exporter returned another selected destination")
    check(identity(path) == {"bytes": actual["bytes"], "sha256": actual["sha256"]},
          "The original exporter descriptor differs from its complete bytes")
    retained_json(case / "observations" / (name + ".json"), actual)
    retained_json(case / "observations" / (name + "-members.json"), verify_zip(path))
    return actual


def expected_failure(case, name, operation):
    try:
        operation()
    except InputError as error:
        actual = {"type": type(error).__name__, "message": str(error)}
        retained_json(case / "observations" / (name + ".json"), actual)
        return actual
    raise InputError("The original conflicting request unexpectedly changed accepted state")



def domain_snapshot(ws):
    """Read the entire destination domain, including immutable objects/reports."""
    queries = {
        "human_objects": "SELECT kind,id,body,created,summary FROM human_objects ORDER BY kind,id",
        "human_reports": "SELECT id,body FROM human_reports ORDER BY id",
        "human_reviews": "SELECT id,revision,request_id,body FROM human_reviews ORDER BY id,revision",
        "human_requests": "SELECT id,kind,input_sha256,input,result FROM human_requests ORDER BY id",
    }
    return {name: [list(row) for row in ws.db.execute(sql)] for name, sql in queries.items()}


def native_database_rows(path):
    db = sqlite3.connect(Path(path).as_uri() + "?mode=ro", uri=True)
    try:
        db.execute("PRAGMA trusted_schema=OFF")
        check(list(db.execute("PRAGMA integrity_check")) == [("ok",)],
              "The rejection exercise requires a valid original SQLite database")
        schema = [list(row) for row in db.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name,tbl_name")]
        rows = [list(row) for row in db.execute(
            "SELECT ordinal,k,cells,values_json FROM rows ORDER BY ordinal")]
        return {"schema": schema, "rows": rows}
    finally:
        db.close()


def rejection_change(original, kind):
    """Choose one actual retained value; every mutation input/result stays exact."""
    catalog = strict_json((original / "catalog.json").read_bytes())
    check(catalog["review"] == REVIEW and catalog["revision"] == 2 and
          [row["revision"] for row in catalog["reviews"]] == [1, 2],
          "Rejection exercises must use the same complete r1/r2 source packet")
    if kind == "later-report-asset":
        name = "report/outputs/edition_1_donor.csv"
        rows = list(csv.reader(io.StringIO((original / name).read_text(encoding="utf-8"), newline="")))
        check(len(rows) > 1 and rows[0].count("People") == 1,
              "The complete later report requires its original People total")
        column = rows[0].index("People")
        before = rows[1][column]
        check(before.isdecimal(), "The selected engineering People total must be an integer")
        rows[1][column] = str(int(before) + 1)
        stream = io.StringIO(newline="")
        csv.writer(stream, lineterminator="\n").writerows(rows)
        return {"member": name, "revision": 2, "row": 1, "column": column,
                "before": before, "after": rows[1][column]}, {name: stream.getvalue().encode("utf-8")}
    check(kind == "native-sqlite-row", "Choose one of the two original rejection exercises")
    build_id = catalog["reviews"][-1]["editions"][0]["build"]
    name = "native/" + build_id + "/rows.sqlite"
    database = native_database_rows(original / name)
    check(database["rows"], "The actual native build must contain original rows")
    before = database["rows"][0]
    cells, values = strict_json(before[2]), strict_json(before[3])
    check(isinstance(cells, list) and isinstance(values, list) and cells and
          len(cells) == len(values) and type(values[0]) is int and cells[0] == str(values[0]),
          "The selected native row must retain its original source-row cells and typed values")
    values[0] += 1000000
    cells[0] = str(values[0])
    after = [before[0], before[1], encoded(cells).decode(), encoded(values).decode()]
    return {"member": name, "build": build_id, "ordinal": before[0],
            "before": before, "after": after, "originalRows": len(database["rows"]),
            "originalLogicalSha256": digest(encoded(database))}, {}


def validate_rejection_packet(original, changed, original_manifest, changed_manifest, kind, mutation, replacement):
    """Prove hashes/membership are valid and exactly the selected value differs."""
    original_catalog = strict_json((original / "catalog.json").read_bytes())
    expected_catalog = copy.deepcopy(original_catalog)
    if kind == "later-report-asset":
        changed_members = {mutation["member"]}
        check((changed / mutation["member"]).read_bytes() == replacement[mutation["member"]],
              "The rejected report must differ only by the selected one-person total")
        expected_error = "A complete report asset differs from its reconstructed review: " + mutation["member"]
    else:
        prefix = "native/" + mutation["build"] + "/"
        changed_members = {mutation["member"], "catalog.json", prefix + "review.json"}
        before = native_database_rows(original / mutation["member"])
        actual = native_database_rows(changed / mutation["member"])
        expected_rows = copy.deepcopy(before["rows"])
        check(expected_rows[0] == mutation["before"], "Original native row selection changed")
        expected_rows[0] = mutation["after"]
        check(actual["schema"] == before["schema"] and actual["rows"] == expected_rows,
              "The rejected native database must change exactly one row and preserve its full schema")
        matches = [row for row in expected_catalog["builds"] if row["id"] == mutation["build"]]
        check(len(matches) == 1, "The original selected native build must be unique")
        matches[0]["files"]["rows.sqlite"].update(identity(changed / mutation["member"]))
        check((changed / (prefix + "review.json")).read_bytes() == encoded(matches[0]),
              "The rejection packet must declare the full changed native database descriptor")
        expected_error = "Received complete native database records differs from its original complete result"
    check((changed / "catalog.json").read_bytes() == encoded(expected_catalog),
          "Rejection exercises must preserve every original source, plan, object, review and request")
    before_files = {row["path"]: row for row in original_manifest["files"]}
    after_files = {row["path"]: row for row in changed_manifest["files"]}
    check(set(before_files) == set(after_files) and
          {name for name in before_files if before_files[name] != after_files[name]} == changed_members,
          "The rejected packet changed an unselected original member")
    for name in before_files.keys() - changed_members:
        check(identity(original / name) == identity(changed / name),
              "An unrelated original packet member changed")
    check({k: v for k, v in changed_manifest.items() if k not in {"files", "expandedBytes"}} ==
          {k: v for k, v in original_manifest.items() if k not in {"files", "expandedBytes"}},
          "The rejected packet must retain the complete original review/report selection")
    # This exercises the real catalog and full history checks before dispatch:
    # a checksum, missing history or mismatched request cannot satisfy the test.
    _verify_retained_history(changed, expected_catalog, changed_manifest)
    return expected_error


def rejected_packet(case, source, kind):
    directory = private_directory(case / "rejections" / kind)
    packet = directory / "Rejected_Engineering_Input.zip"
    selected = {"schema": "stellar-forge.humanitarian-rejection-input.v1", "operation": OPERATION,
                "kind": kind, "originalPacket": {"path": str(source), **identity(source)},
                "purpose": "Deliberately altered engineering input; never an accepted customer review"}
    retained_json(directory / "selection.json", selected)
    # Incomplete construction stays in a unique private scratch directory. The
    # existing archive publisher holds its original output lease and publishes
    # only a complete ZIP; a retry verifies the retained packet before reuse.
    with tempfile.TemporaryDirectory(prefix=".construct-", dir=directory) as work:
        temporary = Path(work)
        original = temporary / "original"
        manifest = _unpack(source, original)
        mutation, replacement = rejection_change(original, kind)
        if not packet.exists():
            changed = temporary / "changed"
            shutil.copytree(original, changed)
            if kind == "later-report-asset":
                (changed / mutation["member"]).write_bytes(replacement[mutation["member"]])
            else:
                db = sqlite3.connect(changed / mutation["member"])
                try:
                    db.execute("PRAGMA trusted_schema=OFF")
                    cursor = db.execute("UPDATE rows SET cells=?,values_json=? WHERE ordinal=?",
                                        (mutation["after"][2], mutation["after"][3], mutation["ordinal"]))
                    check(cursor.rowcount == 1, "The native rejection must update exactly one original row")
                    db.commit()
                finally:
                    db.close()
                catalog = strict_json((changed / "catalog.json").read_bytes())
                build = next(row for row in catalog["builds"] if row["id"] == mutation["build"])
                build["files"]["rows.sqlite"].update(identity(changed / mutation["member"]))
                (changed / "catalog.json").write_bytes(encoded(catalog))
                (changed / ("native/" + build["id"] + "/review.json")).write_bytes(encoded(build))
            _archive(changed, packet, {k: v for k, v in manifest.items() if k not in {"files", "expandedBytes"}})
        verified = temporary / "verified"
        changed_manifest = _unpack(packet, verified)
        error = validate_rejection_packet(original, verified, manifest, changed_manifest, kind, mutation, replacement)
        check(identity(source) == {k: selected["originalPacket"][k] for k in ("bytes", "sha256")},
              "Preparing a rejection exercise changed its valid original source packet")
        details = {**selected, "mutation": mutation, "expectedError": error,
                   "packet": {"path": str(packet), **identity(packet)},
                   "originalManifestSha256": digest(encoded(manifest)),
                   "rejectedManifestSha256": digest(encoded(changed_manifest)),
                   "fullMemberCount": len(changed_manifest["files"]),
                   "originalRequestsSha256": digest(encoded(strict_json((original / "catalog.json").read_bytes())["requests"])),
                   "byteValidation": "Original unpack and full retained-history validation succeeded"}
        retained_json(directory / "packet.json", details)
        retained_json(directory / "members.json", verify_zip(packet))
        return details


def receiving_rejections(case, source):
    results = []
    for kind in ("later-report-asset", "native-sqlite-row"):
        selected = rejected_packet(case, source, kind)
        root = case / "rejection-workspaces" / kind
        private_directory(root.parent)
        output = case / "rejections" / kind
        with HumanitarianWorkspace(root, create=not root.exists()) as receiver:
            before = domain_snapshot(receiver)
            check(all(not rows for rows in before.values()),
                  "A rejected engineering packet previously leaked destination domain history")
            retained_json(output / "before.json", before)
            failure = None
            try:
                receiver.receive_review(Path(selected["packet"]["path"]))
            except InputError as error:
                failure = {"type": type(error).__name__, "message": str(error)}
            after = domain_snapshot(receiver)
            retained_json(output / "after.json", after)
            check(after == before,
                  "A rejected complete packet published partial destination reviews, requests, reports or objects")
            check(failure is not None and failure["message"] == selected["expectedError"],
                  "The rejection must reach its selected semantic check after valid hashes and original history")
        # Read through a new original Workspace so an uncommitted connection
        # view cannot conceal a destination-journal change.
        with HumanitarianWorkspace(root) as reopened:
            cold = domain_snapshot(reopened)
            check(cold == before, "Cold reopen found domain history from a rejected complete packet")
        retained_json(output / "cold-reopen.json", cold)
        result = {"schema": "stellar-forge.humanitarian-receiving-rejection.v1",
                  "operation": OPERATION, "kind": kind, "status": "REJECTED_WITHOUT_DOMAIN_CHANGE",
                  "originalPacket": selected["originalPacket"], "packet": selected["packet"],
                  "error": failure, "beforeSha256": digest(encoded(before)),
                  "afterSha256": digest(encoded(after)), "coldSha256": digest(encoded(cold)),
                  "originalRequestsSha256": selected["originalRequestsSha256"],
                  "workspace": str(root)}
        retained_json(output / "result.json", result)
        results.append(result)
    return results


def receive_prefix(ws, case, archive, source_history, source_requests):
    actual = ws.receive_review(archive)
    check(actual["receivedRevisions"] == [1, 2] and actual["review"]["id"] == REVIEW and
          actual["review"]["revision"] >= 2,
          "Independent receiving did not preserve the complete selected original history")
    history = ws.history(REVIEW)["revisions"]
    check(history[:2] == source_history, "Independent receiving changed original review revisions")
    for request in source_requests:
        check(ws.request(request["id"]) == request,
              "Independent receiving changed an original full mutation request")
    # These observations legitimately advance after the recipient's own r3.
    # Store exact actual returns by content identity without overwriting the first return.
    raw = encoded(actual)
    retain(case / "receiving-observations" / (digest(raw) + ".json"), raw)
    return actual


def cli_read(case, name, args, lease):
    request = {"argv": [sys.executable, "-B", str(HERE / "humanitarian_cli.py"), *args],
               "cwd": str(HERE)}
    retained_json(case / "cli" / (name + "-request.json"), request)
    output = case / "cli" / (name + ".json")
    if output.exists():
        return strict_json(output.read_bytes())
    # New unique logs preserve every accepted invocation; the child inherits the
    # original whole-case flock until it actually returns.
    attempt = case / "cli" / (name + "-attempt-" + uuid.uuid4().hex)
    with attempt.with_suffix(".stdout").open("xb") as stdout, attempt.with_suffix(".stderr").open("xb") as stderr:
        child = subprocess.Popen(request["argv"], cwd=HERE, stdin=subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, pass_fds=(lease.fileno(),))
        try:
            code = child.wait()
        except BaseException:
            child.wait()
            raise
        stdout.flush()
        stderr.flush()
        os.fsync(stdout.fileno())
        os.fsync(stderr.fileno())
    check(code == 0, "Original CLI returned a failure; complete attempt logs remain retained")
    value = strict_json(attempt.with_suffix(".stdout").read_bytes())
    retain(output, encoded(value))
    return value


def completed(case):
    path = case / "operated-case.json"
    if not path.exists():
        return None
    result = strict_json(path.read_bytes())
    check(result.get("operation") == OPERATION and result.get("status") == "COMPLETE",
          "This original operating directory contains another completion record")
    for row in result["files"]:
        selected = case / row["path"]
        check(selected.resolve().is_relative_to(case) and
              identity(selected) == {"bytes": row["bytes"], "sha256": row["sha256"]},
              "A complete retained operating artifact changed")
    # Actual model reopen verifies report/source history as well as file receipts.
    for dirname, revision in (("workspace", 2), ("receiver", 3)):
        with HumanitarianWorkspace(case / dirname) as ws:
            check(ws.review(REVIEW, revision)["revision"] == revision and
                  ws.review(REVIEW)["revision"] >= revision,
                  "The completed original workspace no longer contains its selected review")
            expected = strict_json((case / "observations" / ("source-history.json" if dirname == "workspace"
                                                         else "recipient-history.json")).read_bytes())
            check(ws.history(REVIEW)["revisions"][:revision] == expected["revisions"],
                  "Cold reopen changed a complete retained review")
    return result


def operate(args, case, lease):
    originals = private_directory(case / "originals")
    private_directory(case / "exports")
    ref_info = copy_original(args.reference_source, originals / "reference.source", MAX_SOURCE)
    definition_info = copy_original(args.reference_definition, originals / "reference-definition.json", 1024 * 1024)
    if (case / "selection.json").exists():
        previous_selection = strict_json((case / "selection.json").read_bytes())
        for key, selected in (("referenceSource", ref_info), ("referenceDefinition", definition_info)):
            prior = previous_selection[key]
            check({k: selected[k] for k in ("bytes", "sha256")} ==
                  {k: prior[k] for k in ("bytes", "sha256")},
                  "The same operating case requires its unchanged complete original inputs")
            selected["name"] = prior["name"]
    definition = strict_json((originals / "reference-definition.json").read_bytes())
    check(isinstance(definition, dict) and definition.get("source") == ref_info["sha256"],
          "The supplied exact save-reference input must name the SHA-256 of these complete original bytes")
    selection = {"schema": "stellar-forge.humanitarian-operated-selection.v1", "operation": OPERATION,
                 "referenceSource": ref_info, "referenceDefinition": definition_info,
                 "review": REVIEW, "recordPurpose": "Clearly labelled engineering examples; no beneficiary or customer data"}
    retained_json(case / "selection.json", selection)
    prior = completed(case)
    if prior is not None:
        return prior
    ws_root = case / "workspace"
    with HumanitarianWorkspace(ws_root, create=not ws_root.exists()) as ws:
        with (originals / "reference.source").open("rb") as stream:
            original = ws.add_source(stream, "Original administrative reference", ref_info["name"])
        check(original["id"] == definition["source"], "Reference intake changed the original source")
        reference = original_action(ws, case, "reference", definition, ws.save_reference)
        level = max(node["level"] for node in reference["nodes"])
        nodes = sorted((node for node in reference["nodes"] if node["level"] == level), key=lambda node: node["code"])
        check(nodes, "The complete reference has no selected deepest nodes")
        alias_value = "Engineering example unresolved location"
        occupied = {normalized_name(name) for node in reference["nodes"] for name in node["aliases"]}
        while normalized_name(alias_value) in occupied:
            alias_value += " x"
        records = []
        for number in range(1, 33):
            node = nodes[(number - 1) % len(nodes)]
            records.append({
                "record_id": "R" + str(number).zfill(3), "location_code": node["code"],
                "location_name": node["name"], "scope_code": node["parent"] or "",
                "sector": "Precision example" if number <= 2 else ("Engineering Health" if number % 2 else "Engineering Shelter"),
                "people": number * 2, "amount": "0.1" if number == 1 else "0.2" if number == 2 else "" if number == 4 else str(number) + ".05",
                "currency": "USD",
            })
        before = copy.deepcopy(records)
        duplicate = copy.deepcopy(records[1])
        duplicate["people"] = 999
        before.append(duplicate)
        after = copy.deepcopy(records[:-1])
        after[2]["people"] += 3
        after[0]["location_code"] = ""
        after[0]["location_name"] = alias_value
        added = copy.deepcopy(records[-1])
        added["record_id"] = "R033"
        after.append(added)
        inputs = {
            "before-original.csv": csv_bytes(before, [(field, field) for field in FIELDS]),
            "before-corrected.csv": csv_bytes(records, [(field, field) for field in FIELDS]),
            "after-original.csv": csv_bytes(after, AFTER),
        }
        retained_json(case / "generated" / "engineering-records.json", {
            "schema": "stellar-forge.humanitarian-engineering-records.v1",
            "purpose": selection["recordPurpose"], "reference": reference["id"], "level": level,
            "actualReferenceNodesAvailable": len(nodes), "nodesCycled": len(nodes) < 32,
            "correctedBefore": records, "originalBefore": before, "afterCanonical": after,
            "afterPhysicalColumns": AFTER, "aliasExample": alias_value,
        })
        sources = {}
        for name, body in inputs.items():
            retain(case / "generated" / name, body)
            sources[name] = ws.add_source(io.BytesIO(body), "Engineering example " + name, name)
        before_mapping_raw = mapping_request(reference, FIELDS, FIELDS, "Engineering before mapping",
                                             "humanitarian-before-mapping-001", level)
        after_mapping_raw = mapping_request(reference, [label for label, _ in AFTER],
                                            [field for _, field in AFTER], "Engineering after mapping",
                                            "humanitarian-after-mapping-001", level)
        before_mapping = original_action(ws, case, "before-mapping", before_mapping_raw, ws.save_mapping)
        after_mapping = original_action(ws, case, "after-mapping", after_mapping_raw, ws.save_mapping)
        def edition(source, mapping, label, period):
            return {"source": source["id"], "mapping": mapping["id"], "label": label, "period": period}
        r1_input = {
            "requestId": "humanitarian-receiving-r1", "id": REVIEW, "expectedRevision": 0,
            "name": "Engineering example: complete humanitarian round receiving",
            "editions": [
                edition(sources["before-original.csv"], before_mapping, "Engineering original before: duplicate retained", "engineering-before"),
                edition(sources["after-original.csv"], after_mapping, "Engineering original after: unresolved name retained", "engineering-after"),
            ], "aliases": [], "reviewer": "Receiving operator",
            "notes": "Generated engineering records use actual administrative codes. Original duplicate and unresolved alias are retained for named correction.",
            "rowPolicy": "require-complete",
        }
        r1 = original_action(ws, case, "review-r1", r1_input, ws.save_review)
        check(r1["status"] == "needs-review" and r1["counts"] ==
              {"totalRows": 65, "includedRows": 62, "excludedRows": 3},
              "Original duplicate and unresolved-name coverage differs from the complete case")
        report1 = ws.report(REVIEW, 1)
        check(report1["issues"].get("DUPLICATE_KEY") == 2 and report1["issues"].get("UNKNOWN_NAME") == 1,
              "The complete original issues do not retain both duplicate rows and the unknown alias")
        retained_json(case / "observations" / "report-r1.json", report1)
        for number in (0, 1):
            retained_json(case / "observations" / ("issues-r1-edition-" + str(number) + ".json"),
                          ws.rows(REVIEW, 1, number, 0, 1000, True))
        target = nodes[0]
        alias_raw = {
            "requestId": "humanitarian-receiving-alias-001", "reference": reference["id"],
            "level": level, "match": "name", "value": alias_value,
            "scopeCode": target["parent"], "code": target["code"], "reviewer": "Receiving operator",
            "reason": "Explicit engineering example decision linking this generated alias to the selected original reference node.",
        }
        alias = original_action(ws, case, "alias", alias_raw, ws.save_alias)
        r2_input = copy.deepcopy(r1_input)
        r2_input.update(requestId="humanitarian-receiving-r2", expectedRevision=1,
                        aliases=[alias["id"]],
                        notes="Engineering correction retains the old source, selects the complete corrected before edition, and applies the named alias decision.")
        r2_input["editions"][0] = edition(sources["before-corrected.csv"], before_mapping,
                                        "Engineering corrected before", "engineering-before")
        r2 = original_action(ws, case, "review-r2", r2_input, ws.save_review)
        check(r2["status"] == "ready" and r2["counts"] ==
              {"totalRows": 64, "includedRows": 64, "excludedRows": 0},
              "Corrected complete case did not include every selected row")
        report2 = ws.report(REVIEW, 2)
        expected_comparison = {"added": 1, "removed": 1, "changed": 2, "unchanged": 29,
                               "excludedBefore": 0, "excludedAfter": 0}
        check(report2["comparison"]["counts"] == expected_comparison,
              "The complete comparison differs from original added, removed, changed and unchanged records")
        retained_json(case / "observations" / "report-r2.json", report2)
        for number in (0, 1):
            normalized = ws.rows(REVIEW, 2, number, 0, 1000)
            check(normalized["total"] == 32 and len(normalized["rows"]) == 32,
                  "The full canonical register is incomplete")
            missing = [row for row in normalized["rows"] if row["values"]["record_id"] == "R004"]
            check(len(missing) == 1 and missing[0]["values"]["amount"] is None,
                  "Missing decimal amount must remain distinct from zero")
            retained_json(case / "observations" / ("rows-r2-edition-" + str(number) + ".json"), normalized)
            donor = ws.output_rows(REVIEW, 2, number, "donor", 0, 1000)
            records_by_name = [dict(zip([c["field"] for c in donor["columns"]], row["values"])) for row in donor["rows"]]
            precise = [row for row in records_by_name if row["sector"] == "Precision example" and row["currency"] == "USD"]
            check(len(precise) == 1 and precise[0]["total_amount"] == "0.3" and precise[0]["record_count"] == 2,
                  "Exact original decimal aggregation must return 0.3 from 0.1 and 0.2")
            retained_json(case / "observations" / ("donor-r2-edition-" + str(number) + ".json"), donor)
            cluster = ws.output_rows(REVIEW, 2, number, "cluster", 0, 1000)
            check(cluster["total"] == 32 and len(cluster["rows"]) == 32,
                  "Full cluster layout omitted a complete canonical record")
            retained_json(case / "observations" / ("cluster-r2-edition-" + str(number) + ".json"), cluster)
            native_query(ws, case, r2["editions"][number])
        changes = ws.comparison_rows(REVIEW, 2, 0, 1000)
        check(changes["total"] == 4 and len(changes["rows"]) == 4 and
              {tuple(row["key"]): row["kind"] for row in changes["rows"]} ==
              {("R001",): "changed", ("R003",): "changed", ("R032",): "removed", ("R033",): "added"},
              "Original full comparison rows differ from the four selected changes")
        retained_json(case / "observations" / "comparison-r2.json", changes)
        check(ws.save_review(r1_input) == r1 and ws.save_review(r2_input) == r2 and
              ws.review(REVIEW)["revision"] == 2,
              "Original request replay changed the accepted revision or result")
        conflict = copy.deepcopy(r2_input)
        conflict["notes"] += " Different content must be refused."
        expected_failure(case, "conflicting-request", lambda: ws.save_review(conflict))
        check(ws.review(REVIEW) == r2, "A refused conflicting request changed saved state")
        source_history = ws.history(REVIEW)
        retained_json(case / "observations" / "source-history.json", source_history)
        request_rows = [ws.request(raw["requestId"]) for raw in
                        (definition, before_mapping_raw, after_mapping_raw, alias_raw, r1_input, r2_input)]
        retained_json(case / "observations" / "source-requests.json", request_rows)
        report_export = archive_result(case, "report-export",
            ws.write_report(REVIEW, case / "exports" / "Humanitarian_Engineering_Report.zip", 2))
        full_export = archive_result(case, "full-export",
            ws.export_review(REVIEW, case / "exports" / "Humanitarian_Complete_Receiving.zip", 2))
        check(ws.export_review(REVIEW, Path(full_export["path"]), 2) == full_export,
              "Repeat full export changed the original descriptor or completed bytes")
    rejections = receiving_rejections(case, Path(full_export["path"]))
    receiver_root = case / "receiver"
    with HumanitarianWorkspace(receiver_root, create=not receiver_root.exists()) as receiver:
        receive_prefix(receiver, case, Path(full_export["path"]), source_history["revisions"], request_rows)
        practice = copy.deepcopy(r2_input)
        practice.update(requestId="humanitarian-recipient-practice-r3", expectedRevision=2,
                        reviewer="Receiving operator",
                        notes=r2_input["notes"] + " Independent recipient practice revision; original reports remain selected.")
        r3 = original_action(receiver, case, "recipient-r3", practice, receiver.save_review)
        check(r3["revision"] == 3 and r3["counts"] == r2["counts"],
              "Independent recipient practice must preserve complete source and coverage")
        second = receive_prefix(receiver, case, Path(full_export["path"]), source_history["revisions"], request_rows)
        check(second["review"] == r3 and receiver.review(REVIEW) == r3,
              "Receiving the older original archive replaced the later local revision")
        retained_json(case / "observations" / "recipient-history.json", receiver.history(REVIEW))
        recipient_export = archive_result(case, "recipient-export",
            receiver.export_review(REVIEW, case / "exports" / "Humanitarian_Recipient_R3_Receiving.zip", 3))
    with HumanitarianWorkspace(ws_root) as ws:
        check(ws.review(REVIEW) == r2 and ws.history(REVIEW) == source_history,
              "Source cold reopen changed the complete accepted history")
        check(ws.source(sources["before-original.csv"]["id"])["id"] == sources["before-original.csv"]["id"],
              "The retained old duplicate source is absent after cold reopen")
        retained_json(case / "observations" / "source-cold-reopen.json", {"review": ws.review(REVIEW), "history": ws.history(REVIEW)})
    with HumanitarianWorkspace(receiver_root) as receiver:
        check(receiver.review(REVIEW) == r3 and receiver.history(REVIEW)["revisions"][:2] == source_history["revisions"],
              "Recipient cold reopen changed original history or its later local revision")
        retained_json(case / "observations" / "recipient-cold-reopen.json", {"review": receiver.review(REVIEW), "history": receiver.history(REVIEW)})
    cli_report = cli_read(case, "source-report", ["--workspace", str(ws_root), "report", "--id", REVIEW, "--revision", "2"], lease)
    check(cli_report == report2, "The actual CLI report differs from the original native model")
    cli_history = cli_read(case, "recipient-history", ["--workspace", str(receiver_root), "history", "--id", REVIEW], lease)
    check(cli_history["revisions"][-1] == r3, "The actual CLI did not reopen the recipient practice revision")
    files = []
    for root in ("originals", "generated", "requests", "observations", "cli", "exports", "rejections"):
        for path in sorted((case / root).rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(case).parts) and "-attempt-" not in path.name:
                files.append({"path": path.relative_to(case).as_posix(), **identity(path)})
    files.append({"path": "selection.json", **identity(case / "selection.json")})
    result = {
        "schema": "stellar-forge.humanitarian-operated-case.v1", "operation": OPERATION, "status": "COMPLETE",
        "review": REVIEW, "sourceRevision": 2, "recipientRevision": 3,
        "purpose": selection["recordPurpose"], "reference": reference["id"],
        "counts": r2["counts"], "comparison": expected_comparison,
        "exactDecimalExample": {"inputs": ["0.1", "0.2"], "sum": "0.3", "count": 2, "currency": "USD"},
        "sourceWorkspace": str(ws_root), "receiverWorkspace": str(receiver_root),
        "receivingRejections": rejections,
        "reportArchive": report_export, "receivingArchive": full_export, "recipientArchive": recipient_export,
        "checks": ["original issue coverage", "named correction", "full output paging", "full comparison paging",
                   "original Dataset queries", "exact request replay", "conflicting request refusal",
                   "complete report and history exports", "rehashed later report asset rejection without domain publication",
                   "rehashed native SQLite row rejection without domain publication", "independent native receiving",
                   "later recipient revision preservation", "source and recipient cold reopen", "actual CLI reopen"],
        "files": sorted(files, key=lambda row: row["path"]),
    }
    retain(case / "operated-case.json", encoded(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-source", type=Path, required=True)
    parser.add_argument("--reference-definition", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    case = private_directory(args.directory.expanduser().absolute())
    lock_path = case / "operate.lock"
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "a+b") as lease:
        fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        check(stat.S_ISREG(os.fstat(lease.fileno()).st_mode), "Original operation lease must be a regular file")
        try:
            result = operate(args, case, lease)
            print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        finally:
            fcntl.flock(lease.fileno(), fcntl.LOCK_UN)


if __name__ == "__main__":
    main()
