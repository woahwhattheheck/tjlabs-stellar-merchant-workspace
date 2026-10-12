#!/usr/bin/env python3
"""Deliver a complete editable SCF planning workspace with its exact source."""
from __future__ import annotations

import argparse
import fcntl
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import zipfile

from build_customer_handover import DIRECTORY, LICENSE_BLOB, git_blob, safe_relative, sha, verified_source, write_json
from select_source import PLANNING_FULFILLMENT

SCHEMA = "stellar-forge.scf-planning-customer-manifest.v1"
ARCHIVE = "SCF_Editable_Planning_Customer_Handover.zip"
FAMILY = "stellar/scf_2026/sf47_budget_model"


def publish(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(path.name + ".pending")
    with pending.open("wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(pending, path)


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def checked_archive(archive: Path, bundle: Path) -> dict:
    manifest = json.loads((bundle / "MANIFEST.json").read_text())
    files = manifest["files"]
    members = [row["path"] for row in files] + ["MANIFEST.json"]
    if len(members) != len(set(members)):
        raise ValueError("The retained customer manifest contains duplicate members.")
    with zipfile.ZipFile(archive) as received:
        if sorted(received.namelist()) != sorted(members) or received.testzip() is not None:
            raise ValueError("The retained complete customer ZIP differs from its original manifest.")
        if received.read("MANIFEST.json") != (bundle / "MANIFEST.json").read_bytes():
            raise ValueError("The retained ZIP manifest differs from its completed bundle.")
        for row in files:
            raw = received.read(row["path"])
            if len(raw) != row["bytes"] or sha(raw) != row["sha256"]:
                raise ValueError("A retained customer ZIP member differs: " + row["path"])
        handover = json.loads(received.read("HANDOVER.json"))
    return {"stage": "COMPLETE", "archive": str(archive), "bytes": archive.stat().st_size,
            "sha256": sha(archive.read_bytes()), "members": len(members),
            "handover": handover}


def verify_collection(raw, workspace, read_collection) -> None:
    manifest, bundles = read_collection(raw)
    native = {row["id"]: workspace.read(row["id"]) for row in workspace.list()}
    if {row["id"] for row in manifest["plans"]} != set(native):
        raise ValueError("The retained native collection contains different plans.")
    for row, data in bundles:
        current = native[row["id"]]
        if row["revision"] != current["revision"] or row["contentSha256"] != current["contentSha256"]:
            raise ValueError("The retained native collection contains a different saved revision.")
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            document = json.loads(bundle.read("workspace.json"))
            revisions = [workspace.read(row["id"], item["revision"])
                         for item in reversed(workspace.history(row["id"]))]
            if document["revisions"] != revisions or sha(bundle.read("original-source.json")) != current["source"]["sha256"]:
                raise ValueError("The retained collection differs from the native source or full history.")
            index = json.loads(bundle.read("MANIFEST.json"))
            if set(bundle.namelist()) != {"MANIFEST.json", *(item["path"] for item in index["files"])}:
                raise ValueError("The native plan bundle has unexpected members.")
            for item in index["files"]:
                member = bundle.read(item["path"])
                if len(member) != item["bytes"] or sha(member) != item["sha256"]:
                    raise ValueError("A retained native plan member differs from its original digest.")


def assemble(source: Path, workspace_path: Path, programme_path: Path, output: Path, fulfillment_commit: str) -> dict:
    selected = verified_source(source)
    provenance = json.loads((source / "FULFILLMENT_SOURCE.json").read_text())
    expected = {DIRECTORY + "/" + name for name in PLANNING_FULFILLMENT}
    if (provenance.get("commit") != fulfillment_commit or provenance.get("repository") != selected["repository"]
            or len(provenance.get("files", [])) != len(expected)
            or {row["path"] for row in provenance["files"]} != expected):
        raise ValueError("Receive the complete published planning profile and exact fulfillment revision.")
    for row in provenance["files"]:
        raw = (source / safe_relative(row["path"])).read_bytes()
        if len(raw) != row["bytes"] or sha(raw) != row["sha256"] or git_blob(raw) != row["gitBlob"]:
            raise ValueError("The received published fulfillment source differs: " + row["path"])
    license_raw = (source / "LICENSE").read_bytes()
    if git_blob(license_raw) != LICENSE_BLOB:
        raise ValueError("The original application license differs from its selected Git source.")
    programme = json.loads(programme_path.read_text())
    if programme.get("stage") != "PASSED" or programme.get("sourceCommit") != selected["commit"]:
        raise ValueError("Use the completed native planning programme from the same original application.")
    export_names = {"original-plan-history.zip": "completeOriginalPlanExportSha256",
                    "independent-customer-plan.zip": "independentCustomerExportSha256"}
    exports = {}
    for name, field in export_names.items():
        raw = (programme_path.parent / name).read_bytes()
        if sha(raw) != programme.get(field):
            raise ValueError("The original native planning export differs: " + name)
        exports[name] = raw
    if not (workspace_path / "planning.sqlite3").is_file():
        raise ValueError("Choose the existing operated native planning workspace.")
    sys.path.insert(0, str(source / FAMILY / "workspace"))
    from model import Workspace
    from cli import collection_export, read_collection
    workspace = Workspace(workspace_path, source / FAMILY / "sf10_current_candidate.json")
    try:
        if workspace.db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("The native planning database failed its integrity check.")
        if workspace.db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("The native planning database contains invalid references.")
        current = {row["id"]: workspace.read(row["id"]) for row in workspace.list()}
        for identifier in (programme["originalPlanId"], programme["independentPlanId"]):
            if identifier not in current:
                raise ValueError("The operated planning project is missing its retained native plan.")
        source_blobs = {pid: sha(bytes(raw)) for pid, raw in workspace.db.execute("SELECT id,source_bytes FROM plans")}
        for identifier, digest in programme["retainedSourceBlobs"].items():
            if source_blobs.get(identifier) != digest or current[identifier]["source"]["sha256"] != digest:
                raise ValueError("A retained original source BLOB differs from the planning programme.")
        if current[programme["independentPlanId"]]["revision"] < programme["restoredCustomerPlanRevisions"]:
            raise ValueError("Retain the original independently edited customer history.")
        native_digest = sha("\n".join(workspace.db.iterdump()).encode())
        identity = {"schema": "stellar-forge.scf-planning-fulfillment-input.v1",
                    "sourceSelectionSha256": sha((source / "SOURCE_SELECTION.json").read_bytes()),
                    "fulfillmentSourceSha256": sha((source / "FULFILLMENT_SOURCE.json").read_bytes()),
                    "fulfillmentCommit": fulfillment_commit, "nativeStateSha256": native_digest,
                    "programmeSha256": sha(programme_path.read_bytes()),
                    "nativeExports": {name: sha(raw) for name, raw in exports.items()},
                    "licenseGitBlob": LICENSE_BLOB}
        retained = output / "ASSEMBLY.json"
        if retained.exists():
            if json.loads(retained.read_text()) != identity:
                raise ValueError("This delivery belongs to different native inputs; choose a new output parent.")
        else:
            if (output / "bundle").exists() or (output / ARCHIVE).exists():
                raise ValueError("Choose a new delivery parent; existing files have no retained input identity.")
            write_json(retained, identity)
        bundle = output / "bundle"
        archive = output / ARCHIVE
        if archive.exists():
            result = checked_archive(archive, bundle)
            write_json(output / "customer-handover-result.json", result)
            return result
        bundle.mkdir(mode=0o700, exist_ok=True)
        roles = {}

        def put(relative, raw, role):
            publish(bundle / safe_relative(relative), raw)
            roles[relative] = role

        for row in selected["files"]:
            put("application/" + row["path"], (source / row["path"]).read_bytes(), "operated-application")
        for row in provenance["files"]:
            put("application/" + row["path"], (source / row["path"]).read_bytes(), "fulfillment-program")
        for name in ("SOURCE_SELECTION.json", "FULFILLMENT_SOURCE.json"):
            put("application/" + name, (source / name).read_bytes(), "source-selection")
        put("LICENSE", license_raw, "application-license")
        put("application/LICENSE", license_raw, "application-license")
        put("START_HERE.md", (source / DIRECTORY / "PLAN_HANDOVER.md").read_bytes(), "first-opening")
        put("restore_workspace.py", (source / DIRECTORY / "restore_workspace.py").read_bytes(), "restore-command")
        backup = bundle / "native/planning-workspace.sqlite3"
        backup.parent.mkdir(parents=True, exist_ok=True)
        pending = backup.with_name(backup.name + ".pending")
        pending.unlink(missing_ok=True)
        with sqlite3.connect(pending) as target:
            workspace.db.backup(target)
            if target.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("The completed SQLite backup failed its integrity check.")
        with pending.open("rb") as handle:
            os.fsync(handle.fileno())
        os.chmod(pending, 0o600)
        os.replace(pending, backup)
        roles["native/planning-workspace.sqlite3"] = "native-state"
        collection_path = bundle / "results/all-plans.zip"
        if collection_path.exists():
            collection_raw = collection_path.read_bytes()
        else:
            collection_raw, _ = collection_export(workspace)
        verify_collection(collection_raw, workspace, read_collection)
        put("results/all-plans.zip", collection_raw, "native-complete-collection")
        for name, raw in exports.items():
            put("results/" + name, raw, "native-retained-plan-history")
        plans = [{"id": item["id"], "name": item["name"], "revision": item["revision"],
                  "revisionCount": len(workspace.history(item["id"])), "awardRequestUSD": item["scenario"]["award_request_usd"],
                  "contentSha256": item["contentSha256"], "source": item["source"]}
                 for item in current.values()]
        put("results/current-plans.json", json_bytes({"plans": plans}), "native-current-plans")
        put("receiving/planning-result.json", programme_path.read_bytes(), "native-receiving-evidence")
        counts = {name: workspace.db.execute("SELECT COUNT(*) FROM " + name).fetchone()[0]
                  for name in ("plans", "revisions", "requests")}
        handover = {"schema": "stellar-forge.scf-planning-customer-handover.v1", "operation": "original-source-planning-restore",
                    "operatedApplication": {"repository": selected["repository"], "commit": selected["commit"],
                                            "files": len(selected["files"]), "bytes": sum(row["bytes"] for row in selected["files"])},
                    "fulfillmentSource": {"repository": provenance["repository"], "commit": fulfillment_commit,
                                          "files": len(provenance["files"])},
                    "workspaceBackup": "native/planning-workspace.sqlite3", "nativeCounts": counts,
                    "plans": plans, "originalPlanId": programme["originalPlanId"],
                    "independentPlanId": programme["independentPlanId"], "retainedSourceBlobs": source_blobs,
                    "nativeStateSha256": native_digest, "platform": "Linux", "python": "Python3.12",
                    "applicationLicense": {"file": "LICENSE", "originalCommit": selected["commit"],
                                           "sha256": sha(license_raw), "gitBlob": git_blob(license_raw)}}
        put("HANDOVER.json", json_bytes(handover), "customer-handover")
        rows = [{"path": relative, "bytes": (bundle / relative).stat().st_size,
                 "sha256": sha((bundle / relative).read_bytes()), "role": roles[relative]} for relative in sorted(roles)]
        write_json(bundle / "MANIFEST.json", {"schema": SCHEMA, "operatedSourceCommit": selected["commit"],
                   "fulfillmentSourceCommit": fulfillment_commit, "files": rows})
        pending_archive = archive.with_name(archive.name + ".pending")
        with zipfile.ZipFile(pending_archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as target:
            for relative in sorted([*roles, "MANIFEST.json"]):
                target.write(bundle / relative, relative)
        with pending_archive.open("rb") as handle:
            os.fsync(handle.fileno())
        checked_archive(pending_archive, bundle)
        os.link(pending_archive, archive)
        pending_archive.unlink()
        result = checked_archive(archive, bundle)
        write_json(output / "customer-handover-result.json", result)
        return result
    finally:
        workspace.close()


def build(source: Path, workspace: Path, programme: Path, output: Path, fulfillment_commit: str) -> dict:
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (output / ".assembly.lock").open("a") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return assemble(source, workspace, programme, output, fulfillment_commit)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Verified joined source received with --profile planning")
    parser.add_argument("--workspace", required=True, type=Path, help="Existing independently editable native planning workspace")
    parser.add_argument("--programme", required=True, type=Path, help="Completed original-source planning result with its sibling native ZIP exports")
    parser.add_argument("--output", required=True, type=Path, help="New delivery parent, or identical-input recovery parent")
    parser.add_argument("--fulfillment-commit", required=True, help="Complete published Git revision of all six fulfillment leaves")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{40}", args.fulfillment_commit):
        parser.error("--fulfillment-commit requires a complete published Git revision")
    try:
        result = build(args.source.expanduser().resolve(strict=True), args.workspace.expanduser().resolve(strict=True),
                       args.programme.expanduser().resolve(strict=True), args.output.expanduser().resolve(), args.fulfillment_commit)
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error, zipfile.BadZipFile) as error:
        print(json.dumps({"stage": "ERROR", "message": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
