#!/usr/bin/env python3
"""Receive a complete Skpr operating project in the original GovHub application.

Copyright 2026 TokenJunkie Labs contributors.
Licensed under the Apache License, Version 2.0; see ../LICENSE.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import sys
import tarfile
import tempfile
import time
import uuid
import zipfile

from pantheon_receive import (
    Commands, absolute, add_workspace, atomic, directory, encoded, executable,
    identity, lease, opened, read_json, regular, request_payload, utc,
)
import skpr_adapter

CODE = Path(__file__).resolve().parent
VERSION = "govhub-skpr-receiving/v1"
CHUNK = 1024 * 1024
RELEASE = {
    "version": "v1.9.4",
    "commit": "0014e431f5892591fb04600a2e2ca706d70a3897",
    "url": "https://github.com/skpr/cli/releases/download/v1.9.4/skpr_1.9.4_linux_amd64.tar.gz",
    "bytes": 45368316,
    "sha256": "e9ede2b799e9a32bae51446da404c10467df252a4d844efd2f166fa54205bd58",
    "platform": "linux_amd64",
}


def retained(root, action, value, request=None):
    output = directory(root / "receiving", True)
    record = {"schema": VERSION, "action": action, "observed_at": utc(), "result": value}
    if request is not None:
        record["request"] = request
    target = output / (action.replace(".", "-").replace("/", "-") + "-" + uuid.uuid4().hex + ".json")
    atomic(target, record)
    return identity(target)


def runtime(args, required=False):
    root = directory(args.runtime_dir, True)
    target = root / "runtime.json"
    if not target.exists():
        if required:
            raise ValueError("Prepare this receiving host's original Skpr runtime first.")
        return root, None
    value = read_json(target)
    if value.get("schema") != VERSION or value.get("provider") != "skpr":
        raise ValueError("This receiving directory belongs to another native provider.")
    if required:
        p = skpr_adapter.profile({
            "source_kind": "skpr", "environment_id": value["environment_id"],
            **value["profile_runtime"],
        })
        current = identity(p["skpr_path"])
        if current["sha256"] != value["skpr_executable"]["sha256"]:
            raise ValueError("The prepared native Skpr executable changed. Prepare its current original release.")
    return root, value


def receive_release(archive_path, root):
    archive_path = regular(archive_path)
    original = identity(archive_path)
    if (original["bytes"], original["sha256"]) != (RELEASE["bytes"], RELEASE["sha256"]):
        raise ValueError("Select the complete original Skpr v1.9.4 Linux amd64 release archive.")
    if platform.system() != "Linux" or platform.machine().lower() not in {"x86_64", "amd64"}:
        raise ValueError("This original release archive runs on Linux amd64. Select an existing native Skpr executable for this host.")
    target = root / "skpr-v1.9.4"
    with tarfile.open(archive_path, "r:gz") as archive:
        candidates = [item for item in archive.getmembers()
                      if item.isfile() and PurePosixPath(item.name).name == "skpr"]
        if len(candidates) != 1:
            raise ValueError("The exact release archive must contain one original Skpr executable.")
        member = candidates[0]
        if member.size < 1024 or member.size > 256 * CHUNK:
            raise ValueError("The native release executable has an unexpected size.")
        stream = archive.extractfile(member)
        if stream is None:
            raise ValueError("The original release executable has no body.")
        descriptor, temporary = tempfile.mkstemp(prefix=".skpr-release-", dir=root)
        try:
            with stream, os.fdopen(descriptor, "wb") as output:
                shutil.copyfileobj(stream, output, CHUNK)
                output.flush()
                os.fsync(output.fileno())
            with open(temporary, "rb") as binary:
                if binary.read(4) != b"\x7fELF":
                    raise ValueError("The original Linux release must be an ELF executable.")
            os.chmod(temporary, 0o700)
            if target.exists():
                if identity(temporary)["sha256"] != identity(target)["sha256"]:
                    raise ValueError("This runtime directory already contains a different native executable.")
            else:
                os.replace(temporary, target)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return target, original


def prepare(args):
    root = directory(args.runtime_dir, True)
    with lease(root, "prepare.lock"):
        release = None
        if args.archive:
            binary, release = receive_release(args.archive, root)
        else:
            binary = executable(args.skpr or "skpr")
        p = skpr_adapter.profile({
            "source_kind": "skpr", "environment_id": args.environment_id,
            "site_root": str(directory(args.site_root)), "skpr_path": str(binary),
            "git_path": str(executable(args.git)), "env_path": str(executable(args.env)),
            "timeout_seconds": args.timeout,
        })
        commands = Commands(root / "prepare", args.timeout)
        version = commands.run("skpr-version", [p["skpr_path"], "--version"], cwd=p["site_root"])
        text = Path(version["stdout"]["path"]).read_text(encoding="utf-8").strip()
        if not re.search(r"(?<![0-9])v?1\.9\.4(?![0-9.])", text):
            raise ValueError("Use the original native Skpr v1.9.4 CLI supported by this application.")
        project = commands.run("project-root", [p["git_path"], "rev-parse", "--show-toplevel"], cwd=p["site_root"])
        if Path(project["stdout"]["path"]).read_text(encoding="utf-8").strip() != p["site_root"]:
            raise ValueError("Select this original Git repository's actual top-level directory.")
        value = {
            "schema": VERSION, "provider": "skpr", "prepared_at": utc(),
            "environment_id": p["environment_id"],
            "provider_context": skpr_adapter.provider_context(p),
            "profile_runtime": {key: p[key] for key in sorted(skpr_adapter.RUNTIME_FIELDS)},
            "skpr_executable": identity(binary), "version_output": version["stdout"],
            "original_release_archive": release, "released_source": RELEASE,
            "commands": commands.commands,
        }
        atomic(root / "runtime.json", value)
        return {"state": "PREPARED", "environment_id": p["environment_id"],
                "profile_runtime": value["profile_runtime"], "version": text,
                "runtime": identity(root / "runtime.json")}


def discover(args):
    root, prepared = runtime(args, True)
    config = {"source_kind": "skpr", "environment_id": prepared["environment_id"],
              **prepared["profile_runtime"], "timeout_seconds": args.timeout}
    if args.profile:
        supplied, original = request_payload(args.profile)
        if supplied.get("source_kind") != "skpr" or supplied.get("environment_id") != prepared["environment_id"]:
            raise ValueError("Use the prepared original Skpr target in this capability request.")
        config = {**supplied, **prepared["profile_runtime"]}
    else:
        original = {"runtime": identity(root / "runtime.json")}
    result = skpr_adapter.discover_capabilities(config)
    record = retained(root, "native-capabilities", result, original)
    # Private original CLI results, including provider metadata, stay in the
    # receiving file. The console uses the adapter's explicit public summary.
    return {"ready": result.get("ready"), "environment_id": prepared["environment_id"],
            "observed": result.get("native_status"), "actions": result.get("actions"),
            "message": result.get("error") or result.get("message"), "result_file": record}


def operation_summary(value):
    checkpoint = value.get("resume_checkpoint") or value.get("checkpoint") or {}
    return {
        **{key: value.get(key) for key in (
            "id", "revision", "type", "native_action", "state", "environment_id",
            "provider_environment_id", "plan_id", "source_snapshot_id", "progress", "error")},
        "native_phase": checkpoint.get("phase"), "native_poll": checkpoint.get("native_poll"),
        "pending_step": checkpoint.get("pending_skpr_step"),
        "pending_download": checkpoint.get("pending_skpr_download"),
    }


def inspect_workspace(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    snapshot = workspace.snapshot()
    actor = {"name": user["name"], "role": user["role"]}
    return {
        "workspace": snapshot.get("workspace"), "actor": actor,
        "summary": snapshot["govhub"]["summary"], "worker": snapshot["govhub"]["worker"],
        "operations": snapshot["govhub"]["operations"],
        "result_file": retained(root, "workspace-open", {"actor": actor, "snapshot": snapshot}),
    }


def call(args):
    action = args.operation.strip("/").replace("/", ".")
    root, prepared = runtime(args, action == "operations.configure" or args.bind_runtime)
    workspace, user = opened(args)
    payload, original = request_payload(args.request)
    if args.bind_runtime:
        if action not in {"operations.resume", "operations.capabilities"}:
            raise ValueError("Attach receiving paths to an original resume or capability request.")
        bindings = dict(prepared["profile_runtime"])
        if "runtime_bindings" in payload and payload["runtime_bindings"] != bindings:
            raise ValueError("The explicit runtime differs from this prepared receiving host.")
        payload = {**payload, "runtime_bindings": bindings}
        original = {**original, "applied_payload": payload, "runtime": identity(root / "runtime.json")}
    if action == "operations.configure":
        config = payload.get("config") or {}
        if config.get("source_kind") != "skpr" or config.get("environment_id") != prepared["environment_id"]:
            raise ValueError("Use the prepared original Skpr target in the explicit configuration.")
        if any(config.get(key) != val for key, val in prepared["profile_runtime"].items()):
            raise ValueError("Use the four prepared native runtime paths in this configuration.")
    result = workspace.dispatch(action, payload, user)
    output = {"action": action, "result_file": retained(root, action, result, original)}
    if isinstance(result.get("operation"), dict):
        output["operation"] = operation_summary(result["operation"])
    else:
        output["result"] = result
    if args.work:
        from cli import run_worker
        completed = run_worker(workspace, True)
        output.update(worker=completed["worker"], operations=completed["operations"],
                      worker_result=retained(root, "worker", completed))
    return output


def record(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    payload, original = request_payload(args.request)
    result = workspace.save(args.kind, args.record_id, payload, user)
    return {"record": result, "result_file": retained(root, "record-" + args.kind, result, original)}


def work(args):
    root, _ = runtime(args)
    workspace, _ = opened(args)
    from cli import run_worker
    result = run_worker(workspace, True)
    return {**result, "result_file": retained(root, "worker", result)}


def status(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    deadline = time.monotonic() + args.wait_seconds
    last_revision = None
    while True:
        result = workspace.dispatch("operations.get", {"operation_id": args.operation_id}, user)
        value = result["operation"]
        from native_adapter import can_poll
        active = value["state"] in {"QUEUED", "RUNNING"} or (
            value["state"] == "WAITING_NATIVE" and not value.get("cancel_requested")
            and can_poll(value.get("resume_checkpoint") or {}))
        if not active or time.monotonic() >= deadline:
            return {"operation": operation_summary(value), "active": active,
                    "result_file": retained(root, "operation-status", result)}
        if value["revision"] != last_revision:
            print(json.dumps({"progress": operation_summary(value)}, ensure_ascii=False), flush=True)
            last_revision = value["revision"]
        time.sleep(min(2, max(0, deadline - time.monotonic())))


def source_name(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("Use an ordinary original relative project path.")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts) or path.parts[0] == ".git":
        raise ValueError("An original source member must remain inside its receiving project.")
    return path


class OriginalFiles:
    """Resolve transferred originals by exact bytes inside the selected intake."""
    def __init__(self, root):
        self.root = directory(root)
        self.cache = {}
        self.sizes = None

    def find(self, item):
        if not isinstance(item, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(item.get("sha256", ""))):
            raise ValueError("An original source artifact must retain its full SHA-256.")
        size = item.get("size", item.get("bytes"))
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ValueError("An original source artifact must retain its actual byte count.")
        key = (item["sha256"], size)
        if key in self.cache:
            return self.cache[key]
        supplied = Path(str(item.get("path", "")))
        choices = []
        if supplied.is_absolute() and supplied.resolve(strict=False).is_relative_to(self.root):
            choices.append(supplied)
        choices += [self.root / supplied.name, self.root / item["sha256"]]
        for path in choices:
            if path.is_file() and not path.is_symlink():
                value = identity(path)
                if (value["sha256"], value["bytes"]) == key:
                    self.cache[key] = path
                    return path
        if self.sizes is None:
            self.sizes = {}
            for path in self.root.rglob("*"):
                if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(self.root):
                    self.sizes.setdefault(path.stat().st_size, []).append(path)
        for path in self.sizes.get(size, []):
            value = identity(path)
            if (value["sha256"], value["bytes"]) == key:
                self.cache[key] = path
                return path
        raise ValueError("Receive the complete original source artifact " + item["sha256"] + " inside the selected intake.")


def unpack_untracked(path, destination, expected_names):
    expected = set(expected_names)
    if len(expected) != len(expected_names):
        raise ValueError("The original source manifest repeats an untracked path.")
    observed = set()
    with tarfile.open(path, "r:") as archive:
        for member in archive:
            relative = source_name(member.name)
            name = relative.as_posix()
            if name not in expected or name in observed or not member.isfile():
                raise ValueError("The original untracked archive differs from its complete source manifest.")
            target = destination.joinpath(*relative.parts)
            if target.exists() or target.is_symlink():
                raise ValueError("An untracked source path would overwrite the restored original Git tree.")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if not target.parent.resolve().is_relative_to(destination.resolve()):
                raise ValueError("An original untracked source parent leaves its receiving project.")
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError("An original source member has no body.")
            with stream, target.open("xb") as output:
                shutil.copyfileobj(stream, output, CHUNK)
                output.flush()
                os.fsync(output.fileno())
            if target.stat().st_size != member.size:
                raise ValueError("An original untracked source member is incomplete.")
            os.chmod(target, member.mode & 0o777)
            observed.add(name)
    if observed != expected:
        raise ValueError("The complete original untracked file set was not received.")


def restore_source(args):
    root, _ = runtime(args)
    manifest_path = regular(args.manifest)
    original_manifest = identity(manifest_path)
    if original_manifest["sha256"] != args.manifest_sha256:
        raise ValueError("Select the exact reviewed original project-source manifest.")
    value = read_json(manifest_path)
    if value.get("schema") != skpr_adapter.VERSION or not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", value.get("commit", "")):
        raise ValueError("Select the complete original Skpr project-source capture.")
    intake = OriginalFiles(args.artifacts)
    artifacts = value.get("artifacts")
    if not isinstance(artifacts, list):
        raise ValueError("The original project-source manifest has no complete artifact list.")
    files = [(item, intake.find(item)) for item in artifacts]
    def one(role):
        selected = [(item, path) for item, path in files if item.get("role") == role]
        if len(selected) != 1:
            raise ValueError("The original project needs one " + role + " artifact.")
        return selected[0]
    destination = absolute(args.destination)
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    destination = destination.parent.resolve() / destination.name
    if destination == root or destination.is_relative_to(root) or root.is_relative_to(destination):
        raise ValueError("Keep the receiving source project separate from its private runtime files.")
    git = executable(args.git)
    with lease(root, "source-restore.lock"):
        if destination.exists() or destination.is_symlink():
            raise ValueError("Choose a new receiving project directory; the existing source remains available.")
        bundle_item, bundle = one("source_git_bundle")
        staged_item, staged = one("source_index_patch")
        worktree_item, worktree = one("source_unstaged_patch")
        status_item, source_status = one("source_worktree_status")
        untracked_item, untracked = one("source_untracked_archive")
        combined_item, combined = one("source_worktree_patch")
        commands = Commands(root / "source-restore", args.timeout)
        staging = Path(tempfile.mkdtemp(prefix="." + destination.name + "-receiving-", dir=destination.parent))
        checkout = staging / "project"
        failed = True
        try:
            commands.run("source-bundle-verify", [git, "bundle", "list-heads", bundle])
            commands.run("source-clone", [git, "clone", "--no-checkout", "--no-hardlinks", str(bundle), str(checkout)])
            commands.run("source-checkout", [git, "checkout", "--detach", value["commit"]], cwd=checkout)
            if staged_item["size"]:
                commands.run("source-index-restore", [git, "apply", "--binary", "--index", str(staged)], cwd=checkout)
            if worktree_item["size"]:
                commands.run("source-worktree-restore", [git, "apply", "--binary", str(worktree)], cwd=checkout)
            unpack_untracked(untracked, checkout, value.get("untracked_files", []))
            config = value["configuration"]
            config_files = {item.get("relative_path"): (item, path) for item, path in files
                            if item.get("role") == "configuration_file"}
            for row in config["files"]:
                relative = source_name(".skpr/" + row["path"])
                key = relative.as_posix()
                if key not in config_files:
                    raise ValueError("Receive every original .skpr configuration file.")
                item, path = config_files[key]
                if (item["sha256"], item["size"]) != (row["sha256"], row["bytes"]):
                    raise ValueError("The configuration artifact differs from its original source manifest.")
                target = checkout.joinpath(*relative.parts)
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                if target.is_symlink() or not target.parent.resolve().is_relative_to(checkout.resolve()):
                    raise ValueError("A received configuration path leaves the original project.")
                shutil.copyfile(path, target)
                os.chmod(target, int(row["mode"]) & 0o777)
            if skpr_adapter._configuration({"site_root": str(checkout)})["sha256"] != config["sha256"]:
                raise ValueError("The received complete .skpr configuration differs from its original.")
            checks = [
                ("received-commit", ["rev-parse", "--verify", "HEAD^{commit}"], value["commit"]),
                ("received-status", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], status_item),
                ("received-index", ["diff", "--binary", "--cached", "HEAD", "--"], staged_item),
                ("received-worktree", ["diff", "--binary", "--"], worktree_item),
                ("received-combined", ["diff", "--binary", "HEAD", "--"], combined_item),
            ]
            for label, arguments, expected in checks:
                observed = commands.run(label, [git, *arguments], cwd=checkout)
                output = Path(observed["stdout"]["path"])
                if isinstance(expected, str):
                    if output.read_text(encoding="utf-8").strip() != expected:
                        raise ValueError("The receiving Git commit differs from the original source.")
                elif (observed["stdout"]["sha256"], observed["stdout"]["bytes"]) != (expected["sha256"], expected["size"]):
                    raise ValueError("The received original Git state differs at " + label + ".")
            if destination.exists() or destination.is_symlink():
                raise ValueError("The chosen receiving project destination was created by another operation.")
            os.rename(checkout, destination)
            failed = False
            record = {
                "state": "SOURCE_RECEIVED", "source_manifest": original_manifest,
                "source_commit": value["commit"], "configuration_sha256": config["sha256"],
                "destination": str(destination), "provider_context": value.get("provider_context"),
                "original_artifacts": len(files), "commands": commands.commands,
            }
            result_file = retained(root, "source-restored", record)
            return {**{key: record[key] for key in (
                "state", "source_commit", "configuration_sha256", "destination", "original_artifacts")},
                "result_file": result_file}
        finally:
            if not failed:
                staging.rmdir()
            else:
                retained(root, "source-receiving-interrupted", {
                    "staging": str(staging), "destination": str(destination),
                    "source_manifest": original_manifest, "commands": commands.commands,
                })


def application_copy(path, expected_sha, destination):
    from build_application import verify_package
    path = regular(path)
    verified = verify_package(path, expected_sha)
    archive = destination / "govhub-application.zip"
    if archive.exists():
        raise ValueError("The handover already contains an application archive.")
    shutil.copyfile(path, archive)
    os.chmod(archive, 0o600)
    if identity(archive)["sha256"] != expected_sha:
        raise ValueError("The complete application archive changed during receiving.")
    unpacked = destination / "application"
    unpacked.mkdir(mode=0o700)
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            relative = source_name(entry.filename.rstrip("/"))
            target = unpacked.joinpath(*relative.parts)
            if entry.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError("Receive ordinary application source files.")
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with package.open(entry) as source, target.open("xb") as output:
                shutil.copyfileobj(source, output, CHUNK)
            os.chmod(target, 0o700 if mode & 0o111 else 0o600)
    receiver = unpacked / "govhub-operations" / "workspace" / "skpr_receive.py"
    if not receiver.is_file():
        raise ValueError("The received complete application does not contain its Skpr receiver.")
    return receiver, {"archive": identity(archive), "verified": verified, "source_directory": str(unpacked)}


def handover(args):
    root, _ = runtime(args)
    workspace, user = opened(args)
    from cli import export_files
    destination, backup = absolute(args.destination), absolute(args.backup)
    source_root = directory(args.source_root)
    for path in (destination, backup):
        candidate = path.resolve(strict=False)
        if (candidate == source_root or candidate.is_relative_to(source_root)
                or source_root.is_relative_to(candidate)):
            raise ValueError("Keep the handover and backup separate from the original intake.")
    with lease(root, "handover.lock"):
        # Export and coherent backup remain native GovHub actions. They preserve
        # the actual source bindings, user/session records and operation journal.
        export = export_files(workspace, args.export_id, destination, user)
        receiver, application = application_copy(args.application_zip, args.application_sha256, destination)
        copied = workspace.dispatch("workspace.backup", {"destination": str(backup)}, user)
        before = workspace.snapshot()
        commands = Commands(root / "cold-reopen", args.timeout)
        received_core = receiver.parent / "vendor" / "assessment-core"
        observed = commands.run("received-application-open", [
            sys.executable, str(receiver), "--runtime-dir", str(root), "--timeout", str(args.timeout),
            "inspect", "--workspace", str(backup), "--source-root", str(source_root),
            "--assessment-core", str(received_core), "--username", args.username,
            "--password-env", args.password_env,
        ])
        reopened = commands.json_output(observed)
        if reopened.get("workspace") != before.get("workspace"):
            raise ValueError("The received application opened a different original workspace.")
        original_operations = {item["id"]: item for item in before["govhub"]["operations"]}
        received_operations = {item["id"]: item for item in reopened["operations"]}
        if original_operations != received_operations:
            raise ValueError("The received application's original operation population differs.")
        value = {
            "state": "RECEIVED", "workspace": before.get("workspace"),
            "operations": len(original_operations), "export": export, "backup": copied,
            "application": application, "received_workspace": reopened,
            "source_root": str(source_root), "cold_reopen_commands": commands.commands,
        }
        return {"state": "RECEIVED", "workspace": value["workspace"], "operations": value["operations"],
                "destination": str(destination), "backup": str(backup),
                "received_application": str(receiver.parent),
                "result_file": retained(root, "handover-reopened", value)}


def serve(args):
    runtime(args)
    workspace, _ = opened(args)
    os.execv(sys.executable, [
        sys.executable, str(CODE / "server.py"), "--workspace", str(workspace.root),
        "--source-root", str(args.source_root), "--assessment-core", str(args.assessment_core),
        "--port", str(args.port),
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-dir", required=True)
    parser.add_argument("--timeout", type=int, default=600)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare", help="Bind the existing native CLI and original Skpr project.")
    native = prep.add_mutually_exclusive_group()
    native.add_argument("--skpr", help="Existing native CLI executable on this host.")
    native.add_argument("--archive", help="Exact original v1.9.4 Linux amd64 release archive.")
    prep.add_argument("--site-root", required=True)
    prep.add_argument("--environment-id", required=True)
    prep.add_argument("--git", default="git")
    prep.add_argument("--env", default="env")
    prep.set_defaults(handler=prepare)
    discover_parser = sub.add_parser("discover", help="Read the original native project and its complete collections.")
    discover_parser.add_argument("--profile", help="Optional original Skpr profile JSON with selected backup or release.")
    discover_parser.set_defaults(handler=discover)
    view = sub.add_parser("inspect", help="Authenticate and reopen the complete original operating project.")
    add_workspace(view)
    view.set_defaults(handler=inspect_workspace)
    apply = sub.add_parser("call", help="Dispatch an original GovHub JSON request.")
    add_workspace(apply)
    apply.add_argument("operation")
    apply.add_argument("--request", required=True)
    apply.add_argument("--work", action="store_true")
    apply.add_argument("--bind-runtime", action="store_true")
    apply.set_defaults(handler=call)
    edit = sub.add_parser("record", help="Save an original operating record with its revision.")
    add_workspace(edit)
    edit.add_argument("kind")
    edit.add_argument("record_id")
    edit.add_argument("--request", required=True)
    edit.set_defaults(handler=record)
    worker = sub.add_parser("work", help="Run the original durable provider operation queue.")
    add_workspace(worker)
    worker.set_defaults(handler=work)
    current = sub.add_parser("status", help="Follow one retained operation.")
    add_workspace(current)
    current.add_argument("operation_id")
    current.add_argument("--wait-seconds", type=int, default=0)
    current.set_defaults(handler=status)
    source = sub.add_parser("restore-source", help="Restore the full original Git and Skpr source on this receiving host.")
    source.add_argument("--manifest", required=True)
    source.add_argument("--manifest-sha256", required=True)
    source.add_argument("--artifacts", required=True, help="Received original source or complete native workspace directory.")
    source.add_argument("--destination", required=True)
    source.add_argument("--git", default="git")
    source.set_defaults(handler=restore_source)
    transfer = sub.add_parser("handover", help="Receive the full application, export and private workspace, then cold-reopen.")
    add_workspace(transfer)
    transfer.add_argument("--export-id", required=True)
    transfer.add_argument("--destination", required=True)
    transfer.add_argument("--backup", required=True)
    transfer.add_argument("--application-zip", required=True)
    transfer.add_argument("--application-sha256", required=True)
    transfer.set_defaults(handler=handover)
    web = sub.add_parser("serve", help="Open the original authenticated operating application.")
    add_workspace(web)
    web.add_argument("--port", type=int, default=8792)
    web.set_defaults(handler=serve)
    args = parser.parse_args()
    if not 10 <= args.timeout <= 7200:
        parser.error("Use a native command timeout of 10 through 7200 seconds.")
    if hasattr(args, "wait_seconds") and not 0 <= args.wait_seconds <= 86400:
        parser.error("Use an operation-follow interval from 0 through 86400 seconds.")
    for key in ("manifest_sha256", "application_sha256"):
        if hasattr(args, key) and not re.fullmatch(r"[0-9a-f]{64}", getattr(args, key)):
            parser.error("Supply the complete original " + key + ".")
    if hasattr(args, "password_env") and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", args.password_env):
        parser.error("Supply the existing private password environment-variable name.")
    if hasattr(args, "port") and not 0 <= args.port <= 65535:
        parser.error("Choose a local browser port from 0 through 65535.")
    os.umask(0o077)
    try:
        print(json.dumps(args.handler(args), ensure_ascii=False, allow_nan=False), flush=True)
        return 0
    except KeyboardInterrupt:
        print(json.dumps({"error": "The original receiving process was interrupted; its saved project remains available."}), file=sys.stderr)
        return 130
    except Exception as error:
        print(json.dumps({"error": str(error), "type": type(error).__name__}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
