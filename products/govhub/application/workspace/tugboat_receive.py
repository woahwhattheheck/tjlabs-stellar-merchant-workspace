#!/usr/bin/env python3
"""Run and reopen the complete original Tugboat customer preview project.

Copyright 2026 Token Junkie Labs contributors. Apache-2.0, see ../LICENSE.
The existing GovHub queue, authentication, backup and package engines own execution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
from types import SimpleNamespace

from pantheon_receive import atomic, directory, identity, lease, opened, read_json, request_payload, utc
import tugboat_adapter

SCHEMA = "govhub-tugboat-customer-receiving/v1"
CODE = Path(__file__).resolve().parent


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False).encode()).hexdigest()


def save(path, value):
    atomic(path, value)
    return value


def files(root):
    result = []
    for folder, directories, names in os.walk(root, followlinks=False):
        current = Path(folder)
        if any((current / name).is_symlink() for name in directories):
            raise ValueError("Retain ordinary original directories in the customer handover.")
        for name in sorted(names):
            path = current / name
            if path.is_symlink() or not path.is_file():
                raise ValueError("Retain ordinary original source files in the customer handover.")
            result.append({**identity(path), "relative_path": path.relative_to(root).as_posix()})
    return result


def copy_intake(source, destination, state, state_file):
    original = files(source)
    selected = [{k: item[k] for k in ("relative_path", "bytes", "sha256")} for item in original]
    expected = state.setdefault("intake", {"source": str(source), "files": selected})
    if expected != {"source": str(source), "files": selected}:
        raise ValueError("The original complete supplied-input tree changed during handover.")
    save(state_file, state)
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    for item in original:
        target = destination / item["relative_path"]
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if target.is_symlink() or not target.resolve(strict=False).is_relative_to(destination.resolve()):
            raise ValueError("The retained source destination leaves the selected handover.")
        if not target.exists():
            partial = target.with_name(target.name + ".receiving")
            with Path(item["path"]).open("rb") as src, partial.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
            if identity(partial)["sha256"] != item["sha256"]:
                raise ValueError("A full original supplied input changed during copying.")
            os.replace(partial, target)
        current = identity(target)
        if current["bytes"] != item["bytes"] or current["sha256"] != item["sha256"]:
            raise ValueError("A previously received original source file changed.")
    return {"directory": str(destination), "files": selected}


def arguments(value):
    for key in ("workspace", "source_root"):
        directory(value[key])
    return SimpleNamespace(workspace=value["workspace"], source_root=value["source_root"],
                           assessment_core=value.get("assessment_core"),
                           username=value["username"], password_env=value["password_env"],
                           password_stdin=False)


def receive_application(source, expected_sha, destination):
    """Receive the same verified original ZIP, continuing complete prior members."""
    from build_application import verify_package
    import zipfile
    verified = verify_package(source, expected_sha)
    retained = destination / "govhub-application.zip"
    if not retained.exists():
        partial = retained.with_name(retained.name + ".receiving")
        with Path(source).open("rb") as src, partial.open("wb") as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
            dst.flush()
            os.fsync(dst.fileno())
        if identity(partial)["sha256"] != expected_sha:
            raise ValueError("The complete application archive changed during receiving.")
        os.replace(partial, retained)
    elif retained.is_symlink() or identity(retained)["sha256"] != expected_sha:
        raise ValueError("The original retained application archive changed.")
    root = destination / "application"
    root.mkdir(mode=0o700, exist_ok=True)
    with zipfile.ZipFile(retained) as archive:
        for member in archive.infolist():
            target = root / member.filename
            if target.is_symlink() or not target.resolve(strict=False).is_relative_to(root.resolve()):
                raise ValueError("A retained application member leaves its original receiving root.")
            if member.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
                continue
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if target.exists():
                actual = identity(target)
                with archive.open(member) as original:
                    digest_original = hashlib.sha256()
                    for block in iter(lambda: original.read(1024 * 1024), b""):
                        digest_original.update(block)
                if actual["bytes"] != member.file_size or actual["sha256"] != digest_original.hexdigest():
                    raise ValueError("An already received original application member changed.")
                continue
            partial = target.with_name(target.name + ".receiving")
            with archive.open(member) as src, partial.open("wb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
            if partial.stat().st_size != member.file_size:
                raise ValueError("The selected original application member is incomplete.")
            os.chmod(partial, 0o700 if (member.external_attr >> 16) & 0o111 else 0o600)
            os.replace(partial, target)
    return {"archive": identity(retained), "verified": verified, "source_directory": str(root)}


class Receiving:
    def __init__(self, request_path):
        self.request, self.original = request_payload(request_path)
        if self.request.get("schema") != SCHEMA:
            raise ValueError("Select the original complete Tugboat receiving request.")
        self.root = directory(self.request["work_directory"], True)
        self.state_file = self.root / "receiving.json"
        self.state = read_json(self.state_file) if self.state_file.exists() else {
            "schema": SCHEMA, "request_sha256": self.original["sha256"],
            "operation_id": self.request["operation_id"], "phase": "prepared", "steps": {},
        }
        if self.state.get("request_sha256") != self.original["sha256"]:
            raise ValueError("This receiving directory belongs to another immutable original request.")
        self.args = arguments(self.request["workspace"])
        self.workspace, self.user = opened(self.args)
        self.environment_id = self.request["environment_id"]
        self.profile = dict(self.state.get("profile") or self.request["profile"])
        tugboat_adapter.profile(self.profile)
        actions = self.request.get("actions", ["create", "refresh", "rebuild", "stop", "start"])
        if not isinstance(actions, list) or not actions or any(action not in tugboat_adapter.ACTIONS for action in actions):
            raise ValueError("Select the explicit native preview lifecycle actions to receive.")
        if actions.count("create") > 1 or ("create" in actions and actions[0] != "create"):
            raise ValueError("The single new-preview operation must be the first selected lifecycle action.")
        self.actions = actions

    def retained(self, label, value):
        path = self.root / (label + "-" + digest(value) + ".json")
        if not path.exists():
            save(path, value)
        elif read_json(path) != value:
            raise ValueError("An original receiving result changed.")
        return identity(path)

    def persist(self):
        save(self.state_file, self.state)

    def key(self, label):
        return self.request["operation_id"] + "/" + label

    def configure(self, label):
        before = self.workspace.dispatch("operations.capabilities",
                    {"environment_id": self.environment_id}, self.user)
        environment = before["environment"]
        current = before.get("current_config") or {}
        if current == self.profile:
            return before
        request = {"environment_id": self.environment_id, "expected_revision": environment["revision"],
                   "config": self.profile}
        result = self.workspace.dispatch("operations.configure", request, self.user)
        self.state.setdefault("configurations", {})[label] = self.retained("configure-" + label,
                    {"request": request, "result": result})
        self.persist()
        return self.workspace.dispatch("operations.capabilities", {"environment_id": self.environment_id}, self.user)

    def run_step(self, label, action, capability):
        step = self.state["steps"].get(label)
        if step is None:
            request = {"request_key": self.key(label), "environment_id": self.environment_id,
                       "environment_revision": capability["environment"]["revision"],
                       "config_sha256": capability["profile"]["revision"],
                       "authorization_reference": self.request["authorization_reference"],
                       "target_fingerprint": capability.get("capabilities", {}).get("target_fingerprint", "")}
            method = "sources.capture" if action == "capture" else "operations.create"
            if action != "capture":
                request.update(type="PREVIEW", native_action="tugboat-" + action)
            step = {"phase": "prepared", "method": method, "request": request}
            self.state["steps"][label] = step
            self.persist()
        if not step.get("operation_id"):
            result = self.workspace.dispatch(step["method"], step["request"], self.user)
            step.update(phase="queued", operation_id=result["operation"]["id"],
                        created=self.retained(label + "-queued", result))
            self.persist()
        result = self.workspace.dispatch("operations.get", {"operation_id": step["operation_id"]}, self.user)
        operation = result["operation"]
        if operation["state"] in {"PAUSED", "WAITING_NATIVE"} and not operation.get("cancel_requested"):
            import time
            checkpoint = operation.get("resume_checkpoint") or operation.get("checkpoint") or {}
            native = checkpoint.get("resume_checkpoint", checkpoint.get("state", checkpoint))
            deadline = max([float(native.get("provider_not_before", 0)),
                            float(native.get("not_before", 0))]
                           + [float(value) for value in native.get("provider_poll_deadlines", {}).values()])
            association = (self.request.get("job_associations") or {}).get(operation["id"])
            ambiguous = native.get("phase") in {"dispatching", "native_interrupted"}
            eligible = time.time() >= deadline
            # Explicit cancellation remains the operator's decision. Unknown writes
            # keep their original association path; recoverable reads retain this ID.
            should_resume = eligible and (association or
                (not ambiguous and (operation["state"] == "PAUSED" or not tugboat_adapter.pollable(native))))
            if should_resume:
                request = {"request_key": self.key(label + "-resume-" + str(operation["revision"])),
                           "operation_id": operation["id"], "expected_revision": operation["revision"],
                           "reason": "Continue this retained customer course after its native receiving condition"}
                if association:
                    request["tugboat_job_id"] = association
                self.retained(label + "-resume-request", request)
                resumed = self.workspace.dispatch("operations.resume", request, self.user)
                self.retained(label + "-resume-result", resumed)
        from cli import run_worker
        run_worker(self.workspace, True)
        result = self.workspace.dispatch("operations.get", {"operation_id": step["operation_id"]}, self.user)
        operation = result["operation"]
        step.update(phase=operation["state"], result=self.retained(label + "-result", result))
        self.persist()
        if operation["state"] != "COMPLETE":
            self.state.update(phase="attention", current_step=label)
            self.persist()
            return None
        return operation

    def run(self):
        with lease(self.root, "receiving.lock"):
            if self.state["phase"] == "complete":
                return self.status()
            capability = self.configure("capture")
            captured = self.run_step("00-source", "capture", capability)
            if captured is None:
                return self.status()
            source = captured["native_result"]["observations"]["source"]
            self.state["original_source"] = source
            self.profile.update(source_revision=source["commit"],
                                expected_config_sha256=source["configuration_sha256"])
            self.state["profile"] = self.profile
            self.persist()
            for index, action in enumerate(self.actions, 1):
                label = str(index).zfill(2) + "-" + action
                capability = self.configure(label)
                operation = self.run_step(label, action, capability)
                if operation is None:
                    return self.status()
                preview = operation["native_result"]["observations"]["preview"]
                self.profile["preview_id"] = preview["id"]
                self.state["profile"] = dict(self.profile)
                self.state["last_preview"] = preview
                self.persist()
            self.state.update(phase="complete", completed_at=utc())
            self.persist()
            return self.status()

    def status(self):
        return {"schema": SCHEMA, "state": self.state["phase"],
                "operation_id": self.state["operation_id"],
                "workspace": str(self.workspace.root), "environment_id": self.environment_id,
                "preview": {k: (self.state.get("last_preview") or {}).get(k) for k in ("id", "sha", "state", "url")},
                "steps": {key: {"state": value["phase"], "operation_id": value.get("operation_id")}
                          for key, value in self.state["steps"].items()},
                "result": identity(self.state_file) if self.state_file.exists() else None}

    def handover(self, selected):
        with lease(self.root, "receiving.lock"):
            if self.state["phase"] != "complete":
                raise ValueError("Complete the original selected native lifecycle before its full customer handover.")
            target = Path(selected["destination"]).expanduser()
            if not target.is_absolute() or target.is_symlink():
                raise ValueError("Use the original absolute private customer handover directory.")
            target = target.resolve(strict=False)
            for original in (self.root.resolve(), self.workspace.root.resolve(), Path(self.args.source_root).resolve()):
                if target == original or target.is_relative_to(original) or original.is_relative_to(target):
                    raise ValueError("Keep the whole receiving destination separate from original source and working directories.")
            target.mkdir(mode=0o700, parents=True, exist_ok=True)
            handover_file = self.root / "handover.json"
            binding = digest(selected)
            handover = read_json(handover_file) if handover_file.exists() else {
                "schema": SCHEMA, "binding": binding, "phase": "prepared", "destination": str(target)}
            if handover["binding"] != binding:
                raise ValueError("Continue this same complete customer handover selection.")
            save(handover_file, handover)
            source_root = Path(self.args.source_root).resolve()
            if not handover.get("intake_received"):
                handover["intake_received"] = copy_intake(source_root, target / "original-inputs", handover, handover_file)
                save(handover_file, handover)
            application_zip = Path(selected["application_zip"])
            expected_sha = selected["application_sha256"]
            if not handover.get("application"):
                handover["application"] = receive_application(application_zip, expected_sha, target)
                save(handover_file, handover)
            backup = target / "private-workspace"
            if not handover.get("backup"):
                if backup.exists():
                    if (backup / "BACKUP_INCOMPLETE").exists() or not (backup / "backup.json").is_file():
                        # This serial receiver owns the destination. Preserve every
                        # prior byte before the unchanged native backup starts again.
                        import time
                        retained_partial = target / ("incomplete-private-workspace-" + str(time.time_ns()))
                        os.rename(backup, retained_partial)
                        handover.setdefault("retained_partial_backups", []).append(str(retained_partial))
                        save(handover_file, handover)
                        handover["backup"] = self.workspace.dispatch("workspace.backup", {"destination": str(backup)}, self.user)
                        save(handover_file, handover)
                    metadata = read_json(backup / "backup.json")
                    if metadata["workspace"] != self.workspace.snapshot().get("workspace"):
                        raise ValueError("The retained backup belongs to another original workspace.")
                    handover["backup"] = {"directory": str(backup), **metadata}
                else:
                    handover["backup"] = self.workspace.dispatch("workspace.backup", {"destination": str(backup)}, self.user)
                save(handover_file, handover)
            receiver = target / "application" / "govhub-operations" / "workspace" / "tugboat_receive.py"
            if not receiver.is_file():
                raise ValueError("The complete original application package is missing its Tugboat receiver.")
            from pantheon_receive import Commands
            commands = Commands(self.root / "cold-reopen", 600)
            original = self.workspace.snapshot()
            receipt = commands.run("original-project-reopen", [
                sys.executable, str(receiver), "inspect", "--workspace", str(backup),
                "--source-root", str(target / "original-inputs"),
                "--assessment-core", str(receiver.parent / "vendor" / "assessment-core"),
                "--username", self.args.username, "--password-env", self.args.password_env])
            reopened = Commands.json_output(receipt)
            expected = {row["id"]: row for row in original["govhub"]["operations"]}
            actual = {row["id"]: row for row in reopened["operations"]}
            if original.get("workspace") != reopened.get("workspace") or expected != actual:
                raise ValueError("The independent received application changed the original workspace or operation population.")
            handover.update(phase="complete", reopened=reopened, cold_command=receipt,
                            receiving_state=self.state, completed_at=utc())
            save(handover_file, handover)
            return {"state": "RECEIVED", "workspace": reopened["workspace"], "operation_count": len(actual),
                    "destination": str(target), "receiver": str(receiver), "result": identity(handover_file)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("run", "status"):
        item = sub.add_parser(command)
        item.add_argument("--request", required=True)
    transfer = sub.add_parser("handover")
    transfer.add_argument("--request", required=True)
    transfer.add_argument("--selection", required=True)
    inspect = sub.add_parser("inspect")
    from pantheon_receive import add_workspace
    add_workspace(inspect)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command == "inspect":
            workspace, user = opened(args)
            snapshot = workspace.snapshot()
            result = {"workspace": snapshot.get("workspace"), "actor": {"name": user["name"], "role": user["role"]},
                      "operations": snapshot["govhub"]["operations"], "summary": snapshot["govhub"]["summary"]}
        else:
            programme = Receiving(args.request)
            if args.command == "run":
                result = programme.run()
            elif args.command == "status":
                result = programme.status()
            else:
                selected, _ = request_payload(args.selection)
                result = programme.handover(selected)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return 0 if result.get("state") != "attention" else 2
    except Exception as exc:
        print(json.dumps({"ok": False, "message": str(exc), "type": type(exc).__name__}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
