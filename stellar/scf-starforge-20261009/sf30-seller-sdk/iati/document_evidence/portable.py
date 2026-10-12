"""MIT. Full document evidence through the original IATI packet writer/reader."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime
import os
from pathlib import Path
import re

from iati_source import InputError
from workspace import json_bytes, load_json, digest, checked_id, private_write, regular, file_digest
from publishing import REQUEST
from .workspace import (
    DocumentEvidence, SCHEMA, OBSERVATION, COMPARISON, MAX_METADATA, MAX_BODY,
    MAX_PLAN_BYTES, ACTION_FIELDS, sealed, verify_seal, number, text, selection_key,
    document_complete,
)

PACKET = "stellar-forge.iati-document-evidence-packet.v1"
MAX_PACKET = 4 * 1024 * 1024 * 1024


def source_files():
    """The same complete source declaration used by installed Applications."""
    from managed import SOURCE, SOURCE_FILES, source_digest
    result = {}
    for name in SOURCE_FILES:
        path = SOURCE / name
        if path.resolve(strict=True) != path or path.is_symlink():
            raise InputError("The installed document operator source is aliased")
        source_digest(path)
        result["runtime/source/" + name] = path
    return result


def member_capacity(name):
    if name in {"manifest.json", "selection.json", "history.json", "requests.json", "observations.json", "comparisons.json", "parents.json"}:
        return MAX_METADATA
    if re.fullmatch(r"assets/[0-9a-f]{64}\.bin", name):
        return MAX_BODY
    if re.fullmatch(r"parents/[0-9a-f]{64}\.zip", name):
        return MAX_PACKET
    if re.fullmatch(r"reports/[A-Za-z0-9._-]+", name):
        return MAX_METADATA
    if re.fullmatch(r"runtime/source/[A-Za-z0-9_./-]+", name) and not any(p in {"", ".", ".."} for p in name.split("/")):
        return 4 * 1024 * 1024
    return None


def output_path(value, workspace):
    if not isinstance(value, (str, Path)):
        raise InputError("Choose one complete evidence ZIP path")
    path = Path(value).expanduser().absolute()
    if path.parent.resolve(strict=True) != path.parent or path.is_symlink():
        raise InputError("Choose a physical existing export parent")
    if path == workspace.root or workspace.root in path.parents and workspace.root / "tmp" not in path.parents:
        raise InputError("Export outside live workspace custody or through its original private temporary export directory")
    return path


def _reuse_exported_parents(target, temporary, entries, parents, metadata):
    """Reuse original nested ZIP bytes only after full native member verification."""
    if not target.exists() and not target.is_symlink():
        return parents
    from iati_workspace import packet_read
    from organisation.portable import _read_packet as read_organisation_packet
    previous = temporary / "previous-complete-export"
    previous.mkdir(mode=0o700)
    before = file_digest(target, MAX_PACKET)
    manifest = packet_read(target, previous, PACKET, member_capacity=member_capacity)
    if file_digest(target, MAX_PACKET) != before:
        raise InputError("The original completed evidence export changed during replay")
    if (set(manifest) != {"schema", "files", *metadata}
            or any(manifest.get(key) != value for key, value in metadata.items())
            or set(manifest["files"]) != set(entries) | {"parents.json"}):
        raise InputError("Completed output belongs to a different evidence export; choose another output path")
    retained = load_json((previous / "parents.json").read_bytes())
    if not isinstance(retained, list) or len(retained) != len(parents):
        raise InputError("The original export has a different complete parent inventory")
    for index, (old, current) in enumerate(zip(retained, parents)):
        if (not isinstance(old, dict) or set(old) != {"id", "revision", "recordSha256", "file", "bytes", "sha256"}
                or any(old.get(key) != current[key] for key in ("id", "revision", "recordSha256", "file"))):
            raise InputError("The completed export selected a different original organisation edition")
        name = current["file"]
        if manifest["files"].get(name) != {"bytes": old["bytes"], "sha256": old["sha256"]}:
            raise InputError("The original parent descriptor differs from its verified complete ZIP")
        old_directory, new_directory = temporary / ("old-parent-" + str(index)), temporary / ("new-parent-" + str(index))
        old_directory.mkdir(mode=0o700); new_directory.mkdir(mode=0o700)
        old_manifest, _ = read_organisation_packet(previous / name, old_directory)
        new_manifest, _ = read_organisation_packet(entries[name], new_directory)
        # The native reader checks every original member, its complete length
        # and SHA. Equal full manifests bind history, reports and runtime source,
        # while ZIP container timestamps may differ on a new export.
        if old_manifest != new_manifest:
            raise InputError("The original organisation packet content changed; choose another output path")
        entries[name] = previous / name
    return retained


def export_plan(work, selected, destination):
    from iati_workspace import packet_write
    target = output_path(destination, work.ws)
    limits = {selected["id"]: selected["revision"]}
    comparisons = []
    for row in work.ws.db.execute("SELECT body FROM iati_document_evidence_comparisons ORDER BY id"):
        c = verify_seal(load_json(row["body"]), COMPARISON)
        if (c["after"]["id"] == selected["id"] and c["after"]["revision"] <= selected["revision"]
                and (c["before"]["id"] != selected["id"] or c["before"]["revision"] <= selected["revision"])):
            comparisons.append(c)
            for side in ("before", "after"):
                ident, revision = c[side]["id"], c[side]["revision"]
                limits[ident] = max(limits.get(ident, 0), revision)
    history = {ident: [p for p in work.history(ident) if p["revision"] <= limit] for ident, limit in sorted(limits.items())}
    if any(not rows or rows[-1]["revision"] != limits[key] for key, rows in history.items()):
        raise InputError("A comparison lacks its complete selected evidence history")
    observation_ids = {ident for rows in history.values() for p in rows for ident in p["observationIds"]}
    observations = [work.observation(ident) for ident in sorted(observation_ids)]
    comparison_ids = {c["id"] for c in comparisons}
    requests = []
    for row in work.ws.db.execute("SELECT * FROM iati_document_evidence_requests ORDER BY id"):
        request = dict(row)
        if request["state"] != "RECORDED":
            continue
        result = load_json(request["result"])
        if (result["kind"] == "comparison" and result["id"] in comparison_ids) or (
                result["kind"] in {"plan", "observation"} and result["planId"] in limits and result["revision"] <= limits[result["planId"]]):
            requests.append(request)
    parent_limits = {}
    for rows in history.values():
        for p in rows:
            parent = p["selection"]
            parent_limits[parent["id"]] = max(parent_limits.get(parent["id"], 0), parent["revision"])
    with work.ws.scratch() as temporary:
        entries = {}
        def put(name, raw):
            path = temporary / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            private_write(path, raw)
            entries[name] = path
        for name, value in (("selection.json", selection_key(selected)), ("history.json", history),
                            ("requests.json", requests), ("observations.json", observations), ("comparisons.json", comparisons)):
            put(name, json_bytes(value))
        parents = []
        for ident, revision in sorted(parent_limits.items()):
            path = temporary / "parents" / (ident + ".zip")
            path.parent.mkdir(mode=0o700, exist_ok=True)
            exported = work.ws.organisation.export({"id": ident, "revision": revision, "output": path})
            parent = work.ws.organisation.plan(ident, revision)
            name = "parents/" + ident + ".zip"
            entries[name] = path
            parents.append({**selection_key(parent), "file": name, "bytes": exported["bytes"], "sha256": exported["sha256"]})
        bodies = {}
        for observed in observations:
            body = observed.get("body")
            if body is not None:
                path = work._asset_path(body)
                bodies[body["sha256"]] = path
        for ident, path in sorted(bodies.items()):
            entries["assets/" + ident + ".bin"] = path
        for kind in ("report", "register", "plan", "correction"):
            if kind == "correction" and work._correction(selected, current=False)["request"] is None:
                continue
            descriptor = work.file({"id": selected["id"], "revision": selected["revision"], "kind": kind})
            entries["reports/" + descriptor["name"]] = Path(descriptor["path"])
        for name, path in source_files().items():
            # Source files may be ordinary 0644 installed code. The original
            # source verifier above checks their identity; the archive writer
            # receives a private exact copy, not a weakened workspace check.
            put(name, path.read_bytes())
        metadata = {"selection": selection_key(selected), "plans": limits,
            "runtimeSourceScope": "Complete current installed IATI Applications source; receiving verifies it and never executes imported code."}
        parents = _reuse_exported_parents(target, temporary, entries, parents, metadata)
        put("parents.json", json_bytes(parents))
        result = packet_write(target, entries, PACKET, metadata)
    return {**result, **selection_key(selected), "plans": len(history), "revisions": sum(map(len, history.values())),
        "observations": len(observations), "comparisons": len(comparisons), "files": len(entries) + 1, "media": "application/zip"}


def timestamp(value):
    if not isinstance(value, str):
        raise InputError("Evidence timestamps must retain their explicit UTC observation")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed
    except ValueError as error:
        raise InputError("The original evidence timestamp is invalid") from error


class _Verification(DocumentEvidence):
    """Reconstruct original pure transitions without making a network request."""
    def __init__(self, workspace, directory, history, observations):
        self.ws, self.directory, self.history_rows = workspace, directory, history
        self.observed = {o["id"]: o for o in observations}
        self.requests_directory = directory / "not-executed-acquisitions"
        self.expected_observation = None

    def plan(self, ident, revision=None):
        rows = self.history_rows.get(checked_id(ident))
        if not isinstance(rows, list) or not rows:
            raise InputError("An imported selection lacks its full evidence history")
        return rows[-1] if revision is None else rows[number(revision, maximum=len(rows)) - 1]

    def observation(self, ident):
        result = self.observed.get(checked_id(ident))
        if result is None:
            raise InputError("An imported revision lacks an original observation")
        return verify_seal(result, OBSERVATION)

    def _retain_file(self, path, ident, complete=False, encoding=None):
        body = self.expected_observation.get("body")
        if body is None:
            raise InputError("The original observation lacks its declared body")
        actual = self.directory / "assets" / (checked_id(body["sha256"]) + ".bin")
        size = number(body["bytes"], "body bytes", 0, MAX_BODY)
        if file_digest(actual, MAX_BODY) != body["sha256"] or actual.stat().st_size != size:
            raise InputError("The full retained response differs from its declared bytes")
        return {"sha256": body["sha256"], "bytes": size,
                "name": "document-" + ident[:16] + (".bin" if complete else ".prefix.bin"),
                "media": "application/octet-stream", "complete": complete,
                "representation": "http-message-body", "contentEncoding": encoding}

    def verify_observation(self, observed, raw, previous):
        verify_seal(observed, OBSERVATION)
        selected, published = self._observe_selection(raw, previous)
        expected_id = digest(json_bytes({"schema": OBSERVATION, "originWorkspace": previous["originWorkspace"], "requestId": raw["requestId"]}))
        if observed["id"] != expected_id or observed["rowIds"] != selected or observed["publishedUrl"] != published:
            raise InputError("The received observation changed its original selected URL or identity")
        if timestamp(observed["finishedAt"]) < timestamp(observed["startedAt"]):
            raise InputError("The observation ended before its original acquisition")
        if self._used_bytes(previous) + previous["limits"]["maxBytes"] > MAX_PLAN_BYTES:
            raise InputError("The received acquisition exceeded the original plan's reserved body budget")
        reservation = {"id": expected_id, "planId": previous["id"], "rowIds": selected,
            "publishedUrl": published, "limits": previous["limits"], "startedAt": observed["startedAt"]}
        self.expected_observation = observed
        if observed["state"] == "INTERRUPTED":
            if (observed.get("fetch") is not None or observed.get("outcome") != "INTERRUPTED"
                    or observed.get("documentComplete") is not False):
                raise InputError("An interrupted observation cannot become a completed HTTP receipt")
            interruption = observed.get("interruption")
            if not isinstance(interruption, dict) or set(interruption) != {"reconciledAt", "reason", "retainedBytes"} or interruption["reconciledAt"] != observed["finishedAt"]:
                raise InputError("Retain the exact interrupted acquisition reconciliation")
            text(interruption["reason"], "Interruption reason"); text(interruption["retainedBytes"], "Retained-prefix description")
            body = self._retain_file(None, expected_id, False, None) if observed.get("body") is not None else None
            derived = sealed({"schema": OBSERVATION, "id": expected_id, "requestId": raw["requestId"],
                "planId": previous["id"], "rowIds": selected, "publishedUrl": published,
                "actor": text(raw["actor"], "Named operator", 160), "startedAt": observed["startedAt"],
                "finishedAt": observed["finishedAt"], "state": "INTERRUPTED", "outcome": "INTERRUPTED",
                "fetch": None, "body": body, "documentComplete": False, "interruption": deepcopy(interruption)})
        else:
            receipt = deepcopy(observed.get("fetch"))
            if not isinstance(receipt, dict) or set(receipt) != {
                "schema", "requestedUrl", "finalUrl", "startedAt", "finishedAt", "elapsedSeconds",
                "state", "status", "hops", "body", "error", "limits"}:
                raise InputError("The original complete HTTP receipt fields differ")
            timestamp(receipt["startedAt"]); timestamp(receipt["finishedAt"])
            if timestamp(receipt["finishedAt"]) < timestamp(receipt["startedAt"]):
                raise InputError("The received HTTP timestamps are out of order")
            if not isinstance(receipt["hops"], list) or len(receipt["hops"]) > previous["limits"]["maxRedirects"] + 1:
                raise InputError("The received HTTP hops exceed the original selected bound")
            if receipt["body"] is not None:
                body = receipt["body"]
                receipt["body"] = {key: body[key] for key in ("bytes", "sha256", "complete", "representation", "contentEncoding")} | {
                    "path": str(self.requests_directory / expected_id / "body.bin")}
            derived = self._terminal_observation(reservation, raw, result=receipt)
        if derived != observed:
            raise InputError("The received observation differs from its exact original carrier and request")
        return derived

    def verify(self, requests, comparisons):
        request_by_id = {}
        for r in requests:
            if not isinstance(r, dict) or set(r) != {"id", "input_sha", "action", "input", "state", "result"}:
                raise InputError("The original evidence request fields are incomplete")
            if not isinstance(r["id"], str) or not REQUEST.fullmatch(r["id"]) or r["id"] in request_by_id:
                raise InputError("The packet repeats or changes an original evidence request ID")
            if r["state"] != "RECORDED" or r["action"] not in ACTION_FIELDS or not isinstance(r["input"], str) or not isinstance(r["result"], str):
                raise InputError("Only complete original requests can be received")
            raw = load_json(r["input"])
            if (not isinstance(raw, dict) or set(raw) - ACTION_FIELDS[r["action"]]
                    or raw.get("requestId") != r["id"] or json_bytes(raw).decode() != r["input"]
                    or digest(r["input"].encode()) != checked_id(r["input_sha"])):
                raise InputError("The received request differs from its whole canonical input")
            text(raw.get("actor"), "Named operator", 160)
            request_by_id[r["id"]] = r
        used, used_observations = set(), set()
        for ident, rows in self.history_rows.items():
            checked_id(ident)
            if not isinstance(rows, list) or not rows:
                raise InputError("The complete evidence history may not be empty")
            previous = None
            for revision, p in enumerate(rows, 1):
                verify_seal(p, SCHEMA)
                if p["id"] != ident or type(p["revision"]) is not int or p["revision"] != revision:
                    raise InputError("The received immutable evidence revision chain differs")
                event = p.get("event") or {}
                r = request_by_id.get(event.get("requestId"))
                if r is None or r["id"] in used or r["action"] != event.get("action"):
                    raise InputError("Each saved revision needs its one exact original request")
                raw, result = load_json(r["input"]), load_json(r["result"])
                action, at = r["action"], p["updatedAt"]
                timestamp(at); checked_id(p["originWorkspace"])
                if previous:
                    if raw.get("id") != ident or raw.get("expectedRevision") != previous["revision"]:
                        raise InputError("A received action changed its original preceding revision")
                    if timestamp(at) < timestamp(previous["updatedAt"]):
                        raise InputError("A received evidence revision predates its preceding revision")
                elif action != "save":
                    raise InputError("A full evidence history begins with its original save")
                if action == "save":
                    if previous is not None:
                        raise InputError("Select a new evidence plan explicitly rather than changing its frozen documents")
                    derived = self._new_plan(raw, at, p["originWorkspace"])
                elif action == "note":
                    derived = self._note_plan(raw, previous, at)
                elif action == "review":
                    derived = self._review_plan(raw, previous, at)
                elif action == "observe":
                    if result.get("kind") != "observation":
                        raise InputError("A received observation action lost its exact result")
                    observed = self.observation(result.get("id"))
                    if observed["id"] in used_observations or observed["finishedAt"] != at:
                        raise InputError("An original observation is repeated or has a different completion time")
                    self.verify_observation(observed, raw, previous)
                    derived = self._observation_plan(raw, previous, observed, at)
                    used_observations.add(observed["id"])
                else:
                    raise InputError("A comparison cannot become an evidence plan revision")
                expected = {"kind": "observation", "id": observed["id"], "planId": ident, "revision": revision} if action == "observe" else {
                    "kind": "plan", "planId": ident, "revision": revision}
                if result != expected or derived != p:
                    raise InputError("The complete received transition does not reconstruct from its original input")
                used.add(r["id"]); previous = p
        if used_observations != set(self.observed):
            raise InputError("The packet includes unselected or missing original observations")
        comparison_ids = set()
        for c in comparisons:
            verify_seal(c, COMPARISON)
            if c["id"] in comparison_ids:
                raise InputError("The packet repeats a comparison")
            comparison_ids.add(c["id"])
            matches = [r for r in requests if r["action"] == "compare" and load_json(r["result"]) == {"kind": "comparison", "id": c["id"]}]
            if len(matches) != 1 or matches[0]["id"] in used:
                raise InputError("Each comparison requires one original request")
            raw = load_json(matches[0]["input"])
            before, after = (self._comparison_selection(raw.get(key)) for key in ("before", "after"))
            if self._make_comparison(raw, before, after) != c:
                raise InputError("The complete comparison differs from its original observations and paired rows")
            used.add(matches[0]["id"])
        if used != set(request_by_id):
            raise InputError("A received request has no selected original result")


def _conflicts(work, history, observations, requests, comparisons):
    for ident, rows in history.items():
        for p in rows:
            old = work.ws.db.execute("SELECT body FROM iati_document_evidence_plans WHERE id=? AND revision=?", (ident, p["revision"])).fetchone()
            if old and old["body"] != json_bytes(p).decode():
                raise InputError("An immutable received evidence revision conflicts with existing work")
        if work._busy(ident):
            raise InputError("An original local acquisition is still settling for this evidence plan")
    for table, values in (("iati_document_evidence_observations", observations), ("iati_document_evidence_comparisons", comparisons)):
        for item in values:
            old = work.ws.db.execute("SELECT body FROM " + table + " WHERE id=?", (item["id"],)).fetchone()
            if old and old["body"] != json_bytes(item).decode():
                raise InputError("A received immutable evidence result conflicts with current work")
    for request in requests:
        old = work.ws.db.execute("SELECT * FROM iati_document_evidence_requests WHERE id=?", (request["id"],)).fetchone()
        if old and dict(old) != request:
            raise InputError("A received original request conflicts with current work")


def receive_plan(work, value):
    from iati_workspace import IatiWorkspace, packet_read
    filename = Path(value).expanduser().absolute()
    packet_sha, packet_bytes = file_digest(filename, MAX_PACKET), regular(filename, MAX_PACKET).st_size
    with work.ws.scratch() as temporary:
        extracted = temporary / "packet"
        extracted.mkdir(mode=0o700)
        manifest = packet_read(filename, extracted, PACKET, member_capacity=member_capacity)
        if set(manifest) != {"schema", "files", "selection", "plans", "runtimeSourceScope"}:
            raise InputError("Unknown complete document-evidence packet manifest")
        if file_digest(filename, MAX_PACKET) != packet_sha or filename.stat().st_size != packet_bytes:
            raise InputError("The original complete evidence packet changed while receiving")
        read = lambda name: load_json((extracted / name).read_bytes())
        selection, history, requests = read("selection.json"), read("history.json"), read("requests.json")
        observations, comparisons, parents = read("observations.json"), read("comparisons.json"), read("parents.json")
        if not isinstance(selection, dict) or set(selection) != {"id", "revision", "recordSha256"} or selection != manifest["selection"]:
            raise InputError("The selected complete evidence edition differs")
        if not isinstance(history, dict) or not history or any(not isinstance(rows, list) or not rows for rows in history.values()):
            raise InputError("Receive all selected immutable evidence histories")
        if any(not isinstance(value, list) for value in (requests, observations, comparisons, parents)):
            raise InputError("The complete evidence request, observation, comparison and parent histories are required")
        ident, revision = checked_id(selection["id"]), number(selection["revision"])
        if manifest["plans"] != {key: len(rows) for key, rows in history.items()} or ident not in history or revision > len(history[ident]):
            raise InputError("The manifest differs from the complete selected evidence history")
        selected = history[ident][revision - 1]
        if selection_key(selected) != selection:
            raise InputError("The received selection refers to another immutable result")
        observed_ids = [o.get("id") for o in observations if isinstance(o, dict)]
        if len(observed_ids) != len(observations) or len(set(observed_ids)) != len(observed_ids):
            raise InputError("The full observation inventory repeats or omits a record")
        for observed in observations:
            verify_seal(observed, OBSERVATION)
        body_ids = {checked_id(o["body"]["sha256"]) for o in observations if o.get("body") is not None}
        parent_limits = {}
        for rows in history.values():
            for p in rows:
                value = p["selection"]
                key = checked_id(value["id"])
                parent_limits[key] = max(parent_limits.get(key, 0), number(value["revision"]))
        parent_map = {}
        for p in parents:
            if not isinstance(p, dict) or set(p) != {"id", "revision", "recordSha256", "file", "bytes", "sha256"}:
                raise InputError("The original organisation packet descriptor differs")
            checked_id(p["id"]); checked_id(p["recordSha256"]); checked_id(p["sha256"])
            if p["id"] in parent_map or p["file"] != "parents/" + p["id"] + ".zip" or parent_limits.get(p["id"]) != p["revision"]:
                raise InputError("The original parent edition is absent, repeated or changed")
            path = extracted / p["file"]
            if file_digest(path, MAX_PACKET) != p["sha256"] or path.stat().st_size != p["bytes"]:
                raise InputError("The complete original organisation packet differs")
            parent_map[p["id"]] = p
        if set(parent_map) != set(parent_limits):
            raise InputError("The packet omits an original selected organisation")
        sources = source_files()
        expected = {"selection.json", "history.json", "requests.json", "observations.json", "comparisons.json", "parents.json"} | set(sources)
        expected |= {"assets/" + key + ".bin" for key in body_ids}
        expected |= {p["file"] for p in parents}
        report_names = {"reports/document-evidence-report.html", "reports/document-evidence-register.csv", "reports/document-evidence-plan.json"}
        from .reports import report_html, register_csv
        # All nested organisation packets are validated in a private staging
        # workspace using only installed code. No publisher HTTP request occurs.
        with IatiWorkspace(temporary / "verify", create=True) as staged:
            for p in parents:
                received = staged.organisation.receive({"path": extracted / p["file"]})
                if selection_key(received["plan"]) != {key: p[key] for key in ("id", "revision", "recordSha256")}:
                    raise InputError("The nested organisation selection differs")
            verifier = _Verification(staged, extracted, history, observations)
            verifier.verify(requests, comparisons)
            selected_rows = verifier._rows(selected)
            selected_observations = [verifier.observation(key) for key in selected["observationIds"]]
            reports = {
                "reports/document-evidence-report.html": report_html(selected, selected_rows, selected_observations),
                "reports/document-evidence-register.csv": register_csv(selected, selected_rows),
                "reports/document-evidence-plan.json": json_bytes(selected),
            }
            correction = verifier._correction(selected, current=False)
            if correction["request"] is not None:
                reports["reports/organisation-url-correction-request.json"] = json_bytes(correction["request"])
            expected |= set(reports)
            if set(manifest["files"]) != expected:
                raise InputError("The packet adds or omits bytes outside its complete selected source/history closure")
            for name, raw in reports.items():
                if (extracted / name).read_bytes() != raw:
                    raise InputError("An exported report does not reproduce the exact original retained evidence")
        for name, installed in sources.items():
            if (extracted / name).read_bytes() != installed.read_bytes():
                raise InputError("Use the matching complete installed operator edition accompanying this evidence packet")
        _conflicts(work, history, observations, requests, comparisons)
        # Native parent receiving retains its own complete request/revision
        # verification and CAS. A lost response may leave verified parents;
        # replay joins those exact bytes before completing the evidence rows.
        for p in parents:
            work.ws.organisation.receive({"path": extracted / p["file"]})
        for observed in observations:
            body = observed.get("body")
            if body is None:
                continue
            actual = work._retain_file(extracted / "assets" / (body["sha256"] + ".bin"), observed["id"],
                                       body["complete"], body["contentEncoding"])
            if actual != body:
                raise InputError("The received body descriptor changed during original retention")
        _conflicts(work, history, observations, requests, comparisons)
        with work.ws.db:
            for observed in observations:
                work.ws.db.execute("INSERT OR IGNORE INTO iati_document_evidence_observations VALUES(?,?)", (observed["id"], json_bytes(observed).decode()))
            for key, rows in history.items():
                for p in rows:
                    work.ws.db.execute("INSERT OR IGNORE INTO iati_document_evidence_plans VALUES(?,?,?)", (key, p["revision"], json_bytes(p).decode()))
            for r in requests:
                work.ws.db.execute("INSERT OR IGNORE INTO iati_document_evidence_requests VALUES(?,?,?,?,?,?)",
                    tuple(r[key] for key in ("id", "input_sha", "action", "input", "state", "result")))
            for c in comparisons:
                work.ws.db.execute("INSERT OR IGNORE INTO iati_document_evidence_comparisons VALUES(?,?)", (c["id"], json_bytes(c).decode()))
        return {"schema": "stellar-forge.iati-document-evidence-receiving.v1", "state": "COMPLETE",
            "plan": work.plan(ident, revision), "currentPlan": work.plan(ident), "plans": len(history),
            "revisions": sum(map(len, history.values())), "observations": len(observations),
            "comparisons": len(comparisons), "packet": {"bytes": packet_bytes, "sha256": packet_sha},
            "semantics": "The exact original evidence, complete selected sources and request history are received; later recipient notes and reviews remain current. No document was fetched."}
