"""MIT. Installed AMP destination semantics for the original IATI workspace.

All inputs are original UTF-8 JSON. This module has no transport, database,
credentials, approval state, or native write. The calling workspace retains the
original captures, request/response bytes, review and operation identity.
"""
from __future__ import annotations

from collections import Counter, defaultdict, deque
from copy import deepcopy
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import re
from urllib.parse import urlsplit

from iati_source import InputError
from .codec import loads, dumps, fingerprint, normal

SCHEMA = "stellar-forge.amp-destination-semantics.v1"
UPSTREAM = "devgateway/amp@e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e"
MAX_FIELDS = 20000
MAX_REPORT_ITEMS = 200000
MISSING = object()
TYPES = {"string", "long", "float", "boolean", "date", "timestamp", "list", "object"}
DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
TIMESTAMP = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}[+-][0-9]{4}\Z"
)
DECIMAL = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")
GROUPED_DECIMAL = re.compile(r"[+-]?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?\Z")
REFERENCE = "https://github.com/devgateway/amp/blob/e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e/amp/src/"
SOURCE_PATHS = {
    "metadata": "main/java/org/digijava/kernel/ampapi/endpoints/activity/field/APIField.java",
    "types": "main/java/org/digijava/kernel/ampapi/endpoints/activity/validators/InputTypeValidator.java",
    "values": "main/java/org/digijava/kernel/ampapi/endpoints/activity/validators/ValueValidator.java",
    "required": "main/java/org/digijava/kernel/validators/common/RequiredValidator.java",
    "conditional": "main/java/org/digijava/kernel/validators/activity/ConditionalRequiredValidator.java",
    "importer": "main/java/org/digijava/kernel/ampapi/endpoints/activity/ObjectImporter.java",
    "activity": "main/java/org/digijava/kernel/ampapi/endpoints/activity/ActivityImporter.java",
    "exporter": "main/java/org/digijava/kernel/ampapi/endpoints/activity/ObjectExporter.java",
    "possible_values": "main/java/org/digijava/kernel/ampapi/endpoints/activity/PossibleValuesEnumerator.java",
    "date": "main/java/org/digijava/kernel/ampapi/endpoints/common/EPConstants.java",
    "funding": "main/java/org/digijava/module/aim/dbentity/AmpFunding.java",
    "transactions": "main/java/org/digijava/module/aim/dbentity/AmpFundingDetail.java",
    "versions": "main/java/org/digijava/module/aim/util/ActivityVersionUtil.java",
}
SOURCES = {key: REFERENCE + path for key, path in SOURCE_PATHS.items()}


def _raw(raw, label):
    if not isinstance(raw, (str, bytes)):
        raise InputError(label + " must be the complete original UTF-8 JSON string or bytes")
    try:
        data = raw.encode("utf-8") if isinstance(raw, str) else raw
    except UnicodeError as error:
        raise InputError(label + " contains text that cannot be retained as UTF-8") from error
    value = loads(data)
    # Reject escaped unpaired surrogates before a report can lose its source identity.
    try:
        dumps(value).encode("utf-8")
    except UnicodeError as error:
        raise InputError(label + " contains an unpaired Unicode surrogate") from error
    return value, {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}


def _ptr(parent, key):
    return parent + "/" + str(key).replace("~", "~0").replace("/", "~1")


def _typename(value):
    if value is MISSING:
        return "absent"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, Decimal)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def _value(value):
    return {"present": value is not MISSING, "type": _typename(value),
            **({"value": normal(value)} if value is not MISSING else {})}


def _add(target, code, path, message, severity="error", source="metadata", **details):
    if len(target) >= MAX_REPORT_ITEMS:
        raise InputError("Complete destination report exceeds 200,000 items; select a smaller original scope")
    row = {"code": code, "path": path or "/", "severity": severity, "message": message,
           "source": SOURCES[source]}
    row.update(normal(details))
    target.append(row)


def _number(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, Decimal):
        return value if value.is_finite() else None
    if type(value) is int:
        return Decimal(value)
    if isinstance(value, str):
        text = value
        if GROUPED_DECIMAL.fullmatch(text):
            text = text.replace(",", "")
        if not DECIMAL.fullmatch(text):
            return None
        try:
            result = Decimal(text)
            return result if result.is_finite() else None
        except InvalidOperation:
            return None
    return None


def _time(value):
    if not isinstance(value, str) or not TIMESTAMP.fullmatch(value):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f%z").astimezone(timezone.utc)
    except ValueError:
        return None


def _equal(left, right):
    # Python bool equals int; native JSON Boolean and Long are different types.
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, Decimal)) and isinstance(right, (int, Decimal)):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, dict):
        return left.keys() == right.keys() and all(_equal(left[k], right[k]) for k in left)
    if isinstance(left, list):
        return len(left) == len(right) and all(_equal(a, b) for a, b in zip(left, right))
    return left == right


def _metadata(fields_json):
    raw, identity = _raw(fields_json, "Installed field metadata")
    if isinstance(raw, dict) and set(raw) == {"fields"}:
        raw = raw["fields"]
    if not isinstance(raw, list) or not raw:
        raise InputError("Retain the original nonempty /activity/fields array, not an API error or summary")
    by_path, roots = {}, []

    def visit(items, parent="", inherited=True, depth=0):
        if depth > 96 or not isinstance(items, list):
            raise InputError("Installed field children must be an original bounded array")
        result, siblings = [], set()
        for record in items:
            if not isinstance(record, dict) or not isinstance(record.get("field_name"), str):
                raise InputError("Every installed field must retain its native field_name")
            original_name = record["field_name"]
            name = original_name.split("~")[-1]
            path = parent + "~" + name if parent else name
            if (not name or name in siblings or path in by_path or
                    ("~" in original_name and original_name != path)):
                raise InputError("Duplicate or inconsistent installed field path: " + original_name)
            if len(by_path) >= MAX_FIELDS:
                raise InputError("Installed metadata exceeds 20,000 distinct fields")
            siblings.add(name)
            api_type = record.get("apiType", {})
            if not isinstance(api_type, dict):
                api_type = {}
            kind = record.get("field_type", api_type.get("field_type"))
            item_type = record.get("item-type", api_type.get("item-type"))
            if kind is not None and not isinstance(kind, str):
                raise InputError("Installed field_type must be text: " + path)
            if item_type is not None and not isinstance(item_type, str):
                raise InputError("Installed item-type must be text: " + path)
            if record.get("required") is not None and not isinstance(record["required"], str):
                raise InputError("Installed required status must be text: " + path)
            if record.get("common-possible-values") is not None and not isinstance(record["common-possible-values"], str):
                raise InputError("Installed common possible-value path must be text: " + path)
            if ("field_type" in record and "field_type" in api_type and
                    record["field_type"] != api_type["field_type"]):
                raise InputError("Conflicting installed field type: " + path)
            if ("item-type" in record and "item-type" in api_type and
                    record["item-type"] != api_type["item-type"]):
                raise InputError("Conflicting installed item type: " + path)
            field = {"name": name, "path": path, "kind": kind, "item_type": item_type,
                     "record": record,
                     "importable": inherited and record.get("importable") is True}
            by_path[path] = field
            field["children"] = visit(record.get("children", []), path, field["importable"], depth + 1)
            field["child_map"] = {f["name"]: f for f in field["children"]}
            result.append(field)
        return result

    roots = visit(raw)
    return roots, by_path, identity


def required_value_fields(fields_json):
    """Return complete native paths for the existing authenticated values capture.

    Public APIField does not expose its Java PossibleValuesProvider class. Query
    every importable scalar/primitive-list leaf, plus explicit ID/PV fields.
    The native provider returns an empty list for a known non-enumerated leaf.
    Keep those explicit empty responses distinct from fields never captured.
    """
    _, index, _ = _metadata(fields_json)
    selected = []
    for path, field in index.items():
        meta = field["record"]
        primitive = field["kind"] in TYPES - {"list", "object"}
        primitive_list = field["kind"] == "list" and field["item_type"] in TYPES - {"list", "object"}
        declared = meta.get("id_only") is True or bool(meta.get("common-possible-values"))
        if declared or field["importable"] and meta.get("id") is not True and (primitive or primitive_list):
            selected.append(path)
    return sorted(selected)


def _api_diagnostics(value, findings, path):
    if not isinstance(value, dict):
        return
    for key in ("error", "errors"):
        if value.get(key):
            _add(findings, "NATIVE_API_ERROR", _ptr(path, key),
                 "The retained native response contains an API error.", actual=_value(value[key]),
                 source="activity")
    if value.get("warnings"):
        _add(findings, "NATIVE_API_WARNING", _ptr(path, "warnings"),
             "Keep the native warning and its affected field alongside the source response.",
             "warning", "importer", actual=_value(value["warnings"]))


class _Context:
    def __init__(self, capture):
        if not isinstance(capture, dict):
            raise InputError("Select the original native capture object")
        self.capture = capture
        self.roots, self.fields, fields_id = _metadata(capture.get("fieldsJson"))
        self.root_map = {f["name"]: f for f in self.roots}
        self.findings = []
        self.identities = {"fieldsJson": fields_id}
        self.values, self.identities["valuesJson"] = _raw(capture.get("valuesJson"), "Installed possible values")
        self.projects, self.identities["projectsJson"] = _raw(capture.get("projectsJson"), "Selected native projects")
        self.session, self.identities["sessionJson"] = _raw(capture.get("sessionJson", "{}"), "Native session")
        self.layout, self.identities["layoutJson"] = _raw(capture.get("layoutJson", "{}"), "Installed layout")
        if not isinstance(self.values, dict) or not isinstance(self.projects, list):
            raise InputError("Retain the original field-values object and full-project array")
        if not isinstance(self.session, dict) or not isinstance(self.layout, dict):
            raise InputError("Retain complete native session and layout objects")
        for key, value in (("valuesJson", self.values), ("sessionJson", self.session), ("layoutJson", self.layout)):
            _api_diagnostics(value, self.findings, "/" + key)
        self.connection = capture.get("connection", {})
        if not isinstance(self.connection, dict):
            raise InputError("Select the original installed connection")
        self.project_index = {}
        for position, project in enumerate(self.projects):
            if not isinstance(project, dict):
                _add(self.findings, "FULL_PROJECT_REQUIRED", "/projectsJson/" + str(position),
                     "A selected source is not a full native project object.")
                continue
            _api_diagnostics(project, self.findings, "/projectsJson/" + str(position))
            ident = project.get("internal_id")
            if type(ident) is not int or ident <= 0 or ident in self.project_index:
                _add(self.findings, "PROJECT_IDENTITY", "/projectsJson/" + str(position),
                     "Selected full project IDs must be positive and unique.", actual=_value(ident))
            else:
                self.project_index[ident] = project
        self.pv, self.value_records = {}, {}
        for path, values in self.values.items():
            if path in {"error", "errors", "warnings"}:
                continue
            if path not in self.fields:
                _add(self.findings, "VALUES_OUTSIDE_FIELDS", "/valuesJson/" + path,
                     "Retained possible values belong to a path absent from this field capture.", "warning")
                continue
            if not isinstance(values, list):
                _add(self.findings, "VALUE_RESPONSE_TYPE", "/valuesJson/" + path,
                     "The native field-values response must be an array.", actual=_value(values))
                continue
            indexed, originals = {}, []

            def visit(rows, trail, depth=0):
                if depth > 96:
                    raise InputError("Possible-value tree exceeds 96 levels")
                for offset, row in enumerate(rows):
                    pointer = _ptr(trail, offset)
                    if not isinstance(row, dict) or "id" not in row:
                        _add(self.findings, "POSSIBLE_VALUE_RECORD", pointer,
                             "Retain each original PossibleValue object with its native id.")
                        continue
                    originals.append({"path": pointer, "record": row})
                    ident = row.get("id")
                    if ident is not None:
                        if type(ident) is not int or not -(2**63) <= ident < 2**63:
                            _add(self.findings, "POSSIBLE_VALUE_ID", pointer,
                                 "Selectable native IDs are JSON signed-long integers.", actual=_value(ident))
                        elif ident in indexed:
                            before = {k: v for k, v in indexed[ident].items() if k != "children"}
                            after = {k: v for k, v in row.items() if k != "children"}
                            if not _equal(before, after):
                                _add(self.findings, "POSSIBLE_VALUE_CONFLICT", pointer,
                                     "The same native ID has conflicting retained value metadata.",
                                     expected=_value(before), actual=_value(after))
                        else:
                            indexed[ident] = row
                    children = row.get("children", [])
                    if not isinstance(children, list):
                        _add(self.findings, "POSSIBLE_VALUE_CHILDREN", pointer,
                             "Original possible-value children must be an array.")
                    else:
                        visit(children, pointer + "/children", depth + 1)

            visit(values, "/valuesJson/" + path)
            self.pv[path] = indexed
            self.value_records[path] = originals
        self.required_values = required_value_fields(capture["fieldsJson"])
        self.missing_values = [p for p in self.required_values if p not in self.pv]
        for path in self.missing_values:
            _add(self.findings, "POSSIBLE_VALUES_NOT_CAPTURED", "/fields/" + path,
                 "This installed field has no complete retained values response; an absent response is not an empty set.",
                 source="possible_values")
        self._configuration()

    def _configuration(self):
        selected = self.connection
        base = selected.get("baseUrl")
        try:
            parsed = urlsplit(base) if isinstance(base, str) else None
            valid = bool(parsed and parsed.scheme in {"https", "http"} and parsed.hostname
                         and not parsed.username and not parsed.password
                         and not parsed.query and not parsed.fragment and parsed.path.rstrip("/").endswith("/rest"))
        except ValueError:
            valid = False
        if not valid:
            _add(self.findings, "REST_SELECTION", "/connection/baseUrl",
                 "Use the selected original AMP REST base URL ending in /rest, without embedded credentials.")
        workspace = selected.get("workspaceId")
        if type(workspace) is not int or workspace <= 0:
            _add(self.findings, "WORKSPACE_SELECTION", "/connection/workspaceId",
                 "Select the actual native workspace integer ID.")
        version = selected.get("installedVersion")
        if not isinstance(version, str) or not version.strip():
            _add(self.findings, "VERSION_SELECTION", "/connection/installedVersion",
                 "Retain the actual selected installed version.")
        for name, expected in (("workspaceId", workspace), ("ampVersion", version)):
            if name not in self.layout:
                _add(self.findings, "LAYOUT_NOT_CAPTURED", "/layoutJson/" + name,
                     "The original layout did not establish this installed identity.", "warning")
            elif not _equal(self.layout[name], expected):
                _add(self.findings, "INSTALLED_IDENTITY_CHANGED", "/layoutJson/" + name,
                     "The native layout differs from the selected installation.",
                     expected=_value(expected), actual=_value(self.layout[name]))
        actual_user = self.session.get("user-id")
        if actual_user is None:
            _add(self.findings, "SESSION_NOT_CAPTURED", "/sessionJson/user-id",
                 "No actual authenticated user identity was retained; this is an inspectable source capture.",
                 "warning")
        elif type(actual_user) is not int or actual_user <= 0:
            _add(self.findings, "SESSION_IDENTITY", "/sessionJson/user-id",
                 "The native user identity is not a positive integer.")
        expected_user = selected.get("expectedUserId")
        if expected_user is not None and not _equal(actual_user, expected_user):
            _add(self.findings, "SELECTED_USER_CHANGED", "/sessionJson/user-id",
                 "The captured native user differs from the selected account.",
                 expected=_value(expected_user), actual=_value(actual_user))
        coverage = self.capture.get("coverage", {})
        if not isinstance(coverage, dict):
            _add(self.findings, "COVERAGE_REQUIRED", "/coverage", "Retain the exact original project selection.")
            return
        if coverage.get("kind") not in {"explicit-projects", "native-export"}:
            _add(self.findings, "PROJECT_COVERAGE_KIND", "/coverage/kind",
                 "Use the original explicit full-project selection or native export.")
        ids = coverage.get("projectIds")
        if (not isinstance(ids, list) or any(type(v) is not int or v <= 0 for v in ids)
                or len(ids) != len(set(ids)) or set(ids) != set(self.project_index)):
            _add(self.findings, "PROJECT_COVERAGE_DIFFERS", "/coverage/projectIds",
                 "The declared IDs and complete original project records differ.",
                 expected=_value(ids), actual=_value(sorted(self.project_index)))
        if not isinstance(coverage.get("note"), str) or not coverage["note"].strip():
            _add(self.findings, "COVERAGE_DESCRIPTION", "/coverage/note",
                 "Describe the selected country/programme/project scope without inferring complete country coverage.")
        for path, field in self.fields.items():
            meta = field["record"]
            if field["kind"] not in TYPES:
                _add(self.findings, "UNSUPPORTED_FIELD_TYPE", "/fields/" + path,
                     "This installed field type is not established by the pinned APIType contract.",
                     actual=_value(field["kind"]))
            if field["kind"] == "list" and field["item_type"] not in TYPES - {"list"}:
                _add(self.findings, "UNSUPPORTED_ITEM_TYPE", "/fields/" + path,
                     "Retain a supported native list item type.", actual=_value(field["item_type"]))
            if meta.get("required") not in {None, "Y", "ND", "N"}:
                _add(self.findings, "UNSUPPORTED_REQUIRED_STATUS", "/fields/" + path,
                     "Required metadata must retain Y, ND or N.", actual=_value(meta.get("required")))
            if "importable" in meta and type(meta["importable"]) is not bool:
                _add(self.findings, "IMPORTABLE_TYPE", "/fields/" + path,
                     "Importable metadata must remain a native Boolean.")
            if not isinstance(meta.get("dependencies", []), list):
                _add(self.findings, "DEPENDENCY_TYPE", "/fields/" + path,
                     "Retain the original dependency-name array.")
            for key in ("field_length", "size-limit"):
                if key in meta and meta[key] is not None and (type(meta[key]) is not int or meta[key] < 0):
                    _add(self.findings, "FIELD_LIMIT_TYPE", "/fields/" + path + "/" + key,
                         "Retain the native nonnegative integer limit.")

    def value_set(self, field):
        path = field["path"]
        # Native response keys use requested field paths. The common-provider
        # alias is retained as metadata and is never substituted for an absent response.
        return self.pv.get(path)


def _report(context, findings, **rest):
    errors = sum(row["severity"] == "error" for row in findings)
    return {"schema": SCHEMA, "upstream": UPSTREAM, "sourceIdentities": context.identities,
            "connection": deepcopy(context.connection),
            "ready": errors == 0, "errorCount": errors,
            "warningCount": sum(row["severity"] == "warning" for row in findings),
            "findings": findings, **rest}


def analyse_capture(capture):
    context = _Context(capture)
    fields = []
    for path, field in context.fields.items():
        meta = field["record"]
        fields.append({"path": path, "fieldType": field["kind"], "itemType": field["item_type"],
                       "importable": field["importable"], "id": meta.get("id") is True,
                       "idOnly": meta.get("id_only") is True, "required": meta.get("required"),
                       "dependencies": deepcopy(meta.get("dependencies", [])),
                       "commonPossibleValues": meta.get("common-possible-values"),
                       "valuesCaptured": path in context.pv,
                       "selectableValueCount": len(context.pv.get(path, {})),
                       "originalMetadata": normal(meta)})
    original_ids = sorted(context.project_index)
    return _report(context, context.findings,
                   fields=fields, fieldCount=len(fields), projectCount=len(original_ids),
                   projectIds=original_ids, coverage=deepcopy(capture.get("coverage")),
                   requiredValueFields=context.required_values, missingValueFields=context.missing_values,
                   nativeUserEstablished=type(context.session.get("user-id")) is int,
                   completeCountryCoverageClaimed=False,
                   boundary="Selected native configuration and full-project coverage; no permission or approval is inferred.")


def _required_empty(value, field):
    if value is MISSING or value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, list):
        return not value
    if field["record"].get("translatable") is True and isinstance(value, dict):
        return not any(isinstance(v, str) and v.strip() for v in value.values())
    return False


def _check_type(value, field, findings, pointer, kind=None):
    kind = kind or field["kind"]
    if value is None:
        return True
    valid = True
    if kind == "string":
        if field["record"].get("translatable") is True:
            valid = isinstance(value, dict) and all(
                isinstance(k, str) and (v is None or isinstance(v, str)) for k, v in value.items())
        else:
            valid = isinstance(value, str)
    elif kind == "long":
        valid = type(value) is int and -(2**63) <= value < 2**63
    elif kind == "float":
        valid = _number(value) is not None
    elif kind == "boolean":
        valid = type(value) is bool
    elif kind == "date":
        valid = isinstance(value, str) and DATE.fullmatch(value) is not None
        if valid:
            try:
                date.fromisoformat(value)
            except ValueError:
                valid = False
    elif kind == "timestamp":
        valid = _time(value) is not None
    elif kind == "object":
        valid = isinstance(value, dict)
    elif kind == "list":
        # InputTypeValidator's generic Map branch is inconsistent with
        # ObjectImporter.deserializeList's actual collection cast. Do not prepare
        # a Map as a supposedly accepted list.
        valid = isinstance(value, list)
    else:
        valid = False
    if not valid:
        _add(findings, "FIELD_TYPE", pointer,
             "The supplied value does not match the installed " + str(kind) + " contract.",
             source="types", field=field["path"], actual=_value(value))
    return valid


def _check_leaf(value, field, findings, pointer):
    meta = field["record"]
    maximum = meta.get("field_length")
    texts = value.values() if meta.get("translatable") is True and isinstance(value, dict) else [value]
    if type(maximum) is int and maximum >= 0:
        for text in texts:
            if isinstance(text, str) and len(text.encode("utf-16-le")) // 2 > maximum:
                _add(findings, "FIELD_LENGTH", pointer,
                     "The supplied string exceeds the native UTF-16 code-unit limit.",
                     source="values", field=field["path"], maximum=maximum, actual=_value(text))
    if meta.get("percentage") is True and value is not None:
        amount = _number(value)
        if amount is not None and (amount < Decimal("0.0001") or amount > Decimal("100.0001")):
            _add(findings, "PERCENTAGE_RANGE", pointer,
                 "The original validator requires a percentage in [0.0001, 100.0001].",
                 source="values", actual=_value(value))
    if meta.get("translatable") is True and value is not None:
        _add(findings, "NATIVE_LANGUAGE_CONFIGURATION", pointer,
             "The native configured locale/default-language validator must review these original language keys.",
             "warning", "types", languages=sorted(value) if isinstance(value, dict) else [])
    if meta.get("regex-pattern") or meta.get("regex-constraint"):
        _add(findings, "NATIVE_REGEX_CONSTRAINT", pointer,
             "The installed Java pattern is retained for native validation; it is not executed as a Python expression.",
             "warning", "metadata",
             pattern=meta.get("regex-pattern"), constraint=meta.get("regex-constraint"))


def _validate_tree(obj, siblings, context, findings, pointer="", draft=False, baseline=None):
    by_name = {f["name"]: f for f in siblings}
    for name in obj:
        if name not in by_name:
            _add(findings, "UNKNOWN_FIELD", _ptr(pointer, name),
                 "The installed importer reports unknown fields and may omit them; the original value remains retained.",
                 "warning", "importer", actual=_value(obj[name]))
    for field in siblings:
        name, meta = field["name"], field["record"]
        value, path = obj.get(name, MISSING), _ptr(pointer, name)
        original = baseline.get(name, MISSING) if isinstance(baseline, dict) else MISSING
        if not field["importable"]:
            if value is not MISSING and original is not MISSING and not _equal(value, original):
                _add(findings, "READ_ONLY_REQUEST_CHANGE", path,
                     "This installed field is not imported; retain the proposed difference and inspect the original native return.",
                     "warning", "importer", expected=_value(original), actual=_value(value))
            continue
        dependencies = meta.get("dependencies", [])
        needed = meta.get("required") == "Y" or meta.get("required") == "ND" and not draft
        if needed and _required_empty(value, field):
            if dependencies:
                _add(findings, "NATIVE_CONDITIONAL_REQUIRED", path,
                     "Requiredness depends on installed Java business predicates not serialized in field metadata.",
                     "warning", "conditional", dependencies=dependencies, required=meta["required"])
            else:
                _add(findings, "FIELD_REQUIRED", path,
                     "The original installed field is required for this save mode.",
                     source="required", required=meta["required"], draft=draft)
        if value is MISSING or value is None:
            continue
        if not _check_type(value, field, findings, path):
            continue
        kind = field["kind"]
        if kind == "object":
            _validate_tree(value, field["children"], context, findings, path, draft, original)
        elif kind == "list":
            item_type = field["item_type"]
            id_children = [c for c in field["children"] if c["record"].get("id") is True]
            seen_ids = {}
            for position, item in enumerate(value):
                item_path = _ptr(path, position)
                if item is None:
                    _add(findings, "NULL_LIST_MEMBER", item_path,
                         "The native list importer dereferences each member; retain an object or primitive value.",
                         source="importer")
                    continue
                if not _check_type(item, field, findings, item_path, item_type):
                    continue
                if item_type == "object":
                    for id_field in id_children:
                        identifier = item.get(id_field["name"])
                        if identifier is not None:
                            key = (id_field["name"], fingerprint(identifier))
                            if key in seen_ids:
                                _add(findings, "DUPLICATE_CHILD_ID", item_path,
                                     "The supplied collection repeats a native child identity.",
                                     source="importer", firstPath=seen_ids[key], actual=_value(identifier))
                            seen_ids[key] = item_path
                    prior = None
                    if isinstance(original, list) and len(id_children) == 1:
                        key = id_children[0]["name"]
                        selected = item.get(key)
                        matches = [v for v in original if isinstance(v, dict) and selected is not None
                                   and _equal(v.get(key), selected)]
                        prior = matches[0] if len(matches) == 1 else None
                    _validate_tree(item, field["children"], context, findings, item_path, draft, prior)
                else:
                    _check_leaf(item, field, findings, item_path)
                    _validate_value(item, field, context, findings, item_path)
            if meta.get("unique_constraint") or meta.get("percentage_constraint") or meta.get("tree_collection"):
                _add(findings, "NATIVE_COLLECTION_CONSTRAINT", path,
                     "Retain and apply the original installed uniqueness/percentage/tree business validator.",
                     "warning", "metadata", unique=meta.get("unique_constraint"),
                     percentage=meta.get("percentage_constraint"), tree=meta.get("tree_collection"))
        else:
            _check_leaf(value, field, findings, path)
            _validate_value(value, field, context, findings, path)


def _validate_value(value, field, context, findings, pointer):
    values = context.value_set(field)
    declared = field["record"].get("id_only") is True or bool(field["record"].get("common-possible-values"))
    if values is None:
        return  # Its missing original response is already a capture error.
    if declared or values:
        if type(value) is not int or value not in values:
            _add(findings, "NATIVE_VALUE_NOT_ALLOWED", pointer,
                 "Select a native ID present in this exact installed field-values response.",
                 source="values", field=field["path"], actual=_value(value),
                 retainedSelectableCount=len(values))


def _project_findings(project, context):
    findings = deepcopy(context.findings)
    _api_diagnostics(project, findings, "")
    native_id = project.get("internal_id")
    baseline = context.project_index.get(native_id) if type(native_id) is int else None
    mode = "update" if native_id is not None else "create"
    if native_id is not None:
        if type(native_id) is not int or native_id <= 0 or baseline is None:
            _add(findings, "UPDATE_SOURCE_IDENTITY", "/internal_id",
                 "An update must select a full original project in this capture.",
                 source="activity", actual=_value(native_id))
        else:
            for key in ("amp_id",):
                if not _equal(project.get(key, MISSING), baseline.get(key, MISSING)):
                    _add(findings, "UPDATE_BUSINESS_IDENTITY", "/" + key,
                         "The original importer requires the existing AMP business identifier.",
                         source="activity", expected=_value(baseline.get(key, MISSING)),
                         actual=_value(project.get(key, MISSING)))
            before_group, proposed_group = baseline.get("activity_group"), project.get("activity_group")
            before_version = before_group.get("version", MISSING) if isinstance(before_group, dict) else MISSING
            proposed_version = proposed_group.get("version", MISSING) if isinstance(proposed_group, dict) else MISSING
            if before_version is MISSING or not _equal(before_version, proposed_version):
                _add(findings, "UPDATE_VERSION_PREIMAGE", "/activity_group/version",
                     "The prepared update must retain the selected original version for native concurrency validation.",
                     source="activity", expected=_value(before_version), actual=_value(proposed_version))
    elif project.get("amp_id") is not None:
        _add(findings, "CREATE_BUSINESS_IDENTITY", "/amp_id",
             "The original importer requires amp_id to be absent or null on create.", source="activity")
    _validate_tree(project, context.roots, context, findings, draft=project.get("is_draft") is True,
                   baseline=baseline)
    return findings, native_id, mode


def validate_project(project_json, capture):
    context = _Context(capture)
    project, identity = _raw(project_json, "Complete intended native project")
    if not isinstance(project, dict):
        raise InputError("Prepare a complete native project object")
    findings, native_id, mode = _project_findings(project, context)
    return _report(context, findings, projectIdentity=identity, mode=mode,
                   nativeProjectId=native_id, nativeValidationRequired=True,
                   boundary="Complete local destination findings; native permissions, configured predicates and actual write responses remain authoritative.")


def _generated(field, value=MISSING, other=MISSING):
    if field is None:
        return False
    if field["path"] == "amp_id":
        return other is MISSING or other is None
    if field["path"] == "activity_group~version":
        return True
    if field["path"] == "fundings~group_versioned_funding":
        return other is MISSING or other is None
    return field["record"].get("id") is True or field["record"].get("importable") is False


def _signature(value, field=None):
    """Pair collections by all supplied semantics, never by amount or title alone."""
    if isinstance(value, dict):
        fields = field["child_map"] if field else {}
        result = {}
        for key, item in value.items():
            child = fields.get(key)
            if child and (_generated(child, item, MISSING) or child["path"] == "fundings~group_versioned_funding"):
                continue
            if item is None or item == [] or item == {}:
                continue
            result[key] = _signature(item, child)
        return result
    if isinstance(value, list):
        if field and field["kind"] == "list":
            item_field = {**field, "kind": field["item_type"]}
            return sorted((_signature(v, item_field) for v in value), key=fingerprint)
        return [_signature(v) for v in value]
    if field and field["kind"] == "float" and _number(value) is not None:
        return _number(value)
    if field and field["kind"] == "timestamp" and _time(value) is not None:
        return _time(value).isoformat()
    return value


class _Comparison:
    def __init__(self, context):
        self.context = context
        self.differences, self.generated, self.pairings = [], [], []
        self.identity_ambiguous = False

    def difference(self, code, path, expected, actual, message, severity="error", **detail):
        _add(self.differences, code, path, message, severity, "exporter",
             expected=_value(expected), actual=_value(actual), **detail)

    def generated_field(self, code, path, expected, actual, message):
        _add(self.generated, code, path, message, "info", "exporter",
             expected=_value(expected), actual=_value(actual))

    def scalar(self, expected, actual, field, path):
        if _equal(expected, actual):
            return
        if field and field["kind"] == "float":
            left, right = _number(expected), _number(actual)
            if left is not None and right is not None and left == right:
                self.generated_field("EXACT_NUMERIC_REPRESENTATION", path, expected, actual,
                                     "The exact numeric value is unchanged; original representation differs.")
                return
        if field and field["kind"] == "timestamp":
            left, right = _time(expected), _time(actual)
            if left is not None and right is not None and left == right:
                self.generated_field("EQUIVALENT_TIMESTAMP_REPRESENTATION", path, expected, actual,
                                     "The same instant was returned in the native timestamp representation.")
                return
        self.difference("VALUE_CHANGED", path, expected, actual, "The complete intended native field differs.")

    def node(self, expected, actual, field, path):
        # Traverse complete objects and collections even when their values match:
        # receiving still needs native-ID validation and original ordinal pairings.
        if field and field["path"] == "amp_id" and expected not in (MISSING, None):
            if not _equal(expected, actual):
                self.difference("AMP_ID_CHANGED", path, expected, actual,
                                "A returned update identifies another AMP business project.")
            return
        if field and field["path"] == "activity_group~version":
            if actual is MISSING or type(actual) is not int or actual < 0:
                self.difference("VERSION_NOT_RETURNED", path, expected, actual,
                                "The full native result lacks a valid actual version.")
            elif type(expected) is int and actual < expected:
                self.difference("VERSION_REGRESSED", path, expected, actual,
                                "The returned native version precedes the selected request version.")
            else:
                self.generated_field("NATIVE_VERSION", path, expected, actual,
                                     "The actual native version is retained, not substituted for the selected request version.")
            return
        # The original create operation initializes this version container on
        # save. Descend into its actual fields even when the parent is exported
        # as read-only; an entire object must not mask a bad or missing version.
        if (field and field["path"] == "activity_group" and isinstance(actual, dict)
                and (expected is MISSING or expected is None or isinstance(expected, dict))):
            before = expected if isinstance(expected, dict) else {}
            for key in sorted(set(before) | set(actual)):
                self.node(before.get(key, MISSING), actual.get(key, MISSING),
                          field["child_map"].get(key), _ptr(path, key))
            return
        if _generated(field, actual, expected):
            if field and field["record"].get("id") is True and (
                    actual is MISSING or actual is None or
                    field["kind"] == "long" and (type(actual) is not int or actual <= 0)):
                self.difference("NATIVE_CHILD_ID_NOT_RETURNED", path, expected, actual,
                                "The full persisted native record lacks its generated child identity.")
            elif actual is MISSING:
                self.difference("GENERATED_FIELD_NOT_RETURNED", path, expected, actual,
                                "The full native export omitted a supplied or expected identity/read-only field.")
            else:
                self.generated_field("NATIVE_GENERATED_FIELD", path, expected, actual,
                                     "The installed metadata or pinned versioning source identifies this as native-generated/read-only.")
            return
        if field and field["kind"] == "list" and expected is None and actual == []:
            self.generated_field("NULL_TO_EMPTY_COLLECTION", path, expected, actual,
                                 "The native importer clears a supplied null collection and the complete exporter emits an empty array.")
            return
        if expected is MISSING:
            empty_export = field is not None and (actual is None or
                           field["kind"] == "list" and actual == [])
            if empty_export:
                self.generated_field("NATIVE_EMPTY_EXPORT_FIELD", path, expected, actual,
                                     "The complete exporter emitted an empty optional field absent from the request.")
            else:
                self.difference("FIELD_ADDED", path, expected, actual,
                                "The full native result contains an additional nonempty or unconfigured field.")
            return
        if actual is MISSING:
            self.difference("FIELD_MISSING", path, expected, actual,
                            "A supplied original field is absent from the complete native result.")
            return
        if isinstance(expected, dict) and isinstance(actual, dict):
            by_name = field["child_map"] if field else self.context.root_map if path == "" else {}
            for key in sorted(set(expected) | set(actual)):
                self.node(expected.get(key, MISSING), actual.get(key, MISSING),
                          by_name.get(key), _ptr(path, key))
        elif isinstance(expected, list) and isinstance(actual, list):
            if field and field["kind"] == "list":
                self.collection(expected, actual, field, path)
            elif len(expected) != len(actual):
                self.difference("UNCONFIGURED_ARRAY_CHANGED", path, expected, actual,
                                "An unconfigured array changed; no native collection semantics are inferred.")
            else:
                for position, (left, right) in enumerate(zip(expected, actual)):
                    self.node(left, right, None, _ptr(path, position))
        else:
            self.scalar(expected, actual, field, path)

    def collection(self, expected, actual, field, path):
        item_type = field["item_type"]
        if item_type != "object":
            left = Counter(fingerprint(_signature(v, {**field, "kind": item_type})) for v in expected)
            right = Counter(fingerprint(_signature(v, {**field, "kind": item_type})) for v in actual)
            if left != right:
                self.difference("COLLECTION_VALUES_CHANGED", path, expected, actual,
                                "The original primitive collection changed, including duplicate multiplicities.")
            elif not _equal(expected, actual):
                self.generated_field("COLLECTION_ORDER_OR_REPRESENTATION", path, expected, actual,
                                     "The same complete multiset was exported in a different order or representation.")
            return
        if any(not isinstance(v, dict) for v in expected + actual):
            self.difference("OBJECT_COLLECTION_SHAPE", path, expected, actual,
                            "Retain complete objects in both sides of this configured collection.")
            return
        pending_left, pending_right = set(range(len(expected))), set(range(len(actual)))
        matches = []
        id_children = [f for f in field["children"] if f["record"].get("id") is True]
        identity_fields = [f["name"] for f in id_children]
        for id_child in id_children:
            seen = {}
            for j, row in enumerate(actual):
                native_id = row.get(id_child["name"], MISSING)
                if (native_id is MISSING or native_id is None or
                        id_child["kind"] == "long" and (type(native_id) is not int or native_id <= 0)):
                    self.difference("NATIVE_CHILD_ID_NOT_RETURNED",
                                    path + "/@received/" + str(j) + "/" + id_child["name"],
                                    MISSING, native_id, "The received full collection lacks a persisted native child ID.")
                else:
                    key = fingerprint(native_id)
                    if key in seen:
                        self.difference("DUPLICATE_RECEIVED_CHILD_ID",
                                        path + "/@received/" + str(j) + "/" + id_child["name"],
                                        MISSING, native_id, "The full received collection repeats a native child identity.",
                                        firstReceivedIndex=seen[key])
                    seen[key] = j
        if field["path"] == "fundings" and "group_versioned_funding" in field["child_map"]:
            identity_fields.insert(0, "group_versioned_funding")
        for key in identity_fields:
            left_index, right_index = defaultdict(list), defaultdict(list)
            for i in pending_left:
                if expected[i].get(key) is not None:
                    left_index[fingerprint(expected[i][key])].append(i)
            for i in pending_right:
                if actual[i].get(key) is not None:
                    right_index[fingerprint(actual[i][key])].append(i)
            for identity in sorted(set(left_index) & set(right_index)):
                left, right = left_index[identity], right_index[identity]
                if len(left) == len(right) == 1:
                    i, j = left[0], right[0]
                    matches.append((i, j, "retained-native-identity:" + key, False))
                    pending_left.remove(i)
                    pending_right.remove(j)
        item_field = {**field, "kind": "object"}
        left_signatures, right_signatures = defaultdict(list), defaultdict(list)
        for i in pending_left:
            left_signatures[fingerprint(_signature(expected[i], item_field))].append(i)
        for j in pending_right:
            right_signatures[fingerprint(_signature(actual[j], item_field))].append(j)
        for signature in sorted(set(left_signatures) & set(right_signatures)):
            left, right = sorted(left_signatures[signature]), sorted(right_signatures[signature])
            ambiguous = len(left) > 1 or len(right) > 1
            for i, j in zip(left, right):
                matches.append((i, j, "complete-semantic-multiset", ambiguous))
                pending_left.remove(i)
                pending_right.remove(j)
        for i, j, basis, ambiguous in sorted(matches):
            if len(self.pairings) >= MAX_REPORT_ITEMS:
                raise InputError("Complete destination pairing report exceeds 200,000 records")
            self.pairings.append({"path": path, "requestIndex": i, "receivedIndex": j,
                                  "basis": basis, "uniqueNativeLineage": not ambiguous and basis.startswith("retained-"),
                                  "equivalentMultiplicity": ambiguous})
            self.identity_ambiguous |= ambiguous
            self.node(expected[i], actual[j], item_field, _ptr(path, i))
        for i in sorted(pending_left):
            self.difference("RECORD_NOT_RECONCILED", _ptr(path, i), expected[i], MISSING,
                            "No unique retained ID or complete semantic counterpart reconciles this original record.")
        for j in sorted(pending_right):
            self.difference("RECEIVED_RECORD_NOT_RECONCILED", path + "/@received/" + str(j),
                            MISSING, actual[j],
                            "This complete received record has no retained-ID or complete-semantic counterpart.")
        if not pending_left and not pending_right and any(i != j for i, j, _, _ in matches):
            self.generated_field("COLLECTION_ORDER", path, expected, actual,
                                 "The native collection order differs; original ordinals and exact pairings remain retained.")


def compare_project(request_json, received_json, capture):
    context = _Context(capture)
    request, request_identity = _raw(request_json, "Complete original prepared project")
    received, received_identity = _raw(received_json, "Complete original received project")
    if not isinstance(request, dict) or not isinstance(received, dict):
        raise InputError("Compare complete native project objects, not API summaries or a selected money subset")
    result = _Comparison(context)
    request_findings, _, _ = _project_findings(request, context)
    native_findings = []
    _api_diagnostics(received, native_findings, "")
    for row in native_findings:
        result.differences.append(row)
    if type(received.get("internal_id")) is not int or received["internal_id"] <= 0:
        result.difference("FULL_PROJECT_RESULT_REQUIRED", "/internal_id",
                          request.get("internal_id", MISSING), received.get("internal_id", MISSING),
                          "Receive the full original /activity/projects/{internal_id} record after the native write.")
    actual_group = received.get("activity_group")
    actual_version = actual_group.get("version", MISSING) if isinstance(actual_group, dict) else MISSING
    expected_group = request.get("activity_group")
    expected_version = expected_group.get("version", MISSING) if isinstance(expected_group, dict) else MISSING
    if type(actual_version) is not int or actual_version < 0:
        result.difference("FULL_PROJECT_VERSION_REQUIRED", "/activity_group/version",
                          expected_version, actual_version,
                          "The full persisted native project must retain its nonnegative version.")
    elif type(expected_version) is int and actual_version < expected_version:
        result.difference("FULL_PROJECT_VERSION_REGRESSED", "/activity_group/version",
                          expected_version, actual_version,
                          "The full persisted native project precedes the selected original version.")
    if request.get("internal_id") is not None and not _equal(request.get("amp_id"), received.get("amp_id")):
        result.difference("UPDATE_PROJECT_BINDING", "/amp_id",
                          request.get("amp_id", MISSING), received.get("amp_id", MISSING),
                          "The original business identifier must bind the returned update.")
    result.node(request, received, None, "")
    errors = any(row["severity"] == "error" for row in result.differences)
    request_errors = any(row["severity"] == "error" for row in request_findings)
    return {"schema": SCHEMA, "upstream": UPSTREAM, "matched": not errors and not request_errors,
            "requestIdentity": request_identity, "receivedIdentity": received_identity,
            "sourceIdentities": context.identities, "differences": result.differences,
            "generatedFields": result.generated, "pairings": result.pairings,
            "configurationFindings": context.findings, "requestFindings": request_findings,
            "equivalentRecordLineageAmbiguous": result.identity_ambiguous,
            "requestJson": request_json.decode("utf-8") if isinstance(request_json, bytes) else request_json,
            "receivedJson": received_json.decode("utf-8") if isinstance(received_json, bytes) else received_json,
            "boundary": "Full original fields and collection multiplicities are compared; no financial family, currency or period is aggregated."}
