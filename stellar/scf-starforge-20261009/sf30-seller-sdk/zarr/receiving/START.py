"""Receive a complete, explicitly selected Zarr handover without repeating array work.

Use the selected original Python dependency environment. This script verifies the
whole private ZIP first, then delegates native SQLite/history adoption to the
included original packet receiver. It never starts a seller or a managed app.
"""
from __future__ import annotations
import argparse,fcntl,hashlib,importlib.util,json,os,stat,sys,uuid,zipfile
from pathlib import Path
sys.dont_write_bytecode=True
SCHEMA="stellar-forge.zarr-complete-handover.v1"
MAX_BYTES=2*1024*1024*1024
MAX_FILES=250000
CHUNK=1024*1024

def need(value,message):
    if not value:raise ValueError(message)
def encoded(value):return (json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()
def digest(value):return hashlib.sha256(value).hexdigest()
def name(value):
    need(isinstance(value,str) and value and not value.startswith(("/","\\")) and "\\" not in value and "\x00" not in value,"Canonical archive member required")
    need(all(p not in ("",".","..") for p in value.split("/")),"Canonical archive member required")
    return value
def identity(path):
    p=Path(path);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        s=os.fstat(fd);need(stat.S_ISREG(s.st_mode),"Regular file required: "+str(p))
        h=hashlib.sha256();size=0
        with os.fdopen(fd,"rb",closefd=False) as f:
            while b:=f.read(CHUNK):size+=len(b);h.update(b)
        last=os.fstat(fd);need((s.st_size,s.st_mtime_ns,s.st_ctime_ns)==(last.st_size,last.st_mtime_ns,last.st_ctime_ns) and size==s.st_size,"File changed during read")
        return {"bytes":size,"sha256":h.hexdigest()}
    finally:os.close(fd)
def sync(directory):
    fd=os.open(directory,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
def private(path,create=False):
    p=Path(path)
    if create:p.mkdir(mode=0o700,parents=True,exist_ok=True)
    s=p.lstat();need(stat.S_ISDIR(s.st_mode) and not p.is_symlink() and not s.st_mode&0o077 and p.resolve()==p,"Private canonical directory required: "+str(p))
    return p
def target(root,member):
    p=root
    for part in name(member).split("/")[:-1]:
        p=p/part
        if not p.exists():p.mkdir(mode=0o700)
        need(p.is_dir() and not p.is_symlink(),"Preserve changed receiving parent")
    return p/name(member).split("/")[-1]
def save(path,data):
    p=Path(path);p.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    if p.exists() or p.is_symlink():
        need(identity(p)=={"bytes":len(data),"sha256":digest(data)},"Preserve different retained file: "+str(p));return
    temp=p.with_name(p.name+"."+str(uuid.uuid4())+".partial")
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(data);f.flush();os.fsync(f.fileno())
    try:os.link(temp,p)
    except FileExistsError:need(identity(p)=={"bytes":len(data),"sha256":digest(data)},"Preserve receiving conflict")
    temp.unlink();sync(p.parent)
def manifest_at(archive):
    infos=archive.infolist();need(0<len(infos)<=MAX_FILES,"Whole handover member count")
    seen=set();total=0
    for info in infos:
        name(info.filename);need(info.filename not in seen and not info.is_dir(),"Unique regular archive members required")
        seen.add(info.filename);total+=info.file_size
        need(stat.S_IFMT(info.external_attr>>16) in (0,stat.S_IFREG) and not info.flag_bits&1,"Only unencrypted regular files")
    need(total<=MAX_BYTES and "HANDOVER.json" in seen,"Whole handover size or manifest")
    info=archive.getinfo("HANDOVER.json");need(info.file_size<=32*1024*1024,"Manifest size")
    raw=archive.read(info);value=json.loads(raw)
    need(value.get("schema")==SCHEMA and value.get("state")=="COMPLETE" and isinstance(value.get("files"),list),"Whole handover schema")
    expected={};bytes_total=0
    for row in value["files"]:
        key=name(row["path"]);need(key!="HANDOVER.json" and key not in expected,"Unique declared payload")
        need(type(row["bytes"]) is int and row["bytes"]>=0 and isinstance(row["sha256"],str) and len(row["sha256"])==64 and all(c in "0123456789abcdef" for c in row["sha256"]),"Declared payload identity")
        need(type(row["executable"]) is bool,"Declared executable mode");expected[key]=row;bytes_total+=row["bytes"]
    need(set(expected)|{"HANDOVER.json"}==seen and bytes_total+len(raw)==total,"The complete manifest must cover every member")
    need("source-workspace.zip" in expected and "programme-result.json" in expected and "engine/source-manifest.json" in expected,"Whole native and source selection are required")
    need(value["nativePacket"]=={k:expected["source-workspace.zip"][k] for k in ("bytes","sha256")},"Original native packet binding")
    for key,row in expected.items():
        info=archive.getinfo(key);need(info.file_size==row["bytes"],"Declared archive size changed: "+key)
        need(bool((info.external_attr>>16)&0o111)==row["executable"],"Declared archive executable mode changed")
        h=hashlib.sha256();size=0
        with archive.open(info) as f:
            while b:=f.read(CHUNK):size+=len(b);h.update(b)
        need({"bytes":size,"sha256":h.hexdigest()}=={k:row[k] for k in ("bytes","sha256")},"Changed complete archive member: "+key)
    result=json.loads(archive.read("programme-result.json"))
    need(result.get("state")=="NATIVE_COMPLETE" and result.get("operationId")==value["operationId"] and result.get("inputSha256")==value["inputSha256"] and result.get("workspace")==value["workspace"],"Original completed programme binding")
    return value,raw
def inspect_archive(path,sha256=None):
    before=identity(path)
    if sha256 is not None:need(before["sha256"]==sha256,"Select the exact original whole archive")
    with zipfile.ZipFile(path) as archive:value,raw=manifest_at(archive)
    need(identity(path)==before,"Archive changed during validation")
    return {"archive":before,"manifest":{"bytes":len(raw),"sha256":digest(raw)},"value":value}
def extract(archive,root,row):
    p=target(root,row["path"]);expected={k:row[k] for k in ("bytes","sha256")}
    partial=p.with_name(p.name+".receiving-partial");mode=0o600|(0o100 if row["executable"] else 0)
    if p.exists() or p.is_symlink():
        need(identity(p)==expected and bool(p.lstat().st_mode&0o111)==row["executable"],"Preserve different completed receiving member")
        if partial.exists() or partial.is_symlink():
            a=p.lstat();b=partial.lstat();need(stat.S_ISREG(b.st_mode) and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino),"Preserve unrelated partial")
            partial.unlink();sync(p.parent)
        return
    offset=0
    if partial.exists() or partial.is_symlink():
        s=partial.lstat();need(stat.S_ISREG(s.st_mode) and s.st_size<=row["bytes"],"Preserve invalid partial");offset=s.st_size
        with partial.open("rb") as original,archive.open(row["path"]) as wanted:
            while b:=original.read(CHUNK):need(wanted.read(len(b))==b,"Preserve differing partial")
    fd=os.open(partial,os.O_WRONLY|os.O_NOFOLLOW|(os.O_APPEND if partial.exists() else os.O_CREAT|os.O_EXCL),mode)
    with os.fdopen(fd,"ab") as out,archive.open(row["path"]) as source:
        os.fchmod(out.fileno(),mode)
        remaining=offset
        while remaining:
            b=source.read(min(CHUNK,remaining));need(b,"Truncated original member");remaining-=len(b)
        while b:=source.read(CHUNK):out.write(b)
        out.flush();os.fsync(out.fileno())
    need(identity(partial)==expected,"Original receiving bytes changed")
    os.link(partial,p);sync(p.parent);partial.unlink();sync(p.parent)
def load_packet(root):
    original=root/"bundle/operator/python"
    sys.path.insert(0,str(original))
    import packet
    need(Path(packet.__file__).resolve()==original/"packet.py","Use the included original packet receiver")
    return packet
def read_completed(path,intent):
    value=json.loads(Path(path).read_bytes())
    need(value.get("state")=="RECEIVED" and value.get("operationId")==intent["operationId"] and value.get("inputSha256")==intent["inputSha256"] and value.get("archive")==intent["archive"] and value.get("manifest")==intent["manifest"],"Preserve a different completed receiving selection")
    return value
def receive(archive_path,sha256,directory):
    archive_path=Path(archive_path).resolve();selected=inspect_archive(archive_path,sha256);m=selected["value"]
    root=Path(directory)
    need(root.is_absolute() and root.resolve()==root,"Absolute canonical receiving root")
    if not root.exists():private(root,True)
    root=private(root)
    lock=os.open(root/"receiving.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        intent={"schema":"stellar-forge.zarr-complete-receiving-selection.v1","operationId":m["operationId"],"inputSha256":m["inputSha256"],"archive":selected["archive"],"manifest":selected["manifest"]}
        intent_file=root/"receiving-intent.json"
        if not intent_file.exists():need(set(p.name for p in root.iterdir())=={"receiving.lock"},"Choose an absent or original receiving root")
        save(intent_file,encoded(intent));bundle=private(root/"bundle",True)
        with zipfile.ZipFile(archive_path) as archive:
            # Validation precedes every extraction; the original manifest is retained too.
            for row in m["files"]:extract(archive,bundle,row)
            save(bundle/"HANDOVER.json",archive.read("HANDOVER.json"))
        need(identity(archive_path)==selected["archive"],"Original archive changed during extraction")
        completed_file=root/"receiving-result.json";completed=read_completed(completed_file,intent) if completed_file.exists() else None
        packet=load_packet(root);native=packet.receive_packet(bundle/"source-workspace.zip",root/"workspace")
        need(native["workspaceId"]==m["workspace"]["id"],"The received original workspace identity changed")
        # Restore only the complete source-owned publisher and dataset additions.
        # Native data/history remain exclusively owned by packet.receive_packet.
        for row in m["files"]:
            if not completed and row["path"].startswith("workspace-additions/"):
                rel=row["path"][len("workspace-additions/"):]
                need(rel.split("/")[0] in ("publishers","datasets","operator-publisher-requests"),"Unexpected workspace addition")
                out=target(root/"workspace",rel);original=bundle/row["path"]
                packet.copy_file(original,out,{k:row[k] for k in ("bytes","sha256")},MAX_BYTES)
                os.chmod(out,0o600|(0o100 if row["executable"] else 0))
        from workspace import Workspace
        with Workspace(root/"workspace",readonly=True) as ws:
            status=ws.status()
            need(status["workspaceId"]==m["workspace"]["id"] and status["revision"]>=m["workspace"]["revision"],"The original native revision changed")
        if completed:return {**completed,"replayed":True,"currentRevision":status["revision"]}
        result={"schema":"stellar-forge.zarr-complete-received.v1","state":"RECEIVED","operationId":m["operationId"],"inputSha256":m["inputSha256"],
                "workspaceId":status["workspaceId"],"revision":status["revision"],"directory":str(root),"workspaceDirectory":str(root/"workspace"),
                "bundleDirectory":str(bundle),"archive":selected["archive"],"manifest":selected["manifest"],"nativePacket":m["nativePacket"],
                "publisherSelections":m["publisherSelections"],"sourceManifestSha256":m["sourceManifestSha256"],
                "originalResults":[r["id"] for r in status["results"]],"originalFrozen":[r["id"] for r in status["frozen"]],
                "automaticServicesStarted":0,"additionalArrayReads":0}
        save(root/"receiving-result.json",encoded(result));return result
    finally:os.close(lock)
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest="command",required=True)
    q=sub.add_parser("receive");q.add_argument("--archive",required=True);q.add_argument("--sha256",required=True);q.add_argument("--directory",required=True)
    q=sub.add_parser("inspect");q.add_argument("--archive",required=True);q.add_argument("--sha256",required=True)
    a=p.parse_args()
    try:
        result=receive(a.archive,a.sha256,a.directory) if a.command=="receive" else inspect_archive(a.archive,a.sha256)
        print(json.dumps(result,separators=(",",":")),flush=True)
    except Exception as e:
        print(json.dumps({"state":"NOT_COMPLETE","code":"ZARR_HANDOVER_RECEIVING","message":str(e)}),file=sys.stderr,flush=True);raise SystemExit(2)
