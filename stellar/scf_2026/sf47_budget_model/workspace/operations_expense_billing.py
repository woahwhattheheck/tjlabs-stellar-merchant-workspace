"""Reviewed customer recovery of original issued buyer expense portions.

This domain records the customer's source-backed charge decision. Original Buyer
Expenses owns cost attribution; the running native Receivables service owns every
invoice, credit, allocation and payment. No accounting source is opened here.
"""
from __future__ import annotations

import base64
import copy
from decimal import Decimal
import hashlib
import io
import json
import re
import uuid
import zipfile
from html import escape

from model import Problem, canonical, digest, now, short_id, text, csv_bytes
import operations_expenses as expenses
import operations_amendments as amendments
from operations_commercial_receivables import _amount, _date, _ids, _object, _required
from operations_commercial_changes import (_native_rejected, _native_optional,
    _fingerprint, _money, _source, _assert_credit_review)

SCHEMA = "stellar-forge.customer-expense-billing.v1"
MODES = ("NEW", "DRAFT_EDIT", "CREDIT", "VOID", "REPLACE")
MAX_LINES = 200
MAX_SOURCES = 32 * 1024 * 1024


def fail(message, code="EXPENSE_BILLING_CONFLICT", status=409):
    raise Problem(message, status, code)


def review_refusal(action, operation):
    """Label only a local/read-only review or a rolled-back local transaction.

    The caller must keep every native dispatch outside this wrapper. A retained
    pending command remains authoritative and must be reconciled by the client.
    """
    try:
        return operation()
    except Problem as error:
        if getattr(error, "status", 500) not in (400, 404, 409, 413, 422):
            raise
        raise Problem(str(error), error.status, "EXPENSE_BILLING_" + action + "_REVIEW") from error


def exact(value, allowed, required=()):
    if not isinstance(value, dict) or set(value) - set(allowed) or not set(required) <= set(value):
        fail("Retain the complete declared expense billing fields.", "EXPENSE_BILLING_INPUT", 422)
    return value


def units(value, label):
    if not isinstance(value, str) or not re.fullmatch(r"(?:0|[1-9][0-9]{0,99})", value):
        fail(label + " must retain an integer native-unit string.", status=422)
    return int(value)


def money(value, scale):
    return _amount(value, scale, "Reviewed customer amount")


def portion_key(source, cost):
    return digest({"buyerWorkspaceId": source["workspaceId"],
                   "sourceLineId": source["sourceLineId"], "costId": cost,
                   "fundingBasis": "CUSTOMER"})


def original_key(source):
    return digest({"buyerWorkspaceId": source["workspaceId"],
                   "sourceLineId": source["sourceLineId"]})


def active_heads(rows):
    """One current noncancelled review per chain, independent of copied case IDs."""
    result = {}
    for row in sorted(rows, key=lambda x: (x["chainId"], x["sequence"])):
        if row["state"] != "CANCELLED":
            result[row["chainId"]] = row
    return result


def chain_exposure(rows):
    """Keep billed exposure until a correction completes.

    Take per-portion maxima across the last applied and pending editions.
    For each original expense take the largest edition total, never the sum
    of per-portion maxima across a cost-package reassignment.
    """
    result = {}
    for chain in {r["chainId"] for r in rows}:
        ordered = sorted((r for r in rows if r["chainId"] == chain and r["state"] != "CANCELLED"),
                         key=lambda r: r["sequence"])
        if not ordered:
            continue
        applied = max((i for i, r in enumerate(ordered) if r["state"] == "APPLIED"), default=-1)
        portions, originals, lines = {}, {}, []
        for row in (ordered[applied:] if applied >= 0 else ordered):
            selected = [] if row["state"] == "APPLIED" and row["proposal"]["mode"] == "VOID" else row["proposal"]["lines"]
            totals = {}
            for line in selected:
                quantity = units(line["nativeAmount"], "Retained source portion")
                portions[line["portionKey"]] = max(portions.get(line["portionKey"], 0), quantity)
                totals[line["originalKey"]] = totals.get(line["originalKey"], 0) + quantity
                lines.append(line)
            for key, quantity in totals.items():
                originals[key] = max(originals.get(key, 0), quantity)
        result[chain] = {"portions": portions, "originals": originals, "lines": lines}
    return result


def validate_exposure(rows):
    used, originals, budgets, original_budgets = {}, {}, {}, {}
    for exposure in chain_exposure(rows).values():
        for key, quantity in exposure["portions"].items():
            used[key] = used.get(key, 0) + quantity
        for key, quantity in exposure["originals"].items():
            originals[key] = originals.get(key, 0) + quantity
        for line in exposure["lines"]:
            budgets[line["portionKey"]] = max(budgets.get(line["portionKey"], 0), units(line["allocation"]["nativeAmount"], "Original allocation"))
            original_budgets[line["originalKey"]] = max(original_budgets.get(line["originalKey"], 0), units(line["attribution"]["source"]["original"]["amount"], "Original expense"))
    if any(value > budgets.get(key, 0) for key, value in used.items()) or any(value > original_budgets.get(key, 0) for key, value in originals.items()):
        fail("The combined original charge histories over-reserve a retained expense portion.")


def source_edition(context, selected, *, correction=False):
    values = expenses.retained(context)
    attribution = next((r for r in values["attributions"] if r["id"] == selected["attributionId"]), None)
    if attribution is None or attribution["state"] != "REVIEWED":
        fail("Select a reviewed original expense attribution.")
    if attribution["contentSha256"] != selected["expectedContentSha256"]:
        fail("The selected reviewed expense edition changed.")
    binding = expenses.source_binding_current(values, attribution)
    if not binding or binding["bindingSha256"] != attribution["source"]["bindingSha256"]:
        fail("Review the current accountant source before billing its expense.")
    if attribution["source"]["kind"] != "EXPENSE":
        fail("A buyer credit is reviewed with the original customer charge; it cannot create a positive expense invoice.", status=422)
    part = next((p for p in attribution["allocations"] if p["costId"] == selected["costId"]
                 and p["fundingBasis"] == "CUSTOMER"), None)
    if part is None and correction:
        part = {"costId": selected["costId"], "fundingBasis": "CUSTOMER", "nativeAmount": "0", "usdValue": "0.00", "removedAllocation": True}
    if part is None:
        fail("Choose the explicit CUSTOMER-funded work-package portion.", status=422)
    native = units(selected["nativeAmount"], "Selected original expense portion")
    if (native == 0 and not correction) or native > units(part["nativeAmount"], "Reviewed source allocation"):
        fail("Choose a positive portion within the reviewed customer allocation.", status=422)
    return attribution, part


def credit_context(context, workspace_ids):
    """Show all current original credits for selected buyers; never infer a lien."""
    values = expenses.retained(context)
    rows = []
    for intake in expenses.heads(values).values():
        if intake["inspection"]["source"]["buyer"]["workspaceId"] in workspace_ids:
            rows.extend({"intakeId": intake["id"], "sourceId": intake["sourceId"],
                         "buyer": copy.deepcopy(intake["inspection"]["source"]["buyer"]), **copy.deepcopy(row)}
                        for row in intake["inspection"]["rows"] if row["kind"] == "CREDIT")
    return sorted(rows, key=lambda r: (r["buyer"]["workspaceId"], r["sourceLineId"]))


def compile_steps(proposal):
    """Rebuild native financial commands solely from the reviewed edition."""
    mode, scale = proposal["mode"], proposal["currency"]["scale"]
    lines = proposal["lines"]
    draft_lines = [{"id": "expense-" + row["portionKey"][:40],
                    "description": row["description"], "quantity": "1",
                    "unitAmount": row["amount"]} for row in lines]
    request = {"customerId": proposal["customerId"], "currency": proposal["currency"],
               "issueDate": proposal["issueDate"], "dueDate": proposal["dueDate"],
               "purchaseOrder": proposal["purchaseOrder"], "note": proposal["note"],
               "lines": draft_lines, "sourceReference": "Reviewed expense recovery " + proposal["chainId"] +
               "; terms " + proposal["termsSha256"]}
    if not lines or len({line["id"] for line in draft_lines}) != len(lines):
        fail("Retain each selected original portion exactly once.", status=422)
    if mode in ("NEW", "DRAFT_EDIT", "REPLACE") and any(money(x["amount"], scale)[1] <= 0 for x in lines):
        fail("Every new native invoice line needs a positive agreed amount.", status=422)
    if mode == "NEW":
        if proposal["nativeBefore"] is not None or proposal["invoiceId"] is not None:
            fail("A first expense charge cannot replace an existing invoice.", status=422)
        return [{"action": "draft", "body": request}]
    detail = proposal["nativeBefore"]
    invoice, draft = detail["invoice"], detail["draft"]
    invoice_id = proposal["invoiceId"]
    if invoice["id"] != invoice_id or invoice["customerId"] != proposal["customerId"] or draft["currency"] != proposal["currency"]:
        fail("The current invoice customer, currency or original ID differs.")
    if proposal["effectiveDate"] < draft["issueDate"]:
        fail("A correction cannot precede the original invoice date.", status=422)
    steps = []
    if mode == "DRAFT_EDIT":
        if invoice["status"] != "DRAFT":
            fail("Edit only an unissued native draft.")
        request.update({"id": invoice_id, "expectedVersion": invoice["version"]})
        if draft.get("replacesId"):
            request["replacesId"] = draft["replacesId"]
    elif mode in ("CREDIT", "REPLACE", "VOID"):
        if invoice["status"] != "ISSUED":
            fail("An issued native invoice is required for credit, void or replacement.")
        resolution = "CREDIT" if mode == "CREDIT" else "VOID" if mode == "VOID" else proposal["resolution"]
        if resolution == "VOID":
            if detail["credits"] or any(not a.get("releasedDate") or a["releasedDate"] > proposal["effectiveDate"]
                                        for a in detail["allocations"]):
                fail("The invoice has credits or effective payment allocations. Review its native account or use credit and replacement.")
            steps.append({"action": "void", "body": {"invoiceId": invoice_id,
                "voidDate": proposal["effectiveDate"], "reason": proposal["reason"]}})
        else:
            targets = {x["id"]: money(x["unitAmount"], scale)[1] for x in draft_lines}
            original = {x["id"]: x for x in draft["lines"]}
            if mode == "CREDIT" and set(targets) != set(original):
                fail("A credit review must retain every original invoice line and its explicit remaining amount.")
            credits = {}
            for credit in detail["credits"]:
                for line in credit["document"]["lines"]:
                    credits[line["invoiceLineId"]] = credits.get(line["invoiceLineId"], 0) + money(line["netAmount"], scale)[1]
            selected = []
            for line in draft["lines"]:
                if money(line["taxAmount"], scale)[1] or money(line["discountAmount"], scale)[1]:
                    fail("Review externally added invoice tax or discount in native Receivables before returning to this charge.")
                remaining = money(line["netAmount"], scale)[1] - credits.get(line["id"], 0)
                target = targets[line["id"]] if mode == "CREDIT" else 0
                if target > remaining or remaining < 0:
                    fail("The remaining customer amount exceeds its original line after existing credits.")
                if remaining > target:
                    selected.append({"invoiceLineId": line["id"], "netAmount": _money(remaining-target, scale),
                                     "taxAmount": _money(0, scale)})
            if selected:
                steps.append({"action": "credit", "body": {"invoiceId": invoice_id,
                    "creditDate": proposal["effectiveDate"], "reason": proposal["reason"], "lines": selected}})
            elif mode == "CREDIT":
                fail("The reviewed remaining amounts create no additional credit.", status=422)
        if mode == "REPLACE":
            request["replacesId"] = invoice_id
    else:
        fail("Choose a supported charge continuation.", status=422)
    if mode in ("DRAFT_EDIT", "REPLACE"):
        steps.append({"action": "draft", "body": request})
    return steps


def assert_document(proposal, document):
    step = next((x["body"] for x in reversed(proposal["steps"]) if x["action"] == "draft"), None)
    if step is None:
        fail("This review contains no draft to issue.")
    for key in ("customerId", "currency", "issueDate", "dueDate", "purchaseOrder", "note", "sourceReference", "replacesId"):
        actual, expected = document.get(key), step.get(key)
        if key in ("purchaseOrder", "note", "replacesId"):
            actual, expected = actual or "", expected or ""
        if actual != expected:
            fail("The native draft differs from its reviewed expense-billing terms.")
    if document.get("customer", {}).get("id") != proposal["customerId"]:
        fail("The original customer binding changed.")
    if len(document["lines"]) != len(step["lines"]):
        fail("The native invoice line population changed.")
    scale = proposal["currency"]["scale"]
    for actual, expected in zip(document["lines"], step["lines"]):
        if any(actual.get(k) != expected[k] for k in ("id", "description", "unitAmount")) or (
                Decimal(actual["quantity"]) != Decimal(1) or
                money(actual["taxAmount"], scale)[1] or money(actual["discountAmount"], scale)[1]):
            fail("A native invoice line differs from its reviewed original expense portion.")
    if money(document["totals"]["total"], scale)[1] != sum(money(x["amount"], scale)[1] for x in proposal["lines"]):
        fail("The native total differs from the explicit agreed line amounts.")


class ExpenseBilling:
    def __init__(self, operations):
        self.operations, self.workspace, self.db = operations, operations.workspace, operations.db
        self.billing = operations.commercial
        self.db.execute("""CREATE TABLE IF NOT EXISTS ops_expense_billing (
            id TEXT PRIMARY KEY,chain_id TEXT NOT NULL,sequence INTEGER NOT NULL,
            body_json TEXT NOT NULL,UNIQUE(chain_id,sequence))""")
        self.db.execute("""CREATE TABLE IF NOT EXISTS ops_expense_billing_cases (
            program_id TEXT NOT NULL,charge_id TEXT NOT NULL,
            PRIMARY KEY(program_id,charge_id))""")

    def _all(self):
        return [json.loads(r[0]) for r in self.db.execute("SELECT body_json FROM ops_expense_billing ORDER BY chain_id,sequence")]

    def _rows(self, program_id):
        self.operations._context(program_id)
        return [json.loads(r[0]) for r in self.db.execute(
            "SELECT b.body_json FROM ops_expense_billing b JOIN ops_expense_billing_cases c ON c.charge_id=b.id "
            "WHERE c.program_id=? ORDER BY b.chain_id,b.sequence", (program_id,))]

    def _read(self, program_id, ident):
        return next((r for r in self._rows(program_id) if r["id"] == ident), None) or self._missing()

    def _missing(self):
        fail("This expense charge is not retained in the selected case.", "EXPENSE_BILLING_NOT_FOUND", 404)

    def _save(self, row):
        self.db.execute("UPDATE ops_expense_billing SET body_json=? WHERE id=?", (canonical(row), row["id"]))

    def _native(self, proposal, action, body):
        actual = self.billing._identity(proposal["endpointId"])
        self.billing._assert_identity(proposal["accountingIdentity"], actual)
        return self.billing._native(action, {"endpointId": proposal["endpointId"], **body})

    def _context(self, program_id, expected=None):
        context = self.operations._context(program_id)
        if context["program"]["state"] != "OPEN":
            fail("Reopen the original operating case before changing its customer billing.")
        if expected is not None and expected != context["program"]["version"]:
            fail("Refresh the selected case and review its current source edition.", "VERSION_CONFLICT")
        return context

    def _head(self, row):
        candidates = [r for r in self._all() if r["chainId"] == row["chainId"] and r["state"] != "CANCELLED"]
        if not candidates or candidates[-1]["id"] != row["id"]:
            fail("Continue the latest original expense charge review.")
        return row

    def _capacity(self, proposal, replacing_chain=None):
        exposures = chain_exposure(self._all())
        current = exposures.get(replacing_chain, {"portions": {}, "originals": {}})
        used, original_used, proposed_original = {}, {}, {}
        for chain, exposure in exposures.items():
            if chain == replacing_chain:
                continue
            for key, quantity in exposure["portions"].items():
                used[key] = used.get(key, 0) + quantity
            for key, quantity in exposure["originals"].items():
                original_used[key] = original_used.get(key, 0) + quantity
        for line in proposal["lines"]:
            key, origin = line["portionKey"], line["originalKey"]
            quantity = units(line["nativeAmount"], "Reviewed portion")
            limit = units(line["allocation"]["nativeAmount"], "Current allocation")
            if replacing_chain:
                limit = max(limit, used.get(key, 0) + current["portions"].get(key, 0))
            if used.get(key, 0) + quantity > limit:
                fail("Another retained charge already reserves part of this customer allocation.")
            proposed_original[origin] = proposed_original.get(origin, 0) + quantity
            limit = units(line["attribution"]["source"]["original"]["amount"], "Original expense")
            if replacing_chain:
                limit = max(limit, original_used.get(origin, 0) + current["originals"].get(origin, 0))
            if original_used.get(origin, 0) + proposed_original[origin] > limit:
                fail("Customer charges exceed the original expense across case copies.")

    def _source_current(self, program_id, proposal):
        context = self._context(program_id)
        for line in proposal["lines"]:
            selected = {"attributionId": line["attribution"]["id"],
                        "expectedContentSha256": line["attribution"]["contentSha256"],
                        "costId": line["allocation"]["costId"], "nativeAmount": line["nativeAmount"]}
            current, part = source_edition(context, selected, correction=proposal["mode"] in ("CREDIT", "VOID"))
            if canonical(current) != canonical(line["attribution"]) or canonical(part) != canonical(line["allocation"]):
                fail("The original reviewed expense or allocation changed; keep this charge and prepare an explicit source-backed correction.")
        current_credits = credit_context(context, {x["attribution"]["source"]["workspaceId"] for x in proposal["lines"]})
        if canonical(current_credits) != canonical(proposal["buyerCredits"]):
            fail("The received buyer credit population changed. Review the current credits with this customer charge.")
        for source in proposal["sources"]:
            metadata, raw = self.operations.source(program_id, source["id"])
            if metadata != source["metadata"] or raw != _source(source):
                fail("A selected commercial or expense source changed.")
        self._capacity(proposal, proposal["chainId"])
        return context

    def catalog(self, program_id):
        with self.workspace.mutex:
            context = self.operations._context(program_id)
            view = expenses.dashboard(context)
            reserved = {}
            for exposure in chain_exposure(self._all()).values():
                for key, quantity in exposure["portions"].items():
                    reserved[key] = reserved.get(key, 0) + quantity
            selected = []
            for record in view["attributions"]:
                for part in record["allocations"]:
                    if part["fundingBasis"] != "CUSTOMER" or record["source"]["kind"] != "EXPENSE":
                        continue
                    key = portion_key(record["source"], part["costId"])
                    selected.append({"attribution": record, "allocation": part, "portionKey": key,
                        "reservedNativeAmount": str(reserved.get(key, 0)),
                        "availableNativeAmount": str(max(0, int(part["nativeAmount"])-reserved.get(key, 0))),
                        "selectable": record["state"] == "REVIEWED" and not record["bookkeepingChanged"] and context["program"]["state"] == "OPEN"})
            return {"schema": SCHEMA, "programId": program_id, "version": context["program"]["version"],
                    "mode": context["program"]["mode"], "sources": list(context["sources"].values()),
                    "portions": selected, "attributions": view["attributions"], "buyerCredits": credit_context(context, {r["source"]["workspaceId"] for r in view["attributions"]}),
                    "items": [self._summary(row) for row in self._rows(program_id)]}

    def _summary(self, row):
        p = row["proposal"]
        return {"id": row["id"], "chainId": row["chainId"], "sequence": row["sequence"],
                "state": row["state"], "mode": p["mode"], "customerName": p["customer"]["name"],
                "currency": p["currency"], "amount": p["amount"], "createdAt": row["createdAt"],
                "activeInvoiceId": row.get("activeInvoiceId"), "pending": any(c["state"] == "PENDING" for c in row["commands"])}

    def get(self, program_id, ident, refresh=False):
        with self.workspace.mutex:
            row = copy.deepcopy(self._read(program_id, ident))
            row["current"] = active_heads(self._all()).get(row["chainId"], {}).get("id") == row["id"]
        if refresh:
            ids = {row["proposal"].get("invoiceId"), row.get("activeInvoiceId")} - {None}
            row["currentNative"] = [self._native(row["proposal"], "detail", {"invoiceId": i}) for i in sorted(ids)]
        return row

    def _capture_source_snapshot(self, program_id, context, authorization_ids):
        events = [json.loads(r[0]) for r in self.db.execute(
            "SELECT body_json FROM ops_events WHERE program_id=? ORDER BY version", (program_id,))]
        reviews = [json.loads(r[0]) for r in self.db.execute(
            "SELECT body_json FROM ops_reviews WHERE program_id=? ORDER BY rowid", (program_id,))]
        changes = amendments.load(self.operations, program_id)
        plans = {str(event["version"] - 1): amendments.plan_at(changes, context["plan"], event["version"] - 1)
                 for event in events if event.get("action") == "expense.save"}
        values = expenses.retained(context)
        selected = set(authorization_ids)
        selected.update(row["sourceId"] for row in values["intakes"])
        for event in events:
            if event.get("kind") == "expenseAttribution":
                selected.update((event["after"].get("valuation") or {}).get("sourceIds", []))
        sources = []
        for ident in sorted(selected):
            metadata, raw = self.operations.source(program_id, ident)
            sources.append({"id": ident, "metadata": metadata, "contentBase64": base64.b64encode(raw).decode()})
        if sum(len(_source(item)) for item in sources) > MAX_SOURCES:
            fail("The complete original expense source context exceeds 32 MiB.", status=413)
        return {"context": copy.deepcopy({key: context[key] for key in ("program", "plan", "records", "sources")}),
                "expenseRecords": copy.deepcopy(values), "events": events, "reviews": reviews,
                "expensePlanEditions": plans, "files": sources}

    def preview(self, program_id, body):
        exact(body, ("requestId", "actor", "expectedVersion", "previousId", "mode",
            "endpointId", "customerId", "currency", "sourceIds", "authorization",
            "authorizedOn", "creditReviewNote", "reason", "issueDate", "dueDate",
            "effectiveDate", "resolution", "purchaseOrder", "note", "lines", "expectedPreviewSha256"),
            ("requestId", "actor", "expectedVersion", "mode", "sourceIds", "authorization",
             "authorizedOn", "creditReviewNote", "reason", "lines"))
        request_id = short_id(body["requestId"], "Preparation request")
        actor = _required(body["actor"], "Recording operator", 300)
        mode = body["mode"]
        if mode not in MODES:
            fail("Choose a new charge, draft correction, credit, void or replacement.", status=422)
        source_ids = _ids(body["sourceIds"], "Original commercial authority files")
        if not source_ids:
            fail("Select the customer's actual cost-recovery terms or authorization.", status=422)
        auth = _required(body["authorization"], "Customer terms and charge interpretation", 12000)
        authorized = _date(body["authorizedOn"], "Authorization date")
        credit_note = _required(body["creditReviewNote"], "Review of buyer credits and amounts charged", 6000)
        reason = _required(body["reason"], "Charge or correction reason", 3000)
        prior = None
        with self.workspace.mutex:
            context = self._context(program_id, body["expectedVersion"])
            if body.get("previousId"):
                prior = self._read(program_id, body["previousId"])
                self._head(prior)
                if prior["state"] == "PREPARED" or any(c["state"] == "PENDING" for c in prior["commands"]):
                    fail("Continue or cancel the retained preparation; reconcile each pending native command before a new review.")
                if prior["state"] == "RUNNING" and not any(c["state"] == "REJECTED" for c in prior["commands"]):
                    fail("Complete the acknowledged native operation before creating its successor.")
                if mode == "NEW":
                    fail("Use a correction for the original retained customer charge.", status=422)
            elif mode != "NEW":
                fail("Select the original customer expense charge to correct.", status=422)
            chain = prior["chainId"] if prior else "expense-chain-" + digest({"programId": program_id, "requestId": request_id})[:32]
            endpoint = prior["proposal"]["endpointId"] if prior else _required(body.get("endpointId"), "Accounting connection", 200)
            customer_id = prior["proposal"]["customerId"] if prior else _required(body.get("customerId"), "Native customer", 100)
            currency = copy.deepcopy(prior["proposal"]["currency"] if prior else body.get("currency"))
            exact(currency, ("code", "scale"), ("code", "scale"))
            if not isinstance(currency["code"], str) or not re.fullmatch(r"[A-Z]{3}", currency["code"]) or (
                    type(currency["scale"]) is not int or not 0 <= currency["scale"] <= 6):
                fail("Choose the native three-letter currency and zero-to-six decimal precision.", status=422)
            if prior and any(body.get(k, prior["proposal"][k]) != prior["proposal"][k] for k in ("endpointId", "customerId", "currency")):
                fail("The original expense charge retains its customer, currency and accounting identity.")
            raw_lines = body["lines"]
            if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= MAX_LINES:
                fail("Select the complete one-to-200 original expense portions.", status=422)
            lines, selected_sources, seen = [], set(source_ids), set()
            for selected in raw_lines:
                exact(selected, ("attributionId", "expectedContentSha256", "costId", "nativeAmount",
                    "amountBasis", "amount", "description"), ("attributionId", "expectedContentSha256",
                    "costId", "nativeAmount", "amountBasis", "amount", "description"))
                attribution, part = source_edition(context, selected, correction=mode in ("CREDIT", "VOID"))
                key = portion_key(attribution["source"], part["costId"])
                if key in seen:
                    fail("Combine each original customer work-package portion once.", status=422)
                seen.add(key)
                amount, minor = money(selected["amount"], currency["scale"])
                basis = selected["amountBasis"]
                if basis not in ("REVIEWED_USD", "AGREED_AMOUNT"):
                    fail("Choose reviewed USD cost or an explicitly agreed customer amount.", status=422)
                if basis == "REVIEWED_USD":
                    if currency != {"code": "USD", "scale": 2} or part["usdValue"] is None:
                        fail("Reviewed-cost billing requires the original entered USD valuation and USD cents.", status=422)
                    numerator = money(part["usdValue"], 2)[1] * units(selected["nativeAmount"], "Expense portion")
                    denominator = units(part["nativeAmount"], "Reviewed allocation")
                    if (not denominator and minor) or (denominator and (numerator % denominator or numerator // denominator != minor)):
                        fail("This portion does not equal an exact-cent share of its reviewed USD valuation. Retain a separately agreed amount and its source instead.", status=422)
                if (not units(selected["nativeAmount"], "Expense portion") and minor) or (mode == "VOID" and (minor or units(selected["nativeAmount"], "Expense portion"))):
                    fail("A released or voided cost portion retains zero remaining charge and native units.", status=422)
                selected_sources.add(attribution["source"]["sourceId"])
                selected_sources.update((attribution.get("valuation") or {}).get("sourceIds", []))
                lines.append({"portionKey": key, "originalKey": original_key(attribution["source"]),
                    "attribution": copy.deepcopy(attribution), "allocation": copy.deepcopy(part),
                    "nativeAmount": selected["nativeAmount"], "amountBasis": basis, "amount": amount,
                    "description": _native_optional(selected["description"], "Invoice description", 3000)})
                if not lines[-1]["description"]:
                    fail("Describe each original expense charge.", status=422)
            if prior and mode in ("CREDIT", "VOID"):
                old = {x["portionKey"]: x for x in prior["proposal"]["lines"]}
                if set(old) != seen or any(units(x["nativeAmount"], "Remaining portion") > units(old[x["portionKey"]]["nativeAmount"], "Original portion") for x in lines):
                    fail("Credit or void retains the original source population and can only reduce its reserved portions.")
            sources = []
            for ident in sorted(selected_sources):
                metadata, raw = self.operations.source(program_id, ident)
                sources.append({"id": ident, "metadata": copy.deepcopy(metadata),
                                "contentBase64": base64.b64encode(raw).decode("ascii")})
            if sum(len(_source(x)) for x in sources) > MAX_SOURCES:
                fail("The selected full expense and authorization files exceed 32 MiB.", status=413)
            buyer_credits = credit_context(context, {x["attribution"]["source"]["workspaceId"] for x in lines})
            case_version = context["program"]["version"]
            source_mode = context["program"]["mode"]
            source_snapshot = self._capture_source_snapshot(program_id, context, source_ids)
            self._capacity({"lines": lines}, chain if prior else None)
        identity = self.billing._identity(endpoint)
        if prior:
            self.billing._assert_identity(prior["proposal"]["accountingIdentity"], identity)
            identity = prior["proposal"]["accountingIdentity"]
        customers = self.billing._native("customers", {"endpointId": endpoint})
        customer = next((r for r in customers["customers"] if r["id"] == customer_id), None)
        if not customer:
            fail("The selected customer is absent from the original native account.")
        detail = None
        invoice_id = None
        if prior:
            acknowledged = next((c for c in reversed(prior["commands"]) if c["action"] == "draft" and c["state"] == "ACKNOWLEDGED"), None)
            invoice_id = acknowledged["result"]["operation"]["result"]["invoiceId"] if acknowledged else (
                prior.get("activeInvoiceId") or prior["proposal"].get("invoiceId"))
            if not invoice_id:
                fail("Cancel an unused rejected preparation and prepare its corrected original source.")
            detail = self._native(prior["proposal"], "detail", {"invoiceId": invoice_id})
        defaults = detail["draft"] if detail else {}
        issue_date = _date(body.get("issueDate", defaults.get("issueDate")), "Invoice date")
        due_date = _date(body.get("dueDate", defaults.get("dueDate")), "Due date")
        effective_date = _date(body.get("effectiveDate", issue_date), "Correction date")
        if due_date < issue_date:
            fail("Due date cannot precede invoice date.", status=422)
        resolution = body.get("resolution", "CREDIT")
        if resolution not in ("CREDIT", "VOID"):
            fail("Select the original invoice's credit or void disposition.", status=422)
        terms = {"authorization": auth, "authorizedOn": authorized, "sourceIds": sorted(source_ids),
                 "creditReviewNote": credit_note, "currency": currency, "customerId": customer_id,
                 "reason": reason, "amounts": [{k: row[k] for k in ("portionKey", "nativeAmount", "amountBasis", "amount", "description")} for row in lines]}
        proposal = {"schema": SCHEMA, "programId": program_id, "expectedVersion": case_version,
            "caseMode": source_mode, "requestId": request_id, "chainId": chain,
            "sourceSnapshot": source_snapshot, "sourceSnapshotSha256": digest(source_snapshot),
            "previousId": prior["id"] if prior else None, "mode": mode, "actor": actor,
            "endpointId": endpoint, "accountingIdentity": identity, "customerId": customer_id,
            "customer": copy.deepcopy(customer), "currency": currency, "invoiceId": invoice_id,
            "sources": sources, "authorizationSourceIds": sorted(source_ids), "authorization": auth,
            "authorizedOn": authorized, "creditReviewNote": credit_note, "buyerCredits": buyer_credits,
            "reason": reason, "issueDate": issue_date, "dueDate": due_date, "effectiveDate": effective_date,
            "resolution": resolution, "purchaseOrder": _native_optional(body.get("purchaseOrder", defaults.get("purchaseOrder", "")) or "", "Purchase order", 300),
            "note": _native_optional(body.get("note", defaults.get("note", "")) or "", "Invoice note", 6000),
            "lines": lines, "terms": terms, "termsSha256": digest(terms),
            "amount": _money(sum(money(x["amount"], currency["scale"])[1] for x in lines), currency["scale"]),
            "nativeBefore": detail, "nativeFingerprint": _fingerprint(detail) if detail else None}
        proposal["steps"] = compile_steps(proposal)
        proposal["consequences"] = {"sourcePortions": "These reviewed original cost portions are reserved once across all receiving case copies.",
            "payments": "Original receipts, allocations and refunds stay in native Receivables; this review changes no cash.",
            "buyerCredits": "Original buyer credits remain visible source records. The customer amount follows the explicit retained terms and credit review.",
            "issue": "A prepared or corrected draft requires a separate native invoice preview and explicit issue."}
        return {"schema": SCHEMA, "proposal": proposal, "previewSha256": digest(proposal)}

    def prepare(self, program_id, body):
        request_id = short_id(body.get("requestId"), "Preparation request")
        payload = {"domain": SCHEMA, "action": "prepare", "programId": program_id, "body": body}
        with self.workspace.mutex:
            retained = next((r for r in self._rows(program_id) if r["proposal"]["requestId"] == request_id), None)
            if retained:
                if retained["preparationRequest"]["body"] != body:
                    fail("This original preparation request identifies a different retained selection.", "REQUEST_CONFLICT")
                return self.get(program_id, retained["id"])
            previous = self.db.execute("SELECT fingerprint,result_json FROM requests WHERE request_id=?", (request_id,)).fetchone()
            if previous:
                if previous[0] != digest(payload):
                    fail("This preparation request already identifies another exact selection.", "REQUEST_CONFLICT")
                return self.get(program_id, json.loads(previous[1])["id"])
        review = self.preview(program_id, body)
        if review["previewSha256"] != body.get("expectedPreviewSha256"):
            fail("Review this exact source, customer and original invoice before preparing.")
        proposal = review["proposal"]
        ident = "expense-billing-" + uuid.uuid4().hex
        def save():
            self._context(program_id, proposal["expectedVersion"])
            self._source_current(program_id, proposal)
            all_rows = [r for r in self._all() if r["chainId"] == proposal["chainId"]]
            heads = active_heads(all_rows)
            if heads.get(proposal["chainId"], {}).get("id") != proposal["previousId"]:
                fail("A newer original charge review exists.")
            sequence = max((r["sequence"] for r in all_rows), default=0) + 1
            row = {"schema": SCHEMA, "id": ident, "chainId": proposal["chainId"], "sequence": sequence,
                "createdAt": now(), "state": "PREPARED", "proposal": proposal,
                "proposalSha256": review["previewSha256"], "activeInvoiceId": None,
                "preparationRequest": {"body": copy.deepcopy(body), "sha256": digest(body)},
                "commands": [], "history": [{"action": "prepared", "at": now(), "actor": proposal["actor"]}]}
            self.db.execute("INSERT INTO ops_expense_billing VALUES(?,?,?,?)",
                (ident, row["chainId"], sequence, canonical(row)))
            self.db.execute("INSERT INTO ops_expense_billing_cases VALUES(?,?)", (program_id, ident))
            return {"id": ident}
        result = self.workspace._transaction(request_id, payload, save)
        return self.get(program_id, result["id"])

    def _new_command(self, program_id, ident, expected_index, step, revision, review=None):
        def save():
            row = self._head(self._read(program_id, ident))
            self._context(program_id)
            index = len(row["commands"])
            if expected_index < index:
                original = row["commands"][expected_index]
                comparison = {k: v for k, v in original["body"].items() if k not in ("requestId", "actor", "revision")}
                if original["action"] != step["action"] or comparison != step["body"] or original.get("review") != review:
                    fail("A different reviewed native command is already retained at this position.")
                return copy.deepcopy(original)
            if expected_index != index:
                fail("Resume the original contiguous native command history.")
            self._source_current(program_id, row["proposal"])
            if step["action"] == "issue":
                previous = next((c for c in reversed(row["commands"]) if c["action"] == "issue"), None)
                if row["state"] != "APPLIED" or (previous and previous["state"] != "REJECTED"):
                    fail("Reconcile the original invoice issue before preparing a new decision.")
                if review["supersedesRejectedCommand"] != (previous["index"] if previous else None):
                    fail("A different issue review was retained concurrently.")
            request_id = ident + "-native-" + str(index+1)
            body = {**copy.deepcopy(step["body"]), "requestId": request_id,
                    "actor": row["proposal"]["actor"], "revision": revision}
            command = {"index": index, "action": step["action"], "body": body,
                "requestId": request_id, "state": "PENDING", "createdAt": now(), "attempts": [],
                "intentSha256": digest({"action": step["action"], "body": {k: v for k, v in body.items() if k != "revision"}})}
            if review is not None:
                self._source_current(program_id, row["proposal"])
                command["review"] = copy.deepcopy(review)
            row["commands"].append(command)
            if step["action"] != "issue":
                row["state"] = "RUNNING"
            self._save(row)
            return command
        return review_refusal("ISSUE" if step["action"] == "issue" else "APPLY", lambda: self.billing._write(save))

    def _dispatch(self, program_id, ident, index):
        def start():
            row = self._head(self._read(program_id, ident))
            command = row["commands"][index]
            if command["state"] != "ACKNOWLEDGED":
                command["state"] = "PENDING"
                command["attempts"].append({"at": now(), "revision": command["body"]["revision"]})
                self._save(row)
            return copy.deepcopy(command), row["proposal"]
        command, proposal = self.billing._write(start)
        if command["state"] == "ACKNOWLEDGED":
            return command
        try:
            result = self._native(proposal, command["action"], command["body"])
            if result.get("operation", {}).get("id") != command["requestId"]:
                fail("The native account returned a different original request.", "EXPENSE_BILLING_NATIVE_RESPONSE", 502)
            def accepted():
                row = self._read(program_id, ident)
                current = row["commands"][index]
                if current["intentSha256"] != command["intentSha256"]:
                    fail("The original native expense command changed.")
                current.update({"state": "ACKNOWLEDGED", "result": result, "acknowledgedAt": now()})
                current.pop("lastError", None)
                if current["action"] == "draft":
                    row["activeInvoiceId"] = result["operation"]["result"]["invoiceId"]
                self._save(row)
                return copy.deepcopy(current)
            return self.billing._write(accepted)
        except Problem as error:
            def rejected():
                row = self._read(program_id, ident)
                current = row["commands"][index]
                if current["state"] != "ACKNOWLEDGED":
                    current["state"] = "REJECTED" if _native_rejected(command["action"], getattr(error, "code", "")) else "PENDING"
                    current["lastError"] = {"at": now(), "code": getattr(error, "code", ""), "message": str(error)}
                    self._save(row)
            self.billing._write(rejected)
            raise

    def apply(self, program_id, ident, body):
        exact(body, ("actor", "expectedProposalSha256"), ("actor", "expectedProposalSha256"))
        with self.workspace.mutex:
            row = self._head(self._read(program_id, ident))
            if body["expectedProposalSha256"] != row["proposalSha256"] or _required(body["actor"], "Original operator", 300) != row["proposal"]["actor"]:
                fail("Resume the original operator and full retained charge review.")
            if row["state"] == "APPLIED":
                return copy.deepcopy(row)
            proposal = row["proposal"]
        for index, step in enumerate(proposal["steps"]):
            with self.workspace.mutex:
                row = self._head(self._read(program_id, ident))
                command = copy.deepcopy(row["commands"][index]) if index < len(row["commands"]) else None
            if command and command["state"] == "ACKNOWLEDGED":
                continue
            if command and command["state"] == "PENDING":
                self._dispatch(program_id, ident, index)
                continue
            # Exact original replay precedes every current source/revision check.
            with self.workspace.mutex:
                review_refusal("APPLY", lambda: self._source_current(program_id, proposal))
            detail = self._native(proposal, "detail", {"invoiceId": proposal["invoiceId"]}) if proposal["invoiceId"] else None
            if index == 0 and detail and _fingerprint(detail) != proposal["nativeFingerprint"]:
                fail("The reviewed invoice or payment state changed. Retain this review and prepare its explicit successor.", "EXPENSE_BILLING_APPLY_REVIEW")
            if index > 0 and detail:
                if proposal["resolution"] == "VOID" and detail["invoice"]["status"] != "VOID":
                    fail("The original invoice is not in its acknowledged void state.", "EXPENSE_BILLING_APPLY_REVIEW")
                if proposal["resolution"] == "CREDIT":
                    scale = proposal["currency"]["scale"]
                    if sum(money(c["document"]["totals"]["total"], scale)[1] for c in detail["credits"]) != money(detail["draft"]["totals"]["total"], scale)[1]:
                        fail("The original invoice is no longer fully credited for replacement.", "EXPENSE_BILLING_APPLY_REVIEW")
            revision = detail["revision"] if detail else self._native(proposal, "customers", {})["revision"]
            if command:
                def rebind():
                    current = self._head(self._read(program_id, ident))
                    target = current["commands"][index]
                    if target["state"] != "REJECTED" or target["intentSha256"] != command["intentSha256"]:
                        fail("The original request changed while reviewing its refusal.")
                    self._source_current(program_id, current["proposal"])
                    target["body"]["revision"] = revision
                    target["state"] = "PENDING"
                    self._save(current)
                review_refusal("APPLY", lambda: self.billing._write(rebind))
            else:
                made = self._new_command(program_id, ident, index, step, revision)
                if made["index"] != index:
                    fail("Reopen the original retained native command order.")
            self._dispatch(program_id, ident, index)
        def complete():
            current = self._head(self._read(program_id, ident))
            if any(c["state"] != "ACKNOWLEDGED" for c in current["commands"][:len(proposal["steps"])]):
                fail("Reconcile each original native result.")
            draft = next((c for c in reversed(current["commands"]) if c["action"] == "draft"), None)
            current["activeInvoiceId"] = draft["result"]["operation"]["result"]["invoiceId"] if draft else (
                None if proposal["mode"] == "VOID" else proposal["invoiceId"])
            current["state"] = "APPLIED"
            current["appliedAt"] = now()
            current["history"].append({"action": "applied", "at": now(), "actor": proposal["actor"]})
            self._save(current)
            return copy.deepcopy(current)
        return self.billing._write(complete)

    def _cancel_request(self, program_id, ident, body):
        exact(body, ("requestId", "actor", "expectedProposalSha256", "reason"),
              ("requestId", "actor", "expectedProposalSha256", "reason"))
        actor, reason = _required(body["actor"], "Recording operator", 300), _required(body["reason"], "Cancellation reason", 6000)
        short_id(body["requestId"], "Original cancellation request")
        with self.workspace.mutex:
            retained = self._read(program_id, ident)
            prior = next((h for h in retained["history"] if h["action"] == "cancelled" and h["requestId"] == body["requestId"]), None)
            if prior:
                if prior["body"] != body:
                    fail("This original cancellation request identifies a different review.", "REQUEST_CONFLICT")
                return {"id": ident}
        def save():
            self._context(program_id)
            row = self._read(program_id, ident)
            if body["expectedProposalSha256"] != row["proposalSha256"]:
                fail("Cancel the exact retained charge review.")
            if row["state"] == "CANCELLED":
                fail("This preparation is already cancelled; reopen its original cancellation.")
            self._head(row)
            if any(c["state"] != "REJECTED" for c in row["commands"]):
                fail("A native command is pending or acknowledged. Preserve it and use a reviewed correction.")
            row["state"] = "CANCELLED"
            row["history"].append({"action": "cancelled", "at": now(), "actor": actor,
                                   "reason": reason, "requestId": body["requestId"], "body": copy.deepcopy(body), "bodySha256": digest(body)})
            self._save(row)
            return {"id": ident}
        result = self.workspace._transaction(body["requestId"], {"domain": SCHEMA, "action": "cancel",
            "programId": program_id, "id": ident, "body": body}, save)
        return result

    def cancel(self, program_id, ident, body):
        result = review_refusal("CANCEL", lambda: self._cancel_request(program_id, ident, body))
        # A failure of the post-commit read is not a rejected cancellation.
        return self.get(program_id, result["id"])

    def preview_issue(self, program_id, ident):
        with self.workspace.mutex:
            row = self._head(self._read(program_id, ident))
            if row["state"] != "APPLIED" or not row.get("activeInvoiceId") or not any(c["action"] == "draft" for c in row["commands"]):
                fail("Complete the original expense draft before reviewing its issue.")
            prior = next((c for c in reversed(row["commands"]) if c["action"] == "issue"), None)
            if prior and prior["state"] in ("PENDING", "ACKNOWLEDGED"):
                return {**copy.deepcopy(prior["review"]), "retainedCommand": copy.deepcopy(prior)}
            self._source_current(program_id, row["proposal"])
        native = self._native(row["proposal"], "preview", {"invoiceId": row["activeInvoiceId"]})
        assert_document(row["proposal"], native["document"])
        review = {"schema": SCHEMA, "id": ident, "proposalSha256": row["proposalSha256"],
            "invoiceId": row["activeInvoiceId"], "nativePreview": native,
            "supersedesRejectedCommand": prior["index"] if prior else None,
            "termsSha256": row["proposal"]["termsSha256"]}
        review["issuePreviewSha256"] = digest(review)
        return review

    def issue(self, program_id, ident, body):
        exact(body, ("actor", "expectedIssuePreviewSha256", "creditDecisionId"),
              ("actor", "expectedIssuePreviewSha256"))
        with self.workspace.mutex:
            row = self._head(self._read(program_id, ident))
            if _required(body["actor"], "Original operator", 300) != row["proposal"]["actor"]:
                fail("Resume this charge's original recording operator.")
            prior = next((c for c in reversed(row["commands"]) if c["action"] == "issue"), None)
        if prior and prior["state"] in ("PENDING", "ACKNOWLEDGED"):
            if body["expectedIssuePreviewSha256"] != prior["review"]["issuePreviewSha256"] or (
                    body.get("creditDecisionId") or None) != (prior["body"].get("creditDecisionId") or None):
                fail("Resume the exact retained issue review and credit-control decision.")
            self._dispatch(program_id, ident, prior["index"])
            return self.get(program_id, ident, True)
        review = review_refusal("ISSUE", lambda: self.preview_issue(program_id, ident))
        if body["expectedIssuePreviewSha256"] != review["issuePreviewSha256"]:
            fail("Review the current exact native invoice before issue.", "EXPENSE_BILLING_ISSUE_REVIEW")
        native = review["nativePreview"]
        review_refusal("ISSUE", lambda: _assert_credit_review(native, body.get("creditDecisionId")))
        step = {"action": "issue", "body": {"invoiceId": row["activeInvoiceId"],
            "expectedVersion": native["expectedVersion"], "previewSha256": native["previewSha256"]}}
        if body.get("creditDecisionId"):
            step["body"]["creditDecisionId"] = _required(body["creditDecisionId"], "Native credit decision", 100)
        command = self._new_command(program_id, ident, len(row["commands"]), step, native["revision"], review)
        self._dispatch(program_id, ident, command["index"])
        return self.get(program_id, ident, True)

    def export_rows(self, program_id):
        with self.workspace.mutex:
            chains = {r["chainId"] for r in self._rows(program_id)}
            return {"schema": SCHEMA, "items": [copy.deepcopy(r) for r in self._all() if r["chainId"] in chains]}

    def restore_rows(self, program_id, value):
        # Validation runs before the enclosing original Operations import transaction.
        for incoming in value["items"]:
            found = self.db.execute("SELECT body_json FROM ops_expense_billing WHERE id=?", (incoming["id"],)).fetchone()
            if found:
                original = json.loads(found[0])
                if original["proposalSha256"] != incoming["proposalSha256"] or original["sequence"] != incoming["sequence"]:
                    fail("A received expense charge changes its original reviewed source.")
                common = min(len(original["commands"]), len(incoming["commands"]))
                winner = copy.deepcopy(original if len(original["commands"]) >= len(incoming["commands"]) else incoming)
                for index in range(common):
                    left, right = original["commands"][index], incoming["commands"][index]
                    if left["intentSha256"] != right["intentSha256"] or left.get("review") != right.get("review"):
                        fail("The received original accounting request or review diverges.")
                    if left["state"] == right["state"] == "ACKNOWLEDGED" and left["result"]["operation"]["result"] != right["result"]["operation"]["result"]:
                        fail("An accounting acknowledgement names a different native result.")
                    winner["commands"][index] = copy.deepcopy(left if left["state"] == "ACKNOWLEDGED" else
                        right if right["state"] == "ACKNOWLEDGED" else left if left["state"] == "PENDING" else right)
                cancelled = next((r for r in (original, incoming) if r["state"] == "CANCELLED"), None)
                applied = next((r for r in (original, incoming) if r["state"] == "APPLIED"), None)
                if cancelled:
                    if any(r["state"] != "CANCELLED" and r["proposal"]["previousId"] == incoming["id"] for r in self._all() + value["items"]):
                        fail("A received cancellation conflicts with a retained successor review.")
                    if applied or any(c["state"] != "REJECTED" for c in winner["commands"]):
                        fail("Cancellation conflicts with retained native financial activity.")
                    winner["state"] = "CANCELLED"
                elif applied:
                    winner.update({k: applied[k] for k in ("state", "activeInvoiceId", "appliedAt")})
                history = {canonical(event): event for r in (original, incoming) for event in r["history"]}
                winner["history"] = sorted(history.values(), key=lambda e: (e["at"], canonical(e)))
                draft = next((c for c in reversed(winner["commands"]) if c["action"] == "draft" and c["state"] == "ACKNOWLEDGED"), None)
                winner["activeInvoiceId"] = draft["result"]["operation"]["result"]["invoiceId"] if draft else (
                    winner["proposal"]["invoiceId"] if winner["state"] == "APPLIED" and winner["proposal"]["mode"] != "VOID" else None)
                for index in range(common):
                    left, right = original["commands"][index], incoming["commands"][index]
                    attempts = {canonical(item): item for item in left["attempts"] + right["attempts"]}
                    winner["commands"][index]["attempts"] = sorted(attempts.values(), key=lambda item: (item["at"], canonical(item)))
                self._save(winner)
            else:
                clash = self.db.execute("SELECT id FROM ops_expense_billing WHERE chain_id=? AND sequence=?",
                    (incoming["chainId"], incoming["sequence"])).fetchone()
                if clash:
                    fail("This copied case contains a divergent original expense charge sequence.")
                self.db.execute("INSERT INTO ops_expense_billing VALUES(?,?,?,?)",
                    (incoming["id"], incoming["chainId"], incoming["sequence"], canonical(incoming)))
            self.db.execute("INSERT OR IGNORE INTO ops_expense_billing_cases VALUES(?,?)", (program_id, incoming["id"]))
        # A copy references original charges; it never creates another reservation.
        validate_exposure(self._all())
        return {"schema": SCHEMA, "received": len(value["items"])}

    def export_bundle(self, program_id, ident):
        with self.operations._snapshot():
            selected = self.get(program_id, ident)
            original = self.operations.export(program_id)
            retained = self.export_rows(program_id)
            local_fingerprint = digest(retained)
        proposal = selected["proposal"]
        native_revision = self._native(proposal, "customers", {})["revision"]
        account = self._native(proposal, "export", {"customerId": proposal["customerId"]})
        files = {"operations.zip": original,
            "expense-billing.json": (canonical(retained) + "\n").encode(),
            "selected-charge.json": (canonical(selected) + "\n").encode(),
            "native-customer-account.tar": base64.b64decode(account["contentBase64"], validate=True)}
        linked = []
        invoice_ids = set()
        for row in retained["items"]:
            if row["proposal"]["accountingIdentity"] == proposal["accountingIdentity"] and row["proposal"]["customerId"] == proposal["customerId"]:
                if row["proposal"].get("invoiceId"):
                    invoice_ids.add(row["proposal"]["invoiceId"])
                if row.get("activeInvoiceId"):
                    invoice_ids.add(row["activeInvoiceId"])
        for invoice_id in sorted(invoice_ids):
            detail = self._native(proposal, "detail", {"invoiceId": invoice_id})
            if detail["invoice"]["customerId"] != proposal["customerId"]:
                fail("A linked native document belongs to another customer.")
            records = ([{"id": invoice_id, "files": detail["files"]}] if detail.get("document") else []) + detail["credits"]
            for record in records:
                names = ("credit.json", "credit.csv", "credit.html", "manifest.json") if "document" in record else (
                    "invoice.json", "invoice.csv", "invoice.html", "manifest.json")
                folder = "native/documents/" + hashlib.sha256(record["id"].encode()).hexdigest() + "/"
                if folder + names[0] in files:
                    continue
                for name in names:
                    fetched = self._native(proposal, "document", {"invoiceId": record["id"], "name": name})
                    raw = base64.b64decode(fetched["contentBase64"], validate=True)
                    metadata = record["files"][name]
                    if len(raw) != metadata["bytes"] or hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
                        fail("The linked immutable native document differs from its original bytes.", status=502)
                    files[folder + name] = raw
                linked.append({"invoiceId": invoice_id, "documentId": record["id"], "directory": folder})
        if self._native(proposal, "customers", {})["revision"] != native_revision:
            fail("The native account changed during export. Reopen and export its current original edition.")
        with self.operations._snapshot():
            if digest(self.export_rows(program_id)) != local_fingerprint:
                fail("The expense-billing history changed during export. Reopen its current original edition.")
        files["native/linked-documents.json"] = (canonical(linked) + "\n").encode()
        files["export-observations.json"] = (canonical({"localHistorySha256": local_fingerprint,
            "nativeRevisionBeforeAndAfter": native_revision, "accountingIdentity": proposal["accountingIdentity"],
            "interpretation": "One local aggregate snapshot and the unchanged native revision observed around the original customer archive and all linked documents."}) + "\n").encode()
        records = []
        for row in retained["items"]:
            p = row["proposal"]
            for line in p["lines"]:
                records.append({"chargeId": row["id"], "chainId": row["chainId"], "sequence": row["sequence"],
                    "state": row["state"], "mode": p["mode"], "customerId": p["customerId"],
                    "invoiceId": row.get("activeInvoiceId"), "currency": p["currency"]["code"],
                    "attributionId": line["attribution"]["id"], "sourceLineId": line["attribution"]["source"]["sourceLineId"],
                    "costId": line["allocation"]["costId"], "nativeAmount": line["nativeAmount"],
                    "amount": line["amount"], "amountBasis": line["amountBasis"], "description": line["description"]})
        headers = ["chargeId", "chainId", "sequence", "state", "mode", "customerId", "invoiceId", "currency",
                   "attributionId", "sourceLineId", "costId", "nativeAmount", "amount", "amountBasis", "description"]
        files["expense-billing.csv"] = csv_bytes(headers, records)
        cells = lambda values: "".join("<td>" + escape(str(v if v is not None else "")) + "</td>" for v in values)
        table = "<table><thead><tr>" + "".join("<th>" + escape(h) + "</th>" for h in headers) + "</tr></thead><tbody>"
        table += "".join("<tr>" + cells([r.get(k) for k in headers]) + "</tr>" for r in records) + "</tbody></table>"
        files["expense-billing.html"] = ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Customer expense recovery</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#fff;color:#222;font:16px/1.5 system-ui}'
            'h1,h2,p,td,th{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:8px;border:1px solid #bbb;text-align:left;vertical-align:top}'
            '.table{overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #bbb;padding:16px;background:#f5f5f5;color:#222}</style>'
            '<h1>Customer expense recovery</h1><p>Complete original cost portions, customer charge reviews and native command history.</p><div class="table">' + table +
            '</div><h2>Selected customer terms</h2><pre>' + escape(selected["proposal"]["authorization"]) +
            '</pre><h2>Buyer credits review</h2><pre>' + escape(selected["proposal"]["creditReviewNote"]) +
            '</pre><p>Open operations.zip in Grant Operations to continue the whole case. The original customer-account archive retains native invoices, credits, allocations and documents. Configure the same accounting identity at its current service URL before financial continuation.</p></html>').encode()
        files["README.txt"] = ("CUSTOMER EXPENSE RECOVERY\n\noperations.zip is the complete original Grant case, not a new invoice source. "
            "expense-billing.json and CSV retain every charge edition and original command. native-customer-account.tar is the actual native full customer export. "
            "Reopen the complete operating case and its original native account; preserve the accounting identity pair and original request IDs. "
            "A customer-account export does not replace the authenticated full-account backup for native account restore. "
            "Inspect all outgoing HTML, CSV and native invoice documents; operate the rendered desk at desktop and phone widths, in light and dark embedding contexts, and cold-reopen the complete saved case.\n").encode()
        manifest = {"schema": SCHEMA, "id": ident, "createdAt": now(), "files": [
            {"path": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()} for name, raw in sorted(files.items())]}
        files["manifest.json"] = (canonical(manifest) + "\n").encode()
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, raw in sorted(files.items()):
                archive.writestr(name, raw)
        raw = output.getvalue()
        return {"filename": ident + ".zip", "mediaType": "application/zip", "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(), "contentBase64": base64.b64encode(raw).decode(), "manifest": manifest}


def validate_import(value, context, events, files):
    """Verify charge history against the already-validated original expense events."""
    if value is None:
        return {"schema": SCHEMA, "items": []}
    try:
        exact(value, ("schema", "items"), ("schema", "items"))
        if value["schema"] != SCHEMA or not isinstance(value["items"], list) or len(value["items"]) > 10000:
            fail("Retain the complete supported expense-billing history.", status=422)
        rows = value["items"]
        by_id, by_sequence = {}, set()
        for row in rows:
            required = ("schema", "id", "chainId", "sequence", "createdAt", "state", "proposal",
                        "proposalSha256", "activeInvoiceId", "commands", "history", "preparationRequest")
            exact(row, (*required, "appliedAt"), required)
            if row["schema"] != SCHEMA or not re.fullmatch(r"expense-billing-[a-f0-9]{32}", row["id"]) or row["id"] in by_id:
                fail("The original expense charge identity is invalid or repeated.", status=422)
            if type(row["sequence"]) is not int or row["sequence"] < 1 or (row["chainId"], row["sequence"]) in by_sequence:
                fail("The original charge sequence is invalid or repeated.", status=422)
            by_id[row["id"]] = row
            by_sequence.add((row["chainId"], row["sequence"]))
            p = row["proposal"]
            if digest(p) != row["proposalSha256"] or p["schema"] != SCHEMA or p["chainId"] != row["chainId"] or p["mode"] not in MODES:
                fail("The complete original charge proposal changed.", status=422)
            snapshot = p["sourceSnapshot"]
            if digest(snapshot) != p["sourceSnapshotSha256"]:
                fail("The charge lost its complete original expense source context.", status=422)
            original_context = copy.deepcopy(snapshot["context"])
            if original_context["program"]["id"] != p["programId"] or original_context["program"]["version"] != p["expectedVersion"] or original_context["program"]["mode"] != p["caseMode"]:
                fail("The charge source context changed its original case or edition.", status=422)
            original_files = {}
            for source in snapshot["files"]:
                if source["id"] in original_files or original_context["sources"].get(source["id"]) != source["metadata"]:
                    fail("The original source context repeats or changes a file.", status=422)
                original_files[source["id"]] = _source(source)
                if source["id"] in context["sources"] and (
                        context["sources"][source["id"]] != source["metadata"] or files.get("sources/" + source["id"]) != original_files[source["id"]]):
                    fail("A shared original source identity differs between received cases.", status=422)
            if sum(map(len, original_files.values())) > MAX_SOURCES:
                fail("The complete original source context exceeds its bound.", status=413)
            original_events = snapshot["events"]
            if type(p["expectedVersion"]) is not int or p["expectedVersion"] < 1 or any(event["version"] > p["expectedVersion"] for event in original_events):
                fail("The source context contains events after its reviewed edition.", status=422)
            verified_expenses = expenses.validate_import(original_context, snapshot["expenseRecords"], original_events,
                snapshot["reviews"], {"sources/" + key: raw for key, raw in original_files.items()},
                plan_for_version=lambda version: snapshot["expensePlanEditions"][str(version)])
            historic = {**original_context, "expenseRecords": verified_expenses}
            if context["program"]["id"] == p["programId"]:
                actual = [event for event in events if event["version"] <= p["expectedVersion"]]
                if actual != original_events:
                    fail("The received original case changed the charge's recorded event prefix.", status=422)
            if not isinstance(p["lines"], list) or not 1 <= len(p["lines"]) <= MAX_LINES:
                fail("The original charge line population is invalid.", status=422)
            currency = p["currency"]
            if set(currency) != {"code", "scale"} or not re.fullmatch(r"[A-Z]{3}", currency["code"]) or type(currency["scale"]) is not int or not 0 <= currency["scale"] <= 6:
                fail("The original native currency is invalid.", status=422)
            _required(p["actor"], "Original operator", 300)
            short_id(p["requestId"], "Original preparation request")
            _required(p["endpointId"], "Original connection", 200)
            _required(p["customerId"], "Original customer", 100)
            if p["customer"]["id"] != p["customerId"] or any(not re.fullmatch(r"[a-f0-9]{64}", p["accountingIdentity"][k]) for k in ("workspaceId", "sourcesSha256")):
                fail("The original customer/account identity changed.", status=422)
            for key in ("issueDate", "dueDate", "effectiveDate", "authorizedOn"):
                _date(p[key], key)
            if p["dueDate"] < p["issueDate"]:
                fail("The original invoice dates are invalid.", status=422)
            terms = {"authorization": _required(p["authorization"], "Original customer terms", 12000),
                "authorizedOn": p["authorizedOn"], "sourceIds": sorted(_ids(p["authorizationSourceIds"], "Original terms files")),
                "creditReviewNote": _required(p["creditReviewNote"], "Buyer credits review", 6000),
                "currency": currency, "customerId": p["customerId"], "reason": _required(p["reason"], "Original reason", 3000),
                "amounts": [{k: line[k] for k in ("portionKey", "nativeAmount", "amountBasis", "amount", "description")} for line in p["lines"]]}
            if not terms["sourceIds"] or terms != p["terms"] or digest(terms) != p["termsSha256"]:
                fail("The retained commercial terms changed.", status=422)
            seen, required_sources = set(), set(terms["sourceIds"])
            for line in p["lines"]:
                selected = {"attributionId": line["attribution"]["id"],
                    "expectedContentSha256": line["attribution"]["contentSha256"],
                    "costId": line["allocation"]["costId"], "nativeAmount": line["nativeAmount"]}
                attribution, part = source_edition(historic, selected, correction=p["mode"] in ("CREDIT", "VOID"))
                if attribution != line["attribution"] or part != line["allocation"] or (
                        portion_key(attribution["source"], part["costId"]) != line["portionKey"] or
                        original_key(attribution["source"]) != line["originalKey"] or line["portionKey"] in seen):
                    fail("A charge differs from its actual reviewed original expense edition.", status=422)
                seen.add(line["portionKey"])
                required_sources.add(attribution["source"]["sourceId"])
                required_sources.update((attribution.get("valuation") or {}).get("sourceIds", []))
                amount, minor = money(line["amount"], currency["scale"])
                if amount != line["amount"] or not _native_optional(line["description"], "Original description", 3000):
                    fail("The original line amount or description changed.", status=422)
                quantity, full_quantity = units(line["nativeAmount"], "Portion"), units(part["nativeAmount"], "Original allocation")
                if line["amountBasis"] == "REVIEWED_USD":
                    if currency != {"code": "USD", "scale": 2} or part["usdValue"] is None:
                        fail("The original reviewed USD basis is absent.", status=422)
                    numerator = money(part["usdValue"], 2)[1] * quantity
                    if (not full_quantity and minor) or (full_quantity and (numerator % full_quantity or numerator // full_quantity != minor)):
                        fail("The original reviewed USD portion changed.", status=422)
                elif line["amountBasis"] != "AGREED_AMOUNT":
                    fail("The original amount basis is unknown.", status=422)
                if (not quantity and minor) or p["mode"] == "VOID" and (minor or quantity):
                    fail("A released original portion retains a charge.", status=422)
            if p["buyerCredits"] != credit_context(historic, {x["attribution"]["source"]["workspaceId"] for x in p["lines"]}):
                fail("The original review lost its actual buyer credit population.", status=422)
            if len(p["sources"]) != len(required_sources) or {s["id"] for s in p["sources"]} != required_sources:
                fail("The complete original commercial/expense source population changed.", status=422)
            for source in p["sources"]:
                raw = _source(source)
                if original_context["sources"].get(source["id"]) != source["metadata"] or original_files.get(source["id"]) != raw:
                    fail("The received case lost an original expense or customer authorization file.", status=422)
            if sum(len(_source(s)) for s in p["sources"]) > MAX_SOURCES:
                fail("The original charge source exceeds its supported bound.", status=413)
            if p["amount"] != _money(sum(money(x["amount"], currency["scale"])[1] for x in p["lines"]), currency["scale"]):
                fail("The original reviewed customer total changed.", status=422)
            if p["nativeFingerprint"] != (_fingerprint(p["nativeBefore"]) if p["nativeBefore"] else None) or p["steps"] != compile_steps(p):
                fail("The original native financial plan changed.", status=422)
            preparation = row["preparationRequest"]
            request_body = preparation["body"]
            if digest(request_body) != preparation["sha256"] or request_body["expectedPreviewSha256"] != row["proposalSha256"] or request_body["requestId"] != p["requestId"] or request_body["expectedVersion"] != p["expectedVersion"] or request_body["mode"] != p["mode"] or request_body.get("previousId") != p["previousId"]:
                fail("The original local preparation request changed.", status=422)
            for event in row["history"]:
                if event["action"] == "cancelled":
                    if event["bodySha256"] != digest(event["body"]) or event["requestId"] != event["body"]["requestId"] or event["body"]["expectedProposalSha256"] != row["proposalSha256"]:
                        fail("The original cancellation request changed.", status=422)
            if row["state"] not in ("PREPARED", "RUNNING", "APPLIED", "CANCELLED") or not isinstance(row["commands"], list):
                fail("The original charge lifecycle is unsupported.", status=422)
            if row["state"] == "PREPARED" and row["commands"]:
                fail("A prepared-only review contains a dispatched command.", status=422)
            if row["state"] == "CANCELLED" and any(c["state"] != "REJECTED" for c in row["commands"]):
                fail("Cancellation contains an acknowledged or uncertain native action.", status=422)
            previous_issue = None
            for index, command in enumerate(row["commands"]):
                if command["index"] != index or command["requestId"] != row["id"] + "-native-" + str(index+1):
                    fail("The original native request sequence changed.", status=422)
                body = command["body"]
                if command["state"] not in ("PENDING", "REJECTED", "ACKNOWLEDGED") or body["requestId"] != command["requestId"] or body["actor"] != p["actor"]:
                    fail("The original native command identity changed.", status=422)
                if type(body["revision"]) is not int or body["revision"] < 0:
                    fail("The native command revision is invalid.", status=422)
                if digest({"action": command["action"], "body": {k: v for k, v in body.items() if k != "revision"}}) != command["intentSha256"]:
                    fail("The original accounting request payload changed.", status=422)
                native_body = {k: v for k, v in body.items() if k not in ("actor", "requestId", "revision")}
                if index < len(p["steps"]):
                    if {"action": command["action"], "body": native_body} != p["steps"][index] or any(
                            c["state"] != "ACKNOWLEDGED" for c in row["commands"][:index]):
                        fail("The retained financial commands bypass their reviewed order.", status=422)
                else:
                    review = command["review"]
                    if command["action"] != "issue" or not all(c["state"] == "ACKNOWLEDGED" for c in row["commands"][:len(p["steps"])]):
                        fail("The native issue precedes its original draft.", status=422)
                    if previous_issue and previous_issue["state"] != "REJECTED":
                        fail("Another issue follows an unresolved or acknowledged original request.", status=422)
                    bare = {k: v for k, v in review.items() if k != "issuePreviewSha256"}
                    if digest(bare) != review["issuePreviewSha256"] or review["id"] != row["id"] or review["proposalSha256"] != row["proposalSha256"] or review["termsSha256"] != p["termsSha256"] or review["supersedesRejectedCommand"] != (previous_issue["index"] if previous_issue else None):
                        fail("The retained invoice issue review changed.", status=422)
                    native = review["nativePreview"]
                    assert_document(p, native["document"])
                    expected = {"invoiceId": review["invoiceId"], "expectedVersion": native["expectedVersion"], "previewSha256": native["previewSha256"]}
                    if "creditDecisionId" in native_body:
                        expected["creditDecisionId"] = native_body["creditDecisionId"]
                    _assert_credit_review(native, native_body.get("creditDecisionId"))
                    if native_body != expected or review["invoiceId"] != row["activeInvoiceId"]:
                        fail("The issue names a different original invoice.", status=422)
                    previous_issue = command
                if command["state"] == "REJECTED" and not _native_rejected(command["action"], command["lastError"]["code"]):
                    fail("An uncertain native result was incorrectly marked rejected.", status=422)
                if command["state"] == "ACKNOWLEDGED":
                    if command["result"]["operation"]["id"] != command["requestId"]:
                        fail("The original native acknowledgement has another request identity.", status=422)
                    if command["action"] == "draft":
                        _required(command["result"]["operation"]["result"]["invoiceId"], "Native invoice ID", 200)
            draft = next((c for c in reversed(row["commands"]) if c["action"] == "draft" and c["state"] == "ACKNOWLEDGED"), None)
            active = draft["result"]["operation"]["result"]["invoiceId"] if draft else None
            if row["state"] == "APPLIED":
                if len(row["commands"]) < len(p["steps"]) or any(c["state"] != "ACKNOWLEDGED" for c in row["commands"][:len(p["steps"])]):
                    fail("Applied expense billing lacks its original acknowledged commands.", status=422)
                if not draft:
                    active = None if p["mode"] == "VOID" else p["invoiceId"]
            if row["activeInvoiceId"] != active:
                fail("The active invoice differs from its original native acknowledgement.", status=422)
            if not isinstance(row["history"], list) or not row["history"] or not any(h["action"] == "prepared" for h in row["history"]):
                fail("The complete charge history is absent.", status=422)
            if row["state"] == "CANCELLED" and not any(h["action"] == "cancelled" and h.get("reason") and h.get("requestId") for h in row["history"]):
                fail("A cancelled charge lost its original recorded decision.", status=422)
        for chain in {r["chainId"] for r in rows}:
            ordered = sorted((r for r in rows if r["chainId"] == chain), key=lambda r: r["sequence"])
            head = None
            for sequence, row in enumerate(ordered, 1):
                p = row["proposal"]
                if row["sequence"] != sequence or p["previousId"] != (head["id"] if head else None):
                    fail("The complete original customer charge chain is missing or reordered.", status=422)
                if head:
                    old = head["proposal"]
                    if any(p[k] != old[k] for k in ("endpointId", "customerId", "currency", "accountingIdentity")):
                        fail("A correction changed the original customer or native account.", status=422)
                    previous_invoice = head.get("activeInvoiceId") or old.get("invoiceId")
                    if p["invoiceId"] != previous_invoice:
                        fail("A correction lost its original invoice relationship.", status=422)
                    if p["mode"] in ("CREDIT", "VOID"):
                        prior = {x["portionKey"]: x for x in old["lines"]}
                        if set(prior) != {x["portionKey"] for x in p["lines"]} or any(units(x["nativeAmount"], "Remaining portion") > units(prior[x["portionKey"]]["nativeAmount"], "Original portion") for x in p["lines"]):
                            fail("An imported credit increases or substitutes the original cost population.", status=422)
                elif p["mode"] != "NEW" or p["chainId"] != "expense-chain-" + digest({"programId": p["programId"], "requestId": p["requestId"]})[:32]:
                    fail("The original first charge identity changed.", status=422)
                if row["state"] != "CANCELLED":
                    head = row
        validate_exposure(rows)
        return copy.deepcopy(value)
    except Problem:
        raise
    except (KeyError, TypeError, ValueError, IndexError, AttributeError) as error:
        raise Problem("The complete original expense-billing record is malformed.", 422, "EXPENSE_BILLING_IMPORT") from error
