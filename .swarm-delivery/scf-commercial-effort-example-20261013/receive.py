#!/usr/bin/env python3
"""Open the complete original commercial delivery-effort/economics example.
Usage: python3 receive.py source-carrier.json /ABS/private/commercial-effort
Uses installed Python, Node, Playwright and Chromium; installs no packages.
The complete retained operator-course directory contains the actual case,
selected Installation ZIP, original requests, received case, reports and images.
"""
import base64
import fcntl
import gzip
import hashlib
import json
import os
import pathlib
from pathlib import Path, PurePosixPath
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

OPERATION = "SCF-COMMERCIAL-EFFORT-EXAMPLE-A238-20261013"
EXPECTED = "f0c5db28e3037e286adb406477360c9a1e75d31ff97b50ac08fd4e5558280628"
EXPECTED_FILES = 1582
PROBE = "const fs=require('node:fs'),path=require('node:path');\nconst roots=[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,process.env.CODEX_PRIMARY_RUNTIME_ROOT,\n'/usr/local/lib/node_modules','/opt/node_modules','/workspace/node_modules',...(process.env.NODE_PATH||'').split(path.delimiter)].filter(Boolean);\nlet selected;\nfor(const name of ['playwright','playwright-core']){\n try{\n  const resolved=require.resolve(name,{paths:roots}),module=require(resolved);\n  if(!module.chromium)continue;\n  const esm=path.join(path.dirname(resolved),'index.mjs');\n  const candidates=[process.env.CHROMIUM_EXECUTABLE_PATH,process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,\n   module.chromium.executablePath(),'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/opt/google/chrome/chrome'].filter(Boolean);\n  const chromium=candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());\n  if(chromium){selected={node:process.execPath,playwright:fs.existsSync(esm)?esm:resolved,chromium};break;}\n }catch(error){}\n}\nif(!selected)throw new Error('The complete receiving course requires an installed Playwright module and Chromium executable. Supply their existing paths in the documented example command.');\nprocess.stdout.write(JSON.stringify(selected)+'\\n');"
MAX_CARRIER = 32 * 1024 * 1024
MAX_SOURCE = 96 * 1024 * 1024


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def directory(path):
    if not path.is_absolute() or path == Path("/") or path.resolve() != path:
        raise ValueError("Use an absolute private directory without redirected parents.")
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077:
        raise ValueError("Use an owned private example directory.")
    return path


def read(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
            raise ValueError("Select a complete regular file within the declared limit.")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            raw = handle.read(maximum + 1)
        after = os.fstat(fd)
        named = path.lstat()
        if len(raw) > maximum or any(getattr(before, key) != getattr(after, key)
                for key in ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")) or (
                before.st_dev, before.st_ino) != (named.st_dev, named.st_ino):
            raise ValueError("The selected complete file changed during reading.")
        return raw
    finally:
        os.close(fd)


def retain(path, raw):
    directory(path.parent)
    try:
        previous = read(path, max(len(raw), 1))
    except FileNotFoundError:
        previous = None
    if previous is not None:
        if previous != raw:
            raise ValueError("The retained original changed: " + str(path))
        return
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        # The entire publication belongs to the retained operation's flock.
        if path.exists() or path.is_symlink():
            if read(path, max(len(raw), 1)) != raw:
                raise ValueError("Another original won publication.")
            os.unlink(temporary)
        else:
            os.replace(temporary, path)
        parent = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


# Maintained Commons owned-group helper, retained unchanged from
# .swarm-delivery/arc3-a238-original-operations-20261013/perception_continuation.py
# Git blob fb1cfc9316abdbdccb4a946af01dd8a37d14199e.
def proc_stat(root):
 raw=(root/"stat").read_text();tail=raw.rsplit(")",1)[1].split()
 return {"host_pid":int(raw.split("(",1)[0]),"state":tail[0],"host_parent_pid":int(tail[1]),"host_process_group":int(tail[2]),"host_session":int(tail[3]),"start_ticks":tail[19]}
def proc_identity(root,stat=None):
 try:
  item=proc_stat(root) if stat is None else dict(stat)
  status=(root/"status").read_text()
  for name in ("NSpid","NSpgid","NSsid"):
   values=next((line.split(":",1)[1].split() for line in status.splitlines() if line.startswith(name+":")),None)
   item[name]=[int(value) for value in values] if values is not None else None
  try:item["pid_namespace"]=os.readlink(root/"ns/pid")
  except OSError as exc:
   if item["state"] not in ("Z","X"):raise
   item["pid_namespace"]=None;item["namespace_error"]={"type":type(exc).__name__,"errno":exc.errno}
  item["boot_id"]=pathlib.Path("/proc/sys/kernel/random/boot_id").read_text().strip()
  current=proc_stat(root)
  if any(current[key]!=item[key] for key in ("host_pid","start_ticks")):raise RuntimeError("Process identity changed during observation")
  item["state"]=current["state"]
  return item
 except FileNotFoundError:return None
def process_identity(host_pid):
 return proc_identity(pathlib.Path("/proc")/str(host_pid))
def observer_identity():
 item=proc_identity(pathlib.Path("/proc/self"))
 if not item or not item["NSpid"] or item["NSpid"][0]!=item["host_pid"] or item["NSpid"][-1]!=os.getpid() or not item["pid_namespace"]:raise RuntimeError("Caller host/local PID mapping is unavailable")
 item["local_pid"]=os.getpid();item["local_process_group"]=os.getpgrp();item["local_session"]=os.getsid(0)
 return item
def same_process(a,b):
 if not a or not b or any(a.get(key)!=b.get(key) for key in ("host_pid","start_ticks","NSpid","boot_id")):return False
 return a.get("pid_namespace")==b.get("pid_namespace") or (b.get("pid_namespace") is None and b.get("state") in ("Z","X"))
def local_pid_for(item,observer):
 if not item or item.get("boot_id")!=observer["boot_id"] or item.get("pid_namespace")!=observer["pid_namespace"]:return None
 ids=item.get("NSpid")
 if not ids or len(ids)!=len(observer["NSpid"]) or ids[0]!=item["host_pid"]:return None
 return ids[-1]
def group_members(identity):
 members=[];denied=[];observer=observer_identity()
 if identity["boot_id"]!=observer["boot_id"] or identity["pid_namespace"]!=observer["pid_namespace"]:raise RuntimeError("Owned child namespace differs")
 for root in pathlib.Path("/proc").iterdir():
  if not root.name.isdigit():continue
  try:
   stat=proc_stat(root)
   if stat["host_process_group"]!=identity["host_process_group"]:continue
   if stat["host_session"]!=identity["host_session"]:raise RuntimeError("Original process group session differs")
   item=proc_identity(root,stat)
   if item is not None:
    item["local_pid"]=local_pid_for(item,observer);members.append(item)
  except FileNotFoundError:continue
  except (PermissionError,ProcessLookupError) as exc:denied.append({"host_pid":int(root.name),"error":type(exc).__name__})
 return {"members":sorted(members,key=lambda item:item["host_pid"]),"denied":denied}
def child_identity(child):
 observer=observer_identity();lookup={"method":"parent_task_children","parent_host_pid":observer["host_pid"]}
 children_path=pathlib.Path("/proc/self/task")/str(observer["host_pid"])/"children"
 try:candidates=[int(value) for value in children_path.read_text().split()]
 except (FileNotFoundError,PermissionError) as exc:
  lookup={"method":"parent_scoped_host_proc_scan","parent_host_pid":observer["host_pid"],"children_error":{"type":type(exc).__name__,"errno":exc.errno}}
  candidates=[int(root.name) for root in pathlib.Path("/proc").iterdir() if root.name.isdigit()]
 matches=[];denied=[]
 for host_pid in candidates:
  root=pathlib.Path("/proc")/str(host_pid)
  try:
   stat=proc_stat(root)
   if stat["host_parent_pid"]!=observer["host_pid"]:continue
   item=proc_identity(root,stat)
   if item is not None and local_pid_for(item,observer)==child.pid:matches.append(item)
  except (FileNotFoundError,ProcessLookupError):continue
  except PermissionError as exc:denied.append({"host_pid":host_pid,"error":type(exc).__name__})
 if not same_process(observer,observer_identity()):raise RuntimeError("Original caller identity changed during child registration")
 if len(matches)!=1:raise RuntimeError("Original direct child host/local identity is unavailable or ambiguous")
 identity=matches[0]
 if identity["host_process_group"]!=identity["host_pid"] or identity["host_session"]!=identity["host_pid"] or os.getpgid(child.pid)!=child.pid or os.getsid(child.pid)!=child.pid:raise RuntimeError("Original child does not own its isolated process group")
 if identity["NSpgid"]!=identity["NSpid"] or identity["NSsid"]!=identity["NSpid"]:raise RuntimeError("Original child group/session namespace mapping differs")
 identity.update(local_pid=child.pid,local_process_group=child.pid,local_session=child.pid,parent_identity=observer,lookup=lookup)
 identity["lookup"]["denied"]=denied
 return identity
def child_exit_without_reaping(child):
 observed=os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
 if observed is None:return None
 return observed.si_status if observed.si_code==os.CLD_EXITED else -observed.si_status
def wait_child_without_reaping(child,timeout):
 deadline=time.monotonic()+timeout
 while True:
  code=child_exit_without_reaping(child)
  if code is not None:return code
  if time.monotonic()>=deadline:raise subprocess.TimeoutExpired(child.args,timeout)
  time.sleep(.1)
def cleanup_direct_child(child,reason):
 receipt={"reason":reason,"scope":"direct child only; process-group identity unavailable","group_finished":None,"direct_child_reaped":False,"signals":[]}
 if child.returncode is None:
  code=child_exit_without_reaping(child)
  if code is None:
   child.terminate();receipt["signals"].append(int(signal.SIGTERM))
   try:child.wait(timeout=10)
   except subprocess.TimeoutExpired:
    child.kill();receipt["signals"].append(int(signal.SIGKILL));child.wait(timeout=10)
  else:child.wait(timeout=10)
 receipt["direct_child_reaped"]=True;receipt["direct_child_exit_code"]=child.returncode
 return receipt
def cleanup_child_group(child,identity,reason):
 receipt={"reason":reason,"child":identity,"scope":"original isolated process group; descendants that leave it are outside this scope","signals":[],"direct_child_reaped":False,"reaped_descendants":[]}
 def inspect():
  if child.returncode is not None:raise RuntimeError("Original group leader was already reaped")
  leader=process_identity(identity["host_pid"])
  if not same_process(identity,leader):raise RuntimeError("Original unreaped group leader identity changed")
  if leader["host_process_group"]!=identity["host_process_group"] or leader["host_session"]!=identity["host_session"]:raise RuntimeError("Original group leader changed its group/session")
  child_exit_without_reaping(child)
  observed=group_members(identity);receipt["last_observation"]=observed
  return observed["members"]
 def running(members):return [item for item in members if item["state"] not in ("Z","X")]
 def reap_descendants(members):
  observer=observer_identity()
  for item in members:
   if item["host_pid"]==identity["host_pid"] or item["state"] not in ("Z","X"):continue
   current=process_identity(item["host_pid"]);local_pid=local_pid_for(current,observer)
   if not same_process(item,current) or local_pid is None:continue
   try:
    waited,status=os.waitpid(local_pid,os.WNOHANG)
    if waited:receipt["reaped_descendants"].append({"host_pid":item["host_pid"],"local_pid":waited,"wait_status":status})
   except ChildProcessError:pass
 def send(sig):
  inspect()
  try:os.killpg(identity["local_process_group"],sig)
  except ProcessLookupError:return
  receipt["signals"].append(int(sig))
 members=inspect()
 if running(members) or receipt["last_observation"]["denied"]:
  send(signal.SIGTERM)
  deadline=time.monotonic()+10
  while time.monotonic()<deadline:
   members=inspect();reap_descendants(members)
   if not running(members) and not receipt["last_observation"]["denied"]:break
   time.sleep(.1)
  if running(inspect()) or receipt["last_observation"]["denied"]:send(signal.SIGKILL)
 deadline=time.monotonic()+10
 while True:
  members=inspect();reap_descendants(members)
  if not running(members):break
  if time.monotonic()>=deadline:raise RuntimeError("Original process group still has running members after termination")
  time.sleep(.1)
 receipt["exited_members_before_reap"]=members
 receipt["direct_child_exit_code"]=child.wait(timeout=10);receipt["direct_child_reaped"]=True
 final=group_members(identity);receipt["remaining_members"]=final["members"];receipt["visibility_errors"]=final["denied"]
 receipt["group_finished"]=not running(final["members"]) if not final["denied"] else None
 receipt["unreaped_exited_descendants"]=[item for item in final["members"] if item["state"] in ("Z","X")]
 if running(final["members"]):raise RuntimeError("Original process group still has visible running members")
 return receipt

class OwnedProcesses:
    def __init__(self, lock_fd):
        self.lock_fd, self.child = lock_fd, None
        self.previous = {}

    def __enter__(self):
        def cancel(signum, frame):
            signal.signal(signal.SIGINT, signal.SIG_IGN)
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            # Raise through run() so its original unreaped group is drained.
            raise InterruptedError("The original example owner requested signal " + str(signum))
        self.previous = {sig: signal.signal(sig, cancel) for sig in (signal.SIGINT, signal.SIGTERM)}
        return self

    def run(self, argv, cwd, output, error, timeout):
        stdout_fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            stderr_fd = os.open(error, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        except BaseException:
            os.close(stdout_fd)
            raise
        identity = None
        with os.fdopen(stdout_fd, "wb") as stdout, os.fdopen(stderr_fd, "wb") as stderr:
            self.child = subprocess.Popen(argv, cwd=cwd, stdout=stdout, stderr=stderr,
                start_new_session=True, pass_fds=(self.lock_fd,))
            try:
                identity = child_identity(self.child)
                retain(output.with_suffix(".owner.json"), encoded(identity))
                return wait_child_without_reaping(self.child, timeout)
            finally:
                try:
                    if identity is None:
                        receipt = cleanup_direct_child(self.child, "Child group registration did not complete.")
                        retain(output.with_suffix(".cleanup.json"), encoded(receipt))
                    else:
                        try:
                            receipt = cleanup_child_group(self.child, identity, "Original native example invocation finished.")
                        except BaseException as cleanup_error:
                            fallback = cleanup_direct_child(self.child, "Original group cleanup raised: " + str(cleanup_error))
                            retain(output.with_suffix(".cleanup.json"), encoded({
                                "group_error": str(cleanup_error), "direct_fallback": fallback}))
                            raise
                        retain(output.with_suffix(".cleanup.json"), encoded(receipt))
                        if receipt.get("group_finished") is not True:
                            raise RuntimeError("The owned process group's final membership requires reconciliation.")
                finally:
                    self.child = None

    def __exit__(self, kind, value, traceback):
        for sig, handler in self.previous.items():
            signal.signal(sig, handler)


def attempt_paths(root, name):
    attempt = 1
    while any((root / (name + "-" + str(attempt) + suffix)).exists()
              for suffix in (".stdout", ".stderr")):
        attempt += 1
    return tuple(root / (name + "-" + str(attempt) + suffix) for suffix in (".stdout", ".stderr"))


def verify_outputs(result):
    if result.get("operation") != OPERATION or result.get("source_sha256") != EXPECTED or result.get("state") != "OPERATED":
        raise ValueError("The retained result belongs to another original example.")
    for item in result["screenshots"]:
        raw = read(Path(item["path"]), item["bytes"])
        if len(raw) != item["bytes"] or digest(raw) != item["sha256"]:
            raise ValueError("An actual retained screenshot changed.")
    raw = read(Path(result["original_result"]["path"]), MAX_SOURCE)
    if len(raw) != result["original_result"]["bytes"] or digest(raw) != result["original_result"]["sha256"]:
        raise ValueError("The complete operated result changed.")


def operate(carrier_path, root, lock_fd):
    raw = read(carrier_path, MAX_CARRIER)
    if digest(raw) != EXPECTED:
        raise ValueError("Select the complete pinned application carrier.")
    carrier = json.loads(raw)
    if carrier["schema"] != "commons.gzip-source-carrier.v1" or carrier["source_files"] != EXPECTED_FILES:
        raise ValueError("Use the selected complete application distribution.")
    compressed = base64.b64decode(carrier["payload_base64"], validate=True)
    if len(compressed) != carrier["gzip_bytes"] or digest(compressed) != carrier["gzip_sha256"]:
        raise ValueError("The compressed source changed.")
    if not 0 < carrier["uncompressed_bytes"] <= MAX_SOURCE:
        raise ValueError("The complete source exceeds its declared bound.")
    decoded = gzip.decompress(compressed)
    if len(decoded) != carrier["uncompressed_bytes"] or digest(decoded) != carrier["sha256"]:
        raise ValueError("The complete original source changed.")
    bank = json.loads(decoded)
    if bank["schema"] != "commons.complete-runtime-source.v1" or len(bank["files"]) != EXPECTED_FILES:
        raise ValueError("Use the full original runtime source bank.")
    source = directory(root / "source")
    seen, total = set(), 0
    for item in bank["files"]:
        relative = PurePosixPath(item["path"])
        if relative.is_absolute() or ".." in relative.parts or str(relative) != item["path"] or item["path"] in seen:
            raise ValueError("The source contains a repeated or redirected member.")
        seen.add(item["path"])
        body = item["content"].encode("utf-8")
        if len(body) != item["bytes"] or digest(body) != item["sha256"]:
            raise ValueError("An original source member changed: " + item["path"])
        retain(source / Path(relative), body)
        total += len(body)
    if total != carrier["source_bytes"]:
        raise ValueError("The full source byte count differs.")
    retain(root / "source-carrier.json", raw)
    retain(root / "selected-source.json", encoded({"operation": OPERATION, "source_sha256": EXPECTED,
        "files": EXPECTED_FILES, "source_bytes": total}))
    done = root / "operated.json"
    if done.exists():
        result = json.loads(read(done, MAX_SOURCE))
        verify_outputs(result)
        print(json.dumps(result), flush=True)
        return
    node = os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    if not node or not Path(node).is_file():
        raise RuntimeError("Use the installed Node executable.")
    retain(root / "installed-browser.cjs", PROBE.encode())
    with OwnedProcesses(lock_fd) as processes:
        output, error = attempt_paths(root, "installed-browser")
        code = processes.run([node, str(root / "installed-browser.cjs")], source, output, error, 30)
        if code:
            raise RuntimeError(read(error, 1024 * 1024).decode(errors="replace"))
        runtime = json.loads(read(output, 1024 * 1024))
        retain(root / "installed-runtime.json", encoded(runtime))
        course = root / "operator-course"
        executable = source / "stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/effort-economics-example.mjs"
        argv = [runtime["node"], str(executable), "--out", str(course), "--merchant-port", "18776",
            "--operations-port", "18777", "--receive", "--playwright", runtime["playwright"],
            "--chromium", runtime["chromium"], "--python", sys.executable]
        retain(root / "native-request.json", encoded({"operation": OPERATION, "source_sha256": EXPECTED,
            "argv": argv, "cwd": str(source)}))
        output, error = attempt_paths(root, "operator-course")
        print(json.dumps({"operation": OPERATION, "state": "OPERATING", "directory": str(root),
            "files": EXPECTED_FILES, "source_bytes": total, "output": str(output)}), flush=True)
        code = processes.run(argv, source, output, error, 1200)
        if code:
            raise RuntimeError("Original course exit " + str(code) + ": " + read(error, 1024 * 1024).decode(errors="replace")[-6000:])
    result_path = course / "operated-result.json"
    original_raw = read(result_path, MAX_SOURCE)
    original = json.loads(original_raw)
    if original.get("state") != "OPERATED" or original.get("schema") != "stellar-forge.commercial-delivery-effort-internal-example.v1":
        raise ValueError("The original whole application course did not return its operated result.")
    final = {"operation": OPERATION, "state": "OPERATED", "directory": str(root),
        "source_sha256": EXPECTED, "files": EXPECTED_FILES, "source_bytes": total,
        "original_result": {"path": str(result_path), "bytes": len(original_raw), "sha256": digest(original_raw)},
        "screenshots": original["screenshots"], "installation": original["delivery"]["selected"],
        "assessment": original["receiving"]["savedAssessment"], "received": original["receiving"]["received"],
        "visual_inspection": "Open and inspect the actual retained images and operate the original application and complete exports."}
    verify_outputs(final)
    retain(done, encoded(final))
    print(json.dumps(final), flush=True)


def main():
    os.umask(0o077)
    if len(sys.argv) != 3:
        raise ValueError(__doc__)
    root = directory(Path(sys.argv[2]))
    lock_fd = os.open(root / ".receiving.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
    try:
        info = os.fstat(lock_fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o077 or info.st_nlink != 1:
            raise ValueError("Use the original owned private operation lock.")
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        operate(Path(sys.argv[1]).absolute(), root, lock_fd)
    finally:
        os.close(lock_fd)


if __name__ == "__main__":
    try:
        main()
    except BaseException as error:
        print(json.dumps({"operation": OPERATION, "state": "STOPPED", "error": str(error),
            "type": type(error).__name__}), flush=True)
        raise
