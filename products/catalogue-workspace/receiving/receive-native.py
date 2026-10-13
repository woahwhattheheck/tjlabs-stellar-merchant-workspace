#!/usr/bin/env python3
"""Continue one complete native catalogue receiving operation."""
from __future__ import annotations
import argparse
import copy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import zipfile

MODULE_PATH = Path(__file__).with_name("install-source.py")
SPEC = importlib.util.spec_from_file_location("catalogue_native_source_installation", MODULE_PATH)
installation = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = installation
SPEC.loader.exec_module(installation)
Attention = installation.Attention
atomic, raw, digest, read_json, identity, require, now = (
    installation.atomic, installation.raw, installation.digest, installation.read_json,
    installation.identity, installation.require, installation.now)

SCHEMA = "tjl.catalogue.native-receiving.v1"

class Waiting(RuntimeError):
    def __init__(self, reason, result=None):
        self.reason = reason
        self.result = result
        super().__init__(reason)

class Course:
    command = installation.Installation.command

    def __init__(self, request_file, work, lock_fd, decisions_file, retry_failed):
        self.request_file = Path(request_file).resolve()
        source = self.request_file.read_bytes()
        self.request = json.loads(source)
        require(self.request.get("schema") == SCHEMA, "Supply the original complete native receiving request.")
        self.id = self.request.get("operation_id", "")
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,60}", self.id), "Use the original receiving operation ID.")
        self.work = Path(work).resolve()
        self.lock_fd = lock_fd
        self.root = Path(self.request["source"]["project_root"]).resolve()
        require(self.root.is_dir(), "The original installed source project is absent.")
        require(not self.work.is_relative_to(self.root) and not self.root.is_relative_to(self.work),
                "Keep the original private receiving controls outside the installed project.")
        self.site = self.request["source"]
        require(Path(self.site["php"]).is_absolute(), "Select the original actual PHP wrapper.")
        self.console = installation.within(self.root, self.root / str(installation.relative(self.site.get("console", "bin/console"))))
        require(self.console.is_file(), "Select the original native bin/console.")
        self.actor = self.site["actor"]
        require(isinstance(self.actor, str) and self.actor, "Select an existing native administrator.")
        self.environment = self.site.get("environment", "prod")
        require(re.fullmatch(r"[A-Za-z0-9_-]+", self.environment), "Use the existing Symfony environment.")
        project = self.request["project"]
        self.project_id = project["project_id"]
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", self.project_id), "Select the original catalogue project ID.")
        for key in ("identifiers", "locales", "channels"):
            values = project.get(key)
            require(isinstance(values, list) and values and all(isinstance(x, str) and x for x in values)
                    and len(values) == len(set(values)), "Select an explicit unique original " + key + " list.")
        editions = self.request["editions"]
        require(isinstance(editions, list) and len(editions) >= 2, "The complete course retains at least two source editions.")
        require(len({x["edition_id"] for x in editions}) == len(editions), "Edition IDs must be unique.")
        for edition in editions:
            require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,60}", edition["edition_id"]), "Invalid original edition ID.")
            require(isinstance(edition["capture_id"], str) and edition["capture_id"], "Select each original capture ID.")
        self.retry_failed = set(retry_failed)
        state_path = self.work / "state.json"
        if state_path.exists():
            self.state = read_json(state_path)
            require(self.state["request_sha256"] == digest(source), "Continue the unchanged original full receiving request.")
        else:
            self.state = {"schema": SCHEMA, "operation_id": self.id, "request_sha256": digest(source),
                          "project_id": self.project_id, "created_at": now(), "phase": "PREPARED",
                          "commands": {}, "actions": {}, "editions": {}, "decisions": {}}
            atomic(self.work / "request.json", source)
            self.save()
        self.decisions = {}
        if decisions_file:
            data = Path(decisions_file).read_bytes()
            self.decisions = json.loads(data)
            require(self.decisions.get("operation_id") == self.id and self.decisions.get("schema") == "tjl.catalogue.receiving-decisions.v1",
                    "Use decisions for this exact original receiving operation.")
            atomic(self.work / "decision-inputs" / (digest(data) + ".json"), data)

    def save(self):
        atomic(self.work / "state.json", raw(self.state))

    def action_id(self, label):
        return self.id + "-" + hashlib.sha256(label.encode()).hexdigest()[:40]

    def result(self, label):
        row = self.state["actions"].get(label)
        if row is None:
            return None
        path = self.work / row["output"]
        require(identity(path)["sha256"] == row["sha256"], "An original complete native output changed.")
        return read_json(path)

    def action(self, label, action, input_value, refresh=False, destination=None):
        operation = self.action_id(label)
        binding = {"action": action, "input": input_value, "operation_id": operation, "actor": self.actor,
                   "project_root": str(self.root), "environment": self.environment, "destination": destination}
        original = self.state["actions"].get(label)
        if original:
            require(original["binding"] == binding, "The original native action selection changed: " + label)
            if "output" in original:
                result = self.result(label)
                if not refresh and (result["state"] == "COMPLETE" or action in ("dispatch", "retry")):
                    return result
        inputs = self.work / "inputs" / (self.action_id(label) + ".json")
        encoded = raw(input_value)
        if inputs.exists():
            require(inputs.read_bytes() == encoded, "The original complete action input changed.")
        else:
            atomic(inputs, encoded)
        # The native action operation ID never changes. A read/status drive or
        # incomplete source continuation gets a separately retained invocation.
        calls = original.get("calls", []) if original else []
        number = len(calls) + 1
        pending = original.get("pending") if original else None
        call = pending or {"number": number, "command": "action-" + hashlib.sha256(self.action_id(label).encode()).hexdigest() + "-%04d" % number,
                           "output": "outputs/" + self.action_id(label) + "-%04d.json" % number}
        if not original:
            original = {"binding": binding, "calls": []}
            self.state["actions"][label] = original
        original["pending"] = call
        self.save()
        output = self.work / call["output"]
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        argv = [self.site["php"], str(self.console), "--env=" + self.environment, "--no-interaction",
                "catalogue:workspace", action, "--input", str(inputs), "--operation-id", operation,
                "--actor", self.actor, "--output", str(output)]
        if destination is not None:
            require(action == "download" and Path(destination).is_absolute(), "Only native download accepts a destination.")
            argv += ["--destination", destination]
        outcome = self.command(call["command"], argv, retry_failed=call["command"] in self.retry_failed,
                               accepted_returncodes=(0, 1))
        require(output.is_file(), "Native action did not publish its complete original JSON output.")
        result = read_json(output)
        require(result.get("schema") == "tjl.catalogue.workspace-result.v1" and
                result.get("action") == action and result.get("operation_id") == operation and
                result.get("project_id") == (None if action in ("install", "engine") else self.project_id),
                "The returned native catalogue identity differs.")
        require(result.get("state") in ("COMPLETE", "WAITING_NATIVE", "ATTENTION"), "Unknown original native action status.")
        item = {**call, "sha256": identity(output)["sha256"], "state": result["state"],
                "native_command_result": self.state["commands"][call["command"]]}
        original["calls"].append(item)
        original["output"] = call["output"]
        original["sha256"] = item["sha256"]
        original["state"] = result["state"]
        original.pop("pending", None)
        self.save()
        return result

    def decide(self, label, offered, consume=True):
        retained = self.state["decisions"].get(label)
        if retained is not None:
            if offered is not None:
                require(retained["value"] == offered, "A consumed original decision cannot be replaced.")
            return retained["value"]
        if offered is None:
            raise Waiting("Awaiting explicit current native review decision: " + label)
        if not consume:
            return offered
        row = {"value": copy.deepcopy(offered), "sha256": digest(raw(offered)), "recorded_at": now()}
        self.state["decisions"][label] = row
        self.save()
        return offered

    def install_site(self, key):
        selection = self.request.get("installations", {}).get(key)
        if selection is None:
            return
        state = self.state.setdefault("installations", {}).setdefault(key, {})
        original_request = Path(selection["request"]).resolve()
        original_work = Path(selection["work_directory"]).resolve()
        installer_output = self.work / ("installation-" + key + "-review.json")
        argv = [sys.executable, str(MODULE_PATH), "prepare", "--request", str(original_request),
                "--work-directory", str(original_work), "--output", str(installer_output)]
        if "review" not in state:
            self.command("installation-" + key + "-prepare", argv,
                         retry_failed="installation-" + key + "-prepare" in self.retry_failed)
            review = read_json(installer_output)
            state["review"] = review
            self.save()
        offered = self.decisions.get("installations", {}).get(key)
        selected = self.decide("installation:" + key, offered, consume=False)
        require(selected.get("review_sha256") == state["review"]["review_sha256"], "Select the exact returned native installation review.")
        output = self.work / ("installation-" + key + "-result.json")
        argv = [sys.executable, str(MODULE_PATH), "apply", "--request", str(original_request),
                "--work-directory", str(original_work), "--expect-review", selected["review_sha256"], "--output", str(output)]
        self.command("installation-" + key + "-apply", argv,
                     retry_failed="installation-" + key + "-apply" in self.retry_failed)
        result = read_json(output)
        require(result.get("phase") == "COMPLETE", "Original native installation is incomplete.")
        self.decide("installation:" + key, selected)
        state["result"] = result
        self.save()

    def cohort(self, edition):
        name = edition["edition_id"]
        value = self.state["editions"].setdefault(name, {})
        input_value = {"project_id": self.project_id, "capture_id": edition["capture_id"]}
        if "additional_requests" in edition:
            input_value["additional_requests"] = edition["additional_requests"]
        capture = self.action("capture:" + name, "capture", input_value)
        if capture["state"] != "COMPLETE":
            raise Waiting("Original native source capture remains incomplete.", capture)
        rows = []
        offset = 0
        while True:
            page = self.action("cohort:" + name + ":" + str(offset), "cohort",
                               {"project_id": self.project_id, "capture_id": edition["capture_id"], "offset": offset, "limit": 500})
            require(page["state"] == "COMPLETE", "Original cohort page is incomplete.")
            result = page["result"]
            rows.extend(result["rows"])
            if result["next_offset"] is None:
                break
            require(type(result["next_offset"]) is int and result["next_offset"] > offset, "Native cohort cursor did not advance.")
            offset = result["next_offset"]
        expected = self.request["project"]["identifiers"]
        require([x["identifier"] for x in rows] == expected, "Complete native cohort differs from the selected original identifier order.")
        value["capture"] = capture
        value["rows"] = rows
        value["source_sha256"] = capture["result"]["cohort"]["source_sha256"]
        self.save()
        return value

    def drive_worker(self, edition_name):
        selected = self.request.get("worker")
        if selected is None:
            return
        decision = self.decisions.get("worker_drives", {}).get(edition_name)
        if not decision:
            return
        drive = str(decision.get("drive_id", ""))
        require(re.fullmatch(r"[A-Za-z0-9._-]{1,80}", drive), "Select a stable original native worker drive ID.")
        require(decision.get("authority") == selected.get("authority") and decision.get("owner") == selected.get("owner"),
                "The actual worker owner and scoped command authority are required.")
        argv = selected.get("argv")
        require(isinstance(argv, list) and argv and all(isinstance(x, str) and x for x in argv), "Select actual original bounded worker argv.")
        self.decide("worker:" + edition_name + ":" + drive, decision)
        label = "worker-" + hashlib.sha256(self.action_id(edition_name + ":" + drive).encode()).hexdigest()
        self.command(label, argv, retry_failed=label in self.retry_failed)

    def edition(self, edition, index):
        name = edition["edition_id"]
        selected = self.decisions.get("editions", {}).get(name, {})
        if index:
            begin = self.decide("advance:" + name, selected.get("begin"), consume=False)
            require(begin.get("capture_id") == edition["capture_id"] and begin.get("receive_current_source") is True,
                    "Explicitly select the following native source edition. No upstream data is generated by this course.")
            self.decide("advance:" + name, begin)
        value = self.cohort(edition)
        reviewed = {}
        generations = value.setdefault("review_generations", {})
        for row in value["rows"]:
            identifier = row["identifier"]
            native_state = row["source"]["state"]
            require(native_state in ("PRESENT", "MISSING"), "The current source item needs original native attention.")
            kind = "missing-review" if native_state == "MISSING" else "review"
            generation = selected.get("review_generations", {}).get(identifier, generations.get(identifier, 1))
            require(type(generation) is int and 1 <= generation <= 10000, "Select a positive original review generation.")
            if identifier in value.get("imports", {}) or identifier in value.get("missing", {}):
                require(generation == generations[identifier], "A dispatched/applied item requires a following source edition, not replacement review.")
            generations[identifier] = generation
            label = "review:" + name + ":" + identifier + ":g" + str(generation)
            review = self.action(label, kind, {"project_id": self.project_id, "capture_id": edition["capture_id"], "identifier": identifier})
            require(review["state"] == "COMPLETE", "Original native review is incomplete.")
            reviewed[identifier] = review
        value["reviews"] = reviewed
        self.save()
        missing_decisions = []
        for identifier, envelope in reviewed.items():
            review = envelope["result"]
            decision = selected.get("items", {}).get(identifier)
            if decision is None and "item:" + name + ":" + identifier + ":g" + str(generations[identifier]) not in self.state["decisions"]:
                missing_decisions.append(identifier)
        if missing_decisions:
            raise Waiting("Read the full actual source/native reviews and select each item explicitly.", {"identifiers": missing_decisions, "reviews": reviewed})
        imports = value.setdefault("imports", {})
        for identifier, envelope in reviewed.items():
            review = envelope["result"]
            generation_suffix = ":g" + str(generations[identifier])
            offered = selected.get("items", {}).get(identifier)
            if offered is not None:
                require(offered.get("review_id") == review["id"] and offered.get("review_sha256") == review["sha256"],
                        "Select the exact returned current review before retaining an item decision.")
                require(offered.get("choice") in (("keep", "disable") if review["kind"] == "MISSING" else ("keep", "import")),
                        "Select a valid explicit decision for the actual source state.")
                if offered["choice"] == "import":
                    require(offered.get("approve_native_mapping") is True and isinstance(offered.get("rules", []), list),
                            "Explicitly approve the actual installed mapping and native rule list.")
            decision_label = "item:" + name + ":" + identifier + generation_suffix
            decision = self.decide(decision_label, offered, consume=False)
            require(decision.get("review_id") == review["id"] and decision.get("review_sha256") == review["sha256"],
                    "Decision must bind the exact observed native review for " + identifier)
            choice = decision.get("choice")
            if choice == "keep":
                self.decide(decision_label, decision)
                continue
            if review["kind"] == "MISSING":
                require(choice == "disable", "Choose explicit keep or bounded selected missing disable.")
                action_input = {"project_id": self.project_id, "review_id": review["id"], "review_sha256": review["sha256"],
                                "confirm_selected_disable": decision.get("confirm_selected_disable"),
                                "acknowledge_access_boundary": decision.get("acknowledge_access_boundary"),
                                "disable_parent_if_no_enabled_variants": decision.get("disable_parent_if_no_enabled_variants", False)}
                result = self.action("missing:" + name + ":" + identifier + generation_suffix, "missing-apply", action_input)
                require(result["state"] == "COMPLETE", "Original bounded missing operation is incomplete.")
                self.decide(decision_label, decision)
                value.setdefault("missing", {})[identifier] = result
                self.save()
                continue
            require(choice == "import" and decision.get("approve_native_mapping") is True, "Explicitly select the installed mapping and rules.")
            approved = self.action("approve:" + name + ":" + identifier + generation_suffix, "approve",
                                   {"project_id": self.project_id, "review_id": review["id"], "review_sha256": review["sha256"],
                                    "approve_native_mapping": True, "rules": decision.get("rules", [])})
            require(approved["state"] == "COMPLETE", "Native approval is incomplete.")
            self.decide(decision_label, decision)
            import_id = self.action_id("native-import:" + name + ":" + identifier + generation_suffix)
            if identifier not in imports:
                dispatched = self.action("dispatch:" + name + ":" + identifier + generation_suffix, "dispatch",
                                         {"project_id": self.project_id, "approval_id": approved["result"]["id"], "import_operation_id": import_id})
                imports[identifier] = {"id": import_id, "review_generation": generations[identifier], "approval": approved, "dispatch": dispatched}
                self.save()
            # Dispatch's original acknowledgement can be WAITING. Read current
            # operation state; this path never redispatches a known acknowledgement.
        self.drive_worker(name)
        pending = []
        for identifier, item in imports.items():
            retain = selected.get("retain_unapplied", {}).get(identifier)
            if retain:
                require(retain.get("import_operation_id") == item["id"] and retain.get("confirm_no_native_commit") is True and
                        isinstance(retain.get("reason"), str) and retain["reason"].strip(),
                        "Explicitly retain the selected original unapplied import and reason.")
                retained = self.action("retain-unapplied:" + name + ":" + identifier, "retain-unapplied",
                                       {"project_id": self.project_id, "import_operation_id": item["id"],
                                        "confirm_no_native_commit": True, "reason": retain["reason"]})
                if retained["state"] != "COMPLETE":
                    raise Waiting("The original unapplied disposition was not accepted.", retained)
                self.decide("retain-unapplied:" + name + ":" + identifier, retain)
                item["retained_unapplied"] = retained
                self.save()
            retry = selected.get("retries", {}).get(identifier)
            if retry:
                require("retained_unapplied" not in item, "An explicitly retained unapplied import cannot be reactivated.")
                retry_id = str(retry.get("request_id", ""))
                require(re.fullmatch(r"[A-Za-z0-9._-]{1,80}", retry_id), "Select one original retry request identity.")
                require(retry.get("import_operation_id") == item["id"] and retry.get("preserve_original_approval") is True,
                        "Retry only the original retained import and approval.")
                self.decide("retry:" + name + ":" + identifier + ":" + retry_id, retry)
                self.action("retry:" + name + ":" + identifier + ":" + retry_id, "retry",
                            {"project_id": self.project_id, "import_operation_id": item["id"], "preserve_original_approval": True})
            result = self.action("status:" + name + ":" + identifier, "operation",
                                 {"project_id": self.project_id, "import_operation_id": item["id"]}, refresh=True)
            item["current"] = result
            if result["state"] != "COMPLETE" or result["result"].get("state") not in ("COMPLETE", "RETAINED_UNAPPLIED"):
                pending.append({"identifier": identifier, "import_operation_id": item["id"], "result": result})
        self.save()
        if pending:
            raise Waiting("Await the original native Messenger results/media outcomes; queue admission is not item completion.", pending)
        value["retained_unapplied"] = [identifier for identifier, item in imports.items()
                                     if item["current"]["result"].get("state") == "RETAINED_UNAPPLIED"]
        value["state"] = "COMPLETE_WITH_RETAINED_UNAPPLIED" if value["retained_unapplied"] else "COMPLETE"
        value["completed_at"] = value.get("completed_at", now())
        self.save()
        return value


    def file_identity(self, path):
        path = Path(path)
        require(path.is_file() and not path.is_symlink(), "Select an original ordinary file.")
        before = path.stat()
        sha, count = hashlib.sha256(), 0
        with path.open("rb") as handle:
            while True:
                part = handle.read(1048576)
                if not part:
                    break
                count += len(part)
                sha.update(part)
        after = path.stat()
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                "Original file changed during complete readback.")
        return {"bytes": count, "sha256": sha.hexdigest()}

    def catalogue_download(self, export):
        receipt, selected = export["result"], export["result"]["archive"]
        directory = self.work / "catalogue-export"
        directory.mkdir(exist_ok=True, mode=0o700)
        destination = directory / "original-catalogue.zip"
        response = self.action("catalogue-download", "download",
                               {"project_id": self.project_id, "sha256": selected["sha256"]}, destination=str(destination))
        require(response["state"] == "COMPLETE", "The native catalogue download is unfinished.")
        actual = self.file_identity(destination)
        require(actual == {"bytes": selected["bytes"], "sha256": selected["sha256"]},
                "The downloaded complete ZIP differs from its native descriptor.")
        extracted = directory / "opened"
        extracted.mkdir(exist_ok=True, mode=0o700)
        maximum = self.request.get("max_catalogue_bytes", 10737418240)
        require(type(maximum) is int and maximum > 0, "Select a positive complete catalogue limit.")
        with zipfile.ZipFile(destination) as archive:
            entries = archive.infolist()
            require(sum(x.file_size for x in entries) <= maximum, "Complete expanded archive exceeds the receiving limit.")
            names = [x.filename for x in entries]
            require(len(names) == len(set(names)) and "manifest.json" in names, "Duplicate or missing archive members.")
            require(archive.getinfo("manifest.json").file_size <= 67108864, "Original manifest exceeds its native bound.")
            manifest_bytes = archive.read("manifest.json")
            manifest = json.loads(manifest_bytes)
            require(manifest.get("schema") == "tjl.catalogue.project-archive.v1" and
                    manifest.get("project_id") == self.project_id and
                    manifest.get("content_sha256") == receipt["manifest_sha256"],
                    "The actual downloaded manifest differs from the selected original export.")
            expected = {"manifest.json": {"bytes": len(manifest_bytes), "sha256": digest(manifest_bytes)}}
            for row in manifest["records"]:
                name = "records/" + row["kind"] + "/" + row["id"] + ".json"
                require(row["path"] == name and name not in expected, "Original record member binding differs.")
                expected[name] = {"bytes": row["bytes"], "sha256": row["sha256"]}
            for row in manifest["blobs"]:
                name = "blobs/" + row["sha256"]
                require(row["path"] == name and name not in expected, "Original blob member binding differs.")
                expected[name] = {"bytes": row["bytes"], "sha256": row["sha256"]}
            require(set(names) == set(expected), "Complete ZIP members differ from the frozen manifest.")
            for info in entries:
                name = info.filename
                safe = str(installation.relative(name))
                require(safe == name and not info.is_dir() and ((info.external_attr >> 16) & 0o170000) != 0o120000,
                        "An original archive member is not an ordinary bound file.")
                output = installation.within(extracted, extracted / safe)
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                temporary = output.with_name(output.name + ".receiving")
                sha, count = hashlib.sha256(), 0
                with archive.open(info) as source, temporary.open("wb") as target:
                    os.chmod(temporary, 0o600)
                    while True:
                        part = source.read(1048576)
                        if not part:
                            break
                        count += len(part)
                        require(count <= expected[name]["bytes"], "Expanded member exceeds its declared size.")
                        sha.update(part)
                        target.write(part)
                    target.flush()
                    os.fsync(target.fileno())
                require(count == expected[name]["bytes"] and sha.hexdigest() == expected[name]["sha256"],
                        "Complete original member differs: " + name)
                if output.exists():
                    require(self.file_identity(output) == expected[name], "Previously opened original member changed.")
                    temporary.unlink()
                else:
                    os.replace(temporary, output)
            for row in manifest.get("sources", []) + manifest.get("journals", []):
                blob = row["blob"]
                require(expected.get("blobs/" + blob["sha256"]) == {"bytes": blob["bytes"], "sha256": blob["sha256"]},
                        "Original source/media/journal reference is unbound.")
        result = {"archive": str(destination), **actual, "directory": str(extracted),
                  "manifest": manifest, "members": len(expected), "verified_at": now()}
        self.state["catalogue_download"] = result
        self.save()
        return result

    def transfer_selection(self):
        selection = self.request.get("handover")
        if selection is None:
            raise Waiting("Select complete original source/target handover configurations and the existing archive key.")
        require(isinstance(selection, dict), "Select the original handover configuration.")
        tool = Path(selection["tool"]).resolve()
        require(tool.is_file() and tool.name == "catalogue-project.php", "Select the complete native project tool.")
        key = Path(selection["key_file"]).resolve()
        require(key.is_file() and not key.is_symlink() and key.stat().st_size == 32 and key.stat().st_mode & 0o077 == 0,
                "Select the original private 32-byte archive key.")
        files = {}
        for role in ("source", "target"):
            row = selection[role]
            config_file = Path(row["configuration"]).resolve()
            config = read_json(config_file)
            require(config.get("schema") == "tjl.catalogue.native-project-config.v1", "Use the exact native handover configuration.")
            require(Path(row["work_directory"]).is_absolute(), "Use the original private transfer control directory.")
            require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{7,159}", row["operation_id"]),
                    "Use the original full-project operation identity.")
            for selected_root in [config["project_root"], *config.get("roots", {}).get("public", {}).values(),
                                  *config.get("roots", {}).get("private", {}).values()]:
                selected_root = Path(selected_root).resolve()
                require(not self.work.is_relative_to(selected_root) and not selected_root.is_relative_to(self.work),
                        "Receiving controls must remain outside every full native project/storage root.")
            files[role] = {"configuration": config, "sha256": digest(config_file.read_bytes())}
        source, target = files["source"]["configuration"], files["target"]["configuration"]
        require(Path(source["project_root"]).resolve() == self.root and source["php_executable"] == self.site["php"] and
                source["console"] == self.site.get("console", "bin/console") and source["environment"] == self.environment,
                "Native export must use the selected original project/PHP/console/environment.")
        require(Path(target["project_root"]).resolve() != self.root and target["site_key"] != source["site_key"],
                "Select the existing isolated target, distinct from the source.")
        require(selection["source"]["operation_id"] != selection["target"]["operation_id"] and
                Path(selection["source"]["work_directory"]).resolve() != Path(selection["target"]["work_directory"]).resolve(),
                "Source/target require separate original operations and controls.")
        binding = {"selection": selection, "configurations": files, "tool": self.file_identity(tool),
                   "key_sha256": self.file_identity(key)["sha256"]}
        retained = self.state.setdefault("handover", {})
        if "binding" in retained:
            require(retained["binding"] == binding, "Original complete handover bindings changed.")
        else:
            retained["binding"] = binding
            self.save()
        return selection, files

    def transfer(self, phase, role, expect=None, refresh=False):
        selection, files = self.transfer_selection()
        selected, config = selection[role], files[role]["configuration"]
        state = self.state["handover"]
        label = role + "-" + phase
        row = state.setdefault("phases", {}).setdefault(label, {"calls": []})
        if row.get("accepted") and not refresh:
            path = self.work / row["accepted"]["output"]
            require(self.file_identity(path) == row["accepted"]["identity"], "Original native transfer output changed.")
            return read_json(path)
        continuation = self.decisions.get("handover", {}).get("continue_request_id")
        if row.get("failed") and not row.get("pending"):
            require(isinstance(continuation, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,100}", continuation),
                    "Explicitly select a same-operation continuation ID after the observed failure.")
            require(continuation != row["failed"].get("continuation"),
                    "This native continuation returned attention; inspect its state before a following drive.")
        pending = row.get("pending")
        if pending is None:
            number = len(row["calls"]) + 1
            pending = {"command": "handover-" + label + "-%04d" % number,
                       "output": "handover-results/" + label + "-%04d.json" % number, "continuation": continuation}
            row["pending"] = pending
            self.save()
        output = self.work / pending["output"]
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        argv = [config["php_executable"], selection["tool"], "--phase=" + phase,
                "--configuration=" + selected["configuration"], "--work-directory=" + selected["work_directory"],
                "--operation-id=" + selected["operation_id"], "--output=" + str(output)]
        if phase in ("export", "review"):
            argv += ["--archive=" + selection["archive"], "--key-file=" + selection["key_file"]]
        if phase in ("receive", "recover", "reopen"):
            require(isinstance(expect, str) and re.fullmatch(r"[a-f0-9]{64}", expect), "Use the exact returned target review.")
            argv += ["--expect-target=" + expect, "--key-file=" + selection["key_file"]]
        native = self.command(pending["command"], argv, retry_failed=pending["command"] in self.retry_failed,
                              accepted_returncodes=(0, 1))
        require(output.is_file(), "Native transfer did not retain its complete original result.")
        result = read_json(output)
        require(result.get("schema") == "tjl.catalogue.native-project-result.v1" and
                result.get("phase") == phase and result.get("operation_id") == selected["operation_id"],
                "Native transfer output belongs to another original operation.")
        observed = {**pending, "identity": self.file_identity(output), "returncode": native["returncode"]}
        row["calls"].append(observed)
        row.pop("pending", None)
        if result.get("ok") is True and native["returncode"] == 0:
            row["accepted"] = observed
            row.pop("failed", None)
        else:
            row["failed"] = observed
        self.save()
        if row.get("failed"):
            raise Waiting("Original full native transfer needs attention; preserve its own command admission and result.", result)
        return result

    def target_action(self, label, action, data, refresh=False):
        _, configs = self.transfer_selection()
        target = configs["target"]["configuration"]
        original = (self.root, self.site, self.console, self.environment, self.actor)
        self.root = Path(target["project_root"]).resolve()
        self.site = {"php": target["php_executable"], "console": target["console"], "actor": original[4]}
        self.console = self.root / target["console"]
        self.environment = target["environment"]
        try:
            return self.action("target:" + label, action, data, refresh=refresh)
        finally:
            self.root, self.site, self.console, self.environment, self.actor = original

    def handover(self):
        selection, files = self.transfer_selection()
        state = self.state["handover"]
        self.transfer("inspect", "source")
        exported = self.transfer("export", "source")
        source = exported["result"]
        require(source.get("schema") == "tjl.catalogue.native-export.v1" and source.get("state") == "COMPLETE" and
                source.get("source") == source["manifest"]["source"], "Use the authenticated frozen source export.")
        archive = self.file_identity(selection["archive"])
        require(archive == {"bytes": source["bytes"], "sha256": source["sha256"]}, "Complete encrypted archive differs.")
        if "frozen_source" not in state:
            state["frozen_source"], state["source_manifest"], state["archive"] = source["source"], source["manifest"], archive
            self.save()
        require(state["frozen_source"] == source["source"] and state["source_manifest"] == source["manifest"],
                "The accepted full native source snapshot changed.")
        review = self.transfer("review", "target")
        native_review = review["result"]
        require(native_review.get("schema") == "tjl.catalogue.native-target-review.v1" and
                re.fullmatch(r"[a-f0-9]{64}", native_review.get("review_sha256", "")), "Target native review is incomplete.")
        decision = self.decide("handover:target", self.decisions.get("handover", {}).get("target"), consume=False)
        require(decision.get("review_sha256") == native_review["review_sha256"] and decision.get("receive_original_project") is True,
                "Explicitly approve the actual returned source/target/backup review.")
        self.decide("handover:target", decision)
        received = self.transfer("receive", "target", native_review["review_sha256"])
        reopened = self.transfer("reopen", "target", native_review["review_sha256"])
        for envelope in (received, reopened):
            value = envelope["result"]
            require(value.get("schema") == "tjl.catalogue.native-reopen.v1" and value.get("state") == "COMPLETE" and
                    value.get("source") == state["frozen_source"] and value.get("archive_sha256") == archive["sha256"] and
                    value.get("review_sha256") == native_review["review_sha256"],
                    "Independent reopen differs from the frozen archive or reviewed target.")
        actual = self.target_action("project", "project", {"project_id": self.project_id})
        require(actual["state"] == "COMPLETE" and actual["result"]["project"]["id"] == self.project_id and
                actual["result"]["project"]["selection"] == {k: self.request["project"][k] for k in ("identifiers", "locales", "channels")},
                "The actual restored catalogue project/selection differs.")
        imports = {row["id"]: row for row in actual["result"]["imports"]}
        for edition in self.state["editions"].values():
            for item in edition.get("imports", {}).values():
                require(item["id"] in imports and imports[item["id"]]["approval_id"] == item["approval"]["result"]["id"],
                        "An original import/approval identity did not reopen.")
        verified = []
        for descriptor in self.state["catalogue_download"]["manifest"]["records"]:
            if descriptor["kind"] not in ("review", "approval"):
                continue
            result = self.target_action("record:" + descriptor["kind"] + ":" + descriptor["id"], "record",
                                        {"project_id": self.project_id, "kind": descriptor["kind"], "id": descriptor["id"]})
            expected = read_json(Path(self.state["catalogue_download"]["directory"]) / descriptor["path"])
            require(result["state"] == "COMPLETE" and result["result"] == expected,
                    "An original immutable review/approval differs after complete receiving.")
            verified.append({"kind": descriptor["kind"], "id": descriptor["id"], "sha256": descriptor["sha256"]})
        state["catalogue_reopened"] = {"project": actual, "immutable_records": verified, "observed_at": now()}
        self.save()
        return state


    def recover_target(self):
        selection, _ = self.transfer_selection()
        state = self.state["handover"]
        review_row = state.get("phases", {}).get("target-review", {}).get("accepted")
        require(review_row is not None, "Recover only the original existing target review.")
        review_file = self.work / review_row["output"]
        require(self.file_identity(review_file) == review_row["identity"], "Original target review changed.")
        review = read_json(review_file)["result"]
        decision = self.decide("handover:recovery", self.decisions.get("handover", {}).get("recovery"), consume=False)
        require(decision.get("review_sha256") == review["review_sha256"] and
                decision.get("restore_original_target") is True and
                isinstance(decision.get("reason"), str) and decision["reason"].strip(),
                "Explicitly select restoring the reviewed original target backup and its reason.")
        self.decide("handover:recovery", decision)
        recovered = self.transfer("recover", "target", review["review_sha256"])
        require(recovered["result"].get("source") == review["target_backup"]["source"] and
                recovered["result"].get("state") == "COMPLETE", "Recovery did not reopen the exact original target backup.")
        state["recovery"] = recovered
        self.state["phase"] = "ORIGINAL_TARGET_RECOVERED"
        self.save()
        return self.state

    def run(self):
        require(not self.state.get("handover", {}).get("recovery"), "This original target was recovered. Preserve it; another transfer requires a separately reviewed native target operation.")
        if "catalogue_export" not in self.state:
            self.install_site("source")
            engine = self.action("engine", "engine", {})
            require(engine["state"] == "COMPLETE", "Native engine inspection is incomplete.")
            self.state["engine"] = engine
            project = self.action("project-create", "project-create", self.request["project"])
            require(project["state"] == "COMPLETE", "Original project creation is incomplete.")
            self.state["native_project"] = project
            self.save()
            for index, edition in enumerate(self.request["editions"]):
                self.edition(edition, index)
            export = self.action("export", "export", {"project_id": self.project_id})
            require(export["state"] == "COMPLETE", "The complete original catalogue export is not yet available.")
            self.state["catalogue_export"] = export
            self.catalogue_download(export)
            self.state["source_project"] = self.action("project-final", "project", {"project_id": self.project_id}, refresh=True)
            self.save()
        else:
            self.catalogue_download(self.state["catalogue_export"])
        self.install_site("target")
        self.handover()
        self.state["phase"] = "NATIVE_COMPLETE_AWAITING_VISUAL_REVIEW"
        self.state["handover_required"] = False
        self.state["rendered_inspection_required"] = True
        self.save()
        return self.state

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True)
    parser.add_argument("--work-directory", required=True)
    parser.add_argument("--phase", choices=["run", "status", "recover"], default="run")
    parser.add_argument("--decisions")
    parser.add_argument("--retry-failed", action="append", default=[])
    parser.add_argument("--output")
    args = parser.parse_args()
    work = Path(args.work_directory).resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (work / "receiving.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        course = Course(args.request, work, lock.fileno(), args.decisions, args.retry_failed)
        try:
            result = course.state if args.phase == "status" else (course.recover_target() if args.phase == "recover" else course.run())
        except Waiting as waiting:
            course.state["phase"] = "WAITING_NATIVE"
            course.state["attention"] = {"reason": waiting.reason, "result": waiting.result, "observed_at": now()}
            course.save()
            result = course.state
        if args.output:
            atomic(args.output, raw(result))
        print(json.dumps(result, ensure_ascii=False))
    return 0 if result["phase"] == "COMPLETE" else 2

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Attention, BlockingIOError) as error:
        print(json.dumps({"schema": SCHEMA, "state": "ATTENTION", "message": str(error)}), file=sys.stderr)
        raise SystemExit(2)
