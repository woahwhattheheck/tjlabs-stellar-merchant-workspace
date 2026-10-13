#!/usr/bin/env python3
"""Source-only composition and verification for the original PMRS staff extension.

Native mutations use cli.py action/resume and the original Workspace journal.
This tool cannot send a Dataverse request or change a portfolio.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import sys
import tempfile
from dataverse_contract import require, parse_json, json_bytes, sha256, DataverseError
from staff_native import _parse, verify_capture
from staff_programme import validate_programme, verify_programme
from staff_spec import installation_template, compose_staff_solution
from staff_build import verify_build_directory

def read(path, maximum=256 * 1024 * 1024):
    source = Path(path)
    require(source.is_file() and not source.is_symlink(), "STAFF_TOOL_SOURCE", "Read a complete regular original file.")
    require(source.stat().st_size <= maximum, "STAFF_TOOL_SIZE", "The complete source exceeds the explicit bound.")
    return source.read_bytes()

def publish(destination, raw):
    path = Path(destination).expanduser().absolute()
    require(path.parent.is_dir() and not path.is_symlink(), "STAFF_TOOL_DESTINATION", "Select an existing output directory.")
    if path.exists():
        require(path.is_file() and path.read_bytes() == raw, "STAFF_TOOL_CONFLICT", "The output already contains different original bytes.")
        return {"path": str(path), "bytes": len(raw), "sha256": sha256(raw), "reused": True}
    fd, name = tempfile.mkstemp(prefix=".staff-source-", suffix=".partial", dir=path.parent)
    temporary = Path(name)
    # Failed or interrupted prefixes remain available as actual operation evidence.
    with os.fdopen(fd, "wb") as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    require(temporary.read_bytes() == raw, "STAFF_TOOL_WRITE", "The complete source publication changed.")
    try:
        os.link(temporary, path)
    except FileExistsError:
        require(path.is_file() and not path.is_symlink() and path.read_bytes() == raw,
                "STAFF_TOOL_CONFLICT", "Another source owns the selected output.")
    directory = os.open(path.parent, os.O_RDONLY)
    try: os.fsync(directory)
    finally: os.close(directory)
    temporary.unlink()
    return {"path": str(path), "bytes": len(raw), "sha256": sha256(raw), "reused": False}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    template = sub.add_parser("installation-template")
    template.add_argument("--project", required=True); template.add_argument("--source-refs", required=True)
    template.add_argument("--out", required=True)
    compose = sub.add_parser("compose")
    for name in ("base", "installation", "snapshot", "build-root", "source-root", "out"):
        compose.add_argument("--" + name, required=True)
    validate = sub.add_parser("programme-validate"); validate.add_argument("--file", required=True)
    for kind in ("programme-verify", "capture-verify"):
        check = sub.add_parser(kind); check.add_argument("--file", required=True); check.add_argument("--portfolio", required=True)
    args = parser.parse_args(argv)
    if args.command == "installation-template":
        value = installation_template(parse_json(read(args.project)), parse_json(read(args.source_refs)))
        result = publish(args.out, json_bytes(value))
    elif args.command == "compose":
        build = verify_build_directory(args.build_root)
        dll = read(Path(args.build_root) / build["dll"]["path"], 16 * 1024 * 1024)
        value = compose_staff_solution(parse_json(read(args.base)), parse_json(read(args.installation)),
            parse_json(read(args.snapshot)), build, dll, args.source_root, args.build_root)
        result = publish(args.out, json_bytes(value))
    elif args.command == "programme-validate":
        raw = read(args.file, 1024 * 1024); value = validate_programme(_parse(raw.decode("utf-8")))
        result = {"schema": "tjlabs.pmrs.staff-programme-source-check/v1",
                  "programmeId": value["id"], "bytes": len(raw), "sha256": sha256(raw),
                  "projects": len(value["projects"]), "steps": sum(len(x["steps"]) for x in value["projects"]),
                  "nativeExecuted": False}
    else:
        value, portfolio = parse_json(read(args.file)), parse_json(read(args.portfolio))
        if value.get("kind") in ("staff-programme", "staff-history") and "value" in value:
            require(value.get("portfolio") == portfolio, "STAFF_TOOL_PORTFOLIO", "Select the original record's receiving portfolio.")
            value = value["value"]
        result = verify_programme(value, portfolio) if args.command == "programme-verify" else verify_capture(value, portfolio)
        # Token-preserving parsed members are represented through original
        # canonical staff text, not silently recast as JSON strings.
        if args.command == "capture-verify":
            result = {"portfolio": result["portfolio"], "selection": result["selection"],
                      "member_refs": result["member_refs"], "capture_sha256": result["capture_sha256"]}
    sys.stdout.buffer.write(json_bytes(result))
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except Exception as error:
        sys.stdout.buffer.write(json_bytes({"schema": "tjlabs.pmrs.staff-tool.error/v1",
            "code": getattr(error, "code", type(error).__name__), "message": str(error)}))
        raise SystemExit(1)
