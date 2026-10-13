"""Dataverse solution contracts. No tenant access or workspace is created here.

Inputs retain original HTTP bodies and the actual target CSDL. Native metadata
and target profile determine supported fields, navigation and action parameters.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import re
import uuid
import xml.etree.ElementTree as ET
from decimal import Decimal
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit, unquote

CONTRACT_SCHEMA = "tjlabs.pmrs.dataverse-contract/v1"
SPEC_SCHEMA = "tjlabs.pmrs.dataverse-solution-spec/v1"
SNAPSHOT_SCHEMA = "tjlabs.pmrs.dataverse-target-snapshot/v1"
PLAN_SCHEMA = "tjlabs.pmrs.dataverse-solution-plan/v1"
EXCHANGE_SCHEMA = "tjlabs.pmrs.dataverse-http-exchange/v1"
MAX_JSON = 64 * 1024 * 1024
MAX_XML = 64 * 1024 * 1024
MAX_COMPONENTS = 2000
MAX_DIGITS = 1000
HASH = re.compile(r"^[0-9a-f]{64}$")
LOGICAL = re.compile(r"^[a-z][a-z0-9_]{0,127}$")
SCHEMA_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,127}$")
UNIQUE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,99}$")
KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$")
NS = "Microsoft.Dynamics.CRM"
EDM = "{http://docs.oasis-open.org/odata/ns/edm}"
EDMX = "{http://docs.oasis-open.org/odata/ns/edmx}"

class DataverseError(ValueError):
    def __init__(self, code, message, **details):
        super().__init__(message)
        self.code = code
        self.details = details

def require(condition, code, message, **details):
    if not condition:
        raise DataverseError(code, message, **details)

def sha256(data):
    require(isinstance(data, (bytes, bytearray)), "BYTES", "Use complete original bytes.")
    return hashlib.sha256(data).hexdigest()

def _pairs(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, "JSON_DUPLICATE", "The original JSON repeats a key.", key=key)
        value[key] = item
    return value

def parse_json(data, maximum=MAX_JSON):
    if isinstance(data, str):
        data = data.encode("utf-8")
    require(isinstance(data, bytes) and len(data) <= maximum, "JSON_SIZE", "Use complete bounded UTF-8 JSON.")
    try:
        return json.loads(data.decode("utf-8-sig"), parse_float=Decimal,
                          parse_constant=lambda value: (_ for _ in ()).throw(
                              DataverseError("JSON_NUMBER", "JSON numbers must be finite.", value=value)),
                          object_pairs_hook=_pairs)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise DataverseError("JSON_FORMAT", "The retained input is not complete UTF-8 JSON.") from exc

def decimal_text(value):
    require(isinstance(value, Decimal) and value.is_finite(), "JSON_NUMBER", "Use a finite exact decimal.")
    sign, digits, exponent = value.as_tuple()
    require(len(digits) + abs(exponent) <= MAX_DIGITS, "JSON_NUMBER_SIZE",
            "The decimal's exact expanded representation exceeds the supported bound.")
    return format(value, "f")

def canonical(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        require(value.bit_length() <= MAX_DIGITS * 4, "JSON_NUMBER_SIZE", "The integer exceeds the supported bound.")
        return str(value)
    if isinstance(value, Decimal):
        return decimal_text(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return "[" + ",".join(canonical(x) for x in value) + "]"
    if isinstance(value, dict):
        require(all(isinstance(x, str) for x in value), "JSON_KEYS", "JSON object keys must be text.")
        return "{" + ",".join(canonical(k) + ":" + canonical(value[k]) for k in sorted(value)) + "}"
    raise DataverseError("JSON_TYPE", "Keep exact JSON types; binary floats are not accepted.",
                         actual_type=type(value).__name__)

def json_bytes(value):
    return (canonical(value) + "\n").encode("utf-8")

def identity(value):
    return sha256(json_bytes(value))

def clone(value):
    return copy.deepcopy(value)

def exact_keys(value, allowed, required=()):
    require(isinstance(value, dict), "OBJECT", "Use the documented object.")
    extra = sorted(set(value) - set(allowed))
    absent = sorted(set(required) - set(value))
    require(not extra and not absent, "OBJECT_FIELDS", "Use the complete documented fields.",
            unexpected=extra, missing=absent)

def text(value, name, maximum=4000, empty=False):
    require(isinstance(value, str) and "\x00" not in value and len(value) <= maximum
            and (empty or bool(value.strip())), "TEXT", "Use valid " + name + ".")
    return value

def integer(value, name, minimum=0, maximum=2147483647):
    require(isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= maximum,
            "INTEGER", "Use an in-range integer for " + name + ".")
    return value

def identifier(value, kind="logical"):
    pattern = {"logical": LOGICAL, "schema": SCHEMA_NAME, "unique": UNIQUE, "key": KEY}[kind]
    require(isinstance(value, str) and pattern.fullmatch(value), "IDENTIFIER", "Use a valid " + kind + " identifier.")
    return value

def guid(value):
    require(isinstance(value, str), "GUID", "Use the actual complete GUID.")
    try:
        parsed = uuid.UUID(value.strip("{}"))
    except (ValueError, AttributeError) as exc:
        raise DataverseError("GUID", "Use the actual complete GUID.") from exc
    require(parsed.int != 0, "GUID", "The empty GUID does not identify a target record.")
    return str(parsed)

def endpoint(value):
    text(value, "Dataverse environment URL", 2048)
    split = urlsplit(value)
    require(split.scheme == "https" and split.hostname and split.username is None
            and split.password is None and not split.query and not split.fragment
            and split.path in ("", "/"), "ENVIRONMENT_URL", "Select one explicit HTTPS environment origin.")
    return urlunsplit(("https", split.netloc.lower(), "", "", ""))

def profile(value):
    exact_keys(value, ["schema", "environment_url", "organization_id", "api_version",
                       "token_environment", "name", "source_refs"],
               ["schema", "environment_url", "organization_id", "api_version", "token_environment"])
    require(value["schema"] == CONTRACT_SCHEMA + ".profile", "PROFILE_SCHEMA", "Use the original target profile.")
    result = clone(value)
    result["environment_url"] = endpoint(value["environment_url"])
    result["organization_id"] = guid(value["organization_id"])
    require(re.fullmatch(r"v9\.[0-9]+", value["api_version"] or ""), "API_VERSION", "Select the actual Dataverse API version.")
    require(re.fullmatch(r"[A-Z][A-Z0-9_]{2,99}", value["token_environment"] or ""), "TOKEN_REFERENCE",
            "Use the administrator's environment-variable name, not a credential value.")
    if "name" in value:
        text(value["name"], "environment label", 300)
    if "source_refs" in value:
        require(isinstance(value["source_refs"], list), "SOURCE_REFS", "Retain original source references as an array.")
    return result

def public_profile(value):
    p = profile(value)
    return {k: v for k, v in p.items() if k != "token_environment"}

def api_root(value):
    p = profile(value)
    return p["environment_url"] + "/api/data/" + p["api_version"] + "/"

def binary(value, name="original", maximum=MAX_JSON):
    exact_keys(value, ["bytes", "sha256", "data_base64"], ["bytes", "sha256", "data_base64"])
    integer(value["bytes"], name + " byte count", 0, maximum)
    require(isinstance(value["sha256"], str) and HASH.fullmatch(value["sha256"]), "HASH", "Retain the complete SHA-256.")
    require(isinstance(value["data_base64"], str) and len(value["data_base64"]) <= (maximum + 2) // 3 * 4,
            "BINARY_SIZE", "Keep bounded original encoded bytes.")
    try:
        raw = base64.b64decode(value["data_base64"], validate=True)
    except (ValueError, TypeError) as exc:
        raise DataverseError("BINARY_FORMAT", "The retained base64 is invalid.") from exc
    require(len(raw) == value["bytes"] and sha256(raw) == value["sha256"], "BINARY_CHANGED",
            "The retained original bytes differ.", original=name)
    return raw

def pack(data):
    require(isinstance(data, bytes), "BYTES", "Retain complete original bytes.")
    return {"bytes": len(data), "sha256": sha256(data), "data_base64": base64.b64encode(data).decode("ascii")}

def xml(data, root_name=None):
    if isinstance(data, str):
        data = data.encode("utf-8")
    require(isinstance(data, bytes) and len(data) <= MAX_XML, "XML_SIZE", "Use complete bounded XML.")
    require(b"<!DOCTYPE" not in data.upper() and b"<!ENTITY" not in data.upper(), "XML_ENTITY",
            "External declarations are not part of the supported solution XML.")
    try:
        result = ET.fromstring(data)
    except (ET.ParseError, UnicodeError) as exc:
        raise DataverseError("XML_FORMAT", "The original XML is incomplete or invalid.") from exc
    if root_name is not None:
        require(result.tag.rsplit("}", 1)[-1] == root_name, "XML_ROOT", "The solution component has another XML root.",
                expected=root_name, actual=result.tag)
    return result

def labels(value, name="label"):
    exact_keys(value, ["@odata.type", "LocalizedLabels", "UserLocalizedLabel"], ["LocalizedLabels"])
    require(isinstance(value["LocalizedLabels"], list) and value["LocalizedLabels"], "LABELS", "Supply explicit localized labels.")
    seen = set()
    for row in value["LocalizedLabels"]:
        require(isinstance(row, dict) and "LanguageCode" in row and "Label" in row,
                "LABEL", "Each localized label requires its language code and text.")
        code = integer(row["LanguageCode"], "label language", 1, 65535)
        text(row["Label"], name, 4000, empty=True)
        require(code not in seen, "LABEL_LANGUAGE", "Each language occurs once in a label.")
        seen.add(code)
    return clone(value)

def writable_label(value):
    checked = labels(value)
    return {"@odata.type": NS + ".Label", "LocalizedLabels": [
        {"@odata.type": NS + ".LocalizedLabel", "LanguageCode": item["LanguageCode"], "Label": item["Label"]}
        for item in checked["LocalizedLabels"]]}

def merge_definition(original, changes):
    """Merge selected native fields, preserving unknown original properties.

    Label language membership is merged by the original LanguageCode. Unselected
    lists remain original; changing a list requires the caller's complete list.
    """
    require(isinstance(original, dict) and isinstance(changes, dict), "METADATA", "Use full original metadata and selected changes.")
    result = clone(original)
    for key, value in changes.items():
        if key in ("@odata.context", "@odata.etag", "UserLocalizedLabel"):
            continue
        before = result.get(key)
        if isinstance(value, dict) and "LocalizedLabels" in value:
            requested = writable_label(value)
            kept = {}
            if isinstance(before, dict):
                for item in before.get("LocalizedLabels", []):
                    require(isinstance(item, dict) and "LanguageCode" in item, "LABEL", "Original labels must retain their language.")
                    kept[item["LanguageCode"]] = clone(item)
            for item in requested["LocalizedLabels"]:
                kept[item["LanguageCode"]] = item
            result[key] = {**(clone(before) if isinstance(before, dict) else {}), **requested,
                           "LocalizedLabels": list(kept.values())}
            result[key].pop("UserLocalizedLabel", None)
        elif isinstance(value, dict) and isinstance(before, dict):
            result[key] = merge_definition(before, value)
        else:
            result[key] = clone(value)
    return result

def source_subset(actual, desired):
    """Check the selected authored fields without inventing provider defaults."""
    if isinstance(desired, dict):
        if not isinstance(actual, dict):
            return False
        if "LocalizedLabels" in desired:
            have = {x.get("LanguageCode"): x for x in actual.get("LocalizedLabels", []) if isinstance(x, dict)}
            return all(x.get("LanguageCode") in have and have[x["LanguageCode"]].get("Label") == x.get("Label")
                       for x in desired["LocalizedLabels"])
        return all(key in ("@odata.context", "@odata.etag", "@odata.type", "UserLocalizedLabel")
                   or key in actual and source_subset(actual[key], val) for key, val in desired.items())
    if isinstance(desired, list):
        return isinstance(actual, list) and len(actual) == len(desired) and all(
            source_subset(a, b) for a, b in zip(actual, desired))
    if isinstance(actual, bool) != isinstance(desired, bool):
        return False
    return actual == desired

def route(path):
    text(path, "native API-relative path", 32000)
    parsed = urlsplit(path)
    require(not parsed.scheme and not parsed.netloc and not parsed.fragment and not path.startswith("/")
            and "\r" not in path and "\n" not in path and "\\" not in path
            and all(part not in (".", "..") for part in unquote(parsed.path).split("/")),
            "API_ROUTE", "Use a retained relative route within the selected Dataverse API.")
    return path

def target_profile(value):
    """Public target binding; credential references are not required in exports."""
    exact_keys(value, ["schema", "environment_url", "organization_id", "api_version", "name", "source_refs"],
               ["schema", "environment_url", "organization_id", "api_version"])
    require(value["schema"] == CONTRACT_SCHEMA + ".profile", "PROFILE_SCHEMA", "Use the original public target profile.")
    result = clone(value)
    result["environment_url"] = endpoint(value["environment_url"])
    result["organization_id"] = guid(value["organization_id"])
    require(isinstance(value["api_version"], str) and re.fullmatch(r"v9\.[0-9]+", value["api_version"]),
            "API_VERSION", "Retain the actual selected API version.")
    return result

def target_identity(value):
    checked = target_profile(value)
    return {key: checked[key] for key in ("environment_url", "organization_id", "api_version")}

def instant(value, name="received time"):
    text(value, name, 100)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise DataverseError("INSTANT", "Retain a complete timezone-aware " + name + ".") from exc
    require(parsed.tzinfo is not None, "INSTANT", "Retain a timezone-aware " + name + ".")
    return value

def next_route(value, selected):
    """Accept only the actual continuation inside this same origin/API version."""
    text(value, "original continuation URL", 32000)
    target = target_profile(selected)
    split = urlsplit(value)
    if split.scheme or split.netloc:
        origin = target["environment_url"]
        prefix = origin + "/api/data/" + target["api_version"] + "/"
        require(value.startswith(prefix) and split.scheme == "https" and not split.fragment,
                "CONTINUATION_TARGET", "The original nextLink leaves the selected target API.")
        return route(value[len(prefix):])
    return route(value)

def is_reference(value):
    if not isinstance(value, dict):
        return False
    if set(value) == {"$component", "select"}:
        identifier(value["$component"], "key")
        require(value["select"] == "id", "COMPONENT_REFERENCE", "Only the actual component ID may be referenced.")
        return True
    if set(value) == {"$bind"}:
        exact_keys(value["$bind"], ["component", "entity_set"], ["component", "entity_set"])
        identifier(value["$bind"]["component"], "key")
        identifier(value["$bind"]["entity_set"])
        return True
    if set(value) == {"$resource", "as"}:
        identifier(value["$resource"], "key")
        require(value["as"] in ("base64", "utf8"), "RESOURCE_REFERENCE", "Select exact UTF-8 or base64 resource bytes.")
        return True
    return False

class Csdl:
    """Actual target OData contract, retained in full by the original snapshot."""
    def __init__(self, raw):
        self.raw = raw
        self.root = xml(raw)
        require(self.root.tag == EDMX + "Edmx", "CSDL", "Read the actual complete Dataverse metadata document.")
        self.types, self.actions, self.functions, self.entity_sets, self.aliases = {}, {}, {}, {}, {}
        for schema in self.root.iter(EDM + "Schema"):
            namespace = schema.attrib.get("Namespace")
            require(namespace, "CSDL", "Every metadata schema has a namespace.")
            if schema.attrib.get("Alias"):
                self.aliases[schema.attrib["Alias"]] = namespace
            for child in schema:
                local = child.tag.rsplit("}", 1)[-1]
                name = child.attrib.get("Name")
                if local in ("EntityType", "ComplexType", "EnumType") and name:
                    full = namespace + "." + name
                    require(full not in self.types, "CSDL_DUPLICATE", "A target type occurs more than once.", type=full)
                    self.types[full] = child
                elif local in ("Action", "Function") and name:
                    target = self.actions if local == "Action" else self.functions
                    target.setdefault(namespace + "." + name, []).append(child)
                elif local == "EntityContainer":
                    for item in child:
                        if item.tag == EDM + "EntitySet":
                            self.entity_sets[item.attrib["Name"]] = item.attrib["EntityType"]
        require(self.entity_sets and self.types, "CSDL_EMPTY", "The target metadata contains no entity contract.")

    def qualified(self, name):
        require(isinstance(name, str), "CSDL_TYPE", "Select the native type name.")
        name = name.lstrip("#")
        if name.startswith("Collection(") and name.endswith(")"):
            return "Collection(" + self.qualified(name[11:-1]) + ")"
        head, sep, tail = name.partition(".")
        return self.aliases.get(head, head) + sep + tail

    def type(self, name):
        name = self.qualified(name)
        require(name in self.types, "CSDL_TYPE", "The actual target does not expose the selected type.", type=name)
        return self.types[name]

    def properties(self, name, seen=None):
        name = self.qualified(name)
        seen = set() if seen is None else set(seen)
        require(name not in seen, "CSDL_CYCLE", "A native metadata inheritance chain is cyclic.")
        seen.add(name)
        element = self.type(name)
        result = {}
        parent = element.attrib.get("BaseType")
        if parent:
            result.update(self.properties(parent, seen))
        for child in element:
            if child.tag in (EDM + "Property", EDM + "NavigationProperty"):
                result[child.attrib["Name"]] = {**child.attrib, "Kind": child.tag.rsplit("}", 1)[-1]}
        return result

    def entity_set(self, name):
        require(name in self.entity_sets, "CSDL_SET", "The target does not expose the selected entity set.", entity_set=name)
        return self.qualified(self.entity_sets[name])

    def key(self, entity_set):
        element = self.type(self.entity_set(entity_set))
        seen = set()
        while element is not None:
            key = element.find(EDM + "Key")
            if key is not None:
                names = [x.attrib["Name"] for x in key.findall(EDM + "PropertyRef")]
                require(len(names) == 1, "CSDL_KEY", "The native component requires one declared key.", entity_set=entity_set)
                return names[0]
            parent = element.attrib.get("BaseType")
            if not parent:
                break
            require(parent not in seen, "CSDL_CYCLE", "A native key inheritance chain is cyclic.")
            seen.add(parent)
            element = self.type(parent)
        raise DataverseError("CSDL_KEY", "The actual target has no unique component key.", entity_set=entity_set)

    def navigation(self, entity_set, name, expected_type=None):
        props = self.properties(self.entity_set(entity_set))
        require(name in props and props[name]["Kind"] == "NavigationProperty", "CSDL_NAVIGATION",
                "The selected navigation is absent in actual target metadata.",
                entity_set=entity_set, navigation=name)
        prop = props[name]
        if expected_type:
            require(self.qualified(prop.get("Type")) == self.qualified(expected_type),
                    "CSDL_NAVIGATION_TYPE", "The native relationship targets another type.")
        return clone(prop)

    def derives(self, actual, base):
        actual, base = self.qualified(actual), self.qualified(base)
        seen = set()
        while actual not in seen:
            if actual == base:
                return True
            seen.add(actual)
            element = self.type(actual)
            actual = element.attrib.get("BaseType")
            if not actual:
                return False
            actual = self.qualified(actual)
        raise DataverseError("CSDL_CYCLE", "A native inheritance chain is cyclic.")

    def operation(self, name, payload=None, bound_type=None, function=False, allow_references=False):
        qualified = self.qualified(name if "." in name else NS + "." + name)
        choices = (self.functions if function else self.actions).get(qualified, [])
        matching = []
        for item in choices:
            bound = item.attrib.get("IsBound", "false").lower() == "true"
            params = list(item.findall(EDM + "Parameter"))
            if bound != (bound_type is not None):
                continue
            if bound and (not params or self.qualified(params[0].attrib.get("Type")) != self.qualified(bound_type)):
                continue
            remaining = params[1:] if bound else params
            fields = {x.attrib["Name"]: dict(x.attrib) for x in remaining}
            if payload is not None:
                supplied = set(payload)
                required = {key for key, p in fields.items() if p.get("Nullable", "true") == "false"}
                if not supplied <= set(fields) or not required <= supplied:
                    continue
            matching.append({"name": qualified, "bound_type": bound_type, "parameters": fields,
                             "return_type": (dict(item.find(EDM + "ReturnType").attrib)
                                             if item.find(EDM + "ReturnType") is not None else None)})
        require(len(matching) == 1, "CSDL_OPERATION", "The actual target has no unique compatible operation signature.",
                operation=qualified, matches=len(matching))
        selected = matching[0]
        if payload is not None:
            for key, value in payload.items():
                prop = selected["parameters"][key]
                self.value(prop["Type"], value, prop, allow_references=allow_references)
        return clone(selected)

    def value(self, type_name, value, property_info=None, allow_references=False):
        info = property_info or {}
        if allow_references and is_reference(value):
            return
        if value is None:
            require(info.get("Nullable", "true") != "false", "CSDL_NULL", "The target field is not nullable.")
            return
        if type_name.startswith("Collection(") and type_name.endswith(")"):
            require(isinstance(value, list), "CSDL_COLLECTION", "The target field requires an array.")
            for item in value:
                self.value(type_name[11:-1], item, allow_references=allow_references)
            return
        type_name = self.qualified(type_name)
        if type_name in self.types:
            element = self.type(type_name)
            if element.tag == EDM + "EnumType":
                require(isinstance(value, str), "CSDL_ENUM", "Use the actual native enumeration label.", type=type_name)
                prefix = type_name + "'"
                members = value[len(prefix):-1] if value.startswith(prefix) and value.endswith("'") else value
                selected = [x.strip() for x in members.split(",")]
                allowed = {x.attrib["Name"] for x in element.findall(EDM + "Member")}
                require(selected and all(x in allowed for x in selected)
                        and (len(selected) == 1 or element.attrib.get("IsFlags") == "true"),
                        "CSDL_ENUM", "The selected label is absent in the actual target enumeration.", type=type_name)
            else:
                self.payload(type_name, value, allow_references=allow_references)
            return
        if type_name == "Edm.String":
            require(isinstance(value, str) and "\x00" not in value, "CSDL_STRING", "The target field requires text.")
            maximum = info.get("MaxLength")
            if maximum and maximum.isdigit():
                require(len(value) <= int(maximum), "CSDL_MAX_LENGTH", "The text exceeds the target's declared bound.")
        elif type_name == "Edm.Boolean":
            require(isinstance(value, bool), "CSDL_BOOLEAN", "The target field requires a JSON boolean.")
        elif type_name == "Edm.Guid":
            guid(value)
        elif type_name in ("Edm.Byte", "Edm.SByte", "Edm.Int16", "Edm.Int32", "Edm.Int64"):
            bounds = {"Edm.Byte": (0, 255), "Edm.SByte": (-128, 127), "Edm.Int16": (-32768, 32767),
                      "Edm.Int32": (-2147483648, 2147483647), "Edm.Int64": (-9223372036854775808, 9223372036854775807)}
            integer(value, "native integer", *bounds[type_name])
        elif type_name in ("Edm.Decimal", "Edm.Double", "Edm.Single"):
            require(isinstance(value, (int, Decimal)) and not isinstance(value, bool),
                    "CSDL_NUMBER", "Use an exact finite JSON number for this target field.")
            canonical(value)
        elif type_name == "Edm.Binary":
            require(isinstance(value, str), "CSDL_BINARY", "Use complete base64 text for a binary target field.")
            try:
                decoded = base64.b64decode(value, validate=True)
            except (ValueError, TypeError) as exc:
                raise DataverseError("CSDL_BINARY", "The selected native binary is not valid base64.") from exc
            require(base64.b64encode(decoded).decode("ascii") == value, "CSDL_BINARY", "Use canonical complete base64.")
        elif type_name == "Edm.DateTimeOffset":
            instant(value)
        elif type_name == "Edm.Date":
            require(isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value),
                    "CSDL_DATE", "Use the complete original ISO date.")
        else:
            raise DataverseError("CSDL_PRIMITIVE", "This target primitive needs an explicit supported representation.", type=type_name)

    def payload(self, type_name, value, allow_references=False):
        require(isinstance(value, dict), "CSDL_PAYLOAD", "Supply the selected native object.")
        declared = self.qualified(type_name)
        actual = self.qualified(value.get("@odata.type", declared))
        require(self.derives(actual, declared), "CSDL_DERIVED_TYPE", "The selected object does not derive from the expected type.")
        props = self.properties(actual)
        for key, item in value.items():
            if key.startswith("@odata."):
                continue
            lookup = key[:-11] if key.endswith("@odata.bind") else key
            require(lookup in props, "CSDL_PROPERTY", "A selected native field is not exposed by the actual target.",
                    type=actual, field=key)
            if key.endswith("@odata.bind"):
                require(props[lookup]["Kind"] == "NavigationProperty", "CSDL_BINDING", "Bind an actual navigation property.")
                if allow_references and is_reference(item):
                    continue
                if props[lookup]["Type"].startswith("Collection("):
                    require(isinstance(item, list) and all(isinstance(x, str) for x in item), "CSDL_BINDING", "Bind exact target record routes.")
                    for member in item:
                        route(member.lstrip("/"))
                else:
                    require(isinstance(item, str), "CSDL_BINDING", "Bind one exact target record route.")
                    route(item.lstrip("/"))
                continue
            self.value(props[lookup]["Type"], item, props[lookup], allow_references=allow_references)
        return clone(value)

def validate_exchange(value):
    exact_keys(value, ["schema", "profile", "request", "response", "received_at", "request_id"],
               ["schema", "profile", "request", "response", "received_at", "request_id"])
    require(value["schema"] == EXCHANGE_SCHEMA, "EXCHANGE_SCHEMA", "Retain the complete actual request/response.")
    target_profile(value["profile"])
    instant(value["received_at"])
    identifier(value["request_id"], "key")
    req, res = value["request"], value["response"]
    exact_keys(req, ["method", "path", "headers", "body"], ["method", "path", "headers", "body"])
    require(req["method"] in ("GET", "POST", "PUT", "PATCH", "DELETE"), "HTTP_REQUEST", "Retain the actual HTTP method.")
    route(req["path"])
    exact_keys(res, ["status", "headers", "body"], ["status", "headers", "body"])
    integer(res["status"], "HTTP response status", 100, 599)
    for headers in (req["headers"], res["headers"]):
        require(isinstance(headers, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in headers.items()),
                "HTTP_HEADERS", "Retain actual header text.")
        require(all(x.lower() not in ("authorization", "proxy-authorization", "cookie", "set-cookie") for x in headers),
                "PRIVATE_HEADER", "Credentials are not solution evidence.")
    binary(res["body"], "HTTP response")
    if req["body"] is not None:
        binary(req["body"], "HTTP request")
    return clone(value)

def resource_pages(entry, selected, key="resource"):
    exact_keys(entry, ["path", "exchanges", "complete"], ["path", "exchanges", "complete"])
    expected = route(entry["path"])
    require(entry["complete"] is True and isinstance(entry["exchanges"], list) and entry["exchanges"],
            "SNAPSHOT_RESOURCE", "Retain the complete original response chain.", key=key)
    seen, bodies = set(), []
    for index, original in enumerate(entry["exchanges"]):
        exchange = validate_exchange(original)
        require(target_identity(exchange["profile"]) == target_identity(selected), "TARGET_IDENTITY",
                "A resource belongs to another target or API version.")
        req, res = exchange["request"], exchange["response"]
        require(req["method"] == "GET" and req["body"] is None and req["path"] == expected,
                "SNAPSHOT_ROUTE", "The response chain does not follow its original nextLink.", key=key, page=index)
        require(expected not in seen, "CONTINUATION_CYCLE", "A retained nextLink repeats an original request.")
        seen.add(expected)
        require(res["status"] in (200, 404), "SNAPSHOT_RESOURCE", "A failed read does not establish component absence.")
        if res["status"] == 404:
            require(index == 0 and len(entry["exchanges"]) == 1, "SNAPSHOT_ABSENCE",
                    "A missing later page cannot establish a complete population.")
            return []
        body = parse_json(binary(res["body"], "resource " + key))
        require(isinstance(body, dict), "SNAPSHOT_RESOURCE", "The native resource must be a JSON object.")
        bodies.append(body)
        following = body.get("@odata.nextLink")
        if index < len(entry["exchanges"]) - 1:
            require(following is not None, "SNAPSHOT_EXTRA_PAGE", "A retained page has no preceding native nextLink.")
            expected = next_route(following, selected)
        else:
            require(following is None, "SNAPSHOT_INCOMPLETE", "The actual last response still declares another page.", key=key)
    return bodies

def resource_rows(entry, selected, key="resource"):
    rows = []
    for body in resource_pages(entry, selected, key):
        if "value" in body:
            require(isinstance(body["value"], list) and all(isinstance(x, dict) for x in body["value"]),
                    "SNAPSHOT_ROWS", "Retain the original native object array.", key=key)
            rows.extend(body["value"])
        else:
            rows.append(body)
    return rows

def validate_snapshot(value):
    exact_keys(value, ["schema", "id", "created_at", "profile", "whoami", "csdl", "resources", "complete", "source_refs"],
               ["schema", "id", "created_at", "profile", "whoami", "csdl", "resources", "complete", "source_refs"])
    require(value["schema"] == SNAPSHOT_SCHEMA and value["complete"] is True, "SNAPSHOT", "Select a completed original target capture.")
    selected = target_profile(value["profile"])
    instant(value["created_at"], "snapshot receipt time")
    who = validate_exchange(value["whoami"])
    require(who["request"]["method"] == "GET" and who["request"]["path"] in ("WhoAmI", "WhoAmI()")
            and who["request"]["body"] is None and who["response"]["status"] == 200,
            "TARGET_IDENTITY", "The snapshot must contain its original successful WhoAmI response.")
    require(target_identity(who["profile"]) == target_identity(selected), "TARGET_IDENTITY", "The source environment differs.")
    identity_body = parse_json(binary(who["response"]["body"]))
    require(guid(identity_body["OrganizationId"]) == selected["organization_id"],
            "TARGET_IDENTITY", "The actual organization ID differs from the selected target.")
    metadata = validate_exchange(value["csdl"])
    require(metadata["request"]["method"] == "GET" and metadata["request"]["path"] == "$metadata"
            and metadata["request"]["body"] is None and metadata["response"]["status"] == 200,
            "CSDL", "Retain the successful original metadata request.")
    require(target_identity(metadata["profile"]) == target_identity(selected), "TARGET_IDENTITY", "Metadata is from another target.")
    csdl = Csdl(binary(metadata["response"]["body"], "CSDL", MAX_XML))
    csdl.operation("WhoAmI", {}, function=True)
    require(isinstance(value["resources"], dict) and len(value["resources"]) <= MAX_COMPONENTS * 8,
            "SNAPSHOT_RESOURCES", "Retain the bounded original component selections.")
    for key, entry in value["resources"].items():
        identifier(key, "key")
        resource_pages(entry, selected, key)
    unsigned = {k: v for k, v in value.items() if k != "id"}
    require(value["id"] == "target-" + identity(unsigned), "SNAPSHOT_ID", "The complete original target snapshot identity differs.")
    return clone(value)
