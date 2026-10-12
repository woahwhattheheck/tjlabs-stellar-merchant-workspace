#!/usr/bin/env python3
"""Export one saved GIS mapping plan through its original workspace and source readers."""
from __future__ import annotations
import argparse
import base64
import hashlib
import importlib
import json
import os
import stat
import sys
import tempfile
from pathlib import Path

SCHEMA = "starforge.gis-migration-mapping-register.v1"

def original_file(files, root, descriptor):
    """The returned bytes, not an earlier pathname read, must match the original descriptor."""
    descriptor = files.descriptor(descriptor)
    path = files.member(root, descriptor["path"])
    before = path.lstat()
    files.need(stat.S_ISREG(before.st_mode) and not path.is_symlink(),
               "MAPPING_REGISTER_REGULAR_SOURCE", descriptor["path"])
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        files.need((before.st_dev, before.st_ino) == (opened.st_dev, opened.st_ino),
                   "MAPPING_REGISTER_SOURCE_CHANGED", descriptor["path"])
        with os.fdopen(fd, "rb", closefd=False) as stream:
            raw = stream.read()
        after = os.fstat(fd)
        selected = path.lstat()
        identity = lambda value: (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
        files.need(identity(opened) == identity(after) == identity(selected)
                   and len(raw) == descriptor["bytes"]
                   and hashlib.sha256(raw).hexdigest() == descriptor["sha256"],
                   "MAPPING_REGISTER_SOURCE_CHANGED", descriptor["path"])
        return raw
    finally:
        os.close(fd)

def load_original(stac_root):
    root = Path(stac_root).expanduser().resolve()
    required = root / "migration" / "workspace.py"
    if not required.is_file() or required.is_symlink():
        raise ValueError("Select the complete original migration source directory.")
    existing = sys.modules.get("migration")
    if existing is not None and Path(existing.__file__).resolve() != root / "migration" / "__init__.py":
        raise ValueError("Keep one original migration package in this process.")
    sys.path.insert(0, str(root))
    workspace = importlib.import_module("migration.workspace")
    native = importlib.import_module("migration.native")
    return workspace.Workspace, native

def export_register(stac_root, workspace_directory, plan_id, expected_workspace_id=None):
    Workspace, native = load_original(stac_root)
    files, vector, model = native.files, native.vector, native.model
    workspace = Workspace(workspace_directory, create=False)
    state = workspace.read()
    if expected_workspace_id is not None:
        files.need(state["id"] == expected_workspace_id, "MAPPING_REGISTER_WORKSPACE_CHANGED")
    record = workspace._metadata("plans", plan_id, state=state)
    capture_record = workspace._metadata("captures", record["captureId"], state=state)
    plan_raw = original_file(files, workspace.root, record["file"])
    review_raw = original_file(files, workspace.root, record["reviewFile"])
    plan, audit = files.parse_json(plan_raw), files.parse_json(review_raw)
    files.need(files.digest(plan) == plan_id and plan["captureId"] == capture_record["id"]
               and audit["planId"] == plan_id and audit["captureId"] == capture_record["id"],
               "MAPPING_REGISTER_PLAN_SOURCE_CHANGED")
    capture = vector.open_capture(workspace._path(capture_record["path"]), capture_record["id"])
    capture_root = Path(capture["directory"])
    manifest_raw = original_file(files, capture_root, capture["manifestFile"])
    inspection_descriptor = next(row for row in capture["manifest"]["files"] if row["path"] == "inspection.json")
    inspection_raw = original_file(files, capture_root, inspection_descriptor)
    inspection = files.parse_json(inspection_raw)
    files.need(files.canonical(inspection) == files.canonical(capture["inspection"]),
               "MAPPING_REGISTER_INSPECTION_CHANGED")
    # Every record is selected from the same original state; its retained files are immutable.
    history = [row for row in state["migration"]["reviews"] if row["planId"] == plan_id]
    latest_review = history[-1] if history else None
    source_layers = {row["id"]: row for row in inspection["layers"]}
    audited = {row["sourceLayerId"]: row for row in audit["layers"]}
    text = lambda value: "" if value is None else value if isinstance(value, str) else files.canonical(value)
    count = lambda value: str(value) if value is not None else ""
    field_rows, layer_rows, key_rows, project_rows, profile_rows, decision_rows = [], [], [], [], [], []
    for layer in plan["layers"]:
        layer_id = layer["sourceLayerId"]
        source = source_layers[layer_id]
        review = audited[layer_id]
        layer_rows.append({
            "layer_id": layer_id, "source_name": source["name"], "source_id": source["sourceId"],
            "source_file": source["sourcePath"], "source_sha256": source["sourceSha256"],
            "table": layer["table"], "title": layer["title"], "features": count(source["counts"]["features"]),
            "null_geometries": count(source["counts"]["nullGeometry"]), "geometry_types_json": text(source["counts"]["geometryTypes"]),
            "geometry_null_policy": layer["geometryNulls"], "source_crs_wkt": text(source.get("crsWkt")),
            "source_crs_choice": text(layer.get("sourceCrs")), "assigned_source_crs": text(layer.get("assignSourceCrs")),
            "target_crs": text(layer.get("targetCrs")), "issues": count(review["issues"]), "note": layer["note"],
        })
        for field in layer["fields"]:
            observed = source["fields"][field["source"]]
            field_rows.append({
                "layer_id": layer_id, "source_field": field["source"], "destination_field": field["name"],
                "mode": field["mode"], "physical_type_choice": text(field.get("physicalType")),
                "shapefile_name_choice": text(field.get("shapefileName")), "null_policy": field["nullPolicy"],
                "source_declared_type": text(observed.get("declaredNativeType")),
                "source_kinds": ", ".join(observed.get("kinds", [])),
                "present": count(observed.get("present")), "absent": count(observed.get("absent")),
                "nulls": count(observed.get("nulls")), "source_statistics_json": text(observed), "note": field["note"],
            })
        for key in layer["keys"]:
            for order, field in enumerate(key["fields"], 1):
                key_rows.append({"layer_id": layer_id, "key": key["name"], "position": str(order),
                                 "source_field": field, "null_policy": key["nulls"], "note": key["note"]})
        for driver, fields in review["fields"].items():
            for order, field in enumerate(fields, 1):
                profile_rows.append({"layer_id": layer_id, "driver": driver, "position": str(order),
                    "source_field": text(field.get("sourceName")), "destination_field": text(field.get("targetName")),
                    "physical_type": text(field.get("physicalType")), "codec": text(field.get("codec")),
                    "complete_profile_json": text(field)})
    for project in plan["projectDefinitions"]:
        for order, layer_id in enumerate(project["sourceLayerIds"], 1):
            project_rows.append({"project_id": project["id"], "title": project["title"],
                "project_crs": text(project.get("projectCrs")), "format": project["format"],
                "layer_position": str(order), "layer_id": layer_id,
                "layer_options_json": text((project.get("layerOptions") or {}).get(layer_id))
                    if isinstance(project.get("layerOptions") or {}, dict) else text(project["layerOptions"]),
                "complete_definition_json": text(project)})
    for order, decision in enumerate(plan.get("pendingDecisions", []), 1):
        decision_rows.append({"position": str(order), "kind": decision["kind"],
            "layer_id": text(decision.get("sourceLayerId")), "project_id": text(decision.get("projectId")),
            "decision": decision["decision"], "note": text(decision.get("note")), "complete_decision_json": text(decision)})
    provenance = [
        {"kind": "plan", **record["file"]}, {"kind": "full_source_review", **record["reviewFile"]},
        {"kind": "capture_manifest", **capture_record["manifestFile"]},
        {"kind": "source_inspection", **{**inspection_descriptor, "path": capture_record["path"] + "/" + inspection_descriptor["path"]}},
    ]
    for source in capture["manifest"]["selection"]["sources"]:
        provenance.append({"kind": "original_source", "source_id": source["id"], **files.descriptor(source)})
        provenance.extend({"kind": "original_source_member", "source_id": source["id"], **files.descriptor(member)} for member in source.get("members", []))
    for item in record.get("files", []):
        if item["path"] not in {row["path"] for row in provenance}:
            provenance.append({"kind": "plan_retained_file", **item})
    originals = {
        "plan": {"descriptor": record["file"], "content_base64": base64.b64encode(plan_raw).decode("ascii")},
        "source_review": {"descriptor": record["reviewFile"], "content_base64": base64.b64encode(review_raw).decode("ascii")},
        "capture_manifest": {"descriptor": capture["manifestFile"], "content_base64": base64.b64encode(manifest_raw).decode("ascii")},
        "source_inspection": {"descriptor": inspection_descriptor, "content_base64": base64.b64encode(inspection_raw).decode("ascii")},
    }
    for key, owner in (("plan_input", record), ("selection_input", capture_record)):
        if owner.get("inputId"):
            item = workspace._metadata("inputs", owner["inputId"], state=state)
            raw = original_file(files, workspace.root, item["file"])
            originals[key] = {"descriptor": item["file"], "content_base64": base64.b64encode(raw).decode("ascii")}
            provenance.append({"kind": key, **item["file"]})
    return {
        "schema": SCHEMA,
        "workspace": {"id": state["id"], "title": state["title"], "revision": state["revision"]},
        "plan_id": plan_id, "capture_id": capture_record["id"], "selection_id": capture["manifest"]["selection"]["id"],
        "title": plan["title"], "plan_note": plan["note"], "predecessor_plan_id": plan.get("predecessorPlanId"),
        "formats": plan["formats"], "postgis_schema": plan["postgisSchema"],
        "review": {"source_constraints_valid": audit["valid"], "source_issues": count(audit["issues"]),
                   "features": count(audit["features"]), "latest": latest_review, "history": history},
        "source_edition_json": files.canonical(capture["manifest"]["selection"]["sourceEdition"]),
        "source_changes_json": text(plan.get("sourceChanges")),
        "fields": field_rows, "layers": layer_rows, "keys": key_rows,
        "projects": project_rows, "native_profiles": profile_rows, "decisions": decision_rows,
        "provenance": provenance,
        "originals": originals,
        "exporter": {"filename": Path(__file__).name,
                     "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
    }

def save_new(path, raw):
    path = Path(path).expanduser().absolute()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.path.lexists(path):
        if path.is_symlink() or not path.is_file() or path.read_bytes() != raw:
            raise ValueError("Keep the existing register; select a new path for a later saved plan or review.")
        return
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError:
            save_new(path, raw)
        dfd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try: os.fsync(dfd)
        finally: os.close(dfd)
    finally:
        Path(temporary).unlink(missing_ok=True)

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stac-root", required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--plan-id", required=True)
    parser.add_argument("--expected-workspace-id")
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    value = export_register(args.stac_root, args.workspace, args.plan_id, args.expected_workspace_id)
    # Use the original Decimal-preserving serializer throughout the retained source document.
    _, native = load_original(args.stac_root)
    raw = native.files.json_bytes(value)
    save_new(args.output, raw)
    print(json.dumps({"state": "EXPORTED", "workspace_id": value["workspace"]["id"],
        "workspace_revision": value["workspace"]["revision"], "plan_id": value["plan_id"],
        "capture_id": value["capture_id"], "review_id": (value["review"]["latest"] or {}).get("id"),
        "review_outcome": (value["review"]["latest"] or {}).get("outcome"), "fields": len(value["fields"]),
        "layers": len(value["layers"]), "path": str(Path(args.output).absolute()),
        "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}))
if __name__ == "__main__":
    main()
