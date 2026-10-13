#!/usr/bin/env python3
"""Receive a complete selected Castor operating course in the existing GovHub project.

Copyright 2026 Token Junkie Labs contributors. Apache-2.0; see ../LICENSE.
Actual provider work, current plan review, native commands, files and private backup
remain with the original GovHub engines. This programme retains the whole course.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time

from pantheon_receive import (Commands, add_workspace, atomic, directory, identity,
                              lease, opened, read_json, request_payload, utc)
from tugboat_receive import arguments, copy_intake, receive_application
import castor_adapter

SCHEMA = "govhub-castor-native-receiving/v1"
CONTINUATION = "govhub-castor-native-continuation/v1"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def save(path, value):
    atomic(path, value)
    return value


def native_checkpoint(operation):
    value = operation.get("resume_checkpoint") or operation.get("checkpoint") or {}
    return value.get("resume_checkpoint", value.get("state", value))


def source_pointer(value, pointer, json_value=False):
    if not isinstance(pointer, str) or not pointer.startswith("/"):
        raise ValueError("Select an explicit JSON pointer into the complete original operation.")
    for raw in pointer.split("/")[1:]:
        key = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(value, list):
            if not re.fullmatch(r"0|[1-9][0-9]*", key):
                raise ValueError("A source pointer must select an actual original list item.")
            value = value[int(key)]
        elif isinstance(value, dict):
            value = value[key]
        else:
            raise ValueError("The selected source pointer does not name an original value.")
    if json_value:
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    if not isinstance(value, (str, int, bool)) or isinstance(value, float):
        raise ValueError("A profile source selection must resolve to its native scalar value.")
    return value


class Receiving:
    def __init__(self, request_path, continuation_path=None):
        self.request, self.original = request_payload(request_path)
        if self.request.get("schema") != SCHEMA:
            raise ValueError("Use the complete original Castor receiving request.")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{2,159}", self.request.get("operation_id", "")):
            raise ValueError("Supply the original whole-course operation identifier.")
        self.root = directory(self.request["work_directory"], True)
        self.state_file = self.root / "receiving.json"
        self.state = read_json(self.state_file) if self.state_file.exists() else {
            "schema": SCHEMA, "operation_id": self.request["operation_id"],
            "request_sha256": self.original["sha256"], "phase": "prepared", "steps": {},
        }
        if self.state.get("request_sha256") != self.original["sha256"]:
            raise ValueError("This receiving directory belongs to another original request.")
        self.args = arguments(self.request["workspace"])
        self.workspace, self.actor = opened(self.args)
        self.steps = self.request.get("steps")
        if not isinstance(self.steps, list) or not 1 <= len(self.steps) <= 64:
            raise ValueError("Select between one and 64 complete native operating steps.")
        ids = []
        for step in self.steps:
            if not isinstance(step, dict) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,79}", step.get("id", "")):
                raise ValueError("Each selected native step needs a unique plain identifier.")
            if step["id"] in ids:
                raise ValueError("Each native step identifier must be unique.")
            ids.append(step["id"])
            kind = step.get("type")
            actions = castor_adapter.actions_for(kind)
            if step.get("native_action") not in {row["value"] for row in actions}:
                raise ValueError("Select an actual Castor action for each existing operation purpose.")
            if not isinstance(step.get("profile"), dict) or step["profile"].get("source_kind") != "castor":
                raise ValueError("Retain the selected complete Castor profile for every step.")
            if not step.get("environment_id"):
                raise ValueError("Select the existing local environment record for every native step.")
            for source in list(step.get("profile_sources", [])) + list(step.get("backup_sources", [])):
                if source.get("step") not in ids[:-1]:
                    raise ValueError("A profile source must select an earlier completed course step.")
        self.continuation = {}
        self.continuation_identity = None
        if continuation_path:
            value, original = request_payload(continuation_path)
            if value.get("schema") != CONTINUATION or value.get("request_sha256") != self.original["sha256"]:
                raise ValueError("Continuation must name this immutable original course request.")
            if not isinstance(value.get("operations", {}), dict):
                raise ValueError("Continuation operations must be keyed by their original operation IDs.")
            self.continuation = value
            self.continuation_identity = original

    def reload(self):
        if self.state_file.exists():
            current = read_json(self.state_file)
            if current.get("request_sha256") != self.original["sha256"]:
                raise ValueError("The saved receiving state belongs to another original request.")
            self.state = current

    def persist(self):
        save(self.state_file, self.state)

    def retained(self, label, value):
        path = self.root / (label + "-" + digest(value) + ".json")
        if not path.exists():
            save(path, value)
        elif read_json(path) != value:
            raise ValueError("A retained original receiving result changed.")
        return identity(path)

    def key(self, label):
        return self.request["operation_id"] + "/" + label

    def original_operation(self, step_id):
        step = self.state["steps"].get(step_id) or {}
        if step.get("phase") != "COMPLETE" or not step.get("operation_id"):
            raise ValueError("The selected earlier native source operation is not complete.")
        result = self.workspace.dispatch("operations.get", {"operation_id": step["operation_id"]}, self.actor)
        if result["operation"]["state"] != "COMPLETE":
            raise ValueError("The selected earlier original operation no longer has a complete outcome.")
        return result["operation"]

    def profile(self, step):
        selected = dict(step["profile"])
        schema = castor_adapter.provider_schema()
        allowed = {field["name"] for field in schema["fields"]}
        host_fields = {field if isinstance(field, str) else field["name"]
                       for field in schema.get("runtime_fields", [])}
        bindings = []
        for source in step.get("profile_sources", []):
            name = source.get("field")
            if name not in allowed or name.endswith("_env") or name in host_fields:
                raise ValueError("Only native source selections may be received from a prior operation.")
            original = self.original_operation(source["step"])
            encoding = source.get("encoding", "scalar")
            if encoding not in {"scalar", "json"} or (encoding == "json" and not name.endswith("_json")):
                raise ValueError("Use JSON encoding only for an original provider JSON selection.")
            value = source_pointer(original, source.get("pointer"), encoding == "json")
            selected[name] = value
            bindings.append({"field": name, "step": source["step"], "operation_id": original["id"],
                             "operation_revision": original["revision"], "pointer": source["pointer"], "encoding": encoding,
                             "value": value, "original_sha256": digest(original)})
        if step.get("backup_sources"):
            if any(row.get("field") == "backup_inputs_json" for row in step.get("profile_sources", [])):
                raise ValueError("Choose one explicit original backup input binding for this step.")
            inputs = []
            seen = set()
            for source in step["backup_sources"]:
                if not isinstance(source, dict) or set(source) - {"step", "path", "target_path"}:
                    raise ValueError("Select the previous backup step, actual output path and optional original target path.")
                original = self.original_operation(source["step"])
                outputs = ((original.get("native_result") or {}).get("observations") or {}).get("task_outputs") or []
                matches = [row for row in outputs if row.get("path") == source.get("path") and row.get("present") is True]
                if len(matches) != 1:
                    raise ValueError("The backup selection must identify one complete original task output.")
                output = matches[0]
                kind = output.get("kind", "file")
                sha = output.get("sha256") if kind == "file" else output.get("manifest_sha256")
                if kind not in {"file", "directory"} or not re.fullmatch(r"[0-9a-f]{64}", sha or ""):
                    raise ValueError("The selected original backup lacks its complete native file or directory identity.")
                path = source.get("target_path") or output["path"]
                if not isinstance(path, str) or path.startswith("/") or "\\" in path or any(
                        part in {"", ".", ".."} for part in path.split("/")):
                    raise ValueError("Select an explicit original project-relative backup input path.")
                if path in seen:
                    raise ValueError("Select each original receiving backup input once.")
                seen.add(path)
                item = {"path": path, "role": output["role"], "kind": kind, "sha256": sha}
                inputs.append(item)
                bindings.append({"field": "backup_inputs_json", "step": source["step"],
                    "operation_id": original["id"], "operation_revision": original["revision"],
                    "original_sha256": digest(original), "original_output": output, "selected_input": item})
            selected["backup_inputs_json"] = json.dumps(inputs, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        castor_adapter.profile(selected)
        return selected, bindings

    def configure(self, step, retained):
        if "profile" not in retained:
            selected, bindings = self.profile(step)
            retained.update(profile=selected, profile_sources=bindings)
            self.persist()
        selected = retained["profile"]
        before = self.workspace.dispatch("operations.capabilities",
                    {"environment_id": step["environment_id"]}, self.actor)
        environment = before["environment"]
        if environment["data"].get("provider_resource_id") != selected["environment_id"]:
            raise ValueError("The actual provider identity differs from the selected environment record.")
        if before.get("current_config") != selected:
            request = {"environment_id": environment["id"], "expected_revision": environment["revision"],
                       "config": selected}
            retained["configuration_request"] = self.retained(step["id"] + "-configuration-request", request)
            self.persist()
            result = self.workspace.dispatch("operations.configure", request, self.actor)
            retained["configuration_result"] = self.retained(step["id"] + "-configuration-result", result)
            self.persist()
            before = self.workspace.dispatch("operations.capabilities",
                      {"environment_id": environment["id"]}, self.actor)
        return before

    def queue(self, step, retained, capability):
        if "request" not in retained:
            request = {"request_key": self.key(step["id"]),
                "environment_id": step["environment_id"],
                "environment_revision": capability["environment"]["revision"],
                "config_sha256": capability["profile"]["revision"],
                "authorization_reference": step.get("authorization_reference") or self.request["authorization_reference"],
                "target_fingerprint": capability.get("capabilities", {}).get("target_fingerprint", ""),
                "native_action": step["native_action"]}
            if step["type"] != "CAPTURE":
                request["type"] = step["type"]
            if step["type"] not in {"CAPTURE", "PREVIEW", "BACKUP_CREATE", "BACKUP_DOWNLOAD"}:
                if not step.get("plan_id") or not step.get("expected_plan_revision"):
                    raise ValueError("Reviewed cohort operations require the selected original plan and revision.")
                request.update(plan_id=step["plan_id"], expected_revision=step["expected_plan_revision"])
                if "agency_ids" in step:
                    request["agency_ids"] = step["agency_ids"]
                if step.get("backup_sha256"):
                    request["backup_sha256"] = step["backup_sha256"]
            retained.update(method="sources.capture" if step["type"] == "CAPTURE" else "operations.create",
                            request=request, phase="PREPARED")
            self.persist()
        if not retained.get("operation_id"):
            result = self.workspace.dispatch(retained["method"], retained["request"], self.actor)
            retained.update(operation_id=result["operation"]["id"], phase=result["operation"]["state"],
                            queued=self.retained(step["id"] + "-queued", result))
            self.persist()

    def continue_operation(self, step, operation):
        selected = self.continuation.get("operations", {}).get(operation["id"], {})
        if selected and not isinstance(selected, dict):
            raise ValueError("A continuation must retain the selected original operation controls.")
        unknown = set(selected) - {"castor_command_receipt", "runtime_bindings", "restored_snapshot_id",
                                  "reason", "resume_cancelled"}
        if unknown:
            raise ValueError("Unsupported original continuation fields: " + ", ".join(sorted(unknown)))
        if operation["state"] in {"COMPLETE", "QUEUED", "RUNNING"}:
            return
        if (operation.get("native_result") or {}).get("status") == "COMPLETE":
            snapshot_id = selected.get("restored_snapshot_id") or step.get("restored_snapshot_id")
            if snapshot_id:
                request = {"operation_id": operation["id"], "expected_revision": operation["revision"],
                    "capture_file_id": operation["native_capture_file_id"],
                    "restored_snapshot_id": snapshot_id,
                    "notes": selected.get("reason") or step.get("observation_notes") or
                             "Original selected restored inventory received through the complete native course"}
                result = self.workspace.dispatch("operations.observe", request, self.actor)
                self.retained(step["id"] + "-observed", {"request": request, "result": result})
            return
        native = native_checkpoint(operation)
        deadline = max(float(native.get("provider_not_before", 0)),
                       float(native.get("provider_request_not_before", 0)),
                       float(native.get("not_before", 0)))
        if operation.get("next_poll_at"):
            original_poll = datetime.fromisoformat(operation["next_poll_at"].replace("Z", "+00:00"))
            if original_poll.tzinfo is None:
                raise ValueError("The original operation poll deadline must include its timezone.")
            deadline = max(deadline, original_poll.timestamp())
        if time.time() < deadline:
            return
        cancelled = operation.get("cancel_requested") or operation["state"] == "CANCELLED"
        if cancelled and not selected.get("resume_cancelled"):
            return
        ambiguous = native.get("phase") in {"dispatching", "native_interrupted"} or bool(native.get("pending_command"))
        associated = bool(selected.get("castor_command_receipt"))
        explicit = bool(selected.get("runtime_bindings") or selected.get("resume_cancelled"))
        recoverable = operation["state"] in {"PAUSED", "WAITING_NATIVE"} and not ambiguous and not castor_adapter.pollable(native)
        if ambiguous and not associated:
            return
        if not associated and not explicit and not recoverable:
            return
        request = {"request_key": self.key(step["id"] + "-resume-" + str(operation["revision"]) + "-" + digest(selected)),
            "operation_id": operation["id"], "expected_revision": operation["revision"],
            "reason": selected.get("reason") or "Continue the same original native course after its receiving condition"}
        for key in ("castor_command_receipt", "runtime_bindings"):
            if key in selected:
                request[key] = selected[key]
        self.retained(step["id"] + "-resume-request", request)
        result = self.workspace.dispatch("operations.resume", request, self.actor)
        self.retained(step["id"] + "-resume-result", result)

    def run_step(self, step):
        retained = self.state["steps"].setdefault(step["id"], {"phase": "PREPARED"})
        if retained.get("phase") == "COMPLETE":
            self.original_operation(step["id"])
            return True
        if not retained.get("operation_id"):
            capability = self.configure(step, retained)
            self.queue(step, retained, capability)
        result = self.workspace.dispatch("operations.get", {"operation_id": retained["operation_id"]}, self.actor)
        self.continue_operation(step, result["operation"])
        from cli import run_worker
        run_worker(self.workspace, True)
        result = self.workspace.dispatch("operations.get", {"operation_id": retained["operation_id"]}, self.actor)
        # A newly completed provider mutation may now be joined to its actual
        # already-retained RESTORED inventory by the original comparison engine.
        if result["operation"]["state"] != "COMPLETE":
            self.continue_operation(step, result["operation"])
            result = self.workspace.dispatch("operations.get", {"operation_id": retained["operation_id"]}, self.actor)
        retained.update(phase=result["operation"]["state"], result=self.retained(step["id"] + "-result", result))
        self.persist()
        if retained["phase"] != "COMPLETE":
            self.state.update(phase="attention", current_step=step["id"])
            self.persist()
            return False
        return True

    def run(self):
        with lease(self.root, "receiving.lock"):
            self.reload()
            self.retained("original-request", self.request)
            if self.continuation_identity:
                self.retained("original-continuation", self.continuation)
            if self.state["phase"] == "complete":
                for step in self.steps:
                    self.original_operation(step["id"])
                return self.status()
            for step in self.steps:
                if not self.run_step(step):
                    return self.status()
            self.state.update(phase="complete", completed_at=utc())
            self.state.pop("current_step", None)
            self.persist()
            return self.status()

    def status(self):
        self.reload()
        return {"schema": SCHEMA, "state": self.state["phase"],
            "operation_id": self.state["operation_id"], "request_sha256": self.original["sha256"],
            "workspace": str(self.workspace.root), "current_step": self.state.get("current_step"),
            "steps": {key: {"state": row["phase"], "operation_id": row.get("operation_id")}
                      for key, row in self.state["steps"].items()},
            "result": identity(self.state_file) if self.state_file.exists() else None}

    def receive_sources(self, target, selected, handover, state_path):
        """Receive original complete packages and reopen their actual Git sources."""
        import castor_source
        from native_adapter import Session, _binary
        exports = selected.get("source_exports")
        if not isinstance(exports, list) or not exports:
            raise ValueError("Select the actual complete source artifact from each source-capture step.")
        required = {step["id"] for step in self.steps if step["type"] == "CAPTURE"}
        if not required.issubset({row.get("step") for row in exports if isinstance(row, dict)}):
            raise ValueError("Include every completed source-capture step in independent native receiving.")
        seen = set()
        for index, selection in enumerate(exports):
            if not isinstance(selection, dict) or set(selection) - {"step", "file_name", "runtime_bindings"}:
                raise ValueError("Select the original step, complete file name and actual local runtime bindings.")
            key = (selection.get("step"), selection.get("file_name"))
            if key in seen:
                raise ValueError("Receive each original source artifact once in this handover.")
            seen.add(key)
            operation = self.original_operation(selection["step"])
            item = self.workspace.operation_file(operation["id"], selection["file_name"])
            slot = directory(target / ("native-source-" + str(index).zfill(2)), True)
            archive = slot / "original-source.zip"
            expected = {"bytes": item.get("size", item.get("bytes")), "sha256": item["sha256"]}
            if not archive.exists():
                partial = slot / "original-source.zip.receiving"
                if partial.is_symlink():
                    raise ValueError("The original source receiving path cannot be a link.")
                with Path(item["path"]).open("rb") as source, partial.open("wb") as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
                    output.flush()
                    os.fsync(output.fileno())
                actual = identity(partial)
                if any(actual[name] != expected[name] for name in expected):
                    raise ValueError("The complete retained source package changed while receiving.")
                os.replace(partial, archive)
            actual = identity(archive)
            if any(actual[name] != expected[name] for name in expected):
                raise ValueError("The original received source package changed.")
            original_config = operation["profile"]["config"]
            maximum = original_config.get("max_artifact_bytes", 1073741824)
            manifest = castor_source.verify_source(archive, maximum)
            native_target = manifest.get("target") or {}
            expected_selection = {
                "environment_id": original_config["environment_id"],
                "castor_file": original_config.get("castor_file", ""),
                "docker_context": original_config.get("docker_context", ""),
                "castor_context": original_config.get("castor_context", ""),
                "compose_project": original_config.get("compose_project", ""),
                "compose_files": json.loads(original_config.get("compose_files_json") or "[]"),
                "release_files": json.loads(original_config.get("release_files_json") or "[]"),
                "task_outputs": json.loads(original_config.get("task_outputs_json") or "[]"),
            }
            if any(native_target.get(name) != value for name, value in expected_selection.items()):
                raise ValueError("The source artifact belongs to another original application/context/Compose/file selection.")
            inputs = json.loads(original_config.get("backup_inputs_json") or "[]")
            original_inputs = native_target.get("backup_inputs") or []
            normalized = lambda entries: sorted(
                [{"path": row["path"], "role": row["role"], "kind": row.get("kind", "file"),
                  "sha256": row["sha256"]} for row in entries], key=lambda row: row["path"])
            if normalized(inputs) != normalized(original_inputs):
                raise ValueError("The source artifact carries another original backup input selection.")
            observations = (operation.get("native_result") or {}).get("observations") or {}
            phase = native_target.get("capture_phase")
            actual_inventory = observations.get("before_inventory" if phase == "before" else "native_inventory") or {}
            expected_head = actual_inventory.get("head_commit")
            if phase in {"before", "capture"} and original_config.get("source_revision") and original_config["source_revision"] != expected_head:
                raise ValueError("The original pre-task source differs from its reviewed source revision.")
            if not expected_head or manifest.get("source_revision") != expected_head or native_target.get("source_revision") != expected_head:
                raise ValueError("The source package differs from the selected or actually observed original commit.")
            images = native_target.get("image_ids")
            if not isinstance(images, list) or any(not isinstance(value, str) for value in images) or len(images) != len(set(images)):
                raise ValueError("The complete source package must retain its actual unique native image identities.")
            original_source = observations.get("before_source" if phase == "before" else "source") or {}
            if original_source.get("target") != native_target:
                raise ValueError("The native source manifest differs from its complete original operation source selection.")
            if original_source.get("source_revision") != manifest.get("source_revision"):
                raise ValueError("The native package revision differs from its retained original source result.")
            if native_target.get("capture_phase") not in {"capture", "before", "after"}:
                raise ValueError("The source package has no explicit original capture phase.")
            received = castor_source.receive_source(archive, slot / "members", maximum)
            host = directory(slot / "host", True)
            bindings = dict(selection.get("runtime_bindings") or {})
            if set(bindings) - castor_adapter.RUNTIME_FIELDS:
                raise ValueError("Only original declared native host paths may be supplied during source receiving.")
            if "site_root" in bindings and Path(bindings["site_root"]).resolve() != host:
                raise ValueError("The source reopening host directory is this original private handover slot.")
            bindings["site_root"] = str(host)
            # This read-only source receiver has no application checkout yet.
            # Native task profile validation applies after the full checkout exists.
            # The helper invokes only this receiving Session's original Git executable.
            source_profile = {**original_config, **bindings}
            source_profile["git_path"] = _binary(source_profile.get("git_path") or "git")
            source_profile.setdefault("timeout_seconds", 900)
            source_profile.setdefault("max_artifact_bytes", 2147483648)
            session = Session(source_profile, slot / "native-reopen")
            saved = session.out / "native-state.json"
            if saved.exists():
                session.state = session.read_private_json(saved)
            reopened = castor_source.reopen_source(session, slot / "members", slot / "checkout")
            receipt = {"step": selection["step"], "operation_id": operation["id"],
                       "file_name": selection["file_name"], "archive": actual,
                       "received": received, "reopened": reopened,
                       "native_output": str(session.out)}
            handover.setdefault("source_exports", {})[str(index)] = receipt
            save(state_path, handover)
        return handover["source_exports"]

    def handover(self, selected):
        with lease(self.root, "receiving.lock"):
            self.reload()
            if self.state["phase"] != "complete":
                raise ValueError("Complete the selected original native course before the full receiving handover.")
            target = Path(selected["destination"]).expanduser()
            if not target.is_absolute() or target.is_symlink():
                raise ValueError("Use the original absolute private receiving directory.")
            target = target.resolve(strict=False)
            for original in (self.root, self.workspace.root, Path(self.args.source_root)):
                original = original.resolve()
                if target == original or target.is_relative_to(original) or original.is_relative_to(target):
                    raise ValueError("Keep full receiving separate from the original input and project directories.")
            target.mkdir(mode=0o700, parents=True, exist_ok=True)
            path = self.root / "handover.json"
            handover = read_json(path) if path.exists() else {
                "schema": SCHEMA, "binding": digest(selected), "phase": "prepared", "destination": str(target)}
            if handover["binding"] != digest(selected):
                raise ValueError("Continue the same original whole handover selection.")
            save(path, handover)
            if handover.get("phase") == "complete":
                application = handover["application"]["archive"]
                if identity(application["path"])["sha256"] != application["sha256"]:
                    raise ValueError("The original received application archive changed.")
                if read_json(target / "original-course.json") != {"request": self.request, "receiving": self.state}:
                    raise ValueError("The completed original course changed after receiving.")
                return {"state": "RECEIVED", "workspace": handover["reopened"]["workspace"],
                        "operation_count": len(handover["reopened"]["operations"]),
                        "destination": str(target), "receiver": str(target / "application" /
                        "govhub-operations" / "workspace" / "castor_receive.py"), "result": identity(path)}
            if not handover.get("intake_received"):
                handover["intake_received"] = copy_intake(Path(self.args.source_root), target / "original-inputs", handover, path)
                save(path, handover)
            if not handover.get("application"):
                handover["application"] = receive_application(Path(selected["application_zip"]),
                    selected["application_sha256"], target)
                save(path, handover)
            self.receive_sources(target, selected, handover, path)
            backup = target / "private-workspace"
            if not handover.get("backup"):
                if backup.exists():
                    if (backup / "BACKUP_INCOMPLETE").exists() or not (backup / "backup.json").is_file():
                        prior = target / ("incomplete-private-workspace-" + str(time.time_ns()))
                        os.rename(backup, prior)
                        handover.setdefault("retained_partial_backups", []).append(str(prior))
                        save(path, handover)
                    else:
                        metadata = read_json(backup / "backup.json")
                        if metadata["workspace"] != self.workspace.snapshot().get("workspace"):
                            raise ValueError("The retained backup belongs to another original workspace.")
                        handover["backup"] = {"directory": str(backup), **metadata}
                if not handover.get("backup"):
                    handover["backup"] = self.workspace.dispatch("workspace.backup",
                        {"destination": str(backup)}, self.actor)
                save(path, handover)
            receiver = target / "application" / "govhub-operations" / "workspace" / "castor_receive.py"
            if not receiver.is_file():
                raise ValueError("The complete original application package is missing its Castor receiver.")
            received_args = arguments({**self.request["workspace"], "workspace": str(backup),
                                       "source_root": str(target / "original-inputs")})
            received_workspace, _ = opened(received_args)
            original = received_workspace.snapshot()
            saved_operations = {row["id"]: row for row in original["govhub"]["operations"]}
            for step in self.steps:
                source_operation = self.original_operation(step["id"])
                if saved_operations.get(source_operation["id"]) != source_operation:
                    raise ValueError("The coherent private backup does not contain the completed original course.")
            selection_path = target / "original-course.json"
            if not selection_path.exists():
                save(selection_path, {"request": self.request, "receiving": self.state})
            elif read_json(selection_path) != {"request": self.request, "receiving": self.state}:
                raise ValueError("The received original course differs from its completed source.")
            commands = Commands(self.root / "cold-reopen", 600)
            receipt = commands.run("original-project-reopen", [
                sys.executable, str(receiver), "inspect", "--workspace", str(backup),
                "--source-root", str(target / "original-inputs"),
                "--assessment-core", str(receiver.parent / "vendor" / "assessment-core"),
                "--username", self.args.username, "--password-env", self.args.password_env])
            reopened = Commands.json_output(receipt)
            expected = {row["id"]: row for row in original["govhub"]["operations"]}
            actual = {row["id"]: row for row in reopened["operations"]}
            if original.get("workspace") != reopened.get("workspace") or expected != actual:
                raise ValueError("Independent receiving changed the original workspace or native operation population.")
            handover.update(phase="complete", reopened=reopened, cold_command=receipt,
                            receiving_state=self.state, completed_at=utc())
            save(path, handover)
            return {"state": "RECEIVED", "workspace": reopened["workspace"],
                    "operation_count": len(actual), "destination": str(target),
                    "receiver": str(receiver), "result": identity(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("run", "status", "handover"):
        item = commands.add_parser(name)
        item.add_argument("--request", required=True)
        item.add_argument("--continuation")
        if name == "handover":
            item.add_argument("--selection", required=True)
    inspect = commands.add_parser("inspect")
    add_workspace(inspect)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.command == "inspect":
            workspace, actor = opened(args)
            snapshot = workspace.snapshot()
            result = {"workspace": snapshot.get("workspace"),
                "actor": {"name": actor["name"], "role": actor["role"]},
                "operations": snapshot["govhub"]["operations"],
                "summary": snapshot["govhub"]["summary"]}
        else:
            receiving = Receiving(args.request, args.continuation)
            if args.command == "run":
                result = receiving.run()
            elif args.command == "status":
                result = receiving.status()
            else:
                selection, _ = request_payload(args.selection)
                result = receiving.handover(selection)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)
        return 2 if result.get("state") == "attention" else 0
    except Exception as exc:
        print(json.dumps({"ok": False, "type": type(exc).__name__, "message": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
