#!/usr/bin/env python3
"""MIT. Complete FCDO organisation receiving on the original IATI product."""
from __future__ import annotations

import argparse
from collections import Counter
from contextlib import ExitStack, redirect_stdout
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import zipfile

HERE = Path(__file__).resolve().parent
IATI = HERE.parent
sys.path.insert(0, str(IATI))
from iati_workspace import IatiWorkspace
from organisation_cli import output_file
from server import OperatorServer
from managed import inspect_binding
from workspace import json_bytes, load_json
from cli import published_connection

SOURCE_SHA256 = "c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce"
SOURCE_BYTES = 99013
OPERATION = "fcdo-organisation-a5f3-20261012"
OPERATOR = "Commons organisation receiving operator"
REVIEWER = "Commons organisation source reviewer"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def retained(path, value):
    data = json_bytes(value) if not isinstance(value, bytes) else value
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists():
        require(path.read_bytes() == data, "Retained operation output differs: " + path.name)
        return path
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return path


def checkpoint(path, value):
    data = json_bytes(value)
    temporary = path.with_name("." + path.name + ".next")
    with temporary.open("wb") as stream:
        os.chmod(temporary, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)



def record_process(output, phase, result):
    clean = lambda value: re.sub(r"#[A-Za-z0-9_-]{32,256}", "#[redacted]", value).encode()
    stdout, stderr = clean(result.stdout), clean(result.stderr)
    value = {"phase": phase, "returncode": result.returncode,
             "stdout": {"bytes": len(stdout), "sha256": hashlib.sha256(stdout).hexdigest()},
             "stderr": {"bytes": len(stderr), "sha256": hashlib.sha256(stderr).hexdigest()}}
    identity = hashlib.sha256(json_bytes(value)).hexdigest()
    for name, data in (("stdout", stdout), ("stderr", stderr)):
        relative = "reports/" + phase + "-" + identity + "." + name + ".txt"
        retained(output / relative, data)
        value[name]["file"] = relative
    return value


def all_rows(work, selected, section):
    result, snapshot, total, offset = [], None, None, 0
    while True:
        page = work.rows({**selected, "section": section, "offset": offset, "limit": 50,
                          **({"expectedSnapshot": snapshot} if snapshot else {})})
        if snapshot is None:
            snapshot, total = page["snapshotSha256"], page["total"]
        require(page["snapshotSha256"] == snapshot and page["total"] == total,
                "The selected original record snapshot changed")
        result.extend(page["rows"])
        offset += len(page["rows"])
        if offset == total:
            break
        require(page["rows"] and offset < total, "The complete original page is missing")
    return result


def cli_call(workspace, arguments):
    # This uses the original complete command parser after the workspace closes.
    from cli import main
    output = io.StringIO()
    with redirect_stdout(output):
        main(["--workspace", str(workspace), *arguments])
    return load_json(output.getvalue())


def prepare(source, receipt, output):
    raw = source.read_bytes()
    require(len(raw) == SOURCE_BYTES and hashlib.sha256(raw).hexdigest() == SOURCE_SHA256,
            "Select the exact complete FCDO organisation publication retained on 2026-10-12")
    acquisition = load_json(receipt.read_bytes())
    source_receipts = acquisition.get("original_receipts", [])
    original = next((r for r in source_receipts if r.get("name") == "publisher/fcdo-organisation.xml"), None)
    require(original is not None and original.get("status") == 200
            and original.get("actual_bytes", original.get("bytes")) == SOURCE_BYTES
            and original.get("actual_sha256", original.get("sha256")) == SOURCE_SHA256,
            "The complete actual publisher retrieval receipt is required")
    retained(output / "publisher" / "fcdo-organisation.xml", raw)
    retained(output / "publisher" / "acquisition.json", acquisition)
    sender = output / "sender-workspace"
    previous = load_json((output / "operation-state.json").read_bytes()) if (output / "operation-state.json").exists() else {}
    evidence = {"schema": "stellar-forge.iati-organisation-receiving-run.v1",
                "operation": OPERATION, "source": {"bytes": len(raw), "sha256": SOURCE_SHA256},
                "observedAt": datetime.now(timezone.utc).isoformat(), "stages": [],
                "continuationAttempts": previous.get("continuationAttempts", [])}
    checkpoint(output / "operation-state.json", evidence)
    with IatiWorkspace(sender, create=not sender.exists()) as ws:
        work = ws.organisation
        source_entry = ws.add_source(io.BytesIO(raw), "FCDO original organisation publication, 2026-06-15",
                                     "fcdo-organisation.xml")
        require(source_entry["id"] == SOURCE_SHA256, "Original retained source changed")
        profile = work.profile(source_entry["id"])
        require(len(profile["organisations"]) == 1
                and profile["organisations"][0]["identifier"] == "GB-GOV-1",
                "The actual FCDO source organisation differs")
        require(profile["budgetCount"] == 148 and profile["documentCount"] == 80,
                "The original source register is incomplete")
        key = profile["organisations"][0]["key"]
        retained(output / "publisher" / "profile.json", profile)
        selection = {"sourceId": SOURCE_SHA256, "organisationKey": key}
        budgets = all_rows(work, selection, "budgets")
        documents = all_rows(work, selection, "documents")
        require(len(budgets) == 148 and len(documents) == 80, "All original source records must be retained")
        budget_families = dict(Counter(row["family"] for row in budgets))
        edits, corrected_documents = [], []
        for row in documents:
            url = row.get("url")
            if not isinstance(url, str) or url == url.strip():
                continue
            detail = work.detail({**selection, "rowId": row["id"]})
            targets = [t for t in detail["targets"] if t["kind"] == "attribute"
                       and t.get("attribute") == "url" and t.get("value") == url]
            require(len(targets) == 1, "Select the exact owning document URL target")
            target = targets[0]
            edits.append({"targetId": target["id"], "beforeSha256": target["beforeSha256"],
                          "operation": "attribute", "attribute": "url", "value": url.strip()})
            corrected_documents.append({"rowId": row["id"], "targetId": target["id"],
                                        "before": url, "after": url.strip()})
        require(len(edits) == 2, "The selected original publication has two document URLs with trailing spaces")
        assessment = {"asOf": "2026-10-12", "fiscalYearStart": "2026-04-01",
                      "forwardYears": 3, "methodology": "pwyf2026"}
        base = {"requestId": OPERATION + "-original", "name": "FCDO organisation planning and document review",
                "sourceId": SOURCE_SHA256, "organisationKeys": [key], "assessment": assessment,
                "acquisition": {"sourceUrl": original["final_url"],
                    "retrievedAt": original["observed_at"],
                    "licence": "UK Open Government Licence",
                    "licenceUrl": "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
                    "notes": "Original catalogue identifies licence_id uk-ogl. Full HTTP receipt and complete source accompany this customer operation."},
                "edits": [], "actor": OPERATOR,
                "notes": "Review the complete FCDO organisation publication. The published forward values retain their original indicative planning status and explanatory FCDO extensions."}
        first = work.save(base)
        request = {**deepcopy(base), "requestId": OPERATION + "-document-correction",
                   "id": first["id"], "expectedRevision": first["revision"], "edits": edits,
                   "notes": base["notes"] + " Remove trailing spaces from two declared document URLs; retain the complete published financial values and document content."}
        saved = work.save(request)
        require(saved["validation"]["state"] == "VALID", "The complete corrected source must pass the actual organisation XSD")
        candidate_selection = {"id": saved["id"], "revision": saved["revision"], "organisationKey": key}
        candidate_budgets = all_rows(work, candidate_selection, "budgets")
        require([(r["id"], r["nodeSha256"]) for r in budgets] ==
                [(r["id"], r["nodeSha256"]) for r in candidate_budgets],
                "A document-only correction changed an original financial record")
        candidate_documents = all_rows(work, candidate_selection, "documents")
        require(len(candidate_documents) == len(documents)
                and all(row.get("url") == row.get("url", "").strip() for row in candidate_documents),
                "Both original URL corrections must be retained")
        findings = all_rows(work, candidate_selection, "issues")
        retained(output / "reports" / "candidate-findings.json", findings)
        errors = [row for row in findings if row["severity"] == "error"]
        require(not errors, "The actual source has complete-source errors requiring correction: " +
                json.dumps([{"code": x.get("code"), "message": x.get("message")} for x in errors], ensure_ascii=False))
        acknowledgements = [row["id"] for row in findings if row["severity"] == "review"]
        review_request = {"requestId": OPERATION + "-review", "id": saved["id"],
            "expectedRevision": saved["revision"], "decision": "approve", "actor": REVIEWER,
            "note": "Reviewed the complete organisation XML, all 148 financial records and 80 document links. Two URL whitespace corrections preserve the published amounts, dates, categories and FCDO explanatory extensions. This dated review retains each manual methodology/document finding and the publication's indicative forward planning status; operating-country scope follows the original declared evidence.",
            "acknowledgedIssueIds": acknowledgements}
        reviewed = work.review(review_request)
        release_request = {"requestId": OPERATION + "-release", "id": saved["id"],
                           "expectedRevision": reviewed["revision"], "reviewId": reviewed["review"]["id"],
                           "actor": OPERATOR}
        release = work.release(release_request)
        released = release["plan"]
        comparison_request = {"requestId": OPERATION + "-comparison",
            "before": {"id": first["id"], "revision": first["revision"]},
            "after": {"id": released["id"], "revision": released["revision"]},
            "actor": REVIEWER, "notes": "Whole original organisation publication versus reviewed document URL corrections."}
        comparison = work.compare(comparison_request)
        require(work.save(request) == saved, "The original correction request no longer reopens its saved result")
        require(work.review(review_request) == reviewed, "The named review request no longer reopens its original result")
        require(work.release(release_request) == release, "The release request no longer reopens its original result")
        require(work.compare(comparison_request) == comparison, "The comparison request no longer reopens its original result")
        requests = {"original": base, "save": request, "review": review_request,
                    "release": release_request, "compare": comparison_request}
        retained(output / "reports" / "requests.json", requests)
        retained(output / "reports" / "released-plan.json", released)
        retained(output / "reports" / "comparison.json", comparison)
        retained(output / "reports" / "corrected-document-urls.json", corrected_documents)
        evidence.update({"planId": released["id"], "releasedRevision": released["revision"],
            "organisationKey": key, "candidateSha256": released["candidateSha256"],
            "budgetRows": len(budgets), "budgetFamilies": budget_families, "documentRows": len(documents),
            "correctedDocumentUrls": len(edits), "reviewFindingsAcknowledged": len(acknowledgements),
            "validation": released["validation"], "comparison": comparison["summary"],
            "summary": released["summary"],
            "stages": ["complete-publisher-intake", "full-record-registers", "precise-document-corrections",
                       "named-review", "reviewed-release", "whole-edition-comparison", "original-request-replay"]})
        checkpoint(output / "operation-state.json", evidence)
    # Exercise the installed command's exclusive workspace lifecycle and complete files.
    result = cli_call(sender, ["organisation-plan", "--id", evidence["planId"],
                              "--revision", str(evidence["releasedRevision"])])
    require(result["recordSha256"] == released["recordSha256"], "CLI reopened a different released edition")
    retained(output / "reports" / "cli-released-plan.json", result)
    delivery = output / "delivery"
    delivery.mkdir(mode=0o700, exist_ok=True)
    files = {}
    for kind in ("source", "candidate", "report", "budgets", "documents"):
        extension = "xml" if kind in ("source", "candidate") else "html" if kind == "report" else "csv"
        filename = delivery / ("organisation-" + kind + "." + extension)
        args = ["organisation-file", "--id", evidence["planId"], "--revision",
                str(evidence["releasedRevision"]), "--kind", kind, "--out", str(filename)]
        descriptor = cli_call(sender, args)
        replay = cli_call(sender, args)
        require(replay["reused"] is True and replay["sha256"] == descriptor["sha256"],
                "The complete CLI output did not reopen unchanged")
        files[kind] = {key: descriptor[key] for key in ("name", "media", "bytes", "sha256")}
    packet = delivery / "FCDO_Organisation_Planning.zip"
    exported = cli_call(sender, ["organisation-export", "--id", evidence["planId"],
        "--revision", str(evidence["releasedRevision"]), "--out", str(packet)])
    with zipfile.ZipFile(packet) as archive:
        require(archive.testzip() is None, "The complete CLI export contains a damaged member")
        packet_members = archive.namelist()
    evidence.update({"files": files, "nativePacket": {"bytes": packet.stat().st_size,
        "sha256": hashlib.sha256(packet.read_bytes()).hexdigest(), "members": len(packet_members)}})
    evidence["stages"].extend(["original-cli-reopen", "five-complete-original-files", "complete-portable-export"])
    checkpoint(output / "operation-state.json", evidence)
    return evidence, requests


def main(argv=None):
    parser = argparse.ArgumentParser(description="Operate the complete retained FCDO organisation customer journey")
    parser.add_argument("--source", required=True)
    parser.add_argument("--acquisition", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--mcp-directory", required=True)
    parser.add_argument("--node", default=os.environ.get("SF30_XML_NODE", "node"))
    parser.add_argument("--browser-driver")
    parser.add_argument("--chromium")
    parser.add_argument("--playwright")
    args = parser.parse_args(argv)
    output = Path(args.output).absolute()
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(not output.is_symlink() and output.resolve() == output, "Use an original private operation directory")
    os.chmod(output, 0o700)
    evidence, requests = prepare(Path(args.source), Path(args.acquisition), output)
    private = output / "connections"
    private.mkdir(mode=0o700, exist_ok=True)
    exports = output / "merchant-exports"
    exports.mkdir(mode=0o700, exist_ok=True)
    (output / "temporary").mkdir(mode=0o700, exist_ok=True)
    receiver = output / "receiver-workspace"
    with ExitStack() as stack:
        sender_ws = stack.enter_context(IatiWorkspace(output / "sender-workspace"))
        receiver_ws = stack.enter_context(IatiWorkspace(receiver, create=not receiver.exists()))
        servers = []
        for name, workspace in (("sender", sender_ws), ("receiver", receiver_ws)):
            server = OperatorServer(workspace)
            servers.append(server)
            stack.callback(server.server_close)
            thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.2}, daemon=True)
            thread.start()
            stack.callback(thread.join, 10)
            stack.callback(server.shutdown)
            stack.enter_context(published_connection(private / (name + ".url"), server.url))
        binding = inspect_binding(sender_ws.root)
        retained(output / "reports" / "installed-source-binding.json", binding)
        config = {"iatiDirectory": str(IATI), "mcpDirectory": str(Path(args.mcp_directory).absolute()),
            "senderConnectionFile": str(private / "sender.url"), "receiverConnectionFile": str(private / "receiver.url"),
            "exportsDirectory": str(exports), "outputDirectory": str(output / "merchant"),
            "sourceId": SOURCE_SHA256, "organisationKey": evidence["organisationKey"],
            "planId": evidence["planId"], "releasedRevision": evidence["releasedRevision"],
            "saveRequest": requests["save"], "reviewRequest": requests["review"],
            "releaseRequest": requests["release"], "compareRequest": requests["compare"],
            "expectedBudgetRows": evidence["budgetRows"], "expectedDocumentRows": evidence["documentRows"]}
        config_path = retained(private / "continuation.json", config)
        continued = subprocess.run([args.node, str(HERE / "organisation.mjs"), str(config_path)],
            text=True, capture_output=True, env={**os.environ, "TMPDIR": str(output / "temporary")})
        observed = record_process(output, "merchant-continuation", continued)
        if observed not in evidence["continuationAttempts"]:
            evidence["continuationAttempts"].append(observed)
        checkpoint(output / "operation-state.json", evidence)
        require(continued.returncode == 0, "The original merchant continuation failed: " + continued.stderr[-4000:])
        evidence["stages"].append("typed-client-and-complete-merchant-receiving")
        checkpoint(output / "operation-state.json", evidence)
        if args.browser_driver:
            browser_config = {**config, "chromium": args.chromium, "playwright": args.playwright}
            browser_config_path = retained(private / "browser.json", browser_config)
            browser = subprocess.run([args.node, args.browser_driver, str(browser_config_path)],
                                      text=True, capture_output=True)
            observed = record_process(output, "browser", browser)
            if observed not in evidence["continuationAttempts"]:
                evidence["continuationAttempts"].append(observed)
            checkpoint(output / "operation-state.json", evidence)
            require(browser.returncode == 0, "The original browser continuation failed: " + browser.stderr[-4000:])
            evidence["stages"].append("original-industrial-browser")
        current = receiver_ws.organisation.plan(evidence["planId"])
        evidence["receivingRevision"] = current["revision"]
        evidence["receivingCandidateSha256"] = current["candidateSha256"]
    receiver_plan = cli_call(receiver, ["organisation-plan", "--id", evidence["planId"]])
    require(receiver_plan["revision"] == evidence["receivingRevision"], "The independent receiver changed at CLI reopen")
    retained(output / "reports" / "receiver-cli-plan.json", receiver_plan)
    evidence["stages"].append("independent-receiver-cli-reopen")
    evidence["state"] = "COMPLETE"
    checkpoint(output / "operation-state.json", evidence)
    print(json.dumps({"state": "COMPLETE", "operation": OPERATION, "planId": evidence["planId"],
        "releasedRevision": evidence["releasedRevision"], "receivingRevision": evidence["receivingRevision"],
        "sourceBytes": SOURCE_BYTES, "budgetRows": evidence["budgetRows"], "documentRows": evidence["documentRows"],
        "correctedDocumentUrls": evidence["correctedDocumentUrls"], "output": str(output)}, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
