#!/usr/bin/env python3
"""Open a complete Bank source capsule and retain every exact original file; no financial action."""
import argparse, base64, hashlib, json, os, re, shutil, tempfile
from pathlib import Path

SCHEMA = "stellar-forge.bank-source-capsule.v1"
MAX_CAPSULE = 1600000000
MAX_FILES = 4101
MAX_FILE = 192000000
MAX_TOTAL = 1300000000

def require(ok, message):
    if not ok:
        raise ValueError(message)

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def no_duplicates(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, "The capsule repeats an original JSON key.")
        value[key] = item
    return value

def open_capsule(source, destination, expected_sha256):
    require(re.fullmatch(r"[a-f0-9]{64}", expected_sha256) is not None, "Retain the complete downloaded capsule SHA256.")
    source = Path(source)
    destination = Path(destination)
    require(source.is_absolute() and destination.is_absolute(), "Use absolute source and destination paths.")
    require(not source.is_symlink() and source.is_file(), "Select the exact original capsule file.")
    require(not destination.exists() and not destination.is_symlink(), "Choose a new receiving directory.")
    require(destination.parent.is_dir(), "Choose an existing receiving parent.")
    with source.open("rb") as stream:
        before = os.fstat(stream.fileno())
        require(0 < before.st_size <= MAX_CAPSULE, "The complete capsule exceeds its explicit bound.")
        raw = stream.read(MAX_CAPSULE + 1)
        after = os.fstat(stream.fileno())
    require((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
            (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            "The selected capsule changed during reading.")
    require(len(raw) == before.st_size and digest(raw) == expected_sha256, "The complete original capsule SHA differs.")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates)
    require(set(value) == {"schema", "receipt", "files"} and value["schema"] == SCHEMA, "Use a complete original Bank source capsule.")
    receipt = value["receipt"]
    require(receipt.get("schema") == "stellar-forge.accounting-bank-source-preparation.v1" and receipt.get("state") == "COMPLETE",
            "Retain a completed original preparation.")
    require(re.fullmatch(r"[a-f0-9]{64}", receipt.get("workspaceId", "")) is not None and
            re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", receipt.get("preparationId", "")) is not None,
            "Keep the original workspace and preparation identities.")
    files = value["files"]
    require(isinstance(files, list) and 0 < len(files) <= MAX_FILES and len(files) == len(receipt["files"]),
            "Retain the complete original file inventory.")
    names = set()
    total = 0
    staged = Path(tempfile.mkdtemp(prefix=".bank-source-receiving-", dir=destination.parent))
    os.chmod(staged, 0o700)
    try:
        for row, pin in zip(files, receipt["files"]):
            require(set(pin) == {"name", "bytes", "sha256", "role"} and
                    set(row) == {"name", "bytes", "sha256", "role", "encoding", "contentBase64"} and
                    {key: row[key] for key in pin} == pin and row["encoding"] == "base64",
                    "The original file inventory differs from its receipt.")
            name = row["name"]
            require(isinstance(name, str) and name not in ("", ".", "..", "source-receiving.json") and
                    len(name) <= 240 and not any(c in name for c in ("/", "\\", "\0")) and
                    not any(ord(c) < 32 or ord(c) == 127 for c in name) and name not in names,
                    "Keep unique original basenames.")
            names.add(name)
            require(type(row["bytes"]) is int and 0 <= row["bytes"] <= MAX_FILE and
                    re.fullmatch(r"[a-f0-9]{64}", row["sha256"]) is not None, "The original file pin is invalid.")
            data = base64.b64decode(row["contentBase64"], validate=True)
            require(len(data) == row["bytes"] and digest(data) == row["sha256"], "The complete original file differs: " + name)
            total += len(data)
            require(total <= MAX_TOTAL, "The complete retained files exceed the declared receiving bound.")
            with (staged / name).open("xb") as output:
                os.chmod(staged / name, 0o600)
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        receiving = {"schema": "stellar-forge.bank-source-capsule-receiving.v1",
                     "capsule": {"name": source.name, "bytes": len(raw), "sha256": expected_sha256},
                     "receipt": receipt, "files": receipt["files"]}
        with (staged / "source-receiving.json").open("x", encoding="utf-8") as output:
            os.chmod(staged / "source-receiving.json", 0o600)
            json.dump(receiving, output, ensure_ascii=False, indent=2)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        # Exclusive destination creation never replaces another operator's directory.
        # A failed transfer keeps its visible partial destination and the original capsule;
        # use a new directory after inspecting it. No recovery path deletes those files.
        destination.mkdir(mode=0o700)
        for name in sorted(names):
            os.link(staged / name, destination / name)
        # Publish the complete receiving record after every verified original is present.
        os.link(staged / "source-receiving.json", destination / "source-receiving.json")
        if os.name == "posix":
            descriptor = os.open(destination, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        return {"workspaceId": receipt["workspaceId"], "preparationId": receipt["preparationId"],
                "directory": str(destination), "files": len(files), "bytes": total,
                "capsuleSha256": expected_sha256}
    finally:
        if staged.exists():
            shutil.rmtree(staged)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capsule", required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--directory", required=True)
    args = parser.parse_args()
    print(json.dumps(open_capsule(args.capsule, args.directory, args.sha256), ensure_ascii=False))

if __name__ == "__main__":
    main()
