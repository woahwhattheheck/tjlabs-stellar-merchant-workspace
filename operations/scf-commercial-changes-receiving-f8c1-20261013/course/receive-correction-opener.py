#!/usr/bin/env python3
"""Exercise the shipped correction opener against its actual complete saved ZIP."""
from __future__ import annotations
import argparse,datetime,hashlib,json,os,signal,subprocess,sys,time,urllib.request,uuid
from pathlib import Path
sys.dont_write_bytecode=True

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def ident(path):
    h=hashlib.sha256();size=0
    with Path(path).open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):h.update(block);size+=len(block)
    return {"bytes":size,"sha256":h.hexdigest()}
def write(path,value):
    raw=(json.dumps(value,sort_keys=True,indent=2,ensure_ascii=False)+"\n").encode()
    temporary=path.with_name(path.name+"."+uuid.uuid4().hex+".partial")
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
    os.replace(temporary,path)
def need(value,message):
    if not value:raise RuntimeError(message)
def proc(pid):
    try:
        raw=Path("/proc")/str(pid)/"stat"
        text=raw.read_text();tail=text[text.rfind(")")+2:].split()
        return {"pid":int(pid),"ppid":int(tail[1]),"pgrp":int(tail[2]),"start":int(tail[19])}
    except (OSError,ValueError,IndexError):return None
def collect(child,known):
    """Retain identities of only descendants of this exact original CLI process."""
    root=proc(child.pid)
    prior=known.get(child.pid)
    if root and prior and root["start"]!=prior["start"]:raise RuntimeError("The owned CLI process identity changed.")
    if root:known[root["pid"]]=root
    rows={}
    for p in Path("/proc").iterdir():
        if p.name.isdigit():
            row=proc(int(p.name))
            if row:rows[row["pid"]]=row
    live={pid for pid,row in known.items() if pid in rows and row["start"]==rows[pid]["start"]}
    changed=True
    while changed:
        changed=False
        for pid,row in rows.items():
            if pid not in live and row["ppid"] in live:
                live.add(pid);known[pid]=row;changed=True
    return [rows[pid] for pid in live]
def remaining(known):
    return [actual for pid,row in known.items() if (actual:=proc(pid)) and actual["start"]==row["start"]]
def force_close(child,known):
    """After the opener's generous orderly period, close only retained own groups."""
    collect(child,known)
    groups={row["pgrp"] for row in remaining(known)}
    need(os.getpgrp() not in groups,"The customer CLI must own a separate process group.")
    for group in groups:
        try:os.killpg(group,signal.SIGTERM)
        except ProcessLookupError:pass
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        child.poll()
        if not remaining(known):break
        time.sleep(.1)
    for group in {row["pgrp"] for row in remaining(known)}:
        try:os.killpg(group,signal.SIGKILL)
        except ProcessLookupError:pass
    child.wait(timeout=10)
    deadline=time.monotonic()+5
    while time.monotonic()<deadline and remaining(known):time.sleep(.1)
    need(not remaining(known),"An owned customer-opener descendant remains; retained the actual process identities.")
def _run_acceptance(*,archive,sha256,opener,node,output,emit=None):
    archive=Path(archive).expanduser().resolve();opener=Path(opener).expanduser().resolve()
    output=Path(output).expanduser().absolute()
    need(not output.exists(),"Choose a new acceptance output directory for this original saved edition.")
    output.mkdir(mode=0o700)
    need(output.resolve()==output,"Use a real normalized private acceptance destination.")
    baseline=ident(archive);need(baseline["sha256"]==sha256,"The actual delivered ZIP differs from its recorded SHA-256.")
    result={"schema":"commons.scf-correction-customer-opener-course.v1","state":"STARTING","startedAt":now(),
            "archive":baseline,"opener":ident(opener),"steps":[],"financialCommands":0,"browserStarted":False}
    result_path=output/"customer-opener-result.json";write(result_path,result)
    active={};prefix=[sys.executable,"-u","-B",str(opener),"--node",str(node)]
    def record(name,value):
        result["steps"].append({"name":name,"at":now(),"value":value});write(result_path,result)
        if emit:emit("CUSTOMER_OPENER_"+name.upper(),value=value)
    def dispatch(args,name,timeout):
        stdout_path=output/(name+".stdout");stderr_path=output/(name+".stderr")
        command=prefix+list(map(str,args));intent={"command":command,"startedAt":now(),"state":"DISPATCH_PENDING"}
        write(output/(name+"-command.json"),intent)
        with stdout_path.open("xb") as stdout,stderr_path.open("xb") as stderr:
            child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,cwd=output,
                                   start_new_session=True,env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
            known={};collect(child,known);active[child.pid]=(child,known)
            try:
                deadline=time.monotonic()+timeout
                while child.poll() is None:
                    collect(child,known)
                    if time.monotonic()>=deadline:raise TimeoutError("Original customer opener "+name+" did not complete.")
                    time.sleep(.1)
            finally:
                if child.poll() is None or remaining(known):force_close(child,known)
                active.pop(child.pid,None)
                intent.update(state="RETURNED",returncode=child.returncode,finishedAt=now(),
                              stdout=ident(stdout_path),stderr=ident(stderr_path))
                write(output/(name+"-command.json"),intent)
        need(child.returncode==0,"Original customer opener "+name+" failed; its actual full stdout/stderr are retained.")
        # inspect/restore print one complete pretty-printed JSON object.
        value=json.loads(stdout_path.read_text())
        record(name,value);return value
    failure=None
    try:
        first=dispatch(["inspect",archive,"--sha256",sha256],"inspect-delivery",300)
        need(first["input"]==baseline,"Inspect did not return the delivered ZIP identity.")
        installed=output/"customer-workspace"
        ready=dispatch(["restore",archive,"--sha256",sha256,"--root",installed],"restore-customer",900)
        need(ready.get("state")=="READY" and ready.get("originalIdentity")==first["originalIdentity"],"The actual customer restore did not retain original identity.")
        state=installed/"native-state/accounting/workspace.json"
        before=json.loads(state.read_text())["receivables"]
        before_sha=hashlib.sha256(json.dumps(before,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
        stdout_path=output/"open-customer.stdout";stderr_path=output/"open-customer.stderr"
        command=prefix+["open",str(installed)]
        write(output/"open-customer-command.json",{"command":command,"state":"DISPATCH_PENDING","startedAt":now()})
        child=None;known={};open_receipt=None;stop_sent=False;cursor=0;tail=""
        with stdout_path.open("xb") as stdout,stderr_path.open("xb") as stderr:
            try:
                child=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,cwd=output,
                    start_new_session=True,env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
                collect(child,known);active[child.pid]=(child,known)
                deadline=time.monotonic()+300
                while open_receipt is None:
                    collect(child,known)
                    with stdout_path.open("r") as incoming:
                        incoming.seek(cursor);tail+=incoming.read();cursor=incoming.tell()
                    parts=tail.split("\n");tail=parts.pop()
                    for line in parts:
                        try:value=json.loads(line)
                        except ValueError:continue
                        if isinstance(value,dict) and value.get("state")=="OPEN":open_receipt=value
                    if open_receipt:break
                    need(child.poll() is None,"The installed customer app exited before its real OPEN receipt.")
                    if time.monotonic()>=deadline:raise TimeoutError("No actual OPEN receipt from the installed customer app.")
                    time.sleep(.1)
                need(Path(open_receipt["root"]).resolve()==installed.resolve(),"The original opener served another receiving root.")
                need(open_receipt.get("planning","").startswith("http://127.0.0.1:") and "#access=" in open_receipt["planning"],"The normal private owner access link is absent.")
                with urllib.request.urlopen(open_receipt["planning"].split("#",1)[0],timeout=30) as response:
                    page=response.read(2*1024*1024+1)
                    need(response.status==200 and 0<len(page)<=2*1024*1024,"The opened native planning page did not return completely.")
                (output/"customer-opening-page.html").write_bytes(page)
                history=json.loads((installed/"opening-history.json").read_text())
                need(history[-1]["state"]=="OPEN" and history[-1]["identity"]==first["originalIdentity"],"The real original opening journal is incomplete.")
                record("open-customer",{"root":str(installed),"openingId":history[-1]["id"],"originalIdentity":history[-1]["identity"],
                                        "privateAccessFile":str(installed/"private-access.json"),"servedPage":ident(output/"customer-opening-page.html"),"financialCommands":0})
                # Only the owning Python CLI receives this orderly stop. Its
                # existing finally closes its original native/Planning children
                # and then snapshots/exports the actual complete current case.
                os.killpg(child.pid,signal.SIGTERM);stop_sent=True
                deadline=time.monotonic()+1200
                while child.poll() is None:
                    collect(child,known)
                    if time.monotonic()>=deadline:raise TimeoutError("The customer opener's orderly save did not complete.")
                    time.sleep(.1)
            finally:
                if child is not None:
                    try:
                        if child.poll() is None or remaining(known):force_close(child,known)
                    finally:
                        active.pop(child.pid,None)
                        write(output/"open-customer-command.json",{"command":command,"state":"RETURNED","returncode":child.returncode,
                              "finishedAt":now(),"orderlyStopSent":stop_sent,"stdout":ident(stdout_path),"stderr":ident(stderr_path)})
        need(child is not None and child.returncode==0,"The actual customer opener did not close/save successfully; all logs remain.")
        delivery=json.loads((installed/"last-delivery.json").read_text())
        need(delivery.get("state")=="COMPLETE_PACKAGE_SAVED" and delivery.get("originalIdentity")==first["originalIdentity"],"The customer's actual complete save receipt is absent.")
        saved=Path(delivery["path"]).resolve()
        need(saved.is_relative_to(installed/"deliveries"),"The customer opener saved outside its own deliveries directory.")
        need(ident(saved)=={"bytes":delivery["bytes"],"sha256":delivery["sha256"]},"The customer's saved ZIP differs from its receipt.")
        after=json.loads(state.read_text())["receivables"]
        need(after==before,"Read-only customer opening changed an original financial record or request history.")
        history=json.loads((installed/"opening-history.json").read_text())
        need(history[-1]["state"]=="CLOSED" and not history[-1]["cleanupErrors"],"A customer service did not close cleanly.")
        record("close-save",{"delivery":delivery,"financialStateSha256":before_sha,"receivablesAndRequestsUnchanged":True,
                             "openingId":history[-1]["id"],"allOwnedProcessesClosed":not remaining(known)})
        final=dispatch(["inspect",saved,"--sha256",delivery["sha256"]],"inspect-customer-save",300)
        need(final["originalIdentity"]==first["originalIdentity"] and final["sourceSelectionSha256"]==first["sourceSelectionSha256"],"The saved continuation changed its selected source or original identity.")
        need(final["backup"]["manifestSha256"]==delivery["backupManifestSha256"],"The outgoing customer's authenticated snapshot differs from its complete receipt.")
        need(ident(archive)==baseline,"The source complete delivery changed during customer receiving.")
        result.update(state="CUSTOMER_OPENER_RECEIVING_COMPLETE",completedAt=now(),customerDelivery=delivery,
                      originalIdentity=first["originalIdentity"],sourceSelectionSha256=first["sourceSelectionSha256"],
                      originalArchiveUnchanged=True,receivablesAndRequestsUnchanged=True,finalSavedZip=delivery["path"])
    except BaseException as error:
        failure=error;result.update(state="CUSTOMER_OPENER_RETAINED_WITH_ERROR",error={"type":type(error).__name__,"message":str(error)})
    finally:
        close_errors=[]
        for child,known in list(active.values()):
            try:force_close(child,known)
            except BaseException as error:close_errors.append({"pid":child.pid,"error":str(error)})
        if close_errors:
            result["cleanupErrors"]=close_errors;result["state"]="CUSTOMER_OPENER_RETAINED_WITH_ERROR"
            if failure is None:failure=RuntimeError("An owned opener process did not close.")
        write(result_path,result)
    if failure:raise failure
    return result

def run_acceptance(archive,expected_sha256,root,node,opener):
    """Same-controller entry; root is one new private acceptance output directory."""
    return _run_acceptance(archive=archive,sha256=expected_sha256,output=root,node=node,opener=opener)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--archive",required=True,type=Path);p.add_argument("--sha256",required=True)
    p.add_argument("--opener",required=True,type=Path);p.add_argument("--node",required=True);p.add_argument("--output",required=True,type=Path)
    a=p.parse_args();previous={}
    def stopping(number,_):
        signal.signal(signal.SIGINT,signal.SIG_IGN);signal.signal(signal.SIGTERM,signal.SIG_IGN);raise SystemExit(128+number)
    for sig in (signal.SIGINT,signal.SIGTERM):previous[sig]=signal.signal(sig,stopping)
    try:
        result=run_acceptance(a.archive,a.sha256,a.output,a.node,a.opener)
        print(json.dumps(result,indent=2),flush=True)
    finally:
        for sig,handler in previous.items():signal.signal(sig,handler)
if __name__=="__main__":main()
