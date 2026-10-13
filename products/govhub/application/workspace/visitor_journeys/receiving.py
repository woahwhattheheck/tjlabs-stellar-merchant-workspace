#!/usr/bin/env python3
"""Receive the complete original-source visitor product through its native HTTP app."""
import argparse
import hashlib
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import secrets
import sys
import threading
import time
import traceback
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener
import uuid
import zipfile

MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE.parent))
from govhub import open_workspace
from server import Server


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    data = value if isinstance(value, bytes) else (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    part = path.with_name(path.name + ".partial")
    with part.open("wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    os.chmod(part, 0o600)
    os.replace(part, path)


class NativeHost:
    def __init__(self, workspace):
        self.workspace = workspace
        self.server = Server(workspace, 0)
        self.origin = self.server.origin
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.1}, daemon=True)
        self.lease = workspace.service_lease()
        self.lease.__enter__()
        workspace.start_worker()
        self.thread.start()
        self.client = build_opener(ProxyHandler({}), HTTPCookieProcessor(CookieJar()))

    def request(self, route, body=None, raw=False):
        request = Request(self.origin + route, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(),
                          headers={"Content-Type": "application/json", "Origin": self.origin})
        try:
            with self.client.open(request, timeout=90) as response:
                data = response.read()
                return data if raw else json.loads(data)
        except HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            raise RuntimeError(str(error.code) + " " + route + ": " + detail) from error

    def call(self, action, payload=None):
        return self.request("/api/govhub/" + action.replace(".", "/"), payload or {})

    def login(self, account):
        return self.request("/api/login", {"name": account["username"], "password": account["password"]})

    def close(self):
        self.server.shutdown()
        self.workspace.stop_worker()
        self.server.server_close()
        self.thread.join(timeout=10)
        self.lease.__exit__(None, None, None)


def run(args):
    root = args.directory.resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    manifest = json.loads(args.source_files.read_text())
    sources = manifest["sources"]
    if len({item["url"] for item in sources}) != len(sources):
        raise ValueError("Original source URLs must be unique.")
    for item in sources:
        path = Path(item["path"])
        content = path.read_bytes()
        if path.is_symlink() or len(content) != item["bytes"] or sha(content) != item["sha256"]:
            raise ValueError("Original input changed: " + item["url"])
    source_paths = [str(Path(item["path"]).resolve().parent) for item in sources]
    source_root = Path(os.path.commonpath(source_paths))
    example = json.loads(args.example.read_text())
    journal_path = root / "receiving-journal.json"
    if journal_path.exists():
        journal = json.loads(journal_path.read_text())
        if journal["input_sha256"] != sha(args.source_files.read_bytes()) or journal["example_sha256"] != sha(args.example.read_bytes()):
            raise ValueError("Resume the retained operation with its original source manifest and example.")
    else:
        journal = {"operation_id": "visitor-receiving-" + uuid.uuid4().hex,
                   "input_sha256": sha(args.source_files.read_bytes()),
                   "example_sha256": sha(args.example.read_bytes()), "stages": [], "retained_sources": {}}
        write(journal_path, journal)
    account_path = root / "private-account.json"
    if account_path.exists():
        account = json.loads(account_path.read_text())
    else:
        account = {"username": "visitor-owner", "password": secrets.token_urlsafe(30)}
        write(account_path, account)
    workspace = open_workspace(root / "workspace", source_root, create=True, name="Three Rivers visitor operations", mode="SUPPLIED")
    if workspace.user(account["username"]) is None:
        workspace.add_user(account["username"], account["password"], "admin")
    host = NativeHost(workspace)
    def stage(name, details):
        journal["stages"] = [item for item in journal["stages"] if item["name"] != name]
        journal["stages"].append({"name": name, "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **details})
        write(journal_path, journal)
        print(json.dumps({"stage": name, **details}), flush=True)
    key = lambda name: journal["operation_id"] + ":" + name
    def original_payload(name, payload):
        return dict(payload, request_key=key(name))
    def await_capture(payload, label):
        response = host.call("visitor.captures.import", payload)
        operation_id = response["operation"]["id"]
        deadline = time.monotonic() + args.timeout
        while True:
            result = host.call("visitor.captures.get", {"operation_id": operation_id})
            operation = result["operation"]
            if operation["state"] in {"COMPLETE", "FAILED", "CANCELLED", "PAUSED", "WAITING_NATIVE"}:
                break
            if time.monotonic() >= deadline:
                raise TimeoutError("The same original capture is retained at " + operation_id)
            time.sleep(0.1)
        if operation["state"] != "COMPLETE":
            write(root / (label + "-operation-error.json"), result)
            raise RuntimeError("Original capture returned " + operation["state"] + ": " + json.dumps(operation.get("error")))
        value = host.call("visitor.editions.get", {"edition_id": operation["result_edition_id"]})
        if host.call("visitor.captures.import", payload)["operation"]["id"] != operation_id:
            raise AssertionError("Capture replay changed the original operation.")
        stage(label + "-capture", {"operation_id": operation_id, "edition_id": value["edition"]["id"],
                                  "summary": value["edition"]["summary"], "result_sha256": value["edition"]["result_sha256"],
                                  "pages": len(value["edition"]["pages"])})
        return value
    try:
        assert host.login(account)["user"]["role"] == "admin"
        source_files = {}
        for item in sources:
            file = journal["retained_sources"].get(item["url"])
            if file is None:
                file = host.call("sources.retain", {"path": str(Path(item["path"]).resolve().relative_to(source_root)),
                                                   "category": "Extract", "source_label": item["url"]})
                journal["retained_sources"][item["url"]] = file
                write(journal_path, journal)
            actual = host.request("/api/files/" + file["id"], raw=True)
            if len(actual) != item["bytes"] or sha(actual) != item["sha256"]:
                raise AssertionError("Original HTTP source download changed.")
            source_files[item["url"]] = {"file_id": file["id"], "url": item["url"],
                                        **{k: item[k] for k in ("observed_at", "acquisition", "content_type", "status", "redirects", "final_url", "elapsed_ms") if k in item}}
        stage("original-sources", {"count": len(sources), "bytes": sum(item["bytes"] for item in sources)})
        project_payload = original_payload("project", example["project"])
        set_payload = original_payload("set", example["set"])
        project = host.call("visitor.projects.save", project_payload)["project"]
        definition = host.call("visitor.sets.save", set_payload)["set"]
        assert definition["revision"] == 1
        assert host.call("visitor.projects.save", project_payload)["project"]["id"] == project["id"]
        assert host.call("visitor.sets.save", set_payload)["set"]["id"] == definition["id"]
        selected_urls = sorted({step["url"] for journey in definition["value"]["journeys"] for step in journey["steps"]})
        baseline_payload = original_payload("baseline", {
            "label": "Original public visitor pages — camping query", "role": "BASELINE",
            "set_id": definition["entity_id"], "project_id": project["entity_id"],
            "expected_revision": definition["revision"], "source_files": [source_files[address] for address in selected_urls]})
        baseline = await_capture(baseline_payload, "baseline")
        candidate = dict(example["candidate"], expected_revision=definition["revision"])
        mapped_urls = sorted({candidate.get("url_overrides", {}).get(address, address) for address in selected_urls})
        candidate["source_files"] = [source_files[address] for address in mapped_urls]
        candidate_payload = original_payload("candidate", candidate)
        candidate_result = await_capture(candidate_payload, "candidate")
        editions = [baseline["edition"], candidate_result["edition"]]
        comparison = host.call("visitor.editions.compare", {"before_id": editions[0]["id"], "after_id": editions[1]["id"]})
        assert comparison["definition_changed"] is False and comparison["binding_changed"] is True
        assert all(row["criteria_changed"] is False for row in comparison["rows"])
        write(root / "comparison.json", comparison)
        stage("same-goal-comparison", {"summary": comparison["summary"], "source_changes": len(comparison["source_changes"]),
                                      "binding_changed": comparison["binding_changed"]})
        for index, value in enumerate(editions):
            unresolved = [j for j in value["result"]["journeys"] if j["status"] != "PASS"]
            review_payload = original_payload("review-" + str(index), {
                "edition_id": value["id"], "result_sha256": value["result_sha256"], "expected_revision": 0,
                "decision": "RETURN" if unresolved else "ACCEPT",
                "reason": "Original source outcomes are retained for the partner's implementation review. " +
                          ("The recorded unresolved visitor goals remain assigned for correction." if unresolved else "All authored visitor outcomes are present in this captured source."),
                "exceptions": []})
            review = host.call("visitor.reviews.save", review_payload)["review"]
            assert host.call("visitor.reviews.save", review_payload)["review"]["id"] == review["id"]
            for journey in unresolved:
                failed = [check for step in journey["steps"] for check in step["checks"] if check["status"] != "PASS"]
                action = "Review and implement the original visitor outcome in the site's Drupal navigation, content or search configuration: " + journey["goal"]
                finding_payload = original_payload("finding-" + str(index) + "-" + journey["id"], {
                    "entity_id": "visitor-" + str(index) + "-" + journey["id"], "expected_revision": 0,
                    "edition_id": value["id"], "journey_id": journey["id"], "title": journey["name"],
                    "action": action, "owner": "Delivery partner", "status": "OPEN",
                    "note": "Original unresolved source outcomes: " + json.dumps(failed, ensure_ascii=False)})
                host.call("visitor.findings.save", finding_payload)
        stage("review-and-corrective-work", {"edition_count": len(editions), "findings": len(host.call("visitor.snapshot")["findings"])})
        export_payload = original_payload("handover", {"name": "Three Rivers visitor journeys — complete source comparison",
                                                        "visitor_edition_ids": [e["id"] for e in editions], "include_sources": True})
        exported = host.call("visitor.exports.create", export_payload)["export"]
        assert host.call("visitor.exports.create", export_payload)["export"]["id"] == exported["id"]
        output_files = []
        for file in exported["files"]:
            name = file.get("name") or file.get("filename")
            content = host.request("/api/exports/" + exported["id"] + "/" + quote(name, safe=""), raw=True)
            if len(content) != file["size"] or sha(content) != file["sha256"]:
                raise AssertionError("Original customer export changed: " + name)
            path = root / "customer-handover" / name
            write(path, content)
            output_files.append({"name": name, "bytes": len(content), "sha256": sha(content)})
        zip_names = [f["name"] for f in output_files if f["name"].endswith(".zip")]
        if not zip_names:
            raise AssertionError("Complete original ZIP export is missing.")
        with zipfile.ZipFile(root / "customer-handover" / zip_names[0]) as archive:
            names = archive.namelist()
            assert "visitor-journeys.json" in names and "visitor-outcomes.csv" in names and "handover.html" in names
            visitor = json.loads(archive.read("visitor-journeys.json"))
            assert len(visitor["editions"]) == 2
        stage("complete-customer-handover", {"export_id": exported["id"], "files": output_files})
        backup_dir = root / "recovery-copy"
        if not (backup_dir / "backup.json").exists():
            backup = host.call("workspace.backup", {"destination": str(backup_dir)})
            write(root / "backup-receipt.json", backup)
        else:
            backup = json.loads((root / "backup-receipt.json").read_text())
        stage("complete-private-backup", {"directory": str(backup_dir), "native_files": backup.get("native_files", 0)})
        for route in ("/", "/govhub-static/app.js", "/govhub-static/visitor.js", "/govhub-static/visitor.css"):
            assert host.request(route, raw=True)
        write(root / "browser-connection.json", {"origin": host.origin, "username": account["username"], "password": account["password"],
                                                "baseline_id": editions[0]["id"], "candidate_id": editions[1]["id"],
                                                "export_id": exported["id"], "workspace": str(workspace.root)})
        if args.browser_command:
            import subprocess
            native_browser = subprocess.run(args.browser_command, cwd=str(MODULE.parent),
                                            env=dict(os.environ, VISITOR_RECEIVING_CONNECTION=str(root / "browser-connection.json")),
                                            capture_output=True, text=True)
            write(root / "browser-stdout.txt", native_browser.stdout.encode())
            write(root / "browser-stderr.txt", native_browser.stderr.encode())
            if native_browser.returncode:
                raise RuntimeError("The original browser returned " + str(native_browser.returncode))
            stage("native-browser", {"result": json.loads(native_browser.stdout)})
        host.close()
        host = None
        restored = open_workspace(backup_dir, source_root)
        cold = NativeHost(restored)
        try:
            assert cold.login(account)["user"]["name"] == account["username"]
            snapshot = cold.call("visitor.snapshot")
            assert {e["id"] for e in snapshot["editions"]} == {e["id"] for e in editions}
            for value in editions:
                opened = cold.call("visitor.editions.get", {"edition_id": value["id"]})
                assert opened["edition"]["result_sha256"] == value["result_sha256"]
                assert len(opened["reviews"]) == 1
            assert cold.call("visitor.captures.import", baseline_payload)["operation"]["id"] == baseline["edition"]["operation_id"]
            assert cold.call("visitor.captures.import", candidate_payload)["operation"]["id"] == candidate_result["edition"]["operation_id"]
            assert cold.call("visitor.exports.create", export_payload)["export"]["id"] == exported["id"]
            for file in output_files:
                assert sha(cold.request("/api/exports/" + exported["id"] + "/" + quote(file["name"], safe=""), raw=True)) == file["sha256"]
            stage("cold-reopen-original-requests", {"workspace_id": snapshot.get("workspace_id"), "editions": len(snapshot["editions"]),
                                                  "findings": len(snapshot["findings"]), "original_export_id": exported["id"]})
        finally:
            cold.close()
        report = {"format": "visitor-native-receiving/1", "status": "COMPLETE", "operation_id": journal["operation_id"],
                  "source_mode": "SUPPLIED_ORIGINAL", "original_sources": [{k: v for k, v in item.items() if k != "path"} for item in sources],
                  "source_files": {str(p.relative_to(MODULE.parent)): sha(p.read_bytes()) for p in MODULE.parent.rglob("*")
                                   if p.is_file() and p.suffix in {".py", ".js", ".css", ".html", ".json"} and "__pycache__" not in p.parts},
                  "baseline": {"id": editions[0]["id"], "summary": editions[0]["summary"], "result_sha256": editions[0]["result_sha256"]},
                  "candidate": {"id": editions[1]["id"], "summary": editions[1]["summary"], "result_sha256": editions[1]["result_sha256"]},
                  "comparison": comparison["summary"], "stages": journal["stages"], "export_id": exported["id"],
                  "backup": backup, "files": output_files}
        write(root / "native-visitor-receiving.json", report)
        print(json.dumps({"status": "COMPLETE", "report": str(root / "native-visitor-receiving.json"),
                          "baseline": report["baseline"], "candidate": report["candidate"], "comparison": report["comparison"]}), flush=True)
        return report
    finally:
        if host is not None:
            host.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-files", type=Path, required=True)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--example", type=Path, default=MODULE / "examples" / "three-rivers.json")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--browser-command", nargs="+")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        run(args)
    except Exception as error:
        detail = {"error": str(error), "type": type(error).__name__, "traceback": traceback.format_exc()}
        write(args.directory / "receiving-error.json", detail)
        print(json.dumps(detail), file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
