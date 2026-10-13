"""Receive and finish the original FEDOMG Camino operator course.

The complete immutable capsule is supplied by the source-owned bootstrap. Fresh
download grants are invocation input and are never written into the public course.
The original connected Library helpers own all uploads and finalization.
"""
from __future__ import annotations
import base64, contextlib, datetime, fcntl, gzip, hashlib, importlib.util, io
import json, os, pathlib, runpy, shutil, stat, subprocess, sys, tempfile
import re, traceback, urllib.parse, urllib.request, uuid, zipfile

OPERATION = "FEDOMG-ODSMG-P2-2026-DSCEB3-20261013"
ROOT = pathlib.Path("/mnt/data/camino-guyane-dsceb3-20261013")
CAPSULE_PATH = pathlib.Path(os.environ["CAMINO_SOURCE_CAPSULE"])
CAPSULE_SHA256 = os.environ["CAMINO_SOURCE_CAPSULE_SHA256"]
CAPSULE_BYTES = int(os.environ["CAMINO_SOURCE_CAPSULE_BYTES"])
MAX_SOURCE = 16 * 1024 * 1024

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def emit(stage, **value):
    print(json.dumps({"stage": stage, "operation": OPERATION, **value}, ensure_ascii=False), flush=True)

def read(path):
    return json.loads(pathlib.Path(path).read_bytes())

def regular(path, maximum=None):
    path = pathlib.Path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or (maximum is not None and before.st_size > maximum):
            raise ValueError("Expected an owned regular file within its selected size.")
        raw = stream.read() if maximum is None else stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    keys = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    if any(getattr(before, key) != getattr(after, key) for key in keys):
        raise ValueError("The complete original file changed while being read.")
    return raw

def identity(path):
    path = pathlib.Path(path)
    raw = regular(path)
    return {"path": str(path), "bytes": len(raw), "sha256": sha(raw)}

def private_directory(path):
    path = pathlib.Path(path).absolute()
    if path.is_symlink():
        raise ValueError("The owned receiving directory must not be a symbolic link.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir():
        raise ValueError("The owned receiving root is not a directory.")
    os.chmod(path, 0o700)
    return path

def atomic(path, raw):
    path = pathlib.Path(path)
    private_directory(path.parent)
    fd, name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
        dfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    return path

def immutable(path, raw):
    path = pathlib.Path(path)
    if path.exists() or path.is_symlink():
        if regular(path) != raw:
            raise ValueError("The original retained source/input changed: " + str(path))
        return path
    private_directory(path.parent)
    fd, name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        try:
            os.link(name, path)
        except FileExistsError:
            if regular(path) != raw:
                raise ValueError("Concurrent original source differs: " + str(path))
        return path
    finally:
        if os.path.exists(name):
            os.unlink(name)

def member(root, value):
    p = pathlib.PurePosixPath(value)
    if (not value or p.is_absolute() or ".." in p.parts or "." in p.parts
            or "\\" in value or str(p) != value):
        raise ValueError("Invalid complete source member.")
    target = pathlib.Path(root).joinpath(*p.parts)
    current = pathlib.Path(root)
    for part in p.parts[:-1]:
        current /= part
        if current.is_symlink():
            raise ValueError("An original source directory is a symbolic link.")
    return target

def validate_capsule(raw):
    capsule = json.loads(raw)
    if capsule["operation"] != OPERATION:
        raise ValueError("The original receiving operation differs.")
    files = {}
    for item in capsule["files"]:
        member(ROOT / "source", item["path"])
        if item["path"] in files:
            raise ValueError("Duplicate complete source member.")
        body = (base64.b64decode(item["content"], validate=True)
                if item.get("encoding") == "base64" else item["content"].encode("utf-8"))
        if len(body) != item["bytes"] or sha(body) != item["sha256"]:
            raise ValueError("Selected source member differs: " + item["path"])
        if item["path"].endswith(".py"):
            compile(body, item["path"], "exec")
        files[item["path"]] = body
    return capsule, files

def source_pins(capsule):
    return [{"path": item["path"], "bytes": item["bytes"], "sha256": item["sha256"]}
            for item in sorted(capsule["files"], key=lambda row: row["path"])]

def immutable_context(capsule):
    return {key: value for key, value in capsule.items()
            if key not in {"files", "programme_sha256", "caller_sha256", "source_successor"}}

def finish_source_adoption(journal, capsule):
    state_path = ROOT / "receiving-state.json"
    if state_path.exists():
        state = read(state_path)
        if state["operation"] != OPERATION or state["capsule_sha256"] not in {
                journal["previous_capsule_sha256"], journal["capsule_sha256"]}:
            raise ValueError("The original source-adoption state differs.")
        state["source_history"] = state.get("source_history", [])
        if not any(row["capsule_sha256"] == journal["capsule_sha256"] for row in state["source_history"]):
            state["source_history"].append({
                "previous_capsule_sha256": journal["previous_capsule_sha256"],
                "capsule_sha256": journal["capsule_sha256"],
                "previous_source": journal["previous_source"],
                "adopted_at": now(),
                "preserved_phases": sorted(state.get("phases", {}))})
        state["capsule_sha256"] = journal["capsule_sha256"]
        atomic(state_path, encoded(state))
    journal["status"] = "COMPLETE"
    journal["completed_at"] = now()
    atomic(ROOT / "source-adoption.json", encoded(journal))
    immutable(ROOT / "source-history" / journal["capsule_sha256"] / "adoption.json", encoded(journal))

def load_capsule():
    raw = regular(CAPSULE_PATH, MAX_SOURCE)
    if len(raw) != CAPSULE_BYTES or sha(raw) != CAPSULE_SHA256:
        raise ValueError("The complete selected receiving source differs.")
    capsule, new_files = validate_capsule(raw)
    caller_raw = regular(__file__, MAX_SOURCE)
    caller_path = "products/camino-guyane/complete_receive.py"
    if (sha(caller_raw) != capsule.get("caller_sha256")
            or new_files.get(caller_path) != caller_raw):
        raise ValueError("The actual whole receiving caller differs from its selected source.")
    current_path = ROOT / "source-capsule.json"
    journal_path = ROOT / "source-adoption.json"
    pending = read(journal_path) if journal_path.exists() else None
    if pending and pending.get("status") == "PREPARED":
        if pending["capsule_sha256"] != CAPSULE_SHA256:
            raise ValueError("Finish the exact retained source successor before another correction.")
        old_raw = regular(ROOT / pending["previous_source"], MAX_SOURCE)
    else:
        old_raw = regular(current_path, MAX_SOURCE) if current_path.exists() else None
    if old_raw is not None and sha(old_raw) != CAPSULE_SHA256:
        previous_sha = sha(old_raw)
        old, old_files = validate_capsule(old_raw)
        successor = capsule.get("source_successor")
        if (not isinstance(successor, dict)
                or successor.get("previous_capsule_sha256") != previous_sha
                or successor.get("previous_file_preimages") != source_pins(old)
                or immutable_context(old) != immutable_context(capsule)
                or not set(old_files).issubset(new_files)):
            raise ValueError("Adopt an explicit complete source successor with unchanged original inputs.")
        history_relative = "source-history/" + previous_sha + "/source-capsule.json"
        immutable(ROOT / history_relative, old_raw)
        if not pending or pending.get("status") != "PREPARED":
            for path, body in old_files.items():
                target = member(ROOT / "source", path)
                if not target.exists() and not target.is_symlink():
                    immutable(target, body)
                if regular(target) != body:
                    raise ValueError("Current complete source preimage differs: " + path)
            pending = {"schema": "commons.camino-source-adoption.v1", "status": "PREPARED",
                       "previous_capsule_sha256": previous_sha, "capsule_sha256": CAPSULE_SHA256,
                       "previous_source": history_relative, "prepared_at": now(),
                       "preimages": source_pins(old), "postimages": source_pins(capsule)}
            atomic(journal_path, encoded(pending))
        else:
            if (pending["previous_capsule_sha256"] != previous_sha
                    or pending["preimages"] != source_pins(old)
                    or pending["postimages"] != source_pins(capsule)):
                raise ValueError("The retained source-adoption journal differs.")
        for path, body in new_files.items():
            target = member(ROOT / "source", path)
            if target.exists() or target.is_symlink():
                observed = regular(target)
                if observed != body and observed != old_files.get(path):
                    raise ValueError("Source correction found an unrelated postimage: " + path)
            atomic(target, body)
        atomic(current_path, raw)
        finish_source_adoption(pending, capsule)
    else:
        immutable(current_path, raw)
        for path, body in new_files.items():
            immutable(member(ROOT / "source", path), body)
        if pending and pending.get("status") == "PREPARED":
            if pending["capsule_sha256"] != CAPSULE_SHA256:
                raise ValueError("The pending source successor differs.")
            finish_source_adoption(pending, capsule)
    immutable(ROOT / "source-index.json", capsule["source_index_raw"].encode("utf-8"))
    immutable(ROOT / "source-history" / "callers" / (sha(caller_raw) + ".py"), caller_raw)
    return capsule

class Course:
    def __init__(self, capsule):
        self.capsule = capsule
        self.state_path = ROOT / "receiving-state.json"
        if self.state_path.exists():
            self.state = read(self.state_path)
            if self.state["operation"] != OPERATION or self.state["capsule_sha256"] != CAPSULE_SHA256:
                raise ValueError("Resume the same original receiving selection.")
        else:
            self.state = {"schema": "commons.camino-complete-receiving.v1", "operation": OPERATION,
                          "capsule_sha256": CAPSULE_SHA256, "created_at": now(), "events": [],
                          "inputs": {}, "phases": {}, "saves": {}, "attempts": [], "status": "PREPARED"}
            self.persist()
        self.prepared = None
        self.node = None

    def persist(self):
        atomic(self.state_path, encoded(self.state))

    def record(self, stage, **data):
        value = {"stage": stage, "at": now(), **data}
        self.state["events"].append(value)
        self.persist()
        emit(stage, **data)

    def receive_inputs(self, downloads):
        if not isinstance(downloads, list):
            raise ValueError("Supply the actual freshly resolved original download grants.")
        grants = {}
        for row in downloads:
            ref, url = row.get("reference"), row.get("url")
            if ref in grants or not isinstance(ref, str) or not isinstance(url, str):
                raise ValueError("Duplicate or incomplete original grant.")
            parsed = urllib.parse.urlsplit(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Use the original HTTPS download grant.")
            grants[ref] = url
        data = json.loads(self.capsule["source_index_raw"])["files"]
        packages = self.capsule["workbook_archives"]
        originals = data + packages
        if set(grants) - {item["reference"] for item in originals}:
            raise ValueError("A grant refers to an unselected input.")
        received = []
        for item in originals:
            name = item["filename"]
            if pathlib.PurePath(name).name != name:
                raise ValueError("Original filename is not a single path component.")
            directory = ROOT / ("inputs" if item in data else "packages")
            destination = member(directory, name)
            previous = self.state["inputs"].get(item["reference"])
            if destination.exists():
                raw = regular(destination, 32 * 1024 * 1024)
            else:
                url = grants.get(item["reference"])
                if url is None:
                    raise ValueError("Refresh the missing original download grant: " + name)
                private_directory(directory)
                partial = destination.with_name(destination.name + ".partial")
                request = urllib.request.Request(url, headers={"User-Agent": "Commons-Camino-Original-Receiving"})
                with urllib.request.urlopen(request, timeout=120) as response:
                    if response.status != 200:
                        raise ValueError("Original download did not return a complete body.")
                    with open(partial, "wb") as output:
                        total = 0
                        while True:
                            block = response.read(64 * 1024)
                            if not block:
                                break
                            total += len(block)
                            if total > 32 * 1024 * 1024:
                                raise ValueError("Original input exceeds the selected receiving bound.")
                            output.write(block)
                        output.flush(); os.fsync(output.fileno())
                raw = regular(partial, 32 * 1024 * 1024)
            current = {"filename": name, "path": str(destination), "bytes": len(raw), "sha256": sha(raw),
                       "reference": item["reference"]}
            if item.get("publisher_url"):
                current["publisher_url"] = item["publisher_url"]
            if item.get("bytes") is not None and current["bytes"] != item["bytes"]:
                raise ValueError("Original byte count differs: " + name)
            if item.get("sha256") is not None and current["sha256"] != item["sha256"]:
                raise ValueError("Original source hash differs: " + name)
            if previous is not None and previous != current:
                raise ValueError("The previously received original input differs: " + name)
            immutable(destination, raw)
            partial = destination.with_name(destination.name + ".partial")
            if partial.exists():
                if regular(partial, 32 * 1024 * 1024) != raw:
                    raise ValueError("Original partial file differs after receiving.")
                partial.unlink()
            self.state["inputs"][item["reference"]] = current
            self.persist()
            if item in data:
                received.append(current)
            emit("camino_original_input_retained", filename=name, bytes=len(raw), sha256=current["sha256"])
        manifest = {"schema": "commons.camino-received-inputs.v1",
                    "source_index_sha256": self.capsule["source_index_sha256"], "files": received}
        immutable(ROOT / "inputs/received.json", encoded(manifest))
        return ROOT / "inputs/received.json"

    def runtime(self):
        node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
        if not node:
            raise ValueError("The original supplier parser requires an actual Node executable.")
        observed = subprocess.run([node, "--version"], capture_output=True, text=True, check=True)
        match = re.fullmatch(r"v([0-9]+)\.[0-9]+\.[0-9]+\s*", observed.stdout)
        if match is None:
            raise ValueError("The selected native Node did not return its actual version.")
        self.node = str(pathlib.Path(node).resolve(strict=True))
        self.record("camino_actual_node_selected", executable=self.node, version=observed.stdout.strip())
        helper_path = ROOT / "source/products/camino-guyane/runtime.py"
        spec = importlib.util.spec_from_file_location("camino_original_runtime", helper_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.prepared = module.prepare_runtime(
            ROOT / "runtime",
            runtime_archive=ROOT / "source/products/camino-guyane/runtime-source.json.gz",
            runtime_descriptor=ROOT / "source/products/camino-guyane/runtime-source.json",
            workbook_descriptor=ROOT / "source/products/camino-guyane/workbook-runtime.json",
            package_archives={item["filename"]: ROOT / "packages" / item["filename"]
                              for item in self.capsule["workbook_archives"]})
        actual = module.activate_runtime(self.prepared)
        self.record("camino_original_runtime_bound", source_ref=self.prepared["source_ref"],
                    python=actual["python_executable"], packages=actual["packages"])
        return self.prepared

    def call(self, phase, arguments, collect_outputs):
        prior = self.state["phases"].get(phase)
        script = ROOT / "source/products/camino-guyane/receive.py"
        actual_source = identity(script)
        expected = next(item for item in self.capsule["files"]
                        if item["path"] == "products/camino-guyane/receive.py")
        if (actual_source["bytes"] != expected["bytes"]
                or actual_source["sha256"] != expected["sha256"]
                or actual_source["sha256"] != self.capsule["programme_sha256"]):
            raise ValueError("The actual product entry differs from the selected original source.")
        for source in self.capsule["files"]:
            if source["path"].startswith("products/camino-guyane/"):
                current = identity(member(ROOT / "source", source["path"]))
                if current["bytes"] != source["bytes"] or current["sha256"] != source["sha256"]:
                    raise ValueError("A selected complete programme dependency differs.")
        normalized = list(arguments)
        runtime_bindings = {}
        for flag in ("--node", "--browser-executable", "--playwright-module"):
            if flag in normalized:
                position = normalized.index(flag) + 1
                if position >= len(normalized):
                    raise ValueError("Incomplete actual runtime argument.")
                runtime_bindings[flag] = normalized[position]
                normalized[position] = "<actual-runtime:" + flag[2:] + ">"
        selected = {"arguments": normalized}
        if prior is not None and prior["selection"] != selected:
            raise ValueError("The original product phase changed: " + phase)
        if prior and prior.get("status") == "COMPLETE":
            for item in prior.get("outputs", []):
                if identity(item["path"]) != item:
                    raise ValueError("A completed original output differs.")
            return prior["result"]
        item = prior or {"selection": selected, "attempts": []}
        item["status"] = "RUNNING"
        attempt = {"id": str(uuid.uuid4()), "started_at": now(),
                   "capsule_sha256": CAPSULE_SHA256, "programme_sha256": actual_source["sha256"],
                   "caller_sha256": sha(regular(__file__, MAX_SOURCE)),
                   "actual_arguments": arguments, "runtime_bindings": runtime_bindings}
        item["attempts"].append(attempt)
        self.state["phases"][phase] = item
        self.persist()
        argv = [str(script), *arguments]
        log_root = private_directory(ROOT / "logs")
        stdout = log_root / (phase + "-" + attempt["id"] + ".stdout")
        stderr = log_root / (phase + "-" + attempt["id"] + ".stderr")
        old_argv = sys.argv
        programme_root = str(script.parent)
        if programme_root not in sys.path:
            sys.path.insert(0, programme_root)
        code = 0
        try:
            sys.argv = argv
            with open(stdout, "w", encoding="utf-8") as out, open(stderr, "w", encoding="utf-8") as err:
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    try:
                        runpy.run_path(str(script), run_name="__main__")
                    except SystemExit as exit_error:
                        code = exit_error.code if isinstance(exit_error.code, int) else (0 if exit_error.code is None else 1)
            if code:
                raise RuntimeError("Original product command exited " + str(code))
            product = collect_outputs()
            if (not isinstance(product, dict) or not isinstance(product.get("files"), list)
                    or not product["files"]):
                raise ValueError("The original product phase must retain its actual complete outputs.")
            snapshots = []
            snapshot_root = private_directory(ROOT / "phase-snapshots" / phase / attempt["id"])
            for number, original_path in enumerate(product["files"]):
                original_path = pathlib.Path(original_path).resolve(strict=True)
                if not original_path.is_relative_to(ROOT):
                    raise ValueError("A product output is outside the original owned root.")
                raw_output = regular(original_path)
                snapshot = immutable(snapshot_root / (str(number).zfill(3) + "-" + original_path.name), raw_output)
                snapshots.append({"original_path": str(original_path), **identity(snapshot)})
            immutable(snapshot_root / "product.json", encoded(product))
            result = {"exit_code": code, "stdout": identity(stdout), "stderr": identity(stderr),
                      "product": product, "snapshots": snapshots,
                      "product_snapshot": identity(snapshot_root / "product.json")}
            item.update(status="COMPLETE", result=result,
                        outputs=[identity(stdout), identity(stderr), *[
                            {key: snap[key] for key in ("path", "bytes", "sha256")} for snap in snapshots],
                            identity(snapshot_root / "product.json")])
            attempt["completed_at"] = now()
            self.persist()
            self.record("camino_product_phase_returned", phase=phase, state="COMPLETE")
            return result
        except BaseException as error:
            item["status"] = "INTERRUPTED"
            attempt["error"] = type(error).__name__ + ": " + str(error)
            attempt["ended_at"] = now()
            self.persist()
            raise
        finally:
            sys.argv = old_argv

    def bank(self, paths):
        uploads, keys = [], []
        for path, artifact_type in paths:
            path = pathlib.Path(path).resolve(strict=True)
            if not path.is_relative_to(ROOT) or path.is_symlink():
                raise ValueError("Save only complete files in the original owned root.")
            meta = identity(path)
            key = sha(encoded(meta))
            row = self.state["saves"].get(key)
            if row and row.get("status") == "COMPLETE":
                continue
            if row and row.get("status") in {"CALLING", "RESULT_UNKNOWN"}:
                result_path = ROOT / "save-receipts" / (row["save_id"] + "-result.json")
                if result_path.is_file() and result_path.stat().st_size:
                    actual = read(result_path).get("results", [])
                    matches = [saved for saved in actual
                               if saved.get("local_path") == meta["path"]]
                    if len(matches) == 1 and matches[0].get("status") == "succeeded":
                        saved = matches[0]
                        if not all(isinstance(saved.get(k), str) and saved[k]
                                   for k in ("file_id", "library_file_id")):
                            raise ValueError("The retained original save identity is incomplete.")
                        row.update(status="COMPLETE", result=saved, result_path=str(result_path),
                                   recovered_at=now())
                        self.persist()
                        continue
                    if len(matches) == 1 and matches[0].get("status") == "failed":
                        row.update(status="FAILED", result=matches[0], recovered_at=now())
                        self.persist()
                    else:
                        raise RuntimeError("Reconcile the original provider result: " + key)
                else:
                    raise RuntimeError("Reconcile the original provider result: " + key)
            uploads.append({"local_path": str(path), "purpose": "create_library_file",
                            "library_artifact_type": artifact_type})
            keys.append((key, meta))
        if not uploads:
            return []
        save_id = str(uuid.uuid4())
        directory = private_directory(ROOT / "save-receipts")
        request_path = immutable(directory / (save_id + "-request.json"), encoded({"uploads": uploads}))
        for key, meta in keys:
            self.state["saves"][key] = {"status": "CALLING", "input": meta, "save_id": save_id,
                                       "request": str(request_path), "started_at": now()}
        self.persist()
        out = directory / (save_id + "-result.json")
        err = directory / (save_id + "-stderr.log")
        helper = ROOT / "source/library/library_upload.py"
        with open(request_path, "rb") as incoming, open(out, "wb") as output, open(err, "wb") as errors:
            process = subprocess.run([sys.executable, "-u", "-B", str(helper)],
                                     stdin=incoming, stdout=output, stderr=errors, cwd=helper.parent)
        if process.returncode:
            for key, _ in keys:
                self.state["saves"][key].update(status="RESULT_UNKNOWN", result_path=str(out),
                                                stderr_path=str(err), returned_at=now())
            self.persist()
            raise RuntimeError("The original upload helper returned " + str(process.returncode))
        result = read(out)
        rows = result.get("results")
        if not isinstance(rows, list) or len(rows) != len(keys):
            raise ValueError("The original upload helper did not return every selected file.")
        for row in rows:
            if row.get("status") == "succeeded" and any(
                    not isinstance(row.get(name), str) or not row[name]
                    for name in ("file_id", "library_file_id")):
                raise ValueError("The complete original save has no provider identity.")
        for (key, meta), row in zip(keys, rows):
            if row.get("local_path") != meta["path"]:
                raise ValueError("The returned original save pathname differs.")
            self.state["saves"][key].update(
                status="COMPLETE" if row.get("status") == "succeeded" else "FAILED",
                result=row, result_path=str(out), stderr_path=str(err), returned_at=now())
        self.persist()
        if any(row.get("status") != "succeeded" for row in rows):
            raise RuntimeError("The original upload helper returned an incomplete save.")
        self.record("camino_complete_files_saved", save_id=save_id,
                    files=[{"file_id": row["file_id"], "library_file_id": row["library_file_id"],
                            "local_path": row["local_path"]} for row in rows])
        return rows

    def preserve(self, reason):
        """Retain one immutable full recovery point after a stopped product phase."""
        import signal
        for inspection in self.state.get("inspections", {}).values():
            self.finish_owned_process(inspection.get("browser_process"), signal.SIGTERM)
            self.finish_owned_process(inspection.get("server_process"), signal.SIGINT)
        checkpoint_key = sha(encoded({
            "reason": str(reason), "source": CAPSULE_SHA256,
            "phases": {key: value.get("attempts", [])[-1].get("id")
                       for key, value in self.state["phases"].items() if value.get("attempts")},
            "inspections": {key: value.get("attempt")
                            for key, value in self.state.get("inspections", {}).items()}}))
        prior = next((row for row in reversed(self.state.get("checkpoints", []))
                      if row.get("key") == checkpoint_key and row.get("status") == "SAVED"), None)
        if prior is not None:
            for field in ("archive", "descriptor"):
                if identity(prior[field]["path"]) != prior[field]:
                    raise ValueError("The complete original recovery archive changed.")
            return {key: prior[key] for key in ("archive", "descriptor")} | {"checkpoint_id": prior["id"]}
        checkpoint_id = str(uuid.uuid4())
        directory = private_directory(ROOT / "checkpoints" / checkpoint_id)
        self.state.setdefault("checkpoints", []).append(
            {"id": checkpoint_id, "key": checkpoint_key, "reason": str(reason), "at": now(), "status": "PREPARING"})
        self.persist()
        snapshot = immutable(directory / "receiving-state.json", encoded(self.state))
        failure = immutable(directory / "receiving-result.json", encoded({
            "schema": "commons.camino-receiving-checkpoint.v1",
            "operation": OPERATION, "root": str(ROOT), "checkpoint_id": checkpoint_id,
            "reason": str(reason), "state": self.state["status"],
            "source_capsule_sha256": CAPSULE_SHA256,
            "receiving_state": identity(snapshot), "created_at": now()}))
        # Keep the small actual result available even if archive construction fails.
        small_save_error = None
        try:
            self.bank([(failure, "report"), (snapshot, "other")])
        except BaseException as error:
            small_save_error = type(error).__name__ + ": " + str(error)
        archive = directory / "complete-receiving.zip"
        pending = directory / "complete-receiving.zip.partial"
        members, links = [], []
        excluded = {"checkpoints", ".camino-original-course.lock"}
        with zipfile.ZipFile(pending, "x", compression=zipfile.ZIP_DEFLATED,
                             compresslevel=6, allowZip64=True) as output:
            for parent, directories, filenames in os.walk(ROOT, followlinks=False):
                parent = pathlib.Path(parent)
                directories[:] = sorted(name for name in directories
                                        if not (parent == ROOT and name in excluded))
                for name in list(directories):
                    path = parent / name
                    if path.is_symlink():
                        links.append({"path": str(path.relative_to(ROOT)),
                                      "target": os.readlink(path), "kind": "runtime-directory-binding"})
                        directories.remove(name)
                for name in sorted(filenames):
                    path = parent / name
                    relative = path.relative_to(ROOT)
                    if ((parent == ROOT and name in excluded) or name == "analysis-launch.json"
                            or (relative.parts[0] == "inspections" and path.suffix.lower() == ".png")):
                        continue
                    # Preserve exact noncredential helper requests/results used to
                    # reconcile uncertain original saves after a cold restoration.
                    # Provider grants and the invocation auth journal stay outside ROOT.
                    if relative.parts[0] == "save-receipts" and not name.endswith(("-request.json", "-result.json")):
                        continue
                    if path.is_symlink():
                        links.append({"path": relative.as_posix(), "target": os.readlink(path),
                                      "kind": "runtime-file-binding"})
                        continue
                    if not path.is_file():
                        continue
                    # A checkpoint binds its immutable state, not the later save journal.
                    selected = snapshot if path == self.state_path else path
                    raw = regular(selected)
                    output.writestr(relative.as_posix(), raw)
                    members.append({"path": relative.as_posix(), "bytes": len(raw), "sha256": sha(raw)})
            manifest = {"schema": "commons.camino-complete-receiving-archive.v1",
                        "operation": OPERATION, "root": str(ROOT), "checkpoint_id": checkpoint_id,
                        "source_capsule_sha256": CAPSULE_SHA256, "members": members,
                        "execution_bindings": links, "created_at": now()}
            output.writestr("receiving-checkpoint-manifest.json", encoded(manifest))
        with pending.open("rb") as stream:
            os.fsync(stream.fileno())
        os.replace(pending, archive)
        descriptor = immutable(directory / "complete-receiving.json", encoded({
            **manifest, "archive": identity(archive), "small_save_error": small_save_error}))
        try:
            self.bank([(archive, "other"), (descriptor, "report")])
        except BaseException as error:
            self.state["checkpoints"][-1].update(
                status="RETAINED", archive=identity(archive), descriptor=identity(descriptor),
                save_error=type(error).__name__ + ": " + str(error))
            self.persist()
            raise
        self.state["checkpoints"][-1].update(
            status="SAVED", archive=identity(archive), descriptor=identity(descriptor))
        self.persist()
        return {"archive": identity(archive), "descriptor": identity(descriptor),
                "checkpoint_id": checkpoint_id}

    def product_outputs(self, directory):
        directory = pathlib.Path(directory).resolve(strict=True)
        course_file = directory / "course.json"
        value = read(course_file)
        if not isinstance(value.get("workspace"), str) or not isinstance(value.get("files"), list):
            raise ValueError("The original product did not return its complete course.")
        files = [course_file]
        for record in [*value["files"], value["archive"]]:
            path = pathlib.Path(record["path"]).resolve(strict=True)
            if not path.is_relative_to(ROOT):
                raise ValueError("An original product output left the owned receiving root.")
            current = identity(path)
            if any(current[key] != record[key] for key in ("bytes", "sha256")):
                raise ValueError("The actual exported whole product differs: " + str(path))
            if path not in files:
                files.append(path)
        return {"course": value, "files": [str(path) for path in files]}

    def save_product_outputs(self, product):
        paths = []
        for value in product["files"]:
            path = pathlib.Path(value)
            suffix = path.suffix.lower()
            kind = "sheet" if suffix == ".xlsx" else "report" if suffix in {".html", ".pdf", ".json"} else "other"
            paths.append((path, kind))
        return self.bank(paths)

    def open_exports(self, product, directory):
        """Open the original standalone JSON and every complete handover ZIP member."""
        import csv
        directory = private_directory(pathlib.Path(directory) / "opened-exports")
        records = []
        def describe(path):
            record = identity(path)
            suffix = pathlib.Path(path).suffix.lower()
            if suffix == ".json":
                value = read(path)
                record["opened_as"] = "json"
                record["top_level"] = list(value) if isinstance(value, dict) else type(value).__name__
            elif suffix == ".csv":
                with open(path, encoding="utf-8-sig", newline="") as incoming:
                    rows = csv.reader(incoming)
                    header = next(rows, [])
                    count, first, last = 0, [], None
                    for row in rows:
                        if count < 5:
                            first.append(row)
                        last = row
                        count += 1
                record.update(opened_as="csv", columns=header, rows=count, first_rows=first, last_row=last)
            elif suffix in {".md", ".txt", ".sql"}:
                text = regular(path).decode("utf-8")
                record.update(opened_as="text", characters=len(text))
            else:
                record["opened_as"] = "complete-original-member"
            return record
        for item in product["course"]["files"]:
            path = pathlib.Path(item["path"])
            if path.suffix.lower() == ".json":
                records.append(describe(path))
            elif path.suffix.lower() == ".zip":
                archive_record = {**identity(path), "opened_as": "zip", "members": []}
                destination = private_directory(directory / path.stem)
                with zipfile.ZipFile(path) as archive:
                    names = set()
                    for info in archive.infolist():
                        relative = pathlib.PurePosixPath(info.filename)
                        if (relative.is_absolute() or ".." in relative.parts or "\\" in info.filename
                                or info.filename in names or stat.S_ISLNK(info.external_attr >> 16)):
                            raise ValueError("Invalid complete original archive member.")
                        names.add(info.filename)
                        target = destination.joinpath(*relative.parts)
                        if info.is_dir():
                            private_directory(target)
                            continue
                        raw_member = archive.read(info)
                        if len(raw_member) != info.file_size:
                            raise ValueError("Incomplete original archive member.")
                        immutable(target, raw_member)
                        archive_record["members"].append(
                            {"archive_path": info.filename, **describe(target)})
                records.append(archive_record)
        report = immutable(directory / "opened-exports.json", encoded({
            "schema": "commons.camino-original-export-opening.v1", "operation": OPERATION,
            "files": records,
            "workspace_receiving": "The complete original project archive is reopened by the maintained workspace receiver.",
            "workbook_opening": "The original XLSX is retained unchanged for literal spreadsheet opening and rendered inspection."}))
        return identity(report)

    def process_binding(self, pid, argv):
        process = pathlib.Path("/proc") / str(pid)
        try:
            status = (process / "stat").read_text()
            suffix = status[status.rfind(")") + 2:].split()
            actual = (process / "cmdline").read_bytes().rstrip(b"\0").split(b"\0")
            expected = [os.fsencode(value) for value in argv]
            if suffix[0] == "Z":
                return None
            if actual != expected:
                raise ValueError("The retained process command differs from this original receiver.")
            return {"pid": pid, "start_ticks": suffix[19], "argv": argv,
                    "boot_id": pathlib.Path("/proc/sys/kernel/random/boot_id").read_text().strip()}
        except FileNotFoundError:
            return None

    def finish_owned_process(self, binding, signum):
        if not binding:
            return
        current_boot = pathlib.Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        if current_boot != binding["boot_id"]:
            return
        process = pathlib.Path("/proc") / str(binding["pid"])
        try:
            status = (process / "stat").read_text()
            suffix = status[status.rfind(")") + 2:].split()
        except FileNotFoundError:
            return
        # An unrelated reused PID is not this operation's process.
        if suffix[0] == "Z" or suffix[19] != binding["start_ticks"]:
            return
        actual = self.process_binding(binding["pid"], binding["argv"])
        if actual != binding:
            raise ValueError("Reconcile the original receiving process before starting another.")
        import signal, time
        os.kill(binding["pid"], signum)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if not process.exists():
                return
            current = self.process_binding(binding["pid"], binding["argv"])
            if current is None or current["start_ticks"] != binding["start_ticks"]:
                return
            time.sleep(0.1)
        raise RuntimeError("The original owned process has not finished its requested shutdown.")

    def inspect(self, edition, product, workspace):
        """Use the existing operator and its real downloads in one owned browser."""
        workspace = pathlib.Path(workspace).resolve(strict=True)
        if not workspace.is_relative_to(ROOT):
            raise ValueError("Inspect the original owned received workspace.")
        programme = ROOT / "source/products/camino-guyane/inspect_original.mjs"
        selected_source = next(row for row in self.capsule["files"]
                               if row["path"] == "products/camino-guyane/inspect_original.mjs")
        actual_source = identity(programme)
        if any(actual_source[key] != selected_source[key] for key in ("bytes", "sha256")):
            raise ValueError("The selected whole browser programme changed.")
        inspections = self.state.setdefault("inspections", {})
        old = inspections.get(edition)
        if old:
            import signal
            self.finish_owned_process(old.get("browser_process"), signal.SIGTERM)
            self.finish_owned_process(old.get("server_process"), signal.SIGINT)
        reusable = bool(old and old.get("status") in {"RENDERED", "LOOKED"})
        if reusable:
            for item in old["files"]:
                is_image = item["path"].endswith(".png")
                if is_image and not pathlib.Path(item["path"]).is_file():
                    if old["status"] == "LOOKED":
                        continue
                    reusable = False
                    break
                if identity(item["path"]) != item:
                    raise ValueError("A retained rendered output changed.")
        if reusable:
            self.bank([(row["path"], "sheet" if row["path"].endswith(".xlsx") else "report")
                       for row in old["files"] if not row["path"].endswith(".png")])
            return old
        attempt = str(uuid.uuid4())
        directory = private_directory(ROOT / "inspections" / edition / attempt)
        module = os.environ.get("CAMINO_PLAYWRIGHT")
        if not module:
            modules = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES")
            if modules:
                module = str(pathlib.Path(modules) / "playwright")
        if not module or not pathlib.Path(module).is_absolute():
            raise ValueError("Select this host's actual existing Playwright module.")
        browser = os.environ.get("CAMINO_CHROMIUM")
        argv = [sys.executable, "-u", "-B", "-m", "stellar_forge_buyer.analysis_workspace",
                "--database", str(workspace), "--checkout", self.prepared["source_root"],
                "--node", self.node, "serve", "--port", "0"]
        env = dict(os.environ)
        env["PYTHONPATH"] = os.pathsep.join([self.prepared["python_root"],
                                            *self.prepared["package_roots"].values()])
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        launch = workspace / "analysis-launch.json"
        server_log = directory / "operator.stdout"
        server_error = directory / "operator.stderr"
        server = None
        current = {"status": "RUNNING", "attempt": attempt, "directory": str(directory),
                   "programme": actual_source, "workspace": str(workspace), "at": now(),
                   "execution": {"argv": argv, "node": self.node, "python": sys.executable,
                                 "playwright": module, "browser": browser}}
        if old:
            current["history"] = [*old.get("history", []),
                                  {key: value for key, value in old.items() if key != "history"}]
        inspections[edition] = current
        self.persist()
        try:
            with open(server_log, "wb") as output, open(server_error, "wb") as errors:
                server = subprocess.Popen(argv, env=env, stdout=output, stderr=errors)
                current["server_pid"] = server.pid
                current["server_process"] = self.process_binding(server.pid, argv)
                self.persist()
                import time
                deadline = time.monotonic() + 45
                while True:
                    if server.poll() is not None:
                        raise RuntimeError("Original operator returned " + str(server.returncode))
                    if launch.is_file():
                        launch_value = read(launch)
                        if launch_value.get("pid") == server.pid:
                            break
                    if time.monotonic() >= deadline:
                        raise RuntimeError("The original operator did not return its actual launch file.")
                    time.sleep(0.1)
                value = product["course"]
                specification = {
                    "operation": OPERATION, "edition": edition, "directory": str(directory),
                    "private_launch": str(launch), "playwright_module": module,
                    "browser_executable": browser, "query_name": "camino_period_review",
                    "report_files": [row for row in value["files"] if row["name"].endswith(".html")],
                    "report_name": value["report"]["name"],
                    "report_job_id": value["report"]["job_id"],
                    "report_publication_id": value["report"]["publication_id"],
                    "workbook_job_id": value["workbook"]["job_id"],
                    "workbook_files": [row for row in value["files"] if row["name"].endswith(".xlsx")]}
                request = immutable(directory / "browser-input.json", encoded(specification))
                with open(directory / "browser.stdout", "wb") as browser_out, open(directory / "browser.stderr", "wb") as browser_err:
                    browser_argv = [self.node, str(programme), str(request)]
                    process = subprocess.Popen(browser_argv, stdout=browser_out, stderr=browser_err)
                    current["browser_process"] = self.process_binding(process.pid, browser_argv)
                    self.persist()
                    process.wait()
                if process.returncode:
                    raise RuntimeError("Original rendered receiving returned " + str(process.returncode))
                result_file = directory / "rendered-receiving.json"
                result = read(result_file)
                if result.get("state") != "RENDERED" or result.get("operation") != OPERATION:
                    raise ValueError("The actual browser course has not returned its rendered outputs.")
                opened = self.open_exports(product, directory)
                all_files = [identity(result_file), opened, *result["screenshots"], *result["downloads"]]
                current["files"] = [{key: row[key] for key in ("path", "bytes", "sha256")}
                                    for row in all_files]
                for item in current["files"]:
                    if identity(item["path"]) != item:
                        raise ValueError("The completed browser output changed.")
                current.update(status="RENDERED", result=result, completed_at=now())
                self.persist()
        except BaseException as error:
            current.update(status="INTERRUPTED", error=type(error).__name__ + ": " + str(error),
                           ended_at=now())
            self.persist()
            raise
        finally:
            import signal
            self.finish_owned_process(current.get("browser_process"), signal.SIGTERM)
            if server is not None and server.poll() is None:
                server.send_signal(signal.SIGINT)
                try:
                    server.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    server.terminate()
                    server.wait(timeout=20)
            current["server_returncode"] = server.returncode if server is not None else None
            self.persist()
        self.bank([(row["path"], "sheet" if row["path"].endswith(".xlsx") else "report")
                   for row in current["files"] if not row["path"].endswith(".png")])
        return current

    def inspection_image(self, command):
        """Return one actual internal image to the producing model without an artifact save."""
        edition = command.get("edition")
        current = self.state.get("inspections", {}).get(edition)
        if not current:
            raise ValueError("Select an actual retained original inspection.")
        selected = next((row for row in current["result"]["screenshots"]
                         if row["path"] == command.get("path")), None)
        if selected is None:
            raise ValueError("Select an image returned by this original browser.")
        path = pathlib.Path(selected["path"]).resolve(strict=True)
        if not path.is_relative_to(ROOT / "inspections"):
            raise ValueError("Original owned inspection image required.")
        content = regular(path, 20 * 1024 * 1024)
        if len(content) != selected["bytes"] or sha(content) != selected["sha256"]:
            raise ValueError("The actual original image changed.")
        emit("camino_inspection_image", edition=edition, path=str(path),
             bytes=len(content), sha256=selected["sha256"], mime_type="image/png",
             base64=base64.b64encode(content).decode("ascii"))

    def record_inspection(self, edition, note):
        actual = self.state["inspections"][edition]
        if actual["status"] == "LOOKED":
            if actual["review"] != note:
                raise ValueError("Preserve the original actual inspection note.")
            return
        if actual["status"] != "RENDERED" or not isinstance(note, dict):
            raise ValueError("Open the actual rendered files before continuing their inspection.")
        screenshots = [{key: item[key] for key in ("path", "bytes", "sha256")}
                       for item in actual["result"]["screenshots"]]
        if note.get("screenshots") != screenshots or not isinstance(note.get("note"), str) or not note["note"].strip():
            raise ValueError("Retain the exact viewed images and the actual operator's findings.")
        for item in screenshots:
            if identity(item["path"]) != item:
                raise ValueError("The image selected for actual inspection changed.")
        workbooks = [{key: row[key] for key in ("path", "bytes", "sha256")}
                     for row in actual["result"]["downloads"] if row["path"].endswith(".xlsx")]
        opened = note.get("workbooks")
        if not isinstance(opened, list) or len(opened) != len(workbooks):
            raise ValueError("Open each actual downloaded workbook in the spreadsheet viewer.")
        for expected, observation in zip(workbooks, opened):
            if (not isinstance(observation, dict) or observation.get("file") != expected
                    or not isinstance(observation.get("opened_with"), str)
                    or not observation["opened_with"].strip()
                    or not isinstance(observation.get("note"), str)
                    or not observation["note"].strip()):
                raise ValueError("Retain the original workbook identity and its actual viewer findings.")
            if identity(expected["path"]) != expected:
                raise ValueError("The actual inspected workbook changed.")
        actual.update(status="LOOKED", review=note, looked_at=now())
        self.persist()

    def finish_retained_result(self):
        summary = ROOT / "complete-result.json"
        value = read(summary)
        if value.get("schema") != "commons.camino-complete-receiving-result.v1" or value.get("operation") != OPERATION or value.get("state") != "COMPLETE":
            raise ValueError("The original completed course identity changed.")
        if value.get("original") != self.state["phases"]["original-run"]["result"]["product"] or value.get("revised") != self.state["phases"]["revision-2"]["result"]["product"]:
            raise ValueError("The completed summary differs from the original product phase outputs.")
        for name in ("original-run", "cold-receive", "revision-2", "revision-2-receive"):
            phase = self.state["phases"][name]
            if phase["status"] != "COMPLETE":
                raise ValueError("The original product phase is unfinished: " + name)
            for item in phase["outputs"]:
                if identity(item["path"]) != item:
                    raise ValueError("The completed phase output changed.")
        if any(self.state.get("inspections", {}).get(name, {}).get("status") != "LOOKED"
               for name in ("original", "revision-2")) or value.get("inspections") != self.state["inspections"]:
            raise ValueError("Preserve the actual completed rendered inspection.")
        source_sha = value.get("source_capsule_sha256")
        if source_sha != CAPSULE_SHA256:
            previous = ROOT / "source-history" / str(source_sha) / "source-capsule.json"
            if not previous.is_file() or sha(regular(previous, MAX_SOURCE)) != source_sha:
                raise ValueError("The completed result's original source is not retained.")
        current = identity(summary)
        prior = self.state.get("final_result")
        if prior is not None and prior != current:
            raise ValueError("The first complete receiving result changed.")
        self.state["final_result"] = current
        self.persist()
        self.bank([(summary, "report")])
        self.state["status"] = "COMPLETE"
        self.persist()
        return {"state": "COMPLETE", "result": current}

    def course(self, command):
        if (ROOT / "complete-result.json").is_file():
            return self.finish_retained_result()
        self.receive_inputs(command.get("downloads", []))
        self.runtime()
        root = self.prepared["source_root"]
        run = self.call("original-run", [
            "run", "--runtime-root", root, "--input-manifest", str(ROOT / "inputs/received.json"),
            "--work-root", str(ROOT / "course"), "--operation", OPERATION, "--node", self.node],
            lambda: self.product_outputs(ROOT / "course"))
        product = run["product"]
        self.save_product_outputs(product)
        archive = product["course"]["archive"]
        cold = ROOT / "cold"
        self.call("cold-receive", [
            "receive", "--archive", archive["path"], "--sha256", archive["sha256"],
            "--target", str(cold), "--runtime-root", root, "--operation", OPERATION + "-cold", "--node", self.node],
            lambda: {"files": [str(ROOT / "cold-receiving.json")],
                     "workspace": str(cold), "archive": archive})
        self.inspect("original", product, cold)
        if not command.get("review"):
            self.state["status"] = "AWAITING_REVIEW"
            self.persist()
            self.preserve("Original complete exports and cold receiving ready for actual visual inspection.")
            return {"state": self.state["status"], "inspection": self.state["inspections"]["original"]}
        self.record_inspection("original", command["review"])
        note = command["review"]["note"]
        revised = self.call("revision-2", [
            "revise", "--workspace", str(cold), "--runtime-root", root,
            "--note", note, "--operation", OPERATION + "-review-2", "--node", self.node],
            lambda: self.product_outputs(ROOT / "cold-revision-2"))
        revised_product = revised["product"]
        self.save_product_outputs(revised_product)
        revised_archive = revised_product["course"]["archive"]
        reopened = ROOT / "reopened-revision-2"
        self.call("revision-2-receive", [
            "receive", "--archive", revised_archive["path"], "--sha256", revised_archive["sha256"],
            "--target", str(reopened), "--runtime-root", root,
            "--operation", OPERATION + "-final-receive", "--node", self.node],
            lambda: {"files": [str(ROOT / "reopened-revision-2-receiving.json")],
                     "workspace": str(reopened), "archive": revised_archive})
        self.inspect("revision-2", revised_product, reopened)
        if not command.get("final_inspection"):
            self.state["status"] = "AWAITING_FINAL_INSPECTION"
            self.persist()
            self.preserve("Revised complete exports and independent reopening ready for actual visual inspection.")
            return {"state": self.state["status"], "inspection": self.state["inspections"]["revision-2"]}
        self.record_inspection("revision-2", command["final_inspection"])
        self.state["status"] = "PRODUCT_COMPLETE"
        self.persist()
        checkpoint = self.preserve("Original course, cold receiving, actual review, revision 2 and independent reopening complete.")
        summary = immutable(ROOT / "complete-result.json", encoded({
            "schema": "commons.camino-complete-receiving-result.v1", "operation": OPERATION,
            "state": "COMPLETE", "source_capsule_sha256": CAPSULE_SHA256,
            "original": product, "revised": revised_product, "checkpoint": checkpoint,
            "inspections": self.state["inspections"],
            "saved_files": [value for value in self.state["saves"].values() if value["status"] == "COMPLETE"]}))
        return self.finish_retained_result()


def main():
    os.umask(0o077)
    sys.dont_write_bytecode = True
    private_directory(ROOT)
    lock_path = ROOT / ".camino-original-course.lock"
    lock_fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError("The same original Camino course already has an admitted owner.")
    capsule = load_capsule()
    course = Course(capsule)
    last_error = None
    emit("camino_saved_receiver_ready", root=str(ROOT), pid=os.getpid(), state=course.state["status"])
    for raw in sys.stdin:
        try:
            command = json.loads(raw)
            if command.get("operation") != OPERATION or command.get("root") != str(ROOT):
                raise ValueError("Preserve the original operation and receiving root.")
            if command.get("action") == "inspect_image":
                course.inspection_image(command)
                emit("camino_saved_receiver_ready", root=str(ROOT), pid=os.getpid(), state=course.state["status"])
                continue
            if command.get("action") == "close":
                if course.state["status"] == "COMPLETE":
                    return 0
                saved = next((row for row in reversed(course.state.get("checkpoints", []))
                              if row.get("status") == "SAVED"
                              and row["id"] == command.get("preserved_checkpoint")), None)
                if saved is None or identity(saved["archive"]["path"]) != saved["archive"]:
                    raise ValueError("Close the interrupted course with its actual complete saved checkpoint.")
                return 1
            if command.get("action") != "run":
                raise ValueError("Use the original complete-course continuation.")
            returned = course.course(command)
            last_error = None
            emit("camino_course_returned", state=course.state["status"], root=str(ROOT), result=returned)
        except BaseException as error:
            last_error = type(error).__name__ + ": " + str(error)
            course.state["status"] = "INTERRUPTED"
            course.record("camino_course_error", error=last_error)
            traceback.print_exc(file=sys.stderr)
            try:
                checkpoint = course.preserve(last_error)
                emit("camino_interrupted_course_saved", checkpoint=checkpoint)
            except BaseException as preservation_error:
                course.record("camino_checkpoint_retained",
                              error=type(preservation_error).__name__ + ": " + str(preservation_error))
        emit("camino_saved_receiver_ready", root=str(ROOT), pid=os.getpid(), state=course.state["status"])
    return 1 if last_error or course.state["status"] != "COMPLETE" else 0

if __name__ == "__main__":
    raise SystemExit(main())
