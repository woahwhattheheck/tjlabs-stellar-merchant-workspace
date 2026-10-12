#!/usr/bin/env python3
"""Receive the selected original application and complete its saved-Object Support journey."""
from __future__ import annotations
import argparse, base64, copy, datetime, fcntl, hashlib, importlib.util, json
import os, re, signal, stat, subprocess, sys, time, uuid, zipfile
from pathlib import Path

def need(value, code):
    if not value: raise RuntimeError(code)

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")

def digest_bytes(raw):
    return hashlib.sha256(raw).hexdigest()

def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()

def pairs(rows):
    result = {}
    for key, value in rows:
        need(key not in result, "DUPLICATE_JSON_MEMBER")
        result[key] = value
    return result

def json_read(raw):
    return json.loads(raw, object_pairs_hook=pairs)

def private_directory(path):
    path = Path(path)
    need(path.is_absolute(), "ABSOLUTE_PRIVATE_PATH_REQUIRED")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    actual = path.lstat()
    need(stat.S_ISDIR(actual.st_mode) and not stat.S_ISLNK(actual.st_mode) and
         actual.st_uid == os.getuid() and actual.st_mode & 0o077 == 0 and
         path.resolve(strict=True) == path, "PRIVATE_DIRECTORY_CHANGED")
    return path

def regular_bytes(path, limit):
    path = Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= limit, "SOURCE_FILE_SIZE_OR_TYPE")
        with os.fdopen(os.dup(fd), "rb") as stream: raw = stream.read(limit + 1)
        after = os.fstat(fd); named = path.lstat()
        fields = lambda item: (item.st_dev, item.st_ino, item.st_size, item.st_mtime_ns, item.st_ctime_ns)
        need(fields(before) == fields(after) == fields(named) and len(raw) == before.st_size,
             "SOURCE_FILE_CHANGED_DURING_READ")
        return raw
    finally: os.close(fd)

def save_bytes(path, raw):
    path = Path(path); private_directory(path.parent)
    if os.path.lexists(path):
        need(regular_bytes(path, len(raw)) == raw, "RETAINED_BYTES_CHANGED:" + str(path))
        return
    temporary = path.parent / ("." + path.name + "." + uuid.uuid4().hex + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        try: os.link(temporary, path)
        except FileExistsError:
            need(regular_bytes(path, len(raw)) == raw, "CONCURRENT_RETAINED_BYTES_CHANGED")
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        try: temporary.unlink()
        except FileNotFoundError: pass

def save_json(path, value):
    save_bytes(path, json_bytes(value))

class RecordingHostedAppsClient:
    """Retain the original private prepare/finalize exchange without replaying it."""

    def __init__(self, client, directory, binding):
        self.client = client; self.directory = Path(directory); self.binding = copy.deepcopy(binding)
        need(not os.path.lexists(self.directory), "ORIGINAL_LIBRARY_CALL_JOURNAL_ALREADY_EXISTS")
        self.directory.mkdir(mode=0o700)
        need(self.directory.resolve(strict=True) == self.directory, "LIBRARY_JOURNAL_PARENT_CHANGED")
        self.sequence = 0
        save_json(self.directory / "binding.private.json", self.binding)

    def call_tool(self, connector_id, tool_name, arguments):
        self.sequence += 1
        stem = str(self.sequence).zfill(4)
        call = {"connector_id": connector_id, "tool_name": tool_name,
                "arguments": copy.deepcopy(arguments)}
        request = {"schema": "starforge.original-library-tool-call.v1",
                   "binding": self.binding, "sequence": self.sequence,
                   "status": "DISPATCHING", "at": now(), "call": call,
                   "callSha256": digest_bytes(json_bytes(call))}
        save_json(self.directory / (stem + "-request.private.json"), request)
        try:
            response = self.client.call_tool(connector_id, tool_name, arguments)
        except BaseException as error:
            uncertain = {"sequence": self.sequence, "callSha256": request["callSha256"],
                         "status": "UNCERTAIN", "at": now(),
                         "errorType": type(error).__name__, "error": str(error)}
            native_result = getattr(error, "result", None)
            if isinstance(native_result, dict):
                uncertain["nativeErrorResponse"] = copy.deepcopy(native_result)
            save_json(self.directory / (stem + "-uncertain.private.json"), uncertain)
            raise
        # A failed durable write stops the workflow before it can transfer or finalize.
        save_json(self.directory / (stem + "-response.private.json"),
                  {"sequence": self.sequence, "callSha256": request["callSha256"],
                   "status": "RETURNED", "at": now(), "response": response})
        return response


def memory_observation():
    root = Path("/sys/fs/cgroup")
    result = {}
    for name in ("memory.current", "memory.max", "memory.peak", "memory.events"):
        try: result[name] = (root / name).read_text().strip()
        except OSError as error: result[name] = {"unavailable": type(error).__name__}
    return result

class Receiving:
    def __init__(self, config_file):
        self.config_file = Path(config_file).resolve(strict=True)
        raw = regular_bytes(self.config_file, 262144); self.cfg = json_read(raw)
        need(self.cfg["schema"] == "stellar-forge.object-support-native-receiving.v1", "CONFIGURATION_SCHEMA")
        self.configuration_sha = digest_bytes(raw)
        self.project = private_directory(self.cfg["project"])
        self.work = private_directory(self.cfg["private_dev_root"])
        need(self.work.parent == Path("/dev"), "SELECTED_PRIVATE_CONTEXT_REQUIRED")
        context = json_read(regular_bytes(self.work / "context.json", 32768))
        need(context["operationId"] == self.cfg["operation_id"] and
             context["configurationSha256"] == self.configuration_sha, "ORIGINAL_CONTEXT_BINDING_CHANGED")
        self.source_attempt = uuid.uuid4().hex
        self.receipts = private_directory(self.project / "source-receipts" / self.source_attempt)
        save_json(self.receipts / "binding.private.json",
                  {"operationId":self.cfg["operation_id"], "configurationSha256":self.configuration_sha,
                   "sourceCommit":self.cfg["source_commit"], "attemptId":self.source_attempt,
                   "purpose":"Original immutable source reads; no native or Library replay", "at":now()})
        self.input = private_directory(self.work / "received-source")
        self.cache = self.work / "git-cache"
        self.tree = self.work / "source"
        self.sequence = 0
        adapter = Path(self.cfg["github_adapter"])
        need(digest_bytes(regular_bytes(adapter, 65536)) == self.cfg["github_adapter_sha256"],
             "ORIGINAL_GITHUB_ADAPTER_CHANGED")
        specification = importlib.util.spec_from_file_location("original_monitoring_github_ops", adapter)
        self.github = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(self.github)

    def get(self, pin):
        need(pin["repository"] == self.cfg["repository"] and
             re.fullmatch(r"[0-9a-f]{40}", pin["gitBlob"]), "SOURCE_PIN_INVALID")
        file = self.work / ("pin-" + pin["gitBlob"])
        if file.exists():
            raw = regular_bytes(file, pin["bytes"])
            self.verify_pin(raw, pin)
            return raw
        self.sequence += 1
        label = str(self.sequence).zfill(4) + "-" + pin["gitBlob"]
        request = {"schema":"commons.original-git-source-request.v1", "operationId":self.cfg["operation_id"],
                   "configurationSha256":self.configuration_sha, "sourceAttemptId":self.source_attempt,
                   "actor":"tokenjunkielabs", "method":"GET",
                   "path":"/repos/" + pin["repository"] + "/git/blobs/" + pin["gitBlob"],
                   "pin":pin, "at":now()}
        save_json(self.receipts / (label + "-request.private.json"), request)
        try:
            response = self.github.api_response(request["path"], actor="tokenjunkielabs")
        except BaseException as error:
            save_json(self.receipts / (label + "-error.private.json"),
                      {"status":"SOURCE_READ_FAILED", "at":now(), "errorType":type(error).__name__,
                       "message":str(error), "receipt":getattr(error, "receipt", None)})
            raise
        data = response["data"]
        # Preserve the original provider identity/deadline before advancing to source materialization.
        save_json(self.receipts / (label + "-response.private.json"),
                  {"receipt":response["receipt"], "at":now(),
                   "blob":{key:data.get(key) for key in ("sha", "size", "encoding", "url")}})
        need(data.get("sha") == pin["gitBlob"] and data.get("encoding") == "base64" and
             data.get("size") == pin["bytes"], "GITHUB_BLOB_WRAPPER_MISMATCH")
        content = data.get("content")
        need(isinstance(content, str) and len(content) <= (pin["bytes"] * 2 + 8192),
             "GITHUB_BLOB_CONTENT_SIZE")
        raw = base64.b64decode(re.sub(r"\s", "", content), validate=True)
        self.verify_pin(raw, pin)
        save_bytes(file, raw)
        return raw

    @staticmethod
    def verify_pin(raw, pin):
        need(len(raw) == pin["bytes"] and git_blob(raw) == pin["gitBlob"], "SOURCE_GIT_BLOB_MISMATCH")
        if pin.get("sha256"): need(digest_bytes(raw) == pin["sha256"], "SOURCE_SHA256_MISMATCH")

    def child(self, label, command, *, timeout=240):
        logs = private_directory(self.project / "native-logs")
        request_file = logs / (label + "-request.private.json")
        request = {"command":command, "cwd":str(self.work), "at":now(), "memoryBefore":memory_observation()}
        need(not request_file.exists(), "ORIGINAL_CHILD_REQUIRES_SAVED_OUTCOME_RECONCILIATION:" + label)
        save_json(request_file, request)
        process = None; observed = None; expired = False
        with open(logs / (label + ".stdout"), "xb") as stdout, open(logs / (label + ".stderr"), "xb") as stderr:
            try:
                process = subprocess.Popen(command, cwd=self.work, stdin=subprocess.DEVNULL, stdout=stdout,
                                           stderr=stderr, start_new_session=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE":"1", "SCF_PYTHON":self.cfg["python"]})
                deadline = time.monotonic() + timeout
                while True:
                    observed = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                    if observed is not None: break
                    if time.monotonic() >= deadline:
                        expired = True; break
                    time.sleep(0.05)
            finally:
                if process is not None:
                    # Leave the leader unreaped until the original owned group has been joined.
                    try: os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError: pass
                    deadline = time.monotonic() + 1
                    while observed is None and time.monotonic() < deadline:
                        observed = os.waitid(os.P_PID, process.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)
                        if observed is None: time.sleep(0.05)
                    try: os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                    code = process.wait()
                else: code = None
        result = {"returncode":code, "timeout":expired, "at":now(), "memoryAfter":memory_observation()}
        save_json(logs / (label + "-result.private.json"), result)
        need(code == 0 and not expired, "ORIGINAL_CHILD_INCOMPLETE:" + label)
        return result

    def receive_source(self):
        metadata_raw = self.get(self.cfg["metadata"])
        metadata = json_read(metadata_raw)
        need(metadata["source"] == {"repository":self.cfg["repository"], "commit":self.cfg["source_commit"],
                                   "tree":self.cfg["source_tree"]}, "SOURCE_AUTHORITY_CHANGED")
        rows = metadata["tree"] if isinstance(metadata["tree"], list) else metadata["tree"]["tree"]
        tree = {row["path"]:row for row in rows}
        required = {path:tree[path] for path in metadata["requiredPaths"]}
        need(len(required) == self.cfg["source_files"], "SOURCE_SELECTION_COUNT_CHANGED")
        selected_by_sha = {}
        for path, row in required.items():
            need(row["type"] == "blob" and row["mode"] in ("100644", "100755"), "SELECTED_SOURCE_TYPE")
            selected_by_sha[row["sha"]] = row
        seen = set(); received = []
        for index, pin in enumerate(self.cfg["source_carriers"], 1):
            value = json_read(self.get(pin))
            need(value.get("schema") == "commons.complete-original-source-carrier/v1" and
                 value.get("source_repository") == self.cfg["repository"] and
                 value.get("source_commit") == self.cfg["source_commit"] and
                 value.get("selection_manifest", {}).get("git_blob_sha") == self.cfg["metadata"]["gitBlob"],
                 "SOURCE_CARRIER_AUTHORITY_CHANGED")
            members = value.get("files"); need(isinstance(members, list) and len(members) == pin["files"], "SOURCE_CARRIER_COUNT")
            verified = []
            for member in members:
                oid = member["git_blob_sha"]; source_path = member["source_path"]
                need(source_path in required and required[source_path]["sha"] == oid and oid not in seen and
                     member["path"] == oid + ".blob" and isinstance(member["content"], str),
                     "SOURCE_CARRIER_MEMBER_SELECTION_CHANGED")
                raw = member["content"].encode("utf-8")
                need(len(raw) == required[source_path]["size"] == member["bytes"] and
                     git_blob(raw) == oid and digest_bytes(raw) == member["sha256"], "SOURCE_CARRIER_MEMBER_CHANGED")
                seen.add(oid); verified.append((oid, raw))
            need(sum(len(raw) for _, raw in verified) == pin["totalSourceBytes"] == value["total_source_bytes"],
                 "SOURCE_CARRIER_BYTE_COUNT_CHANGED")
            # Every member of this immutable part is validated before publication.
            for oid, raw in verified: save_bytes(self.input / (oid + ".blob"), raw)
            received.append({"gitBlob":pin["gitBlob"], "files":len(verified), "sourceBytes":value["total_source_bytes"]})
            print(json.dumps({"phase":"ORIGINAL_SOURCE_PART_RECEIVED", "part":index, "files":len(verified)}), flush=True)
        need(seen == set(selected_by_sha), "COMPLETE_ORIGINAL_SOURCE_NOT_RECEIVED")
        for pin in self.cfg["additional_sources"]:
            need(pin["path"] in tree and tree[pin["path"]]["sha"] == pin["gitBlob"] and
                 tree[pin["path"]]["size"] == pin["bytes"], "ORIGINAL_ADDITIONAL_SOURCE_CHANGED")
            save_bytes(self.input / (pin["gitBlob"] + ".blob"), self.get(pin))
        metadata_file = self.work / "source-metadata.json"; save_bytes(metadata_file, metadata_raw)
        receiver = self.work / "git-object-receiving.py"; save_bytes(receiver, self.get(self.cfg["git_receiver"]))
        customer = self.work / "customer.mjs"; save_bytes(customer, self.get(self.cfg["customer"]))
        guide = self.work / "RECEIVING.md"; save_bytes(guide, self.get(self.cfg["guide"]))
        command = [self.cfg["python"], "-B", str(receiver), "--metadata", str(metadata_file),
                   "--commit", self.cfg["source_commit"], "--directory", str(self.cache),
                   "--git", self.cfg["git"], "--incoming", str(self.input), "--materialize", str(self.tree)]
        for path in self.cfg.get("incoming", []):
            if Path(path).is_dir(): command += ["--incoming", path]
        for pin in self.cfg["additional_sources"]: command += ["--additional-path", pin["path"]]
        self.child("original-git-receiving", command)
        source_files = []
        for path in [*required, *(pin["path"] for pin in self.cfg["additional_sources"])]:
            row = tree[path]; raw = regular_bytes(self.tree / path, row["size"])
            need(len(raw) == row["size"] and git_blob(raw) == row["sha"], "MATERIALIZED_ORIGINAL_SOURCE_CHANGED")
            source_files.append({"path":path, "bytes":len(raw), "gitBlob":row["sha"], "sha256":digest_bytes(raw), "mode":row["mode"]})
        save_json(self.project / "source-receiving.json",
                  {"source":metadata["source"], "metadata":self.cfg["metadata"], "files":source_files, "carriers":received})
        return customer, guide, metadata_file, source_files

    def package(self, guide, metadata_file, source_files):
        customer_root = Path(self.cfg["customer_directory"])
        outcome = json_read(regular_bytes(customer_root / "result.json", 2097152))
        need(outcome.get("state") == "COMPLETE" and outcome.get("sourceCommit") == self.cfg["source_commit"] and
             outcome.get("originalSessionUnchanged") is True and outcome.get("buyerPurchased") is False and
             outcome.get("buyerFinalized") is False, "ORIGINAL_CUSTOMER_NOT_COMPLETE")
        files = []
        for row in source_files: files.append(("source/" + row["path"], self.tree / row["path"], row))
        for name in ("result.json", "independent-receiving-result.json", "original-session-after.json"):
            files.append(("receiving/" + name, customer_root / name, None))
        for file in sorted((customer_root / "deliverables").rglob("*")):
            need(not file.is_symlink(), "DELIVERABLE_SYMLINK_REFUSED")
            if file.is_file(): files.append(("receiving/deliverables/" + file.relative_to(customer_root / "deliverables").as_posix(), file, None))
        files += [("RECEIVING.md", guide, None), ("source-metadata.json", metadata_file, None),
                  ("native/customer.mjs", self.work / "customer.mjs", self.cfg["customer"])]
        output = self.project / "Object_Incident_Support_Receiving_20261012.zip"
        need(not os.path.lexists(output), "ORIGINAL_PACKAGE_ALREADY_EXISTS_RECONCILE")
        temporary = self.project / ("." + output.name + "." + uuid.uuid4().hex + ".tmp")
        inventory = []; names = set()
        try:
            with open(temporary, "xb") as stream:
                os.fchmod(stream.fileno(), 0o600)
                with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                    for name, file, expected in files:
                        need(name not in names and not name.startswith("/") and ".." not in Path(name).parts,
                             "PACKAGE_MEMBER_INVALID")
                        names.add(name)
                        raw = regular_bytes(file, 16 * 1024 * 1024)
                        if expected:
                            need(len(raw) == expected["bytes"] and git_blob(raw) == expected["gitBlob"],
                                 "PACKAGE_SOURCE_CHANGED")
                        info = zipfile.ZipInfo(name, (2026, 10, 12, 0, 0, 0))
                        info.compress_type = zipfile.ZIP_DEFLATED; info.create_system = 3
                        info.external_attr = ((0o100755 if expected and expected.get("mode") == "100755" else 0o100644) << 16)
                        archive.writestr(info, raw)
                        inventory.append({"path":name, "bytes":len(raw), "sha256":digest_bytes(raw),
                                          **({"gitBlob":expected["gitBlob"]} if expected else {})})
                    manifest = {"schema":"stellar-forge.object-support-receiving-package.v1",
                                "source":{"repository":self.cfg["repository"], "commit":self.cfg["source_commit"],
                                          "tree":self.cfg["source_tree"]},
                                "nativeOperationId":self.cfg["operation_id"], "originalSessionId":outcome["originalSessionId"],
                                "files":inventory}
                    archive.writestr("MANIFEST.json", json_bytes(manifest))
                stream.flush(); os.fsync(stream.fileno())
            os.link(temporary, output)
            directory = os.open(self.project, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(directory)
            finally: os.close(directory)
        finally:
            try: temporary.unlink()
            except FileNotFoundError: pass
        raw = regular_bytes(output, 50 * 1024 * 1024)
        identity = {"path":str(output), "filename":output.name, "bytes":len(raw), "sha256":digest_bytes(raw),
                    "sourceCommit":self.cfg["source_commit"], "members":len(inventory)+1,
                    "nativeCustomerState":"COMPLETE", "at":now()}
        save_json(self.project / "package-identity.json", identity)
        save_json(self.project / "package-members.json", manifest)
        return output, identity

    def run(self):
        need(not (self.project / "library-dispatch.private.json").exists(),
             "ORIGINAL_LIBRARY_OUTCOME_REQUIRES_RECONCILIATION")
        customer, guide, metadata_file, source_files = self.receive_source()
        customer_config = {"schema":"stellar-forge.object-incident-support-customer.v1",
                           "sourceCommit":self.cfg["source_commit"], "directory":self.cfg["customer_directory"],
                           "objectSession":self.cfg["object_session"], "python":self.cfg["python"]}
        selected = self.work / "customer-configuration.private.json"; save_json(selected, customer_config)
        self.child("original-object-support-customer",
                   [self.cfg["node"], str(customer), "run", str(self.tree), str(selected)], timeout=300)
        package, identity = self.package(guide, metadata_file, source_files)
        save_json(self.project / "native-result.json",
                  {"state":"NATIVE_COMPLETE", "operationId":self.cfg["operation_id"], "package":identity,
                   "memoryObserved":memory_observation(), "at":now()})
        helpers = Path(self.cfg["library_helpers"])
        for name, expected in self.cfg["library_helper_sha256"].items():
            need(digest_bytes(regular_bytes(helpers / name, 2097152)) == expected, "ORIGINAL_LIBRARY_HELPER_CHANGED")
        sys.path.insert(0, str(helpers))
        from library_upload import LibraryUploadWorkflow, HostedAppsClient, LibraryFileMaterializer, SignedUrlUploader
        binding = {"operationId":self.cfg["operation_id"], "configurationSha256":self.configuration_sha, "package":identity}
        save_json(self.project / "library-dispatch.private.json", binding)
        client = RecordingHostedAppsClient(HostedAppsClient(), self.project / "library-calls", binding)
        result = LibraryUploadWorkflow(apps_client=client, materializer=LibraryFileMaterializer(),
                    uploader=SignedUrlUploader(), state_parent=self.work).run(
                    {"uploads":[{"local_path":str(package), "purpose":"create_library_file", "library_artifact_type":"other"}]})
        save_json(self.project / "library-result.private.json", result)
        ordered = result.get("results") if isinstance(result, dict) else None
        need(isinstance(ordered, list) and len(ordered) == 1 and isinstance(ordered[0], dict),
             "ORIGINAL_LIBRARY_RESULT_SHAPE")
        item = ordered[0]
        need(item.get("local_path") == str(package) and item.get("purpose") == "create_library_file",
             "ORIGINAL_LIBRARY_RESULT_IDENTITY")
        need(item.get("status") == "succeeded", "ORIGINAL_LIBRARY_SAVE_NOT_SUCCEEDED")
        for name in ("file_id", "library_file_id", "file_name"):
            need(isinstance(item.get(name), str) and bool(item[name].strip()),
                 "ORIGINAL_LIBRARY_SAVED_IDENTITY_MISSING")
        need(isinstance(item.get("local_metadata_applied"), bool), "ORIGINAL_LIBRARY_METADATA_RESULT_MISSING")
        version = item.get("current_version_number")
        if version is not None:
            need(type(version) is int and version >= 0, "ORIGINAL_LIBRARY_VERSION_INVALID")
        delivery = {"operationId":self.cfg["operation_id"], "state":"COMPLETE",
                    "nativeState":"COMPLETE", "package":identity, "at":now(),
                    "savedFile":{key:item[key] for key in ("file_id", "library_file_id", "file_name",
                                "local_metadata_applied", "current_version_number") if key in item}}
        save_json(self.project / "delivery-result.json", delivery)
        print(json.dumps({"phase":"ORIGINAL_SUPPORT_DELIVERY_COMPLETE", "operationId":self.cfg["operation_id"],
                          "nativeState":"COMPLETE", "package":identity, "savedFile":delivery["savedFile"]}), flush=True)

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--config", required=True)
    args = parser.parse_args()
    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, lambda sig, frame: (_ for _ in ()).throw(SystemExit(128 + sig)))
    receiving = Receiving(args.config)
    lock = open(receiving.project / "customer-execution.lock", "a+b")
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    try:
        receiving.run()
        save_json(receiving.project / "native-outcome.json",
                  {"operationId":receiving.cfg["operation_id"], "state":"COMPLETE", "at":now(),
                   "nativeResultPresent":(receiving.project / "native-result.json").exists(),
                   "packageIdentityPresent":(receiving.project / "package-identity.json").exists(),
                   "libraryResultPresent":(receiving.project / "library-result.private.json").exists()})
    except BaseException as error:
        value = {"operationId":receiving.cfg["operation_id"], "at":now(), "errorType":type(error).__name__,
                 "message":str(error), "nativeResultPresent":(receiving.project / "native-result.json").exists(),
                 "memoryObserved":memory_observation(), "state":"WRAPPER_FAILED"}
        file = receiving.project / ("receiving-interrupted-" + uuid.uuid4().hex + ".private.json")
        save_json(file, value)
        if not (receiving.project / "native-outcome.json").exists():
            save_json(receiving.project / "native-outcome.json", value)
        raise

if __name__ == "__main__":
    main()
