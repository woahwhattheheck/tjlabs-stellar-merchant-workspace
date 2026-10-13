"""Import a complete public capture, save its mapped handoff, and reopen its workspace."""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import tempfile

from .adapters import canonical, suggested_mapping
from .captures import capture_bytes, pack_directory, parse_capture, json_value
from .engine import Workspace, restore_backup


def sha(body):
    return hashlib.sha256(body).hexdigest()


def save(path, body, original=False):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if original and path.exists():
        if path.read_bytes() != body:
            raise ValueError("Existing selected output changed: " + str(path))
        return
    fd, temporary = tempfile.mkstemp(prefix=".capture-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.chmod(temporary, 0o600)
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        if original:
            try:
                os.link(temporary, path)
            except FileExistsError:
                if path.read_bytes() != body:
                    raise ValueError("Existing selected output changed: " + str(path))
        else:
            os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextmanager
def locked(path):
    """Keep one persistent lock inode; the OS releases its owner after interruption."""
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(descriptor).st_size == 0:
                os.write(descriptor, b"\0")
            os.lseek(descriptor, 0, os.SEEK_SET)
            msvcrt.locking(descriptor, msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(descriptor, fcntl.LOCK_EX)
        yield
    finally:
        os.close(descriptor)


def restore_selected(backup, destination):
    """Publish a complete verified workspace directory, preserving existing work."""
    destination = Path(destination).resolve()
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock_path = destination.parent / (".capture-restore-" + sha(str(destination).encode()) + ".lock")
    with locked(lock_path):
        if destination.exists():
            Workspace(destination)
            return
        with tempfile.TemporaryDirectory(prefix=".capture-restore-", dir=destination.parent) as temporary:
            staged = Path(temporary) / "workspace"
            restore_backup(backup, staged)
            Workspace(staged)
            if destination.exists():
                raise ValueError("The receiving destination was created while restoring: " + str(destination))
            os.rename(staged, destination)


def intake(workspace, capture, output, actor, operation, project_id=None, reopen_at=None, project_selection=None):
    if not isinstance(operation, str) or not 1 <= len(operation) <= 64:
        raise ValueError("Use one stable intake operation ID of 1–64 characters")
    lock_path = workspace.root / "capture-operations" / (sha(operation.encode()) + ".lock")
    with locked(lock_path):
        return _intake_locked(workspace, capture, output, actor, operation, project_id, reopen_at, project_selection)


def _intake_locked(workspace, capture, output, actor, operation, project_id=None, reopen_at=None, project_selection=None):
    if not isinstance(operation, str) or not 1 <= len(operation) <= 64:
        raise ValueError("Use one stable intake operation ID of 1–64 characters")
    capture, output = Path(capture), Path(output).resolve()
    body = capture_bytes(pack_directory(capture) if capture.is_dir() else capture.read_bytes())
    if len(body) > 32 * 1024 * 1024:
        raise ValueError("Capture carrier exceeds 32 MiB")
    parsed = parse_capture(json_value(body))
    geometry_edition = parsed["metadata"].get("geometry_included") is True
    binding = {"operation": operation, "actor": actor, "capture_sha256": sha(body),
               "output": str(output), "project_id": project_id,
               "reopen_at": str(Path(reopen_at).resolve()) if reopen_at else None}
    if project_selection is not None:
        if (not project_id or project_selection.get("project_id") != project_id
                or type(project_selection.get("revision")) is not int):
            raise ValueError("Receive the refresh into its selected original project revision")
        binding["project_selection"] = deepcopy(project_selection)
    journal_path = workspace.root / "capture-operations" / (sha(operation.encode()) + ".json")
    if journal_path.exists():
        journal = json_value(journal_path.read_bytes())
        if journal.get("binding") != binding:
            raise ValueError("Continue the original capture operation with its same source and destination")
    else:
        journal = {"schema": "municipal-capture-intake.v1", "binding": binding, "actions": {}, "outputs": {}}
    def persist():
        save(journal_path, (canonical(journal) + "\n").encode())
    persist()

    def step(name, function, arguments):
        selected = journal["actions"].get(name)
        if selected is None:
            selected = {"arguments": arguments}
            journal["actions"][name] = selected
            persist()
        if "result" not in selected:
            selected["result"] = function(**selected["arguments"])
            persist()
        return selected["result"]

    if not project_id:
        created = step("project", workspace.create_project, {
            "title": "Belleville · Waterfront Trails source", "mode": "public-reference",
            "actor": actor, "operation": operation + ".project"})
        project_id = created["id"]
    else:
        workspace.project(project_id)

    if geometry_edition and "previous_source" not in journal:
        previous_id = (project_selection["source_input_id"] if project_selection is not None
                       else workspace.project(project_id)["state"]["inputs"].get("source_assets"))
        previous = workspace.input(previous_id, project_id) if previous_id else None
        journal["previous_source"] = ({"input_id": previous_id, "sha256": previous["sha256"]}
                                      if previous else None)
        persist()

    def import_original(**arguments):
        return workspace.import_data(**arguments, body=body)
    imported = step("input", import_original, {
        "project_id": project_id, "expected_revision": (project_selection["revision"] if project_selection is not None
                                                       else workspace.project(project_id)["revision"]),
        "actor": actor, "operation": operation + ".input", "kind": "source_assets",
        "filename": "belleville-complete-geometry-capture.json" if geometry_edition else "belleville-complete-capture.json",
        "file_format": "belleville-capture"})

    mapping = (deepcopy(project_selection["mapping"]) if project_selection is not None
               else suggested_mapping("source_assets", parsed["columns"]))
    mapped = step("mapping", workspace.save_mapping, {
        "project_id": project_id, "expected_revision": (imported["revision"] if project_selection is not None
                                                       else workspace.project(project_id)["revision"]),
        "actor": actor, "operation": operation + ".mapping", "kind": "source_assets", "mapping": mapping})
    current = workspace.project(project_id)
    state = current["state"]
    settings = (deepcopy(project_selection["settings"]) if project_selection is not None
                else {key: state[key] for key in ("comparison_fields", "transitions", "attestation",
                      "expected_source_rows", "expected_target_rows", "expected_correlation_ids")})
    if project_selection is None:
        settings["comparison_fields"] = list(dict.fromkeys([*settings["comparison_fields"], "attributes",
                                                          *(["geometry"] if geometry_edition else [])]))
    settings["expected_source_rows"] = len(parsed["rows"])
    step("contract", workspace.save_settings, {
        "project_id": project_id, "expected_revision": (mapped["revision"] if project_selection is not None else current["revision"]),
        "actor": actor, "operation": operation + ".contract", "settings": settings})

    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    def product(name, build):
        item = journal["outputs"].get(name)
        path = output / name
        if item is None:
            if path.exists():
                raise ValueError("Choose a new handoff output directory; this file has no original intake identity: " + str(path))
            value = build()
            retained = workspace.root / "capture-operations" / "files" / sha(value)
            save(retained, value, original=True)
            item = {"path": str(path), "bytes": len(value), "sha256": sha(value), "retained_path": str(retained)}
            journal["outputs"][name] = item
            persist()
        retained = Path(item["retained_path"])
        if not retained.is_file():
            raise ValueError("Restore the retained original output: " + str(retained))
        value = retained.read_bytes()
        if len(value) != item["bytes"] or sha(value) != item["sha256"]:
            raise ValueError("Retained original output changed: " + str(retained))
        save(path, value, original=True)
        return path

    selected_revision = journal["actions"]["contract"]["result"]["revision"]
    def snapshot():
        if workspace.project(project_id)["revision"] != selected_revision:
            raise ValueError("The project changed after this intake selection; keep its new work and start a distinct source operation")
        value = workspace.backup()
        if workspace.project(project_id)["revision"] != selected_revision:
            raise ValueError("The project changed while saving its original snapshot")
        return value
    backup = product("Belleville_Editable_Workspace.zip", snapshot)
    frozen_root = workspace.root / "capture-operations" / "views" / sha(backup.read_bytes())
    restore_selected(backup, frozen_root)
    frozen = Workspace(frozen_root)
    frozen_project = frozen.project(project_id)
    if frozen_project["revision"] != selected_revision:
        raise ValueError("Saved receiving snapshot has a different project revision")
    product("Belleville_Original_Capture.json", lambda: body)
    if geometry_edition:
        from .geometry_capture import original_files
        geometry_manifest, geometry_files = original_files(json_value(body))
        product("Belleville_Original_Geometry.geojson", lambda: geometry_files[geometry_manifest["geometry"]["path"]])
    product("Belleville_Asset_Handoff.html", lambda: frozen.report(project_id))
    product("Belleville_Asset_Handoff.zip", lambda: frozen.export(project_id))
    if reopen_at:
        destination = Path(reopen_at).resolve()
        restore_selected(backup, destination)
        reopened = Workspace(destination)
        original = reopened.input(imported["input_id"], project_id)
        if original["sha256"] != sha(body) or original["body"] != body:
            raise ValueError("Reopened original input differs from the selected complete capture")
        reopened_project = reopened.project(project_id)
        expected_mapping = journal["actions"]["mapping"]["result"]["mapping_sha256"]
        actual_mapping = sha(canonical(reopened_project["state"]["mappings"]["source_assets"]["value"]).encode())
        if (expected_mapping != actual_mapping or reopened_project["state"]["inputs"]["source_assets"] != imported["input_id"]
                or reopened_project["revision"] != selected_revision):
            raise ValueError("Reopened project selected a different source or mapping")
        values = reopened._data(reopened_project["state"])[0]["source_assets"]
        if len(values) != len(parsed["rows"]) or len({row["id"] for row in values}) != len(values):
            raise ValueError("Reopened source identity population changed")
        if geometry_edition:
            previous = journal.get("previous_source")
            if previous:
                retained = reopened.input(previous["input_id"], project_id)
                if retained["sha256"] != previous["sha256"] or sha(retained["body"]) != previous["sha256"]:
                    raise ValueError("Reopened earlier source edition changed")
            if project_selection is not None:
                frozen_values = frozen._data(frozen_project["state"])[0]["source_assets"]
                if canonical(values) != canonical(frozen_values):
                    raise ValueError("Reopened selected mapping, attributes or geometry changed")
            expected = {row["__source_identity"]: row for row in parsed["rows"]}
            for row in ([] if project_selection is not None else values):
                selected = expected.get(row["id"])
                if selected is None or row["attributes"] != canonical(selected["__original_attributes"]):
                    raise ValueError("Reopened original typed attributes changed")
                wanted = canonical(selected["__geometry"]) if selected["__geometry"] is not None else ""
                if row["geometry"] != wanted:
                    raise ValueError("Reopened source geometry changed")
        journal["reopened"] = {"directory": str(destination), "project_id": project_id,
                               "revision": reopened_project["revision"], "original_rows": len(values),
                               "input_id": imported["input_id"], "capture_sha256": original["sha256"],
                               "geometry_rows": sum(bool(row["geometry"]) for row in values),
                               "geometry_capture_sha256": parsed["metadata"].get("geometry_capture_sha256")}
        persist()
    journal["project_id"] = project_id
    journal["state"] = "completed"
    persist()
    result = {"schema": journal["schema"], "state": journal["state"], "operation": operation,
              "project_id": project_id, "source_rows": len(parsed["rows"]),
              "original_attributes_sha256": parsed["metadata"]["attributes_sha256"],
              "geometry_included": geometry_edition,
              "previous_source": journal.get("previous_source"),
              "geometry_capture_sha256": parsed["metadata"].get("geometry_capture_sha256"),
              "geometry_paths": parsed["metadata"].get("geometry_paths"),
              "geometry_positions": parsed["metadata"].get("geometry_positions"),
              "geometry_absent_rows": parsed["metadata"].get("geometry_absent_rows"),
              "source_context": "public-reference", "outputs": journal["outputs"],
              "reopened": journal.get("reopened"), "journal": str(journal_path)}
    save(output / "intake-result.json", (canonical(result) + "\n").encode())
    return result
