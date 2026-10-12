"""MIT. Original MARC21 records and explicit OAI-to-TIND field mapping."""
from __future__ import annotations
from collections import OrderedDict
import io
import hashlib
import json
import re
from xml.sax.saxutils import escape, quoteattr
from bridge import xml, InputError
from protocol import Q, unpacked

NS = "http://www.loc.gov/MARC21/slim"
M = lambda key: "{" + NS + "}" + key
DC = "{http://purl.org/dc/elements/1.1/}"
DCPATH = [Q("metadata"), "{http://www.openarchives.org/OAI/2.0/oai_dc/}dc"]
LEADER = "00000nam a2200000   4500"
MAX_VALUE = 1048576
SAFE_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")

def text(value, name, maximum=MAX_VALUE, empty=False):
    if not isinstance(value, str) or len(value) > maximum or SAFE_TEXT.search(value) or (not empty and not value.strip()):
        raise InputError("Supply valid " + name)
    return value

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)

def doi(value):
    value = value.strip()
    value = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value, flags=re.I)
    return value.casefold() if re.fullmatch(r"10\.\d{4,9}/[^\s<>]+", value, re.I) else None

def normalize_record(raw, require_id=False):
    if not isinstance(raw, dict) or set(raw) - {"leader", "fields"}:
        raise InputError("A MARC record has leader and ordered fields")
    leader = text(raw.get("leader", LEADER), "24-character MARC leader", 24)
    if len(leader) != 24:
        raise InputError("A MARC leader must contain 24 characters")
    fields = raw.get("fields")
    if not isinstance(fields, list) or len(fields) > 10000:
        raise InputError("MARC fields must be an ordered array of at most 10,000 entries")
    result = {"leader": leader, "fields": []}
    for original in fields:
        if not isinstance(original, dict):
            raise InputError("Each MARC field is an object")
        tag = original.get("tag")
        if not isinstance(tag, str) or not re.fullmatch(r"\d{3}", tag) or tag == "000":
            raise InputError("MARC tags use three digits, 001–999")
        if int(tag) < 10:
            if set(original) != {"tag", "value"}:
                raise InputError("A control field has tag and value")
            result["fields"].append({"tag": tag, "value": text(original["value"], "control-field value", empty=True)})
            continue
        if set(original) != {"tag", "ind1", "ind2", "subfields"}:
            raise InputError("A data field has tag, ind1, ind2 and ordered subfields")
        inds = []
        for name in ("ind1", "ind2"):
            value = original[name]
            if not isinstance(value, str) or len(value) != 1 or not re.fullmatch(r"[ 0-9A-Za-z]", value):
                raise InputError("MARC indicators are one space, digit or letter")
            inds.append(value)
        subs = original["subfields"]
        if not isinstance(subs, list) or not 1 <= len(subs) <= 10000:
            raise InputError("A data field needs an ordered array of subfields")
        out = []
        for sub in subs:
            if not isinstance(sub, dict) or set(sub) != {"code", "value"} or not isinstance(sub["code"], str) or not re.fullmatch(r"[0-9A-Za-z]", sub["code"]):
                raise InputError("A MARC subfield has a single-character code and value")
            out.append({"code": sub["code"], "value": text(sub["value"], "subfield value", empty=True)})
        result["fields"].append({"tag": tag, "ind1": inds[0], "ind2": inds[1], "subfields": out})
    ids = [f["value"] for f in result["fields"] if f["tag"] == "001"]
    if len(ids) > 1 or require_id and (len(ids) != 1 or not ids[0].strip()):
        raise InputError("A destination record must have one nonempty native 001")
    return result

def native_id(record):
    return next((f["value"] for f in record["fields"] if f["tag"] == "001"), None)

def field_key(field):
    return field["tag"] if "value" in field else field["tag"] + field["ind1"] + field["ind2"]

def grouped(record):
    result = OrderedDict()
    for field in record["fields"]:
        result.setdefault(field_key(field), []).append(field)
    return result

def identifiers(record):
    result = []
    if native_id(record):
        result.append(("native", native_id(record)))
    for field in record["fields"]:
        key = field_key(field)
        if key not in {"0247 ", "909CO"}:
            continue
        for sub in field["subfields"]:
            if key == "0247 " and sub["code"] == "a":
                value = doi(sub["value"])
                if value:
                    result.append(("doi", value))
            elif key == "909CO" and sub["code"] == "o" and sub["value"]:
                result.append(("oai", sub["value"]))
    return list(dict.fromkeys(result))

def marcxml(record):
    record = normalize_record(record)
    lines = ['<record xmlns="' + NS + '">', "<leader>" + escape(record["leader"]) + "</leader>"]
    for field in record["fields"]:
        if "value" in field:
            lines.append('<controlfield tag="' + field["tag"] + '">' + escape(field["value"]) + "</controlfield>")
        else:
            lines.append('<datafield tag="' + field["tag"] + '" ind1=' + quoteattr(field["ind1"]) + ' ind2=' + quoteattr(field["ind2"]) + ">")
            lines.extend('<subfield code="' + sub["code"] + '">' + escape(sub["value"]) + "</subfield>" for sub in field["subfields"])
            lines.append("</datafield>")
    return "\n".join(lines + ["</record>"]) + "\n"

def parse_marc(stream, on_record):
    """Use the original hardened XML parser; hold one native record at a time."""
    p = xml.parser()
    stack, active = [], []
    record_bytes = count = 0
    root = None
    def start(raw, attrs):
        nonlocal root, record_bytes
        name = xml.expanded(raw)
        if len(stack) >= 8 or len(attrs) > 8:
            raise InputError("MARCXML structure exceeds the record format")
        stack.append(name)
        if len(stack) == 1:
            root = name
            if root not in {M("collection"), M("record")}:
                raise InputError("Receive MARC21 slim record or collection XML")
        is_record = name == M("record") and (len(stack) == 1 or len(stack) == 2 and root == M("collection"))
        if name == M("record") and not is_record:
            raise InputError("MARC records cannot be nested")
        if is_record:
            record_bytes = 0
        if active or is_record:
            node = xml.Node(name, {xml.expanded(k): v for k, v in attrs.items()})
            if active:
                active[-1].children.append(node)
                active[-1].content.append(node)
            active.append(node)
            record_bytes += len(name.encode()) + sum(len(k.encode()) + len(v.encode()) for k, v in node.attrs.items()) + 128
            if record_bytes > xml.MAX_RECORD:
                raise InputError("A MARC record exceeds the original 16 MiB record limit")
        elif len(stack) != 1:
            raise InputError("A MARC collection contains record elements")
    def content(value):
        nonlocal record_bytes
        if active:
            record_bytes += len(value.encode())
            if record_bytes > xml.MAX_RECORD:
                raise InputError("A MARC record exceeds the original record limit")
            active[-1].content.append(value)
        elif value.strip():
            raise InputError("Unexpected text outside a MARC record")
    def end(_):
        nonlocal count
        if active:
            node = active.pop()
            if node.name == M("record"):
                leaders = [n for n in node.children if n.name == M("leader")]
                if len(leaders) != 1:
                    raise InputError("Native MARC records need one leader")
                fields = []
                for child in node.children:
                    if child.name == M("leader"):
                        continue
                    if child.name == M("controlfield"):
                        if set(child.attrs) != {"tag"}:
                            raise InputError("Unexpected MARC control-field attributes")
                        fields.append({"tag": child.attrs["tag"], "value": child.text("leaf")})
                    elif child.name == M("datafield"):
                        if set(child.attrs) != {"tag", "ind1", "ind2"}:
                            raise InputError("Unexpected MARC data-field attributes")
                        subs = []
                        for sub in child.children:
                            if sub.name != M("subfield") or set(sub.attrs) != {"code"}:
                                raise InputError("Unexpected MARC subfield")
                            subs.append({"code": sub.attrs["code"], "value": sub.text("leaf")})
                        fields.append({**child.attrs, "subfields": subs})
                    else:
                        raise InputError("Unexpected element inside a MARC record")
                record = normalize_record({"leader": leaders[0].text("leaf"), "fields": fields}, require_id=True)
                on_record(record)
                count += 1
        stack.pop()
    p.StartElementHandler, p.EndElementHandler, p.CharacterDataHandler = start, end, content
    size = xml.parse_stream(p, stream)
    return {"records": count, "bytes": size}

def rule(name, dc, tag, ind1=" ", ind2=" ", code="a", take="all", transform="identity"):
    return {"name": name, "path": DCPATH + [DC + dc], "tag": tag, "ind1": ind1, "ind2": ind2,
            "code": code, "take": take, "transform": transform}

def default_profile():
    return {"schema": "stellar-forge.tind-profile.v1", "title": "Dublin Core to editable TIND MARC",
        "instance": "", "leader": LEADER, "batchRecords": 500,
        "rules": [
            rule("title", "title", "245", "0", "0", take="first"),
            rule("alternate_title", "title", "246", "3", " ", take="rest"),
            rule("first_creator", "creator", "100", "1", " ", take="first"),
            rule("additional_creators", "creator", "700", "1", " ", take="rest"),
            rule("contributors", "contributor", "700", "1", " "),
            rule("subjects", "subject", "650", " ", "4"),
            rule("description", "description", "520"),
            rule("publisher", "publisher", "260", code="b"),
            rule("publication_date", "date", "260", code="c"),
            rule("resource_type", "type", "655", " ", "4"),
            rule("format", "format", "500"),
            rule("language", "language", "546"),
            rule("rights", "rights", "540"),
            rule("relation", "relation", "787", "0", " ", code="n"),
            rule("doi", "identifier", "024", "7", " ", transform="doi"),
            rule("source_identifiers", "identifier", "035", transform="non-doi")
        ],
        "constantFields": [], "sourceOaiIdentity": True,
        "defaultAccess": {"metadata": "unreviewed", "files": "unreviewed", "releaseDate": "", "restriction": "", "licenseURI": ""},
        "documentation": [
            "https://info.tind.io/roadmap/24.0.0-ils",
            "https://www.loc.gov/marc/bibliographic/bd024.html",
            "https://www.loc.gov/marc/bibliographic/bd773.html",
            "https://www.loc.gov/standards/marcxml/"]}

def normalize_profile(raw):
    if not isinstance(raw, dict) or raw.get("schema") != "stellar-forge.tind-profile.v1":
        raise InputError("Use a TIND profile document")
    result = dict(raw)
    result["title"] = text(raw.get("title"), "profile title", 256)
    result["instance"] = text(raw.get("instance", ""), "TIND instance URL", 4096, empty=True)
    normalize_record({"leader": raw.get("leader", LEADER), "fields": []})
    result["leader"] = raw.get("leader", LEADER)
    if type(raw.get("batchRecords", 500)) is not int or not 1 <= raw.get("batchRecords", 500) <= 10000:
        raise InputError("Choose 1–10,000 records per prepared MARCXML file")
    result["batchRecords"] = raw.get("batchRecords", 500)
    rules = raw.get("rules")
    if not isinstance(rules, list) or not 1 <= len(rules) <= 256:
        raise InputError("Choose 1–256 explicit mapping rules")
    names = set()
    result["rules"] = []
    for original in rules:
        row = dict(original)
        name = text(row.get("name"), "unique mapping rule name", 128)
        if name in names:
            raise InputError("Mapping rule names must be unique")
        names.add(name)
        row["path"] = xml.path_array(row.get("path"), name + ".path", False)
        if row.get("attribute") is not None:
            xml.path_array([row["attribute"]], name + ".attribute", False)
        for key, default, choices in (("take", "all", {"first", "rest", "all"}), ("transform", "identity", {"identity", "doi", "non-doi"})):
            row[key] = row.get(key, default)
            if row[key] not in choices:
                raise InputError("Unsupported mapping " + key)
        normalize_record({"fields": [{"tag": row.get("tag"), "ind1": row.get("ind1", " "),
            "ind2": row.get("ind2", " "), "subfields": [{"code": row.get("code"), "value": "value"}]}]})
        row.setdefault("ind1", " "); row.setdefault("ind2", " ")
        result["rules"].append(row)
    result["constantFields"] = normalize_record({"fields": raw.get("constantFields", [])})["fields"]
    if any(f["tag"] in {"001", "005", "856", "909"} for f in result["constantFields"]):
        raise InputError("Native identities and file metadata come from their original destination records")
    if type(raw.get("sourceOaiIdentity", True)) is not bool:
        raise InputError("sourceOaiIdentity must be true or false")
    result["sourceOaiIdentity"] = raw.get("sourceOaiIdentity", True)
    result["defaultAccess"] = access(raw.get("defaultAccess", {}))
    result["documentation"] = [text(x, "documentation URL", 4096) for x in raw.get("documentation", [])]
    return result

def access(raw):
    if not isinstance(raw, dict):
        raise InputError("Access is a separate metadata/files/release decision")
    result = {key: raw.get(key, default) for key, default in (
        ("metadata", "unreviewed"), ("files", "unreviewed"), ("releaseDate", ""), ("restriction", ""), ("licenseURI", ""))}
    if result["metadata"] not in {"public", "restricted", "unreviewed"} or result["files"] not in {"public", "restricted", "embargoed", "none", "unreviewed"}:
        raise InputError("Choose explicit metadata visibility and file visibility")
    for key in ("releaseDate", "restriction", "licenseURI"):
        text(result[key], "access " + key, 8192, empty=True)
    if result["releaseDate"]:
        from datetime import date
        try:
            date.fromisoformat(result["releaseDate"])
        except ValueError as error:
            raise InputError("Use a real YYYY-MM-DD release date") from error
    if result["files"] == "embargoed" and not result["releaseDate"]:
        raise InputError("An embargo needs its original release date")
    if result["metadata"] == "restricted" or result["files"] in {"restricted", "embargoed"}:
        if not result["restriction"].strip():
            raise InputError("Retain the restriction wording with restricted or embargoed access")
    return result

def mapped_record(observation, profile, staff=None):
    profile = normalize_profile(profile)
    if observation["status"] == "deleted":
        return {"leader": profile["leader"], "fields": []}
    root = unpacked(observation["node"])
    fields = []
    for row in profile["rules"]:
        column = {"name": "value", "path": row["path"], "type": "string", "mode": "json",
                  "missing": "default", "default": "[]", "trim": False, "text": "descendant",
                  "nil": "literal", "nullable": False}
        if row.get("attribute") is not None:
            column["attribute"] = row["attribute"]
        cell, _ = xml.project(root, column, 1, MAX_VALUE)
        values = json.loads(cell)
        values = values[:1] if row["take"] == "first" else values[1:] if row["take"] == "rest" else values
        for original in values:
            if original is None or not original.strip():
                continue
            value = doi(original) if row["transform"] == "doi" else original
            if row["transform"] == "non-doi" and doi(original) is not None:
                continue
            if value is None:
                continue
            subs = [{"code": row["code"], "value": value}]
            if row["transform"] == "doi":
                subs.append({"code": "2", "value": "doi"})
            fields.append({"tag": row["tag"], "ind1": row["ind1"], "ind2": row["ind2"], "subfields": subs})
    fields.extend(profile["constantFields"])
    if profile["sourceOaiIdentity"]:
        fields.append({"tag": "909", "ind1": "C", "ind2": "O", "subfields": [{"code": "o", "value": observation["identifier"]}]})
    staff = staff or {}
    hierarchy = staff.get("hierarchy") or {}
    if hierarchy:
        subfields = []
        for key, code in (("journalTitle", "t"), ("issue", "g"), ("volume", "g"), ("pages", "g"),
                          ("parentRecordId", "w"), ("issn", "x"), ("relationship", "i")):
            value = hierarchy.get(key)
            if value:
                subfields.append({"code": code, "value": text(value, "journal " + key, 4096)})
        if subfields:
            fields.append({"tag": "773", "ind1": "0", "ind2": " ", "subfields": subfields})
    return normalize_record({"leader": profile["leader"], "fields": fields})

def merge_records(source, baseline, destination, decisions=None):
    """Merge ordered repeated field groups; retained target-only metadata survives."""
    decisions = decisions or {}
    incoming, previous, current = grouped(source), grouped(baseline or {"fields": []}), grouped(destination or {"fields": []})
    keys = list(dict.fromkeys([*current, *incoming, *previous]))
    output, conflicts, choices_used = [], [], set()
    for key in keys:
        before, wanted, live = previous.get(key, []), incoming.get(key, []), current.get(key, [])
        if key in {"001", "005"} or key.startswith("856") or key not in incoming and key not in previous:
            selected = live
        elif destination is None:
            selected = wanted
        elif wanted == before:
            selected = live
        elif live == before or live == wanted:
            selected = wanted
        else:
            selected = live
            expected_digest = hashlib.sha256(canonical([key, before, wanted, live]).encode()).hexdigest()
            decision = decisions.get(key)
            if decision and not isinstance(decision, dict):
                raise InputError("A field merge decision must be a complete choice object")
            if decision and decision.get("expectedDigest") == expected_digest:
                if not isinstance(decision, dict) or decision.get("choice") not in {"source", "destination", "custom"}:
                    raise InputError("Choose source, destination or custom for a field conflict")
                text(decision.get("note"), "field merge decision note", 8192)
                selected = wanted if decision["choice"] == "source" else live
                if decision["choice"] == "custom":
                    selected = normalize_record({"fields": decision.get("fields")})["fields"]
                    if any(field_key(f) != key for f in selected):
                        raise InputError("Custom merge fields must belong to the selected field group")
                choices_used.add(key)
            else:
                conflicts.append({"key": key, "expectedDigest": expected_digest, "baseline": before, "source": wanted, "destination": live})
        output.extend(selected)
    stale = set(decisions) - choices_used
    leader = (destination or source)["leader"]
    return {"record": normalize_record({"leader": leader, "fields": output}), "conflicts": conflicts, "staleDecisions": sorted(stale)}
