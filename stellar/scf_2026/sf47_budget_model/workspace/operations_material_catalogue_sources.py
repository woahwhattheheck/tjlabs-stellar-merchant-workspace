"""Typed complete Material Catalog custody on the original Operations case."""
from __future__ import annotations
import base64
import hashlib
import re
from model import Problem
import operations_airflow_sources as original_sources

ACTION = "material-catalog-source.add"
SCHEMA = "stellar-forge.operations-material-catalogue-source.v1"
MAX_SOURCE = 128 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
MAX_BUNDLE = 320 * 1024 * 1024
MAX_JSON_REQUEST = ((MAX_SOURCE + 2) // 3) * 4 + 1024 * 1024
HASH = re.compile(r"[a-f0-9]{64}")
FIELDS = {"schema", "bundleSchema", "catalogId", "tenantId", "revision",
          "activeEditionId", "sourceBytes", "records"}
OTHER_CLASSES = {"airflowHandover", "dcatWorkspace", "buyerHandoff"}


def fail(message, code="MATERIAL_CATALOGUE_SOURCE_INVALID", status=422):
    raise Problem(message, status, code)


def validate_marker(value):
    if not isinstance(value, dict) or set(value) != FIELDS or value.get("schema") != SCHEMA:
        fail("Retain the complete original material-source descriptor.")
    if value["bundleSchema"] not in ("stellar-forge.material-catalog-bundle.v1",
                                     "stellar-forge.material-catalog-bundle.v2"):
        fail("Select a supported complete original catalogue edition.")
    for key in ("catalogId", "tenantId"):
        if not isinstance(value[key], str) or not 0 < len(value[key]) <= 4096:
            fail("Keep the original material catalogue and tenant identities.")
    active = value["activeEditionId"]
    if active is not None and (not isinstance(active, str) or not 0 < len(active) <= 4096):
        fail("Keep the original active-edition identity.")
    for key in ("revision", "sourceBytes"):
        if type(value[key]) is not int or not 0 <= value[key] <= 2**53 - 1:
            fail("Keep the original whole material-source counts.")
    records = value["records"]
    if (not isinstance(records, dict) or not records or len(records) > 100 or
            any(not isinstance(key, str) or not key.startswith("catalog_") or
                type(count) is not int or not 0 <= count <= 2**53 - 1
                for key, count in records.items())):
        fail("Keep the complete original catalogue table counts.")
    return value


def inspect(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_SOURCE:
        fail("The complete source must be nonempty and at most 128 MiB.", status=413)
    from operations_material_catalogue import _engine
    result = _engine({"action": "custody", "sourceBase64": base64.b64encode(raw).decode("ascii")})
    summary = result.get("summary") if isinstance(result, dict) else None
    if (not isinstance(result, dict) or result.get("schema") != "stellar-forge.material-source-desk-custody.v1" or
            result.get("file") != {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()} or
            not isinstance(summary, dict)):
        fail("The original reader returned an unbound complete source.")
    try:
        marker = {"schema": SCHEMA, "bundleSchema": summary["schema"],
                  **{key: summary[key] for key in ("catalogId", "tenantId", "revision",
                      "activeEditionId", "sourceBytes", "records")}}
    except KeyError as exc:
        raise Problem("The complete original catalogue identity is missing.", 422,
                      "MATERIAL_CATALOGUE_SOURCE_INVALID") from exc
    return validate_marker(marker)


def validate_source(metadata, raw, *, inspect_original=True):
    if OTHER_CLASSES.intersection(metadata):
        fail("A material catalogue must retain its own single source class.")
    marker = validate_marker(metadata.get("materialCatalogue"))
    if (not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_SOURCE or
            len(raw) != metadata.get("bytes") or
            hashlib.sha256(raw).hexdigest() != metadata.get("sha256")):
        fail("The complete material catalogue differs from its original receipt.")
    # Add and whole-case import inspect the complete original model. An immutable
    # saved read checks its exact bytes and marker without spawning another parser.
    if inspect_original and inspect(raw) != marker:
        fail("The original catalogue content differs from its retained description.")
    return marker


def source_budget(rows):
    rows = list(rows)
    if len(rows) > 200:
        fail("Retain at most 200 complete original sources.", status=413)
    material, other, other_typed = 0, [], 0
    for row in rows:
        if not isinstance(row, dict) or type(row.get("bytes")) is not int or not 0 <= row["bytes"] <= MAX_TOTAL:
            fail("Keep the original source byte counts.")
        if "materialCatalogue" in row:
            if OTHER_CLASSES.intersection(row):
                fail("A material catalogue cannot carry another source class.")
            validate_marker(row["materialCatalogue"])
            if not 0 < row["bytes"] <= MAX_SOURCE:
                fail("A complete material catalogue is limited to 128 MiB.", status=413)
            material += row["bytes"]
        else:
            other.append(row)
            if "airflowHandover" in row or "dcatWorkspace" in row:
                other_typed += row["bytes"]
    original_limit = original_sources.source_budget(other)
    if material + other_typed > MAX_TOTAL:
        fail("Keep all complete material, Airflow and DCAT source bytes within the existing 256 MiB total.", status=413)
    return MAX_BUNDLE if material else original_limit


def validate_events(rows, events):
    rows = list(rows)
    original_sources.validate_events(rows, events)
    originals = {row["id"]: row for row in rows if "materialCatalogue" in row}
    seen = set()
    for event in events:
        if event.get("action") != ACTION:
            continue
        ident = event.get("recordId")
        if (ident not in originals or ident in seen or event.get("kind") != "source" or
                event.get("before") is not None or event.get("after") != originals[ident]):
            fail("The complete material source does not join its original attachment event.")
        seen.add(ident)
    if seen != set(originals):
        fail("A retained material source is missing its original attachment event.")


def native_bundle(raw):
    return original_sources.native_bundle(raw)


def request_limit(path):
    if re.fullmatch(r"/api/operations/operation-[a-f0-9]{32}/material-catalog-source", path):
        return MAX_JSON_REQUEST
    return original_sources.request_limit(path)
