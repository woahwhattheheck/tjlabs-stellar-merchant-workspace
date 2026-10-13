"""Complete SQL client handover for one observed running result publication.

This read-only composition uses the original service state and immutable
publication. It starts no listener, purchase, query, or warehouse mutation.
"""
from __future__ import annotations

import base64
import hashlib
from importlib import resources
import io
import json
import re
from urllib.parse import urlsplit
import zipfile

from ..errors import StateError

SCHEMA = "stellar-forge.vgi-client-handover.v1"
_ID = re.compile(r"^[a-f0-9]{64}$")
_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,119}$")


def _need(condition, message):
    if not condition:
        raise StateError(message)


def _json(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                       indent=2) + "\n").encode("utf-8")


def _digest(value):
    return hashlib.sha256(value).hexdigest()


def _integer(value):
    return type(value) is int and value >= 0


def _quote(value):
    _need(isinstance(value, str) and value and "\x00" not in value,
          "VGI_CLIENT_COLUMN_INVALID")
    return '"' + value.replace('"', '""') + '"'


def _address(value):
    _need(isinstance(value, str) and 0 < len(value) <= 4096
          and value == value.strip() and not any(ord(c) < 33 for c in value),
          "VGI_CLIENT_ADDRESS_REQUIRED")
    try:
        url = urlsplit(value)
        port = url.port
        host = url.hostname
    except ValueError:
        raise StateError("VGI_CLIENT_ADDRESS_INVALID") from None
    _need(url.scheme in {"http", "https"} and host and url.netloc
          and url.username is None and url.password is None
          and not url.query and not url.fragment and "\\" not in value,
          "VGI_CLIENT_ADDRESS_INVALID")
    _need(host not in {"0.0.0.0", "::", "*"},
          "VGI_CLIENT_REACHABLE_ADDRESS_REQUIRED")
    _need(port is None or 0 < port <= 65535, "VGI_CLIENT_ADDRESS_INVALID")
    return value


def prepare_handover(state, runtime, publication, selection, *, source_files=None):
    """Return the complete ZIP and inspected selection from the original owner.

    expected_revision and listener_request_id bind what the operator inspected.
    The package records the actual running alias and the distinct current head.
    A future attachment is still a new live VGI read; the receiving client must
    inspect the actual remote selection and preserve its own resulting output.
    """
    _need(isinstance(selection, dict) and set(selection) == {
        "publication_id", "listener_request_id", "expected_revision",
        "expected_head_revision", "client_address", "address_note"},
        "VGI_CLIENT_SELECTION_INVALID")
    for value in (state, runtime, publication):
        _need(isinstance(value, dict), "VGI_CLIENT_ORIGINAL_CONTEXT_REQUIRED")
    selected_id = selection["publication_id"]
    _need(isinstance(selected_id, str) and _ID.fullmatch(selected_id),
          "VGI_CLIENT_PUBLICATION_REQUIRED")
    _need(_integer(selection["expected_revision"])
          and selection["expected_revision"] == state.get("revision"),
          "VGI_CLIENT_SERVICE_CHANGED")
    _need(runtime.get("observed") == "RUNNING"
          and isinstance(runtime.get("request_id"), str)
          and runtime["request_id"] == selection["listener_request_id"],
          "VGI_CLIENT_ORIGINAL_LISTENER_REQUIRED")
    catalog = runtime.get("catalog")
    _need(isinstance(catalog, dict) and _integer(catalog.get("revision")),
          "VGI_CLIENT_CATALOG_REQUIRED")
    _need(isinstance(catalog.get("catalog_name"), str)
          and _NAME.fullmatch(catalog["catalog_name"]), "VGI_CLIENT_CATALOG_NAME_REQUIRED")
    for name in ("workspace_id", "service_id"):
        _need(isinstance(state.get(name), str) and state[name]
              and publication.get(name) == state[name]
              and catalog.get(name) == state[name],
              "VGI_CLIENT_ORIGINAL_CONTEXT_CHANGED")
    _need(publication.get("publication_id") == selected_id,
          "VGI_CLIENT_PUBLICATION_CHANGED")
    table_name = publication.get("table_name")
    _need(isinstance(table_name, str) and _NAME.fullmatch(table_name),
          "VGI_CLIENT_TABLE_INVALID")
    running = [row for row in catalog.get("tables", [])
               if isinstance(row, dict) and row.get("name") == table_name]
    current = [row for row in state.get("tables", [])
               if isinstance(row, dict) and row.get("name") == table_name]
    _need(len(running) == len(current) == 1, "VGI_CLIENT_TABLE_REQUIRED")
    running, current = running[0], current[0]
    _need(current.get("active") is True, "VGI_CLIENT_TABLE_RETIRED")
    _need(_integer(selection["expected_head_revision"])
          and selection["expected_head_revision"] == current.get("head_revision"),
          "VGI_CLIENT_CURRENT_HEAD_CHANGED")
    _need(running.get("publication_id") == selected_id
          and running.get("function_name") == "sf_result_" + selected_id
          and _integer(running.get("head_revision")),
          "VGI_CLIENT_SELECT_RUNNING_EDITION")
    _need(_integer(publication.get("rows"))
          and running.get("rows") == publication["rows"],
          "VGI_CLIENT_ROW_IDENTITY_CHANGED")
    columns = publication.get("arrow_columns")
    _need(isinstance(columns, list) and columns
          and all(isinstance(row, dict) for row in columns),
          "VGI_CLIENT_SCHEMA_REQUIRED")
    names = [row.get("name") for row in columns]
    quoted = [_quote(name) for name in names]
    _need(len(set(names)) == len(names), "VGI_CLIENT_SCHEMA_CHANGED")
    schema_sha = publication.get("arrow_schema_sha256")
    _need(isinstance(schema_sha, str) and _ID.fullmatch(schema_sha),
          "VGI_CLIENT_SCHEMA_REQUIRED")
    source = publication.get("source")
    _need(isinstance(source, dict)
          and isinstance(source.get("export_id"), str)
          and _ID.fullmatch(source["export_id"]),
          "VGI_CLIENT_ORIGINAL_EXPORT_REQUIRED")
    address = _address(selection["client_address"])
    original_address = runtime.get("address")
    _need(isinstance(original_address, str) and original_address,
          "VGI_CLIENT_LISTENER_ADDRESS_REQUIRED")
    note = selection["address_note"]
    _need(isinstance(note, str) and len(note) <= 12000 and "\x00" not in note,
          "VGI_CLIENT_ADDRESS_NOTE_INVALID")
    _need(address == original_address or bool(note.strip()),
          "VGI_CLIENT_ADDRESS_CHANGE_REASON_REQUIRED")
    configuration = {
        "schema": SCHEMA,
        "workspace_id": state["workspace_id"], "service_id": state["service_id"],
        "publication_id": selected_id, "export_id": source["export_id"],
        "table_name": table_name, "schema_name": "results",
        "address": address, "listener_address": original_address,
        "address_note": note, "listener_request_id": runtime["request_id"],
        "catalog_revision": catalog["revision"],
        "head_revision": running["head_revision"],
        "current_service_revision": state["revision"],
        "current_head_revision": current["head_revision"],
        "current_publication_id": current["publication_id"],
        "catalog_name": catalog["catalog_name"],
        "attach_alias": "purchased", "token_env": "RESULT_SERVICE_TOKEN",
        "expected_rows": publication["rows"],
        "expected_arrow_schema_sha256": schema_sha,
        "query_file": "query.sql",
        "selection_semantics": "observed-running-alias; inspect actual attachment before each query",
    }
    sql = ("-- Query the already retained result through its selected live VGI alias.\n"
           "-- A later listener restart may select another edition; inspect the actual attachment.\n"
           "SELECT\n    " + ",\n    ".join(quoted)
           + "\nFROM \"purchased\".\"results\"." + _quote(table_name) + ";\n")
    if source_files is None:
        root = resources.files(__package__)
        source_files = {
            "result_sql_client.py": root.joinpath("result_sql_client.py").read_text(encoding="utf-8"),
            "README.md": root.joinpath("CLIENT_HANDOVER.md").read_text(encoding="utf-8"),
        }
    _need(isinstance(source_files, dict)
          and set(source_files) == {"result_sql_client.py", "README.md"}
          and all(isinstance(text, str) and text for text in source_files.values()),
          "VGI_CLIENT_COMPLETE_SOURCE_REQUIRED")
    files = {
        "connection.json": _json(configuration),
        "publication.json": _json(publication),
        "query.sql": sql.encode("utf-8"),
        **{name: text.encode("utf-8") for name, text in source_files.items()},
    }
    descriptors = [{
        "name": name, "bytes": len(raw), "sha256": _digest(raw),
        "mime": "application/json" if name.endswith(".json") else
                "text/x-python" if name.endswith(".py") else "text/plain",
    } for name, raw in files.items()]
    manifest = {
        "schema": SCHEMA + ".package", "configuration_sha256": _digest(files["connection.json"]),
        "publication_sha256": _digest(files["publication.json"]), "files": descriptors,
        "workspace_id": state["workspace_id"], "service_id": state["service_id"],
        "publication_id": selected_id,
    }
    files["manifest.json"] = _json(manifest)
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in files.items():
            member = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            member.compress_type = zipfile.ZIP_DEFLATED
            member.external_attr = 0o100600 << 16
            archive.writestr(member, raw)
    data = stream.getvalue()
    return {
        "schema": SCHEMA + ".prepared", "configuration": configuration,
        "publication": publication, "query": sql,
        "files": descriptors + [{"name": "manifest.json", "bytes": len(files["manifest.json"]),
                                  "sha256": _digest(files["manifest.json"]), "mime": "application/json"}],
        "zip": {"filename": "vgi-sql-" + table_name + "-" + selected_id[:12] + ".zip",
                "bytes": len(data), "sha256": _digest(data),
                "content_base64": base64.b64encode(data).decode("ascii")},
    }
