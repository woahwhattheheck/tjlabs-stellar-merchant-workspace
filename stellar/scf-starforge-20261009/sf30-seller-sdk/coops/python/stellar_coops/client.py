# MIT. Complete original study files, native query and returned-file receiving.
from __future__ import annotations
import csv
import hashlib
import io
import json
import os
import re
import tarfile
import uuid
from pathlib import PurePosixPath
from urllib.parse import parse_qsl, urlencode
from .journal import ReceiverJournal, now
from .transport import (BLOCK, IDENTIFIER, SHA, ReceivingError, atomic_json, canonical_path,
                        decode_json, digest, file_identity, json_bytes, private_directory,
                        read_json, regular_file, require, stable, sync_directory)

CHUNK = 1048576
MAX_FILE = 1073741824


def selected(rows, identifier, label):
    found = [row for row in rows if row.get("id") == identifier]
    require(len(found) == 1, "COOPS_PY_SELECTION", "Select one retained " + label + ".")
    return found[0]


def identifier(value):
    require(isinstance(value, str) and IDENTIFIER.fullmatch(value),
            "COOPS_PY_ID", "Keep the original native record ID.")
    return value


def immutable_json(path, value):
    if path.exists():
        require(read_json(path) == value, "COOPS_PY_IMMUTABLE",
                "A retained receiving record differs from the selected original version.")
    else:
        atomic_json(path, value)


def export_descriptor(value):
    require(isinstance(value, dict) and IDENTIFIER.fullmatch(value.get("id", "")) and
            type(value.get("bytes")) is int and 0 <= value["bytes"] <= MAX_FILE and
            SHA.fullmatch(value.get("sha256", "")) and isinstance(value.get("name"), str) and
            isinstance(value.get("format"), str), "COOPS_PY_RECEIPT", "The native file receipt is incomplete.")
    return value


def identity_matches(path, descriptor):
    return file_identity(path) == {k: descriptor[k] for k in ("bytes", "sha256")}


def copy_original(source, destination, expected):
    if destination.exists():
        require(identity_matches(destination, expected), "COOPS_PY_FILE_CHANGED", "The retained returned input changed.")
        return
    partial = destination.with_name(destination.name + ".part")
    if partial.exists():
        # This file is exclusively a local copy-in-progress, never an operator work file.
        with regular_file(partial):
            pass
        partial.unlink()
    count, h = 0, hashlib.sha256()
    with regular_file(source, private=False) as incoming, regular_file(partial, "wb", create=True) as output:
        before = os.fstat(incoming.fileno())
        for part in iter(lambda: incoming.read(BLOCK), b""):
            count += len(part)
            require(count <= expected["bytes"], "COOPS_PY_FILE_CHANGED", "The selected returned file grew during retention.")
            h.update(part)
            output.write(part)
        after = os.fstat(incoming.fileno())
        require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) ==
                (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) and
                count == expected["bytes"] and h.hexdigest() == expected["sha256"],
                "COOPS_PY_FILE_CHANGED", "The selected returned file changed during retention.")
        output.flush()
        os.fsync(output.fileno())
    os.replace(partial, destination)
    sync_directory(destination.parent)


def checked_release(release):
    require(release.get("schema") == "stellar-forge.coops-study-release.v1",
            "COOPS_PY_RELEASE", "Select the original immutable reviewed study release.")
    identifier(release.get("id"))
    study, review, manifest = release.get("study", {}), release.get("review", {}), release.get("manifest", {})
    for item in (review, manifest):
        require(all(item.get(k) == release.get(k) for k in ("studyId", "studyRevision", "studySha256")),
                "COOPS_PY_RELEASE", "The selected release's study and review pins disagree.")
    require(study.get("id") == release.get("studyId") and study.get("revision") == release.get("studyRevision") and
            study.get("sha256") == release.get("studySha256") and review.get("status") == "reviewed" and
            manifest.get("schema") == "stellar-forge.coops-study-delivery.v1" and
            manifest.get("id") == release["id"] and manifest.get("review") == review and
            manifest.get("counts") == release.get("counts"),
            "COOPS_PY_RELEASE", "The complete release must retain its actual reviewed decision, selected study and counts.")
    files = release.get("files")
    require(isinstance(files, list) and len(files) == 5 and
            {f.get("format") for f in files} == {"csv", "jsonl", "report", "manifest", "source-archive"} and
            len({f.get("id") for f in files}) == 5,
            "COOPS_PY_RELEASE", "Keep all five original release files.")
    for item in files:
        export_descriptor(item)
        require(all(item.get(k) == release.get(k) for k in ("studyId", "studyRevision", "studySha256")),
                "COOPS_PY_RELEASE", "A released file belongs to another study revision.")
    require(next(f for f in files if f["format"] == "manifest")["sha256"] == release.get("manifestSha256"),
            "COOPS_PY_RELEASE", "The release manifest digest changed.")
    return release


class CoastalReceiver(ReceiverJournal):
    def _record_directory(self, collection, native_id):
        return private_directory(self.directory / collection / identifier(native_id))

    def _files(self, directory, files):
        folder = private_directory(directory / "files")
        result = []
        for item in files:
            export_descriptor(item)
            file = folder / item["id"]
            self.online().download("/api/exports/" + item["id"], file, item)
            result.append({"export": item, "path": str(file.relative_to(self.directory))})
        return result

    def receive_release(self, release_id):
        release = checked_release(selected(self.view()["studyReleases"], release_id, "reviewed study release"))
        directory = self._record_directory("releases", release_id)
        immutable_json(directory / "release.json", release)
        files = self._files(directory, release["files"])
        receipt = {"schema": "stellar-forge.coops-python-study-receipt.v1",
                   "workspaceId": self.binding["workspaceId"], "releaseId": release_id,
                   "studyId": release["studyId"], "studyRevision": release["studyRevision"],
                   "studySha256": release["studySha256"], "manifestSha256": release["manifestSha256"],
                   "review": release["review"], "files": files}
        immutable_json(directory / "receipt.json", receipt)
        return self.verify_release(release_id)

    def _local_release(self, release_id):
        path = self.directory / "releases" / identifier(release_id)
        release = checked_release(read_json(path / "release.json"))
        require(release["id"] == release_id, "COOPS_PY_RELEASE", "The retained release ID changed.")
        return path, release

    def verify_release(self, release_id):
        directory, release = self._local_release(release_id)
        receipt = read_json(directory / "receipt.json")
        require(receipt.get("workspaceId") == self.binding["workspaceId"] and
                receipt.get("releaseId") == release_id and receipt.get("manifestSha256") == release["manifestSha256"] and
                [f.get("export") for f in receipt.get("files", [])] == release["files"],
                "COOPS_PY_RECEIPT", "The local receipt changed its original workspace, release or files.")
        located = {}
        for saved in receipt["files"]:
            expected_path = directory / "files" / saved["export"]["id"]
            require(saved["path"] == str(expected_path.relative_to(self.directory)),
                    "COOPS_PY_PATH", "A retained export path changed.")
            require(identity_matches(expected_path, saved["export"]),
                    "COOPS_PY_FILE_CHANGED", "A complete retained release file changed.")
            located[saved["export"]["format"]] = expected_path
        manifest = read_json(located["manifest"])
        require(manifest == release["manifest"], "COOPS_PY_MANIFEST", "The complete manifest differs from the immutable release.")
        expected = {}
        for item in manifest.get("files", []):
            path = item.get("path")
            require(isinstance(path, str) and "\\" not in path and not path.startswith("/") and
                    all(part not in ("", ".", "..") for part in path.split("/")) and
                    str(PurePosixPath(path)) == path and path not in expected and
                    type(item.get("bytes")) is int and 0 <= item["bytes"] <= MAX_FILE and
                    SHA.fullmatch(item.get("sha256", "")),
                    "COOPS_PY_ARCHIVE", "An original archive member descriptor is invalid or duplicated.")
            expected[path] = item
        require(len(expected) <= 20000 and "manifest.json" not in expected,
                "COOPS_PY_ARCHIVE", "The original source archive manifest exceeds its bounded member selection.")
        expected["manifest.json"] = next(f for f in release["files"] if f["format"] == "manifest")
        seen = set()
        with regular_file(located["source-archive"]) as source:
            with tarfile.open(fileobj=source, mode="r|") as archive:
                for member in archive:
                    require(member.isfile() and member.name in expected and member.name not in seen,
                            "COOPS_PY_ARCHIVE", "The source archive contains an unexpected, linked or repeated member.")
                    descriptor = expected[member.name]
                    require(member.size == descriptor["bytes"], "COOPS_PY_ARCHIVE", "An original archive member changed size.")
                    h, count = hashlib.sha256(), 0
                    incoming = archive.extractfile(member)
                    require(incoming is not None, "COOPS_PY_ARCHIVE", "An original archive member is unreadable.")
                    with incoming:
                        for part in iter(lambda: incoming.read(BLOCK), b""):
                            count += len(part)
                            h.update(part)
                    require(count == descriptor["bytes"] and h.hexdigest() == descriptor["sha256"],
                            "COOPS_PY_ARCHIVE", "An original archived response or model-input member changed.")
                    seen.add(member.name)
        require(seen == set(expected), "COOPS_PY_ARCHIVE", "The complete source archive omitted a selected member.")
        return {"schema": "stellar-forge.coops-python-study-verification.v1", "status": "VERIFIED",
                "workspaceId": self.binding["workspaceId"], "releaseId": release_id,
                "studyId": release["studyId"], "studyRevision": release["studyRevision"],
                "studySha256": release["studySha256"], "manifestSha256": release["manifestSha256"],
                "review": release["review"], "files": receipt["files"], "archiveMembers": len(seen),
                "counts": release["counts"],
                "scope": "Complete original files and archived members verified; source suitability remains the recorded study review."}

    def _dataset(self, dataset_id):
        dataset = selected(self.view()["datasets"], dataset_id, "native study dataset")
        require(dataset.get("sourceKind") == "reviewed-study", "COOPS_PY_DATASET", "Select a native dataset made from an immutable reviewed study.")
        _, release = self._local_release(dataset["studyReleaseId"])
        require(dataset.get("studyManifestSha256") == release["manifestSha256"] and
                dataset.get("studySha256") == release["studySha256"] and
                dataset.get("review", {}).get("id") == release["review"]["id"],
                "COOPS_PY_DATASET", "The native dataset changed its reviewed study release.")
        return dataset

    def receive_dataset(self, dataset_id):
        dataset = self._dataset(dataset_id)
        directory = self._record_directory("datasets", dataset_id)
        immutable_json(directory / "dataset.json", dataset)
        files = self._files(directory, dataset.get("files", []))
        require({f["export"]["format"] for f in files} == {"dataset-source", "dataset-config"},
                "COOPS_PY_DATASET", "Retain both original native dataset metadata files.")
        receipt = {"schema": "stellar-forge.coops-python-dataset-receipt.v1",
                   "workspaceId": self.binding["workspaceId"], "datasetId": dataset_id,
                   "studyReleaseId": dataset["studyReleaseId"], "snapshot": dataset["snapshot"], "files": files}
        immutable_json(directory / "receipt.json", receipt)
        return {"dataset": dataset, "receipt": receipt}

    def prepare_dataset(self, release_id, name, intent):
        self._local_release(release_id)
        dataset = self.action(intent + "/dataset", "study.dataset.prepare", {"releaseId": release_id, "name": name})
        require(dataset.get("studyReleaseId") == release_id, "COOPS_PY_DATASET", "The prepared native dataset changed its selected release.")
        return self.receive_dataset(dataset["id"])

    def query(self, dataset_id, query, intent):
        dataset = self._dataset(dataset_id)
        require(isinstance(query, str) and len(query) <= 8192, "COOPS_PY_QUERY", "Use the original URL-encoded native query up to 8192 characters.")
        result = self.action(intent, "dataset.query", {"datasetId": dataset_id, "query": query})
        require(result.get("schema") == "stellar-forge.dataset-page.v1" and
                result.get("dataset", {}).get("snapshot") == dataset["snapshot"] and
                isinstance(result.get("rows"), list) and isinstance(result.get("fields"), list) and
                result.get("page", {}).get("returned") == len(result["rows"]),
                "COOPS_PY_QUERY", "The native page changed its snapshot, fields or returned-row count.")
        return result

    def export_query(self, dataset_id, query, intent):
        dataset = self._dataset(dataset_id)
        parameters = parse_qsl(query, keep_blank_values=True)
        require(not any(k == "cursor" for k, _ in parameters), "COOPS_PY_QUERY", "Start a complete selected query before its first cursor.")
        directory = private_directory(self.directory / "queries" / self.local_key(intent))
        selection = {"schema": "stellar-forge.coops-python-query-selection.v1",
                     "workspaceId": self.binding["workspaceId"], "intent": intent,
                     "datasetId": dataset_id, "snapshot": dataset["snapshot"], "query": query}
        immutable_json(directory / "selection.json", selection)
        receipt_path = directory / "receipt.json"
        if receipt_path.exists():
            receipt = read_json(receipt_path)
            for item in receipt["files"]:
                require(item["name"] in ("selected.csv", "selected.jsonl") and identity_matches(directory / item["name"], item), "COOPS_PY_FILE_CHANGED", "A complete selected query output changed.")
            return receipt
        csv_path, jsonl_path = directory / "selected.csv.part", directory / "selected.jsonl.part"
        for path in (csv_path, jsonl_path):
            if path.exists():
                with regular_file(path):
                    pass
                path.unlink()
        pages, rows, cursor, expected_total, fields = [], 0, None, None, None
        seen_cursors = set()
        try:
            with regular_file(csv_path, "wb", create=True) as csv_output, regular_file(jsonl_path, "wb", create=True) as jsonl_output:
                while True:
                    page_query = query if cursor is None else urlencode(parameters + [("cursor", cursor)])
                    page = self.query(dataset_id, page_query, intent + "/page/" + str(len(pages)))
                    if fields is None:
                        fields = page["fields"]
                        require(fields and len(fields) == len(set(fields)) and all(isinstance(f, str) for f in fields),
                                "COOPS_PY_QUERY", "The original native field selection is invalid.")
                        expected_total = page["page"]["total"]
                        require(type(expected_total) is int and 0 <= expected_total <= 250000,
                                "COOPS_PY_QUERY", "The native selected count exceeds its original complete-dataset limit.")
                        text = io.StringIO(newline="")
                        csv.writer(text, lineterminator="\r\n").writerow(fields)
                        csv_output.write(text.getvalue().encode("utf-8"))
                    require(page["fields"] == fields and page["page"]["total"] == expected_total,
                            "COOPS_PY_QUERY", "Native cursor pages changed their selected fields or total.")
                    for row in page["rows"]:
                        require(isinstance(row, dict) and set(row) == set(fields) and all(isinstance(row[f], str) for f in fields),
                                "COOPS_PY_QUERY", "The native coastal query changed original string values or field identities.")
                        text = io.StringIO(newline="")
                        csv.writer(text, lineterminator="\r\n").writerow([row[f] for f in fields])
                        csv_output.write(text.getvalue().encode("utf-8"))
                        jsonl_output.write((json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
                        rows += 1
                    require(rows <= expected_total and csv_output.tell() <= MAX_FILE and jsonl_output.tell() <= MAX_FILE,
                            "COOPS_PY_QUERY", "The complete selected query exceeds its native row or receiving-file bound.")
                    op = self.saved_action(intent + "/page/" + str(len(pages)))
                    pages.append({"operationId": op["operationId"], "query": page_query,
                                  "returned": len(page["rows"]), "page": page["page"]})
                    cursor = page["page"].get("nextCursor")
                    if not cursor:
                        break
                    require(isinstance(cursor, str) and cursor not in seen_cursors and page["rows"],
                            "COOPS_PY_QUERY", "The original cursor repeated or made no progress.")
                    seen_cursors.add(cursor)
                require(rows == expected_total, "COOPS_PY_QUERY", "The original cursor sequence omitted selected rows.")
                for output in (csv_output, jsonl_output):
                    output.flush()
                    os.fsync(output.fileno())
            files = []
            for source, name in ((csv_path, "selected.csv"), (jsonl_path, "selected.jsonl")):
                identity = file_identity(source)
                final = directory / name
                if final.exists():
                    require(identity_matches(final, identity), "COOPS_PY_FILE_CHANGED", "A prior completed query file changed.")
                    source.unlink()
                else:
                    os.replace(source, final)
                files.append({"name": name, **identity})
            sync_directory(directory)
            receipt = {**selection, "schema": "stellar-forge.coops-python-query-receipt.v1",
                       "complete": True, "rows": rows, "fields": fields, "pages": pages, "files": files,
                       "scope": "Every row of the selected original native query, with unchanged string values and explicit cursor order."}
            atomic_json(receipt_path, receipt)
            return receipt
        finally:
            # Failed partial output is reconstructed from the original saved page actions on resume.
            pass

    def return_file(self, release_id, intent, source=None, *, format=None, note=""):
        self._local_release(release_id)
        directory = private_directory(self.directory / "return-intents" / self.local_key(intent))
        pin_path = directory / "input.json"
        pin = read_json(pin_path) if pin_path.exists() else None
        if source is not None:
            source = canonical_path(source)
            chosen_format = format or source.suffix.lower().lstrip(".")
            require(chosen_format in ("csv", "jsonl") and source.name.lower().endswith("." + chosen_format),
                    "COOPS_PY_RETURN", "Select the actual returned CSV or JSONL.")
            actual = file_identity(source, private=False, maximum=MAX_FILE)
            proposed = {"schema": "stellar-forge.coops-python-return-input.v1", "intent": intent,
                        "workspaceId": self.binding["workspaceId"], "releaseId": release_id,
                        "filename": source.name, "format": chosen_format, "note": note, **actual}
            if pin is not None:
                require(pin == proposed, "COOPS_PY_RETURN_CHANGED", "This return intent already names another original file or note.")
            else:
                copy_original(source, directory / ("original." + chosen_format), proposed)
                immutable_json(pin_path, proposed)
                pin = proposed
        require(pin is not None and pin.get("intent") == intent and pin.get("workspaceId") == self.binding["workspaceId"] and
                pin.get("releaseId") == release_id, "COOPS_PY_RETURN", "Select the actual file on the first return, then resume its retained intent.")
        original = directory / ("original." + pin["format"])
        require(identity_matches(original, pin), "COOPS_PY_FILE_CHANGED", "The retained original returned file changed.")
        started = self.action(intent + "/start", "study.return.start", {
            "releaseId": release_id, "format": pin["format"], "filename": pin["filename"], "bytes": pin["bytes"], "note": pin["note"]})
        upload_id = identifier(started.get("id"))
        require(all(started.get(k) == pin.get(k) for k in ("releaseId", "format", "filename", "bytes")),
                "COOPS_PY_RETURN", "The original upload changed its selected file.")
        with regular_file(original) as handle:
            offset = 0
            while offset < pin["bytes"]:
                part = handle.read(min(CHUNK, pin["bytes"] - offset))
                require(part, "COOPS_PY_RETURN", "The retained returned file ended before its original byte count.")
                import base64
                result = self.action(intent + "/chunk/" + str(offset), "study.return.chunk",
                                     {"uploadId": upload_id, "offset": offset, "base64": base64.b64encode(part).decode("ascii")})
                require(result.get("id") == upload_id and result.get("receivedBytes") == offset + len(part),
                        "COOPS_PY_RETURN", "The original chunk acknowledgement changed its exact boundary.")
                offset += len(part)
        returned = self.action(intent + "/finish", "study.return.finish", {"uploadId": upload_id})
        require(returned.get("uploadId") == upload_id and returned.get("releaseId") == release_id and
                returned.get("original", {}).get("sha256") == pin["sha256"] and returned["original"].get("bytes") == pin["bytes"],
                "COOPS_PY_RETURN", "The native complete comparison changed the original returned bytes.")
        immutable_json(directory / "completed.json", {"returnId": returned["id"], "uploadId": upload_id,
                                                      "comparisonSha256": returned["comparisonSha256"], "input": pin})
        return self.receive_return(returned["id"])

    def receive_return(self, return_id):
        view = self.view()
        returned = selected(view["studyReturns"], return_id, "completed returned file")
        require(returned.get("schema") == "stellar-forge.coops-study-return.v1" and
                SHA.fullmatch(returned.get("comparisonSha256", "")), "COOPS_PY_RETURN", "Select the original complete comparison record.")
        _, release = self._local_release(returned["releaseId"])
        require(all(returned.get(k) == release.get(k) for k in ("studyId", "studyRevision", "studySha256")),
                "COOPS_PY_RETURN", "The returned file changed its exact study release.")
        directory = self._record_directory("returns", return_id)
        immutable_json(directory / "return.json", returned)
        files = self._files(directory, returned["files"])
        require(len(files) == 3 and any(f["export"]["id"] == returned["comparisonExportId"] and
                                      f["export"]["sha256"] == returned["comparisonSha256"] for f in files),
                "COOPS_PY_RETURN", "Retain the full original input, every comparison record and its summary.")
        receipt = {"schema": "stellar-forge.coops-python-return-receipt.v1",
                   "workspaceId": self.binding["workspaceId"], "returnId": return_id, "releaseId": returned["releaseId"],
                   "comparisonSha256": returned["comparisonSha256"], "files": files}
        immutable_json(directory / "receipt.json", receipt)
        decisions = [d for d in view["studyReceivings"] if d["returnId"] == return_id]
        latest = decisions[-1] if decisions else None
        packet = {"schema": "stellar-forge.coops-python-receiving-review.v1",
                  "workspaceId": self.binding["workspaceId"], "return": returned, "files": files,
                  "currentDecision": latest, "expectedDecisionId": latest["id"] if latest else "",
                  "decisionSchema": "stellar-forge.coops-python-receiving-decision.v1",
                  "instruction": "Read the complete comparison and record the actual actor, status and note against this exact return/comparison. Source review and returned-file receiving remain distinct decisions."}
        atomic_json(directory / "review-packet.json", packet)
        return packet

    def record_decision(self, intent, decision_file):
        decision = read_json(decision_file, maximum=65536, private=False)
        fields = {"schema", "workspaceId", "returnId", "comparisonSha256", "expectedDecisionId", "status", "actor", "note"}
        require(isinstance(decision, dict) and set(decision) == fields and
                decision["schema"] == "stellar-forge.coops-python-receiving-decision.v1" and
                decision["workspaceId"] == self.binding["workspaceId"] and
                decision["status"] in ("accepted", "follow_up") and
                all(isinstance(decision[k], str) for k in fields) and decision["actor"].strip() and decision["note"].strip(),
                "COOPS_PY_DECISION", "Select the complete actual receiving decision, including its original comparison and current decision ID.")
        # The same original decision remains replayable even after a later staff decision exists.
        payload = {k: decision[k] for k in ("returnId", "comparisonSha256", "expectedDecisionId", "status", "actor", "note")}
        directory = private_directory(self.directory / "decision-intents" / self.local_key(intent))
        raw_identity = file_identity(decision_file, private=False, maximum=65536)
        copy_original(decision_file, directory / "decision-original.json", raw_identity)
        immutable_json(directory / "decision.json", decision)
        result = self.action(intent + "/decision", "study.receive", payload)
        require(all(result.get(k) == payload[k] for k in ("returnId", "comparisonSha256", "status", "actor", "note")) and
                (result.get("priorDecisionId") or "") == payload["expectedDecisionId"],
                "COOPS_PY_DECISION", "The saved native receiving decision changed its reviewed fields.")
        immutable_json(directory / "receipt.json", {"schema": "stellar-forge.coops-python-decision-receipt.v1",
                                                     "workspaceId": self.binding["workspaceId"],
                                                     "original": raw_identity, "decision": result})
        return result

    def verify(self):
        releases, other_files, queries, decisions, pending = [], 0, [], [], []
        root = self.directory / "releases"
        if root.exists():
            for directory in sorted(root.iterdir()):
                if (directory / "receipt.json").exists():
                    releases.append(self.verify_release(directory.name))
                else:
                    pending.append({"kind": "release", "id": directory.name})
        for collection, metadata_name in (("datasets", "dataset.json"), ("returns", "return.json")):
            root = self.directory / collection
            if not root.exists():
                continue
            for directory in sorted(root.iterdir()):
                if not (directory / "receipt.json").exists():
                    pending.append({"kind": collection, "id": directory.name})
                    continue
                receipt, metadata = read_json(directory / "receipt.json"), read_json(directory / metadata_name)
                require(receipt["workspaceId"] == self.binding["workspaceId"] and metadata["id"] == directory.name and
                        [f["export"] for f in receipt["files"]] == metadata["files"],
                        "COOPS_PY_WORKSPACE", "An offline receipt changed its original metadata or workspace.")
                for saved in receipt["files"]:
                    expected = directory / "files" / identifier(saved["export"]["id"])
                    require(saved["path"] == str(expected.relative_to(self.directory)) and identity_matches(expected, saved["export"]),
                            "COOPS_PY_FILE_CHANGED", "An offline dataset or returned-file receipt changed.")
                    other_files += 1
        root = self.directory / "queries"
        if root.exists():
            for directory in sorted(root.iterdir()):
                if not (directory / "receipt.json").exists():
                    pending.append({"kind": "query", "id": directory.name})
                    continue
                receipt, selection = read_json(directory / "receipt.json"), read_json(directory / "selection.json")
                require(all(receipt.get(k) == v for k, v in selection.items() if k != "schema") and
                        receipt.get("schema") == "stellar-forge.coops-python-query-receipt.v1" and receipt.get("complete") is True and
                        {f.get("name") for f in receipt["files"]} == {"selected.csv", "selected.jsonl"},
                        "COOPS_PY_QUERY", "A complete offline query changed its original selection.")
                for saved in receipt["files"]:
                    require(identity_matches(directory / saved["name"], saved), "COOPS_PY_FILE_CHANGED", "A complete query output changed.")
                queries.append({"intent": receipt["intent"], "rows": receipt["rows"], "pages": len(receipt["pages"]), "files": receipt["files"]})
        root = self.directory / "return-intents"
        if root.exists():
            for directory in sorted(root.iterdir()):
                if not (directory / "input.json").exists():
                    pending.append({"kind": "returned-input", "id": directory.name})
                    continue
                pin = read_json(directory / "input.json")
                require(pin["workspaceId"] == self.binding["workspaceId"] and pin["format"] in ("csv", "jsonl") and
                        identity_matches(directory / ("original." + pin["format"]), pin),
                        "COOPS_PY_FILE_CHANGED", "An original selected returned input changed.")
                if not (directory / "completed.json").exists():
                    pending.append({"kind": "return-comparison", "intent": pin["intent"]})
                else:
                    require(read_json(directory / "completed.json")["input"] == pin,
                            "COOPS_PY_RETURN", "The completed intake changed its original input selection.")
        root = self.directory / "decision-intents"
        if root.exists():
            for directory in sorted(root.iterdir()):
                if not (directory / "receipt.json").exists():
                    pending.append({"kind": "decision", "id": directory.name})
                    continue
                receipt = read_json(directory / "receipt.json")
                require(receipt["workspaceId"] == self.binding["workspaceId"] and
                        identity_matches(directory / "decision-original.json", receipt["original"]),
                        "COOPS_PY_DECISION", "The original decision file changed.")
                decisions.append(receipt["decision"])
        operations = self.operation_summary()
        return {"schema": "stellar-forge.coops-python-verification.v1",
                "status": "INCOMPLETE" if pending or any(o["state"] != "COMPLETE" for o in operations) else "VERIFIED",
                "workspaceId": self.binding["workspaceId"], "receiverId": self.binding["receiverId"],
                "releases": releases, "additionalVerifiedFiles": other_files, "queries": queries, "decisions": decisions,
                "incompleteSelections": pending, "operations": operations, "networkUsed": False}
