#!/usr/bin/env python3
"""Run a new nonpaying reviewer journey from the exact recovered original purchase."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone

from RECOVER_REQUIRED_SOURCE import (
    HERE, INDEX_SHA256, SELECTION_SHA256, RecoveryError, atomic, digest,
    emit, encode, exact, lease, load_packet, parents, read_regular, verify_source,
)

REQUIREMENTS_SHA256 = "560abeb5d64c487993fa99781e30f09d4afc17e1d30fc41c69ad6cc924d265c5"
HISTORICAL_RUN = "9611199b-4793-400b-a85d-f1efcc3ba1e7"
STAGES = (
    {"name": "workbench", "script": "stellar/scf_2026/presentation/reviewer/WORKBENCH_RECEIVING.mjs",
     "result": "WORKBENCH-RESULT.json", "schema": "stellar-forge.grant-reviewer-receiving-result.v1", "phases": 14,
     "closed": ("ownedBrowserClosed", "ownedWorkbenchesClosed")},
    {"name": "merchant", "script": "stellar/scf_2026/presentation/reviewer/merchant/RECEIVING.mjs",
     "result": "merchant-client/MERCHANT-RESULT.json", "schema": "stellar-forge.grant-reviewer-merchant-receiving-result.v1", "phases": 12,
     "closed": ("ownedMerchantClosed", "ownedWorkbenchesClosed")},
    {"name": "console", "script": "stellar-forge/mcp-merchant-operator/console/REVIEWER_RECEIVING.mjs",
     "result": "customer-console/CONSOLE-RESULT.json", "schema": "stellar-forge.grant-reviewer-console-receiving-result.v1", "phases": 12,
     "closed": ("ownedBrowserClosed", "ownedMerchantClosed", "ownedWorkbenchesClosed")},
)


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(path: Path, description: str) -> Path:
    if not path.is_absolute() or path != path.resolve():
        raise RecoveryError("Select a canonical absolute " + description)
    return path


def executable(path: Path) -> Path:
    path = path.resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RecoveryError("The selected executable is unavailable: " + str(path))
    return path


def requirements():
    raw = read_regular(HERE / "RUNTIME-REQUIREMENTS.json")
    if digest(raw) != REQUIREMENTS_SHA256:
        raise RecoveryError("The reviewed runtime requirements differ")
    return json.loads(raw)


def optional_json(path: Path, maximum=8 * 1024 * 1024):
    try:
        return json.loads(read_regular(path, maximum))
    except FileNotFoundError:
        return None


def package_record(root: Path, name: str, expected: str):
    path = root.joinpath(*name.split("/"))
    try:
        resolved = path.resolve(strict=True)
        raw = read_regular(resolved / "package.json")
    except FileNotFoundError:
        return None
    value = json.loads(raw)
    if value.get("name") != name or value.get("version") != expected:
        return None
    return {"name": name, "version": expected, "directory": str(resolved),
            "package_json_sha256": digest(raw), "package_json_bytes": len(raw)}


def selected_packages(roots, required):
    found = {}
    for name, version in required["direct_dependencies"].items():
        for root in roots:
            item = package_record(root, name, version)
            if item is not None:
                found[name] = item
                break
    return found


def stop_owned(child, received):
    # The child and its process group were created by this invocation.
    # A stopped attempt is retained; it cannot become a completed receiving result.
    if child.poll() is None:
        os.killpg(child.pid, received)


def run_child(command, *, cwd: Path, state, state_path: Path, role: str, owned_fds=()):
    attempt = {"id": str(uuid.uuid4()), "role": role, "command": [str(x) for x in command],
               "started_at": now(), "state": "STARTING"}
    state.setdefault("attempts", []).append(attempt)
    state["state"] = "CONTINUING"
    atomic(state_path, encode(state))
    child = None
    stopping_at = None
    previous = {}

    def stopped(received, frame):
        nonlocal stopping_at
        if stopping_at is None:
            stopping_at = time.monotonic()
        if child is not None and child.poll() is None:
            stop_owned(child, signal.SIGINT)

    try:
        for kind in (signal.SIGINT, signal.SIGTERM):
            previous[kind] = signal.signal(kind, stopped)
        child = subprocess.Popen([str(x) for x in command], cwd=cwd, start_new_session=True, pass_fds=tuple(owned_fds))
        attempt["state"] = "RUNNING"
        attempt["pid"] = child.pid
        atomic(state_path, encode(state))
        emit({"event": "OWNED_STAGE_STARTED", "role": role, "attempt_id": attempt["id"], "pid": child.pid})
        while child.poll() is None:
            try:
                child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                if stopping_at is not None:
                    elapsed = time.monotonic() - stopping_at
                    if elapsed >= 120:
                        stop_owned(child, signal.SIGKILL)
                        attempt["forced_stop"] = True
                    elif elapsed >= 90:
                        stop_owned(child, signal.SIGTERM)
        attempt["returncode"] = child.returncode
        attempt["state"] = "CLOSED"
        attempt["closed_at"] = now()
        if stopping_at is not None:
            attempt["interrupted"] = True
        atomic(state_path, encode(state))
        emit({"event": "OWNED_STAGE_CLOSED", "role": role, "attempt_id": attempt["id"],
              "returncode": child.returncode, "interrupted": stopping_at is not None})
        if stopping_at is not None:
            raise RecoveryError("The original admitted stage was interrupted; continue this same operation")
        return child.returncode
    finally:
        # Also close an admitted child if writing its RUNNING journal failed.
        if child is not None and child.poll() is None:
            try:
                stop_owned(child, signal.SIGINT)
                child.wait(timeout=90)
            except subprocess.TimeoutExpired:
                stop_owned(child, signal.SIGTERM)
                try:
                    child.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    stop_owned(child, signal.SIGKILL)
                    child.wait()
        for kind, handler in previous.items():
            signal.signal(kind, handler)


def prepare_owned_runtime(runtime: Path, npm: Path | None, node: Path, required, state, state_path, controller_fd):
    canonical(runtime, "owned runtime directory")
    marker = runtime / "SCF-RUNTIME-OWNER.json"
    if runtime.exists() and not marker.exists():
        entries = list(runtime.iterdir())
        if any(entry.name != "controller.lock" or entry.is_symlink() or not entry.is_file() or entry.stat().st_size for entry in entries):
            raise RecoveryError("Preserve the existing unowned runtime; select an empty owned directory")
    parents(runtime, create=True)
    with lease(runtime / "controller.lock") as runtime_fd:
        owner = {"schema": "commons-scf-owned-node-runtime/1", "directory": str(runtime),
                 "requirements_sha256": REQUIREMENTS_SHA256}
        exact(marker, encode(owner))
        package = {"name": "commons-scf-recovered-reviewer-runtime", "version": "1.0.0", "private": True,
                   "dependencies": required["direct_dependencies"]}
        exact(runtime / "package.json", encode(package))
        modules = runtime / "node_modules"
        found = selected_packages([modules], required)
        if len(found) != len(required["direct_dependencies"]):
            if npm is None:
                missing = sorted(set(required["direct_dependencies"]) - set(found))
                raise RecoveryError("The owned runtime requires --npm ABS to install these selected packages: " + ", ".join(missing))
            npm = executable(npm)
            lock = runtime / "package-lock.json"
            lock_value = optional_json(lock, 16 * 1024 * 1024)
            if lock_value is not None and lock_value.get("packages", {}).get("", {}).get("dependencies") != package["dependencies"]:
                raise RecoveryError("The existing native npm lock selects different direct dependencies")
            verb = "ci" if lock_value is not None else "install"
            code = run_child([node, npm, verb, "--ignore-scripts", "--no-audit", "--no-fund",
                              "--cache", runtime / "npm-cache"], cwd=runtime, state=state,
                             state_path=state_path, role="selected-node-runtime", owned_fds=(controller_fd, runtime_fd))
            if code:
                raise RecoveryError("Continue the original owned npm installation; its actual return code was " + str(code))
            found = selected_packages([modules], required)
            if len(found) != len(required["direct_dependencies"]):
                raise RecoveryError("The completed npm command did not install every selected direct version")
        lock_bytes = read_regular(runtime / "package-lock.json", 16 * 1024 * 1024)
        exact(runtime / "locks" / (digest(lock_bytes) + ".json"), lock_bytes)
        return [modules]


def bind_runtime(source: Path, operation: Path, roots, required):
    roots = [root.resolve(strict=True) for root in roots]
    if any(not root.is_dir() for root in roots):
        raise RecoveryError("Select actual node_modules directories")
    found = selected_packages(roots, required)
    missing = sorted(set(required["required_for_reviewer"]) - set(found))
    if missing:
        raise RecoveryError("Selected runtime lacks the exact reviewer versions: " + ", ".join(missing))
    binding = {"schema": "commons-scf-selected-node-runtime/1", "requirements_sha256": REQUIREMENTS_SHA256,
               "packages": [found[name] for name in sorted(found)],
               "unselected_optional_drivers": sorted(set(required["optional_native_drivers"]) - set(found))}
    body = encode(binding)
    edition = operation / "runtime-bindings" / digest(body)
    modules = edition / "node_modules"
    parents(modules, create=True)
    exact(edition / "RUNTIME-BINDING.json", body)
    for item in binding["packages"]:
        link = modules.joinpath(*item["name"].split("/"))
        parents(link.parent, create=True)
        if link.is_symlink():
            if link.resolve(strict=True) != Path(item["directory"]):
                raise RecoveryError("The retained runtime package binding differs")
        elif link.exists():
            raise RecoveryError("Preserve the unexpected runtime package path: " + str(link))
        else:
            link.symlink_to(item["directory"], target_is_directory=True)
        current = package_record(modules, item["name"], item["version"])
        if current != item:
            raise RecoveryError("The selected package changed during binding: " + item["name"])
    # A normal source install leaves this extra runtime link untouched.
    # Source runners and installers share the same cooperative lease.
    with lease(source / "SCF-SOURCE-LEASE"):
        link = source / "node_modules"
        if link.is_symlink():
            if link.resolve(strict=True) != modules:
                current = selected_packages([link], required)
                if any(current.get(name) != item for name, item in found.items()):
                    raise RecoveryError("The source is already bound to another runtime; preserve that original binding")
        elif link.exists():
            # An explicitly selected complete in-place runtime can be used as-is.
            current = selected_packages([link], required)
            if any(current.get(name) != item for name, item in found.items()):
                raise RecoveryError("The source has a different existing node_modules directory")
        else:
            link.symlink_to(modules, target_is_directory=True)
    return {"path": str(edition / "RUNTIME-BINDING.json"), "sha256": digest(body), **binding}


def native_imports(node: Path, source: Path, playwright: Path, operation: Path):
    script = r"""
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.argv[1], selected=process.argv[2], rows=[];
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node 22 or later is required.');
const pw=await import(pathToFileURL(selected).href), chromium=pw.chromium??pw.default?.chromium;
if(!chromium||typeof chromium.launch!=='function'||typeof chromium.launchPersistentContext!=='function')
  throw new Error('Selected Playwright does not expose the maintained Chromium API.');
for(const file of ['stellar/scf_2026/presentation/reviewer/workbench.mjs',
 'stellar/scf_2026/presentation/reviewer/merchant/runtime.mjs',
 'stellar/scf-starforge-20261009/sf82-seller-pilot/releases.mjs',
 'stellar-forge/mcp-merchant-operator/serve.mjs',
 'stellar-forge/mcp-merchant-operator/console/service.mjs']){
 try{await import(pathToFileURL(join(root,file)).href);rows.push({file,state:'IMPORTED'});}
 catch(error){rows.push({file,state:'IMPORT_FAILED',code:error.code??error.name,message:error.message});}
}
console.log(JSON.stringify({node:process.version,playwright:selected,rows}));
if(rows.some(row=>row.state!=='IMPORTED'))process.exitCode=1;
"""
    completed = subprocess.run([node, "--max-old-space-size=256", "--input-type=module", "--eval", script,
                                source, playwright], cwd=source, capture_output=True, text=True, timeout=90)
    record = {"schema": "commons-scf-recovered-native-import/1", "source_selection_sha256": SELECTION_SHA256,
              "node": str(node), "playwright": str(playwright), "returncode": completed.returncode,
              "stdout": completed.stdout, "stderr": completed.stderr}
    body = encode(record)
    path = operation / "source-editions" / SELECTION_SHA256 / ("native-import-" + digest(body) + ".json")
    exact(path, body)
    emit({"event": "REVIEWER_RUNTIME_IMPORT", "record": str(path), "sha256": digest(body), **record})
    if completed.returncode:
        raise RecoveryError("The selected complete source/runtime import failed; retain the exact import record")
    return {"path": str(path), "sha256": digest(body), "returncode": 0}


def stage_result(operation: Path, stage, previous):
    path = operation / stage["result"]
    try:
        raw = read_regular(path, 16 * 1024 * 1024)
    except FileNotFoundError:
        return None
    value = json.loads(raw)
    if value.get("schema") != stage["schema"] or value.get("operation") != str(operation):
        raise RecoveryError("The original receiving result identity differs: " + str(path))
    if value.get("state") != "COMPLETE":
        return None
    if value.get("newPaymentTransactions") != 0 or any(value.get(key) is not True for key in stage["closed"]):
        raise RecoveryError("The receiving result does not establish closed nonpaying completion")
    if not isinstance(value.get("phases"), dict) or len(value["phases"]) < stage["phases"]:
        raise RecoveryError("The receiving result is missing its whole programme")
    if stage["name"] == "workbench":
        if value.get("runId") == HISTORICAL_RUN:
            raise RecoveryError("Do not recreate the lost historical run under this new recovery")
    elif stage["name"] == "merchant":
        original = value.get("original", {})
        if original.get("runId") != previous["workbench"]["run_id"] or original.get("sha256") != previous["workbench"]["sha256"]:
            raise RecoveryError("The merchant result is not bound to this actual Workbench result")
    elif stage["name"] == "console":
        if value.get("original", {}).get("sha256") != previous["workbench"]["sha256"] or value.get("merchant", {}).get("sha256") != previous["merchant"]["sha256"]:
            raise RecoveryError("The Console result is not bound to these actual Workbench and Merchant results")
    result = {"path": str(path), "bytes": len(raw), "sha256": digest(raw), "phases": len(value["phases"]),
              "state": "COMPLETE", "new_payment_transactions": 0}
    if stage["name"] == "workbench":
        result["run_id"] = value["runId"]
    return result


def run(args):
    os.umask(0o077)
    source = canonical(args.source, "source directory")
    operation = canonical(args.operation, "new receiving operation directory")
    if source == operation:
        raise RecoveryError("Keep source and the new receiving operation distinct")
    node, chromium = executable(args.node), executable(args.chromium)
    playwright = args.playwright.resolve(strict=True)
    if not playwright.is_file():
        raise RecoveryError("Select the actual installed Playwright module")
    packet = load_packet()
    selection = packet[2]
    required = requirements()
    parents(operation, create=True)
    with lease(operation / "RECEIVING-CONTROLLER.lock") as controller_fd:
        binding_path = operation / "RECOVERED-RUN.json"
        binding = optional_json(binding_path)
        if binding is None:
            native_paths = [operation / item["result"] for item in STAGES]
            native_paths += [operation / "WORKBENCH-STATE.json", operation / "workbenches",
                             operation / "merchant-client", operation / "customer-console"]
            if any(path.exists() or path.is_symlink() for path in native_paths):
                raise RecoveryError("Existing native history has no recovery binding; preserve it and select a new operation")
            binding = {"schema": "commons-scf-new-nonpaying-receiving/1", "id": str(uuid.uuid4()), "created_at": now(),
                       "source_root": str(source), "operation": str(operation),
                       "original_purchase": selection["original_purchase"], "initial_source_selection_sha256": SELECTION_SHA256,
                       "historical_run": HISTORICAL_RUN, "historical_journals_reconstructed": False,
                       "new_payment_transactions": 0}
            exact(binding_path, encode(binding))
        if binding.get("schema") != "commons-scf-new-nonpaying-receiving/1" or binding.get("source_root") != str(source) or binding.get("operation") != str(operation) or binding.get("original_purchase") != selection["original_purchase"] or binding.get("historical_journals_reconstructed") is not False:
            raise RecoveryError("Continue the original new-operation source/purchase binding")
        state_path = operation / "RECOVERED-RUN-STATE.json"
        state = optional_json(state_path) or {"schema": "commons-scf-new-receiving-state/1", "id": binding["id"], "attempts": []}
        if state.get("id") != binding["id"]:
            raise RecoveryError("The retained runner state belongs to another operation")
        with lease(source / "SCF-SOURCE-LEASE", shared=True):
            verify_source(source, selection)
        roots = list(args.node_modules or [])
        if args.runtime is not None:
            if roots:
                raise RecoveryError("Select existing node_modules roots or one owned runtime")
            roots = prepare_owned_runtime(args.runtime, args.npm, node, required, state, state_path, controller_fd)
        if not roots:
            roots = [source / "node_modules"]
        runtime = bind_runtime(source, operation, roots, required)
        with lease(source / "SCF-SOURCE-LEASE", shared=True) as source_fd:
            verified = verify_source(source, selection)
            source_record = {"schema": "commons-scf-receiving-source-edition/1", "source_root": str(source),
                             "files": verified, "source_bytes": selection["source_bytes"],
                             "source_selection_sha256": SELECTION_SHA256, "packet_index_sha256": INDEX_SHA256}
            exact(operation / "source-editions" / SELECTION_SHA256 / "SOURCE-EDITION.json", encode(source_record))
            imports = native_imports(node, source, playwright, operation)
            completed = {}
            selected = [item["name"] for item in STAGES].index(args.through)
            for index, stage in enumerate(STAGES[:selected + 1]):
                receipt = stage_result(operation, stage, completed)
                if receipt is None:
                    command = [node, "--max-old-space-size=256", source / stage["script"], "--operation", operation]
                    if stage["name"] == "workbench":
                        command.extend(["--source-root", source])
                    if stage["name"] != "merchant":
                        command.extend(["--playwright", playwright, "--chromium", chromium])
                    code = run_child(command, cwd=source, state=state, state_path=state_path, role=stage["name"], owned_fds=(controller_fd, source_fd))
                    if code:
                        state["state"] = "CONTINUATION_REQUIRED"
                        state["stage"] = stage["name"]
                        atomic(state_path, encode(state))
                        raise RecoveryError("Continue the same " + stage["name"] + " journal after actual return code " + str(code))
                    receipt = stage_result(operation, stage, completed)
                    if receipt is None:
                        raise RecoveryError("The native stage exited without a complete original result: " + stage["name"])
                completed[stage["name"]] = receipt
                state["stages"] = completed
                state["state"] = "STAGE_COMPLETE"
                atomic(state_path, encode(state))
                emit({"event": "RECEIVING_STAGE_COMPLETE", "stage": stage["name"], **receipt})
            result = {"schema": "commons-scf-new-nonpaying-receiving-result/1", "id": binding["id"],
                      "state": "COMPLETE" if selected == 2 else "STAGE_COMPLETE", "through": args.through,
                      "source": source_record, "runtime": runtime, "imports": imports,
                      "original_purchase": binding["original_purchase"], "stages": completed,
                      "historical_journals_reconstructed": False, "new_payment_transactions": 0}
            body = encode(result)
            result_path = operation / ("RECOVERED-RESULT-" + args.through + "-" + digest(body) + ".json")
            exact(result_path, body)
            state["state"] = result["state"]
            state["result"] = {"path": str(result_path), "sha256": digest(body)}
            atomic(state_path, encode(state))
            emit({"event": "NEW_RECEIVING_RESULT", "path": str(result_path), "sha256": digest(body), **result})
            return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--operation", type=Path, required=True, help="A new operation after lost runtime state; reuse it on continuation")
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--playwright", type=Path, required=True)
    parser.add_argument("--chromium", type=Path, required=True)
    parser.add_argument("--node-modules", type=Path, action="append", help="Existing runtime roots, in explicit selection order")
    parser.add_argument("--runtime", type=Path, help="Empty or previously owned npm runtime, used when no existing roots are selected")
    parser.add_argument("--npm", type=Path, help="Actual npm CLI script (npm resolves to npm-cli.js), executed by the selected Node for an owned runtime")
    parser.add_argument("--through", choices=("workbench", "merchant", "console"), default="console")
    args = parser.parse_args(argv)
    try:
        run(args)
    except (RecoveryError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        emit({"state": "CONTINUATION_REQUIRED", "error": str(error), "type": type(error).__name__,
              "new_payment_transactions": 0, "historical_journals_reconstructed": False})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
