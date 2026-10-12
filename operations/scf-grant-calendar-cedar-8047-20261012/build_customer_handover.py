#!/usr/bin/env python3
"""Publish a complete customer handover from the original operated calendar case."""
from __future__ import annotations

import argparse
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import sys
import zipfile


OPERATION = "SCF-GRANT-DELIVERY-CALENDAR-9125-20261012"
ORIGINAL_SHA = "c9205af40840c324222b47fc53b4dc83c2f55891c54b50b3a4b77e8af3266275"
LICENSE_BLOB = "2d2a35a69e3896b7c6b885c1faebae2f2f8bc9c1"
DIRECTORY = "operations/scf-grant-calendar-cedar-8047-20261012"
FULFILLMENT_FILES = ("build_customer_handover.py", "restore_workspace.py", "CUSTOMER_HANDOVER.md")
NATIVE_FILES = ("calendar-workspace.sqlite3", "retained-original-case.zip", "received-original-case.zip",
                "calendar-walkthrough-case.zip", "prepared-completion.zip")
RESULT_FILES = ("original-calendar.json", "calendar.json", "completion-calendar.json", "saved-assignments.json",
                "completion-preview.json", "calendar.ics", "calendar.csv", "browser-calendar.json",
                "browser-calendar.ics", "browser-calendar.csv")
RECEIVING_FILES = ("native-result.json", "native-inputs.json", "source-selection.json", "browser-result.json",
                   "package-result.json")


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def git_blob(raw: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def write_json(path: Path, value) -> None:
    pending = path.with_name(path.name + ".pending")
    with pending.open("w", encoding="utf-8") as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)


def safe_relative(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\\" in value:
        raise ValueError("Source selection contains an unsafe path: " + value)
    return path


def verified_source(source: Path) -> dict:
    selected = json.loads((source / "SOURCE_SELECTION.json").read_text(encoding="utf-8"))
    if not re.fullmatch(r"[0-9a-f]{40}", selected.get("commit", "")):
        raise ValueError("The operated source requires its complete Git revision.")
    seen = set()
    for row in selected["files"]:
        relative = row["path"]
        if relative in seen:
            raise ValueError("Source selection contains a duplicate path: " + relative)
        seen.add(relative)
        raw = (source / safe_relative(relative)).read_bytes()
        if len(raw) != row["bytes"] or sha(raw) != row["sha256"] or git_blob(raw) != row["gitBlob"]:
            raise ValueError("Selected original source differs: " + relative)
    managed = source / "stellar/scf_2026/sf47_budget_model/workspace/managed_launch.py"
    tree = ast.parse(managed.read_text(encoding="utf-8"))
    boot = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign)
                and any(isinstance(target, ast.Name) and target.id == "BOOT_FILES" for target in node.targets))
    for relative in boot:
        file = (managed.parent / relative).resolve()
        if not file.is_relative_to(source) or file.relative_to(source).as_posix() not in seen:
            raise ValueError("The maintained application boot closure is absent from its source selection: " + relative)
    return selected


def assemble(source: Path, operation: Path, output: Path, fulfillment_commit: str) -> dict:
    selected = verified_source(source)
    native = json.loads((operation / "native-result.json").read_text())
    browser = json.loads((operation / "browser-result.json").read_text())
    receiving = json.loads((operation / "package-result.json").read_text())
    if native.get("operationId") != OPERATION or native.get("originalArchiveSha256") != ORIGINAL_SHA:
        raise ValueError("Use the original retained calendar operation and case archive.")
    if native.get("declaredSourceCommit") != selected["commit"]:
        raise ValueError("The operated source revision differs from its selected application.")
    if receiving.get("operationId") != OPERATION or receiving.get("stage") != "COMPLETE":
        raise ValueError("Use the completed original native and browser receiving output.")
    if browser.get("findings") or browser.get("pageErrors"):
        raise ValueError("Complete the original browser operation before assembling its customer handover.")
    original = (operation / "retained-original-case.zip").read_bytes()
    if sha(original) != ORIGINAL_SHA:
        raise ValueError("The retained original case archive differs from its exact source.")
    backup = operation / "calendar-workspace.sqlite3"
    with sqlite3.connect(backup.as_uri() + "?mode=ro&immutable=1", uri=True) as connection:
        if connection.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("The operated workspace backup failed its native SQLite integrity check.")
    for name in NATIVE_FILES + RESULT_FILES + RECEIVING_FILES:
        if not (operation / name).is_file():
            raise ValueError("The original complete operation output is missing: " + name)
    license_raw = (source / "LICENSE").read_bytes()
    if git_blob(license_raw) != LICENSE_BLOB:
        raise ValueError("The application license differs from its exact original Git source.")
    identity = {"schema": "stellar-forge.scf-calendar-fulfillment-input.v1", "operationId": OPERATION,
                "sourceSelectionSha256": sha((source / "SOURCE_SELECTION.json").read_bytes()),
                "fulfillmentCommit": fulfillment_commit,
                "fulfillmentFiles": {name: sha((source / DIRECTORY / name).read_bytes()) for name in FULFILLMENT_FILES},
                "licenseGitBlob": LICENSE_BLOB,
                "operationFiles": {name: sha((operation / name).read_bytes())
                                   for name in NATIVE_FILES + RESULT_FILES + RECEIVING_FILES}}
    retained_identity = output / "ASSEMBLY.json"
    if retained_identity.exists():
        if json.loads(retained_identity.read_text()) != identity:
            raise ValueError("This output belongs to different retained inputs; choose a new delivery parent.")
    else:
        if (output / "bundle").exists() or (output / "SCF_Grant_Calendar_Customer_Handover.zip").exists():
            raise ValueError("Choose a fresh delivery parent; its existing bundle has no retained assembly identity.")
        write_json(retained_identity, identity)
    bundle = output / "bundle"
    bundle.mkdir(mode=0o700, exist_ok=True)
    roles = {}

    def copy(original_path: Path, relative: str, role: str) -> None:
        destination = bundle / safe_relative(relative)
        destination.parent.mkdir(parents=True, exist_ok=True)
        pending = destination.with_name(destination.name + ".pending")
        with original_path.open("rb") as original_stream, pending.open("wb") as destination_stream:
            shutil.copyfileobj(original_stream, destination_stream, 1024 * 1024)
            destination_stream.flush()
            os.fsync(destination_stream.fileno())
        os.replace(pending, destination)
        roles[relative] = role

    for row in selected["files"]:
        copy(source / row["path"], "application/" + row["path"], "operated-application")
    copy(source / "SOURCE_SELECTION.json", "application/SOURCE_SELECTION.json", "source-selection")
    copy(source / "LICENSE", "LICENSE", "application-license")
    copy(source / "LICENSE", "application/LICENSE", "application-license")
    fulfillment = []
    for name in FULFILLMENT_FILES:
        relative = DIRECTORY + "/" + name
        file = source / relative
        raw = file.read_bytes()
        fulfillment.append({"path": relative, "bytes": len(raw), "sha256": sha(raw), "gitBlob": git_blob(raw)})
        copy(file, "application/" + relative, "fulfillment-program")
    copy(source / DIRECTORY / "CUSTOMER_HANDOVER.md", "START_HERE.md", "first-opening")
    copy(source / DIRECTORY / "restore_workspace.py", "restore_workspace.py", "restore-command")
    for folder, names, role in (("native", NATIVE_FILES, "native-state"), ("results", RESULT_FILES, "calendar-result"),
                                ("receiving", RECEIVING_FILES, "receiving-evidence")):
        for name in names:
            copy(operation / name, folder + "/" + name, role)
    fulfillment_manifest = {"repository": selected["repository"], "commit": fulfillment_commit, "files": fulfillment}
    write_json(bundle / "application/FULFILLMENT_SOURCE.json", fulfillment_manifest)
    roles["application/FULFILLMENT_SOURCE.json"] = "source-selection"
    handover = {
        "schema": "stellar-forge.scf-calendar-customer-handover.v1", "operationId": OPERATION,
        "operatedApplication": {"repository": selected["repository"], "commit": selected["commit"],
                                "files": len(selected["files"]), "bytes": sum(row["bytes"] for row in selected["files"])},
        "fulfillmentSource": {"repository": selected["repository"], "commit": fulfillment_commit,
                              "files": len(fulfillment)},
        "applicationLicense": {"file": "LICENSE", "originalCommit": selected["commit"],
                               "sha256": sha(license_raw), "gitBlob": git_blob(license_raw)},
        "originalCase": {"id": native["originalCaseId"], "version": 36, "sha256": ORIGINAL_SHA},
        "retainedCase": {"id": native["receivedCaseId"], "version": native["receivedVersion"],
                         "planId": native["receivedPlanId"]},
        "calendarCase": {"id": native["demoCaseId"], "version": native["demoVersion"], "planId": native["demoPlanId"],
                         "mode": native["mode"], "asOfDate": native["asOfDate"], "calendarAnchor": native["calendarAnchor"]},
        "calendarSummary": native["summary"], "assignmentPrecisions": native["assignmentPrecisions"],
        "retainedForecasts": native["originalSavedForecasts"], "retainedPortfolios": native["originalSavedPortfolios"],
        "completionReviewId": native["completionReviewId"], "completionOutcomeId": native["outcomeId"],
        "workspaceBackup": "native/calendar-workspace.sqlite3", "platform": "Linux", "python": "Python3.12",
    }
    write_json(bundle / "HANDOVER.json", handover)
    roles["HANDOVER.json"] = "customer-handover"
    files = []
    for relative in sorted(roles):
        file = bundle / relative
        raw = file.read_bytes()
        files.append({"path": relative, "bytes": len(raw), "sha256": sha(raw), "role": roles[relative]})
    write_json(bundle / "MANIFEST.json", {"schema": "stellar-forge.scf-calendar-customer-manifest.v1",
               "operationId": OPERATION, "operatedSourceCommit": selected["commit"],
               "fulfillmentSourceCommit": fulfillment_commit, "files": files})
    archive = output / "SCF_Grant_Calendar_Customer_Handover.zip"
    members = sorted([*roles, "MANIFEST.json"])
    if not archive.exists():
        pending = archive.with_name(archive.name + ".pending")
        with zipfile.ZipFile(pending, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as target:
            for relative in members:
                target.write(bundle / relative, relative)
        with pending.open("rb") as stream:
            os.fsync(stream.fileno())
        with zipfile.ZipFile(pending) as check:
            if check.testzip() is not None:
                raise ValueError("The complete customer archive failed its ZIP integrity check.")
        os.link(pending, archive)
        pending.unlink()
    with zipfile.ZipFile(archive) as check:
        if sorted(check.namelist()) != members or check.read("MANIFEST.json") != (bundle / "MANIFEST.json").read_bytes():
            raise ValueError("The retained customer archive differs from this completed delivery.")
        if check.testzip() is not None:
            raise ValueError("The complete customer archive failed its ZIP integrity check.")
    result = {"stage": "COMPLETE", "operationId": OPERATION, "archive": str(archive), "bytes": archive.stat().st_size,
              "sha256": sha(archive.read_bytes()), "members": len(files) + 1, "handover": handover}
    write_json(output / "customer-handover-result.json", result)
    return result


def build(source: Path, operation: Path, output: Path, fulfillment_commit: str) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".assembly.lock").open("a") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return assemble(source, operation, output, fulfillment_commit)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Original complete verified source root")
    parser.add_argument("--operation", required=True, type=Path, help="Original completed calendar receiving output")
    parser.add_argument("--output", required=True, type=Path,
                        help="New customer delivery parent, or the same retained parent when resuming identical inputs")
    parser.add_argument("--fulfillment-commit", required=True, help="Exact published revision of this additive fulfillment program")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{40}", args.fulfillment_commit):
        parser.error("--fulfillment-commit requires a complete published Git revision")
    try:
        result = build(args.source.expanduser().resolve(strict=True), args.operation.expanduser().resolve(strict=True),
                       args.output.expanduser().resolve(), args.fulfillment_commit)
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error, zipfile.BadZipFile) as exc:
        print(json.dumps({"stage": "ERROR", "message": str(exc)}), file=sys.stderr)
        return 1
    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
