"""Complete selected publishing source; original application APIs stay unchanged."""
from __future__ import annotations
import contextlib
import importlib
import importlib.metadata
import os
from pathlib import Path
import re
import subprocess
import sys
from files import (MAX_SOURCE_BYTES, MAX_SOURCE_FILE, absolute, copy_file, decode, digest, directory,
                   encoded, exact, file_identity, identifier, need, once, read, read_json, relative)

SOURCE_SCHEMA = "stellar-forge.publication-product-source.v1"
EDITION_SCHEMA = "stellar-forge.publication-source-edition.v1"
BRIDGE_FILES = ("files.py", "source.py", "manage.py", "operations.py", "launch.py", "wordpress-service.mjs")
INTERFACE_FIELDS = ("entry", "model", "store_class", "delivery", "native_runner", "import_names",
                    "operator_package_schema", "workspace_archive", "native_tools_archive")


def manifest_value(value):
    exact(value, ("schema", "title", "origin", "interface", "files", "provenance"),
          ("schema", "title", "origin", "interface", "files"))
    need(value["schema"] == SOURCE_SCHEMA, "source_schema", "Select the complete publishing source manifest.")
    need(isinstance(value["title"], str) and 1 <= len(value["title"]) <= 200,
         "source_title", "Give the selected product its complete title.")
    from urllib.parse import urlsplit
    origin = urlsplit(value["origin"])
    need(origin.scheme == "https" and origin.hostname and origin.path in ("", "/") and
         not origin.username and not origin.password and not origin.query and not origin.fragment,
         "source_origin", "Keep the original product's selected HTTPS source origin.")
    interface = value["interface"]
    exact(interface, INTERFACE_FIELDS, INTERFACE_FIELDS)
    for key in ("entry", "model", "delivery", "native_runner"):
        relative(interface[key])
    for key in ("workspace_archive", "native_tools_archive"):
        need("/" not in relative(interface[key]), "source_archive_name", "Keep the original operator package filename.")
    need(isinstance(interface["store_class"], str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", interface["store_class"]),
         "source_interface", "Select the original exported Store class.")
    names = interface["import_names"]
    need(isinstance(names, list) and names and len(names) == len(set(names)) and len(names) <= 100 and
         all(isinstance(x, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", x) for x in names),
         "source_interface", "Retain the original product's complete local Python import names.")
    need(isinstance(interface["operator_package_schema"], str) and 1 <= len(interface["operator_package_schema"]) <= 200,
         "source_interface", "Keep the original complete operator package schema.")
    rows = value["files"]
    need(isinstance(rows, list) and 1 <= len(rows) <= 10000, "source_members", "Select every ordinary original source file.")
    paths = set(); total = 0; modules = set()
    for row in rows:
        exact(row, ("path", "bytes", "sha256"), ("path", "bytes", "sha256"))
        path = relative(row["path"])
        need(path not in paths and isinstance(row["bytes"], int) and not isinstance(row["bytes"], bool) and
             0 <= row["bytes"] <= MAX_SOURCE_FILE and re.fullmatch(r"[a-f0-9]{64}", str(row["sha256"])),
             "source_member", "A complete source member has an invalid identity.")
        paths.add(path); total += row["bytes"]
        if path.endswith(".py"):
            modules.add(Path(path).stem)
    need(total <= MAX_SOURCE_BYTES, "source_total_limit", "The selected full application exceeds the source size limit.")
    need(all(interface[key] in paths for key in ("entry", "model", "delivery", "native_runner")) and
         "LICENSE" in paths and set(names) <= modules,
         "source_incomplete", "Include the original entrypoints, local modules, native runner and root license.")
    need(Path(interface["entry"]).parent == Path(interface["model"]).parent ==
         Path(interface["delivery"]).parent,
         "source_layout", "Keep the original application, model and delivery module together.")
    return value


def selected_manifest(path):
    raw = read(path, 8 * 1024 * 1024)
    return manifest_value(decode(raw)), {"bytes": len(raw), "sha256": digest(raw), "path": str(absolute(path))}


def bridge_manifest(root):
    root = directory(root)
    rows = []
    for name in BRIDGE_FILES:
        item = file_identity(root / name, MAX_SOURCE_FILE)
        rows.append({"path": name, "bytes": item["bytes"], "sha256": item["sha256"]})
    return rows


def validate_bridge(bridge):
    need(isinstance(bridge, list) and len(bridge) == len(BRIDGE_FILES),
         "bridge_incomplete", "Select every maintained native installation bridge member.")
    need([row.get("path") for row in bridge if isinstance(row, dict)] == list(BRIDGE_FILES),
         "bridge_incomplete", "Keep the complete native bridge in its original member order.")
    for row in bridge:
        exact(row, ("path", "bytes", "sha256"), ("path", "bytes", "sha256"))
        need(isinstance(row["bytes"], int) and not isinstance(row["bytes"], bool) and
             0 <= row["bytes"] <= MAX_SOURCE_FILE and
             isinstance(row["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", row["sha256"]),
             "bridge_identity", "A native bridge member has an invalid complete identity.")
    return bridge


def source_identity(manifest, bridge):
    return digest(encoded({"source": manifest, "bridge": bridge}))


def check_source(root, manifest):
    root = directory(root)
    for row in manifest["files"]:
        actual = file_identity(root / row["path"], MAX_SOURCE_FILE)
        need(actual["bytes"] == row["bytes"] and actual["sha256"] == row["sha256"],
             "source_changed", "The selected original application member has changed: " + row["path"])
    return root


def materialize_edition(installation, source_root, manifest, bridge_root, bridge):
    manifest_value(manifest)
    validate_bridge(bridge)
    source_root = check_source(source_root, manifest)
    identity = source_identity(manifest, bridge)
    root = directory(absolute(installation) / "editions" / identity, create=True, private=True)
    source = directory(root / "source", create=True, private=True)
    native = directory(root / "bridge", create=True, private=True)
    for row in manifest["files"]:
        copy_file(source_root / row["path"], source / row["path"], row)
    for row in bridge:
        need(row["path"] in BRIDGE_FILES, "bridge_member", "Use the complete maintained installation bridge.")
        copy_file(absolute(bridge_root) / row["path"], native / row["path"], row)
    once(root / "SOURCE.json", encoded(manifest))
    once(root / "BRIDGE.json", encoded(bridge))
    edition = {"schema": EDITION_SCHEMA, "source_identity": identity,
               "product_source_identity": digest(encoded(manifest)), "directory": str(root),
               "source": str(source), "bridge": str(native), "files": manifest["files"],
               "bridge_files": bridge}
    once(root / "EDITION.json", encoded(edition))
    return edition


def read_edition(installation, identity, *, verify=True):
    need(isinstance(identity, str) and re.fullmatch(r"[a-f0-9]{64}", identity),
         "source_identity", "Keep the selected complete source identity.")
    root = directory(absolute(installation) / "editions" / identity)
    edition = read_json(root / "EDITION.json")
    manifest = manifest_value(read_json(root / "SOURCE.json"))
    bridge = validate_bridge(read_json(root / "BRIDGE.json"))
    need(edition.get("schema") == EDITION_SCHEMA and edition.get("source_identity") == identity and
         edition.get("product_source_identity") == digest(encoded(manifest)) and
         edition.get("directory") == str(root) and edition.get("source") == str(root / "source") and
         edition.get("bridge") == str(root / "bridge") and
         edition.get("files") == manifest["files"] and edition.get("bridge_files") == bridge and
         source_identity(manifest, bridge) == identity,
         "source_edition_changed", "The selected original source edition has changed.")
    need({row.get("path") for row in bridge} == set(BRIDGE_FILES) and len(bridge) == len(BRIDGE_FILES),
         "bridge_incomplete", "The installed native bridge is incomplete.")
    if verify:
        check_source(root / "source", manifest)
        need(bridge_manifest(root / "bridge") == bridge, "bridge_changed", "The installed native bridge has changed.")
    return edition, manifest


def python_selection(value):
    requested = absolute(value)
    resolved = requested.resolve(strict=True)
    need(resolved.is_file() and os.access(resolved, os.X_OK), "python_unavailable", "Select an installed Python executable.")
    program = (
        "import importlib.metadata,json,pathlib,sys\n"
        "import lxml.etree\n"
        "print(json.dumps({'path':str(pathlib.Path(sys.executable).resolve()),"
        "'version':list(sys.version_info[:3]),'lxml_version':importlib.metadata.version('lxml')}))\n"
    )
    result = subprocess.run([str(resolved), "-B", "-c", program], capture_output=True, timeout=30)
    need(result.returncode == 0, "python_dependencies", "Select Python 3.11 or later with the original lxml requirement installed.")
    selected = decode(result.stdout)
    need(selected.get("path") == str(resolved) and selected.get("version", [0, 0])[:2] >= [3, 11],
         "python_version", "The selected publishing interpreter must be Python 3.11 or later.")
    version = re.match(r"^(\d+)\.(\d+)", str(selected.get("lxml_version", "")))
    need(version and (5, 3) <= tuple(map(int, version.groups())) < (7, 0),
         "python_dependencies", "The original publishing source requires lxml>=5.3,<7.")
    return selected


@contextlib.contextmanager
def application(installation, selected, *, verify=True):
    edition, manifest = read_edition(installation, selected["source_identity"], verify=verify)
    interface = manifest["interface"]
    source_root = Path(edition["source"])
    app_dir = source_root / Path(interface["entry"]).parent
    saved_path = list(sys.path)
    names = set(interface["import_names"])
    names.add(Path(interface["model"]).stem); names.add(Path(interface["delivery"]).stem)
    saved_modules = {name: sys.modules.pop(name) for name in names if name in sys.modules}
    try:
        sys.path.insert(0, str(app_dir))
        importlib.invalidate_caches()
        model = importlib.import_module(Path(interface["model"]).stem)
        need(Path(model.__file__).resolve() == source_root / interface["model"],
             "original_model_changed", "The original model resolved outside the selected source.")
        store_class = getattr(model, interface["store_class"])
        need(callable(getattr(store_class, "initialize", None)), "original_model_changed", "Use the original complete Store API.")
        yield {"edition": edition, "manifest": manifest, "model": model, "Store": store_class,
               "directory": app_dir, "source": source_root, "interface": interface}
    finally:
        for name in names:
            sys.modules.pop(name, None)
        sys.modules.update(saved_modules)
        sys.path[:] = saved_path
        importlib.invalidate_caches()


def delivery_module(context):
    module = importlib.import_module(Path(context["interface"]["delivery"]).stem)
    need(Path(module.__file__).resolve() == context["source"] / context["interface"]["delivery"],
         "original_delivery_changed", "The original delivery module resolved outside the selected source.")
    need(callable(getattr(module, "operator_package", None)) and callable(getattr(module, "native_tools", None)),
         "original_delivery_changed", "Use the original complete publishing delivery API.")
    return module
