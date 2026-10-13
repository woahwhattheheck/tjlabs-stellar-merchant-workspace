#!/usr/bin/env python3
"""Receive exact source for the original installed merchant foreground."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import sys
import tty
import uuid

OPERATION = "SCF-X402API-MERCHANT-INSTALLED-7DE2-20261012"
ROOT = Path("/dev/x402api-merchant-installed-7de2-20261012")
ORIGINAL = Path("/dev/x402api-merchant-7de2-20261012")
REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
PRODUCT = "products/x402api-merchant-workspace/"
GIT_RECEIVER_SHA = "dfc4b853a0c44d1a2971caba1254ef0635dc3f268e82d45fa88b4eee2bdcd83d"
SUPPORT = {
    "support/run-installed-receiving.py": PRODUCT + "run-installed-receiving.py",
    "support/process_family.py": PRODUCT + "process_family.py",
    "support/git-object-receiving.py": "stellar/scf-starforge-20261009/distribution/git-object-receiving.py",
    "support/official/library_upload.py": None,
    "support/official/library_file_transfer.py": None,
    "support/official/library_hosted_apps.py": None,
}
SDK = {
    "library_upload.py": "5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767",
    "library_file_transfer.py": "5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378",
    "library_hosted_apps.py": "97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59",
}
ORIGINAL_IDENTITY = {
    "libraryFileId": "libfile_e72f624b66e08191a1c84aeabfc5ecb1",
    "fileId": "file_00000000b15082109c537bd99d92b094",
    "version": 0, "bytes": 505232, "members": 121,
    "sha256": "8275abdb2768178cd10685d3631996ec90f9ec3f41227850921eea54dfea354d",
}
os.umask(0o077)
sys.dont_write_bytecode = True


def need(value, message):
    if not value:
        raise RuntimeError(message)


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def sync(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def directory(path):
    if path.exists():
        info = path.lstat()
        need(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode) and path.resolve() == path,
             "Keep the original real directory.")
        if path == ROOT or ROOT in path.parents:
            need(not info.st_mode & 0o077, "Keep the original private intake directory.")
        sync(path)
        sync(path.parent)
        return
    directory(path.parent)
    path.mkdir(mode=0o700)
    sync(path)
    sync(path.parent)


def exact(path, body):
    directory(path.parent)
    if path.exists():
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            before = os.fstat(descriptor)
            need(stat.S_ISREG(before.st_mode) and before.st_size == len(body),
                 "Keep the selected original source target.")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                need(stream.read(len(body) + 1) == body, "The original retained bytes changed: " + str(path))
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        sync(path.parent)
        return
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    descriptor = None
    created = False
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        created = True
        with os.fdopen(descriptor, "wb", closefd=False) as stream:
            stream.write(body)
            stream.flush()
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = None
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            exact(path, body)
        temporary.unlink()
        sync(path.parent)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if created:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
            else:
                sync(path.parent)


def member(row):
    body = row["content"].encode("utf-8")
    need(len(body) == row["bytes"] and hashlib.sha256(body).hexdigest() == row["sha256"],
         "The complete selected source body differs: " + row["path"])
    if row["path"].endswith(".py"):
        compile(body, row["path"], "exec")
    return body


def module_from_body(name, body, filename):
    specification = importlib.util.spec_from_loader(name, loader=None, origin=filename)
    module = importlib.util.module_from_spec(specification)
    module.__file__ = filename
    sys.modules[name] = module
    exec(compile(body, filename, "exec"), module.__dict__)
    return module


def selected_runtime(frame):
    runtime = {}
    candidates = frame.get("runtimeCandidates", {})
    node = [os.environ.get("CODEX_PRIMARY_RUNTIME_NODE"), *candidates.get("node", []), shutil.which("node")]
    modules = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES")
    playwright = ([str(Path(modules) / name / "index.js") for name in ("playwright", "playwright-core")] if modules else [])
    playwright.extend(candidates.get("playwright", []))
    chromium = list(candidates.get("chromium", []))
    chromium.extend([shutil.which("chromium"), shutil.which("chromium-browser"), shutil.which("google-chrome")])
    for key, values in (("node", node), ("playwright", playwright), ("chromium", chromium)):
        for value in values:
            if not isinstance(value, str) or not value:
                continue
            path = Path(value)
            if not path.is_absolute() or str(path) != value or ".." in path.parts:
                continue
            if path.is_file() and (key == "playwright" or os.access(path, os.X_OK)):
                runtime[key] = str(path)
                break
        need(key in runtime, "No selected existing " + key + " is present; keep this original intake and source.")
    return runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bytes", type=int, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--frame", type=Path)
    args = parser.parse_args()
    need(0 < args.bytes <= 8 * 1024 * 1024, "Use one complete bounded source frame.")
    need(len(args.sha256) == 64 and all(c in "0123456789abcdef" for c in args.sha256),
         "Use the complete original frame hash.")
    if args.frame is not None:
        need(args.frame.is_absolute() and args.frame.parent == ROOT / "transport"
             and args.frame.parent.resolve() == args.frame.parent,
             "Use the original private committed-source frame.")
        descriptor = os.open(args.frame, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            info = os.fstat(descriptor)
            need(stat.S_ISREG(info.st_mode) and info.st_size == args.bytes,
                 "The complete committed source frame size changed.")
            with os.fdopen(descriptor, "rb", closefd=False) as stream:
                received = stream.read(args.bytes + 1)
            need(len(received) == args.bytes, "The committed source frame changed during reading.")
        finally:
            os.close(descriptor)
    else:
        if sys.stdin.isatty():
            tty.setraw(sys.stdin.fileno())
        print(json.dumps({"state": "MERCHANT_INSTALLED_FRAME_READY", "operation": OPERATION,
                          "root": str(ROOT), "pid": os.getpid(), "bytes": args.bytes}), flush=True)
        received = bytearray()
        notice = 0
        while len(received) < args.bytes:
            block = os.read(0, min(65536, args.bytes - len(received)))
            need(block, "The complete original source frame was not received.")
            received.extend(block)
            if len(received) - notice >= 262144 or len(received) == args.bytes:
                print(json.dumps({"state": "SOURCE_FRAME_BYTES", "bytes": len(received)}), flush=True)
                notice = len(received)
    need(hashlib.sha256(received).hexdigest() == args.sha256, "The full original frame changed.")
    frame = json.loads(received)
    need(frame.get("schema") == "stellar-forge.merchant-installed-source-frame.v1"
         and frame.get("operation") == OPERATION and frame.get("root") == str(ROOT)
         and frame.get("originalRoot") == str(ORIGINAL) and frame.get("originalArchive") == ORIGINAL_IDENTITY,
         "Keep the original installed source/customer selection.")
    support = frame["support"]
    need(isinstance(support, list) and len(support) == len(SUPPORT), "Receive all six original support files.")
    bodies = {}
    for row in support:
        path = row["path"]
        need(path in SUPPORT and path not in bodies and row.get("sourcePath") == SUPPORT[path],
             "Keep the exact original support inventory.")
        bodies[path] = member(row)
        if SUPPORT[path] is None:
            need(row["sha256"] == SDK[Path(path).name], "Use the original official SDK source.")
    need(hashlib.sha256(bodies["support/git-object-receiving.py"]).hexdigest() == GIT_RECEIVER_SHA,
         "Use the complete maintained Git object receiver.")
    receiver = module_from_body("merchant_installed_intake_git_receiver",
                                bodies["support/git-object-receiving.py"], "support/git-object-receiving.py")
    authority = frame["source"]
    source = {key: authority[key] for key in ("repository", "commit", "tree")}
    need(source["repository"] == REPOSITORY, "Keep the original selected repository.")
    metadata = {"schema": receiver.SCHEMA, "source": source, "tree": authority["treeData"],
                "commitText": receiver.github_commit_text(authority["commitData"], source),
                "requiredPaths": authority["requiredPaths"]}
    _source, entries, required, _objects = receiver.validate_metadata(metadata)
    selected_paths = {row["path"] for row in required}
    for row in support:
        original_path = row["sourcePath"]
        if original_path is None:
            continue
        original = entries.get(original_path)
        body = bodies[row["path"]]
        need(original_path in selected_paths and original["size"] == len(body)
             and receiver.object_id("blob", body) == original["sha"],
             "The complete bootstrap is outside its exact original Git tree.")
    source_files = frame.get("sourceFiles", [])
    need(isinstance(source_files, list) and len(source_files) <= 128, "Keep the original bootstrap source cohort.")
    objects = {}
    for row in source_files:
        path = row["path"]
        original = entries.get(path)
        body = member(row)
        need(path in selected_paths and original["size"] == len(body)
             and original["sha"] == row["blob"] and receiver.object_id("blob", body) == row["blob"],
             "An incoming source body differs from its exact original tree: " + path)
        if row["blob"] in objects:
            need(objects[row["blob"]] == body, "An original source object was reused with different bytes.")
        objects[row["blob"]] = body
    need(PRODUCT + "receive-installed-source.py" in selected_paths,
         "Retain this complete source-intake programme in the selected tree.")
    intake_rows = [row for row in source_files if row["path"] == PRODUCT + "receive-installed-source.py"]
    need(len(intake_rows) == 1, "Receive this original full intake source.")
    runtime = selected_runtime(frame)
    metadata_bytes = encoded(metadata)
    input_value = {
        "schema": "stellar-forge.merchant-installed-foreground-input.v1",
        "operation": OPERATION, "root": str(ROOT), "originalRoot": str(ORIGINAL),
        "source": {"commit": source["commit"], "metadataPath": "control/git-metadata.json",
                   "metadataBytes": len(metadata_bytes), "metadataSha256": hashlib.sha256(metadata_bytes).hexdigest()},
        "originalArchive": ORIGINAL_IDENTITY, "runtime": runtime,
        "donors": frame.get("donors", {"repositories": [], "sources": []}),
        "bootstrap": [{key: row[key] for key in ("path", "sourcePath", "bytes", "sha256")} for row in support],
    }
    input_bytes = encoded(input_value)
    directory(ROOT / "control")
    descriptor = os.open(ROOT / "control/operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        held = os.fstat(descriptor)
        need(stat.S_ISREG(held.st_mode) and held.st_nlink == 1 and not held.st_mode & 0o077,
             "Use the original private, single-link operation lock.")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for row in support:
            exact(ROOT / row["path"], bodies[row["path"]])
        exact(ROOT / "control/git-metadata.json", metadata_bytes)
        exact(ROOT / "control/input.json", input_bytes)
        exact(ROOT / "control/source-commit.json", encoded(authority["commitData"]))
        exact(ROOT / "control/recursive-tree.json", encoded(authority["treeData"]))
        exact(ROOT / "control/intake-source.py", member(intake_rows[0]))
        for oid, body in objects.items():
            exact(ROOT / "incoming-objects" / (oid + ".blob"), body)
        # Signed file transport stays outside the recursively packaged control.
        exact(ROOT / "transport/source-frame.json", bytes(received))
        exact(ROOT / "transport/original-archive.json", encoded(frame["transfer"]))
        exact(ROOT / "control/source-frame-identity.json",
              encoded({"operation": OPERATION, "bytes": args.bytes, "sha256": args.sha256,
                       "sourceCommit": source["commit"], "sourceTree": source["tree"],
                       "objects": sorted(objects), "runtime": runtime}))
        print(json.dumps({"state": "MERCHANT_INSTALLED_SOURCE_RECEIVED", "operation": OPERATION,
                          "input_sha256": hashlib.sha256(input_bytes).hexdigest(),
                          "sourceCommit": source["commit"], "runtime": runtime,
                          "objects": len(objects), "root": str(ROOT)}), flush=True)
    finally:
        os.close(descriptor)
    os.execv(sys.executable, [sys.executable, "-B", "-u",
                             str(ROOT / "support/run-installed-receiving.py"), "--root", str(ROOT)])


if __name__ == "__main__":
    raise SystemExit(main())
