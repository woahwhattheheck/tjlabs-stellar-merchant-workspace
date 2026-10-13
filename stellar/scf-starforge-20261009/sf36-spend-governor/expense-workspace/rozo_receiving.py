"""Trusted complete-project validation for retained ROZO sources and purchases."""
import json
from domain import canonical
from native_rozo import FEATURE, original_bytes, inspect_original, project_original


def inspect_rozo_sources(database, manifest, node=None):
    sources = {ident: json.loads(body) for ident, body in database.execute("SELECT id,body FROM sources")
        if json.loads(body).get("kind") == "rozo_report"}
    retained, inspected_files = {}, {}
    for source_id, source in sources.items():
        identity = source.get("identity")
        if (source.get("id") != source_id or not isinstance(identity, dict) or
                set(identity) != {"kind", "origin_id", "profile_id"} or identity.get("kind") != "rozo_report" or
                not source.get("immutable_intake")):
            raise ValueError("An original ROZO source differs from its retained identity.")
        for ident, parent, status, created, body in database.execute(
                "SELECT id,parent_id,status,created_at,body FROM captures WHERE source_id=?", (source_id,)):
            value = json.loads(body)
            snapshot = value.get("snapshot", {})
            raw = original_bytes(snapshot)
            key = snapshot["source_sha256"]
            # This installation's trusted pure reader validates the raw source.
            # No script from the archive being received is executed.
            if key not in inspected_files:
                inspected_files[key] = inspect_original(raw, node)
            actual = inspected_files[key]
            inspected = snapshot.get("inspection", {})
            if (value.get("id") != ident or value.get("source_id") != source_id or value.get("parent_id") != parent or
                    value.get("status") != status or value.get("created_at") != created or
                    value.get("identity") != identity or value.get("path") != source.get("path") or
                    source.get("path") != "rozo-report:" + actual["sourceId"] or
                    snapshot.get("schema") != FEATURE or snapshot.get("source_bytes") != len(raw) or
                    canonical(inspected) != canonical(actual) or
                    identity["origin_id"] != actual["originId"] or identity["profile_id"] != actual["profileId"] or
                    value.get("rozo_intake", {}).get("data_context") != source.get("data_context")):
                raise ValueError("A retained ROZO capture lost its complete original source binding.")
            selection, projected = project_original(actual, snapshot.get("selection"), source["data_context"])
            if selection != snapshot["selection"] or canonical(projected) != canonical(value.get("report")):
                raise ValueError("A retained purchase projection differs from its original ROZO report or explicit selection.")
            retained[ident] = value
        current = source.get("current_capture")
        if current is not None and (current not in retained or retained[current]["source_id"] != source_id or
                                    retained[current]["status"] != "ACCEPTED"):
            raise ValueError("An original ROZO source lacks its current accepted capture.")
    for ident, source_id, request_id, capture_id, body in database.execute(
            "SELECT id,source_id,request_id,capture_id,body FROM items"):
        if source_id not in sources:
            continue
        captured = retained.get(capture_id)
        row = next((row for row in captured["report"]["rows"] if row["request_id"] == request_id), None) if captured else None
        if (captured is None or captured["source_id"] != source_id or captured["status"] != "ACCEPTED" or
                row is None or canonical(row) != canonical(json.loads(body))):
            raise ValueError("An original ROZO item lost its accepted source row.")
    for body, in database.execute("SELECT body FROM closes"):
        for frozen in json.loads(body).get("native_captures", []):
            if frozen.get("source_id") not in sources:
                continue
            original = retained.get(frozen.get("id"))
            if original is None or any(canonical(frozen.get(key)) != canonical(original.get(key))
                    for key in ("source_id", "snapshot", "report", "identity")):
                raise ValueError("An issued ROZO purchase differs from its original frozen capture.")
    counts = {"rozo_report_count": len(sources), "rozo_capture_count": len(retained)}
    if any(type(manifest.get(key)) is not int or manifest[key] != value for key, value in counts.items()):
        raise ValueError("The complete project is missing original ROZO source or capture history.")
    return counts
