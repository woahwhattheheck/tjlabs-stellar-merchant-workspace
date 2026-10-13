#!/usr/bin/env python3
"""Prepare an actual proposed commercial Workshare case through the original engines.

One retained operation receives the exact authored source selection, runs SF49
source preparation, saves the commercial plan through Workspace, attaches full
originals through Operations, and exports the complete original case. It records
no agreement, invoice, cash, work acceptance or paid purchase.
"""
from __future__ import annotations
import sys
sys.dont_write_bytecode = True
import argparse
import base64
from copy import deepcopy
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import tempfile

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from model import Workspace, canonical, digest, now, prepare
from operations import Operations
import operations_installations as installations
import operations_workshare_installations as workshares
from operations_installation_research import profile

SCHEMA = "stellar-forge.commercial-workshare-case-preparation.v1"
MAX_INPUT = 8 * 1024 * 1024


def need(value, message):
    if not value:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def raw_json(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def read(path, maximum=MAX_INPUT):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, "Use an absolute original path without symbolic-link ancestors.")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "Retain a complete regular source within its bound.")
        chunks, size = [], 0
        while True:
            chunk = os.read(fd, min(65536, maximum + 1 - size))
            if not chunk:
                break
            size += len(chunk)
            need(size <= maximum, "The selected complete source exceeds its bound.")
            chunks.append(chunk)
        after, named = os.fstat(fd), path.lstat()
        keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        need(all(getattr(before, k) == getattr(after, k) for k in keys)
             and (named.st_dev, named.st_ino) == (after.st_dev, after.st_ino) and size == after.st_size,
             "The original source changed while receiving.")
        return b"".join(chunks)
    finally:
        os.close(fd)


def sync(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private(path):
    path = Path(os.path.abspath(path))
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
         and not info.st_mode & 0o077, "Use one owned private directory without symlinks.")
    sync(path.parent)
    return path


def retain(path, raw):
    path = Path(path)
    if path.exists():
        need(read(path, max(MAX_INPUT, len(raw))) == raw, "Retained original bytes differ: " + str(path))
    else:
        fd, temporary = tempfile.mkstemp(prefix=".commercial-stage-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(raw); out.flush(); os.fsync(out.fileno())
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(read(path, max(MAX_INPUT, len(raw))) == raw, "A concurrent original output differs.")
            sync(path.parent)
        finally:
            os.unlink(temporary)
    return {"path": str(path), "name": path.name, "bytes": len(raw), "sha256": sha(raw)}


def selected_file(value):
    need(isinstance(value, dict) and set(value) == {"path", "sha256"}, "Select the complete original file path and SHA256.")
    need(isinstance(value["sha256"], str) and re.fullmatch("[a-f0-9]{64}", value["sha256"]), "Retain a complete original SHA256.")
    raw = read(Path(value["path"]))
    need(sha(raw) == value["sha256"], "The selected original file differs.")
    return raw


def load_source_preparation():
    path = HERE.parents[1] / "sf49_data_commissioning" / "installation-workorders" / "source-inputs.py"
    original = read(path)
    spec = importlib.util.spec_from_file_location("original_commercial_source_preparation", path)
    need(spec and spec.loader, "Receive the complete existing SF49 source preparation.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    need(read(path) == original, "The original SF49 source changed during import.")
    return module, {"path": str(path), "bytes": len(original), "sha256": sha(original)}


def run(config):
    need(isinstance(config, dict) and set(config) == {
        "schema", "operation", "directory", "actor", "name", "inputDirectory",
        "sourceSelection", "planningSource", "planningSettings", "documentSelections"},
        "Use the complete commercial case preparation configuration.")
    need(config["schema"] == SCHEMA and isinstance(config["operation"], str)
         and re.fullmatch("[A-Za-z0-9_-]{1,60}", config["operation"]), "Retain the original preparation operation.")
    for key in ("actor", "name"):
        need(isinstance(config[key], str) and 0 < len(config[key].strip()) <= 200, "Select the actual " + key + ".")
    directory = private(config["directory"])
    fd = os.open(directory / "commercial-preparation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    workspace = None
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1
             and not info.st_mode & 0o077, "Retain the original private native preparation lease.")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        retain(directory / "CONFIGURATION.json", raw_json(config))
        receipt_path = directory / "PREPARED_COMMERCIAL_CASE.json"
        if receipt_path.exists():
            receipt = json.loads(read(receipt_path))
            need(receipt["schema"] == SCHEMA and receipt["configurationSha256"] == digest(config),
                 "Reopen the same complete original preparation.")
            for item in receipt["outputs"]:
                body = read(Path(item["path"]), 2 * 1024 * 1024 * 1024)
                need(len(body) == item["bytes"] and sha(body) == item["sha256"], "A complete original prepared output differs.")
            return receipt
        inputs = private(directory / "inputs")
        source_selection = selected_file(config["sourceSelection"])
        scenario_raw = selected_file(config["planningSource"])
        planning_raw = selected_file(config["planningSettings"])
        for name, raw in (("source-selection.json", source_selection), ("planning-source.json", scenario_raw),
                          ("planning-settings.json", planning_raw)):
            retain(inputs / name, raw)
        scenario, planning, selection = map(json.loads, (scenario_raw, planning_raw, source_selection))
        need(scenario.get("funding_mode") == "COMMERCIAL_WORKSHARE" and scenario.get("status") == "PROPOSED_UNSIGNED",
             "Prepare the actual fee-funded unsigned proposal, not a grant or asserted agreement.")
        need(planning.get("calendarStart") is None, "This original proposed case has no agreed calendar kickoff.")
        need(isinstance(selection.get("cases"), list) and len(selection["cases"]) == 1,
             "Prepare one original complete Workshare case in this operation.")
        original_case = selection["cases"][0]
        original_plan = scenario["commercial"]["workshare"]
        need(original_case["caseId"] == original_plan["case_id"]
             and original_case["planSha256"] == original_plan["plan_sha256"],
             "The native planning source and complete Workshare select the same original plan.")
        module, source_module = load_source_preparation()
        input_directory = Path(config["inputDirectory"])
        need(input_directory.is_absolute() and input_directory.resolve() == input_directory
             and input_directory.is_dir(), "Retain the selected complete input directory without symlinks.")
        prepared = module.prepare(inputs / "source-selection.json", input_directory,
                                  directory / "source-preparation")
        original_commissioning = json.loads(read(directory / "source-preparation" / "Supplier_Workshare_Commissioning.json"))
        need(original_commissioning["cases"][0]["workshare_input"]["plan"] == original_plan["plan"],
             "The complete native Workshare source and native proposal model differ.")
        quoted_document = original_plan["document_sha256"]
        need(any(item["sha256"] == quoted_document for item in prepared["outputs"]),
             "Retain the complete original quoted document behind the structured Workshare.")
        requests, outcomes = private(directory / "requests"), private(directory / "outcomes")
        def step(name, payload, action):
            request = requests / (name + ".json")
            retain(request, raw_json(payload))
            result_path = outcomes / (name + ".json")
            if result_path.exists():
                return json.loads(read(result_path))
            result = action(payload)
            retain(result_path, raw_json(result))
            return result
        workspace = Workspace(directory / "workspace", inputs / "planning-source.json")
        rows = workspace.list()
        need(len(rows) == 1, "Preserve this operation's one native commercial planning source.")
        baseline = workspace.read(rows[0]["id"], 1)
        normalized_source, _, _ = prepare(scenario, {})
        need(baseline["source"]["sha256"] == sha(scenario_raw) and baseline["scenario"] == normalized_source,
             "The actual saved native planning source differs from the selected proposal.")
        plan = step("plan-settings", {"planId": baseline["id"], "expectedRevision": 1,
             "patch": {}, "planning": planning, "note": "Original proposed Workshare; explicit planning assumptions, no acceptance or payment.",
             "requestId": config["operation"] + "-settings"},
             lambda p: workspace.save(p["planId"], p["expectedRevision"], p["patch"], p["planning"], p["note"], p["requestId"]))
        operations = Operations(workspace)
        created = step("case-create", {"requestId": config["operation"] + "-case", "actor": config["actor"],
             "name": config["name"], "mode": "OPERATIONS", "planId": plan["id"],
             "selectedRevision": plan["revision"], "expectedContentSha256": plan["contentSha256"], "calendarStart": None},
             operations.create)
        case_id = created["id"]
        attached = {}
        originals = list(prepared["outputs"]) + [{
             "filename": "SOURCE_PREPARATION.json",
             "bytes": prepared["output"]["bytes"], "sha256": prepared["output"]["sha256"]}]
        for index, item in enumerate(originals):
            raw = read(directory / "source-preparation" / item["filename"])
            need(len(raw) == item["bytes"] and sha(raw) == item["sha256"], "Retain each complete prepared original.")
            name = "source-" + str(index + 1).zfill(3)
            request_path = requests / (name + ".json")
            if request_path.exists():
                body = json.loads(read(request_path))
            else:
                body = {"requestId": config["operation"] + "-" + name,
                    "expectedVersion": operations._context(case_id)["program"]["version"],
                    "actor": config["actor"], "action": "source.add",
                    "note": "Complete original proposed Workshare source; no acceptance or payment.",
                    "data": {"filename": item["filename"], "contentBase64": base64.b64encode(raw).decode(),
                             "mediaType": "text/markdown" if item["filename"].endswith(".md") else "application/json",
                             "kind": "other", "sourceUrl": selection["sourceUrl"], "observedAt": selection["observedAt"]}}
            result = step(name, body, lambda p: operations.command(case_id, p))
            metadata, actual = operations.source(case_id, result["recordId"])
            need(actual == raw and metadata["sha256"] == item["sha256"], "The native original attachment differs.")
            attached[item["filename"]] = metadata
        context = operations._context(case_id)
        need(all(not context["records"][kind] for kind in ("work", "invoices", "cash", "awards", "purchases", "outcomes")),
             "Proposal preparation must not create business acceptance or money records.")
        source, packet = attached["Supplier_Workshare_Commissioning.json"], attached["Supplier_Complete_Receiving_Packets.json"]
        workshare_selection = {"expectedVersion": context["program"]["version"],
              "sourceId": source["id"], "expectedSourceSha256": source["sha256"],
              "packetSourceId": packet["id"], "expectedPacketSha256": packet["sha256"],
              "workshareCaseId": original_case["caseId"], "installationId": None, "expectedRevision": 0}
        seed = workshares.seed(operations, context, workshare_selection)
        document = deepcopy(seed["document"])
        technical = profile()["profile"]
        for section in ("task", "source", "receiving"):
            for key, value in technical[section].items():
                if key in document[section] and not document[section][key]:
                    document[section][key] = deepcopy(value)
        if document["source"]["mode"] == "UNSELECTED":
            document["source"]["mode"] = "SNAPSHOT"
        edits = config["documentSelections"]
        need(isinstance(edits, dict) and set(edits) <= {"task", "source", "receiving", "payment"},
             "Keep Workshare terms, phase acceptance, assignments and actual deployments unchanged.")
        for section, values in edits.items():
            need(isinstance(values, dict) and set(values) <= set(document[section])
                 and not set(values) & {"sourceIds", "termsSourceIds"},
                 "Use declared explicit original document selections, preserving native source bindings.")
            document[section].update(deepcopy(values))
        document = installations.normalized(context, document)
        workshares.verify_document(operations, context, document)
        need(document["stage"] == "PLANNED" and all(c["state"] == "OPEN" for c in document["checks"]),
             "Keep original proposal and all acceptance phases open.")
        preview = installations.preview(operations, context, {"expectedVersion": context["program"]["version"],
                 "installationId": None, "expectedRevision": 0, "document": document})
        outputs = [retain(directory / "ORIGINAL_WORKSHARE_SEED.json", raw_json(seed)),
                   retain(directory / "PROPOSED_INSTALLATION_DOCUMENT.json", raw_json(document)),
                   retain(directory / "PROPOSED_INSTALLATION_PREVIEW.json", raw_json(preview)),
                   retain(directory / "SOURCE_ATTACHMENTS.json", raw_json(attached))]
        archive_path = directory / "Proposed_Operations_Case.zip"
        if archive_path.exists():
            archive_raw = read(archive_path, 2 * 1024 * 1024 * 1024)
        else:
            archive_raw = operations.export(case_id)
        archive_document, archive_members = operations._unpack(archive_raw)
        need(archive_document["program"]["id"] == case_id
             and archive_document["program"]["version"] == context["program"]["version"],
             "Retain the actual original exported case edition.")
        need({x["id"]: x["sha256"] for x in archive_document["sources"]} ==
             {x["id"]: x["sha256"] for x in attached.values()},
             "The complete case export must retain every original source.")
        outputs.append(retain(archive_path, archive_raw))
        scenario_record = retain(directory / "NATIVE_COMMERCIAL_PLAN.json", raw_json(plan))
        outputs.append(scenario_record)
        result = {"schema": SCHEMA, "status": "PREPARED_PROPOSED_CASE", "operation": config["operation"],
            "configurationSha256": digest(config), "createdAt": now(), "sourcePreparation": prepared,
            "sourceModule": source_module, "workspace": str(workspace.root), "planId": plan["id"],
            "planRevision": plan["revision"], "caseId": case_id, "caseVersion": context["program"]["version"],
            "caseArchive": outputs[-2], "workshareCaseId": original_case["caseId"],
            "workshareSelection": {k: workshare_selection[k] for k in
                ("sourceId", "expectedSourceSha256", "packetSourceId", "expectedPacketSha256")},
            "document": document, "outputs": outputs,
            "qualification": "Complete native proposed case and source inputs only. Installation remains unsaved; no agreement, acceptance, payment or grant is asserted. Continue the existing Research Installation course with the actual retained Research files and explicit source-use decisions."}
        retain(receipt_path, raw_json(result))
        return result
    finally:
        if workspace is not None:
            workspace.close()
        os.close(fd)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", help="One complete private JSON preparation configuration")
    args = parser.parse_args()
    configuration = json.loads(read(Path(args.config).resolve()))
    print(json.dumps(run(configuration), ensure_ascii=False, allow_nan=False))
