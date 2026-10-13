#!/usr/bin/env python3
"""Install and receive the original retained DuckDB result through native VGI."""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, localcontext
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile

OPERATION = "QUERY-FARM-VGI-RECEIVING-20261012-F3BE"
CASE_BYTES = 227992
CASE_SHA = "2da55e7d4399ab96a530451c99b75b64472f0041b690e862650bc60a1f4a42ac"
WORKSPACE_ID = "adfe47684e06bbd2c4bd70ecfd2d2d24"
EXPORT_ID = "3257b0e83294b7e142186f14d6b5d9d04b3d44fb2fb46643678bb6b68bb2f4dd"
QUERY_ID = "f1fe27a9f0b29b1322c3cd93fbcae7760ec1a185c9cff884de038963602dd90c"
EDITION_ID = "df8d93a749f46f5a5509eb1deee58b2271c354fff436b912ccf38f2ac06d3760"
TABLE = "capacity_result"
PRINCIPAL = "receiving-operator"


def need(condition, message):
    if not condition:
        raise RuntimeError(message)


def now():
    return datetime.now(timezone.utc).isoformat()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode()


def checksum(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path):
    return json.loads(Path(path).read_bytes())


def private(path):
    path = Path(path).absolute()
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    need(not path.is_symlink() and path.is_dir(), "Select an original private directory")
    path.chmod(0o700)
    return path


def save(path, value, *, raw=False, immutable=False):
    path = Path(path)
    private(path.parent)
    body = value if raw else encoded(value)
    if immutable and path.exists():
        need(not path.is_symlink() and path.read_bytes() == body,
             "The original retained selection changed: " + str(path))
        return path
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("wb", dir=path.parent, prefix=path.name + ".",
                                         suffix=".pending", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                need(path.read_bytes() == body, "The retained selection changed")
        else:
            os.replace(temporary, path)
        fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return path


def command_json(command, directory, label):
    private(directory)
    stdout = Path(directory) / (label + ".stdout.json")
    stderr = Path(directory) / (label + ".stderr.txt")
    with stdout.open("wb") as output, stderr.open("wb") as errors:
        result = subprocess.run([str(x) for x in command], stdout=output, stderr=errors)
    stdout.chmod(0o600)
    stderr.chmod(0o600)
    need(result.returncode == 0, label + " failed; original output is retained at " + str(stderr))
    lines = stdout.read_text().splitlines()
    need(lines, label + " returned no original result")
    return json.loads(lines[-1])


def source_selection(args, root):
    need(re.fullmatch(r"[a-f0-9]{40}", args.source_ref), "Select the exact source commit")
    need(re.fullmatch(r"[a-f0-9]{64}", args.source_sha256), "Select the complete source archive SHA-256")
    need(checksum(args.source_archive) == args.source_sha256, "The complete source archive changed")
    manifest = read(args.source_manifest)
    need(manifest.get("source_ref") == args.source_ref, "The original source manifest changed")
    seen = set()
    for item in manifest["files"]:
        name = item["path"]
        relative = PurePosixPath(name)
        need(not relative.is_absolute() and str(relative) == name
             and all(part not in ("", ".", "..") for part in relative.parts)
             and name not in seen, "Invalid original source member")
        seen.add(name)
        path = args.source_root.joinpath(*relative.parts)
        need(path.is_file() and not path.is_symlink(), "Original source member unavailable: " + name)
        raw = path.read_bytes()
        actual = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        need(actual == item["git_blob"] and len(raw) == item["bytes"],
             "Original source member changed: " + name)
    need(args.input.stat().st_size == CASE_BYTES and checksum(args.input) == CASE_SHA,
         "Select the unchanged complete C271 source receiving")
    selected = {
        "schema": "stellar-forge.vgi-receiving-selection.v1",
        "operation": OPERATION, "source_ref": args.source_ref,
        "source_archive_sha256": args.source_sha256,
        "source_manifest_sha256": checksum(args.source_manifest),
        "source_root": str(args.source_root), "source": str(args.source),
        "engine": str(args.engine), "input_sha256": CASE_SHA,
        "input": str(args.input), "directory": str(root),
        "python313": str(args.python313), "node": str(args.node),
        "playwright": str(args.playwright), "chromium": str(args.chromium),
        "browser_driver": str(args.browser_driver),
        "browser_driver_sha256": checksum(args.browser_driver),
        "receiving_driver_sha256": checksum(Path(__file__)),
    }
    save(root / "selection.json", selected, immutable=True)
    return selected


def prepare_runtime(args, root):
    cohort = private(root / "python-runtime")
    output = private(root / "receiving" / "runtime")
    common = [sys.executable, "-B", args.engine, "--root", cohort]
    candidate = command_json(common + [
        "resolve", "--python", args.python313, "--source", args.source,
        "--extras", "duckdb,vgi", "--release-id", args.source_ref,
        "--release-digest", args.source_sha256], output, "resolve")
    installation = command_json(common + [
        "install", "--candidate", candidate["id"], "--python", args.python313],
        output, "install")
    save(root / "installation.json", installation, immutable=True)
    return installation


def original_input(args, root):
    destination = private(root / "original-input")
    expected = {}
    with zipfile.ZipFile(args.input) as archive:
        members = archive.infolist()
        need(len(members) == 28 and not any(x.is_dir() for x in members),
             "The complete original 28-member source carrier is required")
        for item in members:
            path = PurePosixPath(item.filename)
            need(not path.is_absolute() and str(path) == item.filename
                 and all(x not in ("", ".", "..") for x in path.parts)
                 and item.filename not in expected
                 and not stat.S_ISLNK(item.external_attr >> 16),
                 "The original source archive has an invalid member")
            body = archive.read(item)
            need(len(body) == item.file_size, "An original source member is incomplete")
            expected[item.filename] = {"bytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest()}
            save(destination.joinpath(*path.parts), body, raw=True, immutable=True)
    save(root / "receiving" / "original-input.json", {
        "archive_bytes": CASE_BYTES, "archive_sha256": CASE_SHA, "members": expected},
        immutable=True)
    workspace = private(root / "warehouse")
    original = destination / "portable" / "warehouse.duckdb"
    marker = root / "receiving" / "warehouse-origin.json"
    if not marker.exists():
        target = workspace / "warehouse.duckdb"
        if target.exists():
            need(checksum(target) == checksum(original),
                 "The original receiving warehouse has unrecorded changes")
        else:
            temporary = workspace / "warehouse.duckdb.partial"
            with original.open("rb") as source, temporary.open("wb") as output:
                shutil.copyfileobj(source, output, 1024 * 1024)
                output.flush()
                os.fsync(output.fileno())
            temporary.chmod(0o600)
            need(checksum(temporary) == checksum(original), "Original warehouse copy changed")
            os.replace(temporary, target)
        save(marker, {"workspace_id": WORKSPACE_ID,
             "input_warehouse_sha256": checksum(original)}, immutable=True)
    return destination, workspace


class Receiving:
    def __init__(self, args, root):
        self.args, self.root = args, root
        self.record_path = root / "receiving" / "phases.json"
        self.record = read(self.record_path) if self.record_path.exists() else {
            "operation": OPERATION, "started_at": now(), "phases": {}}
        need(self.record["operation"] == OPERATION, "Select the original receiving operation")

    def phase(self, name, work):
        if name in self.record["phases"]:
            return self.record["phases"][name]["result"]
        result = work()
        self.record["phases"][name] = {"completed_at": now(), "result": result}
        save(self.record_path, self.record)
        print(json.dumps({"operation": OPERATION, "phase": name, "state": "COMPLETE"}),
              flush=True)
        return result

    def request(self, api, name, route, body):
        path = self.root / "private" / "requests" / (name + ".json")
        if path.exists():
            body = read(path)
        else:
            if "request_id" in body:
                body["request_id"] = hashlib.sha256(
                    (OPERATION + ":" + name).encode()).hexdigest()[:32]
            save(path, body, immutable=True)
        result = api(route, body)
        receipt = self.root / "receiving" / "requests" / (name + ".json")
        value = {"route": route, "request": body, "result": result}
        if receipt.exists():
            prior = read(receipt)
            need(prior["request"] == body and prior["route"] == route,
                 "The original request receipt changed")
            if prior["result"] != result:
                save(self.root / "receiving" / "requests" / (name + ".observation.json"), value)
        else:
            save(receipt, value, immutable=True)
        return result

    def browser(self, api, url, stage, publication_id=None):
        receiving_directory = self.root / "browser" / stage
        if stage == "client":
            observed = api("/api/vgi/state")["runtime"]
            need(observed.get("observed") == "RUNNING", "Use the current original listener")
            request_id = observed.get("request_id", "")
            need(re.fullmatch(r"[a-f0-9]{32}", request_id), "The current listener request changed")
            receiving_directory = self.root / "browser" / ("client-" + request_id + "-" + publication_id[:12])
        configuration = {
            "operation": OPERATION, "stage": stage, "url": url,
            "workspace_id": WORKSPACE_ID, "table_name": TABLE,
            "export_id": EXPORT_ID, "principal": PRINCIPAL,
            "publication_id": publication_id,
            "directory": str(receiving_directory),
            "profile": str(self.root / "private" / "browser-profile"),
            "playwright": str(self.args.playwright), "chromium": str(self.args.chromium)}
        config_path = self.root / "private" / ("browser-" + stage + ".json")
        save(config_path, configuration)
        result = command_json(
            [self.args.node, self.args.browser_driver, config_path],
            self.root / "private" / "browser-logs", stage)
        need(result.get("passed") is True and result.get("page_error_count") == 0,
             "The original browser operation did not complete")
        return result


@contextmanager
def buyer(workspace, root, export_locations):
    from stellar_forge_buyer.duckdb_http import serve
    workspace_id = workspace.identity()["workspace_id"]
    origin_path = private(root / "private") / "operator-origin.json"
    original_origin = read(origin_path) if origin_path.exists() else None
    port = 0
    if original_origin is not None:
        port = original_origin.get("port")
        need(type(port) is int and 1 <= port <= 65535,
             "The retained private operator port is invalid")
        need(original_origin == {
            "schema": "stellar-forge.vgi-receiving-operator-origin.v1",
            "operation": OPERATION, "workspace_id": workspace_id,
            "directory": str(root.resolve()), "port": port,
            "origin": "http://127.0.0.1:" + str(port),
        }, "The retained browser origin belongs to another receiving workspace")
    server = None
    thread = None
    started = False
    try:
        server, control, private_url = serve(
            workspace, port=port, export_root=root / "query-exports",
            handoff_root=root / "handoffs", vgi=True,
            vgi_export_locations=export_locations)
        parsed = urllib.parse.urlsplit(private_url)
        need(parsed.scheme == "http" and parsed.hostname == "127.0.0.1"
             and parsed.port == server.server_port and parsed.fragment
             and (port == 0 or parsed.port == port),
             "The private operator must retain its original loopback origin")
        base = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
        capability = parsed.fragment
        save(origin_path, {
            "schema": "stellar-forge.vgi-receiving-operator-origin.v1",
            "operation": OPERATION, "workspace_id": workspace_id,
            "directory": str(root.resolve()), "port": parsed.port, "origin": base,
        }, immutable=True)

        def api(path, body=None):
            headers = {"X-DuckDB-Capability": capability,
                       "X-DuckDB-Workspace-ID": workspace_id}
            data = None
            if body is not None:
                data = encoded(body)
                headers["Content-Type"] = "application/json"
            request = urllib.request.Request(base + path, data=data, headers=headers,
                                             method="POST" if body is not None else "GET")
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    return json.loads(response.read())
            except urllib.error.HTTPError as error:
                value = json.loads(error.read())
                raise RuntimeError("Original operator " + str(error.code) + ": "
                                   + str(value.get("error"))) from None

        thread = threading.Thread(target=server.serve_forever,
                                  name="vgi-receiving-private-operator", daemon=False)
        thread.start()
        started = True
        yield api, base + "/vgi/#" + capability
    finally:
        if server is not None:
            try:
                if started:
                    server.shutdown()
            finally:
                try:
                    server.server_close()
                finally:
                    if started:
                        thread.join(timeout=15)
                        need(not thread.is_alive(), "The original private operator is still active")


def source_table(path):
    import pyarrow.parquet as pq
    return pq.read_table(path)


def batch_record(root, name, batch, expected):
    import pyarrow as pa
    actual = pa.Table.from_batches([batch])
    need(actual.equals(expected, check_metadata=True),
         "The native VGI batch differs from the exact original Arrow rows: " + name)
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, batch.schema) as writer:
        writer.write_batch(batch)
    raw = sink.getvalue().to_pybytes()
    save(root / "receiving" / "batches" / (name + ".arrow"), raw,
         raw=True, immutable=True)
    return {"rows": batch.num_rows, "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest()}


def first_batch(root, name, address, token, publication_id, expected):
    from vgi.client import Client
    cursor_path = root / "private" / "cursors" / (name + ".json")
    with Client.from_http(address, bearer_token=token) as client:
        cursor = client.table_scan_resumable(
            function_name="sf_result_" + publication_id, schema_path=["results"])
        try:
            batch, continuation = cursor.next()
            need(batch is not None and isinstance(continuation, bytes) and continuation,
                 "The original SDK did not return its retained continuation token")
            saved = batch_record(root, name, batch, expected)
            save(cursor_path, {"publication_id": publication_id,
                 "token_base64": base64.b64encode(continuation).decode(),
                 "received_batch": saved})
            return {"publication_id": publication_id, "batch": saved,
                    "continuation_sha256": hashlib.sha256(continuation).hexdigest()}
        finally:
            cursor.close()


def continue_batch(root, name, cursor_name, address, token, expected):
    from vgi.client import Client
    retained = read(root / "private" / "cursors" / (cursor_name + ".json"))
    original = base64.b64decode(retained["token_base64"], validate=True)
    with Client.from_http(address, bearer_token=token) as client:
        cursor = client.table_scan_continue(resume_token=original)
        try:
            batch, continuation = cursor.next()
            need(batch is not None, "The original continuation ended before its retained rows")
            saved = batch_record(root, name, batch, expected)
            end, end_token = cursor.next()
            need(end is None, "The original continuation produced additional rows")
            return {"publication_id": retained["publication_id"], "batch": saved,
                    "original_continuation_sha256": hashlib.sha256(original).hexdigest(),
                    "complete": True}
        finally:
            cursor.close()


def denied_scan(service, publication_id, address, token, expected_code):
    from stellar_forge_buyer.errors import StateError
    from vgi.client import Client
    try:
        service.read_batch(publication_id, 0, principal=PRINCIPAL)
    except StateError as error:
        need(error.code == expected_code, "A different native access decision was returned")
    else:
        raise RuntimeError("Current service policy admitted a retired or revoked read")
    error_name = None
    try:
        with Client.from_http(address, bearer_token=token) as client:
            cursor = client.table_scan_resumable(
                function_name="sf_result_" + publication_id, schema_path=["results"])
            try:
                cursor.next()
            finally:
                cursor.close()
    except Exception as error:
        error_name = type(error).__name__
    need(error_name is not None, "The native SDK admitted a denied original scan")
    return {"native_code": expected_code, "sdk_error_type": error_name,
            "returned_rows": 0}


def canonical_value(value, logical_type=None):
    if isinstance(value, Decimal):
        return format(value, "f")
    if logical_type == "JSON" and isinstance(value, str):
        return canonical_value(json.loads(value, parse_float=Decimal))
    if isinstance(value, dict):
        return {k: canonical_value(v) for k, v in sorted(value.items())}
    if isinstance(value, (tuple, list)):
        return [canonical_value(x) for x in value]
    if isinstance(value, bytes):
        return {"binary_base64": base64.b64encode(value).decode()}
    return value


def sql_client(root, address, token, expected, columns, catalog_name):
    import duckdb
    extension_root = private(root / "client-runtime")
    connection = duckdb.connect(":memory:", config={
        "threads": "1", "memory_limit": "128MB",
        "extension_directory": str(extension_root)})
    literal = lambda value: "'" + value.replace("'", "''") + "'"
    try:
        connection.execute("INSTALL vgi FROM community")
        connection.execute("LOAD vgi")
        rows = connection.execute(
            "SELECT * FROM duckdb_extensions() WHERE extension_name='vgi'").fetchall()
        names = [x[0] for x in connection.description]
        extension = dict(zip(names, rows[0]))
        need(extension.get("loaded") is True, "The native VGI extension was not loaded")
        path = extension.get("install_path")
        if path and Path(path).is_file():
            extension["file_sha256"] = checksum(path)
            extension["file_bytes"] = Path(path).stat().st_size
        connection.execute(
            "ATTACH " + literal(catalog_name) + " AS purchased (TYPE vgi, LOCATION " + literal(address)
            + ", bearer_token " + literal(token) + ")")
        result = connection.execute('SELECT * FROM purchased.results."' + TABLE
                                    + '" ORDER BY sf_row')
        description = [{"name": x[0], "type": str(x[1])} for x in result.description]
        actual = result.fetchall()
        expected_rows = expected.sort_by([("sf_row", "ascending")]).to_pylist()
        need([x["name"] for x in description] == expected.column_names,
             "The native SQL catalog changed the original columns")
        normalize = lambda row: [
            canonical_value(row[name], columns[i]["type"])
            for i, name in enumerate(expected.column_names)]
        actual_values = [normalize(dict(zip(expected.column_names, row))) for row in actual]
        wanted = [normalize(row) for row in expected_rows]
        need(actual_values == wanted, "The native SQL client changed the original result values")
        totals = connection.execute(
            'SELECT count(*), min(sf_row), max(sf_row), sum(volume) '
            'FROM purchased.results."' + TABLE + '"').fetchone()
        with localcontext() as context:
            context.prec = 192
            wanted_volume = sum((Decimal(str(row["volume"])) for row in expected_rows
                                 if row["volume"] is not None), Decimal(0))
        need(totals[0] == len(expected_rows)
             and Decimal(str(totals[3])) == wanted_volume,
             "The native SQL aggregate changed the original row population")
        return {"engine": duckdb.__version__, "extension": extension,
                "rows": len(actual), "columns": description,
                "values_sha256": hashlib.sha256(encoded(actual_values)).hexdigest(),
                "count": totals[0], "min_sf_row": totals[1], "max_sf_row": totals[2],
                "volume_sum": str(totals[3]),
                "query": 'SELECT * FROM purchased.results."' + TABLE + '" ORDER BY sf_row'}
    finally:
        connection.close()



def receive_client_package(root, receipt, label, expected_publication):
    """Receive the complete actual browser download before running its local client."""
    destination = private(root / "client-handover" / label)
    package = private(destination / "package")
    path = Path(receipt["path"])
    need(path.is_file() and not path.is_symlink()
         and path.stat().st_size == receipt["bytes"]
         and checksum(path) == receipt["sha256"],
         "The actual selected client ZIP changed")
    wanted = {"connection.json", "publication.json", "query.sql",
              "result_sql_client.py", "README.md", "manifest.json"}
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        need(len(members) == len(wanted)
             and {item.filename for item in members} == wanted
             and all(not item.is_dir() and not stat.S_ISLNK(item.external_attr >> 16)
                     and item.file_size <= 8 * 1024 * 1024 for item in members),
             "The complete selected client member set changed")
        bodies = {item.filename: archive.read(item) for item in members}
    manifest = json.loads(bodies["manifest.json"])
    configuration = json.loads(bodies["connection.json"])
    publication = json.loads(bodies["publication.json"])
    need(manifest.get("schema") == "stellar-forge.vgi-client-handover.v1.package"
         and configuration.get("schema") == "stellar-forge.vgi-client-handover.v1"
         and publication == expected_publication,
         "The selected client source or schema changed")
    for key in ("workspace_id", "service_id", "publication_id"):
        need(manifest.get(key) == publication[key] == configuration[key] == receipt[key],
             "The selected client original identity changed: " + key)
    need(configuration["export_id"] == publication["source"]["export_id"]
         and configuration["expected_rows"] == publication["rows"]
         and configuration["expected_arrow_schema_sha256"] == publication["arrow_schema_sha256"]
         and configuration["listener_request_id"] == receipt["listener_request_id"],
         "The selected client source/listener binding changed")
    descriptors = manifest.get("files")
    need(isinstance(descriptors, list) and len(descriptors) == len(wanted) - 1
         and {item["name"] for item in descriptors} == wanted - {"manifest.json"},
         "The complete selected client manifest changed")
    for item in descriptors:
        raw = bodies[item["name"]]
        need(len(raw) == item["bytes"]
             and hashlib.sha256(raw).hexdigest() == item["sha256"],
             "A complete selected client source member changed")
    need(manifest["configuration_sha256"] == hashlib.sha256(bodies["connection.json"]).hexdigest()
         and manifest["publication_sha256"] == hashlib.sha256(bodies["publication.json"]).hexdigest(),
         "The selected client manifest source identity changed")
    for name, raw in bodies.items():
        target = package / name
        if target.exists():
            need(not target.is_symlink() and target.read_bytes() == raw,
                 "An already received selected client member changed")
        else:
            temporary = package / (name + ".pending")
            with temporary.open("wb") as handle:
                handle.write(raw)
            temporary.chmod(0o600)
            temporary.replace(target)
    received = {"archive": {"path": str(path), "bytes": path.stat().st_size,
                            "sha256": checksum(path)},
                "package": str(package), "configuration": configuration,
                "publication_id": publication["publication_id"],
                "source_export_id": publication["source"]["export_id"],
                "files": manifest["files"]}
    save(destination / "received-package.json", received, immutable=True)
    return received


def run_received_sql_client(root, browser_result, publication, token, expected, columns):
    receipt = browser_result["client_handover"]
    label = publication["publication_id"][:16] + "-" + receipt["listener_request_id"]
    received = receive_client_package(root, receipt, label, publication)
    destination = Path(received["package"]).parent
    completed = destination / "received-result.json"
    if completed.exists():
        saved = read(completed)
        need(saved["publication_id"] == publication["publication_id"]
             and saved["client_zip_sha256"] == receipt["sha256"],
             "The completed selected client receiving changed")
        for item in saved["retained_outputs"]:
            file = Path(item["path"])
            need(file.is_file() and not file.is_symlink()
                 and file.stat().st_size == item["bytes"] and checksum(file) == item["sha256"],
                 "A completed selected client output changed")
        return saved
    package = Path(received["package"])
    inspection = command_json([sys.executable, "-B", package / "result_sql_client.py",
                               "--package", package, "--inspect"], destination / "offline", "package")
    need(inspection.get("status") == "VERIFIED_OFFLINE",
         "The complete downloaded client did not reopen offline")
    attempt = "consumer-" + secrets.token_hex(8)
    output = destination / attempt
    invocation = [sys.executable, "-B", str(package / "result_sql_client.py"),
                  "--package", str(package), "--output", str(output)]
    save(destination / (attempt + ".invocation.json"), {
        "command": invocation, "publication_id": publication["publication_id"],
        "configuration_sha256": checksum(package / "connection.json"),
        "client_sha256": checksum(package / "result_sql_client.py"),
        "token_source": "Original receiving process environment", "started_at": now()},
        immutable=True)
    environment = dict(os.environ)
    environment["RESULT_SERVICE_TOKEN"] = token
    stdout = destination / (attempt + ".stdout.json")
    stderr = destination / (attempt + ".stderr.txt")
    with stdout.open("wb") as out, stderr.open("wb") as err:
        result = subprocess.run(invocation, env=environment, stdout=out, stderr=err)
    stdout.chmod(0o600)
    stderr.chmod(0o600)
    need(result.returncode == 0,
         "The selected SQL client did not complete; its original private output is retained")
    lines = stdout.read_text().splitlines()
    need(lines, "The selected SQL client returned no outcome")
    outcome = json.loads(lines[-1])
    returned = source_table(Path(outcome["result_parquet"])).sort_by([("sf_row", "ascending")])
    wanted = expected.sort_by([("sf_row", "ascending")])
    need(returned.column_names == wanted.column_names
         and returned.num_rows == wanted.num_rows == publication["rows"],
         "The downloaded client changed the complete original row or column population")
    normalize = lambda row: [
        canonical_value(row[name], columns[i]["type"])
        for i, name in enumerate(expected.column_names)]
    actual_values = [normalize(row) for row in returned.to_pylist()]
    expected_values = [normalize(row) for row in wanted.to_pylist()]
    need(actual_values == expected_values,
         "The downloaded client changed an original result value or encoding")
    retained = []
    for name in ("result_parquet", "result_csv", "result_descriptor", "receipt", "source_parquet"):
        file = Path(outcome[name]).absolute()
        need(file.is_relative_to(output.absolute()) and file.is_file() and not file.is_symlink(),
             "The selected client output escaped its original private directory")
        retained.append({"kind": name, "path": str(file), "bytes": file.stat().st_size,
                         "sha256": checksum(file)})
    reopened = command_json([sys.executable, "-B", package / "result_sql_client.py",
                              "--verify-output", output], destination / "offline", attempt)
    need(reopened.get("status") == "VERIFIED_OUTPUT"
         and reopened.get("publication_id") == publication["publication_id"]
         and reopened.get("rows") == returned.num_rows,
         "The complete selected client result did not cold reopen")
    value = {"publication_id": publication["publication_id"],
             "source_export_id": publication["source"]["export_id"],
             "listener_request_id": receipt["listener_request_id"],
             "client_zip_sha256": receipt["sha256"], "package": received["package"],
             "rows": returned.num_rows, "columns": outcome["columns"],
             "values_sha256": hashlib.sha256(encoded(actual_values)).hexdigest(),
             "retained_outputs": retained, "consumer": outcome,
             "offline_package": inspection, "offline_reopen": reopened, "completed_at": now()}
    save(completed, value, immutable=True)
    return value


def native_receiving(args, root, installation):
    from stellar_forge_buyer.duckdb_dataset import DuckDBWorkspace
    from stellar_forge_buyer.vgi_service.model import VgiService
    from stellar_forge_buyer.vgi_service.runtime import require_runtime

    need(Path(sys.prefix).resolve() == (Path(installation["directory"]) / "venv").resolve(),
         "Run the retained installed application environment")
    selected_runtime = require_runtime()
    received = Receiving(args, root)
    original, directory = original_input(args, root)
    expected = source_table(original / "downloaded-query" / "result.parquet")
    need(expected.num_rows == 32, "The exact original 32-row edition is required")
    query_manifest = read(original / "downloaded-query" / "manifest.json")
    exports = {EXPORT_ID: str(original / "downloaded-query")}
    auth_path = root / "private" / "authentication.json"
    if not auth_path.exists():
        save(auth_path, {"principal": PRINCIPAL, "token": secrets.token_urlsafe(32)},
             immutable=True)
    auth = read(auth_path)
    need(auth["principal"] == PRINCIPAL, "The original receiving principal changed")
    token = auth["token"]
    os.environ["VGI_BEARER_TOKENS"] = token + "=" + PRINCIPAL
    workspace = DuckDBWorkspace(directory)
    need(workspace.identity()["workspace_id"] == WORKSPACE_ID,
         "The original native warehouse identity changed")
    service = VgiService(workspace, export_locations=exports)
    signing = service.signing_key()
    initial_identity = service.state()
    received.phase("original_warehouse", lambda: {
        "workspace_id": WORKSPACE_ID, "service_id": initial_identity["service_id"],
        "edition_id": EDITION_ID, "source_export_id": EXPORT_ID,
        "source_manifest_sha256": checksum(original / "downloaded-query" / "manifest.json"),
        "rows": expected.num_rows, "runtime": selected_runtime})

    def start(api, name):
        current = api("/api/vgi/state")
        runtime = current["runtime"]
        if runtime.get("observed") == "RUNNING":
            need(runtime.get("owned") is True, "Use the original owned listener")
            return runtime
        need(runtime.get("observed") != "EXTERNAL_OWNER", "The original listener has another live owner")
        predecessor = {"name": name, "revision": current["revision"],
                       "request_id": runtime.get("request_id"), "observed": runtime.get("observed")}
        identity = hashlib.sha256(encoded(predecessor)).hexdigest()[:16]
        return received.request(api, name + "-" + identity, "/api/vgi/start", {
            "request_id": "", "expected_revision": current["revision"],
            "host": "127.0.0.1", "port": 0})

    def stop(api):
        current = api("/api/vgi/state")["runtime"]
        if current.get("owned"):
            api("/api/vgi/stop", {"request_id": current["request_id"]})

    with buyer(workspace, root, exports) as (api, url):
        workflow = received.phase("acquired_workflow", lambda: received.browser(api, url, "workflow"))
        initial = received.phase("operator_publish", lambda: received.browser(api, url, "publish"))
        first_publication = service.publication(initial["publication_id"])
        need(first_publication["rows"] == 32
             and [x["rows"] for x in first_publication["batches"]] == [16, 16],
             "The reviewed first publication must retain two exact 16-row batches")

        runtime = start(api, "first-listener")
        workflow_publication = service.publication(workflow["publication_id"])
        received.phase("acquired_workflow_sql_client", lambda: run_received_sql_client(
            root, received.browser(api, url, "client", workflow["publication_id"]),
            workflow_publication, token, expected, query_manifest["columns"]))
        received.phase("first_native_batch", lambda: first_batch(
            root, "first-publication", runtime["address"], token,
            first_publication["publication_id"], expected.slice(0, 16)))

        def following_export():
            queries = workspace.queries()["queries"]
            query = next(x for x in queries if x["query_id"] == QUERY_ID)
            sql = 'SELECT * FROM "svk_capacity" ORDER BY sf_row DESC'
            if query["revision"] == 1:
                query = workspace.save_query(query["name"], sql, [],
                                             expected_revision=1)
            need(query["revision"] == 2 and query["sql"] == sql,
                 "The original following query revision changed")
            return received.request(api, "following-original-export", "/api/exports", {
                "request_id": "", "query_id": QUERY_ID, "expected_revision": 2,
                "expected_views": workspace.views()})
        following = received.phase("following_original_export", following_export)
        exports[following["export_id"]] = following["directory"]
        review = received.phase("following_review", lambda: api("/api/vgi/review", {
            "export_id": following["export_id"], "batch_rows": 16}))
        following_publication = received.phase("following_publication", lambda:
            received.request(api, "following-publication", "/api/vgi/publish", {
                "request_id": "", "table_name": TABLE, "export_id": following["export_id"],
                "review_sha256": review["review_sha256"],
                "expected_head_revision": next(x for x in service.state()["tables"]
                                              if x["name"] == TABLE)["head_revision"]}))
        second_id = following_publication["publication_id"]
        second = service.publication(second_id)
        need(first_publication["publication_id"] != second_id
             and first_publication["arrow_schema_sha256"] == second["arrow_schema_sha256"],
             "The following reviewed source must retain a new publication and the same schema")
        stop(api)
        runtime = start(api, "following-listener")
        def first_continuation():
            need(next((x for x in runtime["catalog"]["tables"] if x["name"] == TABLE), {})
                 .get("publication_id") == second_id,
                 "Restart did not select the new reviewed head")
            return continue_batch(
                root, "first-after-restart", "first-publication", runtime["address"],
                token, expected.slice(16, 16))
        received.phase("original_cursor_after_head_restart", first_continuation)

        def access_changes():
            original_config = initial["configuration"]
            received.phase("principal_revocation", lambda: received.request(
                api, "revoke-principal", "/api/vgi/configure", {
                    "request_id": "", "expected_revision": service.state()["revision"],
                    "configuration": {**original_config, "principals": []}}))
            revoked = received.phase("principal_revocation_observed", lambda: denied_scan(
                service, second_id, runtime["address"], token, "VGI_SERVICE_ACCESS_DENIED"))
            received.phase("principal_restoration", lambda: received.request(
                api, "restore-principal", "/api/vgi/configure", {
                    "request_id": "", "expected_revision": service.state()["revision"],
                    "configuration": original_config}))
            received.phase("alias_retirement", lambda: received.request(
                api, "retire-alias", "/api/vgi/activate", {
                    "request_id": "", "table_name": TABLE, "publication_id": second_id,
                    "expected_head_revision": next(x for x in service.state()["tables"]
                                                  if x["name"] == TABLE)["head_revision"],
                    "active": False}))
            retired = received.phase("alias_retirement_observed", lambda: denied_scan(
                service, second_id, runtime["address"], token, "VGI_TABLE_RETIRED"))
            received.phase("alias_restoration", lambda: received.request(
                api, "restore-alias", "/api/vgi/activate", {
                    "request_id": "", "table_name": TABLE, "publication_id": second_id,
                    "expected_head_revision": next(x for x in service.state()["tables"]
                                                  if x["name"] == TABLE)["head_revision"],
                    "active": True}))
            service.authorize(second_id, principal=PRINCIPAL)
            return {"revoked_principal": revoked, "retired_alias": retired,
                    "current_access_restored": True}
        received.phase("current_access", access_changes)
        # A recovered listener may have been opened while the alias was retired.
        # Select the restored original catalog before continuing its next scan.
        stop(api)
        runtime = start(api, "restored-access-listener")
        need(next((x for x in runtime["catalog"]["tables"] if x["name"] == TABLE), {})
             .get("publication_id") == second_id,
             "The current restored catalog head changed")
        reversed_expected = expected.take(list(range(31, -1, -1)))
        received.phase("following_native_batch", lambda: first_batch(
            root, "following-publication", runtime["address"], token,
            second_id, reversed_expected.slice(0, 16)))
        received.phase("native_sql_client", lambda: sql_client(
            root, runtime["address"], token, expected, query_manifest["columns"],
            runtime["catalog"]["catalog_name"]))
        received.phase("downloaded_sql_client", lambda: run_received_sql_client(
            root, received.browser(api, url, "client", second_id), second, token,
            expected, query_manifest["columns"]))
        stop(api)
        handover = received.phase("operator_handover", lambda:
            received.browser(api, url, "handover", second_id))
        handoff = handover["handoff"]
        for item in handoff["files"]:
            path = Path(handoff["directory"]) / item["name"]
            need(path.stat().st_size == item["bytes"] and checksum(path) == item["sha256"],
                 "An original handover member changed")
    workspace.close()

    restored = DuckDBWorkspace(handoff["directory"])
    restored_service = VgiService(restored, export_locations=exports)
    need(restored.identity()["workspace_id"] == WORKSPACE_ID
         and restored_service.state()["service_id"] == initial_identity["service_id"]
         and restored_service.signing_key() == signing,
         "The original backup did not retain the catalog and signing identity")
    restored_root = private(root / "restored-operator")
    with buyer(restored, restored_root, exports) as (api, url):
        runtime = start(api, "restored-listener")
        received.phase("original_cursor_after_backup", lambda: continue_batch(
            root, "following-after-backup", "following-publication",
            runtime["address"], token, reversed_expected.slice(16, 16)))
        received.phase("restored_operator", lambda:
            received.browser(api, url, "restored", second_id))
        restored_state = restored_service.state()
        history = restored_service.history(limit=100)
        save(root / "receiving" / "restored-state.json", restored_state)
        save(root / "receiving" / "service-history.json", history)
        api("/api/vgi/stop", {"request_id": runtime["request_id"]})
    restored.close()
    result = {
        "schema": "stellar-forge.vgi-native-receiving.v1",
        "operation": OPERATION, "passed": True,
        "started_at": received.record["started_at"], "completed_at": now(),
        "source_ref": args.source_ref, "source_archive_sha256": args.source_sha256,
        "input_archive_sha256": CASE_SHA, "workspace_id": WORKSPACE_ID,
        "service_id": initial_identity["service_id"], "source_edition_id": EDITION_ID,
        "initial_export_id": EXPORT_ID, "following_export_id": following["export_id"],
        "initial_publication_id": first_publication["publication_id"],
        "following_publication_id": second_id,
        "workflow_publication_id": workflow["publication_id"],
        "workflow_export_id": workflow["export_id"],
        "rows": 32, "batch_rows": [16, 16],
        "installation_id": installation["id"], "candidate_id": installation["candidate"],
        "lock_sha256": installation["lockSha256"],
        "source_id": installation["source"]["id"],
        "phases": received.record["phases"],
        "restored_service_revision": restored_state["revision"],
        "history_events": len(history["events"]),
        "handoff": {"export_id": handoff["export_id"],
                    "files": [{k: x[k] for k in ("name", "bytes", "sha256")}
                              for x in handoff["files"]]},
    }
    save(root / "receiving" / "result.json", result)
    print(json.dumps({"operation": OPERATION, "passed": True,
                      "result": str(root / "receiving" / "result.json"),
                      "sha256": checksum(root / "receiving" / "result.json")}), flush=True)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("directory", "source-root", "source", "engine", "source-archive",
                 "source-manifest", "input", "python313", "node", "playwright",
                 "chromium", "browser-driver"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--source-successor", action="store_true",
                        help="Receive the selected complete source edition under the original operation lock")
    parser.add_argument("--installed", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--lease-fd", type=int, help=argparse.SUPPRESS)
    args = parser.parse_args()
    for key, value in vars(args).items():
        if isinstance(value, Path):
            setattr(args, key, value.expanduser().absolute())
    operation_root = private(args.directory)
    if args.source_successor:
        need(re.fullmatch(r"[a-f0-9]{40}", args.source_ref)
             and re.fullmatch(r"[a-f0-9]{64}", args.source_sha256),
             "Select the exact complete source successor")
        root = private(operation_root / "source-editions" /
                       (args.source_ref + "-" + args.source_sha256[:16]))
    else:
        root = operation_root
    os.environ["TMPDIR"] = str(private(root / "temporary"))
    if args.lease_fd is None:
        fd = os.open(operation_root / "receiving.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    else:
        fd = args.lease_fd
        need(os.fstat(fd).st_ino == (operation_root / "receiving.lock").stat().st_ino
             and os.fstat(fd).st_dev == (operation_root / "receiving.lock").stat().st_dev,
             "The original receiving lifetime changed")
    try:
        source_selection(args, root)
        if args.source_successor:
            predecessor = operation_root / "selection.json"
            prior = read(predecessor) if predecessor.exists() else None
            if prior is not None:
                need(prior.get("operation") == OPERATION
                     and prior.get("input_sha256") == CASE_SHA,
                     "The original source predecessor belongs to another operation")
            save(root / "source-adoption.json", {
                "schema": "stellar-forge.vgi-receiving-source-adoption.v1",
                "operation": OPERATION, "operation_root": str(operation_root),
                "source_edition_directory": str(root),
                "source_ref": args.source_ref, "source_archive_sha256": args.source_sha256,
                "input_archive_sha256": CASE_SHA,
                "predecessor_selection": str(predecessor) if prior is not None else None,
                "predecessor_selection_sha256": checksum(predecessor) if prior is not None else None,
                "previous_source_ref": prior.get("source_ref") if prior else None,
                "receiving_lock": str(operation_root / "receiving.lock"),
            }, immutable=True)
        completed = root / "receiving" / "result.json"
        if completed.exists():
            result = read(completed)
            need(result.get("passed") is True and result.get("operation") == OPERATION
                 and result.get("source_ref") == args.source_ref
                 and result.get("input_archive_sha256") == CASE_SHA,
                 "The completed original receiving identity changed")
            print(json.dumps({"operation": OPERATION, "passed": True, "reused": True,
                              "result": str(completed), "sha256": checksum(completed)}))
            return 0
        if not args.installed:
            installation = prepare_runtime(args, root)
            os.set_inheritable(fd, True)
            command = [installation["python"], "-I", str(Path(__file__).absolute()),
                       *sys.argv[1:], "--installed", "--lease-fd", str(fd)]
            os.execve(installation["python"], command, os.environ.copy())
        installation = read(root / "installation.json")
        need(installation["source"]["releaseId"] == args.source_ref
             and installation["source"]["releaseDigest"] == args.source_sha256,
             "The installed source is not this original receiving selection")
        return native_receiving(args, root, installation)
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"operation": OPERATION, "passed": False,
                          "error_type": type(error).__name__, "error": str(error)}),
              file=sys.stderr)
        raise SystemExit(1)
