"""Receive the original NEK BLS files into a complete customer analysis project."""
from __future__ import annotations
import contextlib
import hashlib
import json
from pathlib import Path
import sys
import time
from model import Workspace, private_path, file_pin, read_json, write_json, require, receive_project

ORIGINAL_SHA256 = "3473bd56195b486c41a5042f5d9be4cfbf82bcf0d257528fe724b18caea9a28e"
ORIGINAL_BYTES = 21024420
ORIGINAL_COUNTS = {"laus": 408, "qcew": 96}
COUNTIES = {"50005": "Caledonia County", "50009": "Essex County", "50019": "Orleans County"}


def receive_original(directory, archive, expected_sha256, output, name):
    directory, output = Path(directory), Path(output)
    require(directory.is_absolute() and output.is_absolute() and output != directory and
            not output.is_relative_to(directory) and not directory.is_relative_to(output),
            "Choose separate absolute workspace and customer output directories.")
    actual = file_pin(private_path(archive))
    require(actual["sha256"] == expected_sha256, "The selected original ZIP differs from its supplied SHA-256.")
    require(expected_sha256 == ORIGINAL_SHA256 and actual["bytes"] == ORIGINAL_BYTES,
            "This original receiving operation uses the retained NEK_Vitality_Official_Sources_20261011.zip.")
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    case_path = output / "original-receiving.json"
    started = time.monotonic()
    identity = {"schema": "stellar-forge.bls-original-receiving.v1", "workspace": str(directory),
                "archive": str(Path(archive)), "archive_sha256": expected_sha256, "archive_bytes": actual["bytes"],
                "output": str(output), "name": name}
    if case_path.exists():
        retained = read_json(case_path)
        require(retained["request"] == identity, "This original receiving case belongs to different inputs.")
    else:
        retained = {"request": identity, "operations": {}}
        write_json(case_path, retained)
    with contextlib.closing(Workspace(directory, create=not (directory / "workspace.json").exists(), name=name)) as workspace:
        def operate(key, kind, value):
            op_id = "nek-original-" + key
            try:
                request = workspace.request(op_id)
                require(request["kind"] == kind and request["input"] == value,
                        "The original receiving operation has different saved input.")
            except ValueError as error:
                if str(error) != "The operation ID is not in this workspace.":
                    raise
                request = {"id": op_id, "kind": kind, "input": value, "expected_revision": workspace.revision()}
            result = workspace.begin(request)
            retained["operations"][key] = result
            write_json(case_path, retained)
            return result["result"]
        # On restart, the original saved source expectation is reused as part of this same intake.
        try:
            previous_intake = workspace.request("nek-original-intake")["input"]
            expected_source = previous_intake["expected_source_sha256"]
        except ValueError as error:
            if str(error) != "The operation ID is not in this workspace.":
                raise
            expected_source = workspace.source_pin()
        intake = operate("intake", "import", {"edition_id": "nek-original", "title": name,
            "selection": workspace.contract["selection"], "archive": str(Path(archive)),
            "archive_sha256": expected_sha256, "activate": True, "expected_source_sha256": expected_source})
        require(intake["counts"] == ORIGINAL_COUNTS, "The retained original NEK BLS cohort changed.")
        reports = []
        for county, title in COUNTIES.items():
            for projection, label in (("laus", "Resident labor"), ("qcew", "Workplace employment and wages")):
                county_filter = "county_fips" if projection == "laus" else "area_fips"
                report = operate(county + "-" + projection, "report", {"edition_id": "nek-original",
                    "projection": projection, "title": title + " — " + label,
                    "filters": {county_filter: [county]}, "calculation": "original",
                    "narrative": "Complete original BLS observations for " + title +
                        ". Source periods, units, disclosure status and original values are retained with each row."})
                reports.append({"id": report["id"], "title": report["title"], "rows": report["row_count"],
                                "projection": projection, "files": report["files"]})
        annual = operate("resident-year-change", "report", {"edition_id": "nek-original", "projection": "laus",
            "title": "Northeast Kingdom — comparable resident labor changes", "filters": {},
            "calculation": "year-change",
            "narrative": "Changes use the same original LAUS series and period one year earlier. Original unavailable values and differing annual coverage remain explicit."})
        reports.append({"id": annual["id"], "title": annual["title"], "rows": annual["row_count"],
                        "projection": "laus", "files": annual["files"]})
        note = operate("source-note", "note", {"subject": "edition:nek-original",
            "expected_note_revision": 0,
            "text": "Received the complete retained NEK source archive. LAUS records describe residents; QCEW records describe workplace employment and wages. The original sources, dictionaries and capture receipts remain in this editable project."})
        selected = workspace.state()
        require(selected["pages"]["editions"]["total"] >= 1, "The original edition is missing.")
        handover = operate("handover", "export", {})
        retained.update({"workspace_id": workspace.marker["workspace_id"], "source": intake,
                         "reports": reports, "note": workspace.note("edition:nek-original"), "handover": handover})
        write_json(case_path, retained)
    received_directory = output / "received-workspace"
    received = receive_project(handover["file"], received_directory, handover["archive"]["sha256"])
    with contextlib.closing(Workspace(received_directory)) as received_workspace:
        counts = received_workspace._edition("nek-original")["data"]["counts"]
        require(counts == ORIGINAL_COUNTS, "The received original observations differ.")
        for item in reports:
            report = received_workspace.report(item["id"])
            require(report["row_count"] == item["rows"] and report["files"] == item["files"],
                    "A received complete customer briefing changed.")
            for filename, pin in report["files"].items():
                require(file_pin(received_directory / "reports" / item["id"] / filename) == pin,
                        "A received original customer file changed.")
        require(received_workspace.note("edition:nek-original") == retained["note"],
                "The received analyst note revisions changed.")
        reopened = received_workspace.state()
    retained.update({"received": received, "reopened": reopened,
                     "elapsed_seconds": round(time.monotonic() - started, 3)})
    write_json(case_path, retained)
    return {"schema": identity["schema"], "workspace": str(directory), "workspace_id": retained["workspace_id"],
            "source_counts": ORIGINAL_COUNTS, "customer_reports": reports,
            "handover": handover, "received": {"workspace": str(received_directory),
                "workspace_id": received["workspace_id"], "source_counts": counts},
            "complete_output": str(case_path), "elapsed_seconds": retained["elapsed_seconds"]}
