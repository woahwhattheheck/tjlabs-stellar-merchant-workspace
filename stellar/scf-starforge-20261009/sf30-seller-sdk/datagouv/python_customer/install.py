#!/usr/bin/env python3
"""Install a complete customer source selection and use its native workspace receiver."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import fcntl
from contextlib import contextmanager
from uuid import uuid4
from datetime import datetime, timezone


SCHEMA = "datactivist.customer-installation.v1"
DEFAULT_CLI = "stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/cli.mjs"
INVENTORY = "products/datagouv/application-files.json"


class InstallationError(RuntimeError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def checked_hash(value, label):
    if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
        raise InstallationError(label + " must be a lowercase SHA-256.")
    return value


def ordinary_file(path):
    path = Path(path).absolute()
    try:
        info = path.lstat()
    except OSError as error:
        raise InstallationError("Cannot read " + str(path) + ": " + str(error)) from error
    if not stat.S_ISREG(info.st_mode) or path.is_symlink():
        raise InstallationError("Use an ordinary file: " + str(path))
    return path


def original_bytes(path, expected, label):
    file = ordinary_file(path)
    data = file.read_bytes()
    if digest(data) != checked_hash(expected, label + " hash"):
        raise InstallationError(label + " differs from the selected SHA-256.")
    return file, data


def private_directory(path):
    path = Path(path).absolute()
    if path.is_symlink():
        raise InstallationError("Use an ordinary directory: " + str(path))
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir():
        raise InstallationError("Expected a directory: " + str(path))
    return path


def atomic_json(path, value):
    path = Path(path)
    if path.is_symlink():
        raise InstallationError("Installation record is a symbolic link.")
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    handle, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if hasattr(os, "O_DIRECTORY"):
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def relative_path(value):
    if not isinstance(value, str) or not value or "\\" in value or "\0" in value:
        raise InstallationError("Invalid selected source path.")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(part in ("", ".", "..") for part in path.parts) or ":" in path.parts[0]:
        raise InstallationError("Selected source path leaves its application: " + value)
    return path


def decode_source_selection(data):
    try:
        packet = json.loads(data)
    except (ValueError, UnicodeError) as error:
        raise InstallationError("Source selection must be complete decoded UTF-8 JSON.") from error
    if not isinstance(packet, dict):
        raise InstallationError("Source selection must be a JSON object.")
    if packet.get("encoding") == "commons-lz77-v1+base64":
        raise InstallationError("Decode this retained packet with its supplied maintained decoder, then select the complete decoded JSON.")
    rows = packet.get("allSources", packet.get("files"))
    if isinstance(rows, dict):
        rows = [{"path": name, "content": value} for name, value in rows.items()]
    if not isinstance(rows, list) or not rows:
        raise InstallationError("The source selection must contain every selected file in files or allSources.")
    files, metadata = {}, []
    for row in rows:
        if not isinstance(row, dict):
            raise InstallationError("A selected file is malformed.")
        name = str(relative_path(row.get("path")))
        if name in files:
            raise InstallationError("Duplicate selected source path: " + name)
        if "contentBase64" in row:
            try:
                body = base64.b64decode(row["contentBase64"], validate=True)
            except (ValueError, TypeError) as error:
                raise InstallationError("Invalid source bytes for " + name) from error
        elif isinstance(row.get("content"), str):
            body = row["content"].encode("utf-8")
        elif row.get("encoding") == "base64" and isinstance(row.get("base64"), str):
            try:
                body = base64.b64decode(row["base64"], validate=True)
            except (ValueError, TypeError) as error:
                raise InstallationError("Invalid source bytes for " + name) from error
        else:
            raise InstallationError("The source body is missing for " + name)
        actual = digest(body)
        if "bytes" in row and (type(row["bytes"]) is not int or row["bytes"] != len(body)):
            raise InstallationError("Source byte count differs for " + name)
        if row.get("sha256") and checked_hash(row["sha256"], "Source hash") != actual:
            raise InstallationError("Source SHA-256 differs for " + name)
        git_blob = row.get("gitBlobSha", row.get("gitBlob", row.get("sha")))
        if git_blob:
            computed = hashlib.sha1(b"blob " + str(len(body)).encode("ascii") + b"\0" + body).hexdigest()
            if computed != git_blob:
                raise InstallationError("Original Git blob differs for " + name)
        files[name] = body
        metadata.append({"path": name, "bytes": len(body), "sha256": actual})
    paths = set(files)
    for name in paths:
        parts = PurePosixPath(name).parts
        if any(str(PurePosixPath(*parts[:end])) in paths for end in range(1, len(parts))):
            raise InstallationError("A selected file is also a parent directory: " + name)
    return files, sorted(metadata, key=lambda row: row["path"])


def write_selected_source(root, files):
    root = private_directory(root)
    for name, body in files.items():
        target = root.joinpath(*PurePosixPath(name).parts)
        current = root
        for part in PurePosixPath(name).parts[:-1]:
            current = current / part
            if current.is_symlink():
                raise InstallationError("A selected source parent is a symbolic link.")
            current.mkdir(exist_ok=True, mode=0o700)
        if target.exists() or target.is_symlink():
            if ordinary_file(target).read_bytes() != body:
                raise InstallationError("Preserve the existing source edit: " + str(target))
            continue
        handle, temporary = tempfile.mkstemp(prefix=".install-source-", dir=target.parent)
        try:
            with os.fdopen(handle, "wb") as stream:
                stream.write(body)
                stream.flush()
                os.fsync(stream.fileno())
            # A selected file appears only after all original bytes are durable.
            # Creating the link preserves any concurrent existing target.
            os.link(temporary, target)
            if hasattr(os, "O_DIRECTORY"):
                parent = os.open(target.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(parent)
                finally:
                    os.close(parent)
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def source_state(root, manifest):
    failures = []
    for item in manifest:
        target = Path(root).joinpath(*relative_path(item["path"]).parts)
        try:
            actual = ordinary_file(target).read_bytes()
            if len(actual) != item["bytes"] or digest(actual) != item["sha256"]:
                failures.append({"path": item["path"], "state": "changed"})
        except InstallationError:
            failures.append({"path": item["path"], "state": "missing-or-unreadable"})
    return failures


def node_executable(value):
    found = shutil.which(value) if not Path(value).is_absolute() else value
    if not found:
        raise InstallationError("The selected Node executable is unavailable: " + value)
    found = str(Path(found).absolute())
    result = subprocess.run([found, "-p", "JSON.stringify({node:process.versions.node})"], check=False,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)
    if result.returncode:
        raise InstallationError("The selected Node runtime could not start: " + result.stderr.strip())
    try:
        info = json.loads(result.stdout)
    except ValueError as error:
        raise InstallationError("The selected Node runtime returned an unreadable version.") from error
    try:
        major = int(info["node"].split(".")[0])
    except (KeyError, ValueError, AttributeError) as error:
        raise InstallationError("The selected Node runtime did not report its version.") from error
    if major < 24:
        raise InstallationError("The native workspace receiver requires Node 24 or newer.")
    if sys.platform != "linux" or not shutil.which("flock"):
        raise InstallationError("The native workspace receiver requires Linux and util-linux flock.")
    return found, info


def native_json(node, cli, arguments, directory, result_path):
    command = [node, str(cli), *arguments]
    process = subprocess.Popen(command, cwd=directory, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True)
    try:
        stdout, stderr = process.communicate()
    except BaseException:
        # Settle this original native process and its lock-holding descendants
        # before the caller can release its installation lock.
        blocked = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                stdout, stderr = process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                stdout, stderr = process.communicate()
            try:
                atomic_json(result_path, {"startedCommand": [Path(node).name, str(cli), *arguments],
                            "finishedAt": now(), "exitCode": process.returncode, "interrupted": True,
                            "stdout": stdout.decode("utf-8", errors="replace"),
                            "stderr": stderr.decode("utf-8", errors="replace")})
            except Exception:
                pass
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, blocked)
        raise
    receipt = {"startedCommand": [Path(node).name, str(cli), *arguments], "finishedAt": now(),
               "exitCode": process.returncode, "stdout": stdout.decode("utf-8", errors="replace"),
               "stderr": stderr.decode("utf-8", errors="replace")}
    atomic_json(result_path, receipt)
    if process.returncode:
        raise InstallationError("The native command returned exit " + str(process.returncode) +
                                ". Its complete output is retained at " + str(result_path) + ".")
    try:
        return json.loads(stdout)
    except (ValueError, UnicodeError) as error:
        raise InstallationError("The native result is not complete JSON; inspect " + str(result_path) + ".") from error


def file_identity(path):
    file = ordinary_file(path)
    hasher, count = hashlib.sha256(), 0
    with file.open("rb") as stream:
        while part := stream.read(4 * 1024 * 1024):
            hasher.update(part)
            count += len(part)
    return {"bytes": count, "sha256": hasher.hexdigest()}


def retain_file(original, target, expected):
    expected = checked_hash(expected, "Selected file hash")
    target = Path(target)
    if target.exists() or target.is_symlink():
        identity = file_identity(target)
        if identity["sha256"] != expected:
            raise InstallationError("The retained input changed: " + str(target))
        return identity
    original = ordinary_file(original)
    handle, temporary = tempfile.mkstemp(prefix=".receiving-input-", dir=target.parent)
    hasher, count = hashlib.sha256(), 0
    try:
        with os.fdopen(handle, "wb") as out, original.open("rb") as source:
            while part := source.read(4 * 1024 * 1024):
                hasher.update(part)
                count += len(part)
                out.write(part)
            out.flush()
            os.fsync(out.fileno())
        if hasher.hexdigest() != expected:
            raise InstallationError("The selected input differs from its expected SHA-256.")
        os.link(temporary, target)
        return {"bytes": count, "sha256": expected}
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


@contextmanager
def installation_lock(directory):
    path = Path(directory) / ".customer-install.lock"
    handle = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(handle).st_mode):
            raise InstallationError("The installation lock is not an ordinary file.")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise InstallationError("Another installer operation is active for this directory.") from error
        yield
    finally:
        os.close(handle)


def load_record(directory):
    path = Path(directory) / "installation.json"
    try:
        record = json.loads(ordinary_file(path).read_bytes())
    except (ValueError, UnicodeError) as error:
        raise InstallationError("The installation record is unreadable.") from error
    if not isinstance(record, dict) or record.get("schema") != SCHEMA or record.get("directory") != str(Path(directory).absolute()):
        raise InstallationError("Use the original installation directory recorded in installation.json.")
    return record


def save_record(directory, record):
    record["updatedAt"] = now()
    atomic_json(Path(directory) / "installation.json", record)


def operation_output(directory, label):
    results = private_directory(Path(directory) / "operations")
    return results / (now().replace(":", "").replace("-", "") + "-" + label + "-" + uuid4().hex + ".json")


def native_paths(directory, record, node=None):
    source = Path(directory).joinpath(*relative_path(record.get("activeSource", "source")).parts)
    cli = ordinary_file(source.joinpath(*relative_path(record["nativeCli"]).parts))
    executable, runtime = node_executable(node or record["node"])
    return source, cli, executable, runtime


def workspace_path(directory, record):
    path = record.get("activeWorkspace")
    if not path:
        raise InstallationError("This installation has no completed received workspace.")
    return Path(directory).joinpath(*relative_path(path).parts)


def native_arguments(action, *, project=None, archive=None, sha256=None, port=None, source_root=None):
    """Invoke the existing DataGouv CLI and its original archive/receiver."""
    if action == "receive":
        return ["receive", "--file", str(archive), "--directory", str(project), "--sha256", sha256]
    if action == "status":
        return ["status", "--directory", str(project)]
    if action == "serve":
        return ["serve", "--directory", str(project), "--port", str(port), "--source-root", str(source_root)]
    if action == "archive":
        return ["export", "--directory", str(project), "--output", str(archive), "--source-root", str(source_root)]
    raise InstallationError("Unknown native workspace action.")


def run_native(directory, record, action, *, node=None, result_path=None, **values):
    source, cli, executable, runtime = native_paths(directory, record, node)
    return native_json(executable, cli, native_arguments(action, source_root=source, **values),
                       source, result_path or operation_output(directory, action))


def application_inventory(root):
    inventory = json.loads(ordinary_file(Path(root) / INVENTORY).read_bytes())
    paths = inventory.get("files")
    if (inventory.get("schema") != "stellar-forge.datagouv-application-files.v1" or
            not isinstance(paths, list) or not paths or len(paths) > 512 or
            not all(isinstance(path, str) for path in paths) or len(set(paths)) != len(paths)):
        raise InstallationError("The received application inventory is invalid.")
    if DEFAULT_CLI not in paths:
        raise InstallationError("The received application is missing its original CLI.")
    files = []
    for path in paths:
        name = str(relative_path(path))
        identity = file_identity(Path(root).joinpath(*relative_path(name).parts))
        files.append({"path": name, **identity})
    return files


def adopt_received(directory, record, pending, node=None):
    target = Path(directory).joinpath(*relative_path(pending["path"]).parts)
    marker = json.loads(ordinary_file(target / "receiving.json").read_bytes())
    if (marker.get("schema") != "stellar-forge.datagouv-receiving.v1" or
            marker.get("archiveSha256") != record["archiveSha256"]):
        raise InstallationError("The native receiving record belongs to another archive.")
    next_record = dict(record)
    next_record["activeSource"] = pending["path"] + "/application"
    next_record["activeWorkspace"] = pending["path"] + "/workspace"
    next_record["runtimeFiles"] = application_inventory(target / "application")
    native = run_native(directory, next_record, "status", node=node, project=target / "workspace")
    if native.get("workspace", {}).get("id") != marker.get("workspaceId"):
        raise InstallationError("The embedded application reopened a different workspace.")
    next_record["received"] = marker
    next_record["state"] = "READY"
    next_record["receivedAt"] = marker.get("receivedAt")
    next_record["pendingReceive"] = None
    next_record["receivingAttempts"] = [*record.get("receivingAttempts", []),
                                       {**pending, "state": "COMPLETE", "workspaceId": marker["workspaceId"]}]
    record.clear()
    record.update(next_record)
    save_record(directory, record)


def receive_selected(directory, record, retained_archive, node=None):
    pending = record.get("pendingReceive")
    if pending:
        target = Path(directory).joinpath(*relative_path(pending["path"]).parts)
        if (target / "receiving.json").exists():
            adopt_received(directory, record, pending, node)
            return
        if target.exists() or target.is_symlink():
            # The original receiver requires a new destination. Preserve the
            # interrupted attempt and receive the same archive into a fresh one.
            record.setdefault("receivingAttempts", []).append({**pending, "state": "INTERRUPTED"})
            pending = None
    if pending is None:
        private_directory(Path(directory) / "received")
        pending = {"path": "received/" + uuid4().hex, "startedAt": now(),
                   "archiveSha256": record["archiveSha256"]}
    record["pendingReceive"], record["state"] = pending, "RECEIVING"
    save_record(directory, record)
    target = Path(directory).joinpath(*relative_path(pending["path"]).parts)
    result = run_native(directory, record, "receive", node=node, project=target,
                        archive=retained_archive, sha256=record["archiveSha256"])
    if (not isinstance(result, dict) or result.get("archiveSha256") != record["archiveSha256"] or
            result.get("directory") != str(target)):
        raise InstallationError("The native receiver returned a different transfer identity.")
    adopt_received(directory, record, pending, node)


def install(args):
    if bool(args.archive) != bool(args.archive_sha256):
        raise InstallationError("Supply both --archive and --archive-sha256.")
    if bool(args.source) != bool(args.source_sha256):
        raise InstallationError("Supply both --source and --source-sha256 when choosing an external source selection.")
    if args.archive_sha256:
        checked_hash(args.archive_sha256, "Workspace archive hash")
    if args.source:
        _, source_bytes = original_bytes(args.source, args.source_sha256, "Source selection")
        source_sha256 = args.source_sha256
    elif args.archive:
        source_bytes, _, archive_identity = source_from_archive(args.archive)
        if archive_identity["sha256"] != args.archive_sha256:
            raise InstallationError("The complete native archive differs from its selected SHA-256.")
        source_sha256 = digest(source_bytes)
    else:
        raise InstallationError("Choose the original workspace archive or a complete source selection.")
    files, selected_files = decode_source_selection(source_bytes)
    cli_path = str(relative_path(args.native_cli))
    if cli_path not in files:
        raise InstallationError("The selected native CLI must be included in the complete source selection.")
    node, runtime = node_executable(args.node)
    directory = private_directory(args.directory)
    with installation_lock(directory):
        record_path = directory / "installation.json"
        if record_path.exists() or record_path.is_symlink():
            record = load_record(directory)
            if record.get("sourceSha256") != source_sha256 or record.get("nativeCli") != cli_path:
                raise InstallationError("This directory belongs to a different source selection.")
            if record.get("archiveSha256") != args.archive_sha256:
                if record.get("archiveSha256") is None and record["state"] == "SOURCE_READY" and args.archive:
                    record["archiveSha256"] = args.archive_sha256
                    save_record(directory, record)
                else:
                    raise InstallationError("This directory belongs to a different workspace transfer.")
        else:
            if any(item.name != ".customer-install.lock" for item in directory.iterdir()):
                raise InstallationError("Choose a new or empty installation directory.")
            record = {"schema": SCHEMA, "directory": str(directory), "sourceSha256": source_sha256,
                      "nativeCli": cli_path, "archiveSha256": args.archive_sha256, "createdAt": now(),
                      "state": "INSTALLING", "node": node, "runtime": runtime, "files": selected_files}
            save_record(directory, record)
        inputs = private_directory(directory / "inputs")
        write_selected_source(inputs, {"selected-source.json": source_bytes})
        if record["state"] == "INSTALLING":
            write_selected_source(directory / "source", files)
            record["state"] = "SOURCE_READY"
            save_record(directory, record)
        if args.archive and record["state"] != "READY":
            retained_archive = inputs / "workspace.datawork"
            record["archive"] = retain_file(args.archive, retained_archive, args.archive_sha256)
            save_record(directory, record)
            receive_selected(directory, record, retained_archive, node)
        record["node"], record["runtime"] = node, runtime
        save_record(directory, record)
        return installation_status(directory, record, node=node)


def resume(args):
    directory = existing_directory(args.directory)
    record = load_record(directory)
    inputs = directory / "inputs"
    return install(argparse.Namespace(
        directory=str(directory), source=str(inputs / "selected-source.json"),
        source_sha256=record["sourceSha256"], native_cli=record["nativeCli"],
        archive=str(inputs / "workspace.datawork") if record.get("archiveSha256") else None,
        archive_sha256=record.get("archiveSha256"), node=args.node or record["node"],
    ))


def existing_directory(value):
    path = Path(value).absolute()
    if path.is_symlink() or not path.is_dir():
        raise InstallationError("Choose the existing ordinary installation directory.")
    return path


def installation_status(directory, record, node=None):
    source = Path(directory).joinpath(*relative_path(record.get("activeSource", "source")).parts)
    files = record.get("runtimeFiles", record["files"])
    result = {"schema": SCHEMA, "directory": str(directory), "state": record["state"],
              "source": {"directory": str(source), "files": len(files), "changes": source_state(source, files)},
              "bootstrapSource": {"file": str(Path(directory) / "inputs" / "selected-source.json"),
                                  "sha256": record["sourceSha256"], "files": len(record["files"])},
              "runtime": record.get("runtime"), "node": node or record["node"],
              "nativeCli": str(source.joinpath(*relative_path(record["nativeCli"]).parts)),
              "workspace": str(workspace_path(directory, record)) if record["state"] == "READY" else None,
              "originalArchiveSha256": record.get("archiveSha256"),
              "receivingAttempts": record.get("receivingAttempts", []),
              "pendingReceive": record.get("pendingReceive"),
              "createdAt": record["createdAt"], "updatedAt": record.get("updatedAt")}
    if record["state"] == "READY":
        result["native"] = run_native(directory, record, "status", node=node, project=workspace_path(directory, record))
        selected = result["native"]["selection"]["publicationId"]
        result["datasets"] = [
            {"publicationId": publication["id"], "snapshot": publication["snapshot"],
             "captureHash": publication["captureHash"], "selected": publication["id"] == selected,
             "config": str(workspace_path(directory, record).joinpath(
                 *relative_path(publication["nativePath"]).parts, "runs", publication["runId"], "dataset.json"))}
            for publication in result["native"]["publications"] if publication["state"] == "PUBLISHED"
        ]
    return result


def status(args):
    directory = existing_directory(args.directory)
    with installation_lock(directory):
        return installation_status(directory, load_record(directory), node=args.node)


def require_received(record):
    if record["state"] != "READY":
        raise InstallationError("Finish the original workspace receive with the original install command first.")


def serve(args):
    directory = existing_directory(args.directory)
    with installation_lock(directory):
        record = load_record(directory)
        require_received(record)
        source, cli, node, runtime = native_paths(directory, record, args.node)
        command = [node, str(cli), *native_arguments("serve", project=workspace_path(directory, record),
                                                   port=args.port, source_root=source)]
    # The original server owns its lifetime and original workspace locks.
    os.chdir(source)
    os.execv(node, command)


def source_from_archive(path, workspace_id=None):
    original = ordinary_file(path)
    if original.stat().st_size > 768 * 1024 * 1024:
        raise InstallationError("The complete archive exceeds the native 768 MiB receiving limit.")
    raw = original.read_bytes()
    packet = json.loads(raw)
    if not isinstance(packet, dict) or not isinstance(packet.get("files"), list):
        raise InstallationError("The complete native archive JSON is unreadable.")
    if (packet.get("schema") != "stellar-forge.datagouv-portable-workspace.v1" or
            packet.get("complete") is not True or not isinstance(packet.get("workspace"), dict) or
            not isinstance(packet["workspace"].get("id"), str) or
            workspace_id is not None and packet["workspace"]["id"] != workspace_id):
        raise InstallationError("The exported native archive does not identify this workspace.")
    rows = []
    for entry in packet["files"]:
        if not isinstance(entry, dict):
            raise InstallationError("A native archive member is malformed.")
        if isinstance(entry.get("path"), str) and entry["path"].startswith("application/"):
            rows.append({"path": entry["path"][len("application/"):], "bytes": entry["bytes"],
                         "sha256": entry["sha256"], "contentBase64": entry["contentBase64"]})
    selection = {"schema": "datactivist.customer-source.v1", "createdAt": packet["createdAt"],
                 "sourceArchiveSha256": digest(raw), "files": rows}
    body = (json.dumps(selection, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    # This copies the native application's original source selection verbatim;
    # the maintained receiver still validates and opens the complete workspace.
    files, _ = decode_source_selection(body)
    if DEFAULT_CLI not in files or INVENTORY not in files:
        raise InstallationError("The native archive does not include the complete application entrypoints.")
    return body, files, {"bytes": len(raw), "sha256": digest(raw)}


def archive(args):
    directory = existing_directory(args.directory)
    out = Path(args.out).absolute()
    if out == directory or directory in out.parents:
        raise InstallationError("Choose a separate handover directory outside the installation.")
    private_directory(out)
    with installation_lock(directory), installation_lock(out):
        record = load_record(directory)
        require_received(record)
        marker = out / "handover.json"
        if marker.exists() or marker.is_symlink():
            handover = json.loads(ordinary_file(marker).read_bytes())
            if handover.get("schema") != "datactivist.customer-handover.v1" or handover.get("installation") != str(directory):
                raise InstallationError("This directory belongs to another handover.")
        else:
            if any(item.name != ".customer-install.lock" for item in out.iterdir()):
                raise InstallationError("Choose a new or empty handover directory.")
            handover = {"schema": "datactivist.customer-handover.v1", "installation": str(directory),
                        "createdAt": now(), "state": "EXPORTING", "nativeCli": record["nativeCli"],
                        "workspaceId": record["received"]["workspaceId"]}
            atomic_json(marker, handover)
        source_file, workspace_file = out / "source.json", out / "workspace.datawork"
        if handover["state"] == "COMPLETE":
            for name, path in (("source", source_file), ("workspace", workspace_file), ("installer", out / "install.py")):
                if file_identity(path) != handover[name]:
                    raise InstallationError("A completed handover file changed: " + str(path))
            return handover
        if workspace_file.exists() or workspace_file.is_symlink():
            try:
                source_body, application, workspace_identity = source_from_archive(workspace_file, handover["workspaceId"])
            except (InstallationError, ValueError, KeyError, TypeError):
                # Preserve our incomplete export and let the original exporter
                # create one new complete archive in the existing operation.
                previous = out / ("interrupted-" + uuid4().hex + ".datawork")
                workspace_file.rename(previous)
                handover.setdefault("interruptedArchives", []).append(previous.name)
                atomic_json(marker, handover)
        if not workspace_file.exists():
            handover["nativeArchive"] = run_native(directory, record, "archive", node=args.node,
                                                   project=workspace_path(directory, record), archive=workspace_file,
                                                   result_path=out / "native-export.json")
            atomic_json(marker, handover)
            source_body, application, workspace_identity = source_from_archive(workspace_file, handover["workspaceId"])
        write_selected_source(out, {"source.json": source_body})
        installer_path = DEFAULT_CLI.rsplit("/", 1)[0] + "/python_customer/install.py"
        installer_body = application.get(installer_path, ordinary_file(__file__).read_bytes())
        write_selected_source(out, {"install.py": installer_body})
        handover["source"] = file_identity(source_file)
        handover["workspace"] = workspace_identity
        handover["installer"] = file_identity(out / "install.py")
        handover["state"], handover["completedAt"] = "COMPLETE", now()
        handover["receive"] = {"source": "source.json", "sourceSha256": handover["source"]["sha256"],
                              "archive": "workspace.datawork", "archiveSha256": handover["workspace"]["sha256"],
                              "nativeCli": record["nativeCli"]}
        atomic_json(marker, handover)
        return handover


def main(argv=None):
    if sys.version_info < (3, 10):
        raise InstallationError("Use Python 3.10 or newer.")
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("install", help="Install complete selected source and receive its native workspace.")
    create.add_argument("--directory", required=True)
    create.add_argument("--source", help="Optional complete source-selection JSON; otherwise use the archive application.")
    create.add_argument("--source-sha256")
    create.add_argument("--archive", help="Original maintained workspace.datawork archive.")
    create.add_argument("--archive-sha256")
    create.add_argument("--native-cli", default=DEFAULT_CLI, help="Exact selected native CLI path within the source packet.")
    create.add_argument("--node", default="node")
    create.set_defaults(function=install)
    again = commands.add_parser("resume", help="Continue receiving from this installation's retained original inputs.")
    again.add_argument("--directory", required=True)
    again.add_argument("--node")
    again.set_defaults(function=resume)
    show = commands.add_parser("status", help="Show the installation, source edits and native workspace.")
    show.add_argument("--directory", required=True)
    show.add_argument("--node")
    show.set_defaults(function=status)
    run = commands.add_parser("serve", help="Open the received workspace through its original server.")
    run.add_argument("--directory", required=True)
    run.add_argument("--node")
    run.add_argument("--port", type=int, default=0)
    run.set_defaults(function=serve)
    export = commands.add_parser("archive", help="Export editable source and the native continuing workspace together.")
    export.add_argument("--directory", required=True)
    export.add_argument("--out", required=True, help="A separate new handover directory.")
    export.add_argument("--node")
    export.set_defaults(function=archive)
    args = parser.parse_args(argv)
    if getattr(args, "port", 0) < 0 or getattr(args, "port", 0) > 65535:
        parser.error("--port must be between 0 and 65535.")
    def interrupted(signum, frame):
        raise KeyboardInterrupt("Signal " + str(signum))

    original_term = signal.signal(signal.SIGTERM, interrupted)
    try:
        result = args.function(args)
        if result is not None:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except KeyboardInterrupt:
        print(json.dumps({"error": "INSTALLATION_INTERRUPTED",
                          "message": "The original native operation stopped. Resume this installation from its retained inputs."}),
              file=sys.stderr)
        return 130
    except (InstallationError, OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": type(error).__name__, "message": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    finally:
        signal.signal(signal.SIGTERM, original_term)


if __name__ == "__main__":
    raise SystemExit(main())
