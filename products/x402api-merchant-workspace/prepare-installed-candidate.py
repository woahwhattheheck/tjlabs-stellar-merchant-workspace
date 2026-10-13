#!/usr/bin/env python3
"""Commit reviewed installed-merchant source locally, then use its original intake.

This is ordinary offline Git preparation. The native programme always receives
the real resulting commit and full tree; no overlay is labeled as its base.
"""
from __future__ import annotations
import argparse
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tty
import uuid

OPERATION = "SCF-X402API-MERCHANT-INSTALLED-7DE2-20261012"
ROOT = Path("/dev/x402api-merchant-installed-7de2-20261012")
PRODUCT = "products/x402api-merchant-workspace/"
INTAKE = PRODUCT + "receive-installed-source.py"
SELF = PRODUCT + "prepare-installed-candidate.py"
os.umask(0o077)
sys.dont_write_bytecode = True


def need(value, message):
    if not value:
        raise RuntimeError(message)


def body(row):
    value = row["content"].encode("utf-8")
    need(len(value) == row["bytes"] and hashlib.sha256(value).hexdigest() == row["sha256"],
         "The complete reviewed postimage changed: " + row["path"])
    return value


def module(name, value, filename):
    spec = importlib.util.spec_from_loader(name, loader=None, origin=filename)
    result = importlib.util.module_from_spec(spec)
    result.__file__ = filename
    sys.modules[name] = result
    exec(compile(value, filename, "exec"), result.__dict__)
    return result


def receive_frame():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bytes", type=int, required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    need(0 < args.bytes <= 8 * 1024 * 1024 and re.fullmatch(r"[0-9a-f]{64}", args.sha256 or ""),
         "Use the complete original reviewed-source frame.")
    if sys.stdin.isatty():
        tty.setraw(sys.stdin.fileno())
    print(json.dumps({"state": "MERCHANT_CANDIDATE_FRAME_READY", "operation": OPERATION,
                      "root": str(ROOT), "bytes": args.bytes, "pid": os.getpid()}), flush=True)
    received = bytearray()
    announced = 0
    while len(received) < args.bytes:
        chunk = os.read(0, min(65536, args.bytes - len(received)))
        need(chunk, "The full reviewed-source frame was not received.")
        received.extend(chunk)
        if len(received) - announced >= 262144 or len(received) == args.bytes:
            print(json.dumps({"state": "SOURCE_FRAME_BYTES", "bytes": len(received)}), flush=True)
            announced = len(received)
    need(hashlib.sha256(received).hexdigest() == args.sha256, "The original source frame digest differs.")
    return json.loads(received), bytes(received), args.sha256


def main():
    frame, frame_bytes, frame_sha = receive_frame()
    need(frame.get("schema") == "stellar-forge.merchant-reviewed-candidate-frame.v1"
         and frame.get("operation") == OPERATION and frame.get("root") == str(ROOT),
         "Keep the same original installed receiving operation.")
    amendments = frame["amendments"]
    need(isinstance(amendments, list) and 1 <= len(amendments) <= 64,
         "Keep the complete bounded reviewed amendment.")
    postimages = {}
    for row in amendments:
        path = row["path"]
        need(isinstance(path, str) and path and not path.startswith("/") and "\\" not in path
             and "\0" not in path and all(p not in ("", ".", "..") for p in path.split("/"))
             and path not in postimages, "Keep exact unique reviewed source paths.")
        postimages[path] = (row, body(row))
    need(INTAKE in postimages and SELF in postimages, "Retain the complete original source receiving programmes.")
    intake = module("merchant_reviewed_intake", postimages[INTAKE][1], INTAKE)
    need(frame.get("originalRoot") == str(intake.ORIGINAL)
         and frame.get("originalArchive") == intake.ORIGINAL_IDENTITY,
         "Keep the same five-invoice original artifact.")
    support = frame["support"]
    need(isinstance(support, list) and len(support) == 6, "Receive the six original support sources.")
    support_rows = {}
    for row in support:
        path = row["path"]
        need(path in intake.SUPPORT and path not in support_rows
             and row.get("sourcePath") == intake.SUPPORT[path], "Keep the exact original support selection.")
        value = body(row)
        if row["sourcePath"] is None:
            need(row["sha256"] == intake.SDK[Path(path).name], "Keep the official SDK source.")
        support_rows[path] = (row, value)
    receiver_bytes = support_rows["support/git-object-receiving.py"][1]
    need(hashlib.sha256(receiver_bytes).hexdigest() == intake.GIT_RECEIVER_SHA,
         "Use the original maintained Git source receiver.")
    receiver = module("merchant_reviewed_original_git", receiver_bytes, "support/git-object-receiving.py")
    family_module = module("merchant_reviewed_original_family", support_rows["support/process_family.py"][1],
                           "support/process_family.py")
    base = frame["baseSource"]
    authority = {key: base[key] for key in ("repository", "commit", "tree")}
    need(authority["repository"] == intake.REPOSITORY, "Keep the original repository.")
    receiver_path = intake.SUPPORT["support/git-object-receiving.py"]
    base_metadata = {
        "schema": receiver.SCHEMA, "source": authority, "tree": base["treeData"],
        "commitText": receiver.github_commit_text(base["commitData"], authority),
        "requiredPaths": [receiver_path],
    }
    _base, original_entries, _required, original_objects = receiver.validate_metadata(base_metadata)
    need(original_entries[receiver_path]["sha"] == receiver.object_id("blob", receiver_bytes),
         "The base no longer contains the selected original Git receiver.")
    for path, (row, value) in postimages.items():
        original = original_entries.get(path)
        preimage = row.get("preimage")
        if original is None:
            need(preimage is None, "An absent source path has a conflicting preimage.")
        else:
            need(original["type"] == "blob" and original["mode"] in ("100644", "100755")
                 and isinstance(preimage, dict) and preimage.get("blob") == original["sha"]
                 and preimage.get("bytes") == original["size"],
                 "The reviewed source preimage differs: " + path)
        parent = path.rpartition("/")[0]
        need(parent in original_entries and original_entries[parent]["type"] == "tree",
             "Keep this amendment within the selected original source directories.")
    authored_at = frame["candidate"]["authoredAt"]
    need(isinstance(authored_at, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", authored_at),
         "Keep the original candidate timestamp.")
    datetime.datetime.fromisoformat(authored_at.replace("Z", "+00:00"))
    intent = {
        "schema": "stellar-forge.merchant-reviewed-candidate.v1", "operation": OPERATION,
        "baseSource": authority, "baseMetadataSha256": hashlib.sha256(intake.encoded(base_metadata)).hexdigest(),
        "authoredAt": authored_at, "author": {"name": "Commons installed receiving",
                                            "email": "commons-installed-receiving@localhost"},
        "postimages": [{key: row[key] for key in ("path", "bytes", "sha256")} |
                      {"preimage": row.get("preimage")} for row, _ in postimages.values()],
        "publication": "UNPUBLISHED_REVIEWED_CANDIDATE",
    }
    intake.directory(ROOT / "control")
    descriptor = os.open(ROOT / "control/operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        held = os.fstat(descriptor)
        need(stat.S_ISREG(held.st_mode) and held.st_nlink == 1 and not held.st_mode & 0o077,
             "Use the original private operation lock.")
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        destination = ROOT / "control/source-candidate"
        intake.exact(destination / "intent.json", intake.encoded(intent))
        intake.exact(destination / "base-metadata.json", intake.encoded(base_metadata))
        intake.exact(ROOT / "transport/reviewed-candidate-frame.json", frame_bytes)
        repository = destination / "repository.git"
        git = frame.get("git") or "git"
        need(isinstance(git, str) and git, "Use the selected installed Git executable.")
        environment = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_CONFIG_NOSYSTEM": "1",
                       "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_NO_REPLACE_OBJECTS": "1",
                       "GIT_AUTHOR_NAME": intent["author"]["name"], "GIT_AUTHOR_EMAIL": intent["author"]["email"],
                       "GIT_COMMITTER_NAME": intent["author"]["name"], "GIT_COMMITTER_EMAIL": intent["author"]["email"],
                       "GIT_AUTHOR_DATE": authored_at, "GIT_COMMITTER_DATE": authored_at}
        attempt = destination / "attempts" / uuid.uuid4().hex
        intake.directory(attempt)
        commands = []
        family = family_module.ProcessFamily(OPERATION + ":reviewed-source-candidate")
        def command(argv, input_bytes=None):
            record = {"argv": argv}
            try:
                result = subprocess.run(argv, input=input_bytes, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, env=environment, cwd=ROOT,
                                        timeout=30, check=False)
                record.update(exitCode=result.returncode, stdout=result.stdout.decode("utf-8", errors="replace"),
                              stderr=result.stderr.decode("utf-8", errors="replace"))
                need(result.returncode == 0, "The original offline Git command did not finish: " + record["stderr"][:1000])
                return result.stdout
            finally:
                commands.append(record)
        def git_command(arguments, input_bytes=None):
            return command([git, "--no-replace-objects", "--no-lazy-fetch",
                            "--git-dir=" + str(repository), *arguments], input_bytes)
        try:
            family.__enter__()
            if not repository.exists():
                command([git, "init", "--bare", str(repository)])
            need(repository.is_dir() and not repository.is_symlink() and repository.resolve() == repository,
                 "Keep the original local candidate repository.")
            cache = receiver.ObjectCache(repository)
            for oid, kind, value in original_objects:
                cache.write(oid, kind, value)
            entries = {path: dict(row) for path, row in original_entries.items()}
            changed_directories = {""}
            sources = {}
            for path, (row, value) in postimages.items():
                oid = git_command(["hash-object", "-w", "--stdin"], value).decode("ascii").strip()
                need(receiver.object_id("blob", value) == oid, "Git returned a different reviewed source object.")
                entry = dict(entries[path]) if path in entries else {"path": path, "type": "blob", "mode": "100644"}
                entry.update(sha=oid, size=len(value))
                entry.pop("url", None)
                entries[path] = entry
                sources[path] = {**row, "blob": oid}
                parent = path.rpartition("/")[0]
                while parent:
                    changed_directories.add(parent)
                    parent = parent.rpartition("/")[0]
            for path in sorted(changed_directories, key=lambda p: (p.count("/") + bool(p), p), reverse=True):
                children = [(name.rpartition("/")[2], row) for name, row in entries.items()
                            if name.rpartition("/")[0] == path]
                value = b"".join((row["mode"] + " " + row["type"] + " " + row["sha"] + "\t" + name).encode("utf-8") + b"\0"
                                 for name, row in children)
                oid = git_command(["mktree", "--missing", "-z"], value).decode("ascii").strip()
                if path:
                    entries[path]["sha"] = oid
                    entries[path].pop("url", None)
                else:
                    tree_oid = oid
            message = ("Reviewed local source for " + OPERATION + "\n\n"
                       "Original signed base: " + authority["commit"] + "\n"
                       "Exact amendment: " + hashlib.sha256(intake.encoded(intent)).hexdigest() + "\n"
                       "Unpublished candidate; original Git publication remains pending.\n")
            commit_oid = git_command(["commit-tree", tree_oid, "-p", authority["commit"]],
                                     message.encode("utf-8")).decode("ascii").strip()
            commit_text = git_command(["cat-file", "commit", commit_oid]).decode("utf-8")
            tree = {"sha": tree_oid, "truncated": False,
                    "tree": sorted(entries.values(), key=lambda row: row["path"])}
            for row in frame.get("retainedSources", []):
                path = row["path"]
                if path in sources:
                    continue
                value = body(row)
                original = entries.get(path)
                need(original and original["type"] == "blob" and original["mode"] in ("100644", "100755")
                     and original["size"] == len(value) and original["sha"] == row["blob"]
                     and receiver.object_id("blob", value) == row["blob"],
                     "A retained source body does not match the original candidate tree: " + path)
                sources[path] = row
                cache.write(row["blob"], "blob", value)
            for row, value in support_rows.values():
                path = row["sourcePath"]
                if path is None:
                    continue
                original = entries[path]
                need(original["size"] == len(value) and original["sha"] == receiver.object_id("blob", value),
                     "The original support source differs from the reviewed candidate.")
                sources[path] = {"path": path, "bytes": len(value), "sha256": hashlib.sha256(value).hexdigest(),
                                 "blob": original["sha"], "content": value.decode("utf-8")}
                cache.write(original["sha"], "blob", value)
            selected_source = {"repository": authority["repository"], "commit": commit_oid, "tree": tree_oid}
            metadata = {"schema": receiver.SCHEMA, "source": selected_source, "tree": tree,
                        "commitText": commit_text, "requiredPaths": sorted(sources)}
            receiver.validate_metadata(metadata)
            git_command(["update-ref", "refs/heads/reviewed-installed", commit_oid])
        finally:
            # subprocess.run has reaped its own main process on every exit.
            # The maintained family closes only any newly adopted descendants.
            if family.entered:
                family.close()
            intake.exact(attempt / "commands.json", intake.encoded(commands))
            intake.exact(attempt / "family.json", intake.encoded(family.report))
        candidate = {"schema": "stellar-forge.merchant-reviewed-candidate-result.v1",
                     "operation": OPERATION, "intentSha256": hashlib.sha256(intake.encoded(intent)).hexdigest(),
                     "source": selected_source, "baseSource": authority, "commitText": commit_text,
                     "publication": "UNPUBLISHED_REVIEWED_CANDIDATE"}
        intake.exact(destination / "candidate.json", intake.encoded(candidate))
        intake.exact(destination / "metadata.json", intake.encoded(metadata))
        donors = frame.get("donors", {"repositories": [], "sources": []})
        donors = {**donors, "repositories": list(dict.fromkeys([str(repository), *donors.get("repositories", [])]))}
        committed_frame = {
            "schema": "stellar-forge.merchant-installed-source-frame.v1",
            "operation": OPERATION, "root": str(ROOT), "originalRoot": frame["originalRoot"],
            "originalArchive": frame["originalArchive"],
            "source": {**selected_source, "treeData": tree, "requiredPaths": sorted(sources),
                       "commitData": {"sha": commit_oid, "tree": {"sha": tree_oid}, "commitText": commit_text,
                                      "origin": "original-local-reviewed-candidate"}},
            "support": support, "sourceFiles": list(sources.values()), "donors": donors,
            "runtimeCandidates": frame["runtimeCandidates"], "transfer": frame["transfer"],
        }
        committed_bytes = intake.encoded(committed_frame)
        need(len(committed_bytes) <= 8 * 1024 * 1024, "Keep the complete original intake frame within its bound.")
        frame_path = ROOT / "transport/committed-source-frame.json"
        intake.exact(frame_path, committed_bytes)
        intake_path = ROOT / "support/receive-installed-source.py"
        intake.exact(intake_path, postimages[INTAKE][1])
        print(json.dumps({"state": "MERCHANT_REVIEWED_CANDIDATE_COMMITTED", "operation": OPERATION,
                          "source": selected_source, "baseSource": authority,
                          "publication": "UNPUBLISHED_REVIEWED_CANDIDATE",
                          "frameBytes": len(committed_bytes), "objects": len(sources)}), flush=True)
    finally:
        os.close(descriptor)
    os.execv(sys.executable, [sys.executable, "-B", "-u", str(intake_path),
                             "--frame", str(frame_path), "--bytes", str(len(committed_bytes)),
                             "--sha256", hashlib.sha256(committed_bytes).hexdigest()])


if __name__ == "__main__":
    raise SystemExit(main())
