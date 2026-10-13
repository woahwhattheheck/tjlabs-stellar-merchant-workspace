"""Receive one committed distribution selection for the original native job.

The unchanged Git source reader, distribution builder and runtime installer own
source selection, source verification and dependency installation. This module
joins their existing operations; it never starts a native job or edits its request.
"""
from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import time

SCHEMA = "stellar-forge.paid-job-selected-source.v1"
BASE = Path("stellar/scf-starforge-20261009/distribution")
TOOLKIT = (
    "git-source.mjs", "build.mjs", "build-state.mjs", "browser-assets.mjs",
    "product-package.mjs", "specification.mjs", "source-selection.mjs",
    "runtime-install.mjs", "runtime-profile.mjs", "runtime-unpack.py",
)
RUNTIME_SELECTION = {"native": True, "features": ["schema"], "operator": True,
                     "pins": {"@stellar/stellar-sdk": "16.3.1"}}
OBJECT_RECEIVER = {"bytes": 49135, "gitBlob": "3d402bc7e20e0da26193d099ad9429d0b47feef2",
                   "sha256": "dfc4b853a0c44d1a2971caba1254ef0635dc3f268e82d45fa88b4eee2bdcd83d"}
BUILD_CALL = r"""
import { pathToFileURL } from 'node:url';
const input = JSON.parse(process.argv[1]);
const { buildDistribution } = await import(pathToFileURL(input.module).href);
try {
  const value = await buildDistribution({ ...input.options,
    onProgress: event => process.stderr.write('[starforge build] ' + JSON.stringify(event) + '\n') });
  console.log(JSON.stringify(value));
} catch (error) {
  console.log(JSON.stringify({ schema: 'stellar-forge.distribution-source-needed.v1',
    name: error.name, code: error.code, message: error.message,
    sourceCommit: error.sourceCommit, missingObjects: error.missingObjects }));
  process.exitCode = 1;
}
"""
TOOLKIT_READER = r"""
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const input = JSON.parse(process.argv[1]);
const { openGitSource } = await import(pathToFileURL(input.reader).href);
const source = openGitSource({ repository: input.repository, ref: input.commit, offline: input.offline });
if (source.commit !== input.commit) throw new Error('Selected toolkit commit changed');
const entries = input.paths.map(path => {
  const entry = source.tree.find(item => item.path === path);
  if (!entry) throw new Error('Missing original toolkit member: ' + path);
  return entry;
});
const files = source.readFiles(entries);
console.log(JSON.stringify({ sourceCommit: source.commit, files: entries.map(entry => {
  const bytes = files.get(entry.path);
  return { path: entry.path, gitBlob: entry.blob, mode: entry.mode, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), content: bytes.toString('base64') };
}), acquisition: source.metrics() }));
"""
RUNTIME_CALL = r"""
import { pathToFileURL } from 'node:url';
const input = JSON.parse(process.argv[1]);
const module = await import(pathToFileURL(input.module).href);
const names = { prepare: 'prepareRuntimeInstall', recover: 'recoverRuntime',
  install: 'installRuntime', inspect: 'inspectRuntimeInstall' };
if (!Object.hasOwn(names, input.action)) throw new Error('Unknown original runtime action');
console.log(JSON.stringify(await module[names[input.action]](input.options)));
"""


def _git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def _footprint(directory):
    """Observed bytes only; admission is still the original controller's job."""
    totals = {"directory": str(directory), "files": 0, "logicalBytes": 0,
              "allocatedBytes": 0, "complete": True, "errors": []}
    seen = set()

    def failed(error):
        totals["complete"] = False
        totals["errors"].append({"type": type(error).__name__, "path": error.filename})

    for parent, directories, files in os.walk(directory, followlinks=False, onerror=failed):
        for name in files:
            try:
                info = (Path(parent) / name).lstat()
                if not stat.S_ISREG(info.st_mode):
                    continue
                totals["files"] += 1
                totals["logicalBytes"] += info.st_size
                key = (info.st_dev, info.st_ino)
                if key not in seen:
                    seen.add(key)
                    totals["allocatedBytes"] += info.st_blocks * 512
            except OSError as error:
                failed(error)
    return totals


class _Receiver:
    def __init__(self, *, workspace, commit, logs, repository, selection, node, npm, python, offline, operations,
                 received_source=None):
        for name in ("require", "private_directory", "read_json", "regular", "immutable",
                     "encoded", "save", "execute", "output_json", "digest", "emit"):
            setattr(self, name, operations[name])
        self.require(re.fullmatch(r"[a-z][a-z0-9-]{0,63}", selection or "") and
                     selection not in ("all", "base"), "COMMITTED_SOURCE_SELECTION_REQUIRED")
        self.workspace, self.logs = Path(workspace), Path(logs)
        self.private_directory(self.workspace)
        self.require(self.logs.is_absolute() and self.logs.resolve() == self.logs and
                     self.logs.is_relative_to(self.workspace) and
                     re.fullmatch(r"[a-f0-9]{40}", commit or "") and
                     all(isinstance(value, (str, Path)) and str(value) and
                         Path(value).is_absolute() for value in (node, npm, python)),
                     "EXACT_SELECTED_SOURCE_AND_RUNTIME_REQUIRED")
        self.node, self.npm, self.python, self.offline = str(node), str(npm), str(python), bool(offline)
        self.intent = {"schema": SCHEMA, "sourceCommit": commit, "sourceRepository": repository,
                       "sourceSelection": selection, "workspace": str(workspace),
                       "node": self.node, "npm": self.npm, "python": self.python,
                       "runtimeSelection": RUNTIME_SELECTION}
        self.intent_path = self.workspace / "source-selection.json"
        self.state_path = self.workspace / "source-selection-state.json"
        self.cache = self.workspace / "source-repository.git"
        self.toolkit = self.workspace / "source-toolkit"
        self.release_directory = self.workspace / "merchant-release"
        self.source_offline = self.offline
        self.received_observation = None
        if received_source is not None:
            identity, self.received_observation = self.inspect_received_source(received_source)
            self.intent["receivedSource"] = identity
            self.cache = Path(identity["repository"])
            self.source_offline = True
        if not self.intent_path.exists():
            self.require(not any(path.exists() or path.is_symlink() for path in
                         (self.workspace / "source-repository.git", self.toolkit, self.release_directory, self.workspace / "applications-runtime",
                          self.state_path)), "PRESERVE_UNBOUND_SOURCE_SELECTION_PATHS")
        self.immutable(self.intent_path, self.encoded(self.intent))
        if self.state_path.exists():
            self.state = self.read_json(self.state_path)
            self.require(self.state.get("schema") == SCHEMA and self.state.get("identity") == self.intent and
                         isinstance(self.state.get("recoveries"), list) and
                         isinstance(self.state.get("commands"), list), "ORIGINAL_SOURCE_SELECTION_CHANGED")
        else:
            self.state = {"schema": SCHEMA, "identity": self.intent, "status": "SELECTED",
                          "runtimeDirectory": str(self.workspace / "applications-runtime"),
                          "recoveries": [], "commands": [], "sourceRoot": None}
            self.checkpoint()
        original = self.workspace / "applications-runtime"
        for index, recovery in enumerate(self.state["recoveries"], 1):
            successor = self.workspace / ("applications-runtime-recovery-" + str(index))
            self.require(isinstance(recovery, dict) and recovery.get("from") == str(original) and
                         recovery.get("directory") == str(successor) and recovery.get("method") in ("recover", "prepare"),
                         "ORIGINAL_SELECTED_RUNTIME_RECOVERY_CHANGED")
            original = successor
        self.require(self.state.get("runtimeDirectory") == str(original) and
                     self.state.get("sourceRoot") in (None, str(original / "package/source")),
                     "ORIGINAL_SELECTED_RUNTIME_DIRECTORY_CHANGED")
        if self.received_observation is not None:
            previous = self.state.get("receivedSourceObservation")
            self.require(previous is None or
                         set(previous["additionalPaths"]).issubset(self.received_observation["additionalPaths"]),
                         "PRESERVE_ORIGINAL_RECEIVED_SOURCE_CLOSURE")
            self.state["receivedSourceObservation"] = self.received_observation
            self.checkpoint()

    def inspect_received_source(self, value):
        """Reopen the unchanged receiver's original cache and successful proof."""
        directory = Path(value)
        self.require(directory.is_absolute() and directory.resolve(strict=True) == directory and
                     directory.is_dir() and not directory.is_relative_to(self.workspace) and
                     not self.workspace.is_relative_to(directory),
                     "SELECT_DISJOINT_ORIGINAL_RECEIVED_SOURCE_DIRECTORY")
        self.private_directory(directory)
        repository = directory / "repository.git"
        self.require(repository.resolve(strict=True) == repository and repository.is_dir(),
                     "ORIGINAL_RECEIVED_GIT_REPOSITORY_REQUIRED")
        self.private_directory(repository)
        verification = self.read_json(directory / "source-verification.json")
        self.require(isinstance(verification, dict) and
                     verification.get("schema") == "stellar-forge.git-object-receiving-verification.v1",
                     "ORIGINAL_OBJECT_RECEIVING_VERIFICATION_REQUIRED")
        receiver = verification.get("receiver", {})
        path = Path(receiver.get("path", ""))
        self.require(path.is_absolute() and path.resolve(strict=True) == path,
                     "ORIGINAL_OBJECT_RECEIVER_SOURCE_REQUIRED")
        data = self.regular(path, 2 * 1024 * 1024)
        self.require(len(data) == OBJECT_RECEIVER["bytes"] and
                     self.digest(data) == OBJECT_RECEIVER["sha256"] and _git_blob(data) == OBJECT_RECEIVER["gitBlob"] and
                     {key: receiver.get(key) for key in OBJECT_RECEIVER} == OBJECT_RECEIVER,
                     "ORIGINAL_OBJECT_RECEIVER_SOURCE_CHANGED")
        spec = importlib.util.spec_from_file_location("scf_original_git_object_receiver", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        metadata_path = Path(verification.get("metadataPath", ""))
        self.require(metadata_path.is_absolute() and metadata_path.resolve(strict=True) == metadata_path,
                     "ORIGINAL_OBJECT_METADATA_PATH_REQUIRED")
        metadata = json.loads(self.regular(metadata_path, 8 * 1024 * 1024))
        source, entries, required, _ = module.validate_metadata(metadata)
        metadata_hash = self.digest(module.canonical(metadata))
        expected_repository = self.intent["sourceRepository"].removeprefix("https://github.com/").removesuffix(".git")
        self.require(source.get("repository") == expected_repository and
                     source["commit"] == self.intent["sourceCommit"], "ORIGINAL_RECEIVED_SOURCE_IDENTITY_CHANGED")
        state_bytes = self.regular(directory / "source-receiving.json", 4 * 1024 * 1024)
        state = json.loads(state_bytes)
        command = verification.get("command", {})
        self.require(command.get("exitCode") == 0 and
                     verification.get("metadataSha256") == metadata_hash and
                     verification.get("stateSha256") == self.digest(state_bytes) and
                     verification.get("stateBytes") == len(state_bytes) and
                     verification.get("result") == state and self.output_json(command) == state,
                     "ORIGINAL_OBJECT_RECEIVING_EXIT_ZERO_REQUIRED")
        argv = command.get("argv", [])
        self.require(isinstance(argv, list) and len(argv) >= 8 and argv[:2] == [self.python, str(path)] and
                     all(argv.count(flag) == 1 and argv[argv.index(flag) + 1] == expected
                         for flag, expected in (("--metadata", str(metadata_path)),
                                                ("--commit", source["commit"]), ("--directory", str(directory)))),
                     "ORIGINAL_OBJECT_RECEIVING_COMMAND_CHANGED")
        additional = state.get("additionalPaths", [])
        self.require(isinstance(additional, list) and all(isinstance(item, str) for item in additional) and
                     len(additional) == len(set(additional)), "ORIGINAL_ADDITIONAL_SOURCE_PATHS_REQUIRED")
        selected = set(metadata["requiredPaths"]) | set(additional)
        self.require(all(path in entries and entries[path]["type"] == "blob" and
                         entries[path]["mode"] in ("100644", "100755") for path in selected),
                     "ORIGINAL_RECEIVED_CLOSURE_PATH_CHANGED")
        self.require(state.get("schema") == "stellar-forge.git-object-cache.v1" and
                     state.get("directory") == str(directory) and state.get("repository") == str(repository) and
                     state.get("source") == source and state.get("metadataSha256") == metadata_hash and
                     state.get("phase") == "OBJECTS_AVAILABLE" and state.get("missingObjects") == 0 and
                     state.get("missingBytes") == 0 and state.get("requiredPaths") == len(selected) and
                     state.get("requiredBytes") == sum(entries[path]["size"] for path in selected),
                     "ORIGINAL_REQUESTED_GIT_OBJECTS_REQUIRED")
        self.received_entries = entries
        identity = {"directory": str(directory), "repository": str(repository), "source": source,
                    "metadataPath": str(metadata_path), "metadataSha256": metadata_hash,
                    "requiredPaths": metadata["requiredPaths"]}
        observation = {"stateBytes": len(state_bytes), "stateSha256": self.digest(state_bytes),
                       "verificationSha256": self.digest(self.regular(directory / "source-verification.json", 8 * 1024 * 1024)),
                       "additionalPaths": additional, "requiredPaths": state["requiredPaths"],
                       "requiredBytes": state["requiredBytes"], "command": command}
        return identity, observation

    def checkpoint(self):
        self.save(self.state_path, self.state)
        self.save(self.logs.parent / "source-selection.json", self.state)

    def command(self, name, argv, *, cwd=None, allow_failure=False):
        record = {"name": name, "argv": [str(value) for value in argv], "status": "RUNNING"}
        self.state["commands"].append(record)
        self.checkpoint()
        log = self.logs / ("source-" + name + "-" + str(time.time_ns()))
        try:
            result = self.execute(argv, log, cwd=cwd or self.workspace, allow_failure=allow_failure)
        except BaseException as error:
            record.update(getattr(error, "command", {}))
            record.update({"status": "FAILED", "type": type(error).__name__, "message": str(error)})
            self.checkpoint()
            raise
        record.update(result)
        record["status"] = "COMPLETED" if result["exitCode"] == 0 else "FAILED"
        self.checkpoint()
        return result

    def git(self, name, args, *, allow_failure=False):
        return self.command(name, ["git", "--no-replace-objects", *(["--no-lazy-fetch"] if self.source_offline else []),
                                   "-C", self.cache, *args],
                            allow_failure=allow_failure)

    def text_result(self, result):
        return self.regular(result["stdout"], 2 * 1024 * 1024).decode("utf-8").strip()

    def git_source(self):
        if self.received_observation is None:
            self.private_directory(self.cache)
            self.command("repository-init", ["git", "init", "--quiet", "--bare", self.cache])
        self.require(self.text_result(self.git("repository-kind", ["rev-parse", "--is-bare-repository"])) == "true",
                     "SELECTED_SOURCE_REPOSITORY_MUST_BE_BARE")
        if self.received_observation is None:
            for key, expected in (("remote.origin.url", self.intent["sourceRepository"]),
                                  ("remote.origin.promisor", "true"),
                                  ("remote.origin.partialclonefilter", "blob:none")):
                observed = self.git("repository-config-read", ["config", "--get", key], allow_failure=True)
                if observed["exitCode"] == 1:
                    self.git("repository-config", ["config", key, expected])
                else:
                    self.require(observed["exitCode"] == 0 and self.text_result(observed) == expected,
                                 "SELECTED_SOURCE_REPOSITORY_CONFIGURATION_CHANGED:" + key)
        commit = self.intent["sourceCommit"]
        observed = self.git("commit-read", ["rev-parse", "--verify", "--end-of-options", commit + "^{commit}"],
                            allow_failure=True)
        if observed["exitCode"]:
            self.require(not self.source_offline, "SELECTED_COMMIT_REQUIRED_IN_ORIGINAL_OFFLINE_CACHE")
            self.git("commit-fetch", ["fetch", "--depth=1", "--no-tags", "--no-write-fetch-head",
                                     "--no-auto-maintenance", "--recurse-submodules=no",
                                     "--filter=blob:none", "origin", commit])
            observed = self.git("commit-read", ["rev-parse", "--verify", "--end-of-options", commit + "^{commit}"])
        self.require(self.text_result(observed) == commit, "SELECTED_SOURCE_COMMIT_CHANGED")

        # Only this original, dependency-free reader is bootstrapped directly.
        # It then acquires the whole ten-file build/install toolkit in one batch.
        reader = (BASE / "git-source.mjs").as_posix()
        entry = self.git("reader-entry", ["ls-tree", "-z", "--full-tree", commit, "--", reader])
        raw = self.regular(entry["stdout"], 4096)
        self.require(raw.endswith(b"\0") and raw.count(b"\0") == 1, "ORIGINAL_GIT_READER_ENTRY_REQUIRED")
        fields, path = raw[:-1].decode("utf-8").split("\t", 1)
        mode, kind, oid = fields.split(" ")
        self.require(path == reader and mode in ("100644", "100755") and kind == "blob" and
                     re.fullmatch(r"[a-f0-9]{40}", oid), "ORIGINAL_GIT_READER_IDENTITY_REQUIRED")
        args = ["--no-lazy-fetch"] if self.source_offline else []
        result = self.git("reader-content", [*args, "cat-file", "blob", oid])
        data = self.regular(result["stdout"], 2 * 1024 * 1024)
        self.require(_git_blob(data) == oid, "ORIGINAL_GIT_READER_BYTES_CHANGED")
        self.private_directory(self.toolkit / BASE)
        self.immutable(self.toolkit / reader, data)
        input_value = {"reader": str(self.toolkit / reader), "repository": str(self.cache),
                       "commit": commit, "offline": self.source_offline,
                       "paths": [(BASE / name).as_posix() for name in TOOLKIT]}
        result = self.output_json(self.command("toolkit", [self.node, "--input-type=module", "--eval",
                                                         TOOLKIT_READER, json.dumps(input_value)]))
        rows = result.get("files", [])
        self.require(result.get("sourceCommit") == commit and isinstance(rows, list) and
                     [row.get("path") for row in rows] == input_value["paths"],
                     "ORIGINAL_BUILD_TOOLKIT_SELECTION_CHANGED")
        for row in rows:
            member = base64.b64decode(row["content"], validate=True)
            self.require(row["mode"] in ("100644", "100755") and
                         len(member) == row["bytes"] <= 2 * 1024 * 1024 and
                         self.digest(member) == row["sha256"] and _git_blob(member) == row["gitBlob"],
                         "ORIGINAL_BUILD_TOOLKIT_BYTES_CHANGED")
            self.immutable(self.toolkit / row["path"], member)
        self.state["toolkit"] = [{key: value for key, value in row.items() if key != "content"} for row in rows]
        self.state["toolkitAcquisition"] = result["acquisition"]
        self.checkpoint()

    def runtime_call(self, name, action, options):
        request = {"module": str(self.toolkit / BASE / "runtime-install.mjs"),
                   "action": action, "options": options}
        return self.output_json(self.command(name, [self.node, "--input-type=module", "--eval",
                                                    RUNTIME_CALL, json.dumps(request)]))

    def verify_source(self, runtime, release):
        self.private_directory(runtime)
        plan = self.read_json(runtime / "runtime-install.json")
        self.require(plan.get("schema") == "stellar-forge.runtime-install.v1" and
                     plan.get("directory") == str(runtime) and
                     plan.get("sourceRoot") == str(runtime / "package/source") and
                     plan.get("archivePath") == str(runtime / "source.tgz") and
                     plan.get("archiveSha256") == release["sha256"] and
                     plan.get("source", {}).get("sourceCommit") == self.intent["sourceCommit"],
                     "ORIGINAL_SELECTED_INSTALLATION_CHANGED")
        report = self.output_json(self.command("installed-source", [
            self.python, self.toolkit / BASE / "runtime-unpack.py", "--archive", runtime / "source.tgz",
            "--sha256", release["sha256"], "--out", runtime / "package", "--verify"]))
        manifest = self.read_json(runtime / "package/manifest.json")
        profile = self.read_json(runtime / "runtime-profile.json")
        self.require(report.get("status") == "SOURCE_VERIFIED" and
                     report.get("sourceRoot") == plan["sourceRoot"] and
                     report.get("sourceCommit") == self.intent["sourceCommit"] and
                     report.get("manifestSha256") == plan["source"].get("manifestSha256") and
                     manifest.get("sourceSelection") == release.get("sourceSelection") and
                     manifest.get("sourceSelection", {}).get("id") == self.intent["sourceSelection"] and
                     manifest.get("sourceRepository") == self.intent["sourceRepository"].removesuffix(".git") and
                     profile.get("selection") == RUNTIME_SELECTION and profile.get("profileId") == plan.get("profileId"),
                     "ORIGINAL_SELECTED_PACKAGE_BINDING_CHANGED")
        self.state["verification"] = report
        return Path(plan["sourceRoot"]), plan

    def verify_toolkit(self):
        rows = self.state.get("toolkit", [])
        self.require(isinstance(rows, list) and [row.get("path") for row in rows] ==
                     [(BASE / name).as_posix() for name in TOOLKIT], "ORIGINAL_BUILD_TOOLKIT_REQUIRED")
        for row in rows:
            data = self.regular(self.toolkit / row["path"], 2 * 1024 * 1024)
            self.require(len(data) == row["bytes"] and self.digest(data) == row["sha256"] and
                         _git_blob(data) == row["gitBlob"], "ORIGINAL_BUILD_TOOLKIT_BYTES_CHANGED")

    def prepare(self):
        if self.state.get("sourceRoot") is not None:
            # Reopen the same installed package without acquiring Git objects or
            # preparing another runtime. Its original archive is still required.
            self.verify_toolkit()
            release = self.state["release"]
            source, plan = self.verify_source(Path(self.state["runtimeDirectory"]), release)
            self.require(str(source) == self.state["sourceRoot"] and
                         plan["installationId"] == self.state["installationId"],
                         "ORIGINAL_RECEIVED_SOURCE_CHANGED")
            self.checkpoint()
            return source
        self.git_source()
        actual_npm = shutil.which("npm")
        self.require(actual_npm and Path(actual_npm).resolve() == Path(self.npm).resolve(),
                     "SELECTED_NPM_MUST_BE_THE_ORIGINAL_BUILDER_NPM")
        argv = [self.node, self.toolkit / BASE / "build.mjs", "--repo", self.cache,
                "--ref", self.intent["sourceCommit"], "--selection", self.intent["sourceSelection"],
                "--out", self.release_directory, "--python", self.python]
        if self.release_directory.exists():
            argv.append("--resume")
        if self.source_offline:
            argv.append("--offline")
        if self.received_observation is None:
            release = self.output_json(self.command("distribution", argv))
        else:
            request = {"module": str(self.toolkit / BASE / "build.mjs"), "options": {
                "repository": str(self.cache), "ref": self.intent["sourceCommit"],
                "selection": self.intent["sourceSelection"], "output": str(self.release_directory),
                "offline": True, "resume": self.release_directory.exists(), "python": self.python}}
            command = self.command("distribution", [self.node, "--input-type=module", "--eval", BUILD_CALL,
                                                     json.dumps(request)], allow_failure=True)
            try:
                release = self.output_json(command)
                if command["exitCode"]:
                    failure = RuntimeError("ORIGINAL_SELECTED_DISTRIBUTION_FAILED")
                    if (release.get("schema") == "stellar-forge.distribution-source-needed.v1" and
                            release.get("code") == "MISSING_SOURCE_OBJECTS" and
                            release.get("sourceCommit") == self.intent["sourceCommit"]):
                        missing = release.get("missingObjects")
                        known = {row["sha"] for row in self.received_entries.values()
                                 if row["type"] == "blob" and row["mode"] in ("100644", "100755")}
                        self.require(isinstance(missing, list) and missing and
                                     all(isinstance(oid, str) and oid in known for oid in missing) and
                                     len(missing) == len(set(missing)), "ORIGINAL_MISSING_SOURCE_OBJECTS_REQUIRED")
                        failure.code = "MISSING_SOURCE_OBJECTS"
                        failure.missingObjects = missing
                        failure.sourceCommit = self.intent["sourceCommit"]
                        failure.receivedSource = self.intent["receivedSource"]
                    raise failure
            except BaseException as error:
                error.command = command
                raise
        self.require(release.get("status") == "PACKAGED" and
                     release.get("sourceCommit") == self.intent["sourceCommit"] and
                     release.get("sourceSelection", {}).get("id") == self.intent["sourceSelection"],
                     "ORIGINAL_SELECTED_RELEASE_REQUIRED")
        archive = Path(release["archive"])
        self.require(archive.is_absolute() and archive.resolve() == archive and
                     archive.is_relative_to(self.release_directory) and
                     self.digest(self.regular(archive, 64 * 1024 * 1024)) == release["sha256"],
                     "ORIGINAL_SELECTED_RELEASE_ARCHIVE_CHANGED")
        if self.state.get("release"):
            self.require(self.state["release"]["sha256"] == release["sha256"],
                         "ORIGINAL_SELECTED_RELEASE_BYTES_CHANGED")
        self.state["release"] = release
        self.checkpoint()
        runtime = Path(self.state["runtimeDirectory"])
        retained = None
        if runtime.exists():
            try:
                retained = self.read_json(runtime / "runtime-install.json")
                self.require(isinstance(retained, dict), "ORIGINAL_RUNTIME_PLAN_OBJECT_REQUIRED")
            except (FileNotFoundError, ValueError):
                retained = None
        if runtime.exists() and retained is None:
            self.require(self.state.get("sourceRoot") is None, "PRESERVE_ALREADY_RECEIVED_RUNTIME_SOURCE")
            preparation = None
            try:
                preparation = self.read_json(runtime / "preparation.json")
            except (FileNotFoundError, ValueError):
                pass
            if preparation is not None:
                self.require(preparation.get("archiveSha256") == release["sha256"] and
                             preparation.get("selection") == RUNTIME_SELECTION,
                             "ORIGINAL_SELECTED_PREPARATION_CHANGED")
            successor = self.workspace / ("applications-runtime-recovery-" + str(len(self.state["recoveries"]) + 1))
            self.require(not successor.exists() and not successor.is_symlink(), "PRESERVE_EXISTING_RUNTIME_SUCCESSOR")
            self.state["recoveries"].append({"from": str(runtime), "directory": str(successor),
                                            "archiveSha256": release["sha256"],
                                            "method": "recover" if preparation is not None else "prepare"})
            self.state["runtimeDirectory"] = str(successor)
            self.checkpoint()
            runtime = successor
        if not runtime.exists():
            recovery = next((row for row in self.state["recoveries"] if row["directory"] == str(runtime)), None)
            if recovery and recovery["method"] == "recover":
                self.runtime_call("runtime-recover", "recover", {
                    "from": recovery["from"], "directory": str(runtime), "python": self.python, "install": False})
            else:
                self.runtime_call("runtime-prepare", "prepare", {
                    "directory": str(runtime), "archive": str(archive), "sha256": release["sha256"],
                    "python": self.python, **RUNTIME_SELECTION})
        source, plan = self.verify_source(runtime, release)
        self.require(self.state.get("sourceRoot") in (None, str(source)), "ORIGINAL_EXECUTABLE_SOURCE_MOVED")
        self.state.update({"sourceRoot": str(source), "status": "SOURCE_VERIFIED",
                           "installationId": plan["installationId"], "profileId": plan["profileId"]})
        self.state["footprint"] = {"repository": _footprint(self.cache), "toolkit": _footprint(self.toolkit),
                                   "release": _footprint(self.release_directory), "runtime": _footprint(runtime)}
        self.checkpoint()
        self.emit({"phase": "SELECTED_SOURCE_VERIFIED", "sourceCommit": self.intent["sourceCommit"],
                   "sourceSelection": self.intent["sourceSelection"], "source": str(source),
                   "sourceFiles": release["sourceFiles"], "sourceBytes": release["sourceBytes"],
                   "archiveBytes": release["archiveBytes"], "sourceAcquisition": release["sourceAcquisition"]})
        return source

    def install(self, source):
        self.require(self.state.get("sourceRoot") == str(source) and self.state.get("release"),
                     "ORIGINAL_PREPARED_SELECTION_REQUIRED")
        self.verify_toolkit()
        runtime = Path(self.state["runtimeDirectory"])
        current, plan = self.verify_source(runtime, self.state["release"])
        self.require(current == source, "ORIGINAL_INSTALL_SOURCE_CHANGED")
        cache = self.private_directory(self.workspace / "npm-cache")
        installed = self.runtime_call("runtime-install", "install", {
            "directory": str(runtime), "offline": self.offline, "cache": str(cache), "npm": self.npm})
        report = self.runtime_call("runtime-inspect", "inspect", {
            "directory": str(runtime), "load": True, "source": True, "python": self.python})
        self.require(installed.get("status") == "READY" and report.get("status") == "READY" and
                     report.get("ready") is True and report.get("sourceVerified") is True and
                     report.get("sourceRoot") == str(source) and
                     report.get("sourceCommit") == self.intent["sourceCommit"] and
                     report.get("installationId") == plan["installationId"],
                     "ORIGINAL_SELECTED_RUNTIME_NOT_READY")
        result = {"directory": str(runtime), "profileId": report["profileId"],
                  "profileSha256": plan["profileSha256"],
                  "lockSha256": self.digest(self.regular(runtime / "package-lock.json", 16 * 1024 * 1024)),
                  "sourceRoot": str(source), "installationId": report["installationId"],
                  "inspection": report, "installation": installed,
                  "sourceSelection": self.state["release"]["sourceSelection"]}
        self.state["installation"] = result
        self.state["status"] = "READY"
        self.state["footprint"]["runtime"] = _footprint(runtime)
        self.state["footprint"]["npmCache"] = _footprint(cache)
        self.checkpoint()
        retained = self.private_directory(self.logs.parent / "runtime" / report["profileId"])
        for name in ("preparation.json", "runtime-install.json", "runtime-profile.json",
                     "package.json", "package-lock.json"):
            self.immutable(retained / name, self.regular(runtime / name, 16 * 1024 * 1024))
        self.save(retained / "inspection.json", report)
        return result


def prepare_source(**options):
    return _Receiver(**options).prepare()


def install_selected(*, source, **options):
    return _Receiver(**options).install(Path(source))
