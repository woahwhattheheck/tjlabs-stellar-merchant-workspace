#!/usr/bin/env python3
"""Receive the saved GovHub/Tome application, original runtime, and native workflow.

Copyright 2026 TokenJunkie Labs contributors.
Licensed under the Apache License, Version 2.0; see ../../../LICENSE.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile

# Native source and helper identities come from one explicit private selection.
OPERATION = COMMIT = APP_MANIFEST_SHA = None
APP_ZIP = TOME = PINS = HELPERS = SOURCE_SELECTION = None


def configure_selection(path):
    global OPERATION, COMMIT, APP_MANIFEST_SHA, APP_ZIP, TOME, PINS, HELPERS, SOURCE_SELECTION
    selected = read(absolute(path))
    if selected.get("schema") != "govhub.tome-portable-source-selection.v1":
        raise ValueError("Select the complete original source and runtime identities.")
    operation = selected.get("operation_id", "")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,159}", operation):
        raise ValueError("Retain an explicit original commissioning operation ID.")
    if not re.fullmatch(r"[0-9a-f]{40}", selected.get("source_commit", "")):
        raise ValueError("Select the actual complete application commit.")
    if not re.fullmatch(r"[0-9a-f]{64}", selected.get("application_manifest_sha256", "")):
        raise ValueError("Select the original complete application source lock.")
    for key in ("application_zip", "tome_archive"):
        item = selected.get(key, {})
        if (type(item.get("bytes")) is not int or item["bytes"] <= 0
                or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", ""))):
            raise ValueError("Retain exact complete archive size and hash: " + key)
    pins = selected.get("pins", {})
    for name in ("builder", "runtime_receiver", "native", "browser", "browser_guide"):
        item = pins.get(name, {})
        if (type(item.get("bytes")) is not int or item["bytes"] <= 0
                or not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", ""))):
            raise ValueError("Retain each complete receiving programme identity: " + name)
    for key in ("source_files", "zip_members"):
        if type(selected.get(key)) is not int or selected[key] < 1:
            raise ValueError("Retain the original application member counts.")
    if not isinstance(selected.get("site_mail"), str) or "@" not in selected["site_mail"]:
        raise ValueError("Select the actual native site administrator email.")
    OPERATION, COMMIT = operation, selected["source_commit"]
    APP_MANIFEST_SHA = selected["application_manifest_sha256"]
    APP_ZIP, TOME, PINS = selected["application_zip"], selected["tome_archive"], pins
    HELPERS = selected.get("delivery_helpers", {})
    if not isinstance(HELPERS, dict):
        raise ValueError("Use a filename to SHA-256 map for optional original delivery helpers.")
    for name, digest_value in HELPERS.items():
        if Path(name).name != name or not re.fullmatch(r"[0-9a-f]{64}", digest_value):
            raise ValueError("An original delivery helper identity is invalid.")
    SOURCE_SELECTION = selected

BLOCK = 1024 * 1024
STAMP = (2026, 10, 12, 0, 0, 0)

def encoded(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, indent=2) + "\n").encode()

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def identity(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("Select the original ordinary file: " + str(path))
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(BLOCK), b""):
            h.update(chunk)
            size += len(chunk)
    return {"path": str(path), "bytes": size, "sha256": h.hexdigest()}

def equal_file(path, expected):
    got = identity(path)
    if any(got[key] != expected[key] for key in ("bytes", "sha256")):
        raise ValueError("The selected original file changed: " + str(path))
    return got

def absolute(value, *, directory=False, create=False):
    path = Path(value).expanduser()
    if not path.is_absolute() or path.is_symlink():
        raise ValueError("Use the actual absolute receiving path: " + str(value))
    if create:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = path.resolve(strict=True)
    if directory is not None and directory != path.is_dir():
        raise ValueError("The selected path has the wrong file type: " + str(path))
    return path

def read(path):
    return json.loads(Path(path).read_bytes())

def put(path, raw, *, unchanged=False, mode=0o600):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError("A link occupies the retained receiving file.")
    if path.exists() and unchanged:
        if path.read_bytes() != raw:
            raise ValueError("Reopen the same retained source or request: " + str(path))
        return path
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(temporary, mode)
        if unchanged:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return path

def retained_json(path, value):
    return put(path, encoded(value), unchanged=True)

def load_module(name, path, pin):
    equal_file(path, pin)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

def emit(stage, **fields):
    print(json.dumps({"stage": stage, "operation": OPERATION, **fields}), flush=True)

def bootstrap_application(archive_path, root):
    equal_file(archive_path, APP_ZIP)
    with zipfile.ZipFile(archive_path) as archive:
        name = "govhub-operations/workspace/build_application.py"
        info = archive.getinfo(name)
        if info.file_size != PINS["builder"]["bytes"]:
            raise ValueError("The original application builder has another length.")
        raw = archive.read(info)
    builder_path = put(root / "source" / "build_application.py", raw, unchanged=True)
    builder = load_module("govhub_portable_original_builder", builder_path, PINS["builder"])
    verified = builder.verify_package(archive_path, expected_sha256=APP_ZIP["sha256"])
    if verified["source_commit"] != COMMIT or verified["source_files"] != SOURCE_SELECTION["source_files"] or verified["zip_members"] != SOURCE_SELECTION["zip_members"]:
        raise ValueError("The saved application belongs to another complete source edition.")
    receiving = root / "application"
    receiving.mkdir(mode=0o700, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.infolist():
            relative = PurePosixPath(builder.relative_name(member.filename))
            target = receiving.joinpath(*relative.parts)
            for parent in target.parents:
                if parent == receiving:
                    break
                if parent.is_symlink():
                    raise ValueError("An application receiving parent became a link.")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with archive.open(member) as incoming:
                raw = incoming.read()
            put(target, raw, unchanged=True, mode=(member.external_attr >> 16) & 0o777)
    application = receiving / builder.ROOT
    source_manifest = identity(application / "APPLICATION_SOURCE.json")
    if source_manifest["sha256"] != APP_MANIFEST_SHA:
        raise ValueError("The original selected application manifest changed.")
    retained_json(root / "application-receiving.json", {
        "schema": "govhub.tome-portable-application.v1", "archive": identity(archive_path),
        "verification": verified, "application": str(application),
        "source_manifest": source_manifest, "builder": PINS["builder"],
    })
    return application

def bootstrap_runtime_receiver(archive_path, root, expected_sha256):
    archive_identity = identity(archive_path)
    if archive_identity["sha256"] != expected_sha256:
        raise ValueError("Select the actual published original runtime archive.")
    raw = None
    with tarfile.open(archive_path, "r|gz") as archive:
        for member in archive:
            if member.name != "drupal_runtime_handover.py":
                continue
            if not member.isfile() or member.size != PINS["runtime_receiver"]["bytes"]:
                raise ValueError("The runtime archive has another original receiving programme.")
            raw = archive.extractfile(member).read()
            break
    if raw is None:
        raise ValueError("The complete original runtime receiver is absent from its archive.")
    path = put(root / "source" / "drupal_runtime_handover.py", raw, unchanged=True)
    return load_module("govhub_portable_original_runtime", path, PINS["runtime_receiver"])

def command(root, name, argv, *, cwd, env):
    directory = root / "commands"
    directory.mkdir(mode=0o700, exist_ok=True)
    number = len(list(directory.glob(name + "-*.json"))) + 1
    base = directory / (name + "-" + str(number).zfill(4))
    record = {"schema": "govhub.tome-original-command.v1", "name": name,
              "argv": [str(x) for x in argv], "cwd": str(cwd), "started_at": time.time(),
              "stdout": str(base.with_suffix(".stdout")), "stderr": str(base.with_suffix(".stderr"))}
    put(base.with_suffix(".json"), encoded(record))
    with base.with_suffix(".stdout").open("xb") as stdout, base.with_suffix(".stderr").open("xb") as stderr:
        process = subprocess.Popen(record["argv"], cwd=cwd, env=env, stdout=stdout, stderr=stderr)
        record["pid"] = process.pid
        put(base.with_suffix(".json"), encoded(record))
        try:
            record["returncode"] = process.wait()
        except BaseException:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise
        finally:
            record["finished_at"] = time.time()
            if process.returncode is not None:
                record["returncode"] = process.returncode
            put(base.with_suffix(".json"), encoded(record))
    emit("ORIGINAL_COMMAND_RETURNED", name=name, returncode=record["returncode"], record=str(base.with_suffix(".json")))
    if record["returncode"]:
        raise RuntimeError("Continue the retained original " + name + " command: " + str(base.with_suffix(".json")))
    return record

def source_files(root):
    members = []
    for directory in (root / "native", root / "browser", root / "source"):
        for path in sorted(directory.rglob("*")):
            if path.is_dir() and not path.is_symlink():
                continue
            relative = path.relative_to(root).as_posix()
            if relative == "source/PORTABLE_RECEIVING.md":
                relative = "START_HERE.md"
            if path.is_symlink():
                literal = os.readlink(path)
                resolved = path.resolve(strict=True)
                if (Path(literal).is_absolute() or not any(resolved.is_relative_to(part)
                        for part in (root / "native", root / "browser", root / "source"))):
                    raise ValueError("An original release link escapes its complete retained tree.")
                raw = literal.encode("utf-8")
                members.append({"name": relative, "path": str(path), "kind": "symlink",
                    "link_target": literal, "bytes": len(raw), "sha256": digest(raw), "mode": 0o777})
            else:
                if not path.is_file():
                    raise ValueError("Receive the original ordinary operation member: " + str(path))
                members.append({"name": relative, **identity(path), "kind": "file", "mode": 0o600})
    for name in ("input.json", "application-receiving.json", "runtime-receiving.json", "native-complete.json"):
        path = root / name
        members.append({"name": name, **identity(path), "kind": "file", "mode": 0o600})
    names = [row["name"] for row in members]
    if len(names) != len(set(names)) or sum(row["bytes"] for row in members) > 2 * 1024 * 1024 * 1024:
        raise ValueError("The complete operating handover exceeds its declared member inventory.")
    return sorted(members, key=lambda row: row["name"])

def verify_archive(path, expected_manifest):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        expected = {row["name"]: row for row in expected_manifest["files"]}
        if len(infos) != len(expected) + 1 or len({x.filename for x in infos}) != len(infos):
            raise ValueError("The operating handover inventory changed.")
        if archive.read("PACKAGE.json") != encoded(expected_manifest):
            raise ValueError("The operating handover manifest changed.")
        if {x.filename for x in infos} != set(expected) | {"PACKAGE.json"}:
            raise ValueError("The original complete operating handover has missing members.")
        for name, row in expected.items():
            member = archive.getinfo(name)
            kind = stat.S_IFLNK if row["kind"] == "symlink" else stat.S_IFREG
            if (stat.S_IFMT(member.external_attr >> 16) != kind
                    or (member.external_attr >> 16) & 0o777 != row["mode"]):
                raise ValueError("The original file or release-link type changed: " + name)
            if row["kind"] == "symlink" and archive.read(name) != row["link_target"].encode("utf-8"):
                raise ValueError("The original release-link target changed: " + name)
            h = hashlib.sha256()
            size = 0
            with archive.open(name) as incoming:
                for chunk in iter(lambda: incoming.read(BLOCK), b""):
                    h.update(chunk)
                    size += len(chunk)
            if size != row["bytes"] or h.hexdigest() != row["sha256"]:
                raise ValueError("The operating handover differs at " + name)
    return identity(path)

def package_operation(root, native, browser, selection):
    output = root / "delivery"
    output.mkdir(mode=0o700, exist_ok=True)
    rows = source_files(root)
    manifest = {"schema": "govhub.tome-complete-native-package.v1", "operation": OPERATION,
        "source_commit": COMMIT, "input_sha256": digest(encoded(selection)),
        "runtime_archive": selection["runtime_archive"], "application_archive": selection["application_zip"],
        "native_result": identity(root / "native/delivery/GovHub-Tome-Native-Result.json"),
        "browser_result": identity(root / "browser/GovHub-Tome-Browser-Receiving.json"),
        "site_uuid": native["site_uuid"], "edition_ids": native["edition_ids"],
        "selected_release": native["selected_release"], "browser_workspaces": len(browser["runs"]),
        "files": [{key: row[key] for key in ("name", "bytes", "sha256", "mode", "kind", "link_target")
                   if key in row} for row in rows]}
    path = output / "GovHub-Tome-Native-Receiving.zip"
    if not path.exists():
        fd, temporary = tempfile.mkstemp(prefix=".tome-receiving-", suffix=".zip", dir=output)
        os.close(fd)
        try:
            with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for row in rows:
                    info = zipfile.ZipInfo(row["name"], STAMP)
                    info.create_system = 3
                    kind = stat.S_IFLNK if row["kind"] == "symlink" else stat.S_IFREG
                    info.external_attr = (kind | row["mode"]) << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    if row["kind"] == "symlink":
                        if not Path(row["path"]).is_symlink() or os.readlink(row["path"]) != row["link_target"]:
                            raise ValueError("The original current/release link changed during packaging.")
                        archive.writestr(info, row["link_target"].encode("utf-8"))
                        continue
                    h = hashlib.sha256()
                    count = 0
                    with Path(row["path"]).open("rb") as incoming, archive.open(info, "w", force_zip64=True) as outgoing:
                        for chunk in iter(lambda: incoming.read(BLOCK), b""):
                            outgoing.write(chunk)
                            h.update(chunk)
                            count += len(chunk)
                    if count != row["bytes"] or h.hexdigest() != row["sha256"]:
                        raise ValueError("The completed source changed while packaging.")
                info = zipfile.ZipInfo("PACKAGE.json", STAMP)
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o600) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, encoded(manifest))
            verify_archive(Path(temporary), manifest)
            os.link(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    result = verify_archive(path, manifest)
    retained_json(output / "PACKAGE.json", manifest)
    retained_json(output / "NATIVE_RECEIVING.json", {
        "schema": "govhub.tome-portable-native-complete.v1", "operation": OPERATION,
        "status": "COMPLETE", "input_sha256": digest(encoded(selection)),
        "native": native, "browser": browser, "package": result,
        "manifest": identity(output / "PACKAGE.json"),
    })
    return [path, output / "PACKAGE.json", output / "NATIVE_RECEIVING.json",
            root / "native/delivery/GovHub-Tome-Native-Result.json",
            root / "browser/GovHub-Tome-Browser-Receiving.json", root / "source/PORTABLE_RECEIVING.md"]

def publish(root, paths, selected, delivery_module, helpers):
    ledger = root / "publication.json"
    signature = {"operation": OPERATION, "input_sha256": digest(encoded(selected)),
                 "files": [identity(path) for path in paths]}
    if ledger.exists():
        previous = read(ledger)
        if previous.get("input") != signature:
            raise ValueError("The retained publication selects different original artifacts.")
        if previous.get("state") == "COMPLETE":
            return previous
        raise RuntimeError("Continue the original retained transfer and provider responses at " + str(root / "save"))
    save = root / "save"
    save.mkdir(mode=0o700, exist_ok=False)
    original = delivery_module.RetainedFileTransfer(helpers, save, paths)
    record = {"schema": "govhub.tome-original-native-publication.v1", "state": "STARTED", "input": signature}
    put(ledger, encoded(record))
    request = {"uploads": [{"local_path": str(path), "purpose": "create_library_file",
                            "library_artifact_type": "other"} for path in paths]}
    outcome = original.run(request)
    while True:
        rows = outcome.get("results", [])
        complete = len(rows) == len(paths) and all(
            row.get("status") == "succeeded" and row.get("purpose") == "create_library_file"
            and row.get("local_path") == str(path) and row.get("file_id") and row.get("library_file_id")
            for row, path in zip(rows, paths))
        record = {**record, "state": "COMPLETE" if complete else "PARTIAL", "result": outcome}
        put(ledger, encoded(record))
        if complete:
            emit("TOME_PORTABLE_DELIVERY_COMPLETE", publication=str(ledger), result=record)
            return record
        emit("TOME_PORTABLE_TRANSFER_RETAINED", directory=str(root), publication=str(ledger),
             result=record, commands=["status", "resume-original"])
        line = sys.stdin.readline()
        if not line:
            raise RuntimeError("Retain this original directory and reconcile its existing provider calls before continuing.")
        try:
            command = json.loads(line)
            if command.get("action") == "resume-original":
                outcome = original.resume_original()
            elif command.get("action") == "status":
                outcome = original.snapshot()
            else:
                raise ValueError("Use status or resume-original on the original transfer.")
        except Exception as error:
            original.last_error = {"type": type(error).__name__, "details_path": str(original.root)}
            put(original.root / "portable-continuation-error.json", encoded({
                "type": type(error).__name__, "message": str(error)}))
            outcome = original.snapshot()

def run(args):
    os.umask(0o077)
    configure_selection(args.source_selection)
    sys.dont_write_bytecode = True
    root = absolute(args.directory, directory=True, create=True)
    archive = absolute(args.application_zip)
    runtime_archive = absolute(args.runtime_archive)
    tome = absolute(args.tome_archive)
    browser_file = absolute(args.browser)
    browser_guide_file = absolute(args.browser_guide)
    delivery_file = absolute(args.delivery_programme) if args.delivery_programme else None
    guide_file = absolute(args.guide)
    helpers = absolute(args.library_helpers, directory=True) if args.library_helpers else None
    if bool(delivery_file) != bool(helpers):
        raise ValueError("Select both original delivery programme and its helper directory, or neither.")
    node = absolute(args.node)
    playwright = absolute(args.playwright_module, directory=None)
    chromium = absolute(args.chromium)
    if not os.access(node, os.X_OK) or not os.access(chromium, os.X_OK):
        raise ValueError("Select the actual equipped Node and Chromium executables.")
    if not re.fullmatch(r"[0-9a-f]{64}", args.runtime_sha256):
        raise ValueError("Pass the actual original published runtime archive SHA-256.")
    equal_file(archive, APP_ZIP)
    equal_file(tome, TOME)
    equal_file(browser_file, PINS["browser"])
    equal_file(browser_guide_file, PINS["browser_guide"])
    if delivery_file:
        equal_file(delivery_file, PINS["delivery"])
    runtime_identity = identity(runtime_archive)
    if runtime_identity["sha256"] != args.runtime_sha256:
        raise ValueError("The original runtime archive differs from its publication.")
    helper_files = {}
    for name, expected in (HELPERS.items() if helpers else []):
        row = identity(helpers / name)
        if row["sha256"] != expected:
            raise ValueError("Use the original operated Library helper: " + name)
        helper_files[name] = row
    selection = {
        "schema": "govhub.tome-portable-input.v1", "operation": OPERATION, "source_commit": COMMIT,
        "directory": str(root), "application_zip": identity(archive), "runtime_archive": runtime_identity,
        "tome_archive": identity(tome), "programme": identity(Path(__file__).resolve()),
        "browser": identity(browser_file), "browser_guide": identity(browser_guide_file),
        "delivery_programme": identity(delivery_file) if delivery_file else None,
        "source_selection": SOURCE_SELECTION,
        "guide": identity(guide_file),
        "library_helpers": helper_files, "node": str(node), "playwright_module": str(playwright),
        "chromium": str(chromium), "php": str(absolute(args.php)) if args.php else None,
        "single_process": args.single_process,
    }
    lock = os.open(root / ".portable-receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        retained_json(root / "input.json", selection)
        if (root / "publication.json").exists():
            published = read(root / "publication.json")
            if published.get("input", {}).get("input_sha256") != digest(encoded(selection)):
                raise ValueError("The original publication belongs to another input selection.")
            if published.get("state") != "COMPLETE":
                raise RuntimeError("Continue the original transfer and its retained provider responses at " + str(root / "save"))
            for row in published["input"]["files"]:
                equal_file(Path(row["path"]), row)
            emit("EXISTING_TOME_PORTABLE_DELIVERY", result=published)
            return published
        source = root / "source"
        source.mkdir(mode=0o700, exist_ok=True)
        put(source / "run_tome_portable_receiving.py", Path(__file__).read_bytes(), unchanged=True)
        put(source / "run_tome_browser_receiving.mjs", browser_file.read_bytes(), unchanged=True)
        put(source / "BROWSER_RECEIVING.md", browser_guide_file.read_bytes(), unchanged=True)
        if delivery_file:
            put(source / "original_application_delivery.py", delivery_file.read_bytes(), unchanged=True)
        put(source / "source-selection.json", encoded(SOURCE_SELECTION), unchanged=True)
        put(source / "PORTABLE_RECEIVING.md", guide_file.read_bytes(), unchanged=True)
        put(source / "GovHub_Application.zip", archive.read_bytes(), unchanged=True)
        put(source / "tome-8.x-1.16.tar.gz", tome.read_bytes(), unchanged=True)
        application = bootstrap_application(archive, root)
        native_programme = application / "workspace/static_releases/examples/run_tome_release.py"
        equal_file(native_programme, PINS["native"])
        runtime_module = bootstrap_runtime_receiver(runtime_archive, root, args.runtime_sha256)
        received = runtime_module.receive(runtime_archive, root / "runtime", expected_sha256=args.runtime_sha256,
                                          php=selection["php"])
        if received.get("state") != "COMPLETE":
            raise RuntimeError("Continue the original installed-runtime receiving.")
        runtime = received["runtime"]
        project = absolute(runtime["project"], directory=True)
        site_root = absolute(runtime["document_root"], directory=True)
        runtime_manifest = project / "NATIVE_RUNTIME.json"
        if read(runtime_manifest) != runtime or not site_root.is_relative_to(project):
            raise ValueError("The dedicated project differs from its original received runtime.")
        retained_json(root / "runtime-receiving.json", received)
        native = root / "native"
        native.mkdir(mode=0o700, exist_ok=True)
        browser = root / "browser"
        browser.mkdir(mode=0o700, exist_ok=True)
        temporary = root / "tmp"
        temporary.mkdir(mode=0o700, exist_ok=True)
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["TMPDIR"] = str(temporary)
        env["PATH"] = runtime["prepend_path"] + os.pathsep + env.get("PATH", "")
        native_result_path = native / "delivery/GovHub-Tome-Native-Result.json"
        native_checkpoint = root / "native-complete.json"
        if native_checkpoint.exists():
            checkpoint = read(native_checkpoint)
            if checkpoint.get("input_sha256") != digest(encoded(selection)):
                raise ValueError("The completed native operation belongs to another retained selection.")
            equal_file(native_result_path, checkpoint["result"])
        else:
            command(root, "original-tome-native", [sys.executable, "-B", str(native_programme),
                "--application", str(application), "--directory", str(native),
                "--runtime-manifest", str(runtime_manifest), "--site-root", str(site_root),
                "--tome-archive", str(tome), "--application-source-commit", COMMIT,
                "--site-mail", SOURCE_SELECTION["site_mail"]], cwd=root, env=env)
        native_result = read(native_result_path)
        if (native_result.get("status") != "COMPLETE" or native_result.get("application_source_commit") != COMMIT
                or native_result.get("application_source_sha256") != APP_MANIFEST_SHA):
            raise RuntimeError("The original complete native result is required.")
        retained_json(native_checkpoint, {"schema": "govhub.tome-original-native-checkpoint.v1",
            "input_sha256": digest(encoded(selection)), "result": identity(native_result_path)})
        browser_argv = [str(node), str(source / "run_tome_browser_receiving.mjs"),
            "--application", str(application), "--operation-directory", str(native),
            "--output-directory", str(browser), "--temporary-directory", str(temporary),
            "--python", sys.executable, "--playwright-module", str(playwright), "--chromium", str(chromium)]
        if args.single_process:
            browser_argv.append("--single-process")
        command(root, "original-tome-browser", browser_argv, cwd=root, env=env)
        browser_result = read(browser / "GovHub-Tome-Browser-Receiving.json")
        if browser_result.get("status") != "COMPLETE" or len(browser_result.get("runs", [])) != 2:
            raise RuntimeError("Complete the original and independently received browser workspaces.")
        files = package_operation(root, native_result, browser_result, selection)
        emit("TOME_NATIVE_PACKAGE_READY", directory=str(root), files=[identity(path) for path in files])
        if delivery_file is None:
            return {"schema": "govhub.tome-portable-local-complete.v1", "state": "COMPLETE",
                    "operation": OPERATION, "files": [identity(path) for path in files],
                    "publication": None, "directory": str(root)}
        delivery_module = load_module("govhub_original_retained_delivery",
                                      source / "original_application_delivery.py", PINS["delivery"])
        return publish(root, files, selection, delivery_module, helpers)
    finally:
        os.close(lock)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("application-zip", "runtime-archive", "runtime-sha256", "tome-archive", "directory",
                 "browser", "browser-guide", "guide", "node", "playwright-module", "chromium", "source-selection"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--delivery-programme", help="Optional existing authorized original file publisher.")
    parser.add_argument("--library-helpers", help="Original publisher helper directory; requires --delivery-programme.")
    parser.add_argument("--php", help="Actual receiving host PHP8.3.6 executable, if selected explicitly.")
    parser.add_argument("--single-process", action="store_true")
    parser.add_argument("--keep-open", action="store_true",
                        help="Retain this original private host on failure for status or continue commands on stdin.")
    args = parser.parse_args()
    while True:
        try:
            run(args)
            return 0
        except (Exception, KeyboardInterrupt) as error:
            failure = {"directory": args.directory, "error_type": type(error).__name__, "error": str(error)}
            emit("TOME_PORTABLE_FOLLOWUP", **failure)
            if not args.keep_open:
                return 1
            emit("TOME_ORIGINAL_HOST_RETAINED", directory=args.directory, commands=["status", "continue", "exit"])
            while True:
                line = sys.stdin.readline()
                if not line:
                    return 1
                try:
                    action = json.loads(line).get("action")
                except (ValueError, AttributeError):
                    emit("TOME_ORIGINAL_HOST_RETAINED", error="Choose a documented JSON action.")
                    continue
                if action == "status":
                    emit("TOME_PORTABLE_FOLLOWUP", **failure)
                elif action == "continue":
                    break
                elif action == "exit":
                    return 1
                else:
                    emit("TOME_ORIGINAL_HOST_RETAINED", error="Use status, continue, or exit.")

if __name__ == "__main__":
    raise SystemExit(main())
