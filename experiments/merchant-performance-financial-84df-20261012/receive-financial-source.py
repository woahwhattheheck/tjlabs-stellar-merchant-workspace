#!/usr/bin/env python3
"""Materialize the complete following financial source for the retained native04 case."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile

INDEX_GIT = "0c5ca60440d46895bcd2c03a6254850708f29620"
BASE_GIT = "0fff38e8e50d8c96be1b3f91cad7b4f8e8dc2c01"
BASE_SHA = "6a0bb5c96335fcc82cee328b4932952b84437c6e42eda53e69c3b539c8b816e5"
BASE_BYTES = 9291618


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def checked(data, descriptor, label):
    require(len(data) == descriptor["bytes"], label + ": byte length changed")
    require(hashlib.sha256(data).hexdigest() == descriptor["sha256"], label + ": SHA-256 changed")
    require(git_blob(data) == descriptor["gitBlob"], label + ": Git blob changed")
    return data


def relative(value):
    require(isinstance(value, str) and value and "\\" not in value and "\0" not in value,
            "Invalid source path")
    require(not value.startswith("/") and all(p not in ("", ".", "..") for p in value.split("/")),
            "Source paths must be relative and exact")
    return Path(*value.split("/"))


def absolute(value):
    require(isinstance(value, str) and os.path.isabs(value), "Use an absolute source/output path")
    return Path(os.path.abspath(value))


def no_symlinks(path):
    for item in (*reversed(path.parents), path):
        if item.is_symlink():
            raise ValueError("Source destination contains a symbolic link: " + str(item))


def disjoint(left, right):
    return left != right and left not in right.parents and right not in left.parents


def read_record(path):
    if not path.exists():
        return None
    require(path.is_file() and not path.is_symlink(), "Expected an original regular JSON record: " + str(path))
    return json.loads(path.read_bytes())


def source_map(rows, label):
    result = {}
    for row in rows:
        relative(row["path"])
        require(row["path"] not in result, label + ": duplicate source path")
        data = checked(row["content"].encode("utf-8"), row, row["path"])
        result[row["path"]] = (row, data)
    return result


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


ensured_directories = set()


def durable_directory(path):
    no_symlinks(path)
    if path in ensured_directories:
        return
    if path.parent != path:
        durable_directory(path.parent)
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        require(path.is_dir(), "Expected a source directory: " + str(path))
    sync_directory(path)
    if path.parent != path:
        sync_directory(path.parent)
    ensured_directories.add(path)


def atomic_source(path, data, prior):
    no_symlinks(path)
    durable_directory(path.parent)
    if path.exists():
        require(path.is_file(), "Expected a regular source file: " + str(path))
        existing = path.read_bytes()
        if existing == data:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            sync_directory(path.parent)
            return False
        require(prior is not None and existing == prior,
                "Existing source differs from both its retained preimage and successor: " + str(path))
    else:
        existing = None
    descriptor, name = tempfile.mkstemp(prefix=".receive-", suffix=".tmp", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if existing is None:
            try:
                os.link(temporary, path)
            except FileExistsError:
                require(path.is_file() and not path.is_symlink() and path.read_bytes() == data,
                        "Concurrent source differs: " + str(path))
        else:
            no_symlinks(path)
            require(path.is_file() and path.read_bytes() == existing,
                    "Source changed during receiving: " + str(path))
            os.replace(temporary, path)
        sync_directory(path.parent)
        require(path.read_bytes() == data, "Written source changed: " + str(path))
        return True
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", required=True, type=Path)
    parser.add_argument("--successor", required=True, type=Path)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    os.umask(0o077)
    index_bytes = args.index.read_bytes()
    require(git_blob(index_bytes) == INDEX_GIT, "Use the complete original PR386 source-transfer.json")
    index = json.loads(index_bytes)
    require(index["schema"] == "commons.complete-source-parts.v1", "Unknown source index")
    pieces = []
    ordered = sorted(index["parts"], key=lambda row: row["part"])
    require([row["part"] for row in ordered] == list(range(1, len(ordered) + 1)),
            "Source part sequence is incomplete")
    for descriptor in ordered:
        raw = checked((args.index.parent / relative(descriptor["path"])).read_bytes(),
                      descriptor, descriptor["path"])
        part = json.loads(raw)
        require(part["schema"] == "commons.complete-source-text-part.v1"
                and part["encoding"] == "utf-8"
                and part["part"] == descriptor["part"]
                and part["total"] == len(ordered) == descriptor["total"]
                and part["completeSourceGitBlob"] == BASE_GIT, "Source part identity differs")
        piece = part["content"].encode("utf-8")
        require(len(piece) == part["contentBytes"] == descriptor["sourceContentBytes"],
                "Source part content length differs")
        require(hashlib.sha256(piece).hexdigest() == part["contentSha256"] == descriptor["sourceContentSha256"],
                "Source part content digest differs")
        pieces.append(piece)
    capsule_bytes = checked(b"".join(pieces), index["completeSource"], "Complete original source")
    require(git_blob(capsule_bytes) == BASE_GIT and len(capsule_bytes) == BASE_BYTES
            and hashlib.sha256(capsule_bytes).hexdigest() == BASE_SHA, "Unexpected original source cohort")
    capsule = json.loads(capsule_bytes)
    base = source_map(capsule["files"], "Original current source")
    foundation = source_map(capsule["foundationFiles"], "Original frozen source")
    require(len(base) == capsule["fileCount"] == index["completeSource"]["fileCount"]
            and sum(len(data) for _, data in base.values()) == capsule["sourceBytes"]
            == index["completeSource"]["sourceBytes"], "Original current source counts differ")
    require(len(foundation) == index["completeSource"]["foundationFiles"]
            and sum(len(data) for _, data in foundation.values()) == index["completeSource"]["foundationSourceBytes"],
            "Original frozen source counts differ")

    successor_bytes = args.successor.read_bytes()
    successor = json.loads(successor_bytes)
    require(successor["schema"] == "stellar-forge.merchant-performance-financial-source-successor.v1",
            "Unknown financial source successor")
    require(successor["baseSourceTransferGitBlob"] == INDEX_GIT
            and successor["baseSourceGitBlob"] == BASE_GIT
            and successor["baseSourceBytes"] == BASE_BYTES
            and successor["baseSourceSha256"] == BASE_SHA, "Successor belongs to another original source")
    following = dict(base)
    for path, pair in source_map(successor["files"], "Following financial source").items():
        row, data = pair
        previous = base.get(path)
        require(row["expectedCapturedPreimage"] == (previous[0]["gitBlob"] if previous else None),
                "Captured source preimage differs: " + path)
        following[path] = pair
    require(len(following) == successor["graph"]["currentFileCount"]
            and sum(len(data) for _, data in following.values()) == successor["graph"]["currentSourceBytes"],
            "Following source counts differ")

    receiving = successor["receiving"]
    target = absolute(args.output)
    no_symlinks(target)
    for name in ("originalPerformanceSourceRoot", "originalFoundationSourceRoot", "nativeRun", "performanceRun", "financialRun"):
        if receiving.get(name):
            require(disjoint(target, absolute(receiving[name])), "Source destination overlaps saved " + name)
    performance_run = absolute(receiving["performanceRun"])
    performance = read_record(performance_run / "flow-result.json")
    require(performance is not None
            and performance.get("schema") == "stellar-forge.merchant-performance-customer-result.v1"
            and performance.get("state") == "COMPLETE"
            and performance.get("operationDirectory") == str(performance_run),
            "Finish the existing Performance operation using its recorded source tree before this continuation")
    operation = read_record(absolute(receiving["financialRun"]) / "operation.json")
    if operation is not None:
        require(operation.get("sourceRoot") == str(target),
                "The existing financial operation must retain its recorded sourceRoot: " + str(operation.get("sourceRoot")))

    # Check every existing destination before publishing any source file.
    for path, (_, data) in following.items():
        destination = target / relative(path)
        no_symlinks(destination)
        if destination.exists():
            require(stat.S_ISREG(destination.stat().st_mode), "Expected a regular source file: " + str(destination))
            existing = destination.read_bytes()
            previous = base.get(path)
            require(existing == data or (previous is not None and existing == previous[1]),
                    "Existing source has another identity: " + str(destination))
    durable_directory(target)
    written = 0
    for path, (_, data) in following.items():
        previous = base.get(path)
        written += atomic_source(target / relative(path), data, previous[1] if previous else None)
    print(json.dumps({
        "schema": "stellar-forge.merchant-performance-financial-source-receiving.v1",
        "state": "SOURCE_READY", "sourceRoot": str(target), "files": len(following),
        "sourceBytes": sum(len(data) for _, data in following.values()), "writtenFiles": written,
        "baseSourceGitBlob": BASE_GIT, "successorGitBlob": git_blob(successor_bytes),
        "successorSha256": hashlib.sha256(successor_bytes).hexdigest(),
        "performanceRun": str(performance_run), "performanceState": performance["state"],
        "financialOperationRetained": operation is not None
    }, indent=2))


if __name__ == "__main__":
    main()
