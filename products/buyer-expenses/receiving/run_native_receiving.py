#!/usr/bin/env python3
"""Receive the original selected Buyer Expenses project on an existing Linux worker."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parent
OUTER_SHA256 = "31f88f9daa0d4f4d65bc23b463dbd3e90c7c80182f19cd7c41e1722b8731b880"
PROJECT_SHA256 = "46329775e2298e49fbf9deb1dc6300f63db798f10e252ac3e727ab4e0f815c7b"
PROJECT_BYTES = 497098
SOURCE_COMMIT = "27347f1b1a9ae0f1ab7979803dd471f26c5185cf"
SOURCE_TREE = "ab96fa5fe8686f7f8461d18c0f65a5ebc33ff7df"
OPERATION = "BUYER-FINANCE-STANDALONE-6200-20261012"


def need(value, message):
    if not value:
        raise RuntimeError(message)


def file_digest(path):
    path = Path(path).resolve(strict=True)
    before = path.stat()
    need(stat.S_ISREG(before.st_mode), "Expected an ordinary input file: " + str(path))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(65536), b""):
            digest.update(block)
    after = path.stat()
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
         "Original input changed while it was read: " + str(path))
    return path, before.st_size, digest.hexdigest()


def checked_source(manifest, name):
    row = manifest["files"][name]
    path, size, digest = file_digest(ROOT / name)
    need(size == row["bytes"] and digest == row["sha256"],
         "Published original receiving source changed: " + name)
    return path


def directory(value, *, create=False, private=False):
    path = Path(value).expanduser().absolute()
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = path.resolve(strict=True)
    state = path.stat()
    need(stat.S_ISDIR(state.st_mode), "Expected a receiving directory: " + str(path))
    if private:
        need(state.st_mode & 0o077 == 0,
             "Use an existing private directory, or select an absent directory: " + str(path))
    return str(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-receiving", required=True,
                        help="Exact original F232 whole receiving ZIP")
    parser.add_argument("--original-project",
                        help="Exact included complete project ZIP; otherwise recover that member by its SHA-256")
    parser.add_argument("--temporary-directory", default="/dev",
                        help="Existing directory for this one private original native operation")
    output = parser.add_mutually_exclusive_group(required=True)
    output.add_argument("--archive-directory",
                        help="Private durable output directory for full native artifacts")
    output.add_argument("--library-helpers",
                        help="Existing original Library helper directory in a connected ChatGPT worker")
    parser.add_argument("--donor-repository", action="append", default=[],
                        help="Existing Git object database used read-only by the original receiver")
    parser.add_argument("--donor-source", action="append", default=[],
                        help="Existing installed original source used read-only by the original receiver")
    parser.add_argument("--donor-archive", action="append", nargs=2, default=[], metavar=("SHA256", "PATH"),
                        help="Existing exact release archive used read-only by the original receiver")
    parser.add_argument("--incoming", action="append", default=[],
                        help="Original receiver directory of exact OID.blob or OID.blob.gz objects")
    parser.add_argument("--additional-path", action="append", default=[],
                        help="Exact source path reported missing by the original selected builder")
    parser.add_argument("--node-headers", help="Existing Node headers for the original offline native installer")
    parser.add_argument("--npm-cache", help="Existing operator-owned npm cache for the original installer")
    parser.add_argument("--npm-offline", action="store_true",
                        help="Run the original installer's offline npm mode with the selected complete cache")
    args = parser.parse_args()
    os.umask(0o077)

    manifest = json.loads((ROOT / "SOURCE.json").read_text(encoding="utf-8"))
    need(manifest.get("schema") == "stellar-forge.buyer-finance-receiving-source.v1" and
         manifest.get("sourceCommit") == SOURCE_COMMIT and manifest.get("sourceTree") == SOURCE_TREE,
         "The original financial source selection changed")
    checked_source(manifest, "run_native_receiving.py")
    source_path = checked_source(manifest, "source-input.json")
    operation_path = checked_source(manifest, "operation.py")
    driver_path = checked_source(manifest, "receive.mjs")
    packet = json.loads(source_path.read_text(encoding="utf-8"))
    need(packet.get("format") == "deflate-raw" and
         packet.get("source_bytes") == manifest["decodedInput"]["bytes"] and
         packet.get("source_sha256") == manifest["decodedInput"]["sha256"] and
         0 < packet["source_bytes"] <= 8 * 1024 * 1024,
         "The retained original source input identity changed")
    compressed = base64.b64decode(packet["base64"], validate=True)
    need(len(compressed) == packet["compressed_bytes"], "Original compressed input length changed")
    decoder = zlib.decompressobj(wbits=-15)
    raw = decoder.decompress(compressed, packet["source_bytes"] + 1)
    need(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail and
         len(raw) == packet["source_bytes"] and
         hashlib.sha256(raw).hexdigest() == packet["source_sha256"],
         "Original source input bytes changed")
    source = json.loads(raw)
    need(source.get("schema") == "commons.original-native-source-input.v1" and
         source.get("operation") == OPERATION and source.get("sourceCommit") == SOURCE_COMMIT and
         source["metadata"]["source"]["commit"] == SOURCE_COMMIT and
         source["metadata"]["source"]["tree"] == SOURCE_TREE,
         "The original receiver is bound to a different product or Git tree")

    receiving, _, receiving_sha = file_digest(args.original_receiving)
    need(receiving_sha == OUTER_SHA256, "The complete original F232 receiving ZIP changed")
    temporary_directory = directory(args.temporary_directory)
    source["temporary_directory"] = temporary_directory
    source["original_receiving"] = str(receiving)
    source["receiving_driver"] = str(driver_path)
    source["donor_repositories"] = [directory(path) for path in args.donor_repository]
    source["donor_sources"] = [directory(path) for path in args.donor_source]
    source["donor_archives"] = [[digest, str(Path(path).resolve(strict=True))] for digest, path in args.donor_archive]
    source["incoming_directories"] = [directory(path) for path in args.incoming]
    source["additional_paths"] = list(args.additional_path)
    if args.node_headers:
        source["node_headers"] = directory(args.node_headers)
    if args.archive_directory:
        source["archive_directory"] = directory(args.archive_directory, create=True, private=True)
    else:
        source["library_helpers"] = directory(args.library_helpers)
    if args.npm_cache:
        source["npm_cache"] = directory(args.npm_cache, create=True)
    source["npm_offline"] = bool(args.npm_offline)

    for command in ("node", "git"):
        need(shutil.which(command), "Original runtime command is absent: " + command)
    operation_code = compile(operation_path.read_bytes(), str(operation_path), "exec")
    with tempfile.TemporaryDirectory(prefix="buyer-finance-original-input-", dir=temporary_directory) as staging:
        if args.original_project:
            project, size, project_sha = file_digest(args.original_project)
            need(size == PROJECT_BYTES and project_sha == PROJECT_SHA256,
                 "The included original project ZIP changed")
        else:
            project = Path(staging) / "original-complete-buyer-expense-project.zip"
            matched = False
            with zipfile.ZipFile(receiving) as archive:
                for member in archive.infolist():
                    if member.is_dir() or member.file_size != PROJECT_BYTES:
                        continue
                    data = archive.read(member)
                    if hashlib.sha256(data).hexdigest() != PROJECT_SHA256:
                        continue
                    with project.open("xb") as output:
                        output.write(data)
                        output.flush()
                        os.fsync(output.fileno())
                    matched = True
                    break
            need(matched, "The original receiving ZIP lacks its exact complete project member")
        source["original_project"] = str(project)
        print(json.dumps({"phase": "original-inputs-verified", "operation": OPERATION,
                          "sourceCommit": SOURCE_COMMIT, "sourceTree": SOURCE_TREE,
                          "originalReceivingSha256": OUTER_SHA256,
                          "originalProjectSha256": PROJECT_SHA256,
                          "requiredSourcePaths": len(source["metadata"]["requiredPaths"]),
                          "incomingOriginalObjects": len(source["incoming"])}), flush=True)
        exec(operation_code, {"_original_source": source, "__name__": "__main__"})


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, zipfile.BadZipFile, zlib.error) as error:
        print(json.dumps({"phase": "original-receiving-input-error", "error": str(error)}), file=sys.stderr)
        raise SystemExit(1)
