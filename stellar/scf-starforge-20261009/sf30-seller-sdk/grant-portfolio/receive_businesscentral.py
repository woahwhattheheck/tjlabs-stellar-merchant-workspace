#!/usr/bin/env python3
"""Receive one original BC finance handover through the complete canonical PMRS product."""
from __future__ import annotations
import argparse
from decimal import Decimal, localcontext
import json
import os
from pathlib import Path
import sys
import uuid

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from domain import canonical, digest, parse, reference, require, sha
from native_sources import file_info
from programme import position
from workspace import Workspace, immutable


def stable_uuid(value):
    return str(uuid.UUID(digest(value)[:32], version=4))


def act(workspace, name, kind, payload):
    request = workspace.admit({"operationId": name, "action": kind, "payload": payload})
    result = workspace.execute(request["id"])
    require(result["state"] == "COMPLETED", "Original action failed: " + json.dumps(result.get("error")))
    return result["result"]


def all_rows(workspace, portfolio, table, **selected):
    result, offset = [], 0
    while True:
        page = workspace.rows(portfolio["id"], portfolio["revision"], table, offset, 250, **selected)
        require(page["snapshot"] == portfolio["snapshot"], "The saved portfolio changed while paging")
        result.extend(page["rows"])
        if page["nextOffset"] is None:
            require(len(result) == page["total"], "The complete selected table was not read")
            return result
        offset = page["nextOffset"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--reconciliation", required=True)
    parser.add_argument("--coverage", required=True, help="Original source coverage JSON, including sourceUrl/observedAt/license/statement")
    parser.add_argument("--directory", required=True, help="Private retained receiving operation directory")
    parser.add_argument("--actor", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    archive = Path(args.archive).resolve(strict=True)
    selected = {"archive": file_info(archive), "reconciliationId": sha(args.reconciliation),
                "coverage": parse(Path(args.coverage).read_bytes()), "actor": args.actor}
    root = Path(args.directory).absolute()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(root.resolve() == root, "Use the original receiving directory without aliases")
    immutable(root / "selection.json", canonical(selected))
    prefix = "bc-receiving-" + digest(selected)[:32]
    primary, reopened = root / "primary", root / "reopened"
    with Workspace(primary, create=not primary.exists()) as workspace:
        with archive.open("rb") as stream:
            uploaded = workspace.upload(stream, archive.stat().st_size)
        source = act(workspace, prefix + "-source", "source.receive", {
            "object": uploaded["sha256"], "standard": "businesscentral",
            "label": "Business Central financial edition", "coverage": selected["coverage"],
            "selection": {"reconciliationId": selected["reconciliationId"]}})
        entities = sorted(workspace._selected([source["id"]])[1], key=lambda row: row["entityKey"])
        projects = [row for row in entities if row["kind"] == "activity"]
        grants = [row for row in entities if row["kind"] == "grant"]
        company = next(row for row in entities if row["kind"] == "organization")
        root_id = stable_uuid([prefix, "portfolio"])
        programme_id = stable_uuid([prefix, "programme"])
        project_ids = {str(uuid.UUID(str(row["original"]["project"]["native"]["id"]))):
                       stable_uuid([prefix, row["entityKey"]]) for row in projects}
        def change(collection, ident, fields):
            return {"collection": collection, "id": ident, "expectedRevision": 0, "fields": fields}
        changes = [
            change("nodes", root_id, {"kind": "portfolio", "code": "BC-RECEIVING",
                "title": "Original financial source receiving", "owner": args.actor,
                "sourceRefs": [reference(company)]}),
            change("nodes", programme_id, {"kind": "programme", "code": "BC-AGGREGATION",
                "title": "Financial source aggregation", "parentId": root_id, "owner": args.actor})]
        for project in projects:
            native = project["original"]["project"]["native"]
            changes.append(change("nodes", project_ids[str(uuid.UUID(str(native["id"])))], {
                "kind": "project", "code": native["number"], "title": project["title"],
                "parentId": programme_id, "owner": args.actor, "sourceRefs": [reference(project)]}))
        for index, grant in enumerate(grants):
            changes.append(change("grants", stable_uuid([prefix, grant["entityKey"]]), {
                "code": "BC-G-" + str(index + 1), "title": grant["title"],
                "projectId": project_ids[grant["original"]["projectId"]],
                "owner": args.actor, "sourceRefs": [reference(grant)]}))
        portfolio = act(workspace, prefix + "-programme", "portfolio.save", {
            "name": "Business Central financial source receiving", "notes": selected["coverage"]["statement"],
            "sources": [source["id"]],
            "review": {"status": "draft", "reviewer": args.actor, "note": "Original receiving programme"},
            "programme": {"schema": "stellar-forge.grant-programme.v1",
                "expectedProgrammeRevision": 0, "actor": args.actor, "changes": changes,
                "settings": {"asOf": source["native"]["period"]["to"]}}})
        rows = all_rows(workspace, portfolio, "financial")
        require(len(rows) == source["counts"]["financial"], "The canonical ledger omitted native projected rows")
        require(len({row["rowKey"] for row in rows}) == len(rows), "The canonical ledger repeated an occurrence")
        # The original programme projection deduplicates shared project and grant aliases.
        model = portfolio["definition"]["programme"]
        combined = position(model, root_id, entities, rows)
        require(combined["financialRecordCount"] == len(rows)
                and combined["financialTotals"] == portfolio["financialTotals"],
                "The combined project/grant view changed the original financial position")
        alias_checks = 0
        for entity in projects + grants:
            expected = sorted(row["rowKey"] for row in rows
                if entity["entityKey"] in [row["entityKey"], *row.get("relatedEntityKeys", [])])
            selected_rows = all_rows(workspace, portfolio, "financial", entityKey=entity["entityKey"])
            detail = workspace.detail(portfolio["id"], portfolio["revision"], source["id"], entity["entityKey"])
            require(sorted(row["rowKey"] for row in selected_rows) == expected
                    and sorted(row["rowKey"] for row in detail["financial"]) == expected,
                    "Project/grant paging or detail changed the complete occurrence selection")
            alias_checks += 1
        # Compare all four measures in each original currency basis against the original native summary.
        grouped = {}
        with localcontext() as context:
            context.prec = 8192
            for row in rows:
                if row["kind"] == "source-disposition":
                    require(row["value"] is None and not row["eligible"], "A disposition became money")
                    continue
                d = row["dimensions"]
                key = (d["projectId"], d["grantKey"], d["currencyBasis"], row["currency"], row["kind"])
                group = grouped.setdefault(key, {"amount": Decimal(0), "included": 0, "missing": 0})
                if row["eligible"]:
                    group["amount"] += Decimal(row["value"])
                    group["included"] += 1
                else:
                    group["missing"] += 1
            expected_groups = set()
            for total in source["native"]["summary"]["totals"]:
                for metric, original in total["metrics"].items():
                    key = (total["project_id"], total["grant_key"], total["currency_basis"], total["currency"], metric)
                    if original["status"] == "NO_ROWS":
                        require(key not in grouped, "An absent native metric gained an occurrence")
                        continue
                    expected_groups.add(key)
                    actual = grouped[key]
                    require(actual["amount"] == Decimal(original["partial_total"])
                            and actual["included"] == original["contributing_rows"]
                            and actual["missing"] == original["missing_rows"],
                            "Canonical amounts or completeness differ from the exact native metric")
            require(set(grouped) == expected_groups, "Canonical financial groups differ from the native summary")
        # Save an attributed review, a following revision, and the complete original handover.
        portfolio = act(workspace, prefix + "-review", "review.save", {
            "portfolioId": portfolio["id"], "expectedPortfolioRevision": portfolio["revision"],
            "reviewer": args.actor, "decisions": [{"type": "record", "record": reference(company),
                "disposition": "coverage-only", "rationale": selected["coverage"]["statement"]}]})
        exported = act(workspace, prefix + "-export", "portfolio.export", {
            "portfolioId": portfolio["id"], "revision": portfolio["revision"]})
        packet_path, packet_descriptor = workspace.export_file(exported["sha256"])
        require(packet_descriptor == exported, "The saved export descriptor changed")
        retained = root / "PMRS_Business_Central_Complete.zip"
        if retained.exists():
            require(file_info(retained) == file_info(packet_path), "The original retained handover changed")
        else:
            import shutil
            with packet_path.open("rb") as inp, retained.open("xb") as out:
                shutil.copyfileobj(inp, out, 1024 * 1024)
                out.flush(); os.fsync(out.fileno())
        require(file_info(retained)["sha256"] == exported["sha256"], "The complete archive bytes differ")
        expected_snapshot = portfolio["snapshot"]
        expected_table_hashes = portfolio["tableSha256"]
    with Workspace(reopened, create=not reopened.exists()) as receiving:
        with retained.open("rb") as stream:
            received_object = receiving.upload(stream, retained.stat().st_size)
        act(receiving, prefix + "-receive", "portfolio.receive", {"object": received_object["sha256"]})
        restored = receiving.portfolio(portfolio["id"], portfolio["revision"])
        require(restored["snapshot"] == expected_snapshot and restored["tableSha256"] == expected_table_hashes,
                "Complete receiving changed the original saved revision")
        restored_rows = all_rows(receiving, restored, "financial")
        require(restored_rows == rows, "Complete receiving changed the original financial occurrences")
        result = {"schema": "stellar-forge.businesscentral-canonical-receiving.v1",
            "selection": selected, "sourceId": source["id"], "portfolioId": portfolio["id"],
            "revision": portfolio["revision"], "snapshot": expected_snapshot,
            "projects": len(projects), "grants": len(grants),
            "nativeRows": source["native"]["nativeRowCount"], "financialRows": len(rows),
            "entityViews": alias_checks, "nativeMetricGroups": len(expected_groups),
            "tableSha256": expected_table_hashes, "handover": file_info(retained), "state": "COMPLETE"}
    immutable(root / "result.json", canonical(result))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
