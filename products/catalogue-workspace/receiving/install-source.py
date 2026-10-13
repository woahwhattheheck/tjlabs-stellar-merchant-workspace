#!/usr/bin/env python3
"""Install a retained catalogue bundle into one explicitly selected native project."""
from __future__ import annotations
import argparse
import copy
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile

SCHEMA = "tjl.catalogue.native-installation.v1"
PACKAGE = "tjl/catalogue-workspace"
BUNDLE = "Tjl\\CatalogueWorkspace\\TjlCatalogueWorkspaceBundle"
VERSION = "dev-native-catalogue"

class Attention(RuntimeError):
    pass

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

def raw(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def atomic(path, data, mode=0o600):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def require(condition, message):
    if not condition:
        raise Attention(message)

def relative(value):
    require(isinstance(value, str) and value and "\\" not in value, "Supply a POSIX relative source path.")
    p = PurePosixPath(value)
    require(not p.is_absolute() and all(x not in ("", ".", "..") for x in p.parts), "Unsafe relative path.")
    return p

def within(root, path):
    path = Path(path)
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError as error:
        raise Attention("Selected member escapes its original root.") from error
    return path

def identity(path):
    path = Path(path)
    if not path.exists():
        return None
    require(path.is_file() and not path.is_symlink(), "Expected a regular native file: " + str(path))
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": digest(data), "mode": stat.S_IMODE(path.stat().st_mode)}

def process_start(pid):
    try:
        value = Path("/proc/" + str(pid) + "/stat").read_text()
        return value[value.rfind(")") + 2:].split()[19]
    except (OSError, IndexError):
        return None

def native_worker(job_path, lock_fd):
    """Direct awaited child; the inherited operation lock survives parent loss."""
    job = read_json(job_path)
    result_path = Path(job["result"])
    require(not result_path.exists(), "The original native child already returned.")
    stdout = Path(job["stdout"])
    stderr = Path(job["stderr"])
    env = dict(os.environ)
    env.update(job["environment"])
    started = now()
    with stdout.open("xb") as out, stderr.open("xb") as err:
        child = subprocess.Popen(job["argv"], cwd=job["cwd"], env=env, stdin=subprocess.DEVNULL,
                                 stdout=out, stderr=err, close_fds=True, pass_fds=(lock_fd,))
        atomic(Path(job_path).with_name("process.json"), raw({
            "pid": child.pid, "start_identity": process_start(child.pid), "started_at": started,
            "argv": job["argv"], "cwd": job["cwd"], "job_sha256": digest(raw(job))
        }))
        code = child.wait()
        out.flush()
        err.flush()
        os.fsync(out.fileno())
        os.fsync(err.fileno())
    result = {"schema": "tjl.catalogue.native-command-result.v1", "argv": job["argv"],
              "cwd": job["cwd"], "environment": job["environment"], "started_at": started,
              "completed_at": now(), "pid": child.pid, "returncode": code,
              "stdout": {"path": str(stdout), **identity(stdout)},
              "stderr": {"path": str(stderr), **identity(stderr)}, "job_sha256": digest(raw(job))}
    atomic(result_path, raw(result))
    return 0

class Installation:
    def __init__(self, request_path, work, lock_fd):
        self.request_path = Path(request_path).resolve()
        self.request_bytes = self.request_path.read_bytes()
        self.request = json.loads(self.request_bytes)
        require(self.request.get("schema") == SCHEMA, "Use the original native installation schema.")
        self.id = self.request.get("operation_id", "")
        require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", self.id), "Supply a stable original operation ID.")
        self.work = Path(work).resolve()
        self.lock_fd = lock_fd
        self.root = Path(self.request["project_root"]).resolve()
        self.source = Path(self.request["source_root"]).resolve()
        require(self.root.is_dir() and self.source.is_dir(), "Actual project and complete bundle source are required.")
        self.php = self.request["php"]
        self.composer_argv = self.request["composer_argv"]
        require(isinstance(self.composer_argv, list) and self.composer_argv and all(isinstance(x, str) and x for x in self.composer_argv),
                "Select the original complete Composer argv.")
        require(Path(self.php).is_absolute() and Path(self.php).is_file(), "Select the actual PHP executable or wrapper.")
        self.console = within(self.root, self.root / str(relative(self.request.get("console", "bin/console"))))
        require(self.console.is_file(), "The original native bin/console is absent.")
        self.actor = self.request.get("actor", "")
        require(isinstance(self.actor, str) and self.actor, "An existing native admin actor is required.")
        self.environment = self.request.get("environment", "prod")
        require(re.fullmatch(r"[A-Za-z0-9_-]+", self.environment), "Use an original Symfony environment name.")
        self.directory = Path(self.request["directory"])
        require(self.directory.is_absolute(), "Select an absolute private shared workspace directory.")
        self.role = self.request.get("operator_role", "ROLE_ADMINISTRATION_ACCESS")
        require(re.fullmatch(r"ROLE_[A-Z0-9_]+", self.role), "Use the original selected admin role.")
        state_file = self.work / "state.json"
        if state_file.exists():
            self.state = read_json(state_file)
            require(self.state["request_sha256"] == digest(self.request_bytes), "Continue the same original complete installation request.")
            require(self.state["project_root"] == str(self.root), "The selected native project root changed.")
        else:
            self.state = {"schema": SCHEMA, "operation_id": self.id, "request_sha256": digest(self.request_bytes),
                          "project_root": str(self.root), "source_root": str(self.source), "created_at": now(),
                          "phase": "PREPARING", "commands": {}}
            atomic(self.work / "request.json", self.request_bytes)
            self.save()
        self.prepared = self.work / "prepared"
        self.prepared.mkdir(exist_ok=True, mode=0o700)
        self.package_path = "packages/catalogue-workspace/" + self.id
        self.package_root = within(self.root, self.root / self.package_path)
        self.candidate = self.root / (".catalogue-install-" + self.id + ".json")
        self.candidate_lock = self.candidate.with_suffix(".lock")

    def save(self):
        atomic(self.work / "state.json", raw(self.state))

    def command(self, label, argv, environment=None, retry_failed=False, accepted_returncodes=(0,)):
        require(re.fullmatch(r"[a-z0-9._-]+", label), "Invalid retained command label.")
        directory = self.work / "commands" / label
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        attempts = sorted(directory.glob("attempt-*"))
        attempt = attempts[-1] if attempts else directory / "attempt-0001"
        if attempt.exists() and (attempt / "result.json").exists():
            old = read_json(attempt / "result.json")
            if old["returncode"] != 0 and retry_failed:
                attempt = directory / ("attempt-%04d" % (len(attempts) + 1))
        attempt.mkdir(exist_ok=True, mode=0o700)
        job = {"argv": argv, "cwd": str(self.root), "environment": environment or {},
               "stdout": str(attempt / "stdout.bin"), "stderr": str(attempt / "stderr.bin"),
               "result": str(attempt / "result.json")}
        job_path = attempt / "job.json"
        if job_path.exists():
            require(read_json(job_path) == job, "Native command selection changed under its original label.")
        else:
            atomic(job_path, raw(job))
        result_path = attempt / "result.json"
        if not result_path.exists():
            if (attempt / "admitted.json").exists():
                raise Attention("The original command has no observed final exit. Preserve its child/output; do not replay: " + label)
            atomic(attempt / "admitted.json", raw({"at": now(), "job_sha256": digest(raw(job))}))
            child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "_native-worker",
                                      "--job", str(job_path), "--lock-fd", str(self.lock_fd)],
                                     stdin=subprocess.DEVNULL, close_fds=True, pass_fds=(self.lock_fd,))
            child.wait()
        require(result_path.exists(), "Original command outcome is uncertain; retain the same attempt: " + label)
        result = read_json(result_path)
        require(result.get("argv") == argv and result.get("cwd") == str(self.root) and result.get("job_sha256") == digest(raw(job)),
                "The retained native command identity differs.")
        for stream in ("stdout", "stderr"):
            row = result[stream]
            actual = identity(row["path"])
            require(actual is not None and actual["bytes"] == row["bytes"] and actual["sha256"] == row["sha256"],
                    "An original native stream differs.")
        self.state["commands"][label] = {"result": str(result_path), "sha256": digest(raw(result)), "returncode": result["returncode"]}
        self.save()
        require(type(result.get("returncode")) is int and result["returncode"] in accepted_returncodes,
                "Original native command failed; inspect its complete streams: " + label)
        return result

    def source_files(self):
        manifest_path = Path(self.request["source_manifest"]).resolve()
        manifest = read_json(manifest_path)
        rows = manifest.get("files")
        require(isinstance(rows, list) and rows, "Supply the complete selected bundle source manifest.")
        files = {}
        for row in rows:
            name = str(relative(row["path"]))
            require(name not in files, "Duplicate source member.")
            path = within(self.source, self.source / name)
            actual = identity(path)
            require(actual is not None and actual["bytes"] == row["bytes"] and actual["sha256"] == row["sha256"],
                    "Complete original source mismatch: " + name)
            files[name] = {**actual, "path": name}
        require("composer.json" in files and "src/TjlCatalogueWorkspaceBundle.php" in files and "config/routes.php" in files,
                "The complete native bundle, package and route source are required.")
        package = read_json(self.source / "composer.json")
        require(package["name"] == PACKAGE, "Wrong native package source.")
        full = {str(p.relative_to(self.source)).replace(os.sep, "/") for p in self.source.rglob("*") if p.is_file()}
        extra = full - set(files) - set(self.request.get("source_metadata_files", []))
        require(not extra, "Unmanifested bundle members: " + ", ".join(sorted(extra)[:8]))
        for name, row in files.items():
            destination = within(self.package_root, self.package_root / name)
            if destination.exists():
                current = identity(destination)
                require(current["bytes"] == row["bytes"] and current["sha256"] == row["sha256"], "Original staged source changed.")
            else:
                atomic(destination, (self.source / name).read_bytes(), row["mode"])
        return {"manifest_sha256": digest(manifest_path.read_bytes()), "files": [files[k] for k in sorted(files)],
                "package_path": self.package_path, "package_sha256": digest(raw(package))}

    def remember_file(self, name):
        path = within(self.root, self.root / str(relative(name)))
        key = "original/" + name
        retained = self.work / key
        before = identity(path)
        if name not in self.state.setdefault("before", {}):
            if before is not None:
                atomic(retained, path.read_bytes())
            self.state["before"][name] = before
            self.save()
        return self.state["before"][name]

    def prepare(self, retry_labels):
        if self.state.get("review_sha256"):
            return self.review()
        selected_source = self.source_files()
        if "source" in self.state:
            require(self.state["source"] == selected_source, "Continue the complete original selected bundle source.")
        self.state["source"] = selected_source
        self.save()
        for name in ("composer.json", "composer.lock", "config/bundles.php",
                     "config/packages/tjl_catalogue_workspace.yaml", "config/routes/tjl_catalogue_workspace.yaml"):
            self.remember_file(name)
        require(self.state["before"]["composer.json"] and self.state["before"]["composer.lock"] and
                self.state["before"]["config/bundles.php"], "An existing installed Composer project and bundle registration are required.")
        original = read_json(self.work / "original/composer.json")
        original_lock = read_json(self.work / "original/composer.lock")
        locked = {x["name"]: x for x in original_lock.get("packages", [])}
        require(locked.get("webgriffe/sylius-akeneo-plugin", {}).get("version", "").lstrip("v") == "3.1.0",
                "Select the installed reviewed Webgriffe3.1.0 project; no implicit connector upgrade.")
        require("sylius/sylius" in locked, "The actual installed Sylius graph is required.")
        proposed = copy.deepcopy(original)
        proposed.setdefault("require", {})[PACKAGE] = VERSION
        repository = {"type": "path", "url": self.package_path,
                      "options": {"symlink": False, "versions": {PACKAGE: VERSION}}}
        repositories = proposed.setdefault("repositories", [])
        if isinstance(repositories, dict):
            repositories["tjl-catalogue-workspace"] = repository
        else:
            require(isinstance(repositories, list), "Unsupported original Composer repositories shape.")
            repositories = [x for x in repositories if not (isinstance(x, dict) and x.get("type") == "path" and
                             str(x.get("url", "")).startswith("packages/catalogue-workspace/"))]
            proposed["repositories"] = [repository] + repositories
        proposed_bytes = raw(proposed)
        if self.candidate.exists():
            require(self.candidate.read_bytes() == proposed_bytes, "Retain the exact original Composer candidate.")
        else:
            atomic(self.candidate, proposed_bytes)
        atomic(self.prepared / "composer.json", proposed_bytes)
        if not self.candidate_lock.exists():
            atomic(self.candidate_lock, (self.work / "original/composer.lock").read_bytes())
        native = [self.php, "-r", "require $argv[1]; echo json_encode(['php'=>PHP_VERSION,'extensions'=>get_loaded_extensions(),'webgriffe'=>Composer\\InstalledVersions::getPrettyVersion('webgriffe/sylius-akeneo-plugin'),'sylius'=>Composer\\InstalledVersions::getPrettyVersion('sylius/sylius')],JSON_THROW_ON_ERROR);",
                  str(self.root / "vendor/autoload.php")]
        observed = self.command("inspect-installed", native, retry_failed="inspect-installed" in retry_labels)
        installed = json.loads(Path(observed["stdout"]["path"]).read_text())
        require(installed["webgriffe"].lstrip("v") == "3.1.0", "Installed vendor differs from the selected original lock.")
        require(tuple(int(x) for x in installed["php"].split(".")[:2]) >= (8, 2), "The native PHP runtime must support this exact package.")
        require("zip" in installed["extensions"], "The existing PHP wrapper needs its native ZipArchive extension.")
        self.state["installed"] = installed
        self.save()
        composer = self.composer_argv + ["update", PACKAGE, "--with-dependencies", "--no-install", "--no-scripts", "--no-interaction", "--no-progress"]
        if not self.request.get("allow_original_composer_plugins", False):
            composer.append("--no-plugins")
        self.command("resolve-native-lock", composer, {"COMPOSER": str(self.candidate)},
                     retry_failed="resolve-native-lock" in retry_labels)
        require(self.candidate_lock.is_file(), "Native Composer did not publish its complete candidate lock.")
        new_lock = read_json(self.candidate_lock)
        for section in ("packages", "packages-dev"):
            current = {x["name"]: x for x in original_lock.get(section, [])}
            proposed_rows = {x["name"]: x for x in new_lock.get(section, [])}
            for name, row in current.items():
                if name != PACKAGE:
                    require(proposed_rows.get(name) == row, "Native plan changes an existing package; commission that upgrade separately: " + name)
        require(any(x.get("name") == PACKAGE for x in new_lock.get("packages", [])), "Native Composer omitted the selected package.")
        atomic(self.prepared / "composer.lock", self.candidate_lock.read_bytes())
        helper = Path(__file__).with_name("prepare-bundles.php")
        require(helper.is_file(), "The complete native source installation helper is absent.")
        bundle_output = self.prepared / "config/bundles.php"
        self.command("prepare-bundles", [self.php, str(helper), str(self.work / "original/config/bundles.php"),
                                        str(bundle_output)], retry_failed="prepare-bundles" in retry_labels)
        atomic(self.prepared / "config/packages/tjl_catalogue_workspace.yaml",
               ("tjl_catalogue_workspace:\n  directory: " + json.dumps(str(self.directory)) +
                "\n  operator_role: " + json.dumps(self.role) + "\n  max_export_bytes: " +
                str(int(self.request.get("max_export_bytes", 10737418240))) + "\n").encode())
        atomic(self.prepared / "config/routes/tjl_catalogue_workspace.yaml",
               b"tjl_catalogue_workspace:\n  resource: '@TjlCatalogueWorkspaceBundle/config/routes.php'\n  prefix: '/%sylius_admin.path_name%/catalogue-workspace'\n")
        files = []
        for name, before in self.state["before"].items():
            post = self.prepared / name
            files.append({"path": name, "before": before, "after": identity(post), "postimage": str(post)})
        review = {"schema": "tjl.catalogue.native-install-review.v1", "operation_id": self.id,
                  "request_sha256": self.state["request_sha256"], "project_root": str(self.root), "actor": self.actor,
                  "source": self.state["source"], "installed": installed, "files": files,
                  "commands": self.state["commands"], "created_at": now(),
                  "native_steps": ["composer install from exact reviewed lock", "cache:clear", "catalogue:workspace install",
                                   "catalogue:workspace engine"],
                  "original_workers": self.request.get("worker_authority", {}),
                  "notice": "This review does not stop workers, resolve a different graph, create fixtures or change source credentials."}
        atomic(self.work / "review.json", raw(review))
        self.state["review_sha256"] = digest(raw(review))
        self.state["phase"] = "REVIEWED"
        self.save()
        return self.review()

    def review(self):
        path = self.work / "review.json"
        require(path.is_file() and digest(path.read_bytes()) == self.state.get("review_sha256"), "Original review is absent or changed.")
        return {**read_json(path), "review_sha256": self.state["review_sha256"]}

    def apply(self, expected, retry_labels):
        require(expected == self.state.get("review_sha256"), "Apply only the exact original reviewed installation.")
        review = self.review()
        require(self.source_files() == review["source"], "The complete reviewed source selection changed.")
        if self.state["phase"] == "COMPLETE":
            return self.state
        self.state["phase"] = "APPLYING"
        self.save()
        for row in review["files"]:
            target = self.root / row["path"]
            current = identity(target)
            after = row["after"]
            if current is not None and current["sha256"] == after["sha256"] and current["bytes"] == after["bytes"]:
                continue
            require(current == row["before"], "An original native configuration changed after review: " + row["path"])
            postimage = Path(row["postimage"]).read_bytes()
            require(digest(postimage) == after["sha256"] and len(postimage) == after["bytes"], "Reviewed postimage changed.")
            atomic(target, postimage, (row["before"] or {}).get("mode", 0o644))
        composer = self.composer_argv + ["install", "--no-scripts", "--no-interaction", "--no-progress"]
        if not self.request.get("install_dev_dependencies", False):
            composer.append("--no-dev")
        if not self.request.get("allow_original_composer_plugins", False):
            composer.append("--no-plugins")
        self.command("install-reviewed-lock", composer, {"COMPOSER": str(self.root / "composer.json")},
                     retry_failed="install-reviewed-lock" in retry_labels)
        require(identity(self.root / "composer.lock")["sha256"] == identity(self.prepared / "composer.lock")["sha256"],
                "Native installation changed the exact reviewed lock.")
        console = [self.php, str(self.console), "--env=" + self.environment, "--no-interaction"]
        self.command("cache-clear", console + ["cache:clear"], retry_failed="cache-clear" in retry_labels)
        empty = self.work / "native-input.json"
        if not empty.exists():
            atomic(empty, raw({}))
        for action in ("install", "engine"):
            output = self.work / ("native-" + action + ".json")
            label = "catalogue-" + action
            result = self.command(label, console + ["catalogue:workspace", action, "--input", str(empty),
                                  "--operation-id", self.id + "-" + action, "--actor", self.actor, "--output", str(output)],
                                  retry_failed=label in retry_labels)
            require(output.is_file(), "Native catalogue command did not retain its original output.")
            envelope = read_json(output)
            require(envelope.get("schema") == "tjl.catalogue.workspace-result.v1" and envelope.get("action") == action and
                    envelope.get("operation_id") == self.id + "-" + action and envelope.get("state") == "COMPLETE",
                    "The native catalogue command requires attention.")
            self.state[action] = {"output": str(output), **identity(output), "result": envelope}
            self.save()
        self.state["phase"] = "COMPLETE"
        self.state["completed_at"] = now()
        self.state["installed_files"] = review["files"]
        self.save()
        return self.state

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["prepare", "review", "apply", "status", "_native-worker"])
    parser.add_argument("--request")
    parser.add_argument("--work-directory")
    parser.add_argument("--expect-review")
    parser.add_argument("--output")
    parser.add_argument("--retry-failed", action="append", default=[])
    parser.add_argument("--job")
    parser.add_argument("--lock-fd", type=int)
    args = parser.parse_args()
    if args.phase == "_native-worker":
        return native_worker(args.job, args.lock_fd)
    require(args.request and args.work_directory, "Supply the original request and private work directory.")
    work = Path(args.work_directory).resolve()
    work.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (work / "installation.lock").open("a+b") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        installation = Installation(args.request, work, lock.fileno())
        if args.phase == "prepare":
            result = installation.prepare(set(args.retry_failed))
        elif args.phase == "review":
            result = installation.review()
        elif args.phase == "apply":
            result = installation.apply(args.expect_review, set(args.retry_failed))
        else:
            result = installation.state
        if args.output:
            atomic(args.output, raw(result))
        print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Attention, BlockingIOError) as error:
        print(json.dumps({"schema": SCHEMA, "state": "ATTENTION", "message": str(error)}), file=sys.stderr)
        raise SystemExit(2)
