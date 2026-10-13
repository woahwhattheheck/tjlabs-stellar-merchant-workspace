"""Load the documented development operation; never label it City or vendor data."""
from pathlib import Path
import json

from .adapters import KINDS, TRANSITIONS
from .engine import ID

FILES = Path(__file__).parent / "development"


def load(workspace):
    actor = "Development operator"
    created = workspace.create_project("McPherson module G2 · development operation", "development", actor)
    project_id = created["id"]
    def call(method, **payload):
        return method(project_id, workspace.project(project_id)["revision"], actor, ID(), **payload)
    mappings = json.loads((FILES / "mappings.json").read_text())
    for kind, filename, file_format in (
        ("source_assets", "source-assets.geojson", "geojson"),
        ("target_assets", "target-assets-needs-repair.csv", "csv"),
        ("locations", "locations.csv", "csv"),
        ("requests", "service-requests.csv", "csv"),
        ("work_orders", "work-orders.csv", "csv"),
        ("roundtrips", "development-roundtrips.jsonl", "jsonl"),
    ):
        call(workspace.import_data, kind=kind, filename=filename, file_format=file_format, body=(FILES / filename).read_bytes())
        if kind in KINDS:
            call(workspace.save_mapping, kind=kind, mapping=mappings[kind])
    call(workspace.save_settings, settings={"comparison_fields": ["label", "status", "parent_id", "location_id", "geometry"],
        "transitions": TRANSITIONS, "expected_source_rows": 3, "expected_target_rows": 3,
        "expected_correlation_ids": ["DEVELOPMENT-GIS-001"],
        "attestation": {"supplier_reviewer": "DEVELOPMENT OPERATOR — exercise only",
            "city_data_authorization_ref": "DEVELOPMENT RECORDS — no City authorization claimed",
            "vendor_sow_ref": "DEVELOPMENT SCENARIO — no vendor engagement claimed"}})
    return {"project_id": project_id, "revision": workspace.project(project_id)["revision"],
            "mode": "development", "corrected_target": str(FILES / "target-assets-corrected.csv"),
            "note": "Three development assets, two locations, two service requests and two work orders. Repair the target label and exercise the local returned-update contract."}
