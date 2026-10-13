"""MIT. Full source-bound XForm inventory and conservative HILA branch evaluation.

The original questionnaire is an input, not a bundled or re-licensed survey.
No submission endpoint, external entity resolver or XPath evaluator is installed.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys
from decimal import Decimal
from xml.etree.ElementTree import TreeBuilder

XML_ROOT = Path(__file__).resolve().parent.parent / "xml"
if str(XML_ROOT) not in sys.path:
    sys.path.append(str(XML_ROOT))
from xml_source import InputError, parser, expanded

SCHEMA = "stellar-forge.hila-questionnaire.v1"
MAX_FORM = 16 * 1024 * 1024
N = {"x": "http://www.w3.org/2002/xforms", "h": "http://www.w3.org/1999/xhtml"}
DIMENSIONS = {
    "availability": "assessment/section3a_info_avail",
    "accessibility": "assessment/section3b_info_access",
    "quality": "assessment/section3c_info_quality",
    "use": "assessment/section3d_info_use",
    "awareness": "assessment/section3e_info_aware",
}
CONSENT = "consent_cont/consent_acknowledge"
NEW_INFORMATION = "assessment/section3a_info_avail/new_info"
AXIS_FIELDS = {
    "country": ["respondent_info/country", "respondent_info/countries"],
    "sector": ["respondent_info/topic"],
    "organization": ["respondent_info/org_type"],
    "role": ["respondent_info/roles"],
}
PRIVATE_ONLY = {
    "consent_cont/why_no", "respondent_info/org_name", "respondent_info/subnationals",
    "respondent_info/opt_details", "support/final_aud", "support/final_txt",
}
ITEXT = re.compile(r"^jr:itext\((['\"])(.*?)\1\)$", re.S)
INSTANCE = re.compile(r"^instance\((['\"])([^'\"]+)\1\)/root/item(?:\[.*\])?$", re.S)


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode()


def sha(value):
    return hashlib.sha256(value).hexdigest()


def relative(path, root):
    prefix = "/" + root + "/"
    if path == "/" + root:
        return ""
    if not isinstance(path, str) or not path.startswith(prefix):
        raise InputError("Questionnaire binding must select the original primary instance")
    return path[len(prefix):]


def _xml(body):
    if not isinstance(body, bytes) or not body or len(body) > MAX_FORM:
        raise InputError("Supply the complete original XForm, up to 16 MiB")
    p, builder, depth, nodes = parser(), TreeBuilder(), 0, 0
    def start(name, attrs):
        nonlocal depth, nodes
        depth += 1
        nodes += 1
        if depth > 128 or nodes > 100000 or len(attrs) > 256:
            raise InputError("Questionnaire XML exceeds supported structural bounds")
        builder.start(expanded(name), {expanded(k): v for k, v in attrs.items()})
    def end(name):
        nonlocal depth
        builder.end(expanded(name))
        depth -= 1
    p.StartElementHandler, p.EndElementHandler = start, end
    p.CharacterDataHandler = builder.data
    try:
        for offset in range(0, len(body), 65536):
            p.Parse(body[offset:offset + 65536], False)
        p.Parse(b"", True)
        return builder.close()
    except InputError:
        raise
    except Exception as e:
        raise InputError("Original questionnaire is not a supported self-contained XForm: " + str(e)) from e


def inventory(body):
    document = _xml(body)
    model = document.find("h:head/x:model", N)
    body_element = document.find("h:body", N)
    if model is None or body_element is None:
        raise InputError("Questionnaire must have its original XForms model and body")
    primary = model.find("x:instance", N)
    if primary is None or len(primary) != 1:
        raise InputError("Questionnaire requires one complete primary instance")
    root = primary[0].tag.rsplit("}", 1)[-1]
    translations = {}
    for translation in model.findall("x:itext/x:translation", N):
        language = translation.get("lang")
        if not language or language in translations:
            raise InputError("Questionnaire translation languages must be unique")
        values = {}
        for item in translation.findall("x:text", N):
            ident = item.get("id")
            if not ident or ident in values:
                raise InputError("Questionnaire translation IDs must be unique")
            forms = {}
            for value in item.findall("x:value", N):
                form = value.get("form", "long")
                if form in forms:
                    raise InputError("Questionnaire translation forms must be unique")
                forms[form] = "".join(value.itertext())
            values[ident] = forms
        translations[language] = values
    def labels(element):
        if element is None:
            return {"ref": None, "text": "", "translations": {}}
        ref = element.get("ref")
        match = ITEXT.fullmatch(ref or "")
        return {
            "ref": ref, "text": "".join(element.itertext()),
            "translations": {language: values.get(match.group(2), {})
                             for language, values in translations.items()} if match else {},
        }
    instances, external = {}, []
    for instance in model.findall("x:instance", N):
        ident = instance.get("id")
        if not ident:
            continue
        if ident in instances:
            raise InputError("Secondary instance IDs must be unique")
        if instance.get("src"):
            external.append({"id": ident, "src": instance.get("src")})
        items = []
        for item in (list(instance)[0] if len(instance) else []):
            fields = {child.tag.rsplit("}", 1)[-1]: "".join(child.itertext()) for child in item}
            text_id = fields.get("itextId")
            items.append({
                "value": fields.get("name", fields.get("value")),
                "fields": fields,
                "translations": {language: values.get(text_id, {})
                                 for language, values in translations.items()} if text_id else {},
            })
        if any(item["value"] is None for item in items) or len({i["value"] for i in items}) != len(items):
            raise InputError("Questionnaire choice values must be present and unique per list")
        instances[ident] = {"attributes": dict(instance.attrib), "items": items}
    binds = {}
    for binding in model.findall(".//x:bind", N):
        full_path = binding.get("nodeset", binding.get("ref"))
        if not full_path:
            raise InputError("Questionnaire bind has no explicit path")
        path = relative(full_path, root)
        if path in binds:
            raise InputError("Questionnaire has duplicate field bindings")
        binds[path] = dict(binding.attrib)
    fields, controls = {}, []
    for element in body_element.iter():
        kind = element.tag.rsplit("}", 1)[-1]
        if kind not in {"group", "repeat", "input", "select", "select1", "range", "upload", "trigger"}:
            continue
        ref = element.get("ref", element.get("nodeset"))
        control = {"kind": kind, "attributes": dict(element.attrib),
                   "label": labels(element.find("x:label", N)),
                   "hint": labels(element.find("x:hint", N))}
        controls.append(control)
        if ref is None:
            continue
        path = relative(ref, root)
        control["path"] = path
        if kind in {"group", "repeat", "trigger"}:
            continue
        if path in fields:
            raise InputError("Questionnaire has multiple response controls for one field")
        itemset = element.find("x:itemset", N)
        choices, choice_source, itemset_expression = [], None, None
        if itemset is not None:
            itemset_expression = itemset.get("nodeset", "")
            match = INSTANCE.fullmatch(itemset_expression)
            if match and match.group(2) in instances:
                choice_source = match.group(2)
                choices = instances[choice_source]["items"]
        else:
            for item in element.findall("x:item", N):
                choices.append({"value": item.findtext("x:value", namespaces=N),
                                "label": labels(item.find("x:label", N))})
        binding = binds.get(path, {})
        ancestry = ["/".join(path.split("/")[:i]) for i in range(1, len(path.split("/")) + 1)]
        relevant = [{"path": parent, "expression": binds[parent]["relevant"]}
                    for parent in ancestry if parent in binds and binds[parent].get("relevant")]
        presentation = path.endswith("_labels") or binding.get("readonly") == "true()"
        coded = kind in {"select", "select1"} and bool(choices) and not presentation
        dimension = next((key for key, prefix in DIMENSIONS.items()
                          if path.startswith(prefix + "/") and
                          choice_source == "yes_no_partial" and coded), None)
        fields[path] = {
            "path": path, "kind": kind, "type": binding.get("type", "string"),
            "binding": binding, "label": control["label"], "hint": control["hint"],
            "relevance": relevant, "choiceSource": choice_source,
            "itemset": itemset_expression, "choices": choices,
            "coded": coded, "presentation": presentation,
            "analysisAllowed": coded and path not in PRIVATE_ONLY,
            "dimension": dimension,
        }
    if CONSENT not in fields or not {"yes", "no"}.issubset({c["value"] for c in fields[CONSENT]["choices"]}):
        raise InputError("This HILA workflow requires the original explicit yes/no participation gate")
    dimensions = {key: [path for path, field in fields.items() if field["dimension"] == key]
                  for key in DIMENSIONS}
    if any(not items for items in dimensions.values()):
        raise InputError("The selected questionnaire does not contain all five original HILA dimension sections")
    result = {
        "schema": SCHEMA, "sha256": sha(body), "bytes": len(body), "root": root,
        "title": document.findtext("h:head/h:title", default="", namespaces=N),
        "primaryAttributes": dict(primary[0].attrib),
        "languages": list(translations), "translations": translations,
        "binds": binds, "fields": fields, "controls": controls,
        "instances": instances, "externalInstances": external,
        "dimensions": dimensions,
        "calculations": [{"path": path, "expression": value["calculate"]}
                         for path, value in binds.items() if "calculate" in value],
        "consent": {
            "field": CONSENT, "acceptedValue": "yes",
            "notice": fields.get("consent_cont/consent_and_data", {}).get("label"),
            "declinedReasonExcluded": "consent_cont/why_no",
            "analysis": "consenting responses only; individual rows remain private",
            "publicMaterial": "aggregate results only; an anonymized microdata release requires its own approved disclosure process",
        },
        "excludedFromAnalysis": sorted(path for path, field in fields.items() if not field["analysisAllowed"]),
    }
    result["inventorySha256"] = sha(canonical(result))
    return result


def english(label):
    values = label.get("translations", {})
    key = next((k for k in values if k.lower().startswith("english")), None)
    return values.get(key, {}).get("long", label.get("text", ""))


def suggested_mapping(form, columns):
    """Return explicit suggestions. The saved edition selects the complete mapping."""
    names, result, unresolved = set(columns), {}, []
    for path, field in form["fields"].items():
        if not field["analysisAllowed"]:
            continue
        candidates = [path, "/" + form["root"] + "/" + path, path.rsplit("/", 1)[-1]]
        matches = list(dict.fromkeys(name for name in candidates if name in names))
        if len(matches) == 1:
            result[path] = matches[0]
        else:
            unresolved.append({"field": path, "candidates": matches,
                               "reason": "missing" if not matches else "ambiguous"})
    return {"mapping": result, "unresolved": unresolved}


TOKEN = re.compile(r"""\s*(?:(?P<quoted>'[^']*'|"[^"]*")|(?P<path>/[A-Za-z0-9_.:-]+(?:/[A-Za-z0-9_.:-]+)*)|(?P<number>-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)|(?P<name>[A-Za-z_][A-Za-z0-9_:-]*)|(?P<op>!=|<=|>=|[=<>+(),.]))""")
UNKNOWN = object()


class Expression:
    """Small source-expression interpreter; unsupported syntax has an explicit unknown result."""
    def __init__(self, expression, root):
        self.tokens, self.pos, self.root = [], 0, root
        text, offset = expression.strip(), 0
        if len(text) > 8192:
            raise InputError("Questionnaire expression is too long")
        while offset < len(text):
            match = TOKEN.match(text, offset)
            if not match:
                raise InputError("Unsupported original questionnaire expression")
            self.tokens.append((match.lastgroup, match.group(match.lastgroup)))
            offset = match.end()
        if len(self.tokens) > 1024:
            raise InputError("Questionnaire expression exceeds the bounded interpreter")
        self.tree = self.parse(0)
        if self.pos != len(self.tokens):
            raise InputError("Unsupported original questionnaire expression suffix")

    def peek(self):
        return self.tokens[self.pos][1] if self.pos < len(self.tokens) else None

    def take(self, expected=None):
        if self.pos == len(self.tokens):
            raise InputError("Incomplete source expression")
        value = self.tokens[self.pos]
        self.pos += 1
        if expected is not None and value[1] != expected:
            raise InputError("Unexpected source expression token")
        return value

    def parse(self, minimum):
        kind, value = self.take()
        if value == "(":
            left = self.parse(0)
            self.take(")")
        elif kind == "quoted":
            left = ("literal", value[1:-1])
        elif kind == "number":
            left = ("literal", Decimal(value))
        elif kind == "path":
            left = ("field", relative(value, self.root))
        elif value == ".":
            left = ("current",)
        elif kind == "name" and self.peek() == "(":
            if value not in {"selected", "count-selected", "not", "true", "false"}:
                raise InputError("Unsupported source expression function: " + value)
            self.take("(")
            args = []
            if self.peek() != ")":
                args.append(self.parse(0))
                while self.peek() == ",":
                    self.take(",")
                    args.append(self.parse(0))
            self.take(")")
            arity = {"selected": 2, "count-selected": 1, "not": 1, "true": 0, "false": 0}
            if len(args) != arity[value]:
                raise InputError("Source expression function has the wrong arity")
            left = ("call", value, args)
        else:
            raise InputError("Unsupported source expression operand")
        priorities = {"or": 1, "and": 2, "=": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 4}
        while self.peek() in priorities and priorities[self.peek()] >= minimum:
            operator = self.take()[1]
            right = self.parse(priorities[operator] + 1)
            left = ("binary", operator, left, right)
        return left

    def evaluate(self, answers, current=None):
        def text(value):
            if value is None:
                return ""
            if isinstance(value, list):
                return " ".join(value)
            return str(value)
        def logical(value):
            return UNKNOWN if value is UNKNOWN else bool(value)
        def run(tree):
            kind = tree[0]
            if kind == "literal":
                return tree[1]
            if kind == "field":
                return answers.get(tree[1], UNKNOWN)
            if kind == "current":
                return current
            if kind == "call":
                name, values = tree[1], [run(item) for item in tree[2]]
                if any(value is UNKNOWN for value in values):
                    return UNKNOWN
                if name == "true":
                    return True
                if name == "false":
                    return False
                if name == "not":
                    return not logical(values[0])
                choices = text(values[0]).split()
                return text(values[1]) in choices if name == "selected" else Decimal(len(choices))
            operator, left, right = tree[1], run(tree[2]), run(tree[3])
            if operator == "and":
                if (left is not UNKNOWN and not logical(left)) or (right is not UNKNOWN and not logical(right)):
                    return False
                return UNKNOWN if left is UNKNOWN or right is UNKNOWN else True
            if operator == "or":
                if (left is not UNKNOWN and logical(left)) or (right is not UNKNOWN and logical(right)):
                    return True
                return UNKNOWN if left is UNKNOWN or right is UNKNOWN else False
            if left is UNKNOWN or right is UNKNOWN:
                return UNKNOWN
            if operator in {"=", "!="}:
                equal = text(left) == text(right)
                return equal if operator == "=" else not equal
            try:
                left, right = Decimal(text(left)), Decimal(text(right))
                if not left.is_finite() or not right.is_finite():
                    return UNKNOWN
            except Exception:
                return UNKNOWN
            if operator == "+":
                return left + right
            return {"<": left < right, ">": left > right,
                    "<=": left <= right, ">=": left >= right}[operator]
        return run(self.tree)


def compile_conditions(form):
    conditions = {}
    for path, field in form["fields"].items():
        compiled = []
        for item in field["relevance"]:
            try:
                expression = Expression(item["expression"], form["root"])
            except InputError:
                expression = None
            compiled.append((item, expression))
        conditions[path] = compiled
    return conditions


def relevant(form, path, answers, conditions=None):
    selected = (conditions or compile_conditions(form))[path]
    unknown = False
    for original, expression in selected:
        if expression is None:
            unknown = True
            continue
        value = expression.evaluate(answers, answers.get(path))
        if value is UNKNOWN:
            unknown = True
        elif not bool(value):
            return False
    return None if unknown else True
