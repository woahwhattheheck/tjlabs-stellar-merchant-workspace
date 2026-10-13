#!/usr/bin/env python3
"""Compose complete customer entrypoint source onto its exact accepted Python baseline."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile

PACKET_SHA256 = "9e05aa4e7c78d3c473ef91c92589ebf066c6870fd279290c1917057acfafb323"
PREFIX = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/"
OPERATION = "SCF-CUSTOMER-RECEIVE-ENTRYPOINTS-90ED-20261012"


def identity(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def read_file(path):
    if path.is_symlink() or path.resolve() != path:
        raise ValueError("Canonical regular source required: " + str(path))
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("Regular source required: " + str(path))
        raw = stream.read()
        after = os.fstat(stream.fileno())
    if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
        raise ValueError("Source changed while reading: " + str(path))
    return raw, before.st_mode & 0o777


def relative(value):
    if not isinstance(value, str):
        raise ValueError("Source path must be text")
    path = PurePosixPath(value)
    if not value or str(path) != value or path.is_absolute() or ".." in path.parts or "\\" in value:
        raise ValueError("Invalid source path: " + value)
    return value


def checked_identity(value):
    if (not isinstance(value, dict) or type(value.get("bytes")) is not int or value["bytes"] < 0
            or not isinstance(value.get("sha256"), str) or len(value["sha256"]) != 64
            or any(c not in "0123456789abcdef" for c in value["sha256"])):
        raise ValueError("Source requires exact byte count and SHA-256")
    return {"bytes": value["bytes"], "sha256": value["sha256"]}


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def staged_file(path, raw, mode=0o644):
    if not path.parent.is_dir() or path.parent.resolve() != path.parent:
        raise ValueError("Existing canonical source parent required: " + str(path.parent))
    fd, name = tempfile.mkstemp(prefix=".review-entrypoints-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fchmod(stream.fileno(), mode)
            os.fsync(stream.fileno())
        return Path(name)
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise


def matching_output(path, output):
    old = json.loads(read_file(path)[0])
    old_meta, new_meta = old.get("customerEntrypoints", {}), output["customerEntrypoints"]
    if (old.get("files") != output["files"] or
            {k: v for k, v in old_meta.items() if k != "variants"} !=
            {k: v for k, v in new_meta.items() if k != "variants"} or
            {k: v for k, v in old.items() if k != "customerEntrypoints"} !=
            {k: v for k, v in output.items() if k != "customerEntrypoints"}):
        raise ValueError("Different output source selection already exists")


def apply(checkout, source_manifest, output_manifest, packet_path):
    checkout = checkout.resolve(strict=True)
    source_manifest = source_manifest.resolve(strict=True)
    if not output_manifest.is_absolute() or output_manifest == source_manifest:
        raise ValueError("A distinct absolute output source manifest is required")
    if not output_manifest.parent.is_dir() or output_manifest.parent.resolve() != output_manifest.parent:
        raise ValueError("Existing canonical output directory required")
    packet_raw, _ = read_file(packet_path.resolve(strict=True))
    if hashlib.sha256(packet_raw).hexdigest() != PACKET_SHA256:
        raise ValueError("Customer entrypoint source packet changed")
    packet = json.loads(packet_raw)
    if packet.get("schema") != "commons.scf-customer-entrypoints.v2" or packet.get("operation_id") != OPERATION:
        raise ValueError("Different customer entrypoint operation")
    rows = packet["files"]
    if len(rows) != 12:
        raise ValueError("The complete twelve-file source is required")
    candidates, postimages = {}, {}
    for row in [*rows, *packet.get("variants", [])]:
        name = relative(row["path"])
        if not name.startswith(PREFIX):
            raise ValueError("Source outside the customer entrypoint paths")
        raw = row["content"].encode("utf-8")
        expected = checked_identity(row)
        if identity(raw) != expected:
            raise ValueError("Changed complete postimage: " + name)
        preimage = None if row["preimage"] is None else checked_identity(row["preimage"])
        candidates.setdefault(name, []).append((preimage, expected, raw, row.get("variant", "current-main")))
        postimages.setdefault(name, []).append(expected)
    if len(candidates) != 12 or len({row["path"] for row in rows}) != 12:
        raise ValueError("Source paths are repeated or incomplete")
    selected_raw, _ = read_file(source_manifest)
    selection = json.loads(selected_raw)
    selected = {}
    for row in selection["files"]:
        name = relative(row["path"])
        if name in selected:
            raise ValueError("Duplicate selected source: " + name)
        checked_identity(row)
        selected[name] = row
    # Every prior selected file must still match its original bytes, or one exact
    # postimage from this same operation after an interrupted prior application.
    for name, row in selected.items():
        actual = identity(read_file(checkout / name)[0])
        if actual != checked_identity(row) and actual not in postimages.get(name, []):
            raise ValueError("Selected source changed: " + name)
    changes, results = [], {}
    for name, choices in candidates.items():
        path = checkout / name
        exists = path.exists() or path.is_symlink()
        raw, mode = read_file(path) if exists else (None, 0o644)
        actual = identity(raw) if raw is not None else None
        if exists and name not in selected and actual not in postimages[name]:
            raise ValueError("Unselected source already occupies: " + name)
        matches = [item for item in choices if actual == item[0] or actual == item[1]]
        # Resuming an exact postimage always preserves the already selected variant.
        completed = [item for item in matches if actual == item[1]]
        if completed:
            matches = completed
        if not matches or len({item[1]["sha256"] for item in matches}) != 1:
            raise ValueError("No exact accepted source variant for " + name + ": " + json.dumps(actual))
        preimage, expected, new_raw, variant = matches[0]
        results[name] = {"path": name, **expected}
        if actual != expected:
            changes.append({"path": path, "before": actual, "after": expected,
                            "raw": new_raw, "mode": mode, "variant": variant})
    # A changed selection file cannot silently become the baseline for this write.
    if read_file(source_manifest)[0] != selected_raw:
        raise ValueError("Source selection changed during composition")
    # Keep all other selected files and selection provenance, and include every
    # additive helper so the existing builder receives a complete source closure.
    selected.update(results)
    output = {**selection, "files": [selected[name] for name in sorted(selected)]}
    output["customerEntrypoints"] = {"operationId": OPERATION, "packetSha256": PACKET_SHA256,
        "sourceHead": packet["source_head"], "variants": sorted({c["variant"] for c in changes})}
    output_raw = (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if output_manifest.exists() or output_manifest.is_symlink():
        matching_output(output_manifest, output)
    staged = []
    try:
        for change in changes:
            staged.append((change, staged_file(change["path"], change["raw"], change["mode"])))
        for change, _ in staged:
            path = change["path"]
            actual = identity(read_file(path)[0]) if path.exists() or path.is_symlink() else None
            if actual != change["before"]:
                raise ValueError("Source changed before applying: " + str(path))
        for change, temporary in staged:
            path = change["path"]
            actual = identity(read_file(path)[0]) if path.exists() or path.is_symlink() else None
            if actual != change["before"]:
                raise ValueError("Concurrent source changed: " + str(path))
            if change["before"] is None:
                os.link(temporary, path)
            else:
                os.replace(temporary, path)
            sync_directory(path.parent)
            if identity(read_file(path)[0]) != change["after"]:
                raise ValueError("Applied source differs: " + str(path))
        for name, row in results.items():
            if identity(read_file(checkout / name)[0]) != checked_identity(row):
                raise ValueError("Final customer source differs: " + name)
        if read_file(source_manifest)[0] != selected_raw:
            raise ValueError("Source selection changed before publication")
        # Resume an existing equivalent output; its variant list records only the
        # files actually replaced by that completed invocation.
        if output_manifest.exists() or output_manifest.is_symlink():
            matching_output(output_manifest, output)
        else:
            temporary = staged_file(output_manifest, output_raw)
            try:
                os.link(temporary, output_manifest)
                sync_directory(output_manifest.parent)
            finally:
                temporary.unlink(missing_ok=True)
        return {"operationId": OPERATION, "sourceManifest": str(output_manifest),
                "sourceFiles": len(selected), "changedFiles": len(changes),
                "packetSha256": PACKET_SHA256,
                "variants": sorted({c["variant"] for c in changes})}
    finally:
        for _, temporary in staged:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True, type=Path)
    parser.add_argument("--source-manifest", required=True, type=Path)
    parser.add_argument("--output-source-manifest", required=True, type=Path)
    parser.add_argument("--packet", type=Path,
        default=Path(__file__).resolve().parent / "native-patches/customer-review-entrypoints.json")
    args = parser.parse_args()
    try:
        print(json.dumps(apply(args.checkout, args.source_manifest, args.output_source_manifest, args.packet), indent=2))
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, str(error) + "\n")


if __name__ == "__main__":
    main()
