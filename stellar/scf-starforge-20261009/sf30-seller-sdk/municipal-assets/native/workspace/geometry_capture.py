"""Import the complete later geometry edition into the original municipal source."""
from __future__ import annotations

import base64
import binascii
import json
import math
from urllib.parse import parse_qsl, urlsplit

from .captures import BASE, FIELDS, MAX_BYTES, canonical, digest, json_value, relative, require, unpack

GEOMETRY_CARRIER = "municipal-source-geometry.v1"
GEOMETRY_CAPTURE = "tjl.belleville-public-geometry.v1"


def same_typed(left, right):
    return canonical(left) == canonical(right)


def original_files(source):
    require(isinstance(source, dict) and source.get("schema") == GEOMETRY_CARRIER,
            "Select a complete municipal-source-geometry.v1 carrier")
    require(source.get("geometry_manifest") == "geometry/capture.json",
            "The geometry manifest must retain its original path")
    members = source.get("files")
    require(isinstance(members, list) and 1 <= len(members) <= 10000,
            "Include the complete geometry file selection")
    files, total = {}, 0
    for item in members:
        require(isinstance(item, dict), "Each geometry member needs its complete identity")
        path = relative(item.get("path"))
        require(path.startswith("geometry/") and path not in files, "Duplicate or misplaced geometry member")
        try:
            body = base64.b64decode(item["content_base64"], validate=True)
        except (KeyError, ValueError, TypeError, binascii.Error) as error:
            raise ValueError("Invalid original geometry base64: " + path) from error
        total += len(body)
        require(total <= MAX_BYTES, "Complete geometry exceeds 32 MiB")
        require(type(item.get("bytes")) is int and item["bytes"] == len(body)
                and item.get("sha256") == digest(body), "Geometry member changed: " + path)
        files[path] = body
    require("geometry/capture.json" in files, "Include the complete geometry manifest")
    manifest = json_value(files["geometry/capture.json"])
    require(isinstance(manifest, dict) and manifest.get("schema") == GEOMETRY_CAPTURE
            and manifest.get("status") == "CAPTURE_COMPLETE", "Select a complete geometry edition")
    selected = set()
    artifacts = manifest.get("artifacts")
    require(isinstance(artifacts, list) and artifacts, "Geometry manifest needs its selected artifacts")
    for item in artifacts:
        require(isinstance(item, dict), "Invalid geometry artifact identity")
        path = relative(item.get("path"))
        require(path != "geometry/capture.json" and path not in selected, "Duplicate geometry artifact")
        selected.add(path)
        require(path in files and type(item.get("bytes")) is int and item["bytes"] == len(files[path])
                and item.get("sha256") == digest(files[path]), "Geometry artifact changed: " + path)
    require(set(files) == selected | {"geometry/capture.json"}, "Geometry carrier selection differs")
    return manifest, files


def query_contract(request):
    """Bind the recorded query URL to the actual typed request parameters."""
    require(request.get("method") == "GET" and request.get("endpoint") == BASE + "/query",
            "Retain the original City layer query")
    parameters = request.get("parameters")
    require(isinstance(parameters, dict) and parameters.get("f") == "json"
            and parameters.get("where") == "1=1", "Retain the full original layer population")
    url = request.get("url")
    require(isinstance(url, str), "Retain the exact original request URL")
    parsed = urlsplit(url)
    require(parsed.scheme == "https" and not parsed.fragment
            and parsed.scheme + "://" + parsed.netloc + parsed.path == BASE + "/query",
            "Geometry request URL selects a different original source")
    pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    require(len(pairs) == len(dict(pairs)) and dict(pairs) == {key: str(value) for key, value in parameters.items()},
            "Recorded geometry URL and request parameters differ")
    return parameters


def native_geometry(value, object_id, source_wkid):
    """Receive two-dimensional provider polylines without interpreting Z or M."""
    if value is None:
        return None
    require(isinstance(value, dict) and isinstance(value.get("paths"), list)
            and value["paths"] and set(value) <= {"paths", "spatialReference", "hasZ", "hasM"},
            "Original geometry is not a densified polyline: " + str(object_id))
    require(value.get("hasZ", False) is False and value.get("hasM", False) is False,
            "Review the original Z/M coordinate contract: " + str(object_id))
    spatial = value.get("spatialReference")
    require(spatial is None or isinstance(spatial, dict), "Invalid feature spatial reference")
    effective_wkid = spatial.get("latestWkid", spatial.get("wkid")) if spatial is not None else source_wkid
    require(effective_wkid == 4326, "Feature geometry needs its actual WGS84 spatial reference")
    for line in value["paths"]:
        require(isinstance(line, list) and len(line) >= 2, "Original polyline contains a short path")
        for position in line:
            require(isinstance(position, list) and len(position) == 2
                    and all(type(v) in (int, float) and math.isfinite(v) for v in position),
                    "Retain explicit finite two-dimensional longitude/latitude positions")
            require(-180 <= position[0] <= 180 and -90 <= position[1] <= 90,
                    "Original geometry is outside the WGS84 coordinate range")
    return {"type": "MultiLineString", "coordinates": value["paths"]}


def parse_geometry_capture(source):
    original = source.get("original_capture")
    original_manifest, original_members, attributes, layer = unpack(original)
    manifest, files = original_files(source)
    require(sum(map(len, original_members.values())) + sum(map(len, files.values())) <= MAX_BYTES,
            "The complete combined source exceeds 32 MiB")
    require(manifest.get("source") == BASE and manifest.get("identity_field") == "OBJECTID"
            and manifest.get("fields") == list(FIELDS) and manifest.get("rows") == len(attributes)
            and manifest.get("source_spatial_ref") == "EPSG:26918"
            and manifest.get("output_spatial_ref") == "EPSG:4326"
            and manifest.get("geometry_type") == "esriGeometryPolyline"
            and manifest.get("geometry_included") is True, "Review the changed geometry source contract")
    original_body = json.dumps(original, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()
    binding = manifest.get("original_capture")
    require(isinstance(binding, dict) and binding.get("bytes") == len(original_body)
            and binding.get("sha256") == digest(original_body)
            and binding.get("manifest_sha256") == digest(original_members["capture.json"])
            and binding.get("attributes_sha256") == digest(original_members["attributes.json"]),
            "Geometry edition binds a different complete original capture")

    requests = manifest.get("requests")
    require(isinstance(requests, list) and len(requests) >= 3, "Retain the complete geometry request sequence")
    expected_ids = [row["OBJECTID"] for row in attributes]
    original_rows = {row["OBJECTID"]: row for row in attributes}
    observed_ids, id_sequences, features, request_paths = [], [], [], set()
    page_count, positions, path_count, absent = 0, 0, 0, 0
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    page_sequences = []
    for index, request in enumerate(requests, 1):
        require(isinstance(request, dict) and request.get("sequence") == index,
                "Retain consecutive original geometry request sequence numbers")
        path = relative(request.get("path"))
        require(path.startswith("geometry/provider/") and path not in request_paths and path in files,
                "Missing or repeated original geometry response")
        request_paths.add(path)
        require(type(request.get("bytes")) is int and request["bytes"] == len(files[path])
                and request.get("sha256") == digest(files[path]), "Original geometry response differs")
        parameters = query_contract(request)
        value = json_value(files[path])
        require(isinstance(value, dict) and "error" not in value, "Provider returned an error response")
        if parameters.get("returnIdsOnly") == "true":
            ids = value.get("objectIds")
            require(value.get("objectIdFieldName") == "OBJECTID" and isinstance(ids, list)
                    and all(type(v) is int and v > 0 for v in ids) and len(ids) == len(set(ids))
                    and sorted(ids) == expected_ids, "Geometry ID observation differs from the original population")
            observed_ids.append(ids)
            id_sequences.append(index)
            continue
        require(parameters.get("returnGeometry") == "true" and type(parameters.get("outSR")) is int
                and parameters["outSR"] == 4326 and parameters.get("returnTrueCurves") == "false"
                and parameters.get("orderByFields") == "OBJECTID ASC"
                and parameters.get("outFields") == ",".join(FIELDS),
                "Retain the exact complete WGS84 polyline query")
        for option in ("returnZ", "returnM"):
            require(parameters.get(option, "false") == "false", "Review the explicit Z/M query before importing")
        require(not any(key in parameters for key in ("geometryPrecision", "maxAllowableOffset", "quantizationParameters")),
                "This complete source contract retains the provider coordinates without simplification")
        offset, width = parameters.get("resultOffset"), parameters.get("resultRecordCount")
        require(type(offset) is int and type(width) is int and 0 < width <= 2000 and offset == len(features),
                "Geometry pages must cover consecutive complete offsets")
        spatial = value.get("spatialReference")
        require(value.get("geometryType") == "esriGeometryPolyline"
                and (spatial is None or isinstance(spatial, dict)
                     and spatial.get("latestWkid", spatial.get("wkid")) == 4326)
                and value.get("transform") is None
                and value.get("hasZ", False) is False and value.get("hasM", False) is False,
                "Provider geometry type, projection or dimension changed")
        rows = value.get("features")
        require(isinstance(rows, list) and len(rows) == min(width, len(attributes) - offset) and rows,
                "Geometry page population differs")
        for feature in rows:
            require(isinstance(feature, dict) and isinstance(feature.get("attributes"), dict)
                    and "geometry" in feature, "Every original feature must retain its attributes and geometry field")
            row = feature["attributes"]
            object_id = row.get("OBJECTID")
            require(type(object_id) is int and len(features) < len(expected_ids)
                    and object_id == expected_ids[len(features)], "Geometry IDs must match the complete original order")
            require(same_typed(row, original_rows[object_id]), "Original typed attributes differ: " + str(object_id))
            mapped = native_geometry(feature["geometry"], object_id,
                                     spatial.get("latestWkid", spatial.get("wkid")) if spatial is not None else None)
            if mapped is None:
                absent += 1
            else:
                for line in mapped["coordinates"]:
                    path_count += 1
                    for x, y in line:
                        positions += 1
                        bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x), max(bounds[3], y)]
            identity = BASE + "#OBJECTID=" + str(object_id)
            features.append({"type": "Feature", "id": identity, "geometry": mapped,
                             "properties": {**row, "__source_identity": identity, "__original_attributes": row}})
        require(value.get("exceededTransferLimit") is True if len(features) < len(attributes)
                else (value.get("exceededTransferLimit") is None or value.get("exceededTransferLimit") is False),
                "Provider geometry completion flag disagrees with the original population")
        page_count += 1
        page_sequences.append(index)

    require(len(features) == len(attributes) and len(observed_ids) == 2
            and id_sequences[0] < min(page_sequences) and id_sequences[1] > max(page_sequences),
            "Retain the full geometry population and its surrounding ID observations")
    require(request_paths == {path for path in files if path.startswith("geometry/provider/")},
            "Every selected provider response needs its original request")
    geometry_item = manifest.get("geometry")
    require(isinstance(geometry_item, dict), "Retain the complete derived GeoJSON identity")
    geometry_path = relative(geometry_item.get("path"))
    require(geometry_path in files and geometry_item.get("bytes") == len(files[geometry_path])
            and geometry_item.get("sha256") == digest(files[geometry_path]), "Derived GeoJSON identity differs")
    geojson = json_value(files[geometry_path])
    require(isinstance(geojson, dict) and geojson.get("type") == "FeatureCollection"
            and same_typed(geojson.get("features"), features), "Derived GeoJSON differs from the original provider features")
    expected_bounds = bounds if positions else None
    require(same_typed(geojson.get("bbox"), expected_bounds), "Derived geometry extent differs")
    audit_path = relative(manifest.get("audit_path"))
    require(audit_path in files, "Include the original geometry audit")
    audit = json_value(files[audit_path])
    calculated = {"rows": len(features), "unique_object_ids": len(features), "provider_page_count": page_count,
                  "paths": path_count, "positions": positions, "absent_geometry": absent, "bbox": expected_bounds}
    require(isinstance(audit, dict) and audit.get("schema") == "tjl.belleville-public-geometry-audit.v1"
            and all(same_typed(audit.get(key), value) for key, value in calculated.items())
            and audit.get("all_original_attributes_equal") is True and audit.get("before_after_ids_equal") is True,
            "Geometry audit differs from the full original selection")

    rows = [{**feature["properties"], "__geometry": feature["geometry"]} for feature in features]
    # Reuse the original complete attribute metadata and field observations.
    from .captures import parse_capture
    metadata = parse_capture(original)["metadata"]
    metadata.update(format="belleville-geometry-capture", geometry_included=True,
                    geometry_capture_sha256=digest(files["geometry/capture.json"]),
                    geometry_original_files=len(files), geometry_original_requests=len(requests),
                    geometry_paths=path_count, geometry_positions=positions, geometry_absent_rows=absent,
                    geometry_bbox=expected_bounds, output_spatial_ref="EPSG:4326",
                    coordinate_system="EPSG:4326 longitude, latitude; City outSR output from original EPSG:26918 layer",
                    coordinate_operation=manifest.get("coordinate_operation"),
                    geometry_finished_utc=manifest.get("finished_utc"),
                    geometry_consistency=manifest.get("consistency"),
                    original_capture_sha256=digest(original_body))
    return {"columns": [*FIELDS, "__source_identity", "__original_attributes", "__geometry"],
            "rows": rows, "metadata": metadata}
