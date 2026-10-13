#!/usr/bin/env python3
"""Continue an existing completed Bluewave operation through its installed Applications integration."""
import argparse,fcntl,hashlib,json,os,pathlib,stat,subprocess,sys,zipfile
ROOT=pathlib.Path(__file__).resolve().parent
SCHEMA="stellar-forge.property-continuity-managed-receiving.v1"
SOURCE="cf5e60ed049ee7584d389cc8d09b2a2e361c0fa37cf00fc41af496652f641b3a"
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
def load(path):return json.loads(read(path))
def sync(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def directory(path):
    if not path.exists():
        directory(path.parent);path.mkdir(mode=0o700);sync(path.parent)
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
def archive_delivery(out,result):
    files=[]
    def add(name,path):
        require(not name.startswith("/") and all(x not in ("",".","..") for x in name.split("/")),"Unsafe delivery member.")
        descriptor=measure(path);files.append({"name":name,**descriptor})
    for name in ("input.json","original-completion.json","result.json"):add(name,out/name)
    operation=out.parent
    for name in ("input.json","native-result.json","completed-journal.json"):add("original-operation/"+name,operation/name)
    # The complete original installed source archive carries all selected framework and product sources.
    runtime=pathlib.Path(result["runtimeDirectory"])
    add("installed-runtime/source.tgz",runtime/"source.tgz")
    for name in ("runtime-install.json","runtime-profile.json","package.json","install-state.json"):
        add("installed-runtime/"+name,runtime/name)
    for item in result["artifacts"]:
        path=pathlib.Path(item["path"]);require(path.parent==out/"artifacts","Unexpected managed artifact path.")
        actual=measure(path);require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"Completed managed artifact changed.")
        add("workspaces/"+path.name,path)
    for path in sorted((out/"reports").rglob("*")):
        if path.is_file():require(not path.is_symlink(),"Report source is linked.");add("reports/"+path.relative_to(out/"reports").as_posix(),path)
    for path in sorted(ROOT.rglob("*")):
        if path.is_file() and path.suffix not in (".pyc",".lock",".log") and "__pycache__" not in path.parts:
            require(not path.is_symlink(),"Source selection cannot contain a linked product leaf.")
            add("product-source/"+path.relative_to(ROOT).as_posix(),path)
    require(len({x["name"] for x in files})==len(files) and sum(x["bytes"] for x in files)<=MAXIMUM,"Complete delivery exceeds capacity or duplicates paths.")
    recipe={"schema":"stellar-forge.property-continuity-managed-delivery.v1","operationId":result["operationId"],"inputSha256":result["inputSha256"],
        "files":[{k:v for k,v in x.items() if k!="path"} for x in files]}
    retain(out/"delivery-intent.json",canonical(recipe))
    target=out/"Property_Continuity_Managed_Receiving.zip";receipt_path=out/"delivery-result.json"
    previous=load(receipt_path) if receipt_path.exists() else None
    if not target.exists():
        temporary=out/"delivery.partial.zip"
        with zipfile.ZipFile(temporary,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            for item in files:
                raw=read(item["path"],MAXIMUM);require(len(raw)==item["bytes"] and digest(raw)==item["sha256"],"Original delivery member changed.")
                info=zipfile.ZipInfo(item["name"],(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16;archive.writestr(info,raw)
            info=zipfile.ZipInfo("Delivery_Manifest.json",(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16;archive.writestr(info,canonical(recipe))
        with temporary.open("rb") as stream:os.fsync(stream.fileno())
        if previous:require(measure(temporary)["sha256"]==previous["archive"]["sha256"],"Reconstructed archive differs from its original completed receipt.")
        os.replace(temporary,target);sync(out)
    with zipfile.ZipFile(target) as archive:
        require(len(archive.namelist())==len(files)+1 and set(archive.namelist())=={x["name"] for x in files}|{"Delivery_Manifest.json"},"Original delivery members changed.")
        require(archive.read("Delivery_Manifest.json")==canonical(recipe),"Original delivery manifest changed.")
        for item in files:
            raw=archive.read(item["name"]);require(len(raw)==item["bytes"] and digest(raw)==item["sha256"],"Completed delivery member differs.")
    receipt={"schema":recipe["schema"],"operationId":result["operationId"],"state":"COMPLETE","archive":measure(target),"resultSha256":digest(read(out/"result.json")),"allOwnedResourcesClosed":True}
    retain(receipt_path,canonical(receipt));return receipt
def main():
    require(sys.version_info>=(3,11),"Python 3.11 or later is required.")
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--operation-directory",required=True);p.add_argument("--runtime-workspace",required=True);p.add_argument("--runtime-id",required=True)
    p.add_argument("--node",required=True);p.add_argument("--python",default=sys.executable);p.add_argument("--label",default="Property Continuity commissioning")
    p.add_argument("--timeout-ms",type=int,default=300000)
    a=p.parse_args();operation=pathlib.Path(a.operation_directory);require(operation.is_absolute() and operation.resolve()==operation,"Select the original canonical operation directory.")
    directory(operation);out=operation/"managed-integration";directory(out);directory(out/"control")
    owner=os.open(operation/"operation.lock",os.O_RDWR|os.O_NOFOLLOW)
    try:
        fcntl.flock(owner,fcntl.LOCK_EX|fcntl.LOCK_NB)
        plan=load(operation/"input.json");native=load(operation/"native-result.json");journal=load(operation/"completed-journal.json")
        require(native["operationId"]==plan["operationId"] and native["inputSha256"]==digest(read(operation/"input.json")) and native["state"]=="COMPLETE" and native["allOwnedResourcesClosed"] is True and journal["state"]=="COMPLETE","Finish the original native programme before this managed continuation.")
        require(plan["sourceSha256"]==SOURCE,"Keep the original selected native app.")
        runtime_workspace=pathlib.Path(a.runtime_workspace);node=pathlib.Path(a.node);python=pathlib.Path(a.python)
        require(runtime_workspace.is_absolute() and runtime_workspace.resolve()==runtime_workspace and runtime_workspace.is_dir(),"Use the actual existing Runtime workspace.")
        require(node.is_absolute() and node.is_file() and os.access(node,os.X_OK) and python.is_absolute() and python.is_file() and os.access(python,os.X_OK),"Select actual installed Node and Python executables.")
        input={"schema":SCHEMA,"operationId":plan["operationId"],"operationDirectory":str(operation),"sourceSha256":SOURCE,"workspaceId":plan["workspace"]["id"],
            "runtimeWorkspace":str(runtime_workspace),"runtimeId":a.runtime_id,"label":a.label,"timeoutMs":a.timeout_ms,
            "settings":{"workspaceDirectory":plan["workspace"]["directory"],"pythonExecutable":str(python.resolve()),
                "connectionFile":str(pathlib.Path(plan["workspace"]["directory"])/"property-continuity-connection.json"),"receivingDirectory":str(out/"workspaces"),"port":0}}
        retain(out/"input.json",canonical(input))
        retain(out/"control"/"caller.json",canonical({"node":str(node.resolve()),"nodeSha256":digest(read(node,MAXIMUM)),"python":str(python.resolve()),"pythonSha256":digest(read(python,MAXIMUM)),"source":str(ROOT),"sourceEntrySha256":digest(read(ROOT/"managed-receiving.mjs"))}))
        env=dict(os.environ,PROPERTY_CONTINUITY_RECEIVING_GUARD_FD=str(owner),NODE_OPTIONS="--max-old-space-size=192",OMP_NUM_THREADS="1",OPENBLAS_NUM_THREADS="1")
        # The same inherited flock prevents another Node continuation while this child remains.
        # Managed Applications retains its own original process/request custody after this child closes.
        with (out/"control"/"stdout.log").open("ab") as stdout,(out/"control"/"stderr.log").open("ab") as stderr:
            child=subprocess.Popen([str(node),str(ROOT/"managed-receiving.mjs"),str(out/"input.json")],cwd=ROOT,env=env,stdout=stdout,stderr=stderr,pass_fds=(owner,))
            print(json.dumps({"operationId":plan["operationId"],"stage":"managed-integration","pid":child.pid}),flush=True)
            code=child.wait()
        if code:raise RuntimeError("Managed continuation returned "+str(code)+". Retain its original Applications requests and control logs before resuming.")
        result=load(out/"result.json");require(result["state"]=="COMPLETE" and result["operationId"]==plan["operationId"] and result["inputSha256"]==digest(canonical(input)) and result["allOwnedResourcesClosed"] is True,"Managed continuation did not complete.")
        receipt=archive_delivery(out,result);print(json.dumps(receipt),flush=True);return receipt
    finally:os.close(owner)
if __name__=="__main__":main()
