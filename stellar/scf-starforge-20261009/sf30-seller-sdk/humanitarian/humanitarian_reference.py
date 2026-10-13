"""MIT. Pinned administrative references and explicit resolution decisions."""
from __future__ import annotations

import _bootstrap
from datetime import datetime
import re
from urllib.parse import urlsplit

from workspace import InputError, checked_id, digest, json_bytes, load_json, file_digest
from humanitarian_source import iter_table, hxl_tag, text, normalized_name

SCHEMA = "stellar-forge.humanitarian-reference.v1"
ALIAS = "stellar-forge.humanitarian-alias.v1"


def select_cell(selection, row, headers, label):
    if not isinstance(selection, dict) or len(selection) != 1:
        raise InputError(label + " requires one column index or constant")
    if "index" in selection:
        index = selection["index"]
        if type(index) is not int or not 0 <= index < len(headers):
            raise InputError(label + " column index is outside the saved header")
        return (row[index] if index < len(row) else "").strip()
    if "constant" in selection:
        return text(selection["constant"], label, 240, empty=True).strip()
    raise InputError(label + " has an unknown selector")


def source_metadata(raw):
    keys = {"publisher", "title", "url", "edition", "retrievedAt", "license"}
    if not isinstance(raw, dict) or set(raw) != keys:
        raise InputError("Reference provenance requires publisher, title, url, edition, retrievedAt and license")
    result = {k: text(raw[k], "Reference " + k, 400) for k in ("publisher", "title", "edition")}
    result["retrievedAt"] = text(raw["retrievedAt"], "Reference retrieval date", 80)
    try:
        stamp = datetime.fromisoformat(result["retrievedAt"].replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError()
    except ValueError as e:
        raise InputError("Reference retrieval date requires an ISO timestamp and time zone") from e
    for key in ("url", "license"):
        result[key] = None if raw[key] is None else text(raw[key], "Reference " + key, 2000)
    if result["url"] is not None:
        url = urlsplit(result["url"])
        if url.scheme not in ("https", "http") or not url.netloc or url.username or url.password:
            raise InputError("Reference source URL must be an ordinary public HTTP(S) URL")
    return result


def build_reference(ws, raw):
    allowed = {"requestId", "name", "source", "table", "headerRow", "hxlRow",
               "expectedHeaders", "levels", "provenance"}
    if not isinstance(raw, dict) or set(raw) - allowed:
        raise InputError("Unknown administrative-reference field")
    source = ws.source(raw.get("source"))
    definition = {k: raw.get(k) for k in ("name", "source", "table", "headerRow", "hxlRow", "expectedHeaders", "levels", "provenance")}
    definition["name"] = text(raw.get("name"), "Reference name", 160)
    definition["table"] = text(raw.get("table", "data"), "Reference table", 128)
    definition["headerRow"] = raw.get("headerRow", 1)
    definition["hxlRow"] = raw.get("hxlRow")
    definition["provenance"] = source_metadata(raw.get("provenance"))
    headers = definition["expectedHeaders"]
    if not isinstance(headers, list) or not 1 <= len(headers) <= 256 or not all(isinstance(h, str) for h in headers):
        raise InputError("Select the complete reference header row")
    header = definition["headerRow"]
    if type(header) is not int or not 1 <= header <= 100 or definition["hxlRow"] is not None and definition["hxlRow"] != header + 1:
        raise InputError("Select the reference header and optional following HXL row")
    levels = definition["levels"]
    if not isinstance(levels, list) or not 1 <= len(levels) <= 6:
        raise InputError("Select one through six complete administrative levels")
    actual_levels = []
    for level in levels:
        if not isinstance(level, dict) or set(level) - {"level", "code", "name", "aliases", "geometry"}:
            raise InputError("Unknown reference level field")
        number = level.get("level")
        if type(number) is not int or not 0 <= number <= 5:
            raise InputError("Administrative levels must be integers from zero through five")
        actual_levels.append(number)
        if not isinstance(level.get("aliases", []), list) or len(level.get("aliases", [])) > 12:
            raise InputError("Select at most twelve reference name-alias columns")
        for key in ("code", "name"):
            select_cell(level.get(key), [""] * len(headers), headers, key)
        for selection in level.get("aliases", []):
            select_cell(selection, [""] * len(headers), headers, "Name alias")
        if level.get("geometry") is not None:
            select_cell(level["geometry"], [""] * len(headers), headers, "Geometry")
    if actual_levels != list(range(min(actual_levels), max(actual_levels) + 1)):
        raise InputError("Select administrative levels once in consecutive parent-to-child order")
    source_path = ws.root / "sources" / (source["id"] + "." + ws.kind)
    if file_digest(source_path) != source["id"]:
        raise InputError("Original administrative-reference bytes changed")
    nodes, physical, found, tags = {}, 0, False, definition["hxlRow"] is None
    with source_path.open("rb") as stream:
        for ordinal, cells in iter_table(stream, definition["table"]):
            if ordinal < header:
                continue
            if ordinal == header:
                if cells != headers:
                    raise InputError("Administrative-reference header differs from the selected complete header")
                found = True
                continue
            if ordinal == definition["hxlRow"]:
                for value in cells:
                    hxl_tag(value)
                tags = True
                continue
            if not cells or all(v == "" for v in cells):
                continue
            if not found or len(cells) > len(headers):
                raise InputError("Reference row lies outside the selected complete header")
            physical += 1
            parent = None
            for level in levels:
                code = select_cell(level["code"], cells, headers, "Administrative code")
                name = select_cell(level["name"], cells, headers, "Administrative name")
                if not code and not name:
                    parent = None
                    continue
                if not code or not name or len(code) > 120 or len(name) > 400:
                    raise InputError(f"Reference row {ordinal}: each place needs its complete code and name")
                if level["level"] != actual_levels[0] and parent is None:
                    raise InputError(f"Reference row {ordinal}: code {code} has no selected immediate parent")
                aliases = {name}
                for selection in level.get("aliases", []):
                    value = select_cell(selection, cells, headers, "Administrative alias")
                    if value:
                        aliases.add(text(value, "Administrative alias", 400))
                geometry = None
                if level.get("geometry") is not None:
                    encoded = select_cell(level["geometry"], cells, headers, "Geometry")
                    if encoded:
                        geometry = load_json(encoded)
                        if not isinstance(geometry, dict) or geometry.get("type") not in {
                                "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"}:
                            raise InputError(f"Reference row {ordinal}: choose a complete GeoJSON geometry")
                        if "coordinates" not in geometry:
                            raise InputError("Reference geometry requires its complete coordinates")
                node = {"code": code, "name": name, "level": level["level"], "parent": parent,
                        "aliases": sorted(aliases), "geometry": geometry}
                if code in nodes:
                    prior = nodes[code]
                    if any(prior[key] != node[key] for key in ("name", "level", "parent", "geometry")):
                        raise InputError(f"Reference row {ordinal}: code {code} has conflicting administrative meaning")
                    prior["aliases"] = sorted(set(prior["aliases"]) | aliases)
                else:
                    nodes[code] = node
                parent = code
    if not found or not tags or not nodes:
        raise InputError("Reference must include its selected header, optional HXL row and complete places")
    ordered = sorted(nodes.values(), key=lambda n: (n["level"], n["code"]))
    for node in ordered:
        if node["parent"] is not None:
            parent = nodes.get(node["parent"])
            if parent is None or parent["level"] != node["level"] - 1:
                raise InputError("Every administrative parent must be present at the preceding level")
    body = {"schema": SCHEMA, "definition": definition, "source": source["id"],
            "physicalRows": physical, "counts": {str(level): sum(n["level"] == level for n in ordered) for level in actual_levels},
            "nodes": ordered}
    return body | {"id": digest(json_bytes(body))}


def reference_index(reference):
    by_code = {n["code"]: n for n in reference["nodes"]}
    by_name = {}
    for node in reference["nodes"]:
        for alias in node["aliases"]:
            by_name.setdefault((node["level"], normalized_name(alias)), set()).add(node["code"])
    return {"codes": by_code, "names": by_name}


def ancestors(index, code):
    result, visited = {}, set()
    while code is not None:
        if code in visited or code not in index["codes"]:
            raise InputError("Administrative hierarchy changed or contains a cycle")
        visited.add(code)
        node = index["codes"][code]
        result[node["level"]] = node
        code = node["parent"]
    return result


def validate_alias(reference, raw):
    allowed = {"requestId", "reference", "level", "match", "value", "scopeCode", "code", "reviewer", "reason"}
    if not isinstance(raw, dict) or set(raw) - allowed or raw.get("reference") != reference["id"]:
        raise InputError("Alias decision must select its original reference edition")
    index = reference_index(reference)
    code, level = raw.get("code"), raw.get("level")
    if code not in index["codes"] or type(level) is not int or index["codes"][code]["level"] != level:
        raise InputError("Alias decision must choose a code at the selected administrative level")
    match = raw.get("match", "name")
    if match not in ("name", "code"):
        raise InputError("Alias decision matches a name or a legacy code")
    value = text(raw.get("value"), "Original alias value", 400)
    scope = raw.get("scopeCode")
    if scope is not None and (scope not in index["codes"] or scope not in {n["code"] for n in ancestors(index, code).values() if n["level"] < level}):
        raise InputError("Alias scope must be an actual ancestor of the selected code")
    body = {"schema": ALIAS, "reference": reference["id"], "level": level, "match": match,
            "value": value, "normalizedValue": normalized_name(value) if match == "name" else value.strip(),
            "scopeCode": scope, "code": code,
            "reviewer": text(raw.get("reviewer"), "Reviewer", 160),
            "reason": text(raw.get("reason"), "Alias decision reason", 2000)}
    return body | {"id": digest(json_bytes(body))}


def alias_index(reference, decisions):
    result = {}
    for decision in decisions:
        if decision["reference"] != reference["id"]:
            raise InputError("Selected aliases belong to a different reference edition")
        key = (decision["level"], decision["match"], decision["normalizedValue"], decision["scopeCode"])
        if key in result and result[key]["code"] != decision["code"]:
            raise InputError("Selected named alias decisions disagree for the same input and scope")
        result[key] = decision
    return result


def resolve(index, reviewed, level, code="", name="", scope_code=None):
    """Resolve a row using its exact code, reference names and selected review decisions."""
    code, name = ("" if code is None else str(code).strip()), ("" if name is None else str(name).strip())
    if scope_code is not None:
        scope_code = str(scope_code).strip() or None
    def in_scope(candidate):
        node = index["codes"][candidate]
        return node["level"] == level and (scope_code is None or scope_code in {
            a["code"] for a in ancestors(index, candidate).values() if a["level"] < level})
    if scope_code is not None and (scope_code not in index["codes"] or index["codes"][scope_code]["level"] >= level):
        return {"status": "unresolved", "issue": "UNKNOWN_SCOPE", "message": "The selected ancestor code is absent or at the wrong level",
                "candidates": [], "decisions": []}
    decision_ids = []
    def decision(kind, value):
        scoped = reviewed.get((level, kind, value, scope_code))
        general = reviewed.get((level, kind, value, None))
        selected = scoped or general
        if selected and in_scope(selected["code"]):
            decision_ids.append(selected["id"])
            return selected["code"]
        return None
    if code:
        selected = decision("code", code) or (code if code in index["codes"] and in_scope(code) else None)
        if selected is None:
            return {"status": "unresolved", "issue": "UNKNOWN_CODE", "message": "Code is absent, at another level, or outside the selected ancestor",
                    "candidates": [], "decisions": decision_ids}
        names = {candidate for candidate in index["names"].get((level, normalized_name(name)), set()) if in_scope(candidate)} if name else set()
        named = decision("name", normalized_name(name)) if name else None
        if named:
            names = {named}
        if names and selected not in names:
            return {"status": "unresolved", "issue": "CODE_NAME_CONFLICT", "message": "The source code and named place select different reference locations",
                    "candidates": sorted(names | {selected}), "decisions": decision_ids}
        return {"status": "matched", "code": selected, "method": "reviewed-code" if code != selected else "code",
                "nameDifference": bool(name and not names), "decisions": sorted(set(decision_ids))}
    if not name:
        return {"status": "unresolved", "issue": "MISSING_LOCATION", "message": "Select a source code or place name",
                "candidates": [], "decisions": []}
    selected = decision("name", normalized_name(name))
    candidates = {selected} if selected else {candidate for candidate in index["names"].get((level, normalized_name(name)), set()) if in_scope(candidate)}
    if len(candidates) == 1:
        return {"status": "matched", "code": next(iter(candidates)), "method": "reviewed-name" if selected else "reference-name",
                "nameDifference": False, "decisions": sorted(set(decision_ids))}
    return {"status": "unresolved", "issue": "AMBIGUOUS_NAME" if candidates else "UNKNOWN_NAME",
            "message": "Select a named alias decision for this source name and its administrative scope",
            "candidates": sorted(candidates), "decisions": sorted(set(decision_ids))}
