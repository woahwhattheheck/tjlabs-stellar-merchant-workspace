#!/usr/bin/env python3
"""Deliver a completed Support customer and continue recovery in one retained process."""
from __future__ import annotations
import argparse, fcntl, hashlib, json, os, signal, stat, sys, types, uuid, zipfile
from pathlib import Path

ORIGINAL_RUNNER_GIT = "ee7a28366f38960e101b27c589cd6401c2f13068"
SOURCE_COMMIT = "f7200d52fdc5722619d0cf708041ee46db447e7f"
RECOVERY_PROGRAMME_GIT = "c0a3fecf26db367264a8fe9d8ac17e0c67906cab"

def require(value, message):
    if not value:
        raise RuntimeError(message)

def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()

def load_original(file):
    file = Path(file)
    require(file.is_absolute() and file.resolve(strict=True) == file, "Select the absolute unchanged original runner.")
    raw = file.read_bytes()
    require(git_blob(raw) == ORIGINAL_RUNNER_GIT, "The original runner source changed.")
    module = types.ModuleType("scf_completed_original_support")
    module.__file__ = str(file)
    sys.modules[module.__name__] = module
    exec(compile(raw, str(file), "exec"), module.__dict__)
    return module

class Completion:
    def __init__(self, args):
        self.args = args
        self.original = load_original(args.original_runner)
        self.read = self.original.regular_bytes
        self.json = lambda file: self.original.json_read(self.read(file, 16 * 1024 * 1024))
        self.save = self.original.save_bytes
        self.save_json = self.original.save_json
        self.config_file = Path(args.config).resolve(strict=True)
        self.config_bytes = self.read(self.config_file, 262144)
        self.cfg = self.original.json_read(self.config_bytes)
        require(self.cfg.get("schema") == "stellar-forge.object-support-native-receiving.v1" and
                self.cfg.get("source_commit") == SOURCE_COMMIT, "Select the completed original Support configuration.")
        self.base = Path(self.cfg["project"])
        require(self.base.is_absolute() and self.base.resolve(strict=True) == self.base, "The original project changed.")
        self.original_lock = open(self.base / "customer-execution.lock", "rb")
        fcntl.flock(self.original_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.stage = self.original.private_directory(args.staging_directory)
        require(self.stage != self.base and self.base not in self.stage.parents and self.stage not in self.base.parents,
                "Use a separate private completion directory.")
        self.customer = Path(self.cfg["customer_directory"])
        self.customer_bytes = self.read(self.customer / "result.json", 2097152)
        self.customer_sha = hashlib.sha256(self.customer_bytes).hexdigest()
        require(self.customer_sha == args.expected_customer_sha256, "The completed customer outcome changed.")
        self.customer_result = self.original.json_read(self.customer_bytes)
        require(self.customer_result.get("state") == "COMPLETE" and
                self.customer_result.get("sourceCommit") == SOURCE_COMMIT and
                self.customer_result.get("originalSessionUnchanged") is True and
                self.customer_result.get("buyerPurchased") is False and
                self.customer_result.get("buyerFinalized") is False,
                "Continue the actual completed original customer.")
        for label in ("original-git-receiving", "original-object-support-customer"):
            result = self.json(self.base / "native-logs" / (label + "-result.private.json"))
            require(result.get("returncode") == 0 and result.get("timeout") is False,
                    "The original native child did not complete: " + label)
        self.sources = self.json(self.base / "source-receiving.json")
        require(self.sources.get("source") == {"repository":self.cfg["repository"], "commit":SOURCE_COMMIT,
                "tree":self.cfg["source_tree"]} and len(self.sources.get("files", [])) == 737 and
                sum(row["bytes"] for row in self.sources["files"]) == 10269619,
                "The complete original source receipt changed.")
        self.native_source = self.original.private_directory(self.stage / "original-native")
        native_files = [("customer.mjs", Path(args.baseline_customer or self.base / "source" / "customer.mjs"), self.cfg["customer"]),
                        ("git-object-receiving.py", Path(args.baseline_source_receiver or self.base / "source" / "git-object-receiving.py"), self.cfg["git_receiver"]),
                        ("source-metadata.json", Path(args.baseline_metadata or self.base / "source" / "source-metadata.json"), self.cfg["metadata"]),
                        ("RECEIVING.md", Path(args.baseline_guide), self.cfg["guide"])]
        for name, file, pin in native_files:
            require(file.is_absolute(), "Use absolute retained native source paths.")
            raw = self.read(file, 2 * 1024 * 1024)
            self.original.Receiving.verify_pin(raw, pin)
            self.save(self.native_source / name, raw)
        self.receiver = object.__new__(self.original.Receiving)
        self.receiver.cfg = self.cfg
        self.receiver.project = self.stage
        self.receiver.work = self.stage
        self.receiver.tree = Path(args.application_source or self.base / "application")
        require(self.receiver.tree.is_absolute() and self.receiver.tree.resolve(strict=True) == self.receiver.tree,
                "Select the retained complete original application.")
        self.receiver.configuration_sha = hashlib.sha256(self.config_bytes).hexdigest()
        self.binding = {"schema":"stellar-forge.retained-support-delivery.v1",
                        "operationId":self.cfg["operation_id"],
                        "configurationSha256":self.receiver.configuration_sha,
                        "completedCustomerSha256":self.customer_sha,
                        "sourceCommit":SOURCE_COMMIT, "originalProject":str(self.base),
                        "stagingDirectory":str(self.stage),
                        "originalRunnerGit":ORIGINAL_RUNNER_GIT}
        self.save_json(self.stage / "binding.private.json", self.binding)
        self.save(self.stage / "original-configuration.private.json", self.config_bytes)
        self.save(self.stage / "completed-customer.json", self.customer_bytes)
        self.save(self.stage / "source-receiving.json", self.read(self.base / "source-receiving.json", 2097152))

    def verify_package(self, identity):
        file = Path(identity["path"])
        raw = self.read(file, 50 * 1024 * 1024)
        require(len(raw) == identity["bytes"] and hashlib.sha256(raw).hexdigest() == identity["sha256"],
                "The retained complete package changed.")
        with zipfile.ZipFile(file) as archive:
            manifest = self.original.json_read(archive.read("MANIFEST.json"))
            require(manifest.get("schema") == "stellar-forge.object-support-receiving-package.v1" and
                    manifest.get("nativeOperationId") == self.cfg["operation_id"] and
                    manifest.get("originalSessionId") == self.customer_result["originalSessionId"],
                    "The retained package belongs to another customer.")
            require(len(archive.namelist()) == len(set(archive.namelist())) and
                    set(archive.namelist()) == {row["path"] for row in manifest["files"]} | {"MANIFEST.json"},
                    "The complete package inventory changed.")
            for row in manifest["files"]:
                body = archive.read(row["path"])
                require(len(body) == row["bytes"] and hashlib.sha256(body).hexdigest() == row["sha256"],
                        "A retained package member changed.")
        return file

    def mirror(self, name, value):
        try:
            self.save_json(self.base / name, value)
            return {"path":str(self.base / name), "saved":True}
        except OSError as error:
            return {"path":str(self.base / name), "saved":False, "errorType":type(error).__name__, "errno":error.errno}

    def deliver_baseline(self):
        delivered = self.stage / "delivery-result.json"
        if delivered.exists():
            value = self.json(delivered)
            require(value.get("state") == "COMPLETE" and value.get("nativeState") == "COMPLETE" and
                    value.get("operationId") == self.cfg["operation_id"], "The retained delivery differs.")
            self.verify_package(value["package"])
            self.mirror("delivery-result.json", value)
            return value
        require(not (self.base / "library-dispatch.private.json").exists(),
                "Reconcile the original Library dispatch before this delivery continuation.")
        require(not (self.base / "delivery-result.json").exists(),
                "The original delivery is already complete; select that result.")
        identity_file = self.stage / "package-identity.json"
        if identity_file.exists():
            identity = self.json(identity_file)
            output = self.verify_package(identity)
        else:
            # The original complete packager is reused. No source acquisition or customer run occurs.
            self.receiver.work = self.native_source
            try:
                output, identity = self.receiver.package(
                    self.native_source / "RECEIVING.md", self.native_source / "source-metadata.json", self.sources["files"])
            finally:
                self.receiver.work = self.stage
        self.save_json(self.stage / "native-result.json",
                       {"state":"NATIVE_COMPLETE", "operationId":self.cfg["operation_id"],
                        "completedCustomerSha256":self.customer_sha, "package":identity})
        result_file = self.stage / "library-result.private.json"
        dispatch = self.stage / "library-dispatch.private.json"
        if result_file.exists():
            result = self.json(result_file)
        else:
            require(not dispatch.exists(), "Reconcile this retained Library dispatch before another upload.")
            helpers = Path(self.cfg["library_helpers"])
            for name, expected in self.cfg["library_helper_sha256"].items():
                require(hashlib.sha256(self.read(helpers / name, 2097152)).hexdigest() == expected,
                        "The retained upload helper changed.")
            sys.path.insert(0, str(helpers))
            from library_upload import LibraryUploadWorkflow, HostedAppsClient, LibraryFileMaterializer, SignedUrlUploader
            binding = {**self.binding, "package":identity}
            self.save_json(dispatch, binding)
            client = self.original.RecordingHostedAppsClient(HostedAppsClient(), self.stage / "library-calls", binding)
            result = LibraryUploadWorkflow(apps_client=client, materializer=LibraryFileMaterializer(),
                       uploader=SignedUrlUploader(), state_parent=self.stage).run(
                       {"uploads":[{"local_path":str(output), "purpose":"create_library_file", "library_artifact_type":"other"}]})
            self.save_json(result_file, result)
        rows = result.get("results") if isinstance(result, dict) else None
        require(isinstance(rows, list) and len(rows) == 1, "Inspect the retained upload result.")
        item = rows[0]
        require(item.get("status") == "succeeded" and item.get("local_path") == str(output) and
                item.get("purpose") == "create_library_file", "The full package is not saved.")
        for name in ("file_id", "library_file_id", "file_name"):
            require(isinstance(item.get(name), str) and bool(item[name].strip()), "The saved-file identity is incomplete.")
        require(isinstance(item.get("local_metadata_applied"), bool), "The saved-file metadata result is missing.")
        value = {"state":"COMPLETE", "nativeState":"COMPLETE", "operationId":self.cfg["operation_id"],
                 "package":identity, "at":self.original.now(),
                 "completedCustomerSha256":self.customer_sha,
                 "savedFile":{name:item[name] for name in ("file_id","library_file_id","file_name",
                              "current_version_number","local_metadata_applied") if name in item}}
        self.save_json(delivered, value)
        mirror = self.mirror("delivery-result.json", value)
        self.save_json(self.stage / "original-project-receipt.json", mirror)
        print(json.dumps({"phase":"RETAINED_SUPPORT_DELIVERY_COMPLETE", **value, "originalProjectReceipt":mirror}), flush=True)
        return value

    def continue_recovery(self, baseline):
        programme = Path(self.args.recovery_programme).resolve(strict=True)
        require(git_blob(self.read(programme, 262144)) == RECOVERY_PROGRAMME_GIT,
                "The selected complete recovery programme changed.")
        config = self.json(Path(self.args.recovery_config).resolve(strict=True))
        require(config.get("schema") == "stellar-forge.incident-recovery-programme.v1" and
                config.get("baselineProject") == str(self.base) and
                Path(config.get("originalRunner", "")).resolve(strict=True) == Path(self.args.original_runner).resolve(strict=True),
                "Select the same baseline and original runner for current recovery.")
        config["baselineDelivery"] = str(self.stage / "delivery-result.json")
        config["deliveryContinuation"] = str(Path(__file__).resolve())
        selected = self.stage / "recovery-configuration.private.json"
        self.save_json(selected, config)
        result_file = Path(config["project"]) / "delivery-result.json"
        if result_file.exists():
            recovery = self.json(result_file)
            require(recovery.get("state") == "COMPLETE" and recovery.get("operationId") == config["operationId"],
                    "Inspect the retained current recovery result.")
        else:
            self.receiver.child("current-recovery-" + uuid.uuid4().hex,
                                [self.cfg["python"], "-B", str(programme), "--config", str(selected)], timeout=600)
            recovery = self.json(result_file)
        require(recovery.get("state") == "COMPLETE" and recovery.get("nativeState") == "COMPLETE" and
                recovery.get("operationId") == config["operationId"], "The complete current recovery is not delivered.")
        package = recovery["package"]
        raw = self.read(package["path"], 128 * 1024 * 1024)
        require(len(raw) == package["bytes"] and hashlib.sha256(raw).hexdigest() == package["sha256"],
                "The full current recovery package changed.")
        combined = {"schema":"stellar-forge.retained-support-and-recovery-delivery.v1", "state":"COMPLETE",
                    "originalOperationId":self.cfg["operation_id"], "baseline":baseline, "recovery":recovery,
                    "at":self.original.now()}
        self.save_json(self.stage / "continuation-result.json", combined)
        mirror = self.mirror("support-recovery-delivery-result.json", combined)
        print(json.dumps({"phase":"RETAINED_SUPPORT_AND_RECOVERY_COMPLETE", **combined,
                          "originalProjectReceipt":mirror}), flush=True)
        return combined

    def run(self):
        baseline = self.deliver_baseline()
        if self.args.recovery_programme:
            return self.continue_recovery(baseline)
        return baseline

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--original-runner", required=True)
    parser.add_argument("--staging-directory", required=True)
    parser.add_argument("--expected-customer-sha256", required=True)
    parser.add_argument("--baseline-guide", required=True)
    parser.add_argument("--baseline-customer")
    parser.add_argument("--baseline-source-receiver")
    parser.add_argument("--baseline-metadata")
    parser.add_argument("--application-source")
    parser.add_argument("--recovery-programme")
    parser.add_argument("--recovery-config")
    args = parser.parse_args()
    require(bool(args.recovery_programme) == bool(args.recovery_config), "Select both recovery programme and configuration.")
    for number in (signal.SIGTERM, signal.SIGINT):
        signal.signal(number, lambda sig, frame: (_ for _ in ()).throw(SystemExit(128 + sig)))
    completion = Completion(args)
    with open(completion.stage / "completion.lock", "a+b") as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            completion.run()
        finally:
            completion.original_lock.close()

if __name__ == "__main__":
    main()
