"""MIT. Organisation projection and exact-byte corrections using the original XML adapter."""
from __future__ import annotations
import hashlib
import io
import re
from xml.parsers import expat
from xml.sax.saxutils import escape, quoteattr
from xml_source import parser, expanded, parse_stream
from iati_source import InputError
from workspace import json_bytes, checked_id, digest
from publishing_xml import Element, tag_end, opening_attributes, attribute_patch, text, MAX_EDIT_SOURCE

XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
XML_BASE = "{http://www.w3.org/XML/1998/namespace}base"
FAMILIES = ("total-budget", "recipient-org-budget", "recipient-country-budget",
            "recipient-region-budget", "total-expenditure")
ORG_ORDER = ("organisation-identifier", "name", "reporting-org", "total-budget",
             "recipient-org-budget", "recipient-region-budget", "recipient-country-budget",
             "total-expenditure", "document-link")
ORDERS = {
    "iati-organisation": ORG_ORDER,
    "total-budget": ("period-start", "period-end", "value", "budget-line"),
    "recipient-org-budget": ("recipient-org", "period-start", "period-end", "value", "budget-line"),
    "recipient-country-budget": ("recipient-country", "period-start", "period-end", "value", "budget-line"),
    "recipient-region-budget": ("recipient-region", "period-start", "period-end", "value", "budget-line"),
    "total-expenditure": ("period-start", "period-end", "value", "expense-line"),
    "document-link": ("title", "description", "category", "language", "document-date", "recipient-country"),
    "budget-line": ("value", "narrative"), "expense-line": ("value", "narrative"),
}
ATTRIBUTES = {
    "iati-organisation": ("default-currency", "xml:lang", "last-updated-datetime"),
    "reporting-org": ("ref", "type", "secondary-reporter"),
    "narrative": ("xml:lang",), "total-budget": ("status",),
    "recipient-org-budget": ("status",), "recipient-country-budget": ("status",),
    "recipient-region-budget": ("status",), "period-start": ("iso-date",),
    "period-end": ("iso-date",), "value": ("currency", "value-date"),
    "budget-line": ("ref",), "expense-line": ("ref",), "recipient-org": ("ref",),
    "recipient-country": ("code",), "recipient-region": ("code", "vocabulary", "vocabulary-uri"),
    "document-link": ("url", "format"), "category": ("code",), "language": ("code",),
    "document-date": ("iso-date",),
}
TEXT_FIELDS = {"narrative", "value"}
MAX_EDITS = 1000

def issue(row_id, code, message, severity="review", field=None):
    value = {"rowId": row_id, "code": code, "message": message, "severity": severity}
    if field is not None:
        value["field"] = field
    value["id"] = digest(json_bytes(value))
    return value

def attr_name(name):
    return XML_LANG if name == "xml:lang" else name

def narrative_rows(node, inherited=""):
    if node is None:
        return []
    return [{"text": "".join(n.texts),
             "language": n.attrs.get(XML_LANG, inherited),
             "languageRaw": n.attrs.get(XML_LANG),
             "languageSource": "narrative" if XML_LANG in n.attrs else "organisation"}
            for n in node.items("narrative")]

def only(node, name):
    values = node.items(name)
    return values[0] if len(values) == 1 else None

def scalar(node):
    return "".join(node.texts) if node is not None else None

def identity_source(raw, source_id=None):
    return checked_id(source_id) if source_id is not None else digest(raw)

class OrganisationDocument:
    """Native Expat byte spans, with stable source/path identities and no serialization."""
    def __init__(self, raw, source_id=None):
        if not isinstance(raw, bytes) or not raw or len(raw) > MAX_EDIT_SOURCE:
            raise InputError("Select complete organisation XML within the original 32 MiB correction capacity")
        try:
            raw.decode("utf-8-sig")
        except UnicodeError as error:
            raise InputError("The organisation editor requires the original XML in UTF-8") from error
        self.raw, self.source_id = raw, identity_source(raw, source_id)
        self.root, self.organisations, self.nodes, self.org_nodes = None, [], {}, {}
        p = parser()
        stack, pending_ns, counts = [], {}, {}
        node_count = 0
        def declaration(version, encoding, standalone):
            if encoding and encoding.lower().replace("-", "") not in {"utf8", "ascii"}:
                raise InputError("The organisation editor requires UTF-8 XML")
        def namespace(prefix, uri):
            pending_ns[prefix or ""] = uri or ""
        def start(name, attrs):
            nonlocal node_count
            name = expanded(name)
            if len(stack) > 64 or len(attrs) > 256 or len(name) > 2048:
                raise InputError("Organisation XML exceeds the original structural capacity")
            node_count += 1
            if node_count > 2000000:
                raise InputError("Organisation correction exceeds two million XML elements")
            parent = stack[-1] if stack else None
            parent_path = parent.path if parent else ""
            key = (parent_path, name)
            counts[key] = counts.get(key, 0) + 1
            n = Element(name, {expanded(k): v for k, v in attrs.items()},
                        p.CurrentByteIndex, tag_end(raw, p.CurrentByteIndex))
            n.path = parent_path + "/" + name + "[" + str(counts[key]) + "]"
            n.parent = parent
            n.namespaces = {**(parent.namespaces if parent else {}), **pending_ns}
            pending_ns.clear()
            n.id = digest(json_bytes({"sourceId": self.source_id, "path": n.path}))
            n.organisation_key = parent.organisation_key if parent else None
            if not stack:
                if name != "iati-organisations" or n.attrs.get("version") != "2.03":
                    raise InputError("Use an unqualified complete IATI 2.03 iati-organisations document")
                self.root = n
            elif len(stack) == 1 and name == "iati-organisation":
                n.organisation_key = n.id
                self.organisations.append(n)
                self.org_nodes[n.id] = n
            if parent:
                parent.children.append(n)
            self.nodes[n.id] = n
            stack.append(n)
        def chars(value):
            if stack:
                n = stack[-1]
                n.text_size += len(value)
                if n.text_size > 1024 * 1024:
                    raise InputError("One original organisation scalar exceeds 1 MiB")
                n.texts.append(value)
        def end(_):
            n = stack.pop()
            position = p.CurrentByteIndex
            if raw[position:position + 2] == b"</":
                n.close, n.end = position, tag_end(raw, position)
            else:
                n.close = n.end = n.opening
        p.XmlDeclHandler, p.StartNamespaceDeclHandler = declaration, namespace
        p.StartElementHandler, p.EndElementHandler, p.CharacterDataHandler = start, end, chars
        try:
            p.Parse(raw, True)
        except InputError:
            raise
        except expat.ExpatError as error:
            raise InputError("Organisation XML is not complete: " + str(error)) from error
        if self.root is None or not self.organisations:
            raise InputError("The complete source must contain at least one iati-organisation")
        self.budgets, self.documents, self.organisation_rows, self.issues = [], [], [], []
        self.rows_by_id = {}
        self._project()

    def bytes(self, node):
        return self.raw[node.start:node.end]

    def node_sha(self, node):
        return digest(self.bytes(node))

    def _base(self, node, ordinal):
        return {"id": node.id, "organisationKey": node.organisation_key, "ordinal": ordinal,
                "path": node.path, "nodeSha256": self.node_sha(node), "issues": []}

    def _value(self, node, organisation):
        values = node.items("value")
        selected = values[0] if len(values) == 1 else None
        default = organisation.attrs.get("default-currency")
        attrs = selected.attrs if selected is not None else {}
        return {"text": scalar(selected), "currency": attrs.get("currency", default),
                "currencyRaw": attrs.get("currency"), "currencySource": "value" if "currency" in attrs else
                ("organisation" if "default-currency" in organisation.attrs else "missing"),
                "valueDate": attrs.get("value-date"), "count": len(values),
                "attributes": attrs}

    def _budget(self, n, org, ordinal):
        row = self._base(n, ordinal)
        family, lang = n.name, org.attrs.get(XML_LANG, "")
        start, end = only(n, "period-start"), only(n, "period-end")
        row.update(family=family, attributes=n.attrs,
            status={"raw": n.attrs.get("status"),
                    "effective": n.attrs.get("status", "1") if family != "total-expenditure" else None,
                    "source": "explicit" if "status" in n.attrs else
                    ("default-indicative" if family != "total-expenditure" else "not-applicable")},
            period={"start": start.attrs.get("iso-date") if start else None,
                    "end": end.attrs.get("iso-date") if end else None,
                    "startCount": len(n.items("period-start")), "endCount": len(n.items("period-end"))},
            value=self._value(n, org), recipient=None, lines=[])
        recipient_name = {"recipient-org-budget": "recipient-org",
                          "recipient-country-budget": "recipient-country",
                          "recipient-region-budget": "recipient-region"}.get(family)
        if recipient_name:
            recipient = only(n, recipient_name)
            attrs = recipient.attrs if recipient else {}
            row["recipient"] = {"kind": recipient_name, "ref": attrs.get("ref"), "code": attrs.get("code"),
                "vocabulary": attrs.get("vocabulary", "1") if recipient_name == "recipient-region" else None,
                "vocabularyRaw": attrs.get("vocabulary"), "vocabularyUri": attrs.get("vocabulary-uri"),
                "narratives": narrative_rows(recipient, lang), "attributes": attrs,
                "count": len(n.items(recipient_name))}
        line_name = "expense-line" if family == "total-expenditure" else "budget-line"
        for i, line in enumerate(n.items(line_name), 1):
            row["lines"].append({"id": line.id, "kind": line_name, "ordinal": i,
                "ref": line.attrs.get("ref"), "nodeSha256": self.node_sha(line),
                "value": self._value(line, org), "narratives": narrative_rows(line, lang)})
        if row["value"]["count"] != 1:
            row["issues"].append(issue(row["id"], "value-cardinality", "A financial record requires exactly one original value", "error"))
        if row["period"]["startCount"] != 1 or row["period"]["endCount"] != 1:
            row["issues"].append(issue(row["id"], "period-cardinality", "A financial record requires one start and one end", "error"))
        if row["recipient"] and row["recipient"]["count"] != 1:
            row["issues"].append(issue(row["id"], "recipient-cardinality", "A recipient budget requires one exact recipient", "error"))
        return row

    def _document(self, n, org, ordinal):
        row = self._base(n, ordinal)
        lang = org.attrs.get(XML_LANG, "")
        row.update(url=n.attrs.get("url"), format=n.attrs.get("format"), attributes=n.attrs,
            titles=[v for x in n.items("title") for v in narrative_rows(x, lang)],
            descriptions=[v for x in n.items("description") for v in narrative_rows(x, lang)],
            categories=[x.attrs.get("code") for x in n.items("category")],
            languages=[x.attrs.get("code") for x in n.items("language")],
            documentDate=only(n, "document-date").attrs.get("iso-date") if only(n, "document-date") else None,
            recipientCountries=[{"code": x.attrs.get("code"), "narratives": narrative_rows(x, lang)}
                                for x in n.items("recipient-country")],
            accessState="NOT_CHECKED", baseUri=org.attrs.get(XML_BASE, self.root.attrs.get(XML_BASE)))
        if len(n.items("title")) != 1 or not row["titles"] or not any(x["text"].strip() for x in row["titles"]):
            row["issues"].append(issue(row["id"], "document-title", "Document links require a nonempty original title", "error"))
        if len(n.items("document-date")) > 1:
            row["issues"].append(issue(row["id"], "document-date-cardinality", "Document date is repeated", "error"))
        return row

    def _project(self):
        identifiers = {}
        for ordinal, org in enumerate(self.organisations, 1):
            lang = org.attrs.get(XML_LANG, "")
            ident_node = only(org, "organisation-identifier")
            identifier = scalar(ident_node)
            reporting = only(org, "reporting-org")
            attrs = reporting.attrs if reporting else {}
            row = self._base(org, ordinal)
            row.update(key=org.id, identifier=identifier,
                reportingOrg={"ref": attrs.get("ref"), "type": attrs.get("type"),
                    "secondaryReporter": attrs.get("secondary-reporter"),
                    "narratives": narrative_rows(reporting, lang), "attributes": attrs},
                names=[v for x in org.items("name") for v in narrative_rows(x, lang)],
                defaultCurrency=org.attrs.get("default-currency"), defaultLanguage=org.attrs.get(XML_LANG),
                attributes=org.attrs, budgetCount=sum(len(org.items(f)) for f in FAMILIES),
                documentCount=len(org.items("document-link")))
            if ident_node is None or not identifier or not identifier.strip():
                row["issues"].append(issue(row["id"], "organisation-identifier", "One nonempty original organisation identifier is required", "error"))
            elif identifier.strip() in identifiers:
                row["issues"].append(issue(row["id"], "duplicate-organisation-identifier", "The complete source repeats this organisation identifier", "error"))
                first = identifiers[identifier.strip()]
                first["issues"].append(issue(first["id"], "duplicate-organisation-identifier", "The complete source repeats this organisation identifier", "error"))
            else:
                identifiers[identifier.strip()] = row
            if len(org.items("name")) != 1 or not row["names"]:
                row["issues"].append(issue(row["id"], "organisation-name", "One organisation name with original narratives is required", "error"))
            if reporting is None or not attrs.get("ref") or not attrs.get("type"):
                row["issues"].append(issue(row["id"], "reporting-organisation", "One reporting organisation with ref and type is required", "error"))
            self.organisation_rows.append(row)
            for family in FAMILIES:
                self.budgets.extend(self._budget(n, org, i) for i, n in enumerate(org.items(family), 1))
            self.documents.extend(self._document(n, org, i) for i, n in enumerate(org.items("document-link"), 1))
        for row in self.organisation_rows + self.budgets + self.documents:
            self.rows_by_id[row["id"]] = row
            for finding in row["issues"]:
                finding["organisationKey"] = row["organisationKey"]
                self.issues.append(finding)

    def profile(self):
        return {"schema": "stellar-forge.iati-organisation-profile.v1",
                "source": {"id": self.source_id, "sha256": digest(self.raw), "bytes": len(self.raw)},
                "root": {"name": self.root.name, "attributes": self.root.attrs},
                "organisations": self.organisation_rows, "budgetCount": len(self.budgets),
                "documentCount": len(self.documents), "issues": self.issues}

    def _target(self, n, kind, attribute=None):
        record = {"sourceId": self.source_id, "organisationKey": n.organisation_key,
                  "path": n.path, "kind": kind, "attribute": attribute}
        value = {"id": digest(json_bytes(record)), "kind": kind, "path": n.path,
                 "nodeSha256": self.node_sha(n), "label": n.name + (" @" + attribute if attribute else "")}
        if kind == "element":
            value.update(beforeSha256=self.node_sha(n), allowedOperations=["replace", "append"] if n.name == "iati-organisation" else ["replace", "remove", "append"])
        elif kind == "attribute":
            key = attr_name(attribute)
            old = {"attribute": attribute, "present": key in n.attrs, "value": n.attrs.get(key)}
            value.update(beforeSha256=digest(json_bytes(old)), attribute=attribute,
                         value=old["value"], present=old["present"], allowedOperations=["attribute"])
        else:
            value.update(beforeSha256=digest(self.raw[n.opening:n.close]) if n.close != n.end else digest(b""),
                         value="".join(n.texts), allowedOperations=["text"])
        return value

    def targets(self, selected):
        result = []
        def visit(n):
            # Foreign extensions are retained byte-for-byte; only their owning native
            # budget/document can be replaced explicitly.
            if n.organisation_key is None or n.name.startswith("{"):
                return
            if n.name == "organisation-identifier":
                return
            result.append((self._target(n, "element"), n))
            for name in ATTRIBUTES.get(n.name, ()):
                result.append((self._target(n, "attribute", name), n))
            if n.name in TEXT_FIELDS and not n.children:
                result.append((self._target(n, "text"), n))
            for child in n.children:
                visit(child)
        visit(selected)
        return result

    def detail(self, row_id, target_id=None):
        checked_id(row_id)
        row = self.rows_by_id.get(row_id)
        if row is None:
            raise InputError("Select an original organisation, budget or document row")
        n = self.nodes[row_id]
        targets = self.targets(n)
        result = {"row": row, "xml": self.bytes(n).decode("utf-8"),
                  "targets": [target for target, _ in targets]}
        if target_id is not None:
            checked_id(target_id)
            selected = next(((target, node) for target, node in targets if target["id"] == target_id), None)
            if selected is None:
                raise InputError("The selected correction target is outside this exact original row")
            target, node = selected
            result["selectedTarget"] = {**target, "xml": self.bytes(node).decode("utf-8")}
        return result

    def target(self, target_id):
        checked_id(target_id)
        for org in self.organisations:
            for target, n in self.targets(org):
                if target["id"] == target_id:
                    return target, n
        raise InputError("The reviewed target is absent from this exact source revision")

def _fragment_name(raw, node):
    namespaces = dict(node.namespaces)
    declarations = "".join(" xmlns" + (":" + k if k else "") + "=" + quoteattr(v)
                           for k, v in namespaces.items() if k != "xml" and v)
    p = parser()
    depth, names, outer_text = 0, [], []
    def start(name, attrs):
        nonlocal depth
        if depth == 1:
            names.append(expanded(name))
        depth += 1
    def end(_):
        nonlocal depth
        depth -= 1
    def chars(value):
        if depth == 1:
            outer_text.append(value)
    p.StartElementHandler, p.EndElementHandler, p.CharacterDataHandler = start, end, chars
    try:
        p.Parse(("<fragment" + declarations + ">").encode() + raw + b"</fragment>", True)
    except InputError:
        raise
    except expat.ExpatError as error:
        raise InputError("Supply one complete XML element using the retained namespace context") from error
    if len(names) != 1 or "".join(outer_text).strip():
        raise InputError("Supply exactly one complete element without surrounding non-whitespace text")
    return names[0]

def apply_edits(raw, source_id, selected_keys, edits):
    if not isinstance(edits, list) or len(edits) > MAX_EDITS:
        raise InputError("Use at most 1,000 cumulative exact corrections")
    original = OrganisationDocument(raw, source_id)
    selected = set(selected_keys)
    if not selected or selected - set(original.org_nodes):
        raise InputError("Select at least one original organisation from this complete source")
    baseline_identity = [scalar(only(n, "organisation-identifier")) for n in original.organisations]
    candidate, changes = raw, []
    for ordinal, edit in enumerate(edits, 1):
        if not isinstance(edit, dict) or set(edit) - {"targetId", "beforeSha256", "operation", "value", "attribute", "xml"}:
            raise InputError("Unknown correction fields")
        current = OrganisationDocument(candidate, source_id)
        target, n = current.target(edit.get("targetId"))
        if n.organisation_key not in selected:
            raise InputError("A correction targets an unselected organisation")
        if target["beforeSha256"] != edit.get("beforeSha256"):
            raise InputError("The exact reviewed field changed; reopen its candidate detail")
        operation = edit.get("operation")
        if operation not in target["allowedOperations"]:
            raise InputError("This target does not support the selected correction")
        if operation == "attribute":
            if "value" not in edit or "xml" in edit or edit.get("attribute", target["attribute"]) != target["attribute"]:
                raise InputError("Bind the exact selected attribute and its explicit value")
            name, value = target["attribute"], edit["value"]
            if value is None:
                opening = candidate[n.start:n.opening]
                tokens = [(a, b) for token, a, b, quote in opening_attributes(opening) if token == name.encode("ascii")]
                if not tokens:
                    start = end = n.opening
                    replacement = b""
                else:
                    a, b = tokens[0]
                    # Include the attribute name, equals sign and its two quotes.
                    token_start = opening.rfind(name.encode("ascii"), 0, a)
                    start, end, replacement = n.start + token_start, n.start + b + 1, b""
            else:
                text(value, "Corrected attribute", 16000, True)
                start, end, replacement = attribute_patch(candidate, n, name, value)
        elif operation == "text":
            if "value" not in edit or set(edit) & {"xml", "attribute"}:
                raise InputError("Bind an explicit corrected scalar text")
            value = text(edit["value"], "Corrected scalar", 1024 * 1024, True)
            if n.close == n.end:
                # Expand only this original self-closing element.
                opening = candidate[n.start:n.opening]
                lexical = re.match(br"<([^\s/>]+)", opening).group(1)
                start, end = n.opening - 2, n.opening
                replacement = b">" + escape(value).encode() + b"</" + lexical + b">"
            else:
                start, end, replacement = n.opening, n.close, escape(value).encode()
        elif operation == "remove":
            if set(edit) & {"value", "attribute", "xml"}:
                raise InputError("An element removal has no replacement body")
            start, end, replacement = n.start, n.end, b""
        else:
            if set(edit) & {"value", "attribute"}:
                raise InputError("An XML correction uses only its exact XML body")
            fragment = text(edit.get("xml"), "Complete corrected element", MAX_EDIT_SOURCE).encode()
            fragment_name = _fragment_name(fragment, n)
            if operation == "replace":
                if fragment_name != n.name:
                    raise InputError("A replacement preserves the selected element family; remove and append explicitly to change it")
                start, end, replacement = n.start, n.end, fragment
            else:
                if n.name == "iati-organisation" and fragment_name not in set(FAMILIES) | {"document-link", "name", "reporting-org"}:
                    raise InputError("Append an original organisation budget, expenditure, document, name or reporting-org element")
                if n.close == n.end:
                    opening = candidate[n.start:n.opening]
                    lexical = re.match(br"<([^\s/>]+)", opening).group(1)
                    start, end = n.opening - 2, n.opening
                    replacement = b">" + fragment + b"</" + lexical + b">"
                else:
                    order = ORDERS.get(n.name, ())
                    later = [c.start for c in n.children if fragment_name in order and c.name in order and
                             order.index(c.name) > order.index(fragment_name)]
                    start = end = min(later) if later else n.close
                    replacement = fragment
        revised = candidate[:start] + replacement + candidate[end:]
        after = OrganisationDocument(revised, source_id)
        if [scalar(only(n, "organisation-identifier")) for n in after.organisations] != baseline_identity:
            raise InputError("Corrections preserve every original organisation identifier and its order")
        if set(after.org_nodes) != set(original.org_nodes):
            raise InputError("A correction changed the original organisation selection")
        for key, node in current.org_nodes.items():
            if key not in selected and current.bytes(node) != after.bytes(after.org_nodes[key]):
                raise InputError("A correction changed an unselected organisation")
        changes.append({"ordinal": ordinal, "targetId": edit["targetId"], "operation": operation,
            "organisationKey": n.organisation_key, "path": n.path,
            "beforeSha256": digest(candidate[start:end]), "afterSha256": digest(replacement),
            "beforeBytes": end-start, "afterBytes": len(replacement),
            "candidateBeforeSha256": digest(candidate), "candidateAfterSha256": digest(revised)})
        candidate = revised
    return candidate, changes

def organisation_inventory(stream, cancel=None):
    chunks, size = [], 0
    while block := stream.read(65536):
        if cancel and cancel():
            raise InputError("Organisation source inventory was cancelled")
        size += len(block)
        if size > MAX_EDIT_SOURCE:
            raise InputError("Organisation source exceeds 32 MiB")
        chunks.append(block)
    document = OrganisationDocument(b"".join(chunks))
    profile = document.profile()
    return {"schema": "stellar-forge.iati-organisation-inventory.v1", "kind": "organisation",
            "standard": "2.03", "source": {"attributes": document.root.attrs, "version": "2.03", "bytes": size},
            "counts": {"organisations": len(document.organisations), "budgets": len(document.budgets),
                       "documents": len(document.documents), "reviewIssues": len(document.issues)},
            "organisations": profile["organisations"],
            "sourceIssues": document.issues,
            "semantics": "Five separate original budget/expenditure families; exact financial strings and complete source custody"}

def source_inventory(stream, cancel=None):
    """Minimal IATI_FORMAT hook; source retention and activity projection are unchanged."""
    from iati_source import inventory as activity_inventory
    try:
        position = stream.tell()
    except (AttributeError, OSError) as error:
        raise InputError("Use the original retained seekable source intake") from error
    selected = []
    class RootFound(Exception):
        pass
    p = parser()
    def start(name, attrs):
        selected.append(expanded(name))
        raise RootFound()
    p.StartElementHandler = start
    try:
        parse_stream(p, stream, cancel)
    except RootFound:
        pass
    finally:
        stream.seek(position)
    if selected == ["iati-organisations"]:
        return organisation_inventory(stream, cancel)
    if selected == ["iati-activities"]:
        return activity_inventory(stream, cancel)
    raise InputError("Use a complete IATI activity or organisation publisher document")
