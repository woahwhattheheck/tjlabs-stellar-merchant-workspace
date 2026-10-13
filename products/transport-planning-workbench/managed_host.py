#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the unchanged, privately installed transport planning under its original writer lease."""
from __future__ import annotations
import argparse
import ast
import io
import zipfile
from urllib.parse import urlsplit,parse_qs
from http.server import ThreadingHTTPServer
import fcntl
import hashlib
import importlib.util
import importlib
import re
import json
import os
import secrets
import signal
import stat
import sys
import threading
import subprocess
from http.cookies import SimpleCookie
from pathlib import Path

CONNECTION_SCHEMA = "stellar-forge.transport-planning-workbench-connection.v1"
SOURCE_SCHEMA = "stellar-forge.transport-planning-workbench-source.v1"

def need(value, message):
    if not value:
        raise RuntimeError(message)

def raw(path, maximum, private=True):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, "Select a canonical complete file.")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "Select a complete regular file within its capacity.")
        need(not private or before.st_uid == os.getuid() and before.st_mode & 0o077 == 0, "Keep the original file private and owned.")
        with os.fdopen(os.dup(fd), "rb") as incoming:
            body = incoming.read(maximum + 1)
        after = os.fstat(fd)
        need(len(body) == before.st_size and all(getattr(before, k) == getattr(after, k) for k in
             ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")), "The original file changed while being read.")
        return body
    finally:
        os.close(fd)

def document(path, maximum=4194304):
    return json.loads(raw(path, maximum).decode("utf-8"))

def sha(body):
    return hashlib.sha256(body).hexdigest()

def directory(path):
    path = Path(path)
    info = path.lstat()
    need(path.is_absolute() and path.resolve() == path and stat.S_ISDIR(info.st_mode) and
         info.st_uid == os.getuid() and info.st_mode & 0o077 == 0, "Select the owned private original directory.")
    return {"path": str(path), "dev": str(info.st_dev), "ino": str(info.st_ino)}

def lock(path):
    path = Path(path)
    directory(path.parent)
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        need(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_mode & 0o077 == 0,
             "Retain the same owned private writer lock.")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        need(path.stat().st_ino == info.st_ino and path.stat().st_dev == info.st_dev, "The original writer lock changed.")
        return fd
    except BaseException:
        os.close(fd)
        raise

def save(path, body):
    path = Path(path)
    directory(path.parent)
    temporary = path.with_name("." + path.name + "." + secrets.token_hex(8))
    try:
        with temporary.open("xb") as output:
            os.chmod(temporary, 0o600)
            output.write(body)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        temporary.unlink(missing_ok=True)

def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


MODULES = {}
def source(configuration):
    root = Path(configuration["applicationDirectory"])
    directory(root)
    body = raw(configuration["sourceManifestFile"], 33554432)
    need(sha(body) == configuration["sourceManifestSha256"], "The reviewed private source authority changed.")
    manifest = json.loads(body.decode("utf-8"))
    need(set(manifest) == {"schema", "files"} and manifest["schema"] == SOURCE_SCHEMA and
         isinstance(manifest["files"], list) and len(manifest["files"]) == 24,
         "Select a complete original source authority.")
    names, folded, size = set(), set(), 0
    for member in manifest["files"]:
        need(isinstance(member, dict) and set(member) == {"path", "bytes", "sha256"},
             "Retain complete original source metadata.")
        name = member["path"]
        need(isinstance(name, str) and 0 < len(name) <= 4096 and "\\" not in name and
             all(ord(c) >= 32 and ord(c) != 127 for c in name) and
             all(p not in ("", ".", "..", "__pycache__") for p in name.split("/")) and name.casefold() not in folded,
             "Select each exact original source member once.")
        names.add(name); folded.add(name.casefold())
        need(type(member["bytes"]) is int and 0 <= member["bytes"] <= 33554432 and
             isinstance(member["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", member["sha256"]),
             "Select the original complete source identity.")
        size += member["bytes"]
        need(size <= 33554432, "The original source exceeds complete source capacity.")
        data = raw(root / name, 33554432, private=False)
        need(len(data) == member["bytes"] and sha(data) == member["sha256"], "Original source changed: " + name)
    required = set(["LICENSE.txt","OPERATING.md","PROGRAMME_AND_METRICS.md","SOURCE-MANIFEST.json","boston-programme-evaluator.mjs","delivery.py","evaluator-receiving.json","exports.py","intake.py","manage.py","metric-definitions.json","operations.py","programme-cli.mjs","public-observations.json","public-sites.json","run_example.py","server.py","service-rules.json","source-catalogue.json","source-contract.json","web/app.js","web/index.html","web/style.css","workspace.py"])
    need(required == names, "Select the complete original transportation source edition.")
    tree = ast.parse(raw(root / "delivery.py", 33554432, False), filename="delivery.py")
    declared = [ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and
                any(isinstance(target, ast.Name) and target.id == "SOURCE_FILES" for target in node.targets)]
    need(len(declared) == 1 and isinstance(declared[0], list) and len(declared[0]) == len(names) and
         set(declared[0]) == names, "Retain every member declared by the original application delivery.")
    actual = set()
    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            need(not (Path(current) / name).is_symlink(), "Original source contains a linked member.")
        dirs[:] = [name for name in dirs if name != "__pycache__"]
        for name in files:
            path = Path(current) / name
            need(path.is_file(), "Original source contains a non-file.")
            actual.add(path.relative_to(root).as_posix())
    need(actual == names, "Retain the whole exact original source.")
    sys.path.insert(0, str(root))
    for name in ("workspace", "intake", "operations", "exports", "delivery", "server", "manage"):
        need(name not in sys.modules, "The original module is already loaded: " + name)
        value = importlib.import_module(name)
        need(Path(value.__file__).resolve() == root / (name + ".py"), "The selected original module changed.")
        MODULES[name] = value
    return manifest

def module(name):
    need(name in MODULES, "Select an installed original module.")
    return MODULES[name]

def inside(root, path):
    return path == root or root in path.parents

def complete_identity(path, maximum):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, "Use a canonical complete file.")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum and
             before.st_uid == os.getuid() and before.st_mode & 0o077 == 0, "Keep complete intake private and owned.")
        digest, count = hashlib.sha256(), 0
        while True:
            part = os.read(fd, 1048576)
            if not part:
                break
            count += len(part); digest.update(part)
        after = os.fstat(fd)
        need(count == before.st_size and all(getattr(before, k) == getattr(after, k) for k in
             ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")), "Complete intake changed.")
        return {"path": str(path), "bytes": count, "sha256": digest.hexdigest()}
    finally:
        os.close(fd)


def receive_lock(destination_path):
    destination = Path(destination_path)
    need(destination.is_absolute() and destination.resolve() == destination,
         "Use the canonical original receiving destination.")
    directory(destination.parent)
    return lock(destination.parent / (".transport-planning-receive-" + sha(str(destination).encode()) + ".lock"))

def receive_workspace(configuration, kind, archive_path, destination_path):
    need(kind in ("application", "recovery"), "Select the original application or recovery reader.")
    destination, archive = Path(destination_path), Path(archive_path)
    need(destination.is_absolute() and destination.resolve() == destination and
         archive.is_absolute() and archive.resolve() == archive, "Select complete canonical receiving paths.")
    for selected in (Path(configuration["applicationDirectory"]), Path(configuration["directory"])):
        need(not inside(selected, destination) and not inside(destination, selected),
             "Receive separately from current source and workspace.")
    for path in (configuration["connectionFile"], configuration["sourceManifestFile"]):
        need(not inside(destination, Path(path)), "Keep source authority and private connection outside receiving.")
    need(not inside(destination, archive), "Keep the complete source archive outside its receiving destination.")
    directory(destination.parent)
    selected = complete_identity(archive, 9007199254740991)
    lease = receive_lock(destination)
    try:
        need(not destination.exists() or destination.is_dir() and not any(destination.iterdir()),
             "The original reader requires a new empty receiving destination.")
        if kind == "application":
            result = module("delivery").receive_file(archive, destination)
        else:
            workspace = module("workspace").Workspace.restore_file(archive, destination)
            with workspace.db() as connection:
                identity = connection.execute("SELECT value FROM meta WHERE key='workspace_id'").fetchone()[0]
            result = {"directory": str(destination), "workspace": str(workspace.directory), "workspace_id": identity}
        after = complete_identity(archive, 9007199254740991)
        need(after == selected, "The original archive changed during receiving; inspect the selected destination.")
        return {**result, "kind": kind, "archive": selected}
    finally:
        os.close(lease)

def selected_runtime(configuration):
    need(sys.version_info >= (3, 12), "The original application requires Python 3.12 or later.")
    need(Path(sys.executable).absolute() == Path(configuration["python"]).absolute(),
         "Keep the selected Python invocation path.")
    node = Path(configuration["node"])
    need(node.is_absolute() and node.is_file() and os.access(node, os.X_OK),
         "Select the prepared Node executable.")
    os.environ.pop("NODE_OPTIONS", None)
    os.environ["TRANSPORT_NODE"] = str(node)
    observation = subprocess.run([str(node), "--version"], capture_output=True, timeout=30, check=True)
    version = observation.stdout.decode("utf-8").strip()
    need(re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:[-+].*)?", version) and
         int(version[1:].split(".", 1)[0]) >= 18, "The original evaluator requires Node.js 18 or later.")
    return {"python": sys.version, "node": version}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    args = parser.parse_args()
    request_path = Path(args.request)
    request = document(request_path)
    need(request.get("schema") == "stellar-forge.transport-planning-managed-request.v1",
         "Select the complete managed request.")
    c = request["configuration"]
    need(sha(raw(request["configurationFile"], 131072)) == request["configurationSha256"],
         "The reviewed launch changed.")
    bridge = request["bridge"]
    bridge_body = raw(bridge["path"], 1048576, False)
    need(Path(bridge["path"]) == Path(__file__).resolve() and
         len(bridge_body) == bridge["bytes"] and sha(bridge_body) == bridge["sha256"],
         "The selected managed host changed.")
    bootstrap = request["bootstrap"]
    bootstrap_body = raw(bootstrap["path"], 1048576, False)
    need(Path(bootstrap["path"]) == Path(__file__).resolve().with_name("browser-bootstrap.mjs") and
         len(bootstrap_body) == bootstrap["bytes"] and sha(bootstrap_body) == bootstrap["sha256"],
         "The selected original browser bootstrap changed.")
    root = Path(c["directory"])
    root_identity = directory(root)
    directory(request_path.parent)
    source(c)
    core, native = module("workspace"), module("server")
    stop_requested = threading.Event()
    owner = {"server": None, "serving": False}
    connection_lease = writer = published = None
    token = secrets.token_urlsafe(32)
    browser_session = secrets.token_urlsafe(32)
    cookie_name = "transport_" + secrets.token_hex(12)

    def stop(*_):
        stop_requested.set()
        if owner["server"] is not None and owner["serving"]:
            threading.Thread(target=owner["server"].shutdown, name="transport-planning-shutdown", daemon=True).start()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, stop)
    try:
        connection_lease = lock(c["connectionFile"] + ".lock")
        writer = lock(root / "transport-planning-operator.lock")
        runtime = selected_runtime(c)
        need(not stop_requested.is_set(), "The launch stopped before opening.")
        if not (root / "workspace.sqlite").exists() and c.get("workspaceName") is not None:
            core.DEFAULT = {**core.DEFAULT, "label": c["workspaceName"]}
        workspace = core.Workspace(root)
        with workspace.db() as selected:
            workspace_id = selected.execute("SELECT value FROM meta WHERE key='workspace_id'").fetchone()[0]
            workspace_name = workspace.config(selected)["value"]["label"]
        identity = {"workspaceId": workspace_id, "workspaceName": workspace_name}
        original_index = raw(Path(c["applicationDirectory"]) / "web" / "index.html", 33554432, False)
        script = b'<script src="/app.js"></script>'
        need(original_index.count(script) == 1, "The original index must retain its single complete application script.")
        managed_index = original_index.replace(script, b'<script type="module" src="/_merchant/browser-bootstrap.mjs"></script>')

        class ManagedHandler(native.Handler):
            def setup(self):
                self.request.settimeout(30)
                super().setup()

            def end_headers(self):
                # One request per connection makes Stop drain accepted work without retaining idle keep-alive sockets.
                self.send_header("Connection", "close")
                self.close_connection = True
                super().end_headers()

            def bearer(self):
                value = self.headers.get("Authorization", "")
                return secrets.compare_digest(value, "Bearer " + token)

            def authorized(self):
                self.valid_host()
                if self.bearer():
                    return True
                try:
                    cookies = SimpleCookie()
                    cookies.load(self.headers.get("Cookie", ""))
                    value = cookies.get(cookie_name)
                    return value is not None and secrets.compare_digest(value.value, browser_session)
                except Exception:
                    return False

            def checked_workspace(self):
                selected = directory(root)
                need(selected["dev"] == root_identity["dev"] and selected["ino"] == root_identity["ino"],
                     "The selected original workspace directory changed.")
                with workspace.db() as connection:
                    current = connection.execute("SELECT value FROM meta WHERE key='workspace_id'").fetchone()
                    need(current is not None and current[0] == identity["workspaceId"],
                         "The selected original workspace changed.")

            def read_json(self):
                value = super().read_json()
                if urlsplit(self.path).path == "/api/command" and self.bearer():
                    need(value.get("actor") == c["actor"], "Use the selected original agent operator.")
                return value

            def do_GET(self):
                self._response_started = False
                try:
                    self.valid_host()
                    path = urlsplit(self.path).path
                    if path in ("/", "/index.html"):
                        return self.send(managed_index, mime="text/html; charset=utf-8")
                    if path == "/_merchant/browser-bootstrap.mjs":
                        return self.send(bootstrap_body, mime="text/javascript; charset=utf-8")
                    if path.startswith("/api/") or path.startswith("/_merchant/"):
                        if not self.authorized():
                            return self.send({"error": "Open the current private application connection."}, 401)
                        self.checked_workspace()
                    if path == "/_merchant/info":
                        return self.send({**self.server.managed_info, "runtime": runtime,
                            "limits": {"sourceBytes": 64 * 1024**2, "csvBytes": 32 * 1024**2,
                                       "jsonBytes": 96 * 1024**2, "recordRowPage": 1000},
                            "receiving": {"application": "delivery.receive_file", "recovery": "Workspace.restore_file",
                                          "requiresFreshDestination": True}})
                    return super().do_GET()
                except Exception as error:
                    self.fail(error, 400, "Managed read failed")

            def do_POST(self):
                self._response_started = False
                try:
                    self.valid_host()
                    path = urlsplit(self.path).path
                    if path == "/_merchant/session":
                        need(self.bearer(), "Open the actual current private console URL.")
                        value = super().read_json()
                        need(value == {}, "Use the complete browser session request.")
                        self.checked_workspace()
                        body = core.canonical({"ready": True, "launchId": request["launchId"]})
                        self._response_started = True
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.send_header("Content-Length", str(len(body)))
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("X-Content-Type-Options", "nosniff")
                        self.send_header("Referrer-Policy", "no-referrer")
                        self.send_header("Set-Cookie", cookie_name + "=" + browser_session + "; Path=/; HttpOnly; SameSite=Strict")
                        self.end_headers()
                        self.wfile.write(body)
                        return
                    if not self.authorized():
                        return self.send({"error": "Open the current private application connection."}, 401)
                    self.checked_workspace()
                    if path == "/_merchant/receive":
                        need(self.bearer(), "Use the selected agent connection for declared receiving paths.")
                        value = self.read_json()
                        need(set(value) == {"kind", "archivePath", "destination"}, "Select the complete original receiving input.")
                        return self.send(receive_workspace(c, value["kind"], value["archivePath"], value["destination"]))
                    return super().do_POST()
                except Exception as error:
                    self.fail(error, 400, "Managed write failed")

        class ManagedServer(ThreadingHTTPServer):
            daemon_threads = False
            block_on_close = True
            def __init__(self, address):
                self.workspace = workspace
                super().__init__(address, ManagedHandler)

        server = ManagedServer(("127.0.0.1", request["port"]))
        owner["server"] = server
        origin = "http://127.0.0.1:" + str(server.server_port)
        token_file = request_path.parent / "original-console-token"
        save(token_file, (token + "\n").encode())
        connection = {"schema": CONNECTION_SCHEMA, "launchId": request["launchId"], "instanceId": request["launchId"],
            **identity, "directory": str(root), "applicationDirectory": c["applicationDirectory"],
            "directoryIdentity": {"dev": root_identity["dev"], "ino": root_identity["ino"]},
            "sourceManifestFile": c["sourceManifestFile"], "sourceManifestSha256": c["sourceManifestSha256"],
            "python": c["python"], "node": c["node"], "capabilityFile": str(token_file), "origin": origin,
            "pid": os.getpid(), "startedAt": request["startedAt"], "actor": c["actor"],
            "configurationFile": request["configurationFile"], "configurationSha256": request["configurationSha256"]}
        server.managed_info = {k: v for k, v in connection.items() if k not in ("capabilityFile", "configurationFile")}
        need(not stop_requested.is_set(), "The launch stopped before publication.")
        save(c["connectionFile"], encode(connection))
        published = connection
        save(request_path.parent / "original-startup.json", encode({"status": "listening", "url": origin,
            "workspace": str(root), "workspace_id": identity["workspaceId"], "runtime": runtime}))
        owner["serving"] = True
        try:
            if not stop_requested.is_set():
                server.serve_forever(poll_interval=0.2)
        finally:
            owner["serving"] = False
    finally:
        if owner["server"] is not None:
            owner["server"].server_close()
        if published is not None:
            try:
                actual = document(c["connectionFile"], 131072)
                if actual.get("launchId") == request["launchId"]:
                    Path(c["connectionFile"]).unlink()
            except FileNotFoundError:
                pass
        if writer is not None:
            os.close(writer)
        if connection_lease is not None:
            os.close(connection_lease)

if __name__ == "__main__":
    main()
