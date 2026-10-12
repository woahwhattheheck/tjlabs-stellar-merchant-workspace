#!/usr/bin/env python3
"""One original-source CSV/XLSX → Property review → complete receiving journey."""
from __future__ import annotations
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import select
import sqlite3
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape
import zipfile

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from application import call
from delivery import archive_package, export_package, extract_package, import_package, receive_package, verify_package
from model import dump, encoded, identity, parse, private_directory, read, write
from property_research import model as pm
from property_research.onboarding.mapping import FIELDS, SCHEMA
from property_research.onboarding.source import letter
from workspace import Workspace, file_identity


def original(path):
    path = Path(path).expanduser().resolve()
    raw = read(path, 64 * 1024 * 1024)
    return parse(raw), {"path": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def exact_file(path, raw):
    if path.exists():
        if path.read_bytes() != raw:
            raise ValueError("The retained authored projection differs: " + str(path))
    else:
        write(path, raw)
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def scalar(value, kind):
    if value is None:
        return ""
    if kind in ("json", "strings"):
        return encoded(value).decode()
    if type(value) is bool:
        return "true" if value else "false"
    return str(value)


def make_csv(headers, rows, fields):
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([scalar(row.get(field), fields[field]) for field in headers])
    return output.getvalue().encode("utf-8")


def make_xlsx(headers, rows, fields):
    # This is an explicitly authored projection of the supplied intake. Every
    # original scalar is stored as an inline string to retain its exact token.
    values = [headers] + [[scalar(row.get(field), fields[field]) for field in headers] for row in rows]
    cells = []
    for number, row in enumerate(values, 1):
        cells.append('<row r="' + str(number) + '">' + "".join(
            '<c r="' + letter(i + 1) + str(number) + '" t="inlineStr"><is><t xml:space="preserve">' +
            escape(value) + '</t></is></c>' for i, value in enumerate(row)) + '</row>')
    members = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Survey" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + "".join(cells) + '</sheetData></worksheet>',
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in members.items():
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, value.encode())
    return output.getvalue()


def run(args):
    out = private_directory(Path(args.out).expanduser())
    baseline, a = original(args.intake)
    candidate, b = original(args.updated_intake)
    documents, c = original(args.documents)
    selection_plan, d = original(args.selections)
    input_identity = {"baseline": a, "candidate": b, "documents": c, "selections": d}
    result_path = out / "onboarding-result.json"
    if result_path.exists():
        result = parse(read(result_path, 64 * 1024 * 1024))
        if result["inputs"] != input_identity:
            raise ValueError("This operation directory belongs to other original inputs")
        if result.get("state") == "COMPLETE":
            print(json.dumps({"state": "COMPLETE", "reopened": True, "result": str(result_path)}), flush=True)
            return result
    else:
        result = {"schema": "stellar-forge.property-onboarding-journey.v1",
                  "started": datetime.now(timezone.utc).isoformat(), "inputs": input_identity,
                  "state": "RUNNING", "phases": [], "checkpoints": {}}

    def record(name, value):
        result["checkpoints"][name] = value
        result["phases"].append({"phase": name, "time": datetime.now(timezone.utc).isoformat(), **value})
        dump(result_path, result)
        print(json.dumps({"phase": name, **value}, ensure_ascii=False), flush=True)
        return value

    def step(name, action):
        return result["checkpoints"].get(name) or record(name, action())

    operator = selection_plan["operator"]
    w = Workspace(out / "workspace")
    generated = private_directory(out / "authored-projections")
    try:
        def retain_originals():
            ids = {}
            for metadata in candidate["documents"]:
                if metadata["key"] in documents:
                    path = Path(documents[metadata["key"]])
                    if not path.is_file():
                        relocated = Path(args.documents).resolve().parent / path.name
                        if not relocated.is_file():
                            relocated = Path(args.documents).resolve().parent / "sources" / path.name
                        path = relocated
                    item = call(w, "property.document.import", {"path": str(path), "metadata": metadata})
                    ids[metadata["key"]] = item["id"]
            return {"document_ids": ids}
        original_ids = step("original-documents-retained", retain_originals)["document_ids"]
        all_rows = {}
        for label, packet in (("baseline", baseline), ("candidate", candidate)):
            all_rows[label] = {
                "properties": [{k: v for k, v in prop.items() if k != "units"} for prop in packet["properties"]],
                "units": [{"property_key": prop["key"], **unit} for prop in packet["properties"] for unit in prop["units"]],
                "comparables": packet["source_comparables"],
            }
        headers = {}
        for kind in FIELDS:
            headers[kind] = sorted({key for label in all_rows for row in all_rows[label][kind] for key in row})
            unsupported = set(headers[kind]) - set(FIELDS[kind])
            if unsupported:
                raise ValueError("Retain an explicit mapping for original fields: " + str(unsupported))
        editions = []
        for label, packet, source_input in (("baseline", baseline, a), ("candidate", candidate, b)):
            def projection(label=label, packet=packet, source_input=source_input):
                bindings = dict(original_ids)
                tables = []
                for kind in ("properties", "units", "comparables"):
                    workbook = label == "candidate" and kind == "properties"
                    data = (make_xlsx if workbook else make_csv)(headers[kind], all_rows[label][kind], FIELDS[kind])
                    path = generated / (label + "-" + kind + (".xlsx" if workbook else ".csv"))
                    source_id = exact_file(path, data)
                    metadata = {"key": "survey-export-" + kind, "title": "Authored " + label + " " + kind + " projection",
                                "publisher": operator, "url": None, "source_kind": "authored_projection",
                                "source_reference": "Exact rows projected from retained original intake SHA256 " + source_input["sha256"]}
                    document = call(w, "property.document.import", {"path": str(path), "metadata": metadata,
                                                                  "expected_input_sha256": source_id["sha256"]})
                    bindings[metadata["key"]] = document["id"]
                    fields = {}
                    for index, field in enumerate(headers[kind], 1):
                        spec = {"column": index, "type": FIELDS[kind][field], "trim": False, "nullable": True, "null_values": [""]}
                        if spec["type"] == "strings":
                            spec["strings_format"] = "json"
                        fields[field] = spec
                    reader = {"kind": "xlsx", "sheet": "Survey"} if workbook else {"kind": "csv", "encoding": "utf-8"}
                    reader.update(header_row=1, start_row=2, end_row=None, first_column=1, last_column=len(headers[kind]))
                    inspection = call(w, "property.onboarding.source", {"document_id": document["id"], "reader": reader, "limit": 3})
                    if inspection["total_rows"] != len(all_rows[label][kind]):
                        raise ValueError("Original reader row count differs")
                    tables.append({"key": kind, "kind": kind, "document_id": document["id"], "reader": reader,
                                   "fields": fields, "hidden": "exclude", "selection": {"mode": "all", "rows": [], "exclude": []}})
                value = {"schema": SCHEMA, "name": "Original-source " + label + " mapping", "study": packet["study"],
                         "document_ids": bindings, "previous_id": editions[0] if editions else None,
                         "omitted_records": "review_removed", "tables": tables, "note": "Authored export of retained original intake."}
                saved = call(w, "property.onboarding.plan.save", {"value": value, "operator": operator})
                preview = call(w, "property.onboarding.preview", {"value": value, "limit": 3})
                if not preview["ready"]:
                    raise ValueError(json.dumps(preview["errors"]))
                prepared = call(w, "property.onboarding.prepare", {
                    "plan_id": saved["document_id"], "expected_projection_sha256": preview["projection_sha256"],
                    "operator": operator, "label": selection_plan["label"] + " — " + label,
                    "note": selection_plan.get("revision_note", "Retained original source revision") if editions else ""})
                expected = pm.intake(packet, {key: call(w, "property.document.read", {"document_id": did})["metadata"] for key, did in original_ids.items()})
                if prepared["edition"]["properties"] != expected["properties"] or prepared["edition"]["source_comparables"] != expected["source_comparables"]:
                    raise ValueError("Mapped source changed the original survey or purpose rows")
                for key, value in selection_plan.get("expected_counts", {}).items():
                    if prepared["edition"]["counts"].get(key) != value:
                        raise ValueError("Original expected survey count differs: " + key)
                return {"edition_id": prepared["edition"]["id"], "review_id": prepared["review"]["id"],
                        "plan_id": saved["document_id"], "projection_sha256": preview["projection_sha256"],
                        "counts": prepared["edition"]["counts"], "source_rows": preview["rows"]}
            received = step(label + "-mapped-and-received", projection)
            editions.append(received["edition_id"])
            def review(received=received, label=label):
                state = call(w, "property.comparison.read", {"review_id": received["review_id"], "limit": 10000})
                changed = [x["key"] for x in state["rows"] if x["kind"] != "unchanged" and not x["key"].startswith("@")]
                if label == "candidate" and "expected_changed_keys" in selection_plan:
                    if sorted(changed) != sorted(x for x in selection_plan["expected_changed_keys"] if not x.startswith("@")):
                        raise ValueError("Original source revision changed different properties")
                pending = [x["key"] for x in state["rows"] if x["key"] not in state["decisions"]]
                if pending:
                    state = call(w, "property.review.apply", {"review_id": state["id"], "expected_version": state["version"],
                        "keys": pending, "action": "accept", "operator": operator,
                        "note": selection_plan.get("revision_note" if label == "candidate" else "review_note", "Reviewed original inputs")})
                return {"review_id": state["id"], "version": state["version"], "changed_property_keys": changed}
            step(label + "-source-reviewed", review)

        candidate_review = result["checkpoints"]["candidate-source-reviewed"]
        packages = []
        for index, purpose in enumerate(selection_plan["purposes"]):
            def deliver(purpose=purpose):
                selection = call(w, "property.selection.freeze", {"review_id": candidate_review["review_id"],
                    "expected_version": candidate_review["version"], "operator": operator, "purpose": purpose["purpose"],
                    "label": purpose["label"], "items": purpose["items"], "note": purpose.get("note", "")})
                report = call(w, "property.selection.report", {"selection_id": selection["id"]})
                for key, expected in purpose.get("expected_summary", {}).items():
                    if report["summary"].get(key) != expected:
                        raise ValueError("Original purpose summary differs: " + key)
                package = call(w, "property.selection.export", {"selection_id": selection["id"], "operator": operator, "label": purpose["label"]})
                verify_package(package["directory"])
                archive = call(w, "export.archive", {"export_id": package["id"]})
                return {"selection_id": selection["id"], "package_id": package["id"], "directory": package["directory"],
                        "archive": archive, "summary": report["summary"]}
            packages.append(step("purpose-" + str(index + 1) + "-delivered", deliver))

        def receive():
            extracted = out / "received-package"
            if extracted.exists():
                verify_package(extracted)
            else:
                extract_package(packages[0]["archive"]["path"], extracted)
            received = receive_package(extracted, out / "received-workspace")
            other = Workspace(out / "received-workspace")
            try:
                retained = call(other, "property.onboarding.retained", {"edition_id": editions[-1]})
                rows = call(other, "property.onboarding.rows", {"edition_id": editions[-1], "limit": 100})
                continuation = call(other, "property.onboarding.continuation", {"edition_id": editions[-1]})
                report = call(other, "property.selection.report", {"selection_id": packages[0]["selection_id"]})
                if (rows["total"] != result["checkpoints"]["candidate-mapped-and-received"]["source_rows"] or
                        continuation["value"]["previous_id"] != editions[-1] or report["summary"] != packages[0]["summary"]):
                    raise ValueError("Original received survey, row map or continuation differs")
                return {"workspace": str(out / "received-workspace"), "package_id": received["package_id"],
                        "retained_rows": rows["total"], "plan_id": retained["plan"]["document_id"]}
            finally:
                other.close()
        receiving = step("complete-package-received-and-reopened", receive)
    finally:
        w.close()

    def cli_http():
        arguments = out / "mapping-read-arguments.json"
        dump(arguments, {"plan_id": receiving["plan_id"]})
        child = subprocess.run([sys.executable, "-B", str(APP / "cli.py"), "--workspace", receiving["workspace"],
            "call", "property.onboarding.plan.read", "--arguments", str(arguments)], capture_output=True, text=True)
        if child.returncode or json.loads(child.stdout)["document_id"] != receiving["plan_id"]:
            raise ValueError("Original CLI mapping reopen failed: " + child.stderr)
        server = subprocess.Popen([sys.executable, "-B", str(APP / "cli.py"), "--workspace", receiving["workspace"], "serve", "--port", "0"],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            readable, _, _ = select.select([server.stdout], [], [], 30)
            if not readable:
                raise RuntimeError("Original operator did not announce its listener")
            announced = json.loads(server.stdout.readline())
            connection = parse(read(Path(announced["connection_file"]), 131072))
            body = encoded({"operation": "property.onboarding.rows", "arguments": {"edition_id": editions[-1], "limit": 3}})
            request = Request(connection["base_url"] + "/api", data=body, headers={
                "Authorization": "Bearer " + connection["token"], "Content-Type": "application/json"})
            with urlopen(request, timeout=60) as response:
                result = json.load(response)
            if not result["ok"] or result["result"]["total"] != receiving["retained_rows"]:
                raise ValueError("Original HTTP row-map receiving differs")
            with urlopen(connection["base_url"] + "/property-onboarding.js", timeout=10) as response:
                javascript = response.read()
            if hashlib.sha256(javascript).hexdigest() != hashlib.sha256((APP / "web/property-onboarding.js").read_bytes()).hexdigest():
                raise ValueError("Original operator asset differs")
            return {"cli": "original plan reopened", "http": "original authenticated row map read",
                    "operator_asset_sha256": hashlib.sha256(javascript).hexdigest()}
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
    step("original-cli-http-and-operator-assets", cli_http)

    if args.study_package:
        def generic_recovery():
            target = Workspace(out / "generic-recovery-workspace")
            try:
                package = Path(args.study_package).expanduser().resolve()
                manifest = verify_package(package)
                import_package(target, package)
                spec = target.comparison(manifest["comparison_id"], limit=1)
                destination = out / "generic-completed-rename"
                real = target.connection
                class CommitFault:
                    def __getattr__(self, name):
                        return getattr(real, name)
                    def execute(self, sql, *args, **kwargs):
                        if sql == "COMMIT":
                            raise sqlite3.OperationalError("Controlled failure after completed package rename")
                        return real.execute(sql, *args, **kwargs)
                if not destination.exists():
                    target.connection = CommitFault()
                    try:
                        export_package(target, manifest["comparison_id"], expected_version=spec["review_version"],
                                       operator=operator, label="Original completed-rename recovery", destination=destination)
                        raise AssertionError("Expected original SQLite commit failure")
                    except sqlite3.OperationalError:
                        pass
                    finally:
                        target.connection = real
                exact = verify_package(destination)
                if target.connection.execute("SELECT 1 FROM exports WHERE id=?", (exact["package_id"],)).fetchone():
                    # A completed previous recovery is the retained same operation.
                    return {"package_id": exact["package_id"], "reopened": True}
                target.close()
                target = Workspace(out / "generic-recovery-workspace")
                recovered = export_package(target, manifest["comparison_id"], expected_version=spec["review_version"],
                    operator=operator, label="Original completed-rename recovery", destination=destination)
                archived = archive_package(target, recovered["id"])
                if not recovered["reopened"]:
                    raise AssertionError("Original complete rename was not adopted")
                return {"package_id": recovered["id"], "archive": archived, "boundary": "actual filesystem rename / injected SQLite commit failure"}
            finally:
                target.close()
        step("generic-completed-rename-recovered", generic_recovery)
    result["state"] = "COMPLETE"
    result["completed"] = datetime.now(timezone.utc).isoformat()
    dump(result_path, result)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("intake", "updated-intake", "documents", "selections", "out"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--study-package", help="Existing complete generic Study package for the actual rename/commit recovery case")
    try:
        run(parser.parse_args())
    except Exception as error:
        print(json.dumps({"state": "FAILED", "code": getattr(error, "code", type(error).__name__),
                          "details": getattr(error, "details", {}), "message": str(error)}), file=sys.stderr)
        raise
