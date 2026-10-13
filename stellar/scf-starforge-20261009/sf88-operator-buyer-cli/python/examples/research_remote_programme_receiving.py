#!/usr/bin/env python3
"""Retained two-host receiving through the installed original remote SDK.

This example starts with an actual completed source ARCHIVE job. It exports the
whole source archive, transfers it through the existing native uploader, imports
and reviews it at the destination, applies only an explicitly selected review,
then verifies the complete retained files offline. It never starts a listener.

Run --help and read RESEARCH-REMOTE-PROGRAMMES.md before selecting real hosts.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import signal
import threading
import time
from uuid import uuid4

from stellar_forge_buyer.errors import StateError
from stellar_forge_buyer.research_remote_programmes import ResearchRemoteProgrammes, REMOTE_REPLY_LIMIT
from stellar_forge_buyer.storage import (
    digest, lock, parse, private_directory, read, sync_directory, write,
)

SCHEMA = "stellar-forge.research-remote-receiving-example.v1"
LIMIT = 16 * 1024 * 1024
HASH = re.compile(r"[a-f0-9]{64}")
UUID = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}")
WORKSPACE = re.compile(r"research_[a-f0-9]{64}")
ALIAS = re.compile(r"[a-z][a-z0-9_-]{0,63}")


def need(condition, code):
    if not condition:
        raise StateError(code)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def absolute(value):
    result = Path(os.path.abspath(os.path.expanduser(os.fspath(value))))
    need(not any(ord(c) < 32 or ord(c) == 127 for c in str(result)),
         "REMOTE_EXAMPLE_PATH_INVALID")
    return result


def same_file(path, data):
    """Use the original exclusive publisher; finish only matching stage links."""
    try:
        write(path, data, exclusive=True)
    except FileExistsError:
        need(read(path, len(data) + 1) == data, "REMOTE_EXAMPLE_SELECTION_CHANGED")
    original = path.lstat()
    if original.st_nlink > 1:
        for stage in path.parent.iterdir():
            if stage.name.startswith(".write-"):
                try:
                    current = stage.lstat()
                except FileNotFoundError:
                    continue
                if (current.st_dev, current.st_ino) == (original.st_dev, original.st_ino):
                    stage.unlink()
        need(path.lstat().st_nlink == 1, "REMOTE_EXAMPLE_PUBLICATION_CHANGED")
    sync_directory(path.parent)


def json_file(path, value):
    data = encoded(value)
    need(len(data) <= LIMIT, "REMOTE_EXAMPLE_RECORD_LIMIT")
    same_file(path, data)


def exact(value, names):
    need(isinstance(value, dict) and set(value) == set(names), "REMOTE_EXAMPLE_PLAN_INVALID")


def validate(plan, root):
    exact(plan, ["schema", "id", "source", "destination", "archive",
                 "transferId", "uploadId", "importId", "reviewId", "receiveId",
                 "receivingInput", "exportFile"])
    need(plan["schema"] == SCHEMA and UUID.fullmatch(plan["id"]), "REMOTE_EXAMPLE_PLAN_INVALID")
    for side in ("source", "destination"):
        exact(plan[side], ["alias", "workspaceId"])
        need(ALIAS.fullmatch(plan[side]["alias"]) and WORKSPACE.fullmatch(plan[side]["workspaceId"]),
             "REMOTE_EXAMPLE_WORKSPACE_INVALID")
    need(plan["source"]["alias"] != plan["destination"]["alias"] and
         plan["source"]["workspaceId"] != plan["destination"]["workspaceId"],
         "REMOTE_EXAMPLE_TWO_WORKSPACES_REQUIRED")
    exact(plan["archive"], ["id", "bytes", "sha256", "manifestSha256"])
    archive = plan["archive"]
    need(UUID.fullmatch(archive["id"]) and type(archive["bytes"]) is int and archive["bytes"] > 0 and
         HASH.fullmatch(archive["sha256"]) and HASH.fullmatch(archive["manifestSha256"]),
         "REMOTE_EXAMPLE_ARCHIVE_INVALID")
    ids = [plan[key] for key in ("transferId", "uploadId", "importId", "reviewId", "receiveId")]
    need(all(isinstance(value, str) and UUID.fullmatch(value) for value in ids) and
         len(set(ids + [archive["id"]])) == len(ids) + 1, "REMOTE_EXAMPLE_DISTINCT_IDS_REQUIRED")
    exact(plan["receivingInput"], ["path", "sha256"])
    need(HASH.fullmatch(plan["receivingInput"]["sha256"]), "REMOTE_EXAMPLE_INPUT_HASH_INVALID")
    for selected in (plan["receivingInput"]["path"], plan["exportFile"]):
        path = absolute(selected)
        need(str(path) == selected and path != root and root not in path.parents,
             "REMOTE_EXAMPLE_DISTINCT_PATH_REQUIRED")
    need(plan["receivingInput"]["path"] != plan["exportFile"],
         "REMOTE_EXAMPLE_DISTINCT_PATH_REQUIRED")
    return plan


def load_selection(root, plan_file=None, expected_sha256=None):
    selected = root / "selection.json"
    if selected.exists():
        record = parse(read(selected, LIMIT))
        raw = read(root / "plan.json", LIMIT)
        need(record.get("schema") == SCHEMA and digest(raw) == record.get("planSha256"),
             "REMOTE_EXAMPLE_SELECTION_CHANGED")
        if plan_file is not None:
            need(read(absolute(plan_file), LIMIT) == raw, "REMOTE_EXAMPLE_SELECTION_CHANGED")
    else:
        need(plan_file is not None, "REMOTE_EXAMPLE_PLAN_REQUIRED")
        raw = read(absolute(plan_file), LIMIT)
        record = {"schema": SCHEMA, "planSha256": digest(raw)}
    need(expected_sha256 is None or digest(raw) == expected_sha256, "REMOTE_EXAMPLE_SELECTION_CHANGED")
    plan = validate(parse(raw), root)
    input_file = root / "receiving-input.json"
    # Retain the complete actual destination selection before any host operation.
    source = input_file if input_file.exists() else absolute(plan["receivingInput"]["path"])
    body = read(source, LIMIT)
    need(digest(body) == plan["receivingInput"]["sha256"], "REMOTE_EXAMPLE_INPUT_CHANGED")
    value = parse(body)
    need(isinstance(value, dict) and value.get("requestId") == plan["reviewId"] and
         value.get("expectedWorkspaceId") == plan["destination"]["workspaceId"],
         "REMOTE_EXAMPLE_DESTINATION_CHANGED")
    same_file(root / "plan.json", raw)
    same_file(input_file, body)
    json_file(selected, record)
    return plan, record, value


class Course:
    def __init__(self, root, plan, selection, args, event):
        self.root, self.plan, self.selection = root, plan, selection
        self.args, self.event = args, event
        self.call_ids = []

    def call_id(self, name):
        return self.plan["id"] + ":" + name

    def client(self):
        return ResearchRemoteProgrammes(
            directory=self.root / "journal", checkout=self.args.checkout,
            configuration_file=self.args.configuration, node=self.args.node,
            timeout=self.args.timeout,
        )

    def call(self, client, side, command, arguments, name, *, file=None):
        need(not self.event.is_set(), "REMOTE_EXAMPLE_CANCELLED")
        selected = self.plan[side]
        value = client.invoke(
            selected["alias"], command, arguments, file=file,
            call_id=self.call_id(name), resume=self.args.recover, cancel_event=self.event,
        )
        need(value.workspace_id == selected["workspaceId"], "REMOTE_EXAMPLE_WORKSPACE_CHANGED")
        self.call_ids.append(self.call_id(name))
        return value

    def follow(self, client, side, job_input, name):
        """Keep the mutation ID; every new observation has a new local call ID."""
        current = self.call(client, side, "submit", {"id": job_input["id"], "input": job_input},
                            name + ":submit").json(limit=LIMIT)
        deadline = time.monotonic() + self.args.wait_seconds
        for index in range(10000):
            need(current.get("id") == job_input["id"], "REMOTE_EXAMPLE_JOB_CHANGED")
            if current.get("status") == "COMPLETE":
                return current
            # A saved SUBMIT is an old snapshot, including RETRY_REQUIRED. Read
            # the current original job before classifying it. UUIDs identify
            # fresh observations only; all mutation and native job IDs stay put.
            need(time.monotonic() < deadline, "REMOTE_EXAMPLE_JOB_STILL_RUNNING")
            if index:
                need(not self.event.wait(1), "REMOTE_EXAMPLE_CANCELLED")
            current = self.call(client, side, "job", {"id": job_input["id"]},
                                name + ":observe-" + str(uuid4())).json(limit=LIMIT)
            need(current.get("id") == job_input["id"], "REMOTE_EXAMPLE_JOB_CHANGED")
            if current.get("status") == "COMPLETE":
                return current
            if current.get("status") == "RETRY_REQUIRED":
                raise StateError("REMOTE_EXAMPLE_NATIVE_REVIEW_RETRY_REQUIRED")
            need(current.get("status") in ("READY", "RUNNING"), "REMOTE_EXAMPLE_JOB_STATE_INVALID")
        raise StateError("REMOTE_EXAMPLE_OBSERVATION_LIMIT")

    def phase_path(self, name):
        return self.root / ("phase-" + name + ".json")

    def phase(self, name, *, required=True):
        path = self.phase_path(name)
        if not path.exists():
            need(not required, "REMOTE_EXAMPLE_PREVIOUS_PHASE_REQUIRED")
            return None
        value = parse(read(path, LIMIT))
        need(value.get("schema") == SCHEMA and value.get("phase") == name and
             value.get("planSha256") == self.selection["planSha256"] and
             isinstance(value.get("callIds"), list), "REMOTE_EXAMPLE_PHASE_CHANGED")
        return value

    def reopen_phase(self, client, value):
        records = []
        for call_id in value["callIds"]:
            need(isinstance(call_id, str) and call_id.startswith(self.plan["id"] + ":"),
                 "REMOTE_EXAMPLE_PHASE_CHANGED")
            result = client.saved(call_id)
            records.append(result.verify())
        return {"phase": value, "calls": records}

    def finish(self, name, details):
        # Called only after the original client context has closed.
        value = {"schema": SCHEMA, "phase": name,
                 "planSha256": self.selection["planSha256"],
                 "callIds": list(dict.fromkeys(self.call_ids)), **details}
        json_file(self.phase_path(name), value)
        return value

    def source(self):
        prior = self.phase("source", required=False)
        with self.client() as client:
            if prior is not None:
                result = self.reopen_phase(client, prior)
            else:
                a = self.plan["archive"]
                metadata = self.call(client, "source", "archive", {"id": a["id"]},
                                     "source:archive").json(limit=LIMIT)
                need(metadata.get("workspaceId") == self.plan["source"]["workspaceId"] and
                     metadata.get("id") == a["id"] and
                     all(metadata.get(k) == a[k] for k in ("bytes", "sha256", "manifestSha256")),
                     "REMOTE_EXAMPLE_ARCHIVE_CHANGED")
                exported = self.call(client, "source", "export",
                    {"kind": "ARCHIVE", "id": a["id"], "bytes": a["bytes"], "sha256": a["sha256"]},
                    "source:export", file=self.plan["exportFile"])
                need(exported.exported_file is not None, "REMOTE_EXAMPLE_EXPORT_REQUIRED")
                exported.verify()
                self.call(client, "source", "transfer", {
                    "operationId": self.plan["transferId"], "archiveId": a["id"],
                    "bytes": a["bytes"], "sha256": a["sha256"], "manifestSha256": a["manifestSha256"],
                    "destination": self.plan["destination"]["alias"],
                    "destinationWorkspaceId": self.plan["destination"]["workspaceId"],
                    "uploadId": self.plan["uploadId"],
                }, "source:transfer")
                upload = self.call(client, "destination", "upload", {"id": self.plan["uploadId"]},
                                   "source:upload").json(limit=LIMIT)
                need(upload.get("state") == "COMPLETE" and upload.get("bytes") == a["bytes"] and
                     upload.get("sha256") == a["sha256"], "REMOTE_EXAMPLE_UPLOAD_INCOMPLETE")
                result = None
        return result if prior is not None else self.finish("source", {
            "archive": self.plan["archive"], "uploadId": self.plan["uploadId"],
            "exportCallId": self.call_id("source:export"),
        })

    def prepare(self, receiving_input):
        prior = self.phase("prepare", required=False)
        with self.client() as client:
            if prior is not None:
                result = self.reopen_phase(client, prior)
            else:
                self.reopen_phase(client, self.phase("source"))
                imported = self.follow(client, "destination", {
                    "id": self.plan["importId"], "kind": "IMPORT",
                    "uploadId": self.plan["uploadId"],
                    "manifestSha256": self.plan["archive"]["manifestSha256"],
                }, "prepare:import")
                need(imported.get("summary", {}).get("manifestSha256") ==
                     self.plan["archive"]["manifestSha256"], "REMOTE_EXAMPLE_MANIFEST_CHANGED")
                reviewed = self.follow(client, "destination", {
                    "id": self.plan["reviewId"], "kind": "RECEIVE_REVIEW",
                    "bundleId": self.plan["importId"],
                    "manifestSha256": self.plan["archive"]["manifestSha256"], "value": receiving_input,
                }, "prepare:review")
                review_sha = reviewed.get("summary", {}).get("reviewSha256")
                need(isinstance(review_sha, str) and HASH.fullmatch(review_sha), "REMOTE_EXAMPLE_REVIEW_REQUIRED")
                full = self.call(client, "destination", "receiving", {"id": self.plan["reviewId"]},
                                 "prepare:full-review")
                # The complete receiving view is retained, not reduced to only
                # the hash that will authorize its later original mutation.
                document = full.json(limit=REMOTE_REPLY_LIMIT)
                need(document.get("review", {}).get("reviewSha256") == review_sha,
                     "REMOTE_EXAMPLE_REVIEW_CHANGED")
                result = None
        return result if prior is not None else self.finish("prepare", {
            "reviewSha256": review_sha, "reviewCallId": self.call_id("prepare:full-review"),
            "instruction": "Open this call's complete reply.json; select its displayed review SHA explicitly.",
        })

    def receive(self, selected_sha):
        prepared = self.phase("prepare")
        need(selected_sha == prepared["reviewSha256"], "REMOTE_EXAMPLE_EXPLICIT_REVIEW_REQUIRED")
        prior = self.phase("receive", required=False)
        with self.client() as client:
            if prior is not None:
                result = self.reopen_phase(client, prior)
            else:
                self.reopen_phase(client, prepared)
                completed = self.follow(client, "destination", {
                    "id": self.plan["receiveId"], "kind": "RECEIVE",
                    "receivingId": self.plan["reviewId"], "reviewSha256": selected_sha,
                }, "receive:apply")
                native = self.call(client, "destination", "receiving", {"id": self.plan["reviewId"]},
                                   "receive:full-result")
                native.verify()
                result = None
        return result if prior is not None else self.finish("receive", {
            "reviewSha256": selected_sha, "completedJob": completed,
            "receivingCallId": self.call_id("receive:full-result"),
        })

    def reopen(self):
        # No checkout, configuration, host or donor is needed for these complete
        # saved replies and the complete source archive already exported locally.
        with ResearchRemoteProgrammes(directory=self.root / "journal") as client:
            results = [self.reopen_phase(client, self.phase(name))
                       for name in ("source", "prepare", "receive")]
            archive = client.saved(self.call_id("source:export"))
            need(archive.exported_file is not None, "REMOTE_EXAMPLE_EXPORT_REQUIRED")
            archive.verify()
        return {"schema": SCHEMA, "state": "VERIFIED_SAVED", "phases": results,
                "archive": archive.record["result"]["exportedFile"],
                "observation": "Saved completion and full bytes verified; no fresh host observation was requested."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("source", "prepare", "receive", "reopen"))
    parser.add_argument("--directory", required=True, help="Private example root, distinct from original native storage.")
    parser.add_argument("--plan", help="Complete initial plan JSON; exact bytes are retained before any operation.")
    parser.add_argument("--plan-sha256")
    parser.add_argument("--configuration", help="Original private two-host operator declaration on first use.")
    parser.add_argument("--checkout", help="Original installed Node source; omitted for completed offline reopens.")
    parser.add_argument("--node", default="node")
    parser.add_argument("--timeout", type=float, default=360)
    parser.add_argument("--wait-seconds", type=float, default=300)
    parser.add_argument("--recover", action="store_true",
                        help="Recover an incomplete Python call with exactly its retained native IDs.")
    parser.add_argument("--review-sha256", help="Explicit reviewed SHA; required by receive.")
    args = parser.parse_args(argv)
    need(0 < args.wait_seconds <= 3600, "REMOTE_EXAMPLE_WAIT_INVALID")
    if args.phase == "receive":
        need(isinstance(args.review_sha256, str) and HASH.fullmatch(args.review_sha256),
             "REMOTE_EXAMPLE_EXPLICIT_REVIEW_REQUIRED")
    elif args.review_sha256 is not None:
        raise StateError("REMOTE_EXAMPLE_REVIEW_NOT_APPLICABLE")
    root = private_directory(absolute(args.directory))
    event, previous = threading.Event(), {}
    if threading.current_thread() is threading.main_thread():
        for kind in (signal.SIGINT, signal.SIGTERM):
            previous[kind] = signal.signal(kind, lambda *_: event.set())
    try:
        with lock(root):
            plan, selection, receiving_input = load_selection(root, args.plan, args.plan_sha256)
            course = Course(root, plan, selection, args, event)
            if args.phase == "source":
                result = course.source()
            elif args.phase == "prepare":
                result = course.prepare(receiving_input)
            elif args.phase == "receive":
                result = course.receive(args.review_sha256)
            else:
                result = course.reopen()
        # Full phase files and SDK records precede terminal output. Reopen them
        # after any broken stdout pipe without repeating a business operation.
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")))
        return 130 if event.is_set() else 0
    finally:
        for kind, handler in previous.items():
            signal.signal(kind, handler)


if __name__ == "__main__":
    raise SystemExit(main())
