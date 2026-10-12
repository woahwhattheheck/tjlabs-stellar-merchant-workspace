#!/usr/bin/env python3
"""Continue the retained installed Datasette workspace through complete Conapi delivery.

Run on the same original receiver after installed-browser-journey.json reaches
COMPLETE. All native child work, complete archive capture and canonical saves
finish within this receiving process.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time
import traceback

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from preserve_delivery import atomic_json, save_complete_delivery

SOURCE_REF = "e5520a2a962ccebc461d478edf6aebb4b6c7fb20"
ORIGINAL_OPERATION = "SCF-DATASETTE-SOURCE-EDITIONS-07476-20261012"
PRODUCT_OPERATION = "CONAPI-WORKFLOW-RECEIVING-DSCEB3-20261012"


def read(path):
    return json.loads(Path(path).read_bytes())


def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)


def observe_capacity():
    result = {"at": time.time(), "filesystems": {}, "cgroup": {}}
    for name in ("memory.current", "memory.max", "memory.stat", "memory.events"):
        path = Path("/sys/fs/cgroup") / name
        try:
            result["cgroup"][name] = path.read_text().strip()
        except OSError as error:
            result["cgroup"][name] = {"errno": error.errno}
    for path in ("/workspace", "/tmp", "/dev", "/dev/shm", "/mnt/data"):
        try:
            state = os.statvfs(path)
            result["filesystems"][path] = {"available_bytes": state.f_bavail * state.f_frsize,
                                          "free_bytes": state.f_bfree * state.f_frsize,
                                          "free_inodes": state.f_favail}
        except OSError as error:
            result["filesystems"][path] = {"errno": error.errno}
    return result


def run_native(command, root):
    output, error = root / "conapi-native.stdout", root / "conapi-native.stderr"
    with output.open("ab") as out, error.open("ab") as err:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, cwd=root, start_new_session=True)
        emit({"stage": "conapi_native_accepted", "pid": process.pid, "root": str(root),
              "source_ref": SOURCE_REF, "operation": PRODUCT_OPERATION})
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ, (out, "stdout"))
        selector.register(process.stderr, selectors.EVENT_READ, (err, "stderr"))
        pending = {"stdout": b"", "stderr": b""}
        while selector.get_map():
            for key, _ in selector.select(timeout=1):
                destination, kind = key.data
                block = os.read(key.fileobj.fileno(), 65536)
                if not block:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                destination.write(block)
                destination.flush()
                pending[kind] += block
                while b"\n" in pending[kind]:
                    line, pending[kind] = pending[kind].split(b"\n", 1)
                    if line.startswith(b"{") and len(line) <= 20000:
                        try:
                            parsed = json.loads(line)
                            if isinstance(parsed, dict) and any(name in parsed for name in ("stage", "phase", "state")):
                                emit({"stage": "conapi_native_progress", "channel": kind, "event": parsed})
                        except ValueError:
                            pass
        code = process.wait()
    return {"returncode": code, "stdout": str(output), "stderr": str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--transfer-directory", type=Path)
    parser.add_argument("--transport-programme", type=Path)
    parser.add_argument("--transport-metadata", type=Path)
    parser.add_argument("--flow-delivery", type=Path)
    args = parser.parse_args()
    root = args.root
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError("Use the complete original canonical Datasette workspace.")
    source_identity = read(root / "delivery-input.json")
    if source_identity["operation"] != ORIGINAL_OPERATION:
        raise ValueError("The retained workspace belongs to another operation.")
    installed = read(root / "installed/installed-browser-journey.json")
    if installed.get("phase") != "COMPLETE":
        raise ValueError("Continue the original installed Datasette programme before joining Conapi.")
    original_input = read(root / "installed-input.json")
    os.umask(0o077)
    sys.dont_write_bytecode = True
    helpers = root / "helpers"
    for name in ("library_upload.py", "library_hosted_apps.py", "library_file_transfer.py", "library_private_upload.py"):
        if not (helpers / name).is_file():
            raise ValueError("Retain the original unchanged canonical helper: " + name)
    transfer = (args.transfer_directory or Path(os.environ.get("DATASETTE_TRANSFER_DIRECTORY", str(root))))
    if not transfer.is_absolute() or transfer.resolve() != transfer:
        raise ValueError("Use the actual original canonical transfer directory.")
    transfer.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_state = transfer / "conapi-upload-state"
    private_state.mkdir(mode=0o700, exist_ok=True)
    os.environ["TMPDIR"] = str(private_state)
    os.environ.setdefault("AZCOPY_CONCURRENCY_VALUE", "4")
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    os.environ["GIT_TERMINAL_PROMPT"] = "0"
    node = Path(os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or
                "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
    os.environ["PATH"] = str(node.parent) + os.pathsep + os.environ.get("PATH", "")
    os.environ["npm_config_update_notifier"] = "false"
    cache = Path(original_input["npmCache"])
    if not cache.is_dir():
        cache = private_state / "npm-cache"
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.environ["npm_config_cache"] = str(cache)
    output = root / "conapi-native"
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = (root / "conapi-native-continuation.lock").open("a+b")
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    selected = {
        "repository": str(root / "canonical-repository"), "outputDirectory": str(output),
        "publisherProgrammeDirectory": str(root / "journey"),
        "completedDatasetteReport": str(root / "installed/installed-browser-journey.json"),
        "supplierProgramme": str(HERE / "supplier_programme.py"),
        "python": original_input["python"], "npm": original_input.get("npm", str(node.parent / "npm")),
        "npmCache": str(cache), "browserExecutable": original_input["browserExecutable"],
        "playwrightModule": original_input["playwrightModule"],
    }
    if args.transport_programme:
        selected["transportProgramme"] = str(args.transport_programme.resolve(strict=True))
    if args.transport_metadata:
        metadata_path = args.transport_metadata.resolve(strict=True)
        selected["transportMetadata"] = read(metadata_path)
    if args.flow_delivery:
        selected["flowDelivery"] = str(args.flow_delivery.resolve(strict=True))
    input_path = root / "conapi-installed-input.json"
    atomic_json(input_path, selected)
    capacity = observe_capacity()
    atomic_json(root / "conapi-capacity-before.json", capacity)
    emit({"stage": "conapi_original_programme_joined", "operation": PRODUCT_OPERATION,
          "original_operation": ORIGINAL_OPERATION, "root": str(root), "source_ref": SOURCE_REF,
          "procfs_pid": os.readlink("/proc/self"), "capacity": capacity})
    result = {"schema": "commons.conapi-complete-delivery.v1", "operation": PRODUCT_OPERATION,
              "originalOperation": ORIGINAL_OPERATION, "sourceRef": SOURCE_REF,
              "startedAt": time.time(), "state": "PRESERVED_FOR_CONTINUATION"}
    try:
        result["native"] = run_native([str(node), str(HERE / "run_conapi.mjs"), "--input", str(input_path)], root)
        state_file = output / "conapi-operating-programme.json"
        if state_file.is_file():
            result["programme"] = read(state_file)
            result["state"] = result["programme"]["phase"]
        if result["native"]["returncode"] != 0:
            result["error"] = {"message": "The original native programme returned " + str(result["native"]["returncode"]),
                               "stderr": result["native"]["stderr"]}
        result["finishedAt"] = time.time()
        result["capacityAfter"] = observe_capacity()
    except BaseException as error:
        if isinstance(error, KeyboardInterrupt):
            raise
        result["error"] = {"type": type(error).__name__, "message": str(error),
                           "traceback": traceback.format_exc()}
    finally:
        report = root / "Conapi_Complete_Operating_Result.json"
        atomic_json(report, result)
        excluded = [root / "private-temp", root / "export", cache]
        saved = save_complete_delivery(root=root, export=transfer / "conapi-export", helpers=helpers,
            helper_state=private_state, report=report, operation=ORIGINAL_OPERATION,
            source_identity={**source_identity, "conapi_source_ref": SOURCE_REF},
            filename="Conapi_Complete_Operating_Checkpoint.zip", excluded=excluded, emit=emit)
        atomic_json(root / "Conapi_Complete_Delivery_Saved.json", saved)
        emit({"stage": "conapi_complete_delivery_saved", "operation": PRODUCT_OPERATION, **saved})
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        lock.close()
    return 0 if result["state"] in ("COMPLETE", "SUPPLIER_RECEIVING_COMPLETE") else 1


if __name__ == "__main__":
    raise SystemExit(main())
