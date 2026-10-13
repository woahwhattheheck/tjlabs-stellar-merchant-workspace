"""Authenticated HTTP adapter for the original SF47 local workspace."""
from __future__ import annotations

from urllib.parse import parse_qs, unquote
import re
import json

from model import Problem
from operations import Operations, decoded
import operations_calendar as calendar_model
import operations_use_calendar as use_calendar
from operations_commercial_http import handle as commercial_http
from award_terms_http import handle as award_terms_http


def register_static(static):
    static.update({
        "/operations_procedures.mjs": ("operations_procedures.mjs", "text/javascript; charset=utf-8"),
        "/operations_procedures.css": ("operations_procedures.css", "text/css; charset=utf-8"),
        "/grant_procedures.mjs": ("grant_procedures.mjs", "text/javascript; charset=utf-8"),
        "/scf-starforge-20261009/distribution/discovery/operating-plan.mjs":
            ("../../../scf-starforge-20261009/distribution/discovery/operating-plan.mjs", "text/javascript; charset=utf-8"),
        "/scf-starforge-20261009/distribution/discovery/catalog.mjs":
            ("../../../scf-starforge-20261009/distribution/discovery/catalog.mjs", "text/javascript; charset=utf-8"),
    })
    static.update({"/cohort_delivery_comparison.mjs": ("cohort_delivery_comparison.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cohort_delivery.mjs": ("operations_cohort_delivery.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cohort_delivery.css": ("operations_cohort_delivery.css", "text/css; charset=utf-8"),
                   "/COHORT-DELIVERY.md": ("COHORT-DELIVERY.md", "text/markdown; charset=utf-8")})
    static.update({"/operations_funding.mjs": ("operations_funding.mjs", "text/javascript; charset=utf-8"),
                   "/operations_funding.css": ("operations_funding.css", "text/css; charset=utf-8"),
                   "/COST_FUNDING.md": ("COST_FUNDING.md", "text/markdown; charset=utf-8")})
    static["/operations_funding_requests.mjs"] = ("operations_funding_requests.mjs", "text/javascript; charset=utf-8")
    static.update({"/award-terms.mjs": ("award-terms.mjs", "text/javascript; charset=utf-8"),
                   "/award-terms.css": ("award-terms.css", "text/css; charset=utf-8")})
    static.update({"/operations_task_outcomes.mjs": ("operations_task_outcomes.mjs", "text/javascript; charset=utf-8"),
                   "/operations_task_outcomes.css": ("operations_task_outcomes.css", "text/css; charset=utf-8")})
    static.update({"/operations_account_reconciliation.mjs": ("operations_account_reconciliation.mjs", "text/javascript; charset=utf-8"),
                   "/operations_account_reconciliation.css": ("operations_account_reconciliation.css", "text/css; charset=utf-8")})
    static["/operations_amendment_calendar.mjs"] = ("operations_amendment_calendar.mjs", "text/javascript; charset=utf-8")
    static.update({"/operations_cash_accounts.mjs": ("operations_cash_accounts.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cash_accounts.css": ("operations_cash_accounts.css", "text/css; charset=utf-8")})
    static.update({"/operations_amendments.mjs": ("operations_amendments.mjs", "text/javascript; charset=utf-8"),
                   "/operations_amendments.css": ("operations_amendments.css", "text/css; charset=utf-8")})
    static.update({"/operations_installation_returns.mjs": ("operations_installation_returns.mjs", "text/javascript; charset=utf-8"),
                   "/operations_installation_returns.css": ("operations_installation_returns.css", "text/css; charset=utf-8")})
    static.update({"/operations_use_calendar.mjs": ("operations_use_calendar.mjs", "text/javascript; charset=utf-8"),
                   "/operations_use_calendar.css": ("operations_use_calendar.css", "text/css; charset=utf-8")})
    static.update({"/operations_work_intake.mjs": ("operations_work_intake.mjs", "text/javascript; charset=utf-8"),
                   "/operations_work_intake.css": ("operations_work_intake.css", "text/css; charset=utf-8")})
    static.update({"/operations_commercial.mjs": ("operations_commercial.mjs", "text/javascript; charset=utf-8"),
                   "/operations_commercial.css": ("operations_commercial.css", "text/css; charset=utf-8")})
    static.update({"/operations_statements.mjs": ("operations_statements.mjs", "text/javascript; charset=utf-8"),
                   "/operations_statements.css": ("operations_statements.css", "text/css; charset=utf-8")})
    static.update({"/operations_payables.mjs": ("operations_payables.mjs", "text/javascript; charset=utf-8"),
                   "/operations_payables.css": ("operations_payables.css", "text/css; charset=utf-8"),
                   "/operations_ledger_intake.mjs": ("operations_ledger_intake.mjs", "text/javascript; charset=utf-8"),
                   "/operations_ledger_intake.css": ("operations_ledger_intake.css", "text/css; charset=utf-8"),
                   "/operations_performance.mjs": ("operations_performance.mjs", "text/javascript; charset=utf-8"),
                   "/operations_performance.css": ("operations_performance.css", "text/css; charset=utf-8"),
                   "/operations_dispatch.mjs": ("operations_dispatch.mjs", "text/javascript; charset=utf-8"),
                   "/operations_dispatch.css": ("operations_dispatch.css", "text/css; charset=utf-8"),
                   "/operations_implementation.mjs": ("operations_implementation.mjs", "text/javascript; charset=utf-8"),
                   "/operations_implementation.css": ("operations_implementation.css", "text/css; charset=utf-8"),
                   "/cohort_planning.mjs": ("cohort_planning.mjs", "text/javascript; charset=utf-8"),
                   "/cohort_planning_calendar.mjs": ("cohort_planning_calendar.mjs", "text/javascript; charset=utf-8"),
                   "/cohort_planning_scheduling.mjs": ("cohort_planning_scheduling.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cohort_planning.mjs": ("operations_cohort_planning.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cohort_planning.css": ("operations_cohort_planning.css", "text/css; charset=utf-8"),
                   "/operations_cohort.mjs": ("operations_cohort.mjs", "text/javascript; charset=utf-8"),
                   "/operations_cohort.css": ("operations_cohort.css", "text/css; charset=utf-8"),
                   "/operations_commercial_installations.mjs": ("operations_commercial_installations.mjs", "text/javascript; charset=utf-8"),
                   "/operations_commercial_installations.css": ("operations_commercial_installations.css", "text/css; charset=utf-8"),
                   "/operations_installations.mjs": ("operations_installations.mjs", "text/javascript; charset=utf-8"),
                   "/operations_installation_workflows.mjs": ("operations_installation_workflows.mjs", "text/javascript; charset=utf-8"),
                   "/operations_installations.css": ("operations_installations.css", "text/css; charset=utf-8"),
                   "/operations_buyer.mjs": ("operations_buyer.mjs", "text/javascript; charset=utf-8"),
                   "/operations_buyer.css": ("operations_buyer.css", "text/css; charset=utf-8"),
                   "/operations_calendar.mjs": ("operations_calendar.mjs", "text/javascript; charset=utf-8"),
                   "/operations_calendar.css": ("operations_calendar.css", "text/css; charset=utf-8"),
                   "/operations_completion.mjs": ("operations_completion.mjs", "text/javascript; charset=utf-8"),
                   "/operations_completion.css": ("operations_completion.css", "text/css; charset=utf-8"),
                   "/operations_support.mjs": ("operations_support.mjs", "text/javascript; charset=utf-8"),
                   "/operations_engagements.mjs": ("operations_engagements.mjs", "text/javascript; charset=utf-8"),
                   "/operations_engagements.css": ("operations_engagements.css", "text/css; charset=utf-8"),
                   "/operations.mjs": ("operations.mjs", "text/javascript; charset=utf-8"),
                   "/operations.css": ("operations.css", "text/css; charset=utf-8"),
                   "/forecast.mjs": ("forecast.mjs", "text/javascript; charset=utf-8"),
                   "/forecast_currency.mjs": ("forecast_currency.mjs", "text/javascript; charset=utf-8"),
                   "/forecast.css": ("forecast.css", "text/css; charset=utf-8"),
                   "/portfolio.mjs": ("portfolio.mjs", "text/javascript; charset=utf-8"),
                   "/portfolio_installation_plans.mjs": ("portfolio_installation_plans.mjs", "text/javascript; charset=utf-8"),
                   "/portfolio.css": ("portfolio.css", "text/css; charset=utf-8")})


def store(handler):
    with handler.server.workspace.mutex:
        if not hasattr(handler.server, "operations"):
            handler.server.operations = Operations(handler.server.workspace)
        return handler.server.operations


def read(handler, parsed):
    if not parsed.path.startswith("/api/operations"):
        return False
    ops, query = store(handler), parse_qs(parsed.query)
    if award_terms_http(handler, parsed, ops, "GET"):
        return True
    if commercial_http(handler, parsed, ops, "GET"):
        return True
    path = parsed.path
    funding_match = re.fullmatch(r"/api/operations/(operation-[a-f0-9]{32})/cost-funding(?:/(edition|request|export.zip))?", path)
    if funding_match:
        ident, action = funding_match.groups()
        supplied = query.get("revision", [None])[0]
        try:
            revision = int(supplied) if supplied is not None else None
            expected = int(query.get("expectedVersion", ["0"])[0])
        except (TypeError, ValueError) as exc:
            raise Problem("Select the original integer funding revision and case version.", 422, "INVALID_COST_FUNDING") from exc
        if action is None:
            handler.send(200, ops.funding_catalog(ident))
        elif action == "edition":
            handler.send(200, ops.funding(ident, revision))
        elif action == "request":
            handler.send(200, ops.funding_request(ident, query.get("requestId", [None])[0]))
        else:
            handler.send(200, ops.export_funding(ident, revision, expected, query.get("expectedReportSha256", [None])[0]),
                         "application/zip", ident + "-cost-funding-r" + str(revision) + ".zip")
        return True
    if path == "/api/operations":
        handler.send(200, {"cases": ops.list(query.get("planId", [None])[0])})
        return True
    match = re.fullmatch(r"/api/operations/(operation-[a-f0-9]{32})(?:/(report|history|task-outcomes(?:/task-outcomes-[a-f0-9]{32}(?:/export.zip)?)?|engagements(?:/review-[a-f0-9]{32}(?:/export.zip)?)?|amendments(?:/amendment-[a-f0-9]{32})?|installation-returns(?:/review-[a-f0-9]{32}/export.zip)?|work-intakes(?:/intake-[a-f0-9]{32})?|export.zip|ledger-intake|ledger-intakes/source-[a-f0-9]{32}|account-reconciliation(?:/export.zip)?|account-reconciliation-statements/source-[a-f0-9]{32}/inputs|cash-account(?:/export.zip)?|supplier-account(?:/export.zip)?|performance(?:/export.zip)?|delivery-queue(?:/export.zip)?|installations(?:/installation-[a-f0-9]{32}(?:/history|/export.zip)?)?|customer-use-calendar/export\.(?:ics|csv|json)|delivery-calendar(?:/export\.(?:ics|csv|json))?|completion|completion-reviews/review-[a-f0-9]{32}/export.zip|cohort-reviews/review-[a-f0-9]{32}/export.zip|implementation-reviews/review-[a-f0-9]{32}/export.zip|implementation-originals/source-[a-f0-9]{32}/[a-f0-9]{64}|sources/source-[a-f0-9]{32}|reviews/review-[a-f0-9]{32}|forecasts(?:/forecast-[a-f0-9]{32}(?:/export.zip)?)?|portfolios(?:/portfolio-[a-f0-9]{32}(?:/export.zip)?)?))?", path)
    if not match:
        raise Problem("Operations page not found.", 404, "NOT_FOUND")
    ident, action = match.groups()
    if not action:
        handler.send(200, ops.read(ident))
    elif action == "report":
        handler.send(200, ops.report(ident))
    elif action == "task-outcomes":
        handler.send(200, {"comparisons": ops.list_task_outcomes(ident)})
    elif action.startswith("task-outcomes/"):
        study_id = action.split("/")[1]
        supplied = query.get("revision", [None])[0]
        expected = query.get("expectedVersion", [None])[0]
        try:
            revision = int(supplied) if supplied is not None else None
            expected = int(expected) if expected is not None else None
        except ValueError as exc:
            raise Problem("Use the original comparison revision and case version.", 422, "INVALID_TASK_OUTCOMES") from exc
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_task_outcomes(ident, study_id, revision, expected),
                         "application/zip", study_id + "-r" + str(revision) + ".zip")
        else:
            handler.send(200, ops.task_outcomes(ident, study_id, revision))
    elif action == "amendments":
        handler.send(200, ops.amendments(ident))
    elif action.startswith("amendments/"):
        selected = query.get("revision", [None])[0]
        try:
            revision = int(selected) if selected is not None else None
        except ValueError as exc:
            raise Problem("Select the original amendment edition.", 422, "INVALID_AMENDMENT") from exc
        handler.send(200, ops.amendment(ident, action.split("/")[1], revision))
    elif action == "ledger-intake":
        handler.send(200, ops.ledger_intake(ident))
    elif action.startswith("ledger-intakes/"):
        handler.send(200, ops.ledger_intake_original(ident, action.split("/")[1]))
    elif action == "work-intakes":
        handler.send(200, {"intakes": ops.list_work_intakes(ident)})
    elif action.startswith("work-intakes/"):
        revision = query.get("revision", [None])[0]
        try:
            revision = int(revision) if revision is not None else None
        except ValueError as exc:
            raise Problem("Use the saved intake edition number.", 422, "INVALID_WORK_INTAKE") from exc
        handler.send(200, ops.work_intake(ident, action.split("/")[1], revision))
    elif action == "history":
        handler.send(200, ops.history(ident, int(query.get("after", ["0"])[0]), int(query.get("limit", ["100"])[0])))
    elif action == "export.zip":
        handler.send(200, ops.export(ident), "application/zip", ident + ".zip")
    elif action in ("account-reconciliation", "account-reconciliation/export.zip"):
        try:
            supplied = query.get("expectedVersion", [None])[0]
            expected = int(supplied) if supplied is not None else None
            revision = query.get("revision", [None])[0]
            revision = int(revision) if revision is not None else None
        except ValueError as exc:
            raise Problem("Use the original case version and reconciliation edition.", 422, "INVALID_RECONCILIATION_SELECTION") from exc
        selected = {"reconciliationId": query.get("reconciliationId", [None])[0], "revision": revision}
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_account_reconciliation(ident, selected, expected,
                query.get("expectedReportSha256", [None])[0]), "application/zip", ident + "-account-reconciliation.zip")
        else:
            handler.send(200, ops.account_reconciliation(ident, selected, expected))
    elif action.startswith("account-reconciliation-statements/"):
        handler.send(200, ops.account_reconciliation_statement_inputs(ident, action.split("/")[1]))
    elif action in ("cash-account", "cash-account/export.zip"):
        account_query = parse_qs(parsed.query, keep_blank_values=True)
        selection = {key: account_query.get(key, [None])[0] for key in
                     ("startDate", "endDate", "network", "currency", "asset")}
        supplied = query.get("expectedVersion", [None])[0]
        try:
            expected = int(supplied) if supplied is not None else None
        except ValueError as exc:
            raise Problem("Use the original cash account case version.", 422, "INVALID_CASH_VERSION") from exc
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_cash_account(ident, selection, expected,
                query.get("expectedReportSha256", [None])[0]), "application/zip", ident + "-cash-account.zip")
        else:
            handler.send(200, ops.cash_account(ident, selection, expected))
    elif action in ("supplier-account", "supplier-account/export.zip"):
        supplied = query.get("expectedVersion", [None])[0]
        try:
            expected = int(supplied) if supplied is not None else None
        except ValueError as exc:
            raise Problem("Use the original supplier account case version.", 422, "INVALID_SUPPLIER_VERSION") from exc
        contributor = query.get("contributorId", [None])[0]
        start, end = query.get("startDate", [None])[0], query.get("endDate", [None])[0]
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_supplier_account(ident, contributor, start, end, expected,
                query.get("expectedReportSha256", [None])[0]), "application/zip", ident + "-supplier-account.zip")
        else:
            handler.send(200, ops.supplier_account(ident, contributor, start, end, expected))
    elif action == "performance":
        expected = query.get("expectedVersion", [None])[0]
        try:
            expected = int(expected) if expected is not None else None
        except ValueError as exc:
            raise Problem("Use the original case version.", 422, "INVALID_PERFORMANCE_VERSION") from exc
        handler.send(200, ops.performance(ident, query.get("startDate", [None])[0],
                     query.get("endDate", [None])[0], expected))
    elif action == "performance/export.zip":
        try:
            expected = int(query.get("expectedVersion", [""])[0])
        except ValueError as exc:
            raise Problem("Select the report's original case version.", 422, "INVALID_PERFORMANCE_VERSION") from exc
        handler.send(200, ops.export_performance(ident, query.get("startDate", [None])[0],
                     query.get("endDate", [None])[0], expected, query.get("expectedReportSha256", [None])[0]),
                     "application/zip", ident + "-performance.zip")
    elif action.startswith("customer-use-calendar/export."):
        try:
            expected = int(query.get("expectedVersion", [""])[0])
            selection_text = query.get("installationRefs", [None])[0]
            if selection_text is not None and len(selection_text) > 32768:
                raise ValueError("Selection is too large")
            selection = json.loads(selection_text) if selection_text is not None else None
        except (ValueError, TypeError) as exc:
            raise Problem("Select the original case version and exact Installation editions.",
                          422, "INVALID_CUSTOMER_USE_CALENDAR") from exc
        body = {"expectedVersion": expected, "asOfDate": query.get("asOfDate", [None])[0]}
        if selection is not None:
            body["installationRefs"] = selection
        format = action.rsplit(".", 1)[1]
        handler.send(200, ops.export_customer_use_calendar(ident, body, format),
                     use_calendar.content_type(format), ident + "-customer-use." + format)
    elif action == "delivery-queue":
        handler.send(200, ops.delivery_queue(ident, query.get("asOfDate", [None])[0]))
    elif action == "delivery-queue/export.zip":
        handler.send(200, ops.export_delivery_queue(ident, query.get("asOfDate", [None])[0]),
                     "application/zip", ident + "-delivery-queue.zip")
    elif action == "installation-returns":
        handler.send(200, ops.installation_returns(ident))
    elif action.startswith("installation-returns/"):
        review_id = action.split("/")[1]
        handler.send(200, ops.export_installation_return(ident, review_id), "application/zip", review_id + "-installation-return.zip")
    elif action == "installations":
        handler.send(200, {"installations": ops.list_installations(ident)})
    elif action.startswith("installations/"):
        installation_id = action.split("/")[1]
        selected = query.get("revision", [None])[0]
        revision = int(selected) if selected is not None else None
        if action.endswith("/history"):
            before = query.get("before", [None])[0]
            handler.send(200, ops.installation_history(ident, installation_id,
                int(before) if before is not None else None, int(query.get("limit", ["25"])[0])))
        elif action.endswith("/export.zip"):
            if revision is None:
                raise Problem("Select the saved installation edition for this complete handover.", 422, "INVALID_INSTALLATION")
            handler.send(200, ops.export_installation(ident, installation_id, revision), "application/zip",
                         installation_id + "-edition-" + str(revision) + ".zip")
        else:
            handler.send(200, ops.installation(ident, installation_id, revision))
    elif action == "delivery-calendar" or action.startswith("delivery-calendar/export."):
        supplied = query.get("expectedVersion", [None])[0]
        try:
            expected = int(supplied) if supplied is not None else None
        except ValueError as exc:
            raise Problem("Use the selected calendar's case version.", 422, "INVALID_CALENDAR_VERSION") from exc
        as_of = query.get("asOfDate", [None])[0]
        if action == "delivery-calendar":
            handler.send(200, ops.delivery_calendar(ident, as_of, expected))
        else:
            format = action.rsplit(".", 1)[1]
            handler.send(200, ops.export_delivery_calendar(ident, as_of, format, expected),
                         calendar_model.content_type(format), ident + "-delivery-calendar." + format)
    elif action == "completion":
        handler.send(200, ops.completion_calendar(ident, query.get("asOfDate", [None])[0]))
    elif action.startswith("implementation-reviews/"):
        review_id = action.split("/")[1]
        handler.send(200, ops.export_implementation(ident, review_id), "application/zip", review_id + "-implementation.zip")
    elif action.startswith("implementation-originals/"):
        _, source_id, sha256 = action.split("/")
        metadata, raw = ops.implementation_original(ident, source_id, sha256)
        safe_name = re.sub(r'[^A-Za-z0-9._ -]', "_", metadata["filename"])
        handler.send(200, raw, "application/octet-stream", safe_name)
    elif action.startswith("cohort-reviews/"):
        review_id = action.split("/")[1]
        handler.send(200, ops.export_cohort(ident, review_id), "application/zip", review_id + "-cohort.zip")
    elif action.startswith("completion-reviews/"):
        review_id = action.split("/")[1]
        handler.send(200, ops.export_completion(ident, review_id), "application/zip", review_id + "-completion.zip")
    elif action == "engagements":
        handler.send(200, ops.list_engagements(ident))
    elif action.startswith("engagements/"):
        review_id = action.split("/")[1]
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_engagement(ident, review_id), "application/zip", review_id + "-engagements.zip")
        else:
            handler.send(200, ops.engagement(ident, review_id))
    elif action == "forecasts":
        handler.send(200, {"forecasts": ops.list_forecasts(ident)})
    elif action.startswith("forecasts/"):
        fid = action.split("/")[1]
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_forecast(ident, fid), "application/zip", fid + ".zip")
        else:
            handler.send(200, ops.forecast(ident, fid))
    elif action == "portfolios":
        handler.send(200, {"portfolios": ops.list_portfolios(ident)})
    elif action.startswith("portfolios/"):
        pid = action.split("/")[1]
        if action.endswith("/export.zip"):
            handler.send(200, ops.export_portfolio(ident, pid), "application/zip", pid + ".zip")
        else:
            handler.send(200, ops.portfolio(ident, pid))
    elif action.startswith("sources/"):
        metadata, raw = ops.source(ident, action.split("/")[1])
        # All original documents are downloads, never executable inline content.
        safe_name = re.sub(r'[^A-Za-z0-9._ -]', "_", metadata["filename"])
        handler.send(200, raw, "application/octet-stream", safe_name)
    else:
        handler.send(200, ops.review(ident, action.split("/")[1]))
    return True


def write(handler, parsed):
    if not parsed.path.startswith("/api/operations"):
        return False
    ops, path = store(handler), parsed.path
    if award_terms_http(handler, parsed, ops, "POST"):
        return True
    if commercial_http(handler, parsed, ops, "POST"):
        return True
    if path == "/api/operations/import":
        query = parse_qs(parsed.query)
        result = ops.import_bundle(handler.raw_body(), query.get("name", ["Imported delivery operations"])[0],
                                   handler.headers.get("X-Request-ID"), getattr(handler, "recording_actor", lambda value: value)(unquote(handler.headers.get("X-Recorded-By", ""))))
    elif path == "/api/operations/intake":
        from operations_intake import import_source_intake
        body = handler.json_body()
        raw = decoded(body.pop("packetBase64", None))
        result = import_source_intake(ops, raw, body)
    elif path == "/api/operations":
        result = ops.create(handler.json_body())
    else:
        match = re.fullmatch(r"/api/operations/(operation-[a-f0-9]{32})/(command|funding-seed|funding-preview|task-outcomes-seed|task-outcomes-preview|customer-use-calendar|customer-use-calendar-expand|customer-use-calendar-cohort|account-reconciliation-preview|account-reconciliation|engagement-seed|engagement-preview|engagement-forecast|engagement-portfolio|cash-correction-preview|cash-correction|amendment-calendar-export|amendment-preview|installation-return-seed|installation-return-preview|installation-return-review-seed|installation-return-review-preview|work-intake-preview|ledger-intake-inspect|ledger-intake-preview|ledger-intake-apply|statement-inspect|statement-preview|implementation-source|implementation-preview|cohort-seed|cohort-preview|installation-workflows|installation-workflow-seed|installation-commercial|installation-commercial-seed|installation-workshares|installation-workshare-seed|installation-seed|installation-preview|completion-seed|completion-preview|support-preview|buyer-preview|forecast-preview|portfolio-preview|portfolio-seed|portfolio-selection)", path)
        if not match:
            raise Problem("Operations command not found.", 404, "NOT_FOUND")
        body = handler.json_body()
        if match.group(2) == "amendment-calendar-export":
            handler.send(200, ops.export_amendment_calendar(match.group(1), body),
                         "application/zip", match.group(1) + "-amendment-calendars.zip")
            return True
        methods = {"command": ops.command,
                   "funding-seed": ops.seed_funding, "funding-preview": ops.preview_funding,
                   "task-outcomes-seed": ops.seed_task_outcomes, "task-outcomes-preview": ops.preview_task_outcomes,
                   "customer-use-calendar": ops.customer_use_calendar,
                   "customer-use-calendar-expand": ops.expand_customer_use_calendar,
                   "customer-use-calendar-cohort": ops.seed_customer_use_cohort,
                   "account-reconciliation-preview": ops.account_reconciliation_preview,
                   "account-reconciliation": ops.account_reconciliation_apply,
                   "engagement-seed": ops.seed_engagement, "engagement-preview": ops.preview_engagement,
                   "engagement-forecast": ops.preview_engagement_forecast, "engagement-portfolio": ops.preview_engagement_portfolio,
                   "cash-correction-preview": ops.cash_correction_preview,
                   "cash-correction": ops.cash_correction_apply, "amendment-preview": ops.preview_amendment, "installation-return-seed": ops.seed_installation_return,
                   "installation-return-preview": ops.preview_installation_return,
                   "installation-return-review-seed": ops.seed_installation_return_review,
                   "installation-return-review-preview": ops.preview_installation_return_review, "work-intake-preview": ops.preview_work_intake, "ledger-intake-inspect": ops.inspect_ledger_intake,
                   "ledger-intake-preview": ops.preview_ledger_intake, "ledger-intake-apply": ops.apply_ledger_intake,
                   "statement-inspect": ops.inspect_statement, "statement-preview": ops.preview_statement, "implementation-source": ops.seed_implementation,
                   "implementation-preview": ops.preview_implementation, "cohort-seed": ops.seed_cohort, "cohort-preview": ops.preview_cohort, "installation-seed": ops.seed_installation,
                   "installation-workflows": ops.installation_workflows,
                   "installation-workflow-seed": ops.seed_workflow_installation,
                   "installation-commercial": ops.installation_commercial,
                   "installation-commercial-seed": ops.seed_commercial_installation,
                   "installation-workshares": ops.installation_workshares,
                   "installation-workshare-seed": ops.seed_workshare_installation,
                   "installation-preview": ops.preview_installation, "completion-seed": ops.seed_completion, "completion-preview": ops.preview_completion,
                   "support-preview": ops.preview_support, "buyer-preview": ops.preview_buyer,
                   "forecast-preview": ops.preview_forecast,
                   "portfolio-preview": ops.preview_portfolio, "portfolio-seed": ops.seed_portfolio,
                   "portfolio-selection": ops.select_portfolio}
        result = methods[match.group(2)](match.group(1), body)
    handler.send(200, result)
    return True
