#!/usr/bin/env python3
"""Receive the whole selected ODR installation programme and keep its original lease."""
from __future__ import annotations
import argparse,fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,uuid,zipfile
P=pathlib.Path
def sha(b):return hashlib.sha256(b).hexdigest()
def rawjson(p):return json.loads(P(p).read_text())
def encode(v):return (json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()
def private(p):
    p=P(p).absolute();missing=[];q=p
    while not q.exists():
        if q.is_symlink():raise ValueError("Do not receive through a symbolic link.")
        missing.append(q);q=q.parent
    for part in reversed(missing):
        try:part.mkdir(mode=0o700)
        except FileExistsError:pass
        if part.is_symlink() or not part.is_dir() or part.stat().st_uid!=os.getuid() or part.stat().st_mode&0o077:raise ValueError("New receiving ancestors must be owned private directories.")
    if p.is_symlink() or p.resolve()!=p or not p.is_dir() or p.stat().st_uid!=os.getuid() or p.stat().st_mode&0o077:raise ValueError("Select an owned private receiving directory.")
    return p
def write(p,b):
    p=P(p);private(p.parent);t=p.with_name(p.name+"."+str(uuid.uuid4())+".tmp")
    with t.open("xb") as f:os.chmod(t,0o600);f.write(b);f.flush();os.fsync(f.fileno())
    os.replace(t,p)
    fd=os.open(p.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
def once(p,b):
    if P(p).exists():
        if P(p).read_bytes()!=b:raise ValueError("Retain the complete original named input: "+str(p))
    else:write(p,b)
def identity(p):
    p=P(p).absolute()
    if p.is_symlink() or p.resolve()!=p or not p.is_file():raise ValueError("Select an ordinary original input.")
    h=hashlib.sha256();n=0
    with p.open("rb") as f:
        st=os.fstat(f.fileno())
        for b in iter(lambda:f.read(1024*1024),b""):n+=len(b);h.update(b)
        end=os.fstat(f.fileno())
    current=p.stat()
    if (st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)!=(end.st_dev,end.st_ino,end.st_size,end.st_mtime_ns) or (end.st_dev,end.st_ino)!=(current.st_dev,current.st_ino):raise ValueError("Original file changed during receiving.")
    return {"path":str(p),"bytes":n,"sha256":h.hexdigest()}
def copy(original,target,known):
    if P(target).exists():
        v=identity(target)
        if (v["bytes"],v["sha256"])!=(known["bytes"],known["sha256"]):raise ValueError("Retained original copy changed.")
        return v
    private(P(target).parent);temp=P(str(target)+"."+str(uuid.uuid4())+".tmp");h=hashlib.sha256();n=0
    with P(original).open("rb") as source,temp.open("xb") as out:
        os.chmod(temp,0o600)
        for b in iter(lambda:source.read(1024*1024),b""):out.write(b);n+=len(b);h.update(b)
        out.flush();os.fsync(out.fileno())
    if (n,h.hexdigest())!=(known["bytes"],known["sha256"]):raise ValueError("The actual copied original bytes changed.")
    os.replace(temp,target);fd=os.open(P(target).parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    return identity(target)
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for key in ("packet","input","directory"):parser.add_argument("--"+key,required=True)
    args=parser.parse_args();root=private(args.directory);lease=os.open(root/"RECEIVING.lock",os.O_CREAT|os.O_RDWR,0o600)
    fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if lease!=3:os.dup2(lease,3);os.close(lease)
    os.set_inheritable(3,True)
    packet_bytes=P(args.packet).read_bytes();packet=json.loads(packet_bytes);pid=sha(packet_bytes)
    if packet.get("schema")!="commons.odr-installed-source.v1":raise ValueError("Select the whole original closed programme packet.")
    repo=private(root/"programmes"/pid);once(repo/"SOURCE_PACKET.json",packet_bytes)
    rows=packet["files"]+packet["native_support"];seen=set()
    for row in rows:
        name=row["path"];parts=pathlib.PurePosixPath(name).parts
        if not parts or name.startswith("/") or "\\" in name or any(p in ("",".","..") for p in parts) or name in seen:raise ValueError("Select unique ordinary complete source paths.")
        seen.add(name);b=row["content"].encode()
        if len(b)!=row["bytes"] or sha(b)!=row["sha256"]:raise ValueError("Complete source identity differs: "+name)
        once(repo/name,b)
    original=rawjson(args.input)
    if original.get("schema")!="stellar-forge.odr-installed-receiving-input.v1":raise ValueError("Select the original full source/hand-over input.")
    case=private(root/"case");input_path=case/"ORIGINAL_INPUT.json"
    if input_path.exists():
        selected=rawjson(input_path)
        if original!=rawjson(case/"INPUT_SELECTION.json"):raise ValueError("The original named input selection differs.")
        for key in ("application","handover","successor"):
            if key not in selected:continue
            old=rawjson(case/"INPUT_SELECTION.json").get(key)
            if old and P(old["path"]).exists() and identity(old["path"])!=old:raise ValueError("The surviving original donor changed.")
            if identity(selected[key]["path"])!=selected[key]:raise ValueError("Retained complete original input changed.")
    else:
        once(case/"INPUT_SELECTION.json",encode(original));selected=dict(original)
        for key in ("application","handover","successor"):
            if key not in original:continue
            known=identity(original[key]["path"])
            if known!=original[key]:raise ValueError("Select the exact whole original input identity.")
            selected[key]=copy(known["path"],case/"inputs"/(key+".json"),known)
        once(input_path,encode(selected))
    selection={"programme_sha256":pid,"source_files":len(rows),"selected_at":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}
    attempts=private(root/"attempts");attempt_id=str(uuid.uuid4());attempt=private(attempts/attempt_id);once(attempt/"SOURCE_SELECTION.json",encode(selection))
    result_path=case/"RESULT.json"
    if result_path.exists():copy(result_path,attempt/"PRIOR_RESULT.json",identity(result_path));result_path.unlink()
    env={**os.environ,"ODR_RECEIVING_ATTEMPT":attempt_id,"PYTHONDONTWRITEBYTECODE":"1"}
    result=None
    with (attempt/"stdout.log").open("wb") as out,(attempt/"stderr.log").open("wb") as err:
        child=subprocess.Popen([selected["node"],str(repo/"products/odr-workspace/receiving/installed.mjs"),str(repo),str(case),str(P(sys.executable).resolve()),str(input_path)],stdout=out,stderr=err,env=env,cwd=repo,pass_fds=(3,))
        once(attempt/"LAUNCH.json",encode({"pid":child.pid,"attempt_id":attempt_id,"operation_id":selected["operation_id"]}))
        print(json.dumps({"accepted":True,"pid":child.pid,"attempt_id":attempt_id,"case":str(case)}),flush=True)
        code=child.wait();out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
    if result_path.exists():result=rawjson(result_path)
    complete=bool(code==0 and result and result.get("attempt_id")==attempt_id and result.get("complete") is True)
    files=[];archive=attempt/"ODR_Installed_Whole_Receiving.zip"
    for base in (repo,case,attempt):
        for path in sorted(base.rglob("*")):
            if path==archive or path.is_symlink() or not path.is_file() or path.name.endswith(".lock"):continue
            relative=str(path.relative_to(root));files.append((path,{"path":relative,**{k:v for k,v in identity(path).items() if k!="path"}}))
    manifest={"schema":"commons.odr-installed-receiving-archive.v1","operation_id":selected["operation_id"],"attempt_id":attempt_id,"files":[row for _,row in files]}
    with zipfile.ZipFile(archive,"x",zipfile.ZIP_DEFLATED) as z:
        for path,row in files:z.write(path,row["path"])
        z.writestr("FILES.json",encode(manifest))
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None or set(z.namelist())!={r["path"] for _,r in files}|{"FILES.json"}:raise ValueError("Complete output archive membership differs.")
        for _,row in files:
            b=z.read(row["path"])
            if (len(b),sha(b))!=(row["bytes"],row["sha256"]):raise ValueError("Complete output archive member differs.")
    with archive.open("rb") as f:os.fsync(f.fileno())
    final={"schema":"commons.odr-installed-receiving-delivery.v1","operation_id":selected["operation_id"],"attempt_id":attempt_id,"exit_code":code,"complete":complete,"result":result,"archive":identity(archive),"source_selection":selection}
    write(attempt/"DELIVERY.json",encode(final));write(root/"LATEST_DELIVERY.json",encode(final))
    print(json.dumps({"complete":complete,"archive":final["archive"],"result":str(result_path),"error":result.get("error") if result else None}),flush=True)
    return 0 if complete else 1
if __name__=="__main__":raise SystemExit(main())
