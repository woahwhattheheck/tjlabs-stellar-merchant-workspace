#!/usr/bin/env python3
"""Apply the complete journal continuation to the selected original review source.

Uses Python's standard library. Checks every selected source before replacing any
file, accepts only the recorded preimage or this exact postimage, and writes a new
explicit manifest for the existing customer builder. Interrupted application can
be resumed with the same inputs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile

OPERATION = "SCF-JOURNAL-CONTINUATION-90ED-20261012"
OVERLAY_SHA256 = "7f021c4ae0f1588b74982ae327d686be85bd5224c55b4454c7debb63deaedc92"
PREFIX = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/resource-library/"
NAMES = {
    "comparison.js", "comparison.html", "comparison-returns.js",
    "comparison-returns.html", "comparison-returns.css", "review-return.js",
    "review-return.html", "review-return.css", "review-return-format.mjs",
    "REVIEW_RETURNS.md",
}


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def source_path(root, name):
    relative = PurePosixPath(name)
    if (not name or str(relative) != name or relative.is_absolute()
            or ".." in relative.parts or "\\" in name):
        raise ValueError("Invalid selected source path: " + name)
    target = root / relative
    if target.resolve(strict=True) != target or not stat.S_ISREG(target.lstat().st_mode):
        raise ValueError("Selected source must be a regular local file: " + name)
    return target


def apply(checkout, source_manifest, out_manifest, overlay_path):
    root = checkout.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("The selected checkout must be a directory")
    if not out_manifest.is_absolute() or out_manifest.parent.resolve(strict=True) != out_manifest.parent:
        raise ValueError("Use an absolute manifest path in an existing canonical directory")
    if out_manifest.is_symlink() or out_manifest.absolute() == source_manifest.resolve(strict=True):
        raise ValueError("Use a distinct output manifest path")

    overlay_raw = overlay_path.read_bytes()
    if sha256(overlay_raw) != OVERLAY_SHA256:
        raise ValueError("The continuation overlay does not match this installer")
    overlay = json.loads(overlay_raw)
    if (overlay.get("schema") != "commons.scf-review-source-overlay.v1"
            or overlay.get("operation_id") != OPERATION):
        raise ValueError("Unsupported continuation overlay")
    changes = {}
    for row in overlay["files"]:
        name = row["path"]
        raw = row["content"].encode("utf-8")
        if (name in changes or not name.startswith(PREFIX)
                or name[len(PREFIX):] not in NAMES
                or len(raw) != row["bytes"] or sha256(raw) != row["sha256"]
                or git_blob(raw) != row["git_blob_sha"]):
            raise ValueError("Invalid continuation source: " + name)
        changes[name] = (row, raw)
    if set(changes) != {PREFIX + name for name in NAMES}:
        raise ValueError("The complete ten-file continuation is required")

    manifest_raw = source_manifest.read_bytes()
    selection = json.loads(manifest_raw)
    selected, current, planned, replacements = set(), {}, [], []
    for row in selection["files"]:
        name = row["path"]
        if name in selected:
            raise ValueError("Repeated selected source: " + name)
        selected.add(name)
        if (type(row.get("bytes")) is not int or row["bytes"] < 0
                or not isinstance(row.get("sha256"), str)
                or len(row["sha256"]) != 64):
            raise ValueError("Source selection requires byte counts and SHA-256")
        target = source_path(root, name)
        raw = target.read_bytes()
        current[name] = (target, raw)
        if name in changes:
            patch, final = changes[name]
            if git_blob(raw) not in {patch["preimage_git_blob_sha"], patch["git_blob_sha"]}:
                raise ValueError("Concurrent source differs from the selected preimage: " + name)
            if raw != final:
                replacements.append(name)
        else:
            if len(raw) != row["bytes"] or sha256(raw) != row["sha256"]:
                raise ValueError("Unchanged selected source moved: " + name)
            final = raw
        planned.append({"path": name, "bytes": len(final), "sha256": sha256(final),
                        "git_blob_sha": git_blob(final)})
    if not set(changes).issubset(selected):
        raise ValueError("The source manifest must include all ten original review files")
    manifest = {
        "schema": "commons.scf-review-source-selection.v1",
        "operation_id": OPERATION,
        "parent_operation_id": overlay["parent_operation_id"],
        "input_manifest_sha256": sha256(manifest_raw),
        "overlay_sha256": OVERLAY_SHA256,
        "files": sorted(planned, key=lambda row: row["path"]),
    }
    output = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if out_manifest.exists() and (not out_manifest.is_file() or out_manifest.read_bytes() != output):
        raise ValueError("Output manifest already contains a different selection")

    stages = {}
    try:
        for name in replacements:
            target, _ = current[name]
            with tempfile.NamedTemporaryFile(prefix=".review-continuation-", dir=target.parent, delete=False) as stream:
                stages[name] = Path(stream.name)
                stream.write(changes[name][1])
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(stages[name], stat.S_IMODE(target.stat().st_mode))
        # Recheck the complete selected checkout immediately before applying.
        # Reruns accept this exact postimage, so a process interruption is recoverable.
        for name, (target, raw) in current.items():
            source_path(root, name)
            if target.read_bytes() != raw:
                raise ValueError("Selected source changed during composition: " + name)
        for name in replacements:
            target, raw = current[name]
            source_path(root, name)
            if target.read_bytes() != raw:
                raise ValueError("Selected source changed before replacement: " + name)
            os.replace(stages[name], target)
            del stages[name]
        for name in changes:
            if source_path(root, name).read_bytes() != changes[name][1]:
                raise ValueError("Continuation readback mismatch: " + name)
        for directory in {current[name][0].parent for name in replacements}:
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        if not out_manifest.exists():
            with tempfile.NamedTemporaryFile(prefix=".review-selection-", dir=out_manifest.parent, delete=False) as stream:
                manifest_stage = Path(stream.name)
                try:
                    stream.write(output)
                    stream.flush()
                    os.fsync(stream.fileno())
                except BaseException:
                    manifest_stage.unlink(missing_ok=True)
                    raise
            try:
                os.link(manifest_stage, out_manifest)
            except FileExistsError:
                if out_manifest.is_symlink() or out_manifest.read_bytes() != output:
                    raise ValueError("Output manifest was created with a different selection")
            finally:
                manifest_stage.unlink(missing_ok=True)
            fd = os.open(out_manifest.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        if out_manifest.is_symlink() or out_manifest.read_bytes() != output:
            raise ValueError("Output manifest readback mismatch")
        return {"operation_id": OPERATION, "changed": len(replacements),
                "already_applied": len(changes) - len(replacements),
                "selected_files": len(planned), "source_manifest": str(out_manifest),
                "source_manifest_sha256": sha256(output), "overlay_sha256": OVERLAY_SHA256}
    finally:
        for stage in stages.values():
            stage.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout", required=True, type=Path)
    parser.add_argument("--source-manifest", required=True, type=Path)
    parser.add_argument("--out-manifest", required=True, type=Path)
    parser.add_argument("--overlay", type=Path,
                        default=Path(__file__).parent / "native-patches/customer-journal-continuation.json")
    args = parser.parse_args()
    try:
        print(json.dumps(apply(args.checkout, args.source_manifest, args.out_manifest, args.overlay), indent=2))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, str(error) + "\n")


if __name__ == "__main__":
    main()
