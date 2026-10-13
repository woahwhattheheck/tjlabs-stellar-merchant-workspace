#!/usr/bin/env python3
"""MIT. Publish and re-open the exact ordinary members of a comparison handover."""
from __future__ import annotations
import argparse, hashlib, json, os, stat, tempfile, zipfile
from pathlib import Path, PurePosixPath
MAXIMUM=256*1024*1024
CHUNK=1024*1024
def need(ok,message):
    if not ok: raise ValueError(message)
def identity(path):
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(descriptor);need(stat.S_ISREG(before.st_mode) and before.st_size<=MAXIMUM,"Ordinary bounded source required")
        h=hashlib.sha256();total=0
        while True:
            part=os.read(descriptor,CHUNK)
            if not part:break
            h.update(part);total+=len(part);need(total<=MAXIMUM,"Source too large")
        after=os.fstat(descriptor)
        stamp=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_mode)
        need(total==before.st_size and stamp(before)==stamp(after),"Source changed")
        return {"bytes":total,"sha256":h.hexdigest()}
    finally:os.close(descriptor)
def selection(directory):
    raw=(directory/"manifest.json").read_bytes();need(len(raw)<=1048576,"Manifest too large")
    value=json.loads(raw);need(value.get("schema")=="sf88-research-comparison-handover/v1","Original manifest required")
    rows=[{"path":"manifest.json",**identity(directory/"manifest.json")},*value["files"]]
    names=set()
    for row in rows:
        name=row["path"];p=PurePosixPath(name)
        need(not p.is_absolute() and str(p)==name and "\\" not in name and all(x not in (".","..","") for x in p.parts) and
             all(ord(c)>=32 and ord(c)!=127 for c in name) and name not in names,"Safe unique member required")
        names.add(name);need(identity(directory/name)=={k:row[k] for k in ("bytes","sha256")},"Original member changed")
    need(sum(x["bytes"] for x in rows)<=MAXIMUM,"Complete source exceeds 256 MiB")
    return rows
def verify(directory,archive,rows):
    before=identity(archive)
    with zipfile.ZipFile(archive) as z:
        entries=z.infolist()
        need([x.filename for x in entries]==[x["path"] for x in rows],"Complete ordered inventory required")
        for info,row in zip(entries,rows):
            need(not info.is_dir() and not info.flag_bits&1 and stat.S_ISREG(info.external_attr>>16) and
                 stat.S_IMODE(info.external_attr>>16)==0o600 and info.file_size==row["bytes"],"Ordinary original member required")
            total=0;h=hashlib.sha256()
            with z.open(info) as incoming:
                while True:
                    part=incoming.read(CHUNK)
                    if not part:break
                    total+=len(part);need(total<=row["bytes"],"Member size differs");h.update(part)
            need(total==row["bytes"] and h.hexdigest()==row["sha256"],"Member bytes differ")
            need(identity(directory/row["path"])=={k:row[k] for k in ("bytes","sha256")},"Current original member differs")
    need(identity(archive)==before,"Archive changed")
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--directory",required=True)
    group=p.add_mutually_exclusive_group(required=True);group.add_argument("--out");group.add_argument("--verify");a=p.parse_args()
    directory=Path(a.directory).resolve(strict=True);rows=selection(directory)
    if a.verify:verify(directory,Path(a.verify),rows);return
    out=Path(a.out).absolute();out.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix=".comparison-archive-",dir=out.parent);temporary=Path(name)
    try:
        with os.fdopen(fd,"w+b") as output:
            with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
                for row in rows:
                    info=zipfile.ZipInfo(row["path"],(1980,1,1,0,0,0));info.create_system=3
                    info.external_attr=(stat.S_IFREG|0o600)<<16;info.compress_type=zipfile.ZIP_DEFLATED
                    h=hashlib.sha256();total=0
                    with open(directory/row["path"],"rb") as incoming,z.open(info,"w",force_zip64=True) as target:
                        while True:
                            part=incoming.read(CHUNK)
                            if not part:break
                            total+=len(part);need(total<=row["bytes"],"Member changed");h.update(part);target.write(part)
                    need(total==row["bytes"] and h.hexdigest()==row["sha256"],"Member changed")
            output.flush();os.fsync(output.fileno())
        verify(directory,temporary,rows)
        try:os.link(temporary,out)
        except FileExistsError:verify(directory,out,rows)
        parent=os.open(out.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(parent)
        finally:os.close(parent)
    finally:temporary.unlink(missing_ok=True)
if __name__=="__main__":main()
