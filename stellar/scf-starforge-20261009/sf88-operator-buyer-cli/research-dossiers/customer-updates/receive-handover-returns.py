#!/usr/bin/env python3
"""MIT. Complete selected customer handover and native return archive receiving."""
from __future__ import annotations
import argparse, contextlib, fcntl, hashlib, json, os, re, stat, subprocess, sys, uuid, zipfile
from pathlib import Path, PurePosixPath

SCHEMA = "sf88.research-customer-handover-returns-package.v1"
MAX_FILE = 256 * 1024 * 1024
MAX_JSON = 16 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
PREFIX = "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/"
def need(value, message):
    if not value:
        raise ValueError(message)
def encoded(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
def sha(body):
    return hashlib.sha256(body).hexdigest()
def relative(name):
    need(isinstance(name, str) and name and "\\" not in name and
         not any(ord(c) < 32 or ord(c) == 127 for c in name), "Invalid selected member")
    value = PurePosixPath(name)
    need(not value.is_absolute() and str(value) == name and
         all(x not in ("", ".", "..") for x in value.parts), "Use a canonical relative member")
    return value
def absolute(value):
    path = Path(value)
    need(path.is_absolute() and ".." not in path.parts and str(path) == str(value) and path != Path("/"),
         "Use an absolute canonical directory or file")
    return path
def directory(value):
    path = absolute(value)
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        need(stat.S_ISDIR(current.lstat().st_mode), "Selected directory components must be ordinary")
    need(path.resolve() == path, "Selected directory changed")
    return path
def stamp(info):
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_mode
@contextlib.contextmanager
def source(path, maximum=MAX_FILE):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_size <= maximum, "Selected file must be ordinary and bounded")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            yield stream, before
        need(stamp(before) == stamp(os.fstat(fd)), "Selected file changed during reading")
    finally:
        os.close(fd)
def identity(path, maximum=MAX_FILE):
    digest, size = hashlib.sha256(), 0
    with source(path, maximum) as (stream, before):
        while True:
            part = stream.read(65536)
            if not part:
                break
            size += len(part); digest.update(part)
        need(size == before.st_size, "Selected size changed")
    return {"bytes": size, "sha256": digest.hexdigest()}
def read(path, maximum=MAX_JSON):
    with source(path, maximum) as (stream, before):
        body = stream.read()
        need(len(body) == before.st_size, "Selected JSON size changed")
    return body
def sync(parent):
    fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
def retain(path, body, executable=False):
    directory(path.parent)
    try:
        need(read(path, max(len(body), 1)) == body, "Existing retained bytes differ: " + str(path))
        return
    except FileNotFoundError:
        pass
    temp = path.parent / (".receiving-" + uuid.uuid4().hex)
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o700 if executable else 0o600)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(body); output.flush(); os.fsync(output.fileno())
        try:
            os.link(temp, path, follow_symlinks=False)
        except FileExistsError:
            need(read(path, max(len(body), 1)) == body, "Concurrent retained bytes differ")
        sync(path.parent)
    finally:
        temp.unlink(missing_ok=True)
@contextlib.contextmanager
def locked(root):
    directory(root)
    fd = os.open(root / ".handover-receiving.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        need(stat.S_ISREG(os.fstat(fd).st_mode), "Receiving lock must be ordinary")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield fd
    finally:
        os.close(fd)
def rows(manifest):
    need(manifest.get("schema") == SCHEMA and isinstance(manifest.get("files"), list) and
         0 < len(manifest["files"]) <= 20000, "Complete original package manifest required")
    need(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}", manifest.get("operationId", "")) and
         re.fullmatch(r"[a-f0-9]{64}", manifest.get("selectionSha256", "")), "Package identity required")
    selected, total = {}, 0
    for row in manifest["files"]:
        need(isinstance(row, dict) and set(row) == {"path", "mode", "bytes", "sha256"}, "Exact package member descriptor required")
        relative(row["path"])
        need(row["path"] not in selected and row["path"] != "PACKAGE_MANIFEST.json", "Package member repeated")
        need(row["mode"] in ("100644", "100755") and type(row["bytes"]) is int and 0 <= row["bytes"] <= MAX_FILE and
             re.fullmatch(r"[a-f0-9]{64}", row["sha256"]), "Package member identity invalid")
        selected[row["path"]] = row; total += row["bytes"]
    need(total <= MAX_TOTAL, "Complete decoded package exceeds the selected receiving limit")
    required = ["COURSE.json", "INITIAL.json", "SELECTION.original.json", "ENGINE_SELECTION.json",
                "ENGINE_ORIGINAL_MANIFEST.json", "OPEN.mjs", "HANDOVER_RETURNS.md",
                "baseline/handover.json", "dossier/current.json.gz", "dossier/current.metadata.json", "dossier/history.json",
                "engine/" + PREFIX + "handover-returns.mjs", "engine/" + PREFIX + "receive-handover-returns.py",
                "engine/" + PREFIX + "OPEN-handover-returns.mjs"]
    for name in required:
        need(name in selected, "Complete receiving support is missing: " + name)
    need(any(name.startswith("engine/") and PurePosixPath(name).name.upper().startswith("LICENSE")
             for name in selected), "Complete source license required")
    need(manifest.get("native", {}).get("portable") == "dossier/current.json.gz" and
         manifest["native"].get("metadata") == "dossier/current.metadata.json" and
         manifest["native"].get("history") == "dossier/history.json", "Original native package paths changed")
    return selected
def zip_verify(path, expected_manifest=None, expected_sha=None):
    measured = identity(path)
    need(expected_sha is None or measured["sha256"] == expected_sha, "Selected original archive SHA changed")
    with source(path) as (stream, before), zipfile.ZipFile(stream) as archive:
        info = archive.infolist()
        need(len(info) > 1 and len(info) <= 20001 and len({row.filename for row in info}) == len(info),
             "Archive members must be unique and complete")
        for row in info:
            relative(row.filename)
            need(not row.is_dir() and not row.flag_bits & 1 and row.file_size <= MAX_FILE and
                 stat.S_ISREG(row.external_attr >> 16), "Archive member type is invalid")
        need(info[0].filename == "PACKAGE_MANIFEST.json" and info[0].file_size <= MAX_JSON, "Original manifest must be first")
        wire = archive.read(info[0]); manifest = json.loads(wire); selected = rows(manifest)
        if expected_manifest is not None:
            need(manifest == expected_manifest and wire == encoded(expected_manifest), "Original archive manifest differs")
        need([row.filename for row in info] == ["PACKAGE_MANIFEST.json"] + list(selected), "Exact ordered source inventory required")
        for item in info:
            mode = 0o644 if item.filename == "PACKAGE_MANIFEST.json" else (0o755 if selected[item.filename]["mode"] == "100755" else 0o644)
            need(stat.S_IMODE(item.external_attr >> 16) == mode, "Original archive source mode changed")
            if item.filename == "PACKAGE_MANIFEST.json":
                continue
            row = selected[item.filename]; digest, count = hashlib.sha256(), 0
            with archive.open(item) as incoming:
                while True:
                    part = incoming.read(65536)
                    if not part:
                        break
                    digest.update(part); count += len(part)
                    need(count <= row["bytes"], "Original member exceeds selected size")
            need(count == item.file_size == row["bytes"] and digest.hexdigest() == row["sha256"], "Original member bytes differ")
    need(identity(path) == measured, "Selected archive changed during verification")
    return {"archive": {"file": str(path), **measured}, "manifest": manifest, "manifestSha256": sha(wire)}
def verify_directory(root, manifest):
    selected = rows(manifest); actual = []
    def visit(path, prefix=""):
        for child in sorted(path.iterdir()):
            name = prefix + child.name
            status = child.lstat()
            need(not stat.S_ISLNK(status.st_mode), "Package has a symlink")
            if stat.S_ISDIR(status.st_mode):
                visit(child, name + "/")
            else:
                need(stat.S_ISREG(status.st_mode), "Package has a special member")
                actual.append(name)
    visit(root)
    need(set(actual) == set(selected) | {"PACKAGE_MANIFEST.json"}, "Package directory inventory differs")
    for name, row in selected.items():
        measured = identity(root / relative(name))
        need(measured == {"bytes": row["bytes"], "sha256": row["sha256"]}, "Package directory member differs")
        executable = bool((root / relative(name)).stat().st_mode & 0o111)
        need(executable == (row["mode"] == "100755"), "Package directory source mode differs")
    wire = read(root / "PACKAGE_MANIFEST.json")
    need(json.loads(wire) == manifest, "Package directory manifest differs")
    # Bind the selected complete engine, including every new receiving member.
    engine = json.loads(read(root / "ENGINE_SELECTION.json"))
    need(isinstance(engine.get("files"), list) and engine.get("manifestSha256") == manifest.get("engine", {}).get("manifestSha256"),
         "Original engine selection differs")
    engine_names = set()
    for row in engine["files"]:
        name = "engine/" + str(relative(row["path"]))
        need(name in selected and all(selected[name][key] == row[key] for key in ("mode", "bytes", "sha256")),
             "Complete engine membership differs")
        engine_names.add(name)
    need(engine_names == {name for name in selected if name.startswith("engine/")}, "Unselected engine member")
    need(identity(root / "ENGINE_ORIGINAL_MANIFEST.json")["sha256"] == engine["manifestSha256"],
         "Original engine lineage manifest changed")
    need(identity(root / "OPEN.mjs") == identity(root / "engine" / PREFIX / "OPEN-handover-returns.mjs"),
         "Original opener body differs")
    return selected
def build(request_path, expected_sha):
    wire = read(request_path)
    need(sha(wire) == expected_sha, "Original build request changed")
    request = json.loads(wire)
    need(set(request) == {"schema", "directory", "manifest", "output", "maximumArchiveBytes"} and
         request["schema"] == SCHEMA + ".build", "Original build selection required")
    root, output = absolute(request["directory"]), absolute(request["output"])
    maximum = request["maximumArchiveBytes"]
    need(type(maximum) is int and 0 < maximum <= MAX_FILE, "Selected archive bound invalid")
    manifest = request["manifest"]; selected = rows(manifest)
    directory(output.parent)
    # Source files are checked before any existing archive can be reused.
    for name, row in selected.items():
        need(identity(root / relative(name)) == {"bytes": row["bytes"], "sha256": row["sha256"]},
             "Selected archive source changed")
    if output.exists():
        verified = zip_verify(output, manifest)
        need(verified["archive"]["bytes"] <= maximum, "Original archive exceeds selected bound")
    else:
        temporary = output.parent / (".handover-" + uuid.uuid4().hex + ".zip")
        fd = os.open(temporary, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "w+b") as stream, zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
                entries = [("PACKAGE_MANIFEST.json", None)] + list(selected.items())
                for name, row in entries:
                    entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                    entry.create_system = 3; entry.compress_type = zipfile.ZIP_DEFLATED
                    entry.external_attr = (stat.S_IFREG | (0o755 if row and row["mode"] == "100755" else 0o644)) << 16
                    with archive.open(entry, "w", force_zip64=True) as dest:
                        if row is None:
                            dest.write(encoded(manifest))
                        else:
                            checksum, size = hashlib.sha256(), 0
                            with source(root / relative(name)) as (incoming, before):
                                while True:
                                    part = incoming.read(65536)
                                    if not part:
                                        break
                                    checksum.update(part); size += len(part); dest.write(part)
                            need(size == row["bytes"] and checksum.hexdigest() == row["sha256"], "Source changed during archive streaming")
            with open(temporary, "rb") as stream:
                os.fsync(stream.fileno())
            candidate = zip_verify(temporary, manifest)
            need(candidate["archive"]["bytes"] <= maximum, "Complete archive exceeds selected bound")
            try:
                os.link(temporary, output, follow_symlinks=False)
            except FileExistsError:
                zip_verify(output, manifest)
            sync(output.parent)
            verified = zip_verify(output, manifest)
        finally:
            temporary.unlink(missing_ok=True)
    return {"schema": SCHEMA + ".built", "state": "PACKAGED", "operationId": manifest["operationId"],
            "selectionSha256": manifest["selectionSha256"], "archive": verified["archive"],
            "manifestSha256": verified["manifestSha256"], "fileCount": len(selected)}
def extract(archive_path, expected_sha, directory_path):
    verified = zip_verify(archive_path, expected_sha=expected_sha)
    root = directory(directory_path); package = directory(root / "package")
    retain(root / "ARCHIVE_SELECTION.json", encoded({"archive": verified["archive"], "manifestSha256": verified["manifestSha256"]}))
    with source(archive_path) as (stream, before), zipfile.ZipFile(stream) as archive:
        selected = rows(verified["manifest"])
        for info in archive.infolist():
            target = package / relative(info.filename); directory(target.parent)
            expected = {"bytes": info.file_size, "sha256": verified["manifestSha256"]} if info.filename == "PACKAGE_MANIFEST.json" else selected[info.filename]
            try:
                need(identity(target) == {"bytes": expected["bytes"], "sha256": expected["sha256"]}, "Retained package member differs")
            except FileNotFoundError:
                temporary = directory(root / "private" / "member-candidates") / uuid.uuid4().hex
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                             0o700 if expected.get("mode") == "100755" else 0o600)
                try:
                    digest, size = hashlib.sha256(), 0
                    with os.fdopen(fd, "wb") as output, archive.open(info) as incoming:
                        while True:
                            part = incoming.read(65536)
                            if not part:
                                break
                            digest.update(part); size += len(part); output.write(part)
                            need(size <= expected["bytes"], "Receiving member exceeds original size")
                        output.flush(); os.fsync(output.fileno())
                    need(size == expected["bytes"] and digest.hexdigest() == expected["sha256"], "Complete received member differs")
                    try:
                        os.link(temporary, target, follow_symlinks=False)
                    except FileExistsError:
                        need(identity(target) == {"bytes": expected["bytes"], "sha256": expected["sha256"]}, "Concurrent receiver selected another member")
                    sync(target.parent)
                finally:
                    temporary.unlink(missing_ok=True)
    verify_directory(package, verified["manifest"])
    return root, package, verified
def receive(archive_path, expected_sha, directory_path, node, python):
    root = directory(directory_path)
    with locked(root) as receiving_fd:
        root, package, verified = extract(archive_path, expected_sha, root)
        attempts = directory(root / "native-attempts")
        attempt = directory(attempts / uuid.uuid4().hex)
        command = [node, str(package / "OPEN.mjs"), "--directory", str(root / "editable"),
                   "--manifest-sha256", verified["manifestSha256"], "--python", python, "--verify-only"]
        with open(attempt / "stdout.log", "xb") as stdout, open(attempt / "stderr.log", "xb") as stderr:
            child = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, cwd=root,
                                   pass_fds=(receiving_fd,), env={**os.environ, "CUSTOMER_HANDOVER_RECEIVING_LOCK_FD": str(receiving_fd)})
        retain(attempt / "RESULT.json", encoded({"argv": command, "exitCode": child.returncode}))
        need(child.returncode == 0, "Original native receiving failed; keep complete attempt: " + str(attempt))
        native = json.loads(read(attempt / "stdout.log"))
        need(native.get("dossierId") == verified["manifest"]["native"]["dossierId"] and
             native.get("selectedRevision") == verified["manifest"]["native"]["revision"] and
             native.get("selectedSha256") == verified["manifest"]["native"]["sha256"], "Native receiving identity differs")
        result = {"schema": SCHEMA + ".received", "state": "RECEIVED", "archive": verified["archive"],
                  "manifestSha256": verified["manifestSha256"], "packageDirectory": str(package), "native": native}
        retain(root / "RECEIVED.json", encoded(result)); return result
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("build"); create.add_argument("--request", required=True); create.add_argument("--sha256", required=True)
    inspect = sub.add_parser("inspect"); inspect.add_argument("--archive", required=True); inspect.add_argument("--sha256", required=True)
    check = sub.add_parser("check-directory"); check.add_argument("--directory", required=True); check.add_argument("--manifest-sha256")
    accept = sub.add_parser("receive"); accept.add_argument("--archive", required=True); accept.add_argument("--sha256", required=True)
    accept.add_argument("--directory", required=True); accept.add_argument("--node", default="node"); accept.add_argument("--python", default=sys.executable)
    args = parser.parse_args()
    if args.command == "build":
        result = build(absolute(args.request), args.sha256)
    elif args.command == "inspect":
        result = zip_verify(absolute(args.archive), expected_sha=args.sha256)
    elif args.command == "check-directory":
        root = absolute(args.directory); wire = read(root / "PACKAGE_MANIFEST.json")
        need(args.manifest_sha256 is None or sha(wire) == args.manifest_sha256, "Selected manifest differs")
        manifest = json.loads(wire); verify_directory(root, manifest)
        result = {"schema": SCHEMA + ".checked", "state": "VERIFIED", "manifestSha256": sha(wire), "fileCount": len(manifest["files"])}
    else:
        result = receive(absolute(args.archive), args.sha256, absolute(args.directory), args.node, args.python)
    print(json.dumps(result, ensure_ascii=False))
if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"state": "INCOMPLETE", "error": type(error).__name__, "message": str(error)}), file=sys.stderr)
        raise SystemExit(1)
