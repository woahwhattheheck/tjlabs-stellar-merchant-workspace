#!/usr/bin/env python3
"""Receive the complete original grant runtime source from one exact Git revision."""
from __future__ import annotations

import argparse
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
import sys

REPOSITORY = "woahwhattheheck/tjlabs-stellar-merchant-workspace"
FAMILY = "stellar/scf_2026/sf47_budget_model"
OPERATION = "operations/scf-grant-calendar-cedar-8047-20261012"
MANAGED = FAMILY + "/workspace/managed_launch.py"
SCHEMA = "stellar-forge.scf-calendar-source-receiving.v1"
FULFILLMENT = ("build_customer_handover.py", "restore_workspace.py", "CUSTOMER_HANDOVER.md", "select_source.py")
RELATIVE = re.compile(r'''["']((?:\.\.?/|stellar/|stellar-forge/|operations/)[^"'\r\n]+)["']''')
ADJACENT = re.compile(r'''["']([A-Za-z0-9_.-]+\.(?:mjs|js|py|json|jsonl|css|html|md|txt|csv|yaml|yml|sql|ts|mts|cjs))["']''')
SOURCE_SUFFIXES = {".mjs", ".js", ".py", ".ts", ".mts", ".cjs", ".json"}
FILE_SUFFIXES = SOURCE_SUFFIXES | {".jsonl", ".css", ".html", ".md", ".txt", ".csv", ".yaml", ".yml", ".sql"}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def git(repo, *args):
    return subprocess.check_output(["git", *args], cwd=repo)


def write_original(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        if path.is_symlink() or not path.is_file() or path.read_bytes() != raw:
            raise ValueError("The existing original source differs: " + str(path))
        return
    pending = path.with_name(path.name + ".source-pending")
    with pending.open("wb") as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())
    os.link(pending, path)
    pending.unlink()


def receive(repo, revision, fulfillment_revision, output):
    for selected_revision in dict.fromkeys((revision, fulfillment_revision)):
        present = subprocess.run(["git", "cat-file", "-e", selected_revision + "^{commit}"],
                                 cwd=repo, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if present.returncode:
            git(repo, "fetch", "origin", selected_revision)
    tree = {}
    for line in git(repo, "ls-tree", "-r", revision).decode("utf-8").splitlines():
        metadata, path = line.split("\t", 1)
        mode, kind, identity = metadata.split()
        if kind == "blob":
            tree[path] = {"mode": mode, "gitBlob": identity}
    excluded = {OPERATION + "/" + name for name in FULFILLMENT}
    base = sorted(path for path in tree if (path.startswith(FAMILY + "/") or path.startswith(OPERATION + "/")) and path not in excluded)
    if MANAGED not in tree:
        raise ValueError("Select the original grant runtime with managed_launch.py.")
    identity = {"schema": SCHEMA, "repository": REPOSITORY, "commit": revision, "fulfillmentCommit": fulfillment_revision}
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (output / ".source-receiving.lock").open("a") as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        write_original(output / "SOURCE_REQUEST.json", (json.dumps(identity, indent=2) + "\n").encode())
        rows = {}

        def original(path):
            metadata = tree[path]
            if metadata["mode"] not in ("100644", "100755"):
                raise ValueError("Select ordinary original source files: " + path)
            destination = output / path
            raw = destination.read_bytes() if destination.is_file() and not destination.is_symlink() else git(repo, "show", revision + ":" + path)
            if blob(raw) != metadata["gitBlob"]:
                raise ValueError("Original source differs from its selected Git object: " + path)
            write_original(destination, raw)
            rows[path] = {"path": path, "bytes": len(raw), "gitBlob": metadata["gitBlob"], "sha256": sha(raw)}
            return raw

        for path in base:
            original(path)
        module = ast.parse(original(MANAGED).decode("utf-8"))
        boot = next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign)
                    and any(isinstance(target, ast.Name) and target.id == "BOOT_FILES" for target in node.targets))
        seeds = [posixpath.normpath(posixpath.join(posixpath.dirname(MANAGED), path)) for path in boot]
        for path in seeds:
            if path not in tree:
                raise ValueError("Original managed source is absent from Git: " + path)
            original(path)
        managed_selection_count = len(rows)
        queue, visited, unresolved = list(seeds), set(), []
        while queue:
            path = queue.pop(0)
            if path in visited:
                continue
            visited.add(path)
            raw = original(path)
            suffix = PurePosixPath(path).suffix
            targets = []
            if suffix in (".mjs", ".js"):
                paired = path[:-len(suffix)] + (".d.mts" if suffix == ".mjs" else ".d.ts")
                if paired in tree:
                    targets.append(paired)
            if suffix in SOURCE_SUFFIXES:
                text = raw.decode("utf-8")
                for match in RELATIVE.finditer(text):
                    value = match.group(1)
                    target = posixpath.normpath(posixpath.join(posixpath.dirname(path), value)) if value.startswith(".") else value
                    if target.startswith("../"):
                        continue
                    if target in tree:
                        targets.append(target)
                    elif PurePosixPath(target).suffix in FILE_SUFFIXES:
                        prefix = text[max(0, match.start() - 80):match.start()]
                        if re.search(r"(?:\bfrom\s*|\bimport\s*\(\s*|new URL\s*\(\s*)$", prefix):
                            unresolved.append({"source": path, "reference": value, "resolved": target})
                for match in ADJACENT.finditer(text):
                    target = posixpath.join(posixpath.dirname(path), match.group(1))
                    if target in tree:
                        targets.append(target)
                if suffix == ".py":
                    for node in ast.walk(ast.parse(text)):
                        names = [item.name for item in node.names] if isinstance(node, ast.Import) else [node.module] if isinstance(node, ast.ImportFrom) and node.module else []
                        for name in names:
                            for parent in (posixpath.dirname(path), posixpath.dirname(MANAGED), posixpath.dirname(posixpath.dirname(MANAGED))):
                                target = posixpath.join(parent, name.replace(".", "/") + ".py")
                                if target in tree:
                                    targets.append(target)
                                    break
            queue.extend(target for target in targets if target not in visited)
        if unresolved:
            raise ValueError("Resolve the original runtime imports before receiving: " + json.dumps(unresolved))
        selection = {"repository": REPOSITORY, "commit": revision, "files": [rows[path] for path in sorted(rows)],
            "dependencyClosure": {
                "basis": "Original " + str(len(boot)) + " managed BOOT_FILES with native Python modules, literal relative source/data references and adjacent runtime source/data references",
                "managedBootFiles": len(boot), "visitedFiles": len(visited),
                "additionalFilesBeyondManagedSelection": len(rows) - managed_selection_count,
                "unresolvedImports": unresolved,
            }}
        write_original(output / "SOURCE_SELECTION.json", (json.dumps(selection, indent=2) + "\n").encode())
        if "LICENSE" not in tree:
            raise ValueError("The original repository license is required for the complete source handover.")
        license_raw = git(repo, "show", revision + ":LICENSE")
        if blob(license_raw) != tree["LICENSE"]["gitBlob"]:
            raise ValueError("The original repository license differs from its selected Git object.")
        write_original(output / "LICENSE", license_raw)
        fulfillment = []
        for name in FULFILLMENT:
            relative = OPERATION + "/" + name
            expected = git(repo, "rev-parse", fulfillment_revision + ":" + relative).decode().strip()
            raw = git(repo, "show", fulfillment_revision + ":" + relative)
            if blob(raw) != expected:
                raise ValueError("The published fulfillment source differs from its original Git object: " + relative)
            write_original(output / relative, raw)
            fulfillment.append({"path": relative, "bytes": len(raw), "gitBlob": expected, "sha256": sha(raw)})
        provenance = {"repository": REPOSITORY, "commit": fulfillment_revision, "files": fulfillment}
        write_original(output / "FULFILLMENT_SOURCE.json", (json.dumps(provenance, indent=2) + "\n").encode())
        return {"stage": "SOURCE_RECEIVED", "sourceCommit": revision, "directory": str(output),
                "files": len(rows), "bytes": sum(row["bytes"] for row in rows.values()),
                "managedBootFiles": len(boot), "sourceSelectionSha256": sha((output / "SOURCE_SELECTION.json").read_bytes()),
                "licenseGitBlob": tree["LICENSE"]["gitBlob"], "fulfillmentCommit": fulfillment_revision,
                "fulfillmentFiles": len(fulfillment), "fulfillmentSourceSha256": sha((output / "FULFILLMENT_SOURCE.json").read_bytes())}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Existing original Git checkout, with the selected source objects or its public origin")
    parser.add_argument("--ref", required=True, help="Complete operated Git source revision")
    parser.add_argument("--fulfillment-ref", required=True, help="Complete published Git revision of the source selector, builder, restore helper and guide")
    parser.add_argument("--output", required=True, type=Path, help="New private source snapshot, or the same retained snapshot for exact continuation")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{40}", args.ref):
        parser.error("--ref requires a complete original Git revision")
    if not re.fullmatch(r"[0-9a-f]{40}", args.fulfillment_ref):
        parser.error("--fulfillment-ref requires a complete published Git revision")
    try:
        result = receive(args.repo.expanduser().resolve(strict=True), args.ref, args.fulfillment_ref, args.output.expanduser().resolve())
    except (OSError, ValueError, KeyError, TypeError, StopIteration, subprocess.CalledProcessError) as error:
        print(json.dumps({"stage": "ERROR", "message": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
