#!/usr/bin/env python3
"""Operate the original GovHub/Tome build and static-release workspace end to end."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import importlib
import json
import os
from pathlib import Path
import secrets
import shutil
import stat
import sys
import tarfile
import time
import uuid
import zipfile

SOURCE_COMMIT = None
TOME_ARCHIVE_SHA256 = "a762990bf2c1fc9111db14fa537ab60db84499ce5130824dc217aae98dd63bfe"
ENVIRONMENT = "govhub-tome-commissioning"
AUTHORIZATION = "Explicit operator-selected dedicated site commissioning; retain the authorization reference in the native input."
CONTENT_SOURCE = "https://www.mobomo.com/2025/09/the-best-drupal-is-no-drupal-site-generation-with-tome-and-microservices"

def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n").encode("utf-8")

def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def retain(path, value):
    path = Path(path)
    data = json_bytes(value)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != data:
            raise RuntimeError("Reopen the retained original input: " + str(path))
        return value
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return value

def read(path):
    return json.loads(Path(path).read_bytes())

def progress(root, stage, **details):
    value = {"schema": "tjl.govhub-tome-journey-progress.v1",
             "stage": stage, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **details}
    directory = Path(root) / "progress"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    filename = directory / (str(time.time_ns()) + "-" + stage + ".json")
    retain(filename, value)
    print(json.dumps(value), flush=True)

def copy_exact(source, target):
    source, target = Path(source), Path(target)
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    expected = sha(source)
    if target.exists():
        if target.is_symlink() or target.stat().st_size != source.stat().st_size or sha(target) != expected:
            raise RuntimeError("The retained destination names a different original file: " + str(target))
    else:
        with source.open("rb") as incoming, target.open("xb") as outgoing:
            shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        os.chmod(target, 0o600)
    return {"path": str(target), "bytes": target.stat().st_size, "sha256": expected}

def install_tome(site_root, archive, output):
    archive, site_root, output = Path(archive), Path(site_root), Path(output)
    if sha(archive) != TOME_ARCHIVE_SHA256:
        raise RuntimeError("Use the original acquired Tome 1.16 archive.")
    destination = site_root / "modules" / "contrib" / "tome"
    rows = []
    with tarfile.open(archive, "r:gz") as original:
        for member in original.getmembers():
            if member.isdir():
                continue
            parts = Path(member.name).parts
            if not member.isfile() or not parts or parts[0] != "tome" or ".." in parts:
                raise RuntimeError("The original Tome archive includes an unsuitable source member.")
            relative = Path(*parts[1:])
            if not relative.parts or relative.is_absolute():
                raise RuntimeError("The original Tome source member has no local relative path.")
            data = original.extractfile(member).read()
            target = destination / relative
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if target.exists():
                if target.is_symlink() or target.read_bytes() != data:
                    raise RuntimeError("The selected native site already contains a different Tome source: " + str(relative))
            else:
                target.write_bytes(data)
                os.chmod(target, 0o644)
            rows.append({"path": relative.as_posix(), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    retain(output / "tome-source.json", {"schema": "tjl.govhub-tome-source.v1",
        "archive_sha256": TOME_ARCHIVE_SHA256, "native_directory": str(destination), "files": rows})
    return destination

def prepare_settings(site_root, static_directory, output):
    settings = Path(site_root) / "sites" / "default" / "settings.php"
    if settings.is_symlink() or not settings.is_file():
        raise RuntimeError("Use the original dedicated site's ordinary settings.php.")
    before = Path(output) / "settings-before.php"
    if not before.exists():
        copy_exact(settings, before)
    literal = str(Path(static_directory)).replace("\\", "\\\\").replace("'", "\\'")
    addition = ("\n// GovHub/Tome private native operation: original reviewed output.\n"
                "$settings['tome_static_directory'] = '" + literal + "';\n")
    current = settings.read_text()
    if addition not in current:
        if "GovHub/Tome private native operation:" in current:
            raise RuntimeError("The same native site has another selected Tome output directory.")
        mode = stat.S_IMODE(settings.stat().st_mode)
        os.chmod(settings, mode | stat.S_IWUSR)
        with settings.open("a") as stream:
            stream.write(addition)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(settings, mode)
    retain(Path(output) / "tome-settings.json", {
        "path": str(settings), "sha256": sha(settings),
        "static_directory": str(static_directory), "prior_sha256": sha(before)})

CONTENT_PHP = r"""<?php
use Drupal\node\Entity\Node;
use Drupal\node\Entity\NodeType;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\field\Entity\FieldConfig;
use Drupal\Core\Entity\Entity\EntityViewDisplay;
use Drupal\user\Entity\Role;
use Drupal\user\RoleInterface;
$request = json_decode(file_get_contents(getenv('TJL_TOME_CONTENT_REQUEST')), TRUE, 512, JSON_THROW_ON_ERROR);
if (($request['schema'] ?? '') !== 'tjl.govhub-tome-content-request.v1') { throw new \RuntimeException('Select the original content request.'); }
$type = 'tjl_tome_workshare';
if (!NodeType::load($type)) { NodeType::create(['type' => $type, 'name' => 'Tome operating workshare'])->save(); }
if (!FieldStorageConfig::loadByName('node', 'body')) {
  FieldStorageConfig::create(['field_name' => 'body', 'entity_type' => 'node', 'type' => 'text_with_summary'])->save();
}
if (!FieldConfig::loadByName('node', $type, 'body')) {
  FieldConfig::create(['field_name' => 'body', 'entity_type' => 'node', 'bundle' => $type, 'label' => 'Body'])->save();
}
$display = EntityViewDisplay::load('node.' . $type . '.default');
if (!$display) { $display = EntityViewDisplay::create(['targetEntityType' => 'node', 'bundle' => $type, 'mode' => 'default', 'status' => TRUE]); }
$display->setComponent('body', ['label' => 'hidden', 'type' => 'text_default'])->save();
$anonymous = Role::load(RoleInterface::ANONYMOUS_ID);
if ($anonymous && !$anonymous->hasPermission('access content')) { $anonymous->grantPermission('access content')->save(); }
$storage = \Drupal::entityTypeManager()->getStorage('node');
$result = [];
foreach ($request['documents'] as $document) {
  $found = $storage->loadByProperties(['uuid' => $document['uuid']]);
  $node = $found ? reset($found) : NULL;
  if ($node && $node->bundle() !== $type) { throw new \RuntimeException('The retained entity UUID belongs to another content type.'); }
  if ($document['action'] === 'remove') {
    if ($node) { $result[] = ['key' => $document['key'], 'uuid' => $node->uuid(), 'id' => (int) $node->id(), 'path' => '/node/' . $node->id(), 'removed' => TRUE]; $node->delete(); }
    continue;
  }
  $node = $node ?: Node::create(['type' => $type, 'uuid' => $document['uuid'], 'uid' => 1, 'status' => 1]);
  $node->setTitle($document['title']);
  $node->set('body', ['value' => $document['body'], 'format' => 'plain_text']);
  $node->setPublished();
  $node->save();
  $result[] = ['key' => $document['key'], 'uuid' => $node->uuid(), 'id' => (int) $node->id(), 'path' => '/node/' . $node->id(), 'removed' => FALSE];
  if ($document['key'] === 'overview') { \Drupal::configFactory()->getEditable('system.site')->set('page.front', '/node/' . $node->id())->save(); }
}
print json_encode(['schema' => 'tjl.govhub-tome-content-result.v1', 'edition' => $request['edition'], 'site_uuid' => \Drupal::config('system.site')->get('uuid'), 'documents' => $result], JSON_UNESCAPED_SLASHES) . "\n";
"""

def documents(edition):
    entries = {
        "overview": ["Tome operating workshare",
          "Mobomo describes an editorial Drupal site, native Tome generation and static delivery. "
          "This private operating workspace implements complete build capture, review and receiving.\n"
          "Original source: " + CONTENT_SOURCE],
        "release": ["Build and release workflow",
          "Retain the original source and complete native output. Compare every added, removed and changed path. "
          "Stage the reviewed edition and publish it through the existing selected local release path."],
        "prior": ["Initial receiving checklist",
          "The first edition retains source, build outputs and the original local target before the second receiving edition."]
    }
    if edition == "B":
        entries["release"][1] += ("\nThe second edition adds the receiving engineer's full export, "
            "same-account reopen and selected predecessor rollback to the retained workflow.")
        entries["handover"] = ["Complete operating handover",
            "Receive both immutable generated editions, the complete reviewed comparison, original native "
            "operation records and the same workspace backup. Open the retained predecessor after rollback."]
    rows = []
    for key, (title, body) in entries.items():
        rows.append({"key": key, "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, "tjl:govhub-tome:20261012:" + key)),
                     "action": "remove" if edition == "B" and key == "prior" else "save",
                     "title": title, "body": body})
    return rows

class Journey:
    def __init__(self, ws, actor, directory):
        self.ws, self.actor, self.root = ws, actor, Path(directory)
        self.requests = self.root / "requests"
        self.results = self.root / "results"
        self.requests.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.results.mkdir(mode=0o700, parents=True, exist_ok=True)
        with ws.connect(snapshot=True) as db:
            self.workspace_id = ws.meta(db)["workspace"]["id"]

    def call(self, label, action, prepare):
        request_path, result_path = self.requests / (label + ".json"), self.results / (label + ".json")
        if request_path.exists():
            envelope = read(request_path)
            if envelope["workspace_id"] != self.workspace_id or envelope["actor"] != self.actor["name"] or envelope["operation"] != action:
                raise RuntimeError("Reopen this exact original account and request: " + label)
        else:
            payload = prepare() if callable(prepare) else dict(prepare)
            payload.setdefault("request_key", str(uuid.uuid4()))
            payload.update(static_workspace_id=self.workspace_id, static_actor=self.actor["name"])
            envelope = {"schema": "govhub.static-cli-request.v1", "workspace_id": self.workspace_id,
                        "actor": self.actor["name"], "operation": action, "payload": payload}
            retain(request_path, envelope)
        if result_path.exists():
            return read(result_path)
        result = self.ws.dispatch(action, envelope["payload"], self.actor)
        retain(result_path, result)
        progress(self.root, label, action=action,
                 operation_id=(result.get("operation") or {}).get("id"),
                 edition_id=(result.get("edition") or {}).get("id"),
                 target_id=(result.get("target") or {}).get("target_id"))
        return result

    def operation(self, label, created, timeout=7200):
        operation_id = created["operation"]["id"]
        completed = self.results / (label + "-complete.json")
        if completed.exists():
            retained = read(completed)
            current = self.ws.dispatch("operations.get", {"operation_id": operation_id}, self.actor)
            if retained["operation"]["id"] != current["operation"]["id"] or current["operation"]["state"] != "COMPLETE":
                raise RuntimeError("Reopen the retained completed original operation: " + operation_id)
            return current
        deadline, last, resumed = time.monotonic() + timeout, None, False
        while time.monotonic() < deadline:
            value = self.ws.dispatch("operations.get", {"operation_id": operation_id}, self.actor)
            op = value["operation"]
            step = (op["state"], json.dumps(op.get("progress"), sort_keys=True))
            if step != last:
                progress(self.root, "native-operation", operation_id=operation_id,
                         state=op["state"], progress=op.get("progress"))
                last = step
            if op["state"] == "COMPLETE":
                if (op.get("native_result") or {}).get("status") != "COMPLETE":
                    raise RuntimeError("The original operation lacks its complete native result.")
                retain(completed, value)
                return value
            if op["state"] in {"FAILED", "CANCELLED"}:
                retain(self.results / (label + "-terminal-" + op["revision"] + ".json"), value)
                raise RuntimeError("Continue the retained original operation " + operation_id + ": " + str(op.get("error") or op.get("native_result")))
            if op["state"] == "WAITING_NATIVE":
                if resumed:
                    retain(self.results / (label + "-waiting-" + op["revision"] + ".json"), value)
                    raise RuntimeError("The original native continuation remains in its retained state: " + operation_id)
                self.call(label + "-resume-" + op["revision"], "operations.resume",
                    {"operation_id": operation_id, "expected_revision": op["revision"],
                     "reason": "Continue this same owned native operation from its retained command and target state."})
                resumed = True
            time.sleep(0.5)
        raise RuntimeError("Retain and reopen the original running operation: " + operation_id)

def content(session, root, edition, profile, site_uuid):
    import native_adapter as native
    root = Path(root)
    request_path = root / ("content-" + edition + ".json")
    result_path = root / ("content-" + edition + "-result.json")
    if result_path.exists():
        value = read(result_path)
        if value["site_uuid"] != site_uuid:
            raise RuntimeError("The retained content belongs to another dedicated native site.")
        return value
    retain(request_path, {"schema": "tjl.govhub-tome-content-request.v1", "edition": edition,
                         "source_url": CONTENT_SOURCE, "documents": documents(edition)})
    helper = root / "prepare_tome_content.php"
    if helper.exists() and helper.read_text() != CONTENT_PHP:
        raise RuntimeError("The retained native content helper changed.")
    if not helper.exists():
        helper.write_text(CONTENT_PHP)
        os.chmod(helper, 0o600)
    env = shutil.which("env")
    if not env:
        raise RuntimeError("Use the native host's existing env executable.")
    record = session.command("content-" + edition.lower(),
        [env, "TJL_TOME_CONTENT_REQUEST=" + str(request_path),
         *native._prefix(native._profile(profile)), "php:script", str(helper)], mutating=True)
    value = read(record["stdout"]["path"])
    if value.get("schema") != "tjl.govhub-tome-content-result.v1" or value.get("edition") != edition or value.get("site_uuid") != site_uuid:
        raise RuntimeError("The original Drupal content command returned another edition.")
    retain(result_path, value)
    return value

def inspect_archive(path, required_editions):
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        manifest = json.loads(archive.read("manifest.json"))
        handover = json.loads(archive.read("handover.json"))
        if not {"START_HERE.md", "report.html", "handover.json", "manifest.json"} <= names:
            raise RuntimeError("Receive the original complete static release handover.")
        if not all(any(n.startswith("editions/" + item + "/site/") for n in names) for item in required_editions):
            raise RuntimeError("The original handover must carry both complete generated site editions.")
        if archive.testzip() is not None:
            raise RuntimeError("The native handover contains an unreadable file.")
    return {"path": str(path), "bytes": Path(path).stat().st_size, "sha256": sha(path),
            "members": len(names), "edition_ids": required_editions,
            "manifest": manifest, "handover": handover}

def run_tome_journey(*, site, application_directory, directory, tome_archive,
                     expected_source_commit=SOURCE_COMMIT):
    app, root = Path(application_directory).resolve(), Path(directory).resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    code = app / "workspace"
    for required in [app / "cutover.py", code / "govhub.py", code / "tome_native.py",
                     code / "vendor" / "assessment-core" / "workspace.py", app / "APPLICATION_SOURCE.json"]:
        if not required.is_file():
            raise RuntimeError("Use the original complete GovHub application package: " + str(required))
    lock = read(app / "APPLICATION_SOURCE.json")
    if (not isinstance(expected_source_commit, str) or len(expected_source_commit) != 40
            or any(char not in "0123456789abcdef" for char in expected_source_commit)):
        raise ValueError("Select the full original application source commit.")
    source_commit = lock.get("source_commit")
    if source_commit != expected_source_commit:
        raise RuntimeError("The complete GovHub package differs from the selected source cut.")
    source_binding = retain(root / "inputs" / "Application-Source.json", {
        "schema": "tjl.govhub-tome-application-source.v1",
        "source_commit": source_commit,
        "source_manifest_sha256": sha(app / "APPLICATION_SOURCE.json"),
    })
    sys.path.insert(0, str(code))
    govhub = importlib.import_module("govhub")
    native = importlib.import_module("native_adapter")
    from static_release_cli import download
    completed_path = root / "delivery" / "GovHub-Tome-Native-Result.json"
    if completed_path.exists():
        completed = read(completed_path)
        if completed.get("application_source_commit") != source_commit:
            raise RuntimeError("Reopen the same application source as the completed receiving operation.")
        if (completed.get("application_source_sha256") is not None
                and completed["application_source_sha256"] != source_binding["source_manifest_sha256"]):
            raise RuntimeError("The completed receiving operation belongs to another application source lock.")
        original = completed["handover"]
        independent = completed["independent_download"]
        if completed.get("status") != "COMPLETE" or sha(original["path"]) != original["sha256"] or sha(independent["path"]) != independent["sha256"]:
            raise RuntimeError("Retain the original complete operating delivery.")
        return completed
    ready = site.prepare()
    if ready.get("environment_id") != ENVIRONMENT:
        raise RuntimeError("Select the actual dedicated Mobomo native environment.")
    site_receipt = root / "native-site.json"
    if site_receipt.exists():
        original_site = read(site_receipt)
        for key in ["environment_id", "site_uuid", "site_root", "uri", "native_profile"]:
            if original_site.get(key) != ready.get(key):
                raise RuntimeError("The original native site binding changed: " + key)
    else:
        retain(site_receipt, ready)
    native_profile = dict(ready["native_profile"])
    inputs = root / "inputs"
    inputs.mkdir(mode=0o700, exist_ok=True)
    retain(inputs / "Tome-Public-Source.json", {"schema": "tjl.govhub-original-public-source.v1",
        "url": CONTENT_SOURCE, "purpose": "Native editorial/build/release operating workshare",
        "application_source_commit": source_commit, "tome_archive_sha256": TOME_ARCHIVE_SHA256})
    credentials = root / "operator-credentials.json"
    if credentials.exists():
        account = read(credentials)
    else:
        account = retain(credentials, {"username": "govhub-tome-operator", "password": secrets.token_urlsafe(32)})
    workspace_path = root / "workspace"
    fresh = not (workspace_path / "assessment.sqlite3").exists()
    ws = govhub.open_workspace(workspace_path, inputs, code / "vendor" / "assessment-core",
                               create=fresh, name="GovHub / Tome operating workshare", mode="PILOT")
    if fresh:
        ws.add_user(account["username"], account["password"], "admin")
    actor = ws.authenticate(account["username"], account["password"])
    if not actor:
        raise RuntimeError("Reopen the original private operating account.")
    native_dir = root / "native-content"
    native_dir.mkdir(mode=0o700, exist_ok=True)
    static_directory = root / "tome-working-output"
    static_directory.mkdir(mode=0o700, exist_ok=True)
    install_tome(ready["site_root"], tome_archive, native_dir)
    prepare_settings(ready["site_root"], static_directory, native_dir)
    session = site.session
    session.command("enable-original-tome",
        [*native._prefix(native._profile(native_profile)), "pm:enable", "node", "text", "field", "tome_static", "--yes"], mutating=True)
    session.command("rebuild-original-tome-services",
        [*native._prefix(native._profile(native_profile)), "cache:rebuild"], mutating=True)
    try:
        environment = ws.record("environments", ENVIRONMENT)
    except Exception as error:
        if getattr(error, "status", None) != 404:
            raise
        environment = ws.save("environments", ENVIRONMENT, {"data": {
            "name": "GovHub / Tome dedicated native operating site", "provider": "Drupal native",
            "purpose": "Rehearsal", "provider_resource_id": ENVIRONMENT,
            "canonical_url": ready["uri"], "owner": "Selected receiving engineer",
            "authorization_reference": AUTHORIZATION, "data_location": str(ready["site_root"]),
            "notes": "Original Drupal/Tome generation with account-bound GovHub release and complete receiving."},
            "expected_revision": None, "note": "Original dedicated source/runtime received."}, actor)
    tome = importlib.import_module("tome_native")
    fields = {item["name"] for item in tome.configuration_schema()["fields"]}
    profile = {k: v for k, v in native_profile.items() if k in fields}
    profile.update(source_kind="tome", environment_id=ENVIRONMENT,
                   static_directory=str(static_directory), expected_tome_version=tome.PUBLISHED_TOME["version"],
                   process_count=2, path_count=5, retry_count=1, content_entity_types="*",
                   install_observer=True)
    retain(root / "reviewed-tome-profile.json", profile)
    existing = ws.dispatch("operations.capabilities", {"environment_id": ENVIRONMENT}, actor)
    if existing.get("current_config") != profile:
        ws.dispatch("operations.configure", {"environment_id": ENVIRONMENT,
            "expected_revision": environment["revision"], "config": profile}, actor)
    capabilities = ws.dispatch("operations.capabilities", {"environment_id": ENVIRONMENT}, actor)
    if not capabilities.get("capabilities", {}).get("ready"):
        retain(root / ("native-capabilities-" + str(time.time_ns()) + ".json"), capabilities)
        raise RuntimeError("Resolve the original installed Tome capability result before generation: " +
                           str(capabilities.get("capabilities", {}).get("message")))
    capabilities_path = root / "native-capabilities.json"
    if capabilities_path.exists():
        retained_capabilities = read(capabilities_path)
        if retained_capabilities["profile"]["revision"] != capabilities["profile"]["revision"] or retained_capabilities["capabilities"]["target_fingerprint"] != capabilities["capabilities"]["target_fingerprint"]:
            raise RuntimeError("The original native profile or target fingerprint changed.")
    else:
        retain(capabilities_path, capabilities)
    journey = Journey(ws, actor, root)
    release_root = root / "local-release"
    release_root.mkdir(mode=0o700, exist_ok=True)
    editions, publications = [], []
    with ws.service_lease():
        ws.start_worker()
        try:
            for label in ["A", "B"]:
                source_result = content(session, native_dir, label, native_profile, ready["site_uuid"])
                def capture_body():
                    current = ws.dispatch("operations.capabilities", {"environment_id": ENVIRONMENT}, actor)
                    return {"environment_id": ENVIRONMENT, "native_action": "tome-capture",
                        "authorization_reference": AUTHORIZATION,
                        "environment_revision": current["environment"]["revision"],
                        "config_sha256": current["profile"]["revision"],
                        "target_fingerprint": current["capabilities"]["target_fingerprint"]}
                capture = journey.call("capture-" + label.lower(), "sources.capture", capture_body)
                complete = journey.operation("capture-" + label.lower(), capture)
                edition = journey.call("edition-" + label.lower(), "static.editions.receive", {
                    "operation_id": complete["operation"]["id"],
                    "expected_revision": complete["operation"]["revision"],
                    "label": "Complete native editorial edition " + label})["edition"]
                editions.append(edition["id"])
                target = journey.call("target", "static.targets.save", {
                    "environment_id": ENVIRONMENT, "release_root": str(release_root),
                    "current_name": "current", "label": "Original local static release"})["target"]
                target_id = target["target_id"]
                def target_body():
                    actual = ws.dispatch("static.targets.get", {"target_id": target_id}, actor)
                    return {"target_id": target_id, "expected_revision": actual["target"]["revision"],
                        "expected_current_release_id": (actual.get("current_release") or {}).get("id")}
                plan = journey.call("comparison-" + label.lower(), "static.plans.create",
                    lambda: {**target_body(), "candidate_id": edition["id"],
                             "label": "Review complete native edition " + label})["plan"]
                comparison_path = root / "results" / ("comparison-" + label.lower() + "-full.json")
                if comparison_path.exists():
                    comparison = read(comparison_path)
                    if comparison["plan"]["id"] != plan["id"] or comparison["plan"]["comparison_sha256"] != plan["comparison_sha256"]:
                        raise RuntimeError("Reopen the original complete comparison.")
                else:
                    pages, rows, offset = [], [], 0
                    while True:
                        page = ws.dispatch("static.plans.get", {"plan_id": plan["id"], "offset": offset, "limit": 1000, "status": "all"}, actor)
                        if page["plan"]["comparison_sha256"] != plan["comparison_sha256"] or page["comparison"]["offset"] != offset:
                            raise RuntimeError("The native comparison page changed identity.")
                        pages.append(page)
                        rows.extend(page["comparison"]["rows"])
                        next_offset = page["comparison"]["next_offset"]
                        if next_offset is None:
                            break
                        if next_offset <= offset:
                            raise RuntimeError("The original comparison cursor did not advance.")
                        offset = next_offset
                    if len(rows) != pages[-1]["comparison"]["total"]:
                        raise RuntimeError("Receive every original comparison row.")
                    comparison = {"schema": "tjl.govhub-complete-native-comparison.v1",
                        "plan": plan, "native_pages": pages, "rows": rows,
                        "counts": pages[-1]["comparison"]["counts"]}
                    retain(comparison_path, comparison)
                journey.call("review-" + label.lower(), "static.reviews.save", {
                    "plan_id": plan["id"], "comparison_sha256": plan["comparison_sha256"],
                    "decision": "APPROVE", "reason": "Reviewed the complete generated native edition, including all changed and removed paths, for this dedicated original local target."})
                for purpose in ["STATIC_STAGE", "STATIC_PUBLISH"]:
                    task = label.lower() + "-" + purpose.lower()
                    queued = journey.call(task, "static.operations.create",
                        lambda purpose=purpose: {**target_body(), "type": purpose,
                           "plan_id": plan["id"], "reason": "Operate the exact reviewed full native edition " + label})
                    operation = journey.operation(task, queued)
                    observed_path = root / "results" / (task + "-target.json")
                    if observed_path.exists():
                        observed = read(observed_path)
                    else:
                        observed = ws.dispatch("static.targets.inspect", {"target_id": target_id}, actor)
                        retain(observed_path, observed)
                    if purpose == "STATIC_PUBLISH":
                        selected = observed.get("current_release")
                        if not selected or selected["edition_id"] != edition["id"]:
                            raise RuntimeError("The actual native current selection differs from its completed publication.")
                        publications.append(selected["id"])
            rollback = journey.call("rollback", "static.operations.create",
                lambda: {**target_body(), "type": "STATIC_ROLLBACK",
                         "reason": "Select the retained predecessor of the completed second native edition."})
            journey.operation("rollback", rollback)
            selected = ws.dispatch("static.targets.inspect", {"target_id": target_id}, actor)
            if selected["current_release"]["edition_id"] != editions[0]:
                raise RuntimeError("The native rollback did not select the retained first edition.")
            retain(root / "results" / "rollback-target.json", selected)
            exported = journey.call("handover", "static.exports.create",
                lambda: {**target_body(), "name": "GovHub / Tome complete native operating handover"})["export"]
        finally:
            ws.stop_worker()
    output = root / "delivery"
    output.mkdir(mode=0o700, exist_ok=True)
    handover = output / "Static_Release_Handover.zip"
    if not handover.exists():
        downloaded = download(ws, exported["file"]["id"], handover)
        retain(output / "handover-download.json", downloaded)
    received = inspect_archive(handover, editions)
    retain(output / "handover-inspection.json", received)
    backup_path = root / "receiving-workspace"
    if not backup_path.exists():
        backup = ws.dispatch("workspace.backup", {"destination": str(backup_path)}, actor)
        retain(output / "workspace-backup.json", backup)
    if (backup_path / "BACKUP_INCOMPLETE").exists():
        raise RuntimeError("Continue the original complete workspace backup.")
    cold = govhub.open_workspace(backup_path, inputs, code / "vendor" / "assessment-core", create=False)
    cold_actor = cold.authenticate(account["username"], account["password"])
    if not cold_actor:
        raise RuntimeError("The original receiving account did not reopen.")
    reopened = cold.dispatch("static.targets.get", {"target_id": target_id}, cold_actor)
    if reopened["current_release"]["id"] != selected["current_release"]["id"]:
        raise RuntimeError("The receiving workspace reopened a different native current release.")
    reopened_editions = [cold.dispatch("static.editions.get", {"edition_id": item}, cold_actor)["edition"] for item in editions]
    reopened_export = cold.dispatch("static.exports.get", {"export_id": exported["id"]}, cold_actor)["export"]
    cold_download = output / "Static_Release_Independent_Receiving.zip"
    if not cold_download.exists():
        download(cold, reopened_export["file"]["id"], cold_download)
    if sha(cold_download) != sha(handover):
        raise RuntimeError("The independent original receiving download differs.")
    result = {"schema": "tjl.govhub-tome-native-journey.v1", "status": "COMPLETE",
        "application_source_commit": source_commit,
        "application_source_sha256": source_binding["source_manifest_sha256"], "workspace": str(workspace_path),
        "receiving_workspace": str(backup_path), "environment_id": ENVIRONMENT,
        "site_uuid": ready["site_uuid"], "target_id": target_id, "edition_ids": editions,
        "published_release_ids": publications, "selected_release": selected["current_release"],
        "reopened_editions": reopened_editions, "export": exported,
        "handover": {k: received[k] for k in ["path", "bytes", "sha256", "members"]},
        "independent_download": {"path": str(cold_download), "bytes": cold_download.stat().st_size, "sha256": sha(cold_download)}}
    retain(output / "GovHub-Tome-Native-Result.json", result)
    progress(root, "complete", target_id=target_id, edition_ids=editions,
             handover_sha256=received["sha256"])
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--site-root", type=Path, required=True)
    parser.add_argument("--tome-archive", type=Path, required=True)
    parser.add_argument("--site-mail", required=True, help="Actual selected site administrator email.")
    parser.add_argument("--application-source-commit", required=True,
                        help="Full source commit from the selected complete APPLICATION_SOURCE.json.")
    args = parser.parse_args()
    for value in [args.application, args.directory, args.runtime_manifest, args.site_root, args.tome_archive]:
        if not value.is_absolute():
            raise SystemExit("Choose actual absolute retained source and private native operation paths.")
    os.umask(0o077)
    sys.path.insert(0, str(args.application / "workspace"))
    from content_consolidation.examples.native_site import NativeDrupalSite
    with NativeDrupalSite(runtime_manifest=args.runtime_manifest,
            directory=args.directory / "native-site", site_root=args.site_root,
            environment_id=ENVIRONMENT, site_name="Tome operating workshare",
            site_mail=args.site_mail) as site:
        run_tome_journey(site=site, application_directory=args.application,
                         directory=args.directory, tome_archive=args.tome_archive,
                         expected_source_commit=args.application_source_commit)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
