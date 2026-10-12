#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Install the selected original joint runtime and run the one whole A2A programme.

The caller must use the maintained native admission/foreground owner. This helper
does not create another native queue, agent, task, or AnalysisWorkspace engine.
Its private root is the complete retained source selected by that original owner.
"""
import argparse
import ast
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time
import uuid
import zipfile

OPERATION = "SCF-A2A-NATIVE-ANALYSIS-0C7A-20261012"
CLIENT = "stellar/scf-starforge-20261009/sf30-seller-sdk/a2a"
AGENT = "stellar-forge/a2a-analysis-agent"
EXPECTED = {"@a2a-js/sdk": "1.3.0", "jose": "6.2.12",
            "express": "5.1.0", "kysely": "0.29.5", "better-sqlite3": "13.0.3"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def need(value, message):
    if not value:
        raise RuntimeError(message)

def read(path):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink(), "Selected file is not a regular retained file: " + str(path))
    return path.read_bytes()

def parsed(path):
    return json.loads(read(path))

def atomic(path, data, replace=True):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not replace and path.exists():
        need(read(path) == data, "Original immutable file changed: " + str(path))
        return
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, 0o600)
        if replace:
            os.replace(temporary, path)
        else:
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(read(path) == data, "Original immutable publication changed: " + str(path))
            temporary.unlink()
        descriptor = os.open(str(path.parent), os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)

def inside(root, relative):
    need(isinstance(relative, str) and relative and not relative.startswith("/") and
         all(item not in ("", ".", "..") for item in relative.split("/")), "Unsafe retained relative path")
    path = root.joinpath(*relative.split("/"))
    # All components are selected by source/receiving; reject a substituted link.
    cursor = path
    while cursor != root:
        need(not cursor.is_symlink(), "Retained path became a symbolic link: " + relative)
        cursor = cursor.parent
    return path

def file_record(path, root=None):
    data = read(path)
    return {"path": path.relative_to(root).as_posix() if root else str(path),
            "bytes": len(data), "sha256": sha(data)}

def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    args = parser.parse_args()
    root = Path(args.root).absolute()
    need(root.is_dir() and not root.is_symlink(), "Select the existing original private operation root")
    source, work = root / "source", root / "work"
    work.mkdir(mode=0o700, exist_ok=True)
    lock = (work / "joint-owner.lock").open("a+b")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as error:
        raise RuntimeError("The original joint worker still owns this operation") from error
    state_path = work / "joint-state.json"
    state = parsed(state_path) if state_path.exists() else {
        "schema": "stellar-forge.a2a-joint-worker.v1", "operation_id": OPERATION,
        "created_at": now(), "complete": False, "commands": [], "phase": "source"}
    need(state.get("operation_id") == OPERATION, "Original operation identity changed")
    def save():
        state["updated_at"] = now()
        atomic(state_path, canonical(state))
    def phase(name, **details):
        state["phase"] = name
        save()
        emit({"stage": "joint_" + name, **details})

    manifest_bytes = read(root / "SOURCE_MANIFEST.json")
    manifest = json.loads(manifest_bytes)
    need(manifest.get("operation_id") == OPERATION and isinstance(manifest.get("files"), list), "Original source manifest required")
    paths = set()
    for entry in manifest["files"]:
        need(entry["path"] not in paths, "Duplicate selected source")
        paths.add(entry["path"])
        data = read(inside(source, entry["path"]))
        need(len(data) == entry["bytes"] and sha(data) == entry["sha256"] and
             hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest() == entry["git_blob"],
             "Selected source identity changed: " + entry["path"])
    need(read(source / CLIENT / "receiving/run_joint.py") == read(Path(__file__).absolute()),
         "Execute the selected original worker source")
    runtime_bytes = read(root / "runtime-selection.json")
    runtime = json.loads(runtime_bytes)
    need(runtime["chromium_present"] and Path(runtime["chromium"]).is_file(), "Original Chromium selection required")
    package = {"name": "starforge-original-a2a-joint-runtime", "version": "1.0.0",
               "private": True, "type": "module", "engines": {"node": ">=24"}, "dependencies": {}}
    for selected in (source / CLIENT / "runtime-package.json", source / AGENT / "package.json"):
        for name, version in parsed(selected)["dependencies"].items():
            need(name not in package["dependencies"] or package["dependencies"][name] == version,
                 "The two original runtime selections disagree")
            package["dependencies"][name] = version
    need(package["dependencies"] == EXPECTED, "Keep the reviewed SDK and original native-store dependency versions")
    selection = {"operation_id": OPERATION, "source_manifest_sha256": sha(manifest_bytes),
                 "runtime_selection_sha256": sha(runtime_bytes), "recording": file_record(root / "native-recording.json"),
                 "worker_sha256": sha(read(Path(__file__).absolute())), "runtime_package": package}
    if "selection" in state:
        need(state["selection"] == selection, "The original joint source/runtime selection changed; review original operation before adoption")
    else:
        state["selection"] = selection
        save()
    phase("source_verified", files=len(paths), bytes=sum(item["bytes"] for item in manifest["files"]))

    node, npm, python = runtime["node"], runtime["npm"], runtime["python"]
    for executable in (node, python):
        need(Path(executable).is_file(), "The selected original executable is unavailable")
    environment = os.environ.copy()
    environment.update({"PATH": str(Path(node).parent) + os.pathsep + environment.get("PATH", ""),
                        "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1",
                        "A2A_RECEIVING_PLAYWRIGHT": runtime["playwright"],
                        "A2A_RECEIVING_CHROMIUM": runtime["chromium"],
                        "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD": "1"})
    environment.pop("NODE_PATH", None)
    environment.pop("NODE_OPTIONS", None)
    # The root's original native declaration selects this exact temporary sink.
    temporary = root / "temp"
    temporary.mkdir(mode=0o700, exist_ok=True)
    environment["TMPDIR"] = str(temporary)
    logs = work / "logs"
    logs.mkdir(mode=0o700, exist_ok=True)

    def command(label, argv, cwd, echo=True):
        invocation = uuid.uuid4().hex
        output = logs / (label + "-" + invocation + ".log")
        record = {"id": invocation, "label": label, "argv": list(argv), "cwd": str(cwd),
                  "started_at": now(), "state": "prepared", "output": output.relative_to(work).as_posix()}
        state["commands"].append(record)
        save()
        child = None
        try:
            with output.open("xb") as stream:
                child = subprocess.Popen(argv, cwd=str(cwd), env=environment, stdin=subprocess.DEVNULL,
                                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                         pass_fds=(lock.fileno(),), start_new_session=False)
                record.update({"pid": child.pid, "state": "running"})
                save()
                for line in iter(child.stdout.readline, b""):
                    stream.write(line)
                    if echo:
                        # The upstream programmes emit compact progress, never bearer values.
                        sys.stdout.buffer.write(line)
                        sys.stdout.buffer.flush()
                code = child.wait()
                stream.flush()
                os.fsync(stream.fileno())
            record.update({"state": "complete" if code == 0 else "failed",
                           "exit_code": code, "ended_at": now(), **file_record(output, work)})
            save()
            need(code == 0, "Original " + label + " exited " + str(code) + "; retain and inspect " + str(output))
            return output
        except BaseException:
            if child is not None and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            record.update({"state": "failed", "ended_at": now(),
                           "exit_code": child.returncode if child is not None else None})
            save()
            raise

    try:
        installed = root / "runtime"
        installed.mkdir(mode=0o700, exist_ok=True)
        atomic(installed / "package.json", canonical(package) + b"\n", replace=False)
        ready_path = work / "runtime-ready.json"
        if not ready_path.exists():
            phase("installing_original_runtime")
            command("npm-install", [node, npm, "install", "--no-audit", "--no-fund",
                                    "--cache", str(root / "npm-cache"), "--loglevel=warn"], installed)
        link = source / "node_modules"
        target = installed / "node_modules"
        need(target.is_dir(), "Original joint node_modules was not installed")
        if link.is_symlink():
            need(link.resolve() == target.resolve(), "The selected source points to another dependency runtime")
        else:
            need(not link.exists(), "An unreviewed node_modules directory occupies the selected source")
            link.symlink_to(target, target_is_directory=True)
        inspect_js = r'''
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.cwd()+'/package.json');
const selected=JSON.parse(readFileSync('package.json','utf8')).dependencies;
const packages={};
for(const [name,version] of Object.entries(selected)){
  let directory=dirname(fileURLToPath(import.meta.resolve(name))),found;
  for(let depth=0;depth<12;depth++){
    try{const value=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'));if(value.name===name){found={version:value.version,path:directory};break;}}catch{}
    const parent=dirname(directory);if(parent===directory)break;directory=parent;
  }
  if(!found||found.version!==version)throw new Error('Original dependency identity mismatch: '+name);
  packages[name]=found;
}
if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node 24 or newer required');
const Database=require('better-sqlite3'),db=new Database(':memory:');
const native=db.prepare("select 42 as value, sqlite_version() as sqlite").get();
db.close();if(native.value!==42)throw new Error('The original native SQLite binding did not execute');
console.log(JSON.stringify({node:process.execPath,nodeVersion:process.version,modules:process.versions.modules,packages,nativeSQLite:native.sqlite}));
'''
        inspected = command("runtime-inspection", [node, "--input-type=module", "-e", inspect_js], installed)
        actual = json.loads(read(inspected).decode().strip().splitlines()[-1])
        lockfile = file_record(installed / "package-lock.json")
        ready = {"schema": "stellar-forge.a2a-joint-runtime.v1", "operation_id": OPERATION,
                 "selection": selection, "actual": actual, "package_lock": lockfile,
                 "python": python, "playwright": runtime["playwright"],
                 "playwright_core": runtime["playwright_core"], "chromium": runtime["chromium"]}
        if ready_path.exists():
            need(parsed(ready_path) == ready, "Reopened original installed runtime changed")
        else:
            atomic(ready_path, canonical(ready), replace=False)
        phase("original_runtime_ready", node=actual["nodeVersion"],
              packages={name: item["version"] for name, item in actual["packages"].items()},
              sqlite=actual["nativeSQLite"])

        # Verify the original authored application entry points using the selected
        # interpreters. Imports and the full programme below verify the real ABI.
        if not state.get("source_parsed"):
            python_count = 0
            for entry in manifest["files"]:
                if entry["path"].endswith(".py"):
                    path = inside(source, entry["path"])
                    ast.parse(read(path).decode("utf-8-sig"), filename=str(path))
                    python_count += 1
            selected_js = [entry for entry in manifest["files"]
                           if entry["path"].endswith((".mjs", ".cjs")) and
                           (entry["path"].startswith(CLIENT + "/") or entry["path"].startswith(AGENT + "/"))]
            for entry in selected_js:
                command("parse", [node, "--check", str(inside(source, entry["path"]))], source, echo=False)
            state["source_parsed"] = {"python": python_count, "javascript": len(selected_js)}
            save()
            phase("source_parsed", **state["source_parsed"])

        commission_directory = work / "commission"
        result_path = commission_directory / "commission-result.json"
        merchant_result_path = commission_directory / "merchant/result.json"
        if not state.get("complete"):
            phase("original_analysis_and_merchant")
            command("original-commission", [node, str(source / AGENT / "commission.mjs"),
                    "--directory", str(commission_directory), "--recording", str(root / "native-recording.json"),
                    "--checkout", str(source), "--python", python, "--merchant-module",
                    str(source / CLIENT / "receiving/commission.mjs")], source)
        result, merchant = parsed(result_path), parsed(merchant_result_path)
        need(result.get("operationId") == OPERATION and
             result.get("status") == "ORIGINAL_SOURCE_A2A_RECEIVING_COMPLETE",
             "The original upstream programme has not completed")
        need(merchant.get("complete") is True and merchant.get("ownersClosed") is True and
             merchant.get("payment") == {"mode": "CHALLENGE_ONLY", "verified": False, "settled": False},
             "The original merchant/browser owners have not closed")
        for item in merchant["files"]:
            current = file_record(inside(commission_directory / "merchant", item["path"]))
            need(current["bytes"] == item["bytes"] and current["sha256"] == item["sha256"],
                 "An original received merchant file changed: " + item["path"])
        phase("whole_programme_closed", task_id=merchant["task"]["taskId"] if isinstance(merchant.get("task"), dict) and "taskId" in merchant["task"] else None,
              outputs=len(merchant["files"]))

        delivery = work / "delivery"
        delivery.mkdir(mode=0o700, exist_ok=True)
        def archive(name, members):
            path = delivery / name
            expected = [{"path": name, "bytes": len(data), "sha256": sha(data)}
                        for name, data in sorted(members.items())]
            member_manifest = canonical({"schema": "stellar-forge.a2a-delivery-files.v1",
                                         "operation_id": OPERATION, "files": expected})
            if path.exists():
                with zipfile.ZipFile(path) as archive:
                    need(set(archive.namelist()) == set(members) | {"DELIVERY_MANIFEST.json"}, "Original delivery ZIP member set changed")
                    need(archive.read("DELIVERY_MANIFEST.json") == member_manifest, "Original delivery ZIP manifest changed")
                    for member, data in members.items():
                        need(archive.read(member) == data, "Original delivery ZIP member changed")
            else:
                temporary_zip = path.with_name("." + name + "." + uuid.uuid4().hex + ".tmp")
                try:
                    with zipfile.ZipFile(temporary_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                        for member, data in sorted({**members, "DELIVERY_MANIFEST.json": member_manifest}.items()):
                            info = zipfile.ZipInfo(member, date_time=(1980, 1, 1, 0, 0, 0))
                            info.compress_type = zipfile.ZIP_DEFLATED
                            info.external_attr = 0o100644 << 16
                            info.create_system = 3
                            archive.writestr(info, data)
                    with temporary_zip.open("rb") as stream:
                        os.fsync(stream.fileno())
                    os.link(temporary_zip, path)
                    descriptor = os.open(str(delivery), os.O_RDONLY | os.O_DIRECTORY)
                    try:
                        os.fsync(descriptor)
                    finally:
                        os.close(descriptor)
                finally:
                    temporary_zip.unlink(missing_ok=True)
            return file_record(path, work)

        source_members = {entry["path"]: read(inside(source, entry["path"])) for entry in manifest["files"]}
        source_members["SOURCE_MANIFEST.json"] = manifest_bytes
        source_members["runtime/package.json"] = read(installed / "package.json")
        source_members["runtime/package-lock.json"] = read(installed / "package-lock.json")
        source_delivery = archive("starforge-a2a-complete-source.zip", source_members)
        result_members = {"commission-result.json": read(result_path),
                          "merchant/result.json": read(merchant_result_path),
                          "runtime-ready.json": read(ready_path),
                          "sources/hamburg-native-recording.json": read(root / "native-recording.json")}
        for item in merchant["files"]:
            result_members["merchant/" + item["path"]] = read(inside(commission_directory / "merchant", item["path"]))
        # These are the original completed SDK receiving file sets, not live
        # databases or browser profiles. Each native set carries received.json.
        receiving = commission_directory / "receiving"
        if receiving.exists():
            for selected in sorted(receiving.glob("*/results/*")):
                if selected.is_dir() and not selected.is_symlink():
                    for path in sorted(selected.iterdir()):
                        if path.is_file() and not path.is_symlink():
                            result_members["receiving/" + path.relative_to(receiving).as_posix()] = read(path)
        result_delivery = archive("starforge-a2a-complete-receiving.zip", result_members)
        candidate = {"schema": "stellar-forge.a2a-joint-result.v1", "operation_id": OPERATION,
                     "complete": True, "selection": selection,
                     "upstream": file_record(result_path, work), "merchant": file_record(merchant_result_path, work),
                     "runtime": file_record(ready_path, work), "delivery": [source_delivery, result_delivery]}
        if state.get("final_candidate") is not None:
            need(state["final_candidate"] == candidate, "Original completed joint candidate changed")
        else:
            state["final_candidate"] = candidate
            save()
        atomic(work / "joint-result.json", canonical(candidate), replace=False)
        state["complete"] = True
        state["phase"] = "complete"
        save()
        emit({"stage": "joint_complete", "operation_id": OPERATION, "outputs": candidate["delivery"],
              "result": str(work / "joint-result.json")})
        return 0
    except BaseException as error:
        if not state.get("complete"):
            state["error"] = {"kind": type(error).__name__, "message": str(error), "at": now()}
            save()
        raise
    finally:
        lock.close()

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        emit({"stage": "joint_failed", "kind": type(error).__name__, "message": str(error)})
        raise
