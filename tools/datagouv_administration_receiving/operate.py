#!/usr/bin/env python3
"""Operate the selected Data.gouv Linux install, update and restore without a server."""
import argparse, hashlib, importlib.util, json, os, pathlib, pwd, stat, subprocess, sys, tempfile, time

SCHEMA = "datagouv.linux-administration-receiving/v1"
INPUT_SCHEMA = "datagouv.linux-administration-receiving-input/v1"
INVENTORY = "products/datagouv/application-files.json"
ADMIN = "products/datagouv/admin/publisher_admin.py"
REQUIRED_CURRENT_SOURCES = (
    "stellar-forge/mcp-merchant-operator/host-profile.mjs",
    "stellar-forge/mcp-merchant-operator/operation-error.mjs",
    "stellar-forge/mcp-merchant-operator/service-agreements-errors.mjs",
    "stellar/scf-starforge-20261009/distribution/product-package.mjs",
    "stellar/scf-starforge-20261009/distribution/source-selection.mjs",
    "stellar/scf-starforge-20261009/sf103-native-buyer-signer/diagnostics.mjs",
    "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-location.mjs",
)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()

def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def read_regular(path, limit=32 * 1024 * 1024):
    path = pathlib.Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size <= limit, "Expected a bounded original regular file")
        parts = []
        while True:
            part = os.read(fd, 1024 * 1024)
            if not part:
                break
            parts.append(part)
        after = os.fstat(fd)
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                "Selected source changed while read")
        return b"".join(parts)
    finally:
        os.close(fd)

def atomic(path, value):
    raw = json.dumps(value, sort_keys=True, ensure_ascii=False, indent=2).encode() + b"\n"
    fd, temp = tempfile.mkstemp(prefix=".receiving-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)

def directory(path, mode, uid=None, gid=None):
    path = pathlib.Path(path)
    try:
        path.mkdir(mode=mode)
        os.chmod(path, mode)
        if uid is not None:
            os.chown(path, uid, gid)
    except FileExistsError:
        st = path.lstat()
        require(stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode), "Selected directory is not ordinary")
        require(stat.S_IMODE(st.st_mode) == mode, "Existing directory mode differs")
        if uid is not None:
            require((st.st_uid, st.st_gid) == (uid, gid), "Existing directory owner differs")
    return path

def inventory(root, expected):
    raw = read_regular(root / INVENTORY)
    require(len(raw) == expected["bytes"] and sha(raw) == expected["sha256"], "Original inventory pin differs")
    value = json.loads(raw)
    files = value["files"]
    require(value.get("schema") == "stellar-forge.datagouv-application-files.v1" and
            isinstance(files, list) and 1 <= len(files) <= 512 and len(files) == len(set(files)),
            "Invalid complete native source inventory")
    require(value["entrypoint"] == "start-publisher.mjs", "Unexpected native entry point")
    pins = {}
    for name in files:
        relative = pathlib.PurePosixPath(name)
        require(not relative.is_absolute() and ".." not in relative.parts and str(relative) == name, "Invalid source member")
        body = read_regular(root / name)
        pins[name] = {"bytes": len(body), "sha256": sha(body)}
    return pins

class Receiving:
    def __init__(self, selected, amendment=None, runtime_handoff=None, lock_fd=None):
        require(selected["schema"] == INPUT_SCHEMA, "Different original receiving input")
        self.selected = selected
        self.lock_fds = () if lock_fd is None else (lock_fd,)
        if lock_fd is not None:
            require(lock_fd > 2 and stat.S_ISREG(os.fstat(lock_fd).st_mode),
                    "The inherited receiving lock must be an open regular file")
        self.root = pathlib.Path(selected["output"]).absolute()
        require(self.root.parent.is_dir(), "Create the selected output parent first")
        directory(self.root, 0o755, os.geteuid(), os.getegid())
        self.private = directory(self.root / "evidence", 0o700, os.geteuid(), os.getegid())
        self.path = self.private / "receiving.json"
        self.input_sha = sha(canonical(selected))
        if self.path.exists():
            self.record = json.loads(read_regular(self.path))
            require(self.record.get("schema") == SCHEMA and
                    self.record.get("operation_id") == selected["operation_id"],
                    "The retained receiving record belongs to another operation")
            if self.record["input_sha256"] != self.input_sha and runtime_handoff is not None:
                self.adopt_runtime_handoff(runtime_handoff)
            if self.record["input_sha256"] != self.input_sha:
                require(isinstance(amendment, dict) and amendment.get("schema") == "datagouv.linux-administration-source-amendment/v1",
                        "Keep the original receiving selection or provide its explicit source amendment")
                require(amendment.get("operation_id") == selected["operation_id"] == self.record["operation_id"] and
                        amendment.get("from_input_sha256") == self.record["input_sha256"] and
                        amendment.get("to_input_sha256") == self.input_sha,
                        "The source amendment does not bind the original selection")
                require(self.record.get("steps") == {} and not self.record.get("result"),
                        "A requested native command requires its original selection")
                require(isinstance(amendment.get("reason"), str) and amendment["reason"].strip(),
                        "Describe the original pre-dispatch source amendment")
                self.record.setdefault("source_amendments", []).append({
                    "amendment": amendment, "prior_input": self.record["input"],
                    "prior_input_sha256": self.record["input_sha256"], "applied_at": now()})
                self.record.update(input=selected, input_sha256=self.input_sha)
                self.save()
        else:
            self.record = {"schema": SCHEMA, "operation_id": selected["operation_id"],
                           "input_sha256": self.input_sha, "input": selected, "created_at": now(),
                           "steps": {}, "provider_writes": 0, "servers_started": 0}
            self.save()

    def adopt_runtime_handoff(self, handoff):
        require(isinstance(handoff, dict) and handoff.get("schema") ==
                "datagouv.linux-administration-runtime-handoff/v1",
                "An explicit original runtime handoff is required")
        require(handoff.get("operation_id") == self.selected["operation_id"] ==
                self.record["operation_id"] and
                handoff.get("from_input_sha256") == self.record["input_sha256"] and
                handoff.get("to_input_sha256") == self.input_sha and
                handoff.get("from_record_sha256") == sha(read_regular(self.path)),
                "Runtime handoff does not bind the exact original record and inputs")
        prior = self.record["input"]
        runtime_fields = {"output", "before_source", "after_source", "node", "service_user", "port", "lifecycle"}
        edition_fields = {"after_ref", "after_inventory", "expected_changes"}
        kind = handoff.get("kind")
        require(kind in ("runtime", "source_edition"), "Select the explicit handoff kind")
        changed = {key for key in set(prior) | set(self.selected)
                   if prior.get(key) != self.selected.get(key)}
        allowed = runtime_fields | (edition_fields if kind == "source_edition" else set())
        require(bool(changed) and changed <= allowed and set(prior) <= set(self.selected) and
                set(self.selected) - set(prior) <= {"lifecycle"},
                "The handoff cannot change the original operation, predecessor or administrator")
        if kind == "source_edition":
            require(prior["after_inventory"] != self.selected["after_inventory"],
                    "A later edition requires its complete different inventory")
        require(not self.record.get("result") and
                isinstance(handoff.get("reason"), str) and handoff["reason"].strip(),
                "Keep completed work unchanged and describe the receiving handoff")
        steps = self.record["steps"]
        require(set(steps) == {"package_before", "package_after", "preflight"},
                "Runtime handoff is allowed only before the first installation request")
        attempts = steps["preflight"].get("attempts", [])
        require(not steps["preflight"].get("completed") and attempts and
                attempts[-1].get("exit_code") == 1 and attempts[-1].get("finished_at"),
                "The original preflight must have an observed terminal failure")
        require(json.loads(attempts[-1].get("stderr", "{}")).get("error") ==
                "SERVICE_ACCOUNT_UNMAPPED", "This handoff requires the original unmapped-account result")
        sources = {}
        pins = {}
        for name in ("before", "after"):
            pins[name] = inventory(pathlib.Path(self.selected[name + "_source"]),
                                   self.selected[name + "_inventory"])
            sources[name] = {"inventory": self.selected[name + "_inventory"],
                             "files": len(pins[name]), "pins_sha256": sha(canonical(pins[name]))}
        require(handoff.get("selected_sources") == sources,
                "The full selected receiving source hashes differ from the handoff")
        actual_changes = {"added": sorted(set(pins["after"]) - set(pins["before"])),
                          "removed": sorted(set(pins["before"]) - set(pins["after"])),
                          "modified": sorted(name for name in set(pins["before"]) & set(pins["after"])
                                             if pins["before"][name] != pins["after"][name])}
        require(actual_changes == self.selected["expected_changes"],
                "The complete selected source transition differs")
        locations = handoff.get("received_releases")
        require(isinstance(locations, dict) and set(locations) == {"before", "after"},
                "Keep both original release archives in the receiving handoff")
        admin_path = pathlib.Path(self.selected["after_source"]) / ADMIN
        require(sha(read_regular(admin_path)) == self.selected["administrator_sha256"],
                "The reviewed original administrator differs")
        spec = importlib.util.spec_from_file_location("_datagouv_handoff_administrator", admin_path)
        admin = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(admin)
        received = []
        for name in ("before", "after"):
            row = steps["package_" + name]
            result = row.get("result", {})
            require(row.get("completed") and result.get("schema") ==
                    "datagouv.linux-release-package/v1" and
                    type(result.get("files")) is int and 1 <= result["files"] <= 512 and
                    type(result.get("bytes")) is int and 0 < result["bytes"] <= 128 * 1024 * 1024,
                    "The original complete release receipt is missing")
            path = pathlib.Path(locations[name])
            require(path.is_absolute() and path.is_relative_to(self.private / "releases"),
                    "Received release must stay inside the selected private release directory")
            raw = read_regular(path, result["bytes"])
            require(len(raw) == result["bytes"] and sha(raw) == result["sha256"],
                    "The received original release bytes differ")
            with admin.Bundle(str(path), result["sha256"]) as bundle:
                manifest = bundle.manifest
                require(manifest["release_id"] == result["release_id"] and
                        manifest["source_ref"] == result["source_ref"] and
                        len(manifest["files"]) == result["files"],
                        "The original complete release manifest differs from its receipt")
                original_pins = {entry["path"]: {"bytes": entry["bytes"], "sha256": entry["sha256"]}
                                 for entry in manifest["files"]}
                if name == "before" or kind == "runtime":
                    require(pins[name] == original_pins,
                            "Located source bytes differ from the original complete release: " + name)
            received.append({"original": result, "received_path": str(path),
                             "bytes": len(raw), "sha256": sha(raw),
                             "original_source_pins_sha256": sha(canonical(original_pins))})
        self.record.setdefault("runtime_handoffs", []).append({
            "handoff": handoff, "accepted_at": now(), "changed_fields": sorted(changed),
            "prior_input": prior, "prior_input_sha256": self.record["input_sha256"],
            "prior_steps": steps, "prior_error": self.record.get("last_error"),
            "received_releases": received})
        # No installation was requested. Retain the actual completed packages and
        # terminal preflight above, then verify the selected edition and runtime
        # in this receiving environment before the first installation request.
        self.record.update(input=self.selected, input_sha256=self.input_sha, steps={})
        self.save()

    def save(self):
        atomic(self.path, self.record)

    def execute(self, step, arguments):
        previous = self.record["steps"].get(step)
        require(previous is None or previous["argv"] == arguments, "Original command input differs")
        if previous and previous.get("completed"):
            return previous["result"]
        row = previous or {"argv": arguments, "requested_at": now(), "attempts": []}
        self.record["steps"][step] = row
        row["attempts"].append({"started_at": now()})
        self.save()
        print(json.dumps({"operation_id": self.selected["operation_id"], "stage": step, "state": "running"}), flush=True)
        node = pathlib.Path(self.selected["node"]).resolve()
        environment = {"PATH": str(node.parent) + ":/usr/bin:/bin", "LANG": "C.UTF-8",
                       "PYTHONDONTWRITEBYTECODE": "1"}
        process = subprocess.run(arguments, cwd="/", env=environment, capture_output=True, text=True,
                                 pass_fds=self.lock_fds)
        attempt = row["attempts"][-1]
        attempt.update(finished_at=now(), exit_code=process.returncode,
                       stdout=process.stdout, stderr=process.stderr)
        self.save()
        require(process.returncode == 0, "Original native administration command failed: " + step)
        value = json.loads(process.stdout)
        row.update(completed=True, completed_at=now(), result=value)
        self.save()
        print(json.dumps({"operation_id": self.selected["operation_id"], "stage": step, "state": "completed"}), flush=True)
        return value

    def operate(self):
        s = self.selected
        before = pathlib.Path(s["before_source"]).resolve()
        after = pathlib.Path(s["after_source"]).resolve()
        before_pins = inventory(before, s["before_inventory"])
        after_pins = inventory(after, s["after_inventory"])
        changes = {"added": sorted(set(after_pins) - set(before_pins)),
                   "removed": sorted(set(before_pins) - set(after_pins)),
                   "modified": sorted(name for name in set(before_pins) & set(after_pins)
                                      if before_pins[name] != after_pins[name])}
        require(changes == s["expected_changes"], "The actual complete source transition differs")
        require(sha(read_regular(after / ADMIN)) == s["administrator_sha256"], "Reviewed administrator source differs")
        lifecycle = s.get("lifecycle")
        require(isinstance(lifecycle, dict) and set(lifecycle) == {"mode", "existing"} and
                lifecycle["mode"] in ("fresh_selected", "existing_upgrade"),
                "Select fresh current-edition installation or a pinned existing workspace upgrade")
        user = pwd.getpwnam(s["service_user"])
        require(user.pw_uid != 0, "Use an actual unprivileged service account")
        require(os.geteuid() == 0 or user.pw_uid == os.geteuid(), "Service account selection requires its administrator")
        packages = directory(self.private / "releases", 0o700, os.geteuid(), os.getegid())
        cli = [sys.executable, "-B", str(after / ADMIN)]
        op = s["operation_id"]
        def call(step, *args):
            return self.execute(step, cli + list(args))
        historical = call("package_before", "pack", "--source", str(before), "--source-ref", s["before_ref"],
                          "--output", str(packages / ("before-" + s["before_inventory"]["sha256"] + ".tar.gz")))
        selected_release = call("package_after", "pack", "--source", str(after), "--source-ref", s["after_ref"],
                                "--output", str(packages / ("after-" + s["after_inventory"]["sha256"] + ".tar.gz")))
        preflight = call("preflight", "preflight", "--node", str(pathlib.Path(s["node"]).resolve()),
                         "--user", user.pw_name, "--port", str(s.get("port", 8429)))
        require(len(after_pins) >= 189 and set(REQUIRED_CURRENT_SOURCES) <= set(after_pins),
                "The selected complete current edition is required before installation or upgrade")
        existing = lifecycle["existing"]
        fresh = lifecycle["mode"] == "fresh_selected"
        if fresh:
            require(existing is None, "Fresh installation cannot select an existing workspace")
            control = self.root / "installation"
            workspace_parent = directory(self.root / "initial-workspace", 0o700, user.pw_uid, user.pw_gid)
            install_args = ["install", "--root", str(control), "--operation-id", op + "-install",
                            "--release", selected_release["path"], "--sha256", selected_release["sha256"],
                            "--node", str(pathlib.Path(s["node"]).resolve()), "--user", user.pw_name,
                            "--port", str(s.get("port", 8429)), "--workspace", str(workspace_parent / "workspace"),
                            "--initialize", "--title", "Data.gouv Linux administration receiving"]
            call("install", *install_args)
            replay = call("install_replay", *install_args)
            require(replay["reused"] is True, "Original install receipt was not reused")
            initial = call("initial_reopen", "status", "--root", str(control), "--workspace",
                           "--operation-id", op + "-install")
            require(initial["state"]["revision"] == 0 and
                    initial["state"]["active"]["release"] == selected_release["release_id"],
                    "Fresh installation did not initialize the selected complete edition")
            initial_revision = 0
            upgrade_coverage = {"status": "not_exercised",
                                "reason": "No existing initialized predecessor workspace was selected",
                                "historical_predecessor_retained": historical["release_id"],
                                "fresh_selected_release": selected_release["release_id"]}
        else:
            require(isinstance(existing, dict) and
                    set(existing) == {"root", "revision", "release_id", "workspace_id"} and
                    type(existing["revision"]) is int and existing["revision"] >= 0 and
                    isinstance(existing["release_id"], str) and len(existing["release_id"]) == 64 and
                    isinstance(existing["workspace_id"], str) and existing["workspace_id"],
                    "Pin the existing installation root, revision, release and workspace")
            control = pathlib.Path(existing["root"])
            require(control.is_absolute() and control.is_dir() and not control.is_symlink(),
                    "Select the existing ordinary managed installation")
            initial = call("existing_reopen", "status", "--root", str(control), "--workspace")
            state = initial["state"]
            require(state["revision"] == existing["revision"] and
                    state["active"]["release"] == existing["release_id"] and
                    state["active"]["workspace_id"] == existing["workspace_id"],
                    "The existing installation changed from the selected original pins")
            for key in ("user", "uid", "gid", "node", "node_sha256", "port"):
                require(state["runtime"][key] == preflight["runtime"][key],
                        "The selected runtime differs from the existing installation: " + key)
            require(existing["release_id"] != selected_release["release_id"],
                    "A source upgrade requires a different complete selected release")
            initial_revision = existing["revision"]
            upgrade_coverage = {"status": "pending", "from_release": existing["release_id"],
                                "to_release": selected_release["release_id"]}
        workspace_id = initial["state"]["active"]["workspace_id"]
        initial_release = initial["state"]["active"]["release"]
        baseline_counts = {key: initial["workspace"][key] for key in
                           ("captures", "publications", "providerOperations")}
        if fresh:
            require(all(value == 0 for value in baseline_counts.values()),
                    "Fresh administration receiving unexpectedly contains publisher work")
        backup_args = ["backup", "--root", str(control), "--operation-id", op + "-backup",
                       "--expected-revision", str(initial_revision)]
        saved = call("backup", *backup_args)
        saved_replay = call("backup_replay", *backup_args)
        require(saved_replay["reused"] is True and saved_replay["backup"] == saved["backup"],
                "Original backup receipt changed")
        current_revision = initial_revision
        updated_revision = None
        current = initial
        if not fresh:
            update_args = ["update", "--root", str(control), "--operation-id", op + "-update",
                           "--expected-revision", str(initial_revision),
                           "--release", selected_release["path"], "--sha256", selected_release["sha256"]]
            updated = call("update", *update_args)
            replay = call("update_replay", *update_args)
            require(replay["reused"] is True and replay["state"] == updated["state"],
                    "Original upgrade receipt changed")
            current = call("updated_reopen", "status", "--root", str(control), "--workspace",
                           "--operation-id", op + "-update")
            current_revision = initial_revision + 1
            updated_revision = current_revision
            require(current["state"]["revision"] == current_revision and
                    current["state"]["active"]["workspace_id"] == workspace_id and
                    current["state"]["active"]["release"] == selected_release["release_id"],
                    "Upgraded workspace/release identity differs")
            upgrade_coverage["status"] = "exercised"
        restore_args = ["restore", "--root", str(control), "--operation-id", op + "-restore",
                        "--expected-revision", str(current_revision), "--backup-operation", op + "-backup"]
        restored = call("restore", *restore_args)
        replay = call("restore_replay", *restore_args)
        require(replay["reused"] is True and replay["state"] == restored["state"], "Original restore receipt changed")
        final = call("restored_reopen", "status", "--root", str(control), "--workspace",
                     "--operation-id", op + "-restore")
        require(final["state"]["revision"] == current_revision + 1 and
                final["state"]["active"]["workspace_id"] == workspace_id and
                final["state"]["active"]["release"] == initial_release, "Restored workspace/source identity differs")
        require(restored["restored_from"]["workspaceFingerprint"] == saved["backup"]["workspaceFingerprint"],
                "Restoration baseline changed")
        for observation in (current, final):
            require({key: observation["workspace"][key] for key in baseline_counts} == baseline_counts,
                    "Administration changed the existing publisher work counts")
        unit = call("render_unit", "unit", "--root", str(control), "--name", "datagouv-publisher",
                    "--output", str(self.private / "datagouv-publisher.service"))
        require(unit["installed"] is False and unit["started"] is False, "System service scope differs")
        result = {"schema": SCHEMA, "status": "PASS", "operation_id": op, "completed_at": now(),
                  "lifecycle": lifecycle, "source_transition": changes,
                  "before_source_files": len(before_pins), "after_source_files": len(after_pins),
                  "historical_before_release": historical, "selected_release": selected_release,
                  "upgrade_coverage": upgrade_coverage, "workspace_id": workspace_id,
                  "initial_revision": initial_revision, "updated_revision": updated_revision,
                  "restored_revision": current_revision + 1, "backup": saved["backup"],
                  "final_active": final["state"]["active"],
                  "same_operation_replay": (["install"] if fresh else []) + ["backup"] +
                                           ([] if fresh else ["update"]) + ["restore"],
                  "initialization_identity": initial.get("operation", {}).get("initialize_attempts"),
                  "native_restore_attempts": final["operation"]["receive_attempts"],
                  "service_unit": unit, "service_account": {"user": user.pw_name, "uid": user.pw_uid, "gid": user.pw_gid},
                  "provider_writes": 0, "servers_started": 0, "system_service_started": False,
                  "evidence": str(self.path)}
        self.record["result"] = result
        self.save()
        atomic(self.private / "result.json", result)
        print(json.dumps({"operation_id": op, "stage": "completed", "status": "PASS",
                          "result": str(self.private / "result.json")}), flush=True)
        return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--amendment")
    parser.add_argument("--runtime-handoff")
    parser.add_argument("--lock-fd", type=int, help="Inherit the original receiver lock through native children")
    args = parser.parse_args()
    selected = json.loads(read_regular(pathlib.Path(args.input).absolute()))
    amendment = json.loads(read_regular(pathlib.Path(args.amendment).absolute())) if args.amendment else None
    runtime_handoff = json.loads(read_regular(pathlib.Path(args.runtime_handoff).absolute())) if args.runtime_handoff else None
    receiving = Receiving(selected, amendment, runtime_handoff, args.lock_fd)
    try:
        if receiving.record.get("result"):
            # Completed original receiving is returned unchanged. Current operational
            # observations belong to the administrator's status command.
            print(json.dumps(receiving.record["result"], sort_keys=True), flush=True)
            return
        receiving.operate()
    except BaseException as error:
        receiving.record["last_error"] = {"at": now(), "type": type(error).__name__, "message": str(error)}
        receiving.save()
        raise

if __name__ == "__main__":
    main()
