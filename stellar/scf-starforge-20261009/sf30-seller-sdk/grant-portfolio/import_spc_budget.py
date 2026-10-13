"""MIT. Open the complete published SPC annual programme budget as an editable portfolio."""
from __future__ import annotations

import argparse
import io
from pathlib import Path
import uuid

from domain import canonical, digest, parse, require, short
from native_sources import file_info
from workspace import Workspace, immutable
from budget_planning import PLANNING_SCHEMA
from budget_planning_service import planning_report

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "examples" / "spc" / "published-budget"
FILES = {
    "SPC_2026_published_annual_planning.json": (
        "ea53c996d1c8017c4d3f296a6e950c66b91c11ca89d4c5f2bd88ec6a4cef4870",
        "application/json", "Complete published budget table and original annual labels"),
    "SPC_2025R_2026_budget_cells.csv": (
        "f054fd8b254169b67656c880b3ba1169202562539866b689e4551b9e6c008052",
        "text/csv", "Published annual budget cells and source blanks"),
    "SPC_original_indexed_table.html": (
        "635ab3627778955dd8297b95fd84afcefcc0c60241652f95c0ae7228c8139528",
        "text/html", "Original indexed SPC annual budget table"),
}
CATEGORIES = ("Unrestricted (Core)", "Restricted Programme", "Restricted Project")
PERIODS = (("2025R", "2025"), ("2026", "2026"))


def receive(workspace_path, actor, *, create=False):
    actor = short(actor, "Budget editor", 240)
    source_bytes = {name: (SOURCE / name).read_bytes() for name in FILES}
    for name, data in source_bytes.items():
        require(digest(data) == FILES[name][0], "The bundled original published source changed: " + name)
    source = parse(source_bytes["SPC_2026_published_annual_planning.json"])
    rows = [row for row in source["rows"] if row["kind"] == "programme"]
    require(len(rows) == 21 and all(row["published_measure"] == "budget_expenditure" for row in rows),
            "Receive all 21 original expenditure programmes")
    with Workspace(workspace_path, create=create) as ws:
        # Persist the complete stable input before admission. Reopening resumes
        # this same import and its original actor, identities and exact files.
        selection_id = digest({name: digest(data) for name, data in source_bytes.items()})
        draft_path = ws.root / ("published-budget-" + selection_id + ".json")
        if draft_path.exists():
            incoming = parse(draft_path.read_bytes())
        else:
            ids = {"portfolio": str(uuid.uuid4()), "scenario": str(uuid.uuid4()),
                   **{row["source_key"]: str(uuid.uuid4()) for row in rows}}
            docs, programme_changes = [], []
            def change(collection, ident, fields):
                return {"collection": collection, "id": ident, "expectedRevision": 0, "fields": fields}
            for name, data in source_bytes.items():
                uploaded = ws.upload(io.BytesIO(data), len(data))
                ident = str(uuid.uuid4())
                docs.append(ident)
                programme_changes.append(change("documents", ident, {
                    "nodeId": ids["portfolio"], "title": FILES[name][2], "category": "workplan-budget",
                    "owner": actor, "uri": source["document"]["source_url"], "status": "current",
                    "object": {"sha256": uploaded["sha256"], "bytes": uploaded["bytes"],
                               "filename": name, "contentType": FILES[name][1]},
                    "sourceEdition": "SPC 2026 budget: published 2025R and 2026 annual editions",
                    "description": "Full primary-document indexed table capture. Original annual labels, blank cells, "
                                   "programme rows and separate published controls are retained. Capture: " +
                                   source["capture"]["recorded_at"]}))
            programme_changes.append(change("nodes", ids["portfolio"], {
                "kind": "portfolio", "code": "SPC-PUBLISHED-BUDGET", "title": "SPC published programme budget",
                "owner": actor, "description": "Original 21 published programme expenditure rows, 2025R and 2026. "
                    "Published income and aggregate controls remain in the complete source documents.",
                "startDate": "2025-01-01", "endDate": "2026-12-31"}))
            for row in rows:
                programme_changes.append(change("nodes", ids[row["source_key"]], {
                    "kind": "programme", "code": "SPC-" + str(row["source_row_index"]).zfill(3),
                    "title": row["published_label"], "parentId": ids["portfolio"], "owner": actor,
                    "division": row["chapter"], "description": "Published source row " + row["source_key"] +
                        ". The original name and chapter are preserved.",
                    "startDate": "2025-01-01", "endDate": "2026-12-31"}))
            plan_changes = [change("scenarios", ids["scenario"], {
                "code": "SPC-2025R-2026", "title": "SPC published annual programme expenditure: 2025R and 2026",
                "nodeId": ids["portfolio"], "owner": actor, "startMonth": "2025-01", "endMonth": "2026-12",
                "description": "Complete programme expenditure by original funding category. Values are annual "
                    "published budgets. The original 2025R revised-year label is retained on every corresponding "
                    "line and in its source. Annual amounts have no inferred monthly allocation or cash date.",
                "documentIds": docs, "openingBalances": [],
                "notes": "21 programme rows × 3 funding categories × 2 published years = 126 original lines. "
                    "Blank source cells remain missing amounts. Income and aggregate totals remain source controls."})]
            for row in rows:
                for label, year in PERIODS:
                    for category_index, category in enumerate(CATEGORIES, 1):
                        cell = row["amounts"][label][category]
                        require((cell["amount_decimal"] is None) == cell["source_cell_blank"],
                                "The source blank flag and original amount differ")
                        plan_changes.append(change("lines", str(uuid.uuid4()), {
                            "scenarioId": ids["scenario"], "nodeId": ids[row["source_key"]],
                            "code": str(row["source_row_index"]).zfill(3) + "-" + label + "-" + str(category_index),
                            "title": row["published_label"] + " — " + label + " — " + category,
                            "direction": "outflow", "category": category, "period": year,
                            "amount": cell["amount_decimal"], "currency": "EUR", "classification": "forecast",
                            "documentIds": docs, "cashDate": None,
                            "notes": "Original row: " + row["source_key"] + "; published year label: " + label +
                                "; original cell: " + repr(cell["source_text"]) + "; published blank: " +
                                str(cell["source_cell_blank"]).lower() + ". " + row["chapter"]}))
            incoming = {"operationId": "spc-published-budget-" + selection_id[:24], "action": "portfolio.save",
                "payload": {"name": "SPC published programme expenditure 2025R / 2026",
                    "notes": "Complete original published annual programme table, retained and editable.",
                    "sources": [], "review": {"status": "draft", "reviewer": actor, "note": ""},
                    "programme": {"schema": "stellar-forge.grant-programme.v1",
                                  "expectedProgrammeRevision": 0, "actor": actor, "changes": programme_changes},
                    "planning": {"schema": PLANNING_SCHEMA, "expectedPlanningRevision": 0,
                                 "actor": actor, "changes": plan_changes}}}
            immutable(draft_path, canonical(incoming))
        ws.admit(incoming)
        request = ws.execute(incoming["operationId"])
        require(request["state"] == "COMPLETED", "Open the retained import operation: " + str(request.get("error")))
        imported = request["result"]
        scenario = imported["planning"]["records"]["scenarios"][0]
        folder = ws.root / "exports" / ("published-budget-" + imported["snapshot"])
        folder.mkdir(mode=0o700, exist_ok=True)
        reports = []
        for grain in ("year", "month"):
            for format_name in ("json", "csv", "html"):
                data, _, name = planning_report(ws, {"portfolioId": imported["id"], "revision": str(imported["revision"]),
                    "scenarioId": scenario["id"], "granularity": grain, "format": format_name})
                target = folder / (grain + "-" + name)
                immutable(target, data)
                reports.append({"path": str(target), **file_info(target)})
        export_id = incoming["operationId"] + "-export"
        ws.admit({"operationId": export_id, "action": "portfolio.export",
                  "payload": {"portfolioId": imported["id"], "revision": imported["revision"]}})
        exported = ws.execute(export_id)
        require(exported["state"] == "COMPLETED", "Open the retained full export operation: " + str(exported.get("error")))
        archive, descriptor = ws.export_file(exported["result"]["sha256"])
        result = {"schema": "stellar-forge.spc-published-budget-receiving.v1",
                  "workspace": str(ws.root), "workspaceId": ws.marker["workspaceId"],
                  "portfolioId": imported["id"], "revision": imported["revision"],
                  "snapshot": imported["snapshot"], "scenarioId": scenario["id"],
                  "programmeCount": len(rows), "budgetLineCount": len(imported["planning"]["records"]["lines"]),
                  "operationId": incoming["operationId"], "reports": reports,
                  "archive": {"path": str(archive), **descriptor}}
        immutable(folder / "received.json", canonical(result))
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Open SPC's published annual programme budget in the original portfolio")
    parser.add_argument("workspace", help="The original private workspace directory")
    parser.add_argument("--actor", required=True, help="The editor recording this original import")
    parser.add_argument("--create", action="store_true", help="Create a new private workspace at the selected path")
    args = parser.parse_args()
    print(canonical(receive(args.workspace, args.actor, create=args.create)).decode(), end="")
