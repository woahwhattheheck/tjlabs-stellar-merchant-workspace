#!/usr/bin/env python3
"""Open or resume one exact complete source bank without replacing original files."""
import argparse
import base64
import gzip
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
import unicodedata
import uuid

def require(value, message):
    if not value:
        raise ValueError(message)

def sha(body):
    return hashlib.sha256(body).hexdigest()

def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")

def parse(body):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Repeated JSON key: " + key)
            result[key] = value
        return result
    def invalid(value):
        raise ValueError("Non-finite JSON value: " + value)
    return json.loads(body.decode("utf-8"), object_pairs_hook=pairs, parse_constant=invalid)

def decode(encoded, label):
    require(isinstance(encoded, str), label + " must be Base64 text")
    body = base64.b64decode(encoded, validate=True)
    require(base64.b64encode(body).decode("ascii") == encoded,
            label + " is not canonical Base64")
    return body

def identity(body, item, label, required=False):
    present = "bytes" in item or "sha256" in item
    require(not required or present, "Missing original identity: " + label)
    if present:
        require(type(item.get("bytes")) is int and item["bytes"] >= 0 and
                isinstance(item.get("sha256"), str) and
                re.fullmatch(r"[0-9a-f]{64}", item["sha256"]),
                "Invalid original identity: " + label)
        require(len(body) == item["bytes"] and sha(body) == item["sha256"],
                "Original bytes/hash differ: " + label)

def safe(name):
    require(isinstance(name, str) and name and len(name) <= 4096 and
            not re.search(r'[\x00-\x1f\x7f\\<>:"|?*]', name),
            "Unsafe or nonportable source path")
    parts = name.split("/")
    reserved = {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"}
    reserved.update("COM" + x for x in "123456789¹²³")
    reserved.update("LPT" + x for x in "123456789¹²³")
    for part in parts:
        require(part not in ("", ".", "..") and not part.endswith((" ", ".")) and
                len(part.encode("utf-8")) <= 255 and
                part.split(".")[0].upper() not in reserved,
                "Unsafe or nonportable source component: " + repr(part))
    return parts

def path_key(name):
    return "/".join(unicodedata.normalize("NFC", x).casefold() for x in safe(name))

def mode_of(item):
    mode = item.get("mode", "100644")
    require(mode in ("100644", "100755", 420, 493), "Unsupported source file mode")
    return 0o755 if mode in ("100755", 493) else 0o644

def prepare(source):
    raw = pathlib.Path(source).read_bytes()
    document = parse(raw)
    require(isinstance(document, dict), "Complete source must be a JSON object")
    codec = document.get("codec", document.get("encoding"))
    if codec == "gzip+base64":
        compressed = decode(document.get("content_base64"), "Complete carrier")
        raw = gzip.decompress(compressed)
        expected = ({"bytes": document.get("decoded_bytes"),
                     "sha256": document.get("decoded_sha256")}
                    if "decoded_bytes" in document else document)
        identity(raw, expected, "complete decoded carrier", required=True)
        document = parse(raw)
    elif "codec" in document:
        raise ValueError("Unsupported complete source carrier codec")
    require(isinstance(document, dict), "Decoded source must be a JSON object")
    members = document.get("files")
    if isinstance(members, dict):
        members = [{"path": name, "content": text} for name, text in members.items()]
    require(isinstance(members, list), "Complete files must be an array or path/text object")
    binaries = document.get("binary_files", [])
    require(isinstance(binaries, list), "binary_files must be an array")
    prepared, keys = [], {}
    for item, binary in [(x, False) for x in members] + [(x, True) for x in binaries]:
        require(isinstance(item, dict), "Invalid source member")
        name = item.get("path")
        key = path_key(name)
        require(key != "complete-source.json" and
                not key.startswith("complete-source.json/"),
                "complete-source.json is reserved for the exact original bank")
        require(key not in keys, "Portable duplicate source path: " + name)
        for previous in keys:
            require(not key.startswith(previous + "/") and
                    not previous.startswith(key + "/"),
                    "File/directory source collision: " + name)
        keys[key] = name
        if binary:
            body = decode(item.get("content_base64"), "Original binary " + name)
        else:
            require(isinstance(item.get("content"), str), "Source text is absent: " + name)
            require(item.get("encoding", "utf8") in ("utf8", "utf-8"),
                    "Unsupported source text encoding: " + name)
            body = item["content"].encode("utf-8")
        identity(body, item, name, required=binary)
        prepared.append((name, body, mode_of(item)))
    prepared.append(("complete-source.json", raw, 0o644))
    return raw, document, prepared, len(members), len(binaries)

def lstat(path):
    try:
        return path.lstat()
    except FileNotFoundError:
        return None

def ordinary_directory(path):
    info = lstat(path)
    require(info is not None and stat.S_ISDIR(info.st_mode) and
            not stat.S_ISLNK(info.st_mode), "Not an ordinary directory: " + str(path))

def check_ancestors(path):
    for current in list(reversed(path.parents)) + [path]:
        ordinary_directory(current)

def syncdir(path):
    # File contents are fsynced on every platform. Windows does not expose the
    # same ordinary-directory fsync operation through this stdlib interface.
    if os.name != "nt":
        fd = os.open(str(path), os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

def mkdir_exact(path):
    try:
        path.mkdir()
        syncdir(path.parent)
    except FileExistsError:
        pass
    ordinary_directory(path)

def file_exact(path, body):
    info = lstat(path)
    require(info is not None and stat.S_ISREG(info.st_mode) and
            not stat.S_ISLNK(info.st_mode), "Not an ordinary original file: " + str(path))
    require(info.st_size == len(body) and path.read_bytes() == body,
            "Existing original differs: " + str(path))

def atomic_file(target, body, mode, staging, prefix="member"):
    ordinary_directory(staging)
    ordinary_directory(target.parent)
    if lstat(target) is not None:
        file_exact(target, body)
        return
    temporary = staging / ("." + prefix + "." + uuid.uuid4().hex + ".stage")
    try:
        with temporary.open("xb") as stream:
            require(stream.write(body) == len(body), "Incomplete stage write")
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        # The sibling state and output normally share a filesystem. If a
        # mounted target prevents hard-link publication, preserve it and fail;
        # never substitute an overwriting rename or an incomplete final copy.
        try:
            os.link(temporary, target)
        except FileExistsError:
            file_exact(target, body)
        syncdir(target.parent)
        file_exact(target, body)
    finally:
        try:
            temporary.unlink()
            syncdir(staging)
        except FileNotFoundError:
            pass

def check_output(root, prepared):
    info = lstat(root)
    if info is None:
        return
    ordinary_directory(root)
    files = {name: body for name, body, _ in prepared}
    directories = set()
    for name in files:
        parts = name.split("/")
        directories.update("/".join(parts[:i]) for i in range(1, len(parts)))
    def visit(parent, prefix=""):
        for child in parent.iterdir():
            name = prefix + child.name
            info = child.lstat()
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                require(name in directories, "Unplanned existing directory: " + name)
                visit(child, name + "/")
            else:
                require(name in files, "Unplanned existing source file: " + name)
                file_exact(child, files[name])
    visit(root)

def state_directory(state, owner):
    created = False
    try:
        state.mkdir()
        created = True
        syncdir(state.parent)
    except FileExistsError:
        pass
    ordinary_directory(state)
    marker = state / "owner.json"
    if lstat(marker) is None:
        # Recover a crash between mkdir and publication of the first marker.
        # Only our unpublished marker stages may exist in an unowned state.
        require(all(re.fullmatch(r"\.owner\.[0-9a-f]{32}\.stage", p.name) and
                    stat.S_ISREG(p.lstat().st_mode) and not p.is_symlink()
                    for p in state.iterdir()),
                "Existing source state has no original owner")
    atomic_file(marker, owner, 0o600, state, "owner")
    # Do not infer a new owner from an empty output or remove another source's
    # state. Exact original owner bytes are mandatory on every continuation.
    return created

def materialize(source, output):
    raw, document, prepared, text_count, binary_count = prepare(source)
    root = pathlib.Path(os.path.abspath(output))
    require(root.name not in ("", ".", ".."), "Choose a named output directory")
    safe(root.name)
    check_ancestors(root.parent)
    state = root.with_name(root.name + ".source-open-state")
    plan = {"schema": "commons.source-open-plan.v1",
            "source_bytes": len(raw), "source_sha256": sha(raw),
            "members": [{"path": name, "bytes": len(body), "sha256": sha(body),
                         "mode": "100755" if mode == 0o755 else "100644"}
                        for name, body, mode in prepared]}
    plan_body = canonical(plan)
    owner = canonical({"schema": "commons.source-open-owner.v1",
                       "output": str(root), "source_bytes": len(raw),
                       "source_sha256": sha(raw), "plan_sha256": sha(plan_body)})
    # A previous matching partial tree (including an interrupted older opener)
    # may be adopted only after every existing member has matched this exact
    # complete input. Unknown or changed files are rejected before mutation.
    check_output(root, prepared)
    state_directory(state, owner)
    atomic_file(state / "plan.json", plan_body, 0o600, state, "plan")
    stage = state / "stages"
    mkdir_exact(stage)
    mkdir_exact(root)
    for name, body, mode in prepared:
        parent = root
        for part in name.split("/")[:-1]:
            parent = parent / part
            mkdir_exact(parent)
        atomic_file(parent / name.split("/")[-1], body, mode, stage)
    # This also rejects an unexpected extra file appearing during publication.
    check_output(root, prepared)
    for name, body, _ in prepared:
        file_exact(root.joinpath(*name.split("/")), body)
    receipt = {"schema": "commons.source-opened.v1", "output": str(root),
               "files": text_count, "binary_files": binary_count,
               "source_bytes": len(raw), "source_sha256": sha(raw),
               "record_sha256": document.get("record_sha256"),
               "state_directory": str(state)}
    atomic_file(state / "completed.json", canonical(receipt), 0o600, state, "completed")
    return receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="Complete JSON bank or gzip+Base64 carrier")
    parser.add_argument("output", help="Original output directory; exact retries resume")
    args = parser.parse_args()
    print(json.dumps(materialize(args.source, args.output), ensure_ascii=False,
                     sort_keys=True, allow_nan=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}),
              file=sys.stderr)
        sys.exit(1)
