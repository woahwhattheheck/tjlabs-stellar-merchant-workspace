# SPDX-License-Identifier: MIT
"""Return the original mapping workbook to a complete native plan and input journal."""
from __future__ import annotations
import base64
import copy
import hashlib
import io
import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from .native import STAC, files, vector, need
from . import plan as plans
from .mapping_workbook.mapping_register import export_register, original_file

SOURCE = "starforge.gis-migration-workbook-source.v1"
PROPOSAL = "starforge.gis-migration-workbook-proposal.v1"
INPUT = "starforge.gis-migration-workbook-input.v1"
MAX_FILE = 16 * 1024 * 1024
MAX_PAIR = 24 * 1024 * 1024
FIRST = 8
TEXT_LIMIT = 30000
CELL = re.compile(r"^([A-Z]{1,3})([1-9][0-9]{0,6})$")
POINTER = re.compile(r"^Full value: Text details / text-[0-9]+ \(([0-9]+) characters; SHA-256 ([a-f0-9]{64})\)$")
DROP = object()

def _raw(value, label):
    need(isinstance(value, str) and len(value) <= ((MAX_FILE + 2) // 3) * 4,
         "MAPPING_WORKBOOK_INPUT_REQUIRED", label)
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as exc:
        raise ValueError("Keep the complete original base64 input: " + label) from exc
    need(0 < len(raw) <= MAX_FILE and base64.b64encode(raw).decode("ascii") == value,
         "MAPPING_WORKBOOK_INPUT_SIZE", label)
    return raw

def _descriptor(raw, path):
    return {"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def _text(value):
    return "" if value is None else value if isinstance(value, str) else files.canonical(value)

def _display_matches(displayed, original):
    value = _text(original)
    length = len(value.encode("utf-16-le", errors="surrogatepass")) // 2
    if length <= TEXT_LIMIT:
        return displayed == value or value.startswith("=") and displayed == "'" + value
    match = POINTER.fullmatch(displayed)
    return bool(match and int(match[1]) == length and match[2] == hashlib.sha256(value.encode("utf-8")).hexdigest())

def _local(tag):
    return tag.rsplit("}", 1)[-1]

def _attribute(element, key):
    return next((value for name, value in element.attrib.items() if _local(name) == key), None)

def _excel_text(value):
    # One pass preserves an escaped literal "_xHHHH_" while decoding actual OOXML text escapes.
    value = re.sub(r"_x([a-fA-F0-9]{4})_", lambda match: chr(int(match[1], 16)), value)
    try:
        return value.encode("utf-16-le", errors="surrogatepass").decode("utf-16-le")
    except UnicodeError as exc:
        raise ValueError("A workbook text cell contains an incomplete Unicode value.") from exc

def _string(element):
    return _excel_text("".join((child.text or "") if _local(child.tag) == "t" else
                             "".join(node.text or "" for node in child if _local(node.tag) == "t")
                             if _local(child.tag) == "r" else "" for child in element))

class Workbook:
    """Read explicit XLSX cells with standard Python; workbook formulas are never evaluated."""

    def __init__(self, raw):
        try:
            self.archive = zipfile.ZipFile(io.BytesIO(raw))
            members = self.archive.infolist()
            names = [item.filename for item in members]
            need(len(names) == len(set(names)) and len(names) <= 2048,
                 "MAPPING_WORKBOOK_PACKAGE_MEMBERS")
            need(sum(item.file_size for item in members) <= 128 * 1024 * 1024
                 and all(item.file_size <= 64 * 1024 * 1024 and not item.flag_bits & 1 for item in members),
                 "MAPPING_WORKBOOK_PACKAGE_SIZE")
            need(all(not name.startswith("/") and "\\" not in name
                     and all(part not in (".", "..") for part in name.rstrip("/").split("/")) for name in names),
                 "MAPPING_WORKBOOK_PACKAGE_PATH")
            self.members = set(names)
            self.strings = []
            if "xl/sharedStrings.xml" in self.members:
                self.strings = [_string(item) for item in self._xml("xl/sharedStrings.xml") if _local(item.tag) == "si"]
            relationships = {}
            for item in self._xml("xl/_rels/workbook.xml.rels"):
                if _local(item.tag) != "Relationship":
                    continue
                identifier, target = item.get("Id"), item.get("Target")
                need(isinstance(identifier, str) and identifier not in relationships,
                     "MAPPING_WORKBOOK_RELATIONSHIP")
                if item.get("TargetMode") == "External":
                    relationships[identifier] = None
                    continue
                need(isinstance(target, str) and "\\" not in target,
                     "MAPPING_WORKBOOK_RELATIONSHIP")
                resolved = posixpath.normpath(target.lstrip("/") if target.startswith("/") else "xl/" + target)
                need(resolved.startswith("xl/") and resolved in self.members,
                     "MAPPING_WORKBOOK_RELATIONSHIP_TARGET", target)
                relationships[identifier] = resolved
            self.sheets, self.loaded = {}, {}
            for item in self._xml("xl/workbook.xml").iter():
                if _local(item.tag) != "sheet":
                    continue
                name, target = item.get("name"), relationships.get(_attribute(item, "id"))
                need(isinstance(name, str) and name not in self.sheets and target is not None,
                     "MAPPING_WORKBOOK_SHEET_IDENTITY", name)
                self.sheets[name] = target
        except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
            raise ValueError("Choose the complete XLSX mapping workbook and its original Mapping-Register.json.") from exc

    def close(self):
        self.archive.close()

    def _xml(self, name):
        need(name in self.members if hasattr(self, "members") else name in self.archive.namelist(),
             "MAPPING_WORKBOOK_MEMBER_REQUIRED", name)
        raw = self.archive.read(name)
        need(b"<!DOCTYPE" not in raw.upper() and b"<!ENTITY" not in raw.upper(),
             "MAPPING_WORKBOOK_XML_DECLARATION")
        return ET.fromstring(raw)

    def rows(self, name):
        if name in self.loaded:
            return self.loaded[name]
        need(name in self.sheets, "MAPPING_WORKBOOK_SHEET_REQUIRED", name)
        rows, cell_count = {}, 0
        try:
            document = self._xml(self.sheets[name])
            for item in document.iter():
                if _local(item.tag) != "c":
                    continue
                address = item.get("r", "")
                match = CELL.fullmatch(address)
                need(match is not None, "MAPPING_WORKBOOK_CELL_ADDRESS", address)
                column, row = match[1], int(match[2])
                members = rows.setdefault(row, {})
                need(column not in members, "MAPPING_WORKBOOK_DUPLICATE_CELL", name + "!" + address)
                children = {_local(child.tag): child for child in item}
                formula = "f" in children
                kind = item.get("t", "n")
                node = children.get("v")
                value = node.text or "" if node is not None else ""
                if kind == "s":
                    need(value.isdecimal() and int(value) < len(self.strings),
                         "MAPPING_WORKBOOK_SHARED_TEXT", name + "!" + address)
                    value = self.strings[int(value)]
                elif kind == "inlineStr":
                    value = _string(children["is"]) if "is" in children else ""
                elif kind == "str":
                    value = _excel_text(value)
                elif kind == "b":
                    need(value in ("0", "1"), "MAPPING_WORKBOOK_BOOLEAN", address)
                    value = "TRUE" if value == "1" else "FALSE"
                elif kind not in ("n", "d", "e"):
                    raise ValueError("Unsupported XLSX cell value: " + name + "!" + address)
                members[column] = {"value": value, "formula": formula, "type": kind}
                cell_count += 1
                need(cell_count <= 2000000, "MAPPING_WORKBOOK_CELL_COUNT", name)
        except (zipfile.BadZipFile, ET.ParseError, KeyError) as exc:
            raise ValueError("The complete worksheet could not be read: " + name) from exc
        self.loaded[name] = rows
        return rows

    def cell(self, sheet, column, row, *, literal=True):
        cell = self.rows(sheet).get(row, {}).get(column, {"value": "", "formula": False, "type": "str"})
        need(not literal or not cell["formula"], "MAPPING_WORKBOOK_LITERAL_CHOICE", sheet + "!" + column + str(row))
        need(cell["type"] != "e", "MAPPING_WORKBOOK_CELL_ERROR", sheet + "!" + column + str(row))
        return cell["value"]

def _column(index):
    result = ""
    while index:
        index, letter = divmod(index - 1, 26)
        result = chr(65 + letter) + result
    return result

def _specifications(register, plan):
    names = {row["layer_id"]: row["source_name"] for row in register["layers"]}
    named = lambda rows: [{"source_layer": names.get(row.get("layer_id"), row.get("layer_id", "")), **row} for row in rows]
    field_targets, layer_targets, key_targets, project_targets = [], [], [], []
    for li, layer in enumerate(plan["layers"]):
        layer_targets.append(("layers", li))
        for fi, field in enumerate(layer["fields"]):
            field_targets.append(("layers", li, "fields", fi))
        for ki, key in enumerate(layer["keys"]):
            for field in key["fields"]:
                key_targets.append(("layers", li, "keys", ki))
    unique_projects, seen = [], set()
    for row in register["projects"]:
        if row["project_id"] not in seen:
            seen.add(row["project_id"]); unique_projects.append(row)
    for pi, project in enumerate(plan["projectDefinitions"]):
        for layer_id in project["sourceLayerIds"]:
            project_targets.append(("projectDefinitions", pi, "layerOptions", layer_id))
    # key, visible heading, native path tail, conversion. None tail means retained identity.
    return [
        ("Field mapping", named(register["fields"]), field_targets, [
            ("source_layer", "Source layer", None, ""), ("source_field", "Source field", None, ""),
            ("destination_field", "Destination name", "name", "text"), ("mode", "Conversion", "mode", "text"),
            ("physical_type_choice", "Requested type", "physicalType", "optional"),
            ("null_policy", "Null policy", "nullPolicy", "text"),
            ("shapefile_name_choice", "Shapefile name", "shapefileName", "optional"),
            ("note", "Mapping note", "note", "text"), ("layer_id", "Original layer ID", None, "")]),
        ("Layers", register["layers"], layer_targets, [
            ("source_name", "Source layer", None, ""), ("table", "Destination table", "table", "text"),
            ("title", "Layer title", "title", "text"), ("geometry_null_policy", "Null geometry policy", "geometryNulls", "text"),
            ("features", "Features", None, "count"), ("null_geometries", "Null geometries", None, "count"),
            ("geometry_types_json", "Observed geometries", None, ""), ("issues", "Source issues", None, "count"),
            ("note", "Layer note", "note", "text"), ("layer_id", "Original layer ID", None, "")]),
        ("Coordinates", register["layers"], layer_targets, [
            ("source_name", "Source layer", None, ""), ("source_crs_choice", "Selected source CRS", "sourceCrs", "optional"),
            ("assigned_source_crs", "Explicit assigned source CRS", "assignSourceCrs", "optional"),
            ("target_crs", "Selected target CRS", "targetCrs", "optional"),
            ("source_crs_wkt", "Original native CRS WKT", None, ""), ("layer_id", "Original layer ID", None, "")]),
        ("Keys", named(register["keys"]), key_targets, [
            ("source_layer", "Source layer", None, ""), ("key", "Key name", "name", "text"),
            ("position", "Key position", None, "count"), ("source_field", "Original key field", None, ""),
            ("null_policy", "Key null policy", "nulls", "text"), ("note", "Key note", "note", "text"),
            ("layer_id", "Original layer ID", None, "")]),
        ("Projects", unique_projects, [("projectDefinitions", i) for i in range(len(plan["projectDefinitions"]))], [
            ("project_id", "Definition ID", None, ""), ("title", "Delivery title", "title", "text"),
            ("project_crs", "Selected project CRS", "projectCrs", "nullable"),
            ("format", "Destination format", "format", "text"),
            ("complete_definition_json", "Complete exported definition", None, "")]),
        ("Project layers", named(register["projects"]), project_targets, [
            ("project_id", "Definition ID", None, ""), ("title", "Exported delivery title", None, ""),
            ("layer_position", "Layer order", None, "count"), ("source_layer", "Selected source layer", None, ""),
            ("layer_options_json", "Complete layer options JSON", "", "json"),
            ("layer_id", "Original layer ID", None, "")]),
    ]

def _same_count(value, original):
    try:
        return files.parse_json(value) == files.parse_json(str(original))
    except (ValueError, TypeError):
        return False

def _convert(value, kind):
    need("\0" not in value, "MAPPING_WORKBOOK_TEXT_INVALID")
    need(POINTER.fullmatch(value) is None, "MAPPING_WORKBOOK_LONG_CHOICE",
         "Use the complete original editor to replace a retained long choice.")
    if kind == "optional" and value == "":
        return DROP
    if kind == "nullable" and value == "":
        return None
    if kind == "json":
        if value == "":
            return DROP
        parsed = files.parse_json(value)
        need(isinstance(parsed, dict), "MAPPING_WORKBOOK_OPTIONS_OBJECT",
             "Layer options must be one complete JSON object for the selected source layer.")
        return parsed
    return value

def _assign(value, path, result):
    target = value
    for part in path[:-1]:
        if isinstance(target, dict) and part not in target:
            target[part] = {}
        target = target[part]
        need(isinstance(target, (dict, list)), "MAPPING_WORKBOOK_NATIVE_PATH", list(path))
    if result is DROP:
        need(isinstance(target, dict), "MAPPING_WORKBOOK_NATIVE_PATH", list(path))
        target.pop(path[-1], None)
    else:
        target[path[-1]] = result

def _changes(workbook, register, plan):
    expected = {
        ("Overview", "C", 21): register["workspace"]["id"],
        ("Overview", "C", 22): register["plan_id"],
        ("Overview", "C", 23): register["capture_id"],
    }
    for (sheet, column, row), value in expected.items():
        need(workbook.cell(sheet, column, row) == value, "MAPPING_WORKBOOK_SOURCE_IDENTITY", sheet + "!" + column + str(row))
    baseline, changes, writes = FIRST, [], {}
    specs = _specifications(register, plan)
    for sheet, rows, targets, columns in specs:
        need(len(rows) == len(targets), "MAPPING_WORKBOOK_COMPLETE_TARGETS", sheet)
        for ci, (_, heading, _, _) in enumerate(columns, 1):
            need(workbook.cell(sheet, _column(ci), FIRST - 1) == heading,
                 "MAPPING_WORKBOOK_COLUMN_CHANGED", sheet + " / " + heading)
        for offset, (row, target) in enumerate(zip(rows, targets)):
            number = FIRST + offset
            object_id = row.get("layer_id") or row.get("project_id", "")
            for ci, (key, heading, tail, conversion) in enumerate(columns, 1):
                letter = _column(ci)
                actual = workbook.cell(sheet, letter, number)
                original = row.get(key)
                if tail is None:
                    equal = _same_count(actual, original) if conversion == "count" else _display_matches(actual, original)
                    need(equal, "MAPPING_WORKBOOK_ROW_IDENTITY",
                         sheet + "!" + letter + str(number) + ": preserve exported rows and gray source cells.")
                    continue
                need(workbook.cell("Original choices", "A", baseline) == sheet
                     and _same_count(workbook.cell("Original choices", "B", baseline), number)
                     and workbook.cell("Original choices", "C", baseline) == heading
                     and workbook.cell("Original choices", "E", baseline) == object_id,
                     "MAPPING_WORKBOOK_BASELINE_IDENTITY", baseline)
                before = workbook.cell("Original choices", "D", baseline)
                need(_display_matches(before, original), "MAPPING_WORKBOOK_BASELINE_CHANGED", baseline)
                baseline += 1
                if _display_matches(actual, original):
                    continue
                # The unchanged original long-text pointer keeps the complete original value.
                if POINTER.fullmatch(before) and actual == before:
                    continue
                value = _convert(actual, conversion)
                path = target + ((tail,) if tail else ())
                encoded = "__removed__" if value is DROP else files.canonical(value)
                need(path not in writes or writes[path][0] == encoded,
                     "MAPPING_WORKBOOK_COMPOSITE_CHOICE",
                     "Keep one agreed name, null policy and note for all members of a composite key.")
                writes[path] = (encoded, value)
                changes.append({"sheet": sheet, "row": number, "column": letter, "choice": heading,
                    "objectId": object_id, "planPath": list(path), "before": _text(original),
                    "after": actual, "removesOptionalChoice": value is DROP})
        last = FIRST + len(rows)
        for number, cells in workbook.rows(sheet).items():
            if number >= last:
                need(not any(cells.get(_column(ci), {}).get("value", "") for ci in range(1, len(columns) + 1)),
                     "MAPPING_WORKBOOK_ADDED_ROWS", sheet + ": add or remove mapping rows in the native editor.")
    for number, cells in workbook.rows("Original choices").items():
        if number >= baseline:
            need(not any(cells.get(column, {}).get("value", "") for column in ("A", "B", "C", "D", "E")),
                 "MAPPING_WORKBOOK_BASELINE_ROWS")
    for path, (_, value) in writes.items():
        _assign(plan, path, value)
    return changes, len(writes)

def _validate_register(workspace, register):
    need(isinstance(register, dict) and register.get("schema") == "starforge.gis-migration-mapping-register.v1",
         "MAPPING_WORKBOOK_REGISTER_REQUIRED")
    fresh = export_register(STAC, workspace.root, register.get("plan_id"), workspace.read()["id"])
    need(isinstance(register.get("workspace"), dict) and register["workspace"].get("id") == fresh["workspace"]["id"],
         "MAPPING_WORKBOOK_WORKSPACE_CHANGED")
    revision = register["workspace"].get("revision")
    need(type(revision) is int and 0 <= revision <= fresh["workspace"]["revision"],
         "MAPPING_WORKBOOK_WORKSPACE_REVISION")
    stable = ("schema", "plan_id", "capture_id", "selection_id", "title", "plan_note", "predecessor_plan_id",
              "formats", "postgis_schema", "source_edition_json", "source_changes_json", "fields", "layers",
              "keys", "projects", "native_profiles", "decisions", "provenance", "originals")
    for key in stable:
        need(key in register and files.canonical(register[key]) == files.canonical(fresh[key]),
             "MAPPING_WORKBOOK_REGISTER_CHANGED", key)
    review, current = register.get("review"), fresh["review"]
    need(isinstance(review, dict) and all(review.get(key) == current[key] for key in
         ("source_constraints_valid", "source_issues", "features")), "MAPPING_WORKBOOK_SOURCE_REVIEW_CHANGED")
    history = review.get("history")
    need(isinstance(history, list) and len(history) <= len(current["history"])
         and files.canonical(history) == files.canonical(current["history"][:len(history)])
         and review.get("latest") == (history[-1] if history else None),
         "MAPPING_WORKBOOK_REVIEW_HISTORY_CHANGED")
    original = register["originals"]["plan"]
    raw = _raw(original["content_base64"], "original saved plan")
    need(_descriptor(raw, original["descriptor"]["path"]) == files.descriptor(original["descriptor"]),
         "MAPPING_WORKBOOK_PLAN_BYTES_CHANGED")
    return fresh, files.parse_json(raw)

def export(workspace, plan_id):
    register = export_register(STAC, workspace.root, plan_id, workspace.read()["id"])
    raw = files.json_bytes(register)
    need(len(raw) <= MAX_FILE, "MAPPING_WORKBOOK_REGISTER_SIZE")
    return {"schema": "starforge.gis-migration-mapping-register-export.v1",
            "workspaceId": register["workspace"]["id"], "workspaceRevision": register["workspace"]["revision"],
            "planId": plan_id, "captureId": register["capture_id"], "file": _descriptor(raw, "Mapping-Register.json"),
            "registerBase64": base64.b64encode(raw).decode("ascii"),
            "rows": {key: len(register[key]) for key in ("fields", "layers", "keys", "projects")},
            "review": register["review"]["latest"]}

def propose(workspace, source):
    need(isinstance(source, dict) and source.get("schema") == SOURCE, "MAPPING_WORKBOOK_SOURCE_REQUIRED")
    register_raw, workbook_raw = _raw(source.get("registerBase64"), "Mapping-Register.json"), _raw(source.get("workbookBase64"), "edited XLSX")
    need(len(register_raw) + len(workbook_raw) <= MAX_PAIR, "MAPPING_WORKBOOK_INPUT_PAIR_SIZE")
    register = files.parse_json(register_raw)
    fresh, original = _validate_register(workspace, register)
    plan = copy.deepcopy(original)
    workbook = Workbook(workbook_raw)
    try:
        need(workbook.cell("Overview", "C", 24) == hashlib.sha256(register_raw).hexdigest(),
             "MAPPING_WORKBOOK_REGISTER_HASH_CHANGED")
        changes, choices = _changes(workbook, register, plan)
    finally:
        workbook.close()
    # The original Mapping editor uses this same explicit lineage for an editable revision.
    if changes:
        plan["predecessorPlanId"] = register["plan_id"]
    capture = workspace.document("capture", register["capture_id"])
    plan, _, _ = plans.normalize(plan, capture)
    filename = source.get("filename", "Edited-Mapping-Register.xlsx")
    need(isinstance(filename, str) and 0 < len(filename) <= 240 and not any(c in filename for c in ("/", "\\", "\0", "\r", "\n")),
         "MAPPING_WORKBOOK_FILENAME")
    return {"schema": PROPOSAL, "workspaceId": fresh["workspace"]["id"],
            "workspaceRevision": fresh["workspace"]["revision"],
            "exportedWorkspaceRevision": register["workspace"]["revision"],
            "basePlanId": register["plan_id"], "captureId": register["capture_id"],
            "register": _descriptor(register_raw, "Mapping-Register.json"),
            "workbook": {**_descriptor(workbook_raw, "Edited-Mapping-Register.xlsx"), "originalFilename": filename},
            "plan": plan, "planBase64": base64.b64encode(files.json_bytes(plan)).decode("ascii"),
            "review": {"changedCells": len(changes), "changedChoices": choices, "changes": changes,
                       "originalReview": register["review"]["latest"],
                       "rows": {key: len(register[key]) for key in ("fields", "layers", "keys", "projects")}}}

def _difference(before, after, path=()):
    if files.canonical(before) == files.canonical(after):
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        result = []
        for key in sorted(set(before) | set(after)):
            if key not in before or key not in after:
                result.append({"path": list(path + (key,)), "beforePresent": key in before,
                    "afterPresent": key in after, "before": before.get(key), "after": after.get(key)})
            else:
                result.extend(_difference(before[key], after[key], path + (key,)))
        return result
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [item for i, (a, b) in enumerate(zip(before, after)) for item in _difference(a, b, path + (i,))]
    return [{"path": list(path), "beforePresent": True, "afterPresent": True, "before": before, "after": after}]

def retain(workspace, state, source, proposed, saved_plan, request_id):
    """Join the reviewed original workbook to the existing input collection and full archive."""
    need(state["id"] == proposed["workspaceId"] and saved_plan["captureId"] == proposed["captureId"],
         "MAPPING_WORKBOOK_SAVED_SOURCE_CHANGED")
    original = workspace._metadata("plans", proposed["basePlanId"], state=state)
    need(original["captureId"] == proposed["captureId"], "MAPPING_WORKBOOK_BASE_PLAN_CHANGED")
    original_file(files, workspace.root, original["file"])
    saved_id = files.digest(saved_plan)
    identifier = files.digest({"schema": INPUT, "register": proposed["register"]["sha256"],
        "workbook": proposed["workbook"]["sha256"], "savedPlanId": saved_id})
    previous = next((row for row in state["migration"]["inputs"] if row["id"] == identifier), None)
    if previous is not None:
        return {**copy.deepcopy(previous), "requestId": request_id, "existing": True}
    prefix = "migration/workbooks/" + identifier + "/"
    register_file = workspace._put(prefix + "Mapping-Register.json", _raw(source["registerBase64"], "original register"))
    workbook_file = workspace._put(prefix + "Edited-Mapping-Register.xlsx", _raw(source["workbookBase64"], "edited workbook"))
    proposal_file = workspace._put_json(prefix + "proposed-plan.json", proposed["plan"])
    saved_file = workspace._put_json(prefix + "saved-plan.json", saved_plan)
    review = {"schema": INPUT, "workspaceId": state["id"], "basePlanId": proposed["basePlanId"],
        "captureId": proposed["captureId"], "savedPlanId": saved_id,
        "exportedWorkspaceRevision": proposed["exportedWorkspaceRevision"],
        "originalFilename": proposed["workbook"]["originalFilename"],
        "workbookChanges": proposed["review"], "nativeEditorChanges": _difference(proposed["plan"], saved_plan),
        "register": register_file, "workbook": workbook_file, "proposedPlan": proposal_file, "savedPlan": saved_file}
    review_file = workspace._put_json(prefix + "workbook-review.json", review)
    row = {"id": identifier, "kind": "mapping-workbook", "planId": saved_id, "basePlanId": proposed["basePlanId"],
           "captureId": proposed["captureId"], "file": review_file,
           "files": [register_file, workbook_file, proposal_file, saved_file, review_file]}
    state["migration"]["inputs"].append(row)
    return {**copy.deepcopy(row), "requestId": request_id}
