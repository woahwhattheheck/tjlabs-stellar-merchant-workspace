#!/usr/bin/env python3
"""Editable two-period Zurich portal-use report in the original customer workspace.

Receives the original SF100 deliveries, saves real queries/report/workbook jobs,
exports the complete Analysis workspace and cold-reopens that exact archive.
"""
from __future__ import annotations
import argparse
from hashlib import sha256
import json
import os
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import uuid
import zipfile

from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace, serve
from stellar_forge_buyer.analysis_workbooks import WorkbookDelivery
from stellar_forge_buyer.datasets import DatasetDelivery
from stellar_forge_buyer.query_export import QueryExport
from stellar_forge_buyer.storage import dump, parse, private_directory, read
from stellar_forge_buyer.workspace_archive import inspect_archive
from stellar_forge_buyer.workspace_archive_receive import restore_archive

OPERATION = "LIIP-CKAN-WORKSHARE-814B-20261013"
TITLE = "Zurich portal use | 10 and 11 October 2026"
FIELDS = ("record_id", "date", "dataset_name", "resource_name", "resource_id",
          "distinct_ips", "user_agent", "url", "datastore_search_sql_query", "hit_count")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def identifier(label):
    return uuid.uuid5(uuid.NAMESPACE_URL, OPERATION + ":" + label).hex


def keep(path, raw):
    path = Path(path)
    private_directory(path.parent, create=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        require(read(path, max(len(raw), 1)) == raw, "Original output changed: " + path.name)
    else:
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    return {"path": str(path), "bytes": len(raw), "sha256": sha256(raw).hexdigest()}


def keep_definition(path, value, hash_key):
    """Retain immutable saved source while preserving an older full wrapper."""
    immutable = {"definition": value["definition"], hash_key: value[hash_key]}
    path = Path(path)
    if path.exists():
        raw = read(path, 4 * 1024 * 1024)
        original = parse(raw)
        require(original.get("definition") == immutable["definition"] and
                original.get(hash_key) == immutable[hash_key],
                "Original saved definition changed: " + path.name)
        return {"path": str(path), "bytes": len(raw), "sha256": sha256(raw).hexdigest()}
    return keep(path, compact(immutable))


def complete(workspace, kind, request):
    return settle(workspace, kind, workspace.start(kind, request))


def settle(workspace, kind, job):
    deadline = time.monotonic() + 600
    while job["status"] == "RUNNING" and time.monotonic() < deadline:
        time.sleep(0.05)
        job = workspace.job(job["id"])
    require(job["status"] == "COMPLETE", kind + ": " + str(job.get("error") or job["status"]))
    print(json.dumps({"operation": OPERATION, "phase": kind, "id": job["id"], "status": job["status"]}), flush=True)
    return job


def compact(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True, indent=2) + "\n").encode()


def source_sql(projection, views):
    def value(field):
        quoted = '"' + field + '"'
        return "json_extract(" + quoted + ",'$')" if projection[field]["encoding"] == "json" else quoted
    select = ", ".join(value(field) + ' AS "' + field + '"' for field in FIELDS)
    union = " UNION ALL ".join('SELECT ' + select + ' FROM "' + view + '"' for view in views)
    return """WITH source_observations AS (""" + union + """),
observations AS (
  SELECT *, CAST(hit_count AS INTEGER) AS download_requests,
    CASE WHEN resource_id IS NOT NULL AND resource_id <> ''
      THEN 'ckan-resource:' || resource_id
      ELSE 'source-label:' || json_array(dataset_name, resource_name)
    END AS source_resource_key,
    CASE WHEN resource_id IS NOT NULL AND resource_id <> ''
      THEN 'CKAN resource UUID' ELSE 'Exact dataset/resource labels' END AS grouping_basis
  FROM source_observations
) """


def recipes(prefix):
    resources = """SELECT source_resource_key, grouping_basis,
 MIN(dataset_name) AS dataset_name, MIN(resource_name) AS resource_name,
 COUNT(DISTINCT json_array(dataset_name, resource_name)) AS label_variants,
 SUM(CASE WHEN date='2026-10-10' THEN download_requests ELSE 0 END) AS requests_2026_10_10,
 SUM(CASE WHEN date='2026-10-11' THEN download_requests ELSE 0 END) AS requests_2026_10_11,
 SUM(CASE WHEN date='2026-10-11' THEN download_requests ELSE -download_requests END) AS request_change,
 COUNT(*) AS source_records
 FROM observations GROUP BY source_resource_key, grouping_basis"""
    return {
        "PortalObservations": prefix + "SELECT * FROM observations ORDER BY date, record_id",
        "PortalDaily": prefix + """SELECT date, COUNT(*) AS source_records,
 SUM(download_requests) AS download_requests,
 COUNT(DISTINCT source_resource_key) AS resource_groups,
 SUM(CASE WHEN resource_id IS NULL OR resource_id='' THEN 1 ELSE 0 END) AS records_without_resource_uuid,
 SUM(CASE WHEN datastore_search_sql_query IS NOT NULL AND datastore_search_sql_query<>'' THEN 1 ELSE 0 END) AS records_with_sql_field
 FROM observations GROUP BY date ORDER BY date""",
        "PortalResources": prefix + resources + " ORDER BY source_resource_key",
        "PortalResourceMovements": prefix + resources + " ORDER BY ABS(request_change) DESC, source_resource_key LIMIT 40",
        "PortalRequestShape": prefix + """SELECT date,
 CASE WHEN datastore_search_sql_query IS NULL OR datastore_search_sql_query=''
      THEN 'SQL field empty' ELSE 'SQL field present' END AS source_request_shape,
 COUNT(*) AS source_records, SUM(download_requests) AS download_requests
 FROM observations GROUP BY date, source_request_shape ORDER BY date, source_request_shape""",
    }


def dictionaries_match(sources, expected):
    by_version = {item["version_id"]: item["semantic_dictionary"] for item in sources}
    require(by_version == expected, "The original two source dictionaries must travel with this customer output")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--programme", required=True, help="Completed original publisher-programme.json")
    parser.add_argument("--database", required=True, help="Private editable Analysis workspace")
    parser.add_argument("--out", required=True, help="Private complete customer delivery")
    parser.add_argument("--retry-workbook", action="store_true",
                        help="Build a new original child attempt after a terminal workbook failure; preserve the failed job.")
    args = parser.parse_args()
    os.umask(0o077)
    programme = parse(read(Path(args.programme), 32 * 1024 * 1024))
    require(programme["state"] == "COMPLETE" and programme["binding"]["operation"] == OPERATION,
            "Complete original publisher programme is required")
    out = private_directory(Path(args.out).absolute(), create=True)
    record_path = out / "customer-programme.json"
    prior = parse(read(record_path, 32 * 1024 * 1024)) if record_path.exists() else None
    binding = {"operation": OPERATION, "programme": str(Path(args.programme).absolute()),
               "database": str(Path(args.database).absolute()), "out": str(out)}
    if prior:
        require(prior["binding"] == binding, "Resume the same original customer programme")
    result = prior or {"schema": "stellar-forge.zurich-customer-programme.v1",
                       "binding": binding, "state": "RUNNING", "editions": [], "queryExports": {}}
    workspace = AnalysisWorkspace(Path(args.database).absolute())
    server = worker = None
    expected = {}
    try:
        result["workspaceId"] = workspace.identity
        view_names = []
        for period in programme["periods"]:
            original_scan = parse(read(Path(period["customer"]["scan"]), 32 * 1024 * 1024))
            delivery = DatasetDelivery.from_finalized_scan(original_scan)
            dictionary = delivery.read_semantics()
            require(dictionary["sha256"] == period["semanticSha256"] and
                    len([column for column in dictionary["columns"] if column.get("dictionarySource")]) == 9,
                    "All original Zurich meanings are required")
            imported = workspace.database.import_delivery(delivery, columns={})
            require(imported["row_count"] == period["rows"], "Imported rows differ")
            version_id = imported["version_id"]
            require(workspace.database.semantics(version_id)["document"] == dictionary,
                    "Imported source dictionary differs")
            expected[version_id] = dictionary
            view_name = "zurich_" + period["date"].replace("-", "")
            current = workspace.database.current(view_name)
            workspace.database.activate(view_name, version_id, expected_revision=current["revision"])
            view_names.append(view_name)
            edition = {"date": period["date"], "versionId": version_id, "view": view_name,
                       "rows": imported["row_count"], "semanticSha256": dictionary["sha256"],
                       "definitionSha256": dictionary["definitionSha256"]}
            existing = next((item for item in result["editions"] if item["date"] == period["date"]), None)
            require(existing is None or existing == edition, "Original customer edition changed")
            if existing is None:
                result["editions"].append(edition)
            keep(out / ("dictionary-" + period["date"] + ".json"), workspace.database.semantics_bytes(version_id))
        comparison = workspace.database.compare_semantics(result["editions"][0]["versionId"], result["editions"][1]["versionId"])
        require(not comparison["definition_changed"] and not comparison["mapping_changed"] and comparison["capture_changed"],
                "The second selected period must preserve the reviewed field meanings")
        result["semanticComparison"] = {"definitionChanged": False, "mappingChanged": False, "captureChanged": True}
        views = workspace.database.view_bindings()
        selected = source_sql(programme["projection"], view_names)
        sql = recipes(selected)
        saved_queries = {}
        names = {item["name"]: item["revision"] for item in workspace.state()["queries"]}
        for name, text in sql.items():
            if name in names:
                saved = workspace.saved_query(name, revision=names[name])
                require(saved["sql"] == text and saved["parameters_text"] == "[]", "Saved operator query changed")
            else:
                saved = workspace.save_query(name, {"sql": text, "parameters_text": "[]", "max_rows": 10000}, expected_revision=0)
            saved_queries[name] = saved
            keep(out / "editable-queries" / (name + ".sql"), text.encode())
        observed = workspace.database.query(sql["PortalDaily"], max_rows=10, expected_views=views)
        daily = [dict(zip(observed.columns, row)) for row in observed.rows]
        require([(row["date"], row["source_records"], row["download_requests"]) for row in daily] ==
                [("2026-10-10", 3821, 9627), ("2026-10-11", 4389, 10427)], "Original daily source totals changed")
        result["daily"] = daily
        result["requestsChange"] = {"absolute": 800, "percent": 800 / 9627 * 100}
        for name in ("PortalObservations", "PortalResources"):
            job = complete(workspace, "query", {"id": identifier("query:" + name), "sql": sql[name],
                           "parameters_text": "[]", "max_rows": 10000, "expected_views": views})
            dictionaries_match(job["result"]["source_versions"], expected)
            exported = complete(workspace, "query-export", {"id": identifier("query-export:" + name),
                              "query_id": job["id"], "result_sha256": job["result"]["result_sha256"],
                              "label": "Zurich " + ("original selected observations" if name == "PortalObservations" else "complete resource comparison"),
                              "formats": ["jsonl", "csv", "sqlite"], "max_rows": 10000,
                              "max_output_bytes": 64 * 1024 * 1024})
            original = QueryExport(exported["result"]["directory"])
            manifest = original.inspect()
            dictionaries_match(manifest["binding"]["sourceVersions"], expected)
            if name == "PortalObservations":
                require(manifest["rowCount"] == 8210, "Complete observation export must contain every selected source record")
            destination = out / ("observations" if name == "PortalObservations" else "resources")
            if (destination / "manifest.json").exists():
                received = QueryExport(destination)
                require(received.manifest == manifest, "Received query output differs")
                received.inspect()
            else:
                original.copy_to(destination)
            result["queryExports"][name] = {"id": exported["id"], "manifestSha256": exported["result"]["manifest_sha256"],
                                          "directory": str(destination), "rows": manifest["rowCount"], "columns": manifest["columns"]}
        methodology = (
            "Source: Stadt Zurich, Statistik Stadt Zurich, CKAN package prd_ssz_ogd_katalog_downloads; CC0. "
            "Complete selected date labels 2026-10-10 and 2026-10-11, 8,210 retained DataStore records. "
            "The source date has no separately declared timezone. hit_count is the source's count of download requests for its recorded grouping. "
            "Counts include repeated requests and retained external crawlers. The publisher says internal portal requests are filtered and IP addresses are not stored. "
            "distinct_ips retains its original per-record definition and is not aggregated into people or cross-period unique users. "
            "Resource grouping uses the CKAN resource UUID when present and the exact dataset_name/resource_name pair otherwise. "
            "The fallback preserves rows without a UUID; it is a source-label group, not a cross-resource identity resolution. "
            "SQL-field presence follows the original datastore_search_sql_query field, without reclassifying all remaining requests as browser downloads. "
            "The top movement view displays forty resource groups; the separate resource export and workbook retain the full comparison. "
            "All original fields, meanings, capture identities, reviewed editions and saved SQL remain available in this delivery."
        )
        sections = [
            {"title": "Daily requests and source coverage", "query_name": "PortalDaily",
             "note": "Two full selected days. Source records and request totals measure different quantities."},
            {"title": "Largest absolute resource movements", "query_name": "PortalResourceMovements",
             "note": "Forty groups ordered by absolute change. Positive change is more requests on 11 October; the full resource comparison is delivered separately."},
            {"title": "Original SQL field presence", "query_name": "PortalRequestShape",
             "note": "Presence of the source SQL field describes the retained request shape. Each row uses the original hit_count."},
        ]
        for section in sections:
            section["query_revision"] = saved_queries[section["query_name"]]["revision"]
        definition = workspace.reports.save("ZurichPortalUse", {
            "id": identifier("report-definition"), "expected_revision": 0, "title": TITLE,
            "introduction": methodology, "sections": sections})
        pinned = workspace.reports.definition(definition["name"], revision=definition["revision"])
        report = complete(workspace, "report", {"id": identifier("report"), "name": definition["name"],
                          "revision": definition["revision"], "definition_sha256": pinned["sha256"], "expected_views": views})
        dictionaries_match(report["result"]["sources"], expected)
        publication = workspace.reports.publish(report["id"], {"id": identifier("report-publication"),
            "result_sha256": report["result"]["result_sha256"], "expected_revision": 0,
            "note": "Reviewed complete daily captures, unchanged original field dictionary, original SQL and all source records."})
        retained = next(item for item in workspace.reports.publications(name=definition["name"])["publications"]
                        if item["publication"]["id"] == publication["id"])
        result["report"] = {"id": report["id"], "publicationId": publication["id"],
                            "publicationSha256": retained["sha256"], "definitionSha256": pinned["sha256"], "files": {}}
        for kind, extension in (("json", "json"), ("html", "html"), ("csv", "zip")):
            exported = complete(workspace, "report-export", {"id": identifier("report-export:" + kind),
                "publication_id": publication["id"], "publication_sha256": retained["sha256"], "format": kind})
            result["report"]["files"][kind] = keep(out / ("Zurich_Portal_Use_Report." + extension),
                                                    read(Path(exported["result"]["path"]), 128 * 1024 * 1024))
        sheets = []
        for name, title in (("PortalObservations", "Source observations"), ("PortalResources", "Resource comparison")):
            exported = result["queryExports"][name]
            sheets.append({"name": title, "source": {"kind": "query-export", "id": exported["id"],
                                                     "sha256": exported["manifestSha256"]},
                           "columns": [{"source": column, "header": column, "type": "native", "precision": "preserve"}
                                       for column in exported["columns"]]})
        sheets.append({"name": "Daily requests", "source": {"kind": "report", "id": publication["id"],
                                                             "sha256": retained["sha256"], "section": 0},
                       "columns": [{"source": name, "header": name.replace("_", " "), "type": "native"}
                                   for name in daily[0]]})
        workbook = workspace.workbooks.save("ZurichPortalUseWorkbook", {
            "id": identifier("workbook-definition"), "expected_revision": 0, "title": TITLE,
            "notes": methodology, "sheets": sheets})
        build_request = {"id": result.get("workbookRequestId", identifier("workbook")), "name": workbook["name"],
                         "revision": workbook["revision"], "definition_sha256": workbook["definition_sha256"]}
        result["workbookRequestId"] = build_request["id"]
        dump(record_path, result)
        build_job = workspace.start("workbook", build_request)
        if build_job["status"] in {"FAILED", "CANCELLED", "INTERRUPTED"} and args.retry_workbook:
            attempts = result.setdefault("workbookAttempts", [])
            if not any(item["id"] == build_job["id"] for item in attempts):
                attempts.append({"id": build_job["id"], "status": build_job["status"],
                                 "error": build_job.get("error"), "definitionSha256": workbook["definition_sha256"]})
            build_request["id"] = identifier("workbook-retry:" + build_job["id"])
            result["workbookRequestId"] = build_request["id"]
            dump(record_path, result)
            build_job = workspace.start("workbook", build_request)
        built = settle(workspace, "workbook", build_job)
        original_workbook = WorkbookDelivery(Path(built["result"]["directory"]))
        original_workbook.inspect()
        destination = out / "workbook"
        if (destination / "manifest.json").exists():
            received = WorkbookDelivery(destination)
            require(received.manifest == original_workbook.manifest, "Received workbook differs")
            received.inspect()
        else:
            original_workbook.copy_to(destination)
        result["workbook"] = {"id": built["id"], "directory": str(destination),
                              "manifestSha256": built["result"]["manifest_sha256"], "rows": built["result"]["row_count"]}
        workbook_file = destination / "workbook.xlsx"
        if workbook_file.exists():
            result["workbook"]["editableFile"] = keep(out / "Zurich_Portal_Use_Workbook.xlsx", read(workbook_file, 128 * 1024 * 1024))
        keep(out / "Methodology.md", ("# Zurich portal-use methodology\n\n" + methodology + "\n\n"
             "## Reproduce and edit\n\nOpen the received Analysis workspace with the maintained "
             "stellar_forge_buyer.analysis_workspace command. The saved PortalDaily, PortalObservations, "
             "PortalResources, PortalResourceMovements and PortalRequestShape queries remain editable. "
             "The report and workbook retain their source revisions. Create a new reviewed report or workbook "
             "edition when changing its saved selection.\n").encode())
        keep_definition(out / "report-definition.json", pinned, "sha256")
        keep_definition(out / "workbook-definition.json",
                        workspace.workbooks.definition(workbook["name"], revision=workbook["revision"]), "definition_sha256")
        server, control, launch = serve(workspace)
        worker = threading.Thread(target=server.serve_forever, daemon=False)
        worker.start()
        address = urlsplit(launch)
        origin = address.scheme + "://" + address.netloc
        def get(path):
            with urlopen(Request(origin + path, headers={"X-Analysis-Capability": address.fragment, "Origin": origin}), timeout=20) as response:
                return response.read()
        require(b'id="dictionary"' in get("/") and b"renderSemantics" in get("/app.js"), "Original editable Analysis application missing")
        for version, dictionary in expected.items():
            require(parse(get("/api/semantics/" + version))["document"] == dictionary, "Original browser dictionary changed")
        result["application"] = {"served": True, "originalDictionaryApi": True, "savedQueries": list(sql),
                                  "report": definition["name"], "workbook": workbook["name"]}
        server.shutdown(); server.server_close(); worker.join(); server = worker = None
        review = workspace.archives.review()
        require(review["ready"], "Complete customer workspace must include every referenced output")
        archive = complete(workspace, "workspace-export", {"id": identifier("workspace-export"), "include_previous_backups": False})
        archive_source = Path(archive["result"]["directory"]) / "workspace.zip"
        archive_file = out / "Zurich_Customer_Workspace.zip"
        result["workspaceArchive"] = keep(archive_file, read(archive_source, 256 * 1024 * 1024))
        inspection = inspect_archive(archive_file, expected_sha256=result["workspaceArchive"]["sha256"])
        result["workspaceArchive"].update(payloadFiles=len(inspection["manifest"]["files"]), workspaceId=workspace.identity)
        dump(record_path, result)
    except Exception as error:
        result["state"] = "INCOMPLETE"
        result["error"] = {"type": type(error).__name__, "message": str(error)}
        dump(record_path, result)
        raise
    finally:
        if server is not None:
            if worker is not None and worker.is_alive():
                server.shutdown()
            server.server_close()
        if worker is not None:
            worker.join()
        workspace.close()
    received_directory = out / "customer-received"
    receiving = restore_archive(out / "Zurich_Customer_Workspace.zip", received_directory,
                                operation=identifier("workspace-receive"),
                                expected_sha256=result["workspaceArchive"]["sha256"])
    reopened = AnalysisWorkspace(received_directory)
    try:
        require(reopened.identity == result["workspaceId"], "Received customer workspace identity changed")
        state = reopened.state()
        require({item["name"] for item in state["queries"]} == set(sql), "Received editable query set differs")
        observed = reopened.database.query(sql["PortalDaily"], max_rows=10, expected_views=views)
        require([dict(zip(observed.columns, row)) for row in observed.rows] == result["daily"], "Cold-reopened daily analysis differs")
        for version, dictionary in expected.items():
            require(reopened.database.semantics(version)["document"] == dictionary, "Cold-reopened source dictionary differs")
        require(reopened.reports.definition("ZurichPortalUse")["sha256"] == result["report"]["definitionSha256"],
                "Cold-reopened report definition changed")
        for exported in result["queryExports"].values():
            QueryExport(received_directory / "analysis-query-exports" / exported["id"]).inspect()
        WorkbookDelivery(received_directory / "analysis-workbooks" / result["workbook"]["id"]).inspect()
        result["coldReopen"] = {"operationId": receiving["operation_id"], "workspaceId": reopened.identity,
                                 "rows": 8210, "queries": len(sql), "originalDictionaries": 2,
                                 "completeQueryExports": 2, "completeWorkbook": True}
    finally:
        reopened.close()
    result["state"] = "COMPLETE"
    result.pop("error", None)
    dump(record_path, result)
    print(json.dumps({"operation": OPERATION, "state": "COMPLETE", "rows": 8210,
                      "daily": result["daily"], "workspaceArchive": result["workspaceArchive"]}), flush=True)


if __name__ == "__main__":
    main()
