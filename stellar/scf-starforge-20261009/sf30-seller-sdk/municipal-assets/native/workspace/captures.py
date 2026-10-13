"""Receive a complete retained Belleville attributes capture in the municipal workspace.

The carrier contains the unchanged capture manifest and every original payload.
Provider response times remain whatever the source manifest actually records.
"""
from __future__ import annotations

import base64
import binascii
from collections import Counter
import hashlib
import json
import re
from pathlib import Path, PurePosixPath

BASE = "https://gis.belleville.ca/arcgis/rest/services/BV_GIS/DiscoverBelleville/MapServer/5"
FIELDS = ("OBJECTID", "AM_ID", "Asset_ID", "Current_PoF", "CoF", "Asset_Risk_Score",
          "Current_Replacement_Value", "Condition", "Segment_ID", "ParkName")
CARRIER = "municipal-source-capture.v1"
GEOMETRY_CARRIER = "municipal-source-geometry.v1"
CAPTURE = "tjl.belleville-public-attributes.v1"
MAX_BYTES = 32 * 1024 * 1024


def digest(body):
    return hashlib.sha256(body).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def json_value(body):
    return json.loads(body.decode("utf-8-sig"),
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Non-finite source number")))


def capture_bytes(body):
    """Accept the decoded JSON, the saved LZSS16 transport, or its full Canvas text."""
    require(isinstance(body, bytes) and 0 < len(body) <= MAX_BYTES, "Select a complete capture within 32 MiB")
    selected_body = body
    try:
        source = json_value(selected_body)
    except (ValueError, UnicodeError):
        text = body.decode("utf-8-sig")
        fences = re.findall(r"```json\s*\n([\s\S]*?)\n```", text)
        require(len(fences) == 1, "Select the one complete JSON carrier or its original Canvas transport")
        selected_body = fences[0].replace("\u00a0", " ").encode("utf-8")
        source = json_value(selected_body)
    if isinstance(source, dict) and source.get("schema") in (CARRIER, GEOMETRY_CARRIER):
        return selected_body
    require(isinstance(source, dict) and source.get("schema") == "commons.lzss16-source-carrier.v1"
            and source.get("encoding") == "lzss16+base64", "Select the complete original capture transport")
    descriptor = source.get("decoded", {})
    expected = descriptor.get("bytes")
    require(type(expected) is int and 0 < expected <= MAX_BYTES, "Invalid decoded capture size")
    try:
        packed = base64.b64decode(source["content_base64"], validate=True)
    except (KeyError, ValueError, TypeError, binascii.Error) as error:
        raise ValueError("Invalid complete transport base64") from error
    require(source.get("compressedBytes") == len(packed), "Compressed capture size differs")
    decoded, position = bytearray(), 0
    while position < len(packed):
        flags = packed[position]
        position += 1
        for bit in range(8):
            if position >= len(packed):
                break
            if flags & (1 << bit):
                require(position + 3 <= len(packed), "Truncated original LZSS16 match")
                distance = packed[position] | (packed[position + 1] << 8)
                count = packed[position + 2] + 3
                position += 3
                require(0 < distance <= len(decoded) and len(decoded) + count <= expected,
                        "Invalid original LZSS16 distance or size")
                for unused in range(count):
                    decoded.append(decoded[-distance])
            else:
                require(len(decoded) < expected, "Decoded capture exceeds its declared size")
                decoded.append(packed[position])
                position += 1
    result = bytes(decoded)
    require(len(result) == expected and digest(result) == descriptor.get("sha256"), "Decoded capture identity differs")
    value = json_value(result)
    require(isinstance(value, dict) and value.get("schema") in (CARRIER, GEOMETRY_CARRIER), "Decoded original is not a complete capture")
    return result


def relative(value):
    require(isinstance(value, str) and value and "\\" not in value, "Use a relative capture member path")
    path = PurePosixPath(value)
    require(not path.is_absolute() and all(part not in ("", ".", "..") for part in value.split("/")),
            "Capture member path must stay inside the original capture")
    return value


def unpack(source):
    require(isinstance(source, dict) and source.get("schema") == CARRIER, "Select a municipal-source-capture.v1 carrier")
    require(source.get("capture") == "capture.json", "The original manifest must be capture.json")
    rows = source.get("files")
    require(isinstance(rows, list) and 1 <= len(rows) <= 10000, "The carrier needs its complete file list")
    files, total = {}, 0
    for item in rows:
        require(isinstance(item, dict), "Each carrier member needs its original file identity")
        name = relative(item.get("path"))
        require(name not in files, "Duplicate capture member: " + name)
        try:
            body = base64.b64decode(item["content_base64"], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error) as error:
            raise ValueError("Invalid complete base64 member: " + name) from error
        total += len(body)
        require(total <= MAX_BYTES, "Decoded capture exceeds 32 MiB")
        require(type(item.get("bytes")) is int and item["bytes"] == len(body) and item.get("sha256") == digest(body),
                "Capture member changed: " + name)
        files[name] = body
    require("capture.json" in files, "Include the original capture.json bytes")
    manifest = json_value(files["capture.json"])
    require(isinstance(manifest, dict) and manifest.get("schema") == CAPTURE and manifest.get("status") == "CAPTURE_COMPLETE",
            "Select a complete original Belleville attribute capture")
    require(manifest.get("source") == BASE and manifest.get("geometry_included") is False
            and manifest.get("source_spatial_ref") == "EPSG:26918" and manifest.get("identity_field") == "OBJECTID",
            "This adapter receives the original attributes-only Belleville layer 5")
    require(manifest.get("fields") == list(FIELDS), "Review the changed original field contract")
    artifacts = manifest.get("artifacts")
    require(isinstance(artifacts, list) and artifacts, "Capture manifest has no selected artifacts")
    selected = set()
    for artifact in artifacts:
        name = relative(artifact.get("path"))
        require(name not in selected and name != "capture.json", "Duplicate or recursive capture artifact")
        selected.add(name)
        require(name in files and artifact.get("bytes") == len(files[name])
                and artifact.get("sha256") == digest(files[name]), "Original artifact disagrees: " + name)
    require(set(files) == selected | {"capture.json"}, "The carrier must contain exactly the original capture selection")
    require({"attributes.json", "attributes.csv", "audit.json"} <= selected, "Include complete attributes and original audit")

    attributes = json_value(files["attributes.json"])
    require(isinstance(attributes, list) and 0 < len(attributes) <= 100000, "Capture needs all original object records")
    require(all(isinstance(row, dict) and set(row) == set(FIELDS) for row in attributes), "Original row field contract changed")
    ids = [row["OBJECTID"] for row in attributes]
    require(all(type(value) is int and value > 0 for value in ids) and len(set(ids)) == len(ids),
            "Original OBJECTID values must be distinct positive integers")
    require(ids == sorted(ids), "Original attribute export must retain sorted OBJECTID order")
    require(manifest.get("rows") == len(attributes)
            and manifest.get("attributes_sha256") == digest(files["attributes.json"]),
            "Capture population or original attribute fingerprint disagrees")
    audit = json_value(files["audit.json"])
    require(isinstance(audit, dict) and audit.get("source") == BASE
            and audit.get("sha256_full_canonical_attributes") == digest(files["attributes.json"])
            and audit.get("full_source_count") == len(attributes)
            and audit.get("fetched_exact_rows") == len(attributes), "Original audit does not cover these complete attributes")

    requests = manifest.get("requests")
    require(isinstance(requests, list) and requests, "Retain the original provider requests")
    metadata, count, id_reads, page_rows, request_files = None, None, [], [], set()
    initial_ids_sequence, final_ids_sequence = None, None
    page_sequences = []
    for sequence, request in enumerate(requests, 1):
        require(request.get("sequence") == sequence and request.get("method") == "GET",
                "Keep the complete ordered original GET requests")
        name = relative(request.get("path"))
        require(name.startswith("provider/") and name in selected and name not in request_files,
                "Each original response must have its own retained provider member")
        request_files.add(name)
        raw = files[name]
        require(request.get("bytes") == len(raw) and request.get("sha256") == digest(raw), "Provider identity changed")
        value = json_value(raw)
        require(isinstance(value, dict) and "error" not in value, "Provider returned an error or incomplete object")
        params, endpoint = request.get("parameters"), request.get("endpoint")
        require(isinstance(params, dict) and params.get("f") == "json", "Retain original JSON request parameters")
        if endpoint == BASE:
            require(metadata is None and value.get("id") == 5 and value.get("geometryType") == "esriGeometryPolyline",
                    "Original layer identity changed")
            metadata = value
            require(value.get("spatialReference", {}).get("wkid") == 26918
                    and set(FIELDS) <= {field.get("name") for field in value.get("fields", [])},
                    "Original layer schema or projection changed")
        else:
            require(endpoint == BASE + "/query" and params.get("where") == "1=1", "Use the original complete layer query")
            if params.get("returnCountOnly") == "true":
                require(count is None and type(value.get("count")) is int, "Original count response missing or repeated")
                count = value["count"]
            elif params.get("returnIdsOnly") == "true":
                provider_ids = value.get("objectIds")
                require(value.get("objectIdFieldName") == "OBJECTID" and isinstance(provider_ids, list)
                        and all(type(v) is int and v > 0 for v in provider_ids)
                        and len(provider_ids) == len(set(provider_ids)), "Incomplete original OBJECTID response")
                id_reads.append(set(provider_ids))
                if initial_ids_sequence is None:
                    initial_ids_sequence = sequence
                final_ids_sequence = sequence
            else:
                require(params.get("returnGeometry") == "false" and params.get("orderByFields") == "OBJECTID ASC"
                        and params.get("outFields", "").split(",") == list(FIELDS), "Original attribute page parameters changed")
                offset, width = params.get("resultOffset"), params.get("resultRecordCount")
                require(type(offset) is int and type(width) is int and 1 <= width <= 2000
                        and offset == len(page_rows), "Original attribute pages must cover consecutive complete offsets")
                records = value.get("features")
                require(count is not None and isinstance(records, list)
                        and len(records) == min(width, count - offset), "Original attribute page is incomplete")
                for feature in records:
                    row = feature.get("attributes") if isinstance(feature, dict) else None
                    require(isinstance(row, dict) and set(FIELDS) <= set(row), "Provider page omits original fields")
                    page_rows.append({key: row[key] for key in FIELDS})
                page_sequences.append(sequence)
    require(request_files == {name for name in selected if name.startswith("provider/")},
            "Include every original provider response in the request ledger")
    require(metadata is not None and count == len(attributes) and len(id_reads) == 2
            and all(values == set(ids) for values in id_reads), "Metadata/count/before-and-after IDs do not cover this population")
    require(page_sequences and initial_ids_sequence < min(page_sequences)
            and final_ids_sequence > max(page_sequences), "Retain the original pre-page and post-page ID observations")
    require(sorted(page_rows, key=lambda row: row["OBJECTID"]) == attributes,
            "Attribute export differs from the complete original provider population")
    return manifest, files, attributes, metadata


def parse_capture(source):
    if isinstance(source, dict) and source.get("schema") == GEOMETRY_CARRIER:
        from .geometry_capture import parse_geometry_capture
        return parse_geometry_capture(source)
    manifest, files, attributes, metadata = unpack(source)
    rows = [{**row, "__source_identity": BASE + "#OBJECTID=" + str(row["OBJECTID"]),
             "__original_attributes": row} for row in attributes]
    diagnostics = []
    for field in FIELDS:
        present = [canonical(row[field]) for row in attributes if row[field] is not None and row[field] != ""]
        counts = Counter(present)
        diagnostics.append({"field": field, "blank_or_null": len(rows) - len(present),
                            "distinct_nonblank": len(counts),
                            "repeated_nonblank_occurrences": sum(value - 1 for value in counts.values())})
    return {"columns": [*FIELDS, "__source_identity", "__original_attributes"], "rows": rows,
            "metadata": {"format": "belleville-capture", "source": BASE, "capture_schema": CAPTURE,
                "capture_sha256": digest(files["capture.json"]), "attributes_sha256": digest(files["attributes.json"]),
                "source_type": manifest.get("source_type"), "source_coverage": manifest.get("source_coverage"),
                "geometry_included": False, "source_spatial_ref": "EPSG:26918",
                "coordinate_system": "Original layer EPSG:26918; capture contains attributes only",
                "identity_rule": "Original source URL + OBJECTID; asset and segment labels remain attributes",
                "original_fields": metadata.get("fields"), "field_observations": diagnostics,
                "original_requests": len(manifest["requests"]), "original_files": len(files),
                "capture_started_utc": manifest.get("started_utc"), "capture_finished_utc": manifest.get("finished_utc"),
                "consistency": manifest.get("consistency"), "limits": manifest.get("limits", [])}}


def pack_directory(directory):
    root = Path(directory).resolve()
    manifest_path = root / "capture.json"
    require(manifest_path.is_file() and not manifest_path.is_symlink(), "Select the original complete capture directory")
    manifest = json_value(manifest_path.read_bytes())
    paths = ["capture.json", *[relative(item["path"]) for item in manifest["artifacts"]]]
    files, total = [], 0
    for name in paths:
        path = root / name
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),
                "Select original regular capture files")
        body = path.read_bytes()
        total += len(body)
        require(total <= MAX_BYTES, "Complete capture exceeds 32 MiB")
        files.append({"path": name, "bytes": len(body), "sha256": digest(body),
                      "content_base64": base64.b64encode(body).decode("ascii")})
    carrier = {"schema": CARRIER, "capture": "capture.json", "files": files}
    unpack(carrier)
    body = (canonical(carrier) + "\n").encode()
    require(len(body) <= MAX_BYTES, "Carrier exceeds the workspace 32 MiB upload size")
    return body
