#!/usr/bin/env python3
"""Retain the original STAM build's sealed package outside its invocation-local work tree."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time

MAXIMUM_ARCHIVE_BYTES = 16 * 1024 * 1024

def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def identity(path):
    path = Path(path).resolve()
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": digest(path)}

def sync_directory(path):
    descriptor = os.open(str(path), os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def retain_json(path, value):
    """Write one immutable record, completing only an exact interrupted prefix."""
    path = Path(path)
    data = (json.dumps(value, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode()
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError("Existing retained record differs: " + str(path))
        return
    temporary = path.with_name(path.name + ".part")
    existing = temporary.read_bytes() if temporary.exists() else b""
    if len(existing) > len(data) or data[:len(existing)] != existing:
        raise ValueError("Interrupted retained record has another identity: " + str(temporary))
    with temporary.open("ab" if temporary.exists() else "xb") as target:
        target.write(data[len(existing):])
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)
    sync_directory(path.parent)

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def confirm_binding(record, binding):
    if record.get("binding") != binding:
        raise ValueError("Retained original source, input, operation or runner binding differs")

def confirm_file(path, metadata):
    path = Path(path)
    if not path.is_file() or path.stat().st_size != metadata["bytes"] or digest(path) != metadata["sha256"]:
        raise ValueError("Retained original artifact bytes differ: " + str(path))

def recover_record(path, binding, schema):
    """Promote one complete original part; never guess an incomplete record."""
    path = Path(path)
    if path.is_file():
        return read(path)
    partial = path.with_name(path.name + ".part")
    if not partial.is_file():
        return None
    try:
        value = read(partial)
    except (ValueError, UnicodeError):
        return None
    confirm_binding(value, binding)
    if value.get("schema") != schema:
        raise ValueError("Original record part has another schema")
    if schema == "stam.retained-build-terminal.v1" and type(value.get("exitCode")) is not int:
        raise ValueError("Original terminal part has another exit outcome")
    retain_json(path, value)
    return value

def copy_original(source, target, metadata):
    source, target = Path(source), Path(target)
    if target.exists():
        confirm_file(target, metadata)
        return
    partial = target.with_name(target.name + ".part")
    if partial.is_file() and partial.stat().st_size == metadata["bytes"]:
        confirm_file(partial, metadata)
        os.replace(partial, target)
        sync_directory(target.parent)
        return
    if not source.is_file():
        raise RuntimeError("The original sealed source is unavailable; retain the partial copy and original native record")
    confirm_file(source, metadata)
    copied = partial.stat().st_size if partial.exists() else 0
    if copied > metadata["bytes"]:
        raise ValueError("Interrupted artifact copy exceeds the original file")
    if copied:
        with source.open("rb") as original, partial.open("rb") as old:
            remaining = copied
            while remaining:
                amount = min(1024 * 1024, remaining)
                if original.read(amount) != old.read(amount):
                    raise ValueError("Interrupted artifact copy is not the exact original prefix")
                remaining -= amount
    with source.open("rb") as original, partial.open("ab" if partial.exists() else "xb") as output:
        original.seek(copied)
        while True:
            chunk = original.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)
        output.flush()
        os.fsync(output.fileno())
    confirm_file(partial, metadata)
    os.replace(partial, target)
    sync_directory(target.parent)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--programme", required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--node", required=True)
    parser.add_argument("--operation-id", required=True)
    parser.add_argument("--shared-output", required=True)
    parser.add_argument("--retention-module", required=True)
    parser.add_argument("--helper-directory", required=True)
    args = parser.parse_args()
    output, work = Path(args.shared_output).resolve(), Path(args.root).resolve()
    output.mkdir(parents=True, exist_ok=True)
    binding = {"operationId": args.operation_id, "programme": identity(args.programme),
               "input": identity(args.input), "node": str(Path(args.node).resolve()),
               "privateWork": str(work)}
    with (output / ".build-retention.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        retain_json(output / "BUILD_INPUTS.json", {"schema": "stam.retained-build-inputs.v1", "binding": binding})
        receipt_path, copy_path = output / "BUILD_ARTIFACT.json", output / "ARTIFACT_COPY.json"
        retained = recover_record(receipt_path, binding, "stam.retained-artifact.v1")
        if retained is not None:
            confirm_binding(retained, binding)
            target = Path(retained["path"])
            if target.parent != output:
                raise ValueError("Retained artifact is outside the selected shared output")
            confirm_file(target, retained)
            exit_code = int(retained["buildExitCode"])
            print(json.dumps({"stage": "retained-original-artifact", "artifact": retained}), flush=True)
        else:
            copy = recover_record(copy_path, binding, "stam.original-artifact-copy.v1")
            if copy is not None:
                confirm_binding(copy, binding)
            else:
                started_path, terminal_path = output / "BUILD_STARTED.json", output / "BUILD_TERMINAL.json"
                if started_path.is_file():
                    confirm_binding(read(started_path), binding)
                    terminal = recover_record(terminal_path, binding, "stam.retained-build-terminal.v1")
                    if terminal is None:
                        raise RuntimeError("Original builder has an unresolved started record; no automatic build replay")
                    confirm_binding(terminal, binding)
                    exit_code = int(terminal["exitCode"])
                else:
                    work.mkdir(parents=True, exist_ok=True)
                    retain_json(started_path, {"schema": "stam.retained-build-start.v1",
                                               "binding": binding})
                    command = [sys.executable, "-B", args.programme, "--root", str(work),
                               "--input", args.input, "--node", args.node, "--operation-id", args.operation_id]
                    print(json.dumps({"stage": "original-build-dispatch", "at": time.time(),
                                      "operationId": args.operation_id}), flush=True)
                    process = subprocess.run(command, check=False)
                    exit_code = process.returncode
                    print(json.dumps({"stage": "original-build-returned", "at": time.time(),
                                      "operationId": args.operation_id, "exitCode": exit_code}), flush=True)
                    retain_json(terminal_path, {"schema": "stam.retained-build-terminal.v1",
                                                "binding": binding, "exitCode": exit_code})
                source_receipt = work / "BUILD_ARTIFACT.json"
                if not source_receipt.is_file():
                    raise RuntimeError("Original builder returned without a sealed artifact; its actual terminal return is retained")
                original = read(source_receipt)
                source = Path(original["path"]).resolve()
                if source.parent != work:
                    raise ValueError("Original sealed artifact is outside the selected private work tree")
                confirm_file(source, original)
                if original["bytes"] > MAXIMUM_ARCHIVE_BYTES:
                    raise ValueError("Actual archive exceeds the declared 16 MiB shared-output bound")
                copy = {"schema": "stam.original-artifact-copy.v1", "binding": binding,
                        "artifact": original, "buildExitCode": exit_code}
                retain_json(copy_path, copy)
            original = copy["artifact"]
            if not isinstance(original["bytes"], int) or not 0 < original["bytes"] <= MAXIMUM_ARCHIVE_BYTES:
                raise ValueError("Retained archive size is outside the selected bound")
            source = Path(original["path"]).resolve()
            if source.parent != work:
                raise ValueError("Retained original source path differs from the selected work tree")
            target = output / source.name
            copy_original(source, target, original)
            retained = dict(original)
            retained.update({"schema": "stam.retained-artifact.v1", "path": str(target), "operationId": args.operation_id, "binding": binding,
                             "originalPrivatePath": str(source), "buildExitCode": int(copy["buildExitCode"])})
            retain_json(receipt_path, retained)
            exit_code = int(retained["buildExitCode"])
            print(json.dumps({"stage": "sealed-artifact-retained", "artifact": retained}), flush=True)
        spec = importlib.util.spec_from_file_location("original_artifact_retention", args.retention_module)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.retain_artifact(output / "retention", retained, args.operation_id + "-RETURN",
                               args.helper_directory, input_stream=sys.stdin,
                               emit=lambda value: print(value, flush=True), artifact_type="other")
        return exit_code

if __name__ == "__main__":
    raise SystemExit(main())
