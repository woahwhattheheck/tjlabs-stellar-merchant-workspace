#!/usr/bin/env python3
"""MIT. TJLabs isolated original Flowable job producer and complete receiving."""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys
import time
import uuid
import zipfile

OP = "FLOWABLE-NATIVE-JOB-RECOVERY-B43A-20261013"
SCHEMA = "stellar-forge.flowable-job-native-course.v1"
PREFIX = "stellar/scf-starforge-20261009/sf30-seller-sdk/flowable"
VENDOR = "0779d68e5a3385b74d8acb8bc37901ff54513249"

def require(value, message):
    if not value:
        raise RuntimeError(message)

def sha(path):
    h = hashlib.sha256()
    count = 0
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1048576), b""):
            h.update(block)
            count += len(block)
    return {"bytes": count, "sha256": h.hexdigest()}

def read(path):
    return json.loads(Path(path).read_bytes())

def immutable(helper, path, value):
    data = value if isinstance(value, bytes) else helper.encoded(value)
    if path.exists():
        require(path.read_bytes() == data, "Retain exact original input: " + str(path))
    else:
        helper.atomic(path, data)

def child_start(helper, lock):
    helper.child_lifetime()
    os.set_inheritable(lock, True)

def owned_browser_processes(helper, root, executable):
    selected = []
    profiles = {str(root / "course/browser-profile"), str(root / "course/received-browser-profile")}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\0")
            argv = [part.decode("utf-8", "strict") for part in args if part]
            if not argv:
                continue
            matched = any("--user-data-dir=" + p in argv for p in profiles)
            if not matched:
                continue
            actual = (entry / "exe").resolve()
            require(str(actual) == str(executable), "An owned profile is held by a different executable; inspect it.")
            identity = helper.proc_identity(int(entry.name))
            if identity:
                identity["profileArguments"] = [x for x in argv if x.startswith("--user-data-dir=")]
                selected.append(identity)
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
    return selected

def close_browser(helper, root, executable):
    # Chromium can be detached from Node. Match this exact executable and one of
    # this operation's unique private profile paths; never scan/kill by name.
    originals = owned_browser_processes(helper, root, executable)
    for original in originals:
        if helper.same_process(original):
            os.kill(original["pid"], signal.SIGTERM)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and any(helper.same_process(x) for x in originals):
        time.sleep(0.1)
    require(not any(helper.same_process(x) for x in originals),
            "The exact retained browser still owns its profile; continue its original close.")
    return originals

def run(args):
    os.umask(0o077)
    source = Path(args.source_root).resolve()
    root = Path(args.directory).absolute()
    require(root == root.resolve() and root != source and source not in root.parents and root not in source.parents,
            "Keep canonical source and course output directories disjoint.")
    helper_path = source / PREFIX / "flowable-native-host.py"
    spec = importlib.util.spec_from_file_location("original_flowable_native_host", helper_path)
    helper = importlib.util.module_from_spec(spec)
    previous_bytecode = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(helper)
    finally:
        sys.dont_write_bytecode = previous_bytecode
    require(helper.VERSION == "8.0.0" and helper.VENDOR_COMMIT == VENDOR,
            "Use the same pinned original Flowable host helper.")
    helper.private_directory(root)
    lock = os.open(root / "native-owner.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return run_locked(args, source, root, helper, lock)
    finally:
        os.close(lock)

def run_locked(args, source, root, helper, lock):
    require(args.operation == OP and re.fullmatch(r"[a-f0-9]{40}", args.source_revision),
            "Keep the original operation and exact merged source pin.")
    donor = Path(args.original_host_directory).resolve()
    require(donor != root and donor not in root.parents and root not in donor.parents,
            "Keep the original donor operation unchanged and separate.")
    donor_lock = read(donor / "artifact-lock.json")
    selected = donor_lock.get("flowable", {})
    require(selected.get("version") == "8.0.0" and selected.get("sourceCommit") == VENDOR,
            "Use the original selected Flowable8 engine artifact.")
    war = Path(selected.get("path", donor / "vendor/flowable-rest.war")).resolve()
    require(sha(war) == selected["war"], "The actual retained Flowable WAR differs.")
    java = Path(args.java or donor_lock["java"]["path"]).resolve()
    node = Path(args.node or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE", "")).resolve()
    playwright = Path(args.playwright_module or donor_lock["browser"]["playwrightModule"]["path"]).resolve()
    chromium = Path(args.chromium or donor_lock["browser"]["chromium"]["path"]).resolve()
    require(all(x.is_file() for x in [java, node, playwright, chromium]), "Reuse installed original runtime files.")
    version = subprocess.run([str(node), "--version"], capture_output=True, text=True, check=False)
    require(version.returncode == 0 and re.match(r"v(?:2[4-9]|[3-9][0-9])\.", version.stdout),
            "Use the original Node24+ workspace runtime.")
    runtime = Path(args.runtime_directory).resolve()
    manifest_path = runtime / "package/manifest.json"
    manifest = read(manifest_path)
    require(manifest.get("sourceCommit") == args.source_revision and
            manifest.get("sourceSelection", {}).get("id") == "flowable-merchant" and
            source == (runtime / "package/source").resolve(),
            "Receive and select the complete original installed Flowable release.")
    workspace_archive = Path(args.workspace_archive).resolve()
    require(workspace_archive.is_file() and root not in workspace_archive.parents,
            "Select the completed original workspace archive outside this continuation.")
    # The installed package is the complete maintained source cohort. It is not a
    # checkout containing unrelated environments or mutable runtime workspaces.
    source_files = []
    for p in sorted(source.rglob("*")):
        require(not p.is_symlink(), "Installed original source must have regular members.")
        if p.is_file():
            source_files.append({"path": p.relative_to(source).as_posix(), **sha(p)})
    require(source_files, "Retain the complete installed source.")
    for leaf in ("job-native.mjs", "job-native-host.py", "job-native-journey.mjs",
                 "job-native-browser.mjs", "examples/job-recovery-demo.bpmn20.xml"):
        require((source / PREFIX / leaf).is_file(), "Receive complete source including " + leaf)
    binding = {"schema": SCHEMA, "operation": OP, "sourceRevision": args.source_revision,
               "sourceRoot": str(source), "runtimeManifest": sha(manifest_path),
               "originalWorkspace": {"path": str(workspace_archive), **sha(workspace_archive)},
               "sourceFiles": source_files, "engine": {"version": "8.0.0", "commit": VENDOR, "war": sha(war)},
               "runtime": {"node": {"path": str(node), **sha(node)}, "java": {"path": str(java), **sha(java)},
                           "playwright": {"path": str(playwright), **sha(playwright)},
                           "chromium": {"path": str(chromium), **sha(chromium)}}}
    immutable(helper, root / "binding.json", binding)
    state_path = root / "owner.private.json"
    state = read(state_path) if state_path.exists() else {"bindingSha256": sha(root / "binding.json")["sha256"],
                                                       "processes": [], "phases": {}, "closeState": "CLOSED"}
    require(state["bindingSha256"] == sha(root / "binding.json")["sha256"], "Original source selection changed.")
    alive = [x for x in state["processes"] if helper.same_process(x)]
    require(not alive, "An original JVM or course process remains alive; retain its current operation.")
    close_browser(helper, root, chromium)
    result_path = root / "delivery.json"
    if result_path.exists():
        result = read(result_path)
        require(result["bindingSha256"] == state["bindingSha256"], "Original completed source changed.")
        require(sha(Path(result["archive"]["path"])) == {k: result["archive"][k] for k in ("bytes", "sha256")},
                "The complete original receiving file changed.")
        return result
    private_path = root / "runtime.private.json"
    if private_path.exists():
        private = read(private_path)
    else:
        private = {"port": helper.free_port(), "username": "tjlabs-job-native",
                   "password": secrets.token_hex(32), "databasePassword": secrets.token_hex(32),
                   "timerDueDate": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 35 * 86400)),
                   "browserTimerDueDate": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 36 * 86400))}
        helper.save(private_path, private)
    db = helper.private_directory(root / "database")
    course = helper.private_directory(root / "course")
    environment = dict(os.environ)
    environment["TJL_FLOWABLE_JOB_USERNAME"] = private["username"]
    environment["TJL_FLOWABLE_JOB_PASSWORD"] = private["password"]
    base = "http://127.0.0.1:" + str(private["port"]) + "/flowable-rest/service"
    config = {"schema": SCHEMA, "operation": OP, "engineVersion": "8.0.0", "engineCommit": VENDOR,
              "sourceRevision": args.source_revision, "sourceRoot": str(source), "outputDirectory": str(course),
              "isolatedDemonstration": True, "workspaceArchive": binding["originalWorkspace"],
              "connection": {"id": "tjlabs-job-recovery-demo", "label": "TJLabs isolated original native recovery",
                             "baseUrl": base, "usernameEnv": "TJL_FLOWABLE_JOB_USERNAME",
                             "passwordEnv": "TJL_FLOWABLE_JOB_PASSWORD"},
              "playwrightModule": str(playwright), "chromiumExecutable": str(chromium),
              "timerDueDate": private["timerDueDate"], "browserTimerDueDate": private["browserTimerDueDate"],
              "failureWaitMs": 240000}
    config_path = root / "course-configuration.json"
    immutable(helper, config_path, config)
    phases = [("prepare", False), ("failure", True), ("operate", False)]
    def save():
        helper.save(state_path, state)
    def launch(argv, role, log_path, env):
        with open(log_path, "ab", buffering=0) as log:
            child = subprocess.Popen([str(x) for x in argv], stdout=log, stderr=subprocess.STDOUT,
                                     cwd=root, env=env, start_new_session=True,
                                     pass_fds=(lock,), preexec_fn=lambda: child_start(helper, lock))
        identity = helper.proc_identity(child.pid)
        require(identity is not None, "Original child stopped before its identity was retained.")
        identity.update(role=role,argv=[str(x) for x in argv])
        state["processes"].append(identity)
        state["closeState"] = "OPEN"
        save()
        return child, identity
    try:
        for phase, asynchronous in phases:
            if phase in state["phases"]:
                continue
            props = "\n".join([
                "server.address=127.0.0.1", "server.port=" + str(private["port"]),
                "server.servlet.context-path=/flowable-rest", "flowable.process.servlet.path=/service",
                "spring.datasource.url=jdbc:h2:file:" + str(db / "flowable") + ";DB_CLOSE_ON_EXIT=FALSE",
                "spring.datasource.username=flowable", "spring.datasource.password=" + private["databasePassword"],
                "spring.datasource.driver-class-name=org.h2.Driver", "flowable.database-schema-update=true",
                "flowable.history-level=full", "flowable.process.async-history.enable=true",
                "flowable.async-history-executor-activate=false",
                "flowable.async-executor-activate=" + str(asynchronous).lower(),
                "flowable.rest.app.create-demo-definitions=false", "flowable.check-process-definitions=false",
                "flowable.rest.app.authentication-mode=verify-privilege",
                "flowable.rest.app.admin.user-id=" + private["username"],
                "flowable.rest.app.admin.password=" + private["password"],
                "spring.main.banner-mode=off", "spring.application.name=tjlabs-job-recovery-demo", ""
            ])
            props_path = root / ("engine-" + phase + ".private.properties")
            immutable(helper, props_path, props.encode("utf-8"))
            public_props = props.replace(private["password"], "<private native credential>").replace(private["databasePassword"], "<private database credential>")
            immutable(helper, root / ("engine-" + phase + ".properties.txt"), public_props.encode("utf-8"))
            engine = child = None
            try:
                engine, engine_id = launch([java, "-Xms128m", "-Xmx768m", "-XX:ActiveProcessorCount=2",
                                           "-Djava.awt.headless=true", "-jar", war,
                                           "--spring.config.additional-location=" + props_path.as_uri()],
                                          "engine-" + phase, root / ("engine-" + phase + ".log"),
                                          helper.native_engine_environment(environment))
                credentials = {"username": private["username"], "password": private["password"]}
                def ready():
                    status, value, raw = helper.native_json(base, credentials, "/repository/process-definitions?size=1")
                    return status == 200 and isinstance(value.get("data"), list)
                helper.wait_ready(ready, engine, "Original isolated Flowable8 " + phase, seconds=240)
                child, child_id = launch([node, source / PREFIX / "job-native-journey.mjs", config_path, phase],
                                         "course-" + phase, root / ("course-" + phase + ".log"), environment)
                code = child.wait()
                require(code == 0, "Continue the same native phase from its complete log: " + phase)
                # Children inherit the original flock. Do not publish completion
                # while a detached original browser still owns either profile.
                require(not owned_browser_processes(helper, root, chromium),
                        "Original browser closure has not completed.")
                state["phases"][phase] = {"state": "COMPLETE", "exitCode": code,
                                          "log": {"path": str(root / ("course-" + phase + ".log")),
                                                  **sha(root / ("course-" + phase + ".log"))},
                                          "settingsSha256": sha(props_path)["sha256"]}
                save()
            finally:
                if child is not None and child.poll() is None:
                    helper.stop_owned(child_id)
                    child.wait(timeout=30)
                close_browser(helper, root, chromium)
                if engine is not None and engine.poll() is None:
                    helper.stop_owned(engine_id)
                    engine.wait(timeout=30)
                state["closeState"] = "CLOSED" if not any(helper.same_process(x) for x in state["processes"]) else "INTERRUPTED"
                save()
        actual = read(course / "artifacts/result.json")
        require(actual.get("state") == "COMPLETE", "Finish native recovery and both actual browser chapters.")
        # Closed original H2 plus entire operated workspace sources and outputs.
        # Credentials, capabilities, profile databases and private configuration
        # remain private. Complete source and immutable original archive are included.
        members = []
        for p in sorted((course / "artifacts").rglob("*")):
            if p.is_file() and not p.is_symlink():
                members.append((p, "operated/" + p.relative_to(course / "artifacts").as_posix()))
        for which in ("author", "receiver"):
            for p in sorted((course / which).rglob("*")):
                if p.is_file() and not p.is_symlink() and not p.name.endswith(".lock"):
                    members.append((p, "workspaces/" + which + "/" + p.relative_to(course / which).as_posix()))
        for p in sorted(db.rglob("*")):
            if p.is_file() and not p.is_symlink():
                members.append((p, "native-database/" + p.relative_to(db).as_posix()))
        for row in source_files:
            members.append((source / row["path"], "source/" + row["path"]))
        members.append((workspace_archive, "original/Complete_Preceding_Flowable_Workspace.ndjson"))
        members.extend((root / ("engine-" + p + ".properties.txt"), "native-settings/" + p + ".properties.txt") for p, _ in phases)
        members.append((root / "binding.json", "SOURCE_AND_INPUT.json"))
        manifest = {"schema": "stellar-forge.flowable-job-operated-case.v1", "operation": OP,
                    "sourceRevision": args.source_revision, "originalEngine": VENDOR,
                    "isolatedDemonstration": True, "nativeCourse": actual,
                    "files": [{"path": name, **sha(p)} for p, name in members]}
        manifest_path = root / "Complete_Case_Manifest.json"
        immutable(helper, manifest_path, manifest)
        archive = root / "Complete_Flowable_Job_Recovery_Case.zip"
        temporary = archive.with_name(archive.name + ".partial-" + uuid.uuid4().hex)
        try:
            with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as out:
                for p, name in members + [(manifest_path, "MANIFEST.json")]:
                    info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                    info.external_attr = 0o100600 << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    with p.open("rb") as incoming, out.open(info, "w", force_zip64=True) as target:
                        for block in iter(lambda: incoming.read(1048576), b""):
                            target.write(block)
            with temporary.open("rb") as saved:
                os.fsync(saved.fileno())
            with zipfile.ZipFile(temporary) as check:
                require(check.testzip() is None, "The complete actual case ZIP failed CRC.")
                for row in manifest["files"]:
                    with check.open(row["path"]) as incoming:
                        h = hashlib.sha256()
                        count = 0
                        for block in iter(lambda: incoming.read(1048576), b""):
                            h.update(block)
                            count += len(block)
                    require(count == row["bytes"] and h.hexdigest() == row["sha256"],
                            "Complete case changed original member " + row["path"])
            if archive.exists():
                require(sha(archive) == sha(temporary), "Preserve the original frozen complete case.")
            else:
                os.link(temporary, archive)
                helper.sync_directory(root)
        finally:
            temporary.unlink(missing_ok=True)
        result = {"schema": SCHEMA, "operation": OP, "state": "COMPLETE",
                  "bindingSha256": state["bindingSha256"], "sourceRevision": args.source_revision,
                  "archive": {"path": str(archive), **sha(archive)}, "native": actual,
                  "closedProcesses": state["processes"], "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        immutable(helper, result_path, result)
        return result
    finally:
        for original in reversed(state["processes"]):
            if helper.same_process(original):
                helper.stop_owned(original)
        close_browser(helper, root, chromium)
        state["closeState"] = "CLOSED"
        save()

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source-root", required=True)
    p.add_argument("--source-revision", required=True)
    p.add_argument("--runtime-directory", required=True)
    p.add_argument("--original-host-directory", required=True)
    p.add_argument("--workspace-archive", required=True)
    p.add_argument("--directory", required=True)
    p.add_argument("--operation", default=OP)
    p.add_argument("--node")
    p.add_argument("--java")
    p.add_argument("--playwright-module")
    p.add_argument("--chromium")
    args = p.parse_args()
    def interrupted(signum, frame):
        raise KeyboardInterrupt("Original native job course interrupted")
    signal.signal(signal.SIGTERM, interrupted)
    try:
        print(json.dumps(run(args)), flush=True)
    except BaseException as error:
        print(json.dumps({"state": "INTERRUPTED", "operation": OP, "error": type(error).__name__,
                          "message": str(error)}), file=sys.stderr, flush=True)
        raise

if __name__ == "__main__":
    main()
