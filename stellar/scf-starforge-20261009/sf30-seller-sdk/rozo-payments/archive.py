#!/usr/bin/env python3
"""ROZO complete private archive transport. Python 3 standard library only."""
import argparse, hashlib, json, os, pathlib, stat, sys, zipfile

SCHEMA = "stellar-forge.rozo-delivery.v1"
def digest_file(path):
    h=hashlib.sha256(); size=0
    with open(path,"rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""): h.update(chunk); size+=len(chunk)
    return size,h.hexdigest()
def name_ok(name):
    p=pathlib.PurePosixPath(name)
    if not name or "\\" in name or name.startswith("/") or any(x in ("",".","..") for x in name.split("/")) or str(p)!=name:
        raise ValueError("Unsafe original member: "+name)
    return name
def checked(root,name):
    at=root
    for part in name_ok(name).split("/"):
        at=at/part
        if at.is_symlink(): raise ValueError("Source member contains a symbolic link: "+name)
    if not at.is_file(): raise ValueError("Missing ordinary source member: "+name)
    return at
def read_manifest(root):
    raw=checked(root,"DELIVERY.json").read_bytes(); m=json.loads(raw)
    if m.get("schema")!=SCHEMA or not isinstance(m.get("files"),list): raise ValueError("Incomplete original delivery")
    seen=set()
    for row in m["files"]:
        name=name_ok(row["path"])
        if name in seen or name=="DELIVERY.json": raise ValueError("Duplicate or recursive manifest member")
        seen.add(name)
        if digest_file(checked(root,name))!=(row["bytes"],row["sha256"]): raise ValueError("Original member differs: "+name)
    return raw,m,seen
def pack(directory,out):
    root=pathlib.Path(directory).resolve(); raw,m,names=read_manifest(root)
    out=pathlib.Path(out).absolute(); out.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if out.exists():
        verify(out)
        with zipfile.ZipFile(out) as z:
            if z.read("DELIVERY.json")!=raw: raise ValueError("Existing archive belongs to another original delivery")
        return {"path":str(out),"bytes":digest_file(out)[0],"sha256":digest_file(out)[1],"reused":True}
    tmp=out.with_name(out.name+".partial")
    if tmp.exists():
        try:
            verify(tmp)
            with zipfile.ZipFile(tmp) as z:
                if z.read("DELIVERY.json")!=raw: raise ValueError("Partial archive identity differs")
            os.replace(tmp,out)
            size,sha=digest_file(out); return {"path":str(out),"bytes":size,"sha256":sha,"reused":True}
        except (ValueError,KeyError,zipfile.BadZipFile,EOFError): tmp.unlink()
    with open(tmp,"xb") as handle:
        os.chmod(tmp,0o600)
        with zipfile.ZipFile(handle,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
            for name in sorted(names|{"DELIVERY.json"}):
                file=checked(root,name); info=zipfile.ZipInfo(name,date_time=(2026,10,12,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED; info.external_attr=(stat.S_IFREG|0o600)<<16
                with z.open(info,"w",force_zip64=True) as target, open(file,"rb") as source:
                    for chunk in iter(lambda:source.read(1024*1024),b""): target.write(chunk)
        handle.flush(); os.fsync(handle.fileno())
    verify(tmp); os.replace(tmp,out)
    size,sha=digest_file(out); return {"path":str(out),"bytes":size,"sha256":sha,"reused":False}
def verify(path):
    with zipfile.ZipFile(path) as z:
        entries=z.infolist(); seen=set()
        for i in entries:
            name_ok(i.filename)
            mode=i.external_attr>>16
            if i.filename in seen or i.is_dir() or stat.S_ISLNK(mode): raise ValueError("Repeated or non-file archive member")
            seen.add(i.filename)
        if "DELIVERY.json" not in seen: raise ValueError("The full delivery manifest is absent")
        if z.getinfo("DELIVERY.json").file_size>64*1024*1024: raise ValueError("Manifest too large")
        raw=z.read("DELIVERY.json"); m=json.loads(raw)
        if m.get("schema")!=SCHEMA: raise ValueError("Wrong original delivery schema")
        declared={"DELIVERY.json"}; total=0
        for row in m.get("files",[]):
            name=name_ok(row["path"])
            if name in declared: raise ValueError("Repeated declaration")
            declared.add(name)
            info=z.getinfo(name)
            if info.file_size!=row["bytes"]: raise ValueError("Original member size differs: "+name)
            h=hashlib.sha256(); size=0
            with z.open(info) as source:
                for chunk in iter(lambda:source.read(1024*1024),b""): h.update(chunk); size+=len(chunk)
            if size!=row["bytes"] or h.hexdigest()!=row["sha256"]: raise ValueError("Original member hash differs: "+name)
            total+=size
        if declared!=seen: raise ValueError("Archive and original manifest have different members")
        return {"schema":SCHEMA,"deliveryId":m["deliveryId"],"workspace":m["workspace"],"mode":m["mode"],"files":len(declared),"sourceBytes":total,"manifestSha256":hashlib.sha256(raw).hexdigest()}
def receive(path,directory,expected):
    archive=pathlib.Path(path).absolute()
    size,sha=digest_file(archive)
    if expected and sha!=expected: raise ValueError("The selected original archive differs")
    checked_summary=verify(archive); root=pathlib.Path(directory).absolute()
    if root.is_symlink(): raise ValueError("Choose an ordinary receiving directory")
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    if any(root.iterdir()):
        receipt=root/"RECEIVE_INTENT.json"
        if not receipt.is_file() or json.loads(receipt.read_text()).get("sha256")!=sha:
            raise ValueError("The receiving directory already belongs to another operation")
    intent=root/"RECEIVE_INTENT.json"
    if not intent.exists():
        with open(intent,"x") as out: os.chmod(intent,0o600); json.dump({"sha256":sha,"bytes":size},out);out.write("\n");out.flush();os.fsync(out.fileno())
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            target=root.joinpath(*name_ok(info.filename).split("/"))
            target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
            at=root
            for part in info.filename.split("/")[:-1]:
                at=at/part
                if at.is_symlink(): raise ValueError("Unsafe receiving directory")
            if target.exists():
                if target.is_symlink() or not target.is_file(): raise ValueError("Receiving member is not an ordinary file")
                with z.open(info) as stream: expected_hash=hashlib.file_digest(stream,"sha256").hexdigest()
                if digest_file(target)!=(info.file_size,expected_hash): raise ValueError("Existing received bytes differ: "+info.filename)
                continue
            temporary=target.with_name(target.name+".rozo-partial")
            if temporary.exists(): temporary.unlink()
            with open(temporary,"xb") as out,z.open(info) as source:
                os.chmod(temporary,0o600)
                for chunk in iter(lambda:source.read(1024*1024),b""): out.write(chunk)
                out.flush(); os.fsync(out.fileno())
            os.replace(temporary,target)
    read_manifest(root)
    receipt={"schema":"stellar-forge.rozo-archive-received.v1","bytes":size,"sha256":sha,**checked_summary}
    file=root/"RECEIVED_ARCHIVE.json"
    if not file.exists():
        with open(file,"x") as out: os.chmod(file,0o600); json.dump(receipt,out,sort_keys=True);out.write("\n");out.flush();os.fsync(out.fileno())
    return {**receipt,"directory":str(root)}
def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest="command",required=True)
    a=sub.add_parser("pack");a.add_argument("--directory",required=True);a.add_argument("--out",required=True)
    a=sub.add_parser("verify");a.add_argument("--archive",required=True)
    a=sub.add_parser("receive");a.add_argument("--archive",required=True);a.add_argument("--directory",required=True);a.add_argument("--sha256")
    a=p.parse_args()
    result=pack(a.directory,a.out) if a.command=="pack" else verify(a.archive) if a.command=="verify" else receive(a.archive,a.directory,a.sha256)
    print(json.dumps(result,sort_keys=True))
if __name__=="__main__":main()
