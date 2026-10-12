#!/usr/bin/env python3
"""Run one original selected build and complete customer receiving under native admission."""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
from datetime import datetime, timezone
import uuid
import zipfile

OPERATION = "COINGECKO-PRODUCT-DELIVERY-5403-20261012"
SOURCE = "ada4e3261a421010f93ef4bda9ce8b0b2624d4c1"
REPOSITORY = "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git"
BUILDER_SHA = "ad1772df26785e6917f9edb6071828f581209a602004075b95258a315aba8c91"
CUSTOMER_SHA = "c8cfb54174dbc381bde7f4581cd4e9c0f06b93a7b6145680c01d21474ab8020f"
ZIP_SHA = "6dff8fc354d9992ca7f19227d893a34c745f86da0d1cb642bd6ee144933fcbce"
NODE = "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node"
GIT = "/usr/local/bin/git"

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()

def need(condition, message):
    if not condition:
        raise ValueError(message)

def read_json(path):
    return json.loads(Path(path).read_bytes())

def descriptor(path):
    path = Path(path)
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode), "Expected an original regular file: " + str(path))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(part)
    after = path.lstat()
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
         "File changed during receipt: " + str(path))
    return {"path": str(path), "bytes": after.st_size, "sha256": digest.hexdigest()}

def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def atomic(path, data, immutable=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if immutable and path.exists():
        need(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
             "Preserve changed original file: " + str(path))
        return
    temporary = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".next")
    try:
        with temporary.open("xb") as stream:
            os.chmod(temporary, 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
                     "Original publication differs: " + str(path))
        else:
            os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()

def retain_file(source, destination):
    expected = descriptor(source)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if destination.exists():
        actual = descriptor(destination)
        need((actual["bytes"], actual["sha256"]) == (expected["bytes"], expected["sha256"]),
             "Retained complete artifact differs: " + str(destination))
        return actual
    temporary = destination.with_name("." + destination.name + "." + uuid.uuid4().hex + ".next")
    try:
        with Path(source).open("rb") as src, temporary.open("xb") as dst:
            os.chmod(temporary, 0o600)
            shutil.copyfileobj(src, dst, 1024 * 1024)
            dst.flush()
            os.fsync(dst.fileno())
        actual = descriptor(temporary)
        need((actual["bytes"], actual["sha256"]) == (expected["bytes"], expected["sha256"]),
             "Retained artifact copy changed.")
        try:
            os.link(temporary, destination)
        except FileExistsError:
            actual = descriptor(destination)
            need((actual["bytes"], actual["sha256"]) == (expected["bytes"], expected["sha256"]),
                 "Concurrent artifact publication differs.")
        sync_directory(destination.parent)
    finally:
        if temporary.exists():
            temporary.unlink()
    return descriptor(destination)

def carrier(path, expected, key):
    body = Path(path).read_bytes()
    need(sha_bytes(body) == expected, "The original " + key + " carrier changed.")
    value = json.loads(body)
    members = value["files"] if key == "builder" else value["members"]
    for member in members:
        relative = PurePosixPath(member["path"])
        need(not relative.is_absolute() and all(p not in ("", ".", "..") for p in relative.parts)
             and "\\" not in member["path"], "Unsafe source member.")
        content = member["content"].encode("utf-8")
        need(len(content) == member["bytes"] and sha_bytes(content) == member["sha256"],
             "Original source member differs: " + member["path"])
        if member.get("git_blob"):
            git_blob = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            need(git_blob == member["git_blob"], "Original Git source member differs.")
    return value, members

def archive_tree(destination, roots):
    """Closed regular files only, original relative names and bytes retained."""
    destination = Path(destination)
    members = []
    for prefix, root in roots:
        root = Path(root)
        need(root.exists(), "Archive source is absent: " + str(root))
        files = [root] if root.is_file() else sorted(root.rglob("*"))
        for path in files:
            need(not path.is_symlink(), "Retain a link through its original source package: " + str(path))
            if path.is_dir():
                continue
            need(path.is_file(), "Unexpected special file in closed customer state.")
            relative = path.name if root.is_file() else path.relative_to(root).as_posix()
            name = prefix.rstrip("/") + "/" + relative
            members.append((name, path, descriptor(path)))
    names = [name for name, _, _ in members]
    need(len(names) == len(set(names)), "Archive member identity collision.")
    if destination.exists():
        need(destination.is_file() and not destination.is_symlink(), "Existing archive is not an original regular file.")
        with zipfile.ZipFile(destination) as archive:
            need(archive.testzip() is None and len(archive.namelist()) == len(names)
                 and set(archive.namelist()) == set(names), "Existing archive membership differs.")
            for name, _, original in members:
                digest = hashlib.sha256()
                count = 0
                with archive.open(name) as stream:
                    for part in iter(lambda: stream.read(1024 * 1024), b""):
                        count += len(part)
                        digest.update(part)
                need(count == original["bytes"] and digest.hexdigest() == original["sha256"],
                     "Preserve the original archive and current recipient edition: " + name)
        return {"file": descriptor(destination), "members": [
            {"name": name, "bytes": value["bytes"], "sha256": value["sha256"]} for name, _, value in members]}
    temporary = destination.with_name("." + destination.name + "." + uuid.uuid4().hex + ".next")
    try:
        with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6,
                             allowZip64=True) as archive:
            for name, path, original in members:
                archive.write(path, name)
                current = descriptor(path)
                need((current["bytes"], current["sha256"]) == (original["bytes"], original["sha256"]),
                     "Source changed while retaining its closed archive.")
        with zipfile.ZipFile(temporary) as archive:
            need(archive.testzip() is None and set(archive.namelist()) == set(names),
                 "Complete archive verification failed.")
            for name, _, original in members:
                with archive.open(name) as stream:
                    digest = hashlib.sha256()
                    count = 0
                    for part in iter(lambda: stream.read(1024 * 1024), b""):
                        count += len(part)
                        digest.update(part)
                need(count == original["bytes"] and digest.hexdigest() == original["sha256"],
                     "Original member differs in retained archive: " + name)
        with temporary.open("rb") as stream:
            os.fsync(stream.fileno())
        os.link(temporary, destination)
        sync_directory(destination.parent)
    finally:
        if temporary.exists():
            temporary.unlink()
    return {"file": descriptor(destination), "members": [
        {"name": name, "bytes": value["bytes"], "sha256": value["sha256"]} for name, _, value in members]}

class Programme:
    def __init__(self, args):
        self.args = args
        self.run = Path(args.run).resolve()
        self.project = Path(args.project).resolve()
        self.inputs = Path(args.inputs).resolve()
        self.output = self.project / "output"
        self.output.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.logs = self.output / "commands"
        self.logs.mkdir(exist_ok=True, mode=0o700)
        self.journal_path = self.project / "programme.json"
        self.builder, self.builder_members = carrier(self.inputs / "builder.json", BUILDER_SHA, "builder")
        self.customer, self.customer_members = carrier(self.inputs / "customer.json", CUSTOMER_SHA, "customer")
        self.original_zip = Path(args.archive).resolve()
        original = descriptor(self.original_zip)
        need(original["bytes"] == 672184 and original["sha256"] == ZIP_SHA, "Original customer ZIP changed.")
        need(self.builder["source_commit"] == SOURCE and self.customer["productSource"]["commit"] == SOURCE,
             "Keep the original selected source.")
        self.input = {"schema": "commons.coingecko-selected-native-input.v1", "operation": OPERATION,
            "source_commit": SOURCE, "repository": REPOSITORY, "builder_sha256": BUILDER_SHA,
            "customer_sha256": CUSTOMER_SHA, "original_zip": original, "project": str(self.project),
            "pipeline_sha256": descriptor(Path(__file__))["sha256"]}
        atomic(self.project / "INPUT.json", encoded(self.input), immutable=True)
        self.journal = read_json(self.journal_path) if self.journal_path.exists() else {
            "schema": "commons.coingecko-selected-native-progress.v1", "input": self.input,
            "started_at": now(), "attempts": [], "events": []}
        need(self.journal["input"] == self.input, "Original programme input changed.")
        self.env = dict(os.environ)
        self.env.update({"GIT_TERMINAL_PROMPT": "0", "PYTHONDONTWRITEBYTECODE": "1",
            "TMPDIR": str(self.run / "temporary"), "npm_config_cache": str(self.run / "npm-cache"),
            "npm_config_update_notifier": "false", "npm_config_audit": "false",
            "npm_config_fund": "false"})
        self.env["PATH"] = str(Path(args.node).parent) + ":" + self.env.get("PATH", "")
        self.attempt = None

    def event(self, name, **values):
        record = {"at": now(), "name": name, **values}
        self.journal["events"].append(record)
        atomic(self.journal_path, encoded(self.journal))
        print(json.dumps(record), flush=True)

    def command(self, name, argv, *, stdin=None, cwd=None, parse_json=False):
        identifier = uuid.uuid4().hex
        base = self.logs / (name + "-" + identifier)
        invocation = {"operation": OPERATION, "attempt": self.attempt["id"], "stage": name,
                      "argv": [str(x) for x in argv], "cwd": str(cwd or self.run), "started_at": now()}
        atomic(str(base) + ".request.json", encoded(invocation), immutable=True)
        self.event("command_started", stage=name, invocation=str(base) + ".request.json")
        source = Path(stdin).open("rb") if stdin else None
        try:
            with open(str(base) + ".stdout", "xb") as stdout, open(str(base) + ".stderr", "xb") as stderr:
                completed = subprocess.run(invocation["argv"], cwd=cwd or self.run, env=self.env,
                    stdin=source if source else subprocess.DEVNULL, stdout=stdout, stderr=stderr, check=False)
                stdout.flush()
                stderr.flush()
                os.fsync(stdout.fileno())
                os.fsync(stderr.fileno())
        finally:
            if source:
                source.close()
        receipt = {**invocation, "ended_at": now(), "exit_code": completed.returncode,
                   "stdout": descriptor(str(base) + ".stdout"), "stderr": descriptor(str(base) + ".stderr")}
        atomic(str(base) + ".result.json", encoded(receipt), immutable=True)
        self.event("command_ended", stage=name, exit_code=completed.returncode,
                   result=str(base) + ".result.json")
        if completed.returncode:
            raise RuntimeError(name + " returned " + str(completed.returncode) +
                               "; its complete original stdout/stderr are retained in " + str(base))
        return read_json(str(base) + ".stdout") if parse_json else receipt

    def completed(self):
        path = self.output / "NATIVE_RESULT.json"
        if not path.exists():
            return None
        result = read_json(path)
        need(result["input"] == self.input and result["status"] == "RECEIVED",
             "Original completed programme differs.")
        for entry in result["artifacts"]:
            observed = descriptor(entry["path"])
            need((observed["bytes"], observed["sha256"]) == (entry["bytes"], entry["sha256"]),
                 "A retained complete artifact is missing or changed.")
        return result

    def accept_continuation(self, location):
        need(self.args.continuation, "Original transient state is unavailable; select its maintained terminal-result continuation.")
        handoff_path = Path(self.args.continuation).resolve()
        handoff = read_json(handoff_path)
        need(handoff["schema"] == "commons.coingecko-native-terminal-continuation.v1" and
             handoff["operation"] == OPERATION and handoff["programme_input"] == self.input and
             handoff["project"] == str(self.project), "Select the original completed native predecessor and project.")
        native_id = handoff["native_operation_id"]
        need(native_id.startswith(OPERATION + "-") and native_id != OPERATION,
             "An explicit native continuation needs a distinct phase identity.")
        selected = handoff["predecessor"]
        need(selected["mode"] == "terminal-result", "Keep the actual terminal-result predecessor.")
        sys.path.insert(0, handoff["native_host"])
        from native_foreground import load_native
        import native_placement
        runtime = load_native(handoff["native_host"])
        observed = native_placement.inspect_predecessor(selected["record"], native=runtime)
        need(observed["completed_and_released"] and observed["request_sha256"] == selected["request_sha256"]
             and observed["result_sha256"] == selected["result_sha256"]
             and observed["supervisor"] == selected["expected_supervisor"]
             and observed["native"]["project"] == str(self.project),
             "Original native predecessor changed or has not ended and released its resources.")
        request = read_json(Path(selected["record"]) / "request.json")
        argv = request["intent"]["command"]
        predecessor_id = request["intent"]["operation_id"]
        need(request["intent"]["project"] == str(self.project) and str(Path(__file__).resolve()) in argv
             and (predecessor_id == OPERATION or predecessor_id.startswith(OPERATION + "-"))
             and native_id != predecessor_id,
             "The original native command does not name this same programme/project or the phase is unchanged.")
        old = self.journal.get("current_transient", self.journal.get("transient"))
        handoff_sha = descriptor(handoff_path)["sha256"]
        previous = next((item for item in self.journal.get("continuations", [])
                         if item["handoff_sha256"] == handoff_sha), None)
        if previous:
            need(previous["to"] == location and old == location
                 and self.journal.get("current_native_operation_id") == native_id,
                 "Continue the same accepted transient placement.")
            return handoff
        need(old == handoff["previous_transient"]
             and self.journal.get("current_native_operation_id", OPERATION) == predecessor_id
             and descriptor(self.journal_path)["sha256"] == handoff["programme_progress_sha256"],
             "The original programme advanced after continuation selection; retain and inspect that same state.")
        self.journal.setdefault("continuations", []).append({
            "at": now(), "native_operation_id": native_id, "handoff": str(handoff_path),
            "handoff_sha256": handoff_sha, "predecessor": selected, "from": old, "to": location})
        self.journal["current_transient"] = location
        self.journal["current_native_operation_id"] = native_id
        atomic(self.journal_path, encoded(self.journal))
        return handoff

    def source_receipts(self, build=None, distribution=None):
        """Retain every original receipt before any archive can be published."""
        source_out = self.output / "source"
        source_out.mkdir(exist_ok=True, mode=0o700)
        envelope_path = source_out / "receipt-envelope.json"
        names = ("distribution.json", "build.json", "package/manifest.json", "pack-work/pack.json")
        if not envelope_path.exists():
            published = [path for path in source_out.iterdir() if not path.name.startswith(".")]
            need(not published, "Preserve the existing source artifacts without an original retention envelope.")
            if build is None:
                return None
            archive_path = Path(distribution["archive"]).resolve()
            original_archive = descriptor(archive_path)
            need(archive_path.parent == build and distribution["status"] == "PACKAGED"
                 and distribution["sourceCommit"] == SOURCE
                 and original_archive["bytes"] == distribution["archiveBytes"]
                 and original_archive["sha256"] == distribution["sha256"],
                 "The original complete source archive differs.")
            members = []
            for name in names:
                body = (build / name).read_bytes()
                members.append({"path": name, "bytes": len(body), "sha256": sha_bytes(body),
                                "content_base64": base64.b64encode(body).decode("ascii")})
            envelope = {"schema": "commons.coingecko-native-source-retention.v1",
                "input": self.input, "source_commit": SOURCE,
                "archive": {"name": archive_path.name, "bytes": original_archive["bytes"],
                            "sha256": original_archive["sha256"]}, "files": members}
            atomic(envelope_path, encoded(envelope), immutable=True)
        envelope = read_json(envelope_path)
        need(envelope["schema"] == "commons.coingecko-native-source-retention.v1"
             and envelope["input"] == self.input and envelope["source_commit"] == SOURCE,
             "Keep the original complete source retention envelope.")
        need(len(envelope["files"]) == len(names)
             and {row["path"] for row in envelope["files"]} == set(names),
             "The original receipt set changed.")
        bodies = {}
        for row in envelope["files"]:
            body = base64.b64decode(row["content_base64"], validate=True)
            need(len(body) == row["bytes"] and sha_bytes(body) == row["sha256"],
                 "Original retained receipt bytes changed.")
            bodies[row["path"]] = body
        original = json.loads(bodies["distribution.json"])
        manifest = json.loads(bodies["package/manifest.json"])
        intent = json.loads(bodies["build.json"])
        packed = json.loads(bodies["pack-work/pack.json"])
        archive = envelope["archive"]
        need(isinstance(archive["name"], str) and Path(archive["name"]).name == archive["name"]
             and archive["name"] == Path(original["archive"]).name
             and original["status"] == "PACKAGED" and original["sourceCommit"] == SOURCE
             and archive["bytes"] == original["archiveBytes"] == packed["size"]
             and archive["sha256"] == original["sha256"] == packed["sha256"]
             and manifest["sourceCommit"] == intent["sourceCommit"] == packed["sourceCommit"] == SOURCE
             and sha_bytes(bodies["package/manifest.json"]) == intent["manifestSha256"],
             "The retained source, manifest and original pack receipt disagree.")
        for name in names:
            atomic(source_out / name, bodies[name], immutable=True)
        return envelope, original, manifest

    def retained_source(self):
        received = self.source_receipts()
        if received is None:
            return None
        envelope, distribution, manifest = received
        source_out = self.output / "source"
        archive = source_out / envelope["archive"]["name"]
        if not archive.exists() and not archive.is_symlink():
            # Original receipt copies are complete and durable; the archive
            # itself has not yet been retained. A same-source build may finish
            # that copy only if its full archive matches this original envelope.
            return None
        observed = descriptor(archive)
        need(observed["bytes"] == envelope["archive"]["bytes"]
             and observed["sha256"] == envelope["archive"]["sha256"],
             "Original retained source archive changed.")
        paths = [archive, source_out / "distribution.json", source_out / "build.json",
                 source_out / "package/manifest.json", source_out / "pack-work/pack.json",
                 source_out / "receipt-envelope.json"]
        retained = [descriptor(path) for path in paths]
        marker = {"schema": "commons.coingecko-retained-source.v1", "input": self.input,
                  "source_commit": SOURCE, "files": retained}
        atomic(source_out / "retained-source.json", encoded(marker), immutable=True)
        retained.append(descriptor(source_out / "retained-source.json"))
        repeated_path = source_out / "completed-resume.json"
        status_path = source_out / "completed-status.json"
        repeated = read_json(repeated_path) if repeated_path.exists() else {
            "status": "NOT_OBSERVED_BEFORE_INTERRUPTION", "sourceCommit": SOURCE}
        status = read_json(status_path) if status_path.exists() else {
            "state": "NOT_OBSERVED_BEFORE_INTERRUPTION", "sourceCommit": SOURCE}
        if repeated_path.exists():
            need(repeated.get("reused") is True and repeated["sha256"] == observed["sha256"],
                 "Original completed build receiving changed.")
            retained.append(descriptor(repeated_path))
        if status_path.exists():
            need(status["state"] == "PACKAGED" and status["sha256"] == observed["sha256"],
                 "Original build status receipt changed.")
            retained.append(descriptor(status_path))
        return distribution, manifest, repeated, status, retained

    def adopt_retained_source(self, retained):
        distribution, manifest, repeated, status, artifacts = retained
        source_out = self.output / "source"
        archive = source_out / Path(distribution["archive"]).name
        target = self.run / "received-package"
        unpacker = self.run / "bootstrap/stellar/scf-starforge-20261009/distribution/runtime-unpack.py"
        argv = [sys.executable, "-B", str(unpacker), "--archive", str(archive),
                "--sha256", distribution["sha256"], "--out", str(target)]
        if target.exists():
            argv.append("--verify")
        unpacked = self.command("adopt-original-completed-source", argv, parse_json=True)
        need(unpacked["sourceCommit"] == SOURCE and
             unpacked["manifestSha256"] == sha_bytes((source_out / "package/manifest.json").read_bytes())
             and (target / "manifest.json").read_bytes() == (source_out / "package/manifest.json").read_bytes(),
             "Original archive adoption differs from its retained source.")
        adopted = {"schema": "commons.coingecko-retained-source-adoption.v1", "input": self.input,
                   "continuation": self.continuation, "archive": descriptor(archive),
                   "native_unpack": unpacked, "at": now()}
        path = self.output / "source-adoptions" / (self.attempt["id"] + ".json")
        atomic(path, encoded(adopted), immutable=True)
        artifacts.append(descriptor(path))
        self.event("original_completed_source_adopted", receipt=str(path), archive=descriptor(archive))
        return distribution, manifest, repeated, status, artifacts, Path(unpacked["sourceRoot"]), adopted

    def execute(self):
        old = self.completed()
        if old:
            print(json.dumps({"status": "RECEIVED", "replayed": True, "operation": OPERATION,
                              "result": str(self.output / "NATIVE_RESULT.json"),
                              "completed_at": old["completed_at"]}), flush=True)
            return 0
        location = {"path": str(self.run), "device": self.run.stat().st_dev}
        old_location = self.journal.get("current_transient", self.journal.get("transient"))
        self.continuation = None
        if old_location:
            if old_location != location or not (self.run / ".programme-owner.json").exists() or self.args.continuation:
                self.continuation = self.accept_continuation(location)
        else:
            need(not self.args.continuation, "There is no original programme state to continue.")
            self.journal["transient"] = location
            self.journal["current_transient"] = location
            self.journal["current_native_operation_id"] = OPERATION
        atomic(self.run / ".programme-owner.json", encoded({"operation": OPERATION, "input": self.input}),
               immutable=True)
        self.attempt = {"id": str(uuid.uuid4()), "started_at": now(), "status": "RUNNING"}
        self.journal["attempts"].append(self.attempt)
        self.event("programme_started", attempt=self.attempt["id"], transient=location)
        for name in ("temporary", "npm-cache", "bootstrap", "customer-programme"):
            (self.run / name).mkdir(exist_ok=True, mode=0o700)
        try:
            for member in self.builder_members:
                atomic(self.run / "bootstrap" / member["path"], member["content"].encode("utf-8"), immutable=True)
            for member in self.customer_members:
                atomic(self.run / "customer-programme" / member["path"],
                       member["content"].encode("utf-8"), immutable=True)
            retained_source = self.retained_source() if self.continuation else None
            if retained_source is not None:
                distribution, manifest, repeated, status, retained, built_source, source_recovery = self.adopt_retained_source(retained_source)
            else:
                git = self.run / "source.git"
                if not git.exists():
                    self.command("git-init", [self.args.git, "init", "--bare", str(git)])
                self.command("git-origin", [self.args.git, "--git-dir", str(git), "config", "remote.origin.url", REPOSITORY])
                self.command("git-promisor", [self.args.git, "--git-dir", str(git), "config", "remote.origin.promisor", "true"])
                self.command("git-filter", [self.args.git, "--git-dir", str(git), "config", "remote.origin.partialclonefilter", "blob:none"])
                if self.args.git_objects:
                    objects = Path(self.args.git_objects).resolve()
                    need(objects.is_dir(), "Original borrowed Git object directory is unavailable.")
                    atomic(git / "objects/info/alternates", (str(objects) + "\n").encode(), immutable=True)
                available = subprocess.run([self.args.git, "--no-replace-objects", "--no-lazy-fetch",
                    "--git-dir", str(git), "cat-file", "-e", SOURCE + "^{commit}"],
                    env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False).returncode == 0
                if not available:
                    self.command("git-selected-source", [self.args.git, "--git-dir", str(git), "fetch",
                        "--depth=1", "--no-tags", "--no-write-fetch-head", "--no-auto-maintenance",
                        "--recurse-submodules=no", "--filter=blob:none", "origin", SOURCE])
                resolved = self.command("git-source-identity", [self.args.git, "--no-replace-objects",
                    "--no-lazy-fetch", "--git-dir", str(git), "rev-parse", "--verify", "--end-of-options", SOURCE + "^{commit}"])
                need(Path(resolved["stdout"]["path"]).read_text().strip() == SOURCE, "Git resolved another source.")
                builder = self.run / "bootstrap/stellar/scf-starforge-20261009/distribution/build.mjs"
                build = self.run / "selected-build"
                arguments = [self.args.node, str(builder), "--repo", str(git), "--ref", SOURCE,
                             "--selection", "coingecko", "--out", str(build), "--python", sys.executable]
                if build.exists():
                    arguments.append("--resume")
                first = self.command("selected-build", arguments, parse_json=True)
                need(first["status"] == "PACKAGED" and first["sourceCommit"] == SOURCE, "Original build did not complete.")
                distribution = read_json(build / "distribution.json")
                manifest = read_json(build / "package/manifest.json")
                need(distribution["sourceCommit"] == SOURCE and manifest["sourceCommit"] == SOURCE,
                     "Selected build manifest differs.")
                archive_path = Path(distribution["archive"]).resolve()
                need(archive_path.parent == build, "Original builder archive is outside its selected output.")
                observed = descriptor(archive_path)
                need(observed["bytes"] == distribution["archiveBytes"] and observed["sha256"] == distribution["sha256"],
                     "Original built archive differs from its receipt.")
                source_out = self.output / "source"
                source_out.mkdir(exist_ok=True, mode=0o700)
                actual_build = distribution
                envelope, original_distribution, original_manifest = self.source_receipts(build, distribution)
                need(observed["bytes"] == envelope["archive"]["bytes"]
                     and observed["sha256"] == envelope["archive"]["sha256"]
                     and archive_path.name == envelope["archive"]["name"],
                     "The selected source rebuild differs from the original retained archive identity.")
                retain_file(archive_path, source_out / envelope["archive"]["name"])
                distribution, manifest, _, _, retained = self.retained_source()
                source_recovery = None if actual_build == original_distribution else {
                    "schema": "commons.coingecko-source-retention-completed.v1",
                    "reason": "Original receipts were durable before the complete archive copy.",
                    "original_envelope": descriptor(source_out / "receipt-envelope.json"),
                    "actual_same_source_build": actual_build, "original_archive_verified_equal": True}
                repeated = self.command("selected-build-resume", [self.args.node, str(builder), "--repo", str(git),
                    "--out", str(build), "--resume"], parse_json=True)
                need(repeated.get("reused") is True and repeated["sha256"] == distribution["sha256"],
                     "Original completed build did not reopen its same archive.")
                status = self.command("selected-build-status", [self.args.node, str(builder),
                                      "--out", str(build), "--status"], parse_json=True)
                need(status["state"] == "PACKAGED" and status["sha256"] == distribution["sha256"],
                     "Original build status differs.")
                atomic(source_out / "completed-resume.json", encoded(repeated), immutable=True)
                atomic(source_out / "completed-status.json", encoded(status), immutable=True)
                retained.extend([descriptor(source_out / "completed-resume.json"),
                                 descriptor(source_out / "completed-status.json")])
                self.event("selected_source_retained", archive=retained[0], source_files=distribution["sourceFiles"],
                           source_bytes=distribution["sourceBytes"], installed_bytes=distribution["installedBytes"])
                built_source = build / "package/source"
            customer_root = self.project / "customer"
            customer_root.mkdir(exist_ok=True, mode=0o700)
            select_script = self.run / "customer-programme/select-original-archive.sh"
            self.env["COIN_RETAINED_ZIP"] = str(self.original_zip)
            self.env["COIN_CUSTOMER_ROOT"] = str(customer_root)
            selected = self.command("select-original-customer-archive", ["/bin/bash", str(select_script)], parse_json=True)
            original_market = Path(selected["archive"]).resolve()
            need(original_market.parent == customer_root and descriptor(original_market)["sha256"] == selected["sha256"],
                 "Original selected project archive changed.")
            programme = self.run / "customer-programme/customer-receive.mjs"
            argv = [self.args.node, "--input-type=module", "-", str(built_source), str(original_market), str(customer_root)]
            received = self.command("complete-customer-receiving", argv, stdin=programme, parse_json=True)
            need(received["status"] == "RECEIVED", "Original complete customer programme did not finish.")
            completed_bytes = (customer_root / "customer-receiving.json").read_bytes()
            received_again = self.command("completed-customer-receiving", argv, stdin=programme, parse_json=True)
            need(received_again.get("replayed") is True and received_again["recipientProjectId"] == received["recipientProjectId"]
                 and (customer_root / "customer-receiving.json").read_bytes() == completed_bytes,
                 "Completed customer continuation changed its original completion or recipient.")
            customer_archive = archive_tree(self.output / "CoinGecko_Complete_Customer_Receiving.zip", [
                ("original-delivery", self.original_zip), ("customer", customer_root),
                ("programme", self.run / "customer-programme")])
            atomic(self.output / "customer-archive-members.json", encoded(customer_archive), immutable=True)
            result = {"schema": "commons.coingecko-selected-build-customer-native.v1", "status": "RECEIVED",
                "input": self.input, "operation": OPERATION, "source_commit": SOURCE,
                "started_at": self.journal["started_at"], "completed_at": now(), "native_build": distribution,
                "native_manifest": manifest, "completed_build_resume": repeated, "completed_build_status": status,
                "source_recovery": source_recovery, "continuations": self.journal.get("continuations", []),
                "customer_receiving": received, "customer_completed_replay": received_again,
                "customer_state_directory": str(customer_root / "recipient-market"),
                "customer_project_id": received["recipientProjectId"], "customer_archive": customer_archive,
                "artifacts": retained + [customer_archive["file"], descriptor(self.output / "customer-archive-members.json"),
                                        descriptor(customer_root / "customer-receiving.json")],
                "source_runtime_was_transient": str(built_source),
                "source_retained_as_original_archive": retained[0],
                "payments_requested": 0, "dependency_installations_requested": 0}
            atomic(self.output / "NATIVE_RESULT.json", encoded(result), immutable=True)
            self.attempt.update(status="RECEIVED", completed_at=result["completed_at"])
            self.event("programme_completed", result=str(self.output / "NATIVE_RESULT.json"),
                       archive=retained[0], customer_archive=customer_archive["file"])
            print(json.dumps({"status": "RECEIVED", "operation": OPERATION,
                              "result": str(self.output / "NATIVE_RESULT.json"),
                              "source_archive": retained[0], "customer_archive": customer_archive["file"]}), flush=True)
            return 0
        except Exception as error:
            self.attempt.update(status="FAILED", ended_at=now(),
                                error={"type": type(error).__name__, "message": str(error)})
            self.event("programme_failed", attempt=self.attempt["id"], error=self.attempt["error"],
                       customer_state_directory=str(self.project / "customer"),
                       transient_state=str(self.run))
            raise

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--inputs", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--node", default=NODE)
    parser.add_argument("--git", default=GIT)
    parser.add_argument("--git-objects")
    parser.add_argument("--continuation")
    args = parser.parse_args()
    project = Path(args.project).resolve()
    project.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (project / "programme.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return Programme(args).execute()

if __name__ == "__main__":
    raise SystemExit(main())
