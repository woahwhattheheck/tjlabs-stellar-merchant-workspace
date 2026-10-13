#!/usr/bin/env python3
"""Operate one original GovHub commissioning Content Packages workshare through GovHub."""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import tempfile

OP = "GOVHUB-CONTENT-PACKAGES-COMMISSIONING-V1"
ROOT_UUID = "5cac3f15-ec81-4f2e-8e87-691645eb6850"
FINAL = {"COMPLETE", "FAILED", "WAITING_NATIVE", "PAUSED", "CANCELLED"}

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def read(path):
    return json.loads(Path(path).read_bytes())

def publish(path, raw, *, replace):
    """Publish complete bytes and remove only the temporary file created here."""
    descriptor, name = tempfile.mkstemp(prefix="." + path.name + ".writing-", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def immutable(path, value):
    path = Path(path)
    raw = value if isinstance(value, bytes) else (canonical(value) + "\n").encode()
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != raw:
            raise ValueError("Different original data occupies " + str(path))
        return
    publish(path, raw, replace=False)

def current(path, value):
    path = Path(path)
    publish(path, (canonical(value) + "\n").encode(), replace=True)

@contextmanager
def controller(root):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(root / "controller.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield
    finally:
        os.close(descriptor)

class Operator:
    def __init__(self, args, workspace, actor):
        self.args, self.workspace, self.actor = args, workspace, actor
        self.root = args.out
        self.requests = self.root / "requests"
        self.requests.mkdir(mode=0o700, exist_ok=True)

    def progress(self, stage, **values):
        value = {"operation": OP, "stage": stage, "at": now(), **values}
        current(self.root / "operator-progress.json", value)
        print(json.dumps(value), flush=True)

    def call(self, label, action, payload):
        """Resume the original accepted application request without rebuilding it."""
        request = {"action": action, "payload": {"request_key": OP + "/" + label, **payload}}
        intent_path = self.requests / (label + ".request.json")
        result_path = self.requests / (label + ".result.json")
        if intent_path.exists():
            original = read(intent_path)
            if original["action"] != action:
                raise ValueError("The original action changed: " + label)
            request = original
        else:
            immutable(intent_path, request)
        if result_path.exists():
            return read(result_path)
        result = self.workspace.dispatch(request["action"], request["payload"], self.actor)
        immutable(result_path, result)
        return result

    def get(self, operation_id):
        return self.workspace.dispatch("packages.operations.get", {"operation_id": operation_id}, self.actor)["operation"]

    def wait(self, operation_id, accepted=("COMPLETE",)):
        deadline = time.monotonic() + self.args.timeout
        while time.monotonic() < deadline:
            value = self.get(operation_id)
            if value["state"] in FINAL:
                if value["state"] not in accepted:
                    current(self.root / "original-operation-followup.json", value)
                    raise ValueError("Original operation " + operation_id + " requires its retained continuation: " + value["state"] + " " + str(value.get("error")))
                return value
            time.sleep(.25)
        current(self.root / "original-operation-followup.json", self.get(operation_id))
        raise TimeoutError("The same native operation is still queued or running: " + operation_id)

    def native(self, value):
        return (value.get("native_result") or {}).get("observations", {}).get("package_result", {})

    def queue(self, label, action, payload, accepted=("COMPLETE",)):
        created = self.call(label, action, payload)
        self.progress(label, operation_id=created["operation"]["id"])
        return self.wait(created["operation"]["id"], accepted)

    def seed(self, role, edition, profile, site_uuid):
        import native_adapter as native
        directory = self.root / "native-source" / (role + "-" + edition)
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        source = Path(__file__).with_name("seed-native.php")
        raw = source.read_bytes()
        script = directory / ("seed-" + sha(raw)[:16] + ".php")
        immutable(script, raw)
        request = {"schema": "govhub.commissioning.native-case.v1", "operation": OP,
                   "role": role, "edition": edition, "site_uuid": site_uuid}
        input_path = directory / "source-input.json"
        immutable(input_path, request)
        session = native.Session(native._profile(profile), directory)
        state_path = directory / "native-state.json"
        if state_path.is_file():
            session.state = session.read_private_json(state_path)
        for record in directory.glob("seed-*.command.json"):
            prior = read(record)
            if prior.get("phase") not in {"complete", "not_started"} and not (
                    prior.get("phase") == "interrupted" and prior.get("owned_process_reaped") is True):
                raise ValueError("Reconcile this original owned source command before continuing: " + str(record))
        record = session.command("seed-" + sha(raw)[:16],
            native._prefix(session.p) + ["php:script", script.stem, "--script-path=" + str(directory),
                                       "--", str(input_path)], mutating=True)
        result = json.loads(Path(record["stdout"]["path"]).read_bytes())
        if result.get("site_uuid") != site_uuid or result.get("role") != role or result.get("edition") != edition:
            raise ValueError("The original native source result belongs to another site or edition.")
        immutable(directory / "source-result.json", result)
        self.progress("original-source-" + role + "-" + edition,
                      site_uuid=site_uuid, root_uuid=result["root"]["uuid"])
        return result

    def environment(self, role, profile):
        identity = "govhub_commissioning-" + role + "-20261012"
        with self.workspace.connect(snapshot=True) as db:
            exists = db.execute("SELECT 1 FROM entities WHERE kind='environments' AND id=?", (identity,)).fetchone()
        if exists:
            row = self.workspace.record("environments", identity)
            if row["data"]["provider_resource_id"] != profile["environment_id"]:
                raise ValueError("The existing source environment has another native identity.")
        else:
            row = self.workspace.save("environments", identity, {
                "data": {"name": "GovHub commissioning " + role, "provider": "Drupal native",
                         "purpose": "Rehearsal", "provider_resource_id": profile["environment_id"],
                         "canonical_url": profile["uri"], "owner": "GovHub commissioning receiving engineer",
                         "authorization_reference": OP,
                         "notes": "Independently owned native receiving site; original Drupal and Content Packages interfaces."},
                "note": "Original source-backed GovHub commissioning receiving environment."}, self.actor)
        label = "configure-" + role
        result_path = self.requests / (label + ".result.json")
        intent_path = self.requests / (label + ".request.json")
        if result_path.exists():
            configured = read(result_path)
        else:
            # This maintained action uses a revision guard, not request-key replay.
            # Read its committed profile before repeating an interrupted reply.
            with self.workspace.connect(snapshot=True) as db:
                stored = db.execute("SELECT revision,data FROM govhub_config WHERE environment_id=?", (identity,)).fetchone()
                current_environment = self.workspace._record_db(db, "environments", identity)
            existing = json.loads(stored["data"]) if stored else None
            if intent_path.exists() and existing is not None and all(existing.get(key) == value for key, value in profile.items()):
                configured = {"environment": current_environment,
                              "profile": {"revision": stored["revision"], "config": existing}}
                immutable(result_path, configured)
            else:
                configured = self.call(label, "operations.configure",
                    {"environment_id": identity, "expected_revision": row["revision"], "config": profile})
        actual = configured["profile"]["config"]
        if any(actual.get(key) != value for key, value in profile.items()):
            raise ValueError("The original configured environment differs.")
        with self.workspace.connect(snapshot=True) as db:
            selected = db.execute("SELECT data FROM govhub_config WHERE environment_id=?", (identity,)).fetchone()
            latest_environment = self.workspace._record_db(db, "environments", identity)
        latest_profile = json.loads(selected["data"]) if selected else None
        if latest_profile is None or any(latest_profile.get(key) != value for key, value in profile.items()):
            raise ValueError("The selected original site profile changed; reconcile that same environment.")
        if latest_environment["data"]["provider_resource_id"] != profile["environment_id"]:
            raise ValueError("The original environment now names another native site.")
        return latest_environment

    def retain_source(self, label, filename, raw):
        """Use original source intake and reconcile any already committed file."""
        if not isinstance(raw, bytes):
            raw = (canonical(raw) + "\n").encode()
        digest = sha(raw)
        name = label + "-" + digest[:16] + "-" + filename
        original = self.args.source_root / name
        immutable(original, raw)
        source_label = OP + "/" + label + "/" + digest
        with self.workspace.connect(snapshot=True) as db:
            rows = db.execute("SELECT * FROM files WHERE sha256=? AND bytes=? AND filename=? AND source_label=? AND author=? ORDER BY created_at,id",
                (digest, len(raw), name, source_label, self.actor["name"])).fetchall()
        if rows:
            result = dict(rows[0])
            self.workspace._verify_file(result)
        else:
            result = self.workspace.dispatch("sources.retain", {"path": name,
                "category": "Evidence", "source_label": source_label}, self.actor)
        immutable(self.requests / ("source-" + label + "-" + digest + ".json"), result)
        return result

    def retain_operating_source(self, handoff):
        directory = Path(__file__).resolve().parent
        result = {"native_sites": self.retain_source("native-sites", "profiles.json", handoff)}
        for name in ("operate-native.py", "seed-native.php", "govhub_receiving_boundary.module",
                     "govhub_receiving_boundary.info.yml", "OPERATE.md"):
            result[name] = self.retain_source("operating-source", name, (directory / name).read_bytes())
        for source in sorted((self.root / "native-source").glob("*/source-result.json")):
            role = source.parent.name
            result[role] = self.retain_source(role, "source-result.json", source.read_bytes())
        return result

    def native_phase(self, handoff):
        source, destination = handoff["source"], handoff["destination"]
        if source["site_uuid"] == destination["site_uuid"]:
            raise ValueError("Choose the independently owned source and destination sites.")
        source_profile, destination_profile = source["profile"], destination["profile"]
        for profile in (source_profile, destination_profile):
            if profile.get("source_kind") != "drush":
                raise ValueError("Use the actual installed Drupal/Drush site profiles.")
        self.seed("destination", "initial", destination_profile, destination["site_uuid"])
        seeded = self.seed("source", "initial", source_profile, source["site_uuid"])
        operating_source = self.retain_operating_source(handoff)
        source_environment = self.environment("source", source_profile)
        destination_environment = self.environment("destination", destination_profile)
        family = self.call("family", "packages.families.save", {
            "label": "GovHub commissioning community-service content receiving",
            "owner": "GovHub commissioning receiving engineer",
            "environment_id": destination_environment["id"],
            "source_environment_id": source_environment["id"],
            "comparison_id": "govhub_commissioning-content-migration-workshare-20261012",
            "plan_ids": handoff.get("plan_ids", []),
            "notes": "Original Drupal graph: bilingual root, linked guidance, taxonomy and attachment. The first archive is returned, corrected at its original source, compared and reviewed for native receiving.",
            "recovery_instruction": "Read or resume the original import operation. The source-inclusive handover and private workspace backup retain every edition, decision, native command and source file; any whole-site restoration uses the selected original site backup."})["family"]
        family_id = family["id"]
        actual_family = self.workspace.dispatch("packages.families.get", {"family_id": family_id}, self.actor)["family"]
        for key in ("environment_id", "source_environment_id", "comparison_id", "plan_ids"):
            if actual_family[key] != family[key]:
                raise ValueError("The original content workshare changed its " + key + "; reconcile that same family.")
        self.workspace.start_worker()
        try:
            first_export = self.queue("export-original", "packages.exports.create", {
                "family_id": family_id, "roots": [seeded["root"]],
                "options": {"package_type": "content_entity", "max_depth": 20, "unpublished": True},
                "reason": "Retain the complete original source graph for editorial review."})
            first_edition = self.call("edition-original", "packages.editions.create", {
                "family_id": family_id, "export_operation_id": first_export["id"],
                "label": "Original source schedule", "notes": "Original native export before the receiving-hours correction."})["edition"]
            first_preview = self.queue("preview-original", "packages.previews.create", {
                "family_id": family_id, "edition_id": first_edition["id"],
                "reason": "Review this original archive on its selected destination."})
            first_view = self.workspace.dispatch("packages.previews.get", {"preview_operation_id": first_preview["id"]}, self.actor)
            returned = self.call("return-original", "packages.reviews.save", {
                "preview_operation_id": first_preview["id"], "preview_sha256": first_view["preview_file"]["sha256"],
                "expected_review_id": "", "decision": "RETURN",
                "reason": "Correct the draft receiving hours in both languages and the attachment, and include the accessible-appointment guidance."})["review"]
            corrected_source = self.seed("source", "corrected", source_profile, source["site_uuid"])
            operating_source["source-corrected"] = self.retain_source("source-corrected", "source-result.json", corrected_source)
            second_export = self.queue("export-corrected", "packages.exports.create", {
                "family_id": family_id, "roots": [seeded["root"]],
                "options": {"package_type": "content_entity", "max_depth": 20, "unpublished": True},
                "reason": "Retain the corrected original Drupal graph as a new edition."})
            second_edition = self.call("edition-corrected", "packages.editions.create", {
                "family_id": family_id, "export_operation_id": second_export["id"],
                "previous_edition_id": first_edition["id"], "label": "Reviewed receiving hours and access guidance",
                "notes": "Corrected at the original source; includes both languages and complete native attachment bytes."})["edition"]
            second_preview = self.queue("preview-corrected", "packages.previews.create", {
                "family_id": family_id, "edition_id": second_edition["id"],
                "reason": "Review the corrected graph against the same original destination."})
            second_view = self.workspace.dispatch("packages.previews.get", {"preview_operation_id": second_preview["id"]}, self.actor)
            comparison = self.call("compare-original-corrected", "packages.comparisons.create", {
                "baseline_preview_operation_id": first_preview["id"],
                "candidate_preview_operation_id": second_preview["id"]})["comparison"]
            if second_view["preview"]["issues"]:
                raise ValueError("The actual corrected native preview has issues: " + canonical(second_view["preview"]["issues"]))
            if not comparison["counts"]["CHANGED"] or not comparison["counts"]["ADDED"]:
                raise ValueError("The retained native comparison did not contain the original corrected and added source content.")
            approved = self.call("approve-corrected", "packages.reviews.save", {
                "preview_operation_id": second_preview["id"], "preview_sha256": second_view["preview_file"]["sha256"],
                "expected_review_id": "", "comparison_id": comparison["id"], "decision": "APPROVE",
                "reason": "Reviewed the complete corrected source, both languages, linked guidance, native attachment changes and destination-owned publication."})["review"]
            boundary = self.root / "original-native-boundary.json"
            immutable(boundary, {"operation": OP, "site_uuid": destination["site_uuid"], "root_uuid": ROOT_UUID})
            original_env = os.environ.get("GOVHUB_RECEIVING_BOUNDARY")
            os.environ["GOVHUB_RECEIVING_BOUNDARY"] = str(boundary)
            try:
                created = self.call("import-reviewed", "packages.imports.create", {
                    "family_id": family_id, "edition_id": second_edition["id"], "review_id": approved["id"],
                    "reason": "Apply this exact reviewed native edition, retaining the original import identity through its controlled shutdown and recovery."})
                imported = self.wait(created["operation"]["id"], tuple(FINAL))
                interrupt_record = self.root / "native-shutdown-observed.json"
                if not interrupt_record.exists():
                    consumed = Path(str(boundary) + ".consumed")
                    if imported["state"] == "COMPLETE" or not consumed.is_file():
                        raise ValueError("The original native boundary module did not reach the selected first import shutdown.")
                    native_status = self.queue("read-uncommitted-original", "packages.receiving.create", {
                        "family_id": family_id, "import_operation_id": imported["id"],
                        "reason": "Read the original import receipt after its actual pre-commit shutdown."})
                    if self.native(native_status).get("receiving", {}).get("status") != "NO_COMMITTED_IMPORT_RECEIPT":
                        raise ValueError("The interrupted native import unexpectedly retained a committed receipt.")
                    after_rollback = self.queue("preview-after-original-shutdown", "packages.previews.create", {
                        "family_id": family_id, "edition_id": second_edition["id"],
                        "reason": "Read the original destination after the actual import rollback."})
                    observed = self.native(after_rollback)["preview"]
                    expected = second_view["preview"]
                    if observed["before_sha256"] != expected["before_sha256"] or observed["target_sha256"] != expected["target_sha256"]:
                        raise ValueError("The actual native shutdown did not preserve the reviewed original destination.")
                    immutable(interrupt_record, {"import_operation_id": imported["id"],
                        "native": imported, "boundary": read(consumed),
                        "receipt_read": native_status, "rollback_preview": after_rollback,
                        "same_original_destination": True})
                if imported["state"] != "COMPLETE":
                    resumed = self.call("resume-original-import", "operations.resume", {
                        "operation_id": imported["id"], "expected_revision": imported["revision"],
                        "reason": "Continue the same original import after its positively completed native shutdown and verified rollback."})
                    imported = self.wait(resumed["operation"]["id"])
            finally:
                if original_env is None:os.environ.pop("GOVHUB_RECEIVING_BOUNDARY", None)
                else:os.environ["GOVHUB_RECEIVING_BOUNDARY"] = original_env
            native = self.native(imported)
            if native.get("receiving", {}).get("status") != "MATCHES_SAVED_IMPORT":
                raise ValueError("The original applied native receipt and current content differ.")
            after = native["receipt"]["after"]
            root_after = after["node:" + ROOT_UUID]
            translations = root_after["translations"]
            if translations["en"]["published"] is not True or translations["es"]["published"] is not False:
                raise ValueError("The original destination-owned English publication or newly received Spanish draft differs.")
            publication = {language: {"published": value["published"],
                                      "moderation_state": value["moderation_state"]}
                           for language, value in translations.items()}
            for name in ("guide", "accessibility", "topic"):
                kind = "taxonomy_term" if name == "topic" else "node"
                if not after[kind + ":" + corrected_source["identities"][name]]["exists"]:
                    raise ValueError("The native imported graph omits its original " + name + " identity.")
            document = root_after["linked_assets"]["file:" + corrected_source["identities"]["document"]]
            if (document["bytes"], document["sha256"]) != (corrected_source["asset"]["bytes"], corrected_source["asset"]["sha256"]):
                raise ValueError("The received attachment differs from the corrected original source bytes.")
            replay_request = read(self.requests / "import-reviewed.request.json")
            replay = self.workspace.dispatch(replay_request["action"], replay_request["payload"], self.actor)
            if replay["operation"]["id"] != imported["id"]:
                raise ValueError("The same application request created another native import.")
            received = self.queue("read-applied-original", "packages.receiving.create", {
                "family_id": family_id, "import_operation_id": imported["id"],
                "reason": "Read the completed original import through the receiving operator."})
            if self.native(received).get("receiving", {}).get("status") != "MATCHES_SAVED_IMPORT":
                raise ValueError("The receiving read did not recover the original matching import.")
            outcome = {"schema": "govhub.commissioning.native-operation.v1", "operation": OP,
                "completed_at": now(), "family_id": family_id,
                "original_export_id": first_export["id"], "original_edition_id": first_edition["id"],
                "returned_review_id": returned["id"], "corrected_export_id": second_export["id"],
                "corrected_edition_id": second_edition["id"], "comparison_id": comparison["id"],
                "comparison_counts": comparison["counts"], "review_id": approved["id"],
                "import_operation_id": imported["id"], "native_receiving_operation_id": received["id"],
                "import_state": native["import_state"], "receipt": native["receipt"],
                "destination_publication": publication,
                "receiving": self.native(received)["receiving"],
                "repeated_request_operation_id": replay["operation"]["id"],
                "native_shutdown": read(self.root / "native-shutdown-observed.json"),
                "source_seed": seeded, "corrected_source_seed": corrected_source,
                "operating_source": operating_source}
            outcome["shutdown_source"] = self.retain_source("native-shutdown", "native-shutdown-observed.json",
                (self.root / "native-shutdown-observed.json").read_bytes())
            immutable(self.root / "operator-native-result.json", outcome)
            self.progress("NATIVE_CONTENT_RECEIVED", family_id=family_id,
                          import_operation_id=imported["id"], comparison_counts=comparison["counts"])
            return outcome
        finally:
            self.workspace.stop_worker()
            if self.workspace._worker and self.workspace._worker.is_alive():
                self.workspace._worker.join(timeout=10)
            if self.workspace._worker and self.workspace._worker.is_alive():
                raise RuntimeError("The original native worker still owns its command; retain this controller for reconciliation.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application-root", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--username", default="govhub_commissioning-engineer")
    parser.add_argument("--password-env", default="GOVHUB_PASSWORD")
    parser.add_argument("--phase", choices=("native", "receive"), required=True)
    parser.add_argument("--application-zip", type=Path)
    parser.add_argument("--application-sha256")
    parser.add_argument("--module-archive", type=Path)
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    os.umask(0o077)
    for path in (args.application_root, args.profiles, args.workspace, args.source_root, args.out):
        if not path.is_absolute() or path.is_symlink():
            raise ValueError("Use the original absolute source, profile and operation paths.")
    args.source_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    sys.path.insert(0, str(args.application_root / "workspace"))
    from govhub import open_workspace
    handoff = read(args.profiles)
    if handoff.get("schema") != "govhub.commissioning.native-sites.v1" or handoff.get("operation") != OP:
        raise ValueError("Use the original selected GovHub commissioning native sites.")
    secret = os.environ.get(args.password_env)
    if not secret or len(secret) < 12:
        raise ValueError("The existing original engineer password environment is required.")
    with controller(args.out):
        immutable(args.out / "native-sites.json", handoff)
        scope = {"operation": OP, "workspace": str(args.workspace),
                 "source_root": str(args.source_root), "username": args.username, "mode": "PILOT"}
        initialization_path = args.out / "workspace-initialization.json"
        if initialization_path.exists():
            initialization = read(initialization_path)
            if any(initialization.get(key) != value for key, value in scope.items()):
                raise ValueError("The original private workspace initialization belongs to another case.")
        else:
            initialization = {**scope, "new_workspace": not (args.workspace / "assessment.sqlite3").exists()}
            immutable(initialization_path, initialization)
        missing_storage = any(not (args.workspace / name).exists()
                              for name in ("assessment.sqlite3", "sources", "reconciliation.key"))
        create = bool(initialization["new_workspace"] and missing_storage)
        workspace = open_workspace(args.workspace, args.source_root, create=create,
                                   name="GovHub commissioning Content Packages receiving", mode="PILOT")
        if not workspace.user(args.username):
            with workspace.connect(snapshot=True) as db:
                accounts = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if not initialization["new_workspace"] or accounts:
                raise ValueError("Use the existing original workspace administrator.")
            workspace.add_user(args.username, secret, "admin")
        actor = workspace.authenticate(args.username, secret)
        if not actor:
            raise ValueError("The retained original engineer account was not recognized.")
        operation = Operator(args, workspace, actor)
        try:
            if args.phase == "native":
                final = args.out / "operator-native-result.json"
                if final.exists():
                    outcome = read(final)
                    original = operation.get(outcome["import_operation_id"])
                    if original["state"] != "COMPLETE":
                        raise ValueError("The saved original import requires its existing continuation.")
                    print(json.dumps({"phase": "REOPENED_ORIGINAL_NATIVE_OPERATION", "result": outcome}), flush=True)
                else:
                    with workspace.service_lease():
                        outcome = operation.native_phase(handoff)
                    print(json.dumps({"phase": "ORIGINAL_NATIVE_OPERATION_COMPLETE", "result": outcome}), flush=True)
            else:
                if not args.application_zip or not args.application_sha256 or not args.module_archive:
                    raise ValueError("Complete receiving requires the original application ZIP, its SHA and upstream module archive.")
                outcome = read(args.out / "operator-native-result.json")
                from content_packages.receiving import receive
                receiving = argparse.Namespace(
                    workspace=args.workspace, source_root=args.source_root,
                    assessment_core=args.application_root / "workspace/vendor/assessment-core",
                    username=args.username, password_env=args.password_env, password_stdin=False,
                    operation_key="govhub_commissioning-original-customer-20261012",
                    family_id=[outcome["family_id"]], import_operation_id=[outcome["import_operation_id"]],
                    application_zip=str(args.application_zip), application_sha256=args.application_sha256,
                    module_archive=str(args.module_archive), destination=str(args.out / "customer-receiving"),
                    name="GovHub commissioning Content Packages complete engineer handover", timeout=args.timeout)
                delivered = receive(receiving)
                repeated = receive(receiving)
                if canonical(delivered) != canonical(repeated):
                    raise ValueError("The repeated original receiving operation changed its completed result.")
                immutable(args.out / "operator-customer-result.json", delivered)
                operation.progress("COMPLETE_CUSTOMER_RECEIVING_REOPENED",
                                   family_id=outcome["family_id"], delivery=delivered["delivery"])
                print(json.dumps({"phase": "ORIGINAL_CUSTOMER_RECEIVING_COMPLETE", "result": delivered}), flush=True)
        finally:
            workspace.stop_worker()
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"operation": OP, "error": str(error), "type": type(error).__name__}), file=sys.stderr, flush=True)
        raise SystemExit(2)
