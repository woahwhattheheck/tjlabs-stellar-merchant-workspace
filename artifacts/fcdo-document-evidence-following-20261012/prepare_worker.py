#!/usr/bin/env python3
"""Prepare or seal the exact document-evidence worker delivery. No acquisition."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shlex
import stat
import sys
import tempfile
import zipfile

KIT = Path(__file__).resolve().parent
IATI = "stellar/scf-starforge-20261009/sf30-seller-sdk/iati"
SCHEMA = "commons.iati-document-following-worker.v1"


def require(ok, message):
    if not ok:
        raise ValueError(message)


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode() + b"\n"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(name):
    require(isinstance(name, str) and name and "\\" not in name and "\x00" not in name,
            "Use an exact relative POSIX member name")
    value = PurePosixPath(name)
    require(not value.is_absolute() and value.as_posix() == name
            and all(p not in ("", ".", "..") for p in value.parts),
            "Unsafe or noncanonical member name")
    return value


def physical(path, create=False):
    path = Path(path)
    require(path.is_absolute(), "Use an absolute physical directory")
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        if not current.exists():
            require(create, "Directory is absent: " + str(current))
            current.mkdir(mode=0o700)
        info = current.lstat()
        require(stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode),
                "Preserve unexpected directory: " + str(current))
    return path


def file_bytes(path, maximum=4 * 1024 ** 3):
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and not stat.S_ISLNK(before.st_mode)
            and before.st_size <= maximum, "Expected a bounded regular file: " + str(path))
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(descriptor)
        require((opened.st_dev, opened.st_ino) == (before.st_dev, before.st_ino),
                "File changed while opening")
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            data = stream.read(before.st_size + 1)
        after = os.fstat(descriptor)
        observed = path.lstat()
        fields = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        require(fields(before) == fields(after) == fields(observed)
                and len(data) == before.st_size, "File changed while reading")
        return data
    finally:
        os.close(descriptor)


def exact_write(path, data, mode=0o600):
    physical(path.parent, create=True)
    if path.exists() or path.is_symlink():
        require(file_bytes(path) == data and stat.S_IMODE(path.lstat().st_mode) == mode,
                "Preserve different existing bytes or permissions: " + str(path))
        return
    fd, name = tempfile.mkstemp(prefix=".worker-publish-", dir=path.parent)
    temporary = Path(name)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, path, follow_symlinks=False)
        except FileExistsError:
            require(file_bytes(path) == data and stat.S_IMODE(path.lstat().st_mode) == mode,
                    "Another file already occupies the selected destination")
        directory = os.open(path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def verify_kit():
    raw = file_bytes(KIT / "worker-delivery.json", 16 * 1024 ** 2)
    manifest = json.loads(raw)
    require(manifest.get("schema") == SCHEMA, "Use the original full worker delivery")
    names = [row["name"] for row in manifest["files"]]
    require(len(names) == len(set(names)), "Repeated delivery member")
    for item in manifest["files"]:
        path = KIT.joinpath(*relative(item["name"]).parts)
        physical(path.parent)
        data = file_bytes(path)
        require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                "Delivery member changed: " + item["name"])
    source = json.loads(file_bytes(KIT / "source-manifest.json", 16 * 1024 ** 2))
    require(source["sourceSha256"] == manifest["source"]["sha256"]
            and len(source["files"]) == manifest["source"]["files"],
            "Complete source selection differs")
    source_rows = sorted(source["files"], key=lambda x: x["path"])
    selection = "".join(x["path"] + "\0" + str(x["bytes"]) + "\0" + x["sha256"] + "\n"
                        for x in source_rows).encode()
    require(sha(selection) == source["sourceSha256"], "Complete source manifest changed")
    by_name = {row["name"]: row for row in manifest["files"]}
    for item in source_rows:
        native = by_name["source/" + item["path"]]
        require(native["bytes"] == item["bytes"] and native["sha256"] == item["sha256"],
                "Source descriptor differs")
    checkpoint = KIT / manifest["checkpoint"]["name"]
    require(sha(file_bytes(checkpoint)) == manifest["checkpoint"]["sha256"],
            "Original saved checkpoint changed")
    with zipfile.ZipFile(checkpoint) as archive:
        infos = archive.infolist()
        require(len(infos) == len({x.filename for x in infos}), "Repeated checkpoint entry")
        for info in infos:
            relative(info.filename)
            require(not info.is_dir() and not stat.S_ISLNK(info.external_attr >> 16),
                    "Unexpected checkpoint member type")
        closed = json.loads(archive.read("checkpoint.json"))
        require(closed["checkpointSha256"] == manifest["checkpoint"]["identity"]
                and closed["operationId"] == manifest["originalOperationId"],
                "Different original completed case")
        expected = {"checkpoint.json"} | {x["name"] for x in closed["files"]}
        require({x.filename for x in infos} == expected, "Incomplete checkpoint member scope")
        selection = hashlib.sha256(json.dumps(closed["files"], sort_keys=True,
                                             separators=(",", ":")).encode()).hexdigest()
        require(selection == closed["checkpointSha256"], "Original checkpoint inventory changed")
        for item in closed["files"]:
            data = archive.read(item["name"])
            require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                    "Original checkpoint body differs: " + item["name"])
    return manifest, source, closed, sha(raw)


def selected_directory(name):
    path = Path(name)
    require(path.is_absolute() and ".." not in path.parts and "." not in path.parts,
            "Select an absolute physical worker directory")
    physical(path.parent)
    require(path != KIT and KIT not in path.parents and path not in KIT.parents,
            "Keep the working directory separate from the immutable input kit")
    return path


def command(directory, config):
    return [sys.executable, "-B", str(directory / "source" / IATI
            / "document_evidence/following_observation.py"), "--config", str(config)]


def preparation_identity(manifest, source, manifest_sha, directory):
    original = json.loads(file_bytes(KIT / "following-input.original.json", 1024 * 1024))
    config = {**original, "caseDirectory": str(directory / "case")}
    config_data = encoded(config)
    config_name = "following-input-" + sha(config_data) + ".json"
    receipt = {
        "schema": "commons.iati-document-following-worker-prepared.v1",
        "deliveryManifestSha256": manifest_sha, "sourceSha256": source["sourceSha256"],
        "checkpointSha256": manifest["checkpoint"]["sha256"],
        "operationId": config["operationId"], "configuration": config_name,
        "configurationSha256": sha(config_data), "caseDirectory": "case",
    }
    return config, config_data, config_name, receipt


def prepare(name):
    manifest, source, closed, manifest_sha = verify_kit()
    directory = selected_directory(name)
    physical(directory, create=True)
    config, config_data, config_name, receipt = preparation_identity(manifest, source, manifest_sha, directory)
    marker = directory / "worker-prepared.json"
    already = marker.exists()
    if already:
        require(json.loads(file_bytes(marker)) == receipt, "A different worker selection already exists")
        require(file_bytes(directory / "source-manifest.json") == file_bytes(KIT / "source-manifest.json"),
                "The prepared source manifest differs from its exact original bytes")
        # A prepared case may have advanced. Reopening never recopies its old checkpoint.
        for item in source["files"]:
            data = file_bytes(directory / "source" / item["path"])
            require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                    "Keep the exact source accompanying this case")
        require(file_bytes(directory / config_name) == config_data, "Prepared configuration differs")
    else:
        allowed = {"source/" + x["path"] for x in source["files"]}
        allowed.update(x["name"] for x in closed["files"])
        allowed.update({"source-manifest.json", config_name})
        for path in directory.rglob("*"):
            if path.is_dir() and not path.is_symlink():
                continue
            require(path.relative_to(directory).as_posix() in allowed,
                    "Preserve an unexpected unfinished worker file: " + str(path))
        for item in source["files"]:
            exact_write(directory / "source" / item["path"],
                        file_bytes(KIT / "source" / item["path"]), 0o644)
        exact_write(directory / "source-manifest.json", file_bytes(KIT / "source-manifest.json"))
        with zipfile.ZipFile(KIT / manifest["checkpoint"]["name"]) as archive:
            for item in closed["files"]:
                require(isinstance(item["mode"], int) and 0 <= item["mode"] <= 0o777,
                        "Invalid original file permissions")
                exact_write(directory.joinpath(*relative(item["name"]).parts),
                            archive.read(item["name"]), item["mode"])
        exact_write(directory / config_name, config_data)
        exact_write(marker, encoded(receipt))
    result = {"state": "PREPARED" if not already else "REOPENED",
              "directory": str(directory), "configuration": str(directory / config_name),
              "operationId": config["operationId"], "sourceSha256": source["sourceSha256"],
              "command": command(directory, directory / config_name),
              "shellCommand": shlex.join(command(directory, directory / config_name)),
              "publicRequestsMadeByPreparation": 0}
    print(json.dumps(result, ensure_ascii=False), flush=True)


def seal_return(name, output):
    manifest, source, closed, manifest_sha = verify_kit()
    directory = selected_directory(name)
    physical(directory)
    config, config_data, config_name, expected_prepared = preparation_identity(
        manifest, source, manifest_sha, directory)
    prepared = json.loads(file_bytes(directory / "worker-prepared.json"))
    require(prepared == expected_prepared, "Select this delivery's exact prepared worker")
    require(file_bytes(directory / "source-manifest.json") == file_bytes(KIT / "source-manifest.json"),
            "The returned source manifest differs from its exact original bytes")
    require(file_bytes(directory / config_name) == config_data,
            "Only physical case relocation may change the original complete following input")
    require(config["operationId"] == manifest["operationId"], "Different following operation")
    require(sha(file_bytes(directory / "case/results/native-receiving.json"))
            == config["originalResultSha256"], "Preserve the original complete result")
    for item in source["files"]:
        data = file_bytes(directory / "source" / item["path"])
        require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                "The source edition must accompany its exported packets")
    sys.path.insert(0, str(directory / "source" / IATI))
    from document_evidence.receiving import case_owner
    case = directory / "case"
    target = Path(output)
    require(target.is_absolute(), "Select an absolute return archive path")
    physical(target.parent)
    require(directory != target and directory not in target.parents,
            "Write the return archive outside the complete working directory")
    with case_owner(case):
        members = []
        excluded = []
        for path in sorted(case.rglob("*")):
            name = path.relative_to(directory).as_posix()
            if path.is_dir() and not path.is_symlink():
                continue
            if path.name == ".receiving.lock" or path.name.endswith("-console.url") or (
                    path.suffix == ".png" and "connected/browser" in path.as_posix()):
                excluded.append(name)
                continue
            data = file_bytes(path)
            members.append({"name": name, "bytes": len(data), "sha256": sha(data),
                            "mode": stat.S_IMODE(path.lstat().st_mode)})
        for item in source["files"]:
            members.append({"name": "source/" + item["path"], "bytes": item["bytes"],
                            "sha256": item["sha256"], "mode": 0o644})
        for name in ("source-manifest.json", "worker-prepared.json", prepared["configuration"]):
            data = file_bytes(directory / name)
            members.append({"name": name, "bytes": len(data), "sha256": sha(data), "mode": 0o600})
        members.sort(key=lambda x: x["name"])
        phase = case / "following" / config["operationId"]
        native_path = phase / "results/native-receiving.json"
        connected_path = phase / "connected/complete.json"
        native = json.loads(file_bytes(native_path)) if native_path.exists() else None
        connected = json.loads(file_bytes(connected_path)) if connected_path.exists() else None
        require(native is None or native.get("operationId") == config["operationId"],
                "Different native following result")
        require(connected is None or connected.get("operationId") == config["operationId"],
                "Different connected following result")
        value = {
            "schema": "commons.iati-document-following-worker-return.v1",
            "operationId": config["operationId"], "originalOperationId": manifest["originalOperationId"],
            "inputCheckpointSha256": manifest["checkpoint"]["sha256"],
            "sourceSha256": source["sourceSha256"],
            "state": "COMPLETE" if native and native.get("state") == "COMPLETE" else "INTERRUPTED",
            "completionScope": "native",
            "nativeState": native.get("state", "NO_COMPLETE_RESULT") if native else "NO_COMPLETE_RESULT",
            "connectedState": connected.get("state", "NO_COMPLETE_RESULT") if connected else "NO_COMPLETE_RESULT",
            "native": native, "connected": connected,
            "files": members, "excludedRuntimeFiles": excluded,
        }
        value["returnIdentitySha256"] = sha(encoded(value))
        def verify_existing(path):
            with zipfile.ZipFile(path) as archive:
                require(json.loads(archive.read("return.json")) == value,
                        "Preserve a different existing return archive")
                require(set(archive.namelist()) == {"return.json"} | {x["name"] for x in members},
                        "Return archive scope differs")
                require(len(archive.infolist()) == len(members) + 1, "Repeated return archive member")
                for item in members:
                    data = archive.read(item["name"])
                    require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                            "Return archive body differs")
        if target.exists():
            verify_existing(target)
        else:
            fd, temporary_name = tempfile.mkstemp(prefix=".document-return-", dir=target.parent)
            os.close(fd)
            temporary = Path(temporary_name)
            try:
                with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED,
                                     compresslevel=6, allowZip64=True) as archive:
                    archive.writestr("return.json", encoded(value))
                    for item in members:
                        data = file_bytes(directory / item["name"])
                        require(len(data) == item["bytes"] and sha(data) == item["sha256"],
                                "A closed return source changed")
                        info = zipfile.ZipInfo(item["name"], (2026, 10, 12, 0, 0, 0))
                        info.external_attr = (stat.S_IFREG | item["mode"]) << 16
                        info.compress_type = zipfile.ZIP_DEFLATED
                        archive.writestr(info, data)
                with temporary.open("rb") as stream:
                    os.fsync(stream.fileno())
                verify_existing(temporary)
                os.link(temporary, target)
                target.chmod(0o600)
                parent_fd = os.open(target.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
                try:
                    os.fsync(parent_fd)
                finally:
                    os.close(parent_fd)
            finally:
                temporary.unlink(missing_ok=True)
        data = file_bytes(target)
        print(json.dumps({"state": value["state"], "completionScope": value["completionScope"],
                          "nativeState": value["nativeState"], "connectedState": value["connectedState"],
                          "operationId": config["operationId"],
                          "file": str(target), "bytes": len(data), "sha256": sha(data),
                          "members": len(members) + 1,
                          "returnIdentitySha256": value["returnIdentitySha256"]}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="action", required=True)
    subs.add_parser("verify")
    p = subs.add_parser("prepare")
    p.add_argument("--directory", required=True)
    r = subs.add_parser("seal-return")
    r.add_argument("--directory", required=True)
    r.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.action == "verify":
        manifest, source, closed, identity = verify_kit()
        print(json.dumps({"state": "VERIFIED", "deliveryManifestSha256": identity,
                          "sourceSha256": source["sourceSha256"], "sourceFiles": len(source["files"]),
                          "checkpointMembers": len(closed["files"]) + 1,
                          "operationId": manifest["operationId"], "publicRequestsMade": 0}))
    elif args.action == "prepare":
        prepare(args.directory)
    else:
        seal_return(args.directory, args.out)


if __name__ == "__main__":
    main()
