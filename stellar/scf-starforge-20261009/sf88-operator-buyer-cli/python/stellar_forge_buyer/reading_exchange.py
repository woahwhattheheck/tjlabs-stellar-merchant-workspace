"""Complete research handovers and original-writer reading returns.

The native collection archive remains the source-delivery owner. ZIP is the
standard-library envelope for the complete query selection and that unchanged
archive. After first receiving, the maintained reading project works offline.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

from .reading_workspace import ReadingWorkspace, ReadingError, HASH, canonical, digest, file_digest, identity
from .reading_delivery import new_output, export_project, receive_project, export_report
from .reading_selections import compact_lineage, selected_passage

SCHEMA = "stellar-forge.sf88.reading-handover.v1"
CAPTURE = "stellar-forge.sf88.reading-capture.v1"
RETURN = "stellar-forge.sf88.reading-return.v1"
MAX_METADATA = 32 * 1024 * 1024
MAX_ARCHIVE = 20 * 1024**3


def _json(raw):
    def unique(pairs):
        out = {}
        for key, value in pairs:
            if key in out:
                raise ReadingError("HANDOVER_DUPLICATE_JSON_KEY")
            out[key] = value
        return out
    try:
        return json.loads(raw.decode("utf-8", "strict"), object_pairs_hook=unique,
                          parse_constant=lambda _: (_ for _ in ()).throw(ReadingError("HANDOVER_JSON_NUMBER")))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ReadingError("HANDOVER_JSON_INVALID") from exc


def _sha(value):
    if not isinstance(value, str) or not HASH.fullmatch(value):
        raise ReadingError("HANDOVER_SOURCE_HASH")
    return value


def validate_manifest(value):
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise ReadingError("HANDOVER_VERSION")
    capture = value.get("capture")
    if not isinstance(capture, dict) or capture.get("schema") != CAPTURE or digest(capture) != value.get("captureSha256"):
        raise ReadingError("HANDOVER_CAPTURE_CHANGED")
    query = capture.get("query")
    if (not isinstance(query, dict) or query.get("engine") != "stellar-forge.resource-content-search.v1"
            or not isinstance(query.get("q"), str) or query.get("mode") not in ("all", "any")
            or capture.get("lineConvention") != "CRLF_OR_CR_OR_LF"):
        raise ReadingError("HANDOVER_QUERY_CONTRACT")
    _sha(query.get("build"))
    if (not isinstance(capture.get("name"), str) or not capture["name"].strip() or len(capture["name"]) > 160
            or not isinstance(capture.get("note"), str) or len(capture["note"].encode()) > 32768):
        raise ReadingError("HANDOVER_DESCRIPTION")
    resources, items = capture.get("resources"), capture.get("items")
    if not isinstance(resources, list) or not resources or not isinstance(items, list) or not 1 <= len(items) <= 10000:
        raise ReadingError("HANDOVER_SELECTIONS")
    by_id = {}
    for resource in resources:
        if not isinstance(resource, dict):
            raise ReadingError("HANDOVER_RESOURCE")
        rid = _sha(resource.get("id"))
        if rid in by_id or type(resource.get("bytes")) is not int or resource["bytes"] < 0:
            raise ReadingError("HANDOVER_RESOURCE")
        _sha(resource.get("sha256"))
        annotation = resource.get("annotation")
        if not isinstance(annotation, dict) or type(annotation.get("revision")) is not int or annotation["revision"] < 0:
            raise ReadingError("HANDOVER_ANNOTATION")
        by_id[rid] = resource
    seen, selected_sources = set(), set()
    for item in items:
        if not isinstance(item, dict):
            raise ReadingError("HANDOVER_RANGE")
        rid = item.get("resourceId")
        if rid not in by_id or item.get("sourceSha256") != by_id[rid]["sha256"]:
            raise ReadingError("HANDOVER_SOURCE_BINDING")
        _sha(item.get("id"))
        _sha(item.get("sha256"))
        if item["id"] in seen:
            raise ReadingError("HANDOVER_DUPLICATE_SELECTION")
        seen.add(item["id"])
        selected_sources.add(rid)
        for key in ("ordinal", "byteStart", "byteEnd", "lineStart", "lineEnd"):
            if type(item.get(key)) is not int or item[key] < (1 if key.startswith("line") else 0):
                raise ReadingError("HANDOVER_RANGE")
        if (not item["byteStart"] < item["byteEnd"] <= by_id[rid]["bytes"]
                or item["byteEnd"] - item["byteStart"] > 1024 * 1024 or item["lineEnd"] < item["lineStart"]
                or item.get("kind") not in ("passage", "excerpt")
                or not isinstance(item.get("note"), str) or len(item["note"]) > 10000):
            raise ReadingError("HANDOVER_RANGE")
        expected = digest({key: item[key] for key in
                           ("resourceId", "sourceSha256", "kind", "byteStart", "byteEnd", "sha256")})
        if item["id"] != expected:
            raise ReadingError("HANDOVER_SELECTION_IDENTITY")
    if selected_sources != set(by_id):
        raise ReadingError("HANDOVER_RESOURCE_SELECTION")
    archive, collection = value.get("sourceArchive"), value.get("collection")
    if (not isinstance(archive, dict) or archive.get("name") != "sources.tar"
            or type(archive.get("bytes")) is not int or not 1024 <= archive["bytes"] <= MAX_ARCHIVE
            or not isinstance(collection, dict) or type(collection.get("revision")) is not int
            or collection["revision"] < 1 or collection.get("memberCount") != len(resources)):
        raise ReadingError("HANDOVER_ARCHIVE_BINDING")
    _sha(archive.get("sha256"))
    _sha(archive.get("manifestSha256"))
    _sha(collection.get("sha256"))
    identity(value.get("operationId"))
    return value


def _member(archive, name, maximum):
    info = archive.getinfo(name)
    mode = info.external_attr >> 16
    if (info.is_dir() or info.file_size > maximum or info.flag_bits & 1
            or mode & 0o170000 not in (0, 0o100000)):
        raise ReadingError("HANDOVER_ARCHIVE_MEMBER")
    return info


def _copy_member(archive, name, target, size, expected_sha):
    if target.exists():
        if target.is_symlink() or file_digest(target) != (expected_sha, size):
            raise ReadingError("HANDOVER_RECEIVING_CONFLICT")
        return
    with new_output(target) as temporary, archive.open(name) as incoming, temporary.open("wb") as output:
        value, copied = hashlib.sha256(), 0
        for block in iter(lambda: incoming.read(128 * 1024), b""):
            copied += len(block)
            if copied > size:
                raise ReadingError("HANDOVER_SOURCE_SIZE")
            output.write(block)
            value.update(block)
        output.flush()
        os.fsync(output.fileno())
        if copied != size or value.hexdigest() != expected_sha:
            raise ReadingError("HANDOVER_SOURCE_CHANGED")


def _read_handover(archive_path):
    source = Path(archive_path).absolute()
    source_sha, source_size = file_digest(source)
    with zipfile.ZipFile(source) as archive:
        if sorted(archive.namelist()) != ["handover.json", "sources.tar"]:
            raise ReadingError("HANDOVER_ARCHIVE_MEMBERS")
        info = _member(archive, "handover.json", MAX_METADATA)
        _member(archive, "sources.tar", MAX_ARCHIVE)
        raw = archive.read(info)
        if len(raw) != info.file_size:
            raise ReadingError("HANDOVER_METADATA_LIMIT")
        manifest = validate_manifest(_json(raw))
        if archive.getinfo("sources.tar").file_size != manifest["sourceArchive"]["bytes"]:
            raise ReadingError("HANDOVER_SOURCE_SIZE")
    return source, source_sha, source_size, manifest, raw


def inspect_handover(archive_path):
    source, sha, size, manifest, _ = _read_handover(archive_path)
    checksum = hashlib.sha256()
    with zipfile.ZipFile(source) as archive, archive.open("sources.tar") as stream:
        for block in iter(lambda: stream.read(128 * 1024), b""):
            checksum.update(block)
    if checksum.hexdigest() != manifest["sourceArchive"]["sha256"] or file_digest(source) != (sha, size):
        raise ReadingError("HANDOVER_SOURCE_CHANGED")
    capture = manifest["capture"]
    return {"schema": SCHEMA, "sha256": sha, "bytes": size, "capture_sha256": manifest["captureSha256"],
            "name": capture["name"], "query": capture["query"], "selected_passages": len(capture["items"]),
            "source_files": len(capture["resources"]), "collection": manifest["collection"],
            "source_archive": manifest["sourceArchive"]}


def pack_handover(manifest_path, source_archive, destination):
    raw = Path(manifest_path).read_bytes()
    if len(raw) > MAX_METADATA:
        raise ReadingError("HANDOVER_METADATA_LIMIT")
    manifest = validate_manifest(_json(raw))
    original = Path(source_archive).absolute()
    expected = manifest["sourceArchive"]
    if file_digest(original) != (expected["sha256"], expected["bytes"]):
        raise ReadingError("HANDOVER_SOURCE_CHANGED")
    destination = Path(destination).absolute()
    if destination.exists():
        _, _, _, prior, _ = _read_handover(destination)
        if canonical(prior) != canonical(manifest):
            raise ReadingError("HANDOVER_OUTPUT_CONFLICT")
        result = inspect_handover(destination)
    else:
        with new_output(destination) as temporary, zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            archive.writestr("handover.json", raw)
            archive.write(original, "sources.tar")
        if file_digest(original) != (expected["sha256"], expected["bytes"]):
            raise ReadingError("HANDOVER_SOURCE_CHANGED")
        result = inspect_handover(destination)
    return {**result, "path": str(destination)}


def _write_json(path, value):
    with new_output(path) as temporary:
        temporary.write_text(canonical(value) + "\n", encoding="utf-8")


def receive_handover(archive_path, directory, *, checkout, node="node", resume=False):
    """Perform original collection receiving, original sync and one original list save."""
    source, archive_sha, archive_size, manifest, raw = _read_handover(archive_path)
    target = Path(directory).absolute()
    if target.parent.resolve() != target.parent or target.is_symlink():
        raise ReadingError("NEW_RECEIVING_DIRECTORY_REQUIRED")
    intake = {"schema": SCHEMA, "archive_sha256": archive_sha, "archive_bytes": archive_size,
              "capture_sha256": manifest["captureSha256"]}
    if target.exists():
        if not resume or not (target / "intake.json").is_file() or _json((target / "intake.json").read_bytes()) != intake:
            raise ReadingError("HANDOVER_RECEIVING_CONFLICT")
    else:
        target.mkdir(mode=0o700)
        _write_json(target / "intake.json", intake)
    result_path = target / "receipt.json"
    if result_path.exists():
        result = _json(result_path.read_bytes())
        with ReadingWorkspace(target / "project", create=False) as project:
            return {**result, "workspace": project.status()}
    if not (target / "handover.json").exists():
        with new_output(target / "handover.json") as temporary:
            temporary.write_bytes(raw)
    elif (target / "handover.json").read_bytes() != raw:
        raise ReadingError("HANDOVER_RECEIVING_CONFLICT")
    with zipfile.ZipFile(source) as archive:
        expected = manifest["sourceArchive"]
        _copy_member(archive, "sources.tar", target / "sources.tar", expected["bytes"], expected["sha256"])
    from .review_library import ResourceLibrary
    collection_directory = target / "collection"
    options = {"checkout": Path(checkout).resolve(), "state": target / "library-state", "directory": collection_directory,
               "node": node}
    if not (collection_directory / "manifest.json").exists():
        options.update(archive=target / "sources.tar", resume=collection_directory.exists(),
                       expected_sha256=manifest["sourceArchive"]["sha256"])
    with ResourceLibrary.from_collection(**options) as library:
        original = library.inspect_collection(target / "sources.tar", expected_sha256=manifest["sourceArchive"]["sha256"])
        if (original["manifestSha256"] != manifest["sourceArchive"]["manifestSha256"]
                or original["collectionSha256"] != manifest["collection"]["sha256"]
                or original["collection"]["id"] != manifest["collection"]["id"]
                or original["collection"]["revision"] != manifest["collection"]["revision"]
                or original["memberCount"] != len(manifest["capture"]["resources"])):
            raise ReadingError("HANDOVER_COLLECTION_BINDING")
        by_source = {}
        for record in library.iter_resources():
            origin = record.get("origin", {})
            parent = origin.get("resource", {})
            if (origin.get("manifestSha256") != manifest["sourceArchive"]["manifestSha256"]
                    or origin.get("collectionId") != manifest["collection"]["id"]
                    or origin.get("collectionRevision") != manifest["collection"]["revision"]
                    or parent.get("id") in by_source):
                raise ReadingError("HANDOVER_RECEIVED_SOURCE_BINDING")
            by_source[parent.get("id")] = record
        mapping = []
        for expected in manifest["capture"]["resources"]:
            actual = by_source.get(expected["id"])
            if (actual is None or actual["sha256"] != expected["sha256"] or actual["bytes"] != expected["bytes"]
                    or actual.get("origin", {}).get("annotation") != expected["annotation"]):
                raise ReadingError("HANDOVER_RECEIVED_SOURCE_BINDING")
            mapping.append({"source_id": expected["id"], "resource_id": actual["id"], "sha256": actual["sha256"],
                            "bytes": actual["bytes"], "source_lineage": compact_lineage(actual)})
        if len(mapping) != len(by_source):
            raise ReadingError("HANDOVER_EXTRA_SOURCE")
        capture_id = manifest["captureSha256"]
        list_id, handover_id = "reading-" + capture_id, "handover-" + capture_id
        with ReadingWorkspace(target / "project") as project:
            sync = project.sync(library, operation_id="receive-" + capture_id, label=manifest["capture"]["name"])
            payload = {"name": manifest["capture"]["name"], "manifest": manifest, "resource_mapping": mapping,
                       "reading_list_id": list_id, "source_archive_receipt": original}
            record = project._save("handover", handover_id, payload, 0, "bind-" + capture_id)
            by_original = {entry["source_id"]: entry for entry in mapping}
            selected = [{"selection_kind": "source-range", "resource_id": by_original[item["resourceId"]]["resource_id"],
                         "sha": item["sourceSha256"], "citation": {"handover_id": handover_id, "selection_id": item["id"]},
                         "note": item["note"]} for item in manifest["capture"]["items"]]
            reading_list = project.save_list(record_id=list_id, name=manifest["capture"]["name"],
                note=manifest["capture"]["note"], items=selected, expected_revision=0,
                operation_id="list-" + capture_id)
            status = project.status()
        result = {"schema": SCHEMA, **intake, "directory": str(target), "project": str(target / "project"),
                  "handover_id": record["id"], "reading_list_id": reading_list["id"], "reading_list_revision": reading_list["revision"],
                  "collection_receipt": original, "resource_mapping": mapping, "sync": sync}
    if file_digest(source) != (archive_sha, archive_size):
        raise ReadingError("HANDOVER_SOURCE_CHANGED")
    _write_json(result_path, result)
    return {**result, "workspace": status}


def _ancestors(record):
    found, current = set(), record
    for _ in range(65):
        if not isinstance(current, dict):
            return found
        if isinstance(current.get("id"), str) and isinstance(current.get("sha256"), str):
            found.add((current["id"], current["sha256"]))
        origin = current.get("origin")
        current = origin.get("resource") if isinstance(origin, dict) else None
    raise ReadingError("SOURCE_LINEAGE_DEPTH")


def publish_return(workspace, library, *, list_id, list_revision, collection_id, expected_revision, operation_id):
    """Map captured resource identities back through original collection ancestry.

    A native member is selected only when identity AND original SHA match. This
    is an explicit collection publication; passage notes remain in the complete
    reading project and reports. A pending native request is retained for replay.
    """
    operation_id = identity(operation_id)
    reading_list = workspace.head("list", list_id, revision=list_revision)
    if len(reading_list["note"].encode()) > 32768:
        raise ReadingError("COLLECTION_INTRODUCTION")
    native = library.status()
    binding = digest({k: native["config"].get(k) for k in ("kind", "source", "roots")})
    request = {"action": "reading-return", "list_id": list_id, "list_revision": list_revision,
               "collection_id": collection_id, "expected_revision": expected_revision,
               "operation_id": operation_id, "target_source": binding}
    with workspace._exclusive():
        with workspace._db() as db:
            old = db.execute("SELECT request,state,result FROM deliveries WHERE id=?", (operation_id,)).fetchone()
        if old:
            prepared = json.loads(old["request"])
            if prepared["request"] != request:
                raise ReadingError("OPERATION_CONFLICT")
            if old["state"] == "complete":
                return json.loads(old["result"])
        else:
            candidates = list(library.iter_resources())
            index = {}
            for native_resource in candidates:
                if native_resource.get("status") != "VERIFIED" or native_resource.get("deliveryStatus") != "SAVED":
                    continue
                for ancestor in _ancestors(native_resource):
                    index.setdefault(ancestor, {})[native_resource["id"]] = native_resource
            members, used, mappings, context = [], set(), [], {}
            for item in reading_list["items"]:
                selected_passage(workspace, item, context=context)
                if item["resource_id"] in used:
                    continue
                _, metadata = workspace.source_file(item["resource_id"])
                identities = {(metadata["id"], metadata["sha256"])}
                for entry in metadata.get("source_lineage", []):
                    original = entry["resource"]
                    identities.add((original["id"], original["sha256"]))
                if item.get("citation"):
                    record = workspace.head("handover", item["citation"]["handover_id"], revision=1)
                    for row in record["resource_mapping"]:
                        if row["resource_id"] == item["resource_id"] and row["sha256"] == item["sha"]:
                            identities.add((row["source_id"], row["sha256"]))
                exact = index.get((metadata["id"], metadata["sha256"]), {})
                matches = dict(exact)
                if not matches:
                    for source_identity in identities:
                        matches.update(index.get(source_identity, {}))
                if len(matches) != 1:
                    raise ReadingError("READING_RETURN_SOURCE_AMBIGUOUS" if matches else "READING_RETURN_SOURCE_NOT_PRESENT")
                native_resource = next(iter(matches.values()))
                used.add(item["resource_id"])
                if native_resource["id"] not in {member["id"] for member in members}:
                    members.append({"id": native_resource["id"], "sha256": native_resource["sha256"],
                                    "annotationRevision": native_resource["annotation"]["revision"]})
                mappings.append({"reading_resource_id": item["resource_id"], "native_resource_id": native_resource["id"],
                                 "sha256": native_resource["sha256"]})
            prepared = {"request": request, "resource_mapping": mappings,
                        "native": {"collection_id": collection_id, "name": reading_list["name"],
                                   "note": reading_list["note"], "members": members,
                                   "expected_revision": expected_revision, "operation_id": operation_id}}
            with workspace._db(write=True) as db:
                db.execute("INSERT INTO deliveries VALUES(?,?,'pending',NULL)", (operation_id, canonical(prepared)))
        saved = library.save_collection(**prepared["native"])
        result = {"collection": saved, "resource_mapping": prepared["resource_mapping"],
                  "list_id": list_id, "list_revision": list_revision, "target_source": binding}
        with workspace._db(write=True) as db:
            db.execute("UPDATE deliveries SET state='complete',result=? WHERE id=?", (canonical(result), operation_id))
        return result


def export_return(workspace, destination, *, list_id, list_revision):
    """One complete editable project plus the selected revision's three reports."""
    record = workspace.head("list", list_id, revision=list_revision)
    with tempfile.TemporaryDirectory(prefix="reading-return-") as tmp:
        root = Path(tmp)
        files = {"project.zip": export_project(workspace, root / "project.zip")}
        for format in ("html", "json", "csv"):
            name = "reading-list." + format
            files[name] = export_report(workspace, root / name, list_id=list_id, list_revision=record["revision"], format=format)
        manifest = {"schema": RETURN, "list": {"id": list_id, "revision": record["revision"], "name": record["name"],
                                             "passages": len(record["items"])},
                    "files": [{"name": name, "sha256": value["sha256"], "bytes": value["bytes"]} for name, value in files.items()]}
        with new_output(destination) as temporary, zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            archive.writestr("return.json", canonical(manifest) + "\n")
            for name in files:
                archive.write(root / name, name)
    sha, size = file_digest(Path(destination).absolute())
    return {"path": str(Path(destination).absolute()), "sha256": sha, "bytes": size, **manifest}


def receive_return(archive_path, directory, *, max_total_bytes=MAX_ARCHIVE):
    target = Path(directory).absolute()
    if target.exists() or target.is_symlink() or target.parent.resolve() != target.parent:
        raise ReadingError("NEW_RECEIVING_DIRECTORY_REQUIRED")
    source = Path(archive_path).absolute()
    source_identity = file_digest(source)
    with zipfile.ZipFile(source) as archive:
        names = ["project.zip", "reading-list.csv", "reading-list.html", "reading-list.json", "return.json"]
        if sorted(archive.namelist()) != names:
            raise ReadingError("READING_RETURN_MEMBERS")
        info = _member(archive, "return.json", MAX_METADATA)
        manifest = _json(archive.read(info))
        if manifest.get("schema") != RETURN or {row.get("name") for row in manifest.get("files", [])} != set(names) - {"return.json"} or len(manifest["files"]) != 4:
            raise ReadingError("READING_RETURN_MANIFEST")
        total = 0
        for row in manifest["files"]:
            _sha(row.get("sha256"))
            if type(row.get("bytes")) is not int or row["bytes"] < 0:
                raise ReadingError("READING_RETURN_SIZE")
            total += row["bytes"]
            if total > max_total_bytes or _member(archive, row["name"], max_total_bytes).file_size != row["bytes"]:
                raise ReadingError("READING_RETURN_SIZE")
        target.mkdir(mode=0o700)
        try:
            for row in manifest["files"]:
                _copy_member(archive, row["name"], target / row["name"], row["bytes"], row["sha256"])
            project = receive_project(target / "project.zip", target / "project", max_total_bytes=max_total_bytes)
            with ReadingWorkspace(target / "project", create=False) as workspace:
                record = workspace.head("list", manifest["list"]["id"], revision=manifest["list"]["revision"])
                if record["name"] != manifest["list"]["name"] or len(record["items"]) != manifest["list"]["passages"]:
                    raise ReadingError("READING_RETURN_SELECTION")
                # Reports are checked against the same original restored list revision.
                with tempfile.TemporaryDirectory(prefix="reading-return-compare-") as compare:
                    for format in ("html", "json", "csv"):
                        expected = next(row for row in manifest["files"] if row["name"] == "reading-list." + format)
                        actual = export_report(workspace, Path(compare) / ("reading-list." + format), format=format,
                                               list_id=record["id"], list_revision=record["revision"])
                        if (actual["sha256"], actual["bytes"]) != (expected["sha256"], expected["bytes"]):
                            raise ReadingError("READING_RETURN_REPORT_CHANGED")
            if file_digest(source) != source_identity:
                raise ReadingError("READING_RETURN_CHANGED")
            _write_json(target / "return.json", manifest)
            return {"schema": RETURN, "directory": str(target), "project": project, "list": manifest["list"],
                    "archive_sha256": source_identity[0], "archive_bytes": source_identity[1], "files": manifest["files"]}
        except BaseException:
            shutil.rmtree(target)
            raise
