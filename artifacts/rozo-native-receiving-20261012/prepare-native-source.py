#!/usr/bin/env python3
"""Materialize the exact selected ROZO source; this does not open a workspace."""
import argparse, hashlib, json, os, tarfile, uuid
from pathlib import Path

PRODUCT="stellar/scf-starforge-20261009/sf30-seller-sdk/rozo-payments"
OPERATION="ROZO-MERCHANT-SETTLEMENT-COMMISSIONING-20261012"

def sha256(raw):
    return hashlib.sha256(raw).hexdigest()

def ordinary(path):
    if path.is_symlink() or not path.is_file():
        raise ValueError("Retain an ordinary original file: "+str(path))
    return path.read_bytes()

def relative(value):
    if not isinstance(value,str) or "\\" in value or value.startswith("/") or any(p in ("",".","..") for p in value.split("/")):
        raise ValueError("Unsafe selected source path")
    return Path(value)

def identity(row, raw, git=False):
    if len(raw)!=row["bytes"] or sha256(raw)!=row["sha256"]:
        raise ValueError("Selected original bytes differ: "+row["path"])
    blob=row.get("gitBlob") or row.get("sha")
    if git and blob and hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=blob:
        raise ValueError("Selected original Git identity differs: "+row["path"])

def put_original(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    if path.exists() or path.is_symlink():
        if ordinary(path)!=raw:
            raise ValueError("A retained source member differs: "+str(path))
        return
    temp=path.with_name(path.name+".source-"+uuid.uuid4().hex)
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,"wb") as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        try:
            os.link(temp,path)
        except FileExistsError:
            if ordinary(path)!=raw:
                raise ValueError("A concurrent original source member differs: "+str(path))
    finally:
        temp.unlink()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet",required=True)
    parser.add_argument("--packet-sha256",required=True)
    parser.add_argument("--archive",required=True)
    parser.add_argument("--checkout",required=True,help="Existing published PR812 checkout at the packet's exact commit")
    parser.add_argument("--directory",required=True,help="Owned source directory, empty or this same retained source")
    args=parser.parse_args()
    raw=ordinary(Path(args.packet))
    if sha256(raw)!=args.packet_sha256:
        raise ValueError("The exact portable source packet differs")
    data=json.loads(raw)
    if data["schema"]!="stellar-forge.rozo-portable-source-input.v1" or data["operationId"]!=OPERATION:
        raise ValueError("Select the original ROZO operation")
    archive=Path(args.archive)
    if archive.stat().st_size!=data["archive"]["bytes"]:
        raise ValueError("The original distribution archive size differs")
    digest=hashlib.sha256()
    with archive.open("rb") as stream:
        for part in iter(lambda:stream.read(1024*1024),b""):
            digest.update(part)
    if digest.hexdigest()!=data["archive"]["sha256"]:
        raise ValueError("The original distribution archive hash differs")
    root=Path(args.directory).resolve()
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    checkout=Path(args.checkout).resolve()
    selected={}
    with tarfile.open(archive,"r:gz") as package:
        members={}
        for member in package.getmembers():
            if member.name in members:
                raise ValueError("Duplicate original package member: "+member.name)
            members[member.name]=member
        for row in data["baseFiles"]:
            name="package/source/"+row["path"]
            member=members.get(name)
            if member is None or not member.isfile() or member.issym() or member.islnk():
                raise ValueError("Missing original shared source: "+name)
            body=package.extractfile(member).read()
            identity(row,body,True)
            selected[row["path"]]=body
        license_member=members.get("package/LICENSE")
        if license_member is None or not license_member.isfile():
            raise ValueError("Retain the original package licence")
        selected["LICENSE"]=package.extractfile(license_member).read()
    for row in data["sharedFiles"]:
        body=row["content"].encode("utf-8")
        identity(row,body)
        selected[row["path"]]=body
    for row in data["publishedFiles"]:
        body=ordinary(checkout/relative(row["path"]))
        identity(row,body,True)
        selected[row["path"]]=body
    for row in data["postimages"]:
        body=row["content"].encode("utf-8")
        identity(row,body)
        selected[row["path"]]=body
    for name,body in sorted(selected.items()):
        put_original(root/relative(name),body)
    rows=[{"path":name,"bytes":len(body),"sha256":sha256(body)} for name,body in sorted(selected.items())]
    manifest={"schema":"stellar-forge.rozo-installed-source.v1","source":{
        "publishedProductCommit":data["publishedSource"],
        "baseArchiveSha256":data["archive"]["sha256"],
        "nativeInputSha256":data["originalInputSha256"],
        "status":data["sourceStatus"]},"files":rows}
    manifest_path=root/PRODUCT/"INSTALLED_SOURCE.json"
    manifest_raw=(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode()
    put_original(manifest_path,manifest_raw)
    observed={p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    if observed!=set(selected)|{PRODUCT+"/INSTALLED_SOURCE.json"}:
        raise ValueError("Source directory contains unselected files")
    print(json.dumps({"schema":"stellar-forge.rozo-native-source-received.v1","operationId":OPERATION,
        "sourceRoot":str(root),"sourceManifest":str(manifest_path),"sourceFiles":len(rows),
        "sourceBytes":sum(row["bytes"] for row in rows),"manifestSha256":sha256(manifest_raw),
        "packetSha256":sha256(raw),"cli":str(root/PRODUCT/"cli.mjs")},separators=(",",":")))

if __name__=="__main__":
    main()
