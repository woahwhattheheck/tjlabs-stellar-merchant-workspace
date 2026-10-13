"""Install, export and independently receive the original publication product."""
from __future__ import annotations
import contextlib
from datetime import datetime, timezone
import importlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile
import uuid
import zipfile
from files import (MAX_ARCHIVE_BYTES, MAX_SOURCE_BYTES, PublicationError, absolute, atomic, copy_file, decode,
                   digest, directory, encoded, exact, file_identity, identifier, inventory, locked, need,
                   once, read, read_json, relative, save, verify_zip, write_zip, zip_index, extract_zip)
from source import (BRIDGE_FILES, SOURCE_SCHEMA, application, bridge_manifest, check_source, delivery_module,
                    manifest_value, materialize_edition, python_selection, read_edition, selected_manifest,
                    source_identity)

INSTALL_SCHEMA = "stellar-forge.publication-installation.v1"
SNAPSHOT_SCHEMA = "stellar-forge.publication-installation-archive.v1"
SOURCE_ROOT = Path(__file__).resolve().parent


def now():
    return datetime.now(timezone.utc).isoformat()


def within(path, root):
    path = absolute(path); root = absolute(root)
    need(path != root and root in path.parents, "installation_path_changed", "Keep the selected installation's original paths inside its directory.")
    return path


def installation(directory_path, *, verify=True):
    root = directory(directory_path, private=True)
    value = read_json(root / "installation.json")
    need(value.get("schema") == INSTALL_SCHEMA and value.get("directory") == str(root) and
         re.fullmatch(r"[a-f0-9-]{36}", str(value.get("installation_id", ""))),
         "installation_changed", "Select the original complete publication installation.")
    workspace = within(value["workspace"], root / "workspaces")
    directory(workspace, private=True)
    need((workspace / "workspace.sqlite").is_file(), "workspace_missing", "The selected original workspace database is absent.")
    read_edition(root, value["source_identity"], verify=verify)
    if value.get("native"):
        native = value["native"]
        need(native.get("directory") == str(root / "native-runtime") and
             native.get("core_zip") == str(root / "native-input" / str(native.get("core_sha256")) / "wordpress.zip"),
             "native_path_changed", "Keep the original selected native runtime paths.")
    return value


def summary(value):
    root = Path(value["directory"])
    edition, manifest = read_edition(root, value["source_identity"], verify=False)
    info = root.stat()
    return {"installation_id": value["installation_id"], "operation_id": value["operation_id"],
            "source_identity": value["source_identity"], "product_source_identity": edition["product_source_identity"],
            "title": manifest["title"], "origin": manifest["origin"], "python": value["python"],
            "paths": {"directory": str(root), "source": edition["source"],
                      "application": str(Path(edition["source"]) / Path(manifest["interface"]["entry"]).parent),
                      "workspace": value["workspace"], "database": str(Path(value["workspace"]) / "workspace.sqlite"),
                      "bridge": edition["bridge"], "native": str(root / "native-runtime")},
            "binding": {"directory": str(root), "device": str(info.st_dev), "inode": str(info.st_ino)},
            "native_configured": bool(value.get("native")), "received_from": value.get("received_from")}


def check_binding(value, binding):
    if binding is None:
        return
    exact(binding, ("installation_id", "source_identity"), ("installation_id", "source_identity"))
    need(binding["installation_id"] == value["installation_id"] and binding["source_identity"] == value["source_identity"],
         "installation_changed", "Read the selected original installation and source before operating it.")


def journal(root, operation_id, kind, request):
    operation_id = identifier(operation_id)
    path = directory(Path(root) / "operations" / operation_id, create=True, private=True)
    body = {"schema": "stellar-forge.publication-lifecycle-request.v1", "operation_id": operation_id,
            "kind": kind, "request": request}
    once(path / "REQUEST.json", encoded(body))
    result_path = path / "RESULT.json"
    result = read_json(result_path) if result_path.exists() else None
    return path, result


def finish(path, result):
    once(Path(path) / "RESULT.json", encoded(result))
    return result


def input_file(path):
    value = file_identity(path)
    return {key: value[key] for key in ("path", "bytes", "sha256")}


def completed_input(root, operation_id, kind, expected):
    """Receive a committed result or its original metadata-before-result transition."""
    root = directory(root, private=True)
    path = root / "operations" / identifier(operation_id)
    if not (path / "REQUEST.json").is_file():
        return None
    record = read_json(path / "REQUEST.json")
    need(record.get("operation_id") == operation_id and record.get("kind") == kind,
         "operation_conflict", "The retained original operation has another kind.")
    request = record["request"]
    for key, value in expected.items():
        need(request.get(key) == value, "operation_conflict", "The original operation input changed: " + key)
    completed = (path / "RESULT.json").is_file()
    if not completed and not (root / "installation.json").is_file():
        return None
    current = installation(root)
    if completed:
        result = read_json(path / "RESULT.json")
    elif kind == "prepare":
        if current["operation_id"] != operation_id or current["source_identity"] != request["source_identity"]:
            return None
        creation = read_json(root / "CREATION.json")
        need(creation == {"operation_id": operation_id, "kind": kind, "request_sha256": digest(encoded(request))},
             "installation_creation_changed", "The original preparation selection changed.")
        result = {"installation": current, "restored": read_json(path / "RESTORED.json"), "replayed": False}
    elif kind == "receive":
        if current["operation_id"] != operation_id:
            return None
        need(current.get("received_from", {}).get("archive_sha256") == request["archive"]["sha256"],
             "receiving_conflict", "The committed receiving marker identifies another complete original archive.")
        restored = None
        for attempt in sorted((path / "attempts").iterdir()):
            if (attempt / "RESTORED.json").is_file():
                candidate = read_json(attempt / "RESTORED.json")
                if candidate.get("workspace") == current["workspace"]:
                    restored = candidate
                    break
        need(restored is not None, "restore_record_missing", "The committed original restore record is absent.")
        result = {"installation": current, "original_archive": request["archive"],
                  "restored": restored, "replayed": False}
    elif kind == "adopt_source":
        if current["source_identity"] != request["source_identity"] or not (path / "BEFORE.json").is_file():
            return None
        before = read_json(path / "BEFORE.json")
        expected_current = {**before, "source_identity": request["source_identity"],
                            "source_history": [*before["source_history"], *(
                                [] if request["source_identity"] in before["source_history"] else [request["source_identity"]])]}
        need(current == expected_current, "source_adoption_changed", "The original source adoption marker has changed.")
        with application(root, current) as context:
            state = context["Store"](current["workspace"]).state()
        result = {"installation": current, "previous_source_identity": before["source_identity"],
                  "counts": state["counts"], "replayed": False}
    else:
        return None
    prior = result.get("installation")
    if prior is not None:
        need(current["installation_id"] == prior["installation_id"],
             "installation_changed", "The selected directory now identifies another installation.")
        read_edition(root, prior["source_identity"])
        if kind == "adopt_source":
            need(current["source_identity"] == prior["source_identity"],
                 "source_adoption_superseded", "Inspect the later source edition before operating it.")
    for key in ("source_manifest", "workspace_archive", "archive"):
        identity = request.get(key)
        if identity and Path(identity["path"]).exists():
            actual = input_file(identity["path"])
            need(actual["bytes"] == identity["bytes"] and actual["sha256"] == identity["sha256"],
                 "operation_input_changed", "The retained original input file changed: " + key)
    if request.get("source_root") and Path(request["source_root"]).exists():
        _, manifest = read_edition(root, request["source_identity"])
        check_source(request["source_root"], manifest)
    if kind == "receive":
        retained = root / "inputs" / "Original_Installation.zip"
        original = request["archive"]
        actual = input_file(retained)
        need(actual["bytes"] == original["bytes"] and actual["sha256"] == original["sha256"],
             "received_original_changed", "The retained complete originating installation archive has changed.")
        verify_zip(retained, schema=SNAPSHOT_SCHEMA)
    if not completed:
        finish(path, result)
    return {**result, "replayed": True}


def selected_native(root, value):
    if value is None:
        return None
    exact(value, ("node", "playground_module", "wordpress_zip"), ("node", "playground_module", "wordpress_zip"))
    node = absolute(value["node"]).resolve(strict=True)
    need(node.is_file() and os.access(node, os.X_OK), "node_unavailable", "Select an installed Node executable.")
    module = file_identity(value["playground_module"])
    core = file_identity(value["wordpress_zip"])
    with zipfile.ZipFile(value["wordpress_zip"]) as archive:
        names = {x.filename for x in zip_index(archive)}
        need("wordpress/wp-includes/version.php" in names and "wordpress/wp-admin/install.php" in names,
             "wordpress_source", "Select the complete original WordPress core archive.")
    destination = Path(root) / "native-input" / core["sha256"] / "wordpress.zip"
    copy_file(value["wordpress_zip"], destination, core)
    return {"node": str(node), "playground_module": module, "core_zip": str(destination),
            "core_sha256": core["sha256"], "core_bytes": core["bytes"],
            "directory": str(Path(root) / "native-runtime")}


def original_restore(root, operation, selected, archive, actor):
    attempts = directory(operation / "attempts", create=True, private=True)
    # An interrupted original restore remains a complete retained attempt. Its
    # successor restores the same immutable archive into another empty workspace.
    for old in sorted(attempts.iterdir()):
        result = old / "RESTORED.json"
        if result.is_file():
            retained = read_json(result)
            target = within(retained["workspace"], root / "workspaces")
            with application(root, selected) as ctx:
                store = ctx["Store"](target)
                need(store.settings()["origin"] == ctx["manifest"]["origin"],
                     "restored_origin_changed", "The original restored workspace belongs to another source.")
            return str(target), retained
    attempt = directory(attempts / str(uuid.uuid4()), create=True, private=True)
    target = directory(root / "workspaces" / str(uuid.uuid4()), create=True, private=True, empty=True)
    save(attempt / "ATTEMPT.json", {"created_at": now(), "workspace": str(target),
                                   "archive": file_identity(archive) if archive else None})
    with application(root, selected) as ctx:
        store = ctx["Store"].initialize(target)
        if archive is not None:
            outcome = store.restore_archive(read(archive, MAX_ARCHIVE_BYTES), actor)
        else:
            outcome = store.state()
        need(store.settings()["origin"] == ctx["manifest"]["origin"],
             "source_origin_changed", "The actual original Store has another selected source origin.")
        result = {"workspace": str(target), "completed_at": now(), "counts": outcome.get("counts", {}),
                  "archive": file_identity(archive) if archive else None}
    save(attempt / "RESTORED.json", result)
    return str(target), result


def prepare(*, source_root, source_manifest, directory_path, python, operation_id,
            workspace_archive=None, actor="Publishing operator", native=None):
    root = directory(directory_path, create=True, private=True)
    with locked(root / "installation.lock"):
        completed = completed_input(root, operation_id, "prepare",
                                    {"source_root": str(absolute(source_root)), "manifest_path": str(absolute(source_manifest)),
                                     "python_input": str(absolute(python)), "workspace_archive_path": str(absolute(workspace_archive)) if workspace_archive else None,
                                     "actor": actor, "native": native})
        if completed:
            return completed
    manifest, original_manifest = selected_manifest(source_manifest)
    source_root = check_source(source_root, manifest)
    bridge = bridge_manifest(SOURCE_ROOT)
    selected_python = python_selection(python)
    source_id = source_identity(manifest, bridge)
    source_request = {"source_root": str(source_root), "source_manifest": original_manifest,
                      "manifest_path": str(absolute(source_manifest)), "python_input": str(absolute(python)),
                      "workspace_archive_path": str(absolute(workspace_archive)) if workspace_archive else None,
                      "source_identity": source_id, "bridge": bridge, "python": selected_python,
                      "workspace_archive": input_file(workspace_archive) if workspace_archive else None,
                      "actor": actor, "native": native}
    with locked(root / "installation.lock"):
        operation, completed = journal(root, operation_id, "prepare", source_request)
        if completed:
            return {**completed, "replayed": True}
        marker = root / "installation.json"
        if marker.exists():
            value = installation(root)
            need(value["operation_id"] == operation_id and value["source_identity"] == source_id,
                 "installation_exists", "Use the existing original installation or select a new receiving directory.")
            return finish(operation, {"installation": value, "restored": read_json(operation / "RESTORED.json"), "replayed": False})
        once(root / "CREATION.json", encoded({"operation_id": operation_id, "kind": "prepare",
                                             "request_sha256": digest(encoded(source_request))}))
        edition = materialize_edition(root, source_root, manifest, SOURCE_ROOT, bridge)
        selected = {"source_identity": source_id}
        retained_archive = None
        if workspace_archive:
            retained_archive = root / "inputs" / "workspace-recovery.zip"
            copy_file(workspace_archive, retained_archive, source_request["workspace_archive"])
        workspace, restored = original_restore(root, operation, selected, retained_archive, actor)
        native_selection = selected_native(root, native)
        value = {"schema": INSTALL_SCHEMA, "installation_id": str(uuid.uuid4()), "operation_id": operation_id,
                 "created_at": now(), "directory": str(root), "source_identity": source_id,
                 "workspace": workspace, "python": selected_python, "native": native_selection,
                 "received_from": None, "source_history": [source_id]}
        once(operation / "RESTORED.json", encoded(restored))
        save(marker, value)
        return finish(operation, {"installation": value, "restored": restored, "replayed": False})


def inspect(directory_path):
    value = installation(directory_path)
    with application(value["directory"], value) as ctx:
        store = ctx["Store"](value["workspace"])
        need(store.settings()["origin"] == ctx["manifest"]["origin"], "source_origin_changed", "The saved source origin differs from this product.")
        state = store.state()
        with store.db() as db:
            integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
            tables = [{"name": x[0], "rows": db.execute('SELECT COUNT(*) FROM "' + x[0].replace('"', '""') + '"').fetchone()[0]}
                      for x in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        need(integrity == "ok", "database_integrity", "The original workspace database did not pass its native integrity check.")
    return {"installation": value, "counts": state["counts"], "configuration_revision": state["config"]["revision"],
            "database": {"integrity": integrity, "tables": tables}, "source_files": len(ctx["manifest"]["files"]),
            "source_history": value["source_history"]}


def read_business(directory_path, operation, arguments):
    value = installation(directory_path)
    with application(value["directory"], value) as ctx:
        store = ctx["Store"](value["workspace"])
        if operation == "workspace.state":
            return store.state()
        if operation == "workspace.record":
            return store.detail(arguments["id"])
        if operation == "workspace.history":
            return store.history(arguments["id"])
        if operation == "workspace.job":
            return store.job(arguments["id"])
        if operation == "procurement.state":
            return store.procurement.state()
        if operation == "procurement.document":
            return store.procurement.document(arguments["id"])
        if operation == "procurement.requirement":
            return store.procurement.requirement(arguments["id"])
        if operation == "native.return":
            module = ctx["model"].native_return
            return module.preview(store, arguments["id"])
    raise PublicationError("unknown_operation", "Select an original publication read operation.")


def archive_operator(context, raw, selected_source):
    interface = context["interface"]
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = zip_index(archive)
        names = {item.filename for item in infos if not item.is_dir()}
        header = decode(archive.read("PACKAGE.json"))
        need(header.get("schema") == interface["operator_package_schema"] and
             header.get("source_origin") == context["manifest"]["origin"],
             "original_operator_archive", "The original operator package identifies another source product.")
        indexed = set()
        for row in header["files"]:
            name = relative(row["path"])
            need(name not in indexed and name in names, "original_operator_archive", "The original operator index repeats or omits a member.")
            indexed.add(name)
            value = archive.read(name)
            need(len(value) == row["bytes"] and digest(value) == row["sha256"],
                 "original_operator_archive", "The original operator package differs from its source index.")
        need(indexed | {"PACKAGE.json"} == names and
             interface["workspace_archive"] in names and interface["native_tools_archive"] in names,
             "original_operator_archive", "Receive the complete original source, workspace and native tools.")
        # Every source file required by the native program remains in its original
        # root. The outer snapshot separately carries all selected source members.
        for key in ("entry", "model", "delivery", "native_runner"):
            name = interface[key]
            expected = next(row for row in selected_source["files"] if row["path"] == name)
            need("source/" + name in names and digest(archive.read("source/" + name)) == expected["sha256"],
                 "original_operator_source", "The complete operator handover selected a different source entrypoint.")
    return header


def export_original(directory_path, kind, output, operation_id, actor):
    value = installation(directory_path, verify=False)
    root = Path(value["directory"])
    output = absolute(output)
    need(root not in output.parents and output != root, "export_inside_installation", "Save the complete export outside its original installation.")
    allowed = ("workspace", "operator", "native-tools", "procurement")
    need(kind in allowed, "export_kind", "Choose workspace, operator, native-tools or procurement.")
    with locked(root / "installation.lock"), locked(root / "services" / "operator.lock"):
        operation, completed = journal(root, operation_id, "export", {"kind": kind, "output": str(output), "actor": actor})
        if completed:
            item = file_identity(output)
            need(item["bytes"] == completed["file"]["bytes"] and item["sha256"] == completed["file"]["sha256"],
                 "export_changed", "Keep the completed original export bytes.")
            return {**completed, "replayed": True}
        selected = read_json(operation / "SELECTED.json") if (operation / "SELECTED.json").exists() else None
        if selected is None:
            selected = {"source_identity": value["source_identity"], "selected_at": now()}
            once(operation / "SELECTED.json", encoded(selected))
        need(selected["source_identity"] == value["source_identity"], "export_source_changed", "Continue the export with its originally selected source edition.")
        original = operation / "ORIGINAL.zip"
        if not original.exists():
            with application(root, value) as ctx:
                store = ctx["Store"](value["workspace"])
                delivery = delivery_module(ctx)
                if kind == "workspace":
                    raw = store.backup()
                elif kind == "operator":
                    raw = delivery.operator_package(store)
                    archive_operator(ctx, raw, ctx["manifest"])
                elif kind == "native-tools":
                    raw = delivery.native_tools()
                else:
                    raw = store.procurement.export(actor)
            once(original, raw)
        copy_file(original, output)
        return finish(operation, {"kind": kind, "file": file_identity(output),
                                  "source_identity": selected["source_identity"], "replayed": False})


def snapshot(directory_path, output, operation_id):
    value = installation(directory_path, verify=False)
    root = Path(value["directory"]); output = absolute(output)
    need(root not in output.parents and output != root, "export_inside_installation", "Save the complete installation archive outside its source.")
    with locked(root / "installation.lock"), locked(root / "services" / "operator.lock"), \
         locked(root / "services" / "wordpress.lock"):
        operation, completed = journal(root, operation_id, "snapshot", {"output": str(output)})
        if completed:
            current = file_identity(output)
            need(current["bytes"] == completed["archive"]["bytes"] and current["sha256"] == completed["archive"]["sha256"],
                 "snapshot_changed", "Keep the exact completed whole installation archive.")
            verify_zip(output, schema=SNAPSHOT_SCHEMA)
            return {**completed, "replayed": True}
        # A fully published original archive is received before new source or
        # workspace materialization, including recovery after the result write.
        if output.exists():
            header = verify_zip(output, schema=SNAPSHOT_SCHEMA)
            retained = read_json(operation / "SELECTED.json")
            need(header.get("installation_id") == retained["installation_id"] == value["installation_id"] and
                 header.get("operation_id") == operation_id and header.get("source_identity") == retained["source_identity"],
                 "snapshot_conflict", "That complete output belongs to another installation operation.")
            with zipfile.ZipFile(output) as archive:
                need(decode(archive.read("INSTALLATION.json")) == retained,
                     "snapshot_conflict", "That complete output changed its original selected installation.")
                calculated = digest(encoded({"installation": retained, "files": header["files"]}))
                need(calculated == header.get("snapshot"), "snapshot_conflict", "The complete snapshot identity has changed.")
            return finish(operation, {"archive": file_identity(output), "snapshot": header["snapshot"],
                                      "source_identity": header["source_identity"], "replayed": False})
        stage = directory(operation / "payload", create=True, private=True)
        selected_path = operation / "SELECTED.json"
        selected = read_json(selected_path) if selected_path.exists() else value
        if not selected_path.exists():
            once(selected_path, encoded(selected))
        need(selected["source_identity"] == value["source_identity"] and selected["workspace"] == value["workspace"],
             "snapshot_source_changed", "Continue the complete archive with its originally selected source and workspace.")
        once(stage / "INSTALLATION.json", encoded(selected))
        for identity in selected["source_history"]:
            edition, manifest = read_edition(root, identity)
            destination = stage / "editions" / identity
            directory(destination, create=True, private=True)
            once(destination / "SOURCE.json", encoded(manifest))
            once(destination / "BRIDGE.json", encoded(edition["bridge_files"]))
            for row in manifest["files"]:
                copy_file(Path(edition["source"]) / row["path"], destination / "source" / row["path"], row)
            for row in edition["bridge_files"]:
                copy_file(Path(edition["bridge"]) / row["path"], destination / "bridge" / row["path"], row)
        operator_path = stage / "Operator_Handoff.zip"
        if not operator_path.exists():
            with application(root, selected) as ctx:
                store = ctx["Store"](selected["workspace"])
                raw = delivery_module(ctx).operator_package(store)
                archive_operator(ctx, raw, ctx["manifest"])
            once(operator_path, raw)
        if selected.get("native"):
            native = selected["native"]
            copy_file(native["core_zip"], stage / "native-input" / "wordpress.zip",
                      {"bytes": native["core_bytes"], "sha256": native["core_sha256"]})
            runtime = Path(native["directory"])
            if runtime.exists():
                rows = inventory(runtime)
                for row in rows:
                    copy_file(runtime / row["path"], stage / "native-runtime" / row["path"], row)
        # Earlier lifecycle records keep their exact authored inputs and results.
        # Archive-generation staging and previous full ZIPs are excluded at this
        # actual installer root, never by an original source filename.
        for prior in sorted((root / "operations").iterdir()):
            if prior == operation or not prior.is_dir():
                continue
            for name in ("REQUEST.json", "RESULT.json", "SELECTED.json"):
                if (prior / name).is_file():
                    copy_file(prior / name, stage / "history" / selected["installation_id"] / prior.name / name)
        inherited = root / "lineage" / "operations"
        if inherited.exists():
            for row in inventory(inherited, maximum=MAX_SOURCE_BYTES):
                copy_file(inherited / row["path"], stage / "history" / row["path"], row)
        rows = inventory(stage)
        snapshot_id = digest(encoded({"installation": selected, "files": rows}))
        header = {"schema": SNAPSHOT_SCHEMA, "snapshot": snapshot_id, "operation_id": operation_id,
                  "installation_id": selected["installation_id"], "source_identity": selected["source_identity"],
                  "created_at": now()}
        archive = write_zip(output, stage, rows, header)
        return finish(operation, {"archive": archive, "snapshot": snapshot_id,
                                  "source_identity": selected["source_identity"], "replayed": False})


def receive(*, archive_path, directory_path, python, operation_id, actor="Publishing operator", native_runtime=None):
    archive_path = absolute(archive_path)
    root = directory(directory_path, create=True, private=True)
    with locked(root / "installation.lock"):
        completed = completed_input(root, operation_id, "receive",
                                    {"archive_path": str(archive_path), "python_input": str(absolute(python)),
                                     "actor": actor, "native_runtime": native_runtime})
        if completed:
            return completed
    original = input_file(archive_path)
    header = verify_zip(archive_path, schema=SNAPSHOT_SCHEMA)
    selected_python = python_selection(python)
    request = {"archive": original, "archive_path": str(archive_path), "python": selected_python,
               "python_input": str(absolute(python)), "actor": actor, "native_runtime": native_runtime}
    with locked(root / "installation.lock"):
        operation, completed = journal(root, operation_id, "receive", request)
        if completed:
            return {**completed, "replayed": True}
        if (root / "installation.json").exists():
            current = installation(root)
            need(current.get("received_from", {}).get("archive_sha256") == original["sha256"] and
                 current["operation_id"] == operation_id, "receiving_conflict", "The original receiving directory selects another installation.")
            return finish(operation, {"installation": current, "original_archive": original, "replayed": False})
        once(root / "CREATION.json", encoded({"kind": "receive", "operation_id": operation_id,
                                             "request_sha256": digest(encoded(request))}))
        retained_archive = root / "inputs" / "Original_Installation.zip"
        copy_file(archive_path, retained_archive, original)
        payload = extract_zip(retained_archive, operation / "payload")
        original_install = read_json(payload / "INSTALLATION.json")
        need(original_install.get("schema") == INSTALL_SCHEMA and
             original_install["installation_id"] == header["installation_id"] and
             original_install["source_identity"] == header["source_identity"],
             "receiving_source_changed", "The complete archive identifies another original installation.")
        need(digest(encoded({"installation": original_install, "files": header["files"]})) == header.get("snapshot"),
             "snapshot_identity_changed", "The complete received snapshot has another original identity.")
        source_history = original_install["source_history"]
        need(isinstance(source_history, list) and len(source_history) == len(set(source_history)) and
             original_install["source_identity"] in source_history,
             "receiving_source_history", "Receive every original selected source edition once.")
        for identity in source_history:
            original_edition = payload / "editions" / identity
            manifest = manifest_value(read_json(original_edition / "SOURCE.json"))
            bridge = read_json(original_edition / "BRIDGE.json")
            need(source_identity(manifest, bridge) == identity, "receiving_source_changed", "An archived source edition has another identity.")
            materialize_edition(root, original_edition / "source", manifest, original_edition / "bridge", bridge)
        selected = {"source_identity": original_install["source_identity"]}
        with application(root, selected) as ctx:
            operator_raw = read(payload / "Operator_Handoff.zip", MAX_ARCHIVE_BYTES)
            archive_operator(ctx, operator_raw, ctx["manifest"])
            with zipfile.ZipFile(io.BytesIO(operator_raw)) as operator:
                recovery = operator.read(ctx["interface"]["workspace_archive"])
        original_recovery = root / "inputs" / "Original_Workspace_Recovery.zip"
        once(original_recovery, recovery)
        workspace, restored = original_restore(root, operation, selected, original_recovery, actor)
        native = None
        if original_install.get("native"):
            previous = original_install["native"]
            replacements = native_runtime or {}
            exact(replacements, ("node", "playground_module"))
            module_path = replacements.get("playground_module", previous["playground_module"]["path"])
            # The selected runtime may be reattached after receiving. Complete
            # core and native site bytes are retained now, regardless of host path.
            core = payload / "native-input" / "wordpress.zip"
            copied = copy_file(core, root / "native-input" / previous["core_sha256"] / "wordpress.zip",
                               {"bytes": previous["core_bytes"], "sha256": previous["core_sha256"]})
            native = {**previous, "node": replacements.get("node", previous["node"]),
                      "playground_module": ({**previous["playground_module"], "path": module_path}),
                      "core_zip": str(root / "native-input" / previous["core_sha256"] / "wordpress.zip"),
                      "directory": str(root / "native-runtime")}
            old_runtime = payload / "native-runtime"
            if old_runtime.exists():
                original_marker_path = old_runtime / "tjl-site.json"
                original_marker = read_json(original_marker_path) if original_marker_path.exists() else None
                if original_marker is not None:
                    need(original_marker.get("schema") == "tjl.migration.local-site.v1" and
                         original_marker.get("site") == str(Path(previous["directory"]) / "site"),
                         "native_site_binding", "The archived native marker does not identify its original site.")
                for row in inventory(old_runtime):
                    if row["path"] != "tjl-site.json":
                        copy_file(old_runtime / row["path"], root / "native-runtime" / row["path"], row)
                if original_marker is not None:
                    marker = root / "native-runtime" / "tjl-site.json"
                    rebased = {**original_marker, "site": str(root / "native-runtime" / "site")}
                    if marker.exists():
                        need(read_json(marker) == rebased, "native_site_binding",
                             "The selected receiving marker differs from its exact original transition.")
                    once(root / "lineage" / "native-site-original.json", encoded(original_marker))
                    once(marker, encoded(rebased))
        history = payload / "history"
        if history.exists():
            for row in inventory(history, maximum=MAX_SOURCE_BYTES):
                copy_file(history / row["path"], root / "lineage" / "operations" / row["path"], row)
        value = {"schema": INSTALL_SCHEMA, "installation_id": str(uuid.uuid4()), "operation_id": operation_id,
                 "created_at": now(), "directory": str(root), "source_identity": original_install["source_identity"],
                 "workspace": workspace, "python": selected_python, "native": native,
                 "source_history": source_history,
                 "received_from": {"installation_id": original_install["installation_id"],
                                   "operation_id": original_install["operation_id"],
                                   "snapshot": header["snapshot"], "archive_sha256": original["sha256"],
                                   "source_identity": original_install["source_identity"],
                                   "prior": original_install.get("received_from")}}
        once(root / "lineage" / "original-installation.json", encoded(original_install))
        save(root / "installation.json", value)
        return finish(operation, {"installation": value, "original_archive": original,
                                  "restored": restored, "replayed": False})


def adopt_source(directory_path, source_root, source_manifest, operation_id, binding=None):
    root = directory(directory_path, private=True)
    with locked(root / "installation.lock"):
        completed = completed_input(root, operation_id, "adopt_source",
                                    {"source_root": str(absolute(source_root)),
                                     "manifest_path": str(absolute(source_manifest)), "binding": binding})
        if completed:
            return completed
    manifest, manifest_file = selected_manifest(source_manifest)
    bridge = bridge_manifest(SOURCE_ROOT)
    source_id = source_identity(manifest, bridge)
    request = {"source_root": str(absolute(source_root)), "source_manifest": manifest_file,
               "manifest_path": str(absolute(source_manifest)),
               "source_identity": source_id, "bridge": bridge, "binding": binding}
    with locked(root / "installation.lock"), locked(root / "services" / "operator.lock"), \
         locked(root / "services" / "resident.lock"), locked(root / "services" / "wordpress.lock"):
        operation, completed = journal(root, operation_id, "adopt_source", request)
        value = installation(root)
        if completed:
            need(value["installation_id"] == completed["installation"]["installation_id"] and
                 value["source_identity"] == source_id, "source_adoption_superseded", "Inspect the later source edition before operating it.")
            return {**completed, "replayed": True}
        before_path = operation / "BEFORE.json"
        if before_path.exists():
            previous = read_json(before_path)
            need(value["installation_id"] == previous["installation_id"] and
                 value["source_identity"] in (previous["source_identity"], source_id),
                 "source_adoption_changed", "The original source adoption was superseded by another edition.")
        else:
            check_binding(value, binding)
            previous = value
            once(before_path, encoded(previous))
        _, old_manifest = read_edition(root, previous["source_identity"])
        need(manifest["origin"] == old_manifest["origin"], "source_origin_changed", "Keep this original workspace on its selected source origin.")
        materialize_edition(root, source_root, manifest, SOURCE_ROOT, bridge)
        updated = {**previous, "source_identity": source_id,
                   "source_history": [*previous["source_history"], *([] if source_id in previous["source_history"] else [source_id])]}
        with application(root, updated) as ctx:
            store = ctx["Store"](updated["workspace"])
            need(store.settings()["origin"] == manifest["origin"], "source_origin_changed", "The new original Store changed the saved source origin.")
            state = store.state()
        save(root / "installation.json", updated)
        return finish(operation, {"installation": updated, "previous_source_identity": previous["source_identity"],
                                  "counts": state["counts"], "replayed": False})


def configure_native(directory_path, native, operation_id, binding=None):
    value = installation(directory_path)
    check_binding(value, binding)
    root = Path(value["directory"])
    exact(native, ("node", "playground_module", "wordpress_zip"), ("node", "playground_module", "wordpress_zip"))
    # Resolve original input bytes before saving a configuration operation.
    source_files = {"core": input_file(native["wordpress_zip"]), "module": input_file(native["playground_module"])}
    request = {"native": native, "files": source_files, "binding": binding}
    with locked(root / "installation.lock"), locked(root / "services" / "wordpress.lock"):
        operation, completed = journal(root, operation_id, "configure_native", request)
        if completed:
            return {**completed, "replayed": True}
        current = installation(root)
        check_binding(current, binding)
        chosen = selected_native(root, native)
        updated = {**current, "native": chosen}
        save(root / "installation.json", updated)
        return finish(operation, {"installation": updated, "replayed": False})


def request_record(directory_path, request_id, origin_installation_id=None):
    value = installation(directory_path)
    request_id = identifier(request_id)
    origin = origin_installation_id or value["installation_id"]
    need(isinstance(origin, str) and re.fullmatch(r"[a-f0-9-]{36}", origin),
         "request_origin", "Keep the original installation identifier for a copied lifecycle request.")
    root = Path(value["directory"])
    path = root / "operations" / request_id if origin == value["installation_id"] else root / "lineage" / "operations" / origin / request_id
    if not (path / "REQUEST.json").is_file():
        return {"request": None, "origin_installation_id": origin}
    return {"request": read_json(path / "REQUEST.json"),
            "result": read_json(path / "RESULT.json") if (path / "RESULT.json").is_file() else None,
            "origin_installation_id": origin}


def describe_commands(directory_path, arguments):
    value = installation(directory_path)
    root = Path(value["directory"])
    roles = arguments.get("roles", ["operator"])
    need(isinstance(roles, list) and roles and len(roles) == len(set(roles)) and
         set(roles) <= {"operator", "resident", "wordpress"},
         "service_roles", "Choose the original operator, resident or WordPress services.")
    ready = absolute(arguments["ready_file"])
    directory(ready.parent, private=True)
    edition, manifest = read_edition(root, value["source_identity"])
    launcher = Path(edition["bridge"]) / "launch.py"
    launcher_info = file_identity(launcher)
    commands = []
    for role in roles:
        role_ready = ready if len(roles) == 1 else ready.with_name(ready.stem + "-" + role + ready.suffix)
        need(not role_ready.exists(), "ready_file_exists", "Select a fresh private ready file for this actual service launch.")
        port = arguments.get("port", 0)
        need(isinstance(port, int) and not isinstance(port, bool) and 0 <= port <= 65535,
             "service_port", "Select an ordinary local port.")
        release = arguments.get("release_id")
        if role == "resident":
            need(isinstance(release, str) and re.fullmatch(r"[a-f0-9]{64}", release),
                 "resident_release", "Select one complete frozen resident release.")
            release_dir = Path(value["workspace"]) / "oha-releases" / release
            need((release_dir / "release.json").is_file(), "resident_release", "The selected original resident release is absent.")
        if role == "wordpress":
            need(value.get("native"), "native_runtime_selection", "Select the original installed WordPress runtime and core archive.")
            native = value["native"]
            node = absolute(native["node"]).resolve(strict=True)
            need(node.is_file() and os.access(node, os.X_OK), "native_node", "Select the installed original Node executable.")
            module = file_identity(native["playground_module"]["path"])
            need(module["sha256"] == native["playground_module"]["sha256"] and
                 module["bytes"] == native["playground_module"]["bytes"],
                 "native_module_changed", "Reattach the selected original Playground module after changing its source.")
            core = file_identity(native["core_zip"])
            need(core["sha256"] == native["core_sha256"] and core["bytes"] == native["core_bytes"],
                 "native_core_changed", "Keep the complete original WordPress core bytes.")
            port = port or 8807
            need(port >= 1024, "native_port", "Choose the original local WordPress port from 1024 to 65535.")
        argv = [value["python"]["path"], "-B", str(launcher), "--directory", str(root),
                "--role", role, "--port", str(port), "--ready-file", str(role_ready),
                "--installation-id", value["installation_id"], "--source-identity", value["source_identity"]]
        if release:
            argv += ["--release-id", release]
        commands.append({"role": role, "executable": value["python"]["path"], "argv": argv,
                         "cwd": str(Path(edition["source"]) / Path(manifest["interface"]["entry"]).parent),
                         "script": str(launcher), "script_sha256": launcher_info["sha256"],
                         "ready_file": str(role_ready), "health": {"kind": "original-local-service",
                                                             "schema": "stellar-forge.publication-process.v1"},
                         "environment_references": ([{"name": "TJL_LOCAL_WP_PASSWORD",
                                                       "present": bool(os.environ.get("TJL_LOCAL_WP_PASSWORD"))}]
                                                    if role == "wordpress" else [])})
    return {"commands": commands, "installation": summary(value)}
