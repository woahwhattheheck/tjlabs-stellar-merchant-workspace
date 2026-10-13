"""Typed custody for complete saved Airflow handovers in original Operations.

The original Airflow reader remains the source authority. This module adds an
explicit attachment class and joins its exact bytes/events to the existing
Operations case. It does not execute a DAG or create a provider observation.
"""
from __future__ import annotations

import base64
import hashlib
import re

from model import Problem
import operations_dcat_sources as dcat_sources

ACTION = "airflow-source.add"
SCHEMA = "stellar-forge.operations-airflow-source.v1"
HANDOVER_SCHEMA = "commons.openlineage.airflow-handover.v1"
MAX_SOURCE = 128 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_BUNDLE = 320 * 1024 * 1024
MAX_JSON_REQUEST = ((MAX_SOURCE + 2) // 3) * 4 + 1024 * 1024
MAX_ORDINARY_TOTAL = 24 * 1024 * 1024
MAX_ORDINARY_BUNDLE = 32 * 1024 * 1024
HASH = re.compile(r"[a-f0-9]{64}")
COUNTS = ("operatorFiles", "applicationFiles", "documentFiles", "objectFiles")
MARKER_FIELDS = {"schema", "handoverSchema", "workspaceId", "revision", "operationId",
                 "payloadSha256", "workspacePackageSha256", "sourceEditionIds", *COUNTS}


def fail(message, code="AIRFLOW_SOURCE_INVALID", status=422):
    raise Problem(message, status, code)


def integer(value, maximum):
    return type(value) is int and 0 <= value <= maximum


def validate_marker(value):
    if not isinstance(value, dict) or set(value) != MARKER_FIELDS:
        fail("The complete Airflow transport descriptor is required.")
    if value["schema"] != SCHEMA or value["handoverSchema"] != HANDOVER_SCHEMA:
        fail("The retained source is not a supported Airflow handover.")
    if any(not isinstance(value[key], str) or not 0 < len(value[key]) <= 4096
           for key in ("workspaceId", "operationId")):
        fail("The original Airflow operation and workspace identities are required.")
    if not integer(value["revision"], 2**53 - 1):
        fail("The original Airflow workspace revision is invalid.")
    if any(not isinstance(value[key], str) or not HASH.fullmatch(value[key])
           for key in ("payloadSha256", "workspacePackageSha256")):
        fail("The complete original Airflow package hashes are required.")
    if any(not integer(value[key], 100000) for key in COUNTS):
        fail("The original Airflow package inventory is invalid.")
    if value["operatorFiles"] not in (16, 18) or not value["applicationFiles"] or value["documentFiles"] < 2:
        fail("Receive the complete operator, application and original commissioning documents.")
    editions = value["sourceEditionIds"]
    if (not isinstance(editions, list) or not 2 <= len(editions) <= 100000
            or any(not isinstance(x, str) or not 0 < len(x) <= 4096 for x in editions)
            or len(set(editions)) != len(editions) or sorted(editions) != editions):
        fail("Retain at least two distinct original source editions.")
    return value


def inspect(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_SOURCE:
        fail("A complete saved Airflow handover must be at most 128 MiB.", status=413)
    # Lazy import preserves the original Operations/Installation module graph.
    # The installed source reader performs the full nested package verification.
    from operations_airflow import _engine
    result = _engine({"action": "inspect", "sourceBase64": base64.b64encode(raw).decode("ascii")})
    if (not isinstance(result, dict)
            or result.get("schema") != "stellar-forge.airflow-installation-source.v1"
            or result.get("file") != {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
            or not isinstance(result.get("package"), dict) or not isinstance(result.get("cohort"), list)):
        fail("The installed Airflow reader returned an unbound original-source receipt.")
    package = result["package"]
    try:
        editions = sorted({row["reference"]["editionId"] for row in result["cohort"]})
        marker = {"schema": SCHEMA, "handoverSchema": HANDOVER_SCHEMA,
                  **{key: package[key] for key in ("workspaceId", "revision", "operationId",
                      "payloadSha256", "workspacePackageSha256", *COUNTS)},
                  "sourceEditionIds": editions}
    except (KeyError, TypeError, ValueError) as exc:
        raise Problem("The complete Airflow source identities are unavailable.", 422,
                      "AIRFLOW_SOURCE_INVALID") from exc
    return validate_marker(marker)


def validate_source(metadata, raw):
    if "dcatWorkspace" in metadata or "buyerHandoff" in metadata:
        fail("An Airflow handover cannot impersonate another original source class.")
    marker = validate_marker(metadata.get("airflowHandover"))
    if (not isinstance(raw, bytes) or len(raw) != metadata.get("bytes")
            or hashlib.sha256(raw).hexdigest() != metadata.get("sha256")
            or inspect(raw) != marker):
        fail("The complete Airflow source differs from its original transport receipt.")
    return marker


def source_budget(rows):
    rows = list(rows)
    if len(rows) > 200:
        fail("Retain at most 200 original sources.", status=413)
    other, airflow, dcat = [], 0, 0
    for row in rows:
        if not isinstance(row, dict) or not integer(row.get("bytes"), MAX_TOTAL):
            fail("The retained source byte count is invalid.")
        if "airflowHandover" in row:
            if "dcatWorkspace" in row or "buyerHandoff" in row:
                fail("A retained Airflow source has more than one attachment class.")
            validate_marker(row["airflowHandover"])
            if not 0 < row["bytes"] <= MAX_SOURCE:
                fail("An Airflow source must be nonempty and at most 128 MiB.", status=413)
            airflow += row["bytes"]
        else:
            other.append(row)
            if "dcatWorkspace" in row:
                dcat += row["bytes"]
    original_limit = dcat_sources.source_budget(other)
    if airflow + dcat > MAX_TOTAL:
        fail("Retain at most 256 MiB of complete Airflow and DCAT source bytes combined.", status=413)
    return MAX_BUNDLE if airflow else original_limit


def validate_events(rows, events):
    rows = list(rows)
    dcat_sources.validate_events(rows, events)
    originals = {row["id"]: row for row in rows if "airflowHandover" in row}
    seen = set()
    for event in events:
        if event.get("action") != ACTION:
            continue
        ident = event.get("recordId")
        if (ident not in originals or ident in seen or event.get("kind") != "source"
                or event.get("before") is not None or event.get("after") != originals[ident]):
            fail("The complete Airflow source does not join its original attachment event.")
        seen.add(ident)
    if seen != set(originals):
        fail("A retained Airflow source is missing its original attachment event.")


def native_bundle(raw):
    # The maintained recognizer accepts only the original flat Operations case;
    # it does not classify an attachment as DCAT or relax report-wrapper limits.
    return dcat_sources.native_bundle(raw)


def request_limit(path):
    if re.fullmatch(r"/api/operations/operation-[a-f0-9]{32}/airflow-source", path):
        return MAX_JSON_REQUEST
    return dcat_sources.request_limit(path)
