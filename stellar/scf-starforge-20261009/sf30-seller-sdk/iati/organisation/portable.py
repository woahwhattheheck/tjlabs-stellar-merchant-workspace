"""MIT. Complete organisation packets through the original IATI archive writer and workspace."""
from __future__ import annotations
from copy import deepcopy
from datetime import datetime
import hashlib
import os
from pathlib import Path
import re
import stat
import zipfile
from iati_source import InputError
from workspace import json_bytes, load_json, digest, checked_id, private_write, regular, file_digest, sync_dir
from publishing_xml import MAX_EDIT_SOURCE
from .workspace import OrganisationPlanner, SCHEMA, MAX_METADATA, SAVE_FIELDS, revision
from publishing import REQUEST
from .validation import definition, validate_source

PACKET = "stellar-forge.iati-organisation-packet.v1"
MAX_PACKET = 4 * 1024 * 1024 * 1024
MAX_FILES = 16384
HERE = Path(__file__).resolve().parent

def source_files():
    """Complete additive source plus the original Python IATI/XML host dependency."""
    result = {}
    for path in sorted(HERE.rglob("*")):
        relative = path.relative_to(HERE)
        if any(part.startswith(".") or part == "__pycache__" for part in relative.parts) or path.suffix in {".pyc", ".pyo"}:
            continue
        if path.is_symlink():
            raise InputError("Installed organisation source may not contain aliases")
        if path.is_file():
            result["runtime/organisation/" + relative.as_posix()] = path
    # These are the actual original Python modules used at import/open, retained
    # as source. Receiving never executes code from an untrusted ZIP.
    for parent, label in ((HERE.parent, "iati"), (HERE.parent.parent / "xml", "xml")):
        for path in sorted(parent.rglob("*.py")):
            relative = path.relative_to(parent)
            if any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
                continue
            if label == "iati" and relative.parts[0] == "organisation":
                continue  # Already retained once above with all exact support assets.
            if path.is_symlink() or path.resolve() != parent.resolve() / relative:
                raise InputError("Installed original Python source may not be aliased")
            result["runtime/" + label + "/" + relative.as_posix()] = path
    return result

def asset_descriptors(plan):
    return [plan["sourceAnalysis"], plan["analysis"], *plan["files"].values()]

def output_path(value):
    if not isinstance(value, (str, Path)):
        raise InputError("Choose the exact complete output ZIP path")
    path = Path(value).expanduser().absolute()
    if path.parent.resolve(strict=True) != path.parent or path.is_symlink():
        raise InputError("Use a real existing output parent and an unaliased ZIP path")
    return path

def export_plan(planner, selected, value):
    from iati_workspace import packet_write
    output = output_path(value)
    if output == planner.ws.root or planner.ws.root in output.parents and any(
        protected in output.parents for protected in (planner.ws.root / "sources", planner.assets)):
        raise InputError("Export to a separate packet path, preserving original source and asset custody")
    with planner.ws.scratch() as temp:
        limit_by_plan = {selected["id"]: selected["revision"]}
        comparisons = []
        for row in planner.ws.db.execute("SELECT body FROM iati_organisation_comparisons ORDER BY id"):
            body = load_json(row["body"])
            if (body["after"]["id"] == selected["id"] and body["after"]["revision"] <= selected["revision"] and
                (body["before"]["id"] != selected["id"] or body["before"]["revision"] <= selected["revision"])):
                comparisons.append(body)
                for side in ("before", "after"):
                    ident, limit = body[side]["id"], body[side]["revision"]
                    limit_by_plan[ident] = max(limit_by_plan.get(ident, 0), limit)
        history = {ident: [p for p in planner.history(ident) if p["revision"] <= limit]
                   for ident, limit in sorted(limit_by_plan.items())}
        if any(not rows or rows[-1]["revision"] != limit_by_plan[ident] for ident, rows in history.items()):
            raise InputError("An original comparison references absent plan history")
        comparison_ids = {c["id"] for c in comparisons}
        requests = []
        for row in planner.ws.db.execute("SELECT * FROM iati_organisation_requests ORDER BY plan,revision,id"):
            item = dict(row)
            result = load_json(item["result"])
            if (result["kind"] == "comparison" and result["id"] in comparison_ids) or (
                result["kind"] != "comparison" and item["plan"] in limit_by_plan and item["revision"] <= limit_by_plan[item["plan"]]):
                requests.append(item)
        entries = {}
        def put(name, raw):
            path = temp / name
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            private_write(path, raw)
            entries[name] = path
        selection = {"id": selected["id"], "revision": selected["revision"], "recordSha256": selected["recordSha256"],
                     "candidateSha256": selected["candidateSha256"], "state": selected["state"]}
        put("selection.json", json_bytes(selection))
        put("history.json", json_bytes(history))
        put("requests.json", json_bytes(requests))
        put("comparisons.json", json_bytes(comparisons))
        put("definition.json", json_bytes(definition()))
        sources, assets = set(), {}
        for rows in history.values():
            for p in rows:
                sources.update((p["sourceId"], p["candidateSha256"]))
                for descriptor in asset_descriptors(p):
                    assets[descriptor["sha256"]] = descriptor
        for c in comparisons:
            for descriptor in c["files"].values():
                assets[descriptor["sha256"]] = descriptor
        for sid in sorted(sources):
            raw = planner._source(sid)
            put("sources/" + sid + ".xml", raw)
        for aid, descriptor in sorted(assets.items()):
            put("assets/" + aid + ".bin", planner._asset_bytes(descriptor))
        for name, path in source_files().items():
            put(name, path.read_bytes())
        result = packet_write(output, entries, PACKET, {"selection": selection, "plans": limit_by_plan,
            "runtimeSourceScope": "Organisation module and exact original Python IATI/XML dependency; use the complete installed IATI component for browser/CLI/MCP entrypoints."})
        return {**result, "id": selected["id"], "revision": selected["revision"], "state": selected["state"],
                "candidateSha256": selected["candidateSha256"], "recordSha256": selected["recordSha256"],
                "plans": len(history), "revisions": sum(map(len, history.values())), "sources": len(sources),
                "comparisons": len(comparisons), "files": len(entries) + 1, "media": "application/zip"}

def _read_packet(path, temp):
    regular(path, MAX_PACKET)
    packet_identity = file_digest(path, MAX_PACKET)
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [x.filename for x in infos]
        if not infos or len(infos) > MAX_FILES + 1 or len(names) != len(set(names)) or "manifest.json" not in names:
            raise InputError("Organisation packet has duplicate, missing or excessive members")
        total = 0
        for entry in infos:
            name = entry.filename
            if entry.is_dir() or entry.flag_bits & 1 or stat.S_ISLNK(entry.external_attr >> 16) or entry.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
                raise InputError("Organisation packet member type or compression is unsupported")
            if not re.fullmatch(r"(?:manifest|selection|history|requests|comparisons|definition)\.json|sources/[0-9a-f]{64}\.xml|assets/[0-9a-f]{64}\.bin|runtime/(?:organisation|iati|xml)/[A-Za-z0-9_./-]+", name):
                raise InputError("Organisation packet contains an unsupported member path")
            if any(part in {"", ".", ".."} for part in name.split("/")):
                raise InputError("Organisation packet member escapes its original custody")
            cap = MAX_EDIT_SOURCE if name.startswith("sources/") else MAX_METADATA
            if entry.file_size > cap:
                raise InputError("A complete packet member exceeds its declared capacity")
            total += entry.file_size
            if total > MAX_PACKET:
                raise InputError("The expanded organisation packet exceeds 4 GiB")
        manifest = load_json(archive.read("manifest.json"))
        if not isinstance(manifest, dict) or set(manifest) != {"schema", "files", "selection", "plans", "runtimeSourceScope"} or manifest["schema"] != PACKET:
            raise InputError("Unknown organisation packet manifest")
        if not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(names) - {"manifest.json"}:
            raise InputError("The organisation manifest must declare every complete member")
        for entry in infos:
            if entry.filename == "manifest.json":
                continue
            target = temp / entry.filename
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            h, count = hashlib.sha256(), 0
            with archive.open(entry) as inp, os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as out:
                while block := inp.read(65536):
                    count += len(block)
                    if count > entry.file_size:
                        raise InputError("A packet member exceeded its declared expanded length")
                    h.update(block); out.write(block)
                out.flush(); os.fsync(out.fileno())
            if manifest["files"][entry.filename] != {"bytes": count, "sha256": h.hexdigest()}:
                raise InputError("A packet member differs from its exact original bytes")
    if file_digest(path, MAX_PACKET) != packet_identity:
        raise InputError("The original packet changed while receiving")
    return manifest, packet_identity

class _TransitionVerification(OrganisationPlanner):
    """Read-only reconstruction through the same original live transition functions."""
    def __init__(self, directory, history, requests):
        self.directory, self.history_rows, self.request_rows = directory, history, requests
        self.expected = None
        self.validation_cache = {}

    def _source(self, sid):
        path = self.directory / "sources" / (checked_id(sid) + ".xml")
        if file_digest(path, MAX_EDIT_SOURCE) != sid:
            raise InputError("A received action lacks its exact full source XML")
        return path.read_bytes()

    def _remember_source(self, raw, label):
        sid = digest(raw)
        if self._source(sid) != raw:
            raise InputError("A correction does not reproduce the retained complete candidate")
        return sid

    def _retain(self, raw, name, media):
        if not isinstance(raw, bytes) or len(raw) > MAX_METADATA:
            raise InputError("A received complete report exceeds its original capacity")
        aid = digest(raw)
        path = self.directory / "assets" / (aid + ".bin")
        if not path.is_file() or path.read_bytes() != raw:
            raise InputError("A received action does not reproduce its exact full report or analysis")
        return {"sha256": aid, "bytes": len(raw), "name": name, "media": media}

    def _asset_bytes(self, descriptor):
        path = self.directory / "assets" / (checked_id(descriptor["sha256"]) + ".bin")
        raw = path.read_bytes()
        if len(raw) != descriptor["bytes"] or digest(raw) != descriptor["sha256"]:
            raise InputError("A received analysis or report descriptor differs")
        return raw

    def _definition(self):
        current = definition()
        if self.expected is not None and current != self.expected["definition"]:
            raise InputError("Use the retained matching schema/methodology source edition to receive this history")
        return current

    def _validate(self, raw):
        sid = digest(raw)
        if sid not in self.validation_cache:
            self.validation_cache[sid] = validate_source(raw)
        actual = self.validation_cache[sid]
        selected = self.expected["release"]["validation"] if self.expected["lastAction"]["kind"] == "release" else self.expected["validation"]
        if selected.get("state") == "UNAVAILABLE":
            for key in ("schema", "sourceSha256", "sourceBytes", "standardVersion", "schemaManifestSha256", "schemaSource", "entry"):
                if selected.get(key) != actual.get(key):
                    raise InputError("A retained unavailable-runtime observation has a different source binding")
            if selected.get("stage") != "SCHEMA_RUNTIME" or selected.get("errors") != []:
                raise InputError("Invalid retained schema-runtime observation")
        else:
            stable = lambda v: {k: item for k, item in v.items() if k != "engine"}
            if json_bytes(stable(actual)) != json_bytes(stable(selected)):
                raise InputError("The full received XSD result does not reconstruct from its original source")
        return deepcopy(selected)

    def plan(self, ident, revision=None):
        rows = self.history_rows.get(checked_id(ident))
        if rows is None:
            raise InputError("A comparison references an absent original plan history")
        if revision is None:
            return rows[-1]
        if type(revision) is not int or revision < 1 or revision > len(rows):
            raise InputError("A comparison references an absent immutable revision")
        return rows[revision - 1]

    def verify(self):
        for r in self.request_rows:
            if (not isinstance(r, dict) or set(r) != {"id", "input_sha", "action", "input", "plan", "revision", "result"} or
                not isinstance(r["id"], str) or not REQUEST.fullmatch(r["id"]) or
                not isinstance(r["input"], str) or not isinstance(r["result"], str) or
                type(r["revision"]) is not int or r["revision"] < 1):
                raise InputError("A received request must use the complete original native identifier and field contract")
            checked_id(r["plan"]); checked_id(r["input_sha"])
        request_by_id = {r["id"]: r for r in self.request_rows}
        if len(request_by_id) != len(self.request_rows):
            raise InputError("The packet repeats an original request identifier")
        used = set()
        for ident, rows in self.history_rows.items():
            checked_id(ident)
            if not isinstance(rows, list) or not rows:
                raise InputError("The original plan history is empty")
            previous = None
            for number, p in enumerate(rows, 1):
                self._decode_plan(json_bytes(p))
                if p["id"] != ident or p["revision"] != number or p["previousRevision"] != (number - 1 if previous else None) or p["previousSha256"] != (previous["recordSha256"] if previous else None):
                    raise InputError("The complete original revision chain differs")
                request = request_by_id.get(p["lastAction"]["requestId"])
                if request is None or request["plan"] != ident or request["revision"] != number:
                    raise InputError("Each original revision requires its exact source request")
                action = p["lastAction"]["kind"]
                allowed = SAVE_FIELDS if action == "save" else (
                    {"requestId", "id", "expectedRevision", "decision", "actor", "note", "acknowledgedIssueIds"} if action == "review" else
                    {"requestId", "id", "expectedRevision", "reviewId", "actor"} if action == "release" else set())
                raw = load_json(request["input"])
                if action not in {"save", "review", "release"} or not isinstance(raw, dict) or set(raw) - allowed:
                    raise InputError("Unknown received organisation transition")
                if raw.get("requestId") != request["id"] or request["action"] != action or digest(request["input"].encode()) != request["input_sha"] or json_bytes(raw).decode() != request["input"]:
                    raise InputError("An original request or canonical input identity differs")
                expected_result = {"kind": "release" if action == "release" else "plan", "id": ident, "revision": number}
                if load_json(request["result"]) != expected_result:
                    raise InputError("A source request points to a different immutable result")
                if previous:
                    if raw.get("id") != ident or type(raw.get("expectedRevision")) is not int or raw["expectedRevision"] != previous["revision"]:
                        raise InputError("A received transition does not select its exact preceding revision")
                elif action != "save" or raw.get("id") is not None or raw.get("expectedRevision") is not None:
                    raise InputError("A received history does not begin with its original creation")
                try:
                    when = p["updatedAt"]
                    parsed = datetime.fromisoformat(when.replace("Z", "+00:00"))
                    if parsed.tzinfo is None:
                        raise ValueError()
                except (KeyError, TypeError, ValueError) as error:
                    raise InputError("A received observation timestamp is invalid") from error
                self.expected = p
                derived = {"save": self._make_save, "review": self._make_review, "release": self._make_release}[action](raw, previous, when)
                if derived != p:
                    raise InputError("The complete received " + action + " revision is not reproduced by its original input")
                used.add(request["id"])
                previous = deepcopy(p)
        self.expected = None
        return used

def receive_plan(planner, filename):
    path = Path(filename).expanduser().absolute()
    with planner.ws.scratch() as temp:
        manifest, packet_sha = _read_packet(path, temp)
        selection = load_json((temp / "selection.json").read_bytes())
        history = load_json((temp / "history.json").read_bytes())
        requests = load_json((temp / "requests.json").read_bytes())
        comparisons = load_json((temp / "comparisons.json").read_bytes())
        if not isinstance(selection, dict) or set(selection) != {"id", "revision", "recordSha256", "candidateSha256", "state"} or selection != manifest["selection"]:
            raise InputError("The complete original packet selection differs")
        if not isinstance(history, dict) or not history or not isinstance(requests, list) or not isinstance(comparisons, list):
            raise InputError("The packet omits full plan/request/comparison histories")
        if manifest["plans"] != {key: len(value) for key, value in history.items()}:
            raise InputError("The manifest does not match every linked original history")
        ident, number = checked_id(selection["id"]), revision(selection["revision"])
        if ident not in history or len(history[ident]) < number:
            raise InputError("The selected immutable organisation revision is absent")
        selected = history[ident][number - 1]
        if {k: selected[k] for k in selection} != selection:
            raise InputError("The original selected plan differs from the complete manifest")
        if load_json((temp / "definition.json").read_bytes()) != definition():
            raise InputError("Use the exact retained organisation schema/methodology edition from this packet")
        expected_sources, expected_assets = set(), {}
        for rows in history.values():
            for p in rows:
                expected_sources.update((checked_id(p["sourceId"]), checked_id(p["candidateSha256"])))
                for descriptor in asset_descriptors(p):
                    expected_assets[checked_id(descriptor["sha256"])] = descriptor
        for c in comparisons:
            checked_id(c.get("id"))
            for descriptor in c["files"].values():
                expected_assets[checked_id(descriptor["sha256"])] = descriptor
        installed = source_files()
        required = {"selection.json", "history.json", "requests.json", "comparisons.json", "definition.json"} | set(installed)
        required |= {"sources/" + s + ".xml" for s in expected_sources}
        required |= {"assets/" + a + ".bin" for a in expected_assets}
        if set(manifest["files"]) != required:
            raise InputError("The packet omits or adds material outside its complete selected source/history closure")
        for name, source in installed.items():
            # Source is delivered for review; a received executable is never loaded.
            if (temp / name).read_bytes() != source.read_bytes():
                raise InputError("Use the exact complete installed Python source edition accompanying this packet")
        verifier = _TransitionVerification(temp, history, requests)
        used_requests = verifier.verify()
        compare_ids = set()
        for c in comparisons:
            if c["id"] in compare_ids:
                raise InputError("The packet repeats a comparison")
            compare_ids.add(c["id"])
            matches = [r for r in requests if r["action"] == "compare" and load_json(r["result"]) == {"kind": "comparison", "id": c["id"]}]
            if len(matches) != 1:
                raise InputError("A comparison requires one exact original request")
            request = matches[0]
            raw = load_json(request["input"])
            if not isinstance(raw, dict) or set(raw) - {"requestId", "before", "after", "rowPairs", "actor", "notes"} or raw.get("requestId") != request["id"] or digest(request["input"].encode()) != request["input_sha"] or json_bytes(raw).decode() != request["input"]:
                raise InputError("The comparison request identity differs")
            for side in ("before", "after"):
                if not isinstance(raw.get(side), dict) or set(raw[side]) != {"id", "revision"}:
                    raise InputError("The comparison input omits its complete selected revisions")
            before = verifier.plan(raw["before"]["id"], raw["before"]["revision"])
            after = verifier.plan(raw["after"]["id"], raw["after"]["revision"])
            if request["plan"] != after["id"] or request["revision"] != after["revision"]:
                raise InputError("The comparison request points to a different selected plan")
            derived = verifier._make_comparison(raw, before, after)
            if derived != c:
                raise InputError("The received comparison does not reconstruct from its full original rows")
            used_requests.add(request["id"])
        if used_requests != {r["id"] for r in requests}:
            raise InputError("The packet contains a request without its original selected result")
        # All full bytes and transitions are verified before joining any source or row.
        for key, rows in history.items():
            for p in rows:
                old = planner.ws.db.execute("SELECT body FROM iati_organisation_plans WHERE id=? AND revision=?", (key, p["revision"])).fetchone()
                if old and old["body"] != json_bytes(p).decode():
                    raise InputError("An imported immutable revision conflicts with current operator work")
        for request in requests:
            if set(request) != {"id", "input_sha", "action", "input", "plan", "revision", "result"}:
                raise InputError("Unknown original request fields")
            old = planner.ws.db.execute("SELECT * FROM iati_organisation_requests WHERE id=?", (request["id"],)).fetchone()
            if old and dict(old) != request:
                raise InputError("An original received request conflicts with current work")
        for c in comparisons:
            old = planner.ws.db.execute("SELECT body FROM iati_organisation_comparisons WHERE id=?", (c["id"],)).fetchone()
            if old and old["body"] != json_bytes(c).decode():
                raise InputError("A received comparison conflicts with current work")
        for sid in sorted(expected_sources):
            planner._remember_source((temp / "sources" / (sid + ".xml")).read_bytes(), "Received organisation source")
        for aid, descriptor in sorted(expected_assets.items()):
            planner._retain((temp / "assets" / (aid + ".bin")).read_bytes(), descriptor["name"], descriptor["media"])
        with planner.ws.db:
            for key, rows in history.items():
                for p in rows:
                    planner.ws.db.execute("INSERT OR IGNORE INTO iati_organisation_plans VALUES(?,?,?)", (key, p["revision"], json_bytes(p).decode()))
            for request in requests:
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_organisation_requests VALUES(?,?,?,?,?,?,?)",
                    tuple(request[k] for k in ("id", "input_sha", "action", "input", "plan", "revision", "result")))
            for c in comparisons:
                planner.ws.db.execute("INSERT OR IGNORE INTO iati_organisation_comparisons VALUES(?,?)", (c["id"], json_bytes(c).decode()))
        return {"schema": "stellar-forge.iati-organisation-receiving.v1", "state": "COMPLETE",
            "plan": planner.plan(ident, number), "currentPlan": planner.plan(ident),
            "plans": len(history), "revisions": sum(map(len, history.values())),
            "sources": len(expected_sources), "comparisons": len(comparisons),
            "packet": {"bytes": path.stat().st_size, "sha256": packet_sha},
            "semantics": "Original immutable history joined; any later recipient revision remains current."}
