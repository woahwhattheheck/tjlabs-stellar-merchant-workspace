"""DNN staff operations in the original authenticated, versioned source store."""
from __future__ import annotations
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math
import hashlib
import html
import io
import json
from pathlib import Path
import tempfile
from urllib.parse import urlsplit
import uuid
import zipfile

from .model import (SCHEMA, NATIVE_SCHEMA, DOCS, canonical, digest, environment_fingerprint,
                    ordinary, package_info, plan_audit, read_member, version, version_text, extension_version,
                    zip_members, SHA)

ROOT = Path(__file__).resolve().parent
KINDS = ("dnn_site", "dnn_ticket", "dnn_package", "dnn_inventory", "dnn_release",
         "dnn_review", "dnn_job", "dnn_result", "dnn_report", "dnn_monitoring", "dnn_handoff")

def problem(message, code="DNN_INPUT", status=422):
    from govhub import GovHubError
    raise GovHubError(code, message, status)

def text(value, maximum=16000, required=False):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        problem("Supply the complete field text within its displayed limit.")
    return value.strip()

def instant(value, label, optional=False):
    if optional and not value:
        return None
    raw = text(value, 100, True)
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except ValueError:
        problem("Use an actual timestamp with timezone for " + label + ".")

def stamp(value):
    return value.isoformat().replace("+00:00", "Z") if value else None

def http_checks(value):
    if not isinstance(value, list) or len(value) > 200:
        problem("Supply the native HTTP checks as a list of at most 200 checks.")
    result, labels = [], set()
    for item in value:
        if not isinstance(item, dict):
            problem("Each HTTP check needs a label and relative site path.")
        label = text(item.get("label", ""), 200, True)
        path = text(item.get("path", ""), 2000, True)
        parsed = urlsplit(path)
        if not path.startswith("/") or path.startswith("//") or "\\" in path or parsed.scheme or parsed.netloc or parsed.fragment or any(x == ".." for x in parsed.path.split("/")):
            problem("Each HTTP check must use a path within the selected site.")
        try:
            status = int(item.get("status", 200))
        except (ValueError, TypeError):
            problem("Use an integer expected HTTP status.")
        if not 100 <= status <= 599 or label in labels:
            problem("Give each HTTP check a unique label and valid expected status.")
        labels.add(label)
        result.append({"label": label, "path": path, "status": status,
                       "contains": text(item.get("contains", ""), 5000)})
    return result

def _objects(ws, db, kind):
    return ws._objects(db, kind)

def _get(ws, db, kind, identity):
    return ws._get(db, kind, identity)

def _latest(ws, db, kind, key):
    found = {}
    for item in _objects(ws, db, kind):
        found[item[key]] = item
    return found

def _revision(ws, db, kind, logical_id, payload):
    key = kind.removeprefix("dnn_") + "_id"
    previous = _latest(ws, db, kind, key).get(logical_id)
    expected = payload.get("expected_revision")
    if previous and expected != previous["revision"]:
        problem("This record changed. Reopen its current edition while keeping your draft.", "DNN_REVISION", 409)
    if not previous and expected not in (None, 0):
        problem("The selected original record is unavailable.", "DNN_REVISION", 409)
    return previous, 1 + (previous["revision"] if previous else 0)

def _new(ws, db, kind, value, actor, parent=""):
    return ws._object(db, kind, value, parent=parent, actor=actor["name"])

def _site(ws, db, site_id):
    value = _latest(ws, db, "dnn_site", "site_id").get(site_id)
    if not value:
        problem("Select an existing DNN site.", "DNN_SITE", 404)
    return value

def _release(ws, db, release_id):
    value = _latest(ws, db, "dnn_release", "release_id").get(release_id)
    if not value:
        problem("Select an existing maintenance release.", "DNN_RELEASE", 404)
    return value

def _result(ws, db, job_id):
    values = _objects(ws, db, "dnn_result")
    return next((x for x in reversed(values) if x["job_id"] == job_id), None)

def _audit(ws, db, release):
    inventories = {x["id"]: x for x in _objects(ws, db, "dnn_inventory")}
    packages = {x["id"]: x for x in _objects(ws, db, "dnn_package")}
    result = plan_audit(release, inventories, packages)
    for key, environment in (("production_inventory_id", "production_site_id"),
                             ("staging_inventory_id", "staging_site_id")):
        inv = inventories.get(release.get(key))
        if inv and inv["site_id"] != release.get(environment):
            result["problems"].append("The selected inventory belongs to a different site.")
    if release.get("production_site_id") == release.get("staging_site_id"):
        result["problems"].append("Select distinct production and staging installations.")
    jobs = [x for x in _objects(ws, db, "dnn_job") if x.get("intent_sha256") == release["intent_sha256"]]
    outcomes = {x["job_id"]: x for x in _objects(ws, db, "dnn_result")}
    result["staging_upgrade"] = next((x["id"] for x in reversed(jobs)
        if x["action"] == "upgrade" and x["environment"] == "staging"
        and outcomes.get(x["id"], {}).get("status") == "complete"), None)
    result["staging_restore"] = next((x["id"] for x in reversed(jobs)
        if x["action"] == "restore" and x["environment"] == "staging"
        and outcomes.get(x["id"], {}).get("status") == "complete"
        and x.get("backup_job_id") == result["staging_upgrade"]), None)
    result["ready"] = not result["problems"]
    result["production_ready"] = bool(result["ready"] and result["staging_upgrade"] and result["staging_restore"])
    result["reviews"] = [x for x in _objects(ws, db, "dnn_review")
                         if x["intent_sha256"] == release["intent_sha256"]]
    return result

def snapshot(ws):
    with ws.connect(snapshot=True) as db:
        releases = list(_latest(ws, db, "dnn_release", "release_id").values())
        outcomes = {x["job_id"]: x for x in _objects(ws, db, "dnn_result")}
        exports = {x["job_id"]: x for x in _objects(ws, db, "dnn_job_export")}
        jobs = [dict(x, result=outcomes.get(x["id"]), export=exports.get(x["id"])) for x in _objects(ws, db, "dnn_job")]
        return {"schema": SCHEMA, "workspace": ws.meta(db)["workspace"], "head": ws.meta(db)["head"],
                "sites": list(_latest(ws, db, "dnn_site", "site_id").values()),
                "tickets": list(_latest(ws, db, "dnn_ticket", "ticket_id").values()),
                "packages": _objects(ws, db, "dnn_package"), "inventories": _objects(ws, db, "dnn_inventory"),
                "releases": [dict(x, audit=_audit(ws, db, x)) for x in releases],
                "jobs": jobs, "reports": _objects(ws, db, "dnn_report"),
                "monitoring": _objects(ws, db, "dnn_monitoring"),
                "handoffs": _objects(ws, db, "dnn_handoff"), "sources": DOCS,
                "files": [dict(row) for row in db.execute("SELECT * FROM files ORDER BY rowid DESC")]}

def _site_save(ws, db, p, actor):
    logical = p.get("site_id") or str(uuid.uuid4())
    previous, revision = _revision(ws, db, "dnn_site", logical, p)
    url = text(p.get("url", ""), 2000)
    parsed = urlsplit(url)
    if url and (parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment):
        problem("Use the actual site's HTTP(S) base URL without credentials, query or fragment.")
    environment = p.get("environment")
    if environment not in ("production", "staging"):
        problem("Choose the production or staging environment.")
    value = {"site_id": logical, "revision": revision, "label": text(p.get("label", ""), 300, True),
             "environment": environment, "environment_id": text(p.get("environment_id", ""), 200),
             "url": url.rstrip("/"), "iis_site": text(p.get("iis_site", ""), 240),
             "application_path": text(p.get("application_path", "/"), 1000, True),
             "owner": text(p.get("owner", ""), 1000, True),
             "technical_contact": text(p.get("technical_contact", ""), 1000),
             "external_reference": text(p.get("external_reference", ""), 2000),
             "notes": text(p.get("notes", ""), 16000),
             "supersedes": previous["id"] if previous else None}
    if not value["application_path"].startswith("/") or "\\" in value["application_path"] or ".." in value["application_path"].split("/"):
        problem("Use the actual IIS application path, starting with '/'.")
    value["configured"] = all(value[k] for k in ("environment_id", "url", "iis_site", "application_path"))
    return {"site": _new(ws, db, "dnn_site", value, actor, logical)}

def _ticket_save(ws, db, p, actor):
    site = _site(ws, db, p.get("site_id"))
    logical = p.get("ticket_id") or str(uuid.uuid4())
    previous, revision = _revision(ws, db, "dnn_ticket", logical, p)
    status = p.get("status", "open")
    if status not in ("open", "planned", "in_progress", "accepted", "closed"):
        problem("Choose a displayed service request state.")
    if previous and previous["site_id"] != site["site_id"]:
        problem("Keep the original service request attached to its site.")
    if status in ("accepted", "closed") and not str(p.get("resolution", "")).strip():
        problem("Record the actual acceptance or resolution.")
    incident_start = instant(p.get("incident_started_at"), "incident start", True)
    incident_end = instant(p.get("incident_ended_at"), "incident restoration", True)
    if incident_end and (not incident_start or incident_end < incident_start):
        problem("The actual incident restoration must follow its recorded start.")
    value = {"incident_started_at": stamp(incident_start), "incident_ended_at": stamp(incident_end),
             "ticket_id": logical, "revision": revision, "site_id": site["site_id"],
             "title": text(p.get("title", ""), 500, True), "description": text(p.get("description", ""), 16000, True),
             "external_reference": text(p.get("external_reference", ""), 2000),
             "owner": text(p.get("owner", ""), 1000), "priority": p.get("priority", "normal"),
             "status": status, "resolution": text(p.get("resolution", ""), 16000),
             "supersedes": previous["id"] if previous else None}
    if value["priority"] not in ("normal", "urgent", "critical"):
        problem("Choose a displayed service priority.")
    return {"ticket": _new(ws, db, "dnn_ticket", value, actor, logical)}

def _inspect_package(ws, db, p, actor):
    item = ws._file_row(db, p.get("file_id"))
    path = ws._verify_file(item)
    try:
        info = package_info(path, item["filename"])
    except (ValueError, zipfile.BadZipFile, KeyError, json.JSONDecodeError) as exc:
        problem(str(exc), "DNN_PACKAGE")
    publisher = text(p.get("publisher_source", ""), 4000, True)
    parsed = urlsplit(publisher)
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
        problem("Use the actual HTTP(S) publisher or vendor release source URL.")
    return {"package": _new(ws, db, "dnn_package",
        {"file": item, "package": info, "publisher_source": publisher,
         "release_note": text(p.get("release_note", ""), 12000)}, actor, item["id"])}

def _release_save(ws, db, p, actor):
    logical = p.get("release_id") or str(uuid.uuid4())
    previous, revision = _revision(ws, db, "dnn_release", logical, p)
    production = _site(ws, db, p.get("production_site_id"))
    staging = _site(ws, db, p.get("staging_site_id"))
    if production["environment"] != "production" or staging["environment"] != "staging":
        problem("Choose the production installation and its paired staging installation.")
    package_ids = p.get("package_ids", [])
    if not isinstance(package_ids, list) or len(set(package_ids)) != len(package_ids):
        problem("Select each package once in its intended order.")
    packages = [_get(ws, db, "dnn_package", x) for x in package_ids]
    ticket_ids = p.get("ticket_ids", [])
    tickets = _latest(ws, db, "dnn_ticket", "ticket_id")
    if not isinstance(ticket_ids, list) or any(x not in tickets for x in ticket_ids):
        problem("Select the actual service requests included in this release.")
    normalized = http_checks(p.get("checks", []))
    target = version_text(p.get("target_version", ""))
    value = {"release_id": logical, "revision": revision, "label": text(p.get("label", ""), 500, True),
             "production_site_id": production["site_id"], "staging_site_id": staging["site_id"],
             "production_site_record": production["id"], "staging_site_record": staging["id"],
             "production_inventory_id": p.get("production_inventory_id"),
             "staging_inventory_id": p.get("staging_inventory_id"),
             "target_version": target, "package_ids": package_ids, "ticket_ids": ticket_ids,
             "checks": normalized, "compatibility_review": text(p.get("compatibility_review", ""), 24000),
             "rollback_note": text(p.get("rollback_note", ""), 16000),
             "maintenance_window": text(p.get("maintenance_window", ""), 2000, True),
             "telerik_decision": p.get("telerik_decision", "native_required"),
             "notes": text(p.get("notes", ""), 24000), "supersedes": previous["id"] if previous else None}
    if value["telerik_decision"] not in ("native_required", "remove"):
        problem("Use the native required Telerik decision, or the explicitly reviewed removal.")
    # The same unchanged implementation can retain its accepted staging results after an editorial note update.
    intent = {k: value[k] for k in ("production_site_record", "staging_site_record",
        "production_inventory_id", "staging_inventory_id", "target_version", "package_ids",
        "checks", "compatibility_review", "rollback_note", "telerik_decision")}
    intent["packages"] = [{"id": x["id"], "sha256": x["file"]["sha256"]} for x in packages]
    value["intent_sha256"] = digest(intent)
    value["intent"] = intent
    saved = _new(ws, db, "dnn_release", value, actor, logical)
    return {"release": saved, "audit": _audit(ws, db, saved)}

def _review(ws, db, p, actor):
    ws._authorize(actor, "reviewer")
    release = _release(ws, db, p.get("release_id"))
    if p.get("expected_revision") != release["revision"]:
        problem("Reopen the current release before recording its review.", "DNN_REVISION", 409)
    purpose = p.get("purpose")
    if purpose not in ("staging", "production", "rollback"):
        problem("Choose the reviewed operating phase.")
    audit = _audit(ws, db, release)
    if not audit["ready"]:
        problem("Complete the displayed release inputs: " + "; ".join(audit["problems"]), "DNN_PLAN")
    if purpose == "production" and not audit["production_ready"]:
        problem("Receive this release's completed staging upgrade and its paired restore rehearsal.", "DNN_STAGING")
    return {"review": _new(ws, db, "dnn_review",
        {"release_id": release["release_id"], "release_record": release["id"], "revision": release["revision"],
         "intent_sha256": release["intent_sha256"], "purpose": purpose,
         "note": text(p.get("note", ""), 24000, True), "audit": audit}, actor, release["release_id"])}

def _site_target(site):
    return {k: site[k] for k in ("site_id", "environment_id", "environment", "url", "iis_site", "application_path")}

def _job_create(ws, db, p, actor):
    action = p.get("action")
    if action not in ("inventory", "backup", "upgrade", "restore", "verify"):
        problem("Choose an available DNN native action.")
    release = _release(ws, db, p.get("release_id")) if p.get("release_id") else None
    site = _site(ws, db, p.get("site_id"))
    if not all(site.get(k) for k in ("environment_id", "url", "iis_site", "application_path")):
        problem("Complete this installation's actual environment ID, site URL and IIS target before preparing its Windows operation.")
    inventory = None
    if p.get("inventory_id"):
        inventory = _get(ws, db, "dnn_inventory", p["inventory_id"])
    elif release:
        key = "production_inventory_id" if site["environment"] == "production" else "staging_inventory_id"
        if release.get(key):
            inventory = _get(ws, db, "dnn_inventory", release[key])
    if inventory and inventory["site_id"] != site["site_id"]:
        problem("The native baseline belongs to another site.")
    if action != "inventory" and not inventory:
        problem("Receive the actual native baseline for this selected installation.")
    if action == "upgrade" and release:
        role = "production" if site["environment"] == "production" else "staging"
        pinned_site = _get(ws, db, "dnn_site", release[role + "_site_record"])
        pinned_inventory = _get(ws, db, "dnn_inventory", release[role + "_inventory_id"])
        if _site_target(site) != _site_target(pinned_site):
            problem("The technical installation target changed after this release was reviewed. Update the release with its current site record.")
        if inventory and inventory["fingerprint"] != pinned_inventory["fingerprint"]:
            problem("This newer inventory changes the reviewed technical baseline. Update and review the release before upgrading.")
        # An identical fresh observation may confirm the review; the native request retains its pinned baseline.
        inventory = pinned_inventory
    audit, review = None, None
    staging_seed = action == "restore" and release is None and site["environment"] == "staging"
    if staging_seed:
        ws._authorize(actor, "reviewer")
        review = {"purpose": "staging-restore", "actor": actor["name"],
                  "note": text(p.get("note", ""), 12000, True)}
    if action in ("upgrade", "restore") and not staging_seed:
        if not release or site["site_id"] not in (release["production_site_id"], release["staging_site_id"]):
            problem("Bind native release work to its reviewed production or staging site.")
        if p.get("expected_revision") != release["revision"]:
            problem("Reopen the current maintenance release before preparing this action.", "DNN_REVISION", 409)
        audit = _audit(ws, db, release)
        purpose = "rollback" if action == "restore" and site["environment"] == "production" else site["environment"]
        review = next((x for x in reversed(audit["reviews"]) if x["purpose"] == purpose), None)
        if not audit["ready"] or not review:
            problem("Record the exact " + purpose + " review for this release.", "DNN_REVIEW")
    backup_job = None
    backup = None
    if action == "restore":
        backup_job = _get(ws, db, "dnn_job", p.get("backup_job_id"))
        outcome = _result(ws, db, backup_job["id"])
        same_site = backup_job["site_id"] == site["site_id"]
        source_site = _get(ws, db, "dnn_site", backup_job["site_record"])
        staging_copy = site["environment"] == "staging" and source_site["environment"] == "production" and (
            staging_seed or backup_job["site_id"] == release["production_site_id"])
        if not (same_site or staging_copy) or not outcome or outcome["status"] not in ("complete", "failed", "uncertain"):
            problem("Choose this installation's paired backup, or this release's production generation for its isolated staging target.")
        if staging_copy and not str(p.get("staging_binding_note", "")).strip():
            problem("Record the approved isolated staging bindings and data-handling method.")
        backup = outcome["native"].get("backup")
        if not backup or not backup.get("pair_id"):
            problem("The selected native operation has no completed paired backup.")
        if release and backup_job.get("intent_sha256") != release["intent_sha256"]:
            problem("Select this release's original paired backup.")
        backup = dict(backup, return_file=outcome["return_file"], original_job_id=backup_job["id"],
                      source_site_id=backup_job["site_id"], staging_copy=staging_copy,
                      staging_binding_note=text(p.get("staging_binding_note", ""), 16000),
                      staging_bindings=p.get("staging_bindings") if staging_copy else None)
        if staging_copy:
            bindings = backup["staging_bindings"]
            if not isinstance(bindings, dict) or not isinstance(bindings.get("portal_aliases"), list) or not bindings["portal_aliases"]:
                problem("Supply the reviewed original PortalAliasID to staging alias mapping.")
            text(bindings.get("data_handling_note", ""), 16000, True)
            seen = set()
            for entry in bindings["portal_aliases"]:
                identity = entry.get("portal_alias_id") if isinstance(entry, dict) else None
                if not isinstance(identity, int) or identity < 0 or identity in seen:
                    problem("Map each actual original PortalAliasID once.")
                seen.add(identity)
                text(entry.get("alias", ""), 2000, True)
    native_id = str(uuid.uuid4())
    selected_packages = [_get(ws, db, "dnn_package", x) for x in release["package_ids"]] if release and action == "upgrade" else []
    names = [x["file"]["filename"].casefold() for x in selected_packages]
    if len(set(names)) != len(names):
        problem("Selected packages share a filename. Retain distinct original package names before export.")
    value = {"id": native_id, "action": action, "site_id": site["site_id"], "site_record": site["id"],
             "environment": site["environment"], "release_id": release["release_id"] if release else None,
             "release_record": release["id"] if release else None,
             "intent_sha256": release["intent_sha256"] if release else None,
             "backup_job_id": backup_job["id"] if backup_job else None,
             "note": text(p.get("note", ""), 12000, action != "inventory")}
    request = {"schema": NATIVE_SCHEMA, "operation_id": native_id,
        "workspace_id": ws.meta(db)["workspace"]["id"], "action": action, "target": _site_target(site),
        "baseline": inventory["inventory"] if inventory else None,
        "baseline_fingerprint": inventory["fingerprint"] if inventory else None,
        "intent_sha256": value["intent_sha256"], "review": review,
        "release": {"id": release["release_id"], "revision": release["revision"],
                    "target_version": release["target_version"], "steps": audit["steps"] if audit else [],
                    "checks": release["checks"], "telerik_decision": release["telerik_decision"],
                    "maintenance_window": release["maintenance_window"]} if release else None,
        "packages": [{"id": x["id"], "name": x["file"]["filename"], "sha256": x["file"]["sha256"],
                      "bytes": x["file"]["bytes"], "package": x["package"]} for x in selected_packages],
        "backup": backup, "checks": release["checks"] if release else http_checks(p.get("checks", [])),
        "note": value["note"]}
    raw = canonical(request)
    value.update(request=request, request_sha256=digest(raw), package_records=selected_packages)
    return {"job": _new(ws, db, "dnn_job", value, actor, site["site_id"])}

def _copy_to_zip(archive, destination, source, expected_sha, expected_bytes):
    h, count = hashlib.sha256(), 0
    with archive.open(destination, "w", force_zip64=True) as out:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            out.write(block)
            h.update(block)
            count += len(block)
    if count != expected_bytes or h.hexdigest() != expected_sha:
        problem("An original package or backup member changed during transfer.", "DNN_SOURCE_CHANGED", 409)

def _job_export(ws, db, p, actor):
    job = _get(ws, db, "dnn_job", p.get("job_id"))
    for retained in _objects(ws, db, "dnn_job_export"):
        if retained["job_id"] == job["id"]:
            ws._verify_file(retained["file"])
            return retained
    with tempfile.TemporaryDirectory(prefix="dnn-request-", dir=ws.root) as directory:
        path = Path(directory) / ("DNN_Native_Request_" + job["id"] + ".zip")
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as out:
            out.writestr("request.json", canonical(job["request"]))
            out.writestr("request.sha256", job["request_sha256"] + "\n")
            native_source = {}
            for source in ("native.ps1", "native-host.ps1", "native-upgrade.ps1", "CONNECTION_TEMPLATE.json", "NATIVE_OPERATOR.md", "PRIMARY_SOURCES.json"):
                out.write(ROOT / source, source)
                if source.endswith(".ps1"):
                    native_source[source] = hashlib.sha256((ROOT / source).read_bytes()).hexdigest()
            for item in job.get("package_records", []):
                saved = item["file"]
                with ws._verify_file(saved).open("rb") as source:
                    _copy_to_zip(out, "packages/" + saved["filename"], source, saved["sha256"], saved["bytes"])
            backup = job["request"].get("backup")
            if backup:
                container = ws._verify_file(backup["return_file"])
                with zipfile.ZipFile(container) as original:
                    members = {name: m for name, m in zip_members(original)}
                    for role in ("files", "database", "manifest"):
                        item = backup[role]
                        if item["path"] not in members:
                            problem("The original paired backup member is missing.")
                        with original.open(members[item["path"]]) as source:
                            _copy_to_zip(out, "backup/" + role + (".json" if role == "manifest" else ".zip" if role == "files" else ".bak"),
                                         source, item["sha256"], item["bytes"])
        saved = ws._register(db, path, path.name, actor, "Evidence", "DNN original Windows work request")
    return _new(ws, db, "dnn_job_export", {"job_id": job["id"], "file": saved,
                "request_sha256": job["request_sha256"], "native_source": native_source}, actor, job["id"])

def _native_complete(job, receipt):
    native = receipt.get("native", {})
    status = receipt.get("status")
    if status not in ("complete", "failed", "uncertain", "waiting"):
        problem("The native return has an unknown execution state.")
    inventory = native.get("inventory")
    if isinstance(inventory, dict):
        target = inventory.get("target", {})
        for key in ("site_id", "environment_id", "iis_site", "application_path"):
            if target.get(key) != job["request"]["target"].get(key):
                problem("The native return belongs to a different site or application.", "DNN_NATIVE_TARGET", 409)
    elif status == "complete":
        problem("The completed native return needs its actual final environment inventory.", "DNN_NATIVE")
    if status != "complete":
        return
    if job["action"] in ("backup", "upgrade"):
        backup = native.get("backup") or {}
        if not backup.get("pair_id") or not all(isinstance(backup.get(x), dict) for x in ("files", "database", "manifest")):
            problem("Receive the completed paired files/database backup for this native action.")
        if not backup.get("verifyonly_complete"):
            problem("The native SQL backup verification has not completed.")
    if job["action"] == "upgrade":
        target_version = job["request"]["release"]["target_version"]
        for key in ("assembly_version", "database_version"):
            if version(inventory.get("platform", {}).get(key)) != version(target_version):
                problem("The native result has not reached the selected DNN version.")
        actual_packages = {x["name"].casefold(): extension_version(x["version"]) for x in inventory.get("packages", [])}
        for package in job["request"]["packages"]:
            if package["package"]["kind"] == "extension":
                for expected in package["package"]["manifests"]:
                    if actual_packages.get(expected["name"].casefold()) != extension_version(expected["version"]):
                        problem("The native extension package result does not match the reviewed version.")
        if not native.get("upgrade_completed"):
            problem("The native DNN installer completion is absent.")
    if job["action"] in ("upgrade", "verify", "restore"):
        expected = job["request"].get("checks", (job["request"].get("release") or {}).get("checks", []))
        got = {x.get("label"): x for x in native.get("checks", [])}
        for check in expected:
            item = got.get(check["label"], {})
            if item.get("path") != check["path"] or item.get("expected_status") != check["status"] or not item.get("passed"):
                problem("Receive the actual requested HTTP check: " + check["label"])
    if job["action"] == "restore":
        result = native.get("restore", {})
        if result.get("pair_id") != job["request"]["backup"]["pair_id"] or not result.get("files_verified") or not result.get("database_restored"):
            problem("Receive the completed original files/database restore.")
        old_version = job["request"]["backup"].get("database_version")
        if not old_version or version(inventory.get("platform", {}).get("database_version")) != version(old_version):
            problem("The restored native database version does not match the original backup.")
        if job["request"]["backup"].get("staging_copy") and not result.get("staging_bindings_applied"):
            problem("Receive the actual isolated staging binding and data-handling result.")

def _receive(ws, db, p, actor):
    job = _get(ws, db, "dnn_job", p.get("job_id"))
    item = ws._file_row(db, p.get("file_id"))
    path = ws._verify_file(item)
    prior = _result(ws, db, job["id"])
    if prior and prior["return_file"]["sha256"] == item["sha256"]:
        return {"result": prior, "replayed": True}
    if prior and prior["status"] == "complete":
        problem("This native operation is already complete. Reopen its original return.", "DNN_NATIVE_COMPLETE", 409)
    try:
        with zipfile.ZipFile(path) as archive:
            members = {name: m for name, m in zip_members(archive)}
            if "result.json" not in members:
                problem("Select the native receiver's complete return ZIP.")
            receipt = json.loads(read_member(archive, members["result.json"], 32 * 1024**2).decode("utf-8-sig"))
            if receipt.get("schema") != NATIVE_SCHEMA or receipt.get("operation_id") != job["id"] or receipt.get("request_sha256") != job["request_sha256"]:
                problem("This return belongs to another original native request.", "DNN_NATIVE_ID", 409)
            artifacts = receipt.get("artifacts", [])
            if not isinstance(artifacts, list):
                problem("The native return needs its complete artifact index.")
            declared, verified = {"result.json"}, []
            for artifact in artifacts:
                name = ordinary(artifact.get("path", ""))
                if name in declared or name not in members or not SHA.fullmatch(str(artifact.get("sha256", ""))):
                    problem("The native artifact index is incomplete or repeats a path.")
                declared.add(name)
                h, count = hashlib.sha256(), 0
                with archive.open(members[name]) as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        h.update(block)
                        count += len(block)
                if count != artifact.get("bytes") or h.hexdigest() != artifact["sha256"]:
                    problem("An original native artifact failed its complete byte comparison.", "DNN_NATIVE_BYTES", 409)
                verified.append(dict(artifact, return_file_id=item["id"]))
            if set(members) != declared:
                problem("The native return has unindexed files.")
            request_artifact = next((x for x in verified if x["path"] == "request.json"), None)
            if not request_artifact or request_artifact["sha256"] != job["request_sha256"]:
                problem("The native return must retain this exact original request file.")
            exported = next((x for x in _objects(ws, db, "dnn_job_export") if x["job_id"] == job["id"]), None)
            if exported and exported.get("native_source"):
                if "journal.json" not in members:
                    problem("The complete native return needs its original operation journal.")
                journal = json.loads(read_member(archive, members["journal.json"], 32 * 1024**2).decode("utf-8-sig"))
                if journal.get("operation_id") != job["id"] or journal.get("request_sha256") != job["request_sha256"] or journal.get("source") != exported["native_source"]:
                    problem("The native operation journal belongs to different request or receiver bytes.")
            _native_complete(job, receipt)
            backup = receipt.get("native", {}).get("backup")
            if backup:
                indexed = {x["path"]: x for x in verified}
                for role in ("files", "database", "manifest"):
                    b = backup.get(role) or {}
                    if b.get("path") not in indexed or any(indexed[b["path"]].get(k) != b.get(k) for k in ("sha256", "bytes")):
                        problem("The paired backup does not reference the exact retained artifact index.")
            native = receipt.get("native", {})
            if isinstance(native.get("inventory"), dict):
                inv = native["inventory"]
                record = _new(ws, db, "dnn_inventory",
                    {"site_id": job["site_id"], "job_id": job["id"], "inventory": inv,
                     "fingerprint": environment_fingerprint(inv), "return_file": item}, actor, job["site_id"])
            else:
                record = None
            saved = _new(ws, db, "dnn_result",
                {"job_id": job["id"], "site_id": job["site_id"], "status": receipt["status"],
                 "request_sha256": job["request_sha256"], "return_file": item, "native": native,
                 "inventory_id": record["id"] if record else None, "artifacts": verified,
                 "started_at": receipt.get("started_at"), "finished_at": receipt.get("finished_at"),
                 "message": str(receipt.get("message", "")), "previous": prior["id"] if prior else None}, actor, job["id"])
            return {"result": saved, "inventory": record}
    except (zipfile.BadZipFile, UnicodeError, json.JSONDecodeError, KeyError, ValueError) as exc:
        problem(str(exc), "DNN_RETURN")

def _monitoring(ws, db, p, actor):
    site = _site(ws, db, p.get("site_id"))
    source = ws._file_row(db, p.get("source_file_id"))
    ws._verify_file(source)
    begin, end = instant(p.get("started_at"), "coverage start"), instant(p.get("ended_at"), "coverage end")
    if end <= begin:
        problem("Monitoring coverage must have a positive original interval.")
    kind = p.get("source_kind")
    if kind not in ("provider", "manual"):
        problem("Select the original provider measurement or a manual incident interval.")
    try:
        observed = Decimal(str(p.get("monitored_seconds")))
        unavailable = Decimal(str(p.get("unavailable_seconds")))
        window = Decimal(str((end - begin).total_seconds()))
        if not observed.is_finite() or not unavailable.is_finite() or not 0 < observed <= window or not 0 <= unavailable <= observed:
            raise ValueError()
    except (InvalidOperation, ValueError, TypeError):
        problem("Observed seconds must fit the actual interval; unavailable seconds must fit the observed seconds.")
    value = {"site_id": site["site_id"], "source_file": source, "source_kind": kind,
             "started_at": stamp(begin), "ended_at": stamp(end),
             "monitored_seconds": str(observed), "unavailable_seconds": str(unavailable),
             "notes": text(p.get("notes", ""), 16000, True)}
    rows = _objects(ws, db, "dnn_monitoring")
    supersedes = p.get("supersedes_id") or None
    if supersedes:
        original = _get(ws, db, "dnn_monitoring", supersedes)
        if original["site_id"] != site["site_id"] or original["source_kind"] != kind:
            problem("A coverage correction must remain attached to its original site and measurement type.")
        value["supersedes"] = supersedes
    identity = digest(value)
    for prior in rows:
        # Older retained editions hashed their values before adding supersedes.
        # Compare the complete selected input as well, preserving their original records.
        if prior.get("supersedes") == supersedes and (
                prior["measurement_sha256"] == identity
                or digest({key: prior.get(key) for key in value}) == identity):
            return {"monitoring": prior, "replayed": True}
    replaced = {row.get("supersedes") for row in rows if row.get("supersedes")}
    if supersedes in replaced:
        problem("This measurement was already corrected. Select the current correction.", "DNN_COVERAGE", 409)
    for prior in rows:
        if prior["id"] in replaced or prior["id"] == supersedes:
            continue
        if prior["site_id"] == site["site_id"] and prior["source_kind"] == kind and (
                prior["source_file"]["sha256"] == source["sha256"] and prior["started_at"] == value["started_at"]
                and prior["ended_at"] == value["ended_at"]):
            problem("This exact source interval is already retained. Select its current measurement when recording a correction.", "DNN_COVERAGE", 409)
    value["measurement_sha256"] = identity
    return {"monitoring": _new(ws, db, "dnn_monitoring", value, actor, site["site_id"])}

def _coverage(rows, site_id, begin, end):
    replaced = {x.get("supersedes") for x in rows if x.get("supersedes")}
    selected = [x for x in rows if x["id"] not in replaced and x["site_id"] == site_id
                and instant(x["started_at"], "coverage") < end and instant(x["ended_at"], "coverage") > begin]
    provider = [x for x in selected if x["source_kind"] == "provider"
                and instant(x["started_at"], "coverage") >= begin and instant(x["ended_at"], "coverage") <= end]
    ordered = sorted(provider, key=lambda x: x["started_at"])
    overlap = any(instant(b["started_at"], "coverage") < instant(a["ended_at"], "coverage")
                  for a, b in zip(ordered, ordered[1:]))
    crossing = [x["id"] for x in selected if x["source_kind"] == "provider" and x not in provider]
    observed = sum((Decimal(x["monitored_seconds"]) for x in provider), Decimal(0))
    unavailable = sum((Decimal(x["unavailable_seconds"]) for x in provider), Decimal(0))
    month_seconds = Decimal(str((end - begin).total_seconds()))
    comparable = bool(provider) and not overlap
    return {"site_id": site_id, "records": selected, "overlapping_provider_intervals": overlap,
            "cross_month_source_ids": crossing, "period_seconds": str(month_seconds),
            "measured_seconds": str(observed) if comparable else None,
            "unavailable_seconds": str(unavailable) if comparable else None,
            "coverage_percent": str(observed / month_seconds * 100) if comparable else None,
            "measured_availability_percent": str((observed - unavailable) / observed * 100) if comparable else None,
            "explanation": ("Provider intervals overlap; each original measurement is retained separately."
                            if overlap else "Provider measurements are combined only over their observed, non-overlapping intervals."
                            if comparable else "No complete provider interval in this month supplies an availability denominator."),
            "cross_month_explanation": "Cross-month totals remain separate until the provider supplies the selected month's actual measurements." if crossing else ""}

def _report(ws, db, p, actor):
    from govhub import now
    import re
    label = text(p.get("label", ""), 500, True)
    period = text(p.get("period", ""), 7, True)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
        problem("Use the service reporting month YYYY-MM.")
    year, month = map(int, period.split("-"))
    try:
        begin = datetime(year, month, 1, tzinfo=timezone.utc)
        end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=timezone.utc)
    except ValueError:
        problem("Use a supported calendar reporting month.")
    sites = _latest(ws, db, "dnn_site", "site_id")
    selected = p.get("site_ids", list(sites))
    if not isinstance(selected, list) or not selected or len(selected) != len(set(selected)) or any(x not in sites for x in selected):
        problem("Choose each actual reporting site once.")
    tickets = [x for x in _latest(ws, db, "dnn_ticket", "ticket_id").values() if x["site_id"] in selected]
    outcomes = {x["job_id"]: x for x in _objects(ws, db, "dnn_result")}
    jobs = [dict(x, result=outcomes.get(x["id"])) for x in _objects(ws, db, "dnn_job")
            if x["site_id"] in selected and (str((outcomes.get(x["id"]) or {}).get("finished_at") or x["created_at"]).startswith(period))]
    inventories = [x for x in _objects(ws, db, "dnn_inventory") if x["site_id"] in selected]
    coverage = [_coverage(_objects(ws, db, "dnn_monitoring"), site, begin, end) for site in selected]
    incidents = []
    for ticket in tickets:
        start = instant(ticket.get("incident_started_at"), "incident", True)
        finish = instant(ticket.get("incident_ended_at"), "incident", True)
        if start and start < end and (not finish or finish > begin):
            incidents.append({"ticket_id": ticket["ticket_id"], "site_id": ticket["site_id"],
                "external_reference": ticket["external_reference"], "started_at": stamp(start), "ended_at": stamp(finish),
                "recorded_seconds_in_month": str((min(finish, end) - max(start, begin)).total_seconds()) if finish else None,
                "basis": "Recorded incident timestamps; separate from provider monitoring coverage."})
    report = {"schema": SCHEMA, "label": label, "period": period, "generated_at": now(),
              "workspace": ws.meta(db)["workspace"], "sites": [sites[x] for x in selected],
              "requests": tickets, "request_basis": "Current saved service queue at report generation.",
              "native_operations": jobs, "inventories": inventories, "monitoring_coverage": coverage,
              "manual_incidents": incidents,
              "summary": text(p.get("summary", ""), 24000, True),
              "support_handoff": text(p.get("support_handoff", ""), 16000), "sources": DOCS}
    esc = html.escape
    def cell(value):
        return esc(str(value if value is not None else "—"))
    def table(headers, rows):
        return "<table><thead><tr>" + "".join("<th>" + cell(x) + "</th>" for x in headers) + "</tr></thead><tbody>" + "".join(
            "<tr>" + "".join("<td>" + cell(x) + "</td>" for x in row) + "</tr>" for row in rows) + "</tbody></table>"
    body = '<!doctype html><html lang="en"><meta charset="utf-8"><title>' + esc(label) + '</title>'
    body += '<style>body{font:15px/1.5 system-ui;color:#202020;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:28px}h2{font-size:19px;margin-top:30px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px;text-align:left;overflow-wrap:anywhere}pre{white-space:pre-wrap}.meta{color:#555}@media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style>'
    body += "<h1>" + esc(label) + "</h1><p class=meta>" + esc(period) + " · Generated " + esc(report["generated_at"]) + "</p>"
    body += "<h2>Service summary</h2><pre>" + esc(report["summary"]) + "</pre><h2>Sites</h2><ul>"
    body += "".join("<li>" + esc(sites[x]["label"] + " · " + sites[x]["environment"] + " · " + sites[x]["url"]) + "</li>" for x in selected) + "</ul>"
    body += "<h2>Measured service availability</h2><p>Availability applies to observed provider seconds. The calendar coverage percentage identifies the measured share of the month.</p>"
    body += table(["Site", "Observed seconds", "Unavailable seconds", "Month coverage %", "Measured availability %"],
                  [(sites[x["site_id"]]["label"], x["measured_seconds"], x["unavailable_seconds"],
                    str(round(Decimal(x["coverage_percent"]), 4)) if x["coverage_percent"] else None,
                    str(round(Decimal(x["measured_availability_percent"]), 4)) if x["measured_availability_percent"] else None) for x in coverage])
    for item in coverage:
        body += "<p>" + esc(sites[item["site_id"]]["label"] + ": " + item["explanation"] + " " + item["cross_month_explanation"]) + "</p>"
    body += "<h2>Recorded incidents</h2>" + table(["Client reference", "Site", "Started", "Restored", "Recorded seconds in month"],
        [(x["external_reference"], sites[x["site_id"]]["label"], x["started_at"], x["ended_at"], x["recorded_seconds_in_month"]) for x in incidents])
    body += "<h2>Current service queue</h2>" + table(["Client reference", "Request", "Owner", "State"],
        [(x["external_reference"], x["title"], x["owner"], x["status"]) for x in tickets])
    body += "<h2>Native maintenance and paired recovery in this month</h2>" + table(
        ["Original operation", "Site", "Action", "Native state", "Finished", "Backup pair"],
        [(x["id"], sites[x["site_id"]]["label"], x["action"], (x["result"] or {}).get("status", "prepared"),
          (x["result"] or {}).get("finished_at"), ((x["result"] or {}).get("native", {}).get("backup") or {}).get("pair_id")) for x in jobs])
    body += "<h2>Support handover</h2><pre>" + esc(report["support_handoff"]) + "</pre></html>"
    with tempfile.TemporaryDirectory(prefix="dnn-report-", dir=ws.root) as directory:
        path = Path(directory) / ("DNN_Service_Report_" + period + ".zip")
        csv_text = io.StringIO()
        writer = csv.DictWriter(csv_text, fieldnames=["ticket_id", "external_reference", "title", "owner", "priority", "status",
            "incident_started_at", "incident_ended_at", "resolution"], extrasaction="ignore")
        writer.writeheader()
        writer.writerows({k: ("'" + str(v) if str(v).lstrip().startswith(("=", "+", "-", "@")) else v)
                          for k, v in row.items()} for row in tickets)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Service_Report.html", body)
            archive.writestr("Service_Requests.csv", csv_text.getvalue())
            archive.writestr("Complete_Service_Record.json", canonical(report))
            for source in {x["source_file"]["id"]: x["source_file"] for row in coverage for x in row["records"]}.values():
                with ws._verify_file(source).open("rb") as stream:
                    _copy_to_zip(archive, "monitoring-sources/" + source["id"] + "/" + source["filename"],
                                 stream, source["sha256"], source["bytes"])
        saved = ws._register(db, path, path.name, actor, "Evidence", label)
    return {"report": _new(ws, db, "dnn_report",
        {"label": label, "period": period, "site_ids": selected, "file": saved,
         "request_count": len(tickets), "native_operation_count": len(jobs),
         "coverage": [{k: v for k, v in item.items() if k != "records"} for item in coverage]}, actor)}

def dispatch(ws, action, payload, user):
    actor = ws._authorize(user)
    if not isinstance(payload, dict):
        problem("Supply one JSON action object.")
    if action == "snapshot":
        return snapshot(ws)
    handlers = {"site.save": _site_save, "ticket.save": _ticket_save, "package.inspect": _inspect_package,
                "release.save": _release_save, "review.save": _review, "job.create": _job_create,
                "job.export": _job_export, "job.receive": _receive, "report.create": _report, "monitoring.save": _monitoring}
    if action == "sources.retain":
        return ws._sources_retain(payload, actor)
    if action == "sources.list":
        return ws._sources_list()
    if action == "workspace.export":
        ws._authorize(actor, "admin")
        from .delivery import export_action
        return export_action(ws, ROOT.parent, payload, actor)
    if action == "workspace.backup":
        ws._authorize(actor, "admin")
        return ws.backup(payload.get("destination", ""))
    if action not in handlers:
        problem("Choose a displayed DNN desk action.", "DNN_ACTION", 404)
    with ws.connect(write=True) as db:
        keyed = dict(payload, dnn_action=action)
        key, fingerprint, previous = ws._request(db, keyed, actor)
        if previous is not None:
            return previous
        result = handlers[action](ws, db, payload, actor)
        ws._remember(db, key, fingerprint, result, actor)
        ws._changed(db, actor, "DNN " + action, details={"request_key": key})
        return result
