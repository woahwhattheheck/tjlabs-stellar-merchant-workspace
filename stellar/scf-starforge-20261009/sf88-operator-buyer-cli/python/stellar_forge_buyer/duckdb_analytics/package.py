"""Complete analytical report, original sources and editable warehouse receiving."""
from __future__ import annotations

import hashlib
import os
import zipfile
from pathlib import Path

from ..duckdb_agent import copy_sparse
from ..duckdb_dataset import DuckDBWorkspace, _hex, _json, _new_destination, _now
from ..reconciliation.package import (_path, _name, _file, _public_file, _retain,
                                      _json_bytes, MAX_MANIFEST, MAX_FILE)
from ..storage import lock, parse, private_directory, read, sync_directory, write
from .contracts import SCHEMA, fail, fields, request_id, sha
from .model import Analytics, fingerprint
from .render import write_report

EXPORT_SCHEMA = SCHEMA + ".export"
_SOURCE_SUFFIXES = {".py", ".mjs", ".js", ".html", ".css", ".md", ".json", ".toml"}


def _source_plan():
    """Capture the installed original Python package and its actual source leaves."""
    root = Path(__file__).resolve().parents[1]
    files, total = [], 0
    paths = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix in _SOURCE_SUFFIXES
                   and "__pycache__" not in path.parts)
    for path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            fail("APPLICATION_SOURCE_PATH_INVALID")
        raw = path.read_bytes()
        total += len(raw)
        if total > 128 * 1024 * 1024:
            fail("APPLICATION_SOURCE_TOO_LARGE")
        files.append({"name": "application/stellar_forge_buyer/" + path.relative_to(root).as_posix(),
                      "source": str(path), "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    for filename in ("pyproject.toml", "README.md", "DUCKDB.md", "SPATIAL.md"):
        configuration = root.parent / filename
        if configuration.is_file() and not configuration.is_symlink():
            raw = configuration.read_bytes()
            total += len(raw)
            if total > 128 * 1024 * 1024:
                fail("APPLICATION_SOURCE_TOO_LARGE")
            files.append({"name": "application/" + filename, "source": str(configuration),
                          "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
    if not files or not any(item["name"].endswith("/duckdb_analytics/package.py") for item in files):
        fail("APPLICATION_SOURCE_MISSING")
    return files


def _artifact_key(value):
    if not isinstance(value, str) or value.count(":") != 1:
        fail("REPORT_SOURCE_INVALID")
    kind, identity = value.split(":")
    if kind not in {"result", "comparison"}:
        fail("REPORT_SOURCE_INVALID")
    return kind, _hex(identity)


def _source_records(report):
    if not isinstance(report.get("sources"), dict):
        fail("REPORT_SOURCE_INVALID")
    for key, source in sorted(report["sources"].items()):
        kind, identity = _artifact_key(key)
        if (not isinstance(source, dict) or source.get("kind") != kind
                or source.get("result_id" if kind == "result" else "comparison_id") != identity):
            fail("REPORT_SOURCE_INVALID")
        yield key, kind, identity, source


def _verify_manifest(root, manifest):
    if (not isinstance(manifest, dict) or manifest.get("schema") != EXPORT_SCHEMA
            or manifest.get("complete") is not True or manifest.get("state") != "COMPLETE"):
        fail("PACKAGE_MANIFEST_INVALID")
    for name in ("export_id", "report_id", "report_digest"):
        _hex(manifest.get(name))
    request_id(manifest.get("request_id"))
    request_id(manifest.get("workspace_id"))
    declared = manifest.get("files")
    if not isinstance(declared, list) or len(declared) > 100000:
        fail("PACKAGE_MANIFEST_INVALID")
    files, names = [], set()
    for expected in declared:
        if (not isinstance(expected, dict) or type(expected.get("bytes")) is not int
                or not 0 <= expected["bytes"] <= MAX_FILE):
            fail("PACKAGE_MANIFEST_INVALID")
        name = _name(expected.get("name"))
        if name == "manifest.json" or name in names:
            fail("PACKAGE_MANIFEST_INVALID")
        _hex(expected.get("sha256"))
        actual = _file(root, name)
        if (actual["bytes"], actual["sha256"]) != (expected["bytes"], expected["sha256"]):
            fail("PACKAGE_FILE_CHANGED")
        files.append(actual)
        names.add(name)
    required = {"report.json", "report.html", "analytics-request.json", "OPERATING.md",
                "warehouse/warehouse.duckdb", "warehouse/handoff.json", "warehouse/handoff-request.json"}
    if not required <= names:
        fail("PACKAGE_INCOMPLETE")
    report = parse(read(root / "report.json", MAX_MANIFEST))
    original = parse(read(root / "analytics-request.json", MAX_MANIFEST))
    if (report.get("report_id") != manifest["report_id"] or sha(report) != manifest["report_digest"]
            or report.get("workspace_id") != manifest["workspace_id"]
            or original.get("report") != report or original.get("request_id") != manifest["request_id"]
            or original.get("export_id") != manifest["export_id"]
            or original.get("workspace_id") != manifest["workspace_id"]):
        fail("ORIGINAL_REPORT_CHANGED")
    queries = manifest.get("queries")
    expected = list(_source_records(report))
    if not isinstance(queries, list) or {item.get("source") for item in queries} != {item[0] for item in expected} or len(queries) != len(expected):
        fail("PACKAGE_QUERY_SET_INVALID")
    for key, kind, identity, source in expected:
        prefix = "queries/" + kind + "-" + identity
        if not {prefix + "/" + name for name in ("manifest.json", "request.json", "execution.json",
                "result.csv", "result.parquet")} <= names:
            fail("PACKAGE_QUERY_SET_INVALID")
        native = parse(read(root / prefix / "manifest.json", MAX_MANIFEST))
        summary = next(item for item in queries if item["source"] == key)
        if (native.get("state") != "COMPLETE" or native.get("query") != source["query"]
                or native.get("views") != original.get("views") or native.get("rows") != source["row_count"]
                or native.get("export_id") != summary.get("export_id")
                or summary.get("fingerprint") != source["fingerprint"]):
            fail("ORIGINAL_QUERY_CHANGED")
        # The exact query exporter remains authoritative for native schema and
        # dictionary files. Our retained source/result definitions accompany it.
        if summary.get("source_editions") != source["source_editions"]:
            fail("ORIGINAL_QUERY_CHANGED")
    editions = set(report.get("source_editions", []))
    sources = manifest.get("sources")
    if not isinstance(sources, list) or len(sources) != len(editions) or {x.get("edition_id") for x in sources} != editions:
        fail("PACKAGE_SOURCES_INVALID")
    for source in sources:
        prefix = "sources/" + _hex(source["edition_id"]) + "/"
        declared = source.get("files")
        if not isinstance(declared, list) or not declared or not all(prefix + _name(x) in names for x in declared):
            fail("PACKAGE_SOURCES_INVALID")
        if prefix + "source-receiving.json" not in names:
            fail("PACKAGE_SOURCES_INVALID")
        native = parse(read(root / prefix / "source-receiving.json", MAX_MANIFEST))
        if native.get("edition_id") != source["edition_id"] or [x["name"] for x in native.get("files", [])] != declared:
            fail("PACKAGE_SOURCES_INVALID")
    source_plan = original.get("application")
    if (not isinstance(source_plan, list) or not source_plan
            or any(item.get("name") not in names for item in source_plan)):
        fail("APPLICATION_SOURCE_INCOMPLETE")
    for item in source_plan:
        actual = next(row for row in files if row["name"] == item["name"])
        if (actual["bytes"], actual["sha256"]) != (item.get("bytes"), item.get("sha256")):
            fail("APPLICATION_SOURCE_CHANGED")
    return report, files


def inspect_package(directory, *, expected_manifest_sha256=None):
    root = _path(directory)
    actual = _file(root, "manifest.json")
    if actual["bytes"] > MAX_MANIFEST:
        fail("PACKAGE_METADATA_TOO_LARGE")
    if expected_manifest_sha256 is not None and actual["sha256"] != _hex(expected_manifest_sha256):
        fail("PACKAGE_MANIFEST_CHANGED")
    manifest = parse(read(root / "manifest.json", MAX_MANIFEST))
    report, files = _verify_manifest(root, manifest)
    return {"schema": EXPORT_SCHEMA + ".inspection", "complete": True, "directory": str(root),
            "manifest_sha256": actual["sha256"], "manifest": manifest, "report": report,
            "files": files + [actual], "bytes": sum(item["bytes"] for item in files) + actual["bytes"]}


def _archive(root, inspected):
    """One complete download; the manifest describes the archive contents."""
    archive = root / "analytical-workbook.zip"
    partial = root / "analytical-workbook.zip.partial"
    control = root / "analytics-archive.json"
    binding = {"manifest_sha256": inspected["manifest_sha256"], "export_id": inspected["manifest"]["export_id"]}
    if control.exists():
        saved = parse(read(control, MAX_MANIFEST))
        actual = _file(root, archive.name)
        if any(saved.get(key) != value for key, value in binding.items()) or (
                actual["bytes"], actual["sha256"]) != (saved.get("bytes"), saved.get("sha256")):
            fail("PACKAGE_ARCHIVE_CHANGED")
        return actual
    if archive.exists() and partial.exists():
        first, second = archive.lstat(), partial.lstat()
        if (first.st_dev, first.st_ino, first.st_nlink) != (second.st_dev, second.st_ino, 2):
            fail("ARCHIVE_PUBLICATION_CONFLICT")
        sync_directory(root)
        os.unlink(partial)
        sync_directory(root)
    if archive.exists():
        expected = {item["name"]: item for item in inspected["files"]}
        with zipfile.ZipFile(archive) as source:
            if len(source.infolist()) != len(expected) or set(source.namelist()) != set(expected):
                fail("PACKAGE_ARCHIVE_CHANGED")
            for name, item in expected.items():
                checksum, size = hashlib.sha256(), 0
                with source.open(name) as stream:
                    while chunk := stream.read(1024 * 1024):
                        size += len(chunk)
                        if size > item["bytes"]:
                            fail("PACKAGE_ARCHIVE_CHANGED")
                        checksum.update(chunk)
                if (size, checksum.hexdigest()) != (item["bytes"], item["sha256"]):
                    fail("PACKAGE_ARCHIVE_CHANGED")
    else:
        if partial.exists():
            _file(root, partial.name)
            os.unlink(partial)
        descriptor = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=4, allowZip64=True) as target:
                for item in inspected["files"]:
                    target.write(root / item["name"], arcname=item["name"])
            output.flush()
            os.fsync(output.fileno())
        os.link(partial, archive)
        sync_directory(root)
        os.unlink(partial)
        sync_directory(root)
    actual = _file(root, archive.name)
    _retain(control, _json_bytes({**binding, **_public_file(actual)}))
    return actual


def _record(workspace, root, inspected):
    archive = _archive(root, inspected)
    record = {**inspected["manifest"], "workspace": str(workspace.directory), "directory": str(root),
              "files": inspected["files"] + [archive], "manifest_sha256": inspected["manifest_sha256"],
              "archive": _public_file(archive)}
    with workspace._guard(), workspace._connection(writeable=True) as db:
        db.execute("INSERT INTO sf_exports VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record",
                   [record["export_id"], _json(record)])
    return record


def export_report(workspace, body, directory):
    fields(body, ("request_id", "report_id"))
    request_id(body["request_id"])
    report_id = _hex(body["report_id"])
    root = _new_destination(directory, workspace.directory)
    if _path(root) != root:
        fail("PRIVATE_CANONICAL_PATH_REQUIRED")
    control, complete = root / "analytics-request.json", root / "manifest.json"
    if complete.exists():
        inspected = inspect_package(root)
        original = parse(read(control, MAX_MANIFEST))
        if (inspected["manifest"]["request_id"] != body["request_id"]
                or inspected["manifest"]["report_id"] != report_id
                or original.get("directory") != str(root)
                or original.get("workspace") != str(workspace.directory)
                or inspected["manifest"]["workspace_id"] != workspace.identity()["workspace_id"]):
            fail("PACKAGE_DESTINATION_CONFLICT")
        return _record(workspace, root, inspected)
    model = Analytics(workspace)
    report = model.record("reports", report_id)
    if control.exists():
        original = parse(read(control, MAX_MANIFEST))
        if (original.get("schema") != EXPORT_SCHEMA + ".request"
                or original.get("request_id") != body["request_id"] or original.get("report") != report
                or original.get("workspace_id") != workspace.identity()["workspace_id"]
                or original.get("workspace") != str(workspace.directory) or original.get("directory") != str(root)):
            fail("PACKAGE_DESTINATION_CONFLICT")
    else:
        if any(root.iterdir()):
            fail("PACKAGE_DESTINATION_NOT_EMPTY")
        original = {"schema": EXPORT_SCHEMA + ".request", "request_id": body["request_id"],
                    "report": report, "workspace_id": workspace.identity()["workspace_id"],
                    "workspace": str(workspace.directory), "directory": str(root),
                    "views": workspace.views(), "created_at": _now(), "application": _source_plan(),
                    "guide": read(Path(__file__).with_name("OPERATING.md"), MAX_MANIFEST).decode("utf-8")}
        original["export_id"] = sha(original)
        _retain(control, _json_bytes(original))
    _retain(root / "report.json", _json_bytes(report))
    _retain(root / "OPERATING.md", original["guide"].encode("utf-8"))
    files = [_file(root, name) for name in ("analytics-request.json", "report.json", "OPERATING.md")]
    # A deterministic new report is generated from the same original source.
    # Resume replaces only this operation's private incomplete temporary leaf.
    report_output, report_partial = root / "report.html", root / "report.html.partial"
    if not report_output.exists():
        if report_partial.exists():
            _file(root, report_partial.name)
            os.unlink(report_partial)
        write_report(workspace, report, report_partial)
        os.link(report_partial, report_output)
        sync_directory(root)
        os.unlink(report_partial)
        sync_directory(root)
    elif report_partial.exists():
        first, second = report_output.lstat(), report_partial.lstat()
        if (first.st_dev, first.st_ino, first.st_nlink) != (second.st_dev, second.st_ino, 2):
            fail("REPORT_PUBLICATION_CONFLICT")
        sync_directory(root)
        os.unlink(report_partial)
        sync_directory(root)
    files.append(_file(root, "report.html"))
    for item in original["application"]:
        path = root / _name(item["name"])
        private_directory(path.parent)
        if not path.exists():
            raw = Path(item["source"]).read_bytes()
            if (len(raw), hashlib.sha256(raw).hexdigest()) != (item["bytes"], item["sha256"]):
                fail("APPLICATION_SOURCE_CHANGED")
            _retain(path, raw)
        actual = _file(root, item["name"])
        if (actual["bytes"], actual["sha256"]) != (item["bytes"], item["sha256"]):
            fail("APPLICATION_SOURCE_CHANGED")
        files.append(actual)
    private_directory(root / "queries")
    private_directory(root / "sources")
    queries, sources = [], []

    def include(prefix, native):
        for item in native["files"]:
            actual = _file(root, prefix + "/" + _name(item["name"]))
            if (actual["bytes"], actual["sha256"]) != (item["bytes"], item["sha256"]):
                fail("ORIGINAL_EXPORT_CHANGED")
            files.append(actual)

    for key, kind, identity, source in _source_records(report):
        prefix = "queries/" + kind + "-" + identity
        query = source["query"]
        model.validate_result("results" if kind == "result" else "comparisons", identity)
        native = workspace.export_query(query["query_id"], root / prefix,
                    expected_revision=query["revision"], expected_views=original["views"], retained_query=query)
        if native.get("rows") != source["row_count"]:
            fail("ORIGINAL_QUERY_CHANGED")
        include(prefix, native)
        queries.append({"source": key, "query_id": query["query_id"], "revision": query["revision"],
                        "export_id": native["export_id"], "rows": native["rows"], "directory": prefix,
                        "fingerprint": source["fingerprint"], "source_editions": source["source_editions"]})
    for edition in report["source_editions"]:
        prefix = "sources/" + edition
        native = workspace.export_source(edition, root / prefix)
        include(prefix, native)
        portable = {**native, "directory": prefix, "files": [_public_file(item) for item in native["files"]]}
        _retain(root / prefix / "source-receiving.json", _json_bytes(portable))
        files.append(_file(root, prefix + "/source-receiving.json"))
        sources.append({"edition_id": edition, "directory": prefix, "files": [item["name"] for item in native["files"]]})
    native = workspace.backup(root / "warehouse")
    include("warehouse", native)
    if len({item["name"] for item in files}) != len(files):
        fail("PACKAGE_FILE_DUPLICATED")
    manifest = {"schema": EXPORT_SCHEMA, "state": "COMPLETE", "complete": True,
                "export_id": original["export_id"], "request_id": body["request_id"], "report_id": report_id,
                "report_digest": sha(report), "workspace_id": original["workspace_id"],
                "created_at": original["created_at"], "completed_at": _now(), "queries": queries, "sources": sources,
                "files": [_public_file(item) for item in files],
                "reopen": {"guide": "OPERATING.md", "report": "report.html", "definition": "report.json",
                           "immutable_warehouse": "warehouse/warehouse.duckdb", "application": "application",
                           "command": "PYTHONPATH=PACKAGE/application python -m stellar_forge_buyer.duckdb_analytics.package receive --directory PACKAGE --destination NEW_PRIVATE_WORKSPACE --manifest-sha256 EXACT_SHA256"},
                "limits": {"file_bytes": MAX_FILE, "manifest_bytes": MAX_MANIFEST, "application_bytes": 128 * 1024 * 1024}}
    _retain(complete, _json_bytes(manifest))
    return _record(workspace, root, inspect_package(root))


def _validate_received(workspace, record):
    if workspace.identity()["workspace_id"] != record["workspace_id"]:
        fail("WORKSPACE_CHANGED")
    model = Analytics(workspace)
    with workspace._guard(), workspace._connection() as db:
        report = model._record(db, "reports", record["report_id"])
        if sha(report) != record["report_digest"]:
            fail("ORIGINAL_REPORT_CHANGED")
        for _, kind, identity, source in _source_records(report):
            actual = model._record(db, "results" if kind == "result" else "comparisons", identity)
            if actual != source or fingerprint(db, source["table"], source["columns"]) != source["fingerprint"]:
                fail("RETAINED_RESULT_CHANGED")
        for edition_id in report["source_editions"]:
            workspace._record(db, "sf_editions", edition_id)
    return {"report_id": report["report_id"], "workbook_id": report["workbook_id"],
            "workbook_revision": report["workbook_revision"], "result_count": len(report["sources"]),
            "source_editions": report["source_editions"]}


def receive_package(directory, destination, *, expected_manifest_sha256, expected_workspace_id=None):
    """Borrow the original sparse-copy receiver and keep a separately editable DB."""
    expected_manifest_sha256 = _hex(expected_manifest_sha256)
    root = _path(destination)
    private_directory(root.parent)
    private_directory(root)
    receipt, control = root / "analytics-receive.json", root / "analytics-receive-request.json"

    def reopen(record):
        if (record.get("schema") != EXPORT_SCHEMA + ".receiving"
                or record.get("directory") != str(root)
                or record.get("manifest_sha256") != expected_manifest_sha256):
            fail("RECEIVING_BINDING_CHANGED")
        if expected_workspace_id is not None and request_id(expected_workspace_id) != record["workspace_id"]:
            fail("WORKSPACE_CHANGED")
        with DuckDBWorkspace(root) as workspace:
            return _validate_received(workspace, record)

    if receipt.exists():
        saved = parse(read(receipt, MAX_MANIFEST))
        if saved.get("complete") is not True:
            fail("RECEIVING_BINDING_CHANGED")
        reopened = reopen(saved)
        sync_directory(root)
        sync_directory(root.parent)
        return {**saved, "reopened": reopened, "reused": True}
    if control.exists():
        saved = parse(read(control, MAX_MANIFEST))
        if saved.get("phase") == "COPY_PUBLISHED":
            reopened = reopen(saved)
            result = {key: value for key, value in saved.items() if key != "phase"}
            result.update(complete=True, received_at=_now(), reopened=reopened, reused=True)
            _retain(receipt, _json_bytes(result))
            sync_directory(root.parent)
            return result
    inspected = inspect_package(directory, expected_manifest_sha256=expected_manifest_sha256)
    manifest, original_root = inspected["manifest"], _path(directory)
    if root == original_root or original_root in root.parents or root in original_root.parents:
        fail("RECEIVING_DIRECTORY_SEPARATE_REQUIRED")
    if expected_workspace_id is not None and request_id(expected_workspace_id) != manifest["workspace_id"]:
        fail("WORKSPACE_CHANGED")
    snapshot = next(item for item in inspected["files"] if item["name"] == "warehouse/warehouse.duckdb")
    binding = {"schema": EXPORT_SCHEMA + ".receiving", "manifest_sha256": inspected["manifest_sha256"],
               "export_id": manifest["export_id"], "report_id": manifest["report_id"],
               "report_digest": manifest["report_digest"], "workspace_id": manifest["workspace_id"],
               "directory": str(root), "warehouse_sha256": snapshot["sha256"], "warehouse_bytes": snapshot["bytes"]}
    with lock(root):
        if control.exists():
            original = parse(read(control, MAX_MANIFEST))
            if any(original.get(key) != value for key, value in binding.items()):
                fail("RECEIVING_BINDING_CHANGED")
        else:
            if any(path.name != "operation.lock" for path in root.iterdir()):
                fail("RECEIVING_DIRECTORY_IN_USE")
            original = {**binding, "phase": "COPY_PREPARED", "original_package": str(original_root), "created_at": _now()}
            _retain(control, _json_bytes(original))
        output, partial = root / "warehouse.duckdb", root / "analytics-warehouse.partial"
        allowed = {"operation.lock", control.name, output.name, partial.name}
        if any(path.name not in allowed for path in root.iterdir()):
            fail("RECEIVING_DIRECTORY_IN_USE")
        if output.exists() and partial.exists():
            first, second = output.lstat(), partial.lstat()
            if (first.st_dev, first.st_ino, first.st_nlink) != (second.st_dev, second.st_ino, 2):
                fail("RECEIVING_PUBLICATION_CONFLICT")
            sync_directory(root)
            os.unlink(partial)
            sync_directory(root)
        if output.exists():
            actual = _file(root, output.name)
            if (actual["bytes"], actual["sha256"]) != (snapshot["bytes"], snapshot["sha256"]):
                fail("RECEIVING_WAREHOUSE_CHANGED")
        else:
            matched = False
            if partial.exists():
                actual = _file(root, partial.name)
                matched = (actual["bytes"], actual["sha256"]) == (snapshot["bytes"], snapshot["sha256"])
            if not matched:
                source_fd = os.open(original_root / snapshot["name"], os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(source_fd, "rb") as source:
                    flags = os.O_RDWR | os.O_NOFOLLOW | (os.O_TRUNC if partial.exists() else os.O_CREAT | os.O_EXCL)
                    target_fd = os.open(partial, flags, 0o600)
                    with os.fdopen(target_fd, "wb") as target:
                        copy_sparse(source, target)
                        target.flush()
                        os.fsync(target.fileno())
                actual = _file(root, partial.name)
                if (actual["bytes"], actual["sha256"]) != (snapshot["bytes"], snapshot["sha256"]):
                    fail("RECEIVING_WAREHOUSE_CHANGED")
            os.link(partial, output)
            sync_directory(root)
            os.unlink(partial)
            sync_directory(root)
        original["phase"] = "COPY_PUBLISHED"
        write(control, _json_bytes(original))
    reopened = reopen(original)
    result = {key: value for key, value in original.items() if key != "phase"}
    result.update(complete=True, received_at=_now(), reopened=reopened, reused=False)
    _retain(receipt, _json_bytes(result))
    sync_directory(root.parent)
    return result


def main(argv=None):
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--directory", required=True)
    inspect.add_argument("--manifest-sha256")
    receive = commands.add_parser("receive")
    receive.add_argument("--directory", required=True)
    receive.add_argument("--destination", required=True)
    receive.add_argument("--manifest-sha256", required=True)
    receive.add_argument("--workspace-id")
    args = parser.parse_args(argv)
    if args.command == "inspect":
        result = inspect_package(args.directory, expected_manifest_sha256=args.manifest_sha256)
    else:
        result = receive_package(args.directory, args.destination, expected_manifest_sha256=args.manifest_sha256,
                                 expected_workspace_id=args.workspace_id)
    print(_json(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
