#!/usr/bin/env python3
"""Build and reopen the complete GovHub application from an exact source lock.

Copyright 2026 TokenJunkie Labs contributors.
Licensed under the Apache License, Version 2.0; see ../LICENSE.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
import zipfile

SOURCE_SCHEMA = "govhub-application-source/v1"
PACKAGE_SCHEMA = "govhub-application-package/v1"
PROJECT_PREFIX = "products/govhub/application/"
ROOT = "govhub-operations"
MAX_SOURCE_BYTES = 128 * 1024 * 1024
MAX_FILES = 2000
CHUNK = 1024 * 1024
STAMP = (2026, 10, 12, 0, 0, 0)
TERMINUS = {
    "name": "Terminus", "version": "4.3.3",
    "source_commit": "4cd1810ad892157131cec5919baf3036ab457d57",
    "release_asset_id": 522697387, "bytes": 12336985,
    "sha256": "e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade",
    "url": "https://github.com/pantheon-systems/terminus/releases/download/4.3.3/terminus.phar",
    "license": "MIT", "runtime": "PHP >=8.2 with the original release dependencies",
}
REQUIRED = {
    "workspace/native/upsun/sdk/LICENSE",
    "workspace/native/upsun/sdk/TaskBase.php",
    "workspace/native/upsun/sdk/ActivitiesTask.php",
    "workspace/native/upsun/sdk/EnvironmentsTask.php",
    "workspace/native/upsun/client/LICENSE",
    "workspace/native/upsun/client/ApiResourceBase.php",
    "workspace/native/upsun/client/Environment.php",
    "workspace/native/upsun/client/Activity.php",
    "workspace/native/upsun/client/Result.php",
    "workspace/native/upsun/client/HasActivitiesTrait.php",
    "workspace/native/upsun/openapispec-upsun.json",
    "workspace/native/upsun/SOURCE.json",
    "workspace/content_packages/__init__.py",
    "workspace/content_packages/model.py",
    "workspace/content_packages/service.py",
    "workspace/content_packages/native.py",
    "workspace/content_packages/native/run.php",
    "workspace/content_packages/native/shutdown.php",
    "workspace/content_packages/delivery.py",
    "workspace/content_packages/receiving.py",
    "workspace/content_packages/README.md",
    "workspace/web/packages.js", "workspace/web/packages.css",
    "LICENSE", "README.md", "cutover.py", "START_HERE.md",
    "workspace/build_application.py", "workspace/README.md",
    "workspace/server.py", "workspace/cli.py", "workspace/govhub.py",
    "workspace/govhub_schema.py", "workspace/govhub_operations.py",
    "workspace/govhub_delivery.py", "workspace/native_adapter.py",
    "workspace/lagoon_adapter.py", "workspace/pantheon_adapter.py",
    "workspace/upsun_adapter.py", "workspace/upsun_source.py",
    "workspace/upsun_receive.py", "workspace/UPSUN.md",
    "workspace/UPSUN_RECEIVING.md", "workspace/UPSUN_SOURCE.md", "workspace/UPSUN_NATIVE.md",
    "workspace/web/upsun.js", "workspace/web/upsun.css",
    "workspace/native/upsun/receiving.example.json", "workspace/native/upsun/browser_receive.cjs",
    "workspace/tugboat_adapter.py", "workspace/TUGBOAT.md",
    "workspace/tugboat_receive.py", "workspace/TUGBOAT_RECEIVING.md",
    "workspace/native/tugboat/receiving.example.json",
    "workspace/native/tugboat/openapi.yaml", "workspace/native/tugboat/SOURCE.md",
    "workspace/skpr_adapter.py", "workspace/skpr_receive.py", "workspace/SKPR.md",
    "workspace/web/skpr.js", "workspace/web/skpr.css",
    "workspace/PANTHEON.md", "workspace/NATIVE_SOURCES.md",
    "workspace/web/app.js", "workspace/web/index.html", "workspace/web/style.css",
    "workspace/vendor/assessment-core/workspace.py",
    "workspace/vendor/assessment-core/schema.py",
    "workspace/content_consolidation/service.py",
    "workspace/content_consolidation/drupal/receiving.py",
    "workspace/content_consolidation/drupal/govhub_consolidation/src/Runner.php",
    "workspace/visitor_journeys/workspace.py",
    "workspace/native/TERMINUS-LICENSE.txt",
    "workspace/pantheon_bridge/composer.json",
    "workspace/pantheon_bridge/src/GovHubBridgeCommand.php",
    "workspace/pantheon_bridge/src/ReceiptJournal.php",
    "workspace/pantheon_bridge/src/SingleAttemptRequest.php",
    "workspace/pantheon_bridge/LICENSE",
    "workspace/pantheon_bridge/PHP_BRIDGE.md",
    "workspace/pantheon_receive.py", "workspace/PANTHEON_RECEIVING.md",
    "workspace/pots/collector.py",
    "workspace/pots/__init__.py",
    "workspace/pots/model.py",
    "workspace/pots/workspace.py",
    "workspace/pots/delivery.py",
    "workspace/pots/web/pots.js",
    "workspace/pots/web/pots.css",
    "workspace/pots/receive.py",
    "workspace/pots/README.md",
    "workspace/pots/capture.php",
    "workspace/pots/CAPTURE.md",
    "workspace/editorial_playbook/__init__.py",
    "workspace/editorial_playbook/model.py",
    "workspace/editorial_playbook/service.py",
    "workspace/editorial_playbook/delivery.py",
    "workspace/editorial_playbook/native/inventory.php",
    "workspace/editorial_playbook/web/playbook.js",
    "workspace/editorial_playbook/web/playbook.css",
    "workspace/editorial_playbook/README.md",
    "workspace/static_releases/model.py",
    "workspace/static_releases/service.py",
    "workspace/static_releases/native.py",
    "workspace/static_releases/exporting.py",
    "workspace/static_releases/__init__.py",
    "workspace/static_releases/web/static.js",
    "workspace/static_releases/web/static.css",
    "workspace/static_release_cli.py",
    "workspace/STATIC_RELEASES.md",
    "workspace/native_modules/tjl_tome_capture/native_context.php",
    "workspace/native_modules/tjl_tome_capture/src/BuildContext.php",
    "workspace/native_modules/tjl_tome_capture/src/ObservedHttpKernel.php",
    "workspace/native_modules/tjl_tome_capture/src/ObservedStaticGenerator.php",
    "workspace/native_modules/tjl_tome_capture/src/ResponseSubscriber.php",
    "workspace/native_modules/tjl_tome_capture/src/TjlTomeCaptureServiceProvider.php",
    "workspace/native_modules/tjl_tome_capture/tjl_tome_capture.info.yml",
    "workspace/native_modules/tjl_tome_capture/tjl_tome_capture.services.yml",
    "workspace/tome_native.py",
}
RESERVED = {"APPLICATION_SOURCE.json", "PACKAGE.json", "native/terminus.phar"}
# Buyer workshare records accompany their private commercial cases. The editable
# application source lock uses the original program tree without those records.
PRIVATE_CASE_PREFIXES = ("case-assets/",)


def private_case_path(name):
    return any(name == prefix.rstrip("/") or name.startswith(prefix) for prefix in PRIVATE_CASE_PREFIXES)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")


def relative_name(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ValueError("A package path must be a nonempty POSIX relative name.")
    name = PurePosixPath(value)
    if name.is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError("Package paths must stay inside the selected application: " + value)
    return str(name)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def absolute(value, existing=False):
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError("Use an absolute path: " + str(value))
    if path.is_symlink():
        raise ValueError("Choose the actual file or directory: " + str(path))
    return path.resolve(strict=existing)


def file_identity(path):
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b""):
            h.update(chunk)
            size += len(chunk)
    return {"path": str(path), "bytes": size, "sha256": h.hexdigest()}


def publish_bytes(path, data):
    parent = path.parent.resolve(strict=True)
    fd, temp = tempfile.mkstemp(prefix=".govhub-source-", dir=parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp, path)
        directory = os.open(parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.unlink(temp)


def entries(manifest):
    if manifest.get("schema") != SOURCE_SCHEMA or manifest.get("package_root") != ROOT:
        raise ValueError("Choose the complete GovHub application source lock.")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("source_commit", "")):
        raise ValueError("The source lock requires its full original commit.")
    items = manifest.get("files")
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_FILES:
        raise ValueError("The application source lock has an invalid file collection.")
    selected = {}
    folded = set()
    total = 0
    for item in items:
        name = relative_name(item["path"])
        if private_case_path(name):
            raise ValueError("A private buyer case belongs in its original commercial workshare: " + name)
        if name in RESERVED or name.casefold() in folded:
            raise ValueError("A source path collides with another package member: " + name)
        folded.add(name.casefold())
        if type(item.get("bytes")) is not int or not 0 <= item["bytes"] <= MAX_SOURCE_BYTES:
            raise ValueError("Invalid retained source length: " + name)
        if not re.fullmatch(r"[0-9a-f]{64}", item.get("sha256", "")):
            raise ValueError("Missing source SHA-256: " + name)
        if not re.fullmatch(r"[0-9a-f]{40}", item.get("git_blob_sha1", "")):
            raise ValueError("Missing original Git blob: " + name)
        if item.get("mode") not in (0o644, 0o755):
            raise ValueError("Only ordinary source files are packaged: " + name)
        total += item["bytes"]
        selected[name] = item
    if total > MAX_SOURCE_BYTES:
        raise ValueError("The source package exceeds 128 MiB; retain runtime data separately.")
    missing = sorted(REQUIRED - set(selected))
    if missing:
        raise ValueError("The source lock omits application dependencies: " + ", ".join(missing))
    return selected


def lock_source(args):
    repository = absolute(args.repository, True)
    if not re.fullmatch(r"[0-9a-f]{40}", args.revision):
        raise ValueError("Use a full immutable Git commit for the application source.")
    command = ["git", "-C", str(repository)]
    commit = subprocess.run(command + ["rev-parse", "--verify", args.revision + "^{commit}"],
                            check=True, capture_output=True, timeout=30).stdout.decode().strip()
    listing = subprocess.run(command + ["ls-tree", "-r", "-z", "--full-tree", commit,
                                        "--", PROJECT_PREFIX],
                             check=True, capture_output=True, timeout=30).stdout
    tree = []
    for raw in listing.split(b"\0"):
        if not raw:
            continue
        identity, path = raw.split(b"\t", 1)
        mode, kind, sha = identity.decode("ascii").split()
        full = path.decode("utf-8")
        if not full.startswith(PROJECT_PREFIX):
            raise ValueError("Git returned a path outside the original application.")
        name = relative_name(full[len(PROJECT_PREFIX):])
        if name in RESERVED or private_case_path(name):
            continue
        if kind != "blob" or mode not in ("100644", "100755"):
            raise ValueError("Resolve the original source dependency before packaging: " + full)
        tree.append({"path": name, "mode": int(mode[-3:], 8), "git_blob_sha1": sha})
    if not tree or len(tree) > MAX_FILES:
        raise ValueError("The selected source tree is empty or exceeds the source file limit.")
    # One native Git batch reads the complete immutable tree, without network
    # calls or relying on a possibly modified working checkout.
    request = "".join(item["git_blob_sha1"] + "\n" for item in tree).encode("ascii")
    result = subprocess.run(command + ["cat-file", "--batch"], input=request,
                            check=True, capture_output=True, timeout=120).stdout
    offset = total = 0
    for item in tree:
        end = result.index(b"\n", offset)
        sha, kind, size_text = result[offset:end].decode("ascii").split()
        size = int(size_text)
        start = end + 1
        data = result[start:start + size]
        if sha != item["git_blob_sha1"] or kind != "blob" or len(data) != size or result[start + size:start + size + 1] != b"\n":
            raise ValueError("The native Git object stream did not match the selected source.")
        if git_blob(data) != sha:
            raise ValueError("The original Git blob changed: " + item["path"])
        item.update(bytes=size, sha256=digest(data))
        total += size
        offset = start + size + 1
    if offset != len(result) or total > MAX_SOURCE_BYTES:
        raise ValueError("The complete Git source stream exceeds its declared closure.")
    manifest = {"schema": SOURCE_SCHEMA, "package_root": ROOT,
                "repository": "woahwhattheheck/tjlabs-stellar-merchant-workspace", "source_commit": commit,
                "project_prefix": PROJECT_PREFIX, "files": sorted(tree, key=lambda x: x["path"]),
                "native_dependencies": [TERMINUS]}
    entries(manifest)
    output = absolute(args.output)
    publish_bytes(output, json_bytes(manifest))
    return {"source_files": len(tree), "source_bytes": total, **file_identity(output)}


def source_file(root, name):
    current = root
    for part in PurePosixPath(name).parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Package source must be an ordinary retained file: " + name)
    fd = os.open(current, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    if not stat.S_ISREG(os.fstat(fd).st_mode):
        os.close(fd)
        raise ValueError("Package source is not a regular file: " + name)
    return os.fdopen(fd, "rb")


def zip_info(name, mode):
    item = zipfile.ZipInfo(ROOT + "/" + relative_name(name), STAMP)
    item.compress_type = zipfile.ZIP_DEFLATED
    item.create_system = 3
    item.external_attr = (stat.S_IFREG | mode) << 16
    return item


def copy_member(archive, name, stream, expected):
    sha = hashlib.sha256()
    git = hashlib.sha1(b"blob " + str(expected["bytes"]).encode("ascii") + b"\0")
    size = 0
    with archive.open(zip_info(name, expected["mode"]), "w", force_zip64=True) as output:
        for chunk in iter(lambda: stream.read(CHUNK), b""):
            size += len(chunk)
            if size > expected["bytes"]:
                raise ValueError("A retained source grew during packaging: " + name)
            output.write(chunk)
            sha.update(chunk)
            git.update(chunk)
    if size != expected["bytes"] or sha.hexdigest() != expected["sha256"]:
        raise ValueError("The retained file differs from its source lock: " + name)
    if expected.get("git_blob_sha1") and git.hexdigest() != expected["git_blob_sha1"]:
        raise ValueError("The packaged source differs from its original Git blob: " + name)
    return {"path": name, "bytes": size, "sha256": sha.hexdigest(), "mode": expected["mode"],
            **({"git_blob_sha1": git.hexdigest()} if expected.get("git_blob_sha1") else {})}


def verify_package(path, expected_sha256=None):
    identity = file_identity(path)
    if expected_sha256 and identity["sha256"] != expected_sha256:
        raise ValueError("The application ZIP differs from the selected delivery SHA-256.")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if len(members) > MAX_FILES + 3:
            raise ValueError("The package exceeds the application member limit.")
        names = [item.filename for item in members]
        if len(set(name.casefold() for name in names)) != len(names):
            raise ValueError("Duplicate or case-colliding ZIP members.")
        for item in members:
            name = relative_name(item.filename)
            if not name.startswith(ROOT + "/") or item.is_dir() or item.flag_bits & 1:
                raise ValueError("Invalid application ZIP member: " + name)
            if stat.S_IFMT(item.external_attr >> 16) != stat.S_IFREG:
                raise ValueError("Application ZIP members must be ordinary files.")
        index_name = ROOT + "/PACKAGE.json"
        source_name = ROOT + "/APPLICATION_SOURCE.json"
        if archive.getinfo(index_name).file_size > 4 * CHUNK or archive.getinfo(source_name).file_size > 4 * CHUNK:
            raise ValueError("The application manifest exceeds its declared limit.")
        index = json.loads(archive.read(index_name))
        manifest = json.loads(archive.read(source_name))
        locked = entries(manifest)
        if index.get("schema") != PACKAGE_SCHEMA or index.get("source_commit") != manifest["source_commit"]:
            raise ValueError("The package and source lock identify different applications.")
        index_files = index.get("files", [])
        indexed = {relative_name(item["path"]): item for item in index_files}
        if len(indexed) != len(index_files):
            raise ValueError("The package index repeats a source member.")
        expected_names = {ROOT + "/" + name for name in indexed} | {index_name}
        if set(names) != expected_names or not set(locked).issubset(indexed):
            raise ValueError("The ZIP members differ from the complete package index.")
        extras = set(indexed) - set(locked)
        if extras - {"APPLICATION_SOURCE.json", "native/terminus.phar"} or "APPLICATION_SOURCE.json" not in extras:
            raise ValueError("The package contains undeclared application data.")
        total = 0
        for name, record in indexed.items():
            info = archive.getinfo(ROOT + "/" + name)
            if type(record.get("bytes")) is not int or info.file_size != record["bytes"] or info.file_size < 0:
                raise ValueError("The package member length changed: " + name)
            if (info.external_attr >> 16) & 0o777 != record.get("mode"):
                raise ValueError("The package file mode changed: " + name)
            if name in locked and any(record.get(key) != locked[name][key] for key in ("bytes", "sha256", "mode", "git_blob_sha1")):
                raise ValueError("The package index changed an original source file: " + name)
            total += info.file_size
            if total > MAX_SOURCE_BYTES + TERMINUS["bytes"] + 8 * CHUNK:
                raise ValueError("The package expands beyond its source and runtime limits.")
            sha = hashlib.sha256()
            git = hashlib.sha1(b"blob " + str(info.file_size).encode("ascii") + b"\0")
            with archive.open(info) as stream:
                for chunk in iter(lambda: stream.read(CHUNK), b""):
                    sha.update(chunk)
                    git.update(chunk)
            if sha.hexdigest() != record.get("sha256"):
                raise ValueError("A packaged file differs from its retained hash: " + name)
            if record.get("git_blob_sha1") and git.hexdigest() != record["git_blob_sha1"]:
                raise ValueError("A packaged file differs from its original Git object: " + name)
        runtime = indexed.get("native/terminus.phar")
        if runtime and any(runtime.get(k) != TERMINUS[k] for k in ("bytes", "sha256")):
            raise ValueError("The packaged Terminus differs from the pinned original release.")
    return {**identity, "source_commit": manifest["source_commit"], "source_files": len(locked),
            "zip_members": len(members), "terminus_included": bool(runtime), "verified": True}


def build(args):
    root = absolute(args.source_root, True)
    manifest_path = absolute(args.manifest, True)
    manifest_raw = manifest_path.read_bytes()
    if len(manifest_raw) > 4 * CHUNK:
        raise ValueError("The source lock exceeds the manifest limit.")
    manifest = json.loads(manifest_raw)
    locked = entries(manifest)
    destination = absolute(args.output)
    fd, temp_name = tempfile.mkstemp(prefix=".govhub-package-", suffix=".zip", dir=destination.parent)
    os.close(fd)
    temp = Path(temp_name)
    try:
        index_files = []
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, item in sorted(locked.items()):
                with source_file(root, name) as stream:
                    index_files.append(copy_member(archive, name, stream, item))
            archive.writestr(zip_info("APPLICATION_SOURCE.json", 0o644), manifest_raw)
            index_files.append({"path": "APPLICATION_SOURCE.json", "bytes": len(manifest_raw),
                                "sha256": digest(manifest_raw), "mode": 0o644})
            if args.terminus_phar:
                phar = absolute(args.terminus_phar, True)
                with phar.open("rb") as stream:
                    index_files.append(copy_member(archive, "native/terminus.phar", stream,
                                       {**TERMINUS, "mode": 0o644}))
            index = {"schema": PACKAGE_SCHEMA, "package_root": ROOT,
                     "source_commit": manifest["source_commit"], "files": index_files,
                     "native_dependencies": [TERMINUS] if args.terminus_phar else [],
                     "entrypoints": {"web": "workspace/server.py", "cli": "workspace/cli.py",
                                     "operator_guide": "START_HERE.md"}}
            archive.writestr(zip_info("PACKAGE.json", 0o644), json_bytes(index))
        with temp.open("rb") as stream:
            os.fsync(stream.fileno())
        result = verify_package(temp)
        os.link(temp, destination)
        directory = os.open(destination.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        return {**result, "path": str(destination)}
    finally:
        temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    lock = commands.add_parser("lock", help="Retain the whole exact application source from native Git.")
    lock.add_argument("--repository", required=True)
    lock.add_argument("--revision", required=True)
    lock.add_argument("--output", required=True)
    make = commands.add_parser("build", help="Build and reopen the complete source application ZIP.")
    make.add_argument("--source-root", required=True)
    make.add_argument("--manifest", required=True)
    make.add_argument("--output", required=True)
    make.add_argument("--terminus-phar", help="Existing original Terminus4.3.3 release PHAR.")
    verify = commands.add_parser("verify", help="Verify all ZIP members against the complete source lock.")
    verify.add_argument("zip")
    verify.add_argument("--expected-sha256", help="Original full ZIP SHA-256 from its delivery.")
    args = parser.parse_args()
    try:
        if args.command == "lock":
            result = lock_source(args)
        elif args.command == "build":
            result = build(args)
        else:
            if args.expected_sha256 and not re.fullmatch(r"[0-9a-f]{64}", args.expected_sha256):
                raise ValueError("Supply the complete original ZIP SHA-256.")
            result = verify_package(absolute(args.zip, True), args.expected_sha256)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return 0
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError, zipfile.BadZipFile,
            subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
