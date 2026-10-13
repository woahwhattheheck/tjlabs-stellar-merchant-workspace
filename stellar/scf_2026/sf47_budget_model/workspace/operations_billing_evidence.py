"""Original customer billing evidence: immutable review editions, no financial writes.

Source-native milestone, expense and Work journals stay authoritative. Reviews
freeze a selected service-period explanation and the original native account
observation; later compare reads never rewrite a delivered edition.
"""
from __future__ import annotations
import base64
import copy
import hashlib
import io
import json
import re
import stat
import uuid
import zipfile
from html import escape
from model import Problem, canonical, digest, now, short_id, csv_bytes
from operations_commercial_receivables import _date, _required

SCHEMA = "stellar-forge.sf47-billing-evidence.v1"
EDITION = SCHEMA + ".edition"
BUNDLE = SCHEMA + ".bundle"
ID = re.compile(r"billing-evidence-[a-f0-9]{32}")
SOURCE = re.compile(r"(billing-evidence-[a-f0-9]{32})-r([1-9][0-9]*)\.zip")
MAX_SOURCE = 8 * 1024 * 1024
MAX_BUNDLE = 64 * 1024 * 1024
MAX_MEMBERS = 1600

def fail(message, code="BILLING_EVIDENCE_INVALID", status=422):
    raise Problem(message, status, code)

def exact(value, allowed, required=()):
    if not isinstance(value, dict) or set(value) - set(allowed) or set(required) - set(value):
        fail("Use the complete billing evidence fields.")

def identity(value):
    if not isinstance(value, dict) or any(not re.fullmatch(r"[a-f0-9]{64}", value.get(k, "")) for k in ("workspaceId", "sourcesSha256")):
        fail("Retain the original native accounting identity.")
    return {k: value[k] for k in ("workspaceId", "sourcesSha256")}

def account_key(binding, customer):
    return digest({"accountingIdentity": identity(binding), "customerId": customer})

def raw_json(value):
    return (canonical(value) + "\n").encode("utf-8")

def decoded(value, maximum=MAX_BUNDLE):
    if not isinstance(value, str) or len(value) > (maximum * 4 // 3) + 8:
        fail("The complete evidence file exceeds its original bound.", status=413)
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as exc:
        raise Problem("The original evidence bytes are unreadable.", 422, "BILLING_EVIDENCE_BYTES") from exc
    if len(raw) > maximum:
        fail("The complete evidence file exceeds its original bound.", status=413)
    return raw

def pack(files, schema, extra=None):
    if len(files) >= MAX_MEMBERS or sum(map(len, files.values())) > MAX_BUNDLE:
        fail("The complete evidence exceeds 64 MiB or its member bound.", status=413)
    manifest = {"schema": schema, **(extra or {}), "files": [
        {"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        for path, raw in sorted(files.items())]}
    files = {**files, "MANIFEST.json": raw_json(manifest)}
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path, raw in sorted(files.items()):
            info = zipfile.ZipInfo(path, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, raw)
    result = out.getvalue()
    if len(result) > MAX_BUNDLE:
        fail("The complete evidence ZIP exceeds 64 MiB.", status=413)
    return result

def unpack(raw, expected=None):
    if not isinstance(raw, bytes) or len(raw) > MAX_BUNDLE:
        fail("Choose the complete original evidence ZIP within 64 MiB.", status=413)
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist()
            names = [x.filename for x in infos]
            if len(names) != len(set(names)) or len(names) > MAX_MEMBERS or sum(x.file_size for x in infos) > MAX_BUNDLE:
                fail("The evidence ZIP has duplicate or excessive members.")
            for item in infos:
                path = item.filename
                if (not path or path.startswith("/") or "\\" in path or any(p in ("", ".", "..") for p in path.split("/"))
                        or any(ord(c) < 32 for c in path) or item.flag_bits & 1 or item.is_dir()
                        or stat.S_ISLNK(item.external_attr >> 16)):
                    fail("The evidence ZIP must retain safe, ordinary original members.")
            if archive.getinfo("MANIFEST.json").file_size > 1024 * 1024:
                fail("The evidence inventory exceeds its bound.")
            manifest = json.loads(archive.read("MANIFEST.json"))
            if expected is not None and manifest.get("schema") != expected:
                fail("This is another kind of original evidence package.")
            rows = manifest.get("files")
            if (not isinstance(rows, list) or len(rows) != len(names) - 1
                    or {r["path"] for r in rows} != set(names) - {"MANIFEST.json"}):
                fail("The evidence inventory must name every original member once.")
            files = {}
            for row in rows:
                content = archive.read(row["path"])
                if len(content) != row["bytes"] or hashlib.sha256(content).hexdigest() != row["sha256"]:
                    fail("An evidence member differs from its original bytes.")
                files[row["path"]] = content
            return manifest, files
    except Problem:
        raise
    except (ValueError, TypeError, KeyError, RuntimeError, zipfile.BadZipFile, UnicodeError) as exc:
        raise Problem("The complete evidence ZIP is unreadable.", 422, "BILLING_EVIDENCE_ARCHIVE") from exc

def journals(document):
    return {"commercial": document.get("commercialReceivables") or {"prepared": [], "obligations": [], "intents": []},
            "changes": document.get("commercialChanges") or {"items": []},
            "expense": document.get("expenseBilling") or {"items": []},
            "work": document.get("workBilling") or {"items": [], "authorities": []}}

def invoice_ids(original):
    ids = set()
    for row in original.get("rows", []) + original.get("changes", []):
        ids.update(v for v in (row.get("activeInvoiceId"), row.get("proposal", {}).get("invoiceId")) if v)
        for command in row.get("commands", []):
            if command.get("state") == "ACKNOWLEDGED":
                result = (command.get("result") or {}).get("operation", {}).get("result", {})
                if result.get("invoiceId"):
                    ids.add(result["invoiceId"])
    if original.get("obligation", {}).get("invoiceId"):
        ids.add(original["obligation"]["invoiceId"])
    for command in original.get("intents", []):
        if command.get("state") == "ACKNOWLEDGED":
            native = command.get("native") or {}
            invoice_id = native.get("invoice", {}).get("id") or native.get("operation", {}).get("result", {}).get("invoiceId")
            if invoice_id:
                ids.add(invoice_id)
    return sorted(ids)

def source_lines(original, domain):
    if domain == "MILESTONE":
        p = next((p for p in original["prepared"] if p["id"] == original["obligation"]["preparedId"]), original["prepared"][-1])
        m = next(x for x in p["milestones"] if x["obligationKey"] == original["obligation"]["obligationKey"])
        return [{"description": m.get("label", ""), "amount": m["amount"], "sourceId": m["milestoneId"]}]
    active = [r for r in original["rows"] if r["state"] != "CANCELLED"]
    selected = (active or original["rows"])[-1]
    result = []
    for line in selected["proposal"]["lines"]:
        item = {"description": line["description"], "amount": line["amount"]}
        if domain == "WORK":
            item.update({"sourceId": line["work"]["id"], "hours": line["hours"],
                         "startDate": line["work"]["startDate"], "endDate": line["work"]["endDate"]})
        else:
            item["sourceId"] = line["attribution"]["id"]
        result.append(item)
    return result

def build_catalog(data):
    entries = []
    for domain, member in (("WORK", "work"), ("EXPENSE", "expense")):
        groups = {}
        for row in data[member]["items"]:
            groups.setdefault(row["chainId"], []).append(copy.deepcopy(row))
        for chain, rows in sorted(groups.items()):
            rows.sort(key=lambda r: r["sequence"])
            active = [r for r in rows if r["state"] != "CANCELLED"]
            head = (active or rows)[-1]
            p = head["proposal"]
            original = {"rows": rows}
            if domain == "WORK":
                families = {r["proposal"]["authority"]["familyId"] for r in rows}
                original["authorities"] = [copy.deepcopy(a) for a in data["work"].get("authorities", []) if a["familyId"] in families]
            lines = source_lines(original, domain)
            entries.append({"key": domain.lower() + ":" + chain, "domain": domain, "chainId": chain,
                "accountKey": account_key(p["accountingIdentity"], p["customerId"]), "endpointId": p["endpointId"],
                "accountingIdentity": identity(p["accountingIdentity"]), "customerId": p["customerId"],
                "customerName": p["customer"]["name"], "title": p["authority"]["terms"]["title"] if domain == "WORK" else "Customer expense recovery",
                "currency": p["currency"], "preparedAmount": rows[0]["proposal"]["amount"], "currentAmount": p["amount"],
                "invoiceIds": invoice_ids(original), "pending": any(c["state"] == "PENDING" for r in rows for c in r["commands"]),
                "sourcePeriods": [{"startDate": x["startDate"], "endDate": x["endDate"], "label": x["sourceId"]} for x in lines if "startDate" in x],
                "chainSha256": digest(original), "historyCount": len(rows), "original": original, "sourceLines": lines})
    commercial = data["commercial"]
    for obligation in commercial.get("obligations", []):
        key = obligation["obligationKey"]
        prepared = [copy.deepcopy(p) for p in commercial.get("prepared", []) if any(m["obligationKey"] == key for m in p["milestones"])]
        if not prepared:
            fail("A milestone obligation has lost its original preparation.")
        prepared.sort(key=lambda p: (p["createdAt"], p["id"]))
        p = next((p for p in prepared if p["id"] == obligation["preparedId"]), prepared[-1])
        m = next(m for m in p["milestones"] if m["obligationKey"] == key)
        changes = [copy.deepcopy(c) for c in data["changes"]["items"] if c["obligationKey"] == key]
        changes.sort(key=lambda c: c["sequence"])
        intents = [copy.deepcopy(c) for c in commercial.get("intents", []) if c["obligationKey"] == key]
        original = {"prepared": prepared, "obligation": copy.deepcopy(obligation), "intents": intents, "changes": changes}
        active = [c for c in changes if c["state"] != "CANCELLED"]
        entries.append({"key": "milestone:" + key, "domain": "MILESTONE", "chainId": key,
            "accountKey": account_key(p["accountingIdentity"], p["customerId"]), "endpointId": p["endpointId"],
            "accountingIdentity": identity(p["accountingIdentity"]), "customerId": p["customerId"],
            "customerName": p["nativeCustomer"].get("name") or p["schedule"]["customer"], "title": m["label"],
            "currency": p["schedule"]["currency"], "preparedAmount": m["amount"],
            "currentAmount": active[-1]["proposal"]["targetAmount"] if active else m["amount"],
            "invoiceIds": invoice_ids(original), "pending": any(c["state"] == "PENDING" for c in intents)
                or any(c["state"] == "PENDING" for r in changes for c in r["commands"]),
            "sourcePeriods": [], "chainSha256": digest(original), "historyCount": len(prepared) + len(changes),
            "original": original, "sourceLines": source_lines(original, "MILESTONE")})
    return sorted(entries, key=lambda x: (x["accountKey"], x["domain"], x["key"]))

def summary(item):
    return {k: copy.deepcopy(v) for k, v in item.items() if k not in ("original", "sourceLines")}

def period_status(item, start, end):
    periods = item["sourcePeriods"]
    if not periods:
        return "UNKNOWN"
    if all(p["startDate"] >= start and p["endDate"] <= end for p in periods):
        return "WITHIN"
    if all(p["endDate"] < start or p["startDate"] > end for p in periods):
        return "OUTSIDE"
    return "OVERLAP"

def normalize(body):
    exact(body, ("expectedVersion", "reviewId", "expectedRevision", "selection", "requestId", "actor", "expectedPreviewSha256"),
          ("expectedVersion", "expectedRevision", "selection"))
    if type(body["expectedVersion"]) is not int or body["expectedVersion"] < 1 or type(body["expectedRevision"]) is not int or body["expectedRevision"] < 0:
        fail("Choose the original case and saved review revisions.")
    review_id = body.get("reviewId")
    if (review_id is not None and (not isinstance(review_id, str) or not ID.fullmatch(review_id))) or bool(review_id) != bool(body["expectedRevision"]):
        fail("A successor must name its exact saved review and revision.")
    s = body["selection"]
    keys = ("title", "accountKey", "endpointId", "customerId", "periodStart", "periodEnd", "asOf", "explanation", "items")
    exact(s, keys, keys)
    selection = {k: _required(s[k], k, 12000 if k == "explanation" else 300) for k in ("title", "accountKey", "endpointId", "customerId", "explanation")}
    for key in ("periodStart", "periodEnd", "asOf"):
        selection[key] = _date(s[key], key)
    if selection["periodStart"] > selection["periodEnd"]:
        fail("The service period end must follow its start.")
    if not re.fullmatch(r"[a-f0-9]{64}", selection["accountKey"]):
        fail("Select the original native customer identity.")
    if not isinstance(s["items"], list) or not 1 <= len(s["items"]) <= 100:
        fail("Select one to 100 original billing chains.")
    selection["items"] = []
    for item in s["items"]:
        fields = ("key", "expectedChainSha256", "basis", "reason", "customerExplanation", "shareDescriptions", "shareQuantities")
        exact(item, fields, fields)
        if item["basis"] not in ("SOURCE_DATES", "REVIEWED_INCLUSION") or any(type(item[k]) is not bool for k in ("shareDescriptions", "shareQuantities")):
            fail("Choose the service-period basis and explicit customer disclosure.")
        if not re.fullmatch(r"[a-f0-9]{64}", item["expectedChainSha256"]):
            fail("Select the exact original billing history.")
        value = {k: item[k] for k in fields}
        value["key"] = _required(item["key"], "Original billing chain", 200)
        value["reason"] = _required(item["reason"], "Period inclusion reason", 3000) if item["basis"] == "REVIEWED_INCLUSION" else str(item["reason"] or "")
        value["customerExplanation"] = _required(item["customerExplanation"], "Customer-facing explanation", 6000)
        selection["items"].append(value)
    if len({x["key"] for x in selection["items"]}) != len(selection["items"]):
        fail("Select each original correction chain once.")
    return {"expectedVersion": body["expectedVersion"], "reviewId": review_id,
            "expectedRevision": body["expectedRevision"], "selection": selection}

def selected_rows(catalog, selection):
    indexed = {x["key"]: x for x in catalog}
    rows = []
    for chosen in selection["items"]:
        item = indexed.get(chosen["key"])
        if not item or item["accountKey"] != selection["accountKey"] or item["customerId"] != selection["customerId"]:
            fail("A selected source is absent or belongs to another original customer.")
        if item["chainSha256"] != chosen["expectedChainSha256"]:
            fail("A selected original billing history changed; refresh and review it.", "BILLING_EVIDENCE_STALE", 409)
        status = period_status(item, selection["periodStart"], selection["periodEnd"])
        if chosen["basis"] == "SOURCE_DATES" and status != "WITHIN":
            fail("Unknown, overlapping or outside source dates require an explicit reviewed inclusion reason.")
        rows.append({**copy.deepcopy(item), **copy.deepcopy(chosen), "periodStatus": status})
    return rows

def customer_report(preview, record):
    rows = []
    for item in preview["items"]:
        rows.append({"key": item["key"], "domain": item["domain"], "title": {"MILESTONE": "Milestone billing", "EXPENSE": "Expense recovery", "WORK": "Hourly Work"}[item["domain"]],
            "explanation": item["customerExplanation"], "periodBasis": item["basis"], "periodStatus": item["periodStatus"],
            "invoiceIds": item["invoiceIds"], "currency": item["currency"],
            "preparedAmount": item["preparedAmount"], "reviewedAmount": item["currentAmount"],
            "pending": item["pending"], "native": [{"id": d["invoice"]["id"], "status": d["invoice"]["status"],
                "issueDate": d["draft"].get("issueDate"), "evidenceAfterAccountAsOf": d["draft"].get("issueDate", "") > preview["selection"]["asOf"], "currency": d["draft"]["currency"],
                **{k: d["invoice"].get(k) for k in ("total", "paid", "credited", "amountDue", "creditBalance")},
                "creditIds": [c["id"] for c in d.get("credits", [])],
                "documentPath": "native/documents/" + hashlib.sha256(d["invoice"]["id"].encode()).hexdigest() + "/invoice.html" if d.get("document") else None,
                "credits": [{"id": c["id"], "documentPath": "native/documents/" + hashlib.sha256(c["id"].encode()).hexdigest() + "/credit.html"} for c in d.get("credits", [])]} for d in item["native"]],
            "lines": [{**({"description": line["description"]} if item["shareDescriptions"] else {}),
                       **({k: line[k] for k in ("hours", "startDate", "endDate") if k in line} if item["shareQuantities"] else {})}
                      for line in item["sourceLines"]] if item["shareDescriptions"] or item["shareQuantities"] else []})
    s = preview["selection"]
    return {"schema": SCHEMA + ".customer", "id": record["id"], "revision": record["revision"],
        "recordedAt": record["recordedAt"], "title": s["title"], "customer": {k: preview["customer"][k] for k in ("id", "name")},
        "accountingIdentity": preview["accountingIdentity"], "periodStart": s["periodStart"], "periodEnd": s["periodEnd"],
        "accountAsOf": s["asOf"], "nativeObservation": {"revision": preview["nativeRevision"], "recordedAt": record["recordedAt"],
            "basis": "Linked invoice balances were observed at this saved native revision; they are not an as-of recalculation. The unchanged account archive alone uses accountAsOf."},
        "explanation": s["explanation"], "items": rows,
        "nativeInvoiceIdsOutsideSelection": preview["nativeInvoiceIdsOutsideSelection"],
        "interpretation": "Disclosure choices apply only to supplemental source explanations; unchanged issued native documents keep their original descriptions and quantities. An explicitly selected service-period explanation. Prepared and reviewed amounts are terms, not added invoice balances. Native invoices, credits and payments remain in the unchanged original account. Account as-of and service period are separate. Other customer invoices are outside this evidence selection."}

def report_csv(report):
    rows = []
    for item in report["items"]:
        rows.append({"domain": item["domain"], "chain": item["key"], "title": item["title"],
            "period_start": report["periodStart"], "period_end": report["periodEnd"], "account_as_of": report["accountAsOf"],
            "period_basis": item["periodBasis"], "period_status": item["periodStatus"], "explanation": item["explanation"],
            "currency": item["currency"]["code"], "prepared_amount": item["preparedAmount"], "reviewed_amount": item["reviewedAmount"],
            "invoice_ids": "; ".join(item["invoiceIds"]), "pending_original_request": str(item["pending"]).lower()})
    return csv_bytes(list(rows[0]) if rows else [], rows)

def report_html(report):
    e = lambda v: escape(str(v if v is not None else ""))
    blocks = []
    for item in report["items"]:
        native = "".join("<li>Observed at save: " + ('<a href="' + e(d["documentPath"]) + '">' + e(d["id"]) + "</a>" if d["documentPath"] else e(d["id"])) + " · " + e(d["status"]) + " · paid " + e(d.get("paid"))
                         + " · credited " + e(d.get("credited")) + " · amount due " + e(d.get("amountDue")) + (" · later-dated evidence; excluded from earlier account as-of" if d["evidenceAfterAccountAsOf"] else "") +
                         "".join(' · <a href="' + e(c["documentPath"]) + '">Credit ' + e(c["id"]) + "</a>" for c in d["credits"]) + "</li>" for d in item["native"])
        lines = "".join("<li>" + e(" · ".join(str(v) for v in line.values())) + "</li>" for line in item["lines"])
        blocks.append("<section><h2>" + e(item["title"]) + "</h2><p>" + e(item["domain"]) + " · " + e(item["periodStatus"]) +
            "</p><p>" + e(item["explanation"]) + "</p><p>Original prepared terms: " + e(item["preparedAmount"]) + " " +
            e(item["currency"]["code"]) + ". Latest reviewed terms: " + e(item["reviewedAmount"]) +
            ". These terms are not additional invoice totals.</p><ul>" + native + "</ul><ul>" + lines + "</ul>" +
            ("<p><strong>An original billing request is still pending.</strong></p>" if item["pending"] else "") + "</section>")
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>' + e(report["title"]) + '</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fff;color:#222;font:16px/1.5 system-ui;padding:24px;max-width:1000px}h1,h2,p,li,a{overflow-wrap:anywhere}section{border-top:1px solid #aaa;margin-top:24px;padding-top:16px}a{color:#222}h1{font-size:28px}h2{font-size:21px}li{margin-bottom:8px}@media(max-width:500px){body{padding:16px}}</style>'
        '<h1>' + e(report["title"]) + '</h1><p>' + e(report["customer"]["name"]) + '</p><p>Service period ' +
        e(report["periodStart"]) + ' to ' + e(report["periodEnd"]) + ' · Account as of ' + e(report["accountAsOf"]) +
        '</p><p>Linked invoice balances observed at native revision ' + e(report["nativeObservation"]["revision"]) + ' on ' + e(report["nativeObservation"]["recordedAt"]) + '. These are not the account-as-of totals.</p><p>Saved review ' + e(report["revision"]) + ' · ' + e(report["recordedAt"]) + '</p><p>' + e(report["explanation"]) +
        '</p><p>' + e(report["interpretation"]) + '</p>' + "".join(blocks) +
        '<section><h2>Original files</h2><p><a href="report.csv">Editable explanation CSV</a> · <a href="report.json">Complete selected explanation</a> · <a href="native-customer-account.tar">Original customer account</a></p><p>Linked invoice and credit documents are listed in native/linked-documents.json. Keep the complete folder together.</p></section></html>').encode()

def command_prefix(old, current, milestone=False):
    stable = ("id", "action", "intentSha256", "payload", "review", "accountingIdentity", "createdAt") if milestone else (
        "index", "action", "body", "requestId", "intentSha256", "review", "createdAt")
    if any(old.get(k) != current.get(k) for k in stable):
        fail("A frozen evidence command differs from its original native request.", "BILLING_EVIDENCE_HISTORY")
    if old["state"] == "ACKNOWLEDGED":
        key = "native" if milestone else "result"
        if current["state"] != "ACKNOWLEDGED" or old.get(key) != current.get(key):
            fail("A frozen evidence acknowledgement was omitted or changed.", "BILLING_EVIDENCE_HISTORY")

def rows_prefix(old, current):
    if [r["id"] for r in old] != [r["id"] for r in current[:len(old)]]:
        fail("The frozen charge must retain the complete ordered original prefix.", "BILLING_EVIDENCE_HISTORY")
    if [r["sequence"] for r in old] != list(range(1, len(old) + 1)):
        fail("The frozen charge omitted an original correction edition.", "BILLING_EVIDENCE_HISTORY")
    indexed = {r["id"]: r for r in current}
    for row in old:
        found = indexed.get(row["id"])
        if not found or any(row.get(k) != found.get(k) for k in ("schema", "chainId", "obligationKey", "sequence", "createdAt", "proposal", "proposalSha256", "preparationRequest")):
            fail("A saved evidence review has lost its exact original charge.", "BILLING_EVIDENCE_HISTORY")
        if len(row["commands"]) > len(found["commands"]):
            fail("A saved evidence review has lost original native requests.", "BILLING_EVIDENCE_HISTORY")
        for a, b in zip(row["commands"], found["commands"]):
            command_prefix(a, b)
        if any(x not in found["history"] for x in row["history"]):
            fail("A saved evidence review has lost original charge history.", "BILLING_EVIDENCE_HISTORY")
        if row["state"] in ("APPLIED", "CANCELLED") and row["state"] != found["state"]:
            fail("A completed original billing observation changed.", "BILLING_EVIDENCE_HISTORY")

def original_prefix(old, current, domain):
    if domain != "MILESTONE":
        rows_prefix(old["rows"], current["rows"])
        if domain == "WORK":
            indexed = {a["id"]: a for a in current["authorities"]}
            for family in {a["familyId"] for a in old["authorities"]}:
                captured = sorted((a for a in old["authorities"] if a["familyId"] == family), key=lambda a: a["revision"])
                if [a["revision"] for a in captured] != list(range(1, len(captured) + 1)):
                    fail("The hourly authority omitted an original terms edition.", "BILLING_EVIDENCE_HISTORY")
            if any(indexed.get(a["id"]) != a for a in old["authorities"]):
                fail("The frozen hourly authority is missing or changed.", "BILLING_EVIDENCE_HISTORY")
        return
    if [p["id"] for p in old["prepared"]] != [p["id"] for p in current["prepared"][:len(old["prepared"])]]:
        fail("The frozen milestone preparation history is incomplete.", "BILLING_EVIDENCE_HISTORY")
    indexed = {p["id"]: p for p in current["prepared"]}
    if any(indexed.get(p["id"]) != p for p in old["prepared"]):
        fail("The frozen original milestone preparation changed.", "BILLING_EVIDENCE_HISTORY")
    left, right = old["obligation"], current["obligation"]
    if left.get("specificationHistory", []) != right.get("specificationHistory", [])[:len(left.get("specificationHistory", []))]:
        fail("The frozen milestone specification history changed.", "BILLING_EVIDENCE_HISTORY")
    history = {x["specificationSha256"]: x["specification"] for x in right.get("specificationHistory", [])}
    history[right["specificationSha256"]] = right["specification"]
    if history.get(left["specificationSha256"]) != left["specification"] or left["obligationKey"] != right["obligationKey"]:
        fail("The frozen milestone obligation is no longer retained.", "BILLING_EVIDENCE_HISTORY")
    if left.get("invoiceId") and left["invoiceId"] != right.get("invoiceId"):
        fail("The original milestone native invoice changed.", "BILLING_EVIDENCE_HISTORY")
    current_intents = {x["id"]: x for x in current["intents"]}
    for intent in old["intents"]:
        if intent["id"] not in current_intents:
            fail("The original milestone request is missing.", "BILLING_EVIDENCE_HISTORY")
        command_prefix(intent, current_intents[intent["id"]], True)
    rows_prefix(old["changes"], current["changes"])

def validate_preview(value):
    if not isinstance(value, dict) or value.get("schema") != SCHEMA + ".preview":
        fail("Retain the complete original billing evidence preview.")
    if digest({k: v for k, v in value.items() if k != "previewSha256"}) != value.get("previewSha256"):
        fail("The saved evidence preview differs from its retained identity.")
    body = normalize({k: value[k] for k in ("expectedVersion", "reviewId", "expectedRevision", "selection")})
    if body["selection"] != value["selection"]:
        fail("The saved evidence selection is not normalized.")
    if not isinstance(value["items"], list) or len(value["items"]) != len(body["selection"]["items"]):
        fail("The frozen source selection is incomplete.")
    originals = []
    for item in value["items"]:
        if digest(item["original"]) != item["chainSha256"]:
            fail("A frozen source journal differs from its retained identity.")
        if item["domain"] in ("WORK", "EXPENSE"):
            data = {"commercial": {"prepared": [], "obligations": [], "intents": []}, "changes": {"items": []},
                    "expense": {"items": []}, "work": {"items": [], "authorities": []}}
            data["work" if item["domain"] == "WORK" else "expense"] = {
                "items": item["original"]["rows"], "authorities": item["original"].get("authorities", [])}
        elif item["domain"] == "MILESTONE":
            o = item["original"]
            data = {"commercial": {"prepared": o["prepared"], "obligations": [o["obligation"]], "intents": o["intents"]},
                "changes": {"items": o["changes"]}, "expense": {"items": []}, "work": {"items": [], "authorities": []}}
        else:
            fail("The frozen review has an unknown source domain.")
        rebuilt = build_catalog(data)
        if len(rebuilt) != 1:
            fail("Retain each complete original billing chain once.")
        originals.extend(rebuilt)
    rebuilt = selected_rows(originals, body["selection"])
    for old, derived in zip(value["items"], rebuilt):
        if old.get("history") != old["original"].get("rows", old["original"].get("changes", [])):
            fail("The displayed original history differs from its frozen source.")
        if any(old.get(k) != v for k, v in derived.items()):
            fail("The frozen evidence description differs from its original source journal.")
        if old["accountingIdentity"] != value["accountingIdentity"] or old["customerId"] != value["customer"]["id"]:
            fail("A frozen evidence chain belongs to another native customer.")
        if sorted(d["invoice"]["id"] for d in old["native"]) != old["invoiceIds"]:
            fail("The linked native invoice observation is incomplete.")
        for detail in old["native"]:
            if detail["invoice"]["customerId"] != value["customer"]["id"] or detail["draft"]["currency"] != old["currency"]:
                fail("A linked original invoice has another customer or currency.")
    if value["accountAsOf"] != value["selection"]["asOf"]:
        fail("Keep the native account observation date separate and exact.")
    return value

def native_files_expected(preview):
    expected, links = {}, []
    for item in preview["items"]:
        for detail in item["native"]:
            invoice_id = detail["invoice"]["id"]
            records = ([{"id": invoice_id, "files": detail["files"]}] if detail.get("document") else []) + detail.get("credits", [])
            for record in records:
                names = ("credit.json", "credit.csv", "credit.html", "manifest.json") if "document" in record else (
                    "invoice.json", "invoice.csv", "invoice.html", "manifest.json")
                folder = "native/documents/" + hashlib.sha256(record["id"].encode()).hexdigest() + "/"
                if folder + names[0] in expected:
                    continue
                for name in names:
                    expected[folder + name] = record["files"][name]
                links.append({"invoiceId": invoice_id, "documentId": record["id"], "directory": folder})
    return expected, links

def inspect_edition(raw):
    _, files = unpack(raw, EDITION)
    try:
        record = json.loads(files["review.json"])
        if record["schema"] != EDITION or not ID.fullmatch(record["id"]) or type(record["revision"]) is not int or record["revision"] < 1:
            fail("The original evidence edition identity is invalid.")
        preview = validate_preview(record["preview"])
        if (record["fromVersion"] != preview["expectedVersion"] or record["version"] != record["fromVersion"] + 1
                or record["revision"] != preview["expectedRevision"] + 1
                or preview["reviewId"] not in (None, record["id"])):
            fail("The original evidence edition has a different reviewed revision.")
        report = customer_report(preview, record)
        expected, links = native_files_expected(preview)
        required = {"review.json", "report.json", "report.html", "report.csv", "native-customer-account.tar", "native/linked-documents.json"} | set(expected)
        if set(files) != required or files["review.json"] != raw_json(record) or files["report.json"] != raw_json(report):
            fail("The saved evidence has an incomplete or changed original projection.")
        if files["report.html"] != report_html(report) or files["report.csv"] != report_csv(report) or files["native/linked-documents.json"] != raw_json(links):
            fail("The readable saved evidence differs from the exact selected explanation.")
        account = files["native-customer-account.tar"]
        if len(account) != record["accountArchive"]["bytes"] or hashlib.sha256(account).hexdigest() != record["accountArchive"]["sha256"]:
            fail("The original customer account bytes changed.")
        for path, metadata in expected.items():
            raw_file = files[path]
            if len(raw_file) != metadata["bytes"] or hashlib.sha256(raw_file).hexdigest() != metadata["sha256"]:
                fail("A linked immutable native document changed.")
        return record, report, files
    except Problem:
        raise
    except (ValueError, TypeError, KeyError, AttributeError) as exc:
        raise Problem("The full original evidence edition is incomplete.", 422, "BILLING_EVIDENCE_EDITION") from exc

def validate_import(document, files):
    """Join every immutable review to its original source event and journal prefix."""
    sources = document["sources"]
    sources = list(sources.values()) if isinstance(sources, dict) else sources
    candidates = [s for s in sources if SOURCE.fullmatch(s.get("filename", ""))]
    if not candidates:
        return []
    current = {x["key"]: x for x in build_catalog(journals(document))}
    event_map = {e["version"]: e for e in document["events"]}
    editions = []
    for metadata in candidates:
        if metadata["mediaType"] != "application/zip":
            fail("An evidence source has a different original media type.")
        raw = files["sources/" + metadata["id"]]
        record, report, _ = inspect_edition(raw)
        if metadata["filename"] != record["id"] + "-r" + str(record["revision"]) + ".zip":
            fail("The saved evidence filename names another original edition.")
        event = event_map.get(record["version"])
        if (not event or event["action"] != "source.add" or event["recordId"] != metadata["id"]
                or event["after"] != metadata or event.get("before") is not None
                or event["requestId"] != record["requestId"] or event["actor"] != record["recordedBy"]
                or metadata["observedAt"] != record["recordedAt"]):
            fail("A saved evidence edition has lost its exact original request and source event.", "BILLING_EVIDENCE_HISTORY")
        for old in record["preview"]["items"]:
            found = current.get(old["key"])
            if not found:
                fail("A saved evidence chain was omitted from the original case.", "BILLING_EVIDENCE_HISTORY")
            original_prefix(old["original"], found["original"], old["domain"])
        editions.append({"source": copy.deepcopy(metadata), "record": record, "report": report})
    editions.sort(key=lambda e: e["record"]["version"])
    heads, requests = {}, set()
    for edition in editions:
        r = edition["record"]
        prior = heads.get(r["id"])
        if (r["revision"] != (prior["record"]["revision"] + 1 if prior else 1)
                or r["parentSourceId"] != (prior["source"]["id"] if prior else None)
                or r["parentSourceSha256"] != (prior["source"]["sha256"] if prior else None)
                or r["preview"]["reviewId"] != (r["id"] if prior else None)
                or r["requestId"] in requests):
            fail("Keep the complete ordered evidence editions and original request history.", "BILLING_EVIDENCE_HISTORY")
        if prior and r["fromVersion"] < prior["record"]["version"]:
            fail("A successor evidence edition predates its original parent.")
        heads[r["id"]] = edition
        requests.add(r["requestId"])
    return editions

class BillingEvidence:
    def __init__(self, operations):
        self.operations = operations
        self.workspace = operations.workspace
        self.billing = operations.commercial

    def _local(self, program_id):
        context = self.operations._context(program_id)
        events = [json.loads(r[0]) for r in self.operations.db.execute(
            "SELECT body_json FROM ops_events WHERE program_id=? ORDER BY version", (program_id,))]
        document = {**context, "sources": list(context["sources"].values()), "events": events,
            "commercialReceivables": self.billing.export_rows(program_id),
            "commercialChanges": self.operations.commercial_changes.export_rows(program_id),
            "expenseBilling": self.operations.expense_billing.export_rows(program_id),
            "workBilling": self.operations.work_billing.export_rows(program_id)}
        files = {"sources/" + s["id"]: self.operations.source(program_id, s["id"])[1]
            for s in document["sources"] if SOURCE.fullmatch(s.get("filename", ""))}
        return document, build_catalog(journals(document)), validate_import(document, files), files

    @staticmethod
    def _head(editions, ident, revision=None):
        matches = [e for e in editions if e["record"]["id"] == ident and (revision is None or e["record"]["revision"] == revision)]
        if not matches:
            fail("The original saved billing evidence was not found.", "BILLING_EVIDENCE_NOT_FOUND", 404)
        return matches[-1]

    @staticmethod
    def _revision(editions, body):
        if body["reviewId"] is None:
            return None
        previous = BillingEvidence._head(editions, body["reviewId"])
        if previous["record"]["revision"] != body["expectedRevision"]:
            fail("A newer saved evidence edition exists. Reopen its current edition.", "BILLING_EVIDENCE_STALE", 409)
        return previous

    def catalog(self, program_id):
        with self.operations._snapshot():
            document, catalog, editions, _ = self._local(program_id)
            accounts = {}
            for item in catalog:
                accounts.setdefault(item["accountKey"], {k: copy.deepcopy(item[k]) for k in (
                    "accountKey", "endpointId", "accountingIdentity", "customerId", "customerName")})
            return {"schema": SCHEMA, "programId": program_id, "version": document["program"]["version"],
                "mode": document["program"]["mode"], "accounts": list(accounts.values()),
                "items": [summary(x) for x in catalog], "reviews": [
                    {"id": e["record"]["id"], "revision": e["record"]["revision"], "sourceId": e["source"]["id"],
                     "sourceSha256": e["source"]["sha256"], "version": e["record"]["version"],
                     "recordedAt": e["record"]["recordedAt"], "recordedBy": e["record"]["recordedBy"],
                     "title": e["report"]["title"], "customerName": e["report"]["customer"]["name"],
                     "periodStart": e["report"]["periodStart"], "periodEnd": e["report"]["periodEnd"],
                     "asOf": e["report"]["accountAsOf"]} for e in editions]}

    def _native(self, selection, binding, action, body):
        actual = self.billing._identity(selection["endpointId"])
        self.billing._assert_identity(binding, actual)
        return self.billing._native(action, {"endpointId": selection["endpointId"], **body})

    def preview(self, program_id, body):
        selected = normalize(body)
        with self.operations._snapshot():
            document, catalog, editions, _ = self._local(program_id)
            if document["program"]["version"] != selected["expectedVersion"]:
                fail("Refresh the original case before reviewing its billing evidence.", "VERSION_CONFLICT", 409)
            self._revision(editions, selected)
            rows = selected_rows(catalog, selected["selection"])
            binding = rows[0]["accountingIdentity"]
            local_sha = digest({"version": document["program"]["version"], "catalog": catalog})
        s = selected["selection"]
        state = self._native(s, binding, "list", {})
        state = state.get("state", state)
        customer = next((x for x in state["customers"] if x["id"] == s["customerId"]), None)
        if customer is None:
            fail("The original native customer is unavailable.", "BILLING_EVIDENCE_CUSTOMER", 409)
        details = {}
        for invoice_id in sorted({i for row in rows for i in row["invoiceIds"]}):
            detail = self._native(s, binding, "detail", {"invoiceId": invoice_id})
            if detail["invoice"]["customerId"] != s["customerId"]:
                fail("A linked invoice belongs to another original customer.")
            details[invoice_id] = detail
        if self._native(s, binding, "customers", {})["revision"] != state["revision"]:
            fail("The native account changed during review. Refresh its original observation.", "BILLING_EVIDENCE_STALE", 409)
        with self.operations._snapshot():
            latest, current, _, _ = self._local(program_id)
            if digest({"version": latest["program"]["version"], "catalog": current}) != local_sha:
                fail("The original billing history changed during review.", "BILLING_EVIDENCE_STALE", 409)
        for row in rows:
            row["native"] = [copy.deepcopy(details[i]) for i in row["invoiceIds"]]
            row["history"] = copy.deepcopy(row["original"].get("rows", row["original"].get("changes", [])))
        known = set(details)
        invoices = state.get("invoices", [])
        if not isinstance(invoices, list):
            fail("The native account's current invoice population is unreadable.", status=502)
        result = {"schema": SCHEMA + ".preview", **selected, "customer": copy.deepcopy(customer),
            "accountingIdentity": binding, "nativeRevision": state["revision"], "items": rows,
            "unselected": [summary(x) for x in catalog if x["accountKey"] == s["accountKey"] and x["key"] not in {r["key"] for r in rows}],
            "nativeInvoiceIdsOutsideSelection": sorted(i["id"] for i in invoices if i["customerId"] == s["customerId"] and i["id"] not in known),
            "accountAsOf": s["asOf"], "localCatalogSha256": local_sha}
        result["previewSha256"] = digest(result)
        return result

    def _capture(self, preview):
        selection, binding = preview["selection"], preview["accountingIdentity"]
        if self._native(selection, binding, "customers", {})["revision"] != preview["nativeRevision"]:
            fail("The original account changed after preview.", "BILLING_EVIDENCE_STALE", 409)
        account = self._native(selection, binding, "export", {"customerId": selection["customerId"], "asOf": selection["asOf"]})
        if account.get("mediaType") != "application/x-tar":
            fail("Retain the actual original native customer account archive.", status=502)
        files = {"native-customer-account.tar": decoded(account["contentBase64"])}
        expected, links = native_files_expected(preview)
        for link in links:
            prefix = link["directory"]
            for path, metadata in expected.items():
                if not path.startswith(prefix):
                    continue
                response = self._native(selection, binding, "document", {"invoiceId": link["documentId"], "name": path[len(prefix):]})
                raw = decoded(response["contentBase64"])
                if len(raw) != metadata["bytes"] or hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
                    fail("The actual linked native document changed.", status=502)
                files[path] = raw
        if self._native(selection, binding, "customers", {})["revision"] != preview["nativeRevision"]:
            fail("The native account changed during evidence capture.", "BILLING_EVIDENCE_STALE", 409)
        files["native/linked-documents.json"] = raw_json(links)
        return files

    def save(self, program_id, body):
        selected = normalize(body)
        request_id = short_id(body.get("requestId"), "Original evidence request")
        actor = _required(body.get("actor"), "Recording operator", 300)
        payload = {"domain": EDITION, "programId": program_id, "body": body}
        with self.workspace.mutex:
            prior = self.operations.db.execute("SELECT fingerprint,result_json FROM requests WHERE request_id=?", (request_id,)).fetchone()
            if prior:
                if prior[0] != digest(payload):
                    fail("This original request belongs to another exact evidence selection.", "REQUEST_CONFLICT", 409)
                return json.loads(prior[1])
        preview = self.preview(program_id, body)
        if preview["previewSha256"] != body.get("expectedPreviewSha256"):
            fail("Review the exact original sources and current native observation before saving.", "BILLING_EVIDENCE_STALE", 409)
        captured = self._capture(preview)
        def action():
            document, catalog, editions, _ = self._local(program_id)
            if document["program"]["state"] != "OPEN":
                fail("Reopen the original case before saving an evidence edition.", status=409)
            if digest({"version": document["program"]["version"], "catalog": catalog}) != preview["localCatalogSha256"]:
                fail("The local billing histories changed after the reviewed observation.", "BILLING_EVIDENCE_STALE", 409)
            if any(e["record"]["requestId"] == request_id for e in editions):
                fail("Use a new request for a copied case's successor edition.", "REQUEST_CONFLICT", 409)
            parent = self._revision(editions, selected)
            ident = selected["reviewId"] or "billing-evidence-" + uuid.uuid4().hex
            record = {"schema": EDITION, "id": ident, "revision": selected["expectedRevision"] + 1,
                "caseId": program_id, "fromVersion": selected["expectedVersion"], "version": selected["expectedVersion"] + 1,
                "parentSourceId": parent["source"]["id"] if parent else None,
                "parentSourceSha256": parent["source"]["sha256"] if parent else None,
                "recordedAt": now(), "recordedBy": actor, "requestId": request_id, "preview": preview,
                "accountArchive": {"bytes": len(captured["native-customer-account.tar"]),
                    "sha256": hashlib.sha256(captured["native-customer-account.tar"]).hexdigest()}}
            report = customer_report(preview, record)
            files = {**captured, "review.json": raw_json(record), "report.json": raw_json(report),
                     "report.html": report_html(report), "report.csv": report_csv(report)}
            raw = pack(files, EDITION)
            if len(raw) > MAX_SOURCE:
                fail("This complete frozen evidence exceeds the case's 8 MiB source bound. Select fewer chains or use the existing full native account handover.", status=413)
            inspect_edition(raw)
            result = self.operations.command(program_id, {"action": "source.add", "requestId": request_id,
                "actor": actor, "expectedVersion": selected["expectedVersion"], "note": selected["selection"]["title"],
                "data": {"filename": ident + "-r" + str(record["revision"]) + ".zip", "kind": "other",
                         "mediaType": "application/zip", "observedAt": record["recordedAt"],
                         "contentBase64": base64.b64encode(raw).decode()}}, _within_transaction=True)
            metadata, _ = self.operations.source(program_id, result["recordId"])
            return {"reviewId": ident, "revision": record["revision"], "sourceId": metadata["id"],
                "sourceSha256": metadata["sha256"], "version": result["version"], "requestId": request_id}
        return self.workspace._transaction(request_id, payload, action)

    def get(self, program_id, ident, revision=None):
        with self.operations._snapshot():
            _, _, editions, _ = self._local(program_id)
            return {"schema": SCHEMA, **copy.deepcopy(self._head(editions, ident, revision))}

    def compare(self, program_id, ident, revision=None):
        saved = self.get(program_id, ident, revision)["record"]
        with self.operations._snapshot():
            document, catalog, editions, _ = self._local(program_id)
            head = self._head(editions, ident)["record"]
        selected = copy.deepcopy(saved["preview"]["selection"])
        current = {r["key"]: r for r in catalog}
        for item in selected["items"]:
            if item["key"] not in current:
                fail("The saved source chain is unavailable in the current case.", "BILLING_EVIDENCE_SOURCE_UNAVAILABLE", 409)
            item["expectedChainSha256"] = current[item["key"]]["chainSha256"]
            if item["basis"] == "SOURCE_DATES" and period_status(current[item["key"]], selected["periodStart"], selected["periodEnd"]) != "WITHIN":
                return {"saved": {"id": ident, "revision": saved["revision"]}, "changed": True, "currentPreview": None,
                    "reason": "A selected source period changed. Review explicit inclusion before a successor.",
                    "currentItems": [summary(current[x["key"]]) for x in selected["items"]]}
        preview = self.preview(program_id, {"expectedVersion": document["program"]["version"], "reviewId": ident,
            "expectedRevision": head["revision"], "selection": selected})
        old = saved["preview"]
        changed = any(old[k] != preview[k] for k in ("items", "unselected", "nativeRevision", "nativeInvoiceIdsOutsideSelection", "customer"))
        return {"saved": {"id": ident, "revision": saved["revision"]}, "currentPreview": preview, "changed": changed}

    def export_bundle(self, program_id, ident, revision=None, audience="internal"):
        if audience not in ("internal", "customer"):
            fail("Choose the private complete case or selected customer explanation.")
        with self.operations._snapshot():
            _, _, editions, source_files = self._local(program_id)
            selected = self._head(editions, ident, revision)
            frozen = source_files["sources/" + selected["source"]["id"]]
            record, report, original = inspect_edition(frozen)
            files = {k: raw for k, raw in original.items() if k != "review.json"}
            if audience == "internal":
                files["operations.zip"] = self.operations.export(program_id)
                files["frozen-evidence.zip"] = frozen
                files["selection.json"] = raw_json({"source": selected["source"], "id": ident, "revision": record["revision"]})
            files["README.txt"] = (("PRIVATE COMPLETE BILLING EVIDENCE\n" if audience == "internal" else "SELECTED CUSTOMER BILLING EVIDENCE\n") +
                "Open report.html and the actual native documents in this complete folder. The original account as-of and selected service period are distinct. "
                "Prepared/reviewed terms are not additional invoice totals. Full billing histories and private source terms are included only in the internal case export. "
                "The customer package is an immutable explanation, not a native account backup or a financial command. "
                + ("Receive operations.zip or this complete wrapper through Grant Operations to continue the retained original case and evidence history. "
                   if audience == "internal" else "Use Billing evidence > Inspect handover to reopen this selected explanation without changing any case. ") +
                "The producing operator must LOOK at the exact outgoing desktop and phone render, all linked invoice/credit HTML, every report/attachment and usable ZIP contents, and operate the controls/download/reopen in the original receiving course.\n").encode()
            raw = pack(files, BUNDLE, {"audience": audience, "reviewId": ident, "revision": record["revision"]})
        return {"filename": ident + "-r" + str(record["revision"]) + "-" + audience + ".zip", "mediaType": "application/zip",
                "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "contentBase64": base64.b64encode(raw).decode()}

    @staticmethod
    def inspect_bundle(raw):
        return inspect_bundle(raw)

def inspect_bundle(raw):
    manifest, files = unpack(raw, BUNDLE)
    audience = manifest.get("audience")
    if audience not in ("internal", "customer"):
        fail("This evidence package has no explicit disclosure audience.")
    try:
        report = json.loads(files["report.json"])
        if report.get("schema") != SCHEMA + ".customer" or report["id"] != manifest["reviewId"] or report["revision"] != manifest["revision"]:
            fail("The readable evidence identifies another saved review.")
        if files["report.html"] != report_html(report) or files["report.csv"] != report_csv(report):
            fail("The readable handover differs from its selected explanation.")
        common = {"report.json", "report.html", "report.csv", "native-customer-account.tar", "native/linked-documents.json", "README.txt"}
        links = json.loads(files["native/linked-documents.json"])
        document_paths = {path for path in files if path.startswith("native/documents/")}
        if any(not re.fullmatch(r"native/documents/[a-f0-9]{64}/(?:invoice|credit)\.(?:json|csv|html)|native/documents/[a-f0-9]{64}/manifest\.json", p) for p in document_paths):
            fail("The linked document set contains an unexpected path.")
        if audience == "customer":
            if set(files) != common | document_paths:
                fail("The customer handover contains undeclared private content.")
            expected_documents = set()
            for link in links:
                prefix = "native/documents/" + hashlib.sha256(link["documentId"].encode()).hexdigest() + "/"
                if link["directory"] != prefix:
                    fail("A customer document link identifies another native file.")
                matches = [n for n in ("invoice", "credit") if prefix + n + ".json" in files]
                if len(matches) != 1:
                    fail("A linked native document is missing or ambiguous.")
                expected_documents.update(prefix + n for n in (matches[0] + ".json", matches[0] + ".csv", matches[0] + ".html", "manifest.json"))
            if expected_documents != document_paths:
                fail("The original linked native documents are incomplete.")
            return {"audience": audience, "report": report, "reviewId": report["id"], "revision": report["revision"]}
        if set(files) != common | document_paths | {"operations.zip", "frozen-evidence.zip", "selection.json"}:
            fail("The complete private evidence source set is not exact.")
        record, frozen_report, frozen_files = inspect_edition(files["frozen-evidence.zip"])
        if frozen_report != report or any(files.get(k) != v for k, v in frozen_files.items() if k != "review.json"):
            fail("The exported original observation changed from the saved edition.")
        from operations import Operations
        document, originals = Operations._unpack(files["operations.zip"])
        editions = validate_import(document, originals)
        selection = json.loads(files["selection.json"])
        chosen = next((e for e in editions if e["record"]["id"] == report["id"] and e["record"]["revision"] == report["revision"]), None)
        if not chosen or chosen["source"] != selection["source"] or chosen["record"] != record or originals["sources/" + chosen["source"]["id"]] != files["frozen-evidence.zip"]:
            fail("The whole case does not retain this exact selected evidence edition.")
        return {"audience": audience, "report": report, "reviewId": report["id"], "revision": report["revision"],
                "operationsBytes": files["operations.zip"]}
    except Problem:
        raise
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise Problem("The complete billing evidence handover is unreadable.", 422, "BILLING_EVIDENCE_RECEIVING") from exc

def unwrap_bundle(raw):
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            if "MANIFEST.json" not in archive.namelist() or archive.getinfo("MANIFEST.json").file_size > 1024 * 1024:
                return raw, None
            manifest = json.loads(archive.read("MANIFEST.json"))
            if manifest.get("schema") != BUNDLE:
                return raw, None
    except (ValueError, KeyError, TypeError, zipfile.BadZipFile):
        return raw, None
    result = inspect_bundle(raw)
    if result["audience"] != "internal":
        fail("This is a customer explanation. Inspect it in Billing evidence; receive the private complete case to continue Operations.")
    return result["operationsBytes"], {"reviewId": result["reviewId"], "revision": result["revision"]}
