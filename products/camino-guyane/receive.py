#!/usr/bin/env python3
"""Receive retained Camino editions into the maintained Analysis workspace.

All source files are local, immutable originals selected by the receiving owner.
The application never recaptures an HTTP source or creates a commercial send.
"""
from __future__ import annotations
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, localcontext
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import sys
import time

BASE = "stellar/scf-starforge-20261009"
PYTHON = BASE + "/sf88-operator-buyer-cli/python"
SOURCE = BASE + "/sf30-seller-sdk/datasette-analysis/source.py"
PARSER = "products/conapi/supplier-report/supplier-report.mjs"
INDEX_SHA = "ad6d931300d82418ee297ef7259ae94456dbd8e8621e779bd2c99963e585700f"
PUBLISHER = "Camino-original-complete-Guyane-publisher-export-20261013.csv"
TABULAR = "FEDOMG-Camino-complete-Guyane-tabular-export-20261013.csv"
SOURCE_URLS = {
    "publisher": "https://api.camino.developpement-durable.gouv.fr/titres?departements=973&format=csv",
    "tabular": "https://tabular-api.data.gouv.fr/api/resources/df16a407-5292-4f03-b8b7-f028b66b5150/data/csv/?departements__exact=Guyane",
}
INTRODUCTION = (
    "Camino public administrative mining-title editions for Guyane. Counts refer to titles "
    "and applications in the selected editions; they are not counts of operating mines. "
    "The publisher department=973 selection and data.gouv exact-Guyane selection are "
    "independent captures. Membership, raw strings and date differences remain visible. "
    "Publisher DD-MM-YYYY dates are interpreted explicitly, supported by the retained "
    "original REST contract; the tabular ISO representation remains unchanged. "
    "Reported km² are exact decimal sums by stated status, including overlaps. They are "
    "not a geographical union, an active mining footprint or measured production. "
    "Missing administrative dates remain distinct from reversed or invalid periods. "
    "Geometry review covers JSON structure and coordinate ranges, not topological validity. "
    "Complete original files, source contracts and calculation source travel with this workspace."
)

def need(condition, message):
    if not condition:
        raise ValueError(message)

def raw(path):
    path = Path(path)
    need(path.is_file() and not path.is_symlink(), "Regular original file required: " + str(path))
    return path.read_bytes()

def sha(content):
    return hashlib.sha256(content).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False, indent=2) + "\n").encode("utf-8")

def read_json(path):
    return json.loads(raw(path))

def private(path):
    path = Path(path).absolute()
    need(not path.is_symlink(), "Private path cannot be a symbolic link")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(path, 0o700)
    return path

def immutable(path, content):
    import tempfile
    path = Path(path)
    private(path.parent)
    if path.exists():
        need(raw(path) == content, "Retained bytes changed: " + str(path))
        return path
    fd, name = tempfile.mkstemp(prefix="." + path.name + "-", dir=path.parent)
    pending = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(pending, path)
        except FileExistsError:
            need(raw(path) == content, "Concurrent retained bytes changed: " + str(path))
        pending.unlink()
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        pending.unlink(missing_ok=True)
    return path

def save(path, value):
    path = Path(path)
    private(path.parent)
    temp = path.with_name(path.name + ".pending")
    content = encoded(value)
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

def identifier(operation, phase):
    return sha((operation + "\n" + phase).encode())[:32]

def runtime(root):
    root = Path(root).absolute()
    sys.path.insert(0, str(root / PYTHON))
    location = root / SOURCE
    module_spec = importlib.util.spec_from_file_location("camino_original_datasette_source", location)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    # The coherent runtime descriptor supplies the exact maintained parser path.
    candidates = [root / PARSER] if (root / PARSER).is_file() else []
    need(len(candidates) == 1, "One retained maintained supplier CSV parser required")
    import openpyxl
    need(openpyxl.__version__ == "3.1.5", "Original openpyxl 3.1.5 required")
    from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace
    return root, module, candidates[0], AnalysisWorkspace

def original_inputs(manifest_path, root):
    manifest = read_json(manifest_path)
    need(manifest.get("schema") == "commons.camino-received-inputs.v1", "Received input schema")
    need(manifest.get("source_index_sha256") == INDEX_SHA, "Original complete source-index binding")
    records = manifest.get("files")
    need(isinstance(records, list) and len(records) == 21, "All 21 original inputs required")
    names, originals, retained = set(), [], {}
    for ordinal, item in enumerate(records, 1):
        name = item.get("filename")
        need(isinstance(name, str) and Path(name).name == name and name not in names, "Unique input filename")
        names.add(name)
        content = raw(item["path"])
        need(len(content) == item["bytes"] and sha(content) == item["sha256"], "Whole input identity changed: " + name)
        path = immutable(root / "originals" / name, content)
        retained[name] = {**item, "path": str(path)}
        originals.append({"name": name, "raw": content, "content_type": "application/octet-stream",
                          "role": "camino-original-" + str(ordinal).zfill(3)})
    need(PUBLISHER in retained and TABULAR in retained, "Both complete CSV editions required")
    need(retained[PUBLISHER]["bytes"] == 1482839 and retained[TABULAR]["bytes"] == 1516924,
         "Original selected CSV byte lengths changed")
    binding = {"schema": manifest["schema"], "source_index_sha256": INDEX_SHA,
               "files": [{k: item[k] for k in ("filename", "bytes", "sha256")} for item in sorted(records, key=lambda x: x["filename"])]}
    immutable(root / "input-binding.json", encoded(binding))
    originals.append({"name": "received-input-manifest.json", "raw": encoded(manifest),
                      "content_type": "application/json", "role": "camino-input-manifest"})
    return retained, originals, sha(encoded(binding))

def csv_edition(adapter, parser, item, label, captured, node):
    selection = {
        "schema": adapter.HANDOVER_SCHEMA,
        "delivery": {"kind": "csv-source", "csv": item["path"], "sha256": item["sha256"],
                     "parser": str(parser), "parser_sha256": sha(raw(parser))},
        "source": {"url": SOURCE_URLS[label], "title": "Camino Guyane — " + label,
                   "publisher": "Camino / data.gouv.fr" if label == "tabular" else "Camino",
                   "captured_at": captured, "publisherEdition": "Retained 2026-10-13 selection",
                   "license": "See complete retained publisher catalogue and source contracts."},
        "review": {"keys": ["id"]},
    }
    result = adapter.read_csv_source(selection, node=node)
    mapping = result["source"]["column_mapping"]
    original_rows = [{column: row[alias] for column, alias in mapping.items()} for row in result["rows"]]
    required = {"id", "nom", "date_debut", "date_fin", "type", "statut", "substances",
                "surface renseignee km2", "departements", "geojson"}
    need(required <= set(mapping), "Required original Camino fields absent: " + label)
    ids = [row["id"] for row in original_rows]
    need(all(ids) and len(ids) == len(set(ids)), "Missing or duplicate title IDs: " + label)
    return result, original_rows

def date_value(value, publisher):
    if value == "":
        return None, "missing"
    pattern = r"\d{2}-\d{2}-\d{4}" if publisher else r"\d{4}-\d{2}-\d{2}"
    if not re.fullmatch(pattern, value):
        return None, "invalid"
    try:
        result = datetime.strptime(value, "%d-%m-%Y" if publisher else "%Y-%m-%d").date().isoformat()
        return result, "known"
    except ValueError:
        return None, "invalid"

def area_value(value):
    if value == "":
        return None, "missing"
    if not re.fullmatch(r"[+-]?\d+(?:\.\d+)?", value):
        return None, "invalid"
    try:
        area = Decimal(value)
    except InvalidOperation:
        return None, "invalid"
    if not area.is_finite() or len(area.as_tuple().digits) > 40:
        return None, "invalid"
    return area, "positive" if area > 0 else "zero" if area == 0 else "negative"

def geometry(value):
    if value == "":
        return "missing", "", None, None, None, None, 0
    try:
        item = json.loads(value, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
        kind = item.get("type") if isinstance(item, dict) else None
        depths = {"Point": 0, "MultiPoint": 1, "LineString": 1, "MultiLineString": 2, "Polygon": 2, "MultiPolygon": 3}
        need(kind in depths, "Unsupported geometry structure")
        points = []
        def walk(coordinates, depth):
            need(isinstance(coordinates, list) and coordinates, "Empty coordinates")
            if depth == 0:
                need(len(coordinates) >= 2 and all(type(n) in (int, float) and math.isfinite(n) for n in coordinates), "Position")
                need(-180 <= coordinates[0] <= 180 and -90 <= coordinates[1] <= 90, "WGS84 range")
                points.append(coordinates[:2])
            else:
                for value in coordinates:
                    walk(value, depth - 1)
        walk(item.get("coordinates"), depths[kind])
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        return "structured-coordinate-review", kind, min(xs), min(ys), max(xs), max(ys), len(points)
    except (ValueError, TypeError, AttributeError, RecursionError):
        return "invalid-or-unsupported", "", None, None, None, None, 0

def derive(publisher, tabular):
    lookup = {row["id"]: row for row in tabular}
    publisher_ids = {row["id"] for row in publisher}
    titles, differences, tokens, areas = [], [], [], defaultdict(list)
    coverage = Counter()
    for row in publisher:
        title_id, status = row["id"], row["statut"]
        before, before_quality = date_value(row["date_debut"], True)
        after, after_quality = date_value(row["date_fin"], True)
        period = ("reversed" if before and after and after < before else "known" if before and after
                  else "invalid" if "invalid" in (before_quality, after_quality) else "missing")
        area, area_quality = area_value(row["surface renseignee km2"])
        shape = geometry(row["geojson"])
        other = lookup.get(title_id)
        other_before, other_bq = date_value(other["date_debut"], False) if other else (None, "absent")
        other_after, other_aq = date_value(other["date_fin"], False) if other else (None, "absent")
        def semantic_equal(left, left_quality, right, right_quality):
            return (left_quality == right_quality == "known" and left == right) or left_quality == right_quality == "missing"
        start_equal = semantic_equal(before, before_quality, other_before, other_bq)
        end_equal = semantic_equal(after, after_quality, other_after, other_aq)
        date_match = "publisher-only" if other is None else "same" if start_equal and end_equal else "different"
        tabular_period = ("absent" if other is None else
                          "reversed" if other_before and other_after and other_after < other_before else
                          "known" if other_before and other_after else
                          "invalid" if "invalid" in (other_bq, other_aq) else "missing")
        departments = row["departements"].split(";") if row["departements"] else []
        item = {"title_id": title_id, "name": row["nom"], "status": status, "title_type": row["type"],
                "publisher_start_raw": row["date_debut"], "publisher_end_raw": row["date_fin"],
                "start_iso": before, "end_iso": after, "start_quality": before_quality,
                "end_quality": after_quality, "period_quality": period,
                "tabular_start_raw": other["date_debut"] if other else None,
                "tabular_end_raw": other["date_fin"] if other else None, "date_comparison": date_match,
                "tabular_start_quality": other_bq, "tabular_end_quality": other_aq, "tabular_period_quality": tabular_period,
                "reported_area_raw": row["surface renseignee km2"],
                "reported_area_km2": format(area, "f") if area is not None else None, "area_quality": area_quality,
                "departments_raw": row["departements"], "guyane_token_present": int("Guyane" in departments),
                "geometry_review": shape[0], "geometry_type": shape[1],
                "longitude_min": shape[2], "latitude_min": shape[3], "longitude_max": shape[4],
                "latitude_max": shape[5], "coordinate_count": shape[6]}
        titles.append(item)
        areas[status].append((area, area_quality))
        if other is None:
            differences.append({"title_id": title_id, "field": "membership", "publisher_raw": "present",
                                "tabular_raw": None, "meaning": "publisher selection only"})
        else:
            for field in sorted(set(row) | set(other)):
                left, right = row.get(field), other.get(field)
                if left != right:
                    meaning = "raw-representation-difference"
                    if field in ("date_debut", "date_fin"):
                        meaning = "same-interpreted-date" if (start_equal if field == "date_debut" else end_equal) else "date-review"
                    differences.append({"title_id": title_id, "field": field, "publisher_raw": left,
                                        "tabular_raw": right, "meaning": meaning})
        for field in ("substances", "titulaires_noms", "amodiataires_noms", "administrations_noms",
                      "departements", "regions", "communes (surface calculee km2)"):
            value = row.get(field, "")
            coverage[(field, status, "present" if value else "missing")] += 1
            # Semicolon is observed in the retained publisher CSV and remains visible.
            # Do not split commas, join organization name/address arrays, or strip municipality area text.
            for ordinal, token in enumerate(value.split(";") if value else [], 1):
                tokens.append({"title_id": title_id, "status": status, "field": field,
                               "ordinal": ordinal, "token": token, "is_empty": int(token == "")})
    for row in tabular:
        if row["id"] not in publisher_ids:
            differences.append({"title_id": row["id"], "field": "membership", "publisher_raw": None,
                                "tabular_raw": "present", "meaning": "tabular selection only"})
    totals = []
    for status, members in sorted(areas.items()):
        values = [value for value, _ in members if value is not None]
        scale = max([max(0, -value.as_tuple().exponent) for value in values] or [0])
        with localcontext() as context:
            context.prec = max(80, scale + 50 + len(str(len(values))))
            amount = sum(values, Decimal(0))
            total = format(amount, "." + str(scale) + "f") if values else None
        totals.append({"status": status, "title_count": len(members), "area_present": len(values),
                       "area_missing": sum(kind == "missing" for _, kind in members),
                       "area_invalid": sum(kind == "invalid" for _, kind in members),
                       "area_nonpositive": sum(kind in ("zero", "negative") for _, kind in members),
                       "reported_area_sum_km2": total, "decimal_scale": scale})
    cover = [{"field": field, "status": status, "coverage": kind, "title_count": count}
             for (field, status, kind), count in sorted(coverage.items())]
    # Uniform schemas permit meaningful empty collections without sentinel data rows.
    return {"titles": titles, "differences": differences, "tokens": tokens, "areas": totals, "coverage": cover}

def columns_for(key, rows):
    if rows:
        return list(rows[0])
    return {"differences": ["title_id", "field", "publisher_raw", "tabular_raw", "meaning"],
            "tokens": ["title_id", "status", "field", "ordinal", "token", "is_empty"]}[key]

def source_document(root, collections, originals, meaning):
    from stellar_forge_buyer.storage import private_directory, write
    document_root = private_directory(root / "source-document", create=True)
    def content(value, suffix, mime):
        digest = sha(value)
        relative = "files/" + digest + "." + suffix
        immutable(document_root / relative, value)
        return {"path": relative, "bytes": len(value), "sha256": digest, "contentType": mime}
    attachments = []
    for item in originals:
        attachments.append({**content(item["raw"], "bin", item["content_type"]), "role": item["role"]})
    attachments.append({**content(encoded(meaning), "json", "application/json"), "role": "camino-source-meaning"})
    need(len(attachments) <= 32 and len({x["role"] for x in attachments}) == len(attachments), "Original attachment roles")
    manifest = {
        "schema": "stellar-forge.analysis-source-document.v1", "title": "Camino Guyane complete edition review",
        "format": "json", "complete": True,
        "document": content(encoded({name: entry["rows"] for name, entry in collections.items()}), "json", "application/json"),
        "originals": attachments,
        "provenance": {"kind": "public-source", "publisher": "Camino; data.gouv.fr",
                       "sourceUrl": "https://api.camino.developpement-durable.gouv.fr/titres", "capturedAt": meaning["received_at"],
                       "scope": "Complete independently retained publisher Guyane and tabular exact-Guyane editions, all original fields and keyed differences.",
                       "description": INTRODUCTION,
                       "transform": {"name": "Camino original editions and administrative indicators",
                                     "sourceUrl": "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/camino-guyane/receive.py",
                                     "sha256": sha(raw(__file__))}}}
    return immutable(document_root / ("source-" + sha(encoded(manifest)) + ".json"), encoded(manifest))

class Course:
    def __init__(self, workspace, operation, attempt, root):
        self.analysis, self.operation, self.attempt, self.root = workspace, operation, attempt, root
        self.journal = root / "phase-journal.json"
        self.jobs = read_json(self.journal) if self.journal.exists() else {}
    def job(self, phase, kind, request):
        from stellar_forge_buyer.errors import StateError
        selected = self.jobs.get(phase)
        request_sha = sha(encoded({"kind": kind, "request": request}))
        native = None
        if selected:
            try:
                native = self.analysis.job(selected["id"], limit=100)
            except StateError as error:
                need((getattr(error, "code", None) or str(error)) == "ANALYSIS_JOB_NOT_FOUND", str(error))
            if selected["request_sha256"] != request_sha:
                need(native is None or native["status"] in ("FAILED", "CANCELLED", "INTERRUPTED"),
                     "Completed original phase selection changed: " + phase)
            elif native and native["status"] == "COMPLETE":
                return native
            elif native and native["status"] == "RUNNING":
                while native["status"] == "RUNNING":
                    time.sleep(0.1)
                    native = self.analysis.job(selected["id"], limit=100)
                if native["status"] == "COMPLETE":
                    return native
        resumes = (selected and selected["request_sha256"] == request_sha and native and
                   ((kind == "workspace-export" and native["status"] in ("FAILED", "CANCELLED", "INTERRUPTED")) or
                    (kind in ("response-preview", "response-import") and native["status"] == "INTERRUPTED")))
        undispatched = selected and selected["request_sha256"] == request_sha and native is None
        if not resumes and not undispatched:
            prior = [] if selected is None else selected.get("history", []) + [
                {key: selected[key] for key in ("id", "kind", "request_sha256", "request", "sequence")}]
            sequence = len(prior) + 1
            selected = {"id": identifier(self.operation, phase + ":phase-attempt:" + str(sequence)),
                        "kind": kind, "request_sha256": request_sha, "request": request,
                        "sequence": sequence, "execution_attempt": self.attempt, "history": prior}
            self.jobs[phase] = selected
            save(self.journal, self.jobs)
        job = self.analysis.start(kind, {"id": selected["id"], **request})
        while job["status"] == "RUNNING":
            time.sleep(0.1)
            job = self.analysis.job(selected["id"], limit=100)
        selected["status"] = job["status"]
        selected["error"] = job.get("error")
        save(self.journal, self.jobs)
        need(job["status"] == "COMPLETE", "Original job " + job["id"] + " ended " + job["status"] + ": " + str(job.get("error")))
        return job
    def import_collection(self, name, entry, document):
        registered = self.analysis.responses.register("camino_" + name, "document", manifest=document)
        preview = self.job("preview:" + name, "response-preview", {
            "source": registered["name"], "source_revision": registered["revision"],
            "mapping": {"collection": "/" + name, "sse_data": "text",
                        "columns": [{"name": field, "pointer": "/" + field.replace("~", "~0").replace("/", "~1"),
                                     "type": "native", "missing": "error"} for field in entry["columns"]]}})
        imported = self.job("import:" + name, "response-import", {
            "preview_id": preview["id"], "preview_sha256": preview["result"]["preview_sha256"], "allow_incomplete": False})
        version = imported["result"]["version"]
        need(version["row_count"] == len(entry["rows"]), "Whole collection row count changed")
        name = "camino_" + name
        current = self.analysis.database.current(name)
        if current.get("version") is None:
            current = self.analysis.database.activate(name, version["version_id"], expected_revision=current["revision"])
        need(current["version"]["version_id"] == version["version_id"], "Original operator view changed")
        return {"name": name, "version_id": version["version_id"], "revision": current["revision"]}
    def query(self, name, sql, rows=50000):
        fields = {"sql": sql, "parameters_text": "[]", "max_rows": rows}
        from stellar_forge_buyer.errors import StateError
        try:
            query = self.analysis.saved_query(name)
        except StateError as error:
            need((getattr(error, "code", None) or str(error)) == "ANALYSIS_QUERY_NOT_FOUND", str(error))
            return self.analysis.save_query(name, fields, expected_revision=0)
        need(all(query.get(k) == v for k, v in fields.items()), "Saved operator query changed: " + name)
        return query


RECIPES = [
    ("status_type", "Titles by exact status and type", "Statuses remain separate, including provisional survival; title and application counts are not operating mine counts.",
     "SELECT status,title_type,COUNT(*) AS title_count FROM camino_titles GROUP BY status,title_type ORDER BY status,title_type",
     ["title_count"]),
    ("timeline", "Administrative periods and edition review", "Publisher dates use explicit DD-MM-YYYY interpretation. Tabular period quality and differences remain separately visible; missing application dates are not automatically invalid.",
     "SELECT title_id,name,status,title_type,publisher_start_raw,publisher_end_raw,start_iso,end_iso,period_quality,tabular_start_raw,tabular_end_raw,tabular_period_quality,date_comparison FROM camino_titles ORDER BY status,title_id", []),
    ("reported_area", "Reported title area by exact status", "Exact decimal km² sums from received publisher rows. Coverage accompanies every sum. Titles may overlap; this is not a union or an active footprint.",
     "SELECT status,title_count,area_present,area_missing,area_invalid,area_nonpositive,reported_area_sum_km2,decimal_scale FROM camino_areas ORDER BY status",
     ["title_count","area_present","area_missing","area_invalid","area_nonpositive","decimal_scale"]),
    ("substances", "Substance occurrence by title and status", "Literal semicolon-separated publisher tokens; distinct title counts per token. Multi-substance titles can contribute to more than one row.",
     "SELECT token AS substance,status,COUNT(DISTINCT title_id) AS title_count,COUNT(*) AS token_occurrences FROM camino_tokens WHERE field='substances' AND is_empty=0 GROUP BY token,status ORDER BY token,status",
     ["title_count","token_occurrences"]),
    ("coverage", "Organization and territory coverage", "Missing/present coverage of original publisher cells. Municipality tokens retain their parenthesized reported area. Repeated names are occurrences, not inferred unique legal entities.",
     "SELECT field,status,coverage,title_count FROM camino_coverage ORDER BY field,status,coverage", ["title_count"]),
    ("quality", "Geometry and administrative source quality", "Geometry values remain complete in original source tables. Structure and coordinate ranges are reviewed; polygon topology is not asserted. Separate publisher/tabular populations remain available.",
     "SELECT status,geometry_review,geometry_type,period_quality,tabular_period_quality,date_comparison,COUNT(*) AS title_count FROM camino_titles GROUP BY status,geometry_review,geometry_type,period_quality,tabular_period_quality,date_comparison ORDER BY status,geometry_review,geometry_type,period_quality,tabular_period_quality,date_comparison",
     ["title_count"]),
]

def file_copy(stream, destination, expected=None):
    content = stream.read()
    if expected:
        need(len(content) == expected["bytes"] and sha(content) == expected["sha256"], "Original output identity changed")
    immutable(destination, content)
    return {"name": Path(destination).name, "path": str(Path(destination).absolute()), "bytes": len(content), "sha256": sha(content)}

def products(course, views, *, revision=1, note="", previous=None):
    analysis = course.analysis
    queries = []
    for key, title, explanation, sql, numeric in RECIPES:
        query = course.query("camino_" + key, sql)
        queries.append(query)
    # Full original editions/differences remain directly editable/queryable, and the
    # archive retains every row even where a browser preview is explicitly limited.
    for name, sql in [
        ("publisher_original", "SELECT * FROM camino_publisher ORDER BY id"),
        ("tabular_original", "SELECT * FROM camino_tabular ORDER BY id"),
        ("all_source_differences", "SELECT * FROM camino_differences ORDER BY title_id,field"),
        ("named_territories_and_organizations", "SELECT field,token,COUNT(DISTINCT title_id) AS title_count FROM camino_tokens WHERE field<>'substances' AND is_empty=0 GROUP BY field,token ORDER BY field,token"),
        ("period_review", "SELECT * FROM camino_titles WHERE period_quality<>'known' OR tabular_period_quality<>'known' OR date_comparison<>'same' ORDER BY title_id"),
    ]:
        queries.append(course.query("camino_" + name, sql, 100000))
    expected_views = {"scope": "selected", "bindings": views}
    report_name = "camino_guyane_report"
    definition_request = {
        "id": identifier(course.operation, "report-definition:" + str(revision)),
        "expected_revision": revision - 1, "title": "Camino — Guyane title review",
        "introduction": INTRODUCTION + ("\nOperator review: " + note if note else ""),
        "sections": [{"title": title, "note": explanation, "query_name": query["name"],
                      "query_revision": query["revision"], "parameters_text": None}
                     for (_, title, explanation, _, _), query in zip(RECIPES, queries)]}
    # Save the exact intended mutation before dispatch so interruption replays it.
    immutable(course.root / ("report-request-" + str(revision) + ".json"), encoded(definition_request))
    definition = analysis.reports.save(report_name, definition_request)
    pinned = analysis.reports.definition(report_name, revision=definition["revision"])
    report = course.job("report:" + str(revision), "report", {
        "name": report_name, "revision": definition["revision"],
        "definition_sha256": pinned["sha256"], "expected_views": expected_views})
    publication = analysis.reports.publish(report["id"], {
        "id": identifier(course.operation, "report-publication:" + str(revision)),
        "result_sha256": report["result"]["result_sha256"],
        "expected_revision": revision - 1, "note": note or "Complete publisher and tabular editions with explicit semantics."})
    sheets = []
    publication_sha = None
    for ordinal, (key, title, explanation, sql, numeric) in enumerate(RECIPES):
        selected = analysis.workbooks.source({"kind": "report", "id": publication["id"], "section": ordinal})
        if publication_sha is None:
            publication_sha = selected["sha256"]
        labels = [column["name"] if isinstance(column, dict) else column for column in selected["columns"]]
        sheets.append({"name": key,
                       "source": {"kind": "report", "id": publication["id"], "sha256": selected["sha256"], "section": ordinal},
                       "columns": [{"source": name, "source_index": position, "header": name,
                                    "type": "integer" if name in numeric else "decimal-text" if name == "reported_area_sum_km2" else "date" if name in ("start_iso", "end_iso") else "native",
                                    "null": "blank", "null_text": "NULL", "precision": "preserve"}
                                   for position, name in enumerate(labels)]})
    workbook_name = "camino_guyane_workbook"
    workbook_request = {
        "id": identifier(course.operation, "workbook-definition:" + str(revision)),
        "expected_revision": revision - 1, "title": "Camino — Guyane title review",
        "notes": INTRODUCTION + ("\nOperator review: " + note if note else ""), "sheets": sheets}
    immutable(course.root / ("workbook-request-" + str(revision) + ".json"), encoded(workbook_request))
    workbook_definition = analysis.workbooks.save(workbook_name, workbook_request)
    workbook = course.job("workbook:" + str(revision), "workbook", {
        "name": workbook_name, "revision": workbook_definition["revision"],
        "definition_sha256": workbook_definition["definition_sha256"]})
    exports = private(course.root / "exports")
    files = []
    for native_name, name in (("workbook.xlsx", "Camino_Analysis.xlsx"), ("handoff.zip", "Camino_Workbook_Handover.zip")):
        with analysis.workbooks.download(workbook["id"], native_name) as (stream, descriptor):
            files.append(file_copy(stream, exports / name, descriptor))
    for kind, name in (("html", "Camino_Report.html"), ("json", "Camino_Report.json"), ("csv", "Camino_Report_Tables.zip")):
        job = course.job("report-export:" + str(revision) + ":" + kind, "report-export", {
            "publication_id": publication["id"], "publication_sha256": publication_sha, "format": kind})
        path, descriptor = analysis.report_export_file(job["id"])
        with Path(path).open("rb") as stream:
            files.append(file_copy(stream, exports / name, descriptor))
    return {"queries": [{"name": query["name"], "revision": query["revision"]} for query in queries],
            "views": views,
            "report": {"name": report_name, "revision": definition["revision"], "publication_id": publication["id"],
                       "publication_sha256": publication_sha, "job_id": report["id"]},
            "workbook": {"name": workbook_name, "job_id": workbook["id"], "definition_revision": workbook_definition["revision"]},
            "files": files}

def export_workspace(course, label="complete"):
    job = course.job("workspace-export:" + label, "workspace-export", {"include_previous_backups": False})
    exports = private(course.root / "exports")
    filename = "Camino_Workspace.zip" if label == "complete" else "Camino_Workspace_" + label + ".zip"
    with course.analysis.archives.download(job["id"], "workspace.zip") as (stream, descriptor):
        item = file_copy(stream, exports / filename, descriptor)
    return {**item, "job_id": job["id"]}

def fail_preserve(course, error):
    receipt = {"status": "FAILED", "operation": course.operation, "attempt": course.attempt,
               "error": type(error).__name__ + ": " + str(error), "workspace": str(course.analysis.database.directory)}
    try:
        receipt["archive"] = export_workspace(course, "partial-attempt-" + str(course.attempt))
    except Exception as export_error:
        receipt["archive_error"] = type(export_error).__name__ + ": " + str(export_error)
    save(course.root / "failure.json", receipt)

def run(args):
    runtime_root, adapter, parser, AnalysisWorkspace = runtime(args.runtime_root)
    root = private(args.work_root)
    selection = {"operation": args.operation, "input_binding_sha256": None}
    entries, originals, input_sha = original_inputs(args.input_manifest, root)
    selection["input_binding_sha256"] = input_sha
    immutable(root / "operation.json", encoded(selection))
    reception_path = root / "received-at.json"
    if reception_path.exists():
        received_at = read_json(reception_path)["received_at"]
    else:
        received_at = datetime.now(timezone.utc).isoformat()
        immutable(reception_path, encoded({"received_at": received_at}))
    editions, original_rows = {}, {}
    for label, filename in (("publisher", PUBLISHER), ("tabular", TABULAR)):
        edition, rows = csv_edition(adapter, parser, entries[filename], label, received_at, args.node)
        editions[label], original_rows[label] = edition, rows
        parser_result = next(item for item in edition["originals"] if item["role"] == "original-csv-parser-result")
        originals.append({**parser_result, "name": label + "-parser-result.json", "role": "camino-" + label + "-parser"})
    originals.append({"name": "receive.py", "raw": raw(__file__), "content_type": "text/x-python", "role": "camino-calculation-source"})
    originals.append({"name": "supplier-report.mjs", "raw": raw(parser), "content_type": "text/javascript", "role": "camino-maintained-parser"})
    derived = derive(original_rows["publisher"], original_rows["tabular"])
    collections = {label: {"rows": edition["rows"], "columns": edition["columns"]} for label, edition in editions.items()}
    collections.update({key: {"rows": rows, "columns": columns_for(key, rows)} for key, rows in derived.items()})
    meaning = {"schema": "commons.camino-edition-meaning.v1", "received_at": received_at,
               "input_binding_sha256": input_sha, "interpretation": INTRODUCTION,
               "sources": {label: edition["source"] for label, edition in editions.items()},
               "population": {label: len(rows) for label, rows in original_rows.items()},
               "shared_ids": len({x["id"] for x in original_rows["publisher"]} & {x["id"] for x in original_rows["tabular"]}),
               "counts": {name: len(rows) for name, rows in derived.items()},
               "comparison": {"scope": "independent retained selections", "join_key": "id", "date_source": "publisher DD-MM-YYYY",
                              "substance_delimiter": ";", "geometry_review": "structure and coordinate range only"}}
    immutable(root / "source-meaning.json", encoded(meaning))
    payload_sha = sha(encoded({"collections": collections, "meaning": meaning, "input_binding_sha256": input_sha}))
    selected_document = root / "document-selection.json"
    if selected_document.exists():
        previous = read_json(selected_document)
        need(previous.get("payload_sha256") == payload_sha, "Original source transformation changed; retain prior edition and select a new work root")
        document = root / "source-document" / previous["filename"]
        need(sha(raw(document)) == previous["sha256"], "First retained source document changed")
    else:
        document = source_document(root, collections, originals, meaning)
        immutable(selected_document, encoded({"filename": document.name, "sha256": sha(raw(document)), "payload_sha256": payload_sha}))
    implementation = raw(__file__)
    immutable(root / "implementation-history" / (sha(implementation) + ".py"), implementation)
    analysis = AnalysisWorkspace(root / "analysis", checkout=runtime_root, node=args.node)
    course = Course(analysis, args.operation, args.attempt, root)
    try:
        views = [course.import_collection(name, entry, document) for name, entry in collections.items()]
        product = products(course, views)
        result = {"schema": "commons.camino-analysis-course.v1", "status": "COMPLETE",
                  "operation": args.operation, "attempt": args.attempt, "input_binding_sha256": input_sha,
                  "workspace": str(analysis.database.directory), "source_meaning": meaning, **product}
        result["archive"] = export_workspace(course)
        result["browser"] = {"module": "stellar_forge_buyer.analysis_workspace",
                             "arguments": ["--database", str(analysis.database.directory), "serve", "--port", "0"],
                             "private_launch": "Read the original server's private_launch JSON receipt. Open its original URL in the browser."}
        save(root / "course.json", result)
        return result
    except Exception as error:
        fail_preserve(course, error)
        raise
    finally:
        analysis.close()

def receive(args):
    runtime_root, adapter, parser, AnalysisWorkspace = runtime(args.runtime_root)
    from stellar_forge_buyer.workspace_archive_receive import restore_archive
    target = Path(args.target).absolute()
    private(target.parent)
    result = restore_archive(args.archive, target, operation=identifier(args.operation, "cold-receive"),
                             expected_sha256=args.sha256)
    analysis = AnalysisWorkspace(target, checkout=runtime_root, node=args.node)
    try:
        report = analysis.reports.definition("camino_guyane_report")
        workbook = analysis.workbooks.definition("camino_guyane_workbook")
        receipt = {"schema": "commons.camino-cold-receiving.v1", "status": "COMPLETE", "workspace": str(target),
                   "archive_sha256": args.sha256, "restore": result,
                   "report_revision": report["definition"]["revision"],
                   "workbook_revision": workbook["definition"]["revision"],
                   "workspace_id": analysis.identity}
        save(target.parent / (target.name + "-receiving.json"), receipt)
        return receipt
    finally:
        analysis.close()

def revise(args):
    runtime_root, adapter, parser, AnalysisWorkspace = runtime(args.runtime_root)
    need(isinstance(args.note, str) and args.note.strip(), "Actual operator review note required")
    workspace_path = Path(args.workspace).absolute()
    root = private(workspace_path.parent / (workspace_path.name + "-revision-2"))
    immutable(root / "operator-review.json", encoded({"operation": args.operation, "note": args.note}))
    analysis = AnalysisWorkspace(workspace_path, checkout=runtime_root, node=args.node)
    course = Course(analysis, args.operation, args.attempt, root)
    try:
        first_report = analysis.reports.definition("camino_guyane_report", revision=1)
        first_workbook = analysis.workbooks.definition("camino_guyane_workbook", revision=1)
        need(first_report["definition"]["revision"] == first_workbook["definition"]["revision"] == 1, "Original editable version required")
        views = analysis.database.view_bindings()
        if isinstance(views, dict):
            views = views.get("bindings", views.get("views"))
        need(isinstance(views, list), "Original current view bindings required")
        views = [{key: item[key] for key in ("name", "version_id", "revision")} for item in views if item["name"].startswith("camino_")]
        result = {"schema": "commons.camino-analysis-course.v1", "status": "COMPLETE",
                  "operation": args.operation, "attempt": args.attempt, "workspace": str(workspace_path),
                  "operator_note": args.note, **products(course, views, revision=2, note=args.note)}
        result["archive"] = export_workspace(course)
        save(root / "course.json", result)
        return result
    except Exception as error:
        fail_preserve(course, error)
        raise
    finally:
        analysis.close()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("run", "receive", "revise"):
        command = commands.add_parser(name)
        command.add_argument("--runtime-root", required=True)
        command.add_argument("--operation", required=True)
        command.add_argument("--node", default="node")
        command.add_argument("--attempt", type=int, default=1)
        if name == "run":
            command.add_argument("--input-manifest", required=True)
            command.add_argument("--work-root", required=True)
        elif name == "receive":
            command.add_argument("--archive", required=True)
            command.add_argument("--sha256", required=True)
            command.add_argument("--target", required=True)
        else:
            command.add_argument("--workspace", required=True)
            command.add_argument("--note", required=True)
    args = parser.parse_args()
    need(args.attempt > 0, "Positive explicit attempt required")
    result = {"run": run, "receive": receive, "revise": revise}[args.command](args)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)

if __name__ == "__main__":
    main()
