#!/usr/bin/env python3
"""Run the complete Federal Register case on one dedicated native Drupal target.

The command composes the original installed Drupal/Drush runtime, GovHub staff
and target configuration, original content module/schema, reviewed migration
worker, full editable receiving, and existing desktop/mobile receiving browser.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shutil
import stat
import subprocess
import sys
import threading
from types import SimpleNamespace
import zipfile

APP = Path(__file__).resolve().parents[2]
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

import native_adapter as native
from govhub import open_workspace
from server import Server
from content_consolidation.drupal.install import install_module
from content_consolidation.examples.federal_register_receiving import NativePending, run_case
from content_consolidation.examples.native_receiving import (
    absolute_directory, authenticate_user, content_identity, compact,
    read_json, required, sha_json, verify_export_directory, write_json,
)
from content_consolidation.examples.native_site import NativeDrupalSite, file_identity, _retain_json
from content_consolidation.sources.federal_register import build_case

SCHEMA = "govhub.federal-register.native-run.v1"


def _source_directory(spec, directory):
    """Retain exact input bytes once; the original source builder owns semantics."""
    if spec.get("source_root"):
        required(not spec.get("input_archive"), "Select the retained source directory or its exact original archive.")
        root = absolute_directory(spec["source_root"])
        return root, None
    archive = file_identity(Path(spec["input_archive"]))
    required(archive["sha256"] == spec.get("input_sha256"),
             "The selected original source archive does not match its declared SHA-256.")
    root = directory / "inputs"
    root.mkdir(mode=0o700, exist_ok=True)
    manifest = {}
    with zipfile.ZipFile(archive["path"]) as zipped:
        members = zipped.infolist()
        required(len(members) <= 10000, "The selected source archive contains too many members.")
        total = 0
        seen = set()
        for item in members:
            name = PurePosixPath(item.filename)
            required(not name.is_absolute() and name.parts and "\\" not in item.filename
                     and all(part not in {"", ".", ".."} for part in name.parts)
                     and str(name) not in seen,
                     "The source archive contains an invalid or repeated path.")
            seen.add(str(name))
            kind = item.external_attr >> 16
            required(not stat.S_ISLNK(kind) and (not stat.S_IFMT(kind) or stat.S_ISREG(kind) or stat.S_ISDIR(kind)),
                     "The source archive must contain only ordinary files and directories.")
            if item.is_dir():
                continue
            required(0 <= item.file_size <= 128 * 1024 * 1024,
                     "A selected original file exceeds the existing source intake limit.")
            total += item.file_size
            required(total <= 512 * 1024 * 1024, "The selected source archive exceeds this receiving input capacity.")
            path = root.joinpath(*name.parts)
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            required(not path.is_symlink() and all(not parent.is_symlink() for parent in path.parents
                     if parent == root or parent.is_relative_to(root)),
                     "The retained source path is not an ordinary local path.")
            digest = hashlib.sha256()
            if path.exists():
                with zipped.open(item) as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(block)
                actual = file_identity(path)
                required(actual["bytes"] == item.file_size and actual["sha256"] == digest.hexdigest(),
                         "A retained original source file differs from the selected archive.")
            else:
                temporary = path.with_name(path.name + ".extracting")
                # An interrupted extraction is private staging for this exact
                # archive. Its completed destination remains create-only.
                with zipped.open(item) as source, temporary.open("wb") as target:
                    count = 0
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        count += len(block)
                        required(count <= item.file_size, "The original archive expanded beyond its declared member.")
                        digest.update(block)
                        target.write(block)
                    required(count == item.file_size, "The original source archive member is incomplete.")
                    target.flush()
                    os.fsync(target.fileno())
                os.chmod(temporary, 0o600)
                os.link(temporary, path)
                temporary.unlink()
            manifest[str(name)] = {"bytes": item.file_size, "sha256": digest.hexdigest()}
    _retain_json(directory / "source-archive.json", {
        "schema": "govhub.native-source-archive.v1", "archive": archive,
        "directory": str(root), "files": manifest})
    return root, archive


def _accounts(workspace, directory, supplied=None):
    path = Path(supplied) if supplied else directory / "staff-accounts.json"
    if not path.exists():
        required(supplied is None, "Restore the selected existing private staff account file.")
        suffix = sha_json({"workspace": str(workspace.root)})[:12]
        write_json(path, {role: {"name": "native_" + role + "_" + suffix,
                                "password": secrets.token_urlsafe(36)}
                          for role in ("operator", "reviewer", "admin")})
    required(path.is_absolute() and not path.is_symlink() and not path.stat().st_mode & 0o077,
             "Use an absolute private staff account file.")
    accounts = read_json(path)
    selected = {}
    for role in ("operator", "reviewer", "admin"):
        value = accounts.get(role)
        required(isinstance(value, dict)
                 and all(isinstance(value.get(key), str) and value[key] for key in ("name", "password")),
                 "Supply the original private " + role + " account.")
        current = workspace.user(value["name"])
        if current is None:
            workspace.add_user(value["name"], value["password"], role)
        selected[role] = authenticate_user(workspace, value["name"], value["password"])
        required(selected[role]["role"] == role, "The selected native application account has a different role.")
    return accounts, selected, path


def prepare_workspace(site, spec, directory, source_root, profile):
    """Configure the original workspace through its existing authenticated APIs."""
    workspace_path = directory / "workspace"
    new = not (workspace_path / "assessment.sqlite3").exists()
    workspace = open_workspace(workspace_path, source_root_path=source_root,
        assessment_core_path=spec.get("assessment_core"), create=new, name=spec["name"], mode="SUPPLIED")
    accounts, actors, account_path = _accounts(workspace, directory, spec.get("accounts"))
    with workspace.connect(snapshot=True) as db:
        identity = workspace.meta(db)["workspace"]
    _retain_json(directory / "workspace-binding.json", {
        "schema": "govhub.native-workspace-binding.v1", "workspace": identity,
        "directory": str(workspace.root), "source_root": str(source_root),
        "site_binding_sha256": site.binding_sha256,
        "staff": {role: {"name": actors[role]["name"], "role": actors[role]["role"]} for role in actors}})
    environment_id = "native-" + site.binding["operation_id"][:24]
    try:
        environment = workspace.record("environments", environment_id)
    except Exception as exc:
        if getattr(exc, "status", None) != 404:
            raise
        environment = workspace.save("environments", environment_id, {"data": {
            "name": spec["site_name"], "provider": "Drupal native", "purpose": "Rehearsal",
            "provider_resource_id": site.environment_id, "canonical_url": site.uri,
            "owner": spec["owner"], "authorization_reference": spec["authorization_reference"],
            "data_location": str(site.root), "notes": "Dedicated native target for the retained Federal Register receiving case.",
            "review_state": "Reviewed", "review_basis": spec["review_reason"]},
            "note": "Retain the exact dedicated Drupal target for the original content workflow."}, actors["admin"])
    required(not environment["archived"]
             and environment["data"]["provider_resource_id"] == site.environment_id
             and environment["data"]["canonical_url"] == site.uri,
             "The original workspace environment now selects a different or archived target.")
    current = workspace.dispatch("operations.capabilities", {"environment_id": environment_id}, actors["admin"])
    if current.get("configured"):
        required(current.get("current_config") == profile,
                 "The target's existing native profile changed; compose that original selection before continuing.")
    configured = workspace.dispatch("operations.configure", {
        "environment_id": environment_id, "expected_revision": environment["revision"],
        "config": profile}, actors["admin"])
    write_json(directory / "target-configuration.json", configured)
    return workspace, accounts, actors, account_path, configured["environment"]


def _source_path(root, value, default):
    path = Path(value) if value else root / default
    required(path.is_absolute() and path.is_file() and not path.is_symlink()
             and path.resolve().is_relative_to(root),
             "Choose the actual capture file inside the retained source root.")
    return path.resolve()


def _prepare_case(site, spec, directory, source_root, environment):
    family = {"label": spec["name"], "environment_id": environment["id"],
              "owner": spec["owner"], "notes": "Two retained publisher observations with original full selected media.",
              "comparison_id": spec.get("case_id", "govhub-federal-register-20261012"),
              "limits": {"migrations": 5, "records": 1000, "files": 250,
                         "file_bytes": 2 * 1024 * 1024 * 1024, "routes": 250},
              "recovery_instruction": spec["native_reason"]}
    family_path = directory / "family-input.json"
    _retain_json(family_path, family)
    path = directory / "case.json"
    build_case(SimpleNamespace(source_root=source_root,
        capture=_source_path(source_root, spec.get("capture"), "federal-register/initial/capture.json"),
        refresh_capture=_source_path(source_root, spec.get("refresh_capture"), "federal-register/refresh/capture.json"),
        family=family_path, base_url=site.uri, output=path,
        case_id=spec.get("case_id", "govhub-federal-register-20261012"),
        migration_prefix=spec.get("migration_prefix", "govhub_fr_govhub"),
        route_count=spec.get("route_count", 250), row_limit=spec.get("row_limit", 100)))
    return read_json(path)


def _reopen_received(workspace, accounts, result, source_root, destination, assessment_core=None):
    receiving = open_workspace(destination / "editable-workspace", source_root_path=source_root,
                               assessment_core_path=assessment_core, create=False)
    selected = accounts["admin"]
    user = authenticate_user(receiving, selected["name"], selected["password"])
    original_user = authenticate_user(workspace, selected["name"], selected["password"])
    body = {"family_id": result["family_id"]}
    original = workspace.dispatch("content.families.get", body, original_user)
    reopened = receiving.dispatch("content.families.get", body, user)
    required(content_identity(workspace, original_user, original) == content_identity(receiving, user, reopened),
             "The full native recipient no longer matches the completed original content identities.")
    handoff = result["receiving"]
    verify_export_directory(destination / "handover", handoff["source_handover"]["export"])
    verify_export_directory(destination / "recipient-handover", handoff["successor_handover"]["export"])
    return receiving


@contextmanager
def _serve(workspace):
    with workspace.service_lease():
        server = Server(workspace, 0)
        workspace.start_worker()
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join(timeout=30)
            workspace.stop_worker()
            server.server_close()


def _browser(receiving, accounts, spec, directory, result):
    output = directory / "browser"
    output.mkdir(mode=0o700, exist_ok=True)
    saved = output / "content-browser-receiving.json"
    export = result["receiving"]["successor_handover"]["export"]
    if saved.exists():
        retained = read_json(saved)
        if retained.get("status") == "COMPLETE":
            required(retained.get("family_id") == result["family_id"]
                     and not any(retained.get(key) for key in ("page_errors", "request_failures", "http_errors")),
                     "The retained browser result belongs to another or incomplete receiving case.")
            download = retained.get("download", {})
            actual = file_identity(output / "browser-received-handover.zip")
            expected = next((item for item in export["files"] if item["name"] == "handover.zip"), None)
            required(expected and (actual["bytes"], actual["sha256"]) == (expected["size"], expected["sha256"])
                     and (actual["bytes"], actual["sha256"]) == (download.get("bytes"), download.get("sha256")),
                     "The existing browser download differs from the original successor handover.")
            return retained
    credentials = directory / "browser-account.json"
    _retain_json(credentials, accounts["admin"])
    script = APP / "content_consolidation/web/receiving_browser.mjs"
    node = native._binary(spec.get("node", "node"))
    with _serve(receiving) as server:
        value = {"base_url": server.origin + "/", "family_id": result["family_id"],
                 "credentials_file": str(credentials), "output_dir": str(output),
                 "export_id": export["id"], "visual": spec.get("visual", True)}
        if spec.get("chromium_executable"):
            value["chromium_executable"] = str(Path(spec["chromium_executable"]).resolve())
        with (output / "browser.stdout").open("wb") as out, (output / "browser.stderr").open("wb") as err:
            process = subprocess.Popen([node, str(script)], cwd=APP,
                stdin=subprocess.PIPE, stdout=out, stderr=err, start_new_session=True)
            try:
                process.communicate((json.dumps(value, ensure_ascii=False) + "\n").encode(),
                                    timeout=spec.get("browser_timeout_seconds", 600))
            except BaseException:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=10)
                raise
        write_json(output / "browser-command.json", {
            "schema": "govhub.content-browser-command.v1", "argv": [node, str(script)],
            "script": file_identity(script), "returncode": process.returncode,
            "family_id": result["family_id"], "export_id": export["id"],
            "stdout": file_identity(output / "browser.stdout"),
            "stderr": file_identity(output / "browser.stderr")})
        required(process.returncode == 0 and saved.is_file(),
                 "Continue the existing receiving browser from its retained error output.")
    value = read_json(saved)
    required(value.get("status") == "COMPLETE" and value.get("family_id") == result["family_id"],
             "The original receiving browser has not completed.")
    return _browser(receiving, accounts, spec, directory, result)


def run_native(spec, *, progress=None):
    required(isinstance(spec, dict) and spec.get("schema") == SCHEMA, "Select a complete native receiving specification.")
    for key in ("name", "site_name", "site_mail", "environment_id", "owner",
                "authorization_reference", "review_reason", "native_reason", "recipient_note"):
        required(isinstance(spec.get(key), str) and spec[key].strip(),
                 "Supply the actual native receiving " + key + ".")
    directory = absolute_directory(spec["directory"], create=True)
    lease = os.open(directory / "native-run.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _retain_json(directory / "native-run-input.json", spec)
        source_root, archive = _source_directory(spec, directory)
        reporter = progress or (lambda _: None)
        reporter({"stage": "native-site"})
        with NativeDrupalSite(runtime_manifest=spec["runtime_manifest"], directory=directory / "native-site",
                site_root=spec["site_root"], environment_id=spec["environment_id"],
                site_name=spec["site_name"], site_mail=spec["site_mail"],
                port=spec.get("port", 0), timeout=spec.get("timeout_seconds", 600),
                max_artifact_bytes=spec.get("max_artifact_bytes", 1073741824)) as site:
            ready = site.prepare()
            reporter({"stage": "native-content-module", "drupal_version": ready["drupal_version"]})
            module = install_module(site.profile, directory / "content-module-install")
            write_json(directory / "content-module-install.json", module)
            required(module.get("status") == "COMPLETE",
                     "Continue the original content-module installation from its retained native result.")
            schema_request = directory / "federal-register-schema-request.json"
            _retain_json(schema_request, {"schema": "govhub.federal-register-schema-request.v1",
                                         "receiver_uid": str(ready["receiver"]["uid"])})
            schema_command = site.session.command("federal-register-schema", native._prefix(site.profile) + [
                "php:script", "provision_federal_register",
                "--script-path=" + str(APP / "content_consolidation/sources"), str(schema_request)], mutating=True)
            schema = read_json(Path(schema_command["stdout"]["path"]))
            required(schema.get("schema") == "govhub.federal-register-native-schema.v1"
                     and schema.get("status") == "PROVISIONED"
                     and schema.get("site_root") == str(site.root),
                     "The original native schema did not return the selected Drupal target.")
            write_json(directory / "federal-register-schema.json", schema)
            with site.authenticated_profile() as profile:
                workspace, accounts, actors, account_path, environment = prepare_workspace(
                    site, spec, directory, source_root, profile)
                definition = _prepare_case(site, spec, directory, source_root, environment)
                receipts = directory / "receipts"
                destination = directory / "received"
                native_result = directory / "native-receiving-result.json"
                if native_result.exists():
                    result = read_json(native_result)
                    required(result.get("status") == "COMPLETE" and result.get("case_sha256") == sha_json(definition),
                             "Restore this original case's complete native receiving result.")
                else:
                    reporter({"stage": "original-content-workflow", "case_id": definition["id"],
                              "source_capture_ids": definition["source_capture_ids"]})
                    result = run_case(workspace, definition, receipts, destination, accounts,
                        name=spec["name"], review_reason=spec["review_reason"], native_reason=spec["native_reason"],
                        recipient_note=spec["recipient_note"], timeout=spec.get("timeout_seconds", 600),
                        assessment_core=spec.get("assessment_core"), progress=reporter)
                    write_json(native_result, result)
                receiving = _reopen_received(workspace, accounts, result, source_root, destination,
                                             spec.get("assessment_core"))
                reporter({"stage": "independent-receiving-browser", "family_id": result["family_id"]})
                browser = _browser(receiving, accounts, spec, directory, result)
                complete = {"schema": SCHEMA, "status": "COMPLETE",
                    "case_id": result["case_id"], "case_sha256": result["case_sha256"],
                    "family_id": result["family_id"], "publication_date": result["publication_date"],
                    "source_capture_ids": result["source_capture_ids"],
                    "native_site": ready, "native_schema": schema,
                    "native_operation_ids": [value["operation"]["id"] for value in result["native_operations"]],
                    "receiving": result["receiving"], "browser": browser,
                    "inputs": {"archive": archive, "case": file_identity(directory / "case.json")},
                    "outputs": {"native_receiving": file_identity(native_result),
                        "browser_receiving": file_identity(directory / "browser/content-browser-receiving.json")},
                    "source": {"setup": file_identity(Path(__file__).with_name("native_site.py")),
                        "native_driver": file_identity(Path(__file__)),
                        "receiving_driver": file_identity(Path(__file__).with_name("federal_register_receiving.py"))}}
                write_json(directory / "complete-result.json", complete)
                return complete
    finally:
        os.close(lease)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec", required=True, type=Path,
                        help="Private native receiving specification with the exact original input/runtime paths.")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        value = run_native(read_json(args.spec),
            progress=lambda item: print(json.dumps(item, ensure_ascii=False), file=sys.stderr, flush=True))
        print(json.dumps({"status": value["status"], "case_id": value["case_id"],
            "family_id": value["family_id"], "native_operation_ids": value["native_operation_ids"],
            "receiving": compact(value["receiving"]), "browser_views": len(value["browser"]["views"]),
            "download": value["browser"]["download"]}, ensure_ascii=False, allow_nan=False))
        return 0
    except NativePending as exc:
        print(json.dumps(compact(exc.result), ensure_ascii=False, allow_nan=False))
        return 3
    except native.NativeWaiting as exc:
        print(json.dumps({"status": "NATIVE_PENDING", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 3
    except Exception as exc:
        print(json.dumps({"status": "FAILED", "code": getattr(exc, "code", "NATIVE_RECEIVING_ERROR"),
                          "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
