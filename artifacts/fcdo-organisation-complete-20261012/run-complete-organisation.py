#!/usr/bin/env python3
"""MIT. Materialize and operate the complete original FCDO customer case."""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import traceback
import zipfile

SOURCE_REF = "c479107f3fc57e0feca1714841b13ee0605be80d"
OPERATION = "fcdo-organisation-a5f3-20261012"
IATI_PATH = "stellar/scf-starforge-20261009/sf30-seller-sdk/iati"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def identity(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def write_json(path, value):
    with path.open("w", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, sort_keys=True, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def materialize(capsule_path, destination):
    capsule_bytes = capsule_path.read_bytes()
    require(len(capsule_bytes) <= 4 * 1024 * 1024, "The complete source capsule exceeds its expected size")
    capsule = json.loads(capsule_bytes)
    require(capsule.get("schema") == "stellar-forge.complete-source-capsule.v1"
            and capsule.get("sourceRef") == SOURCE_REF, "Select the original reviewed source capsule")
    payload = capsule["payload"]
    require(payload["encoding"] == "gzip+base64", "Unknown original source encoding")
    compressed = base64.b64decode(payload["content_base64"], validate=True)
    require(identity(compressed) == {key: payload[key] for key in ("bytes", "sha256")},
            "The complete compressed source changed")
    raw = gzip.decompress(compressed)
    require(len(raw) <= 8 * 1024 * 1024, "The complete decoded source exceeds its expected size")
    packet = json.loads(raw)
    require(packet.get("schema") == "stellar-forge.complete-organisation-source.v1"
            and packet.get("sourceRef") == SOURCE_REF and packet.get("operation") == OPERATION,
            "The selected original source operation differs")
    files = packet["files"]
    require(len(files) == capsule["files"] == 119, "The complete original source file set differs")
    require(sum(item["bytes"] for item in files) == capsule["sourceBytes"], "The source byte count differs")
    require(len({item["path"] for item in files}) == len(files), "A source member is duplicated")
    checked = []
    for item in files:
        name = item["path"]
        require(isinstance(name, str) and not name.startswith("/")
                and all(part not in ("", ".", "..") for part in name.split("/")),
                "Invalid original source member")
        data = item["content"].encode("utf-8")
        require(identity(data) == {key: item[key] for key in ("bytes", "sha256")},
                "An original source member changed: " + name)
        git_blob = hashlib.sha1(("blob " + str(len(data)) + "\0").encode() + data).hexdigest()
        require(git_blob == item["gitBlob"], "An original Git source identity changed: " + name)
        path = destination / name
        require(not path.is_symlink() and path.resolve() == destination / name,
                "The selected source member is aliased: " + name)
        if path.exists():
            require(path.is_file() and path.read_bytes() == data,
                    "Preserve the different existing source member: " + name)
        checked.append((path, data, {key: item[key] for key in ("path", "bytes", "sha256", "gitBlob")}))
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    for path, data, _ in checked:
        if path.exists():
            continue
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with path.open("xb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
    return {"sourceRef": SOURCE_REF, "capsule": identity(capsule_bytes),
            "files": [descriptor for _, _, descriptor in checked]}


def close_archive(case, artifacts, stage, source_identity, save_helper):
    entries = []
    descriptor, temporary_name = tempfile.mkstemp(prefix=".fcdo-closed-", suffix=".zip", dir=artifacts)
    os.close(descriptor)
    temporary = Path(temporary_name)
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(case.rglob("*")):
            relative = path.relative_to(case)
            if not path.is_file() or path.is_symlink() or relative.parts[0] in ("connections", "temporary") or path.name == ".lock":
                continue
            raw = path.read_bytes()
            member = "FCDO_Organisation_Receiving_20261012/" + relative.as_posix()
            archive.writestr(member, raw)
            entries.append({"file": member, **identity(raw)})
        archive.writestr("DELIVERY_MANIFEST.json", json.dumps({
            "schema": "stellar-forge.closed-customer-delivery.v1", "operation": OPERATION,
            "stage": stage, "source": source_identity, "files": entries
        }, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
        archive.writestr("READ_ME.txt",
            "Complete FCDO organisation planning, review and receiving.\n"
            "Open FCDO_Organisation_Receiving_20261012/delivery/organisation-report.html for the complete report.\n"
            "The original native handover is delivery/FCDO_Organisation_Planning.zip.\n"
            "The editable original sender and receiver workspaces accompany their complete histories.\n"
            "Current result: operation-state.json. Original commands, comparisons and process logs: reports/.\n"
            "Source and guide: https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/308\n")
    with zipfile.ZipFile(temporary) as archive:
        require(archive.testzip() is None, "A closed customer archive member is damaged")
    digest = identity(temporary.read_bytes())
    destination = artifacts / ("FCDO_Organisation_" + stage + "_20261012_" + digest["sha256"][:16] + ".zip")
    if destination.exists():
        require(identity(destination.read_bytes()) == digest, "The existing closed archive differs")
        temporary.unlink()
    else:
        os.rename(temporary, destination)
    result = {"stage": stage, "path": str(destination), "members": len(entries) + 2, **digest}
    write_json(destination.with_suffix(".identity.json"), result)
    print(json.dumps({"event": "CLOSED_CUSTOMER_ARCHIVE", **result}), flush=True)
    if save_helper:
        attempt_path = destination.with_suffix(".save-attempt.json")
        result_path = destination.with_suffix(".save-result.json")
        if attempt_path.exists():
            print(json.dumps({"event": "EXISTING_SAVE_ATTEMPT", "archive": str(destination),
                              "attempt": str(attempt_path), "result": str(result_path) if result_path.is_file() else None}), flush=True)
        else:
            arguments = [sys.executable, str(save_helper), str(destination)]
            write_json(attempt_path, {"archive": digest, "command": arguments})
            saved = subprocess.run(arguments, text=True, capture_output=True)
            result_path.write_text(json.dumps({"returncode": saved.returncode,
                "stdout": saved.stdout, "stderr": saved.stderr}, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps({"event": "CUSTOMER_SAVE_HELPER_FINISHED", "returncode": saved.returncode,
                              "archive": str(destination), "result": str(result_path)}), flush=True)
    return result


def canonical_directory(value):
    selected = Path(value).absolute()
    require(not selected.is_symlink() and selected.resolve() == selected, "Select an original canonical directory: " + str(selected))
    return selected


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capsule", required=True)
    parser.add_argument("--source-directory", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--artifacts", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--chromium", required=True)
    parser.add_argument("--playwright", required=True)
    parser.add_argument("--save-helper", help="Optional existing Python helper accepting one complete archive path")
    args = parser.parse_args(argv)
    os.umask(0o077)
    source = canonical_directory(args.source_directory)
    case = canonical_directory(args.output)
    artifacts = canonical_directory(args.artifacts)
    require(len({source, case, artifacts}) == 3
            and all(a not in b.parents for a in (source, case, artifacts) for b in (source, case, artifacts) if a != b),
            "Select three separate original source, customer and archive directories")
    node = Path(args.node).resolve()
    chromium = Path(args.chromium).resolve()
    playwright = Path(args.playwright).resolve()
    for path in (node, chromium, playwright):
        require(path.is_file(), "The selected installed runtime is absent: " + str(path))
    require(os.access(node, os.X_OK) and os.access(chromium, os.X_OK), "Use the actual executable Node and Chromium paths")
    save_helper = Path(args.save_helper).resolve() if args.save_helper else None
    require(save_helper is None or save_helper.is_file(), "The selected existing save helper is absent")
    case.mkdir(mode=0o700, parents=True, exist_ok=True)
    artifacts.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = case / "temporary"
    temporary.mkdir(mode=0o700, exist_ok=True)
    os.environ["TMPDIR"] = str(temporary)
    tempfile.tempdir = str(temporary)
    os.environ["SF30_XML_NODE"] = str(node)
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    installed = materialize(Path(args.capsule), source)
    iati = source / IATI_PATH
    example = iati / "examples/fcdo-organisation-2026"
    reports = case / "reports"
    reports.mkdir(mode=0o700, exist_ok=True)
    write_json(reports / "complete-source-selection.json", installed)
    spec = importlib.util.spec_from_file_location("original_fcdo_customer", iati / "receiving/organisation.py")
    customer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(customer)
    original_prepare = customer.prepare
    def prepare_and_save(*selected):
        evidence, requests = original_prepare(*selected)
        close_archive(case, artifacts, "Closed_Preparation", installed, save_helper)
        return evidence, requests
    customer.prepare = prepare_and_save
    failure = None
    try:
        customer.main(["--source", str(example / "organisation.xml"),
            "--acquisition", str(example / "publisher-receipt.json"), "--output", str(case),
            "--mcp-directory", str(source / "stellar-forge/mcp-merchant-operator"),
            "--node", str(node), "--browser-driver", str(iati / "receiving/organisation-browser.mjs"),
            "--chromium", str(chromium), "--playwright", str(playwright)])
    except BaseException as error:
        failure = {"type": type(error).__name__, "message": str(error), "traceback": traceback.format_exc()}
        write_json(reports / "native-operation-error.json", failure)
        print(json.dumps({"event": "NATIVE_OPERATION_ERROR", "error": failure}), flush=True)
    finally:
        state_path = case / "operation-state.json"
        state = json.loads(state_path.read_bytes()) if state_path.is_file() else {}
        stage = "Complete_Receiving" if state.get("state") == "COMPLETE" else "Interrupted_Receiving"
        saved = close_archive(case, artifacts, stage, installed, save_helper)
        print(json.dumps({"event": "CUSTOMER_FINISHED", "operation": OPERATION,
            "state": state.get("state", "INTERRUPTED"), "planId": state.get("planId"),
            "releasedRevision": state.get("releasedRevision"), "receivingRevision": state.get("receivingRevision"),
            "budgetRows": state.get("budgetRows"), "documentRows": state.get("documentRows"),
            "archive": saved, "error": failure["type"] if failure else None}), flush=True)
    return 1 if failure else 0


if __name__ == "__main__":
    raise SystemExit(main())
