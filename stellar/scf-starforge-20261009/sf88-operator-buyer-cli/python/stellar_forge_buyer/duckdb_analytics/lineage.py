"""Original source lineage for retained native analytical result relations."""
from __future__ import annotations

import hashlib
import re

from ..errors import StateError
from ..storage import parse

_HEX = re.compile(r"[0-9a-f]{64}")


def references(db, relation):
    folded = relation.casefold()
    choices = (("sf_analytics_result_", "sf_analytics_results", "result_id"),
               ("sf_analytics_comparison_", "sf_analytics_comparisons", "comparison_id"))
    selected = next((item for item in choices if folded.startswith(item[0])), None)
    if selected is None:
        return None
    prefix, table, id_field = selected
    suffix = folded[len(prefix):]
    if not _HEX.fullmatch(suffix):
        return None
    schema = db.execute("SELECT value FROM sf_workspace WHERE key='analytics_schema'").fetchone()
    if schema is None:
        return None
    if schema[0] != "stellar-forge.duckdb-analytics.v1":
        raise StateError("DUCKDB_ANALYTICS_SCHEMA_CHANGED")
    row = db.execute("SELECT record,sha256 FROM " + table + " WHERE table_name=?", [folded]).fetchone()
    if row is None:
        return None
    if hashlib.sha256(row[0].encode()).hexdigest() != row[1]:
        raise StateError("DUCKDB_ANALYTICS_RETAINED_RECORD_CHANGED")
    record = parse(row[0].encode())
    editions = record.get("source_editions")
    if (record.get(id_field) != suffix or record.get("table") != folded
            or not isinstance(editions, list) or not editions
            or any(not isinstance(value, str) or not _HEX.fullmatch(value) for value in editions)):
        raise StateError("DUCKDB_ANALYTICS_SOURCE_LINEAGE_CHANGED")
    descriptor = {"kind": record["kind"], "id": suffix, "relation": relation,
                  "source_editions": editions, "fingerprint": record["fingerprint"],
                  "record_sha256": row[1]}
    if record["kind"] == "result":
        descriptor["analysis"] = {"id": record["analysis_id"], "revision": record["analysis_revision"]}
        descriptor["dimensions"] = record["dimensions"]
        descriptor["measures"] = record["measures"]
    else:
        descriptor["before_id"], descriptor["after_id"] = record["before_id"], record["after_id"]
        descriptor["change_calculation"] = record["change_calculation"]
    return {"edition_ids": editions, "derived_result": descriptor}
