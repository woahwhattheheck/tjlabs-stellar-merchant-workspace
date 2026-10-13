#!/usr/bin/env python3
"""Continue the original completed 6000-row fixture through saved pipeline commissioning."""
from __future__ import annotations
import argparse, base64, ctypes, errno, fcntl, hashlib, importlib.util, json, os
from pathlib import Path
import pty, select, shutil, signal, sqlite3, stat, subprocess, sys, tempfile, time

HERE=Path(__file__).resolve().parent
RUNTIME=HERE.parents[1]
SOURCE_ROOT=HERE.parents[2]
OPERATION="SCF-JOB-RESULT-PACKAGES-0B8D-20261012"
PHASE="pipeline-commissioning"
JOB="pipeline-output-files:2026.10"
ASSET="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"
KEYS=("SF36_CONSENT_KEY_B64","SF36_AUDIT_KEY_B64","SF36_OPERATOR_KEY_B64")

def need(value,message):
    if not value:raise RuntimeError(message)

def encoded(value):
    return (json.dumps(value,ensure_ascii=True,sort_keys=True,separators=(",",":"))+"\n").encode()

def read(path,maximum=4*1024*1024):
    path=Path(path);info=path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and not info.st_mode&0o077
         and info.st_size<=maximum,"Retain the original private regular file: "+str(path))
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd);data=b""
        while len(data)<=maximum:
            part=os.read(fd,min(1024*1024,maximum+1-len(data)))
            if not part:break
            data+=part
        after=os.fstat(fd)
        need(len(data)<=maximum and len(data)==before.st_size and
             (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==
             (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),
             "The original selected file changed")
        return data
    finally:os.close(fd)

def sync_directory(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)

def immutable(path,value):
    path=Path(path)
    if path.exists():
        need(read(path,max(len(value),4*1024*1024))==value,"Original commissioning file changed: "+str(path));return
    fd,tmp=tempfile.mkstemp(prefix=".commissioning-",dir=path.parent)
    try:
        with os.fdopen(fd,"wb") as out:
            out.write(value);out.flush();os.fsync(out.fileno())
        try:os.link(tmp,path)
        except FileExistsError:need(read(path,max(len(value),4*1024*1024))==value,"Original commissioning publish changed")
        sync_directory(path.parent)
    finally:os.unlink(tmp)

def proc_identity(path):
    try:
        raw=(path/"stat").read_text();tail=raw[raw.rfind(")")+2:].split()
        status=(path/"status").read_text()
        ns=next(line.split()[1:] for line in status.splitlines() if line.startswith("NSpid:"))
        return {"proc_pid":int(raw.split("(",1)[0]),"parent":int(tail[1]),
                "start":int(tail[19]),"namespace":(path/"ns/pid").readlink().as_posix(),
                "nspid":[int(x) for x in ns]}
    except (FileNotFoundError,ProcessLookupError):return None

def original_children(self_identity):
    """Only kernel children of this dedicated controller, translated to its PID namespace."""
    result=[]
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():continue
        try:
            raw=(path/"stat").read_text();tail=raw[raw.rfind(")")+2:].split()
            if int(tail[1])!=self_identity["proc_pid"]:continue
            selected=proc_identity(path)
        except (PermissionError,FileNotFoundError,ProcessLookupError):continue
        if selected and selected["parent"]==self_identity["proc_pid"]:
            depth=len(self_identity["nspid"])
            need(len(selected["nspid"])>=depth,"Owned child namespace is unavailable")
            selected["pid"]=selected["nspid"][depth-1]
            result.append(selected)
    return result

def signal_child(selected,kind,self_identity):
    # An unreaped exited child remains reserved. Running descendants that
    # detach their process group are still direct children after adoption.
    pid=selected["pid"]
    try:fd=os.pidfd_open(pid,0)
    except ProcessLookupError:return
    try:
        current=proc_identity(Path("/proc")/str(selected["proc_pid"]))
        if current is None:return
        need(current["parent"]==self_identity["proc_pid"] and current["start"]==selected["start"]
             and current["namespace"]==selected["namespace"],"Original child identity changed")
        try:signal.pidfd_send_signal(fd,kind)
        except ProcessLookupError:pass
    finally:os.close(fd)

def close_owned(self_identity):
    """Subreaper closure ends only after the kernel reports no owned children."""
    started=time.monotonic();terms=set();killed=set()
    while True:
        try:
            ended=os.waitid(os.P_ALL,0,os.WEXITED|os.WNOHANG|os.WNOWAIT)
        except ChildProcessError:return {"state":"ECHILD","terminated":len(terms),"killed":len(killed)}
        if ended is not None:
            os.waitpid(ended.si_pid,0);continue
        children=original_children(self_identity)
        kind=signal.SIGTERM if time.monotonic()-started<30 else signal.SIGKILL
        for child in children:
            key=(child["proc_pid"],child["start"])
            if kind==signal.SIGTERM and key in terms:continue
            signal_child(child,kind,self_identity)
            (terms if kind==signal.SIGTERM else killed).add(key)
        time.sleep(0.05)

def main():
    os.umask(0o077)
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--checkout",required=True,type=Path)
    p.add_argument("--node",required=True,type=Path)
    p.add_argument("--browser-module",required=True,type=Path)
    p.add_argument("--browser-executable",required=True,type=Path)
    p.add_argument("--timeout",type=int,default=1800)
    args=p.parse_args()
    need(args.checkout.is_absolute(),"Use the original completed checkout path")
    checkout=args.checkout.resolve(strict=True);old_bytes=read(checkout)
    old=json.loads(old_bytes)
    need(old.get("operation")==OPERATION and old.get("result")=="PASS" and
         old.get("outputFiles",{}).get("jobId")=="output-files:2026.10" and
         old.get("inputFiles",{}).get("records")==6000,
         "Complete and retain the original paid 6000-row output course first")
    old_fixture=Path(old["fixtureDirectory"]).resolve(strict=True)
    need(checkout==old_fixture/"native-complete.json","Use the original complete checkout identity")
    need(args.timeout>=600,"Allow the complete original SQL, Request and browser receiving")
    for path in (args.node,args.browser_module,args.browser_executable):
        need(path.is_absolute() and path.resolve(strict=True).is_file(),"Use actual installed runtime paths")
    original_lock=os.open(old_fixture/"driver.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    fcntl.flock(original_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    fixture=old_fixture/PHASE
    fixture.mkdir(mode=0o700,exist_ok=True)
    mode=fixture.lstat()
    need(stat.S_ISDIR(mode.st_mode) and not mode.st_mode&0o077 and mode.st_uid==os.getuid()
         and fixture.resolve()==fixture,"Use the original private following phase")
    marker={"schema":"stellar-forge.preparation-commissioning-native-fixture.v1","operation":OPERATION,"phase":PHASE,
      "retainedDirectory":str(old_fixture.parent),"originalFixtureDirectory":str(old_fixture),
      "originalCheckoutSha256":hashlib.sha256(old_bytes).hexdigest(),"fixtureDirectory":str(fixture),
      "runtimeDirectory":str(RUNTIME),"browserModule":str(args.browser_module.resolve()),
      "browserExecutable":str(args.browser_executable.resolve())}
    immutable(fixture/"fixture.json",encoded(marker))
    key_path=fixture/"fixture-keys.json"
    if not key_path.exists():
        need(not (fixture/"ledger.sqlite").exists(),"Retain the original following-phase keys with its ledger")
        immutable(key_path,encoded({k:base64.b64encode(os.urandom(32)).decode() for k in KEYS}))
    keys=json.loads(read(key_path,16384))
    need(set(keys)==set(KEYS) and all(len(base64.b64decode(keys[k],validate=True))==32 for k in KEYS),
         "Original local native policy keys are required")
    policy={"schema":"stellar-spend-governor/v1","assets":[{"network":"stellar:testnet","asset":ASSET,
      **{k:"10000" for k in ("max_single","max_total","max_per_utc_day","max_per_actor_utc_day","max_per_service_utc_day")}}]}
    immutable(fixture/"policy.json",encoded(policy))
    # Reuse the completed native fixture's exact local certificate and key.
    tls=fixture/"tls";tls.mkdir(mode=0o700,exist_ok=True)
    for name in ("tls.key","tls.pem"):immutable(tls/name,read(old_fixture/"tls"/name,16384))
    env=dict(os.environ);env.update(keys)
    env.update(NODE_EXTRA_CA_CERTS=str(tls/"tls.pem"),SF_JOBS_CHECKOUT_FIXTURE_DIR=str(fixture),
               SF_JOBS_CHECKOUT_PYTHON=sys.executable,STARFORGE_PYTHON=sys.executable,
               SF30_PREPARATION_PYTHON=sys.executable,PYTHONDONTWRITEBYTECODE="1")
    for key in ("NODE_TLS_REJECT_UNAUTHORIZED","SF_JOBS_CHECKOUT_PROXY","SF81_APPROVAL_SOCKET","SF81_APPROVAL_TOKEN"):
        env.pop(key,None)
    libc=ctypes.CDLL(None,use_errno=True)
    need(libc.prctl(36,1,0,0,0)==0,"Use the original dedicated Linux child owner")
    self_identity=proc_identity(Path("/proc/self"));need(self_identity is not None,"Resolve the actual mounted process identity")
    try:os.waitid(os.P_ALL,0,os.WEXITED|os.WNOHANG|os.WNOWAIT)
    except ChildProcessError:pass
    else:raise RuntimeError("The dedicated continuation already owns another process")
    cancelled=False
    def stop(_signum,_frame):
        nonlocal cancelled
        cancelled=True
    previous={s:signal.signal(s,stop) for s in (signal.SIGINT,signal.SIGTERM)}
    log=fixture/("native-"+str(time.time_ns())+".log")
    transcript=bytearray();exit_code=None;closure=None
    pid,descriptor=pty.fork()
    if pid==0:os.execve(str(args.node),[str(args.node),str(HERE/"commissioning-native.mjs")],env)
    try:
        deadline=time.monotonic()+args.timeout
        while True:
            if cancelled or time.monotonic()>deadline:break
            ready,_,_=select.select([descriptor],[],[],0.1)
            if ready:
                try:chunk=os.read(descriptor,65536)
                except OSError as error:
                    if error.errno!=errno.EIO:raise
                    chunk=b""
                if chunk:
                    transcript.extend(chunk)
                    need(len(transcript)<=4*1024*1024,"The original native transcript exceeds its allowance")
                    sys.stdout.buffer.write(chunk);sys.stdout.buffer.flush()
            selected=os.waitid(os.P_PID,pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
            if selected is not None:
                _,status=os.waitpid(pid,0);exit_code=os.waitstatus_to_exitcode(status);break
    finally:
        try:
            closure=close_owned(self_identity)
        finally:
            os.close(descriptor);immutable(log,bytes(transcript))
            for signum,handler in previous.items():signal.signal(signum,handler)
    need(not cancelled and exit_code==0,"Continue the original retained native phase after inspecting its transcript")
    result=json.loads(read(fixture/"commissioning-result.json",16*1024*1024))
    need(result.get("result")=="PASS" and result.get("operation")==OPERATION and result.get("phase")==PHASE,
         "Complete the original nine-tool, Request and browser course")
    need(read(checkout)==old_bytes,"The completed original paid checkout changed")
    from urllib.parse import quote
    request="job-checkout:"+hashlib.sha256(json.dumps(["paid-job-checkout",
      "https://jobs-merchant.example/jobs/"+quote(JOB,safe="")],separators=(",",":")).encode()).hexdigest()
    with sqlite3.connect(fixture/"ledger.sqlite") as db:
        rows=db.execute("SELECT request_id,amount,state FROM reservations ORDER BY request_id").fetchall()
        need(rows==[(request,"10000","reserved")],"The original following-phase reservation changed")
    sys.path.insert(0,str(SOURCE_ROOT/"sf36-spend-governor"))
    from governor import Governor
    governor=Governor(fixture/"ledger.sqlite",policy,*(base64.b64decode(keys[k]) for k in KEYS))
    try:
        audit=governor.audit()
        need(audit["outcome"]=="JOURNAL_CONSISTENT" and audit["rows"]==1,"The local native ledger audit changed")
    finally:governor.close()
    result.update(nativeClosure=closure,nativeLog=str(log),operatorLedger={"reservations":1,"audit":audit["outcome"]})
    # The current complete source result is retained as a distinct edition,
    # leaving all earlier attempts, ledgers, paid records and browser receipts.
    complete=fixture/("commissioning-complete-"+hashlib.sha256(encoded(result)).hexdigest()+".json")
    immutable(complete,encoded(result))
    print(json.dumps({"operation":OPERATION,"phase":PHASE,"result":"PASS","path":str(complete),
      "sha256":hashlib.sha256(read(complete,16*1024*1024)).hexdigest(),"nativeClosure":closure}),flush=True)
    os.close(original_lock)
    return 0

if __name__=="__main__":
    raise SystemExit(main())
