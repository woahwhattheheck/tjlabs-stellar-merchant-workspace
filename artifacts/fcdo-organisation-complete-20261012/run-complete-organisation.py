#!/usr/bin/env python3
"""MIT. Materialize and operate the complete original FCDO customer case."""
from __future__ import annotations

import argparse
import base64
import fcntl
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
    descriptor, name = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, sort_keys=True, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def immutable(path, data):
    if path.exists():
        require(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
                "The original retained customer programme differs: " + path.name)
        return
    with path.open("xb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def checkpoint_selection(case, artifacts, installed):
    key = hashlib.sha256(str(case).encode()).hexdigest()[:20]
    path = artifacts / ("FCDO_Organisation_Checkpoints_" + key + ".json")
    binding = {"operation": OPERATION, "sourceRef": SOURCE_REF,
               "capsule": installed["capsule"], "case": str(case)}
    if path.exists():
        state = json.loads(path.read_bytes())
        require(state.get("binding") == binding, "The original customer checkpoint selection differs")
    else:
        state = {"schema": "stellar-forge.customer-checkpoints.v1", "binding": binding, "stages": {}}
        write_json(path, state)
    return {"path": path, "state": state}


def publish_archive(result, save_helper):
    if not save_helper:
        return
    destination = Path(result["path"])
    attempt_path = destination.with_suffix(".save-attempt.json")
    result_path = destination.with_suffix(".save-result.json")
    if attempt_path.exists():
        print(json.dumps({"event": "EXISTING_SAVE_ATTEMPT", "archive": str(destination),
                          "attempt": str(attempt_path),
                          "result": str(result_path) if result_path.is_file() else None}), flush=True)
        return
    arguments = [sys.executable, str(save_helper), str(destination)]
    write_json(attempt_path, {"archive": {key: result[key] for key in ("bytes", "sha256")},
                             "command": arguments})
    saved = subprocess.run(arguments, text=True, capture_output=True)
    write_json(result_path, {"returncode": saved.returncode, "stdout": saved.stdout, "stderr": saved.stderr})
    print(json.dumps({"event": "CUSTOMER_SAVE_HELPER_FINISHED", "returncode": saved.returncode,
                      "archive": str(destination), "result": str(result_path)}), flush=True)


def retain_programme(case, capsule_path):
    programme = case / "receiving-programme"
    programme.mkdir(mode=0o700, exist_ok=True)
    immutable(programme / "organisation-source-capsule.json", capsule_path.read_bytes())
    launcher = Path(__file__).resolve().read_bytes()
    launcher_name = "run-complete-organisation-" + hashlib.sha256(launcher).hexdigest()[:16] + ".py"
    immutable(programme / launcher_name, launcher)
    guide = (
        "# Complete original customer programme\n\n"
        "This directory contains the complete119-file source capsule and the exact operating launcher.\n"
        "Choose separate canonical source, case and artifact directories on the receiving host, "
        "plus its actual installed Python3.11+/Expat2.6+/lxml, Node22+, Chromium and Playwright JavaScript paths.\n\n"
        "Run Python -B " + launcher_name + " --capsule organisation-source-capsule.json "
        "--source-directory /absolute/private/source --output /absolute/private/customer "
        "--artifacts /absolute/private/artifacts --node /absolute/node "
        "--chromium /absolute/chromium --playwright /absolute/playwright/index.mjs\n\n"
        "Continue an existing invocation with the same original directories. "
        "A completed original case reopens its retained complete archive without repeating native work. "
        "Select --save-helper /absolute/existing/save_archive.py when the host has an existing durable publisher. "
        "Each original saved checkpoint keeps its exact archive and publication attempt/result.\n"
    )
    immutable(programme / ("RUN-" + hashlib.sha256(launcher).hexdigest()[:16] + ".md"), guide.encode())


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


def close_archive(case, artifacts, stage, source_identity, save_helper, checkpoints):
    key = stage
    if stage == "Interrupted_Receiving":
        state_path = case / "operation-state.json"
        observed = json.loads(state_path.read_bytes()) if state_path.is_file() else {}
        observed.pop("observedAt", None)
        key += ":" + hashlib.sha256(json.dumps(observed, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    original = checkpoints["state"]["stages"].get(key)
    if original:
        destination = Path(original["path"])
        require(destination.parent == artifacts and destination.is_file() and not destination.is_symlink(),
                "The original closed customer archive is absent or aliased")
        require(identity(destination.read_bytes()) == {name: original[name] for name in ("bytes", "sha256")},
                "The original closed customer archive changed")
        print(json.dumps({"event": "CLOSED_CUSTOMER_ARCHIVE_REOPENED", **original}), flush=True)
        publish_archive(original, save_helper)
        return original
    entries = []
    descriptor, temporary_name = tempfile.mkstemp(prefix=".fcdo-closed-", suffix=".zip", dir=artifacts)
    os.close(descriptor)
    temporary = Path(temporary_name)
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted(case.rglob("*")):
            relative = path.relative_to(case)
            if not path.is_file() or path.is_symlink() or relative.parts[0] in ("connections", "temporary") or path.name in (".lock", ".receiving-launcher.lock"):
                continue
            raw = path.read_bytes()
            member = "FCDO_Organisation_Receiving_20261012/" + relative.as_posix()
            archive.writestr(zipfile.ZipInfo(member, date_time=(1980, 1, 1, 0, 0, 0)), raw, compress_type=zipfile.ZIP_DEFLATED)
            entries.append({"file": member, **identity(raw)})
        archive.writestr(zipfile.ZipInfo("DELIVERY_MANIFEST.json", date_time=(1980, 1, 1, 0, 0, 0)), json.dumps({
            "schema": "stellar-forge.closed-customer-delivery.v1", "operation": OPERATION,
            "stage": stage, "source": source_identity, "files": entries
        }, ensure_ascii=False, sort_keys=True, indent=2) + "\n")
        archive.writestr(zipfile.ZipInfo("READ_ME.txt", date_time=(1980, 1, 1, 0, 0, 0)),
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
    checkpoints["state"]["stages"][key] = result
    write_json(checkpoints["path"], checkpoints["state"])
    publish_archive(result, save_helper)
    return result


def canonical_directory(value):
    selected = Path(value).absolute()
    require(not selected.is_symlink() and selected.resolve() == selected, "Select an original canonical directory: " + str(selected))
    return selected


def operate(args, source, case, artifacts):
    artifacts.mkdir(mode=0o700, parents=True, exist_ok=True)
    temporary = case / "temporary"
    temporary.mkdir(mode=0o700, exist_ok=True)
    os.environ["TMPDIR"] = str(temporary)
    tempfile.tempdir = str(temporary)
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    capsule_path = Path(args.capsule).resolve()
    installed = materialize(capsule_path, source)
    retain_programme(case, capsule_path)
    reports = case / "reports"
    reports.mkdir(mode=0o700, exist_ok=True)
    write_json(reports / "complete-source-selection.json", installed)
    checkpoints = checkpoint_selection(case, artifacts, installed)
    save_helper = Path(args.save_helper).resolve() if args.save_helper else None
    require(save_helper is None or save_helper.is_file(), "The selected existing save helper is absent")
    state_path = case / "operation-state.json"
    state = json.loads(state_path.read_bytes()) if state_path.is_file() else {}
    if state.get("state") == "COMPLETE":
        require(state.get("operation") == OPERATION, "The completed original case has another operation identity")
        saved = close_archive(case, artifacts, "Complete_Receiving", installed, save_helper, checkpoints)
        print(json.dumps({"event": "CUSTOMER_COMPLETE_REOPENED", "operation": OPERATION,
                          "planId": state.get("planId"), "archive": saved}), flush=True)
        return 0
    node = Path(args.node).resolve()
    chromium = Path(args.chromium).resolve()
    playwright = Path(args.playwright).resolve()
    for path in (node, chromium, playwright):
        require(path.is_file(), "The selected installed runtime is absent: " + str(path))
    require(os.access(node, os.X_OK) and os.access(chromium, os.X_OK),
            "Use the actual executable Node and Chromium paths")
    os.environ["SF30_XML_NODE"] = str(node)
    iati = source / IATI_PATH
    example = iati / "examples/fcdo-organisation-2026"
    spec = importlib.util.spec_from_file_location("original_fcdo_customer", iati / "receiving/organisation.py")
    customer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(customer)
    original_prepare = customer.prepare

    def prepare_and_save(*selected):
        evidence, requests = original_prepare(*selected)
        close_archive(case, artifacts, "Closed_Preparation", installed, save_helper, checkpoints)
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
        state = json.loads(state_path.read_bytes()) if state_path.is_file() else {}
        stage = "Complete_Receiving" if state.get("state") == "COMPLETE" else "Interrupted_Receiving"
        saved = close_archive(case, artifacts, stage, installed, save_helper, checkpoints)
        print(json.dumps({"event": "CUSTOMER_FINISHED", "operation": OPERATION,
            "state": state.get("state", "INTERRUPTED"), "planId": state.get("planId"),
            "releasedRevision": state.get("releasedRevision"), "receivingRevision": state.get("receivingRevision"),
            "budgetRows": state.get("budgetRows"), "documentRows": state.get("documentRows"),
            "archive": saved, "error": failure["type"] if failure else None}), flush=True)
    return 1 if failure else 0


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
    case.mkdir(mode=0o700, parents=True, exist_ok=True)
    guard = os.open(case / ".receiving-launcher.lock",
                    os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0), 0o600)
    try:
        try:
            fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("This original customer operation is already running") from error
        os.ftruncate(guard, 0)
        os.write(guard, json.dumps({"operation": OPERATION, "pid": os.getpid(), "sourceRef": SOURCE_REF}).encode())
        os.fsync(guard)
        return operate(args, source, case, artifacts)
    finally:
        os.close(guard)


if __name__ == "__main__":
    raise SystemExit(main())
