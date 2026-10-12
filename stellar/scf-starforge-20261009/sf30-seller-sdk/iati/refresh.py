"""MIT. Saved publisher refresh plans over the original IATI portfolio and native engines."""
from __future__ import annotations

import csv
import hashlib
import html
import io
import math
import os
from pathlib import Path
import re
import stat
import time
import zipfile

from iati_workspace import (
    InputError, COLLECTIONS, MAX_PACKET, MAX_METADATA, MAX_FILES,
    REQUEST, revision_number, short_text, packet_write,
)
from workspace import (
    json_bytes, load_json, digest, checked_id, private_write,
    regular, file_digest, sync_dir,
)

PLAN = "stellar-forge.iati-refresh-plan.v1"
RUN = "stellar-forge.iati-refresh-run.v1"
JOURNAL = "stellar-forge.iati-refresh-journal.v1"
ACTION = "stellar-forge.iati-refresh-action.v1"
PREVIEW = "stellar-forge.iati-refresh-preview.v1"
PACKET = "stellar-forge.iati-refresh-packet.v1"
REPORT = "stellar-forge.iati-refresh-report.v1"
HERE = Path(__file__).resolve().parent
OPEN = {"AWAITING_REVIEW", "REVIEWED", "NEEDS_CORRECTION"}
KINDS = {"plan-save", "start", "review", "promote", "cancel", "abandon"}
GUIDES = ("REFRESH.md", "OPERATIONS.md", "DOMAIN.md")


def clone(value):
    return load_json(json_bytes(value))


def fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= set(value) or set(value) - set(required) - set(optional):
        raise InputError("Use the complete declared refresh fields without unknown properties")


def request_id(value):
    if not isinstance(value, str) or not REQUEST.fullmatch(value):
        raise InputError("Use the original requestId: 1–160 letters, digits, dots, dashes, underscores or colons")
    return value


def moment(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= 253402300799:
        raise InputError("A retained refresh time must be a finite nonnegative Unix timestamp")
    return value


def native_selection(portfolio):
    return {key: clone(portfolio[key]) for key in
            ("id", "revision", "definitionSha256", "sources", "selection", "review")}


def latest_run(doc, ident):
    checked_id(ident)
    rows = doc["runs"].get(ident)
    if not rows:
        raise InputError("Unknown saved refresh run")
    return clone(rows[-1])


def current_plan(doc):
    if not doc["plans"]:
        raise InputError("The refresh plan has no complete saved definition")
    return clone(doc["plans"][-1])


def pending_action(doc):
    rows = [a for a in doc["actions"] if a["state"] == "PREPARED"]
    if len(rows) > 1:
        raise InputError("Refresh history contains more than one unresolved original request")
    return rows[0] if rows else None


def action_digest(kind, raw):
    return digest(json_bytes({"action": kind, "input": raw}))


def page(items, offset=0, limit=50, expected_snapshot=None):
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 250:
        raise InputError("Choose an original page offset and a limit from 1 to 250")
    snapshot = digest(json_bytes(items))
    if expected_snapshot is not None and checked_id(expected_snapshot) != snapshot:
        raise InputError("Refresh inventory changed; start a new page-zero snapshot")
    if offset and expected_snapshot is None:
        raise InputError("Continue the retained inventory snapshot for subsequent pages")
    if offset > len(items):
        raise InputError("Page offset exceeds the complete retained inventory")
    return {"snapshot": snapshot, "offset": offset, "total": len(items),
            "items": items[offset:offset + limit],
            "nextOffset": offset + limit if offset + limit < len(items) else None}


class IatiRefresh:
    def __init__(self, workspace):
        self.ws = workspace
        self.root = workspace.root / "refresh"
        self.root.mkdir(mode=0o700, exist_ok=True)
        if self.root.is_symlink() or self.root.resolve() != self.root:
            raise InputError("Refresh custody must remain in the original private workspace")
        info = self.root.stat()
        if os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
            raise InputError("Refresh custody must remain private and operator-owned")
        self.exports = self.root / "portfolio-exports"
        self.exports.mkdir(mode=0o700, exist_ok=True)
        if self.exports.is_symlink() or self.exports.resolve() != self.exports:
            raise InputError("Original portfolio export custody must be a real directory")
        workspace.db.executescript("""
            CREATE TABLE IF NOT EXISTS iati_refresh_journals(
                id TEXT PRIMARY KEY, portfolio TEXT NOT NULL, plan_revision INTEGER NOT NULL,
                plan_body TEXT NOT NULL, active_run TEXT, body TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS iati_refresh_requests(
                id TEXT PRIMARY KEY, plan TEXT NOT NULL, ordinal INTEGER NOT NULL,
                kind TEXT NOT NULL, input_sha TEXT NOT NULL);
        """)

    def context(self):
        return {"schema": "stellar-forge.iati-refresh-context.v1",
                "workspaceSha256": self.ws.publishing.context()["workspaceSha256"]}

    def _document(self, ident):
        row = self.ws.db.execute("SELECT body FROM iati_refresh_journals WHERE id=?",
                                 (checked_id(ident),)).fetchone()
        if row is None:
            raise InputError("Unknown saved publisher refresh plan")
        value = load_json(row["body"])
        if value.get("schema") != JOURNAL or value.get("id") != ident:
            raise InputError("Retained refresh journal identity differs")
        return value

    def _store(self, doc):
        data = json_bytes(doc)
        if len(data) > MAX_METADATA:
            raise InputError("The complete refresh history exceeds 64 MiB; no history was shortened")
        plan = current_plan(doc)
        unresolved = pending_action(doc)
        active = unresolved["prepared"].get("runId") if unresolved else None
        if active is None:
            active = next((ident for ident, rows in doc["runs"].items() if rows[-1]["state"] in OPEN), None)
        with self.ws.db:
            for action in doc["actions"]:
                expected = (doc["id"], action["ordinal"], action["kind"], action["inputSha256"])
                previous = self.ws.db.execute("SELECT plan,ordinal,kind,input_sha FROM iati_refresh_requests WHERE id=?",
                                              (action["requestId"],)).fetchone()
                if previous is not None and tuple(previous) != expected:
                    raise InputError("The original refresh request belongs to different saved work")
                self.ws.db.execute("INSERT OR IGNORE INTO iati_refresh_requests VALUES(?,?,?,?,?)",
                                   (action["requestId"], *expected))
            self.ws.db.execute("""
                INSERT INTO iati_refresh_journals VALUES(?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET portfolio=excluded.portfolio,
                plan_revision=excluded.plan_revision,plan_body=excluded.plan_body,
                active_run=excluded.active_run,body=excluded.body
            """, (doc["id"], doc["portfolioId"], plan["revision"], json_bytes(plan).decode(),
                  active, data.decode()))

    def plans(self):
        with self.ws.mutex:
            return [load_json(row["plan_body"]) for row in self.ws.db.execute(
                "SELECT plan_body FROM iati_refresh_journals ORDER BY id")]

    def plan(self, ident, revision=None):
        with self.ws.mutex:
            doc = self._document(ident)
            if revision is None:
                return current_plan(doc)
            revision_number(revision)
            if revision > len(doc["plans"]):
                raise InputError("Unknown saved refresh plan revision")
            return clone(doc["plans"][revision - 1])

    def history(self, ident):
        with self.ws.mutex:
            return clone(self._document(ident)["plans"])

    def runs(self, ident):
        with self.ws.mutex:
            doc = self._document(ident)
            return [clone(rows[-1]) for _, rows in sorted(doc["runs"].items(),
                    key=lambda item: (item[1][0]["created"], item[0]))]

    def run(self, plan, ident, revision=None):
        with self.ws.mutex:
            doc = self._document(plan)
            current = latest_run(doc, ident)
            if revision is None:
                return current
            revision_number(revision)
            if revision > len(doc["runs"][ident]):
                raise InputError("Unknown saved refresh run revision")
            return clone(doc["runs"][ident][revision - 1])

    def run_history(self, plan, ident):
        with self.ws.mutex:
            doc = self._document(plan)
            latest_run(doc, ident)
            return clone(doc["runs"][ident])

    def request(self, ident):
        request_id(ident)
        with self.ws.mutex:
            row = self.ws.db.execute("SELECT * FROM iati_refresh_requests WHERE id=?", (ident,)).fetchone()
            if row is None:
                return {"requestId": ident, "state": "NOT_RECORDED"}
            doc = self._document(row["plan"])
            action = doc["actions"][row["ordinal"] - 1]
            if (action["requestId"] != ident or action["kind"] != row["kind"]
                    or action["inputSha256"] != row["input_sha"]):
                raise InputError("Retained refresh request lookup differs from its original journal")
            return clone(action)

    def _source(self, ident):
        source = self.ws.source(ident)
        path = self.ws.root / "sources" / (ident + ".iati")
        if file_digest(path) != ident or regular(path).st_size != source["bytes"]:
            raise InputError("A selected complete publisher source no longer matches its original bytes")
        return {"id": ident, "bytes": source["bytes"],
                "inventorySha256": digest(json_bytes(source["inventory"]))}

    def _baseline(self, selected):
        original = self.ws.portfolio(selected["id"], selected["revision"])
        if native_selection(original) != selected:
            raise InputError("The saved baseline differs from its original portfolio revision")
        return original

    def _native_id(self, plan, request, step):
        return "iati-refresh:" + digest(json_bytes({"plan": plan, "requestId": request, "step": step}))

    def _preview(self, doc, raw, *, historical=False):
        fields(raw, {"planId", "expectedPlanRevision", "expectedPortfolioRevision", "sources", "pairs"},
               {"selection", "selectionNote", "sourceChangeNote"})
        if checked_id(raw["planId"]) != doc["id"]:
            raise InputError("Select this exact original refresh plan")
        plan = current_plan(doc)
        if revision_number(raw["expectedPlanRevision"]) != plan["revision"]:
            raise InputError("Refresh plan changed; reopen its current definition")
        if plan["state"] != "ACTIVE":
            raise InputError("Reopen an active plan before preparing its next publisher edition")
        head = revision_number(raw["expectedPortfolioRevision"])
        current = self.ws.portfolio(doc["portfolioId"], head if historical else None)
        if current["revision"] != head:
            raise InputError("The original portfolio advanced; review the current revision and preview again")
        before = self._baseline(plan["baseline"])
        if head < before["revision"]:
            raise InputError("The selected current portfolio revision precedes the saved baseline")
        sources = raw["sources"]
        if (not isinstance(sources, list) or not 1 <= len(sources) <= 32
                or any(not isinstance(x, str) for x in sources) or len(set(sources)) != len(sources)):
            raise InputError("Select 1–32 distinct complete publisher source IDs")
        sources = sorted(checked_id(x) for x in sources)
        old, new = set(before["sources"]), set(sources)
        replacements = raw["pairs"]
        if not isinstance(replacements, list):
            raise InputError("Explicit publisher replacements must be an array")
        left, right, pairs = old - new, new - old, []
        for pair in replacements:
            fields(pair, {"before", "after"})
            if pair["before"] not in left or pair["after"] not in right:
                raise InputError("Pair each changed earlier publisher with one distinct later edition; unchanged IDs are paired automatically")
            left.remove(pair["before"]); right.remove(pair["after"])
            pairs.append({"before": pair["before"], "after": pair["after"]})
        pairs.sort(key=lambda row: (row["before"], row["after"]))
        source_note = short_text(raw.get("sourceChangeNote", ""), "Source change note", 4000,
                                 empty=not (left or right))
        selection = raw.get("selection", before["selection"])
        native = {"requestId": "refresh-preview", "id": before["id"], "expectedRevision": head,
                  "name": before["name"], "notes": before["notes"], "sources": sources,
                  "selection": selection, "review": {"status": "draft", "reviewer": "", "note": ""}}
        _, _, _, definition, _ = self.ws._definition(native)
        changed = definition["selection"] != before["selection"]
        selection_note = short_text(raw.get("selectionNote", ""), "Selection change note", 4000, empty=not changed)
        result = {"schema": PREVIEW, "planId": doc["id"], "planRevision": plan["revision"],
                  "portfolioId": doc["portfolioId"], "expectedPortfolioRevision": head,
                  "baseline": clone(plan["baseline"]), "sources": sources, "pairs": pairs,
                  "unchangedSources": sorted(old & new), "addedSources": sorted(right),
                  "removedSources": sorted(left), "sourceChangeNote": source_note,
                  "selection": definition["selection"], "selectionChanged": changed,
                  "selectionNote": selection_note,
                  "sourceFiles": [self._source(ident) for ident in sorted(old | new)],
                  "beforeCounts": clone(before["report"]["counts"])}
        return {**result, "sha256": digest(json_bytes(result))}

    def preview(self, raw):
        if not isinstance(raw, dict) or len(json_bytes(raw)) > 131072:
            raise InputError("Use one complete preview within 128 KiB")
        with self.ws.mutex:
            return self._preview(self._document(raw.get("planId")), raw)

    def _input(self, kind, raw):
        if kind not in KINDS:
            raise InputError("Choose an original saved refresh action")
        if not isinstance(raw, dict) or len(json_bytes(raw)) > 131072:
            raise InputError("Use one complete refresh action within 128 KiB")
        request_id(raw.get("requestId"))
        if kind == "plan-save":
            if "id" in raw:
                fields(raw, {"requestId", "id", "expectedRevision", "name", "owner"},
                       {"note", "state"})
            else:
                fields(raw, {"requestId", "name", "owner", "portfolioId", "baselineRevision"},
                       {"note", "state"})
        elif kind == "start":
            fields(raw, {"requestId", "planId", "expectedPlanRevision", "expectedPortfolioRevision",
                         "sources", "pairs", "previewSha256", "label", "actor"},
                   {"selection", "selectionNote", "sourceChangeNote", "note"})
        elif kind == "review":
            fields(raw, {"requestId", "planId", "runId", "expectedRevision", "expectedPortfolioRevision", "review"})
        elif kind == "promote":
            fields(raw, {"requestId", "planId", "runId", "expectedRevision", "expectedPlanRevision", "actor", "note"})
        elif kind == "cancel":
            fields(raw, {"requestId", "planId", "runId", "expectedRevision", "actor", "note"})
        else:
            fields(raw, {"requestId", "planId", "pendingRequestId", "actor", "note"})
        return clone(raw)

    def _new_document(self, raw, origin):
        checked_id(origin)
        ident = digest(json_bytes({"schema": PLAN, "origin": origin, "requestId": raw["requestId"]}))
        return {"schema": JOURNAL, "id": ident, "portfolioId": checked_id(raw["portfolioId"]),
                "originWorkspace": origin, "plans": [], "runs": {}, "actions": []}

    def _assert_pending(self, doc, kind, raw):
        pending = pending_action(doc)
        if kind == "abandon":
            if pending is None or pending["requestId"] != raw["pendingRequestId"]:
                raise InputError("Select the exact unresolved original refresh request")
            if pending["kind"] not in {"start", "review"} or pending.get("native") is not None:
                raise InputError("Resume the recorded native result before cancelling its saved run")
            native_id = pending["prepared"]["nativeRequest"]["requestId"]
            if self.ws.db.execute("SELECT id FROM iati_requests WHERE id=?", (native_id,)).fetchone():
                raise InputError("The original native portfolio save already succeeded; resume it before choosing a run disposition")
        elif pending is not None:
            raise InputError("Resume or explicitly abandon the unexecuted original refresh request before another action")

    def _prepare(self, doc, kind, raw, at, *, historical=False):
        moment(at)
        self._assert_pending(doc, kind, raw)
        if kind == "plan-save":
            previous = current_plan(doc) if doc["plans"] else None
            if previous:
                if checked_id(raw["id"]) != doc["id"] or revision_number(raw["expectedRevision"]) != previous["revision"]:
                    raise InputError("Refresh plan changed; reopen its original current definition")
                baseline = clone(previous["baseline"])
            else:
                baseline = native_selection(self.ws.portfolio(doc["portfolioId"], revision_number(raw["baselineRevision"])))
                if baseline["review"]["status"] != "reviewed":
                    raise InputError("Select an explicitly reviewed original portfolio as the first baseline")
            state = raw.get("state", previous["state"] if previous else "ACTIVE")
            if state not in {"ACTIVE", "PAUSED", "ARCHIVED"}:
                raise InputError("A saved plan is ACTIVE, PAUSED or ARCHIVED")
            plan = {"schema": PLAN, "id": doc["id"], "portfolioId": doc["portfolioId"],
                    "revision": previous["revision"] + 1 if previous else 1,
                    "previousRevision": previous["revision"] if previous else None,
                    "name": short_text(raw["name"], "Refresh plan name", 160),
                    "owner": short_text(raw["owner"], "Refresh plan owner", 160),
                    "note": short_text(raw.get("note", ""), "Refresh plan note", 16000, empty=True),
                    "state": state, "baseline": baseline,
                    "created": previous["created"] if previous else at, "updated": at,
                    "requestId": raw["requestId"]}
            return {"plan": plan}
        plan = current_plan(doc)
        if checked_id(raw["planId"]) != doc["id"]:
            raise InputError("Select this exact original refresh plan")
        if kind == "start":
            if any(rows[-1]["state"] in OPEN for rows in doc["runs"].values()):
                raise InputError("Review and promote or cancel the existing run before starting another")
            if not historical:
                busy = self.ws.db.execute(
                    "SELECT id FROM iati_refresh_journals WHERE portfolio=? AND id<>? AND active_run IS NOT NULL",
                    (doc["portfolioId"], doc["id"])).fetchone()
                if busy:
                    raise InputError("Another saved refresh plan owns an unfinished run on this original portfolio")
            preview_input = {key: raw[key] for key in
                ("planId", "expectedPlanRevision", "expectedPortfolioRevision", "sources", "pairs",
                 "selection", "selectionNote", "sourceChangeNote") if key in raw}
            preview = self._preview(doc, preview_input, historical=historical)
            if checked_id(raw["previewSha256"]) != preview["sha256"]:
                raise InputError("Review the complete preview for these exact publisher bodies and selection")
            before = self._baseline(plan["baseline"])
            run_id = digest(json_bytes({"schema": RUN, "plan": doc["id"], "requestId": raw["requestId"]}))
            native = {"requestId": self._native_id(doc["id"], raw["requestId"], "candidate"),
                      "id": doc["portfolioId"], "expectedRevision": preview["expectedPortfolioRevision"],
                      "name": before["name"], "notes": before["notes"], "sources": preview["sources"],
                      "selection": preview["selection"], "review": {"status": "draft", "reviewer": "", "note": ""}}
            return {"runId": run_id, "planRevision": plan["revision"], "baseline": clone(plan["baseline"]),
                    "preview": preview, "label": short_text(raw["label"], "Run label", 160),
                    "actor": short_text(raw["actor"], "Run actor", 160),
                    "note": short_text(raw.get("note", ""), "Run note", 16000, empty=True),
                    "nativeRequest": native}
        if kind == "abandon":
            pending = pending_action(doc)
            return {"pendingRequestId": pending["requestId"],
                    "pendingInputSha256": pending["inputSha256"],
                    "runId": pending["prepared"].get("runId"),
                    "actor": short_text(raw["actor"], "Cancellation actor", 160),
                    "note": short_text(raw["note"], "Cancellation note", 4000)}
        run = latest_run(doc, raw["runId"])
        if revision_number(raw["expectedRevision"]) != run["revision"]:
            raise InputError("Refresh run changed; reopen its current saved revision")
        if run["state"] not in OPEN:
            raise InputError("This run is already closed; its complete history remains available")
        if run["baseline"] != plan["baseline"]:
            raise InputError("The selected run no longer belongs to this plan's original baseline")
        common = {"runId": run["id"], "runRevision": run["revision"],
                  "beforeRunSha256": digest(json_bytes(run))}
        if kind == "review":
            current = self.ws.portfolio(doc["portfolioId"], run["candidate"]["revision"])
            if native_selection(current) != run["candidate"]:
                raise InputError("The original candidate differs from the saved run")
            head = revision_number(raw["expectedPortfolioRevision"])
            if head != current["revision"] or (not historical and self.ws.portfolio(doc["portfolioId"])["revision"] != head):
                raise InputError("Portfolio advanced outside this run; reopen and choose its disposition explicitly")
            native = {key: clone(current[key]) for key in ("name", "notes", "sources", "selection")}
            native.update({"id": doc["portfolioId"], "expectedRevision": head,
                           "requestId": self._native_id(doc["id"], raw["requestId"], "review"),
                           "review": clone(raw["review"])})
            _, _, _, canonical, _ = self.ws._definition(native)
            if canonical["review"]["status"] not in {"reviewed", "needs-correction"}:
                raise InputError("Record a named reviewed or needs-correction decision for this exact candidate")
            native["review"] = canonical["review"]
            return {**common, "baseline": clone(run["baseline"]), "pairs": clone(run["preview"]["pairs"]),
                    "nativeRequest": native}
        actor = short_text(raw["actor"], "Decision actor", 160)
        note = short_text(raw["note"], "Decision note", 4000)
        if kind == "promote":
            if revision_number(raw["expectedPlanRevision"]) != plan["revision"]:
                raise InputError("The plan changed before baseline promotion")
            if run["state"] != "REVIEWED" or run["candidate"]["review"]["status"] != "reviewed":
                raise InputError("Only the explicitly reviewed candidate can become the new baseline")
            self._baseline(run["candidate"])
            return {**common, "planRevision": plan["revision"], "actor": actor, "note": note}
        return {**common, "actor": actor, "note": note}

    def _native_result(self, doc, action, *, execute, include_comparison=True):
        prepared = action["prepared"]
        raw = prepared["nativeRequest"]
        request = self.ws.db.execute("SELECT * FROM iati_requests WHERE id=?", (raw["requestId"],)).fetchone()
        if request is None:
            raise InputError("The completed native refresh request has no original portfolio operation")
        portfolio = self.ws.portfolio(request["portfolio"], request["revision"])
        if (request is None or request["request_sha"] != digest(json_bytes(raw))
                or request["portfolio"] != doc["portfolioId"]
                or request["revision"] != raw["expectedRevision"] + 1
                or portfolio["revision"] != request["revision"]):
            raise InputError("The original portfolio result is not bound to the complete saved refresh request")
        _, _, _, definition, _ = self.ws._definition(raw)
        if ({key: portfolio[key] for key in ("name", "notes", "sources", "selection", "review")} != definition
                or portfolio["definitionSha256"] != digest(json_bytes(definition))):
            raise InputError("The native candidate does not reconstruct from its exact saved refresh input")
        result = {"portfolio": native_selection(portfolio)}
        previous = action.get("native")
        if previous is not None:
            fields(previous, {"portfolio"}, {"comparison"})
            if previous["portfolio"] != result["portfolio"]:
                raise InputError("The original recorded native candidate changed")
        if not include_comparison:
            return result
        before = self._baseline(prepared["baseline"])
        pairs = prepared["preview"]["pairs"] if action["kind"] == "start" else prepared["pairs"]
        if execute:
            comparison = self.ws.compare_portfolio({"id": doc["portfolioId"],
                "beforeRevision": before["revision"], "afterRevision": portfolio["revision"], "pairs": pairs})
        else:
            comparison = self.ws._compare_revisions(before, portfolio, pairs)
            retained = self.ws.db.execute("SELECT body FROM iati_portfolio_comparisons WHERE id=?",
                                         (comparison["id"],)).fetchone()
            if retained is None or load_json(retained["body"]) != comparison:
                raise InputError("The complete original refresh comparison is absent from the received portfolio")
        if previous and "comparison" in previous and previous["comparison"] != comparison:
            raise InputError("The retained native comparison changed")
        return {**result, "comparison": comparison}

    def _finish(self, doc, action, at):
        moment(at)
        kind, raw, prepared = action["kind"], action["input"], action["prepared"]
        run = None
        if kind == "plan-save":
            doc["plans"].append(clone(prepared["plan"]))
        elif kind == "start":
            native = action["native"]
            portfolio = self._baseline(native["portfolio"])
            run = {"schema": RUN, "id": prepared["runId"], "planId": doc["id"],
                   "portfolioId": doc["portfolioId"], "revision": 1, "previousRevision": None,
                   "planRevision": prepared["planRevision"], "label": prepared["label"],
                   "actor": prepared["actor"], "note": prepared["note"], "state": "AWAITING_REVIEW",
                   "baseline": clone(prepared["baseline"]), "preview": clone(prepared["preview"]),
                   "candidate": clone(native["portfolio"]), "comparison": clone(native["comparison"]),
                   "afterCounts": clone(portfolio["report"]["counts"]), "review": clone(portfolio["review"]),
                   "created": action["created"], "updated": at, "requestId": raw["requestId"],
                   "promotion": None, "cancellation": None}
            if run["id"] in doc["runs"]:
                raise InputError("The original refresh run ID is already present")
            doc["runs"][run["id"]] = [run]
        elif kind in {"review", "promote", "cancel"}:
            previous = latest_run(doc, prepared["runId"])
            if previous["revision"] != prepared["runRevision"] or digest(json_bytes(previous)) != prepared["beforeRunSha256"]:
                raise InputError("The retained run changed before its saved action completed")
            run = {**clone(previous), "revision": previous["revision"] + 1,
                   "previousRevision": previous["revision"], "updated": at, "requestId": raw["requestId"]}
            if kind == "review":
                native = action["native"]
                portfolio = self._baseline(native["portfolio"])
                run.update({"candidate": clone(native["portfolio"]), "comparison": clone(native["comparison"]),
                            "review": clone(portfolio["review"]), "afterCounts": clone(portfolio["report"]["counts"]),
                            "state": "REVIEWED" if portfolio["review"]["status"] == "reviewed" else "NEEDS_CORRECTION"})
            elif kind == "promote":
                previous_plan = current_plan(doc)
                plan = {**previous_plan, "revision": previous_plan["revision"] + 1,
                        "previousRevision": previous_plan["revision"], "baseline": clone(run["candidate"]),
                        "updated": at, "requestId": raw["requestId"]}
                doc["plans"].append(plan)
                run.update({"state": "PROMOTED", "promotion": {
                    "requestId": raw["requestId"], "actor": prepared["actor"], "note": prepared["note"],
                    "planRevision": plan["revision"], "baselineBefore": clone(previous_plan["baseline"]),
                    "baselineAfter": clone(plan["baseline"]), "created": at}})
            else:
                run.update({"state": "CANCELLED", "cancellation": {
                    "requestId": raw["requestId"], "actor": prepared["actor"], "note": prepared["note"], "created": at}})
            doc["runs"][run["id"]].append(run)
        else:
            pending = next((x for x in doc["actions"] if x["requestId"] == prepared["pendingRequestId"]), None)
            if (pending is None or pending["state"] != "PREPARED" or pending.get("native") is not None
                    or pending["inputSha256"] != prepared["pendingInputSha256"]):
                raise InputError("The exact unexecuted request is no longer available for abandonment")
            cancellation = {"requestId": raw["requestId"], "actor": prepared["actor"],
                            "note": prepared["note"], "created": at}
            pending.update({"state": "ABANDONED", "cancellation": cancellation})
            if pending["kind"] == "start":
                p = pending["prepared"]
                run = {"schema": RUN, "id": p["runId"], "planId": doc["id"], "portfolioId": doc["portfolioId"],
                       "revision": 1, "previousRevision": None, "planRevision": p["planRevision"],
                       "label": p["label"], "actor": p["actor"], "note": p["note"], "state": "CANCELLED",
                       "baseline": clone(p["baseline"]), "preview": clone(p["preview"]),
                       "candidate": None, "comparison": None, "afterCounts": None, "review": None,
                       "created": pending["created"], "updated": at, "requestId": raw["requestId"],
                       "promotion": None, "cancellation": cancellation}
                doc["runs"][run["id"]] = [run]
            elif prepared["runId"]:
                run = latest_run(doc, prepared["runId"])
        action.update({"state": "COMPLETE", "completedAt": at,
                       "result": {"requestId": raw["requestId"], "action": kind, "state": "COMPLETE",
                                  "plan": current_plan(doc), "run": clone(run)}})
        return clone(action["result"])

    def _advance(self, doc, action):
        if action["state"] == "COMPLETE":
            return clone(action["result"])
        if action["state"] == "ABANDONED":
            return {"requestId": action["requestId"], "action": action["kind"],
                    "state": "ABANDONED", "cancellation": clone(action["cancellation"])}
        if action["kind"] not in {"start", "review"} or action["state"] != "PREPARED":
            raise InputError("This saved refresh operation cannot resume a native step")
        # The original portfolio method owns its own request replay and CAS.
        # A lost response can therefore recover the exact earlier revision even
        # when an operator has subsequently changed the native portfolio.
        original = self.ws.save_portfolio(action["prepared"]["nativeRequest"])
        pointer = {"portfolio": native_selection(original)}
        if action["native"] is None:
            action["native"] = pointer
            self._store(doc)
        elif action["native"]["portfolio"] != pointer["portfolio"]:
            raise InputError("The recorded original native save returned another revision")
        action["native"] = self._native_result(doc, action, execute=True)
        self._store(doc)
        result = self._finish(doc, action, time.time())
        self._store(doc)
        return result

    def save(self, kind, raw):
        raw = self._input(kind, raw)
        with self.ws.mutex:
            found = self.request(raw["requestId"])
            sha = action_digest(kind, raw)
            if found["state"] != "NOT_RECORDED":
                if found["kind"] != kind or found["inputSha256"] != sha or found["input"] != raw:
                    raise InputError("requestId is already bound to a different complete refresh action")
                doc = self._document(found["result"]["plan"]["id"] if found["state"] == "COMPLETE"
                                     else self.ws.db.execute("SELECT plan FROM iati_refresh_requests WHERE id=?",
                                                             (raw["requestId"],)).fetchone()["plan"])
                action = doc["actions"][found["ordinal"] - 1]
                return self._advance(doc, action)
            if kind == "plan-save" and "id" not in raw:
                doc = self._new_document(raw, self.context()["workspaceSha256"])
                if self.ws.db.execute("SELECT id FROM iati_refresh_journals WHERE id=?", (doc["id"],)).fetchone():
                    raise InputError("The original new-plan identity already exists without its request lookup")
            else:
                doc = self._document(raw["id"] if kind == "plan-save" else raw["planId"])
            now = time.time()
            prepared = self._prepare(doc, kind, raw, now)
            action = {"schema": ACTION, "ordinal": len(doc["actions"]) + 1,
                      "requestId": raw["requestId"], "kind": kind, "input": raw,
                      "inputSha256": sha, "created": now, "prepared": prepared,
                      "native": None, "state": "PREPARED"}
            doc["actions"].append(action)
            if kind in {"start", "review"}:
                self._store(doc)
                return self._advance(doc, action)
            result = self._finish(doc, action, now)
            self._store(doc)
            return result

    def resume(self, ident):
        with self.ws.mutex:
            found = self.request(ident)
            if found["state"] == "NOT_RECORDED":
                raise InputError("The original refresh request has not been recorded")
            return self.save(found["kind"], found["input"])

    def _reconstruct(self, received):
        fields(received, {"schema", "id", "portfolioId", "originWorkspace", "plans", "runs", "actions"})
        if (received["schema"] != JOURNAL or not isinstance(received["plans"], list)
                or not isinstance(received["runs"], dict) or not isinstance(received["actions"], list)
                or not received["actions"] or len(json_bytes(received)) > MAX_METADATA):
            raise InputError("The packet must contain the complete original refresh journal")
        first = received["actions"][0]
        if not isinstance(first, dict) or first.get("kind") != "plan-save" or "id" in first.get("input", {}):
            raise InputError("The original plan creation must be the first retained action")
        raw = self._input("plan-save", first["input"])
        doc = self._new_document(raw, received["originWorkspace"])
        if doc["id"] != received["id"] or doc["portfolioId"] != received["portfolioId"]:
            raise InputError("The refresh plan identity does not derive from its original workspace and creation request")
        seen = set()
        for ordinal, saved in enumerate(received["actions"], 1):
            if not isinstance(saved, dict):
                raise InputError("Every original refresh action must be retained as an object")
            raw = self._input(saved.get("kind"), saved.get("input"))
            if (saved.get("schema") != ACTION or saved.get("ordinal") != ordinal
                    or saved.get("requestId") != raw["requestId"] or raw["requestId"] in seen
                    or saved.get("inputSha256") != action_digest(saved["kind"], raw)):
                raise InputError("The complete refresh request sequence is not canonical")
            seen.add(raw["requestId"])
            at = moment(saved.get("created"))
            prepared = self._prepare(doc, saved["kind"], raw, at, historical=True)
            action = {"schema": ACTION, "ordinal": ordinal, "requestId": raw["requestId"], "kind": saved["kind"],
                      "input": raw, "inputSha256": saved["inputSha256"], "created": at,
                      "prepared": prepared, "native": None, "state": "PREPARED"}
            if prepared != saved.get("prepared"):
                raise InputError("The retained complete refresh selection cannot be derived from its original request")
            doc["actions"].append(action)
            state = saved.get("state")
            if state == "COMPLETE":
                if saved["kind"] in {"start", "review"}:
                    action["native"] = clone(saved.get("native"))
                    action["native"] = self._native_result(doc, action, execute=False)
                self._finish(doc, action, moment(saved.get("completedAt")))
            elif state in {"PREPARED", "ABANDONED"} and saved["kind"] in {"start", "review"}:
                native = saved.get("native")
                if native is not None:
                    fields(native, {"portfolio"}, {"comparison"})
                    action["native"] = clone(native)
                    complete_native = self._native_result(doc, action, execute=False, include_comparison="comparison" in native)
                    if complete_native != native:
                        raise InputError("The retained partial native result differs from its original operation")
                # An ABANDONED action remains prepared until its later explicit
                # abandonment is replayed. No missing native request is executed.
            else:
                raise InputError("The complete refresh action has an unsupported saved state")
        if doc != received:
            raise InputError("Complete refresh plan, run, review and baseline history does not reconstruct exactly")
        return doc

    def status(self, ident):
        with self.ws.mutex:
            doc = self._document(ident)
            pending = pending_action(doc)
            return {"plan": current_plan(doc), "portfolio": native_selection(self.ws.portfolio(doc["portfolioId"])),
                    "snapshot": digest(json_bytes(doc)), "pendingRequest": clone(pending),
                    "runCount": len(doc["runs"]), "actionCount": len(doc["actions"])}

    def export(self, ident, output, expected_snapshot=None):
        from refresh_packet import export_refresh
        return export_refresh(self, ident, output, expected_snapshot)

    def receive(self, path):
        from refresh_packet import receive_refresh
        return receive_refresh(self, path)
