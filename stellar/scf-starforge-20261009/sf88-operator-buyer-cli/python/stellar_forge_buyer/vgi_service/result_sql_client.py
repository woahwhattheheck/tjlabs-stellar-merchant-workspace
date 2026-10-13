#!/usr/bin/env python3
"""Receive one inspected VGI publication and retain its complete SQL result.

The six-file handover is credential-free. All network reads use the existing
listener; custom SQL runs over the resulting local snapshot. No purchase,
publication, head selection, listener lifecycle or warehouse write is performed.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import csv
from datetime import date, datetime, time, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
from urllib.parse import urlsplit

SCHEMA = "stellar-forge.vgi-client-handover.v1"
MEMBERS = {"connection.json", "publication.json", "query.sql",
           "result_sql_client.py", "README.md", "manifest.json"}
HEX = re.compile(r"^[0-9a-f]{64}$")


class ClientError(Exception):
    """An intentionally credential-free operator error."""


def need(condition, code):
    if not condition:
        raise ClientError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def read_json(raw):
    try:
        return json.loads(raw, object_pairs_hook=_pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(
                              ClientError("NONFINITE_JSON_VALUE")))
    except (ValueError, UnicodeError):
        raise ClientError("INVALID_JSON") from None


def qid(value):
    need(isinstance(value, str) and value and "\x00" not in value,
         "INVALID_SQL_IDENTIFIER")
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    need(isinstance(value, str) and "\x00" not in value, "INVALID_SQL_LITERAL")
    return "'" + value.replace("'", "''") + "'"


def checked_file(path):
    need(not path.is_symlink() and path.is_file(), "REGULAR_FILE_REQUIRED")
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(fd, "rb") as stream:
        before = os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode), "REGULAR_FILE_REQUIRED")
        raw = stream.read()
        after = os.fstat(stream.fileno())
        named = path.stat(follow_symlinks=False)
    identity = lambda x: (x.st_dev, x.st_ino, x.st_size, x.st_mtime_ns)
    need(identity(before) == identity(after) == identity(named),
         "SOURCE_CHANGED_DURING_READ")
    return raw


def verify_package(directory, *, check_runner=True):
    root = Path(directory).absolute()
    need(root.is_dir() and not root.is_symlink(), "PACKAGE_DIRECTORY_REQUIRED")
    # Exactly six ordinary files: hidden additions and directories are not ignored.
    need({p.name for p in root.iterdir()} == MEMBERS, "PACKAGE_MEMBERS_CHANGED")
    files = {name: checked_file(root / name) for name in sorted(MEMBERS)}
    manifest = read_json(files["manifest.json"])
    need(isinstance(manifest, dict) and manifest.get("schema") == SCHEMA + ".package",
         "PACKAGE_SCHEMA_CHANGED")
    descriptors = manifest.get("files")
    need(isinstance(descriptors, list) and len(descriptors) == 5
         and all(isinstance(x, dict) for x in descriptors),
         "PACKAGE_MANIFEST_INVALID")
    need(len({x.get("name") for x in descriptors}) == 5
         and {x.get("name") for x in descriptors} == MEMBERS - {"manifest.json"},
         "PACKAGE_MANIFEST_MEMBERS_CHANGED")
    for item in descriptors:
        raw = files[item["name"]]
        need(type(item.get("bytes")) is int and item["bytes"] == len(raw)
             and item.get("sha256") == digest(raw), "PACKAGE_MEMBER_CHANGED")
    need(manifest.get("configuration_sha256") == digest(files["connection.json"])
         and manifest.get("publication_sha256") == digest(files["publication.json"]),
         "PACKAGE_IDENTITIES_CHANGED")
    config = read_json(files["connection.json"])
    publication = read_json(files["publication.json"])
    need(isinstance(config, dict) and config.get("schema") == SCHEMA
         and isinstance(publication, dict), "CONFIGURATION_INVALID")
    for key in ("workspace_id", "service_id", "publication_id"):
        need(isinstance(config.get(key), str) and config[key]
             and config[key] == publication.get(key) == manifest.get(key),
             "ORIGINAL_CONTEXT_CHANGED")
    for key in ("publication_id", "export_id", "expected_arrow_schema_sha256"):
        need(isinstance(config.get(key), str) and HEX.fullmatch(config[key]),
             "ORIGINAL_ID_INVALID")
    source = publication.get("source")
    need(isinstance(source, dict) and source.get("export_id") == config["export_id"],
         "ORIGINAL_EXPORT_CHANGED")
    need(config.get("table_name") == publication.get("table_name")
         and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,119}", config["table_name"]),
         "ORIGINAL_TABLE_CHANGED")
    need(isinstance(config.get("catalog_name"), str)
         and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,119}", config["catalog_name"]),
         "ORIGINAL_CATALOG_NAME_REQUIRED")
    need(config.get("schema_name") == "results"
         and config.get("attach_alias") == "purchased"
         and config.get("token_env") == "RESULT_SERVICE_TOKEN"
         and config.get("query_file") == "query.sql", "CLIENT_CONTRACT_CHANGED")
    need(type(config.get("expected_rows")) is int and config["expected_rows"] >= 0
         and config["expected_rows"] == publication.get("rows"),
         "ORIGINAL_ROW_COUNT_CHANGED")
    for key in ("catalog_revision", "head_revision", "current_service_revision",
                "current_head_revision"):
        need(type(config.get(key)) is int and config[key] >= 0,
             "ORIGINAL_REVISION_INVALID")
    need(isinstance(config.get("listener_request_id"), str)
         and config["listener_request_id"], "ORIGINAL_LISTENER_REQUIRED")
    try:
        url = urlsplit(config["address"])
        port = url.port
        valid = (url.scheme in {"http", "https"} and url.hostname
                 and url.username is None and url.password is None
                 and not url.query and not url.fragment
                 and url.hostname not in {"0.0.0.0", "::", "*"}
                 and (port is None or 0 < port <= 65535)
                 and "\\" not in config["address"]
                 and all(ord(c) > 32 for c in config["address"]))
    except (KeyError, TypeError, ValueError):
        valid = False
    need(valid, "CLIENT_ADDRESS_INVALID")
    need(isinstance(config.get("listener_address"), str)
         and isinstance(config.get("address_note"), str)
         and (config["address"] == config["listener_address"]
              or config["address_note"].strip()), "ADDRESS_REASON_REQUIRED")
    try:
        schema_raw = base64.b64decode(publication["arrow_schema_base64"], validate=True)
    except (KeyError, TypeError, ValueError):
        raise ClientError("ORIGINAL_ARROW_SCHEMA_INVALID") from None
    need(digest(schema_raw) == publication.get("arrow_schema_sha256")
         == config["expected_arrow_schema_sha256"], "ORIGINAL_ARROW_SCHEMA_CHANGED")
    columns = publication.get("arrow_columns")
    need(isinstance(columns, list) and columns
         and all(isinstance(c, dict) and isinstance(c.get("name"), str)
                 and c["name"] and isinstance(c.get("type"), str)
                 and type(c.get("nullable")) is bool for c in columns),
         "ORIGINAL_COLUMNS_REQUIRED")
    need(len({c["name"].casefold() for c in columns}) == len(columns),
         "ORIGINAL_COLUMNS_DUPLICATED")
    sql = ("-- Query the already retained result through its selected live VGI alias.\n"
           "-- A later listener restart may select another edition; inspect the actual attachment.\n"
           "SELECT\n    " + ",\n    ".join(qid(c["name"]) for c in columns)
           + '\nFROM "purchased"."results".' + qid(config["table_name"]) + ";\n")
    need(files["query.sql"] == sql.encode(), "DEFAULT_QUERY_CHANGED")
    if check_runner:
        need(checked_file(Path(__file__).absolute()) == files["result_sql_client.py"],
             "RUN_THE_RETAINED_CLIENT_SOURCE")
    return {"files": files, "manifest": manifest, "config": config,
            "publication": publication, "schema_raw": schema_raw, "query": sql}


def save(path, raw):
    raw = raw if isinstance(raw, bytes) else json_bytes(raw)
    with path.open("xb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    path.chmod(0o600)


def sha_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def file_descriptor(path, root):
    return {"name": path.relative_to(root).as_posix(),
            "bytes": path.stat().st_size, "sha256": sha_file(path)}


@contextmanager
def quiet_native():
    """Native errors can include ATTACH SQL. Discard that channel, never retain it."""
    sys.stdout.flush()
    sys.stderr.flush()
    copies = [os.dup(1), os.dup(2)]
    try:
        with open(os.devnull, "wb") as sink:
            os.dup2(sink.fileno(), 1)
            os.dup2(sink.fileno(), 2)
            yield
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        for original, duplicate in zip((1, 2), copies):
            os.dup2(duplicate, original)
            os.close(duplicate)


def sql_columns(description):
    return [{"name": row[0], "type": str(row[1])} for row in description]


def schema_descriptor(schema):
    raw = schema.serialize().to_pybytes()
    return {"arrow_schema_base64": base64.b64encode(raw).decode("ascii"),
            "arrow_schema_sha256": digest(raw),
            "arrow_columns": [{"name": f.name, "type": str(f.type),
                               "nullable": f.nullable} for f in schema]}


def inspect_attachment(connection, config, expected_columns):
    tags_rows = connection.execute(
        "SELECT tags FROM duckdb_databases() WHERE database_name = ?",
        [config["attach_alias"]]).fetchall()
    need(len(tags_rows) == 1 and isinstance(tags_rows[0][0], dict),
         "ATTACHED_CATALOG_IDENTITY_UNAVAILABLE")
    tags = tags_rows[0][0]
    need(tags.get("workspace_id") == config["workspace_id"]
         and tags.get("service_id") == config["service_id"]
         and tags.get("service_revision") == str(config["catalog_revision"]),
         "ATTACHED_CATALOG_CHANGED")
    key = [config["attach_alias"], config["schema_name"], config["table_name"]]
    tables = connection.execute(
        "SELECT comment FROM duckdb_tables() "
        "WHERE database_name=? AND schema_name=? AND table_name=?", key).fetchall()
    expected_comment = ("Retained native result; export " + config["export_id"]
                        + "; publication " + config["publication_id"])
    need(len(tables) == 1 and tables[0][0] == expected_comment,
         "ATTACHED_PUBLICATION_CHANGED")
    rows = connection.execute(
        "SELECT column_name, data_type FROM duckdb_columns() "
        "WHERE database_name=? AND schema_name=? AND table_name=? "
        "ORDER BY column_index", key).fetchall()
    columns = [{"name": x[0], "type": x[1]} for x in rows]
    need(columns == expected_columns, "ATTACHED_COLUMNS_CHANGED")
    return {"workspace_id": tags["workspace_id"], "service_id": tags["service_id"],
            "catalog_revision": config["catalog_revision"],
            "publication_id": config["publication_id"], "export_id": config["export_id"],
            "table": ".".join(key), "comment": tables[0][0], "columns": columns,
            "checked_at": datetime.now(timezone.utc).isoformat()}


def stream_parquet(connection, query, path, pq):
    cursor = connection.execute(query)
    columns = sql_columns(cursor.description)
    reader = cursor.fetch_record_batch(65536)
    schema = reader.schema
    partial = path.with_suffix(".parquet.partial")
    rows = 0
    try:
        with pq.ParquetWriter(partial, schema) as writer:
            for batch in reader:
                writer.write_batch(batch)
                rows += batch.num_rows
    finally:
        reader.close()
    partial.chmod(0o600)
    need(pq.ParquetFile(partial).metadata.num_rows == rows,
         "RETAINED_PARQUET_ROW_COUNT_CHANGED")
    partial.rename(path)
    return {"rows": rows, "columns": columns, **schema_descriptor(schema)}


def csv_scalar(value):
    # CSV is the human-readable companion; Parquet retains the typed value.
    if value is None:
        return r"\N"
    if isinstance(value, bytes):
        return "base64:" + base64.b64encode(value).decode("ascii")
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, default=csv_scalar,
                          separators=(",", ":"))
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def write_csv(parquet, path, pq):
    partial = path.with_suffix(".csv.partial")
    source = pq.ParquetFile(parquet)
    with partial.open("x", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(source.schema_arrow.names)
        for batch in source.iter_batches(batch_size=65536):
            for row in batch.to_pylist():
                writer.writerow([csv_scalar(row[name]) for name in batch.schema.names])
        stream.flush()
        os.fsync(stream.fileno())
    partial.chmod(0o600)
    partial.rename(path)


def receive(package, output, custom_sql, *, extension_directory=None):
    config = package["config"]
    receipt = {
        "schema": SCHEMA + ".receipt", "status": "INCOMPLETE",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "workspace_id": config["workspace_id"], "service_id": config["service_id"],
        "publication_id": config["publication_id"], "export_id": config["export_id"],
        "package_manifest_sha256": digest(package["files"]["manifest.json"]),
        "selection_semantics": config["selection_semantics"],
        "query_mode": "local-selected-snapshot" if custom_sql is not None else "full-vgi-publication",
    }
    stage = "RETAIN_PACKAGE"
    token = ""
    remote = local = None
    try:
        original = output / "package"
        original.mkdir(mode=0o700)
        for name, raw in package["files"].items():
            save(original / name, raw)
        actual_sql = custom_sql if custom_sql is not None else package["query"]
        save(output / "query.sql", actual_sql.encode("utf-8"))
        save(output / "source-query.sql", package["query"].encode("utf-8"))
        stage = "TOKEN_REQUIRED"
        token = os.environ.get("RESULT_SERVICE_TOKEN", "")
        need(bool(token) and "\x00" not in token and "\r" not in token
             and "\n" not in token, "RESULT_SERVICE_TOKEN_REQUIRED")
        # Reject accidental secrets in an operator-edited query before any persisted use.
        need(token not in actual_sql, "TOKEN_MUST_NOT_APPEAR_IN_QUERY")
        stage = "LOAD_CLIENT_RUNTIME"
        import duckdb
        import pyarrow as pa
        import pyarrow.parquet as pq
        need(duckdb.__version__ == "1.5.6", "USE_MAINTAINED_DUCKDB_1_5_6")
        expected_schema = pa.ipc.read_schema(pa.BufferReader(package["schema_raw"]))
        need([{"name": f.name, "type": str(f.type), "nullable": f.nullable}
              for f in expected_schema] == package["publication"]["arrow_columns"],
             "ORIGINAL_ARROW_COLUMNS_CHANGED")
        receipt["runtime"] = {"python": sys.version.split()[0],
                              "duckdb": duckdb.__version__, "pyarrow": pa.__version__}
        runtime = output / "client-runtime"
        runtime.mkdir(mode=0o700)
        settings = {"threads": "1", "memory_limit": "128MB",
                    "temp_directory": str(runtime / "temporary"),
                    "enable_progress_bar": "false"}
        if extension_directory is not None:
            ext = Path(extension_directory).absolute()
            need(ext.is_dir() and not ext.is_symlink(), "EXTENSION_DIRECTORY_REQUIRED")
            settings["extension_directory"] = str(ext)
        with quiet_native():
            remote = duckdb.connect(":memory:", config=settings)
            remote.register("expected_original", pa.Table.from_batches([], schema=expected_schema))
            expected_columns = sql_columns(remote.execute(
                "SELECT * FROM expected_original LIMIT 0").description)
            remote.unregister("expected_original")
            stage = "INSTALL_LOAD_VGI"
            remote.execute("INSTALL vgi FROM community")
            remote.execute("LOAD vgi")
            ext_row = remote.execute(
                "SELECT extension_name, loaded, installed, install_path, extension_version "
                "FROM duckdb_extensions() WHERE extension_name='vgi'").fetchone()
            need(ext_row and ext_row[1] is True, "VGI_EXTENSION_NOT_LOADED")
            extension = dict(zip(["name", "loaded", "installed", "install_path",
                                  "version"], ext_row))
            if ext_row[3] and Path(ext_row[3]).is_file():
                extension["file_sha256"] = sha_file(Path(ext_row[3]))
                extension["file_bytes"] = Path(ext_row[3]).stat().st_size
            receipt["extension"] = extension
            stage = "AUTHENTICATED_ATTACH"
            remote.execute("ATTACH " + literal(config["catalog_name"])
                           + " AS purchased (TYPE vgi, LOCATION "
                           + literal(config["address"]) + ", bearer_token " + literal(token) + ")")
            stage = "CHECK_ATTACHED_PUBLICATION"
            receipt["attachment_before"] = inspect_attachment(remote, config, expected_columns)
            save(output / "attachment.json", receipt["attachment_before"])
            stage = "RECEIVE_COMPLETE_PUBLICATION"
            source = stream_parquet(remote, package["query"], output / "source.parquet", pq)
            need(source["columns"] == expected_columns, "RESULT_COLUMNS_CHANGED")
            need(source["rows"] == config["expected_rows"], "PUBLICATION_ROW_COUNT_CHANGED")
            receipt["attachment_after"] = inspect_attachment(remote, config, expected_columns)
            remote.close()
            remote = None
            receipt["source"] = source
            save(output / "source.json", source)
            if custom_sql is None:
                shutil.copyfile(output / "source.parquet", output / "result.parquet")
                (output / "result.parquet").chmod(0o600)
                result = dict(source)
            else:
                stage = "QUERY_SELECTED_LOCAL_SNAPSHOT"
                # A distinct, credential-free connection has only this source snapshot.
                local = duckdb.connect(":memory:", config=settings)
                local.execute("ATTACH ':memory:' AS purchased")
                local.execute('CREATE SCHEMA "purchased"."results"')
                target = '"purchased"."results".' + qid(config["table_name"])
                local.execute("CREATE TABLE " + target + " AS SELECT * FROM read_parquet(?)",
                              [str(output / "source.parquet")])
                local.execute("SET enable_external_access=false")
                statements = local.extract_statements(custom_sql)
                need(len(statements) == 1 and statements[0].type == duckdb.StatementType.SELECT
                     and not statements[0].named_parameters,
                     "ONE_PARAMETER_FREE_SELECT_REQUIRED")
                result = stream_parquet(local, custom_sql, output / "result.parquet", pq)
                local.close()
                local = None
            stage = "WRITE_COMPLETE_EXPORT"
            write_csv(output / "result.parquet", output / "result.csv", pq)
        result.update({"schema": SCHEMA + ".result",
                       "query_mode": receipt["query_mode"],
                       "query_sha256": digest(actual_sql.encode("utf-8")),
                       "source_publication_id": config["publication_id"],
                       "source_export_id": config["export_id"],
                       "source_rows": source["rows"],
                       "csv_encoding": {"null": r"\N", "binary": "base64:",
                                        "nested": "JSON", "typed_authority": "result.parquet"}})
        save(output / "result.json", result)
        receipt.update({"status": "COMPLETE", "completed_at": datetime.now(timezone.utc).isoformat(),
                        "rows": result["rows"], "columns": result["columns"],
                        "files": [file_descriptor(p, output) for p in sorted(output.rglob("*"))
                                  if p.is_file() and "client-runtime" not in p.relative_to(output).parts]})
        save(output / "receipt.json", receipt)
        return {"ok": True, "status": "COMPLETE", "rows": result["rows"],
                "columns": result["columns"], "publication_id": config["publication_id"],
                "result_parquet": str(output / "result.parquet"),
                "result_csv": str(output / "result.csv"),
                "result_descriptor": str(output / "result.json"),
                "source_parquet": str(output / "source.parquet"),
                "receipt": str(output / "receipt.json"), "output": str(output)}
    except Exception as error:
        # Never stringify a native exception: it can contain bearer-bearing ATTACH SQL.
        code = str(error) if isinstance(error, ClientError) else stage + "_FAILED"
        receipt.update({"status": "FAILED", "stage": stage, "error": code,
                        "finished_at": datetime.now(timezone.utc).isoformat()})
        try:
            save(output / "failure.json", receipt)
        except OSError:
            pass
        return {"ok": False, "status": "FAILED", "error": code, "stage": stage,
                "output": str(output), "failure": str(output / "failure.json")}
    finally:
        token = ""
        with quiet_native():
            for connection in (remote, local):
                if connection is not None:
                    try:
                        connection.close()
                    except Exception:
                        pass


def verify_output(directory):
    root = Path(directory).absolute()
    need(root.is_dir() and not root.is_symlink(), "OUTPUT_DIRECTORY_REQUIRED")
    receipt = read_json(checked_file(root / "receipt.json"))
    need(isinstance(receipt, dict) and receipt.get("schema") == SCHEMA + ".receipt"
         and receipt.get("status") == "COMPLETE", "COMPLETE_RECEIPT_REQUIRED")
    descriptors = receipt.get("files")
    need(isinstance(descriptors, list) and descriptors
         and all(isinstance(x, dict) for x in descriptors), "OUTPUT_MANIFEST_INVALID")
    names = [x.get("name") for x in descriptors]
    need(all(isinstance(name, str) and name and "\\" not in name
             and not name.startswith("/") and all(p not in {"", ".", ".."}
                                                 for p in name.split("/"))
             for name in names)
         and len(set(names)) == len(names), "OUTPUT_MEMBERS_INVALID")
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*")
              if p.is_file() and "client-runtime" not in p.relative_to(root).parts
              and p != root / "receipt.json"}
    need(actual == set(names), "OUTPUT_MEMBERS_CHANGED")
    for item in descriptors:
        path = root / item["name"]
        need(not any(p.is_symlink() for p in [path, *path.parents]
                     if p == root or root in p.parents), "OUTPUT_SYMLINK_REJECTED")
        raw = checked_file(path)
        need(type(item.get("bytes")) is int and item["bytes"] == len(raw)
             and item.get("sha256") == digest(raw), "OUTPUT_MEMBER_CHANGED")
    package = verify_package(root / "package", check_runner=False)
    need(receipt.get("package_manifest_sha256")
         == digest(package["files"]["manifest.json"]), "OUTPUT_PACKAGE_CHANGED")
    for key in ("workspace_id", "service_id", "publication_id", "export_id"):
        need(receipt.get(key) == package["config"][key], "OUTPUT_CONTEXT_CHANGED")
    result = read_json(checked_file(root / "result.json"))
    need(result.get("rows") == receipt.get("rows")
         and result.get("columns") == receipt.get("columns")
         and result.get("query_sha256") == digest(checked_file(root / "query.sql")),
         "OUTPUT_RESULT_CHANGED")
    return {"ok": True, "status": "VERIFIED_OUTPUT", "output": str(root),
            "rows": result["rows"], "columns": result["columns"],
            "publication_id": receipt["publication_id"],
            "receipt_sha256": digest(checked_file(root / "receipt.json")),
            "result_parquet": str(root / "result.parquet")}



def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path,
                        help="Unchanged six-file client handover directory")
    parser.add_argument("--output", type=Path, help="New private output directory")
    parser.add_argument("--query", type=Path,
                        help="One SELECT evaluated on the fully retained local publication")
    parser.add_argument("--inspect", action="store_true",
                        help="Verify complete package offline without a token or dependencies")
    parser.add_argument("--extension-directory", type=Path,
                        help="Existing DuckDB extension cache used by the maintained cohort")
    parser.add_argument("--verify-output", type=Path,
                        help="Verify a complete saved output offline")
    args = parser.parse_args(argv)
    os.umask(0o077)
    try:
        if args.verify_output is not None:
            need(args.package is None and args.output is None and args.query is None
                 and not args.inspect, "SELECT_OUTPUT_VERIFICATION_ONLY")
            outcome = verify_output(args.verify_output)
            print(json.dumps(outcome, ensure_ascii=False, allow_nan=False))
            return 0
        need(args.package is not None, "PACKAGE_DIRECTORY_REQUIRED")
        package = verify_package(args.package)
        if args.inspect:
            need(args.query is None, "INSPECT_DOES_NOT_RUN_CUSTOM_QUERY")
            outcome = {"ok": True, "status": "VERIFIED_OFFLINE",
                       "manifest_sha256": digest(package["files"]["manifest.json"]),
                       "configuration": package["config"],
                       "files": package["manifest"]["files"],
                       "arrow_schema_sha256": digest(package["schema_raw"])}
        else:
            need(args.output is not None, "NEW_OUTPUT_DIRECTORY_REQUIRED")
            custom = None
            if args.query is not None:
                try:
                    custom = checked_file(args.query.absolute()).decode("utf-8")
                except UnicodeError:
                    raise ClientError("QUERY_MUST_BE_UTF8") from None
                token = os.environ.get("RESULT_SERVICE_TOKEN", "")
                need(not token or token not in custom, "TOKEN_MUST_NOT_APPEAR_IN_QUERY")
            output = args.output.absolute()
            need(not output.exists() and not output.is_symlink(),
                 "OUTPUT_ALREADY_EXISTS_USE_NEW_DIRECTORY")
            output.mkdir(mode=0o700, parents=False)
            outcome = receive(package, output, custom,
                              extension_directory=args.extension_directory)
    except Exception as error:
        outcome = {"ok": False, "status": "REJECTED",
                   "error": str(error) if isinstance(error, ClientError)
                   else "PACKAGE_OR_OUTPUT_UNAVAILABLE"}
    print(json.dumps(outcome, ensure_ascii=False, allow_nan=False))
    return 0 if outcome["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
