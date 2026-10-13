#!/usr/bin/env python3
"""Continue the accepted MPC operation through Runtime, SDK, agent and actual browser receiving."""
import argparse,datetime,fcntl,hashlib,json,os,pathlib,signal,stat,subprocess,sys,uuid,zipfile
ROOT=pathlib.Path(__file__).resolve().parent
SCHEMA="stellar-forge.mpc-recovery-managed-receiving.v1"
SOURCE="9027c8b723d3870b5a09ab179de6d288a1b78df40c9b4a2ade1ecf7015aa90c8"
MAXIMUM=1024*1024*1024
def require(value,message):
    if not value:raise RuntimeError(message)
def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf-8")
def digest(raw):return hashlib.sha256(raw).hexdigest()
def read(path,limit=32*1024*1024):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd);require(stat.S_ISREG(before.st_mode) and before.st_size<=limit,"Expected a bounded original file: "+str(path))
        with os.fdopen(os.dup(fd),"rb") as stream:raw=stream.read(limit+1)
        after=os.fstat(fd)
        require(len(raw)==before.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),"Original file changed.")
        return raw
    finally:os.close(fd)
def load(path):return json.loads(read(path,MAXIMUM))
def sync(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def directory(path):
    if not path.exists():
        require(path.parent.is_dir() and path.parent.resolve()==path.parent,"Select an existing canonical parent: "+str(path.parent))
        path.mkdir(mode=0o700);sync(path.parent)
    require(path.is_dir() and path.resolve()==path and path.stat().st_mode&0o077==0,"Use a private canonical directory: "+str(path))
def retain(path,raw):
    directory(path.parent)
    if path.exists():require(read(path,MAXIMUM)==raw,"Retained bytes differ: "+str(path));return
    temporary=path.with_name(path.name+".partial")
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(os.dup(fd),"wb") as stream:stream.write(raw);stream.flush()
        os.fsync(fd)
    finally:os.close(fd)
    os.replace(temporary,path);sync(path.parent)
def measure(path):
    raw=read(path,MAXIMUM);return {"path":str(path),"bytes":len(raw),"sha256":digest(raw)}

ACCEPTED_BYTES=654095
ACCEPTED_SHA="c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7"
PRODUCT=ROOT.parents[1]/"products"/"mpc-recovery-operations"
OPERATION_ID=str(uuid.uuid5(uuid.NAMESPACE_URL,"commons:mpc-recovery-complete-receiving-20261013:managed-integration"))

def inside(root,path):
    require(path.is_absolute() and path.resolve()==path and path.is_relative_to(root),"Selected file crosses its original root: "+str(path))
    return path
def prepare_basis(out,archive):
    raw=read(archive,ACCEPTED_BYTES)
    require(len(raw)==ACCEPTED_BYTES and digest(raw)==ACCEPTED_SHA,"Select the exact completed MPC receiving archive.")
    selected=out/"input"/"MPC_Recovery_Complete_Receiving_20261013.zip";retain(selected,raw)
    with zipfile.ZipFile(selected) as z:
        matches=[x for x in z.infolist() if x.filename.endswith("receiving/browser-workspace.json") and not x.is_dir()]
        if not matches:matches=[x for x in z.infolist() if pathlib.PurePosixPath(x.filename).name=="browser-workspace.json" and not x.is_dir()]
        require(len(matches)==1,"The accepted archive must contain one original browser workspace.")
        member=matches[0]
        require(not member.flag_bits&1 and member.file_size<=64*1024*1024 and stat.S_IFMT(member.external_attr>>16) in (0,stat.S_IFREG),"Original accepted workspace member is invalid.")
        workspace=z.read(member);value=json.loads(workspace)
        require(value.get("format")=="mpc-recovery-portable.v1" and isinstance(value.get("snapshot"),dict),"Use the original complete portable workspace.")
    target=out/"input"/"accepted-workspace.json";retain(target,workspace)
    receipt={"schema":"mpc.managed-accepted-input.v1","operationId":OPERATION_ID,
        "archive":{"path":str(selected),"originalPath":str(archive),"bytes":len(raw),"sha256":ACCEPTED_SHA},
        "member":{"name":member.filename,"path":str(target),"bytes":len(workspace),"sha256":digest(workspace)}}
    retain(out/"input"/"accepted-archive-receipt.json",canonical(receipt));return receipt

def source_selection():
    selected=[]
    for base,prefix in ((PRODUCT,"products/mpc-recovery-operations"),(ROOT,"tools/mpc-recovery-operations")):
        require(base.is_dir() and base.resolve()==base,"Select the original installed product/course directory.")
        for path in sorted(base.rglob("*")):
            require(not path.is_symlink(),"Source selection contains a linked leaf.")
            if path.is_file() and "__pycache__" not in path.parts and path.suffix not in (".pyc",".lock",".log"):
                selected.append({"name":prefix+"/"+path.relative_to(base).as_posix(),**measure(path)})
    require(len({x["name"] for x in selected})==len(selected),"Repeated selected source member.")
    return {"schema":"mpc.managed-receiving-source.v1","files":selected}

def archive_delivery(out,result,selected_source):
    files=[]
    def add(name,path):
        require(not name.startswith("/") and all(x not in ("",".","..") for x in name.split("/")) and "\\" not in name,"Unsafe delivery member.")
        descriptor=measure(path);files.append({"name":name,**descriptor})
    for name in ("input.json","result.json","source-selection.json","input/accepted-workspace.json",
                 "input/accepted-archive-receipt.json","input/MPC_Recovery_Complete_Receiving_20261013.zip",
                 "browser/result.json","browser/source-selection.json","browser/input-binding.json"):
        add(name,inside(out,out/name))
    runtime=pathlib.Path(result["runtimeDirectory"])
    require(runtime.is_absolute() and runtime.resolve()==runtime,"Installed Runtime directory changed.")
    for name in ("source.tgz","runtime-install.json","runtime-profile.json","package.json","install-state.json"):
        add("installed-runtime/"+name,inside(runtime,runtime/name))
    seen=set()
    for item in result["files"]:
        path=inside(out,pathlib.Path(item["path"]));name=path.relative_to(out).as_posix()
        require(name.split("/",1)[0] in ("artifacts","sources","browser") and name not in seen,"Unexpected or repeated managed artifact.")
        seen.add(name);actual=measure(path)
        require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"Completed workspace/source/browser artifact changed.")
        add(name,path)
    for item in selected_source["files"]:
        path=pathlib.Path(item["path"]);actual=measure(path)
        require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"Original selected receiving source changed.")
        add("source/"+item["name"],path)
    files.sort(key=lambda x:x["name"])
    require(len({x["name"] for x in files})==len(files) and sum(x["bytes"] for x in files)<=MAXIMUM,"Complete delivery capacity exceeded or duplicate path.")
    recipe={"schema":"stellar-forge.mpc-recovery-managed-delivery.v1","operationId":result["operationId"],
        "inputSha256":result["inputSha256"],"sourceSha256":SOURCE,"allOwnedResourcesClosed":True,
        "files":[{k:v for k,v in x.items() if k!="path"} for x in files]}
    retain(out/"delivery-intent.json",canonical(recipe))
    target=out/"MPC_Recovery_Managed_Receiving.zip";receipt_path=out/"delivery-result.json"
    previous=load(receipt_path) if receipt_path.exists() else None
    if not target.exists():
        temporary=out/"delivery.partial.zip"
        with zipfile.ZipFile(temporary,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            for item in files:
                raw=read(item["path"],MAXIMUM)
                require(len(raw)==item["bytes"] and digest(raw)==item["sha256"],"Delivery member changed during assembly.")
                info=zipfile.ZipInfo(item["name"],(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16
                archive.writestr(info,raw)
            info=zipfile.ZipInfo("Delivery_Manifest.json",(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16
            archive.writestr(info,canonical(recipe))
        with temporary.open("rb") as stream:os.fsync(stream.fileno())
        if previous:require(measure(temporary)["sha256"]==previous["archive"]["sha256"],"Reconstructed archive differs from its original completed receipt.")
        os.replace(temporary,target);sync(out)
    with zipfile.ZipFile(target) as archive:
        require(len(archive.namelist())==len(files)+1 and set(archive.namelist())=={x["name"] for x in files}|{"Delivery_Manifest.json"},"Completed delivery members changed.")
        require(archive.read("Delivery_Manifest.json")==canonical(recipe),"Completed delivery recipe changed.")
        for item in files:
            raw=archive.read(item["name"]);require(len(raw)==item["bytes"] and digest(raw)==item["sha256"],"Completed member differs.")
    receipt={"schema":recipe["schema"],"operationId":result["operationId"],"state":"COMPLETE","archive":measure(target),
        "resultSha256":digest(read(out/"result.json",MAXIMUM)),"allOwnedResourcesClosed":True}
    retain(receipt_path,canonical(receipt));return receipt

def run_child(node,python,chromium,owner,out,value):
    attempts=out/"control"/"node-attempts";directory(attempts)
    attempt=attempts/str(uuid.uuid4());directory(attempt)
    command=[str(node),str(ROOT/"managed-receiving.mjs"),str(out/"input.json")]
    retain(attempt/"input.json",canonical({"command":command,"operationId":OPERATION_ID,"directory":str(out)}))
    child=None;received=[];old_handlers={}
    def forward(signum,frame):
        received.append(signum)
        if child is not None and child.poll() is None:child.send_signal(signum)
    try:
        for sig in (signal.SIGTERM,signal.SIGINT):old_handlers[sig]=signal.signal(sig,forward)
        env=dict(os.environ,MPC_MANAGED_GUARD_FD=str(owner),MPC_RECEIVING_PYTHON=str(python),
            MPC_CHROMIUM_EXECUTABLE=str(chromium),NODE_OPTIONS="--max-old-space-size=1024",OMP_NUM_THREADS="1",OPENBLAS_NUM_THREADS="1")
        with (out/"control"/"stdout.log").open("ab") as stdout,(out/"control"/"stderr.log").open("ab") as stderr:
            if received:raise InterruptedError("Receiving interrupted before process creation.")
            child=subprocess.Popen(command,cwd=ROOT,env=env,stdout=stdout,stderr=stderr,pass_fds=(owner,))
            for sig in received:child.send_signal(sig)
            retain(attempt/"accepted.json",canonical({"pid":child.pid,"command":command}))
            print(json.dumps({"operationId":OPERATION_ID,"stage":"managed-integration","pid":child.pid,"directory":str(out)}),flush=True)
            code=child.wait()
        require(code==0 and not received,"Managed receiving interrupted; resume the same command with its retained Applications requests.")
    finally:
        if child is not None:
            if child.poll() is None:
                child.send_signal(signal.SIGTERM)
                # Keep custody of the inherited operation lock while Node closes its
                # Applications and the browser finishes its owned group cleanup.
                child.wait()
            retain(attempt/"return.json",canonical({"pid":child.pid,"exitCode":child.returncode,
                "nodeClosed":child.poll() is not None,"signals":received}))
        for sig,handler in old_handlers.items():signal.signal(sig,handler)

def main():
    require(sys.version_info>=(3,11),"Python 3.11 or later is required.")
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--operation-directory",required=True);p.add_argument("--accepted-archive",required=True)
    p.add_argument("--runtime-workspace",required=True);p.add_argument("--runtime-id",required=True)
    p.add_argument("--node",required=True);p.add_argument("--python",default=sys.executable)
    p.add_argument("--chromium",required=True);p.add_argument("--offline-port",type=int,default=43871)
    p.add_argument("--label",default="MPC recovery operations commissioning")
    p.add_argument("--actor",default="TJLabs receiving engineer");p.add_argument("--timeout-ms",type=int,default=300000)
    a=p.parse_args();operation=pathlib.Path(a.operation_directory)
    require(operation.is_absolute() and operation.resolve()==operation and operation.is_dir(),"Select the original MPC receiving operation directory.")
    out=operation/"managed-integration";directory(out);directory(out/"control")
    lock=operation/"complete-receiving.lock"
    owner=os.open(lock,os.O_RDWR|os.O_NOFOLLOW)
    try:
        require(stat.S_ISREG(os.fstat(owner).st_mode),"Original receiving lock is not a regular file.")
        fcntl.flock(owner,fcntl.LOCK_EX|fcntl.LOCK_NB)
        archive=pathlib.Path(a.accepted_archive)
        require(archive.is_absolute() and archive.resolve()==archive,"Select the complete original accepted archive.")
        accepted=prepare_basis(out,archive)
        runtime_workspace=pathlib.Path(a.runtime_workspace);node=pathlib.Path(a.node);python=pathlib.Path(a.python);chromium=pathlib.Path(a.chromium)
        require(runtime_workspace.is_absolute() and runtime_workspace.resolve()==runtime_workspace and runtime_workspace.is_dir(),"Select the existing Runtime workspace.")
        for path in (node,python,chromium):require(path.is_absolute() and path.is_file() and os.access(path,os.X_OK),"Select an existing executable: "+str(path))
        require(1024<=a.offline_port<=65535 and 1000<=a.timeout_ms<=3600000,"Select a valid fixed loopback port and managed observation timeout.")
        require(a.actor.strip() and a.label.strip(),"Actor and installation label are required.")
        selected_source=source_selection();retain(out/"source-selection.json",canonical(selected_source))
        prior=load(out/"input.json") if (out/"input.json").exists() else None
        value={"schema":SCHEMA,"operationId":OPERATION_ID,"operationDirectory":str(operation),"directory":str(out),
            "sourceSha256":SOURCE,"acceptedWorkspace":accepted["member"]["path"],"acceptedArchive":accepted["archive"],
            "runtimeWorkspace":str(runtime_workspace),"runtimeId":a.runtime_id,"label":a.label,"actor":a.actor,"timeoutMs":a.timeout_ms,
            "nodeExecutable":str(node),"pythonExecutable":str(python),"chromiumExecutable":str(chromium),"offlinePort":a.offline_port,
            "startedAt":prior["startedAt"] if prior else datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat(timespec="milliseconds").replace("+00:00","Z")}
        retain(out/"input.json",canonical(value))
        retain(out/"control"/"caller.json",canonical({"node":measure(node.resolve()),"python":measure(python.resolve()),
            "chromium":measure(chromium.resolve()),"source":str(ROOT),"sourceSelectionSha256":digest(canonical(selected_source))}))
        run_child(node,python,chromium,owner,out,value)
        result=load(out/"result.json")
        require(result["state"]=="COMPLETE" and result["operationId"]==OPERATION_ID and
            result["inputSha256"]==digest(canonical(value)) and result["allOwnedResourcesClosed"] is True,"Managed result is incomplete.")
        receipt=archive_delivery(out,result,selected_source);print(json.dumps(receipt),flush=True);return receipt
    finally:os.close(owner)
if __name__=="__main__":main()
