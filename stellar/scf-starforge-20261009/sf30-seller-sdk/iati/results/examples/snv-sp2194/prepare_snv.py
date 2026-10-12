#!/usr/bin/env python3
"""MIT. Prepare the one original SNV SP2194 Results receiving programme.

The input is the complete retained D-Portal activity-export representation and
its original JSON/serializer/provenance archive. No publisher acquisition occurs.
Preparation does not create an IatiWorkspace. --run continues the original
Results receiving programme with one immutable selection and request identity.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import tempfile
import zipfile

IATI = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(IATI))
from iati_source import InputError
from results.model import project_source, build_report, source_key
from results.receiving import private_directory, write_json, run as receive
from workspace import file_digest, regular, json_bytes

OPERATION = "iati-results-snv-sp2194-6966-20261012"
ARCHIVE_NAME = "SNV_SP2194_DPortal_Source_20261012.zip"
ARCHIVE_BYTES = 17001
ARCHIVE_SHA256 = "1ef7186ef080158ab15c0815ae1c18107cea7d981d0567a069912a7fa5935b9d"
XML_NAME = "snv-sp2194-dportal-activity-export.xml"
XML_BYTES = 21249
XML_SHA256 = "2bbc8f8a367f304c186a69e7e9b3a399118a472dcfd093a35dad1672a2347539"
ACTIVITY = "NL-KVK-41152786-SP2194"
INDICATOR_PATH = "/iati-activities/iati-activity[1]/result[2]/indicator[1]"
SOURCE_URL = "https://d-portal.org/q.json?aid=NL-KVK-41152786-SP2194"
TITLE = "Number of people trained in sustainable livelihoods"
BASIS = (
    "The original D-Portal activity export reports a measure-1 indicator with "
    "ascending=1. Its undimensioned baseline is exactly value 0, year 2025, "
    "with no ISO date; its undimensioned actual is exactly 2348.00 in the "
    "2025-04-01 through 2026-02-01 period. These are the same original "
    "dimension/location context. The separate Female 882.00 and Male 1466.00 "
    "actuals remain separate original records and are not added to the reported "
    "undimensioned total or assigned the undimensioned baseline. No target "
    "exists in this source, so only actual-minus-baseline is selected, with "
    "no target attainment percentage. The published title refers to people "
    "trained in sustainable livelihoods, while its description refers to "
    "awareness of rights to land and natural resources; both are preserved. "
    "This is a D-Portal activity-export representation with its declared local "
    "XML encoding dependency adapter, not an assertion of publisher-byte identity."
)


def require(condition, message):
    if not condition:
        raise InputError(message)


def retain(path, data):
    """Create-only exact retained source; never replace an existing prefix."""
    path = Path(path)
    private_directory(path.parent)
    if path.exists():
        regular(path, max(len(data), 1))
        require(path.read_bytes() == data, "Existing retained source differs: " + str(path))
        return
    fd, temporary_name = tempfile.mkstemp(prefix=".snv-source-", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            regular(path, max(len(data), 1))
            require(path.read_bytes() == data, "Existing retained source differs: " + str(path))
    finally:
        temporary.unlink(missing_ok=True)


def archive_input(path, root):
    path = Path(path).absolute()
    require(regular(path, ARCHIVE_BYTES).st_size == ARCHIVE_BYTES
            and file_digest(path, ARCHIVE_BYTES) == ARCHIVE_SHA256,
            "Select the complete original 17,001-byte SNV source archive")
    raw = path.read_bytes()
    require(len(raw) == ARCHIVE_BYTES and hashlib.sha256(raw).hexdigest() == ARCHIVE_SHA256,
            "The source archive changed during preparation")
    inputs = private_directory(root / "source-inputs")
    retain(inputs / ARCHIVE_NAME, raw)
    notice = Path(__file__).resolve().parent / "THIRD_PARTY_NOTICES.md"
    require(regular(notice, 3039).st_size == 3039
            and file_digest(notice, 3039) == "72e0fb7d2f8f6ad4f87a427c461eaba0f330f3f28bb684f48573556376a4518a",
            "Retain the complete original third-party notice with this source archive")
    retain(inputs / "THIRD_PARTY_NOTICES.md", notice.read_bytes())
    extracted = private_directory(inputs / "snv-sp2194")
    names, members, expanded = set(), [], 0
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        require(1 <= len(archive.infolist()) <= 100, "Use the complete bounded original source archive")
        for info in archive.infolist():
            name = info.filename
            relative = PurePosixPath(name)
            canonical_name = relative.as_posix() + ("/" if info.is_dir() else "")
            require(name and name == canonical_name and not relative.is_absolute()
                    and "\\" not in name and "\0" not in name
                    and all(piece not in ("", ".", "..") for piece in relative.parts)
                    and len(name) <= 1000 and name not in names,
                    "An original archive member path is unsupported")
            names.add(name)
            if info.is_dir():
                private_directory(extracted.joinpath(*relative.parts))
                continue
            mode = info.external_attr >> 16
            require(stat.S_IFMT(mode) in (0, stat.S_IFREG),
                    "Original source members must be regular files")
            expanded += info.file_size
            require(expanded <= 16 * 1024 * 1024, "Source archive expansion exceeds its retained bound")
            data = archive.read(info)
            require(len(data) == info.file_size, "The original ZIP member was truncated")
            target = extracted.joinpath(*relative.parts)
            retain(target, data)
            members.append({"path": name, "bytes": len(data),
                            "sha256": hashlib.sha256(data).hexdigest()})
    xml = extracted / XML_NAME
    require(xml.is_file() and regular(xml, XML_BYTES).st_size == XML_BYTES
            and file_digest(xml, XML_BYTES) == XML_SHA256,
            "The exact retained original activity-export XML is absent")
    return xml, members


def prepare(*, source_zip, root, operator):
    require(isinstance(operator, str) and 0 < len(operator.strip()) <= 160,
            "Name the actual receiving operator within 160 characters")
    operator = operator.strip()
    root = private_directory(Path(root).absolute())
    xml, original_members = archive_input(source_zip, root)
    source = {"id": XML_SHA256, "bytes": XML_BYTES,
              "label": "SNV SP2194 — D-Portal activity export",
              "name": XML_NAME}
    with xml.open("rb") as stream:
        projection = project_source(source, stream)
    expected_counts = {"activities": 1, "results": 4, "indicators": 12,
                       "baselines": 10, "periods": 6, "targets": 0, "actuals": 12}
    require(all(projection["counts"].get(key) == value for key, value in expected_counts.items()),
            "The original source coverage differs from the retained SNV representation")
    key = source_key(XML_SHA256, INDICATOR_PATH)
    rows = [item for item in projection["indicators"] if item["key"] == key]
    require(len(rows) == 1, "The exact original result/indicator identity is absent")
    indicator = rows[0]
    require(indicator["activityId"] == ACTIVITY and indicator["title"] == TITLE
            and indicator["measure"] == "1" and indicator["ascending"] is True,
            "The selected original indicator meaning changed")
    require(len(indicator["baselines"]) == 1 and len(indicator["periods"]) == 1,
            "Use the exact original baseline and period")
    baseline, period = indicator["baselines"][0], indicator["periods"][0]
    require(baseline["locator"] == INDICATOR_PATH + "/baseline[1]"
            and baseline["rawValue"] == "0" and baseline["year"] == "2025"
            and baseline["isoDate"] is None and baseline["dateDay"] is None,
            "Preserve the original zero baseline and year-only temporal precision")
    require(period["startOriginal"] == "2025-04-01"
            and period["endOriginal"] == "2026-02-01"
            and period["targets"] == [] and len(period["actuals"]) == 3,
            "The original period/target/actual coverage changed")
    require([row["rawValue"] for row in period["actuals"]] == ["882.00", "1466.00", "2348.00"],
            "Retain every original reported actual and its decimal spelling")
    actual = period["actuals"][2]
    require(actual["locator"] == INDICATOR_PATH + "/period[1]/actual[3]"
            and baseline["contextComparable"] and actual["contextComparable"]
            and baseline["contextKey"] == actual["contextKey"]
            and all(row["contextKey"] != actual["contextKey"] for row in period["actuals"][:2]),
            "Select the undimensioned original baseline/actual context without conflating Gender rows")
    selection = {"indicatorKeys": [key], "activityIds": [ACTIVITY], "resultTypes": [],
                 "measures": [], "periodFrom": "", "periodTo": "", "includeUndated": True}
    definition = {
        "name": "SNV SP2194 — source-bound livelihood baseline review",
        "notes": BASIS + " Original published JSON: " + SOURCE_URL,
        "sources": [XML_SHA256], "selection": selection,
        "interpretations": [{"indicatorKey": key,
                             "unitLabel": "people (published indicator title; description discrepancy retained)",
                             "direction": "reported", "note": BASIS}],
        "bindings": [{"periodKey": period["key"], "targetKey": None,
                      "actualKey": actual["key"], "baselineKey": baseline["key"],
                      "operation": "baseline-change", "note": BASIS}],
    }
    report = build_report(definition, [projection])
    comparisons = report["comparisons"]
    require(len(comparisons) == 1
            and comparisons[0]["status"] == "calculated-from-selected-source"
            and comparisons[0]["target"] is None
            and comparisons[0]["calculation"]["actualMinusBaseline"] == "2348.00"
            and comparisons[0]["calculation"]["ratioPercent"] is None
            and comparisons[0]["calculation"]["actualMinusTarget"] is None,
            "The original Results model did not retain the exact selected baseline change")
    coverage = deepcopy(definition)
    coverage["name"] = "SNV SP2194 — complete reported results coverage"
    coverage["selection"]["indicatorKeys"] = []
    coverage["notes"] += (
        " This later edition includes all twelve original indicators and four "
        "parent results; the same explicit baseline comparison remains selected."
    )
    named_review = {"status": "reviewed", "reviewer": operator, "note": BASIS}
    receiving_review = {
        "status": "reviewed", "reviewer": operator,
        "note": "Receiving-side review of the exact imported original XML, all retained "
                "source editions and the declared baseline-only interpretation. " + BASIS,
    }
    config = {
        "schema": "stellar-forge.iati-results-receiving-selection.v1",
        "operationId": OPERATION, "root": str(root),
        "sources": [{"path": str(xml), "sha256": XML_SHA256, "bytes": XML_BYTES,
                     "label": source["label"], "name": XML_NAME}],
        "definition": definition, "review": named_review,
        "coverageDefinition": coverage, "receivingReview": receiving_review,
    }
    config_path = root / "controller-selection.json"
    write_json(config_path, config, immutable=True)
    prepared = {
        "schema": "stellar-forge.iati-results-snv-preparation.v1",
        "operationId": OPERATION, "root": str(root), "config": str(config_path),
        "sourceArchive": {"name": ARCHIVE_NAME, "bytes": ARCHIVE_BYTES, "sha256": ARCHIVE_SHA256},
        "source": source, "originalMembers": original_members,
        "representation": "D-Portal activity export; declared local XML encoding dependency adapter",
        "sourceUrl": SOURCE_URL, "projectionSha256": projection["projectionSha256"],
        "counts": projection["counts"], "indicatorKey": key, "periodKey": period["key"],
        "baselineKey": baseline["key"], "actualKey": actual["key"],
        "sourceReportSha256": report["reportSha256"],
        "selectedCalculation": comparisons[0]["calculation"],
        "state": "PREPARED_ORIGINAL_SOURCE",
    }
    write_json(root / "source-preparation.json", prepared, immutable=True)
    return config, prepared


def main(argv=None):
    parser = argparse.ArgumentParser(description="Prepare the complete original SNV Results receiving selection")
    parser.add_argument("--source-zip", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--operator", required=True)
    parser.add_argument("--run", action="store_true", help="Continue the single original native Results programme")
    parser.add_argument("--node")
    parser.add_argument("--playwright")
    parser.add_argument("--chromium")
    parser.add_argument("--merchant-root")
    args = parser.parse_args(argv)
    console_values = (args.node, args.playwright, args.chromium, args.merchant_root)
    require(not any(console_values) or args.run and all(console_values),
            "A browser continuation needs --run plus all four original equipped runtime/source paths")
    config, prepared = prepare(source_zip=args.source_zip, root=args.root, operator=args.operator)
    print(json.dumps(prepared, ensure_ascii=False, separators=(",", ":")), flush=True)
    if args.run:
        outcome = receive(config)
        print(json.dumps(outcome, ensure_ascii=False, separators=(",", ":")), flush=True)
        if all(console_values):
            command = [sys.executable, "-B", str(IATI / "results" / "receiving_console.py"),
                       "--root", config["root"], "--node", args.node,
                       "--playwright", args.playwright, "--chromium", args.chromium,
                       "--merchant-root", args.merchant_root, "--reviewer", args.operator,
                       "--review-note", BASIS]
            completed = subprocess.run(command, check=False)
            if completed.returncode:
                raise SystemExit(completed.returncode)


if __name__ == "__main__":
    try:
        main()
    except (InputError, OSError, ValueError, zipfile.BadZipFile) as error:
        print(json.dumps({"state": "INCOMPLETE", "error": str(error)}, separators=(",", ":")),
              file=sys.stderr, flush=True)
        raise SystemExit(2)
