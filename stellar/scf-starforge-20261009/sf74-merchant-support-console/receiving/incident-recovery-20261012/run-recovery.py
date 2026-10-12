#!/usr/bin/env python3
"""Continue the completed Object Support operation with its complete incident recovery source."""
from __future__ import annotations
import argparse, fcntl, gzip, hashlib, io, json, os, signal, stat, subprocess, sys, time, types, uuid, zipfile
from pathlib import Path

APP_COMMIT = "33600e3f5654a5199991562dedd166eee36d9e87"
INPUT_SHA = "e5ac88b0132e5e457ca9a4ceae888befc7334391cf575bde2a3a2320373a08f1"
ORIGINAL_RUNNER_GIT = "ee7a28366f38960e101b27c589cd6401c2f13068"
SOURCE_RECEIVER_GIT = "3d402bc7e20e0da26193d099ad9429d0b47feef2"
CUSTOMER_GIT = "3cff80371b90d14cff31d8b5dcdfca1ef65e08dc"
DRIVER_GIT = "52dc2748e712e080332e8c6850b1ff10d8b35a61"

def require(value, message):
    if not value:
        raise RuntimeError(message)

def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()

def load_original(file):
    file = Path(file)
    require(file.is_absolute() and file.resolve(strict=True) == file, "Select the original absolute runner source.")
    raw = file.read_bytes()
    require(git_blob(raw) == ORIGINAL_RUNNER_GIT, "The original runner source changed.")
    module = types.ModuleType("scf_original_object_support")
    module.__file__ = str(file)
    sys.modules[module.__name__] = module
    exec(compile(raw, str(file), "exec"), module.__dict__)
    return module

class Programme:
    def __init__(self, config):
        self.config_file = Path(config).resolve(strict=True)
        raw = self.config_file.read_bytes()
        self.cfg = json.loads(raw)
        require(self.cfg.get("schema") == "stellar-forge.incident-recovery-programme.v1", "Select the recovery programme configuration.")
        for name in ("project","work","baselineProject","originalRunner","driver","sourceReceiver","sourceInput","guide"):
            require(isinstance(self.cfg.get(name), str) and Path(self.cfg[name]).is_absolute(), "Use an absolute " + name + " path.")
        self.original = load_original(self.cfg["originalRunner"])
        self.read = self.original.regular_bytes
        self.json = lambda file: self.original.json_read(self.read(file, 16 * 1024 * 1024))
        self.save = self.original.save_bytes
        self.save_json = self.original.save_json
        self.project = self.original.private_directory(self.cfg["project"])
        self.work = self.original.private_directory(self.cfg["work"])
        require(self.project != self.work and self.project not in self.work.parents and self.work not in self.project.parents,
                "Use separate persistent programme and working directories.")
        self.save(self.project / "configuration.private.json", raw)
        self.base = Path(self.cfg["baselineProject"])
        self.base_config = self.json(self.base / "configuration.private.json")
        self.baseline_delivery = Path(self.cfg.get("baselineDelivery", str(self.base / "delivery-result.json")))
        require(self.baseline_delivery.is_absolute(), "Use an absolute baseline delivery path.")
        self.delivery = self.json(self.baseline_delivery)
        require(self.delivery.get("state") == "COMPLETE" and self.delivery.get("nativeState") == "COMPLETE",
                "Continue the completed original customer and its saved full package.")
        self.baseline_package = Path(self.delivery["package"]["path"])
        self.baseline_bytes = self.read(self.baseline_package, 50 * 1024 * 1024)
        require(len(self.baseline_bytes) == self.delivery["package"]["bytes"] and
                hashlib.sha256(self.baseline_bytes).hexdigest() == self.delivery["package"]["sha256"],
                "The original full package changed.")
        require(self.base_config["source_commit"] == "f7200d52fdc5722619d0cf708041ee46db447e7f",
                "Select the original baseline, without another baseline run.")
        self.source = self.work / "source"
        self.customer = self.project / "customer"
        self.driver = Path(self.cfg["driver"])
        self.source_receiver = Path(self.cfg["sourceReceiver"])
        require(git_blob(self.read(self.driver, 262144)) == DRIVER_GIT, "The complete recovery customer changed.")
        require(git_blob(self.read(self.source_receiver, 262144)) == SOURCE_RECEIVER_GIT, "The unchanged Git receiver changed.")

    def child(self, name, command, timeout):
        directory = self.original.private_directory(self.project / "native-calls")
        invocation = name + "-" + uuid.uuid4().hex
        self.save_json(directory / (invocation + ".request.json"),
                       {"name":name, "command":command, "at":self.original.now()})
        with open(directory / (invocation + ".stdout"), "xb") as stdout, open(directory / (invocation + ".stderr"), "xb") as stderr:
            os.fchmod(stdout.fileno(), 0o600); os.fchmod(stderr.fileno(), 0o600)
            process = None; observed = None; expired = False
            try:
                process = subprocess.Popen(command, cwd=self.project, stdout=stdout, stderr=stderr,
                                           start_new_session=True,
                                           env=dict(os.environ, SCF_PYTHON=self.base_config["python"]))
                deadline = time.monotonic() + timeout
                while True:
                    observed = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                    if observed is not None: break
                    if time.monotonic() >= deadline:
                        expired = True; break
                    time.sleep(0.05)
            finally:
                code = None
                if process is not None:
                    # The unreaped leader retains this owned process-group identity
                    # through closure of the original Support hosts and receiver.
                    try: os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError: pass
                    deadline = time.monotonic() + 1
                    while observed is None and time.monotonic() < deadline:
                        observed = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                        if observed is None: time.sleep(0.05)
                    try: os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    code = process.wait()
                stdout.flush(); os.fsync(stdout.fileno()); stderr.flush(); os.fsync(stderr.fileno())
                self.save_json(directory / (invocation + ".result.json"),
                               {"name":name, "returncode":code, "timeout":expired, "at":self.original.now()})
        require(code == 0 and not expired, "Inspect the actual " + name + " output in " + str(directory))
        return directory / (invocation + ".stdout")

    def receive_source(self):
        packed = self.read(Path(self.cfg["sourceInput"]), 8 * 1024 * 1024)
        if packed.startswith(b"\x1f\x8b"):
            with gzip.GzipFile(fileobj=io.BytesIO(packed)) as stream:
                raw = stream.read(8 * 1024 * 1024 + 1)
        else:
            raw = packed
        require(len(raw) == 5562980 and hashlib.sha256(raw).hexdigest() == INPUT_SHA, "The complete current-source input changed.")
        value = self.original.json_read(raw)
        require(value.get("schema") == "stellar-forge.incident-recovery-source-input.v1" and
                value["source"]["commit"] == APP_COMMIT, "Select the complete current-source input.")
        metadata = value["metadata"]
        selected = metadata["requiredPaths"] + value["additionalPaths"]
        require(len(selected) == len(set(selected)) == 797, "Receive the entire 797-file source selection.")
        entries = {row["path"]:row for row in metadata["tree"]["tree"]}
        delta = {row["path"]:row for row in value["objects"]}
        require(len(delta) == len(value["objects"]) == 100, "Use all 100 changed or new source bodies.")
        incoming = self.original.private_directory(self.work / "incoming")
        metadata_file = self.work / "current-source-metadata.json"
        self.save_json(metadata_file, metadata)
        with zipfile.ZipFile(self.baseline_package) as archive:
            require(len(archive.namelist()) == len(set(archive.namelist())), "The original package has duplicate members.")
            original_customer = archive.read("native/customer.mjs")
            require(git_blob(original_customer) == CUSTOMER_GIT, "The original customer source changed.")
            self.original_customer = self.work / "original-customer.mjs"
            self.save(self.original_customer, original_customer)
            self.selected = []
            for name in selected:
                row = entries[name]
                require(row["type"] == "blob" and row["mode"] in ("100644", "100755"), "Select original regular source files.")
                require(not name.startswith("/") and ".." not in Path(name).parts, "Source path escaped its root.")
                if name in delta:
                    incoming_row = delta[name]
                    require((incoming_row["sha"], incoming_row["mode"], incoming_row["bytes"]) ==
                            (row["sha"], row["mode"], row["size"]), "Changed source metadata differs.")
                    body = incoming_row["content"].encode("utf-8")
                else:
                    member = archive.getinfo("source/" + name)
                    require(member.file_size == row["size"] and member.file_size <= 2 * 1024 * 1024, "Original source member size changed.")
                    body = archive.read(member)
                require(len(body) == row["size"] and git_blob(body) == row["sha"], "A full selected source body changed: " + name)
                self.save(incoming / (row["sha"] + ".blob"), body)
                self.selected.append({"path":name, "bytes":len(body), "gitBlob":row["sha"], "mode":row["mode"]})
        require(sum(row["bytes"] for row in self.selected) == 11343307, "The complete source byte count changed.")
        command = [self.base_config["python"], "-B", str(self.source_receiver), "--metadata", str(metadata_file),
                   "--commit", APP_COMMIT, "--directory", str(self.work / "source-cache"), "--git", self.base_config["git"],
                   "--incoming", str(incoming), "--materialize", str(self.source)]
        for name in value["additionalPaths"]:
            command.extend(["--additional-path", name])
        self.child("complete-current-source", command, 180)
        self.save_json(self.project / "source-receiving.json",
                       {"source":value["source"], "sourceInputSha256":INPUT_SHA, "files":self.selected})
        return metadata_file

    def package(self, metadata_file):
        result = self.json(self.customer / "result.json")
        require(result.get("state") == "COMPLETE" and result["source"]["commit"] == APP_COMMIT and
                result["originalSessionUnchanged"] is True and result["notificationsSent"] == 0,
                "Complete the real original recovery and independent receiving flow.")
        output = self.project / "Object_Incident_Recovery_Receiving_20261012.zip"
        files = [("source/" + row["path"], self.source / row["path"], row) for row in self.selected]
        for file in sorted(self.customer.rglob("*")):
            require(not file.is_symlink(), "Customer source contains a symlink.")
            if file.is_file():
                files.append(("receiving/" + file.relative_to(self.customer).as_posix(), file, None))
        profile = self.json(Path(self.base_config["customer_directory"]) / "incident-sources.private.json")
        session = Path(profile["sources"][0]["objectSessions"][0]["directory"])
        after = self.json(self.customer / "original-session-after.json")
        for row in after:
            file = session / row["path"]
            files.append(("object-session/" + row["path"], file,
                          {"bytes":row["bytes"], "sha256":row["sha256"], "mode":row["mode"]}))
        files += [("baseline/" + self.baseline_package.name, self.baseline_package, None),
                  ("baseline/delivery-result.json", self.baseline_delivery, None),
                  ("baseline/configuration.private.json", self.base / "configuration.private.json", None),
                  ("source-metadata.json", metadata_file, None),
                  ("source-input" + (".json.gz" if str(self.cfg["sourceInput"]).endswith(".gz") else ".json"), Path(self.cfg["sourceInput"]), None),
                  ("native/incident-recovery-customer.mjs", self.driver, None),
                  ("native/git-object-receiving.py", self.source_receiver, None),
                  ("native/original-customer.mjs", self.original_customer, None),
                  ("native/original-runner.py", Path(self.cfg["originalRunner"]), None),
                  ("native/run-recovery.py", Path(__file__).resolve(), None),
                  ("RECEIVING.md", Path(self.cfg["guide"]), None)]
        if self.cfg.get("deliveryContinuation"):
            continuation = Path(self.cfg["deliveryContinuation"])
            require(continuation.is_absolute(), "Use an absolute retained delivery continuation.")
            files.append(("native/complete-support-recovery.py", continuation, None))
        manifest_schema = "stellar-forge.incident-recovery-receiving-package.v1"
        if output.exists():
            raw = self.read(output, 128 * 1024 * 1024)
            with zipfile.ZipFile(output) as archive:
                manifest = self.original.json_read(archive.read("MANIFEST.json"))
                require(manifest.get("schema") == manifest_schema and manifest["operationId"] == self.cfg["operationId"] and
                        manifest["sourceCommit"] == APP_COMMIT, "An existing package belongs to another programme.")
                require(set(archive.namelist()) == {row["path"] for row in manifest["files"]} | {"MANIFEST.json"},
                        "The retained full package member set changed.")
                for row in manifest["files"]:
                    body = archive.read(row["path"])
                    require(len(body) == row["bytes"] and hashlib.sha256(body).hexdigest() == row["sha256"],
                            "A retained package member changed.")
        else:
            temporary = self.project / ("." + output.name + "." + uuid.uuid4().hex + ".tmp")
            members = []; names = set()
            try:
                with open(temporary, "xb") as stream:
                    os.fchmod(stream.fileno(), 0o600)
                    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                        for name, file, expected in files:
                            require(name not in names and not name.startswith("/") and ".." not in Path(name).parts, "Invalid package member.")
                            names.add(name); body = self.read(file, 50 * 1024 * 1024)
                            if expected:
                                require(len(body) == expected["bytes"], "A selected package member changed size.")
                                if "gitBlob" in expected:
                                    require(git_blob(body) == expected["gitBlob"], "A selected source member changed.")
                                if "sha256" in expected:
                                    require(hashlib.sha256(body).hexdigest() == expected["sha256"], "The complete original Object session changed.")
                            info = zipfile.ZipInfo(name, (2026,10,12,0,0,0))
                            info.compress_type = zipfile.ZIP_DEFLATED; info.create_system = 3
                            selected_mode = expected.get("mode") if expected else file.stat().st_mode & 0o777
                            mode = 0o755 if selected_mode == "100755" else 0o644 if selected_mode == "100644" else selected_mode if type(selected_mode) is int else 0o600
                            info.external_attr = ((stat.S_IFREG | mode) << 16)
                            archive.writestr(info, body)
                            members.append({"path":name, "bytes":len(body), "sha256":hashlib.sha256(body).hexdigest()})
                        manifest = {"schema":manifest_schema, "operationId":self.cfg["operationId"], "sourceCommit":APP_COMMIT,
                                    "originalSessionId":result["originalSessionId"], "caseId":result["case"]["id"], "files":members}
                        archive.writestr("MANIFEST.json", self.original.json_bytes(manifest))
                    stream.flush(); os.fsync(stream.fileno())
                os.link(temporary, output)
                parent = os.open(self.project, os.O_RDONLY | os.O_DIRECTORY)
                try: os.fsync(parent)
                finally: os.close(parent)
            finally:
                try: temporary.unlink()
                except FileNotFoundError: pass
            raw = self.read(output, 128 * 1024 * 1024)
        identity = {"path":str(output), "filename":output.name, "bytes":len(raw),
                    "sha256":hashlib.sha256(raw).hexdigest(), "members":len(manifest["files"])+1, "sourceCommit":APP_COMMIT}
        self.save_json(self.project / "package-identity.json", identity)
        return output, identity

    def save_package(self, output, identity):
        result_file = self.project / "library-result.private.json"
        dispatch = self.project / "library-dispatch.private.json"
        if result_file.exists():
            result = self.json(result_file)
        else:
            require(not dispatch.exists(), "The original Library dispatch requires reconciliation from its retained calls; do not send a second upload.")
            helpers = Path(self.base_config["library_helpers"])
            for name, expected in self.base_config["library_helper_sha256"].items():
                require(hashlib.sha256(self.read(helpers / name, 2 * 1024 * 1024)).hexdigest() == expected,
                        "The original Library helper changed.")
            sys.path.insert(0, str(helpers))
            from library_upload import LibraryUploadWorkflow, HostedAppsClient, LibraryFileMaterializer, SignedUrlUploader
            binding = {"operationId":self.cfg["operationId"], "package":identity,
                       "configurationSha256":hashlib.sha256(self.read(self.config_file, 262144)).hexdigest()}
            self.save_json(dispatch, binding)
            client = self.original.RecordingHostedAppsClient(HostedAppsClient(), self.project / "library-calls", binding)
            result = LibraryUploadWorkflow(apps_client=client, materializer=LibraryFileMaterializer(),
                       uploader=SignedUrlUploader(), state_parent=self.work).run(
                       {"uploads":[{"local_path":str(output), "purpose":"create_library_file", "library_artifact_type":"other"}]})
            self.save_json(result_file, result)
        items = result.get("results") if isinstance(result, dict) else None
        require(isinstance(items, list) and len(items) == 1, "Inspect the original Library result shape.")
        item = items[0]
        require(item.get("status") == "succeeded" and item.get("local_path") == str(output) and
                item.get("purpose") == "create_library_file", "Inspect the original full package save result.")
        for name in ("file_id", "library_file_id", "file_name"):
            require(isinstance(item.get(name), str) and bool(item[name].strip()), "The saved file identity is incomplete.")
        delivery = {"state":"COMPLETE", "nativeState":"COMPLETE", "operationId":self.cfg["operationId"], "package":identity,
                    "savedFile":{name:item[name] for name in ("file_id","library_file_id","file_name","current_version_number","local_metadata_applied") if name in item}}
        self.save_json(self.project / "delivery-result.json", delivery)
        print(json.dumps({"phase":"INCIDENT_RECOVERY_DELIVERY_COMPLETE", **delivery}), flush=True)

    def run(self):
        completed = self.project / "delivery-result.json"
        if completed.exists():
            value = self.json(completed)
            require(value.get("state") == "COMPLETE" and value.get("operationId") == self.cfg["operationId"], "The retained programme differs.")
            print(json.dumps({"phase":"INCIDENT_RECOVERY_DELIVERY_COMPLETE", "reused":True, **value}), flush=True)
            return
        metadata_file = self.receive_source()
        driver_config = {"schema":"stellar-forge.incident-recovery-receiving.v1", "sourceCommit":APP_COMMIT,
                         "sourceDirectory":str(self.source), "directory":str(self.customer),
                         "baselineDirectory":self.base_config["customer_directory"],
                         "baselineDelivery":str(self.baseline_delivery), "originalCustomer":str(self.original_customer),
                         "sourceInput":self.cfg["sourceInput"], "python":self.base_config["python"]}
        selected = self.project / "customer-configuration.private.json"
        self.save_json(selected, driver_config)
        self.child("original-incident-recovery", [self.base_config["node"], str(self.driver), str(selected)], 300)
        output, identity = self.package(metadata_file)
        self.save_json(self.project / "native-result.json", {"state":"COMPLETE", "operationId":self.cfg["operationId"], "package":identity})
        self.save_package(output, identity)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, lambda sig, frame: (_ for _ in ()).throw(SystemExit(128 + sig)))
    programme = Programme(args.config)
    with open(programme.project / "programme.lock", "a+b") as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        programme.run()

if __name__ == "__main__":
    main()
