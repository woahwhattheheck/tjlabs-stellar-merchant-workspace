"""An explicitly authored merchandise example for the customer scenario desk."""
from __future__ import annotations

import hashlib
from pathlib import Path
import uuid

from .scenario_store import ScenarioWorkspace
from .scenario_types import encode, fail
from .sqlite_dataset import _FORMAT


def create_example(directory, *, rows: int = 80):
    directory = Path(directory).expanduser().absolute()
    if directory.exists() or type(rows) is not int or not 1 <= rows <= 1000000:
        fail("Choose a new example directory and between one and one million input rows.")
    with ScenarioWorkspace(directory, create=True) as work:
        fields = ["sku", "channel", "units", "price_cents", "cost_cents", "shipping_cents"]
        path = directory / "example-input.jsonl"
        checksum, size = hashlib.sha256(), 0
        with open(path, "xb") as stream:
            for i in range(rows):
                record = {"sku": "SKU-" + str(i + 1).zfill(7), "channel": ("Wholesale", "Direct", "Retail")[i % 3],
                          "units": (i * 7) % 19 + 1, "price_cents": 1400 + (i * 53) % 4700,
                          "cost_cents": 600 + (i * 31) % 1600, "shipping_cents": 180 + (i * 13) % 320}
                raw = (encode(record) + "\n").encode()
                stream.write(raw)
                checksum.update(raw)
                size += len(raw)
        path.chmod(0o600)
        manifest = {"schema": "stellar-forge.authored-example-input.v1", "title": "Authored merchandise planning example",
                    "description": "Illustrative merchandise records authored for this local example; no merchant purchase or provider acquisition is represented.",
                    "rows": rows, "fields": fields, "sha256": checksum.hexdigest(), "bytes": size}
        raw_manifest = encode(manifest).encode()
        identity = {"schema": _FORMAT, "manifestSha256": hashlib.sha256(raw_manifest).hexdigest(),
                    "sourceBindingSha256": checksum.hexdigest(), "columns": [[field, field] for field in fields]}
        imported = work.database._import_rows(manifest_bytes=raw_manifest, identity=identity, fields=fields, mapped=fields,
            total=rows, source={"sha256": checksum.hexdigest(), "bytes": size}, opener=lambda: path.open("rb"),
            details={"dataset": {"kind": "authored-example", "name": "Example merchandise", "rows": rows,
                                  "description": manifest["description"], "projectedFields": fields}, "source_pages": None})
        work.database.activate("merchandise", imported["version_id"], expected_revision=0)
        case_specs = [
            ("current", "Current terms", 0, 0, 2, "9007199254740993.125", "Reference terms; at least two units per line."),
            ("rebate", "Three percent rebate", 300, 0, 2, "9007199254740993.250", "Apply a price rebate to the same selected lines."),
            ("carrier", "Carrier cost increase", 0, 75, 2, "9007199254740992.125", "Increase unit delivery cost by 75 cents."),
            ("all_lines", "Include single-unit lines", 0, 0, 0, "9007199254740993.125", "Broaden the line selection; newly included keys remain visible."),
            ("volume", "Higher-volume lines", 125, -20, 12, "9007199254740993.375", "Review high-volume lines with revised terms and delivery cost."),
        ]
        cases = [{"name": key, "label": label, "note": note,
                  "parameters_text": encode({"discount_bps": discount, "carrier_change_cents": carrier,
                                             "minimum_units": minimum, "limit_decimal": amount})}
                 for key, label, discount, carrier, minimum, amount, note in case_specs]
        common = "((price_cents * (10000 - :discount_bps) + 5000) / 10000 - cost_cents - shipping_cents - :carrier_change_cents) * units"
        sql = "SELECT sku, channel, units, " + common + " AS contribution_cents, :limit_decimal AS requested_limit FROM merchandise WHERE units >= :minimum_units ORDER BY sku"
        total_sql = "SELECT COUNT(*) AS line_count, COALESCE(SUM(units),0) AS units, COALESCE(SUM(" + common + "),0) AS contribution_cents, :limit_decimal AS requested_limit FROM merchandise WHERE units >= :minimum_units"
        for key, statement in (("contribution_by_line", sql), ("contribution_total", total_sql)):
            work.analysis.save_query(key, {"sql": statement, "parameters_text": cases[0]["parameters_text"], "max_rows": 1000}, expected_revision=0)
        request = {"id": uuid.uuid4().hex, "name": "merchandise_terms", "expected_revision": 0,
                   "title": "Merchandise terms comparison", "question": "How do the selected price, delivery-cost and minimum-volume terms change contribution on the retained example lines?",
                   "baseline": "current", "cases": cases,
                   "measures": [
                       {"name": "lines", "title": "Contribution by merchandise line", "query_name": "contribution_by_line", "query_revision": 1,
                        "keys": ["sku"], "metrics": [{"column": "contribution_cents", "label": "Contribution", "unit": "cents"},
                                                       {"column": "requested_limit", "label": "Requested limit", "kind": "decimal"}]},
                       {"name": "total", "title": "Selected-line totals", "query_name": "contribution_total", "query_revision": 1,
                        "keys": [], "metrics": ["line_count", "units", {"column": "contribution_cents", "label": "Contribution", "unit": "cents"}]}]}
        saved = work.save(request)
        return {"directory": str(directory), "input_rows": rows, "version_id": imported["version_id"], "definition": saved}
