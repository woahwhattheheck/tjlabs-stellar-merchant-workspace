#!/usr/bin/env python3
"""Receive and restore a selected Airflow runtime from its complete original package graph."""
from __future__ import annotations
import argparse
import datetime as dt
import email
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import uuid
import zipfile

SCHEMA = "commons.airflow-runtime-bundle.v1"
RECEIVING_SCHEMA = "commons.airflow-runtime-receiving.v1"
MANIFEST = "runtime-manifest.json"
ROOT_NAME = "airflow-runtime"
RETENTION_STAGE = ".runtime-retained"
PACKAGE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
VERSION = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.!+_-]*$")
SHA = re.compile(r"^[0-9a-f]{64}$")

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()

def emit(kind, value):
    print(kind + " " + json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)

def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")

def identity(path):
    path = Path(path)
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for part in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(part)
            size += len(part)
    return {"bytes": size, "sha256": digest.hexdigest()}

def key(name):
    return re.sub(r"[-_.]+", "-", name).lower()

def packages(profile):
    rows = profile.get("packages")
    if not isinstance(rows, list) or not rows:
        raise ValueError("Select the complete original installed package inventory")
    selected = {}
    for row in rows:
        if not isinstance(row, dict) or not PACKAGE.fullmatch(row.get("name", "")) or not VERSION.fullmatch(row.get("version", "")):
            raise ValueError("Every original package needs a literal name and version")
        normalized = key(row["name"])
        if normalized in selected:
            raise ValueError("Duplicate original package identity: " + normalized)
        selected[normalized] = row["version"]
    return dict(sorted(selected.items()))

def private(path):
    path = Path(path).absolute()
    for item in [path, *path.parents]:
        if item.is_symlink():
            raise ValueError("Use ordinary original paths: " + str(path))
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir() or path.stat().st_mode & 0o077:
        raise ValueError("Use a private directory: " + str(path))
    return path

def only_retention_staging(directory):
    entries = list(Path(directory).iterdir())
    if not entries:
        return True
    stage = Path(directory) / RETENTION_STAGE
    return (len(entries) == 1 and entries[0] == stage and not stage.is_symlink() and
            stage.is_dir() and all(not item.is_symlink() and item.is_file() and
                                  item.name.endswith(".pending") for item in stage.iterdir()))

def retained(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.is_symlink():
        raise ValueError("Retain an ordinary source file: " + str(path))
    if path.exists():
        if not path.is_file() or path.read_bytes() != raw:
            raise ValueError("Original retained file differs: " + str(path))
        return
    stage = private(path.parent / RETENTION_STAGE)
    descriptor, temporary_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".pending", dir=stage)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            if path.is_symlink() or not path.is_file() or path.read_bytes() != raw:
                raise ValueError("Original retained file differs: " + str(path))
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)

def relative(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("Invalid bundle member path")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..", RETENTION_STAGE) for part in value.split("/")):
        raise ValueError("Invalid bundle member path")
    return path

def read_json(path):
    return json.loads(Path(path).read_bytes())

def redacted_tail(path, limit=3000):
    with Path(path).open("rb") as handle:
        handle.seek(0, 2)
        size = handle.tell()
        handle.seek(max(0, size - limit))
        text = handle.read().decode("utf-8", "replace")
    return "\n".join(line for line in text.splitlines() if not any(word in line.lower()
        for word in ("authorization:", "password=", "token=", "api_key=", "index-url", "looking in indexes")))

def command(logs, name, argv, *, environment=None, timeout=1200):
    logs = private(logs)
    prefix = name + "-" + uuid.uuid4().hex
    output = logs / (prefix + ".log")
    record = {"name": name, "command": list(map(str, argv)), "startedAt": now()}
    with output.open("xb") as handle:
        process = subprocess.Popen(record["command"], stdout=handle, stderr=subprocess.STDOUT,
                                   stdin=subprocess.DEVNULL, env=environment, start_new_session=True)
        record["pid"] = process.pid
        retained(logs / (prefix + ".started.json"), canonical(record))
        emit("RUNTIME_COMMAND", record)
        started = time.monotonic()
        reported = 0
        while process.poll() is None:
            if time.monotonic() - started > timeout:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                record["timedOut"] = True
                break
            if time.monotonic() - reported >= 30:
                reported = time.monotonic()
                emit("RUNTIME_PROGRESS", {"name": name, "pid": process.pid,
                    "bytes": output.stat().st_size, "tail": redacted_tail(output)})
            time.sleep(1)
        handle.flush()
        os.fsync(handle.fileno())
    record.update({"exitCode": process.returncode, "finishedAt": now(), "output": output.name,
                   **identity(output)})
    retained(logs / (prefix + ".finished.json"), canonical(record))
    emit("RUNTIME_COMMAND_FINISHED", record)
    if process.returncode:
        emit("RUNTIME_COMMAND_ERROR", {"name": name, "tail": redacted_tail(output, 16000)})
        raise RuntimeError(name + " returned " + str(process.returncode) + "; original log " + str(output))
    return record

def pip_command(python, action, arguments):
    return [str(python), "-m", "pip", action, "--disable-pip-version-check", "--no-input",
            "--no-cache-dir", "--progress-bar", "off", "--timeout", "20", "--retries", "2", *map(str, arguments)]

def wheel_identity(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.suffix != ".whl":
        raise ValueError("Select an ordinary complete wheel")
    with zipfile.ZipFile(path) as archive:
        metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
        if len(metadata) != 1:
            raise ValueError("Wheel package metadata is ambiguous: " + path.name)
        message = email.message_from_bytes(archive.read(metadata[0]))
    name, version = message.get("Name"), message.get("Version")
    if not PACKAGE.fullmatch(name or "") or not VERSION.fullmatch(version or ""):
        raise ValueError("Wheel package identity is absent: " + path.name)
    return {"name": key(name), "version": version, "path": "wheels/" + path.name, **identity(path)}

def validate_manifest(manifest):
    if manifest.get("schema") != SCHEMA:
        raise ValueError("Select an original Airflow runtime bundle")
    expected = packages(manifest)
    if manifest.get("packageCount") != len(expected):
        raise ValueError("Original runtime package count differs")
    declared = {}
    for row in manifest.get("files", []):
        relative(row.get("path"))
        if row["path"] == MANIFEST or row["path"] in declared or not SHA.fullmatch(row.get("sha256", "")):
            raise ValueError("Bundle file declaration differs")
        if isinstance(row.get("bytes"), bool) or not isinstance(row.get("bytes"), int) or row["bytes"] < 0:
            raise ValueError("Bundle member length differs")
        declared[row["path"]] = row
    if not declared or any(name not in declared for name in ("runtime_bundle.py", "original-profile.json",
                                                           "requirements.txt", "requirements.lock")):
        raise ValueError("Complete runtime sources and original profile are required")
    wheels = manifest.get("wheels")
    if not isinstance(wheels, list) or len(wheels) != len(expected):
        raise ValueError("Receive one complete selected wheel for every original package")
    received = {}
    for row in wheels:
        name = row.get("name")
        if name in received or expected.get(name) != row.get("version"):
            raise ValueError("Original selected wheel package differs")
        declaration = declared.get(row.get("path"))
        if not declaration or any(row.get(field) != declaration.get(field) for field in ("bytes", "sha256")):
            raise ValueError("Original selected wheel bytes differ")
        received[name] = row["version"]
    if received != expected:
        raise ValueError("Complete selected runtime graph is required")
    return declared

def inspect_bundle(directory):
    root = Path(directory).absolute()
    if root.is_symlink():
        raise ValueError("Use the ordinary received bundle")
    raw = (root / MANIFEST).read_bytes()
    manifest = json.loads(raw)
    declared = validate_manifest(manifest)
    observed = set()
    for path in root.rglob("*"):
        if path.is_symlink():
            raise ValueError("A runtime bundle cannot contain symlinks")
        if RETENTION_STAGE in path.relative_to(root).parts or path.is_dir():
            continue
        name = path.relative_to(root).as_posix()
        if name == MANIFEST:
            continue
        observed.add(name)
        row = declared.get(name)
        if not row or identity(path) != {"bytes": row["bytes"], "sha256": row["sha256"]}:
            raise ValueError("Original runtime bundle file differs: " + name)
    if observed != set(declared):
        raise ValueError("Complete runtime bundle files are missing")
    if packages(read_json(root / "original-profile.json")) != packages(manifest):
        raise ValueError("Original installed profile differs from the selected runtime")
    for row in manifest["wheels"]:
        if wheel_identity(root / row["path"]) != row:
            raise ValueError("Original wheel metadata differs: " + row["path"])
    locked = "".join(name + "==" + packages(manifest)[name] + " --hash=sha256:" +
                     next(row["sha256"] for row in manifest["wheels"] if row["name"] == name) + "\n"
                     for name in packages(manifest))
    if (root / "requirements.lock").read_text() != locked:
        raise ValueError("Hash-locked runtime requirements differ")
    return {"directory": str(root), "manifestSha256": hashlib.sha256(raw).hexdigest(),
            "manifest": manifest, "files": len(declared)}

def build_bundle(profile_path, constraints_path, directory, *, source_distributions=(),
                 setuptools_version="80.7.1", wheel_version="0.45.1", operation_id=None):
    profile_raw = Path(profile_path).read_bytes()
    constraints_raw = Path(constraints_path).read_bytes()
    profile = json.loads(profile_raw)
    selected = packages(profile)
    if platform.python_version() != profile.get("pythonVersion", platform.python_version()):
        raise ValueError("Use the selected original Python version")
    constraint_lines = set(constraints_raw.decode("utf-8").splitlines())
    for requirement in ("setuptools==" + setuptools_version, "wheel==" + wheel_version):
        if requirement not in constraint_lines:
            raise ValueError("Build tools must match the retained original Airflow constraints: " + requirement)
    root = private(directory)
    if not only_retention_staging(root) and not (root / "build-selection.json").is_file():
        raise ValueError("Select an empty bundle directory or its retained build selection")
    selection = {"profileSha256": hashlib.sha256(profile_raw).hexdigest(),
                 "constraintsSha256": hashlib.sha256(constraints_raw).hexdigest(),
                 "sourceDistributions": sorted(key(name) for name in source_distributions),
                 "buildPins": {"setuptools": setuptools_version, "wheel": wheel_version}}
    retained(root / "build-selection.json", canonical(selection))
    if (root / MANIFEST).exists():
        return inspect_bundle(root)
    for name in selection["sourceDistributions"]:
        if name not in selected:
            raise ValueError("Select only a source distribution from the original installed graph")
    work = private(root.parent / (root.name + ".build-work"))
    if not only_retention_staging(work) and not (work / "selection.json").is_file():
        raise ValueError("Retain the original selected build workspace")
    retained(work / "selection.json", canonical(selection))
    logs = private(root / "build-logs")
    runtime_wheels = private(root / "wheels")
    builder_wheels = private(root / "build-wheels")
    original_sources = private(root / "original-sources")
    retained(root / "original-profile.json", profile_raw)
    retained(root / "original-airflow-constraints.txt", constraints_raw)
    retained(root / "runtime_bundle.py", Path(__file__).read_bytes())
    guide = Path(__file__).with_name("RUNTIME_BUNDLES.md")
    if guide.is_file():
        retained(root / "RUNTIME_BUNDLES.md", guide.read_bytes())
    requirements = "".join(name + "==" + version + "\n" for name, version in selected.items())
    retained(root / "requirements.txt", requirements.encode())
    builder = work / "builder"
    builder_python = builder / "bin" / "python"
    if not builder_python.exists():
        command(logs, "prepare-build-interpreter", [sys.executable, "-m", "venv", builder])
    build_pins = ["setuptools==" + setuptools_version, "wheel==" + wheel_version]
    command(logs, "receive-original-build-tools", pip_command(builder_python, "download",
        ["--no-deps", "--only-binary=:all:", "--dest", builder_wheels, *build_pins]))
    command(logs, "install-private-build-tools", pip_command(builder_python, "install",
        ["--no-deps", "--no-index", "--find-links", builder_wheels, *build_pins]))
    for name in selection["sourceDistributions"]:
        requirement = name + "==" + selected[name]
        command(logs, "receive-original-source-" + name, pip_command(builder_python, "download",
            ["--no-deps", "--no-build-isolation", "--no-binary=:all:", "--dest", original_sources, requirement]))
        matches = [path for path in original_sources.iterdir()
                   if path.is_file() and key(path.name).startswith(key(name + "-" + selected[name]) + "-")]
        if len(matches) != 1:
            raise ValueError("Select the exact original source archive for " + requirement)
        archive = matches[0]
        retained(root / (name + "-source.json"), canonical({"name": name, "version": selected[name],
            "path": archive.relative_to(root).as_posix(), **identity(archive)}))
        command(logs, "build-original-wheel-" + name, pip_command(builder_python, "wheel",
            ["--no-deps", "--no-build-isolation", "--wheel-dir", runtime_wheels, archive]))
    command(logs, "receive-complete-original-wheelhouse", pip_command(builder_python, "download",
        ["--no-deps", "--only-binary=:all:", "--find-links", runtime_wheels, "--dest",
         runtime_wheels, "--requirement", root / "requirements.txt"]))
    wheels = sorted([wheel_identity(path) for path in runtime_wheels.iterdir()], key=lambda row: row["name"])
    if len(wheels) != len(selected) or {row["name"]: row["version"] for row in wheels} != selected:
        raise ValueError("The complete original package wheelhouse differs")
    locked = "".join(row["name"] + "==" + row["version"] + " --hash=sha256:" + row["sha256"] + "\n"
                     for row in wheels)
    retained(root / "requirements.lock", locked.encode())
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError("Retain ordinary runtime source and wheels")
        if RETENTION_STAGE in path.relative_to(root).parts:
            continue
        if path.is_file():
            files.append({"path": path.relative_to(root).as_posix(), **identity(path)})
    manifest = {"schema": SCHEMA, "operationId": operation_id, "createdAt": now(),
                "pythonVersion": platform.python_version(), "implementation": platform.python_implementation(),
                "system": platform.system(), "machine": platform.machine(),
                "packageCount": len(selected),
                "packages": [{"name": name, "version": version} for name, version in selected.items()],
                "selection": selection, "wheels": wheels, "files": files}
    retained(root / MANIFEST, canonical(manifest))
    return inspect_bundle(root)

def archive_bundle(directory, archive_path):
    inspected = inspect_bundle(directory)
    root, target = Path(directory).absolute(), Path(archive_path).absolute()
    if target.exists():
        raise ValueError("Choose a new archive output path")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=target.name + ".building-", dir=target.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with tarfile.open(temporary, "w:gz", compresslevel=6) as archive:
            for name in [MANIFEST, *[row["path"] for row in inspected["manifest"]["files"]]]:
                archive.add(root / name, arcname=ROOT_NAME + "/" + name, recursive=False)
        with temporary.open("rb") as handle:
            os.fsync(handle.fileno())
        # The complete file appears atomically, without replacing another selected archive.
        os.link(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    return {"path": str(target), **identity(target), "manifestSha256": inspected["manifestSha256"]}

def receive_bundle(archive_path, directory, expected_sha256=None):
    archive_path, target = Path(archive_path), Path(directory).absolute()
    archived = identity(archive_path)
    if expected_sha256 is not None and archived["sha256"] != expected_sha256:
        raise ValueError("The selected complete archive SHA256 differs")
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or any(not member.isfile() for member in members):
            raise ValueError("Receive ordinary unique archive files")
        manifest_name = ROOT_NAME + "/" + MANIFEST
        if manifest_name not in names:
            raise ValueError("Complete runtime manifest is absent")
        raw = archive.extractfile(manifest_name).read()
        manifest = json.loads(raw)
        declared = validate_manifest(manifest)
        expected_names = {manifest_name, *[ROOT_NAME + "/" + name for name in declared]}
        if set(names) != expected_names:
            raise ValueError("Complete runtime archive membership differs")
        for member in members:
            if member.name == manifest_name:
                continue
            row = declared[member.name[len(ROOT_NAME) + 1:]]
            if member.size != row["bytes"]:
                raise ValueError("Original archive member length differs")
            digest = hashlib.sha256()
            with archive.extractfile(member) as handle:
                for part in iter(lambda: handle.read(1024 * 1024), b""):
                    digest.update(part)
            if digest.hexdigest() != row["sha256"]:
                raise ValueError("Original archive member bytes differ")
        digest = hashlib.sha256(raw).hexdigest()
        if target.exists():
            inspected = inspect_bundle(target)
            if inspected["manifestSha256"] != digest:
                raise ValueError("Retain the original receiving selection")
            return {**inspected, "alreadyPresent": True, "archive": archived}
        private(target.parent)
        stage = Path(tempfile.mkdtemp(prefix=target.name + ".receiving-", dir=target.parent))
        try:
            for member in members:
                relative_name = member.name[len(ROOT_NAME) + 1:]
                output = stage / relative(relative_name)
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with archive.extractfile(member) as source, output.open("xb") as destination:
                    shutil.copyfileobj(source, destination, 1024 * 1024)
            inspected = inspect_bundle(stage)
            os.rename(stage, target)
        except BaseException:
            # Preserve the complete or partial receiving directory for inspection.
            raise
    return {**inspect_bundle(target), "alreadyPresent": False, "archive": archived}

def inspect_runtime(python, manifest):
    raw = subprocess.check_output([str(python), "-m", "pip", "list", "--format=json"], text=True)
    actual = {key(row["name"]): row["version"] for row in json.loads(raw)}
    if actual != packages(manifest):
        raise ValueError("Installed runtime differs from the complete original package graph")
    version = subprocess.check_output([str(python), "-c",
        "import platform; print(platform.python_version())"], text=True).strip()
    if version != manifest["pythonVersion"]:
        raise ValueError("Selected original Python version differs")
    return {"python": str(python), "pythonVersion": version,
            "packages": [{"name": name, "version": version} for name, version in sorted(actual.items())]}

def restore_runtime(bundle, destination):
    inspected = inspect_bundle(bundle)
    manifest = inspected["manifest"]
    if (platform.python_version(), platform.python_implementation(), platform.system(), platform.machine()) != (
            manifest["pythonVersion"], manifest["implementation"], manifest["system"], manifest["machine"]):
        raise ValueError("Use the selected original Python implementation, version and host platform")
    target = Path(destination).absolute()
    if target == Path(bundle).absolute() or Path(bundle).absolute() in target.parents:
        raise ValueError("Keep the installed runtime outside the immutable received bundle")
    for item in [target, *target.parents]:
        if item.is_symlink():
            raise ValueError("Use the ordinary original runtime destination")
    marker = target / "runtime-receiving.json"
    python = target / "bin" / "python"
    if marker.exists():
        retained_record = read_json(marker)
        if (retained_record.get("schema") != RECEIVING_SCHEMA or
                retained_record.get("manifestSha256") != inspected["manifestSha256"] or
                retained_record.get("directory") != str(target) or retained_record.get("python") != str(python)):
            raise ValueError("Continue the original received runtime selection at its original absolute location")
        actual = inspect_runtime(python, manifest)
        subprocess.run([str(python), "-m", "pip", "check"], check=True)
        return {**retained_record, "alreadyPresent": True, "inventory": actual}
    if target.exists() and not only_retention_staging(target) and not (target / "runtime-intent.json").exists():
        raise ValueError("Select an empty private runtime directory or its retained receiving intent")
    target = private(target)
    intent = {"schema": RECEIVING_SCHEMA, "manifestSha256": inspected["manifestSha256"],
              "directory": str(target), "python": str(python)}
    retained(target / "runtime-intent.json", canonical(intent))
    logs = private(target.parent / (target.name + ".receiving-logs"))
    if not python.exists():
        command(logs, "create-original-receiving-interpreter", [sys.executable, "-m", "venv", target])
    environment = os.environ.copy()
    environment["PIP_NO_INDEX"] = "1"
    environment["PIP_NO_INPUT"] = "1"
    command(logs, "install-received-original-runtime", pip_command(python, "install",
        ["--no-index", "--find-links", Path(bundle).absolute() / "wheels", "--no-deps", "--force-reinstall",
         "--require-hashes", "--requirement", Path(bundle).absolute() / "requirements.lock"]),
        environment=environment)
    command(logs, "check-received-original-runtime", [python, "-m", "pip", "check"], environment=environment)
    actual = inspect_runtime(python, manifest)
    record = {**intent, "receivedAt": now(), "inventory": actual}
    retained(marker, canonical(record))
    return {**record, "alreadyPresent": False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    build.add_argument("--profile", required=True)
    build.add_argument("--constraints", required=True)
    build.add_argument("--directory", required=True)
    build.add_argument("--source-distribution", action="append", default=[])
    build.add_argument("--setuptools-version", default="80.7.1")
    build.add_argument("--wheel-version", default="0.45.1")
    build.add_argument("--operation-id")
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--bundle", required=True)
    export = commands.add_parser("archive")
    export.add_argument("--bundle", required=True)
    export.add_argument("--output", required=True)
    receive = commands.add_parser("receive")
    receive.add_argument("--archive", required=True)
    receive.add_argument("--directory", required=True)
    receive.add_argument("--sha256")
    restore = commands.add_parser("restore")
    restore.add_argument("--bundle", required=True)
    restore.add_argument("--runtime", required=True)
    args = parser.parse_args()
    if args.command == "build":
        result = build_bundle(args.profile, args.constraints, args.directory,
            source_distributions=args.source_distribution, setuptools_version=args.setuptools_version,
            wheel_version=args.wheel_version, operation_id=args.operation_id)
    elif args.command == "inspect":
        result = inspect_bundle(args.bundle)
    elif args.command == "archive":
        result = archive_bundle(args.bundle, args.output)
    elif args.command == "receive":
        result = receive_bundle(args.archive, args.directory, args.sha256)
    else:
        result = restore_runtime(args.bundle, args.runtime)
    emit("RUNTIME_RESULT", result)

if __name__ == "__main__":
    main()
