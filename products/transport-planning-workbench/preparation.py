#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Private source intake for the original transportation planning application; no workspace or server is started."""
from __future__ import annotations
import argparse
import ast
import contextlib
import fcntl
import hashlib
import importlib
import json
import os
import platform
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import sysconfig
import time
import zipfile
from pathlib import Path, PurePosixPath

SOURCE_SCHEMA = "stellar-forge.transport-planning-workbench-source.v1"
PREPARED_SCHEMA = "stellar-forge.transport-planning-preparation.v1"
TRANSFER_SCHEMA = "stellar-forge.transport-planning-source-transfer.v1"
MAX_SOURCE = 32 * 1024 * 1024
MAX_ARCHIVE = MAX_SOURCE + 16 * 1024 * 1024
HELPER = Path(__file__).resolve()
PUBLIC_ROOT = HELPER.parents[2]
CHILD = None
STOPPING = False
META = None

def need(ok, message):
    if not ok:
        raise RuntimeError(message)

def stamp():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()

def exact_json(body):
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result, "Duplicate JSON member.")
            result[key] = value
        return result
    return json.loads(body.decode("utf-8"), object_pairs_hook=pairs)

def sha(body):
    return hashlib.sha256(body).hexdigest()

def absolute(value):
    p = Path(value)
    need(p.is_absolute() and str(p) == os.path.normpath(str(p)), "Use an absolute normalized path.")
    return p

def ordinary(path, private=False, owned=True):
    path = absolute(str(path))
    info = path.lstat()
    need(path.resolve() == path and stat.S_ISREG(info.st_mode) and (not owned or info.st_uid == os.getuid()),
         "Select an owned ordinary file without symbolic links.")
    need(not private or info.st_mode & 0o077 == 0, "Keep private input and preparation records private.")
    return info

def directory(path, create=False, private=True):
    path = absolute(str(path))
    if create and not path.exists():
        parent = path.parent
        need(parent.exists() and parent.resolve() == parent, "Create the parent before selecting a private preparation directory.")
        path.mkdir(mode=0o700)
        sync_dir(parent)
    info = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid(),
         "Select an owned ordinary directory.")
    need(not private or info.st_mode & 0o077 == 0, "Use a private 0700 preparation directory.")
    return path

def beneath(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False

def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def mkdirs(path, root):
    need(beneath(path, root), "Keep staging directories inside the selected private preparation.")
    if path == root:
        directory(root)
        return
    mkdirs(path.parent, root)
    directory(path, create=True)

def identity(path, maximum=MAX_ARCHIVE, private=False, owned=True):
    before = ordinary(path, private, owned)
    need(before.st_size <= maximum, "The selected complete file exceeds its declared capacity.")
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        first = os.fstat(fd)
        need((first.st_dev, first.st_ino) == (before.st_dev, before.st_ino), "The selected file changed.")
        with os.fdopen(os.dup(fd), "rb") as incoming:
            for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
                h.update(chunk)
        last = os.fstat(fd)
        need(all(getattr(first, k) == getattr(last, k) for k in
                 ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")), "The selected file changed during its complete read.")
    finally:
        os.close(fd)
    return {"path": str(path), "bytes": first.st_size, "sha256": h.hexdigest()}

def check(path, expected):
    got = identity(path, max(expected["bytes"], 1))
    need(got["bytes"] == expected["bytes"] and got["sha256"] == expected["sha256"], "A complete retained file identity changed.")
    return got

def raw(path, maximum=4 * 1024 * 1024, private=False):
    selected = identity(path, maximum, private)
    body = Path(path).read_bytes()
    need(len(body) == selected["bytes"] and sha(body) == selected["sha256"], "The selected JSON file changed.")
    return body

def document(path, maximum=4 * 1024 * 1024, private=True):
    return exact_json(raw(path, maximum, private))

def atomic(path, body, immutable=False):
    path = Path(path)
    directory(path.parent)
    if path.exists():
        prior = raw(path, max(len(body), 4 * 1024 * 1024), True)
        if prior == body:
            return identity(path)
        need(not immutable, "Preserve the complete original immutable preparation record.")
    candidate = path.with_name("." + path.name + "." + secrets.token_hex(10))
    try:
        fd = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(body)
            output.flush()
            os.fsync(output.fileno())
        os.replace(candidate, path)
        sync_dir(path.parent)
    finally:
        candidate.unlink(missing_ok=True)
    return identity(path)

def save(path, value, immutable=False):
    return atomic(path, encoded(value), immutable)

def private_candidate(target, selected):
    need(META is not None, "The original preparation metadata owner is required.")
    base = META / "copy-candidates"
    directory(base, create=True)
    scope = base / sha(str(target).encode())
    directory(scope, create=True)
    save(scope / "selection.json", {"target": str(target), "bytes": selected["bytes"], "sha256": selected["sha256"]}, True)
    # Interrupted candidates stay outside both immutable source inventories.
    # The same held preparation lease proves no earlier copy process still owns them.
    for prior in scope.glob("*.copying"):
        observed = identity(prior)
        save(prior.with_suffix(".interrupted.json"), {"state": "INTERRUPTED", "target": str(target), "candidate": observed}, True)
    return scope / (secrets.token_hex(10) + ".copying")

def preserve_candidate(candidate, target):
    if candidate.exists():
        observed = identity(candidate)
        save(candidate.with_suffix(".interrupted.json"), {"state": "INTERRUPTED", "target": str(target), "candidate": observed}, True)

def copy(source, target, selected):
    if target.exists():
        return check(target, selected)
    directory(target.parent)
    check(source, selected)
    candidate = private_candidate(target, selected)
    try:
        with Path(source).open("rb") as incoming, candidate.open("xb") as outgoing:
            os.chmod(candidate, 0o600)
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        check(candidate, selected)
        check(source, selected)
        os.rename(candidate, target)
        sync_dir(target.parent)
        sync_dir(candidate.parent)
    finally:
        preserve_candidate(candidate, target)
    return check(target, selected)

def member_name(value):
    need(isinstance(value, str) and 0 < len(value) <= 4096 and not value.startswith("/") and "\\" not in value and
         not any(ord(c) < 32 or ord(c) == 127 for c in value), "Invalid source or archive member path.")
    p = PurePosixPath(value)
    need(str(p) == value and all(x not in ("", ".", "..", "__pycache__") for x in value.split("/")), "Invalid source or archive member path.")
    return value

def descriptor(row):
    need(isinstance(row, dict) and set(row) == {"path", "bytes", "sha256"}, "Use exact complete source descriptors.")
    member_name(row["path"])
    need(type(row["bytes"]) is int and 0 <= row["bytes"] <= MAX_ARCHIVE and
         isinstance(row["sha256"], str) and re.fullmatch("[a-f0-9]{64}", row["sha256"]), "Invalid complete file identity.")
    return row

def authority(body):
    value = exact_json(body)
    need(isinstance(value, dict) and set(value) == {"schema", "files"} and value["schema"] == SOURCE_SCHEMA and
         isinstance(value["files"], list) and 1 <= len(value["files"]) <= 25000, "Select the complete private source authority.")
    names = set()
    for row in value["files"]:
        descriptor(row)
        need(row["path"].casefold() not in names and row["bytes"] <= MAX_SOURCE, "Duplicate or oversized original source.")
        names.add(row["path"].casefold())
    need(sum(row["bytes"] for row in value["files"]) <= MAX_SOURCE, "The original complete source exceeds its capacity.")
    need({"workspace.py", "operations.py", "intake.py", "exports.py", "delivery.py", "server.py", "manage.py",
          "programme-cli.mjs", "boston-programme-evaluator.mjs", "web/index.html", "web/app.js", "web/style.css"}.issubset(names),
         "Retain the complete original transportation planning application.")
    return value

def inventory(root):
    directory(root, private=False)
    result = []
    for parent, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            p = Path(parent) / name
            need(not p.is_symlink(), "Linked source directories are not admitted.")
            directory(p, private=False)
        dirs[:] = [name for name in dirs if name != "__pycache__"]
        for name in files:
            p = Path(parent) / name
            ordinary(p)
            result.append(p.relative_to(root).as_posix())
    return sorted(result)

def engine_source_names(root, selected):
    tree = ast.parse(raw(root / "delivery.py", MAX_SOURCE).decode("utf-8"), filename="delivery.py")
    assignments = [node.value for node in tree.body if isinstance(node, ast.Assign) and
                   any(isinstance(target, ast.Name) and target.id == "SOURCE_FILES" for target in node.targets)]
    need(len(assignments) == 1, "Retain the original single literal SOURCE_FILES declaration.")
    names = ast.literal_eval(assignments[0])
    need(isinstance(names, list) and names and all(isinstance(name, str) for name in names) and
         len(names) == len(set(names)), "Use the complete distinct original source declaration.")
    for name in names:
        member_name(name)
    required = {"workspace.py", "operations.py", "intake.py", "exports.py", "delivery.py", "server.py", "manage.py",
                "programme-cli.mjs", "boston-programme-evaluator.mjs", "web/index.html", "web/app.js", "web/style.css"}
    need(required.issubset(names), "The native source declaration omits a required component.")
    need({row["path"] for row in selected["files"]} == set(names),
         "The complete private source authority must retain every original SOURCE_FILES member.")
    return names

def verify_source(root, selected, complete=True):
    rows = selected["files"]
    for row in rows:
        check(root / row["path"], row)
    if complete:
        need(inventory(root) == sorted(row["path"] for row in rows),
             "Retain the complete selected source without undeclared members.")
    engine_source_names(root, selected)
    return {"files": len(rows), "bytes": sum(row["bytes"] for row in rows)}

def inspect_zip(path):
    ordinary(path, True)
    archive = zipfile.ZipFile(path)
    try:
        seen = set()
        total = 0
        for info in archive.infolist():
            name = member_name(info.filename)
            mode = (info.external_attr >> 16) & 0o170000
            need(not info.is_dir() and mode in (0, stat.S_IFREG) and not info.flag_bits & 1,
                 "Use only complete unencrypted ordinary archive members.")
            need(name.casefold() not in seen, "Duplicate archive member.")
            seen.add(name.casefold())
            total += info.file_size
        need(total <= MAX_ARCHIVE, "The selected complete private archive exceeds capacity.")
        return archive
    except BaseException:
        archive.close()
        raise

def zip_json(archive, name, maximum):
    info = archive.getinfo(name)
    need(info.file_size <= maximum, "Archive metadata exceeds its capacity.")
    return exact_json(archive.read(name))

def hash_member(archive, row):
    info = archive.getinfo(row["path"])
    need(info.file_size == row["bytes"], "Archive member size differs.")
    h = hashlib.sha256()
    with archive.open(info) as incoming:
        for block in iter(lambda: incoming.read(1024 * 1024), b""):
            h.update(block)
    need(h.hexdigest() == row["sha256"], "Archive member bytes differ.")

def extract_member(archive, row, target):
    if target.exists():
        return check(target, row)
    candidate = private_candidate(target, row)
    try:
        with archive.open(row["path"]) as incoming, candidate.open("xb") as outgoing:
            os.chmod(candidate, 0o600)
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        check(candidate, row)
        os.rename(candidate, target)
        sync_dir(target.parent)
        sync_dir(candidate.parent)
    finally:
        preserve_candidate(candidate, target)
    return check(target, row)

def validate_origin_observation(observed, selected, manifest_sha):
    need(isinstance(observed, dict) and
         observed.get("schema") == "stellar-forge.transport-planning-runtime-observation.v1" and
         observed.get("sourceManifestSha256") == manifest_sha and
         set(observed.get("runtime", {})) == {"python", "node"} and
         set(observed.get("packageImports", {})) == {"primary", "receiving"},
         "Preserve the complete original Python/Node and package-import observations.")
    runtime = observed["runtime"]
    python, node = runtime["python"], runtime["node"]
    need(isinstance(python, dict) and python.get("implementation") == "CPython" and python.get("platform") == "linux" and
         isinstance(python.get("version"), str) and re.match(r"3\.(?:1[2-9]|[2-9][0-9])\.", python["version"]),
         "Retain the selected original Linux CPython 3.12+ observation.")
    need(isinstance(node, dict) and isinstance(node.get("observation"), dict), "Retain the complete actual Node observation.")
    version = node["observation"].get("version")
    need(isinstance(version, str) and re.fullmatch(r"v(\d+)\.\d+\.\d+(?:[-+].*)?", version) and
         int(version.split(".")[0][1:]) >= 18 and node["observation"].get("platform") == "linux" and
         node["observation"].get("executable") == node.get("executable"), "Retain the original Linux Node.js 18+ identity.")
    for runtime_part in (python, node):
        absolute(runtime_part["executable"])
        binary = runtime_part["binary"]
        need(isinstance(binary, dict) and set(binary) == {"path", "bytes", "sha256"} and
             type(binary["bytes"]) is int and binary["bytes"] > 0 and
             isinstance(binary["sha256"], str) and re.fullmatch("[a-f0-9]{64}", binary["sha256"]),
             "Retain the complete selected executable descriptor.")
        absolute(binary["path"])
    imported_node = node.get("command")
    need(isinstance(imported_node, dict) and set(imported_node) == {"result", "receipt", "stdout", "stderr"},
         "Retain the complete original Node runtime command.")
    for key in ("receipt", "stdout", "stderr"):
        entry = imported_node[key]
        need(isinstance(entry, dict) and set(entry) == {"identity", "content"} and isinstance(entry["content"], str),
             "Retain original Node runtime command/log bytes.")
        binding = entry["identity"]
        absolute(binding["path"])
        body = entry["content"].encode("utf-8")
        need(binding["bytes"] == len(body) and binding["sha256"] == sha(body), "The original Node runtime bytes changed.")
    node_command = exact_json(imported_node["receipt"]["content"].encode("utf-8"))
    need(node_command.get("state") == "CLOSED" and node_command.get("exitCode") == 0 and
         node_command.get("selection", {}).get("binary") == node["binary"] and
         node_command.get("stdout") == imported_node["stdout"]["identity"] and
         node_command.get("stderr") == imported_node["stderr"]["identity"] and
         exact_json(imported_node["stdout"]["content"].encode("utf-8")) == imported_node["result"] == node["observation"],
         "The original Node runtime observation did not close against its selected executable.")
    rows = {row["path"]: row for row in selected["files"]}
    for role in observed["packageImports"].values():
        need(isinstance(role, dict) and set(role) == {"python", "node"}, "Retain both complete source import observations.")
        for kind, item in role.items():
            need(isinstance(item, dict) and set(item) == {"result", "receipt", "stdout", "stderr"},
                 "Retain all original successful package-import outputs.")
            for key in ("receipt", "stdout", "stderr"):
                entry = item[key]
                need(isinstance(entry, dict) and set(entry) == {"identity", "content"} and
                     isinstance(entry["content"], str) and isinstance(entry["identity"], dict) and
                     set(entry["identity"]) == {"path", "bytes", "sha256"},
                     "Retain complete original command and log bytes.")
                absolute(entry["identity"]["path"])
                body = entry["content"].encode("utf-8")
                need(len(body) == entry["identity"]["bytes"] and sha(body) == entry["identity"]["sha256"],
                     "The original command or log bytes differ from their retained identity.")
            command = exact_json(item["receipt"]["content"].encode("utf-8"))
            result = exact_json(item["stdout"]["content"].encode("utf-8"))
            need(command.get("schema") == "stellar-forge.transport-planning-inspection-command.v1" and
                 command.get("state") == "CLOSED" and command.get("exitCode") == 0 and
                 command.get("stdout") == item["stdout"]["identity"] and command.get("stderr") == item["stderr"]["identity"] and
                 result == item["result"] and result.get("schema") == "stellar-forge.transport-planning-package-import.v1" and
                 command.get("selection", {}).get("applicationDirectory") == result.get("applicationDirectory") and
                 result.get("kind") == kind and result.get("workerStarted") is False and result.get("workspaceOpened") is False,
                 "The original successful import receipt is inconsistent.")
            source = absolute(result["applicationDirectory"])
            paths = set()
            for module in result.get("modules", []):
                path = absolute(module["path"]).relative_to(source).as_posix()
                need(path in rows and module["bytes"] == rows[path]["bytes"] and module["sha256"] == rows[path]["sha256"] and
                     path not in paths, "The original imported module differs from the full source selection.")
                paths.add(path)
            if kind == "python":
                need({"workspace.py", "operations.py", "intake.py", "exports.py", "delivery.py", "server.py", "manage.py"}.issubset(paths),
                     "The original Python module-import observation is incomplete.")
                names = result.get("sourceFiles")
                need(isinstance(names, list) and len(names) == len(set(names)) and set(names) == set(rows),
                     "The original observed source declaration differs from the complete supplied source.")
            else:
                need(paths == {"boston-programme-evaluator.mjs"} and result.get("exports") == ["evaluateMetrics", "evaluateServices"],
                     "The original Node evaluator import observation is incomplete.")

def receive_source(archive_path, staging, meta):
    with inspect_zip(archive_path) as archive:
        actual = set(archive.namelist())
        need("TRANSFER.json" in actual and "SOURCE.json" in actual,
             "Select the complete private source transfer; original operating packages are received by their original application.")
        manifest = zip_json(archive, "TRANSFER.json", 4 * 1024 * 1024)
        need(isinstance(manifest, dict) and set(manifest) == {"schema", "files", "sourceManifestSha256"} and
             manifest["schema"] == TRANSFER_SCHEMA and isinstance(manifest["files"], list),
             "Select the original private source-transfer schema.")
        rows = manifest["files"]
        for row in rows:
            descriptor(row)
        names = [row["path"] for row in rows]
        need(len(names) == len(set(names)) and actual == set(names) | {"TRANSFER.json"},
             "Source transfer closure changed.")
        source_info = archive.getinfo("SOURCE.json")
        need(source_info.file_size <= 4 * 1024 * 1024, "Source authority exceeds capacity.")
        body = archive.read("SOURCE.json")
        selected = authority(body)
        need(manifest["sourceManifestSha256"] == sha(body), "The exact source authority digest differs.")
        expected = {"SOURCE.json", "runtime-observation.json"} | {"source/" + row["path"] for row in selected["files"]}
        need(set(names) == expected, "The complete private transfer contains undeclared or omitted content.")
        declared = {row["path"]: row for row in rows}
        for row in selected["files"]:
            need(declared["source/" + row["path"]] == dict(row, path="source/" + row["path"]),
                 "The full source-transfer authority differs.")
        for row in rows:
            hash_member(archive, row)
        observation_info = archive.getinfo("runtime-observation.json")
        need(observation_info.file_size <= 12 * 1024 * 1024, "Runtime observation exceeds capacity.")
        observation = archive.read("runtime-observation.json")
        observed = exact_json(observation)
        validate_origin_observation(observed, selected, sha(body))
        for row in selected["files"]:
            target = staging / row["path"]
            mkdirs(target.parent, staging)
            extract_member(archive, dict(row, path="source/" + row["path"]), target)
        verify_source(staging, selected)
        atomic(meta / "origin-runtime.json", observation, True)
        return body, {"kind": "private-source-transfer", "archive": identity(archive_path),
                      "runtimeObservation": identity(meta / "origin-runtime.json")}

def python_identity(invocation):
    invocation = absolute(invocation)
    need(invocation.exists() and os.path.samefile(invocation, sys.executable), "Run preparation with the selected original Python invocation.")
    need(platform.python_implementation() == "CPython" and sys.version_info >= (3, 12), "Select an actual CPython 3.12 or later interpreter.")
    binary = Path(sys.executable).resolve()
    rows = []
    for name in ("json", "zipfile", "decimal", "_decimal", "hashlib", "sqlite3", "_sqlite3", "zoneinfo", "http.server", "fcntl"):
        module = importlib.import_module(name)
        path = getattr(module, "__file__", None)
        if path and Path(path).exists():
            item = identity(Path(path).resolve(), 128 * 1024 * 1024, owned=False)
            rows.append({"module": name, **item})
    return {"executable": str(invocation), "binary": identity(binary, 128 * 1024 * 1024, owned=False),
            "version": sys.version, "implementation": platform.python_implementation(),
            "architecture": platform.machine(), "platform": sys.platform, "cacheTag": sys.implementation.cache_tag,
            "abi": sysconfig.get_config_var("SOABI"), "standardLibrary": rows}

def clean_env():
    result = dict(os.environ)
    for key in ("PYTHONPATH", "PYTHONHOME", "PYTHONUSERBASE", "PYTHONSTARTUP", "NODE_OPTIONS", "NODE_PATH"):
        result.pop(key, None)
    result["PYTHONDONTWRITEBYTECODE"] = "1"
    return result

def command_result(scope, selection):
    saved = document(scope / "result.json", 8 * 1024 * 1024)
    need(saved.get("schema") == "stellar-forge.transport-planning-inspection-result.v1",
         "Select the original complete inspection.")
    receipt = saved["receipt"]
    need(Path(receipt["path"]).parent == scope, "Keep the original inspection receipt under its own private scope.")
    check(Path(receipt["path"]), receipt)
    record = document(receipt["path"], 8 * 1024 * 1024)
    need(record.get("state") == "CLOSED" and record.get("exitCode") == 0 and record.get("selection") == selection,
         "The original private inspection did not close successfully for this selection.")
    for key in ("stdout", "stderr"):
        need(Path(record[key]["path"]).parent == scope, "Preserve the original inspection log paths.")
        check(Path(record[key]["path"]), record[key])
    actual = document(record["stdout"]["path"], 8 * 1024 * 1024)
    need(actual == saved["result"], "The retained full inspection output differs.")
    return saved

def owned_command(argv, scope, selection, lease_fd):
    global CHILD
    directory(scope, create=True)
    selection = dict(selection, argv=argv)
    save(scope / "selection.json", selection, True)
    if (scope / "result.json").exists():
        return command_result(scope, selection)
    key = str(time.time_ns()) + "-" + secrets.token_hex(6)
    stdout, stderr, receipt = scope / (key + ".stdout"), scope / (key + ".stderr"), scope / (key + ".json")
    record = {"schema": "stellar-forge.transport-planning-inspection-command.v1", "selection": selection,
              "startedAt": stamp(), "state": "PREPARED"}
    save(receipt, record)
    with stdout.open("xb") as out, stderr.open("xb") as error:
        os.chmod(stdout, 0o600)
        os.chmod(stderr, 0o600)
        try:
            need(not STOPPING, "Preparation was stopped before original inspection.")
            previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM, signal.SIGINT})
            try:
                def child_signal_setup():
                    signal.signal(signal.SIGTERM, signal.SIG_DFL)
                    signal.signal(signal.SIGINT, signal.SIG_DFL)
                    signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
                CHILD = subprocess.Popen(argv, stdout=out, stderr=error, env=clean_env(),
                                         pass_fds=(lease_fd,), preexec_fn=child_signal_setup)
            finally:
                signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
            record.update(state="RUNNING", pid=CHILD.pid)
            save(receipt, record)
            CHILD.wait()
        finally:
            if CHILD is not None:
                if CHILD.poll() is None:
                    CHILD.terminate()
                code = CHILD.wait()
                CHILD = None
                record.update(state="CLOSED", exitCode=code, completedAt=stamp())
            out.flush()
            error.flush()
            os.fsync(out.fileno())
            os.fsync(error.fileno())
            record.update(stdout=identity(stdout), stderr=identity(stderr))
            save(receipt, record)
    need(record.get("exitCode") == 0 and not STOPPING, "Retain the exact failed inspection before resuming.")
    value = document(stdout, 8 * 1024 * 1024)
    saved = {"schema": "stellar-forge.transport-planning-inspection-result.v1", "receipt": identity(receipt), "result": value}
    save(scope / "result.json", saved, True)
    return command_result(scope, selection)

def complete_inspection(result):
    command_body = raw(Path(result["receipt"]["path"]), 8 * 1024 * 1024, True)
    command = exact_json(command_body)
    return {"result": result["result"], "receipt": {"identity": result["receipt"], "content": command_body.decode("utf-8")},
            "stdout": {"identity": command["stdout"], "content": raw(Path(command["stdout"]["path"]), 8 * 1024 * 1024, True).decode("utf-8")},
            "stderr": {"identity": command["stderr"], "content": raw(Path(command["stderr"]["path"]), 1024 * 1024, True).decode("utf-8")}}

def node_identity(node, meta, lease_fd):
    path = absolute(node)
    binary = identity(path, 256 * 1024 * 1024, owned=False)
    need(os.access(path, os.X_OK), "Select the actual executable Node.js binary.")
    program = """import fs from 'node:fs';import os from 'node:os';
const executable=fs.realpathSync(process.execPath);
if(Number(process.versions.node.split('.')[0])<18)throw Error('Node.js 18+ is required.');
process.stdout.write(JSON.stringify({executable,version:process.version,versions:process.versions,architecture:process.arch,platform:process.platform,release:process.release}));"""
    observed = owned_command([node, "--input-type=module", "-e", program], meta / "node-runtime",
                             {"kind": "node-runtime", "binary": binary}, lease_fd)
    value = observed["result"]
    need(value.get("executable") == node and value.get("platform") == "linux" and
         isinstance(value.get("version"), str) and re.fullmatch(r"v(\d+)\.\d+\.\d+(?:[-+].*)?", value["version"]) and
         int(value["version"].split(".")[0][1:]) >= 18, "Use the selected actual Linux Node.js 18+ executable.")
    need(identity(path, 256 * 1024 * 1024, owned=False) == binary, "The selected Node executable changed.")
    return {"executable": node, "binary": binary, "observation": value, "command": complete_inspection(observed)}

def validate_import(value, source, selected, kind):
    need(value.get("schema") == "stellar-forge.transport-planning-package-import.v1" and
         value.get("applicationDirectory") == str(source) and value.get("kind") == kind and
         value.get("workerStarted") is False and value.get("workspaceOpened") is False,
         "Retain the original isolated package-import observation.")
    rows = {row["path"]: row for row in selected["files"]}
    modules = value.get("modules")
    need(isinstance(modules, list) and modules, "The actual private modules were not observed.")
    paths = set()
    for item in modules:
        relative = Path(item["path"]).relative_to(source).as_posix()
        need(relative in rows and relative not in paths and item["bytes"] == rows[relative]["bytes"] and item["sha256"] == rows[relative]["sha256"],
             "An actual imported private module differs from its complete source authority.")
        check(Path(item["path"]), rows[relative])
        paths.add(relative)
    if kind == "python":
        need({"workspace.py", "operations.py", "intake.py", "exports.py", "delivery.py", "server.py", "manage.py"}.issubset(paths),
             "The complete original Python modules were not imported.")
        need(value.get("sourceFiles") == engine_source_names(source, selected),
             "The actual original declaration differs from its selected literal source.")
    else:
        need(paths == {"boston-programme-evaluator.mjs"} and value.get("exports") == ["evaluateMetrics", "evaluateServices"],
             "The complete original evaluator exports were not imported.")
    return value

def original_inspect(source, python, node, meta, lease_fd, selected, role):
    base = meta / "package-imports"
    directory(base, create=True)
    scope = base / role
    directory(scope, create=True)
    program = r"""
import hashlib,importlib,json,pathlib,sys
root=pathlib.Path(sys.argv[1])
sys.path.insert(0,str(root))
selected={name:importlib.import_module(name) for name in ("workspace","intake","operations","exports","delivery","server","manage")}
assert callable(selected["workspace"].Workspace) and callable(selected["operations"].Operations)
assert callable(selected["delivery"].package_to) and callable(selected["delivery"].receive_file)
assert callable(selected["server"].Server) and callable(selected["manage"].main)
observed=[]
for key,value in sorted(sys.modules.items()):
    filename=getattr(value,"__file__",None)
    if filename is None: continue
    path=pathlib.Path(filename).resolve()
    try: path.relative_to(root)
    except ValueError: continue
    data=path.read_bytes()
    observed.append({"module":key,"path":str(path),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
print(json.dumps({"schema":"stellar-forge.transport-planning-package-import.v1","kind":"python","applicationDirectory":str(root),
                 "modules":observed,"sourceFiles":selected["delivery"].SOURCE_FILES,
                 "workerStarted":False,"workspaceOpened":False},sort_keys=True,separators=(",",":")))
"""
    node_program = r"""
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const root=process.argv[1],file=path.join(root,'boston-programme-evaluator.mjs');
const module=await import(pathToFileURL(file).href);
if(typeof module.evaluateServices!=='function'||typeof module.evaluateMetrics!=='function')throw Error('Keep both original evaluator exports.');
const data=fs.readFileSync(file);
process.stdout.write(JSON.stringify({schema:'stellar-forge.transport-planning-package-import.v1',kind:'node',applicationDirectory:root,
 modules:[{module:'boston-programme-evaluator.mjs',path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')}],
 exports:['evaluateMetrics','evaluateServices'],workerStarted:false,workspaceOpened:false}));
"""
    outputs = {}
    for kind, argv in (("python", [python, "-I", "-B", "-c", program, str(source)]),
                       ("node", [node, "--input-type=module", "-e", node_program, str(source)])):
        inspected = owned_command(argv, scope / kind,
                                  {"applicationDirectory": str(source), "source": selected, "kind": kind}, lease_fd)
        validate_import(inspected["result"], source, selected, kind)
        outputs[kind] = inspected
    verify_source(source, selected)
    return outputs

def install_copy(source, destination, selected):
    if destination.exists():
        verify_source(destination, selected)
        directory(destination)
        return
    staging = destination.with_name(destination.name + ".staging")
    directory(staging, create=True)
    for row in selected["files"]:
        target = staging / row["path"]
        mkdirs(target.parent, staging)
        copy(source / row["path"], target, row)
    verify_source(staging, selected)
    for parent, _, _ in os.walk(staging, topdown=False):
        sync_dir(parent)
    os.rename(staging, destination)
    sync_dir(destination.parent)
    verify_source(destination, selected)

def inspect_prepared(root, python, node, lease_fd):
    meta = root / ".preparation"
    result = document(meta / "PREPARED.json", 8 * 1024 * 1024)
    need(result.get("schema") == PREPARED_SCHEMA and result.get("state") == "READY" and result.get("directory") == str(root),
         "Select this complete original private preparation.")
    check(meta / "REQUEST.json", result["request"])
    request = document(meta / "REQUEST.json", 8 * 1024 * 1024)
    need((meta / "node-runtime" / "result.json").exists(), "Retain the actual selected Node observation.")
    runtime = {"python": python_identity(python), "node": node_identity(node, meta, lease_fd)}
    need(request["helper"] == identity(HELPER) and request["runtime"] == runtime and result["runtime"] == runtime,
         "The selected preparation helper or actual Python/Node runtime changed.")
    selected_body = raw(meta / "SOURCE.json", 4 * 1024 * 1024, True)
    selected = authority(selected_body)
    need(sha(selected_body) == result["source"]["manifestSha256"], "The private source authority changed.")
    need(result["source"] == {"manifestSha256": sha(selected_body), "files": len(selected["files"]),
                             "bytes": sum(row["bytes"] for row in selected["files"])}, "The selected source summary differs.")
    for key in ("primary", "receiving"):
        part = result[key]
        expected = {"applicationDirectory": str(root / key / "source"), "sourceManifestFile": str(meta / "SOURCE.json"),
                    "sourceManifestSha256": sha(selected_body), "python": python, "node": node}
        need(part == expected, "The exact prepared application path or Python/Node invocation changed.")
        verify_source(Path(part["applicationDirectory"]), selected)
        directory(Path(part["applicationDirectory"]))
    need(set(result.get("packageImports", {})) == {"primary", "receiving"}, "Retain both actual local package observations.")
    for key in ("primary", "receiving"):
        for kind in ("python", "node"):
            need((meta / "package-imports" / key / kind / "result.json").exists(), "Retain every completed local source import.")
        inspected = original_inspect(root / key / "source", python, node, meta, lease_fd, selected, key)
        need(inspected == result["packageImports"][key], "The exact original package inspection selection differs.")
    if result["origin"].get("runtimeObservation"):
        check(Path(result["origin"]["runtimeObservation"]["path"]), result["origin"]["runtimeObservation"])
    return result

def prepare(args, root, meta, lease_fd):
    python = args.python
    node = args.node
    runtime = {"python": python_identity(python), "node": node_identity(node, meta, lease_fd)}
    source_path = absolute(args.source) if args.source else None
    archive_path = absolute(args.archive) if args.archive else None
    need(bool(source_path) != bool(archive_path), "Select either the trusted source folder or the complete trusted archive.")
    if source_path:
        directory(source_path, private=False)
        need(not beneath(root, source_path) and not beneath(source_path, root), "Keep original source and preparation in separate directories.")
        need(args.source_manifest and args.source_manifest_sha256, "Select the exact external private source authority.")
    if archive_path:
        need(not beneath(archive_path, root), "The selected incoming archive must remain outside the preparation.")
        selected_archive = identity(archive_path, MAX_ARCHIVE, True)
        need(selected_archive["sha256"] == args.archive_sha256, "Select the reviewed complete private archive digest.")
    body = raw(absolute(args.source_manifest), 4 * 1024 * 1024, True) if args.source_manifest else None
    if body is not None:
        need(sha(body) == args.source_manifest_sha256, "The exact supplied source authority differs.")
        selected = authority(body)
        if source_path:
            verify_source(source_path, selected)
    request = {"schema": "stellar-forge.transport-planning-preparation-request.v1", "directory": str(root),
               "mode": "source" if source_path else "archive", "source": str(source_path) if source_path else None,
               "archive": selected_archive if archive_path else None,
               "sourceAuthority": identity(absolute(args.source_manifest)) if body is not None else None,
               "runtime": runtime, "helper": identity(HELPER)}
    request_path = meta / "REQUEST.json"
    if request_path.exists():
        need(document(request_path) == request, "Resume the original exact private source/runtime intake.")
    else:
        save(request_path, request, True)
    if (meta / "PREPARED.json").exists():
        return inspect_prepared(root, python, node, lease_fd)
    origin = {"kind": "source-folder", "path": str(source_path)} if source_path else None
    if archive_path:
        stage = root / "incoming-source"
        directory(stage, create=True)
        received_body, origin = receive_source(archive_path, stage, meta)
        need(identity(archive_path, MAX_ARCHIVE, True) == selected_archive, "The complete selected incoming archive changed during receiving.")
        if body is not None:
            supplied_authority, archive_authority = authority(body), authority(received_body)
            need(supplied_authority["schema"] == archive_authority["schema"] and
                 {row["path"]: (row["bytes"], row["sha256"]) for row in supplied_authority["files"]} ==
                 {row["path"]: (row["bytes"], row["sha256"]) for row in archive_authority["files"]},
                 "The trusted archive source differs from the selected external authority.")
        else:
            body = received_body
        selected = authority(body)
        source_path = stage
    atomic(meta / "SOURCE.json", body, True)
    for key in ("primary", "receiving"):
        base = root / key
        directory(base, create=True)
        install_copy(source_path, base / "source", selected)
    inspections = {}
    for key in ("primary", "receiving"):
        inspections[key] = original_inspect(root / key / "source", python, node, meta, lease_fd, selected, key)
    summary = verify_source(root / "primary" / "source", selected)
    result = {"schema": PREPARED_SCHEMA, "state": "READY", "directory": str(root), "resultPath": str(meta / "PREPARED.json"),
              "request": identity(request_path), "source": {"manifestSha256": sha(body), "files": summary["files"], "bytes": summary["bytes"]},
              "runtime": runtime, "origin": origin, "packageImports": inspections,
              "completedAt": stamp()}
    for key in ("primary", "receiving"):
        result[key] = {"applicationDirectory": str(root / key / "source"), "sourceManifestFile": str(meta / "SOURCE.json"),
                       "sourceManifestSha256": sha(body), "python": python, "node": node}
    candidate = meta / "candidate.json"
    if candidate.exists():
        prior = document(candidate)
        for field in ("completedAt",):
            result[field] = prior[field]
        need(result == prior, "Preserve the exact first complete preparation candidate.")
    else:
        save(candidate, result, True)
    save(meta / "PREPARED.json", result, True)
    return inspect_prepared(root, python, node, lease_fd)

def export(args, root, meta, lease_fd):
    prepared = inspect_prepared(root, args.python, args.node, lease_fd)
    output = absolute(args.output)
    directory(output.parent)
    need(not beneath(output, root) and not beneath(output, PUBLIC_ROOT), "Keep the portable private output outside preparation and installed public source.")
    selected_body = raw(meta / "SOURCE.json", 4 * 1024 * 1024, True)
    selected = authority(selected_body)
    inputs = [("source/" + row["path"], root / "primary" / "source" / row["path"], row) for row in selected["files"]]
    inputs += [("SOURCE.json", meta / "SOURCE.json", identity(meta / "SOURCE.json"))]
    observation = meta / "runtime-observation.json"
    imported = {}
    for role, results in prepared["packageImports"].items():
        imported[role] = {kind: complete_inspection(result) for kind, result in results.items()}
    save(observation, {"schema": "stellar-forge.transport-planning-runtime-observation.v1",
         "sourceManifestSha256": sha(selected_body), "runtime": prepared["runtime"], "packageImports": imported}, True)
    inputs += [("runtime-observation.json", observation, identity(observation))]
    rows = sorted([{"path": name, "bytes": row["bytes"], "sha256": row["sha256"]} for name, _, row in inputs], key=lambda x: x["path"])
    intent = {"schema": TRANSFER_SCHEMA, "files": rows, "sourceManifestSha256": sha(selected_body)}
    key = sha(str(output).encode())
    intent_path = meta / ("export-" + key + ".json")
    save(intent_path, {"output": str(output), "manifest": intent}, True)
    candidate = output.with_name(output.name + ".candidate")
    def validate(path):
        with inspect_zip(path) as archive:
            need(zip_json(archive, "TRANSFER.json", 4 * 1024 * 1024) == intent and
                 set(archive.namelist()) == {x["path"] for x in rows} | {"TRANSFER.json"}, "The selected private export differs.")
            for row in rows:
                hash_member(archive, row)
        return identity(path)
    if not output.exists():
        if candidate.exists():
            try:
                validate(candidate)
            except BaseException:
                preserved = candidate.with_name(candidate.name + "." + secrets.token_hex(8) + ".interrupted")
                os.rename(candidate, preserved)
                sync_dir(candidate.parent)
        if not candidate.exists():
            with zipfile.ZipFile(candidate, "x", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
                os.chmod(candidate, 0o600)
                for name, source, row in inputs:
                    check(source, row)
                    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                    info.external_attr = (stat.S_IFREG | 0o600) << 16
                    with archive.open(info, "w", force_zip64=True) as outgoing, source.open("rb") as incoming:
                        shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
                    check(source, row)
                archive.writestr("TRANSFER.json", encoded(intent))
            with candidate.open("rb") as stream:
                os.fsync(stream.fileno())
            validate(candidate)
        os.rename(candidate, output)
        sync_dir(output.parent)
    portable = validate(output)
    receipt = {"schema": PREPARED_SCHEMA, "state": "EXPORTED", "portable": portable, "source": prepared["source"]}
    save(meta / ("export-" + key + "-result.json"), receipt, True)
    return receipt

def stopped(signum, frame):
    global STOPPING
    STOPPING = True
    if CHILD is not None and CHILD.poll() is None:
        CHILD.terminate()
    elif CHILD is None:
        raise KeyboardInterrupt("Preparation was stopped.")

def main():
    global META
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("mode", choices=("prepare", "receive", "inspect", "export"))
    for name in ("directory", "python", "node"):
        parser.add_argument("--" + name, required=True)
    for name in ("source", "source-manifest", "source-manifest-sha256", "archive", "archive-sha256", "output"):
        parser.add_argument("--" + name)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    need(args.mode != "prepare" or args.source and not args.archive, "Prepare selects one trusted source folder.")
    need(args.mode != "receive" or args.archive and args.archive_sha256 and not args.source, "Receive selects one complete private archive and digest.")
    need(args.mode != "export" or args.output, "Select the complete private export path.")
    need(bool(args.source_manifest) == bool(args.source_manifest_sha256), "Select both source authority path and exact digest.")
    if args.mode in ("inspect", "export"):
        need(not any((args.source, args.archive, args.source_manifest, args.archive_sha256)),
             "Inspect/export uses its complete retained original request.")
    if args.mode != "export":
        need(args.output is None, "Only export accepts an output destination.")
    need(sys.platform == "linux", "Use the original supported Linux preparation host.")
    root = absolute(args.directory)
    need(not beneath(root, PUBLIC_ROOT) and not beneath(PUBLIC_ROOT, root), "Keep private preparation outside installed public source.")
    directory(root, create=args.mode in ("prepare", "receive"))
    meta = root / ".preparation"
    directory(meta, create=args.mode in ("prepare", "receive"))
    META = meta
    fd = os.open(meta / "lifetime.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "Retain the private original preparation lock.")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        path_info = (meta / "lifetime.lock").stat()
        need((info.st_dev, info.st_ino) == (path_info.st_dev, path_info.st_ino), "Preparation lock changed.")
        for sig in (signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, stopped)
        if args.mode in ("prepare", "receive"):
            if (meta / "REQUEST.json").exists() and not (meta / "PREPARED.json").exists():
                need(args.resume, "Resume the same incomplete original private preparation explicitly.")
            result = prepare(args, root, meta, fd)
        elif args.mode == "inspect":
            result = {"schema": PREPARED_SCHEMA, "state": "READY", "result": inspect_prepared(root, args.python, args.node, fd), "verifiedAt": stamp()}
        else:
            result = export(args, root, meta, fd)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
    finally:
        if CHILD is not None:
            CHILD.wait()
        os.close(fd)

if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        print(json.dumps({"error": {"code": "TRANSPORT_PLANNING_PREPARATION", "message": str(error)}}), file=sys.stderr)
        raise
