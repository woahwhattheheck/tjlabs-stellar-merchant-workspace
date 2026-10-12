#!/usr/bin/env python3
"""Materialize and receive one complete federal funding report operation.

Uses the retained original source packet and the existing Commons GitHub caller.
Every result is banked before this foreground process exits.
"""
import argparse
import base64
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

OPERATION = "SCF-FEDERAL-FUNDING-REPORT-DELIVERY-64B7-20261012"
REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
DEFAULT_SOURCE = "c9beab7490402708976a587bcbfaff6ba161149a"
HELPER_PATH = Path("/workspace/scratch/c79fd06aedf2/scf-usage/github_ops.py")
HELPER_SHA256 = "86f055b8ff4da2ebb35fdeeba48e0f76f09b843eb2de5fd8bd7f92329c49618a"
BANK_REPOSITORY = "woahwhattheheck/commons"
BANK_BRANCH = "delivery/funding-report-native-64b7-20261012"
BANK_PREFIX = ".swarm-delivery/funding-report-native-64b7-20261012"
ACTOR = "tokenjunkielabs"


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def git_hash(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def retain(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != data:
            raise RuntimeError("Retained file changed: " + str(path))
        return
    with path.open("xb") as stream:
        os.chmod(path, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def helper():
    if sha(HELPER_PATH.read_bytes()) != HELPER_SHA256:
        raise RuntimeError("Original GitHub caller source changed")
    spec = importlib.util.spec_from_file_location("funding_report_original_github", HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", default="/dev/funding-report-native-64b7-20261012")
    parser.add_argument("--source-blob", default=DEFAULT_SOURCE)
    parser.add_argument("--source-packet")
    parser.add_argument("--restore-archive")
    parser.add_argument("--local-result", action="store_true",
                        help="Receive from a supplied complete source packet and retain the full ZIP on this host")
    args = parser.parse_args()
    if args.local_result and not args.source_packet:
        parser.error("--local-result requires the original --source-packet file")
    root = Path(args.directory).absolute()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.resolve() != root:
        raise RuntimeError("Choose the original canonical operation directory")
    os.chmod(root, 0o700)
    lock = (root / "operation.lock").open("a+b")
    os.chmod(root / "operation.lock", 0o600)
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    if args.restore_archive:
        with zipfile.ZipFile(args.restore_archive) as archive:
            for item in archive.infolist():
                part = Path(item.filename)
                if item.is_dir():
                    continue
                if part.is_absolute() or ".." in part.parts or not part.parts:
                    raise RuntimeError("Invalid original archive member")
                retain(root / part, archive.read(item))
    github = None if args.local_result else helper()

    def api(path, method="GET", data=None):
        result = github.api_response(path, method=method, data=data, actor=ACTOR)
        return result["data"]

    if not args.local_result:
        actor = api("/user")
        if actor.get("login") != ACTOR or actor.get("id") != 311286379:
            raise RuntimeError("Original secondary account identity mismatch")
        access = api("/repos/" + BANK_REPOSITORY)
        if access.get("private") is not True or access.get("permissions", {}).get("push") is not True:
            raise RuntimeError("Original private result bank permission unavailable")
    if args.source_packet:
        packet_bytes = Path(args.source_packet).read_bytes()
    else:
        body = api("/repos/" + REPOSITORY + "/git/blobs/" + args.source_blob)
        if body.get("encoding") != "base64":
            raise RuntimeError("Original Git blob encoding changed")
        packet_bytes = base64.b64decode(body["content"], validate=False)
    if git_hash(packet_bytes) != args.source_blob:
        raise RuntimeError("Complete source packet changed")
    packet = json.loads(packet_bytes)
    if packet.get("operation") != OPERATION or packet.get("schema") != "stellar-forge.funding-report-native-source.v1":
        raise RuntimeError("Original report operation selection changed")
    selection_path = root / "original-input.json"
    retain(selection_path, encoded(packet["original_input"]))
    terms_path = root / "original-public-merchant.json"
    retain(terms_path, encoded(packet["original_public_merchant"]))
    source_root = root / "source" / args.source_blob
    source_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    for record in packet["files"]:
        part = Path(record["path"])
        if part.is_absolute() or ".." in part.parts or not part.parts:
            raise RuntimeError("Invalid original source path")
        content = record["content"].encode()
        if git_hash(content) != record["git_blob"]:
            raise RuntimeError("Original module changed: " + str(part))
        retain(source_root / part, content)
    retain(root / "source-index" / (args.source_blob + ".json"), encoded({
        "operation": OPERATION, "source_blob": args.source_blob,
        "source_commit": packet["source_commit"],
        "files": [{k: r[k] for k in ("path", "git_blob")} for r in packet["files"]],
    }))
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node:
        raise RuntimeError("Original Node runtime unavailable")
    version = subprocess.run([node, "--version"], check=True, text=True, capture_output=True).stdout.strip()
    major, minor = map(int, version.lstrip("v").split(".")[:2])
    if major < 22 or major == 22 and minor < 16:
        raise RuntimeError("Original report workspace requires Node 22.16 or later")
    attempt = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    logs = root / "logs" / attempt
    logs.mkdir(parents=True, mode=0o700)
    command = [node, str(source_root / packet["entrypoint"]), "--source", str(selection_path),
               "--merchant", str(terms_path), "--out", str(root / "receiving")]
    run_record = {"operation": OPERATION, "source_blob": args.source_blob,
                  "source_commit": packet["source_commit"], "runtime": version,
                  "directory": str(root), "command": command, "attempt": attempt}
    retain(logs / "invocation.json", encoded(run_record))
    print(json.dumps({"operation": OPERATION, "phase": "source_materialized",
                      "files": len(packet["files"]), "source_blob": args.source_blob,
                      "runtime": version, "directory": str(root)}), flush=True)
    with (logs / "stdout.log").open("xb") as stdout, (logs / "stderr.log").open("xb") as stderr:
        os.chmod(logs / "stdout.log", 0o600)
        os.chmod(logs / "stderr.log", 0o600)
        result = subprocess.run(command, cwd=source_root, stdout=stdout, stderr=stderr)
    result_path = root / "receiving" / "receiving-result.json"
    native_result = json.loads(result_path.read_bytes()) if result_path.exists() else None
    run_record.update(exit_code=result.returncode, finished_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      complete=result.returncode == 0 and native_result is not None)
    retain(logs / "result.json", encoded(run_record))
    archive_path = root / ("Funding_Report_Receiving_" + attempt + ".zip")
    with zipfile.ZipFile(archive_path, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        paths = [selection_path, terms_path]
        for directory in (root / "logs", root / "receiving", root / "source-index"):
            if directory.exists():
                paths.extend(p for p in directory.rglob("*") if p.is_file() and not p.is_symlink())
        for path in sorted(set(paths)):
            if path.is_symlink():
                raise RuntimeError("Unexpected receiving file link")
            archive.write(path, path.relative_to(root).as_posix())
    os.chmod(archive_path, 0o600)
    archive_bytes = archive_path.read_bytes()
    if args.local_result:
        manifest = {**run_record, "schema": "stellar-forge.funding-report-native-bank.v1",
                    "archive": {"file": archive_path.name, "bytes": len(archive_bytes),
                                "sha256": sha(archive_bytes), "git_blob": git_hash(archive_bytes)},
                    "receiving_result": native_result}
        manifest_path = logs / "receiving.json"
        retain(manifest_path, encoded(manifest))
        print(json.dumps({"operation": OPERATION, "phase": "native_receiving_retained",
                          "exit_code": result.returncode, "complete": run_record["complete"],
                          "source_blob": args.source_blob, "archive_path": str(archive_path),
                          "manifest_path": str(manifest_path), "archive_bytes": len(archive_bytes),
                          "archive_sha256": sha(archive_bytes),
                          "native_error": (logs / "stderr.log").read_text()[-8000:] if result.returncode else None}), flush=True)
        return result.returncode
    zip_blob = api("/repos/" + BANK_REPOSITORY + "/git/blobs", "POST",
                   {"encoding": "base64", "content": base64.b64encode(archive_bytes).decode()})
    if zip_blob.get("sha") != git_hash(archive_bytes):
        raise RuntimeError("Original result archive publication mismatch")
    manifest = {**run_record, "schema": "stellar-forge.funding-report-native-bank.v1",
                "archive": {"file": archive_path.name, "bytes": len(archive_bytes),
                            "sha256": sha(archive_bytes), "git_blob": zip_blob["sha"]},
                "receiving_result": native_result}
    manifest_data = encoded(manifest)
    manifest_blob = api("/repos/" + BANK_REPOSITORY + "/git/blobs", "POST",
                        {"encoding": "base64", "content": base64.b64encode(manifest_data).decode()})
    if manifest_blob.get("sha") != git_hash(manifest_data):
        raise RuntimeError("Original result manifest publication mismatch")
    # Keep the existing operation branch if this is a source repair/continuation.
    refs = api("/repos/" + BANK_REPOSITORY + "/git/matching-refs/heads/" + BANK_BRANCH)
    matches = [ref for ref in refs if ref["ref"] == "refs/heads/" + BANK_BRANCH]
    if len(matches) > 1:
        raise RuntimeError("Original receiving branch selection is ambiguous")
    existing = bool(matches)
    parent = matches[0]["object"]["sha"] if existing else api("/repos/" + BANK_REPOSITORY + "/git/ref/heads/main")["object"]["sha"]
    parent_tree = api("/repos/" + BANK_REPOSITORY + "/git/commits/" + parent)["tree"]["sha"]
    entries = [
        {"path": BANK_PREFIX + "/" + archive_path.name, "mode": "100644", "type": "blob", "sha": zip_blob["sha"]},
        {"path": BANK_PREFIX + "/attempts/" + attempt + ".json", "mode": "100644", "type": "blob", "sha": manifest_blob["sha"]},
        {"path": BANK_PREFIX + "/current.json", "mode": "100644", "type": "blob", "sha": manifest_blob["sha"]},
    ]
    tree = api("/repos/" + BANK_REPOSITORY + "/git/trees", "POST", {"base_tree": parent_tree, "tree": entries})
    commit = api("/repos/" + BANK_REPOSITORY + "/git/commits", "POST",
                 {"message": "Receive complete federal funding report native operation", "tree": tree["sha"], "parents": [parent]})
    if existing:
        current = api("/repos/" + BANK_REPOSITORY + "/git/ref/heads/" + BANK_BRANCH)["object"]["sha"]
        if current != parent:
            raise RuntimeError("Original receiving branch advanced; retain this completed commit " + commit["sha"])
        api("/repos/" + BANK_REPOSITORY + "/git/refs/heads/" + BANK_BRANCH, "PATCH",
            {"sha": commit["sha"], "force": False})
    else:
        api("/repos/" + BANK_REPOSITORY + "/git/refs", "POST",
            {"ref": "refs/heads/" + BANK_BRANCH, "sha": commit["sha"]})
    final = api("/repos/" + BANK_REPOSITORY + "/git/ref/heads/" + BANK_BRANCH)
    if final["object"]["sha"] != commit["sha"]:
        raise RuntimeError("Original receiving branch readback changed")
    print(json.dumps({"operation": OPERATION, "phase": "native_receiving_banked",
                      "exit_code": result.returncode, "complete": run_record["complete"],
                      "source_blob": args.source_blob, "commit": commit["sha"],
                      "archive_blob": zip_blob["sha"], "manifest_blob": manifest_blob["sha"],
                      "archive_bytes": len(archive_bytes), "archive_sha256": sha(archive_bytes),
                      "result_url": "https://github.com/" + BANK_REPOSITORY + "/blob/" + commit["sha"] + "/" + BANK_PREFIX + "/current.json",
                      "native_error": (logs / "stderr.log").read_text()[-8000:] if result.returncode else None}), flush=True)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
