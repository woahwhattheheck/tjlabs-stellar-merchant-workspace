#!/usr/bin/env python3
"""Prepare a new private receiving instance from the complete customer handover."""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()

def checked(path, row):
    assert path.is_file() and not path.is_symlink(), "Missing regular file: " + str(path)
    assert path.stat().st_size == row["bytes"] and digest(path) == row["sha256"], "File changed: " + str(path)

def publish_directory(source, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), -100, os.fsencode(destination), 1) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number), str(destination))

def receive(handover, destination):
    handover = handover.resolve()
    inventory = json.loads((handover / "MANIFEST.json").read_text())
    for row in inventory["files"]:
        rel = PurePosixPath(row["path"])
        assert not rel.is_absolute() and ".." not in rel.parts, "Unsafe delivered file path."
        checked(handover / row["path"], row)
    index = json.loads((handover / "HANDOVER.json").read_text())
    source = json.loads((handover / "SOURCE.json").read_text())
    for row in source["files"]:
        checked(handover / "application" / row["path"], row)
    for row in source["fulfillmentFiles"]:
        checked(handover / "tools" / Path(row["path"]).name, row)
    account = index["receivingBackup"]
    archive = handover / account["path"]
    checked(archive, account)
    key = handover / index["recoveryKey"]["path"]
    checked(key, index["recoveryKey"])
    request = {"schema": "stellar-forge.accounting-customer-instance.v1",
               "backupArchiveSha256": account["sha256"], "backupManifestSha256": account["manifestSha256"],
               "workspaceId": index["binding"]["workspaceId"], "sourcesSha256": index["binding"]["sourcesSha256"],
               "applicationCommit": source["applicationCommit"],
               "sourceSelectionSha256": source["sourceSelectionSha256"]}
    destination = destination.resolve()
    if destination.exists():
        assert destination.is_dir() and not destination.is_symlink(), "Choose a private directory."
        assert json.loads((destination / "INSTANCE.json").read_text()) == request, "This instance belongs to another handover."
        return request
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".account-receiving-", dir=destination.parent))
    try:
        (temporary / "state").mkdir(mode=0o700)
        (temporary / "backups").mkdir(mode=0o700)
        (temporary / "private").mkdir(mode=0o700)
        with zipfile.ZipFile(archive) as z:
            names = set()
            for info in z.infolist():
                rel = PurePosixPath(info.filename)
                assert not rel.is_absolute() and ".." not in rel.parts and "\\" not in info.filename, "Unsafe backup member."
                assert info.filename not in names, "Duplicate backup member."
                names.add(info.filename)
                mode = info.external_attr >> 16
                assert not stat.S_ISLNK(mode), "Backup member is a symbolic link."
                if not info.filename.startswith(account["memberPrefix"]):
                    continue
                suffix = info.filename[len(account["memberPrefix"]):]
                if not suffix:
                    continue
                target = temporary / "backups" / "retained-account" / suffix
                if info.is_dir():
                    target.mkdir(mode=0o700, parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    with z.open(info) as src, target.open("xb") as dst:
                        shutil.copyfileobj(src, dst, 1024 * 1024)
                        dst.flush()
                        os.fsync(dst.fileno())
                    target.chmod(0o600)
        manifest = json.loads((temporary / "backups/retained-account/backup.json").read_text())
        assert manifest["manifestSha256"] == account["manifestSha256"], "The original backup manifest differs."
        shutil.copyfile(key, temporary / "private/restore-key.txt")
        (temporary / "private/restore-key.txt").chmod(0o600)
        (temporary / "INSTANCE.json").write_text(json.dumps(request, indent=2) + "\n")
        publish_directory(temporary, destination)
        return request
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--handover", type=Path, default=Path.cwd())
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    request = receive(args.handover, args.destination)
    print(json.dumps({"status": "READY", "instance": str(args.destination.resolve()),
                      "sourceSelectionSha256": request["sourceSelectionSha256"]}))

if __name__ == "__main__":
    main()
