"""Source-selected dbt project graph, editions, review and result context. MIT.

Schema selectors use artifact versions, not dbt release numbers. Unknown artifact
bodies can be retained unchanged, but are never interpreted as supported nodes.
Numeric tokens are lossless, including adapter counters above 2**53 and decimals.
"""
from __future__ import annotations

import csv
import html
import io
import json
from pathlib import Path
import re
from typing import Any, Iterable

from dbt_store import Store, ProjectError, require, stamp, sha, identity, json_bytes, text, hash_id, regular_open


class Number(str):
    """A JSON number's original lexical token; never a binary float."""


def _pairs(items):
    result = {}
    for key, value in items:
        require(key not in result, "DUPLICATE_JSON_KEY", "Ambiguous duplicate JSON object key: " + key[:100])
        result[key] = value
    return result


def parse_json(data: bytes | str) -> Any:
    try:
        return json.loads(data, parse_int=Number, parse_float=Number, object_pairs_hook=_pairs,
                          parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)))
    except (ValueError, UnicodeError, RecursionError) as exc:
        raise ProjectError("INVALID_JSON", "Input must be complete UTF-8 JSON with finite numeric tokens.") from exc


def literal(value: Any) -> str:
    """Canonical object order, preserved numeric lexemes, no source precision loss."""
    if isinstance(value, Number):
        return str(value)
    if isinstance(value, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + literal(value[k])
                              for k in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(literal(x) for x in value) + "]"
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def exact_sha(value: Any) -> str:
    return sha(literal(value).encode())


def decimal(value: Any) -> str | None:
    return str(value) if isinstance(value, (Number, int, float)) and not isinstance(value, bool) else None


def _plain(value: Any, name: str, maximum: int = 8192, empty: bool = True) -> str:
    require(isinstance(value, str) and not isinstance(value, Number), "INVALID_" + name.upper())
    return text(value, name, maximum, empty)


def _dict(value, name):
    require(isinstance(value, dict), "INVALID_" + name.upper())
    return value


def _list(value, name):
    require(isinstance(value, list), "INVALID_" + name.upper())
    return value


def _safe_metadata(meta: dict) -> dict:
    # Original env/user metadata remain in the exact private body; dashboards and
    # ordinary reports expose only the source identity, not arbitrary env values.
    return {k: meta.get(k) for k in ("dbt_schema_version", "dbt_version", "generated_at",
            "invocation_id", "invocation_started_at", "project_name", "project_id", "adapter_type")}


SCHEMAS = {"manifest": set(range(8, 13)), "catalog": {1}, "run-results": {5, 6}, "sources": {3}, "freshness": {0}}
SCHEMA_PATTERN = re.compile(r"^https://schemas\.getdbt\.com/dbt/([a-z-]+)/v(0|[1-9][0-9]*)\.json$")
SECTIONS = ("nodes", "sources", "metrics", "exposures", "semantic_models", "saved_queries", "unit_tests", "macros")
DEFINITION_FIELDS = ("resource_type", "name", "package_name", "database", "schema", "alias", "identifier",
    "raw_code", "raw_sql", "macro_sql", "config", "unrendered_config", "description", "columns", "tags", "meta",
    "depends_on", "refs", "sources", "constraints", "checksum", "access", "group", "primary_key",
    "metrics", "dimensions", "entities", "measures", "type", "url", "owner")


def schema_of(body: dict) -> tuple[str, int | None, bool]:
    meta = _dict(body.get("metadata"), "metadata")
    uri = _plain(meta.get("dbt_schema_version"), "dbt_schema_version", 512, False)
    match = SCHEMA_PATTERN.fullmatch(uri)
    if not match:
        return "opaque", None, False
    kind, version = match.group(1), int(match.group(2))
    return kind, version, version in SCHEMAS.get(kind, set())


def _node_rows(artifact: str, body: dict, kind: str):
    seen = set()
    sections = SECTIONS if kind == "manifest" else ("nodes", "sources")
    for section in sections:
        entries = _dict(body.get(section, {}), section)
        for uid, record in entries.items():
            _plain(uid, "unique_id", 2048, False)
            _dict(record, "resource")
            require(uid not in seen, "DUPLICATE_RESOURCE_ID")
            seen.add(uid)
            declared = record.get("unique_id")
            require(declared in (None, uid), "RESOURCE_ID_MISMATCH")
            nmeta = record.get("metadata", {}) if kind == "catalog" else record
            _dict(nmeta, "resource_metadata")
            name = _plain(nmeta.get("name", uid), "resource_name")
            resource_type = ("source" if section == "sources" else "relation") if kind == "catalog" else record.get("resource_type", section.rstrip("s"))
            resource_type = _plain(resource_type, "resource_type", 128, False)
            compiled = {k: record[k] for k in ("compiled_code", "compiled_sql", "compiled", "extra_ctes") if k in record}
            definition = {k: record[k] for k in DEFINITION_FIELDS if k in record}
            if kind == "catalog":
                definition = {k: record[k] for k in ("metadata", "columns", "stats") if k in record}
            for key in ("database", "schema", "relation_name"):
                require(nmeta.get(key) is None or isinstance(nmeta[key], str) and not isinstance(nmeta[key], Number), "INVALID_RELATION_IDENTITY")
            yield (artifact, uid, section, name, resource_type,
                   _plain(record.get("package_name", ""), "package_name"),
                   _plain(record.get("original_file_path", record.get("path", "")), "resource_path"),
                   _plain(record.get("description", nmeta.get("comment") or ""), "description", 16_777_216),
                   nmeta.get("database"), nmeta.get("schema"), record.get("relation_name"),
                   exact_sha(definition), exact_sha(compiled), exact_sha(record), literal(record))


def _edge_rows(artifact: str, body: dict):
    for section in SECTIONS:
        for uid, record in body.get(section, {}).items():
            dependencies = _dict(record.get("depends_on", {}), "depends_on")
            for group in ("nodes", "macros"):
                for parent in _list(dependencies.get(group, []), "dependencies"):
                    yield artifact, _plain(parent, "dependency_id", 2048, False), uid, f"{section}.depends_on.{group}"
    for child, parents in _dict((body.get("parent_map") or {}), "parent_map").items():
        _plain(child, "child_id", 2048, False)
        for parent in _list(parents, "parent_map_entry"):
            yield artifact, _plain(parent, "parent_id", 2048, False), child, "parent_map"
    # Preserve separately declared child-map edges so inconsistent maps remain
    # inspectable instead of silently deleting a dependency or inventing certainty.
    for parent, children in _dict((body.get("child_map") or {}), "child_map").items():
        _plain(parent, "parent_id", 2048, False)
        for child in _list(children, "child_map_entry"):
            yield artifact, parent, _plain(child, "child_id", 2048, False), "child_map"


def row_dict(row):
    return dict(row) if row is not None else None


class Project(Store):
    def import_file(self, path: str | Path, expected_sha: str | None = None, cancel=None) -> dict:
        descriptor = self.put_file(path, expected_sha, cancel)
        aid = descriptor["sha256"]
        with self.connect() as db:
            old = db.execute("SELECT id FROM artifacts WHERE id=?", (aid,)).fetchone()
        if old:
            return self.artifact(aid)
        with regular_open(self.object_path(aid)) as src:
            body = _dict(parse_json(src.read()), "artifact")
        kind, version, supported = schema_of(body)
        metadata = _safe_metadata(body["metadata"])
        warnings = []
        if not supported:
            warnings.append("Exact artifact retained; this schema has no selected projection.")
        if supported and kind in ("manifest", "catalog"):
            _dict(body.get("nodes"), "nodes")
            _dict(body.get("sources", {}), "sources")
        with self.transaction() as db:
            if db.execute("SELECT id FROM artifacts WHERE id=?", (aid,)).fetchone():
                return self._artifact(db, aid)
            db.execute("INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?)", (aid, kind, version,
                       descriptor["bytes"], text(descriptor["name"], "filename"), stamp(),
                       json_bytes(metadata).decode(), int(supported), 0, "[]"))
            count = 0
            if supported and kind in ("manifest", "catalog"):
                for row in _node_rows(aid, body, kind):
                    if cancel and cancel.is_set():
                        raise ProjectError("CANCELLED", status=409)
                    db.execute("INSERT INTO nodes VALUES(" + ",".join("?" * 15) + ")", row)
                    count += 1
                if kind == "manifest":
                    db.executemany("INSERT OR IGNORE INTO edges VALUES(?,?,?,?)", _edge_rows(aid, body))
                    dangling = db.execute("SELECT COUNT(DISTINCT parent) FROM edges WHERE artifact=? AND parent NOT IN (SELECT uid FROM nodes WHERE artifact=?)", (aid, aid)).fetchone()[0]
                    if dangling:
                        warnings.append(f"{dangling} referenced dependencies have no resource body in this manifest.")
                    disabled = body.get("disabled", {})
                    if disabled:
                        warnings.append("Disabled resource definitions remain in the original manifest; they are not active graph nodes.")
            elif supported:
                results = _list(body.get("results"), "results")
                for ordinal, result in enumerate(results):
                    _dict(result, "result")
                    uid = _plain(result.get("unique_id"), "unique_id", 2048, False)
                    status = _plain(result.get("status"), "status", 128, False)
                    db.execute("INSERT INTO outcomes VALUES(?,?,?,?,?,?)", (aid, ordinal, uid, status,
                               decimal(result.get("execution_time")), literal(result)))
                count = len(results)
            db.execute("UPDATE artifacts SET node_count=?,warnings=? WHERE id=?", (count, json_bytes(warnings).decode(), aid))
            db.execute("INSERT INTO audit(action,reference,at) VALUES(?,?,?)", ("import", aid, stamp()))
        return self.artifact(aid)

    def _artifact(self, db, aid: str) -> dict:
        row = db.execute("SELECT * FROM artifacts WHERE id=?", (hash_id(aid),)).fetchone()
        require(row is not None, "ARTIFACT_NOT_FOUND", status=404)
        out = dict(row)
        out["metadata"] = json.loads(out["metadata"])
        out["warnings"] = json.loads(out["warnings"])
        out["supported"] = bool(out["supported"])
        return out

    def artifact(self, aid: str) -> dict:
        with self.connect() as db:
            return self._artifact(db, aid)

    def artifacts(self) -> list[dict]:
        with self.connect() as db:
            return [self._artifact(db, r[0]) for r in db.execute("SELECT id FROM artifacts ORDER BY imported_at DESC,id")]

    def _edition(self, db, eid: str) -> dict:
        row = db.execute("SELECT * FROM editions WHERE id=?", (hash_id(eid),)).fetchone()
        require(row is not None, "EDITION_NOT_FOUND", status=404)
        result = dict(row)
        for field in ("runs", "freshness", "context"):
            result[field] = json.loads(result[field])
        return result

    def edition(self, eid: str) -> dict:
        with self.connect() as db:
            return self._edition(db, eid)

    def editions(self) -> list[dict]:
        with self.connect() as db:
            return [self._edition(db, r[0]) for r in db.execute("SELECT id FROM editions ORDER BY created_at DESC,id")]

    def create_edition(self, *, title: str, manifest: str, catalog: str | None = None,
                       runs: list[str] | None = None, freshness: list[str] | None = None,
                       request_id: str) -> dict:
        runs, freshness = runs or [], freshness or []
        payload = {"title": text(title, "title"), "manifest": hash_id(manifest), "catalog": catalog,
                   "runs": runs, "freshness": freshness}
        require(len(set(runs)) == len(runs) and len(set(freshness)) == len(freshness), "DUPLICATE_ARTIFACT_SELECTION")
        with self.transaction() as db:
            replay = self.replay(db, request_id, "edition", payload)
            if replay:
                return replay
            selected = [("manifest", manifest)] + ([("catalog", catalog)] if catalog else [])
            selected += [("run-results", a) for a in runs] + [("freshness-family", a) for a in freshness]
            infos = []
            for expected, aid in selected:
                info = self._artifact(db, aid)
                require(info["supported"] and (info["kind"] in ("sources", "freshness") if expected == "freshness-family" else info["kind"] == expected), "ARTIFACT_KIND_OR_VERSION_MISMATCH")
                infos.append(info)
            context = {"artifacts": [], "warnings": []}
            project = infos[0]["metadata"]
            for info in infos:
                meta = info["metadata"]
                for key in ("project_name", "project_id"):
                    require(not (project.get(key) and meta.get(key) and project[key] != meta[key]), "PROJECT_IDENTITY_MISMATCH")
                orphan = 0
                if info["kind"] in ("run-results", "sources", "freshness"):
                    orphan = db.execute("SELECT COUNT(*) FROM outcomes WHERE artifact=? AND uid NOT IN (SELECT uid FROM nodes WHERE artifact=?)", (info["id"], manifest)).fetchone()[0]
                elif info["kind"] == "catalog":
                    orphan = db.execute("SELECT COUNT(*) FROM nodes WHERE artifact=? AND uid NOT IN (SELECT uid FROM nodes WHERE artifact=?)", (info["id"], manifest)).fetchone()[0]
                context["artifacts"].append({"id": info["id"], "kind": info["kind"], "metadata": meta,
                         "unmatched_resources": orphan, "same_invocation_as_manifest": bool(meta.get("invocation_id") and meta.get("invocation_id") == project.get("invocation_id"))})
                if orphan:
                    context["warnings"].append(f"{info['name']}: {orphan} entries do not join to the selected manifest.")
            invocation_ids = {i["metadata"].get("invocation_id") for i in infos if i["metadata"].get("invocation_id")}
            if len(invocation_ids) > 1:
                context["warnings"].append("Selected artifacts span distinct invocations. Definitions, catalog observations and outcomes retain their own timestamps and identities.")
            eid = identity(payload)
            db.execute("INSERT OR IGNORE INTO editions VALUES(?,?,?,?,?,?,?,?)", (eid, title, stamp(), manifest, catalog,
                       json_bytes(runs).decode(), json_bytes(freshness).decode(), json_bytes(context).decode()))
            return self.finish(db, request_id, "edition", payload, self._edition(db, eid))

    def nodes(self, eid: str, q: str = "", type: str = "", offset: int = 0, limit: int = 100) -> dict:
        require(isinstance(offset, int) and offset >= 0 and isinstance(limit, int) and 1 <= limit <= 1000, "INVALID_PAGE")
        with self.connect() as db:
            ed = self._edition(db, eid)
            args, clause = [ed["manifest"]], "artifact=?"
            if q:
                text(q, "search", 1024)
                escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                clause += " AND (uid LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\')"
                args += ["%" + escaped + "%"] * 4
            if type:
                clause += " AND type=?"
                args.append(type)
            count = db.execute("SELECT COUNT(*) FROM nodes WHERE " + clause, args).fetchone()[0]
            rows = [dict(r) for r in db.execute("SELECT uid,name,type,package,path,description,database_name,schema_name,relation_name,definition_sha,compiled_sha FROM nodes WHERE " + clause + " ORDER BY type,name,uid LIMIT ? OFFSET ?", args + [limit, offset])]
            return {"edition": eid, "total": count, "offset": offset, "items": rows,
                    "next_offset": offset + len(rows) if offset + len(rows) < count else None}

    def node(self, eid: str, uid: str) -> dict:
        with self.connect() as db:
            ed = self._edition(db, eid)
            row = db.execute("SELECT * FROM nodes WHERE artifact=? AND uid=?", (ed["manifest"], uid)).fetchone()
            require(row is not None, "NODE_NOT_FOUND", status=404)
            node = dict(row)
            # Keep unbounded precision in a JSON TEXT field rather than handing
            # arbitrary adapter numbers to JavaScript Number through the API.
            node["source_json"] = node.pop("body")
            record = parse_json(node["source_json"])
            node["raw_code"] = record.get("raw_code", record.get("raw_sql", record.get("macro_sql")))
            node["compiled_code"] = record.get("compiled_code", record.get("compiled_sql"))
            node["catalog"] = None
            if ed["catalog"]:
                cat = db.execute("SELECT body FROM nodes WHERE artifact=? AND uid=?", (ed["catalog"], uid)).fetchone()
                if cat:
                    node["catalog"] = {"artifact": ed["catalog"], "source_json": cat[0]}
            node["outcomes"] = []
            for aid in ed["runs"] + ed["freshness"]:
                info = self._artifact(db, aid)
                for r in db.execute("SELECT * FROM outcomes WHERE artifact=? AND uid=? ORDER BY ordinal", (aid, uid)):
                    result = dict(r)
                    result["source_json"] = result.pop("body")
                    result["kind"] = info["kind"]
                    result["metadata"] = info["metadata"]
                    node["outcomes"].append(result)
            node["dependencies"] = [dict(r) for r in db.execute("SELECT parent,origin FROM edges WHERE artifact=? AND child=? ORDER BY parent,origin", (ed["manifest"], uid))]
            node["dependants"] = [dict(r) for r in db.execute("SELECT child,origin FROM edges WHERE artifact=? AND parent=? ORDER BY child,origin", (ed["manifest"], uid))]
            node["results"] = [json.loads(r[0]) for r in db.execute("SELECT body FROM results WHERE edition=? AND uid=? ORDER BY created_at,id", (eid, uid))]
            return node

    def lineage(self, eid: str, ids: list[str], direction: str = "downstream") -> dict:
        require(direction in ("upstream", "downstream", "both") and isinstance(ids, list) and ids, "INVALID_LINEAGE_QUERY")
        if direction == "both":
            up = self.lineage(eid, ids, "upstream")
            down = self.lineage(eid, ids, "downstream")
            pairs = {(e["parent"], e["child"]) for e in up["edges"] + down["edges"]}
            return {"edition": eid, "direction": direction, "selected": ids,
                    "nodes": sorted(set(up["nodes"]) | set(down["nodes"])),
                    "missing": sorted(set(up["missing"]) | set(down["missing"])),
                    "edges": [{"parent": a, "child": b} for a, b in sorted(pairs)]}
        with self.connect() as db:
            ed = self._edition(db, eid)
            edges = [dict(r) for r in db.execute("SELECT DISTINCT parent,child FROM edges WHERE artifact=? ORDER BY parent,child", (ed["manifest"],))]
            known = {r[0] for r in db.execute("SELECT uid FROM nodes WHERE artifact=?", (ed["manifest"],))}
        require(all(isinstance(i, str) for i in ids), "INVALID_NODE_SELECTION")
        missing = set(ids) - known
        adjacency = {}
        for edge in edges:
            if direction in ("downstream", "both"):
                adjacency.setdefault(edge["parent"], set()).add(edge["child"])
            if direction in ("upstream", "both"):
                adjacency.setdefault(edge["child"], set()).add(edge["parent"])
        visited, queue = set(ids), list(ids)
        for current in queue:
            for following in sorted(adjacency.get(current, ())):
                if following not in visited:
                    visited.add(following)
                    queue.append(following)
        return {"edition": eid, "direction": direction, "selected": ids, "nodes": sorted(visited),
                "missing": sorted((visited - known) | missing), "edges": [e for e in edges if e["parent"] in visited and e["child"] in visited]}

    def compare(self, before: str, after: str) -> dict:
        with self.connect() as db:
            old, new = self._edition(db, before), self._edition(db, after)
            left = {r["uid"]: dict(r) for r in db.execute("SELECT * FROM nodes WHERE artifact=?", (old["manifest"],))}
            right = {r["uid"]: dict(r) for r in db.execute("SELECT * FROM nodes WHERE artifact=?", (new["manifest"],))}
            old_cat = {r["uid"]: r["definition_sha"] for r in db.execute("SELECT uid,definition_sha FROM nodes WHERE artifact=?", (old["catalog"],))} if old["catalog"] else {}
            new_cat = {r["uid"]: r["definition_sha"] for r in db.execute("SELECT uid,definition_sha FROM nodes WHERE artifact=?", (new["catalog"],))} if new["catalog"] else {}
            def outcome_map(ed):
                out = {}
                for aid in ed["runs"] + ed["freshness"]:
                    for r in db.execute("SELECT uid,status,body FROM outcomes WHERE artifact=? ORDER BY ordinal", (aid,)):
                        out.setdefault(r["uid"], []).append({"artifact": aid, "status": r["status"], "body_sha": sha(r["body"].encode())})
                return out
            old_runs, new_runs = outcome_map(old), outcome_map(new)
            def edge_map(ed):
                found = {}
                for r in db.execute("SELECT parent,child,origin FROM edges WHERE artifact=? ORDER BY parent,origin", (ed["manifest"],)):
                    found.setdefault(r["child"], []).append((r["parent"], r["origin"]))
                return found
            old_edges, new_edges = edge_map(old), edge_map(new)
        changes, structural = [], []
        for uid in sorted(left.keys() | right.keys()):
            a, b = left.get(uid), right.get(uid)
            kind = "added" if not a else "removed" if not b else "changed"
            fields = []
            if a and b:
                pa, pb = parse_json(a["body"]), parse_json(b["body"])
                fields = [k for k in sorted(pa.keys() | pb.keys()) if k not in pa or k not in pb or literal(pa[k]) != literal(pb[k])]
            definition = not a or not b or a["definition_sha"] != b["definition_sha"]
            compiled = not a or not b or a["compiled_sha"] != b["compiled_sha"]
            cat = old_cat.get(uid) != new_cat.get(uid)
            outcomes = old_runs.get(uid, []) != new_runs.get(uid, [])
            lineage = old_edges.get(uid, []) != new_edges.get(uid, [])
            if definition or compiled or fields or cat or outcomes or lineage:
                changes.append({"uid": uid, "name": (b or a)["name"], "type": (b or a)["type"], "kind": kind,
                    "definition_changed": bool(definition), "compiled_changed": bool(compiled), "catalog_changed": cat,
                    "outcomes_changed": outcomes, "lineage_changed": lineage, "changed_fields": fields,
                    "before_outcomes": old_runs.get(uid, []), "after_outcomes": new_runs.get(uid, [])})
            if definition or compiled or lineage:
                structural.append(uid)
        affected = set(structural)
        if structural:
            # Includes the old graph: removing a dependency must not erase the
            # impact path that existed before this edition.
            for eid in (before, after):
                affected.update(self.lineage(eid, structural)["nodes"])
        return {"before": before, "after": after, "changes": changes, "structural_changes": structural,
                "affected": sorted(affected & (left.keys() | right.keys())), "unresolved_affected": sorted(affected - (left.keys() | right.keys())), "counts": {k: sum(x["kind"] == k for x in changes) for k in ("added", "removed", "changed")}}

    def save_review(self, *, name: str, edition: str, selection: list[str], decisions: dict,
                    reviewer: str, note: str = "", baseline: str | None = None,
                    expected_revision: int = 0, request_id: str) -> dict:
        payload = {"name": text(name, "review_name", 128), "edition": hash_id(edition),
                   "baseline": baseline, "selection": selection, "decisions": decisions,
                   "reviewer": text(reviewer, "reviewer", 128), "note": text(note, "note", 32768, True),
                   "expected_revision": expected_revision}
        require(isinstance(selection, list) and all(isinstance(x, str) for x in selection) and len(selection) == len(set(selection)), "DUPLICATE_NODE_SELECTION")
        require(isinstance(decisions, dict), "INVALID_DECISIONS")
        require(isinstance(expected_revision, int) and not isinstance(expected_revision, bool) and expected_revision >= 0, "INVALID_REVISION")
        with self.transaction() as db:
            replay = self.replay(db, request_id, "review", payload)
            if replay:
                return replay
            ed = self._edition(db, edition)
            allowed = {r[0] for r in db.execute("SELECT uid FROM nodes WHERE artifact=?", (ed["manifest"],))}
            if baseline:
                base = self._edition(db, baseline)
                allowed |= {r[0] for r in db.execute("SELECT uid FROM nodes WHERE artifact=?", (base["manifest"],))}
            require(all(isinstance(x, str) and x in allowed for x in selection), "UNKNOWN_REVIEW_RESOURCE")
            require(set(decisions) <= allowed, "UNKNOWN_DECISION_RESOURCE")
            for uid, decision in decisions.items():
                require(isinstance(decision, dict) and set(decision) <= {"status", "note", "proposed_code"}, "INVALID_DECISION")
                require(decision.get("status") in ("accepted", "investigate", "excluded", "correction-proposed"), "INVALID_DECISION_STATUS")
                text(decision.get("note", ""), "decision_note", 32768, True)
                if "proposed_code" in decision:
                    text(decision["proposed_code"], "proposed_code", 16_777_216, True)
            head = db.execute("SELECT r.* FROM reviews r JOIN review_heads h ON r.id=h.id WHERE h.name=?", (name,)).fetchone()
            revision = head["revision"] if head else 0
            require(revision == expected_revision, "REVIEW_CONFLICT", f"Current revision is {revision}; reload before saving.", 409)
            value = {k: v for k, v in payload.items() if k != "expected_revision"}
            value.update(schema="stellar-forge.dbt-review.v1", revision=revision + 1,
                         previous=head["id"] if head else None, created_at=stamp())
            value["id"] = identity(value)
            db.execute("INSERT INTO reviews VALUES(?,?,?,?,?,?)", (value["id"], name, revision + 1, value["previous"], value["created_at"], json_bytes(value).decode()))
            db.execute("INSERT INTO review_heads VALUES(?,?) ON CONFLICT(name) DO UPDATE SET id=excluded.id", (name, value["id"]))
            return self.finish(db, request_id, "review", payload, value)

    def reviews(self, name: str | None = None) -> list[dict]:
        with self.connect() as db:
            if name is None:
                rows = db.execute("SELECT r.body FROM reviews r JOIN review_heads h ON r.id=h.id ORDER BY r.name")
            else:
                rows = db.execute("SELECT body FROM reviews WHERE name=? ORDER BY revision DESC", (name,))
            return [json.loads(r[0]) for r in rows]

    def review(self, rid: str) -> dict:
        with self.connect() as db:
            row = db.execute("SELECT body FROM reviews WHERE id=?", (hash_id(rid),)).fetchone()
            require(row is not None, "REVIEW_NOT_FOUND", status=404)
            return json.loads(row[0])

    def bind_result(self, *, edition: str, uid: str, file: str, query_file: str,
                    provenance_file: str, source_kind: str, original_request_id: str,
                    expected_sha: str, request_id: str) -> dict:
        # A result attachment is explicit local custody, not a claim that this app
        # executed or paid for it. Native publishers supply their original files.
        node = self.node(edition, uid)
        delivered = self.put_file(file, expected_sha)
        query = self.put_file(query_file)
        provenance = self.put_file(provenance_file)
        with regular_open(self.object_path(provenance["sha256"])) as src:
            provenance_body = _dict(parse_json(src.read()), "provenance")
        with regular_open(self.object_path(query["sha256"])) as src:
            try:
                src.read().decode("utf-8")
            except UnicodeError as exc:
                raise ProjectError("QUERY_UTF8_REQUIRED") from exc
        payload = {"edition": edition, "uid": uid, "file": delivered, "query": query,
            "provenance": provenance, "source_kind": text(source_kind, "source_kind", 128),
            "original_request_id": text(original_request_id, "original_request_id", 256),
            "relation": {"database": node["database_name"], "schema": node["schema_name"], "name": node["relation_name"]},
            "provenance_schema": provenance_body.get("schema"), "manifest": node["artifact"]}
        with self.transaction() as db:
            replay = self.replay(db, request_id, "result", payload)
            if replay:
                return replay
            result = {**payload, "schema": "stellar-forge.dbt-result-context.v1", "created_at": stamp()}
            result["id"] = identity(payload)
            db.execute("INSERT OR IGNORE INTO results VALUES(?,?,?,?,?)", (result["id"], edition, uid, result["created_at"], json_bytes(result).decode()))
            stored = json.loads(db.execute("SELECT body FROM results WHERE id=?", (result["id"],)).fetchone()[0])
            return self.finish(db, request_id, "result", payload, stored)

    def report(self, edition: str, review: str | None = None, format: str = "json") -> tuple[bytes, str]:
        require(format in ("json", "csv", "html"), "INVALID_REPORT_FORMAT")
        ed = self.edition(edition)
        rev = self.review(review) if review else None
        require(not rev or rev["edition"] == edition, "REVIEW_EDITION_MISMATCH")
        with self.connect() as db:
            rows = [dict(r) for r in db.execute("SELECT uid,name,type,package,path,description,database_name,schema_name,relation_name,definition_sha,compiled_sha FROM nodes WHERE artifact=? ORDER BY type,name,uid", (ed["manifest"],))]
        for row in rows:
            row["presence"] = "current"
            row["source_edition"] = edition
        if rev and rev["baseline"]:
            base = self.edition(rev["baseline"])
            present = {row["uid"] for row in rows}
            with self.connect() as db:
                removed = [dict(r) for r in db.execute("SELECT uid,name,type,package,path,description,database_name,schema_name,relation_name,definition_sha,compiled_sha FROM nodes WHERE artifact=? ORDER BY type,name,uid", (base["manifest"],)) if r["uid"] not in present]
            for row in removed:
                row["presence"] = "removed"
                row["source_edition"] = rev["baseline"]
            rows += removed
        selected = set(rev["selection"]) if rev else None
        changes = self.compare(rev["baseline"], edition) if rev and rev["baseline"] else None
        # Bulk joins keep a complete report O(resources + outcomes), rather than
        # opening a separate connection and repeating every artifact for each node.
        with self.connect() as db:
            observed, bound = {}, {}
            for aid in ed["runs"] + ed["freshness"]:
                info = self._artifact(db, aid)
                for r in db.execute("SELECT * FROM outcomes WHERE artifact=? ORDER BY ordinal", (aid,)):
                    item = dict(r)
                    item["source_json"] = item.pop("body")
                    item.update(kind=info["kind"], metadata=info["metadata"])
                    observed.setdefault(item["uid"], []).append(item)
            for r in db.execute("SELECT uid,body FROM results WHERE edition=? ORDER BY created_at,id", (edition,)):
                bound.setdefault(r["uid"], []).append(json.loads(r["body"]))
        baseline_observed, baseline_bound = {}, {}
        if rev and rev["baseline"]:
            with self.connect() as db:
                for aid in base["runs"] + base["freshness"]:
                    info = self._artifact(db, aid)
                    for r in db.execute("SELECT * FROM outcomes WHERE artifact=? ORDER BY ordinal", (aid,)):
                        item = dict(r)
                        item["source_json"] = item.pop("body")
                        item.update(kind=info["kind"], metadata=info["metadata"])
                        baseline_observed.setdefault(item["uid"], []).append(item)
                for r in db.execute("SELECT uid,body FROM results WHERE edition=? ORDER BY created_at,id", (rev["baseline"],)):
                    baseline_bound.setdefault(r["uid"], []).append(json.loads(r["body"]))
        for row in rows:
            row["selected"] = row["uid"] in selected if selected is not None else False
            row["decision"] = rev["decisions"].get(row["uid"]) if rev else None
            row["outcomes"] = (baseline_observed if row["presence"] == "removed" else observed).get(row["uid"], [])
            row["results"] = (baseline_bound if row["presence"] == "removed" else bound).get(row["uid"], [])
        report = {"schema": "stellar-forge.dbt-project-report.v1", "project": self.info,
                  "edition": ed, "review": rev, "changes": changes, "resources": rows}
        if format == "json":
            return json_bytes(report), "application/json"
        if format == "csv":
            def csv_cell(value):
                # Spreadsheet-safe presentation. Exact source strings are retained
                # in JSON/original objects; neutralize formula-leading CSV cells.
                if isinstance(value, str) and value.lstrip(" ").startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
                    return "'" + value
                return value
            out = io.StringIO(newline="")
            writer = csv.writer(out)
            writer.writerow(["unique_id", "name", "resource_type", "database", "schema", "relation", "presence", "source_edition", "selected", "decision", "outcomes_by_artifact", "description"])
            for r in rows:
                writer.writerow([csv_cell(v) for v in [r["uid"], r["name"], r["type"], r["database_name"], r["schema_name"], r["relation_name"], r["presence"], r["source_edition"], r["selected"],
                                 (r["decision"] or {}).get("status", ""), "; ".join(o["artifact"] + ":" + o["status"] for o in r["outcomes"]), r["description"]]])
            return out.getvalue().encode(), "text/csv; charset=utf-8"
        esc = lambda x: html.escape(str(x if x is not None else ""), quote=True)
        content = "".join("<tr>" + "".join("<td>" + esc(v) + "</td>" for v in (r["name"], r["type"], r["uid"], r["presence"],
                  "; ".join(o["status"] + " [" + o["artifact"][:12] + "]" for o in r["outcomes"]) or "No selected execution outcome",
                  (r["decision"] or {}).get("status", ""), r["description"])) + "</tr>" for r in rows)
        doc = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(ed["title"]) + '</title><style>body{font:15px system-ui;max-width:1400px;margin:3rem auto;padding:0 1rem;color:#222;background:#fff}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:.7rem;border:1px solid #ccc;vertical-align:top;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-weight:600}@media print{body{margin:0;font-size:9pt}thead{display:table-header-group}tr{break-inside:avoid}}</style><h1>' + esc(ed["title"]) + '</h1><p>Private project handover · ' + str(len(rows)) + ' resources · edition ' + esc(edition) + '</p><p>' + esc(" | ".join(ed["context"]["warnings"])) + '</p><table><thead><tr><th>Resource</th><th>Kind</th><th>Original ID</th><th>Edition presence</th><th>Selected outcomes</th><th>Review</th><th>Description</th></tr></thead><tbody>' + content + '</tbody></table><h2>Selected invocation identities</h2><pre>' + esc(json.dumps(ed["context"], ensure_ascii=False, indent=2)) + '</pre>'
        if rev:
            doc += '<h2>Saved review</h2><pre>' + esc(json.dumps(rev, ensure_ascii=False, indent=2)) + '</pre>'
        if changes:
            doc += '<h2>Edition changes and affected resources</h2><pre>' + esc(json.dumps(changes, ensure_ascii=False, indent=2)) + '</pre>'
        doc += '</html>'
        return doc.encode(), "text/html; charset=utf-8"
