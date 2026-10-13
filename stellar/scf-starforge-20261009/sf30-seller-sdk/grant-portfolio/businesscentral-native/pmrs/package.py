"""Complete private source/data handover with frozen export and same-archive receiving."""
import hashlib
import os
import stat
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from .canonical import (decode, digest, encode, full_sha, fsync_directory, guid,
                        json_file, now, private_directory, read_bytes, regular_file,
                        request_id, sha_bytes, stable_text)
from .errors import PMRSError, require
from .reports import dictionary, report_html, totals_csv
from .store import Store, file_lock
from .source import Source
from .reconcile import verify_reconciliation

MAX_ARCHIVE_BYTES = 4 * 1024 * 1024 * 1024
MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024
MAX_FILES = 100000
WORKSPACE_MEMBERS = {"workspace.json", "catalogue.json"}
WORKSPACE_DIRECTORIES = {"objects", "records", "operations", "commands", "delivery-claims"}
MANIFEST_SCHEMA = "commons.pmrs-handover.v1"

def _hash(path):
    path = regular_file(path)
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        result = hashlib.file_digest(stream, "sha256").hexdigest()
        after = os.fstat(stream.fileno())
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            "FILE_CHANGED", "The original member changed during its identity read.")
    return {"bytes": before.st_size, "sha256": result}

def _member(name):
    require(isinstance(name, str), "ARCHIVE_MEMBER", "Member names must be strings.")
    path = PurePosixPath(name)
    require(name and len(name) <= 4096 and not path.is_absolute() and ".." not in path.parts
            and "\\" not in name and "\x00" not in name and path.as_posix() == name,
            "ARCHIVE_MEMBER", "Invalid archive member name.")
    return path

def _workspace_member(name):
    rel = _member(name)
    if name in WORKSPACE_MEMBERS: return rel
    require(len(rel.parts) >= 2 and rel.parts[0] in WORKSPACE_DIRECTORIES,
            "ARCHIVE_WORKSPACE_SCOPE", "Unknown workspace member.")
    require(not any(part.startswith(".") for part in rel.parts),
            "ARCHIVE_WORKSPACE_SCOPE", "Transient/control members are excluded.")
    if rel.parts[0] == "objects":
        require(len(rel.parts) == 3 and rel.parts[1] == full_sha(rel.parts[2])[:2],
                "ARCHIVE_OBJECT_PATH", "Invalid immutable object path.")
    else:
        require(len(rel.parts) == 2 and rel.name.endswith(".json"),
                "ARCHIVE_RECORD_PATH", "Invalid retained JSON member.")
        identifier = rel.name[:-5]
        full_sha(identifier) if rel.parts[0] in {"records", "delivery-claims"} else request_id(identifier)
    return rel

def _source_files(source_root):
    source_root = Path(source_root).absolute()
    manifest_path = regular_file(source_root / "source-manifest.json")
    manifest = decode(read_bytes(manifest_path))
    require(manifest.get("schema") == "commons.pmrs-source-manifest.v1"
            and isinstance(manifest.get("files"), dict) and manifest["files"],
            "SOURCE_MANIFEST", "The complete product source manifest is required.")
    output = []
    for name, identity in sorted(manifest["files"].items()):
        rel = _member(name)
        require(name != "source-manifest.json" and isinstance(identity, dict)
                and set(identity) == {"bytes", "sha256"} and type(identity["bytes"]) is int
                and identity["bytes"] >= 0, "SOURCE_MANIFEST", "Invalid source member descriptor.")
        full_sha(identity["sha256"])
        path = regular_file(source_root / rel)
        require(_hash(path) == identity, "SOURCE_CHANGED", "Selected product source changed.", file=name)
        output.append(("source/" + name, path, identity))
    output.append(("source/source-manifest.json", manifest_path, _hash(manifest_path)))
    return output

def _copy_verified(source, destination, identity, *, immutable=False):
    source, destination = regular_file(source), Path(destination)
    private_directory(destination.parent)
    if destination.exists():
        require(_hash(destination) == identity, "SNAPSHOT_MEMBER_CHANGED", "A frozen snapshot member differs.")
        return
    if immutable:
        try:
            os.link(source, destination)
            require(_hash(destination) == identity, "SNAPSHOT_SOURCE_CHANGED", "An immutable source member changed.")
            fsync_directory(destination.parent)
            return
        except OSError as error:
            import errno
            if error.errno != errno.EXDEV: raise
    descriptor, temporary = tempfile.mkstemp(prefix=".snapshot-", dir=destination.parent)
    try:
        h, length = hashlib.sha256(), 0
        with source.open("rb") as inp, os.fdopen(descriptor, "wb") as out:
            while True:
                block = inp.read(1024 * 1024)
                if not block: break
                h.update(block); length += len(block); out.write(block)
            out.flush(); os.fsync(out.fileno())
        require({"sha256": h.hexdigest(), "bytes": length} == identity,
                "SNAPSHOT_SOURCE_CHANGED", "A selected source member changed while copying.")
        try: os.link(temporary, destination)
        except FileExistsError:
            require(_hash(destination) == identity, "SNAPSHOT_MEMBER_CHANGED", "A concurrent snapshot member differs.")
        fsync_directory(destination.parent)
    finally:
        try: os.unlink(temporary)
        except FileNotFoundError: pass

def _zip_info(name):
    info = zipfile.ZipInfo(name)
    info.date_time = (2026, 1, 1, 0, 0, 0)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (stat.S_IFREG | 0o600) << 16
    return info

def _freeze(store, source_root, operation, output_root):
    # The plan becomes authoritative only after every selected member has been
    # copied and verified while product mutations are drained. Interrupted,
    # unpublished snapshot directories remain retained and are never adopted.
    snapshot = private_directory(output_root / ("snapshot-" + str(uuid.uuid4())))
    members = _source_files(source_root)
    for path in sorted(store.root.rglob("*")):
        relative = path.relative_to(store.root)
        if relative.parts[0] not in WORKSPACE_DIRECTORIES and relative.as_posix() not in WORKSPACE_MEMBERS: continue
        if any(part.startswith(".") for part in relative.parts): continue
        require(not path.is_symlink(), "ARCHIVE_SYMLINK", "A selected workspace member is a symlink.")
        if path.is_file():
            _workspace_member(relative.as_posix())
            members.append(("workspace/" + relative.as_posix(), path, _hash(path)))
    require(len(members) <= MAX_FILES and len({x[0] for x in members}) == len(members),
            "ARCHIVE_LIMIT", "The source/workspace member selection is invalid or too large.")
    metadata = {}
    for name, path, identity in members:
        metadata[name] = identity
        _copy_verified(path, snapshot / name, identity,
                       immutable=name.startswith(("workspace/objects/", "workspace/records/")))
    for item in store._catalogue()["items"]:
        record = store.record(item["id"])
        if record["kind"] not in {"reconciliation", "target-review", "delivery"}: continue
        prefix = "reports/" + record["id"] + "/"
        generated = {"report.html": report_html(record), "record.json": encode(record)}
        if record["kind"] == "reconciliation":
            generated.update({"totals.csv": totals_csv(record["body"]), "columns.json": encode(dictionary())})
        from .canonical import atomic
        for filename, value in generated.items():
            name = prefix + filename
            atomic(snapshot / name, value)
            metadata[name] = {"bytes": len(value), "sha256": sha_bytes(value)}
    expanded = sum(item["bytes"] for item in metadata.values())
    require(len(metadata) <= MAX_FILES and expanded <= MAX_EXPANDED_BYTES,
            "ARCHIVE_LIMIT", "Handover exceeds 100,000 files or 8 GiB expanded.")
    manifest = {"schema": MANIFEST_SCHEMA, "operation_id": operation["id"],
                "export_request_sha256": operation["request_sha256"],
                "workspace_id": store.identity["workspace_id"], "label": operation["request"]["label"],
                "created_at": operation["created_at"], "files": metadata,
                "expanded_bytes": expanded, "file_count": len(metadata),
                "source_manifest_sha256": metadata["source/source-manifest.json"]["sha256"],
                "configuration": "credentials_and_launcher_connection_files_are_external",
                "snapshot": "product_mutations_drained; historical_export_archives_are_external"}
    plan = {"schema": "commons.pmrs-export-plan.v1", "operation_id": operation["id"],
            "request_sha256": operation["request_sha256"], "snapshot": snapshot.name,
            "manifest": manifest, "manifest_sha256": digest(manifest)}
    json_file(output_root / "plan.json", plan)
    return plan

def _receipt(manifest, archive_identity, manifest_sha256):
    return {"schema": "commons.pmrs-export-receipt.v1", "operation_id": manifest["operation_id"],
            "workspace_id": manifest["workspace_id"], "name": "pmrs-handover.zip",
            **archive_identity, "manifest_sha256": manifest_sha256,
            "file_count": manifest["file_count"], "expanded_bytes": manifest["expanded_bytes"]}

def export_workspace(store, source_root, operation_id, *, label="Project and grant finance handover"):
    request = {"label": stable_text(label, 256), "workspace_id": store.identity["workspace_id"]}
    original = store.operation(operation_id, "workspace-export", request)
    output_root = private_directory(store.root / "exports" / operation_id)
    output, receipt_path, plan_path = (output_root / name for name in ("pmrs-handover.zip", "receipt.json", "plan.json"))
    if original.get("result"):
        result = original["result"]
        if not output.exists():
            return {**result, "available": False, "location": "original_archive_external_to_received_workspace"}
        require(_hash(output) == {k: result[k] for k in ("sha256", "bytes")},
                "ARCHIVE_CHANGED", "Retained handover differs.")
        return {**result, "available": True}
    # Match the original work() lock order; no competing original export is admitted.
    with file_lock(store.root / "locks" / "activity.lock", nonblocking=True):
        with file_lock(store.root / "locks" / (operation_id + ".lock"), nonblocking=True):
            original = store.operation(operation_id, "workspace-export", request)
            if original.get("result"):
                result = original["result"]
                return {**result, "available": output.is_file()}
            if receipt_path.exists():
                result = decode(read_bytes(receipt_path))
                require(result["operation_id"] == operation_id and result["workspace_id"] == store.identity["workspace_id"]
                        and _hash(output) == {k: result[k] for k in ("sha256", "bytes")},
                        "ARCHIVE_CHANGED", "Original export receipt or archive differs.")
                store.update_operation(operation_id, state="COMPLETE", result=result)
                return {**result, "available": True}
            if plan_path.exists(): plan = decode(read_bytes(plan_path))
            else:
                with store.locked(): plan = _freeze(store, source_root, original, output_root)
            require(plan.get("schema") == "commons.pmrs-export-plan.v1"
                    and plan["operation_id"] == operation_id and plan["request_sha256"] == original["request_sha256"]
                    and digest(plan["manifest"]) == plan["manifest_sha256"],
                    "EXPORT_PLAN_CHANGED", "The original frozen handover plan differs.")
            require(isinstance(plan["snapshot"], str) and plan["snapshot"].startswith("snapshot-")
                    and "/" not in plan["snapshot"] and "\\" not in plan["snapshot"],
                    "EXPORT_SNAPSHOT", "Invalid frozen source directory.")
            manifest = plan["manifest"]
            if output.exists():
                # A complete original ZIP may precede its final local receipt.
                selected = inspect_archive(output)
                require(selected["manifest_sha256"] == plan["manifest_sha256"]
                        and selected["manifest"] == manifest,
                        "ARCHIVE_ALREADY_EXISTS", "An existing archive belongs to a different frozen handover.")
            else:
                snapshot = output_root / plan["snapshot"]
                descriptor, temporary = tempfile.mkstemp(prefix=".handover-", dir=output_root)
                os.close(descriptor)
                try:
                    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                        for name, identity in sorted(manifest["files"].items()):
                            path = regular_file(snapshot / _member(name))
                            with path.open("rb") as inp, archive.open(_zip_info(name), "w", force_zip64=True) as out:
                                h, length = hashlib.sha256(), 0
                                while True:
                                    block = inp.read(1024 * 1024)
                                    if not block: break
                                    h.update(block); length += len(block); out.write(block)
                            require({"bytes": length, "sha256": h.hexdigest()} == identity,
                                    "EXPORT_SNAPSHOT_CHANGED", "A frozen original member differs.", member=name)
                        archive.writestr(_zip_info("handover.json"), encode(manifest))
                    require(Path(temporary).stat().st_size <= MAX_ARCHIVE_BYTES, "ARCHIVE_LIMIT", "Handover exceeds 4 GiB compressed.")
                    with open(temporary, "rb") as stream: os.fsync(stream.fileno())
                    try: os.link(temporary, output)
                    except FileExistsError:
                        require(_hash(output) == _hash(temporary), "ARCHIVE_ALREADY_EXISTS", "An existing archive differs.")
                    fsync_directory(output_root)
                finally:
                    try: os.unlink(temporary)
                    except FileNotFoundError: pass
            result = _receipt(manifest, _hash(output), plan["manifest_sha256"])
            json_file(receipt_path, result)
            store.update_operation(operation_id, state="COMPLETE", result=result)
            return {**result, "available": True}

def inspect_archive(path, expected_sha256=None):
    path = regular_file(path)
    require(path.stat().st_size <= MAX_ARCHIVE_BYTES, "ARCHIVE_LIMIT", "Archive exceeds 4 GiB.")
    archive_identity = _hash(path)
    if expected_sha256 is not None:
        require(archive_identity["sha256"] == full_sha(expected_sha256), "ARCHIVE_HASH", "Selected original archive hash differs.")
    with zipfile.ZipFile(path, "r") as archive:
        entries = archive.infolist()
        require(len(entries) <= MAX_FILES + 1 and len({x.filename for x in entries}) == len(entries),
                "ARCHIVE_DUPLICATE", "Archive names are duplicated or exceed the file limit.")
        for info in entries:
            _member(info.filename); mode = info.external_attr >> 16
            require(not info.is_dir() and not stat.S_ISLNK(mode) and stat.S_IFMT(mode) in {0, stat.S_IFREG}
                    and not info.flag_bits & 1, "ARCHIVE_MEMBER_TYPE", "Members must be unencrypted regular files.")
        manifest_info = archive.getinfo("handover.json")
        require(manifest_info.file_size <= 32 * 1024 * 1024, "ARCHIVE_MANIFEST_LIMIT", "Archive manifest is too large.")
        manifest_bytes = archive.read(manifest_info)
        manifest = decode(manifest_bytes)
        require(manifest.get("schema") == MANIFEST_SCHEMA and isinstance(manifest.get("files"), dict),
                "ARCHIVE_SCHEMA", "Unsupported complete handover.")
        request_id(manifest["operation_id"]); guid(manifest["workspace_id"]); full_sha(manifest["export_request_sha256"])
        expected = manifest["files"]
        require(set(expected) | {"handover.json"} == {x.filename for x in entries}
                and len(expected) == manifest["file_count"], "ARCHIVE_CLOSURE", "Archive selection differs from its manifest.")
        total = 0
        for name, identity in expected.items():
            rel = _member(name)
            require(len(rel.parts) > 1 and rel.parts[0] in {"source", "workspace", "reports"},
                    "ARCHIVE_SCOPE", "Unexpected handover root.")
            if rel.parts[0] == "workspace": _workspace_member("/".join(rel.parts[1:]))
            if rel.parts[0] == "reports":
                require(len(rel.parts) == 3 and rel.parts[2] in {"report.html", "record.json", "totals.csv", "columns.json"},
                        "ARCHIVE_REPORT_PATH", "Invalid report member.")
                full_sha(rel.parts[1])
            info = archive.getinfo(name)
            require(isinstance(identity, dict) and set(identity) == {"bytes", "sha256"}
                    and type(identity["bytes"]) is int and 0 <= identity["bytes"] == info.file_size,
                    "ARCHIVE_MEMBER_SIZE", "Member size differs from its declaration.")
            full_sha(identity["sha256"])
            total += info.file_size
            require(total <= MAX_EXPANDED_BYTES, "ARCHIVE_LIMIT", "Expanded handover exceeds 8 GiB.")
            with archive.open(info) as stream: actual = hashlib.file_digest(stream, "sha256").hexdigest()
            require(actual == identity["sha256"], "ARCHIVE_MEMBER_HASH", "An original member differs.", member=name)
        require(total == manifest["expanded_bytes"], "ARCHIVE_TOTAL", "Expanded byte count differs.")
        needed = {"workspace/workspace.json", "workspace/catalogue.json", "source/source-manifest.json",
                  "workspace/operations/" + manifest["operation_id"] + ".json"}
        require(needed <= set(expected), "ARCHIVE_CLOSURE", "Required complete source/workspace members are absent.")
        source_bytes = archive.read("source/source-manifest.json")
        source_manifest = decode(source_bytes)
        require(sha_bytes(source_bytes) == manifest["source_manifest_sha256"],
                "ARCHIVE_SOURCE_MANIFEST", "The original source manifest differs.")
        require(source_manifest.get("schema") == "commons.pmrs-source-manifest.v1"
                and isinstance(source_manifest.get("files"), dict), "ARCHIVE_SOURCE_SCHEMA", "Invalid product source selection.")
        declared_source = {"source/" + name: item for name, item in source_manifest["files"].items()}
        actual_source = {name: item for name, item in expected.items()
                         if name.startswith("source/") and name != "source/source-manifest.json"}
        require(actual_source == declared_source, "ARCHIVE_SOURCE_CLOSURE", "Complete original source selection differs.")
        workspace = decode(archive.read("workspace/workspace.json"))
        original = decode(archive.read("workspace/operations/" + manifest["operation_id"] + ".json"))
        require(workspace["workspace_id"] == manifest["workspace_id"]
                and original["id"] == manifest["operation_id"] and original["kind"] == "workspace-export"
                and digest(original["request"]) == original["request_sha256"] == manifest["export_request_sha256"]
                and original["request"]["workspace_id"] == manifest["workspace_id"],
                "ARCHIVE_OPERATION", "Original workspace/export request binding differs.")
    return {"archive": archive_identity, "manifest": manifest, "manifest_sha256": sha_bytes(manifest_bytes)}

def receive_workspace(archive_path, destination, *, expected_sha256):
    selected = inspect_archive(archive_path, expected_sha256)
    destination = Path(destination).absolute()
    private_directory(destination)
    with file_lock(destination / "receiving.lock", nonblocking=True):
        receipt_path = destination / "receiving.json"
        identity = {"schema": "commons.pmrs-receiving.v1", "archive_sha256": selected["archive"]["sha256"],
                    "manifest_sha256": selected["manifest_sha256"], "destination": str(destination)}
        if receipt_path.exists():
            receipt = decode(read_bytes(receipt_path))
            require(all(receipt.get(k) == v for k, v in identity.items()), "RECEIVING_CHANGED",
                    "This destination belongs to a different original archive.")
            if receipt.get("state") == "COMPLETE":
                current = decode(read_bytes(destination / "workspace" / "workspace.json"))
                require(current["workspace_id"] == receipt["workspace_id"],
                        "RECEIVING_IDENTITY", "The completed received workspace identity differs.")
                return receipt
        else:
            require(not [p.name for p in destination.iterdir() if p.name != "receiving.lock"],
                    "RECEIVING_DESTINATION", "Select an empty private receiving directory.")
            receipt = {**identity, "state": "RECEIVING", "started_at": now(), "completed_members": []}
            json_file(receipt_path, receipt)
        if receipt["state"] == "RECEIVING":
            with zipfile.ZipFile(archive_path, "r") as archive:
                for name, file_identity in sorted(selected["manifest"]["files"].items()):
                    path = destination / _member(name)
                    private_directory(path.parent)
                    if path.exists():
                        require(_hash(path) == file_identity, "RECEIVING_MEMBER_CHANGED",
                                "A received original member differs; it will not be overwritten.", member=name)
                    else:
                        descriptor, temporary = tempfile.mkstemp(prefix=".receive-", dir=path.parent)
                        try:
                            h, length = hashlib.sha256(), 0
                            with archive.open(name) as inp, os.fdopen(descriptor, "wb") as out:
                                while True:
                                    block = inp.read(1024 * 1024)
                                    if not block: break
                                    h.update(block); length += len(block); out.write(block)
                                out.flush(); os.fsync(out.fileno())
                            require({"sha256": h.hexdigest(), "bytes": length} == file_identity,
                                    "RECEIVING_CHANGED", "The archive changed during receiving.", member=name)
                            try: os.link(temporary, path)
                            except FileExistsError:
                                require(_hash(path) == file_identity, "RECEIVING_MEMBER_CHANGED", "A concurrent member differs.")
                            fsync_directory(path.parent)
                        finally:
                            try: os.unlink(temporary)
                            except FileNotFoundError: pass
                    if name not in receipt["completed_members"]: receipt["completed_members"].append(name)
                    if len(receipt["completed_members"]) % 128 == 0: json_file(receipt_path, receipt, replace=True)
            require(_hash(archive_path) == selected["archive"], "ARCHIVE_CHANGED", "Archive changed while receiving.")
            receipt["state"] = "VERIFYING"
            json_file(receipt_path, receipt, replace=True)
        # A receiving workspace is unavailable to the service until COMPLETE.
        received = Store(destination / "workspace", create=False)
        require(received.identity["workspace_id"] == selected["manifest"]["workspace_id"],
                "RECEIVING_IDENTITY", "Received workspace identity differs.")
        for row in received._catalogue()["items"]:
            record = received.record(row["id"], row["kind"])
            if row["kind"] == "source": Source(received, row["id"]).verify()
            elif row["kind"] == "reconciliation": verify_reconciliation(received, row["id"])
        imported = _receipt(selected["manifest"], selected["archive"], selected["manifest_sha256"])
        original = received.operation(imported["operation_id"])
        require(original["request_sha256"] == selected["manifest"]["export_request_sha256"],
                "RECEIVING_OPERATION", "Original export request differs.")
        received.update_operation(imported["operation_id"], state="COMPLETE", result=imported)
        retained_receipt = received.add_record("receipt", {
            "schema": "commons.pmrs-received-handover.v1", "label": selected["manifest"]["label"],
            "created_at": selected["manifest"]["created_at"], "export": imported,
            "source_manifest_sha256": selected["manifest"]["source_manifest_sha256"],
            "attribution": "verified_original_archive_received; credentials_remain_external"})
        receipt.update({"state": "COMPLETE", "completed_at": now(), "receipt_record_id": retained_receipt["id"],
                        "workspace": str(destination / "workspace"), "source": str(destination / "source"),
                        "workspace_id": received.identity["workspace_id"],
                        "file_count": selected["manifest"]["file_count"], "expanded_bytes": selected["manifest"]["expanded_bytes"]})
        json_file(receipt_path, receipt, replace=True)
        return receipt
