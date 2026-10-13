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

    def action(self, label, action, input_value, refresh=False):
        operation = self.action_id(label)
        binding = {"action": action, "input": input_value, "operation_id": operation, "actor": self.actor,
                   "project_root": str(self.root), "environment": self.environment}
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
        call = pending or {"number": number, "command": "action-" + self.action_id(label) + "-%04d" % number,
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

    def decide(self, label, offered):
        retained = self.state["decisions"].get(label)
        if retained is not None:
            if offered is not None:
                require(retained["value"] == offered, "A consumed original decision cannot be replaced.")
            return retained["value"]
        if offered is None:
            raise Waiting("Awaiting explicit current native review decision: " + label)
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
        selected = self.decide("installation:" + key, offered)
        require(selected.get("review_sha256") == state["review"]["review_sha256"], "Select the exact returned native installation review.")
        output = self.work / ("installation-" + key + "-result.json")
        argv = [sys.executable, str(MODULE_PATH), "apply", "--request", str(original_request),
                "--work-directory", str(original_work), "--expect-review", selected["review_sha256"], "--output", str(output)]
        self.command("installation-" + key + "-apply", argv,
                     retry_failed="installation-" + key + "-apply" in self.retry_failed)
        result = read_json(output)
        require(result.get("phase") == "COMPLETE", "Original native installation is incomplete.")
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
        self.decide("worker:" + edition_name + ":" + drive, decision)
        require(decision.get("authority") == selected.get("authority") and decision.get("owner") == selected.get("owner"),
                "The actual worker owner and scoped command authority are required.")
        argv = selected.get("argv")
        require(isinstance(argv, list) and argv and all(isinstance(x, str) and x for x in argv), "Select actual original bounded worker argv.")
        label = "worker-" + self.action_id(edition_name + ":" + drive)
        self.command(label, argv, retry_failed=label in self.retry_failed)

    def edition(self, edition, index):
        name = edition["edition_id"]
        selected = self.decisions.get("editions", {}).get(name, {})
        if index:
            begin = self.decide("advance:" + name, selected.get("begin"))
            require(begin.get("capture_id") == edition["capture_id"] and begin.get("receive_current_source") is True,
                    "Explicitly select the following native source edition. No upstream data is generated by this course.")
        value = self.cohort(edition)
        reviewed = {}
        for row in value["rows"]:
            identifier = row["identifier"]
            native_state = row["source"]["state"]
            require(native_state in ("PRESENT", "MISSING"), "The current source item needs original native attention.")
            kind = "missing-review" if native_state == "MISSING" else "review"
            label = "review:" + name + ":" + identifier
            review = self.action(label, kind, {"project_id": self.project_id, "capture_id": edition["capture_id"], "identifier": identifier})
            require(review["state"] == "COMPLETE", "Original native review is incomplete.")
            reviewed[identifier] = review
        value["reviews"] = reviewed
        self.save()
        missing_decisions = []
        for identifier, envelope in reviewed.items():
            review = envelope["result"]
            decision = selected.get("items", {}).get(identifier)
            if decision is None and "item:" + name + ":" + identifier not in self.state["decisions"]:
                missing_decisions.append(identifier)
        if missing_decisions:
            raise Waiting("Read the full actual source/native reviews and select each item explicitly.", {"identifiers": missing_decisions, "reviews": reviewed})
        imports = value.setdefault("imports", {})
        for identifier, envelope in reviewed.items():
            review = envelope["result"]
            decision = self.decide("item:" + name + ":" + identifier, selected.get("items", {}).get(identifier))
            require(decision.get("review_id") == review["id"] and decision.get("review_sha256") == review["sha256"],
                    "Decision must bind the exact observed native review for " + identifier)
            choice = decision.get("choice")
            if choice == "keep":
                continue
            if review["kind"] == "MISSING":
                require(choice == "disable", "Choose explicit keep or bounded selected missing disable.")
                action_input = {"project_id": self.project_id, "review_id": review["id"], "review_sha256": review["sha256"],
                                "confirm_selected_disable": decision.get("confirm_selected_disable"),
                                "acknowledge_access_boundary": decision.get("acknowledge_access_boundary"),
                                "disable_parent_if_no_enabled_variants": decision.get("disable_parent_if_no_enabled_variants", False)}
                result = self.action("missing:" + name + ":" + identifier, "missing-apply", action_input)
                require(result["state"] == "COMPLETE", "Original bounded missing operation is incomplete.")
                value.setdefault("missing", {})[identifier] = result
                continue
            require(choice == "import" and decision.get("approve_native_mapping") is True, "Explicitly select the installed mapping and rules.")
            approved = self.action("approve:" + name + ":" + identifier, "approve",
                                   {"project_id": self.project_id, "review_id": review["id"], "review_sha256": review["sha256"],
                                    "approve_native_mapping": True, "rules": decision.get("rules", [])})
            require(approved["state"] == "COMPLETE", "Native approval is incomplete.")
            import_id = self.action_id("native-import:" + name + ":" + identifier)
            if identifier not in imports:
                dispatched = self.action("dispatch:" + name + ":" + identifier, "dispatch",
                                         {"project_id": self.project_id, "approval_id": approved["result"]["id"], "import_operation_id": import_id})
                imports[identifier] = {"id": import_id, "approval": approved, "dispatch": dispatched}
                self.save()
            # Dispatch's original acknowledgement can be WAITING. Read current
            # operation state; this path never redispatches a known acknowledgement.
        self.drive_worker(name)
        pending = []
        for identifier, item in imports.items():
            retry = selected.get("retries", {}).get(identifier)
            if retry:
                retry_id = str(retry.get("request_id", ""))
                require(re.fullmatch(r"[A-Za-z0-9._-]{1,80}", retry_id), "Select one original retry request identity.")
                self.decide("retry:" + name + ":" + identifier + ":" + retry_id, retry)
                require(retry.get("import_operation_id") == item["id"] and retry.get("preserve_original_approval") is True,
                        "Retry only the original retained import and approval.")
                self.action("retry:" + name + ":" + identifier + ":" + retry_id, "retry",
                            {"project_id": self.project_id, "import_operation_id": item["id"], "preserve_original_approval": True})
            result = self.action("status:" + name + ":" + identifier, "operation",
                                 {"project_id": self.project_id, "import_operation_id": item["id"]}, refresh=True)
            item["current"] = result
            if result["state"] != "COMPLETE" or result["result"].get("state") != "COMPLETE":
                pending.append({"identifier": identifier, "import_operation_id": item["id"], "result": result})
        self.save()
        if pending:
            raise Waiting("Await the original native Messenger results/media outcomes; queue admission is not item completion.", pending)
        value["state"] = "COMPLETE"
        value["completed_at"] = value.get("completed_at", now())
        self.save()
        return value

    def run(self):
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
        self.state["source_project"] = self.action("project-final", "project", {"project_id": self.project_id}, refresh=True)
        self.save()
        self.install_site("target")
        # Full native SQL/vendor/public/private/source/queue transfer is composed
        # by the same programme's handover adapter, using explicit real controls.
        self.state["phase"] = "NATIVE_CATALOGUE_COMPLETE"
        self.state["handover_required"] = True
        self.state["rendered_inspection_required"] = True
        self.save()
        return self.state

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", required=True)
    parser.add_argument("--work-directory", required=True)
    parser.add_argument("--phase", choices=["run", "status"], default="run")
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
            result = course.state if args.phase == "status" else course.run()
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
