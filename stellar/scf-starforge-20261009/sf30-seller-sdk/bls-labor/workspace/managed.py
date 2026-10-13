"""Current original BLS workspace and installed source binding."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import sys
from model import SDK, BLS, SCHEMA, encoded, read_json, private_path, file_pin

BINDING_SCHEMA = "stellar-forge.bls-managed-binding.v1"
STARTUP_SCHEMA = "stellar-forge.bls-workspace-launch.v1"


def binding(directory):
    root = private_path(directory, directory=True)
    marker_path = private_path(root / "workspace.json")
    marker = read_json(marker_path)
    if marker.get("schema") != SCHEMA:
        raise ValueError("Choose the original complete BLS analyst workspace.")
    files = {}
    for path in sorted(BLS.rglob("*")):
        if path.is_file() and path.suffix in (".py", ".json", ".mjs", ".mts", ".html", ".css", ".md") and "__pycache__" not in path.parts:
            private_path(path)
            files[path.relative_to(SDK).as_posix()] = file_pin(path)["sha256"]
    for relative in ("source_bundle_archive.py", "source_file_delivery.py"):
        files[relative] = file_pin(SDK / relative)["sha256"]
    directory_stat, marker_stat = root.stat(), marker_path.stat()
    core = {"schema": BINDING_SCHEMA, "workspace": str(root),
            "workspaceIdentity": {"workspaceId": marker["workspace_id"],
                "device": str(directory_stat.st_dev), "inode": str(directory_stat.st_ino),
                "markerDevice": str(marker_stat.st_dev), "markerInode": str(marker_stat.st_ino),
                "markerSha256": file_pin(marker_path)["sha256"]},
            "python": {"executable": str(Path(sys.executable).resolve()), "version": list(sys.version_info[:3])},
            "source": files}
    return {**core, "sourceRoot": str(SDK),
            "sha256": hashlib.sha256((encoded(core) + "\n").encode("utf-8")).hexdigest()}
