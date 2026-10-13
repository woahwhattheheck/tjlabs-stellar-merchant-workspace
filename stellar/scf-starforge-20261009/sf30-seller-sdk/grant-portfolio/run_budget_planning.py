"""MIT. Receive, edit, review, compare, report, transfer and reopen a working budget."""
from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path
import uuid

from domain import canonical, require
from workspace import Workspace
from budget_planning import FIELDS, PLANNING_SCHEMA, scenario_ref
from budget_planning_service import planning_report, read_planning

def run(directory):
    """Uses labeled commissioning figures; keeps its complete editable workspace."""
    root = Path(directory).expanduser().absolute()
    root.mkdir(mode=0o700, parents=True, exist_ok=False)
    identities = {key: str(uuid.uuid4()) for key in
                  ("portfolioNode", "programNode", "projectNode", "milestone", "scenario",
                   "funding", "cost", "missing", "zero", "usd", "annual", "copy", "unrelated")}
    steps = []
    def change(collection, key, fields, expected=0):
        return {"collection": collection, "id": identities[key], "expectedRevision": expected, "fields": fields}
    def execute(ws, name, action, payload):
        request = ws.admit({"operationId": "budget-course-" + name, "action": action, "payload": payload})
        result = ws.execute(request["id"])
        require(result["state"] == "COMPLETED", name + ": " + str(result.get("error")))
        steps.append({"step": name, "operationId": result["id"], "workspaceRevision": result["workspaceRevision"]})
        return result["result"]
    def save(ws, current, name, incoming):
        return execute(ws, name, "portfolio.save", {
            "id": current["id"], "expectedPortfolioRevision": current["revision"],
            "name": current["name"], "notes": current["notes"], "sources": current["sources"],
            "review": current["review"], "planning": incoming})
    programme = {"schema": "stellar-forge.grant-programme.v1", "expectedProgrammeRevision": 0,
                 "actor": "Commissioning operator", "changes": [
        change("nodes", "portfolioNode", {"kind": "portfolio", "code": "DEMO", "title": "Budget commissioning",
                                         "owner": "Commissioning operator"}),
        change("nodes", "programNode", {"kind": "programme", "code": "PROGRAM", "title": "Delivery programme",
                                       "owner": "Commissioning operator", "parentId": identities["portfolioNode"]}),
        change("nodes", "projectNode", {"kind": "project", "code": "PROJECT", "title": "Delivery project",
                                       "owner": "Commissioning operator", "parentId": identities["programNode"]}),
        change("milestones", "milestone", {"nodeId": identities["projectNode"], "code": "DESIGN",
            "title": "Approved annual workplan", "owner": "Project manager", "startDate": "2026-10-01",
            "dueDate": "2026-10-31", "status": "planned", "description": "Complete the dated workplan and budget."})]}
    scenario = {"code": "BASE", "title": "Commissioning baseline", "nodeId": identities["programNode"],
                "owner": "Project manager", "startMonth": "2026-01", "endMonth": "2027-12",
                "openingBalances": [{"currency": "EUR", "value": "1000.00"}, {"currency": "USD", "value": "0"}],
                "description": "Labeled commissioning figures for the complete editable product workflow."}
    line_base = {"scenarioId": identities["scenario"], "nodeId": identities["projectNode"],
                 "classification": "forecast", "category": "delivery"}
    lines = [
        change("lines", "funding", {**line_base, "code": "FUND", "title": "Expected funding", "direction": "inflow",
            "period": "2026-10", "amount": "3000.00", "currency": "EUR", "cashDate": "2026-11-03"}),
        change("lines", "cost", {**line_base, "code": "COST", "title": "Workplan preparation", "direction": "outflow",
            "period": "2026-10", "amount": "1250.50", "currency": "EUR", "cashDate": "2026-10-21",
            "milestoneId": identities["milestone"]}),
        change("lines", "missing", {**line_base, "code": "UNPRICED", "title": "Unpriced delivery", "direction": "outflow",
            "period": "2026-11", "amount": None, "currency": "EUR"}),
        change("lines", "zero", {**line_base, "code": "ZERO", "title": "Confirmed no-cost item", "direction": "outflow",
            "period": "2026-11", "amount": "0", "currency": "USD", "cashDate": "2026-11-07",
            "classification": "committed", "commitmentReference": "Commissioning order ZERO"}),
        change("lines", "usd", {**line_base, "code": "USD", "title": "Separate-currency funding", "direction": "inflow",
            "period": "2026-12", "amount": "100.00", "currency": "USD", "cashDate": "2027-01-10",
            "classification": "committed", "commitmentReference": "Commissioning agreement USD"}),
        change("lines", "annual", {**line_base, "code": "ANNUAL", "title": "Unallocated annual funding", "direction": "inflow",
            "period": "2027", "amount": "200.00", "currency": "USD", "notes": "Year-only commissioning budget; monthly allocation unrecorded."})]
    with Workspace(root / "original", create=True) as ws:
        current = execute(ws, "create", "portfolio.save", {"name": "Budget commissioning", "notes": "",
            "sources": [], "review": {"status": "draft", "reviewer": "Commissioning operator", "note": ""},
            "programme": programme, "planning": {"schema": PLANNING_SCHEMA, "expectedPlanningRevision": 0,
            "actor": "Commissioning operator", "changes": [change("scenarios", "scenario", scenario), *lines]}})
        query = {"portfolioId": current["id"], "revision": str(current["revision"]),
                 "scenarioId": identities["scenario"], "granularity": "month"}
        result = read_planning(ws, "summary", query)["summary"]
        budget_oct = next(row for row in result["rows"] if row["period"] == "2026-10" and row["currency"] == "EUR")
        cash_oct = next(row for row in result["cashRows"] if row["period"] == "2026-10" and row["currency"] == "EUR")
        require(budget_oct["netKnown"] == "1749.50" and cash_oct["closingKnown"] == "-250.50",
                "Entered budget and cash dates must produce their independent exact totals")
        require(len(result["missingAmounts"]) == 1 and len(result["undatedCashRows"]) == 2 and
                all(not row["complete"] for row in result["cashRows"] if row["currency"] == "EUR"),
                "Unpriced and undated amounts must remain explicit")
        require(len(result["unallocatedBudgetRows"]) == 1, "A year-only amount must remain unallocated monthly")
        annual = read_planning(ws, "summary", {**query, "granularity": "year"})["summary"]
        annual_usd = next(row for row in annual["rows"] if row["period"] == "2027" and row["currency"] == "USD")
        require(annual_usd["inflow"]["known"] == "200.00", "Annual aggregation must include the exact year-only amount")
        current = save(ws, current, "finance-review", {"actor": "Commissioning Finance TL",
            "expectedPlanningRevision": current["planning"]["revision"], "changes": [
            change("scenarios", "scenario", {"reviewStatus": "reviewed", "reviewer": "Commissioning Finance TL",
                "reviewNote": "Original working edition reviewed for commissioning."}, expected=1)]})
        base = next(row for row in current["planning"]["records"]["scenarios"] if row["id"] == identities["scenario"])
        copied = {key: deepcopy(base[key]) for key in FIELDS["scenarios"]}
        copied.update(code="OPTION", title="Commissioning cost option", basedOn=scenario_ref(base),
                      reviewStatus="working", reviewer="", reviewNote="")
        clone_changes = [change("scenarios", "copy", copied)]
        for row in current["planning"]["records"]["lines"]:
            fields = {key: deepcopy(row[key]) for key in FIELDS["lines"]}
            fields["scenarioId"] = identities["copy"]
            if row["id"] == identities["cost"]:
                fields["amount"] = "1500.50"
            clone_changes.append({"collection": "lines", "id": str(uuid.uuid4()), "expectedRevision": 0, "fields": fields})
        current = save(ws, current, "copy-option", {"actor": "Commissioning operator",
            "expectedPlanningRevision": current["planning"]["revision"], "changes": clone_changes})
        query.update(revision=str(current["revision"]), scenarioId=identities["copy"],
                     compareScenarioId=identities["scenario"])
        result = read_planning(ws, "summary", query)["summary"]
        difference = next(row for row in result["comparison"]["rows"] if row["period"] == "2026-10" and row["currency"] == "EUR")
        require(difference["netKnownDifference"] == "-250.00", "The option must preserve the original scenario and exact difference")
        # Editing the reviewed original explicitly returns its clearance to working.
        current = save(ws, current, "price-original", {"actor": "Commissioning operator",
            "expectedPlanningRevision": current["planning"]["revision"], "changes": [
            change("lines", "missing", {"amount": "75.00", "cashDate": "2026-11-20"}, expected=1)]})
        original_scenario = next(row for row in current["planning"]["records"]["scenarios"]
                                 if row["id"] == identities["scenario"])
        require(original_scenario["reviewStatus"] == "working" and original_scenario["revision"] == 3,
                "Changing a reviewed amount must create the following working scenario edition")
        current = save(ws, current, "review-option", {"actor": "Commissioning Finance TL",
            "expectedPlanningRevision": current["planning"]["revision"], "changes": [
            change("scenarios", "copy", {"reviewStatus": "reviewed", "reviewer": "Commissioning Finance TL",
                "reviewNote": "Complete option and linked workplan reviewed."}, expected=1)]})
        def programme_edit(name, edits):
            return execute(ws, name, "portfolio.save", {
                "id": current["id"], "expectedPortfolioRevision": current["revision"],
                "name": current["name"], "notes": current["notes"], "sources": current["sources"],
                "review": current["review"],
                "programme": {"schema": "stellar-forge.grant-programme.v1", "actor": "Commissioning project manager",
                    "expectedProgrammeRevision": current["programme"]["revision"], "changes": edits}})
        planning_revision = current["planning"]["revision"]
        current = programme_edit("unrelated-project", [change("nodes", "unrelated", {
            "kind": "project", "code": "OTHER", "title": "Unrelated programme work",
            "owner": "Another project manager", "parentId": identities["portfolioNode"]})])
        option = next(row for row in current["planning"]["records"]["scenarios"] if row["id"] == identities["copy"])
        require(current["planning"]["revision"] == planning_revision and option["reviewStatus"] == "reviewed",
                "An unrelated programme edit must preserve the reviewed budget")
        current = programme_edit("revise-workplan", [
            change("milestones", "milestone", {"dueDate": "2026-11-15"}, expected=1)])
        option = next(row for row in current["planning"]["records"]["scenarios"] if row["id"] == identities["copy"])
        require(current["planning"]["revision"] == planning_revision + 1 and option["revision"] == 3 and
                option["reviewStatus"] == "working",
                "Changing the linked workplan must update Finance clearance in the same original revision")
        query["revision"] = str(current["revision"])
        report_files = []
        for granularity in ("month", "year"):
            for format_name in ("json", "csv", "html"):
                data, _, filename = planning_report(ws, {**query, "granularity": granularity, "format": format_name})
                name = granularity + "-" + filename
                (root / name).write_bytes(data)
                report_files.append(name)
        history = read_planning(ws, "history", {"portfolioId": current["id"], "revision": str(current["revision"]),
                                               "collection": "scenarios", "id": identities["scenario"]})
        require(len(history["history"]) == 3, "The original working, reviewed and revised editions must remain readable")
        exported = execute(ws, "export", "portfolio.export", {"portfolioId": current["id"], "revision": current["revision"]})
        archive_path, _ = ws.export_file(exported["sha256"])
        complete = root / "grant-budget-complete.zip"
        complete.write_bytes(archive_path.read_bytes())
        saved = {"portfolioId": current["id"], "revision": current["revision"], "snapshot": current["snapshot"]}
        # Resume of an already completed native request returns its original result.
        require(ws.execute("budget-course-revise-workplan")["result"]["snapshot"] == current["snapshot"],
                "A resumed completed operation must retain the original result")
    with Workspace(root / "received", create=True) as receiver:
        with complete.open("rb") as stream:
            uploaded = receiver.upload(stream, complete.stat().st_size)
        execute(receiver, "receive", "portfolio.receive", {"object": uploaded["sha256"]})
        reopened = receiver.portfolio(saved["portfolioId"], saved["revision"])
        require(reopened["snapshot"] == saved["snapshot"], "The complete budget must reopen with all original history")
    with Workspace(root / "received") as receiver:
        reopened = receiver.portfolio(saved["portfolioId"])
        require(reopened["snapshot"] == saved["snapshot"], "Closing and reopening must retain the complete selected edition")
        rows = receiver.rows(saved["portfolioId"], saved["revision"], "planning_lines", limit=250)
        require(rows["total"] == 12 and rows["nextOffset"] is None, "Both complete scenarios must reopen")
    result = {"schema": "stellar-forge.grant-budget-course.v1", **saved, "workspace": str(root / "original"),
              "receivedWorkspace": str(root / "received"), "archive": str(complete),
              "reports": report_files, "steps": steps, "identities": identities}
    (root / "completed.json").write_bytes(canonical(result))
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run and retain the complete budget planning workflow")
    parser.add_argument("directory", help="A new directory for the original and received workspaces")
    print(canonical(run(parser.parse_args().directory)).decode(), end="")
