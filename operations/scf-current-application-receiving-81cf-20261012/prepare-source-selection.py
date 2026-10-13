#!/usr/bin/env python3
"""Materialize an exact following SCF source selection from the existing publisher's full carrier."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath

OPERATION = "SCF-GRANT-CURRENT-REVIEW-81CF-20261012"
PHASE = "SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012"
DIST = "stellar-forge/developer-site/dist/"
ROLES = {"application": "application.md", "source-index": "source-index.json",
         "budget": "budget.csv", "product-and-finance": "product-and-finance.md"}

def sha(body):
    return hashlib.sha256(body).hexdigest()

def blob(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def exact_path(value):
    path = PurePosixPath(value)
    if (not value or "\\" in value or "\0" in value or path.is_absolute() or
            ".." in path.parts or str(path) != value):
        raise ValueError("Select an exact source-relative path.")
    return path

def commit(value):
    if len(value) != 40 or any(c not in "0123456789abcdef" for c in value):
        raise ValueError("Select the actual full immutable commit identity.")
    return value

def selected_bytes(path, expected):
    if not path.is_absolute() or not path.is_file():
        raise ValueError("Select an existing absolute local input: " + str(path))
    body = path.read_bytes()
    if sha(body) != expected:
        raise ValueError("The complete selected input differs: " + str(path))
    return body

def write(path, body):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("xb") as output:
        output.write(body)
    path.chmod(0o600)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-packet", type=Path, required=True)
    parser.add_argument("--source-packet-sha256", required=True)
    parser.add_argument("--source-package", type=Path, required=True)
    parser.add_argument("--source-package-sha256", required=True)
    parser.add_argument("--original-source-commit", required=True)
    parser.add_argument("--runtime-source-commit", required=True)
    parser.add_argument("--application-source-commit", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    for name in ("original_source_commit", "runtime_source_commit", "application_source_commit"):
        commit(getattr(args, name))
    if not args.output.is_absolute() or args.output.exists():
        raise ValueError("Choose an unused absolute directory for this complete publisher selection.")
    source_body = selected_bytes(args.source_packet, args.source_packet_sha256)
    package_body = selected_bytes(args.source_package, args.source_package_sha256)
    source = json.loads(source_body)
    packet = json.loads(package_body)
    if not isinstance(source.get("files"), list) or not source["files"]:
        raise ValueError("Use the original publisher's complete files/content source carrier.")
    selected = {}
    for row in source["files"]:
        name = str(exact_path(row["path"]))
        if name in selected or row.get("encoding") not in (None, "utf-8"):
            raise ValueError("Retain each complete UTF-8 source member once: " + name)
        body = row["content"].encode("utf-8")
        metadata = {"path": name, "bytes": len(body), "sha256": sha(body), "git_blob": blob(body)}
        if any(row.get(key) != metadata[key] for key in ("bytes", "sha256", "git_blob")):
            raise ValueError("The complete publisher source body differs: " + name)
        selected[name] = (metadata, body)
    received = packet.get("received", {})
    bundle = received.get("bundle", {}).get("body", {})
    files = bundle.get("files", [])
    if len(files) != 4 or {row.get("role") for row in files} != set(ROLES):
        raise ValueError("Select all four complete files in the original reviewer source package.")
    objects = {}
    for row in received.get("objects", []):
        if row["sha256"] in objects:
            raise ValueError("Retain each complete reviewer source object once.")
        objects[row["sha256"]] = row
    source_records = None
    for row in files:
        if row["name"] != ROLES[row["role"]]:
            raise ValueError("Retain the original complete reviewer file names.")
        stored = objects[row["sha256"]]
        body = base64.b64decode(stored["base64"], validate=True)
        if len(body) != row["bytes"] or len(body) != stored["bytes"] or sha(body) != row["sha256"]:
            raise ValueError("The complete selected reviewer object differs: " + row["name"])
        name = DIST + "grant-data/" + row["name"]
        if name not in selected or selected[name][1] != body:
            raise ValueError("The publisher source and selected reviewer package differ: " + name)
        if row["role"] == "source-index":
            index = json.loads(body)
            ids = [item["id"] for item in index["sources"]]
            if len(ids) != len(set(ids)):
                raise ValueError("Keep the actual complete source index with unique original source IDs.")
            source_records = len(ids)
    required = (
        DIST + "grant.html", DIST + "grant-submission.html",
        DIST + "grant-submission-workspace.mjs", DIST + "grant-submission-core.mjs",
        DIST + "grant-handover-source.mjs", DIST + "grant-review-round-core.mjs",
        DIST + "grant-review-round-workspace.mjs", DIST + "drafts.mjs",
        "stellar-forge/developer-site/grant-export.mjs",
    )
    if any(name not in selected for name in required):
        raise ValueError("Receive the publisher's full reader, editor, review and original exporter source.")
    assets = [selected[name][0] for name in sorted(selected)]
    manifest = {
        "schema": "stellar-forge.current-source-assets-selection.v1",
        "operationId": OPERATION, "phaseId": PHASE,
        "originalSourceCommit": args.original_source_commit,
        "currentRuntimeSourceCommit": args.runtime_source_commit,
        "currentApplicationSourceCommit": args.application_source_commit,
        "sourcePackage": {"bytes": len(package_body), "sha256": sha(package_body),
                          "sourceRecords": source_records},
        "readerPath": DIST + "grant.html", "assets": assets,
        "sourceCarrier": {"bytes": len(source_body), "sha256": sha(source_body),
                          "sourceCommit": source.get("sourceCommit")},
    }
    args.output.mkdir(mode=0o700)
    for name, (_, body) in selected.items():
        write(args.output / "source" / name, body)
    write(args.output / "source-package.json", package_body)
    manifest_body = encoded(manifest)
    write(args.output / "source-selection.json", manifest_body)
    result = {
        "schema": "stellar-forge.following-source-selection.v1",
        "operationId": OPERATION, "sourceFiles": len(assets),
        "sourceRecords": source_records,
        "sourceCarrier": manifest["sourceCarrier"],
        "sourcePackage": manifest["sourcePackage"],
        "sourceSelection": {"path": str(args.output / "source-selection.json"),
                            "bytes": len(manifest_body), "sha256": sha(manifest_body)},
        "sourceRoot": str(args.output / "source"),
        "readerHTML": str(args.output / "source" / manifest["readerPath"]),
    }
    write(args.output / "RESULT.json", encoded(result))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
