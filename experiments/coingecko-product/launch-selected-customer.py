#!/usr/bin/env python3
"""Receive exact source inputs, then use the original native placement and foreground."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

OPERATION = "COINGECKO-PRODUCT-DELIVERY-5403-20261012"
SOURCE = "ada4e3261a421010f93ef4bda9ce8b0b2624d4c1"
PINS = {
    "builder.json": "ad1772df26785e6917f9edb6071828f581209a602004075b95258a315aba8c91",
    "customer.json": "c8cfb54174dbc381bde7f4581cd4e9c0f06b93a7b6145680c01d21474ab8020f",
    "run-selected-customer.py": "ffa3b1ffaf327d326287ceb6232741da9ad1cb1baf42b052117d6439bd695786",
}
HOST = "/workspace/scratch/dbc61db6310c/native-runtime-recovery-62c14ca9/host"
ROOT = "/workspace/scratch/5403360e55a4/coingecko-product-native"
ARCHIVE = "/workspace/scratch/5403360e55a4/coingecko-product-original/CoinGecko_Complete_Research_and_Recovery_2026-10-12.zip"
NODE = "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node"
GIT = "/usr/local/bin/git"

def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

def need(value, message):
    if not value:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def publish(path, body):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        need(path.is_file() and not path.is_symlink() and path.read_bytes() == body,
             "Keep the original source or placement: " + str(path))
        return
    pending = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".next")
    try:
        with pending.open("xb") as stream:
            os.chmod(pending, 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(pending, path)
        except FileExistsError:
            need(path.is_file() and not path.is_symlink() and path.read_bytes() == body,
                 "Original source publication differs.")
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if pending.exists():
            pending.unlink()

def source_input(args):
    if args.input_bundle:
        body = Path(args.input_bundle).read_bytes()
    else:
        saved_terminal = None
        if sys.stdin.isatty():
            import termios
            import tty
            saved_terminal = termios.tcgetattr(sys.stdin.fileno())
            tty.setraw(sys.stdin.fileno())
        try:
            print(json.dumps({"event": "AWAITING_SOURCE_INPUT", "operation": OPERATION,
                              "format": "decimal UTF-8 byte length, newline, exact JSON bytes",
                              "maximum_bytes": 2 * 1024 * 1024}), flush=True)
            header = bytearray()
            while True:
                ch = sys.stdin.buffer.read(1)
                need(ch, "Source input ended before its length.")
                if ch == b"\n":
                    break
                need(ch in b"0123456789" and len(header) < 9, "Invalid source byte length.")
                header.extend(ch)
            length = int(header)
            need(0 < length <= 2 * 1024 * 1024, "Source input exceeds its declared bound.")
            chunks = bytearray()
            while len(chunks) < length:
                chunk = sys.stdin.buffer.read(length - len(chunks))
                need(chunk, "Source input ended before all original bytes arrived.")
                chunks.extend(chunk)
            body = bytes(chunks)
        finally:
            if saved_terminal is not None:
                termios.tcsetattr(sys.stdin.fileno(), termios.TCSANOW, saved_terminal)
    need(sha(body) == args.bundle_sha256, "Original input bundle SHA differs.")
    value = json.loads(body)
    need(value["schema"] == "commons.coingecko-native-input-stream.v1" and
         value["operation"] == OPERATION and value["source_commit"] == SOURCE,
         "Select the original build and customer operation.")
    files = value["files"]
    need(len(files) == len(PINS) and {item["path"] for item in files} == set(PINS),
         "The original complete source set changed.")
    for item in files:
        content = item["content"].encode("utf-8")
        need(sha(content) == PINS[item["path"]] == item["sha256"] and len(content) == item["bytes"],
             "An original source input differs: " + item["path"])
        if item["path"].endswith(".py"):
            compile(content, item["path"], "exec")
    return body, value

def read_json(path):
    path = Path(path)
    need(path.is_file() and not path.is_symlink(), "Keep the original regular receipt: " + str(path))
    return json.loads(path.read_bytes())

def select_continuation(args, root, project, inputs, host, archive, runtime, native_placement):
    """Bind an actual completed/released predecessor; never cancel or invent an exit."""
    native_id = args.native_operation_id
    if not args.predecessor_record:
        need(native_id in (None, OPERATION), "A different native phase requires its exact predecessor record.")
        return OPERATION, None, root / "placement.json"
    need(isinstance(native_id, str) and native_id.startswith(OPERATION + "-")
         and native_id != OPERATION and len(native_id) <= 180
         and all(ch.isascii() and (ch.isalnum() or ch in "-_.") for ch in native_id),
         "Name one distinct native continuation phase for the same original business operation.")
    observed = native_placement.inspect_predecessor(str(Path(args.predecessor_record).resolve()), native=runtime)
    need(observed["completed_and_released"] and isinstance(observed["supervisor"], dict)
         and observed["request_sha256"] and observed["result_sha256"]
         and observed["native"]["project"] == str(project),
         "The actual predecessor must have a completed result, ended identities and released resources.")
    record = Path(observed["record"])
    request = read_json(record / "request.json")
    intent = request["intent"]
    predecessor_id = intent["operation_id"]
    need((predecessor_id == OPERATION or predecessor_id.startswith(OPERATION + "-"))
         and predecessor_id != native_id and intent["project"] == str(project)
         and str(inputs / "run-selected-customer.py") in intent["command"],
         "Select this exact original programme/project and a distinct native continuation.")
    selected = {"mode": "terminal-result", "record": str(record),
                "request_sha256": observed["request_sha256"],
                "result_sha256": observed["result_sha256"],
                "expected_supervisor": observed["supervisor"]}
    import fcntl
    with (project / "programme.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original_input = read_json(project / "INPUT.json")
        expected = {"schema": "commons.coingecko-selected-native-input.v1", "operation": OPERATION,
            "source_commit": SOURCE,
            "repository": "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git",
            "builder_sha256": PINS["builder.json"], "customer_sha256": PINS["customer.json"],
            "original_zip": {"path": str(archive), "bytes": 672184,
                            "sha256": "6dff8fc354d9992ca7f19227d893a34c745f86da0d1cb642bd6ee144933fcbce"},
            "project": str(project), "pipeline_sha256": PINS["run-selected-customer.py"]}
        need(original_input == expected, "Retain the original complete programme source and customer input.")
        progress_path = project / "programme.json"
        progress = read_json(progress_path)
        need(progress["input"] == original_input, "The current programme input is not its original input.")
        directory = root / "continuations" / native_id
        handoff_path = directory / "handoff.json"
        if handoff_path.exists():
            handoff = read_json(handoff_path)
            need(handoff["schema"] == "commons.coingecko-native-terminal-continuation.v1"
                 and handoff["operation"] == OPERATION and handoff["native_operation_id"] == native_id
                 and handoff["native_host"] == str(host) and handoff["project"] == str(project)
                 and handoff["programme_input"] == original_input and handoff["predecessor"] == selected,
                 "Preserve the exact existing continuation selection.")
        else:
            need(progress.get("current_native_operation_id", OPERATION) == predecessor_id,
                 "The programme already adopted another native phase; inspect that original current record.")
            previous = progress.get("current_transient", progress.get("transient"))
            need(isinstance(previous, dict) and isinstance(previous.get("path"), str)
                 and type(previous.get("device")) is int, "The original transient identity is not retained.")
            handoff = {"schema": "commons.coingecko-native-terminal-continuation.v1",
                "operation": OPERATION, "native_operation_id": native_id, "native_host": str(host),
                "project": str(project), "programme_input": original_input,
                "programme_progress_sha256": sha(progress_path.read_bytes()),
                "previous_transient": previous, "predecessor": selected}
            publish(handoff_path, encoded(handoff))
    return native_id, {"path": handoff_path, "value": handoff}, directory / "placement.json"

def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--input-bundle")
    group.add_argument("--stdin", action="store_true")
    parser.add_argument("--bundle-sha256", required=True)
    parser.add_argument("--root", default=ROOT)
    parser.add_argument("--temporary-root", default="/dev/coingecko-product-5403")
    parser.add_argument("--native-host", default=HOST)
    parser.add_argument("--archive", default=ARCHIVE)
    parser.add_argument("--node", default=NODE)
    parser.add_argument("--git", default=GIT)
    parser.add_argument("--git-objects")
    parser.add_argument("--predecessor-record")
    parser.add_argument("--native-operation-id")
    args = parser.parse_args()
    body, bundle = source_input(args)
    root = Path(args.root).resolve()
    temporary = Path(args.temporary_root).resolve()
    need(root != temporary and root not in temporary.parents and temporary not in root.parents,
         "Persistent project and transient native roots must be distinct.")
    need(not (str(root).startswith("/dev/") and not str(root).startswith("/dev/shm/")),
         "Keep the project, native records and outputs on persistent/shared storage.")
    archive = Path(args.archive).resolve()
    need(archive.is_file() and not archive.is_symlink(), "The original completed customer ZIP is unavailable.")
    raw_archive = archive.read_bytes()
    need(len(raw_archive) == 672184 and sha(raw_archive) ==
         "6dff8fc354d9992ca7f19227d893a34c745f86da0d1cb642bd6ee144933fcbce",
         "Select the exact original customer archive.")
    host = Path(args.native_host).resolve()
    need((host / "native_placement.py").is_file() and (host / "native_foreground.py").is_file(),
         "Use the complete maintained native host closure.")
    sys.path.insert(0, str(host))
    from native_foreground import ForegroundLaunch, load_native
    import native_placement
    runtime = load_native(str(host))
    inputs = root / "input"
    for item in bundle["files"]:
        publish(inputs / item["path"], item["content"].encode("utf-8"))
    publish(root / "SOURCE_INPUT.json", encoded({
        "schema": bundle["schema"], "operation": OPERATION, "source_commit": SOURCE,
        "bundle_sha256": sha(body), "bundle_bytes": len(body),
        "files": [{key: item[key] for key in ("path", "bytes", "sha256")} for item in bundle["files"]]}))
    project = root / "project"
    records = root / "records"
    for path in (project, project / "output", records):
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    native_id, continuation, placement_path = select_continuation(
        args, root, project, inputs, host, archive, runtime, native_placement)
    command = [sys.executable, "-B", {"binding": "inputs", "relative": "run-selected-customer.py"},
        "--run", {"binding": "run"}, "--project", str(project), "--inputs", {"binding": "inputs"},
        "--archive", {"binding": "archive"}, "--node", str(Path(args.node).resolve()),
        "--git", str(Path(args.git).resolve())]
    runtime_paths = [str(host), str(Path(args.node).resolve()), str(Path(args.git).resolve()),
                     str(Path(sys.executable).resolve())]
    if args.git_objects:
        git_objects = Path(args.git_objects).resolve()
        need(git_objects.is_dir(), "The original read-only Git object donor is absent.")
        command.extend(["--git-objects", str(git_objects)])
        runtime_paths.append(str(git_objects))
    if continuation:
        command.extend(["--continuation", {"binding": "continuation"}])
    spec = {
        "schema": "commons.native-placement/v1",
        "placement_id": native_id,
        "business_operation_id": OPERATION,
        "candidates": [{"id": "owning-invocation", "root": str(temporary)}],
        "bindings": {
            "inputs": {"mode": "retain", "source": str(inputs)},
            "archive": {"mode": "retain", "source": str(archive)}},
        "native": {
            "operation_id": native_id, "peer": "5403",
            "project": str(project), "records_root": str(records), "command": command,
            "memory_mib": 768, "memory_reserve_mib": 256, "memory_reclaim": "clean-cache",
            "memory_reservations_root": None, "runtime_consumers_root": None,
            "disk_reservations_root": None,
            "disk_space": [{"path": {"binding": "run"}, "mib": 512}, {"path": str(project), "mib": 16}],
            "disk_inodes": [{"path": {"binding": "run"}, "count": 24000},
                            {"path": str(project), "count": 4000}],
            "disk_reserve_mib": 8, "disk_reserve_inodes": 256,
            "artifact": ["output"], "runtime_path": runtime_paths},
        "placement_note": {
            "source_commit": SOURCE, "input_bundle_sha256": sha(body),
            "purpose": "One original source-selected build and full original customer archive receiving.",
            "transient": "Git acquisition, bootstrap, selected source, npm pack cache and temporary files stay inside this same foreground namespace.",
            "persistent": "Original native project/records, customer editable database, complete .tgz, manifests, command returns and whole closed customer ZIP remain under the original root.",
            "growth_basis": "512 MiB transient estimate covers Git objects and full source materialization; 16 MiB persistent estimate covers the compressed selected source, reports, customer project and complete customer ZIP. Known declared component/support source is 20,541,607 logical bytes before closure. No SDK installation or browser process.",
            "continuation": "Use --predecessor-record and a distinct --native-operation-id only for an actual completed/released terminal result. The whole original record is retained by maintained placement; the same project adopts a fully retained source .tgz through the original unpacker and preserves its customer state."}}
    if continuation:
        spec["predecessor"] = continuation["value"]["predecessor"]
        spec["bindings"]["continuation"] = {"mode": "retain", "source": str(continuation["path"])}
    publish(placement_path, encoded(spec))
    plans = root / "plans"
    prepared = native_placement.prepare(spec, str(plans), native=runtime)
    print(json.dumps({"event": "placement_prepared", "result": prepared}), flush=True)
    if prepared.get("phase") == "awaiting_capacity":
        return 75
    ready = native_placement.materialize(str(plans), spec["placement_id"], native=runtime)
    print(json.dumps({"event": "placement_materialized", "phase": ready.get("phase")}), flush=True)
    if ready.get("phase") != "ready":
        return 75
    launcher = ForegroundLaunch(runtime)
    try:
        started = native_placement.start(str(plans), spec["placement_id"], native=runtime, launcher=launcher)
        print(json.dumps({"event": "native_start", "result": started}), flush=True)
    finally:
        if launcher.root:
            return launcher.handoff()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
