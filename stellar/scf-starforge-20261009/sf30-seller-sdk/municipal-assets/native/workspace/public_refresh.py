"""Durable complete public-layer refresh for the existing municipal workspace."""
from __future__ import annotations

import base64
from collections import Counter
from copy import deepcopy
import csv
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import io
from http.client import HTTPException, IncompleteRead
import json
import math
from pathlib import Path
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .captures import BASE, FIELDS, CARRIER, CAPTURE, MAX_BYTES, canonical, digest, json_value, parse_capture, require
from .geometry_capture import GEOMETRY_CARRIER, GEOMETRY_CAPTURE, native_geometry, same_typed
from .capture_intake import intake, locked, save
from .engine import Conflict, Workspace

SCHEMA = "municipal-public-refresh.v1"
FILE_LIMIT = 8 * 1024 * 1024
SETTINGS = ("comparison_fields", "transitions", "attestation", "expected_source_rows",
            "expected_target_rows", "expected_correlation_ids")
OUTPUT_NAMES = {
    "capture": "Belleville_Refreshed_Source.json",
    "source_archive": "Belleville_Complete_Public_Source.zip",
    "report": "Belleville_Asset_Handoff.html",
    "handoff": "Belleville_Asset_Handoff.zip",
    "workspace": "Belleville_Editable_Workspace.zip",
    "geometry": "Belleville_Original_Geometry.geojson",
    "result": "refresh-result.json",
}


def utc():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def wire(value):
    # Nested original_capture insertion order is part of the geometry binding.
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def job_root(workspace, operation):
    require(isinstance(operation, str) and 1 <= len(operation) <= 64, "Use a stable refresh operation ID of 1–64 characters")
    return workspace.root / "public-refresh" / digest(operation.encode())


def read_job(root):
    value = json_value((root / "journal.json").read_bytes())
    require(value.get("schema") == SCHEMA, "Restore the original complete refresh journal")
    return value


def persist(root, journal):
    journal["updated_utc"] = utc()
    save(root / "journal.json", (canonical(journal) + "\n").encode())


def project_selection(workspace, project_id, revision):
    project = workspace.project(project_id)
    if project["revision"] != revision:
        raise Conflict("The selected project revision changed. Reopen its current mapping before starting this refresh")
    input_id = project["state"]["inputs"].get("source_assets")
    require(input_id, "Select the existing Belleville source project before refreshing")
    original = workspace.input(input_id, project_id)
    require(original["metadata"].get("source") == BASE, "Refresh the project whose selected original source is this City layer")
    mapping = project["state"]["mappings"].get("source_assets")
    require(mapping and mapping.get("confirmed"), "Save the original source mapping before refreshing it")
    return {"project_id": project_id, "revision": revision, "source_input_id": input_id,
            "source_sha256": original["sha256"], "mapping": deepcopy(mapping["value"]),
            "settings": {key: deepcopy(project["state"][key]) for key in SETTINGS}}


def prepare(workspace, project_id, actor, operation, revision, page_width=500, geometry_width=100, source_operation=None):
    require(isinstance(actor, str) and 1 <= len(actor.strip()) <= 150, "Name the refresh operator")
    require(type(page_width) is int and 1 <= page_width <= 2000
            and type(geometry_width) is int and 1 <= geometry_width <= 2000, "Choose original page widths from 1 through 2000")
    root = job_root(workspace, operation)
    binding = {"operation": operation, "project_id": project_id, "actor": actor.strip(),
               "revision": revision, "page_width": page_width, "geometry_width": geometry_width, "source": BASE}
    if source_operation is not None:
        require(source_operation != operation, "Use a distinct receiving operation for the retained source")
        binding["source_operation"] = source_operation
    with locked(root / ".prepare.lock"):
        if (root / "journal.json").exists():
            journal = read_job(root)
            require(journal["binding"] == binding, "Resume this original refresh with its original project, actor and request")
            return summary(root, journal)
        retained_source = None
        if source_operation is not None:
            source_root = job_root(workspace, source_operation)
            source_job = read_job(source_root)
            require(source_job["binding"]["project_id"] == project_id
                    and all(name in source_job["outputs"] for name in ("capture", "source_archive")),
                    "Select the complete saved source and archive from this same project")
            retained_source = {"operation": source_operation,
                               "capture": deepcopy(source_job["outputs"]["capture"]),
                               "source_archive": deepcopy(source_job["outputs"]["source_archive"]),
                               "root": str(source_root)}
            # Verify the immutable full input before publishing the new receiving request.
            for item in (retained_source["capture"], retained_source["source_archive"]):
                output_body(source_root, item)
        selected = project_selection(workspace, project_id, revision)
        journal = {"schema": SCHEMA, "binding": binding, "selection": selected, "started_utc": utc(),
                   "state": "prepared", "stage": "metadata", "requests": [], "outputs": {},
                   "attribute_rows": 0, "geometry_rows": 0, "error": None, "retry_at": None,
                   "retained_source": retained_source}
        persist(root, journal)
        return summary(root, journal)


class Deferred(Exception):
    def __init__(self, deadline, message):
        super().__init__(message)
        self.deadline = deadline


def retry_deadline(value, attempt):
    if value:
        try:
            seconds = int(value)
            if seconds >= 0:
                return time.time() + max(1, seconds)
        except (ValueError, TypeError):
            try:
                stamp = parsedate_to_datetime(value)
                if stamp.tzinfo is None:
                    stamp = stamp.replace(tzinfo=timezone.utc)
                return max(time.time() + 1, stamp.timestamp())
            except (ValueError, TypeError, OverflowError):
                pass
    return time.time() + min(60, 2 ** min(attempt, 6))


class Acquisition:
    def __init__(self, root, journal, opener=urlopen):
        self.root, self.journal, self.opener = root, journal, opener

    def request(self, group, name, endpoint, parameters):
        url = endpoint + "?" + urlencode(parameters)
        key = digest(wire([group, name, endpoint, parameters]))
        entry = next((row for row in self.journal["requests"] if row["key"] == key), None)
        if entry is None:
            entry = {"key": key, "group": group, "name": name, "method": "GET", "endpoint": endpoint,
                     "parameters": parameters, "url": url, "attempts": []}
            self.journal["requests"].append(entry)
            persist(self.root, self.journal)
        if entry.get("selected"):
            item = entry["selected"]
            body = (self.root / item["body_path"]).read_bytes()
            require(len(body) == item["bytes"] and digest(body) == item["sha256"], "Retained original response changed: " + name)
            return json_value(body)
        if entry.get("retry_at", 0) > time.time():
            raise Deferred(entry["retry_at"], entry.get("error", "Awaiting the provider retry time"))
        self.journal.update(stage=group + ": " + name, retry_at=None, error=None)
        attempt = {"number": len(entry["attempts"]) + 1, "started_utc": utc(), "state": "requesting"}
        entry["attempts"].append(attempt)
        persist(self.root, self.journal)
        status, headers, body, response_url, error = None, {}, None, None, None
        transport_failure = False
        request = Request(url, headers={"Accept": "application/json", "Accept-Encoding": "identity",
                                       "User-Agent": "MunicipalAssetWorkspace/1.0"})
        try:
            try:
                response = self.opener(request, timeout=45)
            except HTTPError as failure:
                response = failure
            with response:
                status = response.status
                response_url = response.geturl()
                headers = dict(response.headers.items())
                body = response.read(FILE_LIMIT + 1)
        except (URLError, TimeoutError, OSError, HTTPException) as failure:
            transport_failure = True
            error = str(failure)
            if isinstance(failure, IncompleteRead) and isinstance(failure.partial, bytes):
                body = failure.partial[:FILE_LIMIT + 1]
        attempt.update(received_utc=utc(), status=status, headers=headers, response_url=response_url)
        if body is not None:
            body_path = "responses/" + key + "-" + str(attempt["number"]) + ".body"
            save(self.root / body_path, body, original=True)
            attempt.update(body_path=body_path, bytes=len(body), sha256=digest(body),
                           complete=not transport_failure and len(body) <= FILE_LIMIT)
        native = None
        if body is not None and not transport_failure and len(body) <= FILE_LIMIT:
            try:
                native = json_value(body)
            except (ValueError, UnicodeError):
                error = "The provider returned a non-JSON response"
        provider_code = native.get("error", {}).get("code") if isinstance(native, dict) and isinstance(native.get("error"), dict) else None
        transient = transport_failure or status in (408, 429, 500, 502, 503, 504) or provider_code in (429, 500, 502, 503, 504)
        if transient:
            retry_after = next((value for key, value in headers.items() if key.lower() == "retry-after"), None)
            entry["retry_at"] = retry_deadline(retry_after, attempt["number"])
            entry["error"] = error or "Provider response " + str(provider_code or status)
            attempt.update(state="deferred", error=entry["error"], retry_at=entry["retry_at"])
            persist(self.root, self.journal)
            raise Deferred(entry["retry_at"], entry["error"])
        if status != 200 or error or not isinstance(native, dict) or "error" in native or len(body or b"") > FILE_LIMIT or response_url != url:
            attempt.update(state="failed", error=error or "Review the retained provider response, URL or size")
            entry["error"] = attempt["error"]
            persist(self.root, self.journal)
            raise ValueError(entry["error"] + ": " + name)
        attempt["state"] = "received"
        entry["selected"] = {key: attempt[key] for key in ("number", "started_utc", "received_utc", "body_path", "bytes", "sha256")}
        entry.pop("retry_at", None)
        entry.pop("error", None)
        persist(self.root, self.journal)
        return native

    def members(self, group, prefix):
        files, requests = {}, []
        for entry in self.journal["requests"]:
            if entry["group"] != group:
                continue
            selected = entry.get("selected")
            require(selected, "Receive every selected original request before composing")
            body = (self.root / selected["body_path"]).read_bytes()
            require(len(body) == selected["bytes"] and digest(body) == selected["sha256"], "Retained response changed")
            path = prefix + "/" + str(len(requests) + 1).zfill(4) + "-" + entry["name"] + ".json"
            files[path] = body
            requests.append({"sequence": len(requests) + 1, "path": path,
                             **{key: entry[key] for key in ("method", "endpoint", "parameters", "url")},
                             "bytes": len(body), "sha256": digest(body),
                             "started_utc": selected["started_utc"], "received_utc": selected["received_utc"]})
        return files, requests


def ids(value):
    result = value.get("objectIds")
    require(value.get("objectIdFieldName") == "OBJECTID" and isinstance(result, list)
            and all(type(v) is int and v > 0 for v in result) and len(result) == len(set(result)),
            "Receive the complete original OBJECTID response")
    return sorted(result)


def descriptor(path, body):
    return {"path": path, "bytes": len(body), "sha256": digest(body)}


def members(files):
    return [{**descriptor(path, body), "content_base64": base64.b64encode(body).decode("ascii")}
            for path, body in files.items()]


def acquire(root, journal, opener=urlopen):
    source = Acquisition(root, journal, opener)
    metadata = source.request("attributes", "metadata", BASE, {"f": "json"})
    require(metadata.get("id") == 5 and metadata.get("geometryType") == "esriGeometryPolyline"
            and metadata.get("spatialReference", {}).get("wkid") == 26918
            and set(FIELDS) <= {field.get("name") for field in metadata.get("fields", [])},
            "Review the changed original layer identity, fields or projection")
    capabilities = metadata.get("advancedQueryCapabilities", {})
    require(capabilities.get("supportsPagination") is True and capabilities.get("supportsOrderBy") is True,
            "This layer must expose its actual ordered pagination capability")
    maximum = metadata.get("maxRecordCount")
    require(type(maximum) is int and maximum > 0, "Receive the actual service page limit")
    width = min(journal["binding"]["page_width"], maximum, 2000)
    geometry_width = min(journal["binding"]["geometry_width"], maximum, 2000)
    query = BASE + "/query"
    count = source.request("attributes", "count", query, {"f": "json", "where": "1=1", "returnCountOnly": "true"}).get("count")
    require(type(count) is int and 0 < count <= 100000, "Receive the complete nonempty source count")
    expected_ids = ids(source.request("attributes", "ids-before", query, {"f": "json", "where": "1=1", "returnIdsOnly": "true"}))
    require(len(expected_ids) == count, "The original count and ID population changed")
    journal["expected_rows"] = count
    rows = []
    for offset in range(0, count, width):
        value = source.request("attributes", "page-" + str(offset).zfill(6), query,
                               {"f": "json", "where": "1=1", "outFields": ",".join(FIELDS), "returnGeometry": "false",
                                "orderByFields": "OBJECTID ASC", "resultOffset": offset, "resultRecordCount": width})
        features = value.get("features")
        require(isinstance(features, list) and len(features) == min(width, count-offset), "Original attribute page is incomplete")
        for item in features:
            row = item.get("attributes") if isinstance(item, dict) else None
            require(isinstance(row, dict) and set(FIELDS) <= set(row), "Provider omitted an original attribute")
            row = {key: row[key] for key in FIELDS}
            require(type(row["OBJECTID"]) is int and row["OBJECTID"] == expected_ids[len(rows)], "Attribute page order or original IDs changed")
            rows.append(row)
        journal["attribute_rows"] = len(rows)
        persist(root, journal)
    require(ids(source.request("attributes", "ids-after", query, {"f": "json", "where": "1=1", "returnIdsOnly": "true"})) == expected_ids,
            "The full attribute population changed during capture")
    require(ids(source.request("geometry", "ids-before", query, {"f": "json", "where": "1=1", "returnIdsOnly": "true"})) == expected_ids,
            "The original population changed before geometry capture")
    geometries, path_count, positions, absent = [], 0, 0, 0
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    for offset in range(0, count, geometry_width):
        value = source.request("geometry", "page-" + str(offset).zfill(6), query,
                               {"f": "json", "where": "1=1", "outFields": ",".join(FIELDS), "returnGeometry": "true",
                                "orderByFields": "OBJECTID ASC", "resultOffset": offset, "resultRecordCount": geometry_width,
                                "outSR": 4326, "returnTrueCurves": "false", "returnZ": "false", "returnM": "false"})
        features = value.get("features")
        spatial = value.get("spatialReference")
        require(value.get("geometryType") == "esriGeometryPolyline" and isinstance(spatial, dict)
                and spatial.get("latestWkid", spatial.get("wkid")) == 4326 and value.get("transform") is None
                and value.get("hasZ", False) is False and value.get("hasM", False) is False
                and isinstance(features, list) and len(features) == min(geometry_width, count-offset),
                "Receive the complete original two-dimensional WGS84 page")
        for item in features:
            index = len(geometries)
            require(isinstance(item, dict) and same_typed(item.get("attributes"), rows[index]) and "geometry" in item,
                    "The original typed attributes changed between the attribute and geometry observations")
            geometry = native_geometry(item["geometry"], rows[index]["OBJECTID"], 4326)
            if geometry is None:
                absent += 1
            else:
                for line in geometry["coordinates"]:
                    path_count += 1
                    for x, y in line:
                        positions += 1
                        bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x), max(bounds[3], y)]
            identity = BASE + "#OBJECTID=" + str(rows[index]["OBJECTID"])
            geometries.append({"type": "Feature", "id": identity, "geometry": geometry,
                               "properties": {**rows[index], "__source_identity": identity, "__original_attributes": rows[index]}})
        require(value.get("exceededTransferLimit") is True if len(geometries) < count
                else value.get("exceededTransferLimit") in (None, False), "The provider completion flag disagrees with its original population")
        journal["geometry_rows"] = len(geometries)
        persist(root, journal)
    require(ids(source.request("geometry", "ids-after", query, {"f": "json", "where": "1=1", "returnIdsOnly": "true"})) == expected_ids,
            "The original geometry population changed during capture")
    final_metadata = source.request("verification", "metadata-after", BASE, {"f": "json"})
    require(final_metadata.get("id") == metadata["id"]
            and final_metadata.get("geometryType") == metadata["geometryType"]
            and same_typed(final_metadata.get("spatialReference"), metadata.get("spatialReference"))
            and same_typed([field for field in final_metadata.get("fields", []) if field.get("name") in FIELDS],
                           [field for field in metadata.get("fields", []) if field.get("name") in FIELDS]),
            "The published source projection or selected field definitions changed during capture")
    original_edit = metadata.get("editingInfo", {}).get("lastEditDate")
    final_edit = final_metadata.get("editingInfo", {}).get("lastEditDate")
    require(same_typed(original_edit, final_edit), "The provider's published last-edit observation changed during capture")
    finished = utc()
    attr_files, attr_requests = source.members("attributes", "provider")
    attributes = canonical(rows).encode()
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(FIELDS)
    writer.writerows([[row[key] for key in FIELDS] for row in rows])
    attr_files["attributes.json"] = attributes
    attr_files["attributes.csv"] = stream.getvalue().encode("utf-8")
    field_observations = {}
    for field in FIELDS:
        values = Counter(canonical(row[field]) for row in rows)
        field_observations[field] = {"null": sum(row[field] is None for row in rows),
                                    "empty_string": sum(row[field] == "" for row in rows), "distinct_typed_values": len(values)}
    attr_files["audit.json"] = wire({"source": BASE, "full_source_count": count, "fetched_exact_rows": count,
                                     "sha256_full_canonical_attributes": digest(attributes), "field_observations": field_observations,
                                     "before_after_ids_equal": True, "finished_utc": finished})
    attr_manifest = {"schema": CAPTURE, "status": "CAPTURE_COMPLETE", "source": BASE,
                     "source_type": "City public Waterfront Trails layer", "source_coverage": "Complete layer 5 public population",
                     "source_spatial_ref": "EPSG:26918", "geometry_included": False, "identity_field": "OBJECTID",
                     "fields": list(FIELDS), "rows": count, "attributes_sha256": digest(attributes),
                     "started_utc": journal["started_utc"], "finished_utc": finished,
                     "requests": attr_requests, "artifacts": [descriptor(path, body) for path, body in attr_files.items()],
                     "consistency": "Complete ordered rows reconcile with original count and both ID observations",
                     "limits": ["Published public layer fields retain their actual values and source coverage"]}
    attr_files["capture.json"] = wire(attr_manifest)
    original = {"schema": CARRIER, "capture": "capture.json", "files": members(attr_files)}
    geometry_files, geometry_requests = source.members("geometry", "geometry/provider")
    bbox = bounds if positions else None
    geometry_files["geometry/trails.geojson"] = wire({"type": "FeatureCollection", "bbox": bbox, "features": geometries})
    geometry_files["geometry/audit.json"] = wire({"schema": "tjl.belleville-public-geometry-audit.v1",
        "rows": count, "unique_object_ids": count, "provider_page_count": math.ceil(count/geometry_width),
        "paths": path_count, "positions": positions, "absent_geometry": absent, "bbox": bbox,
        "all_original_attributes_equal": True, "before_after_ids_equal": True})
    geometry_manifest = {"schema": GEOMETRY_CAPTURE, "status": "CAPTURE_COMPLETE", "source": BASE,
        "identity_field": "OBJECTID", "fields": list(FIELDS), "rows": count, "source_spatial_ref": "EPSG:26918",
        "output_spatial_ref": "EPSG:4326", "geometry_type": "esriGeometryPolyline", "geometry_included": True,
        "original_capture": {"bytes": len(wire(original)), "sha256": digest(wire(original)),
                             "manifest_sha256": digest(attr_files["capture.json"]), "attributes_sha256": digest(attributes)},
        "requests": geometry_requests, "geometry": descriptor("geometry/trails.geojson", geometry_files["geometry/trails.geojson"]),
        "audit_path": "geometry/audit.json", "started_utc": journal["started_utc"], "finished_utc": finished,
        "coordinate_operation": "Original City query with outSR=4326; returnTrueCurves=false; returnZ=false; returnM=false",
        "consistency": "Complete before/after IDs and exact typed attributes reconcile across both captures",
        "artifacts": [descriptor(path, body) for path, body in geometry_files.items()]}
    geometry_files["geometry/capture.json"] = wire(geometry_manifest)
    carrier = {"schema": GEOMETRY_CARRIER, "original_capture": original,
               "geometry_manifest": "geometry/capture.json", "files": members(geometry_files)}
    body = wire(carrier)
    require(len(body) <= MAX_BYTES, "The complete carrier exceeds the original 32 MiB workspace contract")
    parsed = parse_capture(carrier)
    return body, parsed, {**attr_files, **geometry_files}


def retain_output(root, journal, name, body):
    path = root / "outputs" / OUTPUT_NAMES[name]
    item = journal["outputs"].get(name)
    identity = {"path": path.relative_to(root).as_posix(), "bytes": len(body), "sha256": digest(body)}
    require(item is None or item == identity, "An original refresh output changed")
    retained = root / "retained" / identity["sha256"]
    save(retained, body, original=True)
    journal["outputs"][name] = identity
    persist(root, journal)
    save(path, body, original=True)
    return path


def output_body(root, item):
    path = root / item["path"]
    if not path.exists():
        retained = root / "retained" / item["sha256"]
        body = retained.read_bytes()
        require(len(body) == item["bytes"] and digest(body) == item["sha256"], "The retained original refresh output changed")
        save(path, body, original=True)
    body = path.read_bytes()
    require(len(body) == item["bytes"] and digest(body) == item["sha256"], "The saved original refresh output changed")
    return body


def source_archive(root, journal, body):
    """Recover the complete selected carrier plus every original acquisition attempt."""
    carrier = json_value(body)
    files = {}
    for packet in (carrier["original_capture"], carrier):
        for item in packet["files"]:
            value = base64.b64decode(item["content_base64"], validate=True)
            require(len(value) == item["bytes"] and digest(value) == item["sha256"], "Selected source member changed")
            require(item["path"] not in files, "Duplicate source archive path")
            files[item["path"]] = value
    for path in sorted((root / "responses").glob("*.body")):
        files["refresh-responses/" + path.name] = path.read_bytes()
    snapshot_path = root / "source-archive-selection.json"
    if not snapshot_path.exists():
        save(snapshot_path, (canonical(journal) + "\n").encode(), original=True)
    files["refresh-journal.json"] = snapshot_path.read_bytes()
    files["Belleville_Refreshed_Source.json"] = body
    return Workspace._zip(files)


def finish(root, journal):
    """Completion metadata precedes the derived result, so replay restores exact bytes."""
    for item in list(journal["outputs"].values()):
        output_body(root, item)
    saved = journal.get("completion")
    require(saved and saved.get("state") == "completed", "Restore the original completion selection")
    retain_output(root, journal, "result", (canonical(saved) + "\n").encode())
    return summary(root, journal)


def run(workspace, operation, wait=True, stop_event=None, opener=urlopen):
    root = job_root(workspace, operation)
    with locked(root / ".run.lock"):
        journal = read_job(root)
        if journal["state"] == "completed":
            return finish(root, journal)
        while True:
            journal.update(state="running", error=None, retry_at=None)
            persist(root, journal)
            try:
                retained = journal.get("retained_source")
                if retained:
                    source_root = Path(retained["root"])
                    for name in ("capture", "source_archive"):
                        retain_output(root, journal, name, output_body(source_root, retained[name]))
                if "capture" not in journal["outputs"]:
                    body, parsed, _ = acquire(root, journal, opener)
                    retain_output(root, journal, "capture", body)
                else:
                    body = output_body(root, journal["outputs"]["capture"])
                    parsed = parse_capture(json_value(body))
                journal["expected_rows"] = len(parsed["rows"])
                journal["attribute_rows"] = len(parsed["rows"])
                journal["geometry_rows"] = len(parsed["rows"])
                if "source_archive" not in journal["outputs"]:
                    retain_output(root, journal, "source_archive", source_archive(root, journal, body))
                journal.update(stage="same-project receiving", state="receiving")
                persist(root, journal)
                native = intake(workspace, root / journal["outputs"]["capture"]["path"], root / "handoff",
                                journal["binding"]["actor"], "refresh-" + digest(operation.encode())[:40],
                                project_id=journal["binding"]["project_id"], reopen_at=root / "reopened",
                                project_selection=journal["selection"])
                journal["receiving"] = native
                for name, native_name in (("report", "Belleville_Asset_Handoff.html"),
                                          ("handoff", "Belleville_Asset_Handoff.zip"),
                                          ("workspace", "Belleville_Editable_Workspace.zip"),
                                          ("geometry", "Belleville_Original_Geometry.geojson")):
                    item = native["outputs"][native_name]
                    value = Path(item["path"]).read_bytes()
                    require(len(value) == item["bytes"] and digest(value) == item["sha256"], "Native handoff output changed")
                    retain_output(root, journal, name, value)
                journal.update(state="completed", stage="complete", finished_utc=utc(), error=None, retry_at=None)
                journal["completion"] = deepcopy(summary(root, journal))
                persist(root, journal)
                return finish(root, journal)
            except Deferred as error:
                journal.update(state="waiting", retry_at=error.deadline, error=str(error))
                persist(root, journal)
                if not wait:
                    return summary(root, journal)
                while time.time() < error.deadline:
                    seconds = max(0, min(1, error.deadline-time.time()))
                    if stop_event and stop_event.wait(seconds):
                        return summary(root, journal)
                    if stop_event is None:
                        time.sleep(seconds)
            except Exception as error:
                journal.update(state="source-ready" if "capture" in journal["outputs"] else "failed",
                               error=str(error), retry_at=None)
                persist(root, journal)
                return summary(root, journal)


def summary(root, journal):
    return {"schema": SCHEMA, "operation": journal["binding"]["operation"], "project_id": journal["binding"]["project_id"],
            "actor": journal["binding"]["actor"], "selected_revision": journal["binding"]["revision"],
            "state": journal["state"], "stage": journal["stage"], "started_utc": journal["started_utc"],
            "updated_utc": journal.get("updated_utc"), "finished_utc": journal.get("finished_utc"),
            "expected_rows": journal.get("expected_rows"), "attribute_rows": journal.get("attribute_rows", 0),
            "geometry_rows": journal.get("geometry_rows", 0), "received_requests": sum(bool(row.get("selected")) for row in journal["requests"]),
            "attempts": sum(len(row["attempts"]) for row in journal["requests"]),
            "retry_at": journal.get("retry_at"), "error": journal.get("error"), "outputs": journal["outputs"],
            "receiving": journal.get("receiving"), "source_operation": journal["binding"].get("source_operation"),
            "directory": str(root)}


def list_jobs(workspace, project_id):
    jobs = []
    for path in (workspace.root / "public-refresh").glob("*/journal.json"):
        journal = read_job(path.parent)
        if journal["binding"]["project_id"] == project_id:
            jobs.append(summary(path.parent, journal))
    return sorted(jobs, key=lambda row: row["started_utc"], reverse=True)


class RefreshWorkers:
    """One in-process continuation per original operation; the OS lock covers other processes."""
    def __init__(self, workspace):
        self.workspace, self.lock, self.workers = workspace, threading.Lock(), {}
        self.stopped = threading.Event()

    def start(self, operation):
        with self.lock:
            previous = self.workers.get(operation)
            if previous and previous.is_alive():
                return
            worker = threading.Thread(target=run, args=(self.workspace, operation),
                                      kwargs={"stop_event": self.stopped}, daemon=True)
            self.workers[operation] = worker
            worker.start()

    def close(self):
        self.stopped.set()
