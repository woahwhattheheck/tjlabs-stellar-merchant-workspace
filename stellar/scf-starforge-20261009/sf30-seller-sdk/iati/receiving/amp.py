#!/usr/bin/env python3
"""MIT. Receive one complete, original IATI-to-AMP programme and its next edition."""
from __future__ import annotations
import argparse
from copy import deepcopy
import fcntl
import hashlib
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import zipfile

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
from iati_workspace import IatiWorkspace
from iati_source import InputError
from amp.codec import loads, dumps, encode, fingerprint
from amp import domain
from amp.native import now
from amp_cli import credentials
from amp.portable import collect, read_packet

SCHEMA = "commons.iati-amp-programme-receiving.v1"
MAX_FILE = 256 * 1024 * 1024


def digest_file(path):
    value, size = hashlib.sha256(), 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            size += len(chunk); value.update(chunk)
    return {"bytes": size, "sha256": value.hexdigest()}


def atomic(path, value):
    temporary = path.with_name(path.name + ".new-" + str(os.getpid()))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(encode(value)); handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        if temporary.exists(): temporary.unlink()


def exact_source(base, item):
    if not isinstance(item, dict) or not {"path", "bytes", "sha256"} <= set(item):
        raise InputError("Every original input needs path, exact bytes and SHA256")
    if type(item["bytes"]) is not int or not 0 <= item["bytes"] <= MAX_FILE:
        raise InputError("Original input size must fit the native 256 MiB source limit")
    if not isinstance(item["sha256"], str) or not re.fullmatch("[a-f0-9]{64}", item["sha256"]):
        raise InputError("Original source SHA256 must be exact lowercase hexadecimal")
    original = Path(item["path"]).expanduser()
    if not original.is_absolute(): original = base / original
    original = original.absolute()
    info = original.lstat()
    if not stat.S_ISREG(info.st_mode) or original.is_symlink():
        raise InputError("Select a complete original regular source file")
    if digest_file(original) != {"bytes": item["bytes"], "sha256": item["sha256"]}:
        raise InputError("Original input changed: " + str(original))
    return original


def local_json(base, item):
    path = exact_source(base, item)
    if item["bytes"] > 64 * 1024 * 1024:
        raise InputError("Native JSON source exceeds 64 MiB")
    return loads(path.read_bytes())


class Programme:
    def __init__(self, case, manifest, manifest_path):
        self.root, self.manifest, self.base = case, manifest, manifest_path.parent
        self.state_file = case / "programme.json"
        self.manifest_sha = fingerprint(manifest)
        self.state = (loads(self.state_file.read_bytes()) if self.state_file.exists() else {
            "schema": SCHEMA, "operation": manifest["operation"], "manifestSha256": self.manifest_sha,
            "startedAt": now(), "status": "running", "stages": {}})
        if self.state.get("schema") != SCHEMA or self.state.get("manifestSha256") != self.manifest_sha:
            raise InputError("Continue the same original programme manifest in this case directory")
        self.inputs = case / "original-inputs"
        self.outputs = case / "outputs"
        for path in (self.inputs, self.outputs): path.mkdir(mode=0o700, exist_ok=True)
        atomic(case / "original-manifest.json", manifest)

    def request(self, name):
        return "amp-programme:" + fingerprint({"operation": self.manifest["operation"], "stage": name})

    def stage(self, name, selection, action):
        selected = fingerprint(selection)
        prior = self.state["stages"].get(name)
        if prior and prior["selectionSha256"] != selected:
            raise InputError("Original programme stage selection changed: " + name)
        if prior and prior["status"] == "complete":
            return prior["result"]
        self.state["stages"][name] = {"selectionSha256": selected, "status": "running",
                                      "startedAt": prior["startedAt"] if prior else now()}
        atomic(self.state_file, self.state)
        result = action()
        self.state["stages"][name].update({"status": "complete", "completedAt": now(), "result": result})
        atomic(self.state_file, self.state)
        return result

    def input(self, item):
        source = exact_source(self.base, item)
        destination = self.inputs / (item["sha256"] + "-" + source.name)
        if destination.exists():
            if digest_file(destination) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
                raise InputError("Retained original input changed")
        else:
            with source.open("rb") as incoming, destination.open("xb") as outgoing:
                destination.chmod(0o600)
                shutil.copyfileobj(incoming, outgoing, 65536); outgoing.flush(); os.fsync(outgoing.fileno())
            if digest_file(destination) != {"sha256": item["sha256"], "bytes": item["bytes"]}:
                raise InputError("Original input changed during capture")
        return destination

    def source(self, ws, name, item):
        path = self.input(item)
        def retain():
            with path.open("rb") as stream:
                result = ws.add_source(stream, label=item.get("label", path.name), name=path.name)
            return {"id": result["id"], **digest_file(path)}
        return self.stage(name, item, retain)

    def capture(self, ws, name, selected, secret):
        if "input" in selected:
            path = self.input(selected["input"])
            raw = {"requestId": self.request(name), "actor": self.manifest["operator"],
                   "capture": loads(path.read_bytes())}
            return self.stage(name, {"input": selected["input"]}, lambda: ws.amp.retain_capture(raw))
        if set(selected) != {"connection", "projectIds", "coverageNote", "name"}:
            raise InputError("Native capture needs exact connection, projectIds, coverageNote and name")
        raw = {"requestId": self.request(name), "actor": self.manifest["operator"], **selected}
        return self.stage(name, selected, lambda: ws.amp.native_capture(raw, secret))

    def archive(self, ws, plan, name):
        destination = self.outputs / (name + ".zip")
        selection = {"id": plan["id"], "revision": plan["revision"],
                     "recordSha256": plan["recordSha256"]}
        def export():
            if destination.exists():
                # An export can finish before its case checkpoint. Recover that exact whole ZIP.
                with ws.scratch() as temporary:
                    read_packet(destination, temporary)
                    retained = loads((temporary / "amp-workspace.json").read_bytes())
                if retained["selection"] != selection:
                    raise InputError("Existing archive belongs to a different original plan")
                return {"path": str(destination), **digest_file(destination), "selection": selection}
            ws.amp.export(plan["id"], destination, plan["revision"])
            return {"path": str(destination), **digest_file(destination), "selection": selection}
        result = self.stage(name + ":export", selection, export)
        if digest_file(Path(result["path"])) != {"bytes": result["bytes"], "sha256": result["sha256"]}:
            raise InputError("Complete original programme archive changed")
        return result

    def independent_receive(self, original, plan, archive, name):
        received_dir = self.root / (name + "-received-workspace")
        selected = {"archive": archive["sha256"], "selection": {
            "id": plan["id"], "revision": plan["revision"], "recordSha256": plan["recordSha256"]}}
        def receive():
            with IatiWorkspace(received_dir, create=not received_dir.exists()) as receiver:
                result = receiver.amp.receive(Path(archive["path"]))
                reopened = receiver.amp.plan(plan["id"], plan["revision"])
                before = collect(original.amp, plan)
                after = collect(receiver.amp, reopened)
                if fingerprint(before) != fingerprint(after):
                    raise InputError("Independent receive changed original plans, requests, assets or native history")
                reexport = self.outputs / (name + "-received.zip")
                if not reexport.exists():
                    receiver.amp.export(reopened["id"], reexport, reopened["revision"])
                return {"workspace": str(received_dir), "selection": result["selection"],
                        "retainedHistorySha256": fingerprint(after),
                        "reexport": {"path": str(reexport), **digest_file(reexport)}}
        result = self.stage(name + ":independent-receive", selected, receive)
        # Actual reopening on every invocation keeps the case linked to its original received database.
        with IatiWorkspace(Path(result["workspace"])) as receiver:
            reopened = receiver.amp.plan(plan["id"], plan["revision"])
            if reopened["recordSha256"] != plan["recordSha256"]:
                raise InputError("The independently received programme changed")
        return result

    def run(self, secret):
        original_dir = self.root / "workspace"
        previous = None
        result_editions = []
        with IatiWorkspace(original_dir, create=not original_dir.exists()) as ws:
            for number, edition in enumerate(self.manifest["editions"], 1):
                prefix = "edition-" + str(number)
                sources = [self.source(ws, prefix + ":source:" + str(i), item)["id"]
                           for i, item in enumerate(edition["sources"])]
                portfolio_request = {"requestId": self.request(prefix + ":portfolio"),
                    "name": edition["name"], "notes": edition.get("notes", ""),
                    "sources": sources, "selection": edition.get("selection", {}),
                    "review": {"status": "reviewed", "reviewer": self.manifest["operator"],
                               "note": edition["sourceReview"]}}
                def save_portfolio():
                    value = ws.save_portfolio(portfolio_request)
                    return {"id": value["id"], "revision": value["revision"]}
                portfolio = self.stage(prefix + ":portfolio", portfolio_request, save_portfolio)
                captured = self.capture(ws, prefix + ":capture", edition["capture"], secret)
                mapping_path = self.input(edition["mapping"])
                mapping = loads(mapping_path.read_bytes())
                native_selection = {"id": portfolio["id"], "revision": portfolio["revision"]}
                if previous:
                    raw = {"requestId": self.request(prefix + ":advance"), "id": previous["id"],
                           "revision": previous["revision"], "portfolio": native_selection,
                           "captureId": captured["captureId"], "name": edition["name"],
                           "actor": self.manifest["operator"], "notes": edition.get("notes", ""),
                           "correspondence": edition.get("correspondence", [])}
                    continued = self.stage(prefix + ":advance", raw, lambda: ws.amp.advance(raw))
                    old = ws.amp.plan(continued["id"], continued["revision"])
                    # Full explicit mapping supplied by the operator follows the actual native carry.
                    definition = deepcopy(old["definition"])
                    for key in ("previousPlan", "correspondence"):
                        if key in mapping and mapping[key] != definition[key]:
                            raise InputError("Keep the actual preceding edition and its explicit correspondence")
                    definition.update(mapping)
                    expected = {"id": old["id"], "expectedRevision": old["revision"]}
                else:
                    definition, expected = deepcopy(mapping), {}
                for key, actual in (("portfolio", native_selection), ("captureId", captured["captureId"])):
                    if key in mapping and mapping[key] != actual:
                        raise InputError("Original mapping selected a different " + key)
                    definition[key] = actual
                definition.setdefault("name", edition["name"])
                definition.setdefault("notes", edition.get("notes", ""))
                raw = {"requestId": self.request(prefix + ":plan"), "actor": self.manifest["operator"],
                       "definition": definition, **expected}
                saved = self.stage(prefix + ":plan", raw, lambda: ws.amp.save(raw))
                plan = ws.amp.plan(saved["id"], saved["revision"])
                # Every bulk action is against the entire actual source selection and its original SHA.
                for index, decision in enumerate(edition.get("decisions", [])):
                    selected = {"id": plan["id"], "revision": plan["revision"],
                                "selection": decision["selection"]}
                    preview = ws.amp.decision_preview(selected)
                    action = {"requestId": self.request(prefix + ":decisions:" + str(index)),
                              "id": plan["id"], "expectedRevision": plan["revision"],
                              "actor": self.manifest["operator"], "selection": decision["selection"],
                              "selectedSha256": preview["selectedSha256"], "decision": decision["decision"]}
                    updated = self.stage(prefix + ":decisions:" + str(index), action,
                                         lambda: ws.amp.apply_decisions(action))
                    plan = ws.amp.plan(updated["id"], updated["revision"])
                review = {"requestId": self.request(prefix + ":review"), "id": plan["id"],
                          "expectedRevision": plan["revision"], "analysisSha256": plan["analysis"]["sha256"],
                          "actor": edition["review"]["actor"], "decision": "approve",
                          "note": edition["review"]["note"]}
                reviewed = self.stage(prefix + ":review", review, lambda: ws.amp.review(review))
                prepare = {"requestId": self.request(prefix + ":prepare"), "id": plan["id"],
                           "expectedRevision": reviewed["revision"], "actor": self.manifest["operator"]}
                prepared = self.stage(prefix + ":prepare", prepare, lambda: ws.amp.prepare(prepare))
                plan = ws.amp.plan(prepared["id"], prepared["revision"])
                native_run = None
                if edition["submitNative"]:
                    start = {"requestId": self.request(prefix + ":native-start"), "id": plan["id"],
                             "expectedRevision": plan["revision"], "actor": self.manifest["operator"],
                             "preparedSha256": plan["prepared"]["sha256"]}
                    original = self.stage(prefix + ":native-start", start, lambda: ws.amp.start_run(start))
                    # Execute only the retained original run. Its native journal governs every write.
                    native_run = ws.amp.execute(original["runId"], secret)
                    if native_run["state"] != "complete":
                        self.state["status"] = "native-" + native_run["state"]
                        self.state["nativeRun"] = {"id": native_run["id"], "state": native_run["state"]}
                        atomic(self.state_file, self.state)
                        raise InputError("Continue original native run " + native_run["id"] +
                                         " from state " + native_run["state"])
                archive = self.archive(ws, plan, prefix)
                received = self.independent_receive(ws, plan, archive, prefix)
                result_editions.append({"edition": number, "portfolio": native_selection,
                    "captureId": captured["captureId"], "plan": {
                        "id": plan["id"], "revision": plan["revision"], "recordSha256": plan["recordSha256"]},
                    "nativeRun": {"id": native_run["id"], "state": native_run["state"], "projectCount": native_run["projectCount"]} if native_run else None,
                    "archive": archive, "independentReceiving": received})
                previous = plan
            self.state.update({"status": "complete", "completedAt": now(),
                "editions": result_editions, "workspace": str(original_dir),
                "nativeWriteEditions": sum(bool(x["nativeRun"] and x["nativeRun"]["projectCount"]) for x in result_editions)})
            atomic(self.state_file, self.state)
            return self.state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--case-directory", required=True)
    parser.add_argument("--credentials-file")
    args = parser.parse_args()
    manifest_path = Path(args.manifest).expanduser().absolute()
    manifest = loads(manifest_path.read_bytes())
    if (not isinstance(manifest, dict) or manifest.get("schema") != SCHEMA
            or not isinstance(manifest.get("operation"), str) or not manifest["operation"]
            or not isinstance(manifest.get("operator"), str) or not manifest["operator"]
            or not isinstance(manifest.get("editions"), list) or not 1 <= len(manifest["editions"]) <= 32):
        raise InputError("Choose the original named programme with 1–32 complete publisher editions")
    for edition in manifest["editions"]:
        required = {"name", "sources", "sourceReview", "capture", "mapping", "review", "submitNative"}
        if (not isinstance(edition, dict) or not required <= set(edition)
                or type(edition["submitNative"]) is not bool or not isinstance(edition["sources"], list)
                or not 1 <= len(edition["sources"]) <= 32 or not edition["sourceReview"]
                or set(edition["review"]) != {"actor", "note"}
                or not all(isinstance(edition["review"][k], str) and edition["review"][k] for k in ("actor", "note"))):
            raise InputError("Each edition needs complete sources, explicit native-write choice and named source/mapping reviews")
    case = Path(args.case_directory).expanduser().absolute()
    case.mkdir(mode=0o700, parents=True, exist_ok=True)
    if case.is_symlink() or stat.S_IMODE(case.stat().st_mode) & 0o077:
        raise InputError("Use the original private case directory")
    lock = os.open(case / "programme.lock", os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    secret = {}
    try:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: raise InputError("The original programme is already running in this case directory")
        requires_native = any("input" not in e["capture"] or e["submitNative"] for e in manifest["editions"])
        if requires_native: secret = credentials(args)
        operation = Programme(case, manifest, manifest_path)
        try:
            result = operation.run(secret)
            print(dumps({"schema": SCHEMA, "operation": result["operation"], "status": result["status"],
                         "workspace": result["workspace"], "editions": result["editions"],
                         "nativeWriteEditions": result["nativeWriteEditions"]}), flush=True)
        except Exception as error:
            operation.state.update({"status": operation.state.get("status") if
                operation.state.get("status", "").startswith("native-") else "needs-attention",
                "updatedAt": now(), "error": str(error)})
            atomic(operation.state_file, operation.state)
            raise
    finally:
        secret.clear(); os.close(lock)


if __name__ == "__main__":
    try: main()
    except (InputError, OSError, ValueError) as error:
        print(dumps({"schema": SCHEMA, "status": "needs-attention", "error": str(error)}), file=sys.stderr)
        raise SystemExit(2)
