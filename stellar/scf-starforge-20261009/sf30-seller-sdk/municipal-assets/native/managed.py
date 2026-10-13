"""SCF managed launch over the unchanged municipal asset workspace."""
from __future__ import annotations
import argparse
from contextlib import closing
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import runpy
import signal
import sqlite3
import stat
import sys
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = "mcpherson-asset-workspace-v1"
BINDING_KEY = "scf_managed_identity"
IDENTITY_SCHEMA = "stellar-forge.municipal-asset-identity.v1"
INSPECTION = "stellar-forge.municipal-asset-inspection.v1"
STARTUP = "stellar-forge.municipal-asset-startup.v1"
HASH = re.compile(r"[a-f0-9]{64}")
def need(value, message):
    if not value:
        raise ValueError(message)
def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()
def sha(body):
    return hashlib.sha256(body).hexdigest()
def regular(path, maximum=4*1024*1024, private=False):
    path = Path(path)
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= maximum,
         "Select the complete regular file: " + str(path))
    if private and os.name != "nt":
        need(not info.st_mode & 0o077, "Keep the operator credential private: " + str(path))
    with path.open("rb") as stream:
        observed = os.fstat(stream.fileno())
        need((observed.st_dev, observed.st_ino) == (info.st_dev, info.st_ino),
             "The selected file changed before opening: " + str(path))
        body = stream.read(maximum + 1)
        after = os.fstat(stream.fileno())
    need(len(body) == info.st_size and
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) ==
         (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns),
         "The selected file changed during reading: " + str(path))
    return body
def source():
    body = regular(ROOT / "SOURCE_ADOPTION.json")
    value = json.loads(body)
    need(value.get("schema") == "stellar-forge.municipal-asset-source.v1" and
         isinstance(value.get("files"), list), "Use the complete municipal source selection")
    names = set()
    for row in value["files"]:
        name = row.get("path")
        need(isinstance(name, str) and not name.startswith(("/", "\\")) and "\\" not in name and
             all(part not in ("", ".", "..") for part in name.split("/")) and name not in names,
             "Invalid complete source path")
        names.add(name)
        path = ROOT
        for part in name.split("/"):
            path = path / part
            need(not path.is_symlink(), "Preserve regular original source: " + name)
        selected = regular(path)
        need(len(selected) == row.get("bytes") and sha(selected) == row.get("sha256"),
             "Municipal source differs: " + name)
    need({"native/managed.py", "native/workspace/engine.py", "native/workspace/server.py",
          "native/workspace/maximo_target.py", "native/acceptance/verify.py"} <= names,
         "Select the whole maintained municipal application")
    return sha(body)
def location(directory):
    path = Path(directory).absolute()
    need(path == path.resolve() and path.is_dir() and not path.is_symlink(),
         "Select the original initialized private workspace directory")
    database = path / "workspace.sqlite3"
    info = database.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
         "Preserve the original municipal database")
    return path, database, {"path": str(database), "dev": str(info.st_dev), "ino": str(info.st_ino)}
def identity(value):
    need(isinstance(value, dict) and set(value) == {"schema", "id", "created_ms"} and
         value["schema"] == IDENTITY_SCHEMA and isinstance(value["id"], str) and
         re.fullmatch(r"[a-f0-9]{32}", value["id"]) and
         type(value["created_ms"]) is int and 0 <= value["created_ms"] <= 8640000000000000,
         "The retained managed workspace identity differs")
    return value
def inspect(directory):
    path, database, physical = location(directory)
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=30)) as db:
        db.row_factory = sqlite3.Row
        need(db.execute("SELECT value FROM settings WHERE key='schema'").fetchone()["value"] == SCHEMA,
             "Select the original municipal workspace schema")
        row = db.execute("SELECT value FROM settings WHERE key=?", (BINDING_KEY,)).fetchone()
        need(row is not None, "Adopt this initialized workspace once with municipal-assets adopt before Applications Review")
        value = identity(json.loads(row["value"]))
        projects = [dict(row) for row in db.execute(
            "SELECT id,title,mode,revision,created_at FROM projects ORDER BY created_at,id")]
    password = path / "operator-password.txt"
    secret = regular(password, 4096, private=True).decode("utf-8").strip()
    need(len(secret) >= 16, "Use the original generated operator password")
    binding = {"schema": IDENTITY_SCHEMA, "directory": str(path), "workspace": value, "database": physical}
    return {"schema": INSPECTION, "binding": binding, "bindingSha256": sha(encoded(binding)),
            "passwordFile": str(password), "projects": projects}
def adopt(directory):
    path, database, physical = location(directory)
    # The existing workspace validates its schema and keeps all native data/history.
    from workspace.engine import Workspace
    workspace = Workspace(path)
    with workspace.connection(write=True) as db:
        previous = db.execute("SELECT value FROM settings WHERE key=?", (BINDING_KEY,)).fetchone()
        if previous is None:
            value = {"schema": IDENTITY_SCHEMA, "id": uuid.uuid4().hex,
                     "created_ms": time.time_ns() // 1000000}
            db.execute("INSERT INTO settings(key,value) VALUES(?,?)",
                       (BINDING_KEY, encoded(value).decode()))
        else:
            identity(json.loads(previous["value"]))
    return inspect(path)
def serve(args, source_sha):
    need(HASH.fullmatch(args.binding_sha256) and HASH.fullmatch(args.source_sha256),
         "Review the complete original launch binding")
    need(source_sha == args.source_sha256, "The reviewed municipal source changed")
    observed = inspect(args.workspace)
    need(observed["bindingSha256"] == args.binding_sha256,
         "The selected database differs from the reviewed workspace")
    from workspace.engine import Workspace
    from workspace.server import Server, Handler
    workspace = Workspace(args.workspace)
    need(inspect(args.workspace)["bindingSha256"] == args.binding_sha256,
         "The native workspace changed before launch")
    password = regular(observed["passwordFile"], 4096, private=True).decode("utf-8").strip()
    class ManagedHandler(Handler):
        def route(self, write):
            if not write and self.path == "/api/managed-instance":
                if not self.boundary():
                    return
                current = inspect(workspace.root)
                need(current["bindingSha256"] == args.binding_sha256,
                     "The original database changed under this listener")
                return self.reply(200, self.server.managed_instance)
            return super().route(write)
    server = Server(("127.0.0.1", args.port), workspace, password)
    server.RequestHandlerClass = ManagedHandler
    startup = {"schema": STARTUP, "status": "MUNICIPAL_ASSET_READY", "url": server.origin + "/",
               "binding": observed["binding"], "bindingSha256": args.binding_sha256,
               "sourceSha256": source_sha, "sourceRoot": str(ROOT),
               "passwordFile": observed["passwordFile"], "requestedPort": args.port,
               "port": server.server_port, "instanceId": str(uuid.uuid4()),
               "pid": os.getpid(), "startedMs": time.time_ns() // 1000000}
    server.managed_instance = startup
    stopped = threading.Event()
    def stop(signum, frame):
        if not stopped.is_set():
            stopped.set()
            threading.Thread(target=server.shutdown, daemon=True).start()
    for signum in (signal.SIGTERM, signal.SIGINT):
        signal.signal(signum, stop)
    print(json.dumps(startup, ensure_ascii=False, separators=(",", ":")), flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
def main():
    need(sys.version_info >= (3, 11), "Use Python 3.11 or later with its standard SQLite module")
    source_sha = source()
    sys.path.insert(0, str(ROOT / "native"))
    argv = sys.argv[1:]
    need(argv, "Select init, adopt, inspect, managed, backup, restore, capture, refresh, maximo or package")
    command, rest = argv[0], argv[1:]
    if command in ("adopt", "inspect"):
        need(len(rest) == 1, "Select exactly one original workspace directory")
        result = adopt(rest[0]) if command == "adopt" else inspect(rest[0])
        print(json.dumps({**result, "sourceSha256": source_sha}, ensure_ascii=False, indent=2))
        return
    if command == "managed":
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument("--workspace", type=Path, required=True)
        parser.add_argument("--binding-sha256", required=True)
        parser.add_argument("--source-sha256", required=True)
        parser.add_argument("--port", type=int, default=0)
        args = parser.parse_args(rest)
        need(0 <= args.port <= 65535, "Choose a valid private listener port")
        from workspace.capture_intake import locked
        with locked(Path(args.workspace) / ".managed-server.lock"):
            serve(args, source_sha)
        return
    if command in ("handover", "receive"):
        parser = argparse.ArgumentParser(description="Complete municipal source and editable workspace receiving")
        if command == "handover":
            parser.add_argument("directory", type=Path)
            parser.add_argument("--output", type=Path, required=True)
            parser.add_argument("--operation", required=True)
        else:
            parser.add_argument("package", type=Path)
            parser.add_argument("destination", type=Path)
        args = parser.parse_args(rest)
        from portable import handover, receive
        result = (handover(args.directory, args.output, args.operation, source_sha, inspect(args.directory))
                  if command == "handover" else receive(args.package, args.destination, source_sha, inspect))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    originals = {"init", "serve", "backup", "restore", "demo", "capture", "refresh",
                 "refresh-resume", "refresh-status"}
    if command in originals:
        sys.argv = ["workspace", command, *rest]
        runpy.run_module("workspace", run_name="__main__")
    elif command in ("maximo", "package"):
        module = "workspace.maximo_cli" if command == "maximo" else "workspace.package"
        sys.argv = [module, *rest]
        runpy.run_module(module, run_name="__main__")
    else:
        raise ValueError("Unknown municipal command: " + command)
if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, sqlite3.Error, KeyError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
