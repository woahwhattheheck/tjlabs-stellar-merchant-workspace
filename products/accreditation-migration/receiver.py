#!/usr/bin/env python3
"""Original SQLite receiving and complete DOCX form extraction for the migration workbench."""
from __future__ import annotations

import argparse
import base64
import binascii
from collections import defaultdict
import copy
from datetime import date, datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import sqlite3
import sys
import tempfile
from urllib.parse import quote, unquote, urlsplit
import uuid
import xml.etree.ElementTree as ET
from xml.dom import minidom
from xml.parsers.expat import ExpatError
import zipfile

REQUEST_SCHEMA = "tjlabs.accreditation-native-request.v1"
RESULT_SCHEMA = "tjlabs.accreditation-native-result.v1"
SCHEMA_SCHEMA = "tjlabs.accreditation-native-schema.v1"
ERROR_SCHEMA = "tjlabs.accreditation-native-error.v1"
FORM_SCHEMA = "tjlabs.accreditation-docx-form-map.v1"
CONTRACT_SCHEMA = "tjlabs.ianz-data-contract.v1"
META_COLUMNS = ("_native_id", "_external_key", "_project_id", "_native_version")
CANONICAL_TYPES = {"string", "enum", "uri", "datetime", "date", "month", "date-or-month",
                   "integer", "sha256", "relative-path", "foreign-key", "boolean",
                   "array", "object", "decimal-string"}
JSON_TYPES = {"array", "object"}
SAFE_INTEGER = 9007199254740991


class ReceiverError(Exception):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code, self.details = code, details


def need(condition, code, message, **details):
    if not condition:
        raise ReceiverError(code, message, **details)


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def text(value, label, nonempty=True):
    need(isinstance(value, str) and (not nonempty or bool(value)), "TEXT", label + " must be text.")
    try:
        value.encode("utf-8", "strict")
    except UnicodeError as error:
        raise ReceiverError("UNICODE", label + " contains an unpaired surrogate.") from error
    need("\0" not in value, "TEXT", label + " contains a NUL character.")
    return value


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def json_bytes(value):
    return (canonical(value) + "\n").encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "JSON_DUPLICATE", "JSON contains a duplicate member.", member=key)
        result[key] = value
    return result


def parse_json(data, label="JSON"):
    try:
        decoded = data.decode("utf-8", "strict") if isinstance(data, bytes) else data
        value = json.loads(decoded, object_pairs_hook=unique_object,
                           parse_constant=lambda value: (_ for _ in ()).throw(
                               ReceiverError("JSON_NUMBER", "JSON numbers must be finite.", value=value)))
        canonical(value).encode("utf-8", "strict")
        return value
    except (UnicodeError, ValueError, TypeError, RecursionError) as error:
        raise ReceiverError("JSON", label + " is not complete UTF-8 JSON.", reason=str(error)) from error


def relative_path(value):
    value = text(value, "Asset path")
    need(not value.startswith("/") and not re.match(r"^[A-Za-z]:", value)
         and not re.search(r"[\\\x00-\x1f\x7f]", value)
         and all(part not in ("", ".", "..") for part in value.split("/")),
         "PATH", "Use a complete relative POSIX asset path.", path=value)
    return value


def sql_name(value):
    value = text(value, "Native SQL name")
    return '"' + value.replace('"', '""') + '"'


def affinity(declaration):
    value = (declaration or "").upper()
    if "INT" in value:
        return "INTEGER"
    if any(word in value for word in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if not value or "BLOB" in value:
        return "BLOB"
    if any(word in value for word in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


def native_type(field):
    return "INTEGER" if field["type"] in ("boolean", "integer") else "TEXT"


def validate_contract(contract):
    need(isinstance(contract, dict) and contract.get("schema") == CONTRACT_SCHEMA,
         "CONTRACT", "Use the complete original accreditation data contract.")
    entities = contract.get("entities")
    need(isinstance(entities, list) and entities, "CONTRACT", "The original contract needs entities.")
    index = {}
    for entity in entities:
        name = text(entity.get("name"), "Entity")
        need(name not in index and not name.startswith("_tjlabs") and isinstance(entity.get("fields"), list),
             "CONTRACT", "Entity definitions must be unique and complete.", entity=name)
        fields = {}
        for field in entity["fields"]:
            field_name = text(field.get("name"), "Canonical field")
            need(field_name not in fields and field_name not in META_COLUMNS
                 and field.get("type") in CANONICAL_TYPES and isinstance(field.get("required"), bool),
                 "CONTRACT", "Canonical field definition is invalid.", entity=name, field=field_name)
            fields[field_name] = field
        need(fields and isinstance(entity.get("key"), list) and entity["key"]
             and all(key in fields for key in entity["key"]),
             "CONTRACT", "Entity identity fields must exist.", entity=name)
        index[name] = {**entity, "field_index": fields}
    return index


def encode_value(value, field):
    kind, required = field["type"], field["required"]
    if value is None:
        need(not required, "REQUIRED_FIELD", "Required source value is null.", field=field["name"])
        return None
    if kind == "boolean":
        need(isinstance(value, bool), "FIELD_TYPE", "A boolean must remain a boolean.", field=field["name"])
        return int(value)
    if kind == "integer":
        need(isinstance(value, int) and not isinstance(value, bool) and abs(value) <= SAFE_INTEGER,
             "FIELD_TYPE", "Use an exact JSON integer within the workbench's safe range.", field=field["name"])
        return value
    if kind in JSON_TYPES:
        need(isinstance(value, list if kind == "array" else dict), "FIELD_TYPE",
             "Use the original " + kind + " value.", field=field["name"])
        return canonical(value)
    value = text(value, field["name"], nonempty=required)
    if not value and not required:
        return value
    if kind == "sha256":
        need(bool(re.fullmatch(r"[0-9a-fA-F]{64}", value)), "FIELD_TYPE", "Keep a complete SHA-256 value.", field=field["name"])
    elif kind == "relative-path":
        relative_path(value)
    elif kind == "uri":
        need(bool(re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", value)), "FIELD_TYPE", "Use the original absolute URI.", field=field["name"])
    elif kind in ("date", "month", "date-or-month"):
        try:
            if kind == "month" or kind == "date-or-month" and re.fullmatch(r"\d{4}-\d{2}", value):
                need(bool(re.fullmatch(r"\d{4}-\d{2}", value)), "FIELD_TYPE", "Retain YYYY-MM month precision.", field=field["name"])
                date.fromisoformat(value + "-01")
            else:
                need(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)), "FIELD_TYPE", "Retain the original YYYY-MM-DD date.", field=field["name"])
                date.fromisoformat(value)
        except ValueError as error:
            raise ReceiverError("FIELD_TYPE", "Original date is not valid.", field=field["name"]) from error
    elif kind == "datetime":
        try:
            need(len(value) > 10, "FIELD_TYPE", "Retain the original date and time.", field=field["name"])
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as error:
            raise ReceiverError("FIELD_TYPE", "Original date-time is not valid.", field=field["name"]) from error
    elif kind == "decimal-string":
        need(len(value) <= 2048 and bool(re.fullmatch(r"[+-]?(?:\d+(?:\.\d+)?|\d+/\d+)", value)),
             "FIELD_TYPE", "Keep exact decimal or integer-fraction text.", field=field["name"])
        if "/" in value:
            need(int(value.split("/", 1)[1]) != 0, "FIELD_TYPE", "A rational denominator cannot be zero.", field=field["name"])
    return value


def decode_value(value, field):
    if value is None:
        return None
    kind = field["type"] if field else None
    if kind in JSON_TYPES:
        need(isinstance(value, str), "NATIVE_VALUE", "Native JSON value is not TEXT.")
        result = parse_json(value, "Native JSON field")
        need(isinstance(result, list if kind == "array" else dict), "NATIVE_VALUE", "Native JSON type differs.")
        return result
    if kind == "boolean":
        need(isinstance(value, int) and value in (0, 1), "NATIVE_VALUE", "Native boolean is not zero or one.")
        return bool(value)
    if kind == "integer":
        need(isinstance(value, int) and abs(value) <= SAFE_INTEGER, "NATIVE_VALUE", "Native integer cannot round-trip through the workbench.")
    if kind and kind not in ("integer", "boolean"):
        need(isinstance(value, str), "NATIVE_VALUE", "Native text value changed its original representation.")
    return portable_value(value)


def portable_value(value):
    if isinstance(value, bytes):
        return {"encoding": "base64", "bytes": len(value), "base64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, float) and not math.isfinite(value):
        return {"native_type": "REAL", "value": repr(value)}
    return value


def connect(database, create=False):
    path = Path(database).expanduser().resolve()
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(path), isolation_level=None, timeout=30)
    else:
        need(path.is_file(), "DATABASE", "Select the existing native database.", path=str(path))
        connection = sqlite3.connect("file:" + quote(str(path), safe="/:") + "?mode=rw",
                                     uri=True, isolation_level=None, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def table_columns(connection, table):
    found = connection.execute("SELECT type FROM sqlite_master WHERE name = ?", (table,)).fetchone()
    need(found is not None and found["type"] == "table", "NATIVE_TABLE", "Select an actual native table.", table=table)
    return [dict(row) for row in connection.execute("PRAGMA table_xinfo(" + sql_name(table) + ")")]


def meta(connection, key):
    row = connection.execute("SELECT value FROM _tjlabs_meta WHERE key = ?", (key,)).fetchone()
    need(row is not None, "DATABASE", "The native database has not been described with its original contract.", field=key)
    return row["value"]


def set_meta(connection, key, value):
    connection.execute("INSERT INTO _tjlabs_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                       (key, value))


def stored_contract(connection):
    try:
        contract = parse_json(meta(connection, "contract"), "Retained native contract")
    except sqlite3.OperationalError as error:
        raise ReceiverError("DATABASE", "Run describe with the original contract to initialize this database.") from error
    return contract, validate_contract(contract)


def initialize(connection, contract, original_bytes):
    entities = validate_contract(contract)
    connection.execute("BEGIN IMMEDIATE")
    try:
        statements = [
            "CREATE TABLE IF NOT EXISTS _tjlabs_meta(key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS _tjlabs_contracts(sha256 TEXT PRIMARY KEY NOT NULL,original BLOB NOT NULL,received_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS _tjlabs_entity_tables(entity TEXT NOT NULL,table_name TEXT PRIMARY KEY NOT NULL)",
            "CREATE TABLE IF NOT EXISTS _tjlabs_project_tables(project_id TEXT NOT NULL,entity TEXT NOT NULL,table_name TEXT NOT NULL,columns_json TEXT NOT NULL,mapping_id TEXT NOT NULL,mapping_version INTEGER NOT NULL,PRIMARY KEY(project_id,entity,table_name))",
            "CREATE TABLE IF NOT EXISTS _tjlabs_projects(project_id TEXT PRIMARY KEY NOT NULL,project_revision TEXT NOT NULL,mapping_json TEXT NOT NULL,updated_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS _tjlabs_mappings(mapping_id TEXT NOT NULL,version INTEGER NOT NULL,specification TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(mapping_id,version))",
            "CREATE TABLE IF NOT EXISTS _tjlabs_requests(request_id TEXT PRIMARY KEY NOT NULL,request_sha256 TEXT NOT NULL,project_id TEXT NOT NULL,project_revision TEXT NOT NULL,original_request BLOB NOT NULL,result_json TEXT NOT NULL,committed_at TEXT NOT NULL)",
            "CREATE TABLE IF NOT EXISTS _tjlabs_relations(project_id TEXT NOT NULL,from_entity TEXT NOT NULL,from_table TEXT NOT NULL,from_external_key TEXT NOT NULL,from_native_id TEXT NOT NULL,field TEXT NOT NULL,target_entity TEXT NOT NULL,target_table TEXT NOT NULL,target_external_key TEXT NOT NULL,target_native_id TEXT NOT NULL,request_id TEXT NOT NULL,PRIMARY KEY(project_id,from_entity,from_native_id,field,target_entity,target_native_id))",
            "CREATE TABLE IF NOT EXISTS _tjlabs_assets(project_id TEXT NOT NULL,path TEXT NOT NULL,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,media_type TEXT NOT NULL,visibility TEXT NOT NULL,content BLOB NOT NULL,request_id TEXT NOT NULL,PRIMARY KEY(project_id,path))",
            "CREATE TABLE IF NOT EXISTS _tjlabs_asset_associations(project_id TEXT NOT NULL,path TEXT NOT NULL,entity TEXT NOT NULL,table_name TEXT NOT NULL,external_key TEXT NOT NULL,native_id TEXT NOT NULL,field TEXT NOT NULL,request_id TEXT NOT NULL,PRIMARY KEY(project_id,path,entity,native_id,field),FOREIGN KEY(project_id,path) REFERENCES _tjlabs_assets(project_id,path))",
        ]
        for statement in statements:
            connection.execute(statement)
        existing = connection.execute("SELECT value FROM _tjlabs_meta WHERE key='environment_id'").fetchone()
        if existing is None:
            set_meta(connection, "environment_id", "sqlite-" + uuid.uuid4().hex)
            set_meta(connection, "created_at", now())
        prior = connection.execute("SELECT value FROM _tjlabs_meta WHERE key='contract'").fetchone()
        previous = validate_contract(parse_json(prior["value"])) if prior else {}
        need(set(previous).issubset(entities), "CONTRACT_MIGRATION",
             "Retain existing canonical entities and their original native records.")
        for name, entity in entities.items():
            if name in previous:
                for key, field in previous[name]["field_index"].items():
                    need(key in entity["field_index"] and entity["field_index"][key]["type"] == field["type"],
                         "CONTRACT_MIGRATION", "Retain existing canonical fields and their native types.", entity=name, field=key)
            existing_table = connection.execute("SELECT type FROM sqlite_master WHERE name=?", (name,)).fetchone()
            if existing_table is None:
                definitions = ['"_native_id" TEXT PRIMARY KEY NOT NULL',
                               '"_external_key" TEXT NOT NULL', '"_project_id" TEXT NOT NULL',
                               '"_native_version" INTEGER NOT NULL CHECK("_native_version">0)']
                for field in entity["fields"]:
                    definition = sql_name(field["name"]) + " " + native_type(field)
                    if field["required"]:
                        definition += " NOT NULL"
                    if field["type"] == "boolean":
                        definition += " CHECK(" + sql_name(field["name"]) + " IN (0,1))"
                    definitions.append(definition)
                definitions.append('UNIQUE("_project_id","_external_key")')
                connection.execute("CREATE TABLE " + sql_name(name) + "(" + ",".join(definitions) + ")")
            observed = {column["name"]: column for column in table_columns(connection, name)}
            need(all(key in observed for key in META_COLUMNS), "NATIVE_SCHEMA",
                 "Existing native table lacks its separate receiving identity columns.", table=name)
            for field in entity["fields"]:
                if field["name"] not in observed:
                    has_rows = connection.execute("SELECT 1 FROM " + sql_name(name) + " LIMIT 1").fetchone()
                    need(not field["required"] or has_rows is None, "CONTRACT_MIGRATION",
                         "A new required field needs actual values for existing native records.", table=name, field=field["name"])
                    definition = sql_name(field["name"]) + " " + native_type(field) + (" NOT NULL" if field["required"] else "")
                    connection.execute("ALTER TABLE " + sql_name(name) + " ADD COLUMN " + definition)
                elif field["required"]:
                    need(bool(observed[field["name"]]["notnull"]), "NATIVE_SCHEMA",
                         "Existing canonical required field is nullable; select its explicit native mapping.", table=name, field=field["name"])
            binding = connection.execute("SELECT entity FROM _tjlabs_entity_tables WHERE table_name=?", (name,)).fetchone()
            need(binding is None or binding["entity"] == name, "NATIVE_SCHEMA", "Native table already belongs to another entity.", table=name)
            connection.execute("INSERT OR IGNORE INTO _tjlabs_entity_tables(entity,table_name) VALUES(?,?)", (name, name))
        set_meta(connection, "contract", canonical(contract))
        set_meta(connection, "target_product", "SQLite")
        connection.execute("INSERT OR IGNORE INTO _tjlabs_contracts VALUES(?,?,?)", (digest(original_bytes), original_bytes, now()))
        connection.commit()
    except Exception:
        connection.rollback()
        raise


def describe_connection(connection):
    contract, entities = stored_contract(connection)
    tables = []
    for binding in connection.execute("SELECT entity,table_name FROM _tjlabs_entity_tables ORDER BY entity,table_name"):
        entity, table = binding["entity"], binding["table_name"]
        fields = entities[entity]["field_index"]
        columns = []
        for observed in table_columns(connection, table):
            if observed["name"] in META_COLUMNS:
                canonical_name, kind = None, "integer" if observed["name"] == "_native_version" else "string"
            else:
                canonical_name = observed["name"] if observed["name"] in fields else None
                kind = fields[canonical_name]["type"] if canonical_name else "native"
            columns.append({"name": observed["name"], "type": kind, "canonical": canonical_name,
                            "nullable": not bool(observed["notnull"] or observed["pk"]),
                            "native_type": observed["type"], "native_primary_key": observed["pk"],
                            "native_default": observed["dflt_value"], "native_hidden": observed.get("hidden", 0)})
        tables.append({"entity": entity, "table": table, "external_key_field": "_external_key", "columns": columns})
    version = digest(canonical({"contract": contract, "tables": tables}).encode("utf-8"))
    return {"schema": SCHEMA_SCHEMA, "target_product": "SQLite",
            "target_environment_id": meta(connection, "environment_id"),
            "schema_version": "sqlite-" + version, "tables": tables,
            "counts": {"entities": len(entities), "tables": len(tables),
                       "canonical_fields": sum(len(entity["fields"]) for entity in entities.values())}}


def decode_record(row, columns, fields):
    values, issues = {}, []
    for key in row.keys():
        if key in META_COLUMNS:
            continue
        canonical_name = columns.get(key, key if key in fields else None)
        field = fields.get(canonical_name) if canonical_name else None
        try:
            values[key] = decode_value(row[key], field)
        except (ReceiverError, ValueError, TypeError) as error:
            values[key] = portable_value(row[key])
            issues.append({"column": key, "canonical": canonical_name, "reason": str(error)})
    result = {"external_key": row["_external_key"], "native_id": row["_native_id"],
              "native_version": row["_native_version"], "values": values}
    if issues:
        result["decoding_issues"] = issues
    return result


def project_tables(connection, project_id):
    result = {}
    for row in connection.execute("SELECT entity,table_name FROM _tjlabs_entity_tables ORDER BY entity,table_name"):
        result[(row["entity"], row["table_name"])] = {}
    for row in connection.execute("SELECT * FROM _tjlabs_project_tables WHERE project_id=? ORDER BY entity,table_name", (project_id,)):
        result[(row["entity"], row["table_name"])] = {column["name"]: column["canonical"] for column in parse_json(row["columns_json"])}
    return result


def extract_connection(connection, project_id, status="EXTRACTED", request_id=None, request_sha256=None):
    _, entities = stored_contract(connection)
    tables, record_count, issue_count = [], 0, 0
    for (entity, table), columns in project_tables(connection, project_id).items():
        rows = connection.execute("SELECT * FROM " + sql_name(table) + ' WHERE "_project_id"=? ORDER BY "_external_key","_native_id"', (project_id,)).fetchall()
        records = [decode_record(row, columns, entities[entity]["field_index"]) for row in rows]
        record_count += len(records)
        issue_count += sum(len(record.get("decoding_issues", [])) for record in records)
        tables.append({"entity": entity, "table": table, "records": records})
    relations = [dict(row) for row in connection.execute("SELECT from_entity,from_table,from_external_key,from_native_id,field,target_entity,target_table,target_external_key,target_native_id,request_id FROM _tjlabs_relations WHERE project_id=? ORDER BY from_entity,from_external_key,field,target_entity,target_external_key", (project_id,))]
    assets = []
    for row in connection.execute("SELECT * FROM _tjlabs_assets WHERE project_id=? ORDER BY path", (project_id,)):
        content = bytes(row["content"])
        need(len(content) == row["bytes"] and digest(content) == row["sha256"],
             "NATIVE_ASSET_IDENTITY", "Retained native asset bytes changed.", path=row["path"])
        associations = [dict(item) for item in connection.execute("SELECT entity,table_name AS 'table',external_key,native_id,field FROM _tjlabs_asset_associations WHERE project_id=? AND path=? ORDER BY entity,external_key,field", (project_id, row["path"]))]
        assets.append({"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"],
                       "media_type": row["media_type"], "visibility": row["visibility"],
                       "base64": base64.b64encode(content).decode("ascii"), "associations": associations})
    project = connection.execute("SELECT * FROM _tjlabs_projects WHERE project_id=?", (project_id,)).fetchone()
    described = describe_connection(connection)
    return {"schema": RESULT_SCHEMA, "request_id": request_id, "request_sha256": request_sha256,
            "project_id": project_id, "project_revision": project["project_revision"] if project else None,
            "status": status, "target_product": "SQLite",
            "target_environment_id": described["target_environment_id"], "schema_version": described["schema_version"],
            "mapping": parse_json(project["mapping_json"]) if project else None,
            "tables": tables, "relations": relations, "assets": assets,
            "counts": {"tables": len(tables), "records": record_count, "relations": len(relations),
                       "assets": len(assets), "asset_bytes": sum(asset["bytes"] for asset in assets),
                       "decoding_issues": issue_count}}


def version_value(value):
    if isinstance(value, str) and re.fullmatch(r"[1-9]\d*", value):
        value = int(value)
    need(isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= SAFE_INTEGER,
         "NATIVE_VERSION", "Use the original returned native version.")
    return value


def apply_request(connection, raw):
    request = parse_json(raw, "Original request")
    need(isinstance(request, dict) and request.get("schema") == REQUEST_SCHEMA,
         "REQUEST", "Use the complete frozen native request.")
    request_id = text(request.get("request_id"), "Original request ID")
    project_id = text(request.get("project_id"), "Original project ID")
    project_revision = text(request.get("project_revision"), "Original project revision")
    request_sha = digest(raw)
    connection.execute("BEGIN IMMEDIATE")
    try:
        _, entities = stored_contract(connection)
        saved = connection.execute("SELECT request_sha256,result_json FROM _tjlabs_requests WHERE request_id=?", (request_id,)).fetchone()
        if saved is not None:
            need(saved["request_sha256"] == request_sha, "REQUEST_ID_REUSED",
                 "Original request ID was already committed with different exact bytes.", request_id=request_id,
                 original_sha256=saved["request_sha256"], received_sha256=request_sha)
            result = parse_json(saved["result_json"], "Original saved native result")
            connection.commit()
            return result
        mapping = request.get("mapping")
        need(isinstance(mapping, dict), "MAPPING", "The request needs its saved original mapping.")
        mapping_id = text(mapping.get("mapping_id"), "Mapping ID")
        mapping_version = version_value(mapping.get("version"))
        need(mapping.get("target_product") == "SQLite" and mapping.get("target_environment_id") == meta(connection, "environment_id"),
             "TARGET_IDENTITY", "The frozen mapping names a different native target.",
             actual_target_environment_id=meta(connection, "environment_id"))
        table_requests = request.get("tables")
        need(isinstance(table_requests, list), "REQUEST_TABLES", "The request needs complete selected table records.")
        relations, assets = request.get("relations"), request.get("assets")
        need(isinstance(relations, list) and isinstance(assets, list), "REQUEST", "Keep complete relation and asset arrays.")
        specifications, by_entity = [], {}
        for table_request in table_requests:
            need(isinstance(table_request, dict), "REQUEST_TABLES", "Each selected table must be an object.")
            entity = table_request.get("entity")
            need(entity in entities and entity not in by_entity, "REQUEST_ENTITY", "Select each original entity once.", entity=entity)
            table = text(table_request.get("table"), "Native table")
            need(not table.startswith("_tjlabs") and table_request.get("external_key_field") == "_external_key",
                 "NATIVE_SCHEMA", "Keep the receiving identity columns separate from source fields.", table=table)
            actual = {column["name"]: column for column in table_columns(connection, table)}
            need(all(name in actual for name in META_COLUMNS), "NATIVE_SCHEMA", "Selected table lacks native receiving identities.", table=table)
            registered = connection.execute("SELECT entity FROM _tjlabs_entity_tables WHERE table_name=?", (table,)).fetchone()
            need(registered is None or registered["entity"] == entity, "NATIVE_SCHEMA",
                 "Selected table is bound to another canonical entity.", table=table)
            columns = table_request.get("columns")
            need(isinstance(columns, list) and columns, "MAPPING", "Select complete native field mappings.", entity=entity)
            mapped, native_names = {}, set()
            for column in columns:
                need(isinstance(column, dict), "MAPPING", "Each field mapping must be an object.")
                canonical_name, name = column.get("canonical"), column.get("name")
                field = entities[entity]["field_index"].get(canonical_name)
                need(field is not None and canonical_name not in mapped and name not in native_names
                     and name in actual and name not in META_COLUMNS and not actual[name].get("hidden")
                     and column.get("type") == field["type"], "MAPPING",
                     "Field mapping differs from the original contract or actual native schema.", entity=entity, field=canonical_name, native_column=name)
                native_affinity = affinity(actual[name]["type"])
                compatible = native_affinity in ({"INTEGER", "NUMERIC", "BLOB"} if field["type"] in ("integer", "boolean") else {"TEXT", "BLOB"})
                need(compatible, "NATIVE_REPRESENTATION", "Native column affinity would change the original value representation.",
                     entity=entity, field=canonical_name, native_column=name, native_type=actual[name]["type"])
                mapped[canonical_name] = {**column, "field": field}
                native_names.add(name)
            need(isinstance(table_request.get("records"), list), "REQUEST_RECORDS", "Keep the complete selected original records.", entity=entity)
            by_entity[entity] = {"table": table, "columns": mapped, "native_names": native_names, "request": table_request}
            specifications.append({"entity": entity, "table": table, "external_key_field": "_external_key",
                                   "columns": sorted([{"canonical": row["canonical"], "name": row["name"], "type": row["type"]} for row in columns], key=lambda row: row["canonical"])})
        specification = canonical({"mapping": mapping, "tables": sorted(specifications, key=lambda value: value["entity"])})
        existing_mapping = connection.execute("SELECT specification FROM _tjlabs_mappings WHERE mapping_id=? AND version=?", (mapping_id, mapping_version)).fetchone()
        need(existing_mapping is None or existing_mapping["specification"] == specification,
             "MAPPING_VERSION_REUSED", "Saved mapping version already has different native table or field bindings.",
             mapping_id=mapping_id, version=mapping_version)
        connection.execute("INSERT OR IGNORE INTO _tjlabs_mappings VALUES(?,?,?,?)", (mapping_id, mapping_version, specification, now()))
        written, changes = {}, {"inserted": 0, "updated": 0}
        for entity, binding in by_entity.items():
            table, mapped = binding["table"], binding["columns"]
            connection.execute("INSERT OR IGNORE INTO _tjlabs_entity_tables(entity,table_name) VALUES(?,?)", (entity, table))
            column_list = [{"canonical": value["canonical"], "name": value["name"], "type": value["type"]} for value in mapped.values()]
            connection.execute("INSERT INTO _tjlabs_project_tables VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,entity,table_name) DO UPDATE SET columns_json=excluded.columns_json,mapping_id=excluded.mapping_id,mapping_version=excluded.mapping_version",
                               (project_id, entity, table, canonical(column_list), mapping_id, mapping_version))
            for record in binding["request"]["records"]:
                need(isinstance(record, dict), "REQUEST_RECORD", "Each original record must be an object.", entity=entity)
                external_key = text(record.get("external_key"), "Original external key")
                key = (entity, external_key)
                need(key not in written, "DUPLICATE_EXTERNAL_KEY", "The request repeats an original external key.", entity=entity, external_key=external_key)
                values = record.get("values")
                need(isinstance(values, dict) and set(values).issubset(binding["native_names"]),
                     "RECORD_FIELDS", "Record values must use the selected actual native columns.", entity=entity, external_key=external_key)
                mapped_by_name = {column["name"]: column for column in mapped.values()}
                encoded = {name: encode_value(value, mapped_by_name[name]["field"]) for name, value in values.items()}
                existing = connection.execute("SELECT * FROM " + sql_name(table) + ' WHERE "_project_id"=? AND "_external_key"=?',
                                              (project_id, external_key)).fetchall()
                need(len(existing) <= 1, "NATIVE_DUPLICATE_KEY", "Native target contains duplicate original external keys.",
                     entity=entity, external_key=external_key)
                native_id, expected_version = record.get("native_id"), record.get("expected_native_version")
                if existing:
                    row = existing[0]
                    need(native_id is not None and expected_version is not None, "NATIVE_VERSION_REQUIRED",
                         "Existing native row requires its original ID and version before update.", entity=entity,
                         external_key=external_key, native_id=row["_native_id"], native_version=row["_native_version"])
                    expected_version = version_value(expected_version)
                    need(native_id == row["_native_id"] and expected_version == row["_native_version"],
                         "NATIVE_VERSION_CONFLICT", "The native row changed after the saved request was prepared.",
                         entity=entity, external_key=external_key, actual_native_id=row["_native_id"],
                         actual_native_version=row["_native_version"], expected_native_version=expected_version)
                    native_version = expected_version + 1
                    need(native_version <= SAFE_INTEGER, "NATIVE_VERSION", "Native version exceeds the workbench integer range.")
                    updates = [sql_name(name) + "=?" for name in encoded] + ['"_native_version"=?']
                    cursor = connection.execute("UPDATE " + sql_name(table) + " SET " + ",".join(updates) +
                                                ' WHERE "_native_id"=? AND "_project_id"=? AND "_native_version"=?',
                                                tuple(encoded.values()) + (native_version, native_id, project_id, expected_version))
                    need(cursor.rowcount == 1, "NATIVE_VERSION_CONFLICT", "Native update did not match one original record.")
                    changes["updated"] += 1
                else:
                    need(native_id is None and expected_version is None, "NATIVE_ID_UNKNOWN",
                         "New native rows must be created without an invented native ID or version.", entity=entity, external_key=external_key)
                    native_id, native_version = uuid.uuid4().hex, 1
                    names = list(META_COLUMNS) + list(encoded)
                    connection.execute("INSERT INTO " + sql_name(table) + "(" + ",".join(map(sql_name, names)) +
                                       ") VALUES(" + ",".join("?" for _ in names) + ")",
                                       (native_id, external_key, project_id, native_version) + tuple(encoded.values()))
                    changes["inserted"] += 1
                actual = connection.execute("SELECT * FROM " + sql_name(table) + ' WHERE "_native_id"=? AND "_project_id"=?',
                                            (native_id, project_id)).fetchone()
                need(actual is not None and actual["_external_key"] == external_key
                     and actual["_native_id"] == native_id and actual["_project_id"] == project_id
                     and actual["_native_version"] == native_version,
                     "NATIVE_RESULT", "Native write changed its original record or version identity.",
                     entity=entity, external_key=external_key)
                for name, expected in values.items():
                    observed = decode_value(actual[name], mapped_by_name[name]["field"])
                    need(canonical(observed) == canonical(expected), "NATIVE_VALUE_CHANGED",
                         "Native storage changed an original field value.", entity=entity, external_key=external_key, native_column=name)
                written[key] = {"table": table, "native_id": native_id, "native_version": native_version,
                                "present_fields": {mapped_by_name[name]["canonical"] for name in values}}
        def resolve(entity, external_key):
            need(entity in entities, "RELATION_ENTITY", "Association names an unknown original entity.", entity=entity)
            external_key = text(external_key, "Association external key")
            if (entity, external_key) in written:
                return written[(entity, external_key)]
            choices = [by_entity[entity]["table"]] if entity in by_entity else [
                row["table_name"] for row in connection.execute("SELECT table_name FROM _tjlabs_project_tables WHERE project_id=? AND entity=?", (project_id, entity))]
            if not choices:
                choices = [entity]
            found = []
            for table in set(choices):
                for row in connection.execute("SELECT * FROM " + sql_name(table) + ' WHERE "_project_id"=? AND "_external_key"=?', (project_id, external_key)):
                    found.append({"table": table, "native_id": row["_native_id"], "native_version": row["_native_version"]})
            need(len(found) == 1, "RELATION_TARGET", "Association must resolve to one actual native record.",
                 entity=entity, external_key=external_key, matches=len(found))
            return found[0]
        # Replace only explicitly supplied source fields on records protected by
        # this request's native version. Unrelated existing associations remain.
        for (entity, external_key), row in written.items():
            for field in row["present_fields"]:
                connection.execute("DELETE FROM _tjlabs_relations WHERE project_id=? AND from_entity=? AND from_native_id=? AND field=?",
                                   (project_id, entity, row["native_id"], field))
        relation_keys = set()
        for relation in relations:
            need(isinstance(relation, dict), "RELATION", "Each association must be an object.")
            source_entity, source_key, field = relation.get("from_entity"), relation.get("from_external_key"), relation.get("field")
            target_entity, target_key = relation.get("target_entity"), relation.get("target_external_key")
            need((source_entity, source_key) in written and field in entities[source_entity]["field_index"]
                 and field in written[(source_entity, source_key)]["present_fields"],
                 "RELATION_SOURCE", "Association source must be an explicitly written original field.", entity=source_entity, field=field)
            left, right = resolve(source_entity, source_key), resolve(target_entity, target_key)
            relation_key = (source_entity, source_key, field, target_entity, target_key)
            need(relation_key not in relation_keys, "RELATION_DUPLICATE", "The request repeats an association.")
            relation_keys.add(relation_key)
            connection.execute("INSERT INTO _tjlabs_relations VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                               (project_id, source_entity, left["table"], source_key, left["native_id"], field,
                                target_entity, right["table"], target_key, right["native_id"], request_id))
        asset_paths = set()
        for asset in assets:
            need(isinstance(asset, dict), "ASSET", "Each original asset must be an object.")
            path = relative_path(asset.get("path"))
            need(path not in asset_paths, "ASSET_DUPLICATE", "The request repeats an asset path.", path=path)
            asset_paths.add(path)
            encoded = text(asset.get("base64"), "Original asset base64", nonempty=False)
            try:
                content = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as error:
                raise ReceiverError("ASSET_BASE64", "Original asset base64 is not complete.", path=path) from error
            need(base64.b64encode(content).decode("ascii") == encoded and asset.get("bytes") == len(content)
                 and isinstance(asset.get("bytes"), int) and not isinstance(asset.get("bytes"), bool)
                 and asset.get("sha256") == digest(content), "ASSET_IDENTITY",
                 "Original asset byte count or SHA-256 differs.", path=path)
            media_type, visibility = text(asset.get("media_type"), "Original media type"), text(asset.get("visibility"), "Original asset visibility")
            associations = asset.get("associations")
            need(isinstance(associations, list), "ASSET_ASSOCIATIONS", "Keep complete original asset associations.", path=path)
            previous = connection.execute("SELECT sha256 FROM _tjlabs_assets WHERE project_id=? AND path=?", (project_id, path)).fetchone()
            need(previous is None or previous["sha256"] == asset["sha256"], "ASSET_PATH_REUSED",
                 "A changed original asset needs its own edition path; preserve the earlier bytes.", path=path)
            connection.execute("INSERT INTO _tjlabs_assets VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(project_id,path) DO UPDATE SET media_type=excluded.media_type,visibility=excluded.visibility,request_id=excluded.request_id",
                               (project_id, path, asset["sha256"], len(content), media_type, visibility, content, request_id))
            connection.execute("DELETE FROM _tjlabs_asset_associations WHERE project_id=? AND path=?", (project_id, path))
            association_keys = set()
            for association in associations:
                need(isinstance(association, dict), "ASSET_ASSOCIATION", "Each original asset association must be an object.", path=path)
                entity, external_key, field = association.get("entity"), association.get("external_key"), association.get("field")
                need(entity in entities and field in entities[entity]["field_index"], "ASSET_ASSOCIATION", "Asset association names an unknown field.", path=path)
                native = resolve(entity, external_key)
                key = (entity, external_key, field)
                need(key not in association_keys, "ASSET_ASSOCIATION", "The request repeats an asset association.", path=path)
                association_keys.add(key)
                connection.execute("INSERT INTO _tjlabs_asset_associations VALUES(?,?,?,?,?,?,?,?)",
                                   (project_id, path, entity, native["table"], external_key, native["native_id"], field, request_id))
        connection.execute("INSERT INTO _tjlabs_projects VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET project_revision=excluded.project_revision,mapping_json=excluded.mapping_json,updated_at=excluded.updated_at",
                           (project_id, project_revision, canonical(mapping), now()))
        result = extract_connection(connection, project_id, status="APPLIED", request_id=request_id, request_sha256=request_sha)
        result["changes"] = changes
        result_text = canonical(result)
        connection.execute("INSERT INTO _tjlabs_requests VALUES(?,?,?,?,?,?,?)",
                           (request_id, request_sha, project_id, project_revision, raw, result_text, now()))
        connection.commit()
        return result
    except Exception:
        connection.rollback()
        raise


def lookup_request(connection, request_id):
    stored_contract(connection)
    row = connection.execute("SELECT result_json FROM _tjlabs_requests WHERE request_id=?", (text(request_id, "Original request ID"),)).fetchone()
    need(row is not None, "REQUEST_NOT_FOUND", "No committed native request has this original ID.", request_id=request_id)
    return parse_json(row["result_json"], "Original saved native result")


WORD_URIS = {"http://schemas.openxmlformats.org/wordprocessingml/2006/main",
             "http://purl.oclc.org/ooxml/wordprocessingml/main"}
NAMESPACES = {
    "http://schemas.openxmlformats.org/wordprocessingml/2006/main": "w",
    "http://purl.oclc.org/ooxml/wordprocessingml/main": "w",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships": "r",
    "http://purl.oclc.org/ooxml/officeDocument/relationships": "r",
    "http://schemas.microsoft.com/office/word/2010/wordml": "w14",
    "http://schemas.microsoft.com/office/word/2012/wordml": "w15",
    "http://schemas.microsoft.com/office/word/2015/wordml/symex": "w16se",
    "http://schemas.openxmlformats.org/drawingml/2006/main": "a",
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing": "wp",
    "http://schemas.openxmlformats.org/markup-compatibility/2006": "mc",
    "urn:schemas-microsoft-com:vml": "v",
    "http://schemas.openxmlformats.org/package/2006/relationships": "rel",
    "http://schemas.openxmlformats.org/package/2006/content-types": "ct",
    "http://schemas.openxmlformats.org/package/2006/metadata/core-properties": "cp",
    "http://purl.org/dc/elements/1.1/": "dc",
    "http://purl.org/dc/terms/": "dcterms",
    "http://www.w3.org/XML/1998/namespace": "xml",
}


def tag_parts(tag):
    if tag.startswith("{"):
        namespace, local = tag[1:].split("}", 1)
        return namespace, local
    return "", tag


def local_name(element):
    return tag_parts(element.tag)[1]


def word(element, name):
    namespace, local = tag_parts(element.tag)
    return namespace in WORD_URIS and local == name


def child(element, name):
    if element is None:
        return None
    return next((node for node in element if local_name(node) == name), None)


def attr(element, name, default=None):
    if element is None:
        return default
    return next((value for key, value in element.attrib.items() if tag_parts(key)[1] == name), default)


def val(element, name, default=None):
    return attr(child(element, name), "val", default)


def xml_text(element):
    return ET.tostring(element, encoding="unicode") if element is not None else None


def property_tree(element):
    if element is None:
        return None
    return {"name": element.tag, "attributes": dict(element.attrib),
            "text": element.text, "tail": element.tail,
            "children": [property_tree(node) for node in element]}


def visible_text(element, skip_nested_paragraphs=False):
    pieces = []
    def visit(node, first=False):
        if not first and skip_nested_paragraphs and word(node, "p"):
            return
        if word(node, "del") or word(node, "moveFrom"):
            return
        if word(node, "t"):
            pieces.append(node.text or "")
        elif word(node, "tab"):
            pieces.append("\t")
        elif word(node, "br") or word(node, "cr"):
            pieces.append("\n")
        elif word(node, "noBreakHyphen"):
            pieces.append("\u2011")
        elif word(node, "softHyphen"):
            pieces.append("\u00ad")
        elif word(node, "sym"):
            # The original font/code is retained in the run events; do not
            # substitute a guessed character from a private symbol font.
            pass
        else:
            for nested in node:
                visit(nested)
    visit(element, True)
    return "".join(pieces)


def parse_xml(data, path):
    need(not re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data, re.I), "DOCX_XML_DECLARATION",
         "The source XML contains a declaration outside the DOCX part contract.", part=path)
    try:
        declared = []
        parser = ET.iterparse(io.BytesIO(data), events=("start-ns", "end"))
        for event, item in parser:
            if event == "start-ns":
                declared.append({"prefix": item[0], "uri": item[1]})
        return parser.root, declared
    except ET.ParseError as error:
        raise ReceiverError("DOCX_XML", "An original XML part cannot be parsed.", part=path, reason=str(error)) from error


def relationship_source(path):
    if path == "_rels/.rels":
        return ""
    parts = PurePosixPath(path).parts
    if len(parts) >= 2 and parts[-2] == "_rels" and parts[-1].endswith(".rels"):
        return "/".join(parts[:-2] + (parts[-1][:-5],))
    return None


def relationship_target(source_part, target):
    parsed = urlsplit(target)
    need(not parsed.scheme and not parsed.netloc and "\\" not in parsed.path, "DOCX_RELATIONSHIP",
         "An internal relationship target is not a package-relative path.", part=source_part, target=target)
    path = unquote(parsed.path)
    if not path:
        resolved = source_part
    elif path.startswith("/"):
        resolved = posixpath.normpath(path[1:])
    else:
        resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source_part), path))
    relative_path(resolved)
    return resolved, parsed.fragment


def analyse_word_part(path, root, declared, relationships):
    namespaces = dict(NAMESPACES)
    for item in declared:
        if item["uri"] not in namespaces:
            namespaces[item["uri"]] = item["prefix"] or "ns" + str(len(namespaces))
    def qualified(tag):
        namespace, name = tag_parts(tag)
        return namespaces.get(namespace, "{" + namespace + "}") + ":" + name if namespace else name
    parents, locations, order = {}, {}, []
    def index(node, location):
        locations[id(node)] = path + "#" + location
        order.append(node)
        counts = defaultdict(int)
        for nested in node:
            parents[id(nested)] = node
            counts[nested.tag] += 1
            index(nested, location + "/" + qualified(nested.tag) + "[" + str(counts[nested.tag]) + "]")
    index(root, "/" + qualified(root.tag) + "[1]")
    def locator(node):
        return locations[id(node)] if node is not None else None
    def nearest(node, name):
        parent = parents.get(id(node))
        while parent is not None:
            if word(parent, name):
                return parent
            parent = parents.get(id(parent))
        return None
    rel_by_id = {row["id"]: row for row in relationships}
    references = []
    for node in order:
        for key, value in node.attrib.items():
            namespace, name = tag_parts(key)
            if "relationships" in namespace and name in ("id", "embed", "link"):
                references.append({"locator": locator(node), "attribute": key, "relationship_id": value,
                                   "relationship": rel_by_id.get(value)})
    fields, field_stack, issues = [], [], []
    for node in order:
        if word(node, "fldSimple"):
            fields.append({"kind": "simple", "part": path, "locator": locator(node),
                           "instruction": attr(node, "instr", ""), "result": visible_text(node),
                           "attributes": dict(node.attrib), "paragraph": locator(nearest(node, "p")),
                           "status": "complete", "properties": property_tree(node)})
        elif word(node, "fldChar"):
            kind = attr(node, "fldCharType")
            if kind == "begin":
                ff_data = child(node, "ffData")
                legacy = None
                if ff_data is not None:
                    legacy = {"name": val(ff_data, "name"),
                              "enabled": val(ff_data, "enabled"), "calculate_on_exit": val(ff_data, "calcOnExit"),
                              "entry_macro": val(ff_data, "entryMacro"), "exit_macro": val(ff_data, "exitMacro"),
                              "text_input": property_tree(child(ff_data, "textInput")),
                              "checkbox": property_tree(child(ff_data, "checkBox")),
                              "dropdown": property_tree(child(ff_data, "ddList")),
                              "help_text": property_tree(child(ff_data, "helpText")),
                              "status_text": property_tree(child(ff_data, "statusText")),
                              "properties": property_tree(ff_data)}
                field = {"kind": "complex", "part": path, "locator": locator(node), "instruction": "", "result": "",
                         "paragraph": locator(nearest(node, "p")), "parent_field": field_stack[-1]["locator"] if field_stack else None,
                         "attributes": dict(node.attrib), "legacy_form": legacy, "events": [],
                         "status": "unterminated", "_phase": "instruction"}
                fields.append(field)
                field_stack.append(field)
            elif kind == "separate":
                if field_stack:
                    field_stack[-1]["_phase"] = "result"
                    field_stack[-1]["separator_locator"] = locator(node)
                else:
                    issues.append({"code": "ORPHAN_FIELD_SEPARATOR", "part": path, "locator": locator(node)})
            elif kind == "end":
                if field_stack:
                    field = field_stack.pop()
                    field["end_locator"] = locator(node)
                    field["status"] = "complete"
                else:
                    issues.append({"code": "ORPHAN_FIELD_END", "part": path, "locator": locator(node)})
        elif word(node, "instrText"):
            if field_stack:
                field_stack[-1]["instruction"] += node.text or ""
                field_stack[-1]["events"].append({"locator": locator(node), "kind": "instruction", "text": node.text or "", "attributes": dict(node.attrib)})
        elif any(word(node, kind) for kind in ("t", "tab", "br", "cr", "delText")):
            if nearest(node, "del") is None and nearest(node, "moveFrom") is None:
                token = (node.text or "") if word(node, "t") else "\t" if word(node, "tab") else "\n" if word(node, "br") or word(node, "cr") else ""
                for field in field_stack:
                    if field["_phase"] == "result":
                        field["result"] += token
                        field["events"].append({"locator": locator(node), "kind": local_name(node), "text": node.text or "", "attributes": dict(node.attrib)})
    for field in fields:
        field.pop("_phase", None)
        if field["status"] != "complete":
            issues.append({"code": "UNTERMINATED_FIELD", "part": path, "locator": field["locator"]})
    controls = []
    for node in order:
        if not word(node, "sdt"):
            continue
        properties, content = child(node, "sdtPr"), child(node, "sdtContent")
        property_nodes = list(properties) if properties is not None else []
        kinds = [local_name(item) for item in property_nodes if local_name(item) in
                 {"text", "richText", "picture", "comboBox", "dropDownList", "date", "checkbox", "checkBox",
                  "repeatingSection", "repeatingSectionItem", "group", "docPartObj", "docPartList",
                  "citation", "bibliography", "equation"}]
        choices = []
        for item in property_nodes:
            if local_name(item) in ("comboBox", "dropDownList"):
                for choice in item:
                    if local_name(choice) == "listItem":
                        choices.append({"display_text": attr(choice, "displayText"), "value": attr(choice, "value"),
                                        "attributes": dict(choice.attrib)})
        controls.append({"part": path, "locator": locator(node),
                         "native_id": val(properties, "id"), "tag": val(properties, "tag"),
                         "alias": val(properties, "alias"), "kinds": kinds or ["unspecified"],
                         "parent_control": locator(nearest(node, "sdt")),
                         "paragraph": locator(nearest(node, "p")), "table_cell": locator(nearest(node, "tc")),
                         "text": visible_text(content) if content is not None else "",
                         "data_binding": dict(child(properties, "dataBinding").attrib) if child(properties, "dataBinding") is not None else None,
                         "choices": choices, "date": property_tree(child(properties, "date")),
                         "checkbox": property_tree(child(properties, "checkbox")) or property_tree(child(properties, "checkBox")),
                         "repeating_section": property_tree(child(properties, "repeatingSection")),
                         "repeating_item": property_tree(child(properties, "repeatingSectionItem")),
                         "properties": property_tree(properties),
                         "end_properties": property_tree(child(node, "sdtEndPr")),
                         "attributes": dict(node.attrib)})
    paragraphs = []
    for node in order:
        if not word(node, "p"):
            continue
        properties = child(node, "pPr")
        numbering = child(properties, "numPr")
        runs = []
        for run in node.iter():
            if not word(run, "r") or nearest(run, "p") is not node:
                continue
            events = [{"name": item.tag, "locator": locator(item), "text": item.text,
                       "attributes": dict(item.attrib)} for item in run.iter() if item is not run and
                      (tag_parts(item.tag)[0] in WORD_URIS or local_name(item) in ("blip", "imagedata"))]
            runs.append({"locator": locator(run), "text": visible_text(run),
                         "properties": property_tree(child(run, "rPr")), "events": events})
        paragraphs.append({"part": path, "locator": locator(node),
                           "text": visible_text(node, skip_nested_paragraphs=True),
                           "style": val(properties, "pStyle"),
                           "numbering": {"id": val(numbering, "numId"), "level": val(numbering, "ilvl")} if numbering is not None else None,
                           "table_cell": locator(nearest(node, "tc")), "content_control": locator(nearest(node, "sdt")),
                           "attributes": dict(node.attrib), "properties": property_tree(properties), "runs": runs,
                           "bookmarks": [{"locator": locator(item), "id": attr(item, "id"), "name": attr(item, "name")}
                                         for item in node.iter() if word(item, "bookmarkStart")]})
    tables = []
    for node in order:
        if not word(node, "tbl"):
            continue
        properties, grid = child(node, "tblPr"), child(node, "tblGrid")
        rows = []
        for row in node.iter():
            if not word(row, "tr") or nearest(row, "tbl") is not node:
                continue
            row_properties = child(row, "trPr")
            before, after = val(row_properties, "gridBefore", "0"), val(row_properties, "gridAfter", "0")
            try:
                column_at = int(before)
            except (TypeError, ValueError):
                column_at = 0
                issues.append({"code": "TABLE_GRID_BEFORE", "part": path, "locator": locator(row), "value": before})
            cells = []
            for cell in row.iter():
                if not word(cell, "tc") or nearest(cell, "tr") is not row:
                    continue
                cell_properties = child(cell, "tcPr")
                span = val(cell_properties, "gridSpan", "1")
                try:
                    span_number = int(span)
                    need(span_number >= 1, "DOCX_TABLE", "Original table span is invalid.")
                except (TypeError, ValueError, ReceiverError):
                    span_number = 1
                    issues.append({"code": "TABLE_GRID_SPAN", "part": path, "locator": locator(cell), "value": span})
                cell_paragraphs = [paragraph for paragraph in cell.iter() if word(paragraph, "p") and nearest(paragraph, "tc") is cell]
                nested_tables = [nested for nested in cell.iter() if word(nested, "tbl") and nearest(nested, "tc") is cell]
                vertical, horizontal = child(cell_properties, "vMerge"), child(cell_properties, "hMerge")
                cells.append({"locator": locator(cell), "index": len(cells), "grid_column": column_at,
                              "grid_span": span, "vertical_merge": attr(vertical, "val", "continue") if vertical is not None else None,
                              "horizontal_merge": attr(horizontal, "val", "continue") if horizontal is not None else None,
                              "text": "\n".join(visible_text(paragraph, skip_nested_paragraphs=True) for paragraph in cell_paragraphs),
                              "paragraphs": [locator(paragraph) for paragraph in cell_paragraphs],
                              "nested_tables": [locator(nested) for nested in nested_tables],
                              "controls": [locator(item) for item in cell.iter() if word(item, "sdt") and nearest(item, "tc") is cell],
                              "width": dict(child(cell_properties, "tcW").attrib) if child(cell_properties, "tcW") is not None else None,
                              "properties": property_tree(cell_properties), "attributes": dict(cell.attrib)})
                column_at += span_number
            rows.append({"locator": locator(row), "index": len(rows), "grid_before": before, "grid_after": after,
                         "header": property_tree(child(row_properties, "tblHeader")),
                         "cells": cells, "properties": property_tree(row_properties), "attributes": dict(row.attrib)})
        tables.append({"part": path, "locator": locator(node), "parent_table": locator(nearest(node, "tbl")),
                       "parent_cell": locator(nearest(node, "tc")), "style": val(properties, "tblStyle"),
                       "caption": val(properties, "tblCaption"), "description": val(properties, "tblDescription"),
                       "grid": [dict(item.attrib) for item in grid] if grid is not None else [],
                       "rows": rows, "properties": property_tree(properties), "attributes": dict(node.attrib)})
    sections = []
    for node in order:
        if word(node, "sectPr"):
            sections.append({"part": path, "locator": locator(node), "properties": property_tree(node),
                             "references": [reference for reference in references if reference["locator"].startswith(locator(node) + "/")]})
    return {"paragraphs": paragraphs, "tables": tables, "controls": controls,
            "fields": fields, "section_properties": sections, "relationship_references": references,
            "issues": issues, "namespaces": declared}


def form_map(input_path, max_input_bytes=256 * 1024 * 1024, max_expanded_bytes=512 * 1024 * 1024):
    path = Path(input_path).expanduser().resolve()
    need(path.is_file(), "DOCX_INPUT", "Select the complete original document file.", path=str(path))
    need(path.stat().st_size <= max_input_bytes, "DOCX_CAPACITY", "Original document exceeds selected input capacity.", path=str(path))
    raw = path.read_bytes()
    need(len(raw) <= max_input_bytes, "DOCX_CAPACITY", "Original document grew beyond selected input capacity.")
    need(zipfile.is_zipfile(io.BytesIO(raw)), "DOCX_PACKAGE", "Original file is not a complete Office Open XML package.")
    members, contents, issues = [], {}, []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        need(sum(entry.file_size for entry in entries) <= max_expanded_bytes,
             "DOCX_CAPACITY", "Original document package exceeds selected expanded capacity.")
        for entry in entries:
            name = entry.filename
            need(name not in contents, "DOCX_DUPLICATE_MEMBER", "Original package has duplicate member names.", member=name)
            relative_path(name[:-1] if entry.is_dir() else name)
            need(not (entry.flag_bits & 1), "DOCX_ENCRYPTED", "Encrypted package members require the original decrypted document.", member=name)
            content = archive.read(entry)
            need(len(content) == entry.file_size, "DOCX_MEMBER", "Original package member size differs.", member=name)
            contents[name] = content
            members.append({"path": name, "bytes": len(content), "compressed_bytes": entry.compress_size,
                            "sha256": digest(content), "crc32": format(entry.CRC, "08x"),
                            "compression": entry.compress_type, "flags": entry.flag_bits,
                            "modified_at": list(entry.date_time), "external_attributes": entry.external_attr,
                            "is_directory": entry.is_dir(), "base64": base64.b64encode(content).decode("ascii")})
    need("[Content_Types].xml" in contents, "DOCX_PACKAGE", "Original package lacks its content type declarations.")
    type_root, _ = parse_xml(contents["[Content_Types].xml"], "[Content_Types].xml")
    defaults, overrides = {}, {}
    for node in type_root:
        if local_name(node) == "Default":
            defaults[node.attrib.get("Extension", "").lower()] = node.attrib.get("ContentType")
        elif local_name(node) == "Override":
            overrides[unquote(node.attrib.get("PartName", "").lstrip("/"))] = node.attrib.get("ContentType")
    content_types = {name: overrides.get(name, defaults.get(name.rsplit(".", 1)[-1].lower())) for name in contents}
    xml_parts, namespaces_by_part = {}, {}
    for name, content in contents.items():
        if name.endswith((".xml", ".rels")) or (content_types.get(name) or "").endswith("+xml"):
            root, declared = parse_xml(content, name)
            xml_parts[name], namespaces_by_part[name] = root, declared
    relationships = []
    for name, root in xml_parts.items():
        source_part = relationship_source(name)
        if source_part is None:
            continue
        seen = set()
        for node in root:
            if local_name(node) != "Relationship":
                continue
            relation_id, target = node.attrib.get("Id"), node.attrib.get("Target")
            need(isinstance(relation_id, str) and relation_id not in seen and isinstance(target, str),
                 "DOCX_RELATIONSHIP", "Original relationship ID or target is incomplete.", part=name)
            seen.add(relation_id)
            external = node.attrib.get("TargetMode") == "External"
            resolved, fragment = None, None
            if not external:
                resolved, fragment = relationship_target(source_part, target)
                if resolved not in contents:
                    issues.append({"code": "MISSING_RELATIONSHIP_PART", "part": source_part, "relationship_id": relation_id, "target": resolved})
            relationships.append({"part": source_part, "relationship_part": name, "id": relation_id,
                                  "type": node.attrib.get("Type"), "target": target, "target_mode": node.attrib.get("TargetMode"),
                                  "external": external, "resolved_target": resolved, "fragment": fragment,
                                  "exists": None if external else resolved in contents, "attributes": dict(node.attrib)})
    main_candidates = [row["resolved_target"] for row in relationships if row["part"] == "" and
                       (row["type"] or "").endswith("/officeDocument") and not row["external"]]
    need(len(main_candidates) <= 1, "DOCX_MAIN_PART", "Original package declares multiple main document parts.")
    main_part = main_candidates[0] if main_candidates else "word/document.xml"
    need(main_part in xml_parts, "DOCX_MAIN_PART", "Original main document XML was not retained.", part=main_part)
    need(word(xml_parts[main_part], "document"), "DOCX_MAIN_PART", "Original package main part is not a Word document.")
    package_media_types = {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
        "application/vnd.ms-word.document.macroEnabled.main+xml": "application/vnd.ms-word.document.macroEnabled.12",
        "application/vnd.ms-word.template.macroEnabledTemplate.main+xml": "application/vnd.ms-word.template.macroEnabled.12",
    }
    main_content_type = content_types.get(main_part)
    need(main_content_type in package_media_types, "DOCX_MAIN_PART",
         "Original main part needs its declared Word package content type.", part=main_part, content_type=main_content_type)
    if not main_candidates:
        issues.append({"code": "MISSING_ROOT_DOCUMENT_RELATIONSHIP", "part": main_part})
    result = {"schema": FORM_SCHEMA, "status": "MAPPED",
              "original": {"filename": path.name, "bytes": len(raw), "sha256": digest(raw),
                           "media_type": package_media_types[main_content_type],
                           "base64": base64.b64encode(raw).decode("ascii")},
              "main_part": main_part, "members": members,
              "content_types": {"defaults": defaults, "overrides": overrides}, "parts": [],
              "relationships": relationships, "relationship_references": [],
              "paragraphs": [], "tables": [], "controls": [], "fields": [],
              "section_properties": [], "document_properties": [], "edition_candidates": [], "issues": issues}
    by_part = defaultdict(list)
    for relation in relationships:
        by_part[relation["part"]].append(relation)
    for name, root in xml_parts.items():
        content_type = content_types.get(name) or ""
        role = "document" if name == main_part else "header" if ".header+" in content_type else "footer" if ".footer+" in content_type else \
            "footnotes" if ".footnotes+" in content_type else "endnotes" if ".endnotes+" in content_type else \
            "comments" if ".comments+" in content_type else "properties" if name.startswith("docProps/") else \
            "custom_xml" if name.startswith("customXml/") else "supporting_xml"
        part = {"path": name, "role": role, "content_type": content_type, "bytes": len(contents[name]),
                "sha256": digest(contents[name]), "namespaces": namespaces_by_part[name]}
        if any(tag_parts(node.tag)[0] in WORD_URIS for node in root.iter()):
            analysed = analyse_word_part(name, root, namespaces_by_part[name], by_part[name])
            for key in ("paragraphs", "tables", "controls", "fields", "section_properties", "relationship_references"):
                result[key].extend(analysed[key])
                part[key] = [item["locator"] for item in analysed[key]]
            result["issues"].extend(analysed["issues"])
            if role in ("document", "header", "footer"):
                for paragraph in analysed["paragraphs"]:
                    if re.search(r"\b(?:issue|edition|revision|version|rev\.?|effective|date)\b", paragraph["text"], re.I):
                        result["edition_candidates"].append({"part": name, "role": role, "locator": paragraph["locator"],
                                                             "text": paragraph["text"], "basis": "original_printed_label"})
        if role == "properties":
            for node in root:
                result["document_properties"].append({"part": name, "name": node.tag, "attributes": dict(node.attrib),
                                                       "text": "".join(node.itertext()), "structure": property_tree(node)})
        result["parts"].append(part)
    for reference in result["relationship_references"]:
        if reference["relationship"] is None:
            result["issues"].append({"code": "UNRESOLVED_RELATIONSHIP_ID", "locator": reference["locator"],
                                     "relationship_id": reference["relationship_id"]})
    result["repeating_groups"] = [control for control in result["controls"] if "repeatingSection" in control["kinds"] or "repeatingSectionItem" in control["kinds"]]
    result["embedded_assets"] = [{"path": member["path"], "bytes": member["bytes"], "sha256": member["sha256"],
                                 "content_type": content_types.get(member["path"]),
                                 "relationships": [row for row in relationships if row["resolved_target"] == member["path"]]}
                                for member in members if not member["is_directory"] and member["path"] not in xml_parts]
    result["counts"] = {"members": len(members), "original_bytes": len(raw),
                        "expanded_bytes": sum(member["bytes"] for member in members), "xml_parts": len(xml_parts),
                        "paragraphs": len(result["paragraphs"]), "tables": len(result["tables"]),
                        "controls": len(result["controls"]), "fields": len(result["fields"]),
                        "repeating_groups": len(result["repeating_groups"]),
                        "relationships": len(relationships), "embedded_assets": len(result["embedded_assets"]),
                        "issues": len(result["issues"])}
    if result["issues"]:
        result["status"] = "MAPPED_WITH_ISSUES"
    return result



FILL_SCHEMA = "tjlabs.accreditation-docx-fill.v1"
FILL_RESULT_SCHEMA = "tjlabs.accreditation-docx-fill-result.v1"
XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace"


def dom_elements(node):
    if node.nodeType == node.ELEMENT_NODE:
        yield node
    for nested in node.childNodes:
        if nested.nodeType == nested.ELEMENT_NODE:
            yield from dom_elements(nested)


def dom_word(node, name):
    return node is not None and node.nodeType == node.ELEMENT_NODE and node.namespaceURI in WORD_URIS and node.localName == name


def dom_child(node, name):
    if node is None:
        return None
    return next((item for item in node.childNodes if item.nodeType == item.ELEMENT_NODE and item.localName == name), None)


def dom_attribute(node, name, default=None):
    if node is None or node.nodeType != node.ELEMENT_NODE:
        return default
    for index in range(node.attributes.length):
        item = node.attributes.item(index)
        if item.localName == name:
            return item.value
    return default


def dom_nearest(node, name):
    node = node.parentNode
    while node is not None:
        if dom_word(node, name):
            return node
        node = node.parentNode
    return None


def dom_text_node(node):
    return "".join(item.data for item in node.childNodes if item.nodeType in (item.TEXT_NODE, item.CDATA_SECTION_NODE))


def dom_visible(node):
    pieces = []
    def visit(item):
        if item.nodeType != item.ELEMENT_NODE or dom_word(item, "del") or dom_word(item, "moveFrom"):
            return
        if dom_word(item, "t"):
            pieces.append(dom_text_node(item))
        elif dom_word(item, "tab"):
            pieces.append("\t")
        elif dom_word(item, "br") or dom_word(item, "cr"):
            pieces.append("\n")
        elif dom_word(item, "noBreakHyphen"):
            pieces.append("\u2011")
        elif dom_word(item, "softHyphen"):
            pieces.append("\u00ad")
        else:
            for nested in item.childNodes:
                visit(nested)
    visit(node)
    return "".join(pieces)


def dom_set_text(node, value):
    for nested in list(node.childNodes):
        need(nested.nodeType != nested.ELEMENT_NODE, "DOCX_FILL_STRUCTURE",
             "The original text node contains unsupported nested elements.")
        node.removeChild(nested)
    node.appendChild(node.ownerDocument.createTextNode(value))
    node.setAttributeNS(XML_NAMESPACE, "xml:space", "preserve")


def dom_new_word(parent, name, anchor=None):
    original = anchor if anchor is not None else parent
    while original is not None and not (original.nodeType == original.ELEMENT_NODE and original.namespaceURI in WORD_URIS):
        original = original.parentNode
    need(original is not None, "DOCX_FILL_NAMESPACE", "The selected location has no original Word namespace.")
    qualified = (original.prefix + ":" if original.prefix else "") + name
    return parent.ownerDocument.createElementNS(original.namespaceURI, qualified)


def dom_set_word_attribute(node, name, value, anchor=None):
    original = anchor if anchor is not None else node
    while original is not None and not (original.nodeType == original.ELEMENT_NODE and original.namespaceURI in WORD_URIS):
        original = original.parentNode
    need(original is not None, "DOCX_FILL_NAMESPACE", "The selected property has no original Word namespace.")
    prefix = original.prefix or "w"
    # A namespaced attribute cannot use the default element namespace.
    if not original.prefix:
        node.setAttribute("xmlns:" + prefix, original.namespaceURI)
    node.setAttributeNS(original.namespaceURI, prefix + ":" + name, value)


def dom_index(part, document, declared):
    namespaces = dict(NAMESPACES)
    for item in declared:
        if item["uri"] not in namespaces:
            namespaces[item["uri"]] = item["prefix"] or "ns" + str(len(namespaces))
    def qualified(node):
        namespace, name = node.namespaceURI or "", node.localName or node.tagName
        return namespaces.get(namespace, "{" + namespace + "}") + ":" + name if namespace else name
    by_location, by_node, ordered = {}, {}, []
    def visit(node, location):
        actual = part + "#" + location
        need(actual not in by_location, "DOCX_FILL_LOCATION", "The source has an ambiguous form location.", locator=actual)
        by_location[actual], by_node[id(node)] = node, actual
        ordered.append(node)
        counts = defaultdict(int)
        for nested in node.childNodes:
            if nested.nodeType != nested.ELEMENT_NODE:
                continue
            key = (nested.namespaceURI or "", nested.localName or nested.tagName)
            counts[key] += 1
            visit(nested, location + "/" + qualified(nested) + "[" + str(counts[key]) + "]")
    visit(document.documentElement, "/" + qualified(document.documentElement) + "[1]")
    return {"document": document, "locations": by_location, "node_locations": by_node,
            "ordered": ordered, "positions": {id(node): index for index, node in enumerate(ordered)}}


def fill_control_guard(node):
    current = node
    while current is not None:
        if dom_word(current, "sdt"):
            need(current is node, "DOCX_FILL_CONTROL_LOCATION",
                 "Select the enclosing original content control so its native properties remain bound to its value.")
            properties = dom_child(current, "sdtPr")
            need(dom_child(properties, "dataBinding") is None, "DOCX_FILL_DATA_BINDING",
                 "This original control is bound to custom XML; retain an explicit native data-binding edit.")
            need(dom_child(properties, "repeatingSection") is None and dom_child(properties, "repeatingSectionItem") is None,
                 "DOCX_FILL_REPEATING", "Repeating original controls require an explicit structural mapping.")
            locked = dom_attribute(dom_child(properties, "lock"), "val")
            need(locked not in ("contentLocked", "sdtContentLocked"), "DOCX_FILL_LOCKED",
                 "This original control's content is locked.", lock=locked)
        need(not any(dom_word(current, name) for name in ("del", "moveFrom", "ins", "moveTo")),
             "DOCX_FILL_REVISION", "Select an original location outside a tracked structural revision.")
        current = current.parentNode


def fill_plain_scope(scope, control=False):
    nodes = list(dom_elements(scope))
    denied = {"fldChar", "fldSimple", "instrText", "delInstrText", "del", "moveFrom", "ins", "moveTo",
              "tbl", "tr", "tc", "sdt", "drawing", "object", "pict", "sym", "altChunk", "subDoc"}
    for node in nodes:
        need(not (node.namespaceURI in WORD_URIS and node.localName in denied),
             "DOCX_FILL_STRUCTURE", "The selected text contains a field, nested control, or structural content.",
             element=node.tagName)
    paragraphs = [node for node in nodes if dom_word(node, "p")]
    need(len(paragraphs) <= 1, "DOCX_FILL_STRUCTURE",
         "Select one original paragraph or a single-paragraph text control.")
    if control:
        need(scope.localName == "sdtContent", "DOCX_FILL_STRUCTURE", "The original control has no retained content container.")
    return [node for node in nodes if node.namespaceURI in WORD_URIS and node.localName in
            ("t", "tab", "br", "cr", "noBreakHyphen", "softHyphen")]


def fill_replace_text(scope, replacement, tokens=None, anchor=None):
    """Replace visible text within one selected original inline/paragraph scope."""
    tokens = fill_plain_scope(scope) if tokens is None else tokens
    if tokens:
        first = tokens[0]
        run = first.parentNode
        need(dom_word(run, "r"), "DOCX_FILL_STRUCTURE", "Original text token is not in a Word run.")
        if not dom_word(first, "t"):
            created = dom_new_word(run, "t", anchor)
            run.insertBefore(created, first)
            run.removeChild(first)
            first = created
        for token in tokens[1:]:
            if dom_word(token, "t"):
                dom_set_text(token, "")
            elif token.parentNode is not None:
                token.parentNode.removeChild(token)
    else:
        if dom_word(scope, "r"):
            run = scope
        else:
            paragraphs = [node for node in dom_elements(scope) if dom_word(node, "p")]
            paragraph = paragraphs[0] if paragraphs else scope if dom_word(scope, "p") else None
            if paragraph is not None:
                runs = [node for node in dom_elements(paragraph) if dom_word(node, "r")]
                run = runs[0] if runs else dom_new_word(paragraph, "r", anchor)
                if not runs:
                    paragraph.appendChild(run)
            elif scope.localName == "sdtContent":
                sdt = scope.parentNode
                if dom_word(sdt.parentNode, "p"):
                    run = dom_new_word(scope, "r", sdt)
                    scope.appendChild(run)
                else:
                    need(dom_word(sdt.parentNode, "body") or dom_word(sdt.parentNode, "tc"),
                         "DOCX_FILL_STRUCTURE", "The empty control needs an explicit original structural mapping.")
                    paragraph = dom_new_word(scope, "p", sdt)
                    scope.appendChild(paragraph)
                    run = dom_new_word(paragraph, "r", sdt)
                    paragraph.appendChild(run)
            else:
                raise ReceiverError("DOCX_FILL_STRUCTURE", "Select an original run, paragraph or text control.")
        first = dom_new_word(run, "t", anchor)
        run.appendChild(first)
    pieces = re.split(r"(\t|\n)", replacement)
    dom_set_text(first, pieces[0])
    previous = first
    inserted = [first]
    for piece in pieces[1:]:
        created = dom_new_word(run, "tab" if piece == "\t" else "br" if piece == "\n" else "t", anchor)
        if piece not in ("\t", "\n"):
            dom_set_text(created, piece)
        run.insertBefore(created, previous.nextSibling)
        previous = created
        inserted.append(created)
    return inserted


def fill_replacement(value, label):
    value = text(value, label, nonempty=False)
    need(not re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]", value),
         "DOCX_FILL_TEXT", "Replacement text contains a character outside XML 1.0.")
    need("\r" not in value, "DOCX_FILL_TEXT", "Use LF newlines in an explicit form replacement.")
    return value


def form_fill(input_path, mapping_path, max_input_bytes=256 * 1024 * 1024, max_expanded_bytes=512 * 1024 * 1024):
    mapping_bytes = Path(mapping_path).expanduser().resolve().read_bytes()
    mapping = parse_json(mapping_bytes, "Original form fill mapping")
    need(isinstance(mapping, dict) and mapping.get("schema") == FILL_SCHEMA, "DOCX_FILL_MAPPING",
         "Use a complete saved original form fill mapping.")
    expected_sha = mapping.get("original_sha256")
    need(isinstance(expected_sha, str) and re.fullmatch(r"[0-9a-f]{64}", expected_sha),
         "DOCX_FILL_SOURCE", "The mapping needs the exact original document SHA-256.")
    changes = mapping.get("changes")
    need(isinstance(changes, list) and changes, "DOCX_FILL_MAPPING", "Select actual original form locations and values.")
    mapped = form_map(input_path, max_input_bytes, max_expanded_bytes)
    need(mapped["original"]["sha256"] == expected_sha, "DOCX_FILL_SOURCE",
         "The selected original document differs from the saved fill mapping.",
         expected_sha256=expected_sha, actual_sha256=mapped["original"]["sha256"])
    raw = base64.b64decode(mapped["original"]["base64"], validate=True)
    contents = {member["path"]: base64.b64decode(member["base64"], validate=True) for member in mapped["members"]}
    need(not any(name.startswith("_xmlsignatures/") for name in contents), "DOCX_FILL_SIGNED_PACKAGE",
         "The original package contains a digital signature; select its unsigned editable source.")
    parts = {part["path"]: part for part in mapped["parts"]}
    original_controls = {control["locator"]: control for control in mapped["controls"]}
    original_fields = {field["locator"]: field for field in mapped["fields"]}
    contexts, plans, selected = {}, [], []
    for change in changes:
        need(isinstance(change, dict), "DOCX_FILL_MAPPING", "Each explicit form change must be an object.")
        part = relative_path(change.get("part"))
        location = text(change.get("locator"), "Original form locator")
        need(location.startswith(part + "#/") and part in parts, "DOCX_FILL_LOCATION",
             "The location must name an original XML part in this document.", part=part, locator=location)
        modes = [mode for mode in ("text", "choice_value") if mode in change]
        need(len(modes) == 1, "DOCX_FILL_VALUE", "Use one explicit replacement text or original choice value.", locator=location)
        mode = modes[0]
        replacement = fill_replacement(change[mode], "Original form replacement")
        if part not in contexts:
            document = minidom.parseString(contents[part])
            contexts[part] = dom_index(part, document, parts[part]["namespaces"])
        context = contexts[part]
        node = context["locations"].get(location)
        need(node is not None, "DOCX_FILL_LOCATION", "The exact original location was not found.", part=part, locator=location)
        need(parts[part]["role"] in ("document", "header", "footer", "footnotes", "endnotes", "comments"),
             "DOCX_FILL_PART", "Select an original visible Word document part.", part=part)
        for earlier in selected:
            need(not (earlier == location or earlier.startswith(location + "/") or location.startswith(earlier + "/")),
                 "DOCX_FILL_OVERLAP", "Original fill selections overlap; choose one explicit replacement per location.", locator=location)
        fill_control_guard(node)
        position = context["positions"][id(node)]
        for field_location, original_field in original_fields.items():
            if original_field["part"] != part or field_location == location:
                continue
            field_start = context["locations"].get(field_location)
            field_end = context["locations"].get(original_field.get("end_locator"))
            inside = location.startswith(field_location + "/")
            if field_start is not None and field_end is not None:
                inside = inside or context["positions"][id(field_start)] <= position <= context["positions"][id(field_end)]
            need(not inside, "DOCX_FILL_FIELD_LOCATION",
                 "Select the original field location so its native choice and result remain bound.",
                 locator=location, field_locator=field_location)
        selected.append(location)
        plan = {"part": part, "locator": location, "node": node, "mode": mode,
                "replacement": replacement, "properties": [], "tokens": None}
        if dom_word(node, "sdt"):
            original = original_controls.get(location)
            need(original is not None, "DOCX_FILL_LOCATION", "The selected control is absent from the original form map.")
            kinds = original["kinds"]
            need(all(kind in ("text", "richText", "unspecified", "comboBox", "dropDownList") for kind in kinds),
                 "DOCX_FILL_CONTROL", "This original control needs a supported explicit native control edit.", kinds=kinds)
            properties, scope = dom_child(node, "sdtPr"), dom_child(node, "sdtContent")
            need(scope is not None, "DOCX_FILL_CONTROL", "The selected original control has no content.")
            tokens = fill_plain_scope(scope, control=True)
            choice = dom_child(properties, "dropDownList")
            if choice is None:
                choice = dom_child(properties, "comboBox")
            if choice is not None:
                if mode == "choice_value":
                    matches = [entry for entry in choice.childNodes if entry.nodeType == entry.ELEMENT_NODE and
                               entry.localName == "listItem" and dom_attribute(entry, "value") == replacement]
                    need(len(matches) == 1, "DOCX_FILL_CHOICE", "Select one actual original native choice value.",
                         locator=location, matches=len(matches), choices=original["choices"])
                    plan["choice_value"] = replacement
                    replacement = dom_attribute(matches[0], "displayText", replacement)
                    replacement = fill_replacement(replacement, "Original choice display text")
                    plan["properties"].append(("last_value", choice, plan["choice_value"]))
                else:
                    need(choice.localName == "comboBox", "DOCX_FILL_CHOICE",
                         "A dropdown requires an original choice_value.", locator=location, choices=original["choices"])
                    plan["properties"].append(("last_value", choice, replacement))
            else:
                need(mode == "text", "DOCX_FILL_CHOICE", "This original control has no choices.", locator=location)
            plan.update(kind="control_choice" if mode == "choice_value" else "control_text",
                        scope=scope, tokens=tokens, before=dom_visible(scope), replacement=replacement)
            placeholder = dom_child(properties, "showingPlcHdr")
            if placeholder is not None:
                plan["properties"].append(("remove", placeholder, None))
        elif dom_word(node, "fldSimple") or dom_word(node, "fldChar"):
            original = original_fields.get(location)
            need(original is not None and original["status"] == "complete", "DOCX_FILL_FIELD",
                 "Select a complete original form field begin location.", locator=location)
            instruction = original["instruction"].strip().split()
            field_code = instruction[0].upper() if instruction else ""
            need(field_code in ("FORMTEXT", "FORMDROPDOWN"), "DOCX_FILL_FIELD",
                 "Select a text or dropdown form field; calculated field instructions stay original.",
                 locator=location, instruction=original["instruction"])
            if dom_word(node, "fldSimple"):
                scope = node
                ff_data = dom_child(node, "ffData")
                result_nodes = [item for item in dom_elements(node) if item is not node and
                                not dom_nearest(item, "ffData")]
                need(not any(dom_word(item, "fldChar") or dom_word(item, "fldSimple") for item in result_nodes),
                     "DOCX_FILL_FIELD", "Nested fields require an explicit native field mapping.")
            else:
                separator = context["locations"].get(original.get("separator_locator"))
                end = context["locations"].get(original.get("end_locator"))
                need(separator is not None and end is not None and dom_nearest(node, "p") is dom_nearest(end, "p"),
                     "DOCX_FILL_FIELD", "Select a form field with an original separator and one-paragraph result.")
                start_at, end_at = context["positions"][id(separator)], context["positions"][id(end)]
                need(start_at < end_at, "DOCX_FILL_FIELD", "The original field result order is invalid.")
                result_nodes = context["ordered"][start_at + 1:end_at]
                need(not any(dom_word(item, "fldChar") or dom_word(item, "fldSimple") or dom_word(item, "instrText") for item in result_nodes),
                     "DOCX_FILL_FIELD", "Nested field results need their own original native mapping.")
                scope = dom_nearest(node, "p")
                ff_data = dom_child(node, "ffData")
                plan["field_range"] = (context["positions"][id(node)], end_at)
            tokens = [item for item in result_nodes if item.namespaceURI in WORD_URIS and item.localName in
                      ("t", "tab", "br", "cr", "noBreakHyphen", "softHyphen")]
            need(tokens, "DOCX_FILL_FIELD", "The original form field has no retained editable result run.")
            need(not any(item.namespaceURI in WORD_URIS and item.localName in
                         ("drawing", "object", "pict", "sdt", "tbl", "del", "moveFrom", "ins", "moveTo") for item in result_nodes),
                 "DOCX_FILL_FIELD", "The original form field result contains structural content.")
            if field_code == "FORMDROPDOWN":
                need(mode == "choice_value", "DOCX_FILL_CHOICE", "An original dropdown field requires its exact choice_value.")
                choice = dom_child(ff_data, "ddList")
                need(choice is not None, "DOCX_FILL_CHOICE", "The original dropdown field has no retained choice definition.")
                entries = [entry for entry in choice.childNodes if entry.nodeType == entry.ELEMENT_NODE and entry.localName == "listEntry"]
                matches = [(index, entry) for index, entry in enumerate(entries) if dom_attribute(entry, "val") == replacement]
                need(len(matches) == 1, "DOCX_FILL_CHOICE", "Select one actual original dropdown field value.",
                     locator=location, choices=[dom_attribute(entry, "val") for entry in entries])
                plan["choice_value"] = replacement
                plan["properties"].append(("legacy_selection", choice, str(matches[0][0])))
            else:
                need(mode == "text", "DOCX_FILL_VALUE", "An original text form field accepts explicit text.")
                text_input = dom_child(ff_data, "textInput")
                text_type = dom_attribute(dom_child(text_input, "type"), "val", "regular")
                need(text_type == "regular", "DOCX_FILL_FIELD",
                     "This original typed/calculated text field needs its own native value rule.", field_type=text_type)
                limit = dom_attribute(dom_child(text_input, "maxLength"), "val")
                if limit is not None:
                    need(limit.isdigit() and (int(limit) == 0 or len(replacement) <= int(limit)),
                         "DOCX_FILL_VALUE", "Replacement exceeds the original text field maximum length.", maximum=limit)
            before = "".join(dom_visible(item) for item in tokens)
            plan.update(kind="field_choice" if mode == "choice_value" else "field_text",
                        scope=scope, tokens=tokens, before=before)
        elif dom_word(node, "p") or dom_word(node, "r") or dom_word(node, "t"):
            need(mode == "text", "DOCX_FILL_CHOICE", "An original text location accepts explicit text.")
            scope = node
            if dom_word(node, "t"):
                need("\n" not in replacement and "\t" not in replacement, "DOCX_FILL_TEXT",
                     "Select the original run or paragraph for multiline or tabbed text.")
                tokens = [node]
            else:
                tokens = fill_plain_scope(scope)
            plan.update(kind="text", scope=scope, tokens=tokens, before=dom_visible(scope))
        else:
            raise ReceiverError("DOCX_FILL_STRUCTURE", "Select an original text, run, paragraph or supported form control.",
                                locator=location, element=node.tagName)
        if "expected_text" in change:
            expected_text = text(change["expected_text"], "Original expected text", nonempty=False)
            need(plan["before"] == expected_text, "DOCX_FILL_ORIGINAL_TEXT",
                 "The original selected text differs from the saved mapping.",
                 locator=location, expected_text=expected_text, actual_text=plan["before"])
        plan["footprint"] = {id(item) for item in dom_elements(node)} | {id(item) for item in plan["tokens"]}
        for earlier in plans:
            if earlier["part"] != part:
                continue
            overlap = bool(earlier["footprint"] & plan["footprint"])
            for left, right in ((earlier, plan), (plan, earlier)):
                if "field_range" in left:
                    start_at, end_at = left["field_range"]
                    overlap = overlap or any(start_at <= context["positions"].get(identity, -1) <= end_at for identity in right["footprint"])
            need(not overlap, "DOCX_FILL_OVERLAP", "The original form selections modify the same field content.", locator=location)
        plans.append(plan)
    observed_changes = []
    for plan in plans:
        if dom_word(plan["node"], "t"):
            dom_set_text(plan["node"], plan["replacement"])
            result_nodes = [plan["node"]]
        else:
            result_nodes = fill_replace_text(plan["scope"], plan["replacement"], plan["tokens"], plan["node"])
        actual_after = "".join(dom_visible(item) for item in result_nodes)
        need(actual_after == plan["replacement"], "DOCX_FILL_RESULT",
             "The native document text differs from the selected replacement.", locator=plan["locator"])
        for kind, node, value in plan["properties"]:
            if kind == "remove":
                node.parentNode.removeChild(node)
            elif kind == "last_value":
                dom_set_word_attribute(node, "lastValue", value, plan["node"])
            elif kind == "legacy_selection":
                selection = dom_child(node, "result")
                if selection is None:
                    selection = dom_new_word(node, "result", plan["node"])
                    node.insertBefore(selection, node.firstChild)
                dom_set_word_attribute(selection, "val", value, plan["node"])
        observed = {"part": plan["part"], "locator": plan["locator"], "kind": plan["kind"],
                    "before": plan["before"], "after": actual_after}
        if "choice_value" in plan:
            observed["choice_value"] = plan["choice_value"]
        observed_changes.append(observed)
    replacements, changed_parts = {}, []
    for part, context in contexts.items():
        original_declaration = re.match(br"\s*<\?xml\b[^?]*\?>", contents[part])
        standalone = None
        if original_declaration:
            value = re.search(br"\bstandalone\s*=\s*['\"](yes|no)['\"]", original_declaration.group(0))
            if value:
                standalone = value.group(1) == b"yes"
        updated = context["document"].toxml(encoding="utf-8", standalone=standalone)
        parse_xml(updated, part)
        replacements[part] = updated
        changed_parts.append({"path": part, "original_bytes": len(contents[part]), "original_sha256": digest(contents[part]),
                              "bytes": len(updated), "sha256": digest(updated)})
    target = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(raw)) as source, zipfile.ZipFile(target, "w") as destination:
        destination.comment = source.comment
        for entry in source.infolist():
            destination.writestr(copy.copy(entry), replacements.get(entry.filename, contents[entry.filename]))
    output = target.getvalue()
    preserved_members = []
    with zipfile.ZipFile(io.BytesIO(output)) as reopened:
        need(reopened.namelist() == [member["path"] for member in mapped["members"]],
             "DOCX_FILL_PACKAGE", "The successor package changed its original member order.")
        for member in mapped["members"]:
            name = member["path"]
            received = reopened.read(name)
            expected = replacements.get(name, contents[name])
            need(received == expected, "DOCX_FILL_PACKAGE", "The successor package changed retained member bytes.", member=name)
            if name not in replacements:
                preserved_members.append({"path": name, "bytes": len(received), "sha256": digest(received)})
    original = {key: mapped["original"][key] for key in ("filename", "bytes", "sha256", "media_type")}
    source_path = Path(input_path)
    output_filename = source_path.stem + ".filled" + source_path.suffix
    return {"schema": FILL_RESULT_SCHEMA, "status": "FILLED", "original": original,
            "output": {"filename": output_filename, "bytes": len(output), "sha256": digest(output),
                       "media_type": mapped["original"]["media_type"], "base64": base64.b64encode(output).decode("ascii")},
            "mapping_sha256": digest(mapping_bytes), "mapping": mapping, "changes": observed_changes,
            "preserved_members": preserved_members, "changed_parts": changed_parts,
            "counts": {"changes": len(observed_changes), "changed_parts": len(changed_parts),
                       "preserved_members": len(preserved_members), "members": len(mapped["members"])}}



def write_result(result, output=None, protected_paths=()):
    data = json_bytes(result)
    if output is None:
        sys.stdout.buffer.write(data)
        return
    target = Path(output).expanduser().resolve()
    need(target not in {Path(value).expanduser().resolve() for value in protected_paths if value is not None},
         "OUTPUT_PATH", "Choose a result path separate from the original source and native database.", path=str(target))
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.name + ".", dir=str(target.parent))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    sys.stdout.buffer.write(json_bytes({"schema": "tjlabs.accreditation-native-output.v1",
                                       "path": str(target), "bytes": len(data), "sha256": digest(data),
                                       "result_schema": result.get("schema"), "status": result.get("status", "SAVED")}))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    for command in ("describe", "apply", "lookup", "extract"):
        item = subcommands.add_parser(command)
        item.add_argument("--database", required=True)
        item.add_argument("--output")
        if command == "describe":
            item.add_argument("--contract", required=True)
        elif command == "apply":
            item.add_argument("--request", required=True)
        elif command == "lookup":
            item.add_argument("--request-id", required=True)
        else:
            item.add_argument("--project-id", required=True)
    for command in ("form-map", "form-fill"):
        item = subcommands.add_parser(command)
        item.add_argument("--input", required=True)
        item.add_argument("--output")
        item.add_argument("--max-input-bytes", type=int, default=256 * 1024 * 1024)
        item.add_argument("--max-expanded-bytes", type=int, default=512 * 1024 * 1024)
        if command == "form-fill":
            item.add_argument("--mapping", required=True)
    args = parser.parse_args(argv)
    connection = None
    try:
        protected = [getattr(args, name, None) for name in ("database", "contract", "request", "input", "mapping")]
        if args.command in ("form-map", "form-fill"):
            need(args.max_input_bytes > 0 and args.max_expanded_bytes > 0, "DOCX_CAPACITY", "Use positive original document capacities.")
            result = form_fill(args.input, args.mapping, args.max_input_bytes, args.max_expanded_bytes) if args.command == "form-fill" else form_map(args.input, args.max_input_bytes, args.max_expanded_bytes)
        else:
            connection = connect(args.database, create=args.command == "describe")
            if args.command == "describe":
                raw = Path(args.contract).read_bytes()
                initialize(connection, parse_json(raw, "Original data contract"), raw)
                connection.execute("BEGIN")
                result = describe_connection(connection)
                connection.commit()
            elif args.command == "apply":
                result = apply_request(connection, Path(args.request).read_bytes())
            elif args.command == "lookup":
                connection.execute("BEGIN")
                result = lookup_request(connection, args.request_id)
                connection.commit()
            else:
                connection.execute("BEGIN")
                result = extract_connection(connection, text(args.project_id, "Original project ID"))
                connection.commit()
        write_result(result, args.output, protected)
        return 0
    except ReceiverError as error:
        sys.stdout.buffer.write(json_bytes({"schema": ERROR_SCHEMA, "status": "ERROR", "code": error.code,
                                           "message": str(error), "details": error.details}))
        return 2
    except (OSError, sqlite3.Error, zipfile.BadZipFile, ExpatError, RuntimeError, ValueError, TypeError, RecursionError) as error:
        sys.stdout.buffer.write(json_bytes({"schema": ERROR_SCHEMA, "status": "ERROR",
                                           "code": "NATIVE_" + type(error).__name__.upper(),
                                           "message": str(error), "details": {}}))
        return 3
    finally:
        if connection is not None:
            if connection.in_transaction:
                connection.rollback()
            connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
