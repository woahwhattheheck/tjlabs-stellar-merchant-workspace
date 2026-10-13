#!/usr/bin/env python3
"""Receive the one original Econdb operation on an already equipped Linux host.
No package installation, payment, API credential, service or alternate controller.
"""
import argparse, base64, datetime, fcntl, hashlib, json, os, pathlib, platform
import re, shutil, stat, subprocess, sys, tempfile, urllib.request, zipfile

OPERATION = "ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013"
URL = "https://api.github.com/repos/woahwhattheheck/tjlabs-stellar-merchant-workspace/git/blobs/ee34d789370e82dab5f1138c6dcd68844d6af7a2"
BUNDLE_BYTES = 1099599
BUNDLE_SHA = "ee340887bd4c27057e72730fb3dee161f22a99dc7dbfb6afd9ea675cd8848f93"
SOURCE_BYTES = 1054537
P = pathlib.Path
FILES = ("receive-econdb.py", "receive-econdb-native.mjs", "receive-econdb-browser.mjs", "NATIVE_RECEIVING.md")

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(body):
    return hashlib.sha256(body).hexdigest()
def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
def emit(phase, **values):
    print(json.dumps({"phase": phase, "at": now(), **values}, ensure_ascii=False), flush=True)
def need(ok, message):
    if not ok:
        raise RuntimeError(message)
def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
def directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    s = path.lstat()
    need(stat.S_ISDIR(s.st_mode) and not path.is_symlink(), "Private real directory required: " + str(path))
    need(not s.st_mode & 0o077, "Operation directory must be private: " + str(path))
def atomic(path, body, identical=False, staging_parent=None):
    directory(path.parent)
    if path.exists():
        need(not path.is_symlink() and path.is_file(), "Expected regular output: " + str(path))
        if identical:
            need(path.read_bytes() == body, "Existing retained bytes differ: " + str(path))
            return
    fd, name = tempfile.mkstemp(prefix=(path.parent.name + "." if staging_parent else "") + path.name + ".writing-",
                                dir=staging_parent or path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(body)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        fsync_dir(path.parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)
def regular(path, maximum=None):
    s = path.lstat()
    need(stat.S_ISREG(s.st_mode) and not path.is_symlink(), "Expected regular file: " + str(path))
    if maximum is not None:
        need(s.st_size <= maximum, "File exceeds receiving bound: " + str(path))
    return path.read_bytes()
def identity(path):
    h = hashlib.sha256()
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and not path.is_symlink(), "Not a regular member: " + str(path))
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            h.update(block)
    after = path.lstat()
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
         (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
         "Member changed during hashing: " + str(path))
    return {"bytes": after.st_size, "sha256": h.hexdigest()}
def inventory(root, excluded=()):
    rows = []
    for parent, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in excluded)
        for d in dirs:
            need(not (P(parent) / d).is_symlink(), "Unexpected directory symlink")
        for name in sorted(names):
            path = P(parent) / name
            if path.name in ("operation.lock",):
                continue
            rows.append({"path": path.relative_to(root).as_posix(), **identity(path)})
    return rows
def resources(work):
    result = {"host": platform.node(), "platform": platform.platform(), "python": sys.version,
              "pid": os.getpid(), "work": str(work)}
    s = os.statvfs(work)
    result["filesystem"] = {"available_bytes": s.f_bavail*s.f_frsize, "free_bytes": s.f_bfree*s.f_frsize}
    for name in ("memory.current", "memory.max", "memory.events", "memory.stat"):
        path = P("/sys/fs/cgroup") / name
        if path.is_file():
            result[name] = path.read_text()[:20000]
    try:
        result["proc_self"] = os.readlink("/proc/self")
        result["boot_id"] = P("/proc/sys/kernel/random/boot_id").read_text().strip()
    except OSError:
        pass
    return result
def load_bundle(supplied, work, spec):
    url, total, expected = spec["url"], spec["bytes"], spec["sha256"]
    saved = work / "source-bundle.json"
    if supplied:
        raw = regular(P(supplied).resolve(), total)
    elif saved.exists():
        raw = regular(saved, total)
    else:
        # Public immutable Git object only; no auth token or alternate provider.
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
                                                       "User-Agent": "Econdb-original-receiving"})
        with urllib.request.urlopen(request, timeout=90) as response:
            need(response.status == 200, "Public source did not return HTTP 200")
            body = response.read(2 * total + 1024 * 1024 + 1)
        need(len(body) <= 2 * total + 1024 * 1024, "Public Git source response exceeds bound")
        payload = json.loads(body)
        need(payload.get("sha") == url.rsplit("/", 1)[-1] and
             payload.get("encoding") == "base64", "Unexpected Git object")
        raw = base64.b64decode("".join(payload["content"].split()), validate=True)
    need(len(raw) == total and digest(raw) == expected, "Complete public source hash differs")
    packet = json.loads(raw.decode("utf-8", errors="strict"))
    need(packet.get("schema") == "commons.source-bundle/v1", "Unexpected source schema")
    files = packet["files"]
    need(len(files) == spec["members"] and sum(f["bytes"] for f in files) == spec["source_bytes"], "Complete source inventory differs")
    seen = set()
    for row in files:
        name = row["path"]
        parts = pathlib.PurePosixPath(name).parts
        need(name and not name.startswith("/") and "\\" not in name and
             all(x not in ("", ".", "..") for x in name.split("/")) and name not in seen,
             "Unsafe or duplicate source member")
        need(row["encoding"] == "utf-8", "Source member encoding changed")
        b = row["content"].encode("utf-8")
        need(len(b) == row["bytes"] and digest(b) == row["sha256"], "Member hash differs: " + name)
        git_sha = hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()
        need(git_sha == row["git_blob_sha"], "Original Git blob identity differs: " + name)
        seen.add(name)
    atomic(saved, raw, identical=True)
    for row in files:
        target = work / "checkout" / row["path"]
        atomic(target, row["content"].encode(), identical=True)
    atomic(work / "source-received.json", encode({"operation": OPERATION, "source_url": url,
        "bytes": total, "sha256": expected, "members": spec["members"], "source_bytes": spec["source_bytes"],
        "files": [{k: r[k] for k in ("path", "bytes", "sha256", "git_blob_sha")} for r in files]}), identical=True)
    return packet
def run(args, work, name, env):
    attempt = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    logs = work / "process-logs"
    directory(logs)
    out, err = logs/(name+"-"+attempt+".stdout"), logs/(name+"-"+attempt+".stderr")
    emit("PROCESS_START", name=name, argv=args, stdout=str(out), stderr=str(err))
    # The one receiving lease is inherited: a lost parent cannot admit a second worker
    # while this original child or its browser is still running.
    with out.open("xb") as stdout, err.open("xb") as stderr:
        process = subprocess.Popen(args, cwd=work, env=env, stdout=stdout, stderr=stderr,
                                   pass_fds=(LEASE_FD,))
        atomic(logs/(name+"-"+attempt+".process.json"), encode({"operation": OPERATION,
              "pid": process.pid, "parent_pid": os.getpid(), "started_at": now(), "argv": args}))
        code = process.wait()
        stdout.flush()
        stderr.flush()
        os.fsync(stdout.fileno())
        os.fsync(stderr.fileno())
    record = {"name": name, "exit": code, "stdout": str(out), "stderr": str(err), "finished_at": now()}
    atomic(logs/(name+"-"+attempt+".result.json"), encode(record))
    emit("PROCESS_RETURN", **record)
    need(code == 0, "Original "+name+" step failed; preserve outputs and read "+str(err))
def make_archive(work):
    destination = work / "delivery"
    directory(destination)
    manifest_path = destination / "receiving-files.json"
    archive = destination / "Econdb_Original_Receiving.zip"
    if archive.exists():
        receipt_path = destination / "archive.json"
        if receipt_path.exists():
            receipt = json.loads(regular(receipt_path))
            need(identity(archive) == {"bytes": receipt["bytes"], "sha256": receipt["sha256"]}, "Saved archive changed")
            return receipt
        # Rename may have completed before the small receipt write. Reconcile the
        # exact retained manifest and every ZIP member; do not generate another ZIP.
        original_manifest = regular(manifest_path, 64*1024*1024)
        retained = json.loads(original_manifest)
        need(retained.get("operation") == OPERATION and isinstance(retained.get("files"), list),
             "Archive has no original complete member manifest")
        with zipfile.ZipFile(archive) as received:
            names = received.namelist()
            expected = {"receiving-files.json"} | {r["path"] for r in retained["files"]}
            need(len(names) == len(expected) and set(names) == expected and
                 received.read("receiving-files.json") == original_manifest,
                 "Existing archive inventory or original manifest differs")
            for row in retained["files"]:
                need(not row["path"].startswith("/") and
                     all(p not in ("", ".", "..") for p in row["path"].split("/")),
                     "Unsafe archived original member")
                h, count = hashlib.sha256(), 0
                with received.open(row["path"]) as stream:
                    while block := stream.read(1024*1024):
                        count += len(block)
                        h.update(block)
                need(count == row["bytes"] and h.hexdigest() == row["sha256"],
                     "Existing complete archive member differs")
        receipt = {"operation": OPERATION, "path": str(archive), **identity(archive),
                   "members": len(expected), "reconciled_existing_archive": True,
                   "visual_review": "REQUIRED; open actual images and attachments before readiness"}
        atomic(receipt_path, encode(receipt))
        return receipt
    files = inventory(work, excluded=("delivery", "tmp"))
    manifest = {"operation": OPERATION, "state": "NATIVE_AND_BROWSER_CAPTURED_VISUAL_REVIEW_REQUIRED",
                "created_at": now(), "files": files}
    atomic(manifest_path, encode(manifest))
    temporary = destination / "Econdb_Original_Receiving.zip.writing"
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as target:
        target.writestr("receiving-files.json", encode(manifest))
        for row in files:
            source = work / row["path"]
            need(identity(source) == {"bytes": row["bytes"], "sha256": row["sha256"]}, "Original output changed before archive")
            target.write(source, row["path"])
    # Read every archived byte and compare it with the original member inventory.
    with zipfile.ZipFile(temporary) as received:
        need(set(received.namelist()) == {"receiving-files.json"} | {r["path"] for r in files}, "Archive inventory differs")
        for row in files:
            h = hashlib.sha256()
            count = 0
            with received.open(row["path"]) as stream:
                while block := stream.read(1024 * 1024):
                    count += len(block)
                    h.update(block)
            need(count == row["bytes"] and h.hexdigest() == row["sha256"], "Archived member differs")
    with temporary.open("rb") as stream:
        os.fsync(stream.fileno())
    os.replace(temporary, archive)
    fsync_dir(destination)
    receipt = {"operation": OPERATION, "path": str(archive), **identity(archive), "members": len(files)+1,
               "visual_review": "REQUIRED; open actual images and attachments before readiness"}
    atomic(destination/"archive.json", encode(receipt))
    return receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True, help="The one private original operation directory; same path on resume")
    parser.add_argument("--node", required=True, help="Existing absolute Node 22+ executable")
    parser.add_argument("--playwright", required=True, help="Existing absolute Playwright index.js module")
    parser.add_argument("--chromium", required=True, help="Existing absolute Chromium executable")
    parser.add_argument("--source-spec", help="Optional retained public merchant manifest specification for an unstarted revised source edition")
    parser.add_argument("--project-browser-hook", help="Optional exact application-owned standalone project UI course; no new runtime")
    parser.add_argument("--source-bundle", help="Optional exact already-received public94 JSON; no network needed")
    args = parser.parse_args()
    need(sys.platform.startswith("linux"), "Existing Linux host and flock are required")
    os.umask(0o077)
    work = P(args.work).absolute()
    need(work == work.resolve(), "Operation path must not traverse symlinks")
    directory(work)
    need((work/"receiving-binding.json").is_file() or
         all(p.name == "operation.lock" for p in work.iterdir()),
         "Unbound operation directory is not empty; preserve it")
    lock_fd = os.open(work/"operation.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    need(stat.S_ISREG(os.fstat(lock_fd).st_mode), "Original lease must be a regular file")
    lock = os.fdopen(lock_fd, "a+b")
    global LEASE_FD
    LEASE_FD = lock.fileno()
    fcntl.flock(LEASE_FD, fcntl.LOCK_EX | fcntl.LOCK_NB)
    source = P(__file__).resolve().parent
    runtime = {k: str(P(getattr(args, k)).resolve()) for k in ("node", "playwright", "chromium")}
    for key, path in runtime.items():
        need(P(path).is_file(), "Existing runtime input missing: "+key)
    for key in ("node", "chromium"):
        need(os.access(runtime[key], os.X_OK), "Runtime is not executable: "+key)
    need(shutil.which("flock") is not None, "Existing util-linux flock is required")
    # An orphan Chromium can outlive its Playwright parent. Its owned profile path,
    # not PID reuse, establishes this preflight conflict; no process is killed.
    for proc in P("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            cmd = (proc/"cmdline").read_bytes().split(b"\0")
            if any(arg.startswith(b"--user-data-dir=") and
                   str(work).encode()+b"/" in arg for arg in cmd):
                raise RuntimeError("Original browser profile is still active; reconcile procfs "+proc.name)
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            continue
    version = subprocess.check_output([runtime["node"], "--version"], text=True).strip()
    need(int(version.lstrip("v").split(".")[0]) >= 22, "Node 22 or newer is required")
    program = []
    for name in FILES:
        body = regular(source/name, 1024*1024)
        program.append({"path": name, "bytes": len(body), "sha256": digest(body)})
    spec = {"url": URL, "bytes": BUNDLE_BYTES, "sha256": BUNDLE_SHA,
            "members": 94, "source_bytes": SOURCE_BYTES}
    if args.source_spec:
        spec = json.loads(regular(P(args.source_spec).resolve(), 16384))
    need(set(spec) == {"url", "bytes", "sha256", "members", "source_bytes"} and
         re.fullmatch(r"https://api\.github\.com/repos/woahwhattheheck/tjlabs-stellar-merchant-workspace/git/blobs/[a-f0-9]{40}", spec["url"]) and
         re.fullmatch(r"[a-f0-9]{64}", spec["sha256"]) and
         all(type(spec[k]) is int and spec[k] > 0 for k in ("bytes", "members", "source_bytes")) and
         spec["bytes"] <= 16*1024*1024 and spec["members"] <= 512,
         "Invalid immutable public merchant source specification")
    hook = None
    if args.project_browser_hook:
        body = regular(P(args.project_browser_hook).resolve(), 512*1024)
        hook = {"path": "project-browser-hook.mjs", "bytes": len(body), "sha256": digest(body)}
        program.append(hook)
    binding = {"operation": OPERATION, "source_specification": spec, "program": program, "runtime": runtime}
    atomic(work/"receiving-binding.json", encode(binding), identical=True,
           staging_parent=work.parent)
    for row in program:
        original = P(args.project_browser_hook).resolve() if hook and row["path"] == hook["path"] else source/row["path"]
        atomic(work/"receiving-program"/row["path"], regular(original), identical=True)
    resources_before = resources(work)
    atomic(work/"host-before.json", encode(resources_before))
    emit("RECEIVING_ADMITTED", **resources_before, node=version)
    load_bundle(args.source_bundle, work, spec)
    directory(work/"tmp")
    env = {**os.environ, "TMPDIR": str(work/"tmp"), "PATH": str(P(runtime["node"]).parent)+os.pathsep+os.environ.get("PATH",""),
           "ECONDB_RECEIVING_LEASE_FD": str(LEASE_FD), "ECONDB_RECEIVING_PYTHON": sys.executable}
    # This course does not read or use private Econdb/payment/mail credentials.
    env.pop("ECONDB_TOKEN", None)
    run([runtime["node"], str(work/"receiving-program/receive-econdb-native.mjs"), str(work)], work, "native", env)
    run([runtime["node"], str(work/"receiving-program/receive-econdb-browser.mjs"), str(work),
         runtime["playwright"], runtime["chromium"], *([str(work/"receiving-program"/hook["path"])] if hook else [])], work, "browser", env)
    browser = json.loads(regular(work/"browser-result.json"))
    need(browser["chromium_closed"] and browser["state"] == "CAPTURED_REQUIRES_PIXEL_REVIEW",
         "Browser has not closed with retained original outputs")
    atomic(work/"host-after.json", encode(resources(work)))
    receipt = make_archive(work)
    emit("ORIGINAL_RECEIVING_RETAINED", archive=receipt, browser_views=len(browser["views"]),
         next="Open the actual views and all outgoing files. Return that concrete review to the existing case; no new host request.")
    fcntl.flock(LEASE_FD, fcntl.LOCK_UN)
    lock.close()
if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("ORIGINAL_RECEIVING_INCOMPLETE", error=type(error).__name__, message=str(error),
             instruction="Preserve this exact operation directory and logs; reconcile the original lease/state before the same command resumes.")
        raise
