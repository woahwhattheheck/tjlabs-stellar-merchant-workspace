"""Operate the complete Research Installation on retained original case copies.

Native business writers remain Operations, SourceDesk and ResearchIntake.
Run the complete original programme, or continue its retained native/browser phases.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import threading
import uuid
import zipfile

from model import Workspace, MAX_BUNDLE
from operations import Operations, dcat_sources
import operations_installations as installations
from operations_installation_sources import SourceDesk
from operations_installation_research import ResearchIntake

SCHEMA = "stellar-forge.research-installation-course.v1"
MANIFEST = "research-installation-course.json"
SHA = re.compile(r"[a-f0-9]{64}")
REPORT_MAX = 128 * 1024 * 1024


def need(value, message):
    if not value:
        raise ValueError(message)


def stamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def raw_json(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                       indent=2) + "\n").encode("utf-8")


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def inside(path, root):
    path, root = Path(path).resolve(), Path(root).resolve()
    return path == root or root in path.parents


def private_directory(path):
    path = Path(path)
    need(path.is_absolute(), "Select an absolute original course directory.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    need(path.is_dir() and not path.is_symlink(), "Use an ordinary owned course directory.")
    return path.resolve()


def ordinary(path, maximum=None):
    path = Path(path)
    handle = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(handle)
        need(stat.S_ISREG(before.st_mode), "Read a complete ordinary retained file.")
        need(maximum is None or before.st_size <= maximum, "The complete retained file exceeds its native capacity.")
        with os.fdopen(handle, "rb", closefd=False) as stream:
            raw = stream.read() if maximum is None else stream.read(maximum + 1)
        after, named = os.fstat(handle), os.lstat(path)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and
             (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino) and len(raw) == before.st_size,
             "The original file changed while it was being read.")
        return raw
    finally:
        os.close(handle)


def file_record(path):
    path = Path(path)
    handle = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(handle)
        need(stat.S_ISREG(before.st_mode), "Retain an ordinary complete output.")
        digest = hashlib.sha256()
        size = 0
        with os.fdopen(handle, "rb", closefd=False) as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
                size += len(chunk)
        after, named = os.fstat(handle), os.lstat(path)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and
             (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino) and size == before.st_size,
             "The complete output changed while recording its identity.")
        return {"path": str(path.resolve()), "bytes": size, "sha256": digest.hexdigest()}
    finally:
        os.close(handle)


def verify_file(record):
    actual = file_record(record["path"])
    need(actual["bytes"] == record["bytes"] and actual["sha256"] == record["sha256"],
         "Continue the same complete retained file: " + record["path"])
    return actual


def retain(path, raw):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        need(ordinary(path, len(raw)) == raw, "Preserve the original complete output: " + str(path))
        return file_record(path)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".partial")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            need(ordinary(path, len(raw)) == raw, "The concurrently retained output differs.")
    finally:
        temporary.unlink(missing_ok=True)
    return file_record(path)


def copy_original(source, destination, expected_sha256):
    need(isinstance(expected_sha256, str) and SHA.fullmatch(expected_sha256),
         "Select the original whole source SHA256.")
    source, destination = Path(source), Path(destination)
    existing = destination.exists()
    if existing:
        record = file_record(destination)
        need(record["sha256"] == expected_sha256, "The retained original source differs.")
        return record
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_name(destination.name + "." + uuid.uuid4().hex + ".partial")
    handle = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(handle)
        need(stat.S_ISREG(before.st_mode), "Select a complete ordinary original source.")
        digest = hashlib.sha256()
        size = 0
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as target, os.fdopen(handle, "rb", closefd=False) as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
                size += len(chunk)
                target.write(chunk)
            target.flush()
            os.fsync(target.fileno())
        after, named = os.fstat(handle), os.lstat(source)
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns) and
             (named.st_dev, named.st_ino) == (before.st_dev, before.st_ino) and
             size == before.st_size and digest.hexdigest() == expected_sha256,
             "The actual selected source changed during complete retention.")
        try:
            os.link(temporary, destination)
        except FileExistsError:
            need(file_record(destination)["sha256"] == expected_sha256,
                 "The concurrently retained source differs.")
    finally:
        os.close(handle)
        temporary.unlink(missing_ok=True)
    return file_record(destination)


def read_json(path, maximum=REPORT_MAX):
    return json.loads(ordinary(path, maximum).decode("utf-8"))


def optional_json(path):
    try:
        return read_json(path)
    except FileNotFoundError:
        return None


def replace_json(path, value):
    path = Path(path)
    directory = path.parent
    temporary = directory / (path.name + "." + uuid.uuid4().hex + ".partial")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw_json(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)



def update_manifest(directory, value):
    replace_json(directory / MANIFEST, value)

@contextmanager
def course_lock(directory):
    directory = private_directory(directory)
    descriptor = os.open(directory / "research-installation-course.lock",
                         os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a+b") as lock:
        need(stat.S_ISREG(os.fstat(lock.fileno()).st_mode), "Keep the original course lock.")
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield directory


def request_id(manifest, name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, SCHEMA + ":" + manifest["operation"] + ":" + name))


def open_operations(manifest, received=False):
    key = "receivedWorkspaceDirectory" if received else "workspaceDirectory"
    workspace = Workspace(manifest[key], manifest["sourcePath"])
    try:
        return workspace, Operations(workspace)
    except BaseException:
        workspace.close()
        raise


def retain_execution_source(directory, manifest):
    raw = ordinary(Path(__file__), 1024 * 1024)
    record = retain(directory / "source-editions" / (sha(raw) + ".py"), raw)
    versions = manifest.setdefault("sourceEditions", [])
    if record not in versions:
        versions.append(record)
        update_manifest(directory, manifest)


def prepare(config):
    """Receive one actual original Operations case into a private course copy."""
    with course_lock(config["directory"]) as directory:
        operation = config.get("operation")
        actor = config.get("actor")
        need(isinstance(operation, str) and 1 <= len(operation) <= 200 and
             isinstance(actor, str) and 1 <= len(actor.strip()) <= 300,
             "Keep the original course operation and selected recording operator.")
        archive = config.get("caseArchive")
        need(isinstance(archive, dict) and set(archive) == {"path", "sha256"},
             "Select the complete original native Operations ZIP and its exact SHA256.")
        selected_files = config.get("researchFiles")
        need(isinstance(selected_files, list) and selected_files,
             "Select the actual complete Research source files.")
        need(isinstance(config.get("selection"), dict),
             "Retain the complete explicitly selected Research and Workshare inputs.")
        name = config.get("name")
        need(isinstance(name, str) and 1 <= len(name.strip()) <= 260,
             "Name the original selected customer installation course.")
        selection = deepcopy({key: config[key] for key in
                              ("operation", "actor", "caseArchive", "researchFiles", "selection", "name")})
        manifest = optional_json(directory / MANIFEST)
        if manifest is None:
            manifest = {"schema": SCHEMA, "operation": operation, "actor": actor,
                        "selection": selection, "phase": "PREPARING", "createdAt": stamp(),
                        "workspaceDirectory": str(directory / "working-workspace"),
                        "receivedWorkspaceDirectory": str(directory / "received-workspace"),
                        "sourcePath": str(directory / "planning-original-source.json"),
                        "files": [], "sourceEditions": []}
            update_manifest(directory, manifest)
        need(manifest["schema"] == SCHEMA and manifest["selection"] == selection,
             "Continue the exact original case, files and customer selections.")
        retain_execution_source(directory, manifest)
        if manifest["phase"] != "PREPARING":
            for item in [manifest["caseArchive"], *manifest["files"]]:
                verify_file(item)
            return manifest
        case_record = copy_original(archive["path"], directory / "original-case.zip", archive["sha256"])
        raw = ordinary(case_record["path"], dcat_sources.MAX_BUNDLE)
        document, members = Operations._unpack(raw)
        need("planning.zip" in members, "Retain the original complete planning source.")
        planning_raw = members["planning.zip"]
        need(len(planning_raw) <= MAX_BUNDLE, "Keep the original native planning archive capacity.")
        with zipfile.ZipFile(io.BytesIO(planning_raw)) as planning:
            entry = planning.getinfo("original-source.json")
            need(entry.file_size <= MAX_BUNDLE, "Keep the complete original source within its native capacity.")
            source = planning.read(entry)
        need(sha(source) == document["plan"]["source"]["sha256"],
             "The original planning source differs from the retained native case.")
        retain(Path(manifest["sourcePath"]), source)
        files = []
        for index, item in enumerate(selected_files):
            need(isinstance(item, dict) and all(key in item for key in
                 ("path", "sha256", "name", "kind", "sourceUrl", "observedAt")),
                 "Keep each original Research file and its actual source selection.")
            filename = item["name"]
            need(isinstance(filename, str) and filename not in ("", ".", "..") and
                 Path(filename).name == filename and not any(ord(c) < 32 for c in filename),
                 "Use one complete original source filename.")
            record = copy_original(item["path"], directory / "originals" / str(index) / filename, item["sha256"])
            files.append({**deepcopy(item), **record})
        original = {"caseId": document["program"]["id"], "version": document["program"]["version"],
                    "planId": document["program"]["planId"], "planRevision": document["program"]["planRevision"],
                    "planSourceSha256": document["plan"]["source"]["sha256"]}
        manifest.update({"caseArchive": case_record, "files": files, "original": original})
        update_manifest(directory, manifest)
        workspace, operations = open_operations(manifest)
        try:
            received = operations.import_bundle(raw, name, request_id(manifest, "working-case"), actor)
            current = operations.read(received["id"])
            need(current["program"]["origin"]["programId"] == original["caseId"] and
                 current["program"]["version"] == original["version"],
                 "The copied native case differs from its original history.")
            manifest.update({"caseId": received["id"], "planId": current["program"]["planId"],
                             "caseReceiving": received,
                             "phase": "PREPARED", "preparedAt": stamp()})
            update_manifest(directory, manifest)
        finally:
            workspace.close()
        return manifest


def verify_received(manifest, directory, result, operated, archive):
    """Verify the whole received source history against its retained native receipt."""
    need(result["state"] == "RECEIVED" and
         result["archive"] == {key: archive[key] for key in ("bytes", "sha256")} and
         result["installation"] == {"id": operated["installationId"],
                                    "revision": operated["revision"], "sha256": operated["sha256"]},
         "Keep the original complete receiving archive and saved Installation.")
    origin = result["draft"]["origin"]
    need(result["draft"]["draftId"] == operated["draftId"] and
         origin["caseId"] == manifest["caseId"] and origin["draftId"] == operated["draftId"] and
         origin["manifestSha256"] == result["manifestSha256"] and
         origin["ledgerSha256"] == result["originalLedger"]["sha256"],
         "The independent Source Desk must retain its exact original case and ledger.")
    original_root = directory / "received-research" / "original"
    ledger_path = original_root / result["originalLedger"]["path"]
    need(inside(ledger_path, original_root) and file_record(ledger_path)["sha256"] == origin["ledgerSha256"],
         "Keep the complete original Source Desk ledger in independent receiving.")
    for row in result["files"]:
        path = original_root / row["path"]
        need(inside(path, original_root), "Use the retained receiving archive member.")
        verify_file({"path": str(path), "bytes": row["bytes"], "sha256": row["sha256"]})
    workspace, operations = open_operations(manifest, received=True)
    try:
        case_id = result["case"]["id"]
        current_case = operations.read(case_id)
        received_plan_id = current_case["program"]["planId"]
        saved = installations.get(operations, case_id, operated["installationId"], operated["revision"])
        need(saved["sha256"] == operated["sha256"] and saved["preview"]["document"] == operated["document"],
             "The cold receiving must retain the complete saved Installation.")
        desk = SourceDesk(operations)
        with workspace.mutex:
            state = desk._state(case_id, operated["draftId"])
        need(state["caseId"] == case_id and state["receivedFrom"] == origin,
             "Reopen the actual independently received current draft and its original provenance.")
    finally:
        workspace.close()
    return received_plan_id


def finish(config):
    """Receive the actual browser-exported Installation and every Research file."""
    with course_lock(config["directory"]) as directory:
        manifest = read_json(directory / MANIFEST)
        need(manifest["schema"] == SCHEMA and manifest["phase"] in ("PREPARED", "RECEIVED", "COMPLETE"),
             "Prepare the original complete course before independent receiving.")
        retain_execution_source(directory, manifest)
        browser_path = directory / "research-installation-browser.json"
        browser = read_json(browser_path)
        need(browser.get("state") == "COMPLETE" and browser.get("completed") is True and
             browser.get("operation") == manifest["operation"] and browser.get("phase") == "OPERATED" and
             browser.get("caseId") == manifest["caseId"],
             "Retain the actual operated browser chapter for this same copied case.")
        archive = browser.get("archive")
        need(isinstance(archive, dict) and inside(archive["path"], directory),
             "Select the complete download retained by this original browser course.")
        verify_file(archive)
        workspace, operations = open_operations(manifest)
        try:
            saved = installations.get(operations, manifest["caseId"],
                                      browser["installationId"], browser["revision"])
            need(saved["id"] == browser["installationId"] and saved["revision"] == browser["revision"],
                 "The operated browser chapter selects another saved Installation.")
            desk = SourceDesk(operations)
            prepared = desk.preparation(manifest["caseId"], browser["draftId"], browser["preparationId"])
            need(prepared, "Keep the complete original prepared source document.")
            expected = sorted((row["kind"], row["bytes"], row["sha256"]) for row in manifest["files"])
            actual = sorted((row["kind"], row["bytes"], row["sha256"]) for row in prepared["originals"])
            need(actual == expected, "Receive every exact original Research input selected for this course.")
            operated = {"installationId": saved["id"], "revision": saved["revision"], "sha256": saved["sha256"],
                        "draftId": browser["draftId"], "preparationId": browser["preparationId"],
                        "document": deepcopy(saved["preview"]["document"])}
        finally:
            workspace.close()
        result_path = directory / "research-installation-receiving.json"
        prior = optional_json(result_path)
        if prior is not None:
            need(prior["archive"] == archive and prior["operated"] == operated and
                 prior["operation"] == manifest["operation"],
                 "Preserve the original independent receiving selection.")
        if prior is not None:
            # Retain the original complete receipt and later recipient edits after a successful transfer.
            result = prior["result"]
        else:
            receiving_workspace, receiving_operations = open_operations(manifest, received=True)
            try:
                result = ResearchIntake.receive_installation(
                    receiving_operations, archive["path"], archive["sha256"],
                    request_id=request_id(manifest, "received-case"), actor=manifest["actor"],
                    name=manifest["selection"]["name"] + " — received",
                    directory=str(directory / "received-research"))
                outcome = {"schema": SCHEMA + ".receiving", "operation": manifest["operation"],
                           "archive": archive, "operated": operated, "result": result}
                retain(result_path, raw_json(outcome))
            finally:
                receiving_workspace.close()
        case_id = result["case"]["id"]
        received_plan_id = verify_received(manifest, directory, result, operated, archive)
        if manifest["phase"] != "COMPLETE":
            manifest.update({"phase": "RECEIVED", "receivedCaseId": case_id,
                             "receivedPlanId": received_plan_id,
                             "installation": operated, "archive": archive,
                             "receivedProjects": result["projects"], "receiving": file_record(result_path),
                             "browserOperation": file_record(browser_path), "receivedAt": manifest.get("receivedAt", stamp())})
            update_manifest(directory, manifest)
        return manifest


def seal(config):
    """Complete after the original owner has operated the independently received UI."""
    with course_lock(config["directory"]) as directory:
        manifest = read_json(directory / MANIFEST)
        need(manifest["schema"] == SCHEMA and manifest["phase"] in ("RECEIVED", "COMPLETE"),
             "Independently receive the whole Installation and Research delivery first.")
        retain_execution_source(directory, manifest)
        browser_path = directory / "research-installation-browser-received.json"
        browser = read_json(browser_path)
        need(browser.get("state") == "COMPLETE" and browser.get("completed") is True and
             browser.get("operation") == manifest["operation"] and browser.get("phase") == "RECEIVED" and
             browser.get("caseId") == manifest["receivedCaseId"] and
             browser.get("installationId") == manifest["installation"]["installationId"] and
             browser.get("revision") == manifest["installation"]["revision"],
             "Retain the actual cold-reopened customer browser chapter.")
        for item in (manifest["archive"], manifest["receiving"], manifest["browserOperation"]):
            verify_file(item)
        workspace, operations = open_operations(manifest, received=True)
        try:
            selected = manifest["installation"]
            actual = installations.get(operations, manifest["receivedCaseId"],
                                       selected["installationId"], selected["revision"])
            need(actual["sha256"] == selected["sha256"], "The selected actual receiving edition changed.")
        finally:
            workspace.close()
        observed = file_record(browser_path)
        if manifest["phase"] == "COMPLETE":
            need(manifest["browserReceiving"] == observed, "The completed customer browser record changed.")
            return manifest
        manifest.update({"phase": "COMPLETE", "browserReceiving": observed, "completedAt": stamp()})
        update_manifest(directory, manifest)
        return manifest


@contextmanager
def programme_lock(directory):
    directory = private_directory(directory)
    descriptor = os.open(directory / "research-installation-programme.lock",
                         os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "a+b") as lock:
        need(stat.S_ISREG(os.fstat(lock.fileno()).st_mode), "Retain the original whole-programme lock.")
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield directory, lock


def write_programme(directory, value):
    replace_json(directory / "research-installation-programme.json", value)

def stop_owned_process(child):
    if child is None or child.poll() is not None:
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        child.wait()
        return
    try:
        child.wait(timeout=20)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()


def operate_browser_phase(config, directory, lock, programme, phase):
    """Serve only the course-owned case through the maintained original server."""
    from server import create_server
    manifest = read_json(directory / MANIFEST)
    report_path = directory / ("research-installation-browser.json" if phase == "operate"
                               else "research-installation-browser-received.json")
    expected_case = manifest["caseId"] if phase == "operate" else manifest["receivedCaseId"]
    expected_phase = "OPERATED" if phase == "operate" else "RECEIVED"
    def complete_report():
        result = read_json(report_path)
        need(result.get("operation") == manifest["operation"] and result.get("phase") == expected_phase and
             result.get("caseId") == expected_case and result.get("state") == "COMPLETE" and
             result.get("completed") is True, "Retain the complete original browser phase result.")
        return file_record(report_path)
    stage_name = "browser-" + phase
    prior = next((row for row in programme["stages"]
                  if row["name"] == stage_name and row.get("status") == "COMPLETED"), None)
    if prior is not None:
        need(complete_report() == prior["result"], "The completed original browser result changed.")
        return
    # A complete retained browser chapter resolves a lost original process response.
    existing = optional_json(report_path)
    if existing is not None and existing.get("state") == "COMPLETE" and existing.get("completed") is True:
        record = complete_report()
        programme["stages"].append({"name": stage_name, "status": "COMPLETED",
            "result": record, "recoveredAt": stamp(), "recovery": "original retained complete browser chapter"})
        write_programme(directory, programme)
        return
    server = server_thread = child = None
    stage = {"name": stage_name, "status": "STARTING", "startedAt": stamp()}
    programme["stages"].append(stage)
    write_programme(directory, programme)
    access_file = directory / ("browser-" + phase + "-access.html")
    try:
        workspace_path = manifest["workspaceDirectory"] if phase == "operate" else manifest["receivedWorkspaceDirectory"]
        server = create_server(workspace_path, manifest["sourcePath"], port=0, access_file=access_file)
        server_thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2},
                                         name="research-installation-" + phase)
        server_thread.start()
        private_access = directory / ("browser-" + phase + "-access.json")
        # The original server keeps its HTML access file; the CLI consumes a private adapter.
        replace_json(private_access, {"url": server.origin, "token": server.token})
        browser_config = {"manifestPath": str(directory / MANIFEST), "directory": str(directory),
                          "phase": phase, "workspaceUrl": server.origin, "accessFile": str(private_access),
                          "browserConfig": deepcopy(config["browserConfig"])}
        attempt = uuid.uuid4().hex
        input_path = directory / ("browser-" + phase + "-" + attempt + ".json")
        retain(input_path, raw_json(browser_config))
        browser_module = Path(__file__).resolve().with_name("operations_research_installation_browser.mjs")
        need(browser_module.is_file(), "Install the complete original Research Installation browser chapter.")
        node = shutil.which(config.get("node", "node"))
        need(node, "Select the existing installed Node runtime.")
        log_path = directory / ("browser-" + phase + "-" + attempt + ".log")
        with open(log_path, "xb", buffering=0) as output:
            os.chmod(log_path, 0o600)
            child = subprocess.Popen([node, str(browser_module), str(input_path)],
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                start_new_session=True, pass_fds=(lock.fileno(),),
                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
            stage.update({"status": "RUNNING", "pid": child.pid, "input": file_record(input_path),
                          "log": str(log_path), "workspaceDirectory": workspace_path})
            write_programme(directory, programme)
            code = child.wait()
            output.flush()
            os.fsync(output.fileno())
        stage.update({"exitCode": code, "finishedAt": stamp(), "logFile": file_record(log_path)})
        need(code == 0, "The original browser chapter stopped; continue its retained case and log: " + str(log_path))
        stage.update({"status": "COMPLETED", "result": complete_report()})
        write_programme(directory, programme)
    except BaseException as error:
        stage.update({"status": "INTERRUPTED", "interruptedAt": stamp(),
                      "error": {"type": type(error).__name__, "message": str(error)}})
        write_programme(directory, programme)
        raise
    finally:
        stop_owned_process(child)
        if server is not None:
            try:
                if server_thread is not None and server_thread.is_alive():
                    server.shutdown()
                    server_thread.join()
            finally:
                try:
                    server.server_close()
                finally:
                    server.workspace.close()


@contextmanager
def selected_research_node(config):
    """Use the same installed Node for browser and native Research operations."""
    node = shutil.which(config.get("node", "node"))
    need(node, "Select the existing installed Node runtime.")
    prior = os.environ.get("GRANT_RESEARCH_NODE")
    os.environ["GRANT_RESEARCH_NODE"] = node
    try:
        yield
    finally:
        if prior is None:
            os.environ.pop("GRANT_RESEARCH_NODE", None)
        else:
            os.environ["GRANT_RESEARCH_NODE"] = prior


def run_all(config):
    """Run native preparation, both real browser chapters and independent receiving."""
    browser = config.get("browserConfig")
    need(isinstance(browser, dict) and set(browser) == {"chromiumExecutable", "playwrightModule"},
         "Select the existing Chromium executable and original Playwright module.")
    for key in ("chromiumExecutable", "playwrightModule"):
        need(isinstance(browser[key], str) and Path(browser[key]).is_absolute() and Path(browser[key]).is_file(),
             "Use the actual installed browser capability: " + key)
    with selected_research_node(config), programme_lock(config["directory"]) as (directory, lock):
        selection = {key: deepcopy(config[key]) for key in
                     ("operation", "actor", "caseArchive", "researchFiles", "selection", "name", "browserConfig")}
        selection["node"] = config.get("node", "node")
        programme_path = directory / "research-installation-programme.json"
        programme = optional_json(programme_path)
        if programme is None:
            programme = {"schema": SCHEMA + ".programme", "operation": config["operation"],
                         "selection": selection, "status": "RUNNING", "stages": [], "startedAt": stamp()}
        need(programme["schema"] == SCHEMA + ".programme" and programme["selection"] == selection,
             "Continue the original complete case, source and browser programme.")
        programme["status"] = "RUNNING"
        programme["lastStartedAt"] = stamp()
        programme.pop("error", None)
        write_programme(directory, programme)
        def native_phase(name, function):
            path = directory / ("native-" + name + "-result.json")
            prior = next((row for row in programme["stages"]
                          if row["name"] == "native-" + name and row.get("status") == "COMPLETED"), None)
            if prior is not None:
                verify_file(prior["result"])
                return read_json(path)
            if path.exists():
                value = read_json(path)
                expected = {"prepare": {"PREPARED", "RECEIVED", "COMPLETE"},
                            "finish": {"RECEIVED", "COMPLETE"}, "seal": {"COMPLETE"}}[name]
                need(value.get("schema") == SCHEMA and value.get("operation") == config["operation"] and
                     value.get("phase") in expected,
                     "Reconcile the retained original native phase response.")
                record = file_record(path)
            else:
                value = function({**config, "phase": name})
                record = retain(path, raw_json(value))
            programme["stages"].append({"name": "native-" + name, "status": "COMPLETED",
                                       "result": record, "completedAt": stamp()})
            write_programme(directory, programme)
            return value
        try:
            native_phase("prepare", prepare)
            operate_browser_phase(config, directory, lock, programme, "operate")
            native_phase("finish", finish)
            operate_browser_phase(config, directory, lock, programme, "receive")
            native_phase("seal", seal)
            manifest = read_json(directory / MANIFEST)
            need(manifest["phase"] == "COMPLETE", "Complete the original full receiving programme.")
            programme.update({"status": "COMPLETE", "completedAt": programme.get("completedAt", stamp()),
                              "manifest": file_record(directory / MANIFEST)})
            write_programme(directory, programme)
            return manifest
        except BaseException as error:
            programme.update({"status": "INTERRUPTED", "interruptedAt": stamp(),
                              "error": {"type": type(error).__name__, "message": str(error)}})
            write_programme(directory, programme)
            raise


def run(config):
    need(isinstance(config, dict), "Use one complete native course configuration.")
    action = {"prepare": prepare, "finish": finish, "seal": seal, "all": run_all}.get(config.get("phase"))
    need(action is not None, "Select all, prepare, finish or seal for the original course.")
    return action(config)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", help="Complete original UTF-8 JSON course configuration")
    arguments = parser.parse_args()
    def interrupt_programme(_signum, _frame):
        raise KeyboardInterrupt("The original receiving programme was interrupted.")
    signal.signal(signal.SIGTERM, interrupt_programme)
    result = run(read_json(Path(arguments.config).resolve(), 8 * 1024 * 1024))
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
