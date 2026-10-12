#!/usr/bin/env python3
"""Receive the complete PR407 Research/RIS source and its original HTTP carrier.

This installs exact selected files through the unchanged original Research
receiver. It does not start the customer programme, acquire data or alter a
previously selected native operation.
"""
import argparse
import base64
import binascii
import fcntl
import hashlib
import json
import os
import stat
import sys
import types
from pathlib import Path

HELPER_SHA256 = "90d60e55d1838215c7252cc2a79db5ad8509bf01b44bbbbe79af1dc98fa3635f"
EXPECTED = {
    "schema": "sf88.research-ris.native-source.v1",
    "operation": "SYMMETRON-RESEARCH-SOURCE-RECEIVING-20261012",
    "repository": "woahwhattheheck/tjlabs-stellar-merchant-workspace",
    "sourceMerge": "33b3375dc168304a5026be21bfb0d2b1c149f084",
    "bytes": 22356044,
    "sha256": "9d2f4d9154e4fc9d7060cd8861d609db192a6fc1416c4685fe33bba573504ce4",
    "sourceFiles": 1444,
    "sourceBytes": 20803604,
    "manifestBytes": 439463,
    "manifestSha256": "6bdb7cfb12e6701a7341ec7dd0da4f5ef1d2318294fd41b7be82483b099d8d77",
}
INPUT_PATH = "original-inputs/original-ris-http-responses.json"
INPUT_BYTES = 6578
INPUT_SHA256 = "a468739354d5b543712b583226f934dc63bbba29769d2c327df4c54876174413"
ENTRY = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/ris-source/native.mjs"
MARKER = ".ris-source-materialization.json"
LOCK = ".ris-source-materialization.lock"
DESCRIPTOR_KEYS = ("path", "gitBlobSha", "bytes", "sha256", "mode")


def helper_module():
    """Execute only the already verified original helper body, without its CLI."""
    path = Path(__file__).absolute().with_name("materialize-europe-pmc-source.py")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise ValueError("Original source receiver must be an ordinary file.")
        raw = stream.read()
    if len(raw) != 8419 or hashlib.sha256(raw).hexdigest() != HELPER_SHA256:
        raise ValueError("The unchanged original source receiver differs.")
    module = types.ModuleType("original_research_source_receiver")
    module.__file__ = str(path)
    exec(compile(raw, str(path), "exec"), module.__dict__)
    return module


def member_bytes(row, need):
    need(isinstance(row, dict), "A complete selected source row is required.")
    content = row.get("content")
    need(isinstance(content, str), "Complete selected member content is required.")
    encoding = row.get("encoding", "utf-8")
    need(encoding in ("utf-8", "base64"), "Unsupported selected member encoding.")
    if encoding == "utf-8":
        return content.encode("utf-8")
    try:
        body = base64.b64decode(content.encode("ascii"), validate=True)
    except (UnicodeEncodeError, binascii.Error) as error:
        raise ValueError("Complete canonical Base64 source is required.") from error
    need(base64.b64encode(body).decode("ascii") == content,
         "Complete canonical Base64 source is required.")
    return body


def descriptor(row):
    return {key: row[key] for key in DESCRIPTOR_KEYS}


def checked_envelope(path, receiver):
    need, digest = receiver.need, receiver.digest
    need(path.is_absolute() and ".." not in path.parts,
         "Use an absolute canonical envelope path.")
    raw = receiver.ordinary(path)
    need(len(raw) == EXPECTED["bytes"] and digest(raw) == EXPECTED["sha256"],
         "The complete selected source envelope differs.")
    value = json.loads(raw)
    need(isinstance(value, dict), "The selected source envelope is required.")
    for field in ("schema", "operation", "repository", "sourceMerge",
                  "sourceFiles", "sourceBytes"):
        need(value.get(field) == EXPECTED[field], "Source " + field + " differs.")
    files, inputs = value.get("files"), value.get("inputs")
    need(isinstance(files, list) and len(files) == EXPECTED["sourceFiles"],
         "The complete current source inventory is required.")
    need(isinstance(inputs, list) and len(inputs) == value.get("inputFiles") == 1
         and value.get("inputBytes") == INPUT_BYTES,
         "The one original two-response HTTP carrier is required.")
    selected, seen, total = [], set(), 0
    for category, rows in (("source", files), ("input", inputs)):
        for row in rows:
            need(isinstance(row, dict), "A selected source descriptor is required.")
            name = str(receiver.relative(row.get("path")))
            need(name not in seen and name not in (MARKER, LOCK, "ENGINE_SOURCE.json"),
                 "Duplicate or reserved selected member: " + name)
            seen.add(name)
            need(row.get("mode") in ("100644", "100755"),
                 "Unsupported original source mode: " + name)
            need(type(row.get("bytes")) is int and row["bytes"] >= 0,
                 "Selected member byte length is required: " + name)
            body = member_bytes(row, need)
            need(len(body) == row["bytes"] and digest(body) == row.get("sha256"),
                 "Selected member length or SHA256 differs: " + name)
            git_blob = hashlib.sha1(
                b"blob " + str(len(body)).encode("ascii") + b"\0" + body
            ).hexdigest()
            need(git_blob == row.get("gitBlobSha"),
                 "Original Git blob differs: " + name)
            selected.append((category, row, body))
            if category == "source":
                total += len(body)
    names = [row["path"] for row in files]
    need(names == sorted(names) and total == EXPECTED["sourceBytes"],
         "The canonical complete source order or byte total differs.")
    need(value.get("entry") == ENTRY and ENTRY in names and "LICENSE" in names,
         "The original native entry or repository license is absent.")
    need(inputs[0]["path"] == INPUT_PATH
         and inputs[0].get("role") == "originalResponses"
         and inputs[0]["bytes"] == INPUT_BYTES
         and inputs[0]["sha256"] == INPUT_SHA256,
         "The original Crossref HTTP carrier differs.")
    metadata = value.get("engineManifest")
    need(isinstance(metadata, dict) and metadata.get("path") == "ENGINE_SOURCE.json"
         and isinstance(metadata.get("content"), str),
         "The complete native engine manifest is required.")
    manifest_body = metadata["content"].encode("utf-8")
    need(len(manifest_body) == metadata.get("bytes") == EXPECTED["manifestBytes"]
         and digest(manifest_body) == metadata.get("sha256") == EXPECTED["manifestSha256"],
         "The selected engine manifest differs.")
    manifest = json.loads(manifest_body)
    need(isinstance(manifest, dict)
         and manifest.get("schema") == "sf88-research-ris-engine-source-v1"
         and manifest.get("repository") == value["repository"]
         and manifest.get("ref") == value["sourceMerge"]
         and manifest.get("sourceCohort") == value.get("sourceCohort")
         and manifest.get("sourceFiles") == len(files)
         and manifest.get("sourceBytes") == total
         and manifest.get("files") == [descriptor(row) for row in files],
         "The native engine manifest must select every exact source member.")
    return value, selected, manifest_body


def canonical_json(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def make_selection(args, root, receiver):
    values = (args.selection, args.run_directory, args.node, args.python,
              args.playwright_module, args.chromium_executable)
    if all(value is None for value in values):
        return None, None
    receiver.need(all(value is not None for value in values),
                  "Supply selection, run directory and all four actual runtime paths together.")
    for path in values:
        receiver.need(path.is_absolute() and ".." not in path.parts,
                      "Use absolute canonical selected runtime and output paths.")
    receiver.need(args.selection != root / MARKER and args.selection != root / LOCK
                  and args.selection != root / "ENGINE_SOURCE.json"
                  and not args.selection.is_relative_to(root),
                  "Keep the private native selection outside the source root.")
    receiver.need(not args.run_directory.is_relative_to(root)
                  and not root.is_relative_to(args.run_directory),
                  "Keep the private native run and source directories separate.")
    receiver.need(0 <= args.port <= 65535, "A valid initial listener port is required.")
    for name, path in (("Node", args.node), ("Python", args.python),
                       ("Chromium", args.chromium_executable)):
        # Real runtime installations may expose their executable through a symlink.
        # Resolve only these explicitly selected executable paths; source writes
        # still use the original no-symlink receiver.
        receiver.need(path.is_file() and os.access(path, os.X_OK),
                      name + " must be the actual selected executable.")
    receiver.need(args.playwright_module.is_file(),
                  "Playwright must name the actual selected module file.")
    value = {
        "schema": "sf88-research-ris-native-selection-v1",
        "operationId": EXPECTED["operation"],
        "runDirectory": str(args.run_directory),
        "engine": {
            "root": str(root),
            "manifest": {"file": str(root / "ENGINE_SOURCE.json"),
                         "bytes": EXPECTED["manifestBytes"],
                         "sha256": EXPECTED["manifestSha256"]},
        },
        "originalResponses": {"file": str(root / INPUT_PATH),
                              "bytes": INPUT_BYTES, "sha256": INPUT_SHA256},
        "runtime": {"node": str(args.node), "python": str(args.python),
                    "playwrightModule": str(args.playwright_module),
                    "chromiumExecutable": str(args.chromium_executable)},
        "port": args.port,
    }
    return value, canonical_json(value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-envelope", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--run-directory", type=Path)
    parser.add_argument("--node", type=Path)
    parser.add_argument("--python", type=Path)
    parser.add_argument("--playwright-module", type=Path)
    parser.add_argument("--chromium-executable", type=Path)
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()
    receiver = helper_module()
    need, ordinary, digest = receiver.need, receiver.ordinary, receiver.digest
    need(sys.version_info >= (3, 11), "Python 3.11 or later is required.")
    envelope, selected, manifest_body = checked_envelope(args.source_envelope, receiver)
    # Full envelope/member/engine/input checks above precede any selected write.
    root = receiver.directory(args.directory)
    selection, selection_body = make_selection(args, root, receiver)
    marker = {
        "schema": "sf88.research-ris.source-materialization.v1",
        "operation": EXPECTED["operation"],
        "sourceEnvelope": {"bytes": EXPECTED["bytes"], "sha256": EXPECTED["sha256"]},
        "repository": EXPECTED["repository"], "sourceMerge": EXPECTED["sourceMerge"],
        "sourceCohort": envelope["sourceCohort"],
        "sourceFiles": EXPECTED["sourceFiles"], "sourceBytes": EXPECTED["sourceBytes"],
        "inputFiles": 1, "inputBytes": INPUT_BYTES,
        "directory": str(root), "entry": str(root / ENTRY),
        "engineManifest": {"file": str(root / "ENGINE_SOURCE.json"),
                           "bytes": EXPECTED["manifestBytes"],
                           "sha256": EXPECTED["manifestSha256"]},
        "originalResponses": {"file": str(root / INPUT_PATH),
                              "bytes": INPUT_BYTES, "sha256": INPUT_SHA256},
        "runtimeRequirements": envelope["runtimeRequirements"],
        "members": [descriptor(row) for _, row, _ in selected],
    }
    marker_body = canonical_json(marker)
    lock_fd = os.open(root / LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        need(stat.S_ISREG(os.fstat(lock_fd).st_mode), "The original materialization lock must be ordinary.")
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        for name in (".citation-source-materialization.json",
                     ".citation-python-source-materialization.json",
                     ".europe-pmc-source-materialization.json",
                     ".study-extraction-source-materialization.json"):
            need(not ((root / name).exists() or (root / name).is_symlink()),
                 "Use a separate current RIS source directory; preserve earlier programmes.")
        if (root / MARKER).exists() or (root / MARKER).is_symlink():
            need(ordinary(root / MARKER) == marker_body,
                 "This directory already selects another complete source operation.")
        # A changed native selection is rejected before any selected file write.
        if args.selection and (args.selection.exists() or args.selection.is_symlink()):
            need(ordinary(args.selection) == selection_body,
                 "The saved native selection differs; retain its original operation.")
        counts = {"written": 0, "reused": 0}
        for _, row, body in selected:
            counts[receiver.retain(root / row["path"], body, row["mode"] == "100755")] += 1
        receiver.retain(root / "ENGINE_SOURCE.json", manifest_body)
        for _, row, body in selected:
            need(ordinary(root / row["path"]) == body,
                 "Final selected member readback differs: " + row["path"])
        need(ordinary(root / "ENGINE_SOURCE.json") == manifest_body,
             "Final engine manifest readback differs.")
        receiver.retain(root / MARKER, marker_body)
        need(ordinary(root / MARKER) == marker_body, "Final source receipt readback differs.")
        if selection_body is not None:
            receiver.retain(args.selection, selection_body)
            need(ordinary(args.selection) == selection_body, "Final native selection readback differs.")
        print(json.dumps({
            "schema": marker["schema"], "state": "COMPLETE",
            "operation": EXPECTED["operation"], **counts,
            "sourceFiles": EXPECTED["sourceFiles"], "sourceBytes": EXPECTED["sourceBytes"],
            "inputFiles": 1, "inputBytes": INPUT_BYTES,
            "sourceEnvelopeSha256": EXPECTED["sha256"],
            "sourceMerge": EXPECTED["sourceMerge"],
            "directory": str(root), "entry": str(root / ENTRY),
            "engineManifest": marker["engineManifest"],
            "originalResponses": marker["originalResponses"],
            "manifest": str(root / MARKER), "manifestSha256": digest(marker_body),
            "selection": str(args.selection) if args.selection else None,
            "selectionSha256": digest(selection_body) if selection_body is not None else None,
            "nativeStarted": False,
        }, sort_keys=True))
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": "RIS_SOURCE_RECEIVING_FAILED", "message": str(error)}),
              file=sys.stderr)
        sys.exit(1)
