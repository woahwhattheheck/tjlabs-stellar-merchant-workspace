"""MIT. Byte-preserving IATI participant corrections on complete original XML."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date
import calendar
import hashlib
import io
import re
from urllib.parse import urlsplit
from xml.sax.saxutils import escape, quoteattr

from iati_source import InputError, inventory
from xml_source import parser, expanded

MAX_EDIT_SOURCE = 32 * 1024 * 1024
MAX_PATCHES = 1000
DOCUMENT_CATEGORIES = {f"A{i:02d}" for i in range(1, 13)} | {f"B{i:02d}" for i in range(1, 19)}
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def text(value, name, limit=16000, empty=False):
    if not isinstance(value, str) or len(value) > limit or (not empty and not value.strip()):
        raise InputError(f"{name} must be {'0' if empty else '1'} to {limit} characters")
    if any(ord(c) < 32 and c not in "\t\n\r" for c in value):
        raise InputError(f"{name} contains an XML control character")
    return value

def url(value):
    text(value, "Document URL", 8000)
    p = urlsplit(value)
    if p.scheme not in {"http", "https"} or not p.hostname or p.username or p.password:
        raise InputError("Use a complete public HTTP or HTTPS document URL")
    return value

def language(value):
    text(value, "Narrative language", 80, empty=True)
    if value and not re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", value):
        raise InputError("Use a language tag, such as en or fr, or the inherited default")
    return value

def day(value):
    try:
        d = date.fromisoformat(value)
        if d.isoformat() != value:
            raise ValueError()
        return d
    except (TypeError, ValueError) as error:
        raise InputError("Use an exact YYYY-MM-DD cutoff or document date") from error

def months_before(value, count):
    d = day(value)
    index = d.year * 12 + d.month - 1 - count
    year, month = divmod(index, 12)
    return date(year, month + 1, min(d.day, calendar.monthrange(year, month + 1)[1]))

def tag_end(raw, start):
    quote = None
    for position in range(start, len(raw)):
        byte = raw[position]
        if quote is not None:
            if byte == quote:
                quote = None
        elif byte in (34, 39):
            quote = byte
        elif byte == 62:
            return position + 1
    raise InputError("Incomplete XML tag")

@dataclass
class Element:
    name: str
    attrs: dict
    start: int
    opening: int
    close: int = 0
    end: int = 0
    children: list = field(default_factory=list)
    texts: list = field(default_factory=list)
    retained: bool = True
    text_size: int = 0

    def items(self, name):
        return [x for x in self.children if x.name == name]

    def value(self):
        return "".join(self.texts).strip()

class Publisher:
    """Retain exact byte spans; ignored financial subtrees are never rewritten."""
    def __init__(self, raw):
        if not isinstance(raw, bytes) or not raw or len(raw) > MAX_EDIT_SOURCE:
            raise InputError("Select one complete publisher XML within the 32 MiB correction capacity")
        try:
            raw.decode("utf-8-sig")
        except UnicodeError as error:
            raise InputError("The correction editor accepts UTF-8 publisher XML; retain other encodings through source intake") from error
        self.raw, self.activities, self.root = raw, [], None
        self.ids = {}
        p = parser()
        stack = []
        count = 0
        def declaration(version, encoding, standalone):
            if encoding and encoding.lower().replace("-", "") not in {"utf8", "ascii"}:
                raise InputError("Keep correction input in UTF-8")
        def start(name, attrs):
            nonlocal count
            name = expanded(name)
            depth = len(stack)
            if depth > 64 or len(attrs) > 256:
                raise InputError("Publisher XML exceeds the original structural capacity")
            count += 1
            if count > 2000000:
                raise InputError("Publisher correction exceeds two million XML elements")
            keep = depth <= 2 or (len(stack) >= 3 and stack[2].name in {
                "iati-identifier", "reporting-org", "title", "description", "participating-org",
                "activity-status", "activity-date", "document-link"})
            n = Element(name, {expanded(k): v for k, v in attrs.items()},
                        p.CurrentByteIndex, tag_end(raw, p.CurrentByteIndex), retained=keep)
            if depth == 0:
                self.root = n
                if name != "iati-activities" or n.attrs.get("version") != "2.03":
                    raise InputError("Participant corrections require an unqualified complete IATI 2.03 activity document")
            if stack and keep and stack[-1].retained:
                stack[-1].children.append(n)
            stack.append(n)
        def chars(value):
            if stack and stack[-1].retained and stack[-1].name in {"narrative", "iati-identifier"}:
                stack[-1].text_size += len(value)
                if stack[-1].text_size > 1024 * 1024:
                    raise InputError("One editable narrative exceeds 1 MiB")
                stack[-1].texts.append(value)
        def end(name):
            n = stack.pop()
            position = p.CurrentByteIndex
            if raw[position:position + 2] == b"</":
                n.close, n.end = position, tag_end(raw, position)
            else:
                n.close = n.end = n.opening
            if len(stack) == 1 and n.name == "iati-activity":
                identifiers = n.items("iati-identifier")
                if len(identifiers) != 1 or not identifiers[0].value():
                    raise InputError("Each editable activity requires one original IATI identifier")
                ident = identifiers[0].value()
                if ident in self.ids:
                    raise InputError("A repeated activity identifier requires source reconciliation before editing")
                self.ids[ident] = n
                self.activities.append(n)
        p.XmlDeclHandler = declaration
        p.StartElementHandler, p.EndElementHandler, p.CharacterDataHandler = start, end, chars
        try:
            p.Parse(raw, True)
        except InputError:
            raise
        except Exception as error:
            raise InputError("The complete publisher XML could not be parsed") from error
        if not self.root or not self.activities:
            raise InputError("Select a complete publisher containing activities")

    def bytes(self, n):
        return self.raw[n.start:n.end]

    def identity(self, n):
        return sha(self.bytes(n))

    def activity(self, ident):
        try:
            return self.ids[ident]
        except (KeyError, TypeError) as error:
            raise InputError("Select one exact activity from this retained source") from error

    def fields(self, ident):
        a = self.activity(ident)
        fields = []
        for name in ("title", "description", "participating-org", "document-link"):
            for index, node in enumerate(a.items(name)):
                container = node
                if name == "document-link":
                    titles = node.items("title")
                    container = titles[0] if len(titles) == 1 else None
                fields.append({
                    "field": name, "index": index, "sha256": self.identity(node), "attributes": node.attrs,
                    "narratives": [] if container is None else [
                        {"index": i, "sha256": self.identity(n), "language": n.attrs.get(XML_LANG, ""),
                         "text": n.value()} for i, n in enumerate(container.items("narrative"))],
                    "categories": [x.attrs.get("code", "") for x in node.items("category")],
                })
        return {"activityId": ident, "activitySha256": self.identity(a), "attributes": a.attrs, "fields": fields}

    def rows(self, publisher_ref="", cutoff=None):
        for ident, a in self.ids.items():
            reporting = a.items("reporting-org")
            ref = reporting[0].attrs.get("ref", "") if len(reporting) == 1 else ""
            if publisher_ref and ref != publisher_ref:
                continue
            title = a.items("title")
            narratives = title[0].items("narrative") if title else []
            status = a.items("activity-status")
            dates = {n.attrs.get("type", ""): n.attrs.get("iso-date", "") for n in a.items("activity-date")}
            yield {"activityId": ident, "title": " | ".join(n.value() for n in narratives),
                   "reportingOrgRef": ref, "hierarchy": a.attrs.get("hierarchy", ""),
                   "status": status[0].attrs.get("code", "") if status else "",
                   "dates": dates, "documents": len(a.items("document-link")),
                   "sha256": self.identity(a)}

def opening_attributes(opening):
    """Yield only actual name/value tokens, never attribute-looking quoted text."""
    whitespace = b" \t\r\n"
    position = 1
    size = len(opening)
    while position < size and opening[position] not in whitespace + b"/>":
        position += 1
    while position < size:
        while position < size and opening[position] in whitespace:
            position += 1
        if opening[position:] in (b">", b"/>"):
            return
        beginning = position
        while position < size and opening[position] not in whitespace + b"=/>":
            position += 1
        name = opening[beginning:position]
        while position < size and opening[position] in whitespace:
            position += 1
        if not name or position >= size or opening[position] != 61:
            raise InputError("Cannot identify an original XML attribute boundary")
        position += 1
        while position < size and opening[position] in whitespace:
            position += 1
        if position >= size or opening[position] not in (34, 39):
            raise InputError("Cannot identify an original XML attribute quote")
        quote = opening[position:position + 1]
        beginning = position + 1
        ending = opening.find(quote, beginning)
        if ending < 0:
            raise InputError("Incomplete original XML attribute")
        yield name, beginning, ending, quote
        position = ending + 1
    raise InputError("Incomplete original XML opening tag")

def attribute_patch(raw, n, key, value):
    """Change one unqualified attribute while retaining every other original byte."""
    opening = raw[n.start:n.opening]
    found = [(beginning, ending, quote) for name, beginning, ending, quote in opening_attributes(opening)
             if name == key.encode("ascii")]
    if len(found) > 1:
        raise InputError("Repeated editable XML attribute")
    if found:
        beginning, ending, original_quote = found[0]
        quote = original_quote.decode("ascii")
        encoded = escape(value, {quote: "&quot;" if quote == '"' else "&apos;"}).encode()
        return n.start + beginning, n.start + ending, encoded
    position = n.opening - (2 if opening.endswith(b"/>") else 1)
    return position, position, (" " + key + "=" + quoteattr(value)).encode()

def _selected_node(publisher, patch, allowed):
    a = publisher.activity(text(patch.get("activityId"), "Activity identifier", 1000))
    name = patch.get("field")
    index = patch.get("index")
    if name not in allowed or type(index) is not int or index < 0:
        raise InputError("Select the original field and its zero-based index")
    fields = a.items(name)
    if index >= len(fields):
        raise InputError("The selected original field is absent")
    node = fields[index]
    if patch.get("expectedSha256") != publisher.identity(node):
        raise InputError("The selected field changed; reopen its original source before correcting")
    return a, node

def prepare_corrections(raw, patches, publisher_ref):
    if not isinstance(patches, list) or not 1 <= len(patches) <= MAX_PATCHES:
        raise InputError("Supply 1 to 1000 complete, non-overlapping corrections")
    p = Publisher(raw)
    changes, summaries = [], []
    for patch in patches:
        if not isinstance(patch, dict):
            raise InputError("Every correction must be an object")
        kind = patch.get("kind")
        if kind == "narrative":
            allowed = {"kind","activityId","field","index","expectedSha256","narrativeIndex","expectedNarrativeSha256","text","language"}
            if set(patch) - allowed:
                raise InputError("Unknown narrative correction field")
            a, n = _selected_node(p, patch, {"title","description","participating-org","document-link"})
            container = n
            if n.name == "document-link":
                titles = n.items("title")
                if len(titles) != 1:
                    raise InputError("This document needs an original single title before narrative correction")
                container = titles[0]
            body = text(patch.get("text"), "Corrected narrative", 16000)
            lang = language(patch.get("language", ""))
            ni = patch.get("narrativeIndex")
            if ni is None:
                if patch.get("expectedNarrativeSha256") is not None:
                    raise InputError("A new narrative has no earlier narrative identity")
                if any(x.attrs.get(XML_LANG, "") == lang for x in container.items("narrative")):
                    raise InputError("This language already exists; select and review that exact narrative")
                if container.close == container.end:
                    raise InputError("Expand an empty parent through original publisher intake before adding a narrative")
                payload = ("<narrative" + (" xml:lang=" + quoteattr(lang) if lang else "") + ">" + escape(body) + "</narrative>").encode()
                changes.append((container.close, container.close, payload))
            else:
                children = container.items("narrative")
                if type(ni) is not int or ni < 0 or ni >= len(children):
                    raise InputError("Select the original narrative index")
                selected = children[ni]
                if patch.get("expectedNarrativeSha256") != p.identity(selected):
                    raise InputError("The original narrative identity differs")
                if selected.children or selected.close == selected.end:
                    raise InputError("Select a complete plain-text narrative")
                if selected.attrs.get(XML_LANG, "") != lang:
                    raise InputError("A correction preserves its original language; add a distinct narrative for a translation")
                changes.append((selected.opening, selected.close, escape(body).encode()))
            label = f"{n.name} narrative"
        elif kind in {"organisation-reference", "document-attributes"}:
            allowed = {"kind","activityId","field","index","expectedSha256","ref"} if kind == "organisation-reference" else {"kind","activityId","field","index","expectedSha256","url","format"}
            if set(patch) - allowed:
                raise InputError("Unknown attribute correction field")
            a, n = _selected_node(p, patch, {"participating-org"} if kind == "organisation-reference" else {"document-link"})
            if kind == "organisation-reference":
                value = text(patch.get("ref"), "Publisher-approved organisation reference", 1000)
                if any(c.isspace() for c in value):
                    raise InputError("An organisation reference cannot contain whitespace")
                changes.append(attribute_patch(raw, n, "ref", value))
            else:
                if "url" not in patch and "format" not in patch:
                    raise InputError("Select at least one document attribute")
                attribute_changes = []
                if "url" in patch:
                    attribute_changes.append(attribute_patch(raw, n, "url", url(patch["url"])))
                if "format" in patch:
                    value = text(patch["format"], "Document MIME type", 200)
                    if not re.fullmatch(r"[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+", value):
                        raise InputError("Use a document MIME type")
                    attribute_changes.append(attribute_patch(raw, n, "format", value))
                inserts = {}
                for beginning, ending, payload in attribute_changes:
                    if beginning == ending:
                        inserts[beginning] = inserts.get(beginning, b"") + payload
                    else:
                        changes.append((beginning, ending, payload))
                changes.extend((position, position, payload) for position, payload in inserts.items())
            label = kind
        elif kind == "add-document":
            if set(patch) - {"kind","activityId","expectedSha256","url","format","title","language","categories","documentDate"}:
                raise InputError("Unknown new document field")
            a = p.activity(text(patch.get("activityId"), "Activity identifier", 1000))
            if patch.get("expectedSha256") != p.identity(a):
                raise InputError("The selected whole activity changed")
            address = url(patch.get("url"))
            mime = text(patch.get("format"), "Document MIME type", 200)
            if not re.fullmatch(r"[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+", mime):
                raise InputError("Use a document MIME type")
            title = text(patch.get("title"), "Document title", 16000)
            lang = language(patch.get("language", ""))
            categories = patch.get("categories")
            if not isinstance(categories,list) or not categories or len(categories)>35 or len(set(categories))!=len(categories) or any(not isinstance(c,str) or c not in DOCUMENT_CATEGORIES for c in categories):
                raise InputError("Select distinct original document-category codes")
            when = patch.get("documentDate","")
            if when: day(when)
            if any(n.attrs.get("url")==address for n in a.items("document-link")):
                raise InputError("This document URL already exists in the activity")
            payload = "<document-link url="+quoteattr(address)+" format="+quoteattr(mime)+"><title><narrative"+(" xml:lang="+quoteattr(lang) if lang else "")+">"+escape(title)+"</narrative></title>"
            payload += "".join("<category code="+quoteattr(c)+"/>" for c in categories)
            if lang: payload += "<language code="+quoteattr(lang)+"/>"
            if when: payload += "<document-date iso-date="+quoteattr(when)+"/>"
            payload += "</document-link>"
            later = [n.start for n in a.children if n.name in {"related-activity","legacy-data","conditions","result","crs-add","fss"}]
            position = min(later) if later else a.close
            changes.append((position,position,payload.encode()))
            label = "new document link"
        else:
            raise InputError("Select narrative, organisation-reference, document-attributes or add-document")
        reporting = a.items("reporting-org")
        if len(reporting)!=1 or reporting[0].attrs.get("ref")!=publisher_ref:
            raise InputError("Every correction must belong to the selected original reporting organisation")
        summaries.append({"activityId":patch["activityId"],"kind":kind,"label":label,"input":patch})
    changes.sort(key=lambda item:(item[0],item[1]))
    previous_end, previous_start = -1, -1
    pieces, unchanged, audit = [], [], []
    cursor = 0
    for start,end,value in changes:
        if start<previous_end or start==previous_start:
            raise InputError("Corrections overlap; review separate source revisions")
        pieces.extend((raw[cursor:start],value))
        unchanged.append(raw[cursor:start])
        audit.append({"start":start,"end":end,"beforeSha256":sha(raw[start:end]),
                      "afterSha256":sha(value),"beforeBytes":end-start,"afterBytes":len(value)})
        cursor,previous_start,previous_end=end,start,end
    pieces.append(raw[cursor:]);unchanged.append(raw[cursor:])
    candidate=b"".join(pieces)
    if len(candidate)>MAX_EDIT_SOURCE:
        raise InputError("Corrected source exceeds the 32 MiB correction capacity")
    after=Publisher(candidate)
    if list(p.ids)!=list(after.ids):
        raise InputError("A correction changed the original activity identity/order")
    for ident in p.ids:
        before_ref=[n.attrs for n in p.ids[ident].items("reporting-org")]
        after_ref=[n.attrs for n in after.ids[ident].items("reporting-org")]
        if before_ref!=after_ref or p.ids[ident].attrs!=after.ids[ident].attrs:
            raise InputError("A correction changed original reporting or activity attributes")
    before_shape=inventory(io.BytesIO(raw))
    after_shape=inventory(io.BytesIO(candidate))
    for key in ("financialGroups","currencies"):
        if before_shape[key]!=after_shape[key]:
            raise InputError("A content correction changed financial interpretation")
    for key in ("activities","transactions","budgets","plannedDisbursements"):
        if before_shape["counts"][key]!=after_shape["counts"][key]:
            raise InputError("A content correction changed the original record census")
    return candidate,{"schema":"stellar-forge.iati-participant-correction.v1",
        "sourceSha256":sha(raw),"candidateSha256":sha(candidate),
        "sourceBytes":len(raw),"candidateBytes":len(candidate),
        "unchangedBytes":sum(map(len,unchanged)),"unchangedSha256":sha(b"".join(unchanged)),
        "patches":summaries,"byteChanges":audit,"financialGroupsUnchanged":True,
        "recordCensusUnchanged":True,"candidateInventory":after_shape}
