"""Complete original quotation handover between two selected Research workspaces.

The four phases are source, prepare, receive and reopen. Source exports an
already reviewed native programme. Prepare retains every member and returns
the actual destination review. Receive requires that displayed review SHA.
Reopen uses saved calls and complete local files without contacting a host.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path, PurePosixPath
import re
import signal
import sys
import threading

from stellar_forge_buyer import ResearchWorkspace
from stellar_forge_buyer.errors import BuyerError, StateError
from stellar_forge_buyer.research_customer_updates import _retained_json
from stellar_forge_buyer.research_quote_programmes import ResearchQuoteProgrammeHandover
from stellar_forge_buyer.research_quotes import _INPUT_LIMIT, _FILE_LIMIT, _object, _retained_input
from stellar_forge_buyer.research_workspace import ResearchError, _json, _request_id
from stellar_forge_buyer.storage import digest, lock, parse, private_directory, read

_SCHEMA = "stellar-forge.research-quote-programme-receiving-example.v1"
_PHASE = "stellar-forge.research-quote-programme-receiving-phase.v1"
_HASH = re.compile(r"[a-f0-9]{64}")
_WORKSPACE = re.compile(r"research_[a-f0-9]{64}")
_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}")
_PLAN_LIMIT = 1024 * 1024


def need(value, code):
    if not value:
        raise StateError(code)


def fields(value, names):
    need(isinstance(value, dict) and set(value) == set(names),
         "QUOTE_PROGRAMME_EXAMPLE_SELECTION_INVALID")


def exact_hash(value):
    need(isinstance(value, str) and _HASH.fullmatch(value),
         "QUOTE_PROGRAMME_EXAMPLE_HASH_REQUIRED")
    return value


def relative_file(value):
    need(isinstance(value, str) and value and "\\" not in value,
         "QUOTE_PROGRAMME_EXAMPLE_FILE_INVALID")
    path = PurePosixPath(value)
    need(not path.is_absolute() and str(path) == value and
         all(part not in {"", ".", ".."} for part in path.parts),
         "QUOTE_PROGRAMME_EXAMPLE_FILE_INVALID")
    return path


def file_selection(value):
    fields(value, {"file", "bytes", "sha256"})
    relative_file(value["file"]); exact_hash(value["sha256"])
    need(type(value["bytes"]) is int and 0 < value["bytes"] <= _INPUT_LIMIT,
         "QUOTE_PROGRAMME_EXAMPLE_INPUT_TOO_LARGE")


def selection(value):
    fields(value, {"schema", "operationId", "source", "destination", "handover", "receiving"})
    need(value["schema"] == _SCHEMA and isinstance(value["operationId"], str) and
         _NAME.fullmatch(value["operationId"]), "QUOTE_PROGRAMME_EXAMPLE_SELECTION_INVALID")
    for role in ("source", "destination"):
        chosen = value[role]
        fields(chosen, {"workspaceId", "casesWorkspaceId"})
        need(isinstance(chosen["workspaceId"], str) and _WORKSPACE.fullmatch(chosen["workspaceId"]) and
             isinstance(chosen["casesWorkspaceId"], str) and 0 < len(chosen["casesWorkspaceId"]) <= 200,
             "QUOTE_PROGRAMME_EXAMPLE_WORKSPACE_REQUIRED")
    need(value["source"]["workspaceId"] != value["destination"]["workspaceId"] and
         value["source"]["casesWorkspaceId"] != value["destination"]["casesWorkspaceId"],
         "QUOTE_PROGRAMME_EXAMPLE_INDEPENDENT_DESTINATION_REQUIRED")
    file_selection(value["handover"]); file_selection(value["receiving"])
    return value


def donor_path(parent, relative):
    target = parent
    for part in relative_file(relative).parts:
        target = target / part
        need(not target.is_symlink(), "QUOTE_PROGRAMME_EXAMPLE_SOURCE_SYMLINK")
    return target


def capture(root, path, expected_sha256):
    """Retain exact source bytes before any native call; a later donor may be absent."""
    expected_sha256 = exact_hash(expected_sha256)
    retained = root / "selection" / "input.json"
    selected = retained if retained.exists() or retained.is_symlink() else path
    body = read(selected, _PLAN_LIMIT)
    need(digest(body) == expected_sha256, "QUOTE_PROGRAMME_EXAMPLE_SELECTION_CHANGED")
    selection(_object(body))
    _, chosen = _retained_input(root / "selection", source=path,
        expected_sha256=expected_sha256, maximum=_PLAN_LIMIT)
    inputs = {}
    for role in ("handover", "receiving"):
        descriptor = chosen[role]
        donor = donor_path(path.parent, descriptor["file"])
        pins, value = _retained_input(root / "inputs" / role, source=donor,
            expected_sha256=descriptor["sha256"], maximum=_INPUT_LIMIT)
        need(pins["inputBytes"] == descriptor["bytes"],
             "QUOTE_PROGRAMME_EXAMPLE_INPUT_CHANGED")
        inputs[role] = {"pins": pins, "value": value}
    handover, receiving = inputs["handover"]["value"], inputs["receiving"]["value"]
    need(handover.get("schema") == "sf88-research-quotation-handover-request/v1" and
         isinstance(handover.get("programmeDirectory"), str) and
         Path(handover["programmeDirectory"]).is_absolute(),
         "QUOTE_PROGRAMME_EXAMPLE_HANDOVER_INPUT_INVALID")
    need(receiving.get("schema") == "sf88-research-quotation-programme-receiving/v1" and
         receiving.get("expectedWorkspaceId") == chosen["destination"]["workspaceId"] and
         receiving.get("expectedCasesWorkspaceId") == chosen["destination"]["casesWorkspaceId"],
         "QUOTE_PROGRAMME_EXAMPLE_RECEIVING_INPUT_CHANGED")
    return chosen, inputs


def call_id(chosen, phase):
    return _request_id(chosen["operationId"] + ":" + phase)


def request_path(workspace, identifier):
    # Read the existing ResearchWorkspace journal layout. Its original writer
    # remains responsible for request retention, attempts and replay.
    return workspace.directory / "calls" / digest(identifier.encode()) / "request.json"


def saved_pins(identifier, saved):
    need(saved.get("completed") is True and isinstance(saved.get("result"), dict),
         "QUOTE_PROGRAMME_EXAMPLE_CALL_INCOMPLETE")
    return {"callId": identifier, "requestSha256": digest(_json(saved["request"])),
            "resultSha256": digest(_json(saved["result"]))}


def original_call(workspace, client, identifier, execute, event):
    path = request_path(workspace, identifier)
    exists = path.exists() or path.is_symlink()
    if exists:
        prior = client.saved(identifier)
        if prior["completed"]:
            return prior["result"], saved_pins(identifier, prior)
    need(not event.is_set(), "QUOTE_PROGRAMME_EXAMPLE_CANCELLED")
    result = execute(not exists)
    saved = client.saved(identifier)
    need(saved.get("completed") is True and _json(saved["result"]) == _json(result),
         "QUOTE_PROGRAMME_EXAMPLE_CALL_CHANGED")
    return result, saved_pins(identifier, saved)


def original_saved(client, expected):
    saved = client.saved(expected["callId"])
    need(saved_pins(expected["callId"], saved) == expected,
         "QUOTE_PROGRAMME_EXAMPLE_CALL_CHANGED")
    return saved["result"]


def phase_record(root, chosen, expected_sha256, name, calls, result):
    record = {"schema": _PHASE, "phase": name, "operationId": chosen["operationId"],
              "selectionSha256": expected_sha256, "calls": calls, "result": result}
    _retained_json(root / "records" / (name + ".json"), record, limit=_FILE_LIMIT)
    return record


def read_phase(root, chosen, expected_sha256, name):
    value = parse(read(root / "records" / (name + ".json"), _FILE_LIMIT))
    need(isinstance(value, dict) and value.get("schema") == _PHASE and value.get("phase") == name and
         value.get("operationId") == chosen["operationId"] and
         value.get("selectionSha256") == expected_sha256 and
         isinstance(value.get("calls"), list) and isinstance(value.get("result"), dict),
         "QUOTE_PROGRAMME_EXAMPLE_PHASE_CHANGED")
    return value


def package_identity(chosen, value):
    exact_hash(value.get("manifestSha256"))
    selected = value.get("selection")
    need(isinstance(selected, dict) and selected.get("workspaceId") == chosen["source"]["workspaceId"] and
         selected.get("casesWorkspaceId") == chosen["source"]["casesWorkspaceId"],
         "QUOTE_PROGRAMME_EXAMPLE_SOURCE_CHANGED")
    return selected


def receiving_identity(chosen, value, source):
    need(value.get("workspaceId") == chosen["destination"]["workspaceId"] and
         value.get("request", {}).get("input", {}).get("expectedCasesWorkspaceId") ==
            chosen["destination"]["casesWorkspaceId"] and
         value.get("source", {}).get("manifestSha256") == source["manifestSha256"] and
         value.get("source", {}).get("selection") == source["selection"] and
         value.get("request", {}).get("source") == source["selection"],
         "QUOTE_PROGRAMME_EXAMPLE_DESTINATION_CHANGED")
    review = value.get("review")
    need(value.get("status") in {"REVIEWED", "COMPLETE"} and isinstance(review, dict) and
         review.get("workspaceId") == chosen["destination"]["workspaceId"] and
         review.get("casesWorkspaceId") == chosen["destination"]["casesWorkspaceId"] and
         review.get("manifestSha256") == source["manifestSha256"],
         "QUOTE_PROGRAMME_EXAMPLE_REVIEW_REQUIRED")
    exact_hash(review.get("reviewSha256"))
    return review


def received_identity(chosen, value, prepared, reviewed_sha256):
    review = prepared["review"]
    destination = value.get("destination", {})
    selected = prepared["source"]["selection"]
    need(value.get("schema") == "sf88-research-quotation-programme-received/v1" and
         value.get("reviewSha256") == reviewed_sha256 == review["reviewSha256"] and
         value.get("manifestSha256") == prepared["source"]["manifestSha256"] and
         value.get("source") == selected and
         value.get("workspaceId") == destination.get("workspaceId") == chosen["destination"]["workspaceId"] and
         value.get("casesWorkspaceId") == destination.get("casesWorkspaceId") ==
            chosen["destination"]["casesWorkspaceId"] and
         all(destination.get(key) == selected[key]
             for key in ("caseId", "dossierId", "projectId", "deliveryId", "revision")) and
         value.get("caseTransfer", {}).get("status") == "COMPLETE",
         "QUOTE_PROGRAMME_EXAMPLE_RECEIVED_CHANGED")
    return value


def workspace_options(root, chosen, role, *, checkout, node, connection, timeout, request_timeout_ms):
    return {"checkout": checkout, "node": node, "connection_file": connection,
            "directory": root / (role + "-client"),
            "expected_workspace_id": chosen[role]["workspaceId"],
            "timeout": timeout, "request_timeout_ms": request_timeout_ms}


def source_phase(root, chosen, inputs, selected_sha, options, event):
    identifier = call_id(chosen, "source-export")
    pins = inputs["handover"]["pins"]
    with ResearchWorkspace(**options) as workspace:
        client = workspace.quote_programmes()

        def execute(first):
            if first:
                configuration = workspace.quotes().configuration(cancel_event=event)
                need(configuration["workspaceId"] == chosen["source"]["workspaceId"] and
                     configuration["cases"]["workspaceId"] == chosen["source"]["casesWorkspaceId"],
                     "QUOTE_PROGRAMME_EXAMPLE_SOURCE_CHANGED")
            return client.export(root / "handover-operation", input_file=pins["inputFile"],
                expected_input_sha256=pins["inputSha256"], call_id=identifier,
                resume=True, cancel_event=event)

        result, call = original_call(workspace, client, identifier, execute, event)
        package = ResearchQuoteProgrammeHandover(result)
        package_identity(chosen, result)
        package.verify()
    # Complete phase publication follows closure of the borrowed client.
    return phase_record(root, chosen, selected_sha, "source", [call], result)


def prepare_phase(root, chosen, inputs, selected_sha, options, event):
    source = read_phase(root, chosen, selected_sha, "source")["result"]
    package_identity(chosen, source)
    copied_id, prepare_id = call_id(chosen, "package-copy"), call_id(chosen, "receiving-prepare")
    pins = inputs["receiving"]["pins"]
    with ResearchWorkspace(**options) as workspace:
        client = workspace.quote_programmes()
        copied, copied_call = original_call(workspace, client, copied_id,
            lambda first: client.copy(root / "copied-handover",
                source_directory=source["directory"], manifest_sha256=source["manifestSha256"],
                call_id=copied_id, resume=True, cancel_event=event), event)
        package = ResearchQuoteProgrammeHandover(copied)
        need(package.selection == source["selection"] and
             copied["manifestSha256"] == source["manifestSha256"],
             "QUOTE_PROGRAMME_EXAMPLE_COPY_CHANGED")
        result, prepared_call = original_call(workspace, client, prepare_id,
            lambda first: client.prepare_receiving(root / "receiving-operation",
                source_directory=copied["directory"], manifest_sha256=copied["manifestSha256"],
                input_file=pins["inputFile"], expected_input_sha256=pins["inputSha256"],
                call_id=prepare_id, resume=True, cancel_event=event), event)
        receiving_identity(chosen, result, source)
    return phase_record(root, chosen, selected_sha, "prepared", [copied_call, prepared_call], result)


def receive_phase(root, chosen, selected_sha, options, event, review_sha256):
    prepared = read_phase(root, chosen, selected_sha, "prepared")
    result = prepared["result"]
    review_sha256 = exact_hash(review_sha256)
    need(review_sha256 == result.get("review", {}).get("reviewSha256"),
         "QUOTE_PROGRAMME_EXAMPLE_REVIEW_CHANGED")
    approval = {"operationId": chosen["operationId"], "selectionSha256": selected_sha,
                "preparedSha256": digest(_json(prepared)), "reviewSha256": review_sha256}
    _retained_json(root / "records" / "approval.json", approval, limit=_PLAN_LIMIT)
    identifier = call_id(chosen, "receiving-apply")
    with ResearchWorkspace(**options) as workspace:
        client = workspace.quote_programmes()
        original = original_saved(client, prepared["calls"][1])
        need(_json(original) == _json(result), "QUOTE_PROGRAMME_EXAMPLE_REVIEW_CHANGED")
        received, call = original_call(workspace, client, identifier,
            lambda first: client.receive(root / "receiving-operation",
                review_sha256=review_sha256, call_id=identifier,
                resume=True, cancel_event=event), event)
        received_identity(chosen, received, result, review_sha256)
    return phase_record(root, chosen, selected_sha, "received", [call], received)


def reopen_phase(root, chosen, selected_sha, options):
    prepared = read_phase(root, chosen, selected_sha, "prepared")
    received = read_phase(root, chosen, selected_sha, "received")
    approval = parse(read(root / "records" / "approval.json", _PLAN_LIMIT))
    need(approval == {"operationId": chosen["operationId"], "selectionSha256": selected_sha,
                     "preparedSha256": digest(_json(prepared)),
                     "reviewSha256": received["result"].get("reviewSha256")},
         "QUOTE_PROGRAMME_EXAMPLE_REVIEW_CHANGED")
    # saved() verifies original inputs, control replies and complete receiving
    # files. Neither a live host nor the departed source/copy donor is consulted.
    with ResearchWorkspace(**options) as workspace:
        client = workspace.quote_programmes()
        original = original_saved(client, prepared["calls"][1])
        final = original_saved(client, received["calls"][0])
        need(_json(original) == _json(prepared["result"]) and _json(final) == _json(received["result"]),
             "QUOTE_PROGRAMME_EXAMPLE_CALL_CHANGED")
        received_identity(chosen, final, original, approval["reviewSha256"])
        package = ResearchQuoteProgrammeHandover.reopen(
            final["sourceDirectory"], expected_manifest_sha256=final["manifestSha256"])
        need(package.selection == final["source"], "QUOTE_PROGRAMME_EXAMPLE_SOURCE_CHANGED")
        verified = package.verify()
    return {"schema": "stellar-forge.research-quote-programme-reopened.v1",
            "operationId": chosen["operationId"], "selectionSha256": selected_sha,
            "receiving": final, "package": verified}


def operate(*, phase, selection_file, expected_selection_sha256, directory, checkout,
            source_connection=None, destination_connection=None, review_sha256=None,
            node="node", timeout=900, request_timeout_ms=120000, cancel_event=None):
    need(phase in {"source", "prepare", "receive", "reopen"}, "QUOTE_PROGRAMME_EXAMPLE_PHASE_INVALID")
    root = private_directory(Path(directory).expanduser().absolute())
    event = cancel_event if cancel_event is not None else threading.Event()
    with lock(root):
        need(not any((root / name).exists() or (root / name).is_symlink()
                     for name in ("programme.json", "package-request.json", "client.json", "request.json")),
             "QUOTE_PROGRAMME_EXAMPLE_DISTINCT_DIRECTORY_REQUIRED")
        chosen, inputs = capture(root, Path(selection_file).expanduser().absolute(), expected_selection_sha256)
        role = "source" if phase == "source" else "destination"
        options = workspace_options(root, chosen, role, checkout=checkout, node=node,
            connection=source_connection if role == "source" else destination_connection,
            timeout=timeout, request_timeout_ms=request_timeout_ms)
        if phase == "source":
            return source_phase(root, chosen, inputs, expected_selection_sha256, options, event)
        if phase == "prepare":
            return prepare_phase(root, chosen, inputs, expected_selection_sha256, options, event)
        if phase == "receive":
            return receive_phase(root, chosen, expected_selection_sha256, options, event, review_sha256)
        return reopen_phase(root, chosen, expected_selection_sha256, options)


def parser():
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("phase", choices=("source", "prepare", "receive", "reopen"))
    value.add_argument("--selection", required=True, help="Complete original six-field selection JSON.")
    value.add_argument("--selection-sha256", required=True)
    value.add_argument("--directory", required=True, help="Private example operation root, separate from native roots.")
    value.add_argument("--checkout", required=True, help="Original installed Node source; reopen starts no process.")
    value.add_argument("--source-connection")
    value.add_argument("--destination-connection")
    value.add_argument("--review-sha256", help="Actual displayed destination review; required for receive.")
    value.add_argument("--node", default="node")
    value.add_argument("--timeout", type=float, default=900)
    value.add_argument("--request-timeout-ms", type=int, default=120000)
    value.add_argument("--output", help="Exclusive full JSON output; an existing exact copy is reopened.")
    return value


def main(argv=None):
    arguments = parser().parse_args(argv)
    event, handlers = threading.Event(), {}
    if threading.current_thread() is threading.main_thread():
        for kind in (signal.SIGINT, signal.SIGTERM):
            handlers[kind] = signal.signal(kind, lambda *_: event.set())
    try:
        result = operate(phase=arguments.phase, selection_file=arguments.selection,
            expected_selection_sha256=arguments.selection_sha256, directory=arguments.directory,
            checkout=arguments.checkout, source_connection=arguments.source_connection,
            destination_connection=arguments.destination_connection, review_sha256=arguments.review_sha256,
            node=arguments.node, timeout=arguments.timeout,
            request_timeout_ms=arguments.request_timeout_ms, cancel_event=event)
        if arguments.output:
            _retained_json(Path(arguments.output).expanduser().absolute(), result, limit=_FILE_LIMIT)
        need(not event.is_set(), "QUOTE_PROGRAMME_EXAMPLE_CANCELLED")
        print(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")))
        return 0
    except (BuyerError, OSError, ValueError) as error:
        message = {"error": getattr(error, "code", type(error).__name__),
                   "detail": str(error), "directory": str(Path(arguments.directory).expanduser().absolute()),
                   "phase": arguments.phase}
        if isinstance(error, ResearchError):
            message.update(requestId=error.request_id, record=error.record)
        try:
            print(json.dumps(message, ensure_ascii=False, allow_nan=False), file=sys.stderr)
        except OSError:
            pass
        return 2
    finally:
        for kind, handler in handlers.items():
            signal.signal(kind, handler)


if __name__ == "__main__":
    raise SystemExit(main())
