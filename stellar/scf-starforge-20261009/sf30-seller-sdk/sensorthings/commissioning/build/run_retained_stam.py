#!/usr/bin/env python3
"""Materialize a source-pinned STAM continuation and enter the original foreground scheduler."""
import argparse
import ast
import hashlib
import json
import os
import sys
import tty
from pathlib import Path, PurePosixPath

BUSINESS_OPERATION = "DATACOVE-STAM-ASSETS-5403-20261012"
NATIVE_OPERATION = BUSINESS_OPERATION + "-RETAINED-CONTINUATION"
CONTROL_ROOT = Path("/workspace/scratch/5403360e55a4/datacove-stam-native")
PRIVATE_ROOT = Path("/dev/datacove-stam-assets-5403-retained")
HOST_ROOT = Path("/workspace/scratch/dbc61db6310c/native-runtime-recovery-62c14ca9/host")
NODE = "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node"

def write_exact(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError("Retained source changed: " + str(path))
        return
    temporary = path.with_name(path.name + ".part")
    previous = temporary.read_bytes() if temporary.exists() else b""
    if len(previous) > len(data) or data[:len(previous)] != previous:
        raise RuntimeError("Retained source partial has another identity: " + str(path))
    with temporary.open("ab" if temporary.exists() else "xb") as target:
        target.write(data[len(previous):])
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)

def main():
    tty.setraw(sys.stdin.fileno())
    print("STAM_RETAINED_SOURCE_INPUT_READY", flush=True)
    line = b""
    while not line.endswith(b"\n"):
        piece = os.read(0, 1)
        if not piece:
            raise RuntimeError("Original input header ended")
        line += piece
        if len(line) > 24:
            raise RuntimeError("Input header too long")
    size = int(line)
    if not 1 <= size <= 1000000:
        raise RuntimeError("Input size out of bounds")
    body = bytearray()
    while len(body) < size:
        part = os.read(0, min(32768, size - len(body)))
        if not part:
            raise RuntimeError("Input ended before selected byte count")
        body.extend(part)
    value = json.loads(body)
    if value.get("operation") != BUSINESS_OPERATION or value.get("nativeOperation") != NATIVE_OPERATION:
        raise RuntimeError("Original business/native continuation identity differs")
    if value.get("controlRoot") != str(CONTROL_ROOT) or value.get("privateRoot") != str(PRIVATE_ROOT):
        raise RuntimeError("Selected storage placement differs")
    source = CONTROL_ROOT / "code"
    source.mkdir(parents=True, exist_ok=True)
    written = []
    for name, item in value["files"].items():
        rel = PurePosixPath(name)
        if rel.is_absolute() or ".." in rel.parts:
            raise RuntimeError("Unsafe source name")
        data = item["text"].encode()
        actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if actual != item["git_blob"]:
            raise RuntimeError("Source blob differs: " + name)
        if name.endswith(".py"):
            ast.parse(item["text"], filename=name)
        write_exact(source / name, data)
        written.append({"path": name, "bytes": len(data), "blob": actual})
    predecessor = CONTROL_ROOT / "ORIGINAL_ATTEMPT.json"
    predecessor_bytes = (json.dumps(value["originalAttempt"], sort_keys=True, indent=2) + "\n").encode()
    write_exact(predecessor, predecessor_bytes)
    output = CONTROL_ROOT / "output"
    output.mkdir(exist_ok=True)
    PRIVATE_ROOT.mkdir(parents=True, exist_ok=True)
    print(json.dumps({"stage": "SOURCE_MATERIALIZED", "controlRoot": str(CONTROL_ROOT),
                      "privateRoot": str(PRIVATE_ROOT), "input_sha256": hashlib.sha256(body).hexdigest(),
                      "files": written}), flush=True)
    sys.path.insert(0, str(HOST_ROOT))
    import swarm_cloud_job as native
    from native_foreground import ForegroundLaunch
    parser = argparse.ArgumentParser()
    native.launch_options(parser)
    args = parser.parse_args([
        "datacove-stam-assets-5403", "--operation-id", NATIVE_OPERATION,
        "--project", str(output), "--records-root", str(CONTROL_ROOT / "records"),
        "--worker-root", str(CONTROL_ROOT / "worker"), "--temp-root", str(PRIVATE_ROOT / "launcher-tmp"),
        "--runtime-consumers-root", "/workspace/shared/swarm/jobs/runtime-consumers",
        "--runtime-path", str(source), "--runtime-path", NODE,
        "--memory-mib", "1536", "--memory-reserve-mib", "128", "--memory-reclaim", "clean-cache",
        "--memory-reservations-root", "/workspace/shared/swarm/capacity/memory",
        "--disk-space", str(PRIVATE_ROOT) + "=1024", "--disk-inodes", str(PRIVATE_ROOT) + "=80000",
        "--disk-space", str(CONTROL_ROOT) + "=20", "--disk-inodes", str(CONTROL_ROOT) + "=3000",
        "--disk-reserve-mib", "4", "--disk-reserve-inodes", "128",
        "--disk-reservations-root", "/workspace/shared/swarm/capacity/disk",
        "--artifact", "BUILD_ARTIFACT.json", "--report-format", "summary"
    ])
    args.command = [
        sys.executable, "-B", str(source / "retain_stam_build.py"),
        "--programme", str(source / "build_stam_assets.py"), "--root", str(PRIVATE_ROOT / "work"),
        "--input", str(source / "stam-input.json"), "--node", NODE, "--operation-id", BUSINESS_OPERATION,
        "--shared-output", str(output), "--retention-module", str(source / "hosted_artifact_retention.py"),
        "--helper-directory", str(source / "helpers")
    ]
    launcher = ForegroundLaunch(native)
    try:
        report = native.start(args, launcher=launcher)
        print(json.dumps(native.report_value(report, "summary")), flush=True)
    finally:
        if launcher.root is not None:
            code = launcher.handoff()
            if code is not None:
                raise SystemExit(code)

if __name__ == "__main__":
    main()
