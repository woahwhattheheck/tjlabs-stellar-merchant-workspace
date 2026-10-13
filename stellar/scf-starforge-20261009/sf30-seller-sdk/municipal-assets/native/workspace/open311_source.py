"""Receive complete original Open311 collection exports without changing source status."""
from __future__ import annotations
import base64
from collections import Counter
from datetime import datetime, timezone
import math
import hashlib
import json
import re
from .adapters import InvalidData, canonical

SCHEMA = "commons.open311.collection-export.v1"
COLUMNS = ["id", "asset_id", "location_id", "summary", "status", "created_at",
           "original_request_id", "connection_id", "address", "agency", "service_code",
           "service_name", "updated_at", "latitude", "longitude", "capture_id",
           "source_version_sha256", "original_source", "source_review", "observation_count", "version_count"]
HASH = re.compile(r"^[a-f0-9]{64}$")


def need(value, message):
    if not value:
        raise InvalidData("Open311 source: " + message)


def digest(value):
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def same(left, right):
    # JSON/JavaScript have one numeric type: 47 and 47.0 (also -0 and 0)
    # describe the same source number. Booleans remain a separate type.
    if type(left) in (int, float) and type(right) in (int, float):
        return math.isfinite(left) and math.isfinite(right) and left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(same(left[key], right[key]) for key in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(same(a, b) for a, b in zip(left, right))
    return left == right


def objects(value, label):
    need(isinstance(value, list) and all(isinstance(row, dict) for row in value), label + " must be a complete object array")
    return value


def identifier(value):
    need(isinstance(value, str) or (type(value) is int and abs(value) <= 9007199254740991),
         "service_request_id must be a string or safe integer")
    result = str(value).strip()
    need(bool(result), "a request identity is empty")
    return result


def response_rows(value):
    if isinstance(value, list):
        return objects(value, "Response records")
    need(isinstance(value, dict), "the original response is not an object or array")
    if "service_request_id" in value:
        return [value]
    nested = value.get("service_requests")
    if isinstance(nested, dict) and "request" in nested:
        nested = nested["request"]
    if nested is None:
        nested = value.get("request")
    if isinstance(nested, dict) and "service_request_id" in nested:
        return [nested]
    return objects(nested, "Original response records")


def instant(value):
    try:
        if not isinstance(value, str):
            return 0
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.timestamp() if parsed.tzinfo is not None else 0
    except (ValueError, OverflowError):
        return 0



def milliseconds(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        need(parsed.tzinfo is not None, "date bounds need their original timezone")
        delta = parsed.astimezone(timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)
        return delta.days * 86400000 + delta.seconds * 1000 + delta.microseconds // 1000
    except (AttributeError, TypeError, ValueError, OverflowError) as error:
        raise InvalidData("Open311 source: retain the actual ISO date boundary") from error


def iso(milliseconds_value):
    return datetime.fromtimestamp(milliseconds_value / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def validate_windows(collection, nodes):
    policy, query = collection.get("policy"), collection.get("query")
    need(isinstance(policy, dict) and isinstance(query, dict), "retain the original traversal policy and query")
    need(policy.get("timeBasis", "created") in ("created", "updated") and policy.get("strategy", "windows") in ("windows", "pages"),
         "select an original time basis and traversal")
    page_mode = policy.get("strategy") == "pages"
    fields = ("updated_after", "updated_before") if policy.get("timeBasis") == "updated" else ("start_date", "end_date")
    maximum = policy.get("maxWindowDays")
    quantum, minimum, overlap = (policy.get(key) for key in ("queryQuantumMs", "minimumWindowMs", "boundaryOverlapMs"))
    need(all(type(value) is int for value in (maximum, quantum, minimum, overlap)) and
         1 <= maximum <= 90 and 1 <= quantum <= 86400000 and 1 <= minimum <= maximum * 86400000 and
         0 <= overlap < maximum * 86400000 / 2 and minimum % quantum == 0 and overlap % quantum == 0,
         "retain the original supported window policy")
    start, end = milliseconds(query.get(fields[0])), milliseconds(query.get(fields[1]))
    need(end > start, "collection end must follow its start")
    if page_mode:
        need(collection["connection"].get("pagination") is True, "page traversal needs the declared provider pagination")
    expected = {}
    left, index = start, 1
    while left < end:
        need(index <= 100000, "the complete initial traversal exceeds the supported window count")
        right = min(end, left + maximum * 86400000)
        if right < end:
            right = right // quantum * quantum
        need(right > left, "window precision prevents progress")
        window_id = "w" + str(index).zfill(6)
        expected[window_id] = {"id": window_id, "startDate": query[fields[0]] if left == start else iso(left),
                               "endDate": query[fields[1]] if right == end else iso(right), "parentId": None}
        if page_mode:
            expected[window_id]["page"] = 1
        index += 1
        if right == end:
            break
        next_left = right - overlap
        need(next_left > left, "boundary overlap prevents progress")
        left = next_left
    for node in nodes:
        original = expected.get(node.get("id"))
        need(original is not None and all(same(node.get(key), original.get(key))
             for key in ("startDate", "endDate", "parentId", "page")), "window differs from the original traversal")
        children = node.get("children")
        need(isinstance(children, list) and isinstance(node.get("attempts"), list), "retain window children and attempts")
        if node.get("state") == "SPLIT":
            need(not page_mode, "paged collection cannot split date windows")
            a, b = milliseconds(node["startDate"]), milliseconds(node["endDate"])
            middle = (a + b - overlap) // (2 * quantum) * quantum
            left_end = middle + overlap
            need(b - a > minimum and middle > a and left_end < b and left_end - a >= minimum and b - middle >= minimum,
                 "the selected window cannot split under its original boundary policy")
            child_rows = [{"id": node["id"] + ".0", "startDate": node["startDate"], "endDate": iso(left_end), "parentId": node["id"]},
                          {"id": node["id"] + ".1", "startDate": iso(middle), "endDate": node["endDate"], "parentId": node["id"]}]
        elif node.get("state") == "PAGED":
            number = node.get("page")
            need(page_mode and type(number) is int and 1 <= number < 9007199254740991,
                 "retain the original page successor")
            child_rows = [{"id": re.sub(r"\.p[0-9]+$", "", node["id"]) + ".p" + str(number + 1).zfill(6),
                           "startDate": node["startDate"], "endDate": node["endDate"],
                           "parentId": node["id"], "page": number + 1}]
        else:
            child_rows = []
        need(children == [child["id"] for child in child_rows], "window children differ from the original traversal")
        for child in child_rows:
            need(child["id"] not in expected, "window refinement repeats a node")
            expected[child["id"]] = child
    need(set(expected) == {node.get("id") for node in nodes}, "the export omits a planned or refined window")
    if collection.get("state") in ("COMPLETE", "LIMITED"):
        need(not any(node.get("state") in ("PENDING", "FAILED") for node in nodes), "unfinished windows cannot be terminal")
    if collection.get("state") == "COMPLETE":
        need(not any(node.get("state") == "LIMITED" for node in nodes), "limited windows cannot be marked complete")
    return fields


def parse_collection(value):
    need(isinstance(value, dict) and value.get("schema") == SCHEMA, "select the complete collection JSON export")
    collection, summary = value.get("collection"), value.get("summary")
    need(isinstance(collection, dict) and isinstance(summary, dict), "collection and summary are required")
    need(isinstance(value.get("workspaceId"), str) and type(value.get("revision")) is int and value["revision"] >= 0,
         "retain the original workspace and revision")
    connection = collection.get("connection")
    need(isinstance(connection, dict) and connection.get("id") == collection.get("connectionId"),
         "the collection connection does not match")
    connection_id = identifier(collection["connectionId"])
    collection_id = collection.get("id")
    need(isinstance(collection_id, str) and re.fullmatch(r"collection-[a-f0-9]{24}", collection_id),
         "retain the original collection identity")
    need(summary.get("id") == collection_id and summary.get("connectionId") == connection_id,
         "summary belongs to a different collection")
    for name in ("state", "query", "policy", "requestedQuery"):
        need(same(summary.get(name), collection.get(name)), "summary selection differs: " + name)
    need(collection.get("state") in ("PLANNED", "PAUSED", "INTERRUPTED", "COMPLETE", "LIMITED"),
         "pause or finish the original collection before receiving it")
    nodes = objects(collection.get("nodes"), "Collection windows")
    fields = validate_windows(collection, nodes)
    node_ids, captures = set(), {}
    for node in nodes:
        need(isinstance(node.get("id"), str) and node["id"] not in node_ids, "window identities must be unique")
        node_ids.add(node["id"])
        need(node.get("state") in ("PENDING", "CAPTURED", "SPLIT", "LIMITED", "FAILED", "PAGED"),
             "a window is active or has an unknown state")
        need(bool(node.get("captureId")) or node.get("state") not in ("CAPTURED", "SPLIT", "PAGED", "LIMITED"),
             "a captured/refined/limited window needs its complete original capture")
        if node.get("captureId"):
            need(node["captureId"] not in captures, "a capture is repeated across windows")
            captures[node["captureId"]] = node
    originals = objects(value.get("originals"), "Complete originals")
    requests = objects(value.get("requests"), "Selected requests")
    observations = objects(value.get("observations"), "Request versions")
    objects(value.get("sourceOperations"), "Original operation records")
    need(len(requests) <= 100000, "the selected population exceeds 100,000 requests")
    need(len(originals) == len(captures), "every selected capture needs its complete original response")
    originals_seen, by_key, selected_order = set(), {}, []
    previous_order = (float("-inf"), "")
    for original in originals:
        capture, raw = original.get("capture"), original.get("raw")
        need(isinstance(capture, dict) and capture.get("id") in captures and capture["id"] not in originals_seen,
             "an original capture is missing, unselected or repeated")
        originals_seen.add(capture["id"])
        need(capture.get("kind") == "requests" and capture.get("connectionId") == connection_id,
             "a capture belongs to a different source")
        need(re.fullmatch(r"capture-[a-f0-9]{24}", capture["id"]), "retain the native capture identity")
        window = captures[capture["id"]]
        expected_query = {**collection["query"], fields[0]: window["startDate"], fields[1]: window["endDate"]}
        if collection["policy"].get("strategy") == "pages":
            expected_query["page"] = str(window["page"])
        need(same(capture.get("query"), expected_query), "capture query differs from its exact window/time basis/page")
        need(not (window["state"] == "CAPTURED" and capture.get("saturated")),
             "a saturated original response cannot be a resolved window")
        if window["state"] in ("SPLIT", "PAGED", "LIMITED"):
            need(capture.get("saturated") or window.get("problem"), "a refined/limited window lacks its original saturation or recorded problem")
        actual_connection = capture.get("connection", {})
        need(actual_connection.get("baseUrl") == connection.get("baseUrl") and
             (actual_connection.get("jurisdictionId") or "") == (connection.get("jurisdictionId") or ""),
             "capture endpoint or jurisdiction differs")
        need(isinstance(raw, dict) and raw.get("encoding") == "base64" and raw.get("complete") is not False,
             "complete original response bytes are required")
        try:
            body = base64.b64decode(raw["body"], validate=True)
            need(base64.b64encode(body).decode("ascii") == raw["body"], "response Base64 is not canonical")
            decoded = json.loads(body.decode("utf-8"), parse_constant=lambda item: (_ for _ in ()).throw(ValueError(item)))
        except (KeyError, TypeError, ValueError, UnicodeError) as error:
            raise InvalidData("Open311 source: original response bytes are invalid") from error
        sha = hashlib.sha256(body).hexdigest()
        need(type(raw.get("bytes")) is int and raw["bytes"] == len(body) and raw.get("sha256") == sha and
             capture.get("sourceBytes") == len(body) and capture.get("sourceSha256") == sha,
             "the complete original HTTP body differs from its byte identity")
        need(same(decoded, original.get("value")), "decoded original body differs from its retained value")
        source_rows = response_rows(decoded)
        source_by_id = {}
        for source in source_rows:
            source_id = identifier(source.get("service_request_id"))
            need(source_id not in source_by_id, "an original response repeats a request identity")
            source_by_id[source_id] = source
        items = objects(original.get("items"), "Original capture items")
        need(len(items) == len(source_rows) and capture.get("rowCount") == len(items),
             "original capture counts differ from its complete body")
        timestamp = instant(capture.get("capturedAt"))
        order = (timestamp, capture["id"])
        need(order >= previous_order, "original captures are not in their recorded observation order")
        previous_order = order
        seen = set()
        for row in items:
            request_id = identifier(row.get("serviceRequestId"))
            key = json.dumps([connection_id, request_id], ensure_ascii=False, separators=(",", ":"))
            need(request_id not in seen and request_id in source_by_id, "capture projection identity differs")
            seen.add(request_id)
            need(row.get("key") == key and row.get("connectionId") == connection_id and row.get("id") == request_id,
                 "preserve the connection-qualified original request identity")
            need(same(row.get("source"), source_by_id[request_id]), "a projected request differs from its original typed source")
            need(isinstance(row.get("sourceSha256"), str) and HASH.fullmatch(row["sourceSha256"]),
                 "retain the upstream source-version digest")
            # Source values, rather than a second implementation of JavaScript number
            # serialization, govern the native projection and its own binding digest.
            source = source_by_id[request_id]
            source_status = source.get("status")
            need(source_status is None or isinstance(source_status, str), "map an original scalar text source status")
            need(row.get("status") == source_status, "projected status differs from the native source")
            if key not in by_key:
                by_key[key] = []
                selected_order.append(key)
            by_key[key].append({"capture": capture, "row": row, "window": captures[capture["id"]]})
    need(set(originals_seen) == set(captures), "a selected original response is absent")
    obs = {}
    for observation in observations:
        key = observation.get("key")
        need(key in by_key and key not in obs, "the version index has a missing or repeated identity")
        obs[key] = observation
        actual = by_key[key]
        need(observation.get("serviceRequestId") == actual[-1]["row"]["serviceRequestId"] and
             observation.get("selectedCaptureId") == actual[-1]["capture"]["id"],
             "selected version is not the last retained observation")
        occurrences = objects(observation.get("occurrences"), "Complete occurrences")
        need(len(occurrences) == len(actual), "observation count differs")
        grouped = {}
        for occurrence, source in zip(occurrences, actual):
            expected = {"captureId": source["capture"]["id"], "windowId": source["window"]["id"],
                        "capturedAt": source["capture"].get("capturedAt"),
                        "sourceSha256": source["row"]["sourceSha256"],
                        "sourceResponseSha256": source["capture"]["sourceSha256"],
                        "requestedAt": source["row"].get("requestedAt"), "updatedAt": source["row"].get("updatedAt")}
            need(all(same(occurrence.get(k), v) for k, v in expected.items()), "an occurrence differs from its original capture")
            need(occurrence.get("windowPosition") in ("UNKNOWN_DATE", "WITHIN_RECORDED_BOUNDS",
                 "OUTSIDE_UPDATED_WINDOW", "OUTSIDE_REQUESTED_WINDOW"), "unknown source window classification")
            version = grouped.setdefault(source["row"]["sourceSha256"], {"item": source["row"], "occurrences": []})
            need(same(version["item"], source["row"]), "one upstream version digest labels different retained source projections")
            version["occurrences"].append(occurrence)
        versions = objects(observation.get("versions"), "Complete source versions")
        need(len(versions) == len(grouped), "version count differs")
        version_ids = set()
        for version in versions:
            version_id = version.get("sourceSha256")
            need(version_id in grouped and version_id not in version_ids, "a version is missing or repeated")
            version_ids.add(version_id)
            need(same(version.get("item"), grouped[version_id]["item"]) and
                 same(version.get("occurrences"), grouped[version_id]["occurrences"]), "version contents differ")
    need(set(obs) == set(by_key), "retain every original request's version index")
    need([row.get("key") for row in requests] == selected_order, "selected requests differ from the complete original population/order")
    rows = []
    for request in requests:
        key = request["key"]
        latest = by_key[key][-1]
        expected = {**latest["row"], "collectionId": collection_id, "captureId": latest["capture"]["id"],
                    "observationCount": len(by_key[key]), "versionCount": len(obs[key]["versions"])}
        need(same({k: v for k, v in request.items() if k != "review"}, expected),
             "selected request differs from its latest retained source version")
        source = request["source"]
        def scalar(name):
            value = source.get(name)
            return "" if value is None else value if isinstance(value, str) else canonical(value)
        rows.append({"id": key, "asset_id": "", "location_id": "", "summary": scalar("description"),
                     "status": scalar("status"), "created_at": scalar("requested_datetime"),
                     "original_request_id": request["serviceRequestId"], "connection_id": connection_id,
                     "address": scalar("address"), "agency": scalar("agency_responsible"),
                     "service_code": scalar("service_code"), "service_name": scalar("service_name"),
                     "updated_at": scalar("updated_datetime"), "latitude": source.get("lat"),
                     "longitude": source.get("long"), "capture_id": request["captureId"],
                     "source_version_sha256": request["sourceSha256"], "original_source": source,
                     "source_review": request.get("review"), "observation_count": request["observationCount"],
                     "version_count": request["versionCount"]})
    states = Counter(node["state"] for node in nodes)
    occurrences = [item for observation in observations for item in observation["occurrences"]]
    counts = {"windowCount": len(nodes), "pendingWindows": states["PENDING"], "activeWindows": 0,
              "capturedWindows": states["CAPTURED"], "splitWindows": states["SPLIT"],
              "limitedWindows": states["LIMITED"], "failedWindows": states["FAILED"],
              "originalCaptureCount": len(originals), "returnedRows": len(occurrences),
              "uniqueRequests": len(rows), "changedRequests": sum(row["version_count"] > 1 for row in rows),
              "duplicateObservations": len(occurrences) - len(rows),
              "outOfWindowRows": sum(item["windowPosition"].startswith("OUTSIDE_") for item in occurrences),
              "unknownDateRows": sum(item["windowPosition"] == "UNKNOWN_DATE" for item in occurrences)}
    if collection.get("policy", {}).get("strategy") == "pages":
        counts["pagedWindows"] = states["PAGED"]
    need(same(summary.get("counts"), counts), "summary counts differ from the retained original observations")
    cap_resolved = collection["state"] in ("COMPLETE", "LIMITED") and not any(
        counts[key] for key in ("pendingWindows", "activeWindows", "failedWindows", "limitedWindows"))
    need(summary.get("capResolved") is cap_resolved, "coverage flag differs from recorded window states")
    return {"columns": COLUMNS, "rows": rows, "metadata": {
        "format": "open311-collection", "schema": SCHEMA, "workspace_id": value["workspaceId"],
        "source_revision": value["revision"], "collection_id": collection_id,
        "connection_id": connection_id, "endpoint": connection.get("baseUrl"),
        "jurisdiction_id": connection.get("jurisdictionId"), "name": collection.get("name"),
        "counts": counts, "cap_resolved": cap_resolved, "state": collection["state"],
        "query": collection.get("query"), "policy": collection.get("policy"),
        "summary": summary, "original_operations": len(value["sourceOperations"]),
        "identity_rule": "Original connection ID plus native service request ID; no inferred asset association",
        "hash_contract": "Original response bytes are SHA256-verified. Upstream JavaScript row digests are retained as producer identities. Native review bindings hash the full typed native row independently.",
        "coverage": "These are the complete retained collection observations, not a transactionally frozen municipal population."}}
