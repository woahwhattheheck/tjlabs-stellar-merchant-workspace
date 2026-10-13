"""Stream a complete native POTS receiving into the existing GovHub workspace."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import stat
import sys

from server import add_paths, open_store
from cli import actor
from .collector import sha_file, strict_json
from .model import file_index

MAX_JSON_BYTES = 32 * 1024**2


def import_directory(workspace, user, project_id, directory, request_key):
    root = Path(directory)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():
        raise ValueError("Choose the original absolute private receiving directory.")
    root = root.resolve(strict=True)
    if (root / "objects").is_symlink() or not (root / "objects").is_dir():
        raise ValueError("Choose the original receiving objects directory.")
    manifest_path = root / "manifest.json"
    if manifest_path.is_symlink() or not manifest_path.is_file() or manifest_path.stat().st_size > MAX_JSON_BYTES:
        raise ValueError("Choose the complete original manifest.json within the 32 MiB parsing limit.")
    original = manifest_path.read_bytes()
    manifest = strict_json(original)
    expected = file_index(manifest)
    with workspace.connect(snapshot=True) as db:
        project = workspace._pots_project(db, project_id)
    if manifest.get("request", {}).get("project_id") != project["circle_project_id"]:
        raise ValueError("Select the original CircleCI project retained by this operating project.")
    all_files = [("manifest.json", manifest_path, {
        "bytes": len(original), "sha256": __import__("hashlib").sha256(original).hexdigest(),
    })]
    for source_path, identity in expected.items():
        path = root / source_path
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
            raise ValueError("Select the completed original regular file " + source_path + ".")
        all_files.append((source_path, path, identity))
    selected, manifest_id = {}, None
    for index, (source_path, path, identity) in enumerate(all_files):
        with workspace.connect(write=True) as db:
            previous = db.execute("SELECT * FROM files WHERE sha256=? AND bytes=? ORDER BY rowid LIMIT 1",
                                  (identity["sha256"], identity["bytes"])).fetchone()
            if previous:
                if sha_file(path) != {"sha256": identity["sha256"], "bytes": identity["bytes"]}:
                    raise ValueError("The original receiving file changed: " + source_path)
                item = dict(previous)
                workspace._verify_file(item)
            else:
                item = workspace._register(db, path, path.name, user, category="Evidence",
                         label="POTS " + project["label"] + " · " + source_path,
                         expected_sha=identity["sha256"])
                if item["bytes"] != identity["bytes"]:
                    raise ValueError("The original receiving byte length changed: " + source_path)
                workspace._changed(db, user, "pots.sources.retain", "file", item["id"],
                                   {"project_id": project_id, "source_path": source_path})
            if source_path == "manifest.json":
                manifest_id = item["id"]
            else:
                selected[source_path] = item["id"]
        print(json.dumps({"retained": index + 1, "files": len(all_files),
                          "path": source_path, "bytes": identity["bytes"]}), file=sys.stderr)
    return workspace.dispatch("pots.receive", {
        "project_id": project_id, "manifest_file_id": manifest_id,
        "files": selected, "request_key": request_key,
    }, user)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_paths(parser)
    parser.add_argument("--username", required=True)
    credentials = parser.add_mutually_exclusive_group()
    credentials.add_argument("--password-env")
    credentials.add_argument("--password-stdin", action="store_true")
    parser.add_argument("--project-id", required=True, help="Saved POTS operating project ID")
    parser.add_argument("--receiving-dir", required=True, type=Path)
    parser.add_argument("--request-key", required=True, help="Keep this key with the original receiving arguments")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        workspace = open_store(args)
        user = actor(workspace, args)
        result = import_directory(workspace, user, args.project_id, args.receiving_dir, args.request_key)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
