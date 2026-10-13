#!/usr/bin/env python3
"""Run the selected original publication service under its existing managed child."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import fcntl
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import sys
import uuid
from urllib.parse import urlsplit
from files import PublicationError, absolute, directory, encoded, file_identity, locked, need, once, read_json
from source import application, read_edition
import manage

PROCESS_SCHEMA = "stellar-forge.publication-process.v1"


class OriginalAnnouncement(io.TextIOBase):
    """Receive the original server's own URL without replacing its HTTP server."""
    def __init__(self, stream, identity, ready_file, role, selected_port):
        self.stream = stream
        self.identity = identity
        self.ready_file = ready_file
        self.role = role
        self.selected_port = selected_port
        self.pending = ""
        self.received = False

    @property
    def encoding(self):
        return "utf-8"

    def writable(self):
        return True

    def write(self, value):
        written = len(value)
        self.pending += value
        while "\n" in self.pending:
            line, self.pending = self.pending.split("\n", 1)
            try:
                announced = json.loads(line)
            except (ValueError, TypeError):
                announced = None
            if not self.received and isinstance(announced, dict) and "url" in announced:
                field = "workspace" if self.role == "operator" else "release"
                expected = self.identity["workspace"] if field == "workspace" else self.identity["release"]
                need(announced.get(field) == expected, "original_service_changed",
                     "The original server announced another workspace or resident release.")
                parsed = urlsplit(announced["url"])
                need(parsed.scheme == "http" and parsed.hostname == "127.0.0.1" and
                     parsed.port and 0 < parsed.port <= 65535 and parsed.path in ("", "/") and
                     not parsed.query and not parsed.fragment and not parsed.username and not parsed.password and
                     (not self.selected_port or parsed.port == self.selected_port),
                     "original_service_url", "The selected original service announced an invalid loopback URL.")
                value = {**self.identity, "url": announced["url"], "origin": "http://127.0.0.1:" + str(parsed.port)}
                once(self.ready_file, encoded(value))
                self.stream.write(encoded({key: item for key, item in value.items() if key != "url"}).decode())
                self.stream.flush()
                self.received = True
            else:
                self.stream.write(line + "\n")
        return written

    def flush(self):
        self.stream.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--role", choices=("operator", "resident", "wordpress"), required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--ready-file", required=True)
    parser.add_argument("--installation-id", required=True)
    parser.add_argument("--source-identity", required=True)
    parser.add_argument("--release-id")
    options = parser.parse_args()
    value = manage.installation(options.directory)
    manage.check_binding(value, {"installation_id": options.installation_id, "source_identity": options.source_identity})
    need(Path(sys.executable).resolve() == Path(value["python"]["path"]),
         "original_interpreter_changed", "Launch this source with its selected original Python.")
    root = Path(value["directory"])
    ready = absolute(options.ready_file)
    directory(ready.parent, private=True)
    need(not ready.exists(), "ready_file_exists", "Use a fresh private ready file for the actual service process.")
    # The original role lease is inherited by the actual Node process when that
    # original engine uses exec. Applications' separate held descriptor 3 stays
    # inherited too; no second process supervisor is introduced here.
    with locked(root / "services" / (options.role + ".lock")) as role_fd:
        if isinstance(role_fd, int):
            os.set_inheritable(role_fd, True)
        else:
            os.set_inheritable(role_fd.fileno(), True)
        selected = manage.installation(root)
        manage.check_binding(selected, {"installation_id": options.installation_id, "source_identity": options.source_identity})
        edition, manifest = read_edition(root, selected["source_identity"])
        source_root = Path(edition["source"])
        app = source_root / Path(manifest["interface"]["entry"]).parent
        entry = source_root / manifest["interface"]["entry"]
        native_runner = source_root / manifest["interface"]["native_runner"]
        identity = {"schema": PROCESS_SCHEMA, "role": options.role, "pid": os.getpid(),
                    "instance_id": str(uuid.uuid4()), "started_at": datetime.now(timezone.utc).isoformat(),
                    "installation_id": selected["installation_id"], "source_identity": selected["source_identity"],
                    "directory": str(root), "workspace": selected["workspace"], "application": str(app),
                    "entry_sha256": file_identity(entry)["sha256"],
                    "launcher_sha256": file_identity(Path(__file__).resolve())["sha256"],
                    "device": str(root.stat().st_dev), "inode": str(root.stat().st_ino),
                    "ready_file": str(ready)}
        if options.role == "wordpress":
            command = manage.describe_commands(root, {"roles": ["wordpress"], "ready_file": str(ready),
                                                      "port": options.port})["commands"][0]
            native = selected["native"]
            need(bool(os.environ.get("TJL_LOCAL_WP_PASSWORD")), "native_login_reference",
                 "Set the selected original WordPress password through TJL_LOCAL_WP_PASSWORD before managed start.")
            identity.update({"native_runtime": native["directory"],
                             "native_runner_sha256": file_identity(native_runner)["sha256"]})
            metadata = ready.parent / (ready.name + ".source.json")
            once(metadata, encoded(identity))
            os.environ["TJL_PUBLICATION_PROCESS_INPUT"] = str(metadata)
            os.environ["TJL_PUBLICATION_PARENT_PID"] = str(os.getpid())
            args = [native["node"], "--experimental-wasm-jspi", str(native_runner),
                    "--runtime", native["directory"], "--playground-module", native["playground_module"]["path"],
                    "--wordpress-zip", native["core_zip"], "--port", str(options.port or 8807),
                    "--exercise", str(Path(edition["bridge"]) / "wordpress-service.mjs")]
            os.chdir(app)
            os.execv(native["node"], args)
        if options.role == "resident":
            need(options.release_id is not None, "resident_release", "Select the original complete frozen release.")
            # The maintained descriptor validates the exact source-owned release ID.
            manage.describe_commands(root, {"roles": ["resident"], "ready_file": str(ready),
                                            "port": options.port, "release_id": options.release_id})
            identity["release"] = str(Path(selected["workspace"]) / "oha-releases" / options.release_id)
        old_stdout = sys.stdout
        original_signal = signal.getsignal(signal.SIGTERM)
        def stop(signum, frame):
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, stop)
        try:
            with application(root, selected) as ctx:
                spec = importlib.util.spec_from_file_location("_publication_original_entry_" + uuid.uuid4().hex, entry)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                need(Path(module.__file__).resolve() == entry, "original_service_changed",
                     "The selected original service module resolved outside this edition.")
                sys.stdout = OriginalAnnouncement(old_stdout, identity, ready, options.role, options.port)
                if options.role == "operator":
                    module.serve(ctx["Store"](selected["workspace"]), options.port)
                else:
                    module.serve_release(Path(identity["release"]), options.port)
        finally:
            sys.stdout = old_stdout
            signal.signal(signal.SIGTERM, original_signal)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (PublicationError, ValueError, KeyError, TypeError, OSError) as error:
        print(json.dumps({"schema": "stellar-forge.publication-process-error.v1",
                          "code": getattr(error, "code", "original_service_failed"), "message": str(error)[:2000]}),
              file=sys.stderr, flush=True)
        raise SystemExit(2)
