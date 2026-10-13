"""MIT. Retained pipeline orders and editable receiving under the original owner.

The original jobs/customer.mjs owns every package verification and Python child.
This module owns UI intentions, complete uploads, and that CLI's process lifetime.
"""
from __future__ import annotations
import contextlib
import fcntl
import hashlib
import json
import mimetypes
import os
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from preparation import PreparationError, Busy, dumps, parse_json, now
from delivery import export_project

HERE = Path(__file__).resolve().parent
ID = re.compile(r"[a-f0-9]{32}")
HASH = re.compile(r"[a-f0-9]{64}")
MAX_JSON = 1048576
MAX_RECORD = 9 * MAX_JSON
MAX_PACKAGE = 64 * 1024 * 1024
PREPARED = ("project.zip", "selection.json", "input.json", "review.html", "prepared.json")


def need(value, message):
    if not value:
        raise PreparationError(message)


def private(path):
    path = Path(path)
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.lstat()
    need(stat.S_ISDIR(info.st_mode) and not path.is_symlink() and not info.st_mode & 0o077
         and info.st_uid == os.getuid(), "Use an operator-owned private commissioning directory")
    return path


def read(path, maximum=MAX_JSON):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "Choose a complete ordinary file within its allowance")
        raw = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
        need(len(raw) <= maximum and (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
             "The selected file changed during reading")
        return raw


def obj(path):
    return parse_json(read(path, MAX_RECORD).decode("utf-8"))


def identity(path, maximum=MAX_PACKAGE):
    path = Path(path)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "Choose a complete ordinary file within its allowance")
        digest, size = hashlib.sha256(), 0
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            need(size <= maximum, "The original file grew beyond its allowance")
            digest.update(chunk)
        after = os.fstat(stream.fileno())
        need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
             (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) and size == before.st_size,
             "The original file changed during reading")
        return {"bytes": size, "sha256": digest.hexdigest()}


def write(path, value, replace=False):
    path = Path(path)
    raw = (dumps(value) + "\n").encode("utf-8")
    need(len(raw) <= MAX_RECORD, "The complete retained record exceeds its allowance")
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".commissioning-")
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(obj(path) == value, "This original operation already records a different selection")
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        Path(temporary).unlink(missing_ok=True)


class CommissioningDesk:
    def __init__(self, owner):
        self.owner = owner
        self.root = private(owner.workspace.root / "pipeline-commissioning")
        self.orders = private(self.root / "orders")
        self.receivings = private(self.root / "receivings")
        self.requests = private(self.root / "requests")
        self.lock = threading.RLock()
        self.workers = {}
        self.closed = False

    def directory(self, kind, identifier, create=False):
        need(kind in {"orders", "receivings", "requests"} and isinstance(identifier, str) and ID.fullmatch(identifier),
             "Select an original saved order or receiving")
        path = getattr(self, kind) / identifier
        if create:
            return private(path)
        need(path.is_dir() and not path.is_symlink(), "The original saved operation was not found")
        return private(path)

    def alive(self):
        need(not self.closed and not getattr(self.owner, "closed", False)
             and not getattr(self.owner, "closing", False)
             and not getattr(getattr(self.owner, "owner", None), "closing", False),
             "Applications is stopping; reopen this saved operation")

    def get(self, kind, identifier):
        folder = self.directory(kind, identifier)
        intent = obj(folder / "intent.json")
        state = obj(folder / "state.json") if (folder / "state.json").exists() else {"status": "SAVED"}
        with self.lock:
            active = self.workers.get((kind, identifier))
            running = bool(active and active["thread"].is_alive())
        if state.get("status") in {"RUNNING", "CANCELLING"} and not running:
            state = {**state, "status": "INTERRUPTED", "message": "Continue this same saved operation"}
        output = {"id": identifier, "kind": kind, "intent": intent, **state, "active": running}
        if (folder / "result.json").exists():
            output["result"] = obj(folder / "result.json")
        if kind == "requests" and (folder / "selection.json").exists():
            output["selectedCatalogSha256"] = obj(folder / "selection.json")["catalogSha256"]
        if kind == "receivings":
            output["uploaded"] = (folder / "result.zip").is_file()
        return output

    def list(self, kind, offset=0, limit=50, order_id=None):
        need(kind in {"orders", "receivings", "requests"} and offset >= 0 and 1 <= limit <= 100,
             "Choose a collection and a page of 1–100 operations")
        root = getattr(self, kind)
        names = sorted((p.name for p in root.iterdir() if ID.fullmatch(p.name) and p.is_dir()
                        and not p.is_symlink() and (p / "intent.json").is_file()), reverse=True)
        if order_id is not None:
            self.directory("orders", order_id)
            names = [name for name in names if obj(root / name / "intent.json").get("orderId") == order_id]
        # Rows retain the complete selected identity; large file bodies use downloads.
        rows = []
        for name in names[offset:offset + limit]:
            value = self.get(kind, name)
            result = value.get("result", {})
            if kind == "requests":
                catalog = result.get("catalog")
                handoff = result.get("handoff")
                value["result"] = {
                    **({"catalog": {"catalogSha256": catalog["catalogSha256"],
                                    "functions": [{k: v for k, v in f.items() if k in {"id", "label", "payment"}}
                                                  for f in catalog["functions"] if f["id"] == "executePipeline"]}}
                       if catalog else {}),
                    **({"handoff": {k: handoff[k] for k in ("requestId", "reference", "requestUrl", "requestRevision", "catalogSha256")}}
                       if handoff else {})}
            elif kind == "orders" and result.get("prepared"):
                value["result"] = {"prepared": {k: result["prepared"][k] for k in ("pipeline", "functionId")}}
            elif kind == "receivings" and result.get("received"):
                value["result"] = {"received": {k: result["received"][k] for k in ("pipeline", "job", "status", "executionId")}}
            rows.append(value)
        return {"items": rows, "offset": offset, "limit": limit, "total": len(names),
                "nextOffset": offset + limit if offset + limit < len(names) else None}

    def customers(self, selected=None):
        filename = os.environ.get("SF30_PREPARATION_JOB_CUSTOMERS")
        if not filename:
            need(selected is None, "Select an existing private Jobs customer in the host configuration")
            return []
        path = Path(filename)
        need(path.is_absolute(), "The host customer configuration must use an absolute path")
        info = path.lstat()
        need(stat.S_ISREG(info.st_mode) and not path.is_symlink() and
             not info.st_mode & 0o077 and info.st_uid == os.getuid(),
             "Use an operator-owned private Jobs customer configuration")
        aliases = obj(path)
        need(isinstance(aliases, dict), "Use a named map of original Jobs customers")
        public = []
        for alias, value in aliases.items():
            need(re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", alias) and isinstance(value, dict)
                 and set(value) == {"label", "customer"} and isinstance(value["label"], str)
                 and 1 <= len(value["label"]) <= 120 and isinstance(value["customer"], dict),
                 "Each host customer requires an alias, label and original customer selection")
            public.append({"alias": alias, "label": value["label"]})
        if selected is None:
            return public
        need(selected in aliases, "Select an existing host-declared Jobs customer")
        return aliases[selected]["customer"]

    def catalog_intent(self, body):
        need(isinstance(body, dict) and set(body) ==
             {"id", "orderId", "customerAlias", "merchantOrigin", "reference", "label"},
             "Select a prepared order, existing customer, merchant and stable request reference")
        order = self.get("orders", body["orderId"])
        need(order.get("result", {}).get("prepared") and not order["active"],
             "Finish the original complete preparation before selecting its merchant")
        for name in ("customerAlias", "merchantOrigin", "reference", "label"):
            need(isinstance(body[name], str) and 1 <= len(body[name]) <= 2048 and
                 not any(ord(c) < 32 for c in body[name]), "Use complete single-line merchant request fields")
        with self.lock:
            self.alive()
            folder = self.directory("requests", body["id"], True)
            customer = self.customers(body["customerAlias"])
            # The saved private target stays fixed if the host later edits its alias.
            write(folder / "customer.json", customer)
            write(folder / "intent.json", body)
        return self.start("requests", body["id"], "catalog")

    def seed_request(self, body):
        need(isinstance(body, dict) and set(body) == {"id", "catalogSha256"}
             and isinstance(body["catalogSha256"], str) and HASH.fullmatch(body["catalogSha256"]),
             "Review the exact original merchant catalog before creating its request")
        folder = self.directory("requests", body["id"])
        value = self.get("requests", body["id"])
        need(not value["active"] and value.get("result", {}).get("catalog"),
             "Wait for the original full merchant catalog")
        need(value["result"]["catalog"]["catalogSha256"] == body["catalogSha256"] or
             value.get("selectedCatalogSha256") == body["catalogSha256"],
             "Review this original saved catalog selection")
        with self.lock:
            self.alive()
            write(folder / "selection.json", {"catalogSha256": body["catalogSha256"]})
        return self.start("requests", body["id"], "seed")

    def prepare(self, body):
        need(isinstance(body, dict) and set(body) <=
             {"id", "pipelineId", "revision", "reportName", "inputs", "reuseExecution"}
             and {"id", "pipelineId", "revision", "reportName"} <= set(body),
             "Choose one saved pipeline edition and report")
        need(isinstance(body["revision"], int) and not isinstance(body["revision"], bool) and body["revision"] > 0,
             "Choose a positive saved edition number")
        need(isinstance(body["reportName"], str) and 1 <= len(body["reportName"].strip()) <= 120
             and not any(ord(c) < 32 for c in body["reportName"]), "Choose a report name")
        if "inputs" in body:
            need(isinstance(body["inputs"], dict) and all(isinstance(k, str) and isinstance(v, str)
                 for k, v in body["inputs"].items()), "Choose the complete original input edition mapping")
        if "reuseExecution" in body:
            need(isinstance(body["reuseExecution"], str) and body["reuseExecution"], "Choose one retained execution")
        with self.lock:
            self.alive()
            folder = self.directory("orders", body["id"], True)
            write(folder / "intent.json", body)
        return self.start("orders", body["id"], "prepare")

    def receive_intent(self, body):
        need(isinstance(body, dict) and set(body) <= {"id", "orderId", "expected", "job", "package"}
             and {"id", "expected", "package"} <= set(body), "Select the complete original Jobs package and expected descriptor")
        need(isinstance(body["expected"], dict) and isinstance(body.get("job", {}), dict),
             "Retain the original expected package and job objects")
        package = body["package"]
        need(isinstance(package, dict) and set(package) == {"bytes", "sha256"} and
             isinstance(package["bytes"], int) and not isinstance(package["bytes"], bool) and
             0 < package["bytes"] <= MAX_PACKAGE and isinstance(package["sha256"], str) and
             HASH.fullmatch(package["sha256"]), "Choose the exact complete result ZIP, up to 64 MiB")
        if body.get("orderId"):
            self.get("orders", body["orderId"])
        with self.lock:
            self.alive()
            folder = self.directory("receivings", body["id"], True)
            write(folder / "intent.json", body)
            write(folder / "expected.json", body["expected"])
            write(folder / "job.json", body.get("job", {}))
        return self.get("receivings", body["id"])

    def upload(self, identifier, handler):
        folder = self.directory("receivings", identifier)
        intent = obj(folder / "intent.json")
        length = handler.content_length(MAX_PACKAGE)
        need(length == intent["package"]["bytes"], "Upload the complete selected result ZIP")
        with self.lock:
            self.alive()
            active = self.workers.get(("receivings", identifier))
            need(not active or not active["thread"].is_alive(),
                 "Wait for the original receiving operation to finish")
            fd, temporary = tempfile.mkstemp(dir=folder, prefix=".result-upload-")
        try:
            digest, remaining = hashlib.sha256(), length
            with os.fdopen(fd, "wb") as output:
                while remaining:
                    chunk = handler.rfile.read(min(1024 * 1024, remaining))
                    need(bool(chunk), "The result upload ended before all declared bytes arrived")
                    output.write(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
                output.flush()
                os.fsync(output.fileno())
            need(digest.hexdigest() == intent["package"]["sha256"], "The uploaded result differs from the selected complete file")
            with self.lock:
                self.alive()
                try:
                    os.link(temporary, folder / "result.zip")
                except FileExistsError:
                    need(identity(folder / "result.zip") == intent["package"],
                         "This receiving already retains a different result")
        finally:
            Path(temporary).unlink(missing_ok=True)
        return self.get("receivings", identifier)

    def start(self, kind, identifier, action):
        need((kind == "orders" and action == "prepare") or
             (kind == "receivings" and action in {"receive", "reopen"}) or
             (kind == "requests" and action in {"catalog", "seed"}),
             "Choose an original preparation or receiving action")
        folder = self.directory(kind, identifier)
        with self.lock:
            self.alive()
            current = self.workers.get((kind, identifier))
            if current and current["thread"].is_alive():
                return self.get(kind, identifier)
            cancel = threading.Event()
            record = {"cancel": cancel, "process": None}
            def work():
                lease = None
                try:
                    lease = open(folder / ".operation.lock", "a+b")
                    try:
                        fcntl.flock(lease.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError as exc:
                        raise Busy("The same saved operation is active in another owner") from exc
                    write(folder / "state.json", {"status": "RUNNING", "action": action, "updatedAt": now()}, True)
                    intent = obj(folder / "intent.json")
                    if kind == "requests" and action == "catalog":
                        need(not (folder / "selection.json").exists(),
                             "Continue the original saved Request selection or create a separate merchant request")
                    script = HERE.parent / "jobs" / "cli.mjs"
                    if kind == "orders":
                        source = folder / "source.zip"
                        source_record = folder / "source.json"
                        if not source_record.exists():
                            if source.exists():
                                # An interrupted original export is retained and checked by prepare.
                                selected_source = identity(source, 28 * 1024 * 1024)
                            else:
                                exported = export_project(self.owner.workspace, source)
                                selected_source = {k: exported[k] for k in ("bytes", "sha256")}
                            write(source_record, selected_source)
                        need(identity(source, 28 * 1024 * 1024) == obj(source_record), "The saved original project changed")
                        args = ["prepare", "--project", str(source), "--sha256", obj(source_record)["sha256"],
                                "--directory", str(folder / "prepared"), "--pipeline", intent["pipelineId"],
                                "--revision", str(intent["revision"]), "--report", intent["reportName"]]
                        if "inputs" in intent:
                            write(folder / "inputs.json", intent["inputs"])
                            args += ["--inputs", str(folder / "inputs.json")]
                        if intent.get("reuseExecution"):
                            args += ["--reuse-execution", intent["reuseExecution"]]
                    elif kind == "requests":
                        script = HERE.parent / "jobs" / "request-handoff-cli.mjs"
                        args = [action if action == "seed" else "catalog", "--customer", str(folder / "customer.json"),
                                "--merchant-origin", intent["merchantOrigin"]]
                        if action == "seed":
                            order_folder = self.directory("orders", intent["orderId"])
                            prepared = self.download("orders", intent["orderId"], "prepared.json")[0]
                            args += ["--order-directory", str(order_folder / "prepared"),
                                     "--expected-order-sha256", identity(prepared)["sha256"],
                                     "--expected-catalog-sha256", obj(folder / "selection.json")["catalogSha256"],
                                     "--reference", intent["reference"], "--label", intent["label"]]
                    else:
                        args = [action, "--package-directory", str(folder / "package"), "--directory", str(folder / "editable"),
                                "--expected", str(folder / "expected.json"), "--job", str(folder / "job.json")]
                        if action == "receive":
                            need(identity(folder / "result.zip") == intent["package"], "Upload the complete selected result before receiving")
                            args += ["--source", str(folder / "result.zip")]
                    result = self.native(args, folder, record, script)
                    if kind == "orders":
                        files = {name: identity(folder / "prepared" / name, 28 * 1024 * 1024) for name in PREPARED}
                        value = {"prepared": result, "files": files}
                    elif kind == "requests":
                        prior = obj(folder / "result.json") if (folder / "result.json").exists() else {}
                        value = {**prior, "catalog" if action == "catalog" else "handoff": result}
                    else:
                        original_package = result["package"]
                        result = result["workspace"]
                        need(isinstance(original_package, dict) and isinstance(result, dict),
                             "The original customer helper must return its complete package and editable workspace")
                        if intent.get("orderId"):
                            order_folder = self.directory("orders", intent["orderId"])
                            selected = self.download("orders", intent["orderId"], "selection.json")[0]
                            original = obj(selected)
                            execution_file = next(f for f in result["files"] if f["slot"] == "execution")
                            need(identity(execution_file["path"], 2 * MAX_JSON) ==
                                 {k: execution_file[k] for k in ("bytes", "sha256")},
                                 "The received complete execution file changed")
                            actual = parse_json(read(execution_file["path"], 2 * MAX_JSON).decode("utf-8"))
                            need(actual["selection"] == original,
                                 "This result differs from the selected project, input editions, SQL, parameters or reuse choice")
                        value = {"received": result, "package": original_package}
                    write(folder / "result.json", value, True)
                    write(folder / "state.json", {"status": "COMPLETE", "action": action, "updatedAt": now()}, True)
                except BaseException as exc:
                    # A competing lifetime owns its state; never replace its RUNNING journal.
                    if not isinstance(exc, Busy):
                        write(folder / "state.json", {"status": "CANCELLED" if cancel.is_set() else "FAILED",
                              "action": action, "message": str(exc), "updatedAt": now()}, True)
                finally:
                    if lease is not None:
                        lease.close()
            record["thread"] = threading.Thread(target=work, name="pipeline-order-" + identifier, daemon=False)
            self.workers[(kind, identifier)] = record
            record["thread"].start()
        return self.get(kind, identifier)

    def native(self, args, folder, record, script):
        node = os.environ.get("SF30_PREPARATION_NODE") or shutil.which("node")
        need(node and Path(node).is_absolute(), "Select the installed Node executable with SF30_PREPARATION_NODE")
        need(script in {HERE.parent / "jobs" / "cli.mjs", HERE.parent / "jobs" / "request-handoff-cli.mjs"},
             "Use the original fixed customer helper")
        need(script.is_file(), "Install the complete Data preparation Jobs selection")
        maximum = 8 * MAX_JSON if script.name == "request-handoff-cli.mjs" else MAX_JSON
        if record["cancel"].is_set():
            raise PreparationError("The saved operation was stopped")
        # Fixed native CLI, fixed absolute paths, and the current owned interpreter.
        # The original Node helper drains its Python process group on SIGTERM.
        with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
            with self.lock:
                self.alive()
                native_args = [*args, "--python", sys.executable] if script.name == "cli.mjs" else args
                child = subprocess.Popen([node, str(script), *native_args],
                                         stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                         cwd=folder, close_fds=True)
                record["process"] = child
                if record["cancel"].is_set():
                    child.send_signal(signal.SIGTERM)
            stopped = False
            while child.poll() is None:
                if (record["cancel"].is_set() or os.fstat(stdout.fileno()).st_size > maximum
                        or os.fstat(stderr.fileno()).st_size > 65536) and not stopped:
                    child.send_signal(signal.SIGTERM)
                    stopped = True
                time.sleep(0.05)
            child.wait()
            with self.lock:
                record["process"] = None
            stdout.seek(0)
            stderr.seek(0)
            raw, error = stdout.read(maximum + 1), stderr.read(65537)
            need(len(raw) <= maximum and len(error) <= 65536, "The original helper output exceeded its allowance")
            need(child.returncode == 0, error.decode("utf-8", errors="replace").strip() or "The original helper stopped")
            value = parse_json(raw.decode("utf-8"))
            need(isinstance(value, dict), "The original helper did not return its complete result")
            return value

    def cancel(self, kind, identifier):
        with self.lock:
            entry = self.workers.get((kind, identifier))
            if entry and entry["thread"].is_alive():
                entry["cancel"].set()
                child = entry.get("process")
                if child and child.poll() is None:
                    child.send_signal(signal.SIGTERM)
        return self.get(kind, identifier)

    def open_received(self, identifier):
        value = self.get("receivings", identifier)
        need(not value["active"] and value.get("status") == "COMPLETE" and
             value.get("action") == "reopen", "Choose Verify and reopen before opening the editable project")
        result = value["result"]["received"]
        folder = self.directory("receivings", identifier)
        need(Path(result["directory"]) == folder / "editable", "The original editable project directory changed")
        return self.owner.open_received_record({"id": "commissioned-" + identifier, "path": result["directory"],
                 "label": "Commissioned pipeline · " + result["pipeline"]["id"],
                 "job": result["job"], "executionId": result["executionId"]})

    def download(self, kind, identifier, filename):
        value = self.get(kind, identifier)
        need(not value["active"] and value.get("result"), "Wait for the complete original operation")
        folder = self.directory(kind, identifier)
        if kind == "orders":
            need(filename in PREPARED, "Choose one complete prepared file")
            selected = value["result"]["files"][filename]
            path = folder / "prepared" / filename
        else:
            need(kind == "receivings", "Choose a prepared or received original file")
            receipt = value["result"]["received"]
            selected = next((f for f in receipt["files"] if f["filename"] == filename), None)
            need(selected is not None, "Choose an original verified named result")
            path = Path(selected["path"])
            need(path.is_absolute() and path.resolve().is_relative_to((folder / "package").resolve()),
                 "Choose an original retained package file")
        need(identity(path, MAX_PACKAGE) == {k: selected[k] for k in ("bytes", "sha256")},
             "The complete saved file changed")
        media = {"json": "application/json", "html": "text/html; charset=utf-8", "zip": "application/zip"}.get(
                 path.suffix[1:], "application/octet-stream")
        return path, media, filename

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            workers = list(self.workers.values())
            for entry in workers:
                entry["cancel"].set()
                child = entry.get("process")
                if child and child.poll() is None:
                    child.send_signal(signal.SIGTERM)
        for entry in workers:
            entry["thread"].join()


def desk(server):
    # Every native/managed owner initializes commissioning_lock before serving.
    with server.commissioning_lock:
        if server.commissioning is None:
            server.commissioning = CommissioningDesk(server)
        return server.commissioning


def route(handler, parsed, method):
    if not parsed.path.startswith("/api/commissioning/"):
        return False
    from urllib.parse import parse_qs
    current = desk(handler.server)
    suffix = parsed.path.removeprefix("/api/commissioning/")
    query = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
    if method == "GET":
        if suffix in {"orders", "receivings", "requests"}:
            handler.answer(current.list(suffix, int(query.get("offset", 0)), int(query.get("limit", 50)), query.get("orderId")))
        elif suffix == "customers":
            handler.answer({"items": current.customers()})
        elif suffix == "record":
            handler.answer(current.get(query["kind"], query["id"]))
        elif suffix == "file":
            handler.file(*current.download(query["kind"], query["id"], query["file"]))
        else:
            raise PreparationError("Unknown commissioning read")
        return True
    if suffix == "upload":
        handler.answer(current.upload(query["id"], handler))
        return True
    length = handler.content_length(MAX_JSON)
    raw = handler.rfile.read(length)
    need(len(raw) == length, "The command ended before all declared bytes arrived")
    body = parse_json(raw.decode("utf-8"))
    need(isinstance(body, dict), "Choose one original commissioning command")
    if suffix == "prepare":
        result = current.prepare(body)
    elif suffix == "catalog":
        result = current.catalog_intent(body)
    elif suffix == "seed":
        result = current.seed_request(body)
    elif suffix == "refresh-catalog":
        need(set(body) == {"id"}, "Select one saved merchant catalog")
        result = current.start("requests", body["id"], "catalog")
    elif suffix == "receive-intent":
        result = current.receive_intent(body)
    elif suffix in {"receive", "reopen"}:
        need(set(body) == {"id"}, "Select one saved receiving")
        result = current.start("receivings", body["id"], suffix)
    elif suffix == "continue":
        need(set(body) == {"id"}, "Select one saved order")
        result = current.start("orders", body["id"], "prepare")
    elif suffix == "cancel":
        need(set(body) == {"id", "kind"}, "Select one active saved operation")
        result = current.cancel(body["kind"], body["id"])
    elif suffix == "open":
        need(set(body) == {"id"}, "Select one verified receiving")
        result = current.open_received(body["id"])
    else:
        raise PreparationError("Unknown commissioning command")
    handler.answer(result)
    return True
