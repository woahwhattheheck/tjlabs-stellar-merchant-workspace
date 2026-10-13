#!/usr/bin/env python3
"""MIT. Continue one original document-evidence case with an explicit full capture.

The existing recipient is the sending workspace for this following phase. Its
history and notes remain in the original linear plan; one new named observation
is reviewed, compared, exported and independently received through the maintained
IATI engines. Reopening uses the same retained requests.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path[:] = [entry for entry in sys.path if Path(entry or os.getcwd()).resolve() != HERE]
sys.path.insert(0, str(HERE.parent))

from iati_workspace import IatiWorkspace, InputError, json_bytes, load_json
from workspace import checked_id, digest, file_digest
from publishing import REQUEST
from organisation_cli import output_file
from document_evidence.workspace import selection_key, number, text, limits, url_text
from document_evidence.receiving import (
    case_owner, exact_json, physical_directory, run_connected, stable_request,
)

INPUT_SCHEMA = "stellar-forge.iati-document-following-input.v1"
NATIVE_SCHEMA = "stellar-forge.iati-document-native-receiving.v1"
FOLLOWING_SCHEMA = "stellar-forge.iati-document-following-observation.v1"


def require(condition, message):
    if not condition:
        raise InputError(message)


def plan_identity(value):
    require(isinstance(value, dict) and set(value) == {"id", "revision", "recordSha256"},
            "Select the complete original recipient plan identity")
    checked_id(value["id"])
    checked_id(value["recordSha256"])
    number(value["revision"])
    return value


def configuration(filename):
    value = load_json(Path(filename).read_bytes())
    required = {
        "schema", "operationId", "caseDirectory", "originalOperationId",
        "originalResultSha256", "base", "workspaceSha256", "rowId",
        "publishedUrl", "limits", "actor", "review", "acknowledgeNewObservation",
    }
    require(isinstance(value, dict) and set(value) == required and value["schema"] == INPUT_SCHEMA,
            "Use the complete explicit following-observation configuration")
    for key in ("operationId", "originalOperationId"):
        ident = value[key]
        require(isinstance(ident, str) and REQUEST.fullmatch(ident) is not None and len(ident) <= 110,
                "Keep each original operation ID within110 characters")
    require(value["operationId"] != value["originalOperationId"],
            "The following observation needs its own explicit operation ID")
    require(isinstance(value["caseDirectory"], str) and Path(value["caseDirectory"]).is_absolute(),
            "Select the existing absolute original case directory")
    for key in ("originalResultSha256", "workspaceSha256", "rowId"):
        checked_id(value[key])
    plan_identity(value["base"])
    require(value["acknowledgeNewObservation"] is True,
            "Acknowledge this one additional observation of the same literal URL")
    url_text(value["publishedUrl"])
    require(value["limits"] == limits(value["limits"]),
            "Keep the full original capture limits explicit")
    require(value["actor"] == text(value["actor"], "Named following operator", 160),
            "Keep the exact named operator in the input")
    review = value["review"]
    require(isinstance(review, dict) and set(review) == {"decision", "note"} and review["decision"] == "deferred",
            "Author the deferred substantive review for this following technical capture")
    text(review["note"], "Named following review note", 8000)
    return value


def descriptor(path, maximum=4 * 1024 ** 3):
    return {"name": path.name, "bytes": path.stat().st_size, "sha256": file_digest(path, maximum)}


def original_case(directory, config):
    result_path = directory / "results" / "native-receiving.json"
    require(file_digest(result_path, 64 * 1024 ** 2) == config["originalResultSha256"],
            "The selected complete original native result changed")
    original = load_json(result_path.read_bytes())
    require(original.get("schema") == NATIVE_SCHEMA and original.get("state") == "COMPLETE"
            and original.get("operationId") == config["originalOperationId"],
            "Select the completed original native receiving result")
    require(original["receiverWorkspaceSha256"] == config["workspaceSha256"]
            and original["receiver"]["id"] == config["base"]["id"]
            and original["receiver"]["revision"] <= config["base"]["revision"],
            "Continue the original recipient and its existing plan history")
    require(descriptor(directory / "document-evidence.zip") == original["packet"],
            "Preserve the complete original packet beside its original result")
    with IatiWorkspace(directory / "sender") as sender:
        api = sender.document_evidence
        require(sender.publishing.context()["workspaceSha256"] == original["senderWorkspaceSha256"]
                and selection_key(api.plan(original["sender"]["id"])) == original["sender"],
                "The completed original sending workspace changed")
        for expected in original["observations"]:
            actual = api.observation(expected["id"])
            require(all(actual[key] == expected[key] for key in expected),
                    "An original terminal observation changed")
        require(api.comparison(original["comparisonId"])["id"] == original["comparisonId"],
                "The original historical comparison is missing")
    return original


def verify_history(api, config, original):
    base = api.plan(config["base"]["id"], config["base"]["revision"])
    require(selection_key(base) == config["base"],
            "The explicit following base is a different saved recipient edition")
    history = api.history(base["id"])
    require([p["revision"] for p in history] == list(range(1, len(history) + 1)),
            "The complete original plan history is not contiguous")
    require(selection_key(history[original["receiver"]["revision"] - 1]) == original["receiver"],
            "The original recipient's local note is absent from this plan history")
    for before, after in zip(history, history[1:]):
        require(after["previousRecordSha256"] == before["recordSha256"],
                "The original evidence history changed its linear parent")
    allowed = {
        config["operationId"]: "observe",
        config["operationId"] + "-review": "review",
    }
    later = history[base["revision"]:]
    require(len(later) <= 2 and all(allowed.get(p["event"]["requestId"]) == p["event"]["action"] for p in later),
            "Reopen the actual current recipient before selecting another following operation")
    for current in later:
        require(all(current[key] == base[key] for key in ("name", "notes", "selection", "documents", "limits")),
                "This following operation must preserve the original selected source and notes")
    require(base["limits"] == config["limits"],
            "The explicit capture limits differ from the saved original selection")
    row = next((r for r in base["documents"] if r["id"] == config["rowId"]), None)
    require(row is not None and row["url"] == config["publishedUrl"],
            "The selected row does not carry that exact original literal URL")
    parent = api.ws.organisation.plan(base["selection"]["id"], base["selection"]["revision"])
    require(parent["sourceId"] == original["sourceSha256"],
            "The selected document no longer names the original publisher source")
    reviews = [p["review"] for p in history[:base["revision"]] if p.get("review")]
    require(bool(reviews), "Reopen the original complete named review before continuing it")
    carried = reviews[-1]
    require({x["rowId"] for x in carried["decisions"]} == {x["id"] for x in base["documents"]},
            "Carry exactly the complete original named decision set")
    return base, history[:base["revision"]], carried


def complete_observation(api, observed, request, config):
    require(observed["requestId"] == request["requestId"]
            and observed["planId"] == config["base"]["id"]
            and observed["rowIds"] == [config["rowId"]]
            and observed["publishedUrl"] == config["publishedUrl"]
            and observed["actor"] == config["actor"],
            "The retained observation belongs to a different explicit public request")
    require(observed["documentComplete"] is True and observed.get("body")
            and observed["body"]["complete"] is True and observed["body"]["bytes"] > 0,
            "The recorded request contains no complete document body; retain this result and select a working acquisition route for a new explicit observation")
    body = api.body(observed["id"])
    require(all(body[key] == observed["body"][key] for key in observed["body"]),
            "The full native response body differs from its retained observation")
    return body


def validate_completed(directory, phase, config, original, value):
    require(value.get("schema") == NATIVE_SCHEMA and value.get("state") == "COMPLETE"
            and value.get("operationId") == config["operationId"]
            and value.get("following", {}).get("originalResultSha256") == config["originalResultSha256"]
            and value["following"].get("base") == config["base"],
            "The completed following result belongs to different original input")
    require(descriptor(phase / "document-evidence.zip") == value["packet"],
            "The complete following packet changed")
    require(descriptor(phase / "results" / value["following"]["nativeBody"]["name"])
            == value["following"]["nativeBody"], "The full native document copy changed")
    for alias, path in (("sender", directory / "receiver"), ("receiver", phase / "receiver")):
        with IatiWorkspace(path) as workspace:
            api = workspace.document_evidence
            require(workspace.publishing.context()["workspaceSha256"] == value[alias + "WorkspaceSha256"]
                    and selection_key(api.plan(value[alias]["id"])) == value[alias],
                    "The selected following workspace advanced; reopen its current retained history")
            for expected in value["observations"]:
                actual = api.observation(expected["id"])
                require(all(actual[key] == expected[key] for key in expected),
                        "A complete following observation changed during reopening")
                if actual["body"] is not None:
                    api.body(actual["id"])
            require(selection_key(api.plan(original["receiver"]["id"], original["receiver"]["revision"]))
                    == original["receiver"], "The recipient's original local-note edition was lost")
            captured = api.observation(value["following"]["observationId"])
            request = load_json((phase / "requests" / "observation-1.json").read_bytes())
            body = complete_observation(api, captured, request, config)
            require(body["bytes"] == value["following"]["nativeBody"]["bytes"]
                    and body["sha256"] == value["following"]["nativeBody"]["sha256"],
                    "The reopened native body differs from the original following observation")
    return value


def reopen(directory, phase, config, original):
    path = phase / "results" / "native-receiving.json"
    if not path.exists():
        return None
    return validate_completed(directory, phase, config, original, load_json(path.read_bytes()))


def native_following(directory, phase, config, original):
    results = physical_directory(phase / "results")
    existing = reopen(directory, phase, config, original)
    if existing is not None:
        print(json.dumps({"state": "FOLLOWING_REOPENED", "operationId": config["operationId"],
                          "packet": existing["packet"]}), flush=True)
        return existing
    op, actor = config["operationId"], config["actor"]
    stage = "original-recipient-history"
    try:
        with IatiWorkspace(directory / "receiver") as sender:
            api = sender.document_evidence
            require(sender.publishing.context()["workspaceSha256"] == config["workspaceSha256"],
                    "The following sender must be the original receiving workspace")
            base, prior_history, carried_review = verify_history(api, config, original)
            exact_json(results / "base-plan.json", base)
            old_observations = [api.observation(i) for i in base["observationIds"]]
            exact_json(results / "base-observations.json", old_observations)
            observe_request = stable_request(phase, "observation-1", lambda: {
                "requestId": op, "id": base["id"], "expectedRevision": base["revision"],
                "rowIds": [config["rowId"]], "acknowledgeNewObservation": True, "actor": actor,
            })
            require(observe_request == {
                "requestId": op, "id": base["id"], "expectedRevision": base["revision"],
                "rowIds": [config["rowId"]], "acknowledgeNewObservation": True, "actor": actor,
            }, "The retained following capture input changed")
            stage = "one-explicit-public-observation"
            captured = api.observe(observe_request)
            require(captured.get("state") != "ACQUIRING",
                    "The same original acquisition still has an active owner")
            exact_json(results / "observation-1.json", captured)
            observed = captured["observation"]
            body = complete_observation(api, observed, observe_request, config)
            body_file = output_file(body, results / body["name"])
            native_body = {key: body_file[key] for key in ("name", "bytes", "sha256")}
            require(captured["plan"]["observationIds"] == base["observationIds"] + [observed["id"]]
                    and captured["plan"]["previousRecordSha256"] == base["recordSha256"],
                    "The new observation did not extend the complete original history")

            stage = "complete-carried-named-review"
            decisions = []
            for previous in carried_review["decisions"]:
                if previous["rowId"] == config["rowId"]:
                    decisions.append({"rowId": previous["rowId"], "observationId": observed["id"],
                                      **deepcopy(config["review"])})
                else:
                    decisions.append(deepcopy(previous))
            review_request = stable_request(phase, "evidence-review", lambda: {
                "requestId": op + "-review", "id": base["id"],
                "expectedRevision": captured["plan"]["revision"], "actor": actor,
                "note": "Following technical capture with the complete prior named decision set carried forward.",
                "decisions": decisions,
            })
            require(review_request["decisions"] == decisions
                    and review_request["expectedRevision"] == captured["plan"]["revision"],
                    "The retained complete following review differs from its authored decisions")
            latest = api.review(review_request)
            require(latest["revision"] == base["revision"] + 2
                    and latest["previousRecordSha256"] == captured["plan"]["recordSha256"]
                    and all(latest[key] == base[key] for key in ("name", "notes", "selection", "documents", "limits")),
                    "The reviewed following edition changed the original notes or selected source")

            stage = "historical-document-comparison"
            compare_request = stable_request(phase, "evidence-compare", lambda: {
                "requestId": op + "-compare",
                "before": {"id": base["id"], "revision": base["revision"]},
                "after": {"id": latest["id"], "revision": latest["revision"]},
                "actor": actor,
                "notes": "Original recipient edition compared with its following complete document observation and named review.",
            })
            compared = api.compare(compare_request)
            require(compared["before"] == selection_key(base)
                    and compared["after"] == selection_key(latest)
                    and compared["summary"]["pairs"] == len(base["documents"]),
                    "The saved comparison does not cover the same complete original document selection")
            exact_json(results / "following-evidence-comparison.json", compared)
            correction = api.correction(latest["id"], latest["revision"])
            exact_json(results / "following-url-correction-draft.json", correction)

            stage = "retained-request-replay"
            for action, request, expected in (
                ("observe", observe_request, captured), ("review", review_request, latest),
                ("compare", compare_request, compared),
            ):
                recorded = api.request(request["requestId"])
                require(recorded["state"] == "RECORDED" and recorded["action"] == action
                        and recorded["input"] == request and recorded["result"] == expected,
                        "A following request differs from its original retained result")
                require(getattr(api, action)(request) == expected,
                        "An original following request replay changed its historical result")
            require(api.history(base["id"])[:base["revision"]] == prior_history
                    and [api.observation(o["id"]) for o in old_observations] == old_observations
                    and selection_key(api.plan(base["id"])) == selection_key(latest),
                    "Following request replay changed the original history or current selection")

            stage = "complete-following-export"
            for kind in ("report", "register", "plan") + (("correction",) if correction["request"] else ()):
                selected_file = api.file({"id": latest["id"], "revision": latest["revision"], "kind": kind})
                output_file(selected_file, results / selected_file["name"])
            packet = phase / "document-evidence.zip"
            exported = api.export({"id": latest["id"], "revision": latest["revision"], "output": packet})
            require(api.export({"id": latest["id"], "revision": latest["revision"], "output": packet})["sha256"]
                    == exported["sha256"], "The full following export did not reopen identically")
            observations = [api.observation(i) for i in latest["observationIds"]]
            sender_identity = sender.publishing.context()["workspaceSha256"]

        stage = "independent-complete-following-receiving"
        receiver_path = phase / "receiver"
        if not receiver_path.exists():
            with IatiWorkspace(receiver_path, create=True):
                pass
        with IatiWorkspace(receiver_path) as receiver:
            api = receiver.document_evidence
            received = api.receive({"path": packet})
            require(selection_key(received["plan"]) == selection_key(latest),
                    "Independent following receiving changed the selected complete edition")
            require(api.history(base["id"])[:base["revision"]] == prior_history
                    and [api.observation(o["id"]) for o in observations] == observations,
                    "Independent receiving lost original history or captured document bytes")
            full = api.body(observed["id"])
            require(full["bytes"] == native_body["bytes"] and full["sha256"] == native_body["sha256"],
                    "The independently received document body changed")
            receiving_request = stable_request(phase, "receiver-note", lambda: {
                "requestId": op + "-recipient-note", "id": latest["id"],
                "expectedRevision": latest["revision"], "name": latest["name"],
                "notes": latest["notes"] + "\nIndependent recipient reopened the complete following document packet.",
                "actor": actor,
            })
            receiving_note = api.note(receiving_request)
            again = api.receive({"path": packet})
            require(selection_key(again["plan"]) == selection_key(latest)
                    and selection_key(again["currentPlan"]) == selection_key(receiving_note),
                    "Following packet replay displaced the independent recipient's local note")
            receiver_identity = receiver.publishing.context()["workspaceSha256"]

        value = {
            "schema": NATIVE_SCHEMA, "state": "COMPLETE", "operationId": op,
            "sourceSha256": original["sourceSha256"],
            "originalDocumentRows": original["originalDocumentRows"],
            "selectedDocumentRows": len(latest["documents"]),
            "observations": [{key: o[key] for key in ("id", "state", "outcome", "documentComplete", "body")}
                             for o in observations],
            "sender": selection_key(latest), "receiver": selection_key(receiving_note),
            "senderWorkspaceSha256": sender_identity, "receiverWorkspaceSha256": receiver_identity,
            "comparisonId": compared["id"],
            "packet": {"name": packet.name, "bytes": exported["bytes"], "sha256": exported["sha256"]},
            "correctionPrepared": correction["request"] is not None,
            "following": {
                "schema": FOLLOWING_SCHEMA, "base": selection_key(base),
                "originalOperationId": original["operationId"],
                "originalResultSha256": config["originalResultSha256"],
                "originalPacket": original["packet"], "rowId": config["rowId"],
                "publishedUrl": config["publishedUrl"], "observationId": observed["id"],
                "documentComplete": observed["documentComplete"], "nativeBody": native_body,
                "carriedReviewId": carried_review["id"],
                "preservedObservationIds": base["observationIds"],
                "comparisonSummary": compared["summary"],
                "originalRecipient": original["receiver"],
            },
            "semantics": "Complete public document capture, named deferred review, original recipient history, full portable export and independent receiving.",
        }
        stage = "closed-following-workspace-reopen"
        validate_completed(directory, phase, config, original, value)
        original_case(directory, config)
        exact_json(results / "native-receiving.json", value)
        print(json.dumps(value, ensure_ascii=False), flush=True)
        return value
    except Exception as error:
        failure = {"schema": FOLLOWING_SCHEMA, "state": "INTERRUPTED", "operationId": op,
                   "phase": stage, "error": type(error).__name__, "message": str(error)[:4000]}
        exact_json(results / ("interrupted-" + digest(json_bytes(failure)) + ".json"), failure)
        raise


def run(config, *, connected=False, node="node", mcp_directory=None,
        playwright_module=None, chromium=None):
    original_path = Path(config["caseDirectory"])
    require(original_path.is_dir(), "Select the retained original case; do not initialize another one")
    directory = physical_directory(original_path)
    with case_owner(directory):
        phase = physical_directory(directory / "following" / config["operationId"])
        # Physical relocation changes a host path, never the selected operation.
        definition = {key: value for key, value in config.items() if key != "caseDirectory"}
        exact_json(phase / "original-input.json", definition)
        exact_json(phase / ("runtime-input-" + digest(json_bytes(config)) + ".json"), config)
        original = original_case(directory, config)
        result = native_following(directory, phase, config, original)
        if connected:
            require(mcp_directory is not None, "Use the complete original Merchant source directory")
            connected_result = run_connected(
                {"operationId": config["operationId"], "directory": str(phase)},
                node=node, mcp_directory=mcp_directory,
                playwright_module=playwright_module, chromium=chromium,
                workspace_paths={"sender": directory / "receiver", "receiver": phase / "receiver"},
            )
            return {"native": result, "connected": connected_result}
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--connected", action="store_true")
    parser.add_argument("--node", default="node")
    parser.add_argument("--mcp-directory")
    parser.add_argument("--playwright-module")
    parser.add_argument("--chromium")
    args = parser.parse_args()
    run(configuration(args.config), connected=args.connected, node=args.node,
        mcp_directory=args.mcp_directory, playwright_module=args.playwright_module, chromium=args.chromium)


if __name__ == "__main__":
    main()
