"""MIT. Complete results reports and portable receiving on the original IATI carrier."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import re
import stat
import zipfile

from iati_source import InputError, fingerprint
from iati_workspace import packet_write, MAX_PACKET, MAX_FILES, MAX_METADATA
from workspace import json_bytes, load_json, private_write, regular, file_digest
from .model import CONTRACT
from .report import report_files
from .workspace import RECEIVING, SNAPSHOT, MAX_BODY

PACKET = "stellar-forge.iati-results-packet.v1"
REPORT_PACKET = "stellar-forge.iati-results-report-packet.v1"
MAX_EXPANDED = 3 * 1024 * 1024 * 1024
ALLOWED = re.compile(r"(?:manifest|snapshot)\.json|reports/[A-Za-z0-9._-]+|sources/[0-9a-f]{64}\.iati|prior-snapshots/[0-9a-f]{64}\.json\Z")


def _identity(path, maximum=MAX_PACKET):
    return {"bytes": regular(path, maximum).st_size, "sha256": file_digest(path, maximum)}


def _original_receipt(receipt, snapshot):
    if not isinstance(receipt, dict) or receipt.get("schema") != RECEIVING:
        raise InputError("Receiving contains an unsupported prior receipt")
    if (receipt.get("project") != snapshot["id"]
        or receipt.get("snapshotSha256") != snapshot["sha256"]
        or receipt.get("selectedRevision") != snapshot["selectedRevision"]
        or receipt.get("selectedEditionSha256") != snapshot["selectedSha256"]
        or receipt.get("id") != fingerprint({"snapshot": snapshot["sha256"], "file": receipt["file"]})):
        raise InputError("A prior receiving receipt changed its original project/edition binding")


def _closure(api, snapshot):
    sources, blobs, snapshots, active = {}, {}, {}, set()

    def visit(value, descriptor=None):
        identity = value["sha256"]
        if identity in active:
            raise InputError("Receiving history contains a cycle")
        if identity in snapshots:
            return
        if len(snapshots) >= 512:
            raise InputError("Complete receiving history exceeds 512 retained snapshots")
        active.add(identity)
        if value.get("schema") != SNAPSHOT or fingerprint({k: v for k, v in value.items() if k != "sha256"}) != identity:
            raise InputError("A retained receiving snapshot changed")
        snapshots[identity] = value
        if descriptor:
            blobs[descriptor["sha256"]] = api.root / "blobs" / (descriptor["sha256"] + ".json")
        for pair in value["projections"]:
            source = pair["projection"]["source"]
            sources[source["id"]] = api._source_file(source["id"])
        for receipt in value["receipts"]:
            previous = api._blob_value(receipt["snapshotFile"])
            _original_receipt(receipt, previous)
            visit(previous, receipt["snapshotFile"])
        active.remove(identity)
    visit(snapshot)
    return sources, blobs, snapshots


def export_project(api, ident, output, revision=None, *, report_only=False):
    output = output.expanduser().absolute()
    if output.parent.resolve(strict=True) != output.parent:
        raise InputError("Choose an existing original output directory without aliases")
    with api.ws.mutex, api.ws.scratch() as temp:
        selected = api.report(ident, revision)
        comparisons = api.comparisons(ident)
        files = {}
        for name, data in report_files(selected["edition"], selected["report"], comparisons).items():
            path = temp / name
            private_write(path, data)
            files["reports/" + name] = path
        metadata = {"project": ident, "selectedRevision": selected["edition"]["revision"],
            "selectedEditionSha256": selected["edition"]["sha256"],
            "reportSha256": selected["report"]["reportSha256"],
            "analysisContractSha256": fingerprint(CONTRACT)}
        if not report_only:
            snapshot = api.snapshot(ident, selected["edition"]["revision"])
            sources, blobs, _ = _closure(api, snapshot)
            # One canonical snapshot includes full revisions; all prior receiving
            # snapshots are retained separately with their exact original bytes.
            source_file = temp / "snapshot.json"
            private_write(source_file, api._encoded(snapshot))
            files["snapshot.json"] = source_file
            for source, path in sources.items():
                files["sources/" + source + ".iati"] = path
            for blob, path in blobs.items():
                files["prior-snapshots/" + blob + ".json"] = path
            metadata.update(snapshotSha256=snapshot["sha256"], sources=sorted(sources))
        schema = REPORT_PACKET if report_only else PACKET
        entries = {name: {"bytes": regular(path, MAX_METADATA if name.endswith(".json") else MAX_PACKET).st_size,
                          "sha256": "0" * 64} for name, path in files.items()}
        # packet_write emits exactly this original canonical manifest shape.
        # Each actual SHA256 is 64 ASCII characters, so its encoded length is
        # identical without reading every large source twice just for admission.
        manifest_bytes = len(json_bytes({"schema": schema, "files": entries, **metadata}))
        payload_bytes = sum(entry["bytes"] for entry in entries.values())
        total = payload_bytes + manifest_bytes
        # Count manifest.json on both export and receive. The separate 3 GiB
        # expanded ceiling leaves room under the original 4 GiB ZIP-file bound.
        if total > MAX_EXPANDED or manifest_bytes > MAX_METADATA or len(files) >= MAX_FILES:
            raise InputError("The complete results packet exceeds 3 GiB or its original file-count capacity")
        result = packet_write(output, files, schema, metadata)
        return {**result, "schema": schema, **metadata,
                "members": len(files) + 1, "expandedBytes": total,
                "payloadBytes": payload_bytes, "manifestBytes": manifest_bytes,
                "editableReceiving": not report_only}


def _read(path, temp):
    original = _identity(path)
    before = path.stat()
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos]
        if (len(infos) > MAX_FILES or len(set(names)) != len(names)
            or "manifest.json" not in names or "snapshot.json" not in names):
            raise InputError("Results packet has duplicate, missing or excessive members")
        total = 0
        for info in infos:
            mode = stat.S_IFMT(info.external_attr >> 16)
            if (not ALLOWED.fullmatch(info.filename) or info.is_dir() or info.flag_bits & 1
                or info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                or mode not in (0, stat.S_IFREG)):
                raise InputError("Results packet has an unsupported member path, file type or compression")
            maximum = MAX_METADATA if info.filename.endswith(".json") else MAX_PACKET
            if info.file_size > maximum:
                raise InputError("An original results packet member exceeds its capacity")
            total += info.file_size
            if total > MAX_EXPANDED:
                raise InputError("The expanded results packet exceeds 3 GiB")
        raw_manifest = archive.read("manifest.json")
        manifest = load_json(raw_manifest)
        expected_keys = {"schema", "files", "project", "selectedRevision", "selectedEditionSha256",
                         "reportSha256", "analysisContractSha256", "snapshotSha256", "sources"}
        if (not isinstance(manifest, dict) or set(manifest) != expected_keys or manifest["schema"] != PACKET
            or not isinstance(manifest["files"], dict) or set(manifest["files"]) != set(names) - {"manifest.json"}
            or manifest["analysisContractSha256"] != fingerprint(CONTRACT)):
            raise InputError("Use the complete original editable results packet")
        paths = {}
        for info in infos:
            if info.filename == "manifest.json":
                continue
            expected = manifest["files"][info.filename]
            if (not isinstance(expected, dict) or set(expected) != {"bytes", "sha256"}
                or type(expected["bytes"]) is not int or expected["bytes"] != info.file_size
                or not re.fullmatch(r"[0-9a-f]{64}", str(expected["sha256"]))):
                raise InputError("A results member has an invalid exact byte descriptor")
            output = temp / info.filename
            output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            h, size = hashlib.sha256(), 0
            with archive.open(info) as stream, os.fdopen(os.open(
                    output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as writer:
                while block := stream.read(65536):
                    size += len(block)
                    if size > expected["bytes"]:
                        raise InputError("A results member expanded beyond its original byte count")
                    h.update(block)
                    writer.write(block)
                writer.flush()
                os.fsync(writer.fileno())
            if {"bytes": size, "sha256": h.hexdigest()} != expected:
                raise InputError("A complete results member differs from its original identity: " + info.filename)
            paths[info.filename] = output
    after = path.stat()
    if ((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
        (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
        or _identity(path) != original):
        raise InputError("The original receiving file changed during complete verification")
    return manifest, paths, {**original, "manifestSha256": hashlib.sha256(raw_manifest).hexdigest()}


def _incoming_graph(snapshot, paths):
    sources, prior_blobs, snapshots, active = {}, {}, {}, set()
    used = {"snapshot.json"}

    def visit(value, descriptor=None):
        identity = value.get("sha256")
        if identity in active:
            raise InputError("Original receiving snapshots contain a cycle")
        if identity in snapshots:
            return
        if len(snapshots) >= 512:
            raise InputError("Original receiving history exceeds 512 snapshots")
        if (value.get("schema") != SNAPSHOT or not isinstance(identity, str)
            or fingerprint({k: v for k, v in value.items() if k != "sha256"}) != identity):
            raise InputError("A complete receiving snapshot changed")
        active.add(identity)
        snapshots[identity] = value
        for pair in value["projections"]:
            source = pair["projection"]["source"]
            name = "sources/" + source["id"] + ".iati"
            path = paths.get(name)
            if path is None or _identity(path) != {"sha256": source["id"], "bytes": source["bytes"]}:
                raise InputError("Receiving lacks the complete selected original publisher bytes")
            sources[source["id"]] = path
            used.add(name)
        for receipt in value["receipts"]:
            descriptor = receipt["snapshotFile"]
            name = "prior-snapshots/" + descriptor["sha256"] + ".json"
            path = paths.get(name)
            if path is None or _identity(path, MAX_BODY) != descriptor:
                raise InputError("Receiving lacks an exact original prior snapshot")
            previous = load_json(path.read_bytes())
            _original_receipt(receipt, previous)
            prior_blobs[descriptor["sha256"]] = path
            used.add(name)
            visit(previous, descriptor)
        active.remove(identity)
    visit(snapshot)
    return sources, prior_blobs, snapshots, used


def receive_project(api, path, *, expected_sha256=None, expected_bytes=None):
    path = path.expanduser().absolute()
    identity = _identity(path)
    if expected_sha256 is not None and identity["sha256"] != expected_sha256:
        raise InputError("The receiving archive differs from its selected SHA256")
    if expected_bytes is not None and (type(expected_bytes) is not int or identity["bytes"] != expected_bytes):
        raise InputError("The receiving archive differs from its selected complete byte count")
    with api.ws.mutex, api.ws.scratch() as temp:
        manifest, paths, receipt_input = _read(path, temp)
        snapshot = load_json(paths["snapshot.json"].read_bytes())
        if (snapshot.get("id") != manifest["project"] or snapshot.get("sha256") != manifest["snapshotSha256"]
            or snapshot.get("selectedRevision") != manifest["selectedRevision"]
            or snapshot.get("selectedSha256") != manifest["selectedEditionSha256"]):
            raise InputError("The packet manifest selects another original snapshot/edition")
        sources, prior_blobs, snapshots, used = _incoming_graph(snapshot, paths)
        if sorted(sources) != manifest["sources"]:
            raise InputError("The manifest changes the full original source closure")
        # Every prior receiving snapshot remains semantically bound to the same
        # original source bytes, not merely copied as unexamined metadata.
        for value in snapshots.values():
            if value["id"] != snapshot["id"]:
                raise InputError("A receiving history contains another project")
            api.validate_snapshot(value, sources)
        selected = next(e for e in snapshot["editions"] if e["revision"] == snapshot["selectedRevision"])
        if selected["report"]["reportSha256"] != manifest["reportSha256"]:
            raise InputError("The receiving manifest changes the selected report")
        reports = report_files(selected, selected["report"], snapshot["comparisons"])
        for name, data in reports.items():
            relative = "reports/" + name
            if relative not in paths or paths[relative].read_bytes() != data:
                raise InputError("The readable report differs from the original selected edition: " + name)
            used.add(relative)
        if used != set(paths):
            raise InputError("The archive contains bytes outside its exact selected project closure")
        # Retain all immutable prior receiving snapshots before committing the
        # new receipt. These harmless source objects never replay operations.
        for digest_value, source in prior_blobs.items():
            descriptor = api._blob(source.read_bytes())
            if descriptor["sha256"] != digest_value:
                raise InputError("An original prior snapshot changed during retention")
        return api.adopt_snapshot(snapshot, sources, receipt_input)
