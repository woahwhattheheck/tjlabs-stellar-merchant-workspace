#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Complete native Upsun source capture and independent private receiving.

Provider mutations remain owned by upsun_adapter and the original Session.
This module only reads native Git, the selected environment, SQL and mounts.
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

SCHEMA = "govhub.upsun.source.v1"
CLI_VERSION = "5.13.0"
CLI_COMMIT = "b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed"
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


def _http_json(raw):
    """Keep native curl output complete, including all original response headers."""
    cursor = 0
    while raw[cursor:].startswith(b"HTTP/"):
        end = raw.find(b"\r\n\r\n", cursor)
        sep = 4
        if end < 0:
            end = raw.find(b"\n\n", cursor)
            sep = 2
        if end < 0:
            raise ValueError("Incomplete native response header.")
        lines = raw[cursor:end].replace(b"\r\n", b"\n").split(b"\n")
        status = int(lines[0].split()[1])
        headers = {}
        for line in lines[1:]:
            if b":" in line:
                key, value = line.split(b":", 1)
                headers.setdefault(key.decode("ascii").lower(), []).append(value.strip().decode("latin1"))
        cursor = end + sep
        if status < 200 or raw[cursor:].startswith(b"HTTP/"):
            continue
        if not 200 <= status < 300:
            raise ValueError("Native source GET returned HTTP " + str(status))
        body = raw[cursor:]
        lengths = headers.get("content-length")
        if lengths and "transfer-encoding" not in headers:
            if len(set(lengths)) != 1 or not lengths[0].isdigit() or int(lengths[0]) != len(body):
                raise ValueError("Native source GET returned an incomplete declared body.")
        return json.loads(body.decode("utf-8"))
    raise ValueError("The original complete native response headers are missing.")


def _cli_exec():
    """One exec within Session's admitted process group; no new controller."""
    request = json.load(sys.stdin)
    if request.get("schema") != "govhub.upsun.cli-request.v1":
        raise ValueError("Select the original retained native CLI request.")
    env = dict(os.environ)
    env["UPSUN_CLI_DEBUG"] = "0"
    env["UPSUN_CLI_DISABLE_CACHE"] = "1"
    env["NO_COLOR"] = "1"
    token_name = request.get("api_token_env")
    if token_name:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token_name):
            raise ValueError("Use the original API credential environment name.")
        token = os.environ.get(token_name)
        if not token:
            raise ValueError("The selected native API credential is unavailable on this host.")
        env["UPSUN_CLI_TOKEN"] = token
    # Existing CLI HOME/session and SSH agent remain native host configuration.
    # No access-token value is misrepresented as an Upsun API token.
    current_directory = str(Path(sys.argv[2]).resolve(strict=True))
    original_directory = request["capture_directory"].rstrip("/")
    def relocated(value):
        if isinstance(value, str) and (value == original_directory
                or value.startswith(original_directory + "/")):
            return current_directory + value[len(original_directory):]
        return value
    env["PATH"] = relocated(request["bin_directory"]) + os.pathsep + env.get("PATH", "")
    argv = [relocated(value) for value in request["argv"]]
    os.execve(argv[0], argv, env)


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


def capture_source(session, provider_inventory, selection):
    """Return one complete, retained native source package through Session.add.

    selection is the provider profile. Runtime paths may be relocated using the
    Session's original workspace mapping. Native target IDs never relocate.
    """
    s, p = session, selection
    root = Path(s.private_path(p["site_root"])).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Use the existing selected Git source directory.")
    project = _selector(p["project_id"], "project ID")
    environment = _selector(p["native_environment_id"], "environment ID")
    app = _selector(p.get("source_app"), "application")
    relation = _selector(p.get("source_database"), "database relationship")
    schema = _selector(p.get("source_database_schema"), "database schema")
    revision = p.get("source_revision", "")
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
        raise ValueError("Select the complete original source revision.")
    mounts = p.get("source_mounts_json") or "[]"
    if isinstance(mounts, str):
        mounts = json.loads(mounts)
    if not isinstance(mounts, list) or any(not isinstance(x, str) for x in mounts):
        raise ValueError("source_mounts_json must be the original mount-path array.")
    mounts = [_relative(x.strip("/")) for x in mounts]
    if len(set(mounts)) != len(mounts):
        raise ValueError("Select each native mount once.")
    target = {"project_id": project, "environment_id": environment, "application": app,
              "database_relationship": relation, "database_schema": schema,
              "mount_selection": mounts, "source_revision": revision}
    key = _digest(_bytes(target))[:24]
    directory = s.out / ("upsun-source-" + key)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root == directory or root in directory.parents:
        raise ValueError("Keep native source capture outside the selected Git worktree.")
    state_path = directory / "capture.json"
    if state_path.exists():
        state = _load(state_path)
        if state.get("target") != target:
            raise ValueError("Continue the exact original source target.")
    else:
        state = {"schema": SCHEMA, "target": target, "started_at": _now(),
                 "state": "RUNNING", "commands": {}, "parts": {}}
        _atomic(state_path, state)

    def save():
        state["updated_at"] = _now()
        _atomic(state_path, state)
        s.state.setdefault("upsun_source", {})[key] = {
            "state": state["state"], "directory": str(directory), "target": target}
        s.save_state()

    if state["state"] == "COMPLETE":
        for name, identity in state["published"].items():
            if _file(directory / name) != identity:
                raise ValueError("A complete original source artifact changed.")
        archive = directory / "upsun-source.zip"
        manifest = directory / "MANIFEST.json"
        s.add(archive, "upsun_complete_source", source_revision=revision)
        s.add(manifest, "upsun_source_manifest", source_revision=revision)
        return {**state["result"], "archive": str(archive), "manifest": str(manifest)}

    inventory_path = directory / "provider-inventory.json"
    if not inventory_path.exists():
        _atomic(inventory_path, provider_inventory)
    inventory = _load(inventory_path)
    native_env = inventory.get("environment")
    deployment = inventory.get("current_deployment")
    if (not isinstance(native_env, dict) or native_env.get("id") != environment
            or not isinstance(deployment, dict) or not deployment.get("id")
            or app not in deployment.get("webapps", {})):
        raise ValueError("Inventory must retain the selected actual environment and deployed application.")
    if native_env.get("head_commit") != revision:
        raise ValueError("Reviewed native environment head differs from the selected original revision.")
    tools = {name: _executable(p.get(field) or default) for name, field, default in (
        ("git", "git_path", "git"), ("upsun", "upsun_path", "upsun"),
        ("ssh", "ssh_path", "ssh"), ("rsync", "rsync_path", "rsync"))}
    bin_dir = directory / "native-bin"
    bin_dir.mkdir(mode=0o700, exist_ok=True)
    for name in ("ssh", "rsync"):
        alias = bin_dir / name
        if alias.is_symlink():
            if str(alias.resolve()) != tools[name]:
                raise ValueError("The original capture executable binding changed.")
        elif alias.exists():
            raise ValueError("Unexpected native executable alias.")
        else:
            alias.symlink_to(tools[name])
    token_env = p.get("api_token_env")
    if token_env and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", token_env):
        raise ValueError("Use a native credential environment name, never its value.")

    def run(name, argv, cli=False):
        label = "upsun-source-" + key + "-" + name
        if cli:
            request_path = directory / "requests" / (name + ".json")
            request = {"schema": "govhub.upsun.cli-request.v1", "argv": argv,
                       "api_token_env": token_env, "bin_directory": str(bin_dir),
                       "capture_directory": str(directory)}
            if request_path.exists():
                if s.resolve_private(_load(request_path)) != request:
                    raise ValueError("The original native CLI selection or runtime binding changed.")
            else:
                _stable_file(request_path, _bytes(request))
            record = s.command(label, [sys.executable, str(Path(__file__).resolve()), "_cli", str(directory)],
                               stdin_path=str(request_path))
        else:
            record = s.command(label, argv)
        stored = directory / "commands"
        stored.mkdir(mode=0o700, exist_ok=True)
        paths = {}
        for field in ("stdout", "stderr"):
            original = Path(s.private_path(record[field]["path"]))
            destination = stored / (name + "." + field)
            if destination.exists():
                if _file(destination) != _file(original):
                    raise ValueError("The retained native command bytes differ.")
            else:
                shutil.copyfile(original, destination)
                os.chmod(destination, 0o600)
            paths[field] = destination.relative_to(directory).as_posix()
        command_path = stored / (name + ".json")
        if command_path.exists():
            if s.resolve_private(_load(command_path)) != record:
                raise ValueError("The original command outcome changed after source relocation.")
        else:
            _stable_file(command_path, _bytes(record))
        state["commands"][name] = {"argv": argv, "record": command_path.relative_to(directory).as_posix(),
                                    **paths}
        save()
        return (directory / paths["stdout"]).read_bytes()

    def cli(name, args):
        return run(name, [tools["upsun"], "--no-interaction", "--yes", "--no-ansi", *args], cli=True)

    def selected(command):
        return [command, "--project", project, "--environment", environment]

    def current(name):
        data = _http_json(cli(name, [*selected("environment:curl"), "deployments/current",
                         "--request", "GET", "--include", "--no-retry-401", "--disable-compression"]))
        if not isinstance(data, dict) or not data.get("id") or app not in data.get("webapps", {}):
            raise ValueError("Native current deployment does not contain the selected application.")
        return data

    def git(name, where, args):
        return run(name, [tools["git"], "-C", str(where), *args])

    try:
        version = cli("cli-version", ["--version"]).decode("utf-8").strip()
        if not re.search(r"\b5\.13\.0\b", version) or "upsun" not in version.lower():
            raise ValueError("This source contract requires the released Upsun CLI 5.13.0.")
        before = current("deployment-before")
        if before["id"] != deployment["id"]:
            raise ValueError("Native deployment changed since the retained provider review.")
        head_before = cli("head-before", [*selected("environment:info"), "head_commit", "--refresh"]).decode().strip()
        if head_before != revision:
            raise ValueError("Native head changed before source capture.")
        app_config = before["webapps"][app]
        native_mounts = app_config.get("mounts", {})
        if not isinstance(native_mounts, dict):
            raise ValueError("The actual application mount configuration is invalid.")
        normalized_mounts = {k.strip("/"): v for k, v in native_mounts.items()}
        if len(normalized_mounts) != len(native_mounts):
            raise ValueError("The native application repeats a normalized mount path.")
        all_mounts = sorted(_relative(name) for name in normalized_mounts)
        observed_mounts = cli("mount-list", [*selected("mount:list"), "--app", app, "--paths", "--refresh"])
        observed_mounts = sorted(x.strip("/") for x in observed_mounts.decode().splitlines() if x.strip())
        if observed_mounts != all_mounts:
            raise ValueError("Native CLI and deployment disagree on the complete mount selection.")
        selected_mounts = sorted(mounts or all_mounts)
        if any(name not in all_mounts for name in selected_mounts):
            raise ValueError("A selected mount does not exist on the original application.")
        # App YAML is an unchanged original source artifact, not a reconstructed JSON config.
        cli("app-config", [*selected("app:config-get"), "--app", app, "--refresh"])

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
                raise ValueError("Local Git HEAD differs from the reviewed Upsun revision.")
            if repository["gitlink"] and head != repository["gitlink"]:
                raise ValueError("A submodule checkout differs from its reviewed parent index.")
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

        db = directory / "database.sql"
        cli("database", [*selected("db:dump"), "--app", app, "--relationship", relation,
                         "--schema", schema, "--file", str(db)])
        if not db.is_file() or db.stat().st_size == 0:
            raise ValueError("The original native SQL dump is empty or unavailable.")
        state["parts"]["database"] = {"path": "database.sql", **_file(db),
                                      "relationship": relation, "schema": schema}

        mount_rows = []
        for index, name in enumerate(selected_mounts):
            s.check()
            destination = directory / "mount-staging" / str(index)
            destination.mkdir(mode=0o700, parents=True, exist_ok=True)
            # --delete affects only our private original download staging directory.
            cli("mount-" + str(index), [*selected("mount:download"), "--app", app,
                "--mount", name, "--target", str(destination), "--refresh", "--delete"])
            archive = directory / ("mount-" + str(index) + ".tar")
            entries_path = directory / ("mount-" + str(index) + ".json")
            if entries_path.exists():
                entries = _load(entries_path)
            else:
                entries = _tar_files(archive, destination, _tree_names(destination))
                _atomic(entries_path, entries)
            mount_rows.append({"mount": name, "definition": normalized_mounts[name],
                               "archive": archive.name, "entries": entries_path.name,
                               "nodes": len(entries), **_file(archive)})
        state["parts"]["mounts"] = mount_rows
        after = current("deployment-after")
        head_after = cli("head-after", [*selected("environment:info"), "head_commit", "--refresh"]).decode().strip()
        if before["id"] != after["id"] or head_after != head_before:
            raise ValueError("Native deployment/head changed across the retained source capture.")
        # Keep independent acquisition times and original deployment objects. SQL
        # and mount downloads do not constitute an atomic provider snapshot.
        state["state"] = "PACKAGING"
        save()
        members = []
        for path in sorted(directory.rglob("*")):
            if not path.is_file() or path.is_symlink():
                continue
            relative = path.relative_to(directory).as_posix()
            if relative in ("capture.json", "MANIFEST.json", "upsun-source.zip") or relative.startswith(
                    ("mount-staging/", "native-bin/")) or relative.endswith(".partial"):
                continue
            members.append({"path": relative, **_file(path)})
        total = sum(row["bytes"] for row in members)
        if total > p["max_artifact_bytes"]:
            raise ValueError("Complete native source exceeds max_artifact_bytes; increase the original intake limit.")
        manifest = {"schema": SCHEMA, "target": target, "source_revision": revision,
                    "cli_version": version, "cli_source_commit": CLI_COMMIT,
                    "started_at": state["started_at"], "completed_at": _now(),
                    "capture_consistency": "independently_acquired_native_parts",
                    "deployment_before": before, "deployment_after": after,
                    "environment_head_before": head_before, "environment_head_after": head_after,
                    "repositories": repos, "parts": state["parts"], "commands": state["commands"],
                    "ignored_source_policy": "Git-ignored paths are listed in original command output; host credentials and ignored build caches are not silently copied.",
                    "members": members, "member_bytes": total}
        _atomic(directory / "MANIFEST.json", manifest)
        archive_path = directory / "upsun-source.zip"
        temporary = directory / "upsun-source.zip.partial"
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
            archive.write(directory / "MANIFEST.json", "MANIFEST.json")
            for member in members:
                archive.write(directory / member["path"], member["path"])
        verify_source(temporary, p["max_artifact_bytes"])
        if temporary.stat().st_size > p["max_artifact_bytes"]:
            raise ValueError("The complete source ZIP including its manifest exceeds max_artifact_bytes.")
        os.chmod(temporary, 0o600)
        os.replace(temporary, archive_path)
        result = {"schema": SCHEMA, "state": "COMPLETE", "source_revision": revision,
                  "target": target, "deployment_id": before["id"],
                  "capture_consistency": manifest["capture_consistency"],
                  "repositories": repos, "parts": state["parts"],
                  "archive": str(archive_path), "manifest": str(directory / "MANIFEST.json"),
                  "archive_identity": _file(archive_path)}
        state["result"] = result
        state["published"] = {name: _file(directory / name) for name in ("upsun-source.zip", "MANIFEST.json")}
        state["state"] = "COMPLETE"
        save()
        s.add(archive_path, "upsun_complete_source", source_revision=revision)
        s.add(directory / "MANIFEST.json", "upsun_source_manifest", source_revision=revision)
        return result
    except BaseException as error:
        state["state"] = "ATTENTION"
        state["error"] = {"type": type(error).__name__, "message": str(error), "at": _now()}
        save()
        raise


def verify_source(archive_path, max_bytes=8 * 1024**3):
    """Verify every complete package member without extracting any filesystem node."""
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
            raise ValueError("Use the original complete Upsun source package.")
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
        state = {"schema": "govhub.upsun.source-receiving.v1", "archive": identity,
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


def reopen_source(session, received_directory, checkout_directory):
    """Reopen original Git/index/local work in an independently received project.

    The caller supplies its existing Session and original operation lock. Local
    Git writes use that same retained native command admission. Missing mutation
    outcomes stay on Session's original uncertain-command recovery path.
    SQL/mount bytes remain private original inputs; this never overwrites a live
    database or writes files into a deployed Upsun environment.
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
    control = s.out / "upsun-source-reopen.json"
    binding = {"manifest_sha256": _file(received / "MANIFEST.json")["sha256"],
               "destination": str(destination)}
    if control.exists():
        state = s.read_private_json(control)
        if state.get("binding") != binding:
            raise ValueError("Continue the original source reopening destination.")
    else:
        if destination.exists() and any(destination.iterdir()):
            raise ValueError("Initial source reopening requires an empty private destination.")
        state = {"schema": "govhub.upsun.source-reopen.v1", "binding": binding,
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
        label = "upsun-reopen-" + str(index)

        def command(name, args, mutating=False):
            result = s.command(label + "-" + name, [git, "-C", str(where), *args], mutating=mutating)
            return Path(s.private_path(result["stdout"]["path"])).read_bytes()

        command("init", ["init"], True)
        command("bundle-verify", ["bundle", "verify", str(data / "repository.bundle")])
        command("refs", ["fetch", "--force", str(data / "repository.bundle"), "+refs/*:refs/*"], True)
        command("head-fetch", ["fetch", str(data / "repository.bundle"), "HEAD"], True)
        command("checkout", ["checkout", "--detach", "--force", repository["head"]], True)
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
            record = s.command("upsun-reopen-final-" + str(index) + "-" + name,
                               [git, "-C", str(where), *arguments])
            observed = Path(s.private_path(record["stdout"]["path"])).read_bytes()
            if observed != original.read_bytes():
                raise ValueError("Independent native Git " + name + " differs from the original.")
    state.update(state="COMPLETE", completed_at=_now(), source_revision=manifest["source_revision"],
                 original_target=manifest["target"], database=manifest["parts"]["database"],
                 mounts=manifest["parts"]["mounts"], received_directory=str(received))
    _atomic(control, state)
    s.add(control, "upsun_source_reopen")
    return state


def _main():
    if len(sys.argv) == 3 and sys.argv[1] == "_cli":
        _cli_exec()
        return
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
