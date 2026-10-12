"""MIT. AMP commissioning on the existing IatiWorkspace and its retained sources."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime, timezone
import csv
import html
import io
import json
import os
from pathlib import Path
import threading
from iati_source import InputError
from workspace import private_write, regular, file_digest, sync_dir
from .codec import (loads, dumps, encode, normal, digest, fingerprint, identity, request_id,
                    integer, text, fields, MAX_JSON)
from . import domain
from .native import AmpSession, NativeFailure, now

RUN_SCHEMA = "stellar-forge.iati-amp-native-run.v1"
TABLES = {
    "captures": "iati_amp_captures", "plans": "iati_amp_plans",
    "requests": "iati_amp_requests", "runs": "iati_amp_runs", "events": "iati_amp_events",
}


def _html(value):
    return html.escape(str(value if value is not None else ""), quote=True)


def report(plan, analysis, capture, comparison=None):
    out = ["<!doctype html><html lang='en'><meta charset='utf-8'><title>AMP commissioning report</title>",
           "<meta name='viewport' content='width=device-width,initial-scale=1'><style>",
           "body{font:14px system-ui;color:#202020;background:#fff;max-width:1250px;margin:2rem auto;padding:0 1rem}",
           "h1,h2{line-height:1.2}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}",
           "pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}.scroll{overflow:auto}summary{cursor:pointer}a{color:#222}",
           "@media print{.scroll{overflow:visible}tr{break-inside:avoid}}</style><body>",
           "<h1>" + _html(plan["definition"]["name"]) + "</h1>",
           "<p>Plan " + _html(plan["id"]) + ", revision " + str(plan["revision"]) + " · " + _html(plan["state"]) + "</p>",
           "<h2>Selected native programme</h2><pre>" + _html(dumps(normal({
               "connection": capture["connection"], "coverage": capture["coverage"],
               "acquisition": capture["acquisition"], "portfolio": plan["definition"]["portfolio"]}))) + "</pre>",
           "<h2>Review coverage</h2><pre>" + _html(dumps(normal({
               "counts": analysis["counts"], "completeRowCount": analysis["completeRowCount"],
               "sourceCount": analysis["sourceCount"], "review": plan.get("review"),
               "notes": plan["definition"]["notes"]}))) + "</pre>",
           "<h2>Amounts in their original context</h2><p>Each group retains the original publisher, financial family, currency, date or budget period, and current decision.</p>",
           "<div class='scroll'><table><thead><tr><th>Original dimensions</th><th>Records</th><th>Reported amount</th></tr></thead><tbody>"]
    for group in analysis["financialGroups"]:
        out.append("<tr><td><pre>" + _html(dumps(normal(group["dimensions"]))) + "</pre></td><td>" +
                   str(group["count"]) + "</td><td>" + _html(group["amount"]) + "</td></tr>")
    out += ["</tbody></table></div><h2>Complete original financial rows and receiving decisions</h2>",
            "<div class='scroll'><table><thead><tr><th>Publisher / activity</th><th>Reported money and period</th><th>Decision / destination</th><th>Complete original record</th></tr></thead><tbody>"]
    for item in analysis["rows"]:
        row = item["sourceRow"]
        amount = row.get("value", "") + " " + row.get("currency", "")
        dates = {"transactionDate": row.get("transaction_date"), "valueDate": row.get("value_date"),
                 "budgetStart": row.get("period_start"), "budgetEnd": row.get("period_end")}
        out.append("<tr><td>" + _html(item["publisherRef"]) + "<br>" + _html(item["activityId"]) +
            "<br><small>" + _html(item["key"]) + "</small></td><td>" + _html(amount) + "<pre>" +
            _html(dumps(dates)) + "</pre></td><td><strong>" + _html(item["state"]) + "</strong><pre>" +
            _html(dumps(normal({"decision": item["decision"], "issues": item["issues"],
                               "proposal": item["proposal"]}))) + "</pre></td><td><details><summary>Complete source row</summary><pre>" +
            _html(dumps(row)) + "</pre></details></td></tr>")
    out += ["</tbody></table></div>"]
    if comparison:
        out += ["<h2>Following-edition comparison</h2><pre>" + _html(dumps(normal(comparison))) + "</pre>"]
    out += ["<h2>Original native source</h2><p>" + _html(domain.CONTRACT) +
            ". The complete handover includes the native captures, original IATI portfolio packages, saved mappings, reviews and native receiving journal.</p></body></html>"]
    return "".join(out).encode("utf-8")


class AmpWorkspace:
    def __init__(self, original_iati_workspace):
        self.ws = original_iati_workspace
        self.root = self.ws.root / "amp"
        self.assets = self.root / "assets"
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.assets.mkdir(mode=0o700, exist_ok=True)
        for path in (self.root, self.assets):
            if path.is_symlink() or path.resolve() != path:
                raise InputError("Retain AMP work in the original workspace directory")
        self.ws.db.executescript("""
          CREATE TABLE IF NOT EXISTS iati_amp_captures(id TEXT PRIMARY KEY, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_amp_plans(
            id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(id,revision));
          CREATE TABLE IF NOT EXISTS iati_amp_requests(
            id TEXT PRIMARY KEY, input_sha TEXT NOT NULL, action TEXT NOT NULL,
            input TEXT NOT NULL, result TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_amp_runs(
            id TEXT PRIMARY KEY, plan TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS iati_amp_events(
            sequence INTEGER PRIMARY KEY AUTOINCREMENT, run TEXT NOT NULL, body TEXT NOT NULL,
            original_sequence INTEGER);
        """)
        columns = {row["name"] for row in self.ws.db.execute("PRAGMA table_info(iati_amp_events)")}
        if "original_sequence" not in columns:
            self.ws.db.execute("ALTER TABLE iati_amp_events ADD COLUMN original_sequence INTEGER")
        with self.ws.db:
            self.ws.db.execute("UPDATE iati_amp_events SET original_sequence=sequence WHERE original_sequence IS NULL")
        self._threads = {}
        self._threads_mutex = threading.Lock()

    def _retain(self, raw, name, media="application/json"):
        if not isinstance(raw, bytes) or len(raw) > MAX_JSON:
            raise InputError("Retain a complete AMP record within 64 MiB")
        ident = digest(raw)
        destination = self.assets / (ident + ".bin")
        if destination.exists() or destination.is_symlink():
            if file_digest(destination, MAX_JSON) != ident or destination.stat().st_size != len(raw):
                raise InputError("A retained AMP asset changed")
        else:
            with self.ws.scratch() as temporary:
                stage = temporary / "amp-asset.bin"
                private_write(stage, raw)
                os.link(stage, destination)
                sync_dir(self.assets)
        return {"kind": "amp-asset", "sha256": ident, "bytes": len(raw), "name": name, "media": media}

    def _bytes(self, descriptor):
        fields(descriptor, {"kind", "sha256", "bytes", "name", "media"})
        if descriptor["kind"] != "amp-asset":
            raise InputError("Unknown AMP asset kind")
        path = self.assets / (identity(descriptor["sha256"]) + ".bin")
        if file_digest(path, MAX_JSON) != descriptor["sha256"] or path.stat().st_size != descriptor["bytes"]:
            raise InputError("The complete original AMP asset changed")
        return path.read_bytes()

    def _json(self, descriptor):
        return loads(self._bytes(descriptor))

    def _prior(self, action, raw):
        key = request_id(raw["requestId"])
        sha = fingerprint(raw)
        row = self.ws.db.execute("SELECT * FROM iati_amp_requests WHERE id=?", (key,)).fetchone()
        if row:
            if row["input_sha"] != sha or row["action"] != action:
                raise InputError("This original requestId belongs to a different AMP action")
            return loads(row["result"])
        return None

    def _remember(self, action, raw, result):
        self.ws.db.execute("INSERT INTO iati_amp_requests VALUES(?,?,?,?,?)",
            (raw["requestId"], fingerprint(raw), action, dumps(raw), dumps(result)))

    def request(self, ident):
        request_id(ident)
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT action,result FROM iati_amp_requests WHERE id=?", (ident,)).fetchone()
            return {"requestId": ident, "found": bool(row),
                    "action": row["action"] if row else None,
                    "result": loads(row["result"]) if row else None}

    def captures(self):
        with self.ws.mutex:
            values = [loads(row["body"]) for row in self.ws.db.execute("SELECT body FROM iati_amp_captures ORDER BY rowid DESC")]
        return [{k: value[k] for k in ("id", "name", "createdAt", "connection", "coverage")} for value in values]

    def capture(self, ident):
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT body FROM iati_amp_captures WHERE id=?", (identity(ident),)).fetchone()
            if row is None:
                raise InputError("The original AMP capture is absent")
            value = loads(row["body"])
            if value["id"] != fingerprint({k: v for k, v in value.items() if k != "id"}):
                raise InputError("Retained AMP capture identity changed")
            return value

    def retain_capture(self, raw):
        fields(raw, {"requestId", "capture", "actor"})
        text(raw["actor"], "Named source operator", 160)
        with self.ws.mutex:
            prior = self._prior("capture", raw)
            if prior:
                return prior
            value = domain.capture_input(raw["capture"])
            value["createdAt"], value["actor"] = now(), raw["actor"]
            value["id"] = fingerprint(value)
            with self.ws.db:
                self.ws.db.execute("INSERT OR IGNORE INTO iati_amp_captures VALUES(?,?)", (value["id"], dumps(value)))
                result = {"captureId": value["id"], "connection": value["connection"], "coverage": value["coverage"]}
                self._remember("capture", raw, result)
            return result

    def native_capture(self, raw, credentials):
        fields(raw, {"requestId", "connection", "projectIds", "coverageNote", "name", "actor"})
        text(raw["actor"], "Named source operator", 160)
        with self.ws.mutex:
            prior = self._prior("native-capture", raw)
            if prior:
                return prior
        exchanges = []
        def sink(receipt, body):
            with self.ws.mutex:
                value = deepcopy(receipt)
                if body is not None:
                    value["response"] = self._retain(body, "native-response.json")
                exchanges.append(value)
        with AmpSession(raw["connection"], sink) as session:
            value = session.capture(raw["projectIds"], credentials, raw["coverageNote"], raw["name"])
        value["exchanges"] = exchanges
        value = domain.capture_input(value)
        value["createdAt"], value["actor"] = now(), raw["actor"]
        value["id"] = fingerprint(value)
        with self.ws.mutex, self.ws.db:
            prior = self._prior("native-capture", raw)
            if prior:
                return prior
            self.ws.db.execute("INSERT OR IGNORE INTO iati_amp_captures VALUES(?,?)", (value["id"], dumps(value)))
            result = {"captureId": value["id"], "connection": value["connection"], "coverage": value["coverage"]}
            self._remember("native-capture", raw, result)
        return result

    def plans(self):
        with self.ws.mutex:
            values = [self._decode(row["body"]) for row in self.ws.db.execute("""
                SELECT p.body FROM iati_amp_plans p JOIN
                (SELECT id, MAX(revision) AS revision FROM iati_amp_plans GROUP BY id) latest
                ON p.id=latest.id AND p.revision=latest.revision ORDER BY p.rowid DESC""")]
            return [{"id": p["id"], "revision": p["revision"], "name": p["definition"]["name"],
                     "state": p["state"], "updatedAt": p["updatedAt"], "counts": p["counts"],
                     "portfolio": p["definition"]["portfolio"], "captureId": p["definition"]["captureId"]} for p in values]

    def status(self):
        return {"schema": "stellar-forge.iati-amp-status.v1", "captures": self.captures(),
                "plans": self.plans(), "runs": self.runs(), "contract": domain.CONTRACT}

    def _decode(self, raw):
        result = loads(raw)
        expected = result.get("recordSha256")
        if result.get("schema") != domain.SCHEMA or expected != fingerprint({k: v for k, v in result.items() if k != "recordSha256"}):
            raise InputError("The retained complete AMP plan changed")
        return result

    def plan(self, ident, revision=None):
        identity(ident)
        if revision is not None:
            integer(revision, "AMP plan revision")
        with self.ws.mutex:
            query = "SELECT body FROM iati_amp_plans WHERE id=?"
            args = [ident]
            if revision is not None:
                query += " AND revision=?"; args.append(revision)
            query += " ORDER BY revision DESC LIMIT 1"
            row = self.ws.db.execute(query, args).fetchone()
            if row is None:
                raise InputError("The selected original AMP plan revision is absent")
            return self._decode(row["body"])

    def history(self, ident):
        with self.ws.mutex:
            self.plan(ident)
            return [self._decode(row["body"]) for row in self.ws.db.execute(
                "SELECT body FROM iati_amp_plans WHERE id=? ORDER BY revision", (ident,))]

    def _revision(self, previous, *, actor, **changes):
        result = deepcopy(previous)
        result.pop("recordSha256", None)
        result.update(changes)
        result["revision"] = previous["revision"] + 1
        result["previousRevision"] = previous["revision"]
        result["updatedAt"], result["actor"] = now(), text(actor, "Named operator", 160)
        result["report"] = self._retain(report(result, self._json(result["analysis"]),
            self.capture(result["definition"]["captureId"]),
            self._json(result["comparison"]) if result.get("comparison") else None),
            "AMP_Commissioning_Report.html", "text/html; charset=utf-8")
        result["recordSha256"] = fingerprint(result)
        return result

    def _insert(self, value):
        self.ws.db.execute("INSERT INTO iati_amp_plans VALUES(?,?,?)",
                           (value["id"], value["revision"], dumps(value)))

    def _selection(self, raw):
        plan = self.plan(raw["id"])
        if plan["revision"] != integer(raw["expectedRevision"], "Original AMP expected revision"):
            raise InputError("The AMP plan advanced; open its latest complete revision")
        return plan

    def save(self, raw):
        fields(raw, {"requestId", "definition", "actor"}, {"id", "expectedRevision"})
        text(raw["actor"], "Named commissioning operator", 160)
        with self.ws.mutex:
            prior = self._prior("save", raw)
            if prior:
                return prior
            previous = self._selection(raw) if raw.get("id") else None
            if not previous and raw.get("expectedRevision") is not None:
                raise InputError("A new AMP plan has no expected previous revision")
            selected = raw["definition"].get("portfolio", {})
            fields(selected, {"id", "revision"})
            portfolio = self.ws.portfolio(selected["id"], selected["revision"])
            capture = self.capture(raw["definition"]["captureId"])
            rows = domain.source_rows(self.ws, portfolio)
            definition = domain.plan_definition(raw["definition"], capture, rows)
            analysis = domain.analyse(rows, definition, capture)
            comparison = None
            if definition.get("previousPlan"):
                reference = definition["previousPlan"]
                before = self.plan(reference["id"], reference["revision"])
                comparison = domain.compare(self._json(before["sourceRows"]), rows, definition["correspondence"])
            value = {"schema": domain.SCHEMA, "id": previous["id"] if previous else digest(os.urandom(32)),
                     "revision": previous["revision"] + 1 if previous else 1,
                     "previousRevision": previous["revision"] if previous else None,
                     "createdAt": previous["createdAt"] if previous else now(), "updatedAt": now(),
                     "actor": raw["actor"], "state": "review", "definition": definition,
                     "sourceRows": self._retain(encode(rows), "iati-financial-rows.json"),
                     "analysis": self._retain(encode(analysis), "amp-financial-review.json"),
                     "comparison": self._retain(encode(comparison), "following-edition.json") if comparison else None,
                     "counts": analysis["counts"], "review": None, "prepared": None}
            value["report"] = self._retain(report(value, analysis, capture, comparison),
                                            "AMP_Commissioning_Report.html", "text/html; charset=utf-8")
            value["recordSha256"] = fingerprint(value)
            with self.ws.db:
                self._insert(value)
                result = {"id": value["id"], "revision": value["revision"], "state": value["state"], "counts": value["counts"]}
                self._remember("save", raw, result)
            return result

    def rows(self, ident, revision=None, offset=0, limit=50, state=None):
        integer(offset, "Row offset", 0, 1000000); integer(limit, "Row page size", 1, 250)
        with self.ws.mutex:
            plan = self.plan(ident, revision)
            analysis = self._json(plan["analysis"])
            rows = analysis["rows"]
            if state:
                if state not in {"included", "excluded", "review"}:
                    raise InputError("Choose an original AMP row decision state")
                rows = [r for r in rows if r["state"] == state]
            selected = rows[offset:offset + limit]
            return {"id": ident, "revision": plan["revision"], "analysisSha256": plan["analysis"]["sha256"],
                    "offset": offset, "limit": limit, "total": len(rows), "rows": selected,
                    "nextOffset": offset + len(selected) if offset + len(selected) < len(rows) else None,
                    "counts": analysis["counts"], "financialGroups": analysis["financialGroups"]}


    def decision_preview(self, raw):
        from .batch import preview
        fields(raw, {"id", "revision", "selection"})
        with self.ws.mutex:
            plan = self.plan(raw["id"], raw["revision"])
            return preview(plan, self._json(plan["sourceRows"]), raw["selection"])

    def _derived(self, action, raw):
        key = "amp." + action + "." + fingerprint(raw)
        previous = self.request(key)
        if previous["found"]:
            result = previous["result"]
            with self.ws.db:
                self._remember(action, raw, result)
            return key, result
        return key, None

    def apply_decisions(self, raw):
        from .batch import preview
        fields(raw, {"requestId", "id", "expectedRevision", "selection", "selectedSha256", "decision", "actor"})
        fields(raw["decision"], {"action", "note"},
               {"fundingId", "donorId", "transactionId", "fundingJson", "transactionJson", "dateChoice"})
        with self.ws.mutex:
            prior = self._prior("decisions", raw)
            if prior:
                return prior
            key, recovered = self._derived("decisions", raw)
            if recovered:
                return recovered
            plan = self._selection(raw)
            selection = preview(plan, self._json(plan["sourceRows"]), raw["selection"])
            if selection["selectedSha256"] != raw["selectedSha256"] or not selection["count"]:
                raise InputError("Open the current complete selected scope before applying its decisions")
            definition = deepcopy(plan["definition"])
            for row in selection["rows"]:
                definition["decisions"][row["key"]] = {**raw["decision"], "sourceRowSha256": row["sourceRowSha256"]}
            result = self.save({"requestId": key, "id": plan["id"], "expectedRevision": plan["revision"],
                                "definition": definition, "actor": raw["actor"]})
            with self.ws.db:
                self._remember("decisions", raw, result)
            return result

    def advance(self, raw):
        """Carry real received IDs into the next original publisher edition."""
        fields(raw, {"requestId", "id", "revision", "portfolio", "captureId", "name", "actor", "notes"}, {"correspondence"})
        with self.ws.mutex:
            prior = self._prior("advance", raw)
            if prior:
                return prior
            key, recovered = self._derived("advance", raw)
            if recovered:
                return recovered
            previous = self.plan(raw["id"], raw["revision"])
            original_capture = self.capture(previous["definition"]["captureId"])
            capture = self.capture(raw["captureId"])
            if any(capture["connection"][field] != original_capture["connection"][field] for field in ("baseUrl", "workspaceId")):
                raise InputError("A following edition continues the same original AMP workspace")
            fields(raw["portfolio"], {"id", "revision"})
            current_rows = domain.source_rows(self.ws, self.ws.portfolio(raw["portfolio"]["id"], raw["portfolio"]["revision"]))
            before_rows = self._json(previous["sourceRows"])
            pairs = raw.get("correspondence", [])
            changes = domain.compare(before_rows, current_rows, pairs)
            before_by_after = {item["after"]["key"]: item for item in changes["rows"] if item["after"]}
            projects = domain.project_index(capture)
            native_rows, native_links = {}, {}
            previous_steps = self._json(previous["prepared"]) if previous.get("prepared") else None
            for summary in reversed(self.runs(previous["id"])):
                run = self.run(summary["id"])
                linked = any(item["plan"] == previous["id"] and item["revision"] == previous["revision"]
                             for item in run.get("linkedPreparations", []))
                if summary["revision"] != previous["revision"] and not linked:
                    continue
                selected_steps = (domain.corresponding_native_steps(previous_steps, run["steps"])
                                  if previous_steps is not None else [(s, s) for s in run["steps"]])
                for current_step, step in selected_steps:
                    if step["state"] != "complete" or not step.get("result") or not step.get("afterId"):
                        continue
                    native_links[current_step["key"]] = step["afterId"]
                    if step["afterId"] not in projects:
                        continue
                    # A linked preparation can carry newer source row keys. Reconcile those
                    # exact current rows against the original complete received native body.
                    received_result = (domain.receiving(current_step, self._bytes(step["actual"]))
                                       if step.get("actual") else self._json(step["result"]))
                    for received in received_result.get("rows", []):
                        if received.get("state") == "received":
                            native_rows[received["rowKey"]] = received["native"]
            definition = deepcopy(previous["definition"])
            definition.update({"name": raw["name"], "notes": raw["notes"], "portfolio": raw["portfolio"],
                               "captureId": raw["captureId"], "previousPlan": {"id": previous["id"], "revision": previous["revision"]},
                               "correspondence": pairs, "decisions": {}})
            links = []
            for link in definition["activityLinks"]:
                target_key = "project:" + str(link["projectId"]) if "projectId" in link else "draft:" + link["draftId"]
                received_id = native_links.get(target_key)
                original_id = link.get("projectId")
                destination = received_id if received_id in projects else original_id if original_id in projects else None
                if destination is not None:
                    links.append({k: v for k, v in link.items() if k not in {"projectId", "draftId"}} | {"projectId": destination})
                elif "draftId" in link and not native_links.get(target_key):
                    links.append(link)
            definition["activityLinks"] = links
            for collection, path in (("measureLinks", None), ("currencyLinks", "currency")):
                kept = []
                for link in definition[collection]:
                    paths = [f"fundings~{link['family']}~adjustment_type"] if collection == "measureLinks" else [
                        f"fundings~{family}~currency" for family in domain.FAMILIES]
                    selected = link["adjustmentId"] if collection == "measureLinks" else link["nativeId"]
                    try:
                        for field_path in paths:
                            domain.validate_native_choice(capture, field_path, selected)
                    except InputError:
                        continue
                    kept.append(link)
                definition[collection] = kept
            for current in current_rows:
                change = before_by_after[current["key"]]
                old = change.get("before")
                if not old:
                    continue
                old_decision = previous["definition"]["decisions"].get(old["key"])
                if not old_decision:
                    continue
                decision = deepcopy(old_decision)
                decision["sourceRowSha256"] = current["sourceRowSha256"]
                received = native_rows.get(old["key"])
                if received and received.get("fundingId") and received.get("transactionId"):
                    decision["fundingId"] = received["fundingId"]
                    decision["donorId"] = received["donorId"]
                    decision["transactionId"] = received["transactionId"]
                    decision.pop("fundingJson", None)
                if change["state"] != "unchanged":
                    decision["action"] = "review"
                    decision["note"] = "Following edition changed this original record. Previous decision: " + old_decision["note"]
                elif old_decision["action"] == "include" and not decision.get("transactionId"):
                    decision["action"] = "review"
                    decision["note"] = "Map the actual received native transaction before continuing this unchanged record. Previous decision: " + old_decision["note"]
                definition["decisions"][current["key"]] = decision
            result = self.save({"requestId": key, "definition": definition, "actor": raw["actor"]})
            with self.ws.db:
                self._remember("advance", raw, result)
            return result

    def review(self, raw):
        fields(raw, {"requestId", "id", "expectedRevision", "analysisSha256", "actor", "decision", "note"})
        with self.ws.mutex:
            prior = self._prior("review", raw)
            if prior:
                return prior
            plan = self._selection(raw)
            if raw["analysisSha256"] != plan["analysis"]["sha256"]:
                raise InputError("Open the current complete financial analysis before reviewing")
            if raw["decision"] not in {"approve", "changes"}:
                raise InputError("Choose approve or changes for this complete review")
            analysis = self._json(plan["analysis"])
            if raw["decision"] == "approve" and not analysis["ready"]:
                raise InputError("Complete the original row decisions and installed mappings before approval")
            decision = {"actor": text(raw["actor"], "Named reviewer", 160),
                        "decision": raw["decision"], "note": text(raw["note"], "Review note", 16000),
                        "analysisSha256": raw["analysisSha256"], "at": now()}
            value = self._revision(plan, actor=raw["actor"], review=decision, prepared=None,
                                   state="reviewed" if raw["decision"] == "approve" else "changes")
            with self.ws.db:
                self._insert(value)
                result = {"id": value["id"], "revision": value["revision"], "state": value["state"]}
                self._remember("review", raw, result)
            return result

    def prepare(self, raw):
        fields(raw, {"requestId", "id", "expectedRevision", "actor"})
        with self.ws.mutex:
            prior = self._prior("prepare", raw)
            if prior:
                return prior
            plan = self._selection(raw)
            if (not plan["review"] or plan["review"]["decision"] != "approve"
                    or plan["review"]["analysisSha256"] != plan["analysis"]["sha256"]):
                raise InputError("Record the complete current financial review before native preparation")
            prepared = domain.prepare(self._json(plan["analysis"]), plan["definition"],
                                      self.capture(plan["definition"]["captureId"]))
            descriptor = self._retain(encode(prepared), "complete-native-project-requests.json")
            if plan["state"] == "prepared" and plan.get("prepared") == descriptor:
                result = {"id": plan["id"], "revision": plan["revision"], "state": plan["state"],
                          "projectCount": len(prepared), "prepared": descriptor, "reused": True}
                with self.ws.db:
                    self._remember("prepare", raw, result)
                return result
            value = self._revision(plan, actor=raw["actor"], state="prepared", prepared=descriptor)
            with self.ws.db:
                self._insert(value)
                result = {"id": value["id"], "revision": value["revision"], "state": value["state"],
                          "projectCount": len(prepared), "prepared": descriptor}
                self._remember("prepare", raw, result)
            return result

    def runs(self, plan=None):
        with self.ws.mutex:
            if plan is not None:
                identity(plan)
                values = [loads(r["body"]) for r in self.ws.db.execute("SELECT body FROM iati_amp_runs WHERE plan=? ORDER BY rowid DESC", (plan,))]
            else:
                values = [loads(r["body"]) for r in self.ws.db.execute("SELECT body FROM iati_amp_runs ORDER BY rowid DESC")]
            return [{k: value[k] for k in ("id", "plan", "revision", "state", "startedAt", "updatedAt", "projectCount")} for value in values]

    def run(self, ident):
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT body FROM iati_amp_runs WHERE id=?", (identity(ident),)).fetchone()
            if row is None:
                raise InputError("The original native receiving operation is absent")
            return loads(row["body"])

    def events(self, ident, after=0, limit=100):
        self.run(ident)
        integer(after, "Original event position", 0, 2**63 - 1)
        integer(limit, "Event page size", 1, 250)
        with self.ws.mutex:
            rows = self.ws.db.execute("SELECT sequence,original_sequence,body FROM iati_amp_events WHERE run=? AND sequence>? ORDER BY sequence LIMIT ?",
                                     (ident, after, limit + 1)).fetchall()
            page = rows[:limit]
            return {"runId": ident, "events": [{"sequence": r["sequence"], "originalSequence": r["original_sequence"], **loads(r["body"])} for r in page],
                    "nextAfter": page[-1]["sequence"] if len(rows) > limit else None}

    def _event(self, ident, stage, body):
        event = {"at": now(), "stage": stage, **normal(body)}
        with self.ws.mutex, self.ws.db:
            next_sequence = self.ws.db.execute("SELECT COALESCE(MAX(original_sequence),0)+1 FROM iati_amp_events WHERE run=?", (ident,)).fetchone()[0]
            self.ws.db.execute("INSERT INTO iati_amp_events(run,body,original_sequence) VALUES(?,?,?)",
                               (ident, dumps(event), next_sequence))

    def _update_run(self, value):
        value["updatedAt"] = now()
        with self.ws.mutex, self.ws.db:
            current = self.ws.db.execute("SELECT body FROM iati_amp_runs WHERE id=?", (value["id"],)).fetchone()
            links = {}
            for item in [*(loads(current["body"]).get("linkedPreparations", []) if current else []),
                         *value.get("linkedPreparations", [])]:
                key = (item["plan"], item["revision"])
                if key in links and links[key] != item:
                    raise InputError("A linked native preparation has a different original request")
                links[key] = item
            if links:
                value["linkedPreparations"] = [links[key] for key in sorted(links)]
            self.ws.db.execute("UPDATE iati_amp_runs SET body=? WHERE id=?", (dumps(value), value["id"]))
        return value

    def start_run(self, raw):
        fields(raw, {"requestId", "id", "expectedRevision", "actor", "preparedSha256"})
        with self.ws.mutex:
            prior = self._prior("native-start", raw)
            if prior:
                return prior
            plan = self._selection(raw)
            if plan["state"] != "prepared" or not plan["prepared"] or plan["prepared"]["sha256"] != raw["preparedSha256"]:
                raise InputError("Select the current complete prepared native request set")
            capture = self.capture(plan["definition"]["captureId"])
            if not capture["connection"].get("expectedUserId"):
                raise InputError("Receive the actual native session/account and installed workspace before submitting this plan")
            steps = self._json(plan["prepared"])
            request_set = domain.native_request_set(capture["connection"], steps)
            # Reviewed labels, source-row identities and preparation revisions do not authorize
            # a second execution of the same complete original native mutation.
            prior_runs = self.ws.db.execute(
                "SELECT body FROM iati_amp_runs WHERE plan=? ORDER BY rowid", (plan["id"],)).fetchall()
            for row in prior_runs:
                existing = loads(row["body"])
                if domain.native_request_set(existing["connection"], existing["steps"]) != request_set:
                    continue
                domain.corresponding_native_steps(steps, existing["steps"])
                link = {"plan": plan["id"], "revision": plan["revision"],
                        "preparedSha256": plan["prepared"]["sha256"]}
                links = existing.setdefault("linkedPreparations", [])
                new_link = not any(item["plan"] == link["plan"] and item["revision"] == link["revision"]
                                   for item in links)
                if new_link:
                    links.append(link)
                    self._update_run(existing)
                    self._event(existing["id"], "preparation-linked", link)
                result = {"runId": existing["id"], "state": existing["state"], "reused": True,
                          "originalRevision": existing["revision"], "linkedRevision": plan["revision"]}
                with self.ws.db:
                    self._remember("native-start", raw, result)
                return result
            value = {"schema": RUN_SCHEMA, "id": digest(os.urandom(32)), "plan": plan["id"],
                     "revision": plan["revision"], "actor": text(raw["actor"], "Named native operator", 160),
                     "captureId": capture["id"], "connection": capture["connection"],
                     "preparedSha256": plan["prepared"]["sha256"], "startedAt": now(), "updatedAt": now(),
                     "state": "prepared", "projectCount": len(steps),
                     "steps": [{**step, "state": "prepared", "afterId": None, "result": None} for step in steps]}
            with self.ws.db:
                self.ws.db.execute("INSERT INTO iati_amp_runs VALUES(?,?,?,?)",
                                  (value["id"], value["plan"], value["revision"], dumps(value)))
                result = {"runId": value["id"], "state": value["state"], "reused": False}
                self._remember("native-start", raw, result)
            self._event(value["id"], "prepared", {"preparedSha256": value["preparedSha256"], "projectCount": len(steps)})
            return result

    def _sink(self, ident):
        def accept(receipt, body):
            with self.ws.mutex:
                saved = deepcopy(receipt)
                if body is not None:
                    saved["response"] = self._retain(body, "native-response.json")
                self._event(ident, "native-http", saved)
        return accept

    def launch(self, ident, credentials):
        """Use the existing HTTP process; persisted native steps survive its lifetime."""
        with self._threads_mutex:
            active = self._threads.get(ident)
            if active and active.is_alive():
                return {"runId": ident, "active": True, "state": self.run(ident)["state"]}
            self.run(ident)
            def work():
                try:
                    self.execute(ident, credentials)
                except Exception as error:
                    self._event(ident, "worker-ended", {"errorType": type(error).__name__, "message": str(error)})
                finally:
                    credentials.clear()
            worker = threading.Thread(target=work, name="amp-native-" + ident[:12], daemon=True)
            self._threads[ident] = worker
            worker.start()
            return {"runId": ident, "active": True, "state": self.run(ident)["state"]}

    def execute(self, ident, credentials):
        """Continue the one original prepared operation. Ambiguous writes are read back."""
        import fcntl
        lock_path = self.root / ("native-" + identity(ident) + ".lock")
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return self.run(ident)
            value = self.run(ident)
            if value["state"] == "complete":
                return value
            capture = self.capture(value["captureId"])
            sink = self._sink(ident)
            try:
                with AmpSession(value["connection"], sink) as session:
                    session.authenticate(credentials)
                    current_fields, _, _ = session.request("GET", "activity/fields")
                    current_values, _, _ = session.request("POST", "activity/field/values", domain.DEFAULT_VALUE_FIELDS)
                    if (fingerprint(current_fields) != fingerprint(loads(capture["fieldsJson"]))
                            or fingerprint(current_values) != fingerprint(loads(capture["valuesJson"]))):
                        value["state"] = "configuration-changed"
                        self._event(ident, "configuration-changed", {"captureId": capture["id"]})
                        return self._update_run(value)
                    value["state"] = "running"
                    self._update_run(value)
                    for step in value["steps"]:
                        if step["state"] == "complete":
                            continue
                        if step["state"] in {"sending", "uncertain", "different", "rejected", "preimage-changed"}:
                            value["state"] = "needs-reconciliation"
                            return self._update_run(value)
                        if step["state"] == "prepared":
                            if step["mode"] == "update":
                                actual, _, _ = session.project(step["originalId"])
                                if fingerprint(actual) != step["preimageSha256"]:
                                    step["state"] = "preimage-changed"
                                    value["state"] = "needs-reconciliation"
                                    self._event(ident, "preimage-changed", {"key": step["key"],
                                        "expected": step["preimageSha256"], "actual": fingerprint(actual)})
                                    return self._update_run(value)
                            step["state"] = "sending"
                            self._update_run(value)
                            self._event(ident, "sending", {"key": step["key"], "requestSha256": step["requestSha256"]})
                            try:
                                response, raw_response, receipt = session.submit(step)
                            except NativeFailure as error:
                                step["state"] = "uncertain" if error.uncertain else "rejected"
                                step["message"] = str(error)
                                value["state"] = "needs-reconciliation"
                                return self._update_run(value)
                            new_id = response.get("internal_id") if isinstance(response, dict) else None
                            if type(new_id) is not int or new_id < 1:
                                step["state"] = "uncertain"
                                value["state"] = "needs-reconciliation"
                                self._event(ident, "native-response-without-id", {"key": step["key"], "responseSha256": digest(raw_response)})
                                return self._update_run(value)
                            step["afterId"], step["state"] = new_id, "post-response"
                            step["responseSha256"] = digest(raw_response)
                            step["warnings"] = normal(response.get("warnings", response.get("warning")))
                            self._update_run(value)
                        # Both a fresh write and a resumed post-response state use read-only receiving.
                        actual, actual_raw, _ = session.project(step["afterId"])
                        result = domain.receiving(step, actual_raw)
                        with self.ws.mutex:
                            step["actual"] = self._retain(actual_raw, "received-native-project.json")
                            step["result"] = self._retain(encode(result), "native-financial-receiving.json")
                        step["state"] = "complete" if result["state"] == "received" else "different"
                        self._event(ident, "receiving", {"key": step["key"], "state": step["state"], "result": step["result"]})
                        if step["state"] != "complete":
                            value["state"] = "needs-reconciliation"
                            return self._update_run(value)
                        self._update_run(value)
                    value["state"] = "complete"
                    self._event(ident, "complete", {"projectCount": value["projectCount"]})
                    return self._update_run(value)
            except NativeFailure as error:
                value["state"] = "needs-reconciliation" if any(s["state"] in {"sending", "uncertain", "post-response"} for s in value["steps"]) else "native-read-failed"
                value["message"] = str(error)
                return self._update_run(value)
        finally:
            os.close(descriptor)

    def reconcile(self, raw, credentials):
        fields(raw, {"requestId", "runId", "stepKey", "nativeId", "actor", "note"})
        integer(raw["nativeId"], "Original receiving native project ID")
        text(raw["actor"], "Named receiving operator", 160); text(raw["note"], "Original receiving note", 16000)
        with self.ws.mutex:
            prior = self._prior("native-reconcile", raw)
            if prior:
                return prior
            value = self.run(raw["runId"])
            selected = [s for s in value["steps"] if s["key"] == raw["stepKey"]]
            if len(selected) != 1:
                raise InputError("Select one retained original native step")
            step = selected[0]
            if step.get("afterId") is not None and step["afterId"] != raw["nativeId"]:
                raise InputError("Receive the exact native project ID already returned by this original send")
            if step["state"] == "prepared":
                raise InputError("This step has no uncertain or completed native send to receive")
            if step["state"] == "complete":
                return {"runId": value["id"], "stepKey": step["key"], "state": "complete"}
        import fcntl
        lock_path = self.root / ("native-" + identity(value["id"]) + ".lock")
        descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise InputError("The original native operation is still active; read its current progress") from error
            value = self.run(raw["runId"])
            step = next(s for s in value["steps"] if s["key"] == raw["stepKey"])
            if step.get("afterId") is not None and step["afterId"] != raw["nativeId"]:
                raise InputError("The original send already returned a different native project ID")
            if step["state"] == "complete":
                return {"runId": value["id"], "stepKey": step["key"], "state": "complete"}
            with AmpSession(value["connection"], self._sink(value["id"])) as session:
                session.authenticate(credentials)
                _, actual_raw, _ = session.project(raw["nativeId"])
            result = domain.receiving(step, actual_raw)
            with self.ws.mutex, self.ws.db:
                step["actual"] = self._retain(actual_raw, "reconciled-native-project.json")
                step["result"] = self._retain(encode(result), "reconciled-financial-receiving.json")
                step["afterId"] = raw["nativeId"]
                step["state"] = "complete" if result["state"] == "received" else "different"
                value["state"] = "complete" if all(s["state"] == "complete" for s in value["steps"]) else "prepared" if all(s["state"] in {"complete", "prepared"} for s in value["steps"]) else "needs-reconciliation"
                self._update_run(value)
                response = {"runId": value["id"], "stepKey": step["key"], "state": step["state"], "result": step["result"]}
                self._remember("native-reconcile", raw, response)
                self._event(value["id"], "explicit-receiving", {"actor": raw["actor"], "note": raw["note"], **response})
            return response
        finally:
            os.close(descriptor)

    def file(self, ident, revision, kind):
        with self.ws.mutex:
            plan = self.plan(ident, revision)
            if kind not in {"analysis", "sourceRows", "comparison", "prepared", "report"} or not plan.get(kind):
                raise InputError("Select an available complete AMP file")
            descriptor = plan[kind]
            self._bytes(descriptor)
            return {"path": self.assets / (descriptor["sha256"] + ".bin"),
                    **{k: descriptor[k] for k in ("name", "media", "bytes", "sha256")}}

    def asset(self, sha):
        identity(sha)
        path = self.assets / (sha + ".bin")
        size = regular(path, MAX_JSON).st_size
        if file_digest(path, MAX_JSON) != sha:
            raise InputError("The retained AMP native result changed")
        return {"path": path, "name": "amp-original-" + sha + ".json", "media": "application/json",
                "bytes": size, "sha256": sha}

    def export(self, ident, output, revision=None):
        from .portable import export_plan
        return export_plan(self, ident, output, revision)

    def receive(self, filename):
        from .portable import receive_plan
        return receive_plan(self, filename)
