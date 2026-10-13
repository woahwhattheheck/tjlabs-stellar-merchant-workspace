"""Project verified original Business Central finance editions into the portfolio.

The original pmrs receiver and reconciliation verifier own native accounting meaning.
This adapter only exposes the retained edition through the existing source contract.
"""
from __future__ import annotations

from pathlib import Path
import sys

from domain import canonical, digest, entity_key, require, sha, shape


def project_businesscentral(packet, root, selection, entities, financial):
    shape(selection, ("reconciliationId",), ("reconciliationId",))
    reconciliation_id = sha(selection["reconciliationId"])
    native_path = Path(__file__).resolve().parent / "businesscentral-native"
    sys.path.insert(0, str(native_path))
    from pmrs.canonical import decode, guid, ui_value
    from pmrs.package import receive_workspace
    from pmrs.reconcile import METRICS, verify_reconciliation
    from pmrs.source import Source
    from pmrs.store import Store
    from native_sources import file_info

    packet_identity = file_info(packet)
    received = receive_workspace(packet, root, expected_sha256=packet_identity["sha256"])
    store = Store(Path(received["workspace"]), create=False)
    reconciliation = verify_reconciliation(store, reconciliation_id)
    body = reconciliation["body"]
    mapping = store.record(body["mapping_id"], "mapping")
    require(mapping["body"]["source_id"] == body["source_id"],
            "The original financial mapping selects a different source edition")
    source = Source(store, body["source_id"])
    source.verify()
    connection = source.body["connection"]
    scope = {"standardUrl": connection["standard_url"],
             "projectsUrl": connection["projects_url"],
             "companyId": connection["company_id"]}
    summary = ui_value(body["summary"])
    period = summary["period"]
    require(summary["source_id"] == body["source_id"],
            "The original financial summary selects a different source edition")

    def original_id(kind, value):
        return "businesscentral:" + digest([scope, kind, value])

    def emit(kind, native_id, title, original, references=()):
        ident = original_id(kind, native_id)
        key = entity_key(kind, ident)
        original = ui_value(original)
        entities.write(canonical({
            "entityKey": key, "kind": kind, "standard": "businesscentral",
            "originalId": ident, "title": title,
            "nativeSource": body["source_id"], "nativeReconciliation": reconciliation_id,
            "companyId": scope["companyId"], "original": original,
            "sha256": digest(original),
            "organizationKeys": [] if kind == "organization" else [company_key],
            "referenceTokens": sorted({str(x) for x in references if x})}))
        return key

    companies = list(source.rows("company"))
    require(len(companies) == 1 and guid(companies[0]["native"]["id"]) == scope["companyId"],
            "The original finance edition must identify its one captured company")
    company = companies[0]
    company_key = emit("organization", scope["companyId"],
        company["native"].get("displayName") or company["native"].get("name") or scope["companyId"],
        {"company": company, "scope": scope}, (scope["companyId"],))
    edition = {"sourceId": body["source_id"], "mappingId": body["mapping_id"],
               "reconciliationId": reconciliation_id, "period": period}
    project_rows = list(source.rows("projects"))
    projects, project_keys = {}, {}
    for project in project_rows:
        native = project["native"]
        number, native_id = native["number"], guid(native["id"])
        require(number not in projects and native_id not in project_keys,
                "The original finance edition repeats a project identity")
        projects[number] = project
        project_keys[native_id] = emit("activity", native_id,
            native.get("description") or native.get("displayName") or number,
            {"project": project, "scope": scope, "financialEdition": edition},
            (number, native_id))
    rules = {}
    for rule in mapping["body"]["profile"]["rules"]:
        require(rule["project_id"] in project_keys, "A grant allocation selects an uncaptured project")
        rules.setdefault((rule["project_id"], rule["grant_key"]), []).append(rule)
    grant_keys = {}
    for (project_id, grant_key), selected_rules in sorted(rules.items()):
        grant_keys[(project_id, grant_key)] = emit("grant", [project_id, grant_key],
            selected_rules[0]["grant_label"],
            {"scope": scope, "projectId": project_id, "grantKey": grant_key,
             "rules": selected_rules, "financialEdition": edition},
            (grant_key, project_id))

    native_states = {
        (group["project_id"], group["grant_key"], group["currency_basis"], group["currency"], metric): value["status"]
        for group in summary["totals"] for metric, value in group["metrics"].items()}
    rows_identity = body["rows"]
    store.verify_object(rows_identity)
    native_rows, projected_rows, eligible_rows = 0, 0, 0
    seen = set()
    with store.object_path(rows_identity["sha256"]).open("rb") as stream:
        for line in stream:
            require(len(line) <= 32 * 1024 * 1024, "An original financial row exceeds 32 MiB")
            row = ui_value(decode(line))
            native_rows += 1
            identity = row["identity"]
            native_key = (identity["family"], identity["id"])
            require(native_key not in seen, "A native financial occurrence was repeated")
            seen.add(native_key)
            project = projects.get(row["native_project_number"])
            require(project is not None or (not row["values"] and row["allocation"] is None
                    and row["disposition"] in {"EXCLUDED_BY_REVIEW", "NATIVE_TEXT_LINE", "OUTSIDE_SELECTED_PERIOD"}),
                    "An allocated financial row has no captured project")
            project_id = guid(project["native"]["id"]) if project else None
            require(row.get("project_id", project_id) == project_id,
                    "An original financial row selects a different project")
            allocation = row["allocation"]
            if allocation:
                require(row["disposition"] == "ALLOCATED" and allocation["project_id"] == project_id,
                        "An original financial allocation selects a different project")
                grant_entity = grant_keys[(project_id, allocation["grant_key"])]
            else:
                grant_entity = None
            values = row["values"]
            require(isinstance(values, list), "Original financial values must be a complete list")
            if not values:
                values = [{"metric": "source-disposition", "field": None, "basis": None,
                           "currency": None, "native_value": None, "value": None,
                           "presentation_multiplier": None, "complete": False}]
            occurrence_metrics = set()
            for value_index, value in enumerate(values):
                metric, basis = value["metric"], value["basis"]
                require((metric, basis) not in occurrence_metrics,
                        "An original row repeats the same measure and currency basis")
                occurrence_metrics.add((metric, basis))
                eligible = (row["disposition"] == "ALLOCATED" and value["complete"] is True)
                require(not eligible or (allocation is not None and metric in METRICS
                        and isinstance(value["value"], str) and isinstance(value["currency"], str)),
                        "An eligible financial row has incomplete original meaning")
                row_key = digest(["businesscentral", scope, identity, metric, basis])
                dimensions = {**scope, "projectId": project_id,
                    "projectNumber": row["native_project_number"],
                    "grantKey": allocation["grant_key"] if allocation else None,
                    "currency": value["currency"], "currencyBasis": basis,
                    "valueMeaning": metric, "nativeField": value["field"],
                    "nativeStatus": native_states.get((project_id, allocation["grant_key"],
                        basis, value["currency"], metric)) if allocation else row["disposition"],
                    "reconciliationReady": summary["ready"],
                    "presentationMultiplier": value["presentation_multiplier"],
                    "periodStart": period["from"], "periodEnd": period["to"],
                    "periodSemantics": summary["period_semantics"]}
                if metric == "source-disposition":
                    dimensions.update(disposition=row["disposition"], nativeFamily=identity["family"])
                financial.write(canonical({
                    "rowKey": row_key, "entityKey": project_keys[project_id] if project else company_key,
                    "relatedEntityKeys": [grant_entity] if grant_entity else [],
                    "standard": "businesscentral", "kind": metric,
                    "originalId": original_id("financial", identity),
                    "nativeSource": body["source_id"], "nativeReconciliation": reconciliation_id,
                    "value": value["value"] if eligible else None, "currency": value["currency"], "eligible": eligible,
                    "dimensions": dimensions,
                    "original": {"reconciliationRow": row,
                        "nativeRowIndex": native_rows - 1,
                        "valueIndex": value_index if row["values"] else None,
                        "selectedValue": value if row["values"] else None,
                        "nativeDefinition": METRICS.get(metric), "financialEdition": edition,
                        "nativeRowsObject": rows_identity}}))
                projected_rows += 1
                eligible_rows += int(eligible)
    require(native_rows == summary["row_count"],
            "The complete native reconciliation row count changed")
    require(file_info(packet) == packet_identity, "The original finance handover changed")
    # Stable original identities only: receiving timestamps and machine paths are local.
    return {"standard": "businesscentral", "editionId": reconciliation_id,
            "sourceWorkspaceId": received["workspace_id"], "sourceId": body["source_id"],
            "mappingId": body["mapping_id"], "reconciliationId": reconciliation_id,
            "scope": scope, "period": period, "summary": summary,
            "archive": packet_identity, "nativeRows": rows_identity,
            "nativeRowCount": native_rows, "financialRowCount": projected_rows,
            "eligibleFinancialRowCount": eligible_rows,
            "sourceContract": ui_value(source.body["contract"]),
            "sourceProfile": ui_value(source.body["profile"]),
            "sourceConsistency": source.body["consistency"],
            "reconstructed": True,
            "financialMeaning": "One native row per metric and separate currency basis; "
                "project and grant views share the same financial row identity."}
