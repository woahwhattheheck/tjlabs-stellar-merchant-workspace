"""MIT. Complete IATI 2.03 location associations for the original dataset engine."""
from __future__ import annotations

from collections import Counter
from decimal import Decimal, InvalidOperation
import re

CRS = "http://www.opengis.net/def/crs/EPSG/0/4326"
EXACTNESS = {"1": "Exact", "2": "Approximate"}
LOCATION_CLASS = {"1": "Administrative Region", "2": "Populated Place",
                  "3": "Structure", "4": "Other Topographical Feature"}
LOCATION_REACH = {"1": "Activity", "2": "Intended Beneficiaries"}
COORDINATE_STATUSES = ("valid", "missing", "invalid", "not-reported")
LOCATION_FIELDS = [
    "location_ref", "location_name", "location_present", "location_ordinal", "location_count",
    "name_narratives_json", "descriptions_json", "activity_descriptions_json",
    "location_ids_json", "administrative_json", "point_json", "position_text", "srs_name",
    "latitude", "longitude", "coordinate_status", "location_reach", "exactness",
    "location_class", "feature_designation", "record_json", "issues_json",
]
CONTRACT = {
    "schema": "stellar-forge.iati-geography-contract.v1", "standard": "2.03",
    "asOf": "2026-10-12", "crs": CRS,
    "sourceAxisOrder": ["latitude", "longitude"],
    "geojsonAxisOrder": ["longitude", "latitude"],
    "coordinateStatuses": list(COORDINATE_STATUSES),
    "exactness": EXACTNESS, "locationClass": LOCATION_CLASS, "locationReach": LOCATION_REACH,
    "semantics": {
        "coverage": "One row for each complete location; an explicit absence row for an activity with no location.",
        "coordinates": "Only a single reported point with the IATI CRS and two finite in-range coordinates is mapped.",
        "unlocated": "Gazetteer, administrative and narrative locations remain reviewable without invented coordinates.",
        "precision": "Exactness is the publisher's code; the number of decimal places does not determine accuracy.",
        "finance": "Finance belongs to the linked activity/portfolio. No amount is allocated or repeated per location.",
        "identity": "A unique location ref within an activity is preferred; otherwise complete associated content plus occurrence.",
        "review": "Findings identify the exact source and location row. They do not change publisher XML.",
        "geojson": "Unlocated records use null geometry. The full original position and location association remain properties.",
        "license": "The source publisher's license and attribution travel with every geography handover.",
    },
    "sources": [
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/",
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/point/",
        "https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/point/pos/",
        "https://iatistandard.org/en/iati-standard/203/codelists/geographicexactness/",
        "https://iatistandard.org/en/iati-standard/203/codelists/geographiclocationclass/",
        "https://iatistandard.org/en/iati-standard/203/codelists/geographiclocationreach/",
        "https://www.rfc-editor.org/rfc/rfc7946",
    ],
}

def problem(code, message, severity="warning"):
    return {"code": code, "message": message, "severity": severity, "scope": "location"}

def numeric(value):
    """Keep an exact decimal representation; the original XML position is separate."""
    if (not isinstance(value, str) or len(value) > 256 or
            not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?", value)):
        return None
    try:
        number = Decimal(value)
        return number if number.is_finite() else None
    except (InvalidOperation, ValueError):
        return None

def coordinate(point_nodes):
    from iati_source import children
    issues = []
    if not point_nodes:
        return {"point_json": "[]", "position_text": "", "srs_name": "",
                "latitude": "", "longitude": "", "coordinate_status": "missing"}, [
                    problem("point-not-reported", "This location has no reported point; its other associations are retained.", "info")]
    from iati_source import canonical, node_object
    result = {"point_json": canonical([node_object(p) for p in point_nodes]),
              "position_text": "", "srs_name": "", "latitude": "", "longitude": "",
              "coordinate_status": "invalid"}
    if len(point_nodes) != 1:
        issues.append(problem("point-cardinality", "A location may contain at most one point."))
        return result, issues
    point = point_nodes[0]
    result["srs_name"] = point.attrs.get("srsName", "")
    positions = children(point, "pos")
    if len(positions) == 1:
        result["position_text"] = positions[0].text("descendant")
    else:
        issues.append(problem("position-cardinality", "A reported point must contain exactly one pos."))
    if result["srs_name"] != CRS:
        issues.append(problem("point-crs", "IATI 2.03 requires the exact EPSG 4326 srsName."))
    if len(positions) != 1:
        return result, issues
    tokens = result["position_text"].split()
    if len(tokens) != 2:
        issues.append(problem("position-pair", "IATI pos must contain latitude followed by longitude."))
        return result, issues
    latitude, longitude = (numeric(value) for value in tokens)
    if latitude is None or longitude is None:
        issues.append(problem("position-numeric", "Both coordinates must be finite numbers."))
    elif not Decimal(-90) <= latitude <= Decimal(90) or not Decimal(-180) <= longitude <= Decimal(180):
        issues.append(problem("position-range", "Latitude must be within -90..90 and longitude within -180..180."))
    if not issues:
        result.update(latitude=str(latitude), longitude=str(longitude), coordinate_status="valid")
    return result, issues

def identity_object(value):
    """Ignore formatting between known structural elements, preserving every full source object separately."""
    structural = {"location", "name", "description", "activity-description", "administrative",
                  "point", "location-id", "location-reach", "exactness", "location-class", "feature-designation"}
    def visit(node, preserve=False):
        attributes = node["attributes"]
        space = attributes.get("{http://www.w3.org/XML/1998/namespace}space")
        preserve = True if space == "preserve" else False if space == "default" else preserve
        has_children = any(isinstance(item, dict) for item in node["content"])
        content = []
        for item in node["content"]:
            if isinstance(item, dict):
                content.append(visit(item, preserve))
            elif not (has_children and node["name"] in structural and not preserve and not item.strip()):
                content.append(item)
        return {"name": node["name"], "attributes": dict(attributes), "content": content}
    return visit(value)

def location_rows(activity, requested_language=""):
    from iati_source import (
        activity_context, canonical, children, child, fingerprint, narratives,
        node_object, objects, preferred,
    )
    common, language, activity_problems = activity_context(activity, requested_language)
    context_issues = [{**item, "severity": "warning", "scope": "activity"} for item in activity_problems]
    locations = children(activity, "location")
    refs = Counter(item.attrs.get("ref", "") for item in locations)
    occurrences = Counter()
    if not locations:
        row = {**common, **{name: "" for name in LOCATION_FIELDS}}
        for name in LOCATION_FIELDS:
            if name.endswith("_json"):
                row[name] = "[]"
        row.update(row_id=fingerprint(["location-absence", common["activity_id"]]),
                   identity_basis="activity-location-absence", location_present="false",
                   location_ordinal="0", location_count="0", coordinate_status="not-reported",
                   record_json="null", issues_json=canonical(context_issues + [
                       problem("location-not-reported", "This activity has no location element.", "info")]))
        yield row
        return
    for ordinal, location in enumerate(locations, 1):
        record = node_object(location)
        ref = location.attrs.get("ref", "")
        issues = list(context_issues)
        if ref and refs[ref] == 1:
            identity = ["location-ref", common["activity_id"], ref]
            basis = "activity-identifier-and-location-ref"
        else:
            content_id = fingerprint(identity_object(record))
            occurrences[content_id] += 1
            identity = ["location-content", common["activity_id"], content_id, occurrences[content_id]]
            basis = "associated-content-and-occurrence"
            if ref:
                issues.append(problem("location-ref-ambiguous", "The location ref repeats within this activity; content and occurrence identify the row."))
        position, point_issues = coordinate(children(location, "point"))
        issues.extend(point_issues)
        classifications = {}
        for name, column, codes in [
            ("location-reach", "location_reach", LOCATION_REACH),
            ("exactness", "exactness", EXACTNESS),
            ("location-class", "location_class", LOCATION_CLASS),
            ("feature-designation", "feature_designation", None),
        ]:
            nodes = children(location, name)
            classifications[column] = nodes[0].attrs.get("code", "") if len(nodes) == 1 else ""
            if len(nodes) > 1:
                issues.append(problem(name + "-cardinality", "The location contains more than one " + name + "."))
            elif nodes and not classifications[column]:
                issues.append(problem(name + "-code", "A reported " + name + " requires its code."))
            elif nodes and codes is not None and classifications[column] not in codes:
                issues.append(problem(name + "-unlisted", "The reported " + name + " code is outside the IATI 2.03 codelist."))
        for name in ("name", "description", "activity-description"):
            if len(children(location, name)) > 1:
                issues.append(problem(name + "-cardinality", "The location contains more than one " + name + "; all originals are retained."))
        for name in ("location-id", "administrative"):
            for node in children(location, name):
                for attribute in ("vocabulary", "code"):
                    if not node.attrs.get(attribute):
                        issues.append(problem(name + "-" + attribute, "Each " + name + " requires " + attribute + "."))
        yield {
            **common, "row_id": fingerprint(identity), "identity_basis": basis,
            "location_ref": ref, "location_name": preferred(child(location, "name"), language, requested_language),
            "location_present": "true", "location_ordinal": str(ordinal), "location_count": str(len(locations)),
            "name_narratives_json": canonical([narrative for node in children(location, "name")
                                               for narrative in narratives(node, language)]),
            "descriptions_json": canonical(objects(location, "description")),
            "activity_descriptions_json": canonical(objects(location, "activity-description")),
            "location_ids_json": canonical(objects(location, "location-id")),
            "administrative_json": canonical(objects(location, "administrative")),
            **position, **classifications, "record_json": canonical(record), "issues_json": canonical(issues),
        }
