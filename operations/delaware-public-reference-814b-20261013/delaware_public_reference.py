#!/usr/bin/env python3
"""Complete historical Delaware public-reference course on maintained Analysis APIs.

This file performs no upstream download, payment, private-data import or target
publication. It requires the exact previously retained files and their receiving
receipt. DATA_COMPLETE means native data outputs passed; it never asserts that a
producing peer has viewed the rendered report or workbook.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import date, datetime
from decimal import Decimal, DecimalException, localcontext
from hashlib import sha256
import io
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time
import uuid

from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace
from stellar_forge_buyer.analysis_workbooks import WorkbookDelivery
from stellar_forge_buyer.query_export import QueryExport
from stellar_forge_buyer.storage import dump, parse, private_directory, read
from stellar_forge_buyer.workspace_archive import inspect_archive
from stellar_forge_buyer.workspace_archive_receive import restore_archive, _publish_received_directory

OPERATION = "CSE-DELAWARE-PUBLIC-REFERENCE-814B-20261013"
DATASET = "8z8z-di7f"
SOURCE = "https://data.delaware.gov/Energy-and-Environment/State-Rebates-for-Alternative-Fuel-Vehicles/8z8z-di7f"
REQUEST = "https://data.delaware.gov/resource/8z8z-di7f.csv?$limit=10000&$order=%3Aid"
FIELDS = ["award_number", "rebate_amount", "city", "state", "county", "zip",
          "date_of_purchase", "vehicle_type", "make", "model", "year"]
EXTRA = ["source_row", "rebate_cents", "amount_state", "purchase_lease_date",
         "purchase_lease_month", "purchase_lease_year", "date_state", "award_occurrences"]
INTEGER_FIELDS = {"source_row", "rebate_cents", "purchase_lease_year", "award_occurrences",
                  "observed_max_chars"}
EXPECTED_MONTHS = {"2025-11": (64, 12050000), "2025-12": (65, 11950000)}
NOTICE = (
    "Historical public reference from one retained DNREC Socrata capture. All 7,758 published rows are retained, "
    "including repeated award numbers and early dates. Calendar groups use the published purchase OR lease date, "
    "not an approval, payment or reporting date. Rebate cents are exact conversions of the published decimal amounts; "
    "model year and ZIP remain original text. Award number is not unique. A row count is not a count of unique "
    "applicants, vehicles or households. These are published row totals, not a funding balance or CSE performance measure. "
    "The source is declared quarterly and its recorded metadata update is April 21, 2026; it is not a live October feed. "
    "No age, dealer, approval/payment dates, survey responses, private applications or fund ledger are supplied. "
    "November and December 2025 are two historical selections within this one capture, not two provider editions. "
    "Annual 2025 is a calendar purchase/lease view, not the contract's agreed programme-year annual report. "
    "Absent month groups are not proof of no programme activity. The original HTTP capture timestamp was not returned; "
    "the descriptor's capturedAt records the actual retained-file materialization event."
)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def compact(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")


def identifier(label):
    return uuid.uuid5(uuid.NAMESPACE_URL, OPERATION + ":" + label).hex


def bytes_at(path, maximum=256 * 1024 * 1024):
    path = Path(path).expanduser().absolute()
    require(path.resolve() == path, "Canonical original file required: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_size <= maximum,
                "Bounded single-link original file required: " + str(path))
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        signature = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
        require(signature(before) == signature(after) and len(raw) == before.st_size, "Original file changed during read")
    return raw


def identity(raw):
    return {"bytes": len(raw), "sha256": sha256(raw).hexdigest()}


def directory(path):
    path = Path(path).expanduser().absolute()
    require(path.resolve() == path, "Canonical private directory required")
    private_directory(path)
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and not info.st_mode & 0o077,
            "Owned private directory required")
    return path


def keep(path, raw):
    path = Path(path)
    directory(path.parent)
    if os.path.lexists(path):
        require(bytes_at(path) == raw, "Retained output differs: " + str(path))
        return {"path": str(path), **identity(raw)}
    fd, temporary = tempfile.mkstemp(prefix=".receiving-", dir=path.parent)
    staged = Path(temporary)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            _publish_received_directory(staged, path)
        except FileExistsError:
            require(bytes_at(path) == raw, "Concurrent output differs: " + str(path))
        require(bytes_at(path) == raw, "Published output differs")
    finally:
        if staged.exists():
            staged.unlink()
    return {"path": str(path), **identity(raw)}


def money(raw):
    if raw == "":
        return None, "EMPTY"
    if len(raw) > 128 or not re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", raw):
        return None, "INVALID_DECIMAL"
    try:
        with localcontext() as context:
            context.prec = 160
            amount = Decimal(raw) * 100
            if not amount.is_finite() or amount != amount.to_integral_value():
                return None, "NONEXACT_CENTS"
            if amount < -(2**63) or amount >= 2**63:
                return None, "OUTSIDE_INTEGER_RANGE"
            result = int(amount)
            return result, "NEGATIVE_REPORTED_AMOUNT" if result < 0 else "VALID"
    except DecimalException:
        return None, "INVALID_DECIMAL"


def calendar(raw, format_, materialized):
    if raw == "":
        return None, None, None, "EMPTY"
    try:
        value = datetime.strptime(raw, format_)
    except ValueError:
        return None, None, None, "INVALID_SELECTED_FORMAT"
    require(value.tzinfo is None, "Socrata calendar dates must not be assigned a timezone")
    flag = "VALID"
    if value.date() < date(2015, 1, 1):
        flag = "BEFORE_DECLARED_2015_COVERAGE"
    elif value.date() > materialized.date():
        flag = "AFTER_MATERIALIZATION_DATE"
    elif value.time().isoformat() != "00:00:00":
        flag = "NONMIDNIGHT_SOURCE_TIME"
    return value.date().isoformat(), value.strftime("%Y-%m"), value.year, flag


def receive_inputs(input_path):
    raw_input = bytes_at(input_path, 1024 * 1024)
    value = parse(raw_input)
    require(value.get("schema") == "stellar-forge.delaware-public-reference-input.v1" and
            value.get("operation") == OPERATION, "Original programme input required")
    program = bytes_at(__file__, 4 * 1024 * 1024)
    require(value.get("programmeSha256") == sha256(program).hexdigest(), "Reviewed programme source changed")
    require(re.fullmatch(r"https://raw\.githubusercontent\.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/[a-f0-9]{40}/[A-Za-z0-9_./-]+",
                         value.get("programmeSourceUrl", "")), "Immutable original programme URL required")
    require(value.get("dateFormatReviewed") is True and isinstance(value.get("dateFormat"), str) and
            1 <= len(value["dateFormat"]) <= 128 and "%z" not in value["dateFormat"] and "%Z" not in value["dateFormat"],
            "Actual CSV date spelling must be inspected and explicitly selected")
    require(set(value.get("files", {})) == {"csv", "metadata", "count", "header", "receipt", "acceptance"},
            "Complete retained source file selection required")
    raw = {}
    for role, selected in value["files"].items():
        data = bytes_at(selected["path"])
        require(identity(data) == {k: selected[k] for k in ("bytes", "sha256")}, "Retained " + role + " changed")
        raw[role] = data
    receipt = parse(raw["receipt"])
    require(receipt.get("schema") == "stellar-forge.delaware-source-materialization.v1" and
            receipt.get("operation") == OPERATION and receipt.get("sourceRequest") == REQUEST and
            "originalHttpCapturedAt" in receipt and receipt["originalHttpCapturedAt"] is None,
            "Exact materialization receipt and explicit unknown upstream time required")
    materialized = datetime.fromisoformat(receipt["materializedAt"].replace("Z", "+00:00"))
    require(materialized.utcoffset() is not None, "Actual materialization timestamp must include its UTC offset")
    for role in ("csv", "metadata", "count", "header", "acceptance"):
        require(receipt["files"][role] == identity(raw[role]), "Receipt does not bind " + role)
    require(len(raw["csv"]) == 927011, "Original whole CSV byte count changed")
    require(parse(raw["count"]) == [{"count": "7758"}], "Original count changed")
    header = list(csv.reader(io.StringIO(raw["header"].decode("utf-8-sig"), newline="")))
    require(header == [FIELDS], "Original header differs")
    metadata = parse(raw["metadata"])
    require(metadata.get("id") == DATASET, "Wrong public dataset metadata")
    by_name = {item["fieldName"]: item for item in metadata["columns"] if item.get("fieldName") in FIELDS}
    require(set(by_name) == set(FIELDS), "Full original column metadata required")
    parsed = list(csv.reader(io.StringIO(raw["csv"].decode("utf-8-sig"), newline=""), strict=True))
    require(parsed and parsed[0] == FIELDS and all(len(row) == len(FIELDS) for row in parsed[1:]),
            "CSV must preserve the exact eleven original columns")
    rows = [dict(zip(FIELDS, row)) for row in parsed[1:]]
    require(len(rows) == 7758, "Whole source population changed")
    awards = Counter(row["award_number"] for row in rows)
    require(len(awards) == 7244 and sum(count > 1 for count in awards.values()) == 514 and
            all(count in (1, 2) for count in awards.values()), "Original repeated award profile changed")
    derived = []
    for number, row in enumerate(rows, 1):
        cents, amount_state = money(row["rebate_amount"])
        date_, month, year, date_state = calendar(row["date_of_purchase"], value["dateFormat"], materialized)
        derived.append({**row, "source_row": number, "rebate_cents": cents, "amount_state": amount_state,
                        "purchase_lease_date": date_, "purchase_lease_month": month, "purchase_lease_year": year,
                        "date_state": date_state, "award_occurrences": awards[row["award_number"]]})
    require(all(row["amount_state"] == "VALID" for row in derived), "Published amount profile needs explicit review")
    require(sum(row["rebate_cents"] for row in derived) == 1715465000, "Original full published amount total changed")
    require(all(row["date_state"] in {"VALID", "BEFORE_DECLARED_2015_COVERAGE"} for row in derived),
            "Selected actual CSV date format or date profile requires review")
    early = [row for row in derived if row["date_state"] == "BEFORE_DECLARED_2015_COVERAGE"]
    require(len(early) == 5 and sum(row["rebate_cents"] for row in early) == 800000, "Original early dates changed")
    repeated = [row for row in derived if row["award_occurrences"] > 1]
    require(len(repeated) == 1028 and sum(row["rebate_cents"] for row in repeated) == 232200000,
            "Repeated-award member rows changed")
    for month, expected in EXPECTED_MONTHS.items():
        selected = [row for row in derived if row["purchase_lease_month"] == month]
        require((len(selected), sum(row["rebate_cents"] for row in selected)) == expected, "Original month differs: " + month)
    annual = [row for row in derived if row["purchase_lease_year"] == 2025]
    require(len(annual) == 762 and sum(row["rebate_cents"] for row in annual) == 138200000 and
            len({row["purchase_lease_month"] for row in annual}) == 11, "Original calendar year differs")
    acceptance = parse(raw["acceptance"])
    verify_acceptance(derived, acceptance)
    return value, raw_input, raw, program, receipt, rows, derived, by_name


def verify_acceptance(rows, acceptance):
    """Compare every retained provider group without altering original CSV cells."""
    require(acceptance.get("schema") == "commons.dnrec-public-reporting-acceptance.v1" and
            acceptance.get("operation") == "CSE-DELAWARE-REPORTING-WORKSHARE-814B-20261013" and
            acceptance["source"]["dataset"] == DATASET and acceptance["source"]["csvUrl"] == REQUEST and
            acceptance["source"]["csvBytes"] == 927011, "Original complete provider acceptance required")
    sources = acceptance["originals"]

    def count(value):
        require(isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value), "Original aggregate count invalid")
        return int(value)

    def cents(value):
        result, flag = money(value)
        require(flag == "VALID", "Original aggregate amount requires exact nonnegative cents")
        return result

    def source_text(record, name):
        # This is comparison-only. The CSV has collapsed API null/omission to "".
        value = record.get(name)
        require(value is None or isinstance(value, str), "Original aggregate text invalid")
        return "" if value is None else value

    def observed(key, selected=rows):
        groups = {}
        for row in selected:
            current = groups.setdefault(key(row), [0, 0])
            current[0] += 1
            current[1] += row["rebate_cents"]
        return groups

    def expected(label, key):
        result = {}
        for row in sources[label]["records"]:
            identity_ = key(row)
            require(identity_ not in result, "Distinct API groups collapse under the CSV representation: " + label)
            result[identity_] = [count(row["source_rows"]), cents(row["source_rebate_usd"])]
        return result

    def month(row):
        value = row["purchase_or_lease_month"]
        require(isinstance(value, str) and re.fullmatch(r"[0-9]{4}-[0-9]{2}-01T00:00:00\.000", value),
                "Original month aggregate calendar spelling changed")
        return value[:7]

    require(observed(lambda row: row["purchase_lease_month"]) == expected("monthly", month),
            "Complete original 132-group monthly distribution changed")
    require(observed(lambda row: (row["vehicle_type"], row["county"])) ==
            expected("vehicle-county", lambda row: (source_text(row, "vehicle_type"), source_text(row, "county"))),
            "Complete original 28-group vehicle/county distribution changed")
    repeated = [row for row in rows if row["award_occurrences"] > 1]
    require(observed(lambda row: row["award_number"], repeated) ==
            expected("duplicate-awards", lambda row: source_text(row, "award_number")),
            "Complete original 514 repeated-award groups changed")
    annual = {str(key): value for key, value in observed(lambda row: row["purchase_lease_year"]).items()}
    require(annual == {year: [count(value["rows"]), cents(value["amountUSD"])]
                       for year, value in acceptance["originalAnnualReconciliation"].items()},
            "Complete original annual distribution changed")
    require(sources["blank-fields"]["records"] == [{"source_rows": "0"}],
            "Source CSV/null reconciliation requires the original literal-blank observation")
    # Null equivalence is a comparison observation, never a change to stored cells.
    for name, missing in acceptance["expected"]["nullCounts"].items():
        require(sum(row[name] == "" for row in rows) == missing, "Original source absence profile changed: " + name)
    def exception_key(row, original):
        date_value = datetime.fromisoformat(row["date_of_purchase"]).date().isoformat() if original else row["purchase_lease_date"]
        amount = cents(row["rebate_amount"]) if original else row["rebate_cents"]
        year = source_text(row, "year")
        # Metadata declares model year numeric; compare its value, retain its raw spelling.
        year_value = Decimal(year) if year else None
        return (source_text(row, "award_number"), date_value, amount,
                source_text(row, "vehicle_type"), source_text(row, "make"), source_text(row, "model"), year_value)
    require(Counter(exception_key(row, False) for row in rows if row["date_state"] != "VALID") ==
            Counter(exception_key(row, True) for row in sources["date-exceptions"]["records"]),
            "Complete original date-exception identities or values changed")


def dictionary_rows(rows, derived, metadata):
    meanings = {
        "rebate_amount": "Published USD rebate amount; not a programme fund balance.",
        "date_of_purchase": "Published purchase OR lease calendar date; not approval or payment.",
        "year": "Vehicle model year. Original text is retained.",
        "zip": "Published postal code text; preserve leading zeroes and source absence.",
        "award_number": "Published award value; nonunique in this capture. No deduplication.",
        "source_row": "One-based coordinate within these exact CSV bytes; not a cross-edition business key.",
        "rebate_cents": "Exact published decimal USD multiplied by 100, with no rounding.",
        "amount_state": "Explicit decimal parsing and exact-cent state.",
        "purchase_lease_date": "Reviewed format parsed without a timezone; ISO calendar date.",
        "purchase_lease_month": "Calendar year-month of purchase or lease.",
        "purchase_lease_year": "Calendar year of purchase or lease, not model year.",
        "date_state": "Preserved date exception or VALID; early source dates are not corrected.",
        "award_occurrences": "Count of this exact published award value across the entire retained file."}
    result = []
    for name in FIELDS + EXTRA:
        original = name in FIELDS
        values = rows if original else derived
        result.append({
            "field": name, "entity_grain": "One published public rebate row",
            "source_type": metadata[name].get("dataTypeName", "undeclared") if original else "derived",
            "analysis_type": "text" if original or name not in INTEGER_FIELDS else "integer or null",
            "description": metadata[name].get("description", "") if original else meanings[name],
            "unit_or_basis": meanings.get(name, "Original published value; no inferred normalization."),
            "allowed_length": "Not declared by this public metadata contract",
            "observed_max_chars": max((len(str(row[name])) for row in values if row[name] is not None), default=0),
            "null_or_absence": "CSV empty string retained; original missing/null distinction is not recoverable" if original else
                "Invalid or empty source projection is null; explicit state is retained",
            "key_status": "Capture-local unique coordinate" if name == "source_row" else
                "Not unique; 514 repeated groups retained" if name == "award_number" else "Not a declared key",
            "relationship": "Same original row by source_row; no applicant, dealer or survey relationship inferred",
            "projection": "Identity text projection" if original else "Reviewed immutable programme derivation"})
    return result


class Course:
    def __init__(self, workspace, root, result, retry):
        self.workspace, self.root, self.result, self.retry = workspace, root, result, retry

    def save(self):
        dump(self.root / "programme.json", self.result)

    def complete(self, kind, label, fields):
        calls = self.result.setdefault("calls", {})
        expected = {"kind": kind, "fields": fields}
        current = calls.get(label)
        if current is None:
            current = {**expected, "id": identifier(label), "attempts": []}
            calls[label] = current
            self.save()
        require(current["kind"] == kind and current["fields"] == fields, "Original call definition changed: " + label)
        request = {"id": current["id"], **fields}
        job = self.workspace.start(kind, request)
        if job["status"] in {"FAILED", "CANCELLED", "INTERRUPTED"} and self.retry:
            current["attempts"].append({"id": job["id"], "status": job["status"], "error": job.get("error")})
            current["id"] = identifier(label + ":retry:" + job["id"])
            self.save()
            job = self.workspace.start(kind, {"id": current["id"], **fields})
        deadline = time.monotonic() + 900
        while job["status"] == "RUNNING" and time.monotonic() < deadline:
            time.sleep(0.1)
            job = self.workspace.job(job["id"])
        current["status"] = job["status"]
        current["error"] = job.get("error")
        self.save()
        require(job["status"] == "COMPLETE", label + ": " + str(job.get("error") or job["status"]))
        print(json.dumps({"operation": OPERATION, "phase": label, "id": job["id"], "status": job["status"]}), flush=True)
        return job


def source_document(root, name, format_, document, originals, receipt, selected):
    destination = directory(root / "source-documents" / name)
    def member(raw, suffix, mime):
        item = {**identity(raw), "contentType": mime}
        item["path"] = "files/" + item["sha256"] + "." + suffix
        keep(destination / item["path"], raw)
        return item
    doc = member(document, format_, "text/csv" if format_ == "csv" else "application/json")
    entries = []
    for role, raw, suffix, mime in originals:
        entries.append({"role": role, **member(raw, suffix, mime)})
    provenance = {"kind": "public-source", "publisher": "Delaware DNREC / data.delaware.gov",
                  "sourceUrl": SOURCE, "capturedAt": receipt["materializedAt"],
                  "scope": "One exact retained 7,758-row public capture; original request and custody receipt retained.",
                  "description": NOTICE}
    if name != "dnrec_public":
        provenance["transform"] = {"name": "Delaware public reference exact row projection",
                                   "sourceUrl": selected["programmeSourceUrl"], "sha256": selected["programmeSha256"]}
    manifest = {"schema": "stellar-forge.analysis-source-document.v1", "title": name,
                "format": format_, "document": doc, "originals": entries,
                "provenance": provenance, "complete": True}
    path = destination / "manifest.json"
    keep(path, compact(manifest))
    return path


def import_document(course, name, format_, path, fields):
    ws = course.workspace
    source = ws.responses.register(name, "document", manifest=str(path), format=format_, expected_revision=0)
    mapping = {"collection": "" if format_ == "csv" else "/rows", "sse_data": "text",
               "columns": [{"name": field, "pointer": "/" + field,
                            "type": "native" if format_ == "json" and field in INTEGER_FIELDS else "text",
                            "missing": "error"} for field in fields]}
    preview = course.complete("response-preview", "preview:" + name,
                              {"source": name, "source_revision": source["revision"], "mapping": mapping})
    imported = course.complete("response-import", "import:" + name,
                               {"preview_id": preview["id"], "preview_sha256": preview["result"]["preview_sha256"],
                                "allow_incomplete": False})
    version = imported["result"]["version"]
    current = ws.database.current(name)
    ws.database.activate(name, version["version_id"], expected_revision=current["revision"])
    course.result.setdefault("sources", {})[name] = {
        "revision": source["revision"], "sourceSha256": source["source_sha256"],
        "documentId": source["document_id"], "versionId": version["version_id"], "rows": version["row_count"]}
    course.save()


def recipes():
    quote = lambda name: '"' + name + '"'
    fields = ", ".join(map(quote, FIELDS))
    amounts = "COUNT(*) AS source_rows, SUM(rebate_cents) AS rebate_cents, SUM(CASE WHEN amount_state != 'VALID' THEN 1 ELSE 0 END) AS amount_findings"
    return {
        "OriginalRows": ("SELECT " + fields + " FROM dnrec_public ORDER BY _sf_row_number", {}),
        "CalendarAmounts": ("SELECT " + ", ".join(map(quote, FIELDS + EXTRA)) + " FROM dnrec_derived ORDER BY source_row", {}),
        "PublicInventory": ("SELECT COUNT(*) AS source_rows, COUNT(DISTINCT award_number) AS distinct_award_values FROM dnrec_public", {}),
        "RepeatedAwards": ("SELECT award_number, COUNT(*) AS source_rows, SUM(rebate_cents) AS rebate_cents FROM dnrec_derived GROUP BY award_number HAVING COUNT(*) > 1 ORDER BY award_number", {}),
        "RepeatedAwardRows": ("SELECT " + ", ".join(map(quote, FIELDS + EXTRA)) + " FROM dnrec_derived WHERE award_occurrences > 1 ORDER BY award_number, source_row", {}),
        "AllPurchaseLeaseMonths": ("SELECT purchase_lease_month, " + amounts + " FROM dnrec_derived GROUP BY purchase_lease_month ORDER BY purchase_lease_month", {}),
        "SelectedMonth": ("SELECT purchase_lease_month, " + amounts + " FROM dnrec_derived WHERE purchase_lease_month = :month GROUP BY purchase_lease_month", {"month": "2025-11"}),
        "MonthRows": ("SELECT " + ", ".join(map(quote, FIELDS + EXTRA)) + " FROM dnrec_derived WHERE purchase_lease_month = :month ORDER BY source_row", {"month": "2025-11"}),
        "AnnualRows": ("SELECT " + ", ".join(map(quote, FIELDS + EXTRA)) + " FROM dnrec_derived WHERE purchase_lease_year = :year ORDER BY source_row", {"year": 2025}),
        "AnnualSummary": ("SELECT purchase_lease_year, " + amounts + " FROM dnrec_derived WHERE purchase_lease_year = :year GROUP BY purchase_lease_year", {"year": 2025}),
        "AnnualMonths": ("SELECT purchase_lease_month, " + amounts + " FROM dnrec_derived WHERE purchase_lease_year = :year GROUP BY purchase_lease_month ORDER BY purchase_lease_month", {"year": 2025}),
        "VehicleCategories": ("SELECT vehicle_type, " + amounts + " FROM dnrec_derived WHERE purchase_lease_month = :month GROUP BY vehicle_type ORDER BY vehicle_type", {"month": "2025-11"}),
        "VehicleCounty": ("SELECT vehicle_type, county, " + amounts + " FROM dnrec_derived GROUP BY vehicle_type, county ORDER BY vehicle_type, county", {}),
        "DateExceptions": ("SELECT " + ", ".join(map(quote, FIELDS + EXTRA)) + " FROM dnrec_derived WHERE date_state != 'VALID' ORDER BY source_row", {}),
        "AmountExceptions": ("SELECT source_row, award_number, rebate_amount, rebate_cents, amount_state FROM dnrec_derived WHERE amount_state != 'VALID' ORDER BY source_row", {}),
        "FieldDictionary": ("SELECT * FROM dnrec_dictionary ORDER BY _sf_row_number", {})}


def receive_query(original, destination):
    manifest = original.inspect()
    directory(destination)
    for name in manifest["outputs"]:
        with original.open(name) as stream:
            keep(destination / name, stream.read())
    keep(destination / "manifest.json", bytes_at(original.directory / "manifest.json"))
    received = QueryExport(destination)
    require(received.inspect() == manifest, "Full query delivery changed")
    return received


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--work-directory", required=True)
    parser.add_argument("--retry-terminal", action="store_true", help="Explicit new child request for a retained terminal failed job")
    args = parser.parse_args()
    selected, input_raw, originals, program, receipt, rows, derived, metadata = receive_inputs(args.input)
    root = directory(args.work_directory)
    out = directory(root / "delivery")
    binding = {"operation": OPERATION, "inputSha256": sha256(input_raw).hexdigest(),
               "programmeSha256": selected["programmeSha256"], "directory": str(root)}
    record_path = root / "programme.json"
    result = parse(read(record_path, 16 * 1024 * 1024)) if record_path.exists() else {
        "schema": "stellar-forge.delaware-public-reference-course.v1", "binding": binding, "state": "PREPARED"}
    require(result["binding"] == binding, "Original programme selection changed")
    if result["state"] == "DATA_COMPLETE":
        inspect_archive(result["workspaceArchive"]["path"], expected_sha256=result["workspaceArchive"]["sha256"])
        WorkbookDelivery(out / "workbook-received").inspect()
        for item in result.get("deliveryFiles", []):
            require(identity(bytes_at(out / item["path"])) == {k: item[k] for k in ("bytes", "sha256")},
                    "Completed delivery file changed: " + item["path"])
        keep(out / "data-completion.json", compact(result))
        print(json.dumps(result, ensure_ascii=False), flush=True)
        return
    keep(root / "input.json", input_raw)
    base_originals = [(name, originals[name], "csv" if name == "header" else "json",
                       "text/csv" if name == "header" else "application/json")
                      for name in ("metadata", "count", "header", "receipt", "acceptance")]
    base_originals.append(("programme", program, "txt", "text/plain"))
    dictionary = dictionary_rows(rows, derived, metadata)
    docs = {
        "dnrec_public": ("csv", originals["csv"], FIELDS),
        "dnrec_derived": ("json", compact({"rows": derived}), FIELDS + EXTRA),
        "dnrec_dictionary": ("json", compact({"rows": dictionary}), list(dictionary[0]))}
    paths = {}
    for name, (format_, raw, fields) in docs.items():
        sources = base_originals if name == "dnrec_public" else [
            ("original_csv", originals["csv"], "csv", "text/csv"), *base_originals]
        paths[name] = source_document(root, name, format_, raw, sources, receipt, selected)
    keep(out / "Methodology.txt", (NOTICE + "\n\n" +
         "Open the saved Analysis workspace to edit queries, report definitions and workbook selections. "
         "This data course does not certify visual presentation or production qualification. "
         "A producing peer must actually open and view every report and workbook sheet, inspect full downloads, "
         "and operate the cold-received Analysis UI at desktop and narrow widths. Preserve original files; "
         "publish an explicit reviewed successor if presentation needs correction.\n").encode())
    keep(out / "field-dictionary.json", compact(dictionary))
    csv_output = io.StringIO(newline="")
    writer = csv.DictWriter(csv_output, fieldnames=list(dictionary[0]))
    writer.writeheader()
    writer.writerows(dictionary)
    keep(out / "field-dictionary.csv", csv_output.getvalue().encode("utf-8"))
    ws = None
    primary = None
    try:
        ws = AnalysisWorkspace(root / "analysis")
        course = Course(ws, root, result, args.retry_terminal)
        result.update(state="RUNNING", workspaceId=ws.identity)
        course.save()
        for name, (format_, raw, fields) in docs.items():
            import_document(course, name, format_, paths[name], fields)
        require(result["sources"]["dnrec_public"]["rows"] == 7758 and
                result["sources"]["dnrec_derived"]["rows"] == 7758 and
                result["sources"]["dnrec_dictionary"]["rows"] == 19, "Imported complete population differs")
        views = ws.database.view_bindings()
        result["viewBindings"] = views
        saved = {}
        heads = {item["name"]: item["revision"] for item in ws.state()["queries"]}
        for name, (sql, parameters) in recipes().items():
            spec = {"sql": sql, "parameters_text": json.dumps(parameters, separators=(",", ":")), "max_rows": 10000}
            if name in heads:
                item = ws.saved_query(name, revision=heads[name])
                require(all(item[key] == value for key, value in spec.items()), "Saved query changed: " + name)
            else:
                item = ws.save_query(name, spec, expected_revision=0)
            saved[name] = item
            keep(out / "queries" / (name + ".json"), compact({"name": name, "revision": item["revision"], **spec}))
        result["queries"] = {name: {"revision": item["revision"], "sql": item["sql"],
                                   "parameters_text": item["parameters_text"]} for name, item in saved.items()}
        exports = {}
        selections = [(name, name, recipes()[name][1]) for name in (
            "OriginalRows", "CalendarAmounts", "PublicInventory", "RepeatedAwards", "RepeatedAwardRows",
            "AllPurchaseLeaseMonths", "AnnualRows", "AnnualSummary", "AnnualMonths", "VehicleCounty",
            "DateExceptions", "AmountExceptions", "FieldDictionary")]
        for month in EXPECTED_MONTHS:
            for label, query in (("Month", "SelectedMonth"), ("Rows", "MonthRows"), ("Vehicles", "VehicleCategories")):
                selections.append((label + month.replace("-", ""), query, {"month": month}))
        result.setdefault("queryExports", {})
        for label, name, parameters in selections:
            query = course.complete("query", "query:" + label, {
                "sql": saved[name]["sql"], "parameters_text": json.dumps(parameters, separators=(",", ":")),
                "max_rows": 10000, "expected_views": views})
            exported = course.complete("query-export", "export:" + label, {
                "query_id": query["id"], "result_sha256": query["result"]["result_sha256"],
                "label": "Delaware public reference " + label, "formats": ["jsonl", "csv", "sqlite"],
                "max_rows": 100000, "max_output_bytes": 128 * 1024 * 1024})
            delivery = receive_query(QueryExport(exported["result"]["directory"]), out / "query-exports" / label)
            exports[label] = delivery
            result["queryExports"][label] = {"id": exported["id"], "manifestSha256": exported["result"]["manifest_sha256"],
                "directory": str(delivery.directory), "rows": delivery.manifest["rowCount"],
                "columns": delivery.manifest["columns"]}
            course.save()
        require(list(exports["OriginalRows"].rows()) == rows, "Every original CSV cell must survive native export")
        require(list(exports["CalendarAmounts"].rows()) == derived, "Every original and derived cell must survive native export")
        for month, expected in EXPECTED_MONTHS.items():
            native = list(exports["Month" + month.replace("-", "")].rows())
            require(len(native) == 1 and (native[0]["source_rows"], native[0]["rebate_cents"]) == expected,
                    "Native month query differs")
        annual = list(exports["AnnualSummary"].rows())
        require(len(annual) == 1 and (annual[0]["source_rows"], annual[0]["rebate_cents"]) == (762, 138200000),
                "Native annual query differs")
        require(exports["AnnualRows"].manifest["rowCount"] == 762 and
                list(exports["AnnualRows"].rows()) == [row for row in derived if row["purchase_lease_year"] == 2025],
                "Complete original calendar-year rows changed")
        require(exports["RepeatedAwards"].manifest["rowCount"] == 514 and
                exports["RepeatedAwardRows"].manifest["rowCount"] == 1028 and
                exports["AllPurchaseLeaseMonths"].manifest["rowCount"] == 132 and
                exports["VehicleCounty"].manifest["rowCount"] == 28, "Complete native grouping changed")
        result.setdefault("reports", {})
        report_selections = [
            ("DelawarePublic202511", "November 2025 public purchase and lease reference", {"month": "2025-11"}),
            ("DelawarePublic202512", "December 2025 public purchase and lease reference", {"month": "2025-12"}),
            ("DelawarePublic2025", "Calendar 2025 public purchase and lease reference", {"year": 2025})]
        for name, title, parameters in report_selections:
            primary_sections = (("SelectedMonth", "Selected historical month"), ("VehicleCategories", "Published vehicle categories")) if "month" in parameters else (
                ("AnnualSummary", "Selected calendar year"), ("AnnualMonths", "Observed month groups"))
            sections = []
            for query_name, heading in (*primary_sections, ("RepeatedAwards", "Repeated values across the whole capture"),
                    ("DateExceptions", "All original date exceptions"), ("AmountExceptions", "All amount exceptions"),
                    ("FieldDictionary", "Full source and projection dictionary")):
                section = {"title": heading, "query_name": query_name, "query_revision": saved[query_name]["revision"],
                           "note": "Complete selected query. Whole-capture findings remain separately labelled."}
                if query_name in {"SelectedMonth", "VehicleCategories", "AnnualSummary", "AnnualMonths"}:
                    section["parameters_text"] = json.dumps(parameters, separators=(",", ":"))
                sections.append(section)
            definition = ws.reports.save(name, {"id": identifier("definition:" + name), "expected_revision": 0,
                                               "title": title, "introduction": NOTICE, "sections": sections})
            pinned = ws.reports.definition(name, revision=definition["revision"])
            built = course.complete("report", "report:" + name, {"name": name, "revision": definition["revision"],
                                    "definition_sha256": pinned["sha256"], "expected_views": views})
            publication = ws.reports.publish(built["id"], {"id": identifier("publication:" + name),
                "result_sha256": built["result"]["result_sha256"], "expected_revision": 0, "note": NOTICE})
            retained = next(item for item in ws.reports.publications(name=name)["publications"]
                            if item["publication"]["id"] == publication["id"])
            record = {"name": name, "revision": definition["revision"], "definitionSha256": pinned["sha256"],
                      "publicationId": publication["id"], "publicationSha256": retained["sha256"], "exports": {}}
            for format_ in ("html", "json", "csv"):
                exported = course.complete("report-export", "report-export:" + name + ":" + format_, {
                    "publication_id": publication["id"], "publication_sha256": retained["sha256"], "format": format_})
                filename = name + (".zip" if format_ == "csv" else "." + format_)
                record["exports"][format_] = keep(out / "reports" / filename, bytes_at(exported["result"]["path"]))
            keep(out / "reports" / (name + "-definition.json"),
                 compact({"definition": pinned["definition"], "sha256": pinned["sha256"]}))
            result["reports"][name] = record
            course.save()
        sheet_selections = [
            ("Original public rows", "OriginalRows"), ("Cents and calendar", "CalendarAmounts"),
            ("November 2025", "Rows202511"), ("December 2025", "Rows202512"),
            ("Calendar 2025 rows", "AnnualRows"), ("Calendar 2025 months", "AnnualMonths"), ("Calendar 2025 summary", "AnnualSummary"),
            ("Repeated award values", "RepeatedAwards"), ("Repeated award rows", "RepeatedAwardRows"),
            ("Date findings", "DateExceptions"), ("Amount findings", "AmountExceptions"),
            ("Field dictionary", "FieldDictionary")]
        sheets = []
        for label, export_name in sheet_selections:
            exported = result["queryExports"][export_name]
            sheets.append({"name": label, "source": {"kind": "query-export", "id": exported["id"],
                                                    "sha256": exported["manifestSha256"]},
                           "columns": [{"source": column, "header": column, "type": "native", "precision": "preserve"}
                                       for column in exported["columns"]]})
        workbook = ws.workbooks.save("DelawarePublicReference", {"id": identifier("workbook-definition"),
            "expected_revision": 0, "title": "Delaware public rebate historical reference", "notes": NOTICE, "sheets": sheets})
        pinned = ws.workbooks.definition(workbook["name"], revision=workbook["revision"])
        keep(out / "workbook-definition.json", compact({"definition": pinned["definition"],
                                                        "definition_sha256": pinned["definition_sha256"]}))
        built = course.complete("workbook", "workbook", {"name": workbook["name"], "revision": workbook["revision"],
                                                       "definition_sha256": workbook["definition_sha256"]})
        original = WorkbookDelivery(built["result"]["directory"])
        original.inspect()
        zip_info = keep(out / "Delaware_Public_Reference_Workbook.zip", bytes_at(original.directory / "handoff.zip"))
        original.verify_archive(zip_info["path"])
        destination = out / "workbook-received"
        if destination.exists():
            received = WorkbookDelivery(destination)
            received.inspect()
            received.verify_archive(zip_info["path"])
        else:
            received = WorkbookDelivery.receive(zip_info["path"], destination, expected_sha256=zip_info["sha256"])
        require(received.manifest == original.manifest, "Independent workbook delivery differs")
        keep(out / "Delaware_Public_Reference.xlsx", bytes_at(received.directory / "workbook.xlsx"))
        result["workbook"] = {"id": built["id"], "name": workbook["name"], "revision": workbook["revision"],
            "definitionSha256": pinned["definition_sha256"], "manifestSha256": built["result"]["manifest_sha256"],
            "archive": zip_info, "dataSheets": len(sheets)}
        review = ws.archives.review()
        require(review["ready"], "Original workspace is not ready for a whole archive")
        archive = course.complete("workspace-export", "workspace-archive", {"include_previous_backups": False})
        result["workspaceArchive"] = keep(out / "Delaware_Public_Analysis_Workspace.zip",
                                          bytes_at(Path(archive["result"]["directory"]) / "workspace.zip"))
        inspected = inspect_archive(result["workspaceArchive"]["path"], expected_sha256=result["workspaceArchive"]["sha256"])
        require(inspected["manifest"]["workspace_id"] == ws.identity, "Whole archive changed workspace identity")
        result["archiveMembers"] = len(inspected["manifest"]["files"])
        result["state"] = "ARCHIVED"
        course.save()
    except BaseException as error:
        primary = error
        result.update(state="INCOMPLETE", error={"type": type(error).__name__, "message": str(error)})
        dump(record_path, result)
        raise
    finally:
        if ws is not None:
            try:
                ws.close()
            except Exception as error:
                result.setdefault("cleanupErrors", []).append({"type": type(error).__name__, "message": str(error)})
                dump(record_path, result)
                if primary is None:
                    raise
    cold = None
    primary = None
    try:
        restored = restore_archive(result["workspaceArchive"]["path"], root / "analysis-received",
            operation=identifier("workspace-receiving"), expected_sha256=result["workspaceArchive"]["sha256"])
        cold = AnalysisWorkspace(root / "analysis-received")
        require(cold.identity == result["workspaceId"] and cold.database.view_bindings() == result["viewBindings"],
                "Cold received workspace identity or selected versions differ")
        for name, expected in result["queries"].items():
            actual = cold.saved_query(name, revision=expected["revision"])
            require(all(actual[key] == value for key, value in expected.items()), "Cold saved query differs: " + name)
        # Re-execute full exact source projections on the received database.
        for name, expected_rows in (("OriginalRows", rows), ("CalendarAmounts", derived)):
            query = result["queries"][name]
            actual = cold.database.query(query["sql"], max_rows=10000,
                                         max_result_bytes=16 * 1024 * 1024, expected_views=result["viewBindings"])
            require([dict(zip(actual.columns, row)) for row in actual.rows] == expected_rows,
                    "Cold database lost original rows or projection: " + name)
        for name, exported in result["queryExports"].items():
            reopened = QueryExport(cold.database.directory / "analysis-query-exports" / exported["id"])
            require(reopened.inspect() == exports[name].manifest, "Cold complete query export differs: " + name)
        for name, expected in result["reports"].items():
            require(cold.reports.definition(name, revision=expected["revision"])["sha256"] == expected["definitionSha256"],
                    "Cold report definition differs: " + name)
            found = next(item for item in cold.reports.publications(name=name)["publications"]
                         if item["publication"]["id"] == expected["publicationId"])
            require(found["sha256"] == expected["publicationSha256"], "Cold published report differs")
        expected = result["workbook"]
        require(cold.workbooks.definition(expected["name"], revision=expected["revision"])["definition_sha256"] ==
                expected["definitionSha256"], "Cold workbook definition differs")
        reopened = WorkbookDelivery(cold.database.directory / "analysis-workbooks" / expected["id"])
        require(reopened.inspect() == original.inspect(), "Cold workbook delivery differs")
        result["receivedWorkspace"] = restored
        result["visualInspection"] = {"state": "PENDING_PRODUCING_PEER_ACTUAL_VIEW",
            "required": ["Every report page", "Every workbook sheet", "Full downloaded outputs",
                         "Desktop and narrow Analysis controls", "Cold-received operator view"]}
        result["deliveryFiles"] = [{"path": str(path.relative_to(out)), **identity(bytes_at(path))}
                                   for path in sorted(out.rglob("*")) if path.is_file() and
                                   path.name != "data-completion.json" and not any(part.startswith(".") for part in path.relative_to(out).parts)]
        result.update(state="COLD_REOPEN_VERIFIED", completeSourceRows=7758, calendarYear=2025,
                      selectedMonths=list(EXPECTED_MONTHS), captureEditions=1)
        result.pop("error", None)
        dump(record_path, result)
    except BaseException as error:
        primary = error
        result.update(state="INCOMPLETE", error={"type": type(error).__name__, "message": str(error)})
        dump(record_path, result)
        raise
    finally:
        if cold is not None:
            try:
                cold.close()
            except Exception as error:
                result.setdefault("cleanupErrors", []).append({"type": type(error).__name__, "message": str(error)})
                dump(record_path, result)
                if primary is None:
                    raise
    result["state"] = "DATA_COMPLETE"
    dump(record_path, result)
    keep(out / "data-completion.json", compact(result))
    print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
