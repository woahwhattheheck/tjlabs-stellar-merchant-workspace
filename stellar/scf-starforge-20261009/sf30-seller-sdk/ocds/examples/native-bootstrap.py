#!/usr/bin/env python3
"""Materialize the pinned OCDS source carrier and run its native journey offline."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys

PREFIX = "stellar/scf-starforge-20261009/sf30-seller-sdk/ocds"
SHA = re.compile(r"^[0-9a-f]{40}$")


def relative(value):
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value:
        raise ValueError("A carrier path must be a repository-relative POSIX path.")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..", ".git") for part in value.split("/")):
        raise ValueError("Invalid carrier path: " + value)
    return path


def blob_sha(body):
    return hashlib.sha1(b"blob " + str(len(body)).encode("ascii") + b"\0" + body).hexdigest()


def contained_file(root, name):
    selected = root.joinpath(*relative(name).parts)
    cursor = root
    for part in relative(name).parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError("A source path is a symbolic link: " + str(cursor))
    if not selected.resolve().is_relative_to(root):
        raise ValueError("A source path leaves its selected directory: " + name)
    return selected


def load_sources(carrier, base):
    files = carrier.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("The carrier must contain a nonempty files list.")
    selected, seen = [], set()
    for row in files:
        if not isinstance(row, dict):
            raise ValueError("Every carrier file must be an object.")
        path = str(relative(row.get("path")))
        if path in seen:
            raise ValueError("Duplicate carrier path: " + path)
        seen.add(path)
        expected = row.get("sha", row.get("gitBlob"))
        if not isinstance(expected, str) or not SHA.fullmatch(expected):
            raise ValueError("Missing Git blob SHA for " + path)
        if "base64" in row:
            body = base64.b64decode(row["base64"], validate=True)
        elif row.get("encoding") == "base64" and "content" in row:
            body = base64.b64decode(row["content"], validate=True)
        elif "content" in row and row.get("encoding", "utf-8") == "utf-8":
            body = row["content"].encode("utf-8")
        elif base is not None:
            body = contained_file(base, path).read_bytes()
        else:
            raise ValueError("Carrier bytes or --base are required for " + path)
        if blob_sha(body) != expected:
            raise ValueError("Git blob hash mismatch: " + path)
        if "bytes" in row and row["bytes"] != len(body):
            raise ValueError("Byte count mismatch: " + path)
        mode = str(row.get("mode", "100644"))
        if mode not in ("100644", "100755"):
            raise ValueError("Only regular source files are accepted: " + path)
        selected.append((path, body, 0o755 if mode == "100755" else 0o644))
    return selected


def materialize(directory, files):
    if directory.is_symlink():
        raise ValueError("Choose a real, isolated source directory.")
    directory = directory.resolve()
    if any((parent / ".git").exists() for parent in (directory, *directory.parents)):
        raise ValueError("Choose an isolated directory outside an existing checkout.")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Exact prior files are reusable after an interrupted transfer; edits are preserved.
    for name, body, mode in files:
        target = contained_file(directory, name)
        if target.exists():
            if not target.is_file() or target.read_bytes() != body:
                raise ValueError("Existing file differs; choose a new directory: " + name)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(body)
        target.chmod(mode)
    return directory


def node_path(selected):
    value = selected or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not value:
        raise ValueError("Pass --node with the existing Node 22.13+ executable.")
    path = Path(value).expanduser().resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise ValueError("The selected Node executable is not runnable: " + str(path))
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--carrier", type=Path, required=True)
    parser.add_argument("--commit", required=True, help="exact published source commit")
    parser.add_argument("--directory", type=Path, required=True, help="isolated source directory")
    parser.add_argument("--base", type=Path, help="existing checkout for manifest files without bytes")
    parser.add_argument("--node", help="installed Node 22.13+ executable with node:sqlite")
    parser.add_argument("--entry", default=PREFIX + "/examples/native-journey.mjs")
    parser.add_argument("--commons", type=Path, help="existing Commons checkout; omit for direct Node")
    parser.add_argument("--operation-id", help="original native operation ID when --commons is supplied")
    parser.add_argument("--peer", default="BDA83")
    parser.add_argument("--artifact", action="append", default=[], help="journey output retained on success")
    parser.add_argument("journey_args", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    carrier = json.loads(args.carrier.read_text(encoding="utf-8-sig"))
    if not isinstance(carrier, dict) or not SHA.fullmatch(args.commit):
        raise ValueError("Pass the exact 40-character source commit and a carrier object.")
    if carrier.get("commit") != args.commit:
        raise ValueError("The carrier belongs to a different source commit.")
    if carrier.get("repository") != "woahwhattheheck/tjlabs-stellar-merchant-workspace":
        raise ValueError("The carrier names a different source repository.")
    base = args.base.expanduser().resolve(strict=True) if args.base else None
    if base is not None and not base.is_dir():
        raise ValueError("--base must be an existing checkout directory.")
    if base is not None and args.directory.expanduser().resolve().is_relative_to(base):
        raise ValueError("Choose a source directory separate from --base.")
    files = load_sources(carrier, base)
    names = {row[0] for row in files}
    entry_name = str(relative(args.entry))
    if entry_name not in names:
        raise ValueError("The journey entry must be present in the pinned carrier.")
    node = node_path(args.node)
    directory = materialize(args.directory.expanduser(), files)
    entry = contained_file(directory, entry_name)
    # One browser-module syntax parse, then the single source-owned native programme.
    html_name = PREFIX + "/web/index.html"
    if html_name in names:
        html = contained_file(directory, html_name).read_text(encoding="utf-8")
        scripts = re.findall(r"<script\b[^>]*\btype\s*=\s*['\"]module['\"][^>]*>(.*?)</script\s*>",
                             html, re.IGNORECASE | re.DOTALL)
        if len(scripts) != 1:
            raise ValueError("Expected the single original operator UI module.")
        checked = subprocess.run([str(node), "--input-type=module", "--check"],
                                 input=scripts[0], text=True, cwd=directory)
        if checked.returncode:
            return checked.returncode
    forwarded = args.journey_args[1:] if args.journey_args[:1] == ["--"] else args.journey_args
    command = [str(node), str(entry), *forwarded]
    if args.commons:
        if not args.operation_id:
            raise ValueError("--operation-id is required with the existing Commons runner.")
        runner = args.commons.expanduser().resolve(strict=True) / "host" / "swarm_cloud_job.py"
        if not runner.is_file():
            raise ValueError("The existing Commons checkout has no native job runner.")
        wrapped = [sys.executable, str(runner), "run", args.peer,
                   "--operation-id", args.operation_id, "--project", str(directory),
                   "--runtime-path", str(node)]
        for artifact in args.artifact:
            wrapped.extend(["--artifact-on-success", artifact])
        if args.artifact:
            wrapped.append("--retain-artifacts")
        command = [*wrapped, "--", *command]
    print(json.dumps({"sourceCommit": args.commit, "sourceFiles": len(files),
                      "directory": str(directory), "command": command}), flush=True)
    return subprocess.run(command, cwd=directory).returncode


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("OCDS native bootstrap: " + str(error), file=sys.stderr)
        raise SystemExit(1)
