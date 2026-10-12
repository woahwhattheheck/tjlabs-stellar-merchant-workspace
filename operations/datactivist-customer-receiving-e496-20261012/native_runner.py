#!/usr/bin/env python3
"""Continue the original Datactivist publisher case and preserve its native delivery."""
from __future__ import annotations
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import time
import traceback
import urllib.request
import zipfile

OPERATION = "DATACTIVIST-PUBLISHER-OPERATING-018A-20261012-01"
CAPTURE_SHA = "29243826152473ea4c82455905f340b629f30760e7ad27bcf3cf5fd0600e9e6f"
CAPTURE_MANIFEST_SHA = "815ee03eb81019b9abc8fd7092c1bbcb8928363dbc6e86e6c926ae1ae22768e1"
SDK = Path("stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv")
def emit(value):
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")), flush=True)
def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1048576), b""):
            h.update(block)
    return h.hexdigest()
def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))
def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
def run_program(argv, cwd, logs, label, phase_file=None):
    logs.mkdir(parents=True, exist_ok=True)
    stdout = logs / (label + ".stdout")
    stderr = logs / (label + ".stderr")
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONUNBUFFERED="1")
    with stdout.open("wb") as out, stderr.open("wb") as err:
        process = subprocess.Popen(argv, cwd=cwd, env=environment, stdout=out, stderr=err)
        emit({"state": "PROGRAM_STARTED", "operationId": OPERATION, "program": label, "pid": process.pid,
              "directory": str(cwd), "stdout": str(stdout), "stderr": str(stderr)})
        seen = set()
        while process.poll() is None:
            if phase_file and phase_file.is_file():
                try:
                    current = read_json(phase_file)
                    for phase in current.get("stages", []):
                        key = (phase.get("name"), phase.get("completedAt"))
                        if key not in seen:
                            seen.add(key)
                            emit({"state": "PROGRAM_PHASE", "program": label, "phase": phase.get("name"),
                                  "workspaceId": current.get("workspaceId"), "complete": current.get("complete", False)})
                except (OSError, ValueError):
                    pass
            time.sleep(1)
        code = process.returncode
    record = {"program": label, "returncode": code, "stdout": str(stdout), "stderr": str(stderr),
              "stdoutBytes": stdout.stat().st_size, "stderrBytes": stderr.stat().st_size}
    emit({"state": "PROGRAM_FINISHED", **record})
    if code:
        tail = stderr.read_text(encoding="utf-8", errors="replace")[-6000:]
        raise RuntimeError(label + " exited " + str(code) + "\n" + tail)
    return record
def zip_paths(output, pairs):
    members = []
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for source, name in sorted(pairs, key=lambda item: item[1]):
            source = Path(source)
            if not source.is_file() or source.is_symlink():
                continue
            archive.write(source, name)
            members.append({"path": name, "bytes": source.stat().st_size, "sha256": digest(source)})
        archive.writestr("CONTENTS.json", json.dumps({"operationId": OPERATION, "files": members}, indent=2) + "\n")
    return {"path": str(output), "bytes": output.stat().st_size, "sha256": digest(output), "members": len(members) + 1}
def identities(value):
    found = []
    if isinstance(value, dict):
        if value.get("library_file_id"):
            found.append({k: value[k] for k in ("library_file_id", "file_id", "filename", "file_name", "name",
                                               "path", "version_id", "current_version", "status") if k in value})
        for child in value.values():
            found.extend(identities(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(identities(child))
    unique = {}
    for item in found:
        key = (item.get("library_file_id"), str(item.get("version_id", item.get("current_version", ""))))
        unique[key] = item
    return list(unique.values())

def run(config):
    root = Path(config["root"]).resolve()
    root.mkdir(parents=True, exist_ok=True)
    source_file = root / "complete-application.json"
    application = root / "application"
    controller = root / "controller"
    original_root = root / "original-operation"
    receiving_root = root / "customer-receiving"
    helpers = root / "helpers"
    logs = root / "native-logs"
    logs.mkdir(exist_ok=True)
    result_file = root / "DATACTIVIST_NATIVE_RUN_RESULT.json"
    result = {"operationId": OPERATION, "complete": False, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "root": str(root), "sourceCommit": config["source_commit"], "sourceSha256": config["source_sha256"],
              "sourceBytes": config["source_bytes"], "commands": []}
    customer_package = None
    try:
        raw = source_file.read_bytes() if source_file.is_file() and source_file.stat().st_size == config["source_bytes"] and digest(source_file) == config["source_sha256"] else urllib.request.urlopen(config["source_url"], timeout=60).read()
        if len(raw) != config["source_bytes"] or hashlib.sha256(raw).hexdigest() != config["source_sha256"]:
            raise ValueError("Complete selected application source differs from its supplied identity")
        source_file.write_bytes(raw)
        packet = json.loads(raw)
        files = packet["files"]
        if not isinstance(files, list) or len(files) != config["source_files"]:
            raise ValueError("Complete selected application file count differs")
        application.mkdir(exist_ok=True)
        names = set()
        for item in files:
            name = item["path"]
            if name in names:
                raise ValueError("Repeated selected application path: " + name)
            names.add(name)
            path = (application / name).resolve()
            if not path.is_relative_to(application.resolve()):
                raise ValueError("Unsafe selected source path")
            content = item["content"].encode("utf-8")
            if item.get("bytes") is not None and len(content) != item["bytes"]:
                raise ValueError("Source byte count differs: " + name)
            if item.get("sha256") and hashlib.sha256(content).hexdigest() != item["sha256"]:
                raise ValueError("Source SHA256 differs: " + name)
            git_sha = item.get("sha", item.get("gitBlob"))
            if git_sha and hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest() != git_sha:
                raise ValueError("Source Git blob differs: " + name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        emit({"state": "APPLICATION_HYDRATED", "files": len(files), "bytes": len(raw),
              "sourceSha256": config["source_sha256"], "application": str(application)})
        node = Path(config["node"])
        playwright = Path(config["playwright_module"])
        browser = Path(config["browser_executable"])
        for path in (node, playwright, browser):
            if not path.is_file():
                raise FileNotFoundError("Observed original runtime component is unavailable: " + str(path))
        result["runtime"] = {"python": sys.version.split()[0],
                             "node": subprocess.check_output([str(node), "--version"], text=True).strip(),
                             "playwrightModule": str(playwright), "browserExecutable": str(browser)}
        for path in (application / SDK / "python_customer/install.py",
                     application / SDK / "python_customer/client.py",
                     application / SDK / "examples/customer.py", controller / "installed_customer.py"):
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
        runpy.run_path(str(application / SDK / "python_customer/install.py"), run_name="datactivist_installer_source")
        for path in (application / SDK / "python_customer/native_dataset.mjs",
                     application / SDK / "examples/operate.mjs", controller / "CUSTOMER_RECEIVING.mjs"):
            checked = subprocess.run([str(node), "--check", str(path)], capture_output=True, text=True)
            if checked.returncode:
                raise RuntimeError("Selected source syntax failed: " + str(path) + "\n" + checked.stderr)
        result["selectedSourceCompile"] = "passed"
        capture_zip = Path(config["capture_zip"])
        if capture_zip.stat().st_size != 986236 or digest(capture_zip) != CAPTURE_SHA:
            raise ValueError("Original captured source ZIP differs")
        inputs = root / "original-inputs"
        inputs.mkdir(exist_ok=True)
        with zipfile.ZipFile(capture_zip) as archive:
            for member in archive.infolist():
                target = (inputs / member.filename).resolve()
                if not target.is_relative_to(inputs.resolve()):
                    raise ValueError("Unsafe original capture member")
            archive.extractall(inputs)
        capture_manifest = inputs / "Datactivist_Public_Source_20261012_018A/capture/capture.json"
        if digest(capture_manifest) != CAPTURE_MANIFEST_SHA:
            raise ValueError("Original capture manifest differs")
        result["capture"] = {"zipSha256": CAPTURE_SHA, "manifestSha256": CAPTURE_MANIFEST_SHA,
                             "manifest": str(capture_manifest)}
        original_root.mkdir(exist_ok=True)
        original_config = {"root": str(original_root), "applicationRoot": str(application),
                           "captureManifest": str(capture_manifest),
                           "playwrightModule": str(playwright), "browserExecutable": str(browser)}
        original_config_file = root / "original-operating-config.json"
        write_json(original_config_file, original_config)
        original_result_file = original_root / "operations/operation-result.json"
        result["commands"].append(run_program([str(node), str(application / SDK / "examples/operate.mjs"),
                                                str(original_config_file)], root, logs,
                                               "original-publisher", original_result_file))
        original = read_json(original_result_file)
        if original.get("operationId") != OPERATION or original.get("complete") is not True:
            raise RuntimeError("Original operating programme did not complete its selected case")
        archive_path = original_root / "operations/publisher-workspace.datawork"
        original_archive_sha = digest(archive_path)
        archived_stage = next(stage for stage in original["stages"]
                              if stage["name"] == "complete_archive_and_independent_receiving")
        if archived_stage["archiveSha256"] != original_archive_sha:
            raise ValueError("Original complete archive differs from its actual programme result")
        result["original"] = {"workspaceId": original.get("workspaceId"), "publicationId": original["publicationId"],
                              "snapshot": original["snapshot"], "result": str(original_result_file),
                              "archive": str(archive_path), "archiveSha256": original_archive_sha,
                              "stages": [stage["name"] for stage in original["stages"]]}
        write_json(result_file, result)
        receiving_config = {"root": str(receiving_root), "sourceFile": str(source_file),
                            "sourceSha256": config["source_sha256"], "archiveFile": str(archive_path),
                            "archiveSha256": original_archive_sha, "originalResult": str(original_result_file),
                            "installer": str(application / SDK / "python_customer/install.py"),
                            "node": str(node), "python": sys.executable,
                            "playwrightModule": str(playwright), "browserExecutable": str(browser)}
        receiving_config_file = root / "customer-receiving-config.json"
        write_json(receiving_config_file, receiving_config)
        customer_result_file = receiving_root / "CUSTOMER_RECEIVING_RESULT.json"
        result["commands"].append(run_program([str(node), str(controller / "CUSTOMER_RECEIVING.mjs"),
                                                str(receiving_config_file)], root, logs,
                                               "complete-customer-receiving", customer_result_file))
        received = read_json(customer_result_file)
        if received.get("complete") is not True:
            raise RuntimeError("Complete installed customer receiving did not finish")
        customer_package = received["package"]
        if digest(customer_package["path"]) != customer_package["sha256"]:
            raise ValueError("Completed customer handover differs")
        result["customer"] = {"workspaceId": received["workspaceId"], "publicationId": received["publicationId"],
                              "snapshot": received["snapshot"], "result": str(customer_result_file),
                              "stages": [stage["name"] for stage in received["stages"]], "package": customer_package}
        result["complete"] = True
    except BaseException as error:
        result["error"] = {"type": type(error).__name__, "message": str(error),
                           "traceback": traceback.format_exc()}
        emit({"state": "NATIVE_OPERATION_ERROR", "operationId": OPERATION,
              "type": type(error).__name__, "message": str(error)})
    finally:
        result["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        write_json(result_file, result)
        try:
            pairs = [(p, "Datactivist_Original/original-operation/" + p.relative_to(original_root).as_posix())
                     for p in original_root.rglob("*") if p.is_file()]
            pairs += [(p, "Datactivist_Original/native-logs/" + p.relative_to(logs).as_posix())
                      for p in logs.rglob("*") if p.is_file()]
            pairs += [(p, "Datactivist_Original/controller/" + p.relative_to(controller).as_posix())
                      for p in controller.rglob("*") if p.is_file()]
            for path in (source_file, root / "original-operating-config.json", root / "customer-receiving-config.json", result_file):
                if path.is_file():
                    pairs.append((path, "Datactivist_Original/" + path.name))
            if Path(config["capture_zip"]).is_file():
                pairs.append((Path(config["capture_zip"]), "Datactivist_Original/Original_Public_Source.zip"))
            if receiving_root.is_dir() and not result["complete"]:
                pairs += [(p, "Datactivist_Original/customer-receiving/" + p.relative_to(receiving_root).as_posix())
                          for p in receiving_root.rglob("*") if p.is_file()]
            original_package = zip_paths(root / "Datactivist_Original_Operating_Workspace.zip", pairs)
            result["originalOperatingPackage"] = original_package
            write_json(result_file, result)
            uploads = []
            if customer_package:
                uploads.append({"local_path": customer_package["path"], "purpose": "create_library_file", "library_artifact_type": "other"})
            uploads += [{"local_path": original_package["path"], "purpose": "create_library_file", "library_artifact_type": "other"},
                        {"local_path": str(result_file), "purpose": "create_library_file", "library_artifact_type": "other"}]
            request = {"uploads": uploads}
            (root / "upload-state").mkdir(mode=0o700, exist_ok=True)
            saved = subprocess.run([sys.executable, "-B", str(helpers / "library_upload.py")],
                                   input=json.dumps(request), capture_output=True, text=True, cwd=root,
                                   env=dict(os.environ, TMPDIR=str(root / "upload-state"), PYTHONDONTWRITEBYTECODE="1"))
            (logs / "delivery-upload.stdout").write_text(saved.stdout, encoding="utf-8")
            (logs / "delivery-upload.stderr").write_text(saved.stderr, encoding="utf-8")
            try:
                upload_result = json.loads(saved.stdout)
                returned_identities = identities(upload_result)
                upload_keys = list(upload_result) if isinstance(upload_result, dict) else []
            except ValueError:
                upload_result, returned_identities, upload_keys = None, [], []
            result["preservation"] = {"returncode": saved.returncode, "identities": returned_identities,
                                       "resultKeys": upload_keys, "stdout": str(logs / "delivery-upload.stdout"),
                                       "stderr": str(logs / "delivery-upload.stderr")}
            if saved.returncode or not returned_identities:
                result["preservation"]["error"] = re.sub(r"https?://\S+", "[private transfer URL]",
                    saved.stderr[-3000:] or saved.stdout[-3000:])
            write_json(result_file, result)
            emit({"state": "NATIVE_DELIVERY_PRESERVED" if saved.returncode == 0 and returned_identities else "NATIVE_DELIVERY_SAVE_RESULT",
                  "operationId": OPERATION, "complete": result["complete"], "root": str(root),
                  "originalOperatingPackage": original_package, "customerPackage": customer_package,
                  "preservation": result["preservation"]})
        except BaseException as error:
            result["preservation"] = {"error": str(error), "type": type(error).__name__}
            write_json(result_file, result)
            emit({"state": "NATIVE_DELIVERY_SAVE_ERROR", "operationId": OPERATION,
                  "type": type(error).__name__, "message": str(error), "root": str(root)})
    emit({"state": "DATACTIVIST_ORIGINAL_AND_CUSTOMER_COMPLETE" if result["complete"] else "DATACTIVIST_ORIGINAL_CONTINUATION_RETAINED",
          "operationId": OPERATION, "root": str(root), "result": str(result_file),
          "sourceSha256": config["source_sha256"], "complete": result["complete"],
          "original": result.get("original"), "customer": result.get("customer"),
          "error": result.get("error"), "preservation": result.get("preservation")})
    return result

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Use native_runner.py /ABSOLUTE_ORIGINAL_OPERATION_CONFIG.json")
    config_path = Path(sys.argv[1]).resolve()
    finished = run(read_json(config_path))
    raise SystemExit(0 if finished["complete"] else 1)
