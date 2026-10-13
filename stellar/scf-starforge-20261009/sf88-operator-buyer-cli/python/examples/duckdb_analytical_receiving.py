"""Operate the original accepted source through the complete analytical workbook."""
from __future__ import annotations
import argparse, ast, base64, csv, gzip, hashlib, io, json, os, re, shutil, subprocess, sys, threading, zipfile
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

OPERATION = "SCF-DUCKDB-ANALYTICAL-WORKBOOK-5EEE-20261012"
INPUT_SHA256 = "2da55e7d4399ab96a530451c99b75b64472f0041b690e862650bc60a1f4a42ac"

def require(value, message):
    if not value: raise RuntimeError(message)

def digest(raw): return hashlib.sha256(raw).hexdigest()


def retain_original_file(target, data):
    """Atomically retain this original complete member, recovering its exact prefix."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    previous = None
    if target.exists() or target.is_symlink():
        require(target.is_file() and not target.is_symlink(), "Use the original regular receiving member")
        previous = target.stat()
        actual = target.read_bytes()
        if actual == data:
            target.chmod(0o600)
            with target.open("rb") as existing:
                os.fsync(existing.fileno())
            fd = os.open(target.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
            return
        require(len(actual) < len(data) and data.startswith(actual),
                "A different original receiving member already exists")
    temporary = target.with_name("." + target.name + "." + os.urandom(12).hex() + ".receiving")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        if previous is None:
            try:
                os.link(temporary, target)
            except FileExistsError:
                require(target.is_file() and not target.is_symlink() and target.read_bytes() == data,
                        "The original receiving member changed during publication")
        else:
            current = target.stat()
            require(not target.is_symlink()
                    and (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns)
                    == (previous.st_dev, previous.st_ino, previous.st_size, previous.st_mtime_ns),
                    "The partial original receiving member changed during recovery")
            os.replace(temporary, target)
        fd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass

def run(args):
    os.umask(0o077)
    root = Path(args.directory).absolute()
    root.mkdir(parents=True, exist_ok=True)
    original = root / "original"
    raw = Path(args.input).read_bytes()
    require(len(raw) == 227992 and digest(raw) == INPUT_SHA256, "Original accepted input changed")
    with zipfile.ZipFile(io.BytesIO(raw)) as source:
        for item in source.infolist():
            path = Path(item.filename)
            require(not path.is_absolute() and ".." not in path.parts, "Original archive path changed")
            if item.is_dir(): continue
            target = original / path
            target.parent.mkdir(parents=True, exist_ok=True)
            data = source.read(item)
            retain_original_file(target, data)
    old = json.loads((original / "receiving.json").read_text())
    require(old["state"] == "COMPLETE" and old["steps"]["edition"]["rows"] == 32,
            "Use the completed original C271 source delivery")
    record_path = root / "analytical-receiving.json"
    record = json.loads(record_path.read_text()) if record_path.exists() else {
        "schema": "stellar-forge.duckdb-analytical-receiving.v1", "operation": OPERATION,
        "input": {"bytes": len(raw), "sha256": INPUT_SHA256, "original_workspace_id": old["workspace_id"]},
        "source_commit": args.source_commit, "steps": {}}
    require(record["input"]["sha256"] == INPUT_SHA256, "Continue the original input")
    def keep(name, value):
        record["steps"][name] = value
        record["updated_at"] = datetime.now(timezone.utc).isoformat()
        dump(record_path, record)
        print(json.dumps({"step": name, "state": "COMPLETE"}, ensure_ascii=False), flush=True)
        return value
    def request_id(name): return digest((OPERATION + ":" + name).encode())[:32]
    sys.path.insert(0, str(Path(args.package).resolve()))
    from stellar_forge_buyer.duckdb_dataset import DuckDBWorkspace, _qid, _wire
    from stellar_forge_buyer.duckdb_http import serve
    from stellar_forge_buyer.duckdb_analytics.contracts import NUMERIC
    from stellar_forge_buyer.duckdb_analytics.model import Analytics
    from stellar_forge_buyer.duckdb_analytics.package import inspect_package, receive_package
    from stellar_forge_buyer.storage import dump, parse, write
    for path in (Path(args.package) / "stellar_forge_buyer" / "duckdb_analytics").rglob("*.py"):
        ast.parse(path.read_bytes(), filename=str(path))
    record["state"] = "RUNNING"
    record.pop("completed_at", None)
    keep("source_runtime", {"python": sys.version.split()[0], "source_commit": args.source_commit, "python_parse": "passed"})
    working = root / "warehouse"
    working.mkdir(exist_ok=True)
    closed = root / "warehouse-closed"
    if closed.exists() and not (working / "warehouse.duckdb").exists():
        closed.rename(working)
    snapshot = original / "portable" / "warehouse.duckdb"
    descriptor = next(row for row in old["steps"]["portable_receiving"]["files"] if row["name"] == "warehouse.duckdb")
    require(snapshot.stat().st_size == descriptor["bytes"] and digest(snapshot.read_bytes()) == descriptor["sha256"],
            "Original portable database changed")
    warehouse_file = working / "warehouse.duckdb"
    copy_pending = not any(name != "source_runtime" for name in record["steps"])
    if not warehouse_file.exists():
        retain_original_file(warehouse_file, snapshot.read_bytes())
    elif copy_pending and warehouse_file.is_file() and not warehouse_file.is_symlink():
        # The old caller could stop during its first direct copy, before any
        # workspace/native step. Repair only a shorter exact source prefix in
        # that phase. An existing operated database remains its own live state.
        if warehouse_file.stat().st_size < descriptor["bytes"]:
            prefix, source_bytes = warehouse_file.read_bytes(), snapshot.read_bytes()
            if source_bytes.startswith(prefix):
                retain_original_file(warehouse_file, source_bytes)
    workspace = DuckDBWorkspace(working, memory_limit="256MB", threads=1)
    require(workspace.identity()["workspace_id"] == old["workspace_id"], "Original workspace identity changed")
    keep("workspace_opened", {"workspace_id": old["workspace_id"], "original_source": descriptor,
                             "directory": str(working)})
    model = Analytics(workspace)
    server, control, launch = serve(workspace, export_root=root / "exports", handoff_root=root / "handoffs")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base, capability = launch.split("#", 1)
    workspace_id = old["workspace_id"]
    def request(path, body=None, binary=False):
        headers = {"X-DuckDB-Capability": capability, "X-DuckDB-Workspace-ID": workspace_id, "Origin": base.rstrip("/")}
        data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        if data is not None: headers["Content-Type"] = "application/json"
        with urlopen(Request(base.rstrip("/") + path, data=data, headers=headers), timeout=180) as response:
            value = response.read()
            return value if binary else json.loads(value)
    def action(kind, name, **body):
        return request("/api/analytics/" + kind, {"request_id": request_id(name), "workspace_id": workspace_id, **body})
    def save_analysis(name, definition, expected):
        review = request("/api/analytics/review", {"definition": definition})
        saved = action("analyses", name, definition=definition, expected_revision=expected, review_sha256=review["review_sha256"])
        require(saved["review"]["review_sha256"] == review["review_sha256"], "Saved native review changed")
        return saved, review
    def execute(name, saved):
        return action("run", name, analysis_id=saved["id"], revision=saved["revision"])
    def continue_original_query(original_query):
        """Keep the original later query revision when this same caller resumes."""
        with workspace._guard(), workspace._connection(writeable=True) as db:
            db.execute("BEGIN")
            try:
                current = workspace._record(db, "sf_queries", original_query["query_id"])
                expected = original_query["revision"]
                desired_sql = workspace._sql("SELECT 1 AS current_draft", [])
                if current["revision"] == expected:
                    require(all(current.get(key) == original_query.get(key)
                                for key in ("query_id", "name", "revision", "sql", "parameters")),
                            "Original published query revision changed")
                    successor = workspace._save_query_on(db, original_query["name"], desired_sql,
                                                         parameters=[], expected_revision=expected)
                else:
                    require(current["revision"] > expected, "Original query history moved backwards")
                    historical = db.execute("SELECT record FROM sf_query_history WHERE id=? AND revision=?",
                                            [original_query["query_id"], expected + 1]).fetchone()
                    require(historical is not None, "Original receiving query successor is absent")
                    successor = parse(historical[0].encode("utf-8"))
                    require(successor["query_id"] == original_query["query_id"]
                            and successor["name"] == original_query["name"]
                            and successor["revision"] == expected + 1
                            and successor["sql"] == desired_sql and successor["parameters"] == [],
                            "A different original query edit owns this revision")
                db.commit()
                return successor
            except BaseException:
                db.rollback()
                raise

    def rows(kind, identity):
        values, offset = [], 0
        while True:
            page = request("/api/analytics/" + kind + "/" + identity + "/rows?offset=" + str(offset) + "&limit=7")
            values.extend(page["rows"])
            if page["next_offset"] is None:
                require(len(values) == page["total"], "Complete result pagination changed")
                return values
            offset = page["next_offset"]
    try:
        original_edition = workspace.edition(old["steps"]["edition"]["edition_id"])
        source = request("/api/analytics/sources/" + original_edition["edition_id"])
        columns = source["columns"]
        candidates = [c for c in columns if c["distinct_non_null"] > 0 and c["name"] != "sf_row"]
        dimensions = sorted(candidates, key=lambda c: (
            not (1 < c["distinct_non_null"] < original_edition["row_count"]),
            not any(x in c["name"].lower() for x in ("area", "zone", "direction", "type", "date", "time")),
            c["distinct_non_null"], c["name"]))
        require(dimensions, "Original source has no analytical column")
        dimension = dimensions[0]
        measure_candidates = [c for c in candidates if NUMERIC.fullmatch(c["type"]) and c != dimension
                              and not any(x in c["name"].lower() for x in ("_id", "index", "year", "month", "day"))]
        measure_candidates.sort(key=lambda c: (not any(x in c["name"].lower() for x in ("value", "capacity", "flow", "mw", "amount")), c["name"]))
        measure = measure_candidates[0] if measure_candidates else None
        metrics = [{"name": "Rows", "aggregate": "count_rows", "nulls": "exclude",
                    "note": "Count of original source observations."}]
        if measure:
            metrics += [{"name": "Source value total", "aggregate": "sum", "column": measure["name"], "nulls": "exclude",
                         "note": "Original " + measure["source"] + " values; units and definitions remain in the original dictionary."},
                        {"name": "Source value average", "aggregate": "avg", "column": measure["name"], "nulls": "exclude",
                         "note": "Arithmetic mean over non-null source values."}]
        definition = {"name": "OriginalSourceAnalysis", "title": 'Original source <analysis> & retained meaning',
            "description": "All original source observations, grouped by the selected original field.",
            "edition_id": original_edition["edition_id"],
            "dimensions": [{"column": dimension["name"], "name": "Source group", "transform": "identity"}],
            "measures": metrics, "filters": [], "order": [{"column": "Source group", "direction": "asc", "nulls": "last"}]}
        saved, review = save_analysis("analysis-original-v1", definition, 0)
        result = execute("execute-original-v1", saved)
        require(execute("execute-original-v1", saved) == result, "Original execution did not resume identically")
        baseline_rows = rows("results", result["result_id"])
        require(sum(int(row[1]) for row in baseline_rows) == 32, "Native grouped counts lost original rows")
        require(result["totals"]["values"][0] == 32, "Independent original-row total changed")
        keep("original_analysis", {"definition": saved, "review": review, "result": result, "complete_rows": baseline_rows})
        values = request("/api/analytics/sources/" + original_edition["edition_id"] + "?column=" + quote(dimension["name"], safe="") + "&limit=100")
        selected = next(item["value"] for item in values["values"] if item["value"] is not None)
        filtered = deepcopy(definition)
        filtered["title"] = "Selected original source group"
        filtered["description"] = "The equality filter selects the retained actual source value; comparison is a scope comparison."
        filtered["filters"] = [{"column": dimension["name"], "operator": "eq", "value": selected, "nulls": "exclude"}]
        updated, filtered_review = save_analysis("analysis-original-v2", filtered, saved["revision"])
        filtered_result = execute("execute-original-v2", updated)
        comparison = action("compare", "scope-comparison", before_id=result["result_id"], after_id=filtered_result["result_id"],
            keys=["Source group"], title="Complete source versus selected original group")
        require(model.record("analyses", saved["id"], saved["revision"]) == saved, "Original analysis revision changed")
        keep("selected_scope", {"analysis": updated, "result": filtered_result, "comparison": comparison,
                               "complete_comparison_rows": rows("comparisons", comparison["comparison_id"])})
        if old["steps"].get("comparison", {}).get("candidate"):
            candidate = workspace.edition(old["steps"]["comparison"]["candidate"])
            by_source = {c["source"]: c["name"] for c in candidate["columns"]}
            mapping_definition = deepcopy(definition)
            mapping_definition["name"] = "OriginalMappingAnalysis"
            mapping_definition["title"] = "Same original rows under the retained second mapping"
            mapping_definition["edition_id"] = candidate["edition_id"]
            for item in mapping_definition["dimensions"]:
                original_column = next(c for c in columns if c["name"] == item["column"])
                item["column"] = by_source[original_column["source"]]
            for item in mapping_definition["measures"]:
                if "column" in item:
                    original_column = next(c for c in columns if c["name"] == item["column"])
                    item["column"] = by_source[original_column["source"]]
            mapped, _ = save_analysis("mapping-analysis", mapping_definition, 0)
            mapped_result = execute("mapping-result", mapped)
            same = action("compare", "mapping-comparison", before_id=result["result_id"], after_id=mapped_result["result_id"],
                          keys=["Source group"], title="Original source mapping editions")
            require(set(same["summary"]) <= {"unchanged"} and same["row_count"] == result["row_count"],
                    "A reviewed alias change altered actual source measures")
            keep("mapping_editions", {"analysis": mapped, "result": mapped_result, "comparison": same})
        pivot_definition = deepcopy(definition)
        pivot_definition["name"] = "OriginalSourcePivot"
        pivot_definition["title"] = "Explicit original source categories"
        pivot_definition["pivot"] = {"column": dimension["name"], "values": [{"value": selected, "label": "Selected source value"}],
            "include_null": True, "include_other": True, "null_label": "Source NULL", "other_label": "Other original values"}
        pivot, _ = save_analysis("pivot-analysis", pivot_definition, 0)
        pivot_result = execute("pivot-result", pivot)
        require(pivot_result["pivot_coverage"]["selected_rows"] == 32 and pivot_result["pivot_coverage"]["unselected_rows"] == 0,
                "Explicit pivot coverage lost original observations")
        keep("pivot", {"analysis": pivot, "result": pivot_result, "complete_rows": rows("results", pivot_result["result_id"])})
        def page(title, kind, source_kind, value, **extra):
            return {"title": title, "kind": kind, "source_kind": source_kind,
                    "source_id": value["result_id" if source_kind == "result" else "comparison_id"],
                    "columns": [c["name"] for c in value["columns"]], **extra}
        pages = [
            {"title": "Source and analytical scope", "kind": "text",
             "text": "This workbook receives the original completed 32-row source. Source field: " + dimension["source"] +
                     ". Every result retains its source edition, selected scope, typed measures and original meanings. < & > remain literal editorial text."},
            page("Every original group", "table", "result", result),
            page("Observation counts", "bar", "result", result, x="Source group", y=["Rows"], chart_limit=200),
            page("Original groups in retained sort order", "line", "result", result, x="Source group", y=["Rows"], chart_limit=200),
            page("Selected-scope comparison", "table", "comparison", comparison),
            page("Explicit category pivot", "table", "result", pivot_result)]
        if "mapping_editions" in record["steps"]:
            pages.append(page("Source mapping comparison", "table", "comparison", record["steps"]["mapping_editions"]["comparison"]))
        workbook_definition = {"name": "OriginalSourceWorkbook", "title": "Original source analytical workbook",
            "author": "Commons analyst receiving", "description": "Complete editable receiving of original acquired source observations.", "pages": pages}
        workbook = action("workbooks", "workbook-v1", definition=workbook_definition, expected_revision=0)
        second_definition = deepcopy(workbook_definition)
        second_definition["description"] += " Ordered page edition 2."
        second_definition["pages"][2], second_definition["pages"][3] = second_definition["pages"][3], second_definition["pages"][2]
        workbook2 = action("workbooks", "workbook-v2", definition=second_definition, expected_revision=workbook["revision"])
        report = action("publish", "report-v2", workbook_id=workbook2["id"], revision=workbook2["revision"])
        later_definition = deepcopy(second_definition)
        later_definition["description"] += " Subsequent editable draft retained separately."
        later = action("workbooks", "workbook-v3", definition=later_definition, expected_revision=workbook2["revision"])
        require(model.record("reports", report["report_id"])["workbook_revision"] == workbook2["revision"],
                "Published report followed a subsequent workbook edit")
        query = result["query"]
        current_query = request("/api/queries/" + quote(query["query_id"], safe=""))
        require(current_query["query_id"] == query["query_id"] and current_query["name"] == query["name"],
                "Original saved-query identity changed")
        retained_publication = record["steps"].get("published_report")
        if retained_publication is not None:
            require(retained_publication["report"]["report_id"] == report["report_id"],
                    "Continue the same retained publication")
            later_revision = retained_publication["later_original_query_revision"]
            require(type(later_revision) is int and later_revision > query["revision"]
                    and current_query["revision"] >= later_revision,
                    "Retained later-query revision is unavailable")
        successor = continue_original_query(query)
        if retained_publication is not None:
            require(successor["revision"] == later_revision,
                    "Original receiving query successor changed")
        else:
            later_revision = successor["revision"]
        current_query = request("/api/queries/" + quote(query["query_id"], safe=""))
        require(current_query["query_id"] == query["query_id"] and current_query["name"] == query["name"]
                and current_query["revision"] >= later_revision,
                "Retained later-query revision is unavailable")
        keep("published_report", {"workbook": workbook2, "later_workbook": later, "report": report,
                                  "later_original_query_revision": later_revision,
                                  "current_original_query_revision": current_query["revision"]})
        export_body = {"request_id": request_id("report-export"), "report_id": report["report_id"]}
        exported = request("/api/analytics/exports", export_body)
        require(request("/api/analytics/exports", export_body) == exported, "Original complete export did not resume identically")
        inspected = inspect_package(exported["directory"], expected_manifest_sha256=exported["manifest_sha256"])
        received_files = root / ("downloaded-original-package" if args.node_helper else "downloaded-package")
        received_files.mkdir(exist_ok=True)
        for item in exported["files"]:
            if item["name"] not in {"analytical-workbook.zip", "report.html", "manifest.json"}: continue
            body = request("/api/exports/" + exported["export_id"] + "/file?name=" + quote(item["name"], safe=""), binary=True)
            require(len(body) == item["bytes"] and digest(body) == item["sha256"], "Original HTTP file changed")
            destination = received_files / item["name"]
            retain_original_file(destination, body)
        html = (received_files / "report.html").read_text()
        require("<svg" in html and "&lt; &amp; &gt;" in html, "Original rendered chart/editorial receiving changed")
        keep("complete_export", {"export": exported, "files": len(inspected["files"]), "downloaded": [
            {"name": p.name, "bytes": p.stat().st_size, "sha256": digest(p.read_bytes())} for p in sorted(received_files.iterdir())]})
        if args.node_helper:
            node_input = root / "node-input.json"
            node_input.write_text(json.dumps({"operation_id": OPERATION, "source_root": args.source_root, "workspace": str(working),
                "native_root": str(root / "native-agent"), "workspace_id": workspace_id, "launch": launch,
                "original_edition": original_edition["edition_id"], "analysis": saved["id"], "result": result["result_id"],
                "workbook": workbook2["id"], "report": report["report_id"], "export": exported,
                "directory": str(root), "browser": args.browser}))
            command = [args.node or shutil.which("node"), args.node_helper, str(node_input)]
            completed = subprocess.run(command, capture_output=True, text=True, timeout=240,
                env={**os.environ, "TMPDIR": str(root)})
            (root / "node-receiving.stdout").write_text(completed.stdout)
            (root / "node-receiving.stderr").write_text(completed.stderr)
            require(completed.returncode == 0, "Original browser/MCP receiving needs its retained native error")
            browser_and_agent = json.loads((root / "node-receiving.json").read_text())
            keep("browser_and_agent", browser_and_agent)
            browser_receiving = browser_and_agent["steps"]["browser_workspace"]
            require(browser_receiving["state"] == "COMPLETE"
                    and browser_receiving["input"]["workspace_id"] == workspace_id
                    and browser_receiving["input"]["report_id"] == report["report_id"],
                    "Continue the original browser workspace and pinned report")
            browser_export = browser_receiving["export"]
            selected_export = request("/api/exports/" + quote(browser_export["export_id"], safe=""))
            require(selected_export["workspace_id"] == workspace_id
                    and selected_export["report_id"] == report["report_id"]
                    and selected_export["state"] == "COMPLETE"
                    and selected_export["manifest_sha256"] == browser_export["manifest_sha256"]
                    and selected_export["archive"]["sha256"] == browser_export["archive"]["sha256"]
                    and selected_export["archive"]["bytes"] == browser_export["archive"]["bytes"]
                    and all(selected_export["browser_workspace"].get(key) == browser_receiving["browser"].get(key)
                            for key in ("id", "revision", "state_sha256")),
                    "The selected complete edited-workbook export changed")
            browser_archive = root / "browser-workspace-receiving" / browser_receiving["files"]["portable_export"]["name"]
            browser_bytes = browser_archive.read_bytes()
            require(len(browser_bytes) == selected_export["archive"]["bytes"]
                    and digest(browser_bytes) == selected_export["archive"]["sha256"],
                    "The original complete edited-workbook download changed")
            received_files = root / "downloaded-edited-package"
            received_files.mkdir(exist_ok=True)
            for item in selected_export["files"]:
                if item["name"] not in {"analytical-workbook.zip", "report.html", "manifest.json"}:
                    continue
                body = browser_bytes if item["name"] == "analytical-workbook.zip" else request(
                    "/api/exports/" + selected_export["export_id"] + "/file?name=" + quote(item["name"], safe=""),
                    binary=True)
                require(len(body) == item["bytes"] and digest(body) == item["sha256"],
                        "The complete received edited-workbook file changed")
                destination = received_files / item["name"]
                retain_original_file(destination, body)
            inspected = inspect_package(selected_export["directory"],
                                        expected_manifest_sha256=selected_export["manifest_sha256"])
            exported = selected_export
            keep("complete_edited_export", {"export": exported, "files": len(inspected["files"]),
                "browser_workspace": exported["browser_workspace"], "downloaded": [
                    {"name": path.name, "bytes": path.stat().st_size, "sha256": digest(path.read_bytes())}
                    for path in sorted(received_files.iterdir())]})
    finally:
        server.shutdown(); server.server_close(); thread.join(); workspace.close()
    if not closed.exists(): working.rename(closed)
    browser_selection = exported.get("browser_workspace")
    receiving_prefix = "edited-" if browser_selection is not None else ""
    extracted = root / (receiving_prefix + "independent-package")
    with zipfile.ZipFile(received_files / "analytical-workbook.zip") as archive:
        for item in archive.infolist():
            name = Path(item.filename)
            require(not name.is_absolute() and ".." not in name.parts and not item.is_dir(), "Package member changed")
            path = extracted / name
            path.parent.mkdir(parents=True, exist_ok=True)
            body = archive.read(item)
            retain_original_file(path, body)
    cold = root / (receiving_prefix + "independent-workspace")
    receipt = receive_package(extracted, cold, expected_manifest_sha256=exported["manifest_sha256"],
                              expected_workspace_id=workspace_id)
    repeated = receive_package(extracted, cold, expected_manifest_sha256=exported["manifest_sha256"],
                               expected_workspace_id=workspace_id)
    require(repeated["reused"] and receipt["reopened"] == repeated["reopened"], "Original receiving did not reopen identically")
    if exported.get("browser_workspace") is not None:
        require(receipt["reopened"].get("browser_workspace") == exported["browser_workspace"],
                "The independent received browser revision changed")
    cli_env = {**os.environ, "PYTHONPATH": str(extracted / "application") + os.pathsep + os.pathsep.join(sys.path)}
    completed = subprocess.run([sys.executable, "-B", "-m", "stellar_forge_buyer.duckdb_cli", "--workspace", str(cold),
                               "analytics", "record", "reports", report["report_id"]],
                              env=cli_env, capture_output=True, text=True, timeout=120)
    (root / (receiving_prefix + "cold-cli.stdout")).write_text(completed.stdout)
    (root / (receiving_prefix + "cold-cli.stderr")).write_text(completed.stderr)
    require(completed.returncode == 0 and json.loads(completed.stdout)["report_id"] == report["report_id"],
            "Packaged application CLI did not reopen the retained report")
    with DuckDBWorkspace(cold, memory_limit="256MB", threads=1) as independent:
        received_model = Analytics(independent)
        original_report = received_model.record("reports", report["report_id"])
        checked = [received_model.validate_result("results" if key.startswith("result:") else "comparisons", key.split(":")[1])
                   for key in original_report["sources"]]
        require(all(row["matched"] for row in checked), "Independent full-result fingerprint changed")
        dictionaries = {identity: digest(independent.semantics_bytes(identity)) for identity in original_report["source_editions"]}
        keep("edited_independent_receiving" if browser_selection is not None else "independent_receiving", {
            "receipt": receipt, "reused": repeated["reused"],
            "package": str(extracted), "workspace": str(cold),
            "full_results": checked, "original_dictionaries": dictionaries, "packaged_cli": "passed",
            "browser_workspace": receipt["reopened"].get("browser_workspace")})
    record["state"] = "COMPLETE"
    record["completed_at"] = datetime.now(timezone.utc).isoformat()
    dump(record_path, record)
    raw = record_path.read_bytes()
    print(json.dumps({"state": "COMPLETE", "result": str(record_path), "bytes": len(raw), "sha256": digest(raw),
                      "gzip_base64": base64.b64encode(gzip.compress(raw, mtime=0)).decode()}), flush=True)
    return record

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--package", required=True)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--node-helper")
    parser.add_argument("--node")
    parser.add_argument("--browser", default="/workspace/scratch/dba55fe4658b/kzfr-source-review/chromium/chrome-headless-shell-linux64/chrome-headless-shell")
    run(parser.parse_args())

if __name__ == "__main__": main()
