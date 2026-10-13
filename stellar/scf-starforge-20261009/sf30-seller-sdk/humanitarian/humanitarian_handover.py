"""MIT. Complete reporting exports and independently rebuildable receiving archives."""
from __future__ import annotations

import _bootstrap
from collections import defaultdict
import csv
import hashlib
import html
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import zipfile

from workspace import InputError, json_bytes, load_json, digest, private_write, file_digest, regular, sync_dir, checked_id
from humanitarian_reference import reference_index, ancestors
from humanitarian_reports import MAX_REPORT, report_identity
from humanitarian_source import identifier, cell_text

SCHEMA = "stellar-forge.humanitarian-receiving.v1"
REPORT_ARCHIVE = "stellar-forge.humanitarian-report-archive.v1"
MAX_ARCHIVE = 2 * 1024 * 1024 * 1024
MAX_MEMBERS = 8192


def _write(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_write(path, data)


def _copy(source, destination, limit=MAX_ARCHIVE):
    regular(source, limit)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with source.open("rb") as incoming, os.fdopen(os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
        shutil.copyfileobj(incoming, output, 1024 * 1024)
        output.flush()
        os.fsync(output.fileno())


def _csv(path, header, records, *, hxl=None, types=None, excel=False):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    escaped = 0
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w", encoding="utf-8-sig" if excel else "utf-8", newline="") as output:
        writer = csv.writer(output, lineterminator="\n")
        def safe(value, kind="string"):
            nonlocal escaped
            value = cell_text(value)
            if excel and kind not in {"integer", "number", "decimal", "boolean"} and value.lstrip(" \t\r\n").startswith(("=", "+", "-", "@")):
                escaped += 1
                return "'" + value
            return value
        writer.writerow([safe(h) for h in header])
        if hxl is not None:
            writer.writerow(hxl)
        for record in records:
            writer.writerow([safe(value, types[i] if types else "string") for i, value in enumerate(record)])
        output.flush()
        os.fsync(output.fileno())
    return escaped


def _choice_names(reference):
    result, used = {}, set()
    for node in reference["nodes"]:
        name = re.sub(r"[^A-Za-z0-9_]", "_", node["code"])
        if not name or not re.match(r"[A-Za-z_]", name):
            name = "p_" + name
        if name in used:
            name += "_" + digest(node["code"].encode())[:12]
        if name in used:
            raise InputError("Administrative codes cannot be assigned unique form choice names")
        used.add(name)
        result[node["code"]] = name
    return result


def _kobo(directory, reference):
    index = reference_index(reference)
    names = _choice_names(reference)
    levels = sorted({n["level"] for n in reference["nodes"]})
    parent_fields = [f"adm{n}" for n in levels[:-1]]
    headers = ["list_name", "name", "label"] + parent_fields + ["reference_code"]
    records = []
    for node in reference["nodes"]:
        parents = ancestors(index, node["code"])
        records.append([f"adm{node['level']}", names[node["code"]], node["name"]] +
                       [names[parents[level]["code"]] if level in parents and level < node["level"] else "" for level in levels[:-1]] +
                       [node["code"]])
    _csv(directory / "choices.csv", headers, records)
    survey = []
    for index_number, level in enumerate(levels):
        parent = levels[index_number - 1] if index_number else None
        choice_filter = "" if parent is None else "adm" + str(parent) + "=$" + "{adm" + str(parent) + "}"
        survey.append([f"select_one adm{level}", f"adm{level}", f"Administrative level {level}", "yes", choice_filter])
    _csv(directory / "survey.csv", ["type", "name", "label", "required", "choice_filter"], survey)
    _csv(directory / "settings.csv", ["form_title", "form_id", "version"],
         [["Administrative selection", "administrative_" + reference["id"][:16], reference["id"][:12]]])
    _csv(directory / "code_lookup.csv", ["list_name", "name", "reference_code", "parent_code", "reference_id"],
         [[f"adm{n['level']}", names[n["code"]], n["code"], n["parent"] or "", reference["id"]] for n in reference["nodes"]])
    _write(directory / "README.txt", (
        "ADMINISTRATIVE CHOICES\n\n"
        "choices.csv contains the entire pinned reference hierarchy. Its list_name, name and label columns "
        "can be pasted into the Kobo Formbuilder cascading-select table. Parent columns contain parent choice names.\n\n"
        "For an XLSForm, create survey, choices and settings sheets and import the corresponding complete CSV tables "
        "with columns treated as text. Retain these exact sheet and column names. The survey uses immediate-parent "
        "choice filters; the complete original reference codes remain in reference_code and code_lookup.csv. "
        "When a code needs a form-safe identifier, code_lookup.csv records that reversible mapping.\n\n"
        "Review labels and question wording with the form owner, then use the owner's ordinary form preview and deployment. "
        "Reference edition: " + reference["id"] + "\n"
    ).encode())


def _offline(directory, review, report, previews, database_link):
    def e(value):
        return html.escape(str(value), quote=True)
    pieces = ['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
              '<title>' + e(review["name"]) + '</title><style>',
              'body{font:15px system-ui,sans-serif;color:#171717;background:#fff;margin:0;padding:28px;max-width:1500px}h1{font-size:26px}h2{font-size:19px;margin-top:30px}a{color:#222}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top;white-space:pre-wrap}th{background:#eee}.scroll{overflow:auto}code{overflow-wrap:anywhere}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.fact{border:1px solid #aaa;padding:12px}small{color:#444}</style>',
              '<h1>' + e(review["name"]) + '</h1><p>Revision ' + str(review["revision"]) + ' · ' + e(review["status"]) + '</p>',
              '<div class="facts">' + "".join('<div class="fact">' + e(k) + '<br><strong>' + e(v) + '</strong></div>' for k, v in report["counts"].items()) + '</div>',
              '<p>Reviewer: ' + e(review["reviewer"]) + '</p><p>' + e(review["notes"]) + '</p>',
              '<p>Reference edition: <code>' + e(review["reference"]) + '</code></p>',
              '<h2>Complete reporting data</h2><p><a href="' + e(database_link) + '">SQLite reporting database</a> · <a href="normalized_rows.jsonl">All normalized rows and decisions</a> · <a href="issues.csv">All row issues</a> · <a href="changes.jsonl">All edition changes</a> · <a href="reference.json">Complete administrative reference</a> · <a href="kobo/README.txt">Kobo and XLSForm tables</a></p>']
    for edition in report["editions"]:
        pieces.append('<p>Edition ' + str(edition["id"]) + ': ' + e(edition["label"]) + ' (' + e(edition["period"]) + ') · <a href="edition_' + str(edition["id"]) + '_rows.csv">Complete normalized CSV</a></p>')
    if report["comparison"]["enabled"]:
        pieces.append('<h2>Edition comparison</h2><table><tbody>' + "".join('<tr><th>' + e(k) + '</th><td>' + e(v) + '</td></tr>' for k, v in report["comparison"]["counts"].items()) + '</tbody></table>')
    for descriptor in report["outputs"]:
        prefix = "edition_" + str(descriptor["edition"]) + "_" + descriptor["output"]
        coverage = descriptor["coverage"]
        pieces.append('<h2>' + e(descriptor["title"]) + ' · edition ' + str(descriptor["edition"]) + '</h2><p>' +
                      str(descriptor["rows"]) + ' output rows; ' + str(coverage["includedRows"]) + ' included source rows; ' +
                      str(coverage["excludedRows"]) + ' source rows require correction. <a href="outputs/' + e(prefix) + '.csv">Complete CSV</a> · ' +
                      '<a href="outputs/' + e(prefix) + '.hxl.csv">Complete HXL CSV</a> · <a href="outputs/' + e(prefix) + '.excel.csv">Excel import CSV</a></p>')
        preview = previews[(descriptor["edition"], descriptor["output"])]
        pieces.append('<div class="scroll"><table><thead><tr>' + "".join('<th>' + e(c["label"]) + '</th>' for c in descriptor["columns"]) +
                      '</tr></thead><tbody>' + "".join('<tr>' + "".join('<td>' + e(cell_text(v)) + '</td>' for v in row) + '</tr>' for row in preview) +
                      '</tbody></table></div><small>Preview: first ' + str(len(preview)) + ' of ' + str(descriptor["rows"]) + ' rows. The files above contain every row.</small>')
    pieces.append('<h2>Operating notes</h2><p>Administrative matches use the exact pinned codes, names and selected named decisions. '
                  'Each output records its included and excluded source counts. Missing amounts stay missing. Decimal sums are written as exact decimal text. '
                  'Business-key duplicates remain in the original and normalized data; they are excluded from the unique-record edition comparison.</p>'
                  '<p>Open README.txt for the handover workflow, SQL examples, source editions and Excel import settings.</p></html>')
    _write(directory / "index.html", "".join(pieces).encode())


def _report_assets(ws, review, directory, *, include_database=True, database_link="rows.sqlite"):
    directory.mkdir(mode=0o700, parents=True, exist_ok=False)
    report = ws.report(review["id"], review["revision"])
    reference = ws.reference(review["reference"])
    _write(directory / "report.json", json_bytes(report))
    _write(directory / "review.json", json_bytes(review))
    _write(directory / "reference.json", json_bytes(reference))
    _write(directory / "aliases.json", json_bytes([ws.alias(a) for a in review["aliases"]]))
    _write(directory / "mappings.json", json_bytes([ws.mapping(e["mapping"]) for e in review["editions"]]))
    source_path = ws.root / "reports" / report["id"] / "rows.sqlite"
    if include_database:
        _copy(source_path, directory / "rows.sqlite", MAX_REPORT)
    db = sqlite3.connect(source_path.as_uri() + "?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    previews, excel_escapes = {}, {}
    try:
        with os.fdopen(os.open(directory / "normalized_rows.jsonl", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
            for row in db.execute("SELECT * FROM rows ORDER BY edition,source_row"):
                output.write(json_bytes({"edition": row["edition"], "source_row": row["source_row"],
                                         "key": load_json(row["k"]) if row["k"] is not None else None,
                                         "values": load_json(row["values_json"]), "resolution": load_json(row["resolution_json"]),
                                         "issues": load_json(row["issues_json"])}))
            output.flush()
            os.fsync(output.fileno())
        for edition in report["editions"]:
            mapping = ws.mapping(edition["mapping"])
            fields = ["source_row"] + [f["name"] for f in mapping["fields"] if f["name"] != "source_row"]
            rows = (load_json(r[0]) for r in db.execute("SELECT values_json FROM rows WHERE edition=? ORDER BY source_row", (edition["id"],)))
            _csv(directory / ("edition_" + str(edition["id"]) + "_rows.csv"), fields,
                 ([row.get(field) for field in fields] for row in rows))
        def issues():
            for row in db.execute("SELECT edition,source_row,k,issues_json FROM rows ORDER BY edition,source_row"):
                for issue in load_json(row["issues_json"]):
                    yield [row["edition"], row["source_row"], issue["code"], issue["severity"], issue["message"],
                           json_bytes(issue).decode().strip(), row["k"].strip() if row["k"] is not None else ""]
        _csv(directory / "issues.csv", ["edition", "source_row", "code", "severity", "message", "complete_issue", "business_key"], issues())
        with os.fdopen(os.open(directory / "changes.jsonl", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
            for row in db.execute("SELECT body FROM changes ORDER BY ordinal"):
                output.write(row[0].encode())
            output.flush()
            os.fsync(output.fileno())
        for descriptor in report["outputs"]:
            edition, output_id = descriptor["edition"], descriptor["output"]
            columns = descriptor["columns"]
            def records():
                for row in db.execute("SELECT values_json FROM layout_rows WHERE edition=? AND output=? ORDER BY ordinal", (edition, output_id)):
                    yield load_json(row[0])
            prefix = "edition_" + str(edition) + "_" + output_id
            headers, types = [c["label"] for c in columns], [c["type"] for c in columns]
            _csv(directory / "outputs" / (prefix + ".csv"), headers, records(), types=types)
            _csv(directory / "outputs" / (prefix + ".hxl.csv"), headers, records(), hxl=[c["hxl"] for c in columns], types=types)
            excel_escapes[prefix] = _csv(directory / "outputs" / (prefix + ".excel.csv"), headers, records(), types=types, excel=True)
            previews[(edition, output_id)] = [load_json(r[0]) for r in db.execute(
                "SELECT values_json FROM layout_rows WHERE edition=? AND output=? ORDER BY ordinal LIMIT 50", (edition, output_id))]
    finally:
        db.close()
    _kobo(directory / "kobo", reference)
    _write(directory / "excel_import.json", json_bytes({"schema": "stellar-forge.humanitarian-excel-import.v1",
                                                      "encoding": "UTF-8 with BOM", "textCellsPrefixedForFormulaSafety": excel_escapes,
                                                      "originalValues": "The ordinary CSV, complete original sources and JSONL retain original text"}))
    _write(directory / "README.txt", (
        "HUMANITARIAN REPORTING HANDOVER\n\n"
        f"{review['name']} / revision {review['revision']} / {review['status']}\n\n"
        "Open index.html for the offline report. The outputs directory contains every row of each agreed layout. "
        "Ordinary CSV preserves cell values; HXL CSV adds its tag row immediately below the labels. HXL is supported locally "
        "and does not require the retired HXL web services.\n\n"
        "For Excel use Data > From Text/CSV, select UTF-8 and set administrative codes, identifiers and exact-decimal columns "
        "to Text before loading. Excel import CSV files include a UTF-8 BOM and prefix potentially executable text cells with "
        "an apostrophe. excel_import.json records those changes. The canonical CSV and original retained sources remain available.\n\n"
        "rows.sqlite contains rows, layout_rows and changes. Complete original row identities, selected values, resolution "
        "decisions and issues are JSON fields. Example:\n"
        "SELECT edition, source_row, json_extract(values_json, '$.admin_code') AS admin_code,\n"
        "       json_extract(values_json, '$.admin_name') AS admin_name\n"
        "FROM rows WHERE valid=1 ORDER BY edition,source_row;\n"
        "SELECT edition,output,ordinal,values_json FROM layout_rows ORDER BY edition,output,ordinal;\n\n"
        "Corrections: retain the replacement source as a new edition, save its explicit mapping when headers change, "
        "add named alias decisions for ambiguous locations, and save the next review revision using the last observed revision. "
        "History keeps all previous editions and reports. Reuse an existing request ID only for the identical complete input.\n\n"
        "Handover practice: the incoming operator imports the complete receiving ZIP into a new private workspace, "
        "opens the current and prior revisions, checks the agreed layout totals, makes a correction as a new revision, "
        "exports the resulting report and closes/reopens the workspace. Record who performed the practice and any remaining "
        "source-owner decisions in the next review notes.\n"
    ).encode())
    _offline(directory, review, report, previews, database_link)
    return report


def _archive(directory, output, envelope):
    paths = sorted(p for p in directory.rglob("*") if p.is_file())
    if len(paths) + 1 > MAX_MEMBERS:
        raise InputError("Receiving archive exceeds its member limit")
    files = [{"path": p.relative_to(directory).as_posix(), "bytes": p.stat().st_size,
              "sha256": file_digest(p, MAX_ARCHIVE)} for p in paths]
    total = sum(f["bytes"] for f in files)
    if total > MAX_ARCHIVE:
        raise InputError("Complete receiving archive exceeds two GiB of expanded content")
    manifest = envelope | {"files": files, "expandedBytes": total}
    _write(directory / "manifest.json", json_bytes(manifest))
    target = directory.parent / "complete.zip"
    private_write(target, b"")
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for path in sorted(p for p in directory.rglob("*") if p.is_file()):
            info = zipfile.ZipInfo(path.relative_to(directory).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            with path.open("rb") as incoming, archive.open(info, "w", force_zip64=True) as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
    if target.stat().st_size > MAX_ARCHIVE:
        raise InputError("Compressed receiving archive exceeds two GiB")
    output = output.expanduser().absolute()
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    checksum = file_digest(target, MAX_ARCHIVE)
    if output.exists() or output.is_symlink():
        if output.is_symlink() or file_digest(output, MAX_ARCHIVE) != checksum:
            raise InputError("Output already exists with different bytes; choose a new export filename")
    else:
        with target.open("rb") as incoming, os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        sync_dir(output.parent)
    return {"path": str(output), "bytes": output.stat().st_size, "sha256": checksum,
            "review": envelope["review"], "revision": envelope["revision"], "report": envelope["report"]}


def write_report(ws, ident, output, revision=None):
    review = ws.review(ident, revision)
    with ws.scratch() as temporary:
        directory = temporary / "report"
        report = _report_assets(ws, review, directory)
        return _archive(directory, output, {"schema": REPORT_ARCHIVE, "review": ident,
                                           "revision": review["revision"], "report": report["id"]})


def export_review(ws, ident, output, revision=None):
    current = ws.review(ident, revision)
    history = [r for r in ws.history(ident)["revisions"] if r["revision"] <= current["revision"]]
    object_ids = defaultdict(set)
    sources, plans, builds = set(), set(), set()
    for review in history:
        object_ids["reference"].add(review["reference"])
        object_ids["alias"].update(review["aliases"])
        for edition in review["editions"]:
            object_ids["mapping"].add(edition["mapping"])
            sources.add(edition["source"])
            builds.add(edition["build"])
    objects = []
    for kind in ("reference", "mapping", "alias"):
        for object_id in sorted(object_ids[kind]):
            body = ws._object(kind, object_id)
            objects.append({"kind": kind, "body": body})
            if kind == "reference":
                sources.add(body["source"])
            if kind == "mapping":
                plans.add(body["plan"])
    requests = []
    request_ids = {review["requestId"] for review in history}
    for row in ws.db.execute("SELECT id,kind,result FROM human_requests ORDER BY id"):
        result = load_json(row["result"])
        if row["id"] in request_ids or (row["kind"] in object_ids and result.get("id") in object_ids[row["kind"]]):
            requests.append(ws.request(row["id"]))
    if {r["id"] for r in requests if r["kind"] == "review"} != request_ids:
        raise InputError("Every retained review must include its complete original request")
    with ws.scratch() as temporary:
        directory = temporary / "receiving"
        directory.mkdir(mode=0o700)
        _report_assets(ws, current, directory / "report", include_database=False,
                       database_link="../history/r" + str(current["revision"]).zfill(6) + "/rows.sqlite")
        source_bodies = [ws.source(source) for source in sorted(sources)]
        plan_bodies = [{"id": plan, "plan": ws.plan(plan)} for plan in sorted(plans)]
        build_bodies = [ws.build_view(build) for build in sorted(builds)]
        for source in source_bodies:
            _copy(ws.root / "sources" / (source["id"] + "." + ws.kind), directory / "sources" / (source["id"] + ".source"))
        for plan in plan_bodies:
            _write(directory / "plans" / (plan["id"] + ".json"), json_bytes(plan["plan"]))
        for build in build_bodies:
            for name in ("data.csv", "dataset.json", "rows.sqlite"):
                _copy(ws._build_path(build["id"], name), directory / "native" / build["id"] / name)
            _write(directory / "native" / build["id"] / "review.json", json_bytes(build))
        for review in history:
            report = ws.report(ident, review["revision"])
            path = directory / "history" / ("r" + str(review["revision"]).zfill(6))
            _write(path / "review.json", json_bytes(review))
            _write(path / "report.json", json_bytes(report))
            _copy(ws.root / "reports" / report["id"] / "rows.sqlite", path / "rows.sqlite", MAX_REPORT)
        catalog = {"schema": SCHEMA, "review": ident, "revision": current["revision"],
                   "sources": source_bodies, "plans": plan_bodies, "builds": build_bodies,
                   "objects": objects, "reviews": history, "requests": requests}
        _write(directory / "catalog.json", json_bytes(catalog))
        _write(directory / "README.txt", (
            "COMPLETE HUMANITARIAN RECEIVING\n\n"
            "This archive contains all selected original source bytes, the pinned reference editions, mappings, "
            "named decisions, native Dataset builds, every review revision through the selected revision, complete reports "
            "and the original mutation inputs/results.\n\n"
            "Open report/index.html for the current offline report. Use dataset-humanitarian to create a private workspace "
            "and receive this complete archive; the application reconstructs the original native builds and complete reports "
            "from the retained source bytes. Repeating an older receive preserves any later local review revisions.\n\n"
            "Read report/README.txt for the correction, SQL, Excel, Kobo and operator-transfer workflow.\n"
        ).encode())
        return _archive(directory, output, {"schema": SCHEMA, "review": ident,
                                           "revision": current["revision"], "report": current["report"]})


def _unpack(path, directory):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_ARCHIVE:
        raise InputError("Choose a complete regular receiving ZIP within two GiB")
    directory.mkdir(mode=0o700)
    try:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            names, total = set(), 0
            if not members or len(members) > MAX_MEMBERS:
                raise InputError("Receiving ZIP has an invalid member count")
            for member in members:
                name = member.filename
                parts = PurePosixPath(name).parts
                mode = member.external_attr >> 16
                if (name in names or not parts or name.startswith("/") or "\\" in name or "\x00" in name or
                    any(p in ("", ".", "..") for p in parts) or PurePosixPath(name).as_posix() != name or
                    member.is_dir() or (stat.S_IFMT(mode) not in (0, stat.S_IFREG)) or member.flag_bits & 1 or
                    member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)):
                    raise InputError("Receiving ZIP requires distinct ordinary relative files")
                names.add(name)
                total += member.file_size
                if total > MAX_ARCHIVE:
                    raise InputError("Receiving ZIP expanded content exceeds two GiB")
            if "manifest.json" not in names or "catalog.json" not in names:
                raise InputError("Choose the complete receiving ZIP, including its manifest and catalog")
            manifest_info = archive.getinfo("manifest.json")
            if manifest_info.file_size > 8 * 1024 * 1024:
                raise InputError("Receiving manifest is too large")
            manifest = load_json(archive.read(manifest_info))
            if not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA or not isinstance(manifest.get("files"), list):
                raise InputError("Unsupported receiving manifest")
            expected = {}
            for record in manifest["files"]:
                if not isinstance(record, dict) or set(record) != {"path", "bytes", "sha256"} or not isinstance(record["path"], str) or record["path"] in expected:
                    raise InputError("Receiving manifest contains an invalid file entry")
                if type(record["bytes"]) is not int or record["bytes"] < 0 or not isinstance(record["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", record["sha256"]):
                    raise InputError("Receiving manifest contains an invalid file identity")
                expected[record["path"]] = record
            if set(expected) != names - {"manifest.json"} or sum(r["bytes"] for r in expected.values()) != manifest.get("expandedBytes"):
                raise InputError("Receiving ZIP and complete manifest select different files")
            for name, metadata in expected.items():
                member = archive.getinfo(name)
                if member.file_size != metadata["bytes"]:
                    raise InputError("Receiving member length differs from its manifest")
                target = directory / name
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                checksum, size = hashlib.sha256(), 0
                with archive.open(member) as incoming, os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as outgoing:
                    while block := incoming.read(1024 * 1024):
                        size += len(block)
                        if size > metadata["bytes"]:
                            raise InputError("Receiving member exceeds its complete declared length")
                        checksum.update(block)
                        outgoing.write(block)
                    outgoing.flush()
                    os.fsync(outgoing.fileno())
                if size != metadata["bytes"] or checksum.hexdigest() != metadata["sha256"]:
                    raise InputError("Receiving member bytes differ from their complete manifest")
            return manifest
    except (zipfile.BadZipFile, RuntimeError, OSError) as error:
        raise InputError("Complete receiving ZIP could not be read: " + str(error)) from error


def _same(actual, expected, description):
    if json_bytes(actual) != json_bytes(expected):
        raise InputError("Received " + description + " differs from its original complete result")


def _catalog(catalog, manifest):
    if not isinstance(catalog, dict) or catalog.get("schema") != SCHEMA or catalog.get("review") != manifest.get("review") or catalog.get("revision") != manifest.get("revision"):
        raise InputError("Receiving catalog and manifest identify different review history")
    identifier(catalog["review"], "Received review ID")
    if type(catalog["revision"]) is not int or not 1 <= catalog["revision"] <= 10000:
        raise InputError("Received review revision is invalid")
    for key in ("sources", "plans", "builds", "objects", "reviews", "requests"):
        if not isinstance(catalog.get(key), list) or any(not isinstance(v, dict) for v in catalog[key]):
            raise InputError("Receiving catalog requires its complete " + key)
    for key in ("sources", "plans", "builds"):
        found = set()
        for value in catalog[key]:
            checked_id(value.get("id"))
            if value["id"] in found:
                raise InputError("Receiving catalog repeats an immutable identity")
            found.add(value["id"])
    requests = {}
    for request in catalog["requests"]:
        if request.get("state") != "completed" or request.get("kind") not in {"reference", "mapping", "alias", "review"}:
            raise InputError("Receiving request is incomplete")
        identifier(request.get("id"), "Received request ID")
        if request["id"] in requests or not isinstance(request.get("input"), dict) or not isinstance(request.get("result"), dict) or request["input"].get("requestId") != request["id"] or digest(json_bytes(request["input"])) != request.get("inputSha256"):
            raise InputError("Receiving request input or identity changed")
        if len(json_bytes(request["input"])) > 1024 * 1024:
            raise InputError("Received mutation definition exceeds one MiB")
        requests[request["id"]] = request
    reviews = catalog["reviews"]
    if [r.get("revision") for r in reviews] != list(range(1, catalog["revision"] + 1)) or any(r.get("id") != catalog["review"] for r in reviews):
        raise InputError("Receiving history must contain every original revision in order")
    for review in reviews:
        checked_id(review.get("report"))
        request = requests.get(review.get("requestId"))
        if request is None or request["kind"] != "review":
            raise InputError("Every received review requires its original complete request")
        _same(request["result"], review, "review request result")
        if request["input"].get("expectedRevision") != review["revision"] - 1:
            raise InputError("Original request selects a different prior revision")
    objects = {}
    for record in catalog["objects"]:
        if record.get("kind") not in {"reference", "mapping", "alias"} or not isinstance(record.get("body"), dict):
            raise InputError("Receiving object has an unknown kind")
        body, kind = record["body"], record["kind"]
        checked_id(body.get("id"))
        if (kind, body["id"]) in objects or digest(json_bytes({k: v for k, v in body.items() if k != "id"})) != body["id"]:
            raise InputError("Receiving immutable object identity changed")
        objects[(kind, body["id"])] = body
    if not reviews or reviews[-1]["report"] != manifest.get("report"):
        raise InputError("Receiving manifest does not identify the current complete report")
    return requests, objects


def receive_review(ws, path):
    with ws.scratch() as temporary:
        directory = temporary / "received"
        manifest = _unpack(path, directory)
        catalog = load_json((directory / "catalog.json").read_bytes())
        requests, objects = _catalog(catalog, manifest)
        reviews = catalog["reviews"]
        original_reports = {}
        # Verify all retained history before the first receiving mutation.
        for expected in reviews:
            retained = directory / "history" / ("r" + str(expected["revision"]).zfill(6))
            _same(load_json((retained / "review.json").read_bytes()), expected, "history revision")
            original = load_json((retained / "report.json").read_bytes())
            if original.get("id") != expected["report"] or report_identity(original) != expected["report"] or original.get("definition") != expected.get("definition"):
                raise InputError("Received complete report identity changed")
            metadata = original["files"].get("rows.sqlite")
            if set(original["files"]) != {"rows.sqlite"} or not metadata or file_digest(retained / "rows.sqlite", MAX_REPORT) != metadata["sha256"] or (retained / "rows.sqlite").stat().st_size != metadata["bytes"]:
                raise InputError("Received complete report database changed")
            original_reports[expected["revision"]] = original
            old = ws.db.execute("SELECT body FROM human_reviews WHERE id=? AND revision=?", (expected["id"], expected["revision"])).fetchone()
            if old:
                _same(load_json(old["body"]), expected, "existing complete review")
        for request in requests.values():
            if ws.db.execute("SELECT id FROM human_requests WHERE id=?", (request["id"],)).fetchone():
                _same(ws.request(request["id"]), request, "existing request")
        for source in catalog["sources"]:
            source_path = directory / "sources" / (source["id"] + ".source")
            if file_digest(source_path) != source["id"]:
                raise InputError("Received original source identity changed")
            with source_path.open("rb") as incoming:
                actual = ws.add_source(incoming, source["label"], source["name"])
            if actual["id"] != source["id"] or actual["bytes"] != source["bytes"]:
                raise InputError("Original source intake differs from the complete receiving source")
        for plan in catalog["plans"]:
            actual = ws.save_plan(plan["plan"])
            _same(actual, plan, "native table mapping")
        for build in catalog["builds"]:
            retained = load_json((directory / "native" / build["id"] / "review.json").read_bytes())
            _same(retained, build, "native build record")
            for name in ("data.csv", "dataset.json", "rows.sqlite"):
                metadata = build["files"][name]
                selected = directory / "native" / build["id"] / name
                if selected.stat().st_size != metadata["bytes"] or file_digest(selected, MAX_ARCHIVE) != metadata["sha256"]:
                    raise InputError("Received native build file changed")
            actual = ws.build(build["source"], build["plan"], expected=build)
            if actual["id"] != build["id"]:
                raise InputError("Reconstructed native build has a different identity")
        for kind in ("reference", "mapping", "alias"):
            for (object_kind, object_id), expected in sorted(objects.items()):
                if kind != object_kind:
                    continue
                candidates = [r for r in requests.values() if r["kind"] == kind and r["result"].get("id") == object_id]
                if not candidates:
                    raise InputError("Each received object requires its complete original mutation input")
                for request in candidates:
                    _same(request["result"], expected, kind + " request result")
                    actual = getattr(ws, "save_" + kind)(request["input"])
                    _same(actual, expected, kind)
        received, already_present = [], True
        for expected in reviews:
            request = requests[expected["requestId"]]
            old = ws.db.execute("SELECT body FROM human_reviews WHERE id=? AND revision=?", (expected["id"], expected["revision"])).fetchone()
            if old:
                actual = load_json(old["body"])
                definition, revision, reference, mappings, decisions = ws._review_definition(request["input"], current_revision=expected["revision"] - 1)
                _same(definition, actual["definition"], "existing review input")
                if revision != expected["revision"]:
                    raise InputError("Received original request selects another revision")
                existing_request = ws.db.execute("SELECT id FROM human_requests WHERE id=?", (request["id"],)).fetchone()
                if not existing_request:
                    with ws.db:
                        ws.db.execute("INSERT INTO human_requests VALUES(?,?,?,?,?)",
                                      (request["id"], request["kind"], request["inputSha256"],
                                       json_bytes(request["input"]).decode(), json_bytes(expected).decode()))
            else:
                already_present = False
                actual = ws.save_review(request["input"])
                _same(actual, expected, "reconstructed complete review")
            actual_report = ws.report(expected["id"], expected["revision"])
            original_report = original_reports[expected["revision"]]
            _same({k: v for k, v in actual_report.items() if k != "files"},
                  {k: v for k, v in original_report.items() if k != "files"}, "complete report content")
            received.append(expected["revision"])
        return {"schema": "stellar-forge.humanitarian-received.v1", "review": ws.review(catalog["review"]),
                "receivedRevisions": received, "alreadyPresent": already_present, "requestCount": len(requests)}
