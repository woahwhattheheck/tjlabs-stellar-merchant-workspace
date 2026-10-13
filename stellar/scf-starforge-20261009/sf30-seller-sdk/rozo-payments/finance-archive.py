#!/usr/bin/env python3
"""Preserve or receive a completed native finance programme and all original custody files."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import tempfile
import zipfile

SCHEMA = "stellar-forge.rozo-finance-package.v1"
MAX_BYTES = 8 * 1024**3
MAX_MEMBERS = 30000

def digest(path):
    value = hashlib.sha256()
    count = 0
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            count += len(chunk)
            value.update(chunk)
    return count, value.hexdigest()

def ordinary(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise ValueError("Keep an ordinary original file: " + str(path))
    return info

def safe(name):
    value = PurePosixPath(name)
    if not name or "\\" in name or "\x00" in name or value.is_absolute() or any(p in ("", ".", "..") for p in name.split("/")):
        raise ValueError("Retain an original relative member path")
    return value.parts

def selected(root):
    names = []
    for name in ("FINANCE_PLAN.json", "FINANCE_PROGRESS.json", "FINANCE_RECEIVING.json", "FINANCE_RESULT.json",
                 "ORIGINAL_FINANCE_STATE.json", "FINAL_FINANCE_STATE.json", "MERCHANT_REVIEW.json",
                 "ROZO_INVENTORY.json", "COLD_RECEIVING_PROCESS.json", "CONFIGURED_BUYER_PREVIEW.json",
                 "AMENDMENT_SOURCE_IMPACT.json", "AMENDMENT_PREDECESSOR.json"):
        if (root / name).exists():
            names.append(name)
    for folder in ("files", "accounting-backup", "maintenance", "native-results", "process-attempts", "previous-finance"):
        directory = root / folder
        if directory.exists():
            for path in directory.rglob("*"):
                if path.is_symlink():
                    raise ValueError("No linked finance members")
                if path.is_file():
                    names.append(path.relative_to(root).as_posix())
    # The original durable browser request and saved outputs carry receiving; Chromium cache is not a customer source.
    if (root / "browser").exists():
        names.extend(path.relative_to(root).as_posix() for path in (root / "browser").iterdir() if path.is_file())
    if (root / "cold-finance" / "FINANCE_RECEIVED.json").exists():
        names.append("cold-finance/FINANCE_RECEIVED.json")
    return sorted(names)

def commit(temp, target):
    try:
        os.link(temp, target)
    except FileExistsError:
        if digest(temp) != digest(target):
            raise ValueError("An accepted original destination differs")
    finally:
        temp.unlink(missing_ok=True)
    fd = os.open(target.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def pack(directory, out):
    root, out = Path(directory).resolve(), Path(out).resolve()
    result = json.loads((root / "FINANCE_RESULT.json").read_bytes())
    progress = json.loads((root / "FINANCE_PROGRESS.json").read_bytes())
    if progress.get("state") != "complete" or result["operationId"] != progress["operationId"]:
        raise ValueError("Finish and retain the original full native programme before producing its complete package")
    names, rows, total = selected(root), [], 0
    if not 1 <= len(names) <= MAX_MEMBERS:
        raise ValueError("The complete native member count is outside its bound")
    for name in names:
        safe(name)
        ordinary(root / name)
        size, sha = digest(root / name)
        total += size
        rows.append({"path": name, "bytes": size, "sha256": sha})
    if total > MAX_BYTES:
        raise ValueError("The complete native programme exceeds 8 GiB")
    manifest = {"schema": SCHEMA, "operationId": result["operationId"], "workspaceId": result["workspaceId"],
                "planSha256": result["planSha256"], "files": rows}
    raw = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=out.name + ".", suffix=".pending", dir=out.parent)
    os.close(fd)
    temp = Path(temporary)
    try:
        with zipfile.ZipFile(temp, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for row in rows:
                if digest(root / row["path"]) != (row["bytes"], row["sha256"]):
                    raise ValueError("An original file changed while packing")
                info = zipfile.ZipInfo(row["path"], (2026, 10, 13, 0, 0, 0))
                info.external_attr = (stat.S_IFREG | 0o600) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with archive.open(info, "w", force_zip64=True) as sink, (root / row["path"]).open("rb") as source:
                    copied, checksum = 0, hashlib.sha256()
                    while chunk := source.read(1024 * 1024):
                        copied += len(chunk)
                        checksum.update(chunk)
                        sink.write(chunk)
                    if copied != row["bytes"] or checksum.hexdigest() != row["sha256"]:
                        raise ValueError("An original file changed during its complete ZIP copy")
            info = zipfile.ZipInfo("FINANCE_PACKAGE.json", (2026, 10, 13, 0, 0, 0))
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, raw)
        with temp.open("rb") as stream:
            os.fsync(stream.fileno())
        commit(temp, out)
    finally:
        temp.unlink(missing_ok=True)
    size, sha = digest(out)
    return {"schema": SCHEMA, "operationId": result["operationId"], "path": str(out), "bytes": size,
            "sha256": sha, "members": len(rows) + 1, "expandedBytes": total}

def receive(archive, directory, expected):
    archive, root = Path(archive).resolve(), Path(directory).resolve()
    ordinary(archive)
    if digest(archive)[1] != expected:
        raise ValueError("Select the exact original completed package")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if root.is_symlink():
        raise ValueError("Use an ordinary receiving directory")
    with zipfile.ZipFile(archive) as source:
        infos = source.infolist()
        names = [i.filename for i in infos]
        if len(names) != len(set(names)) or len(names) > MAX_MEMBERS + 1 or "FINANCE_PACKAGE.json" not in names:
            raise ValueError("Keep the complete unique original member inventory")
        if sum(i.file_size for i in infos) > MAX_BYTES + 16 * 1024**2:
            raise ValueError("The complete expanded package exceeds its bound")
        if source.getinfo("FINANCE_PACKAGE.json").file_size > 16 * 1024**2:
            raise ValueError("The member manifest exceeds its bound")
        raw = source.read("FINANCE_PACKAGE.json")
        manifest = json.loads(raw)
        rows = manifest.get("files")
        if manifest.get("schema") != SCHEMA or not isinstance(rows, list):
            raise ValueError("Use the original complete finance package")
        mapping = {r["path"]: r for r in rows}
        if len(mapping) != len(rows) or set(mapping) | {"FINANCE_PACKAGE.json"} != set(names):
            raise ValueError("The exact original file inventory differs")
        for name in names:
            parts = safe(name)
            info = source.getinfo(name)
            if info.is_dir() or stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG):
                raise ValueError("Only ordinary original files are accepted")
            row = mapping.get(name, {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()})
            if info.file_size != row["bytes"]:
                raise ValueError("An original member size changed")
            target = root.joinpath(*parts)
            parent = root
            for part in parts[:-1]:
                parent = parent / part
                parent.mkdir(mode=0o700, exist_ok=True)
                if parent.is_symlink() or not parent.is_dir():
                    raise ValueError("No linked receiving directory")
            if target.exists():
                ordinary(target)
                if digest(target) != (row["bytes"], row["sha256"]):
                    raise ValueError("An existing receiving file differs")
                continue
            fd, temporary = tempfile.mkstemp(prefix=target.name + ".", suffix=".pending", dir=target.parent)
            temp = Path(temporary)
            try:
                total, sha = 0, hashlib.sha256()
                with os.fdopen(fd, "wb") as sink, source.open(name) as input:
                    while chunk := input.read(1024 * 1024):
                        total += len(chunk)
                        if total > row["bytes"]:
                            raise ValueError("The original member exceeded its recorded size")
                        sha.update(chunk)
                        sink.write(chunk)
                    sink.flush()
                    os.fsync(sink.fileno())
                if total != row["bytes"] or sha.hexdigest() != row["sha256"]:
                    raise ValueError("The complete original member differs")
                commit(temp, target)
            finally:
                temp.unlink(missing_ok=True)
    return {"schema": SCHEMA, "state": "RECEIVED", "operationId": manifest["operationId"],
            "sha256": expected, "directory": str(root), "members": len(names)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("pack", "receive"))
    parser.add_argument("--directory", required=True)
    parser.add_argument("--out")
    parser.add_argument("--archive")
    parser.add_argument("--sha256")
    args = parser.parse_args()
    if args.action == "pack":
        if not args.out:
            parser.error("--out is required")
        value = pack(args.directory, args.out)
    else:
        if not args.archive or not args.sha256:
            parser.error("--archive and --sha256 are required")
        value = receive(args.archive, args.directory, args.sha256)
    print(json.dumps(value, sort_keys=True))

if __name__ == "__main__":
    main()
