"""Complete static-release handover using GovHub's retained export lease."""
from __future__ import annotations
from pathlib import Path
import hashlib
import html
import json
import os
import stat
import zipfile

from .model import canonical, sha, relative
from .service import problem, target, current_release, edition, manifest, _expected_target


def _capture(ws, db, payload, actor):
    from govhub import now
    selected = target(ws, db, payload.get("target_id"))
    _expected_target(selected, payload)
    releases = ws._objects(db, "static_release", selected["target_id"])
    plans = ws._objects(db, "static_plan", selected["target_id"])
    edition_ids = {p["candidate_id"] for p in plans}
    edition_ids.update(p["baseline_id"] for p in plans if p["baseline_id"])
    edition_ids.update(r["edition_id"] for r in releases)
    if not edition_ids:
        problem("STATIC_EXPORT_EMPTY", "Create a complete comparison or release before exporting this target.")
    editions = []
    files = {}
    for identifier in sorted(edition_ids):
        value = edition(ws, db, identifier)
        rows = manifest(ws, db, value)
        editions.append({"edition": value, "files": rows})
        for row in rows:
            files["editions/" + identifier + "/site/" + row["path"]] = ws._file_row(db, row["file_id"])
        for record in value["sources"]:
            item = ws._file_row(db, record["file_id"])
            files["original/" + item["id"] + "/" + item["filename"]] = item
        item = ws._file_row(db, value["manifest_file_id"])
        files["original/" + item["id"] + "/" + item["filename"]] = item
    builds = []
    retained_ids = {item["id"] for item in files.values()}
    for identifier in sorted({entry["edition"]["operation_id"] for entry in editions}):
        operation = ws._operation(db, identifier)
        builds.append({"operation": operation, "events": ws._objects(db, "operation_event", identifier),
                       "observations": ws._objects(db, "operation_observation", identifier)})
        # Retain failed/partial native attempts too. Complete assets already have
        # their literal output path above; earlier artifacts remain source files.
        for retained in operation.get("retained_artifacts", []):
            item = ws._file_row(db, retained["file"]["id"])
            if item["id"] not in retained_ids:
                files["original/" + item["id"] + "/" + item["filename"]] = item
                retained_ids.add(item["id"])
    comparisons = []
    from .service import _json_file
    for plan in plans:
        data, item = _json_file(ws, db, plan["comparison_file_id"])
        if item["sha256"] != plan["comparison_sha256"]:
            problem("STATIC_COMPARISON_IDENTITY", "The original complete comparison changed.", 409)
        comparisons.append({"plan": plan, "comparison": data,
                            "reviews": ws._objects(db, "static_review", plan["id"]),
                            "stages": ws._objects(db, "static_stage", plan["id"])})
        files["original/" + item["id"] + "/" + item["filename"]] = item
    operations = []
    for row in db.execute("SELECT data FROM govhub_operations ORDER BY rowid"):
        value = json.loads(row[0])
        if value.get("static_target_id") == selected["target_id"]:
            operations.append({"operation": value, "events": ws._objects(db, "operation_event", value["id"])})
            for retained in value.get("retained_artifacts", []):
                item = ws._file_row(db, retained["file"]["id"])
                files["original/" + item["id"] + "/" + item["filename"]] = item
    for name, item in files.items():
        relative(name)
        ws._verify_file(item)
    return {"schema": "govhub.static-handover.v1", "name": payload.get("name") or selected["label"] + " static release",
            "captured_at": now(), "author": actor["name"], "workspace": ws.meta(db)["workspace"],
            "target": selected, "target_history": ws._objects(db, "static_target", selected["target_id"]),
            "current_release": current_release(ws, db, selected["target_id"]), "releases": releases,
            "editions": editions, "comparisons": comparisons, "builds": builds,
            "operations": operations, "files": files}


def report(value):
    esc = lambda item: html.escape(str(item if item is not None else ""))
    target_value = value["target"]
    sections = []
    for entry in value["comparisons"]:
        plan, compared = entry["plan"], entry["comparison"]
        rows = "".join("<tr><td>" + esc(row["status"]) + "</td><td><code>" + esc(row["path"]) +
                       "</code></td><td>" + esc((row.get("before") or {}).get("bytes", "—")) +
                       "</td><td>" + esc((row.get("after") or {}).get("bytes", "—")) + "</td></tr>"
                       for row in compared["rows"])
        reviews = "".join("<li>" + esc(r["decision"]) + " · " + esc(r["author"]) + " · " +
                          esc(r["created_at"]) + "<p>" + esc(r["reason"]) + "</p></li>"
                          for r in entry["reviews"])
        sections.append("<section><h2>" + esc(plan["label"]) + "</h2><p>" + esc(plan["notes"]) +
                        "</p><p>Complete path comparison: " + esc(json.dumps(compared["counts"])) +
                        "</p><table><thead><tr><th>Change</th><th>Original path</th><th>Before bytes</th>" +
                        "<th>After bytes</th></tr></thead><tbody>" + rows + "</tbody></table><h3>Retained reviews</h3><ol>" +
                        reviews + "</ol></section>")
    editions = "".join("<li><a href=\"" + esc("editions/" + e["edition"]["id"] + "/edition.json") +
                       "\">" + esc(e["edition"]["label"]) + "</a> · " + esc(e["edition"]["file_count"]) +
                       " files · " + esc(e["edition"]["total_bytes"]) + " bytes</li>" for e in value["editions"])
    releases = "".join("<li>" + esc(r["kind"]) + " · " + esc(r["created_at"]) + " · " + esc(r["author"]) +
                       "<p>" + esc(r.get("reason")) + "</p><code>" + esc(r["pointer"]) + "</code></li>" for r in value["releases"])
    return ("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
            "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'\">" +
            "<title>" + esc(value["name"]) + "</title><style>body{max-width:1150px;margin:32px auto;padding:0 24px;font:16px/1.55 system-ui;color:#222;background:#fff}" +
            "h1{font-size:28px}h2{margin-top:32px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;text-align:left;padding:8px;vertical-align:top}" +
            "code{overflow-wrap:anywhere}a{color:#222}section{border-top:1px solid #ccc;padding-top:12px}</style><h1>" + esc(value["name"]) +
            "</h1><p>Retained at " + esc(value["captured_at"]) + " by " + esc(value["author"]) +
            ".</p><p>Target " + esc(target_value["label"]) + " · " + esc(target_value["release_root"]) +
            "</p><p><a href=\"handover.json\">Complete operating record</a> · <a href=\"START_HERE.md\">Receiving guide</a> · " +
            "<a href=\"manifest.json\">Full file inventory</a></p><h2>Complete output editions</h2><ul>" + editions +
            "</ul><h2>Release history</h2><ol>" + releases + "</ol>" + "".join(sections) + "</html>").encode("utf-8")


def _documents(value):
    stripped = {key: val for key, val in value.items() if key != "files"}
    documents = {"handover.json": canonical(stripped), "report.html": report(value)}
    for entry in value["editions"]:
        identifier = entry["edition"]["id"]
        documents["editions/" + identifier + "/edition.json"] = canonical(entry)
    for entry in value["comparisons"]:
        documents["comparisons/" + entry["plan"]["id"] + ".json"] = canonical(entry)
    documents["START_HERE.md"] = (
        "# Static release handover\n\nOpen report.html for the complete change and release history. "
        "Each editions/ID/site directory contains the complete original generated output. "
        "edition.json retains its path/byte/SHA-256 inventory and source identity. original/ keeps "
        "the actual native reports, source inputs and interrupted operation material. manifest.json "
        "identifies every accompanying file; it excludes only its own recursive hash.\n\n"
        "The selected target, original current pointer, reviews and operation history are in handover.json. "
        "This archive documents one retained snapshot; subsequent workspace changes are separate editions. "
        "Do not execute downloaded generated HTML in the private authenticated operator origin. Inspect it "
        "in a separate static preview location selected by the receiving engineer.\n\n"
        "To resume the same operating identities, use the original GovHub workspace backup and matching "
        "application source. From its installed workspace directory, run cli.py with --workspace, "
        "--source-root, --username and an existing password input, then call static.list. "
        "The original backup copies the SQLite journal, registered source bytes, request results and native "
        "operation checkpoints; this review ZIP by itself is not a replacement database. Source and "
        "release paths remain explicitly configured. A new receiving host selects its own existing target "
        "directory through static.targets.save; reviewing or importing backup bytes never publishes a site.\n\n"
        "A production release is an explicit original worker operation. Stage the complete edition, review "
        "its full comparison, then publish that selected plan. Rollback selects the current release's exact "
        "retained predecessor. The local current symlink and all old immutable output editions remain "
        "distinct from any Drupal database restore or external CDN deployment.\n"
    ).encode()
    return documents


def _archive(ws, destination, capture):
    documents = _documents(capture)
    inventory = [{"path": name, "bytes": len(raw), "sha256": sha(raw)} for name, raw in documents.items()]
    inventory.extend({"path": name, "bytes": item["bytes"], "sha256": item["sha256"]} for name, item in capture["files"].items())
    inventory.sort(key=lambda item: item["path"])
    names = [item["path"] for item in inventory]
    if len(names) != len(set(names)) or "manifest.json" in names:
        problem("STATIC_EXPORT_PATH", "The complete handover has conflicting archive member names.", 409)
    documents["manifest.json"] = canonical({"schema": "govhub.static-handover-manifest.v1",
        "capture_sha256": sha(canonical(capture)), "files": inventory})
    expected = {item["path"]: item for item in inventory}
    expected["manifest.json"] = {"bytes": len(documents["manifest.json"]), "sha256": sha(documents["manifest.json"])}
    if destination.exists() or destination.is_symlink():
        if destination.is_symlink() or not destination.is_file():
            problem("STATIC_EXPORT_CHANGED", "The original handover output is not a regular file.", 409)
        with zipfile.ZipFile(destination) as archive:
            if len(archive.namelist()) != len(expected) or set(archive.namelist()) != set(expected):
                problem("STATIC_EXPORT_CHANGED", "The retained handover has different members.", 409)
            for name, descriptor in expected.items():
                with archive.open(name) as stream:
                    h, size = hashlib.sha256(), 0
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        h.update(block)
                        size += len(block)
                if (h.hexdigest(), size) != (descriptor["sha256"], descriptor["bytes"]):
                    problem("STATIC_EXPORT_CHANGED", "The retained handover bytes changed.", 409)
        return
    temporary = destination.with_name(destination.name + ".partial")
    if temporary.is_symlink() or temporary.exists() and not temporary.is_file():
        problem("STATIC_EXPORT_PATH", "The retained partial archive is not an ordinary file.", 409)
    temporary.unlink(missing_ok=True)
    with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for name in sorted(expected):
            relative(name)
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100600 << 16
            with archive.open(info, "w", force_zip64=True) as out:
                if name in documents:
                    out.write(documents[name])
                else:
                    item = capture["files"][name]
                    source = ws._verify_file(item)
                    h, count = hashlib.sha256(), 0
                    with source.open("rb") as original:
                        for block in iter(lambda: original.read(1024 * 1024), b""):
                            out.write(block)
                            h.update(block)
                            count += len(block)
                    if (h.hexdigest(), count) != (item["sha256"], item["bytes"]):
                        problem("STATIC_EXPORT_SOURCE", "An original retained source changed during export.", 409)
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    os.link(temporary, destination)
    ws._sync_dir(destination.parent)
    temporary.unlink()


def create_export(ws, payload, actor):
    from govhub import ident, text
    ws._authorize(actor)
    bound = dict(payload, static_action="exports.create")
    with ws._export_lease():
        with ws.connect(write=True) as db:
            key, fingerprint, prior = ws._request(db, bound, actor)
            if prior is not None:
                return dict(prior, replayed=True)
            intents = ws._objects(db, "static_export_intent", key)
            if intents:
                intent = intents[0]
                if intent["fingerprint"] != fingerprint:
                    problem("RETRY_CHANGED", "This export request belongs to different retained input.", 409)
            else:
                prepared = dict(payload, name=text(payload.get("name", ""), 500))
                intent = ws._object(db, "static_export_intent", {
                    "export_id": ident("static-export-"), "fingerprint": fingerprint,
                    "capture": _capture(ws, db, prepared, actor)}, parent=key, actor=actor["name"])
        root = ws.root / "govhub-export-builds"
        root.mkdir(mode=0o700, exist_ok=True)
        if root.is_symlink():
            problem("STATIC_EXPORT_DIRECTORY", "Keep the original export directory inside its workspace.", 409)
        destination = root / (intent["export_id"] + ".zip")
        _archive(ws, destination, intent["capture"])
        with ws.connect(write=True) as db:
            key, fingerprint, prior = ws._request(db, bound, actor)
            if prior is not None:
                return dict(prior, replayed=True)
            item = ws._register(db, destination, "Static_Release_Handover.zip", actor,
                category="Handover", label="Complete static release handover",
                owner_kind="static_export", owner_id=intent["export_id"], output_name="Static_Release_Handover.zip")
            value = ws._object(db, "static_export", {
                "id": intent["export_id"], "name": intent["capture"]["name"],
                "target_id": intent["capture"]["target"]["target_id"],
                "target_revision": intent["capture"]["target"]["id"],
                "captured_at": intent["capture"]["captured_at"], "intent_id": intent["id"],
                "capture_sha256": sha(canonical(intent["capture"])), "file": item,
                "edition_count": len(intent["capture"]["editions"]),
                "release_count": len(intent["capture"]["releases"])}, actor=actor["name"])
            result = {"export": value}
            ws._remember(db, key, fingerprint, result, actor)
            ws._changed(db, actor, "Complete static release handover retained", "static_export", value["id"])
        # The registered immutable blob is the authoritative output. Keep this
        # small owner path as a usable download/recovery result, not a hidden copy.
        return result
