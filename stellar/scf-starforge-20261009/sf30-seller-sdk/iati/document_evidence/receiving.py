#!/usr/bin/env python3
"""MIT. Reusable complete original document-evidence receiving programme.

Run with one explicit config. It does not select new URLs or refetch recorded
requests on replay. Reviews are caller-authored decisions, never inferred from
HTTP success. The original workspace remains the only source/evidence engine.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import tempfile

HERE = Path(__file__).resolve().parent
# Direct execution must not let this package's workspace.py shadow the
# original shared XML workspace module imported by iati_workspace.
sys.path[:] = [entry for entry in sys.path if Path(entry or os.getcwd()).resolve() != HERE]
sys.path.insert(0, str(HERE.parent))
from iati_workspace import IatiWorkspace, InputError, json_bytes, load_json
from workspace import digest, checked_id, file_digest, private_write, sync_dir
from organisation_cli import output_file
from document_evidence.workspace import selection_key, number, text


def physical_directory(value):
    path = Path(value).expanduser().absolute()
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = path.stat()
    if path.is_symlink() or path.resolve() != path or not stat.S_ISDIR(info.st_mode) or os.name == "posix" and (info.st_uid != os.getuid() or info.st_mode & 0o077):
        raise InputError("Keep the original receiving case in one real private directory")
    return path


def exact(path, raw):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        if file_digest(path, 64 * 1024 * 1024) != digest(raw):
            raise InputError("Existing receiving output belongs to different original bytes: " + path.name)
        return path
    descriptor, selected = tempfile.mkstemp(prefix=".document-receiving-", dir=path.parent)
    temporary = Path(selected)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(raw); output.flush(); os.fsync(output.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            if file_digest(path, 64 * 1024 * 1024) != digest(raw):
                raise InputError("Concurrent receiving output differs")
        sync_dir(path.parent)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def exact_json(path, value):
    return exact(path, json_bytes(value))


@contextmanager
def case_owner(directory):
    path = directory / ".receiving.lock"
    fd = os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_mode & 0o077:
            raise InputError("The original receiving lock is not a private regular file")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise InputError("This complete original receiving case already has a live owner") from error
        yield
    finally:
        os.close(fd)


def stable_request(directory, name, build):
    path = directory / "requests" / (name + ".json")
    if path.exists():
        return load_json(path.read_bytes())
    value = build()
    exact_json(path, value)
    return value


def config_file(filename):
    value = load_json(Path(filename).read_bytes())
    required = {"operationId", "directory", "sourceFile", "sourceSha256", "sourceUrl", "sourceRetrievedAt",
                "organisationName", "assessment", "documentUrls", "reviews", "limits", "actor"}
    if not isinstance(value, dict) or set(value) != required:
        raise InputError("Use the complete explicit document receiving configuration")
    from publishing import REQUEST
    if not isinstance(value["operationId"], str) or not REQUEST.fullmatch(value["operationId"]) or len(value["operationId"]) > 110:
        raise InputError("Choose one original receiving operation ID up to110 characters")
    checked_id(value["sourceSha256"])
    text(value["actor"], "Named receiving operator", 160)
    urls = value["documentUrls"]
    if not isinstance(urls, list) or not 1 <= len(urls) <= 20 or any(not isinstance(url, str) for url in urls) or len(set(urls)) != len(urls):
        raise InputError("Select one to20 distinct original literal document URLs explicitly")
    if not isinstance(value["reviews"], dict) or set(value["reviews"]) != set(urls):
        raise InputError("Each selected original URL needs its explicit caller-authored review")
    return value



def reopen_completed(directory, config):
    path = directory / "results" / "native-receiving.json"
    if not path.exists():
        return None
    result = load_json(path.read_bytes())
    if (not isinstance(result, dict) or result.get("schema") != "stellar-forge.iati-document-native-receiving.v1"
            or result.get("state") != "COMPLETE" or result.get("operationId") != config["operationId"]
            or result.get("sourceSha256") != config["sourceSha256"]):
        raise InputError("The retained complete native result belongs to a different original case")
    packet = directory / "document-evidence.zip"
    if packet.stat().st_size != result["packet"]["bytes"] or file_digest(packet, 4 * 1024 ** 3) != result["packet"]["sha256"]:
        raise InputError("The complete original evidence packet is missing or changed")
    for alias in ("sender", "receiver"):
        with IatiWorkspace(directory / alias) as workspace:
            if (workspace.publishing.context()["workspaceSha256"] != result[alias + "WorkspaceSha256"]
                    or selection_key(workspace.document_evidence.plan(result[alias]["id"])) != result[alias]):
                raise InputError("The current original receiving workspace differs from its complete result")
            if alias == "sender":
                for item in result["observations"]:
                    observation = workspace.document_evidence.observation(item["id"])
                    if any(observation[key] != item[key] for key in ("id", "state", "outcome", "documentComplete", "body")):
                        raise InputError("A retained original document observation changed")
                if workspace.document_evidence.comparison(result["comparisonId"])["id"] != result["comparisonId"]:
                    raise InputError("The original saved comparison is missing")
    print(json.dumps({"state": "NATIVE_REOPENED", "operationId": config["operationId"],
                      "packet": result["packet"]}), flush=True)
    return result


def run(config):
    directory = physical_directory(config["directory"])
    source = Path(config["sourceFile"]).expanduser().absolute()
    raw = source.read_bytes()
    if digest(raw) != config["sourceSha256"]:
        raise InputError("The complete original publisher source changed")
    with case_owner(directory):
        exact_json(directory / "original-input.json", config)
        completed = reopen_completed(directory, config)
        if completed is not None:
            return completed
        op, actor = config["operationId"], config["actor"]
        paths = {"sender": directory / "sender", "receiver": directory / "receiver"}
        results = directory / "results"
        results.mkdir(mode=0o700, exist_ok=True)
        for label in paths:
            if not paths[label].exists():
                with IatiWorkspace(paths[label], create=True):
                    pass
        phase = "original-publisher-selection"
        try:
            with IatiWorkspace(paths["sender"]) as sender:
                import io
                added = sender.add_source(io.BytesIO(raw), "Original selected IATI publisher XML", source.name)
                if added["id"] != config["sourceSha256"]:
                    raise InputError("The original publisher intake changed source identity")
                profile = sender.organisation.profile(added["id"])
                organisations = [o["key"] for o in profile["organisations"]]
                parent_request = stable_request(directory, "organisation-save", lambda: {
                    "requestId": op + "-organisation", "name": config["organisationName"],
                    "sourceId": added["id"], "organisationKeys": organisations,
                    "assessment": config["assessment"], "acquisition": {
                        "sourceUrl": config["sourceUrl"], "retrievedAt": config["sourceRetrievedAt"],
                        "licenceUrl": "", "licence": "", "notes": "Original public publisher source; exact acquisition receipt accompanies the complete installed example."},
                    "edits": [], "notes": "Document evidence receiving uses original literal publisher URLs without an automatic correction.",
                    "actor": actor})
                parent = sender.organisation.save(parent_request)
                rows, offset, snapshot = [], 0, None
                while True:
                    page = sender.organisation.rows({"id": parent["id"], "revision": parent["revision"],
                        "view": "source", "section": "documents", "offset": offset, "limit": 100,
                        **({"expectedSnapshot": snapshot} if snapshot else {})})
                    snapshot = page["snapshotSha256"]
                    rows.extend(page["rows"]); offset += len(page["rows"])
                    if offset >= page["total"]:
                        break
                    if not page["rows"]:
                        raise InputError("The original document register stopped before its complete end")
                chosen = [r for url in config["documentUrls"] for r in rows if r["url"] == url]
                if set(r["url"] for r in chosen) != set(config["documentUrls"]):
                    raise InputError("A selected literal document URL is absent from the original publisher edition")
                save_request = stable_request(directory, "evidence-save", lambda: {
                    "requestId": op + "-selection", "name": config["organisationName"] + " — document evidence",
                    "selection": {"id": parent["id"], "revision": parent["revision"], "view": "source", "expectedSnapshot": snapshot},
                    "documentRowIds": [r["id"] for r in chosen], "limits": config["limits"], "actor": actor,
                    "notes": "Explicit source-native operator receiving. No customer approval or publishing permission is inferred."})
                selected = sender.document_evidence.save(save_request)
                exact_json(results / "original-document-selection.json", selected)
                observations, original_requests = [], [("save", save_request, selection_key(selected))]
                phase = "actual-selected-document-acquisition"
                for index, url in enumerate(config["documentUrls"], 1):
                    request = stable_request(directory, "observation-" + str(index), lambda url=url, index=index: {
                        "requestId": op + "-observation-" + str(index), "id": selected["id"],
                        "expectedRevision": sender.document_evidence.plan(selected["id"])["revision"],
                        "rowIds": [r["id"] for r in chosen if r["url"] == url], "actor": actor})
                    value = sender.document_evidence.observe(request)
                    if value.get("state") == "ACQUIRING":
                        raise InputError("The same original document acquisition still has an active owner")
                    observations.append(value["observation"])
                    exact_json(results / ("observation-" + str(index) + ".json"), value)
                    original_requests.append(("observe", request, {"plan": selection_key(value["plan"]), "observation": value["observation"]["id"]}))
                phase = "named-document-review"
                def make_review():
                    by_url = {o["publishedUrl"]: o for o in observations}
                    decisions = []
                    for row in chosen:
                        authored = config["reviews"][row["url"]]
                        if not isinstance(authored, dict) or set(authored) - {"decision", "note", "correctedUrl"}:
                            raise InputError("The receiving review must be an explicit original named decision")
                        decisions.append({"rowId": row["id"], "observationId": by_url[row["url"]]["id"], **authored})
                    return {"requestId": op + "-review", "id": selected["id"],
                        "expectedRevision": sender.document_evidence.plan(selected["id"])["revision"],
                        "actor": actor, "note": "Caller-authored review of the exact recorded technical evidence; no favorable customer contact is asserted.",
                        "decisions": decisions}
                review_request = stable_request(directory, "evidence-review", make_review)
                reviewed = sender.document_evidence.review(review_request)
                original_requests.append(("review", review_request, selection_key(reviewed)))
                correction = sender.document_evidence.correction(reviewed["id"], reviewed["revision"])
                # The customer can inspect and apply this exact original request;
                # this programme does not silently change publisher XML.
                exact_json(results / "original-url-correction-draft.json", correction)
                note_request = stable_request(directory, "sender-note", lambda: {
                    "requestId": op + "-sender-note", "id": reviewed["id"],
                    "expectedRevision": sender.document_evidence.plan(reviewed["id"])["revision"],
                    "name": reviewed["name"], "notes": reviewed["notes"] + "\nComplete native receiving source and technical observations retained.",
                    "actor": actor})
                latest = sender.document_evidence.note(note_request)
                comparison_request = stable_request(directory, "evidence-compare", lambda: {
                    "requestId": op + "-compare", "before": {"id": reviewed["id"], "revision": reviewed["revision"]},
                    "after": {"id": latest["id"], "revision": latest["revision"]}, "actor": actor,
                    "notes": "Compare the same frozen document bodies across a following note-only edition; no second fetch."})
                compared = sender.document_evidence.compare(comparison_request)
                exact_json(results / "original-evidence-comparison.json", compared)
                phase = "original-request-replay"
                for action, request, expected in original_requests:
                    replay = getattr(sender.document_evidence, action)(request)
                    identity = {"plan": selection_key(replay["plan"]), "observation": replay["observation"]["id"]} if action == "observe" else selection_key(replay)
                    if identity != expected:
                        raise InputError("Original request replay changed a historical saved result")
                phase = "complete-native-export"
                packet = directory / "document-evidence.zip"
                exported = sender.document_evidence.export({"id": latest["id"], "revision": latest["revision"], "output": packet})
                if sender.document_evidence.export({"id": latest["id"], "revision": latest["revision"], "output": packet})["sha256"] != exported["sha256"]:
                    raise InputError("The original complete packet export did not reopen")
                for kind in ("report", "register", "plan"):
                    descriptor = sender.document_evidence.file({"id": latest["id"], "revision": latest["revision"], "kind": kind})
                    output_file(descriptor, results / descriptor["name"])
                for observed in observations:
                    if observed.get("body") is not None:
                        descriptor = sender.document_evidence.body(observed["id"])
                        output_file(descriptor, results / descriptor["name"])
                sender_identity = sender.publishing.context()["workspaceSha256"]
            phase = "independent-complete-receiving"
            with IatiWorkspace(paths["receiver"]) as receiver:
                received = receiver.document_evidence.receive({"path": packet})
                if selection_key(received["plan"]) != selection_key(latest):
                    raise InputError("Independent evidence receiving changed the selected original edition")
                receiver_request = stable_request(directory, "receiver-note", lambda: {
                    "requestId": op + "-recipient-note", "id": latest["id"],
                    "expectedRevision": receiver.document_evidence.plan(latest["id"])["revision"],
                    "name": latest["name"], "notes": latest["notes"] + "\nIndependent receiving operator reopened the original full packet.",
                    "actor": actor})
                receiving_note = receiver.document_evidence.note(receiver_request)
                rereceived = receiver.document_evidence.receive({"path": packet})
                if selection_key(rereceived["plan"]) != selection_key(latest) or selection_key(rereceived["currentPlan"]) != selection_key(receiving_note):
                    raise InputError("An older packet displaced later recipient work")
                receiver_identity = receiver.publishing.context()["workspaceSha256"]
            phase = "closed-workspace-reopen"
            with IatiWorkspace(paths["receiver"]) as receiver:
                if selection_key(receiver.document_evidence.plan(latest["id"])) != selection_key(receiving_note):
                    raise InputError("The receiving workspace did not reopen its latest retained revision")
            result = {"schema": "stellar-forge.iati-document-native-receiving.v1", "state": "COMPLETE",
                "operationId": op, "sourceSha256": config["sourceSha256"], "originalDocumentRows": len(rows),
                "selectedDocumentRows": len(chosen), "observations": [{"id": o["id"], "state": o["state"],
                    "outcome": o["outcome"], "documentComplete": o["documentComplete"],
                    "body": o["body"]} for o in observations], "sender": selection_key(latest),
                "receiver": selection_key(receiving_note), "senderWorkspaceSha256": sender_identity,
                "receiverWorkspaceSha256": receiver_identity, "comparisonId": compared["id"],
                "packet": {"name": packet.name, "bytes": exported["bytes"], "sha256": exported["sha256"]},
                "correctionPrepared": correction["request"] is not None,
                "semantics": "Original source, bounded actual observations, caller-authored review, exact historical replay and independent complete packet receiving. No customer acceptance or source publication is asserted."}
            exact_json(results / "native-receiving.json", result)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            return result
        except Exception as error:
            value = {"schema": "stellar-forge.iati-document-native-receiving.v1", "state": "INTERRUPTED",
                     "operationId": op, "phase": phase, "error": type(error).__name__, "message": str(error)[:4000]}
            exact_json(results / ("interrupted-" + digest(json_bytes(value)) + ".json"), value)
            raise


def run_connected(config, *, node, mcp_directory, playwright_module=None, chromium=None):
    """Keep the same native workspaces open through their real client/browser journey."""
    from contextlib import ExitStack
    import subprocess
    import threading
    from server import OperatorServer
    directory = physical_directory(config["directory"])
    private = physical_directory(directory / "private")
    output = physical_directory(directory / "connected")
    with case_owner(directory), ExitStack() as stack:
        servers, running, connection_files = [], [], []
        try:
            for alias in ("sender", "receiver"):
                workspace = stack.enter_context(IatiWorkspace(directory / alias))
                server = OperatorServer(workspace, port=0)
                servers.append(server)
                thread = threading.Thread(target=server.serve_forever, daemon=False)
                thread.start(); running.append((server, thread))
                # The whole case lock and original workspace lease establish
                # ownership. These ephemeral links belong only to this server.
                path = private / (alias + "-console.url")
                raw = (server.url + "\n").encode()
                if path.exists() or path.is_symlink():
                    info = path.lstat()
                    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_nlink != 1:
                        raise InputError("Preserve the original private console link custody")
                fd, temporary_name = tempfile.mkstemp(prefix=".console-", dir=private)
                temporary = Path(temporary_name)
                try:
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
                    os.replace(temporary, path); sync_dir(private)
                finally:
                    temporary.unlink(missing_ok=True)
                connection_files.append((path, raw))
            value = {"operationId": config["operationId"], "caseDirectory": str(directory),
                "iatiDirectory": str(HERE.parent), "mcpDirectory": str(Path(mcp_directory).resolve()),
                "senderConnectionFile": str(private / "sender-console.url"),
                "receiverConnectionFile": str(private / "receiver-console.url"),
                "outputDirectory": str(output), "exportsDirectory": str(directory / "merchant-exports")}
            if (playwright_module is None) != (chromium is None):
                raise InputError("Select both original Playwright module and Chromium executable for the browser journey")
            if playwright_module is not None:
                value["browser"] = {"playwrightModule": str(Path(playwright_module).resolve()),
                                    "executablePath": str(Path(chromium).resolve())}
            input_path = private / "connected-input.json"
            exact_json(input_path, value)
            child = subprocess.run([str(node), str(HERE / "receiving.mjs"), str(input_path)],
                cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            log = {"returncode": child.returncode, "stdout": child.stdout.decode("utf-8", "replace"),
                   "stderr": child.stderr.decode("utf-8", "replace")}
            exact_json(directory / "results" / ("connected-process-" + digest(json_bytes(log)) + ".json"), log)
            if child.returncode != 0:
                raise InputError("The same original connected receiving returned " + str(child.returncode) +
                                 ": " + log["stderr"][-4000:])
            result = load_json((output / "complete.json").read_bytes())
            if result.get("state") != "COMPLETE" or result.get("operationId") != config["operationId"]:
                raise InputError("The original connected journey did not retain its complete result")
            print(json.dumps({"state": "CONNECTED_COMPLETE", "operationId": config["operationId"],
                              "result": result}, ensure_ascii=False), flush=True)
            return result
        finally:
            # BaseServer.shutdown waits for serve_forever. A constructed server
            # whose thread failed to start must only be closed, never shut down.
            for server, thread in running:
                server.shutdown()
            for server, thread in running:
                thread.join()
            for server in servers:
                server.server_close()
            for path, raw in connection_files:
                if path.exists() and not path.is_symlink() and path.read_bytes() == raw:
                    path.unlink()
            sync_dir(private)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--connected", action="store_true", help="Continue the same case through its original SDK and Merchant")
    parser.add_argument("--node", default="node")
    parser.add_argument("--mcp-directory")
    parser.add_argument("--playwright-module")
    parser.add_argument("--chromium")
    args = parser.parse_args()
    config = config_file(args.config)
    run(config)
    if args.connected:
        if not args.mcp_directory:
            parser.error("--connected requires the original --mcp-directory")
        run_connected(config, node=args.node, mcp_directory=args.mcp_directory,
                      playwright_module=args.playwright_module, chromium=args.chromium)

if __name__ == "__main__":
    main()
