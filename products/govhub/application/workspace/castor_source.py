#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Complete native Castor source capture and independent private receiving.

Native task execution remains owned by castor_adapter and the original Session.
This module retains selected native source, deployment images and backup outputs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import zipfile

SCHEMA = "govhub-castor-source/v1"
CHUNK = 1024 * 1024


def _now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def _digest(value):
    return hashlib.sha256(value).hexdigest()


def _atomic(path, value):
    path = Path(path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError("A native source journal cannot be a link.")
    fd, name = tempfile.mkstemp(prefix=path.name + ".part-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(_bytes(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def _file(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("The original ordinary source file is unavailable: " + str(path))
    a = path.stat()
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for data in iter(lambda: stream.read(CHUNK), b""):
            digest.update(data)
            size += len(data)
    b = path.stat()
    if (a.st_dev, a.st_ino, a.st_size, a.st_mtime_ns) != (
            b.st_dev, b.st_ino, b.st_size, b.st_mtime_ns) or size != a.st_size:
        raise ValueError("A native source file changed while it was being retained.")
    return {"bytes": size, "sha256": digest.hexdigest()}


def _relative(value):
    if (not isinstance(value, str) or not value or "\\" in value or "\0" in value
            or value.startswith("/") or any(x in ("", ".", "..") for x in value.split("/"))):
        raise ValueError("Use an ordinary package-relative native path.")
    value.encode("utf-8", errors="strict")
    return value


def _selector(value, name):
    if (not isinstance(value, str) or not value or "\0" in value or "\n" in value
            or value.startswith("-")):
        raise ValueError("Select the actual native " + name + ".")
    return value


def _executable(value):
    value = _selector(value, "executable")
    selected = shutil.which(value)
    if not selected or not os.access(selected, os.X_OK):
        raise ValueError("The selected original native executable is unavailable: " + value)
    return str(Path(selected).resolve())


def _load(path):
    return json.loads(Path(path).read_bytes().decode("utf-8"))


def _stable_file(path, content):
    path = Path(path)
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError("The retained original source input differs: " + str(path))
    else:
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with path.open("xb") as stream:
            os.chmod(path, 0o600)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())


def _tar_files(path, base, names):
    """Capture exact selected worktree nodes; links remain links, never followed."""
    path, base = Path(path), Path(base)
    staging = path.with_suffix(path.suffix + ".partial")
    if staging.exists():
        staging.unlink()
    entries = []
    with tarfile.open(staging, "w", format=tarfile.PAX_FORMAT, dereference=False) as archive:
        for name in sorted(set(names)):
            _relative(name)
            node = base / name
            if not node.exists() and not node.is_symlink():
                entries.append({"path": name, "kind": "deleted"})
                continue
            info = archive.gettarinfo(str(node), arcname=name)
            if not (info.isfile() or info.isdir() or info.issym()):
                raise ValueError("A selected source node needs explicit native handling: " + name)
            row = {"path": name, "mode": info.mode, "kind": "symlink" if info.issym()
                   else "directory" if info.isdir() else "file"}
            if info.issym():
                row["link_target"] = info.linkname
                archive.addfile(info)
            elif info.isfile():
                before = _file(node)
                if info.size != before["bytes"]:
                    raise ValueError("A native file changed before its archive read: " + name)
                with node.open("rb") as stream:
                    archive.addfile(info, stream)
                if _file(node) != before:
                    raise ValueError("The native source changed during its capture: " + name)
                row.update(before)
            else:
                archive.addfile(info)
            entries.append(row)
    os.chmod(staging, 0o600)
    os.replace(staging, path)
    return entries


def _tree_names(root):
    names = []
    for parent, directories, files in os.walk(root, followlinks=False):
        for name in list(directories):
            path = Path(parent) / name
            names.append(path.relative_to(root).as_posix())
            if path.is_symlink():
                directories.remove(name)
        names.extend((Path(parent) / name).relative_to(root).as_posix() for name in files)
    return names



def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _array(profile, key):
    value = profile.get(key, "[]")
    value = json.loads(value) if isinstance(value, str) else value
    if not isinstance(value, list) or len(value) > 10000:
        raise ValueError(key + " must be the complete bounded native selection array.")
    return value


def _under(root, relative, required=True):
    relative = _relative(relative)
    current = Path(root)
    for component in relative.split("/"):
        current = current / component
        if current.is_symlink():
            raise ValueError("Explicit selected files cannot traverse a link: " + relative)
    if required and not current.exists():
        raise ValueError("The selected native source is unavailable: " + relative)
    return current


def _rows(raw):
    try:
        value = json.loads(raw or b"[]")
        value = [value] if isinstance(value, dict) else value
    except ValueError:
        value = [json.loads(line) for line in raw.splitlines() if line.strip()]
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise ValueError("The native census is not a complete JSON object array.")
    return value


def _directory_identity(path):
    members = []
    for member in sorted(path.rglob("*")):
        if member.is_symlink():
            raise ValueError("A selected backup/output directory contains a link.")
        if member.is_file():
            members.append({"path": member.relative_to(path).as_posix(), **_file(member)})
        elif not member.is_dir():
            raise ValueError("A selected backup/output contains a special filesystem node.")
    return {"members": members, "sha256": _digest(_canonical(members).encode("utf-8"))}


def _selected_identity(root, row, allow_missing=False):
    path = _under(root, row["path"], required=not allow_missing)
    if not path.exists():
        return {**row, "present": False}
    if row["kind"] == "file":
        if not path.is_file():
            raise ValueError("The selected original file is no longer a file.")
        identity = _file(path)
    elif row["kind"] == "directory":
        if not path.is_dir():
            raise ValueError("The selected original directory is no longer a directory.")
        identity = _directory_identity(path)
    else:
        raise ValueError("Declare each actual selected file/directory kind.")
    if row.get("sha256") and row["sha256"] != identity["sha256"]:
        raise ValueError("The selected original recovery input differs from its reviewed hash.")
    return {**row, **identity, "present": True}


def _current_tree(root, git, run, label, depth=0):
    """Match the provider's actual complete index/worktree fingerprint."""
    if depth > 30:
        raise ValueError("Native submodule nesting exceeds the source intake limit.")
    prefix = [git, "-C", str(root)]
    tracked = run(label + "-index", prefix + ["ls-files", "--stage", "-z"])
    other = run(label + "-untracked", prefix + ["ls-files", "--others", "--exclude-standard", "-z"])
    entries = {}
    for row in tracked.split(b"\0"):
        if not row:
            continue
        metadata, raw_path = row.split(b"\t", 1)
        mode, blob, stage = metadata.decode("ascii").split()
        relative = _relative(raw_path.decode("utf-8", "strict"))
        if stage != "0":
            raise ValueError("Resolve original native Git index conflicts before source capture.")
        entries[relative] = {"path": relative, "git_mode": mode, "git_blob": blob}
    for raw_path in other.split(b"\0"):
        if raw_path:
            relative = _relative(raw_path.decode("utf-8", "strict"))
            entries[relative] = {"path": relative, "git_mode": None, "git_blob": None}
    result = []
    for relative, entry in sorted(entries.items()):
        path = root / relative
        if path.is_symlink():
            entry.update(kind="symlink", target=os.readlink(path))
        elif not path.exists():
            entry["kind"] = "absent"
        elif entry["git_mode"] == "160000":
            if not path.is_dir():
                raise ValueError("The selected original submodule is unavailable.")
            tag = label + "-sub-" + _digest(relative.encode())[:20]
            nested = _current_tree(path, git, run, tag, depth + 1)
            head = run(tag + "-head", [git, "-C", str(path), "rev-parse", "HEAD"]).decode().strip()
            entry.update(kind="submodule", head_commit=head, source=nested)
        elif path.is_file():
            entry.update(kind="file", mode=path.stat().st_mode & 0o777, **_file(path))
        else:
            raise ValueError("An original Git-selected member is not an ordinary file.")
        result.append(entry)
    return {"members": result, "sha256": _digest(_canonical(result).encode("utf-8"))}


def _copy_original(source, destination, expected=None):
    source, destination = Path(source), Path(destination)
    identity = _file(source)
    if expected is not None and identity != expected:
        raise ValueError("The actual selected source changed before copying.")
    if destination.exists():
        if _file(destination) != identity:
            raise ValueError("The retained original copied source differs.")
        return identity
    temporary = destination.with_name(destination.name + ".partial")
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with source.open("rb") as incoming, temporary.open("wb") as output:
        os.chmod(temporary, 0o600)
        shutil.copyfileobj(incoming, output, CHUNK)
        output.flush()
        os.fsync(output.fileno())
    if _file(source) != identity or _file(temporary) != identity:
        raise ValueError("Native source changed or was truncated while copied.")
    os.replace(temporary, destination)
    return identity



def _native_command(s, label, argv, mutating=False):
    """Keep helper commands on the original Session's receipt-recovery path."""
    from native_adapter import NativeWaiting
    path = s.out / (label + ".command.json")
    previous = s.read_private_json(path) if path.exists() else None
    if previous and previous.get("phase") == "complete":
        # The phase selection/destination is already bound by the helper journal.
        # A moved runtime reopens the exact completed original command.
        argv = previous["argv"]
    try:
        result = s.command(label, argv, mutating=mutating)
    except NativeWaiting:
        if path.exists():
            record = s.read_private_json(path)
            if record.get("phase") not in {"complete", "not_started"}:
                s.state.update(phase="native_interrupted", pending_command=label,
                               command_record=str(path))
                s.save_state()
        raise
    if s.state.get("pending_command") == label:
        s.state["pending_command"] = None
        s.save_state()
    return result


def capture_source(session, provider_inventory, selection):
    """Retain one complete source phase without dispatching any native task."""
    s, p = session, selection
    root = Path(s.private_path(p["site_root"])).resolve(strict=True)
    revision = p.get("source_revision", "")
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
        raise ValueError("Select the actual complete original Git revision.")
    phase = p.get("capture_phase", "capture")
    if phase not in {"capture", "before", "after"}:
        raise ValueError("Select the original capture, before or after phase.")
    allow_missing = p.get("allow_missing_task_outputs", False)
    if type(allow_missing) is not bool or (allow_missing and phase != "before"):
        raise ValueError("Only a before-task capture may retain not-yet-created outputs.")
    compose_files = [_relative(value) for value in _array(p, "compose_files_json")]
    release_files = [_relative(value) for value in _array(p, "release_files_json")]
    if not compose_files or len(set(compose_files)) != len(compose_files) or len(set(release_files)) != len(release_files):
        raise ValueError("Retain the original unique ordered Compose/release selection.")
    outputs = _array(p, "task_outputs_json")
    inputs = [{**row, "kind": row.get("kind", "file")} for row in _array(p, "backup_inputs_json")]
    for rows in (outputs, inputs):
        if len({row["path"] for row in rows}) != len(rows):
            raise ValueError("Select each original task input/output once.")
        for row in rows:
            _relative(row["path"])
            _selector(row["role"], "file role")
            if row["kind"] not in {"file", "directory"}:
                raise ValueError("Declare each selected native file or directory.")
    image_selection = _array(p, "source_images_json")
    for selected in image_selection:
        if not isinstance(selected, str) or not re.fullmatch(
                r"(?:sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})", selected):
            raise ValueError("Explicit image selection requires an immutable full ID or repository digest.")
    requested = {"environment_id": _selector(p["environment_id"], "deployment identity"),
        "source_revision": revision, "capture_phase": phase,
        "castor_file": p.get("castor_file") or "", "castor_context": p.get("castor_context") or "",
        "docker_context": _selector(p["docker_context"], "Docker context"),
        "compose_project": _selector(p["compose_project"], "Compose project"),
        "compose_files": compose_files, "release_files": release_files,
        "task_outputs": outputs, "backup_inputs": inputs, "image_selection": image_selection}
    if requested["castor_file"]:
        _relative(requested["castor_file"])
    key = _digest(_bytes(requested))[:24]
    directory = s.out / ("castor-source-" + key)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root == directory or root in directory.parents:
        raise ValueError("Keep the original capture outside the native Git/source tree.")
    state_path = directory / "capture.json"
    if state_path.exists():
        state = s.read_private_json(state_path)
        if state.get("selection") != requested:
            raise ValueError("Continue the exact original source phase and target selection.")
    else:
        state = {"schema": SCHEMA, "selection": requested, "state": "RUNNING",
                 "started_at": _now(), "commands": {}, "parts": {}, "attempt": 0}
        _atomic(state_path, state)

    def save():
        state["updated_at"] = _now()
        _atomic(state_path, state)
        s.state.setdefault("castor_source", {})[key] = {
            "state": state["state"], "directory": str(directory), "selection": requested}
        s.save_state()

    def publish(result):
        s.add(directory / "castor-source.zip", "castor_complete_source",
              source_revision=revision, capture_phase=phase)
        s.add(directory / "MANIFEST.json", "castor_source_manifest",
              source_revision=revision, capture_phase=phase)
        # Complete command stdout/stderr/receipts are also members of the ZIP.
        # Explicit artifact admission keeps them visible in the native handover.
        for path in sorted((directory / "commands").glob("*")):
            if path.is_file():
                s.add(path, "castor_source_command", capture_phase=phase)
        return {**result, "archive": str(directory / "castor-source.zip"),
                "manifest": str(directory / "MANIFEST.json")}

    if state["state"] == "COMPLETE":
        for name, identity in state["published"].items():
            if _file(directory / name) != identity:
                raise ValueError("A complete original Castor source artifact changed.")
        return publish(state["result"])

    state["attempt"] += 1
    attempt = state["attempt"]
    save()
    inventory_path = directory / "provider-inventory.json"
    if not inventory_path.exists():
        _atomic(inventory_path, provider_inventory)
    inventory = _load(inventory_path)
    if inventory.get("head_commit") != revision:
        raise ValueError("The source selection differs from the retained native inventory head.")
    expected_project = {key: requested[key] for key in (
        "environment_id", "castor_file", "castor_context", "docker_context", "compose_project")}
    if any(inventory.get("project", {}).get(k) != v for k, v in expected_project.items()):
        raise ValueError("The native inventory describes a different selected Castor project.")
    tools = {name: _executable(p.get(name + "_path") or name) for name in ("git", "docker")}

    def run(name, argv):
        record = _native_command(s, "castor-source-" + key + "-" + name, argv)
        stored = directory / "commands"
        stored.mkdir(mode=0o700, exist_ok=True)
        paths = {}
        for field in ("stdout", "stderr"):
            original = Path(s.private_path(record[field]["path"]))
            destination = stored / (name + "." + field)
            _copy_original(original, destination)
            paths[field] = destination.relative_to(directory).as_posix()
        command_path = stored / (name + ".json")
        if command_path.exists():
            if s.resolve_private(_load(command_path)) != record:
                raise ValueError("The original native command outcome changed after relocation.")
        else:
            _stable_file(command_path, _bytes(record))
        state["commands"][name] = {"argv": argv, "record": command_path.relative_to(directory).as_posix(), **paths}
        save()
        return (directory / paths["stdout"]).read_bytes()

    def git(name, where, args):
        return run(name, [tools["git"], "-C", str(where), *args])

    def docker(name, args):
        return run(name, [tools["docker"], "--context", requested["docker_context"], *args])

    def fresh(name, argv):
        return run("observe-" + str(attempt) + "-" + name, argv)

    compose = [tools["docker"], "--context", requested["docker_context"], "compose",
               "--project-directory", str(root), "--project-name", requested["compose_project"]]
    for name in compose_files:
        compose += ["--file", str(_under(root, name))]

    def observe_images(label):
        rows = _rows(fresh(label, compose + ["images", "--format", "json"]))
        return rows

    def inspect_image(label, selected):
        raw = docker(label, ["image", "inspect", selected])
        rows = _rows(raw)
        if len(rows) != 1 or not re.fullmatch(r"sha256:[a-f0-9]{64}", str(rows[0].get("Id", ""))):
            raise ValueError("Native image inspection did not resolve one complete immutable image ID.")
        image = rows[0]
        if "@sha256:" in selected and selected not in (image.get("RepoDigests") or []):
            raise ValueError("Native image inspection did not preserve the selected repository digest.")
        if selected.startswith("sha256:") and len(selected) == 71 and selected != image["Id"]:
            raise ValueError("Native image inspection changed the selected full image ID.")
        return image

    try:
        observed_tree = _current_tree(root, tools["git"], fresh, "worktree-before")
        if observed_tree != inventory.get("working_tree"):
            raise ValueError("The native Git/index/worktree differs from the reviewed complete inventory.")
        current_head = fresh("head-before", [tools["git"], "-C", str(root), "rev-parse", "HEAD"]).decode().strip()
        if current_head != revision:
            raise ValueError("The selected native Git HEAD changed before capture.")
        engine = json.loads(fresh("engine-before", [tools["docker"], "--context", requested["docker_context"],
            "info", "--format", "{{json .}}"]))
        if engine.get("ID") != inventory.get("docker_engine", {}).get("ID"):
            raise ValueError("The original selected Docker engine changed.")
        observed_images = observe_images("compose-images-before")
        if sorted(map(_canonical, observed_images)) != sorted(map(_canonical, inventory.get("images", []))):
            raise ValueError("The native Compose image cohort changed since the original inventory.")
        compose_config = json.loads(fresh("compose-config-before", compose + ["config", "--format", "json"]))
        if compose_config != inventory.get("compose_config"):
            raise ValueError("The selected Compose configuration differs from the original inventory.")
        image_rows = []
        candidates = [(value, None) for value in image_selection]
        if not candidates:
            for row in inventory.get("images", []):
                value = row.get("ID") or row.get("Id") or row.get("id")
                if not isinstance(value, str) or not re.fullmatch(r"(?:sha256:)?[a-f0-9]{12,64}", value):
                    raise ValueError("Native Compose must supply an actual image ID for exact resolution.")
                candidates.append((value, row))
        for index, (selected, original_row) in enumerate(candidates):
            image = inspect_image("image-" + str(index) + "-inspect", selected)
            image_rows.append({"selected": selected, "original_compose_row": original_row,
                "image_id": image["Id"], "repo_digests": image.get("RepoDigests") or [],
                "repo_tags": image.get("RepoTags") or [], "inspection": image})
        image_ids = sorted({row["image_id"] for row in image_rows})
        target = {**requested, "image_ids": image_ids}
        if state.get("target") is not None and state["target"] != target:
            raise ValueError("The retained original image/source target changed.")
        state["target"] = target
        state["parts"]["images"] = {"selection": image_selection, "original_compose_rows": inventory.get("images", []),
            "resolved": image_rows, "image_ids": image_ids, "docker_engine_id": engine["ID"]}
        save()
        repos = state.get("repositories")
        if repos is None:
            repos = [{"path": "", "parent": None, "gitlink": None}]
            state["repositories"] = repos
            save()
        index = 0
        while index < len(repos):
            s.check()
            repository = repos[index]
            where = root / repository["path"]
            tag = "git-" + str(index)
            repo_dir = directory / "repositories" / str(index)
            repo_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            actual_root = git(tag + "-root", where, ["rev-parse", "--show-toplevel"]).decode().strip()
            if Path(actual_root).resolve() != where.resolve():
                raise ValueError("A native submodule is uninitialized or the selected Git root differs.")
            head = git(tag + "-head", where, ["rev-parse", "--verify", "HEAD"]).decode().strip()
            if index == 0 and head != revision:
                raise ValueError("Local Git HEAD differs from the reviewed Castor revision.")
            # Preserve actual submodule HEAD independently from the parent index gitlink.
            repository["head"] = head
            listing = git(tag + "-index", where, ["ls-files", "--stage", "-z"])
            selected_files, gitlinks = [], []
            for row in listing.split(b"\0"):
                if not row:
                    continue
                metadata, raw_name = row.split(b"\t", 1)
                mode, object_id, stage = metadata.decode("ascii").split()
                name = _relative(os.fsdecode(raw_name))
                if stage != "0":
                    raise ValueError("Resolve native Git index conflicts before source capture.")
                if mode == "160000":
                    gitlinks.append((name, object_id))
                else:
                    selected_files.append(name)
            # Include HEAD files removed from the current index, so staged
            # deletions also remove their original working copy on reopening.
            head_tree = git(tag + "-head-tree", where, ["ls-tree", "-r", "-z", "--full-tree", head])
            for row in head_tree.split(b"\0"):
                if not row:
                    continue
                metadata, raw_name = row.split(b"\t", 1)
                mode, object_type, object_id = metadata.decode("ascii").split()
                if object_type == "blob":
                    selected_files.append(_relative(os.fsdecode(raw_name)))
            untracked = git(tag + "-untracked", where, ["ls-files", "--others", "--exclude-standard", "-z"])
            selected_files += [os.fsdecode(x) for x in untracked.split(b"\0") if x]
            git(tag + "-ignored", where, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])
            staged = git(tag + "-staged", where, ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff"])
            unstaged = git(tag + "-unstaged", where, ["diff", "--binary", "--full-index", "--no-ext-diff"])
            git(tag + "-status", where, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
            for filename, content in (("staged.patch", staged), ("unstaged.patch", unstaged)):
                _stable_file(repo_dir / filename, content)
            bundle = repo_dir / "repository.bundle"
            git(tag + "-bundle", where, ["bundle", "create", str(bundle), "--all", "HEAD"])
            git(tag + "-verify", where, ["bundle", "verify", str(bundle)])
            git(tag + "-archive", where, ["archive", "--format=tar", "--output", str(repo_dir / "tracked.tar"), head])
            git(tag + "-refs", where, ["show-ref", "--head"])
            entries_path = repo_dir / "worktree.json"
            if entries_path.exists():
                entries = _load(entries_path)
            else:
                entries = _tar_files(repo_dir / "worktree.tar", where, selected_files)
                _atomic(entries_path, entries)
            # Compare native working patches again after the complete byte capture.
            if git(tag + "-staged-after", where, ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff"]) != staged:
                raise ValueError("Native staged changes changed during source capture.")
            if git(tag + "-unstaged-after", where, ["diff", "--binary", "--full-index", "--no-ext-diff"]) != unstaged:
                raise ValueError("Native worktree changed during source capture.")
            if git(tag + "-head-after", where, ["rev-parse", "--verify", "HEAD"]).decode().strip() != head:
                raise ValueError("Native Git HEAD changed during its complete source capture.")
            if git(tag + "-index-after", where, ["ls-files", "--stage", "-z"]) != listing:
                raise ValueError("Native Git index changed during its complete source capture.")
            repository["directory"] = repo_dir.relative_to(directory).as_posix()
            repository["worktree_entries"] = len(entries)
            for name, oid in gitlinks:
                relative = (PurePosixPath(repository["path"]) / name).as_posix()
                if not any(row["path"] == relative for row in repos):
                    repos.append({"path": relative, "parent": index, "gitlink": oid})
            save()
            index += 1


        # Explicit selections retain ignored release/backup bytes as well as the
        # Git-selected tree. No host credentials/cache are copied implicitly.
        selected_rows = [{"path": value, "role": "compose", "kind": "file"} for value in compose_files]
        selected_rows += [{"path": value, "role": "release", "kind": "file"} for value in release_files]
        if requested["castor_file"]:
            selected_rows.append({"path": requested["castor_file"], "role": "castor_entrypoint", "kind": "file"})
        selected_rows += [{**row, "selection": "task_output"} for row in outputs]
        selected_rows += [{**row, "selection": "backup_input"} for row in inputs]
        original_rows, selected_names = [], []
        for row in selected_rows:
            observed = _selected_identity(root, row,
                allow_missing=allow_missing and row.get("selection") == "task_output")
            expected = inventory.get("selected_files", {}).get(row["path"])
            if expected and observed.get("present") and {k: observed[k] for k in ("bytes", "sha256")} != expected:
                raise ValueError("The selected native release/configuration source changed.")
            original_rows.append(observed)
            if observed["present"]:
                selected_names.append(row["path"])
                if row["kind"] == "directory":
                    selected_names += [(PurePosixPath(row["path"]) / name).as_posix()
                                       for name in _tree_names(root / row["path"])]
        _stable_file(directory / "selected-selection.json", _bytes(original_rows))
        selected_archive = directory / "selected-files.tar"
        selected_manifest = directory / "selected-files.json"
        if selected_manifest.exists():
            selected_entries = _load(selected_manifest)
        else:
            selected_entries = _tar_files(selected_archive, root, selected_names)
            _atomic(selected_manifest, selected_entries)
        for row in original_rows:
            current = _selected_identity(root, row,
                allow_missing=allow_missing and row.get("selection") == "task_output")
            if current != row:
                raise ValueError("An original selected native output/input changed across its capture.")
        for entry in selected_entries:
            path = root / entry["path"]
            if entry["kind"] == "file" and _file(path) != {k: entry[k] for k in ("bytes", "sha256")}:
                raise ValueError("The retained selected source archive differs from current original bytes.")
            if entry["kind"] == "directory" and not path.is_dir():
                raise ValueError("The retained selected source directory changed.")
        state["parts"]["selected_files"] = {"archive": selected_archive.name,
            "entries": selected_manifest.name, "selection": original_rows, **_file(selected_archive)}

        executable = Path(p["castor_path"]).resolve(strict=True)
        executable_identity = _file(executable)
        if executable_identity != inventory.get("native_executables", {}).get("castor_path"):
            raise ValueError("The selected original Castor/PHAR executable changed.")
        executable_copy = directory / "executables" / executable.name
        _copy_original(executable, executable_copy, executable_identity)
        state["parts"]["castor_executable"] = {"original_path": str(executable),
            "path": executable_copy.relative_to(directory).as_posix(), "mode": executable.stat().st_mode & 0o777,
            **executable_identity}
        image_archive = directory / "docker-images.tar"
        if image_ids:
            docker("image-save", ["image", "save", "--output", str(image_archive), *image_ids])
            if not image_archive.is_file() or not image_archive.stat().st_size:
                raise ValueError("Native Docker did not retain the complete selected image archive.")
            state["parts"]["images"].update(archive=image_archive.name, **_file(image_archive))
            # A complete native tar stream is parsed without extracting or loading it.
            with tarfile.open(image_archive, "r:") as native_archive:
                if not native_archive.getmembers():
                    raise ValueError("Native Docker returned an empty image archive.")
        else:
            state["parts"]["images"]["archive"] = None
        for index, row in enumerate(image_rows):
            after = inspect_image("image-" + str(index) + "-after", row["image_id"])
            if after["Id"] != row["image_id"]:
                raise ValueError("The retained native image identity changed during save.")
        if sorted(map(_canonical, observe_images("compose-images-after"))) != sorted(map(_canonical, observed_images)):
            raise ValueError("The selected native Compose image cohort changed during capture.")
        engine_after = json.loads(fresh("engine-after", [tools["docker"], "--context", requested["docker_context"],
            "info", "--format", "{{json .}}"]))
        if engine_after.get("ID") != engine["ID"]:
            raise ValueError("The selected native Docker engine changed during capture.")
        final_tree = _current_tree(root, tools["git"], fresh, "worktree-after")
        if final_tree != observed_tree:
            raise ValueError("The actual Git/index/untracked bytes changed during full source capture.")
        if fresh("head-after", [tools["git"], "-C", str(root), "rev-parse", "HEAD"]).decode().strip() != revision:
            raise ValueError("The selected original Git head changed during capture.")
        # Recheck every ordinary archived file against its retained bytes, including
        # untracked files whose content is not represented in a native Git diff.
        for repository in repos:
            where = root / repository["path"]
            repo_data = directory / repository["directory"]
            for entry in _load(repo_data / "worktree.json"):
                path = where / entry["path"]
                if entry["kind"] == "file" and _file(path) != {k: entry[k] for k in ("bytes", "sha256")}:
                    raise ValueError("A retained original worktree file changed.")
                if entry["kind"] == "symlink" and (not path.is_symlink() or os.readlink(path) != entry["link_target"]):
                    raise ValueError("A retained original worktree link changed.")
                if entry["kind"] == "deleted" and (path.exists() or path.is_symlink()):
                    raise ValueError("A retained source deletion changed.")
        state["state"] = "PACKAGING"
        save()
        members = []
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(directory).as_posix()
            if relative in {"capture.json", "MANIFEST.json", "castor-source.zip"} or relative.endswith(".partial"):
                continue
            members.append({"path": relative, "mode": path.stat().st_mode & 0o777, **_file(path)})
        total = sum(row["bytes"] for row in members)
        if total > p["max_artifact_bytes"]:
            raise ValueError("Complete native source exceeds the original configured archive intake limit.")
        manifest = {"schema": SCHEMA, "target": target, "source_revision": revision,
            "started_at": state["started_at"], "completed_at": _now(),
            "capture_consistency": "selected_native_files_and_image_save; application_consistency_depends_on_original_task_verification",
            "repositories": repos, "parts": state["parts"], "commands": state["commands"],
            "working_tree": observed_tree, "native_inventory": "provider-inventory.json",
            "ignored_source_policy": "Ignored files are listed; only explicit selected release, backup and task-output paths are copied.",
            "members": members, "member_bytes": total}
        _atomic(directory / "MANIFEST.json", manifest)
        archive_path = directory / "castor-source.zip"
        temporary = directory / "castor-source.zip.partial"
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            archive.write(directory / "MANIFEST.json", "MANIFEST.json")
            for member in members:
                archive.write(directory / member["path"], member["path"])
        verify_source(temporary, p["max_artifact_bytes"])
        if temporary.stat().st_size > p["max_artifact_bytes"]:
            raise ValueError("The complete archive including manifest/ZIP headers exceeds its selected bound.")
        os.chmod(temporary, 0o600)
        os.replace(temporary, archive_path)
        result = {"schema": SCHEMA, "state": "COMPLETE", "source_revision": revision,
            "target": target, "capture_consistency": manifest["capture_consistency"],
            "repositories": repos, "parts": state["parts"], "files": members,
            "archive": str(archive_path), "manifest": str(directory / "MANIFEST.json"),
            "archive_identity": _file(archive_path)}
        state["result"] = result
        state["published"] = {name: _file(directory / name) for name in ("castor-source.zip", "MANIFEST.json")}
        state["state"] = "COMPLETE"
        save()
        return publish(result)
    except BaseException as error:
        state["state"] = "ATTENTION"
        state["error"] = {"type": type(error).__name__, "message": str(error), "at": _now()}
        save()
        raise


def verify_source(archive_path, max_bytes=8 * 1024**3):
    """Verify every complete package member without extracting any filesystem node."""
    if _file(archive_path)["bytes"] > max_bytes:
        raise ValueError("The complete original source archive exceeds the receiving bound.")
    with zipfile.ZipFile(archive_path) as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        if len(names) != len(set(names)) or "MANIFEST.json" not in names:
            raise ValueError("The complete original source archive has duplicate or missing members.")
        if sum(info.file_size for info in infos) > max_bytes + 16 * CHUNK:
            raise ValueError("The complete native package exceeds the selected receiving limit.")
        manifest_info = archive.getinfo("MANIFEST.json")
        if manifest_info.file_size > 16 * CHUNK:
            raise ValueError("The original native source manifest exceeds its receiving limit.")
        manifest = json.loads(archive.read("MANIFEST.json").decode("utf-8"))
        if manifest.get("schema") != SCHEMA or not isinstance(manifest.get("members"), list):
            raise ValueError("Use the original complete Castor source package.")
        expected = {}
        for member in manifest["members"]:
            name = _relative(member["path"])
            if name in expected or name == "MANIFEST.json":
                raise ValueError("The original manifest repeats a source member.")
            expected[name] = member
        if set(names) != set(expected) | {"MANIFEST.json"}:
            raise ValueError("The archive differs from its complete original source manifest.")
        for info in infos:
            _relative(info.filename)
            if info.is_dir() or stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1:
                raise ValueError("The outer source package requires ordinary unencrypted files.")
            if info.filename == "MANIFEST.json":
                continue
            digest = hashlib.sha256()
            size = 0
            with archive.open(info) as stream:
                for data in iter(lambda: stream.read(CHUNK), b""):
                    digest.update(data)
                    size += len(data)
            if {"bytes": size, "sha256": digest.hexdigest()} != {
                    key: expected[info.filename][key] for key in ("bytes", "sha256")}:
                raise ValueError("A complete original source member differs: " + info.filename)
        return manifest


def receive_source(archive_path, destination, max_bytes=8 * 1024**3):
    """Resume private exact-byte receipt; never overwrite another receiving identity."""
    archive_path = Path(archive_path).resolve(strict=True)
    destination = Path(destination).absolute()
    identity = _file(archive_path)
    manifest = verify_source(archive_path, max_bytes)
    if destination.is_symlink() or any(parent.is_symlink() for parent in destination.parents):
        raise ValueError("Use an ordinary original private receiving directory.")
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    state_path = destination / "RECEIVING.json"
    if state_path.exists():
        state = _load(state_path)
        if state.get("archive") != identity:
            raise ValueError("Continue the same original complete source package.")
    else:
        if any(destination.iterdir()):
            raise ValueError("Start source receipt in an empty original private directory.")
        state = {"schema": "govhub.castor.source-receiving.v1", "archive": identity,
                 "state": "RECEIVING", "started_at": _now()}
        _atomic(state_path, state)
    with zipfile.ZipFile(archive_path) as archive:
        for name in archive.namelist():
            path = destination / _relative(name)
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if any(parent.is_symlink() for parent in path.parents) or path.is_symlink():
                raise ValueError("The native receiving path contains a link.")
            member = next((x for x in manifest["members"] if x["path"] == name), None)
            expected = ({"bytes": len(archive.read(name)), "sha256": _digest(archive.read(name))}
                        if name == "MANIFEST.json" else {k: member[k] for k in ("bytes", "sha256")})
            if path.exists():
                if _file(path) != expected:
                    raise ValueError("A received original source member changed: " + name)
                continue
            temporary = path.with_name(path.name + ".receiving-partial")
            with archive.open(name) as source, temporary.open("wb") as output:
                os.chmod(temporary, 0o600)
                shutil.copyfileobj(source, output, CHUNK)
                output.flush()
                os.fsync(output.fileno())
            if _file(temporary) != expected:
                raise ValueError("Incomplete native receiving member.")
            os.replace(temporary, path)
    state.update(state="COMPLETE", completed_at=_now(), source_revision=manifest["source_revision"],
                 target=manifest["target"], destination=str(destination))
    _atomic(state_path, state)
    return state



def _restore_worktree(archive_path, destination, entries):
    """Restore only reviewed native members, preserving literal symlink targets."""
    destination = Path(destination)
    expected = {entry["path"]: entry for entry in entries}
    with tarfile.open(archive_path, "r:") as archive:
        names = archive.getnames()
        retained = {name for name, item in expected.items() if item["kind"] != "deleted"}
        if len(names) != len(set(names)) or set(names) != retained:
            raise ValueError("The original worktree archive differs from its node manifest.")
        # No member may traverse a retained symlink, regardless of archive order.
        links = {name for name, item in expected.items() if item["kind"] == "symlink"}
        for name in expected:
            _relative(name)
            if any(parent.as_posix() in links for parent in PurePosixPath(name).parents):
                raise ValueError("A native archive writes through a link; retain it for explicit review.")
        for name, entry in expected.items():
            target = destination / name
            for parent in target.parents:
                if parent == destination:
                    break
                if parent.is_symlink():
                    raise ValueError("The receiving tree has an unexpected linked parent.")
            if entry["kind"] == "deleted":
                if target.is_symlink() or target.is_file():
                    target.unlink()
                elif target.exists():
                    raise ValueError("A deleted native file was replaced by a local directory.")
                continue
            info = archive.getmember(name)
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            if entry["kind"] == "directory":
                if not info.isdir() or target.is_symlink():
                    raise ValueError("Native directory type differs.")
                target.mkdir(mode=0o700, exist_ok=True)
                continue
            if entry["kind"] == "symlink":
                if not info.issym() or info.linkname != entry["link_target"]:
                    raise ValueError("Native link identity differs.")
                if target.is_symlink():
                    if os.readlink(target) == info.linkname:
                        continue
                    target.unlink()
                elif target.is_file():
                    target.unlink()
                elif target.exists():
                    raise ValueError("The native link destination contains a directory.")
                target.symlink_to(info.linkname)
                continue
            if not info.isfile() or info.size != entry["bytes"]:
                raise ValueError("Native file type or length differs.")
            if target.is_symlink():
                target.unlink()
            if target.exists() and not target.is_file():
                raise ValueError("The native file destination is not an ordinary file.")
            fd, temporary = tempfile.mkstemp(prefix=target.name + ".source-", dir=target.parent)
            try:
                with os.fdopen(fd, "wb") as output, archive.extractfile(info) as source:
                    os.fchmod(output.fileno(), 0o600)
                    shutil.copyfileobj(source, output, CHUNK)
                    output.flush()
                    os.fsync(output.fileno())
                if _file(temporary) != {key: entry[key] for key in ("bytes", "sha256")}:
                    raise ValueError("The original worktree bytes differ.")
                os.chmod(temporary, entry["mode"] & 0o777)
                os.replace(temporary, target)
                os.utime(target, (info.mtime, info.mtime))
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        for name, entry in sorted(expected.items(), key=lambda row: row[0].count("/"), reverse=True):
            if entry["kind"] == "directory":
                os.chmod(destination / name, entry["mode"] & 0o777)



def receive_command_receipt(session, receipt_path):
    """Adopt a real completed command from this original private Git reopen.

    This only reconciles the existing command; it never launches another process.
    The enclosing source receiver retains its original operation lock.
    """
    s = session
    from native_adapter import _file as artifact
    incoming_path = Path(receipt_path)
    if not incoming_path.is_absolute() or incoming_path.is_symlink() or not incoming_path.is_file():
        raise ValueError("Select the actual complete original native Git command receipt.")
    raw = incoming_path.read_bytes()
    receipt_sha256 = _digest(raw)
    accepted = s.state.setdefault("source_received_command_receipts", {})
    previous = next((row for row in accepted.values() if row["sha256"] == receipt_sha256), None)
    if previous is not None:
        return previous
    label = s.state.get("pending_command")
    if not isinstance(label, str) or not re.fullmatch(r"castor-reopen-[A-Za-z0-9_.-]+", label):
        raise ValueError("This private source Session has no original Git command awaiting a receipt.")
    if label in accepted:
        raise ValueError("Preserve the already accepted original Git command receipt.")
    original_path = s.out / (label + ".command.json")
    original_raw = original_path.read_bytes()
    directory = s.out / "received-source-commands"
    directory.mkdir(mode=0o700, exist_ok=True)
    prior_path = directory / (label + ".original.json")
    if prior_path.exists():
        original_raw = prior_path.read_bytes()
    original = json.loads(original_raw)
    retained = directory / (receipt_sha256 + ".json")
    _stable_file(retained, raw)
    completed = json.loads(raw)
    for field in ("argv", "cwd", "started_at", "mutating", "stdin", "pid"):
        if completed.get(field) != original.get(field):
            raise ValueError("The received native completion differs from original " + field + ".")
    if (completed.get("phase") != "complete" or type(completed.get("returncode")) is not int
            or not completed.get("completed_at") or not isinstance(completed.get("pid"), int)):
        raise ValueError("The native receipt must retain the actual observed command exit.")
    outputs = {}
    for role in ("stdout", "stderr"):
        descriptor = completed.get(role)
        if not isinstance(descriptor, dict):
            raise ValueError("The complete native command output descriptor is missing.")
        path = Path(descriptor["path"])
        if not path.is_absolute():
            raise ValueError("The actual original command output path must be absolute.")
        expected = {"bytes": descriptor["size"], "sha256": descriptor["sha256"]}
        destination = directory / (receipt_sha256 + "." + role)
        if destination.exists():
            if _file(destination) != expected:
                raise ValueError("A retained original command output changed.")
        else:
            _copy_original(path, destination, expected)
        outputs[role] = artifact(destination, role)
    _stable_file(directory / (label + ".original.json"), original_raw)
    completed.update(outputs)
    _atomic(original_path, completed)
    outcome = {"label": label, "sha256": receipt_sha256, "retained_path": str(retained),
               "received_at": _now(), "returncode": completed["returncode"],
               "outputs": outputs}
    accepted[label] = outcome
    s.state.setdefault("completed_commands", {})[label] = completed
    s.state.update(phase="native_prepared" if completed["returncode"] == 0 else "native_failed",
                   pending_command=None)
    s.save_state()
    s.add(retained, "castor_source_original_command_receipt")
    for role in ("stdout", "stderr"):
        s.add(outputs[role]["path"], "castor_source_received_" + role)
    return outcome


def reopen_source(session, received_directory, checkout_directory):
    """Reopen original Git/index/local work in an independently received project.

    The caller supplies its existing Session and original operation lock. Local
    Git writes use that same retained native command admission. Missing mutation
    outcomes stay on Session's original uncertain-command recovery path.
    Selected backup/output bytes and saved images remain private original inputs.
    This never loads Docker images, starts containers or executes a native task.
    """
    s = session
    received = Path(s.private_path(str(received_directory))).resolve(strict=True)
    manifest = _load(received / "MANIFEST.json")
    if manifest.get("schema") != SCHEMA:
        raise ValueError("Select the complete original received source.")
    for member in manifest["members"]:
        path = received / _relative(member["path"])
        if _file(path) != {key: member[key] for key in ("bytes", "sha256")}:
            raise ValueError("A retained original source member changed.")
    destination = Path(s.private_path(str(checkout_directory))).absolute()
    if destination.is_symlink() or any(parent.is_symlink() for parent in destination.parents):
        raise ValueError("Select an ordinary new private source checkout.")
    control = s.out / "castor-source-reopen.json"
    binding = {"manifest_sha256": _file(received / "MANIFEST.json")["sha256"],
               "destination": str(destination)}
    if control.exists():
        state = s.read_private_json(control)
        if state.get("binding") != binding:
            raise ValueError("Continue the original source reopening destination.")
    else:
        if destination.exists() and any(destination.iterdir()):
            raise ValueError("Initial source reopening requires an empty private destination.")
        state = {"schema": "govhub.castor.source-reopen.v1", "binding": binding,
                 "state": "RUNNING", "repositories": [], "started_at": _now()}
        _atomic(control, state)
    if state["state"] == "COMPLETE":
        # The receiving engineer's later edits remain theirs. Do not overwrite.
        return {**state, "reused": True}
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    git = _executable(s.p.get("git_path") or "git")
    for index, repository in enumerate(manifest["repositories"]):
        relative = repository["path"]
        if relative:
            _relative(relative)
        where = destination / relative
        where.mkdir(mode=0o700, parents=True, exist_ok=True)
        data = received / _relative(repository["directory"])
        label = "castor-reopen-" + str(index)

        def command(name, args, mutating=False):
            result = _native_command(s, label + "-" + name, [git, "-C", str(where), *args], mutating=mutating)
            return Path(s.private_path(result["stdout"]["path"])).read_bytes()

        command("init", ["init"], True)
        command("bundle-verify", ["bundle", "verify", str(data / "repository.bundle")])
        command("head-fetch", ["fetch", str(data / "repository.bundle"), "HEAD"], True)
        command("checkout", ["checkout", "--detach", "--force", repository["head"]], True)
        # Fetch original heads only after leaving init's current branch.
        command("refs-after-detach", ["fetch", "--force", str(data / "repository.bundle"), "+refs/*:refs/*"], True)
        if (data / "staged.patch").stat().st_size:
            command("index", ["apply", "--cached", "--binary", str(data / "staged.patch")], True)
        entries = _load(data / "worktree.json")
        _restore_worktree(data / "worktree.tar", where, entries)
        row = {"path": relative, "head": repository["head"], "state": "RECONSTRUCTED"}
        if row not in state["repositories"]:
            state["repositories"].append(row)
        _atomic(control, state)
    # Parent diffs include native submodule working status. Reopen every original
    # child before comparing any parent's final index, patches and untracked set.
    for index, repository in enumerate(manifest["repositories"]):
        where = destination / repository["path"]
        data = received / repository["directory"]
        checks = [
            ("index", ["ls-files", "--stage", "-z"], received / manifest["commands"]["git-" + str(index) + "-index"]["stdout"]),
            ("status", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], received / manifest["commands"]["git-" + str(index) + "-status"]["stdout"]),
            ("staged", ["diff", "--cached", "--binary", "--full-index", "--no-ext-diff"], data / "staged.patch"),
            ("unstaged", ["diff", "--binary", "--full-index", "--no-ext-diff"], data / "unstaged.patch"),
        ]
        for name, arguments, original in checks:
            record = _native_command(s, "castor-reopen-final-" + str(index) + "-" + name,
                                     [git, "-C", str(where), *arguments])
            observed = Path(s.private_path(record["stdout"]["path"])).read_bytes()
            if observed != original.read_bytes():
                raise ValueError("Independent native Git " + name + " differs from the original.")
    selected = manifest["parts"]["selected_files"]
    _restore_worktree(received / _relative(selected["archive"]), destination,
                      _load(received / _relative(selected["entries"])))
    restored = []
    for row in selected["selection"]:
        current = _selected_identity(destination, row, allow_missing=not row["present"])
        if current != row:
            raise ValueError("The independently received selected source/output differs.")
        restored.append({**row, "receiving_path": str(destination / row["path"]) if row["present"] else None})
    state.update(state="COMPLETE", completed_at=_now(), source_revision=manifest["source_revision"],
                 original_target=manifest["target"], selected_files=restored,
                 images=manifest["parts"]["images"], image_load_performed=False,
                 native_task_performed=False, received_directory=str(received))
    _atomic(control, state)
    s.add(control, "castor_source_reopen")
    return state


def _main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--archive", required=True)
    verify.add_argument("--max-bytes", type=int, default=8 * 1024**3)
    receive = sub.add_parser("receive")
    receive.add_argument("--archive", required=True)
    receive.add_argument("--destination", required=True)
    receive.add_argument("--max-bytes", type=int, default=8 * 1024**3)
    args = parser.parse_args()
    if args.action == "verify":
        value = verify_source(args.archive, args.max_bytes)
    else:
        value = receive_source(args.archive, args.destination, args.max_bytes)
    print(json.dumps(value, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
