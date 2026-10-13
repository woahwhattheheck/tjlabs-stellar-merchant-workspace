#!/usr/bin/env python3
"""Stream the original Econdb operator directory through an ordinary ZIP container."""
from __future__ import annotations
import argparse, hashlib, json, os, re, stat, uuid, zipfile
from pathlib import Path
CHUNK=1024*1024
MAX_MANIFEST=16*1024*1024
# Above every possible row count in a valid 16 MiB original manifest.
MAX_MEMBERS=250000

def need(ok,message):
    if not ok: raise ValueError(message)

def ordinary(name):
    return isinstance(name,str) and bool(name) and len(name)<=4096 and not name.startswith("/") and not any(ord(c)<32 or ord(c)==127 or c in "\\:" for c in name) and all(p not in ("",".","..") for p in name.split("/"))

def directory(path):
    path=Path(os.path.abspath(path));path.mkdir(mode=0o700,parents=True,exist_ok=True);s=path.lstat()
    need(stat.S_ISDIR(s.st_mode) and not s.st_mode&0o077 and s.st_uid==os.getuid() and path.resolve()==path,"Use a private owned directory without symbolic links.")
    return path

def private_temporary(folder,prefix):
    path=folder/(prefix+str(uuid.uuid4()))
    return os.open(path,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),str(path)

def sync(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)

def identity(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(fd);need(stat.S_ISREG(before.st_mode),"Use regular original files.")
        h=hashlib.sha256();n=0
        while True:
            b=os.read(fd,CHUNK)
            if not b: break
            n+=len(b);h.update(b)
        after=os.fstat(fd);named=os.lstat(path)
        need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and (named.st_dev,named.st_ino)==(before.st_dev,before.st_ino) and n==before.st_size,"Original file changed while reading.")
        return {"bytes":n,"sha256":h.hexdigest()}
    finally: os.close(fd)

def settle_owned_link(path,folder,prefix,expected):
    """Reconcile only this publisher's exact temporary aliases after a killed link."""
    need(identity(path)==expected,"The retained original publication differs.")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        bound=os.fstat(fd)
        need(stat.S_ISREG(bound.st_mode) and bound.st_uid==os.getuid() and not bound.st_mode&0o077,"Keep the private original publication.")
        if bound.st_nlink>1:
            for candidate in folder.iterdir():
                if not re.fullmatch(re.escape(prefix)+r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}",candidate.name): continue
                try: item=candidate.lstat()
                except FileNotFoundError: continue
                if (item.st_dev,item.st_ino)!=(bound.st_dev,bound.st_ino): continue
                need(stat.S_ISREG(item.st_mode) and item.st_uid==os.getuid() and not item.st_mode&0o077 and identity(candidate)==expected,"An original temporary publication changed.")
                candidate.unlink();sync(folder)
        named=path.lstat();after=os.fstat(fd)
        need((named.st_dev,named.st_ino)==(bound.st_dev,bound.st_ino) and after.st_nlink==1 and identity(path)==expected,"Unknown aliases remain on the original publication.")
    finally: os.close(fd)

def bounded_read(path,limit):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(fd);need(stat.S_ISREG(before.st_mode) and before.st_size<=limit,"Original metadata exceeds its declared capacity.")
        data=bytearray()
        while len(data)<=limit:
            part=os.read(fd,min(CHUNK,limit-len(data)+1))
            if not part: break
            data.extend(part)
        after=os.fstat(fd);named=os.lstat(path)
        need(len(data)<=limit and len(data)==before.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and (named.st_dev,named.st_ino)==(before.st_dev,before.st_ino),"Original metadata changed while reading.")
        return bytes(data)
    finally: os.close(fd)

def preflight_zip(source):
    """Bound central metadata before ZipFile allocates it.

    The exact operator transport writer produces single-disk, comment-free ZIP/ZIP64 files.
    The fixed ZIP64 end record and its exact directory bounds are retained.
    """
    import struct
    metadata_limit = 64 * 1024 * 1024

    def reject(message):
        raise ValueError("Invalid or unsupported workspace ZIP: " + message)

    size = os.fstat(source.fileno()).st_size

    def read_at(offset, length):
        if offset < 0 or length < 0 or offset + length > size:
            reject("metadata is outside the authenticated file.")
        source.seek(offset)
        data = source.read(length)
        if len(data) != length:
            reject("metadata is truncated.")
        return data

    if size < 22:
        reject("end record is missing.")
    end_offset = size - 22
    end = struct.unpack("<4s4H2IH", read_at(end_offset, 22))
    if end[0] != b"PK\x05\x06" or end[7] != 0:
        reject("the original comment-free end record is missing.")
    _, disk, directory_disk, disk_count, count, directory_size, directory_offset, _ = end
    if disk != 0 or directory_disk != 0 or disk_count != count:
        reject("split-disk archives are not workspace backups.")
    directory_end = end_offset
    locator = read_at(end_offset - 20, 20) if end_offset >= 20 else b""
    if locator[:4] == b"PK\x06\x07":
        _, locator_disk, zip64_offset, total_disks = struct.unpack("<4sIQI", locator)
        if locator_disk != 0 or total_disks != 1:
            reject("the ZIP64 locator describes more than one disk.")
        if zip64_offset + 56 != end_offset - 20:
            reject("the ZIP64 end record has an unsupported layout.")
        record = struct.unpack("<4sQ2H2I4Q", read_at(zip64_offset, 56))
        (signature, record_size, _made, _needed, disk64, directory_disk64,
         disk_count64, count64, directory_size64, directory_offset64) = record
        if signature != b"PK\x06\x06" or record_size != 44:
            reject("the ZIP64 end record is invalid.")
        if disk64 != 0 or directory_disk64 != 0 or disk_count64 != count64:
            reject("the ZIP64 directory spans multiple disks.")
        if (disk_count != min(disk_count64, 0xffff)
                or count != min(count64, 0xffff)
                or directory_size != min(directory_size64, 0xffffffff)
                or directory_offset != min(directory_offset64, 0xffffffff)):
            reject("the ZIP and ZIP64 end records disagree.")
        count, directory_size, directory_offset = count64, directory_size64, directory_offset64
        directory_end = zip64_offset
    elif directory_size == 0xffffffff or directory_offset == 0xffffffff:
        reject("the required ZIP64 locator is missing.")
    if not 2 <= count <= MAX_MEMBERS:
        reject("file count exceeds the workspace limit.")
    if not 46 * count <= directory_size <= metadata_limit:
        reject("central-directory metadata exceeds its limit or is incomplete.")
    if directory_offset < 4 or directory_offset + directory_size != directory_end:
        reject("central-directory bounds disagree with the end record.")
    if read_at(0, 4) != b"PK\x03\x04":
        reject("prepended data is not part of a workspace backup.")
    cursor = directory_offset
    actual_count = 0
    while cursor < directory_end:
        if actual_count >= MAX_MEMBERS or cursor + 46 > directory_end:
            reject("central-directory entry count or length is invalid.")
        header = read_at(cursor, 46)
        if header[:4] != b"PK\x01\x02":
            reject("central-directory entry signature is invalid.")
        name_length, extra_length, comment_length, start_disk = struct.unpack_from("<4H", header, 28)
        local_offset = struct.unpack_from("<I", header, 42)[0]
        if not name_length or start_disk != 0:
            reject("a central-directory entry has no name or belongs to another disk.")
        if local_offset != 0xffffffff and local_offset >= directory_offset:
            reject("a member's local header is outside the data region.")
        cursor += 46 + name_length + extra_length + comment_length
        if cursor > directory_end:
            reject("a central-directory entry extends past its declared boundary.")
        actual_count += 1
    if cursor != directory_end or actual_count != count:
        reject("the actual central-directory entry count disagrees.")
    return {"files": count, "central_directory_bytes": directory_size}



def unique(pairs):
    d={}
    for k,v in pairs:
        need(k not in d,"Duplicate JSON field.");d[k]=v
    return d

def manifest(raw):
    need(len(raw)<=MAX_MANIFEST,"Original operator manifest exceeds its native 16 MiB capacity.")
    d=json.loads(raw.decode("utf-8"),object_pairs_hook=unique)
    need(d.get("schema")=="econdb.operator-transfer.v1" and isinstance(d.get("files"),list),"Use the original complete operator transfer.")
    rows={}
    for r in d["files"]:
        p=r.get("path");need(ordinary(p) and "workspace/"+p not in rows,"Distinct original transfer paths are required.")
        need(type(r.get("bytes")) is int and 0<=r["bytes"]<=9007199254740991 and isinstance(r.get("sha256"),str) and len(r["sha256"])==64 and all(c in "0123456789abcdef" for c in r["sha256"]),"Retain exact original member identities.")
        rows["workspace/"+p]={"bytes":r["bytes"],"sha256":r["sha256"]}
    return d,rows

def publish_member(root,name,stream,expected):
    need(ordinary(name),"Unsafe source member.");target=root/name;directory(target.parent)
    try: existing=identity(target)
    except FileNotFoundError: existing=None
    if existing is not None:
        need(existing==expected,"A retained original member differs: "+name);settle_owned_link(target,root.parent,".econdb-member-",expected);return
    fd,tmp=private_temporary(root.parent,".econdb-member-")
    try:
        h=hashlib.sha256();n=0
        with os.fdopen(fd,"wb") as out:
            while True:
                b=stream.read(CHUNK)
                if not b: break
                n+=len(b);need(n<=expected["bytes"],"Expanded member exceeds original size.");h.update(b);out.write(b)
            need({"bytes":n,"sha256":h.hexdigest()}==expected,"Expanded member differs from original identity.")
            out.flush();os.fsync(out.fileno())
        try: os.link(tmp,target)
        except FileExistsError:
            need(identity(target)==expected,"A concurrent original member differs.")
            settle_owned_link(target,root.parent,".econdb-member-",expected)
        sync(target.parent)
    finally:
        try: os.unlink(tmp)
        except FileNotFoundError: pass

def extract(archive,destination,expected):
    root=directory(destination);need(identity(archive)==expected,"The original ZIP differs.")
    fd=os.open(archive,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        with os.fdopen(fd,"rb",closefd=False) as original:
            preflight_zip(original);original.seek(0)
            with zipfile.ZipFile(original) as z:
                infos=z.infolist();names=[i.filename for i in infos]
                need(len(set(names))==len(names) and all(ordinary(n) for n in names),"Keep distinct ordinary ZIP members; explicit directory entries are unnecessary.")
                for i in infos:
                    mode=(i.external_attr>>16)&0xFFFF
                    need(not i.is_dir() and (not stat.S_IFMT(mode) or stat.S_ISREG(mode)) and not i.flag_bits&1,"Only unencrypted regular transport members are accepted.")
                mi=z.getinfo("operator-transfer.json");need(mi.file_size<=MAX_MANIFEST,"Original manifest exceeds capacity.")
                raw=z.read(mi);d,rows=manifest(raw);rows["operator-transfer.json"]={"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()}
                # Optional original receiving binding is preserved byte for byte.
                if "transfer-binding.json" in names:
                    bi=z.getinfo("transfer-binding.json");need(bi.file_size<=MAX_MANIFEST,"Original binding exceeds capacity.")
                    br=z.read(bi);rows["transfer-binding.json"]={"bytes":len(br),"sha256":hashlib.sha256(br).hexdigest()}
                need(set(rows)==set(names),"ZIP must contain every and only original transfer member.")
                for info in infos:
                    need(info.file_size==rows[info.filename]["bytes"],"ZIP member length differs from original manifest.")
                    with z.open(info) as part: publish_member(root,info.filename,part,rows[info.filename])
        after=os.fstat(fd);need((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns),"ZIP changed during extraction.")
    finally: os.close(fd)
    need(identity(archive)==expected,"ZIP changed during extraction.")
    return {"directory":str(root),"workspaceId":d["workspaceId"],"revision":d["revision"],"members":len(rows)}

def pack(source,destination):
    root=Path(source).resolve(strict=True);need(root==Path(os.path.abspath(source)),"Use canonical transfer root.")
    raw=bounded_read(root/"operator-transfer.json",MAX_MANIFEST);d,rows=manifest(raw)
    rows["operator-transfer.json"]={"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()}
    if (root/"transfer-binding.json").exists(): rows["transfer-binding.json"]=identity(root/"transfer-binding.json")
    target=Path(os.path.abspath(destination));directory(target.parent)
    fd,tmp=private_temporary(target.parent,".econdb-archive-")
    try:
        with os.fdopen(fd,"w+b") as out:
            with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as z:
                for name,row in rows.items():
                    path=root/name;need(path.resolve()==path and identity(path)==row,"Original transfer member differs.")
                    info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.external_attr=0o100600<<16;info.file_size=row["bytes"]
                    h=hashlib.sha256();n=0
                    with path.open("rb") as inp,z.open(info,"w",force_zip64=True) as member:
                        for b in iter(lambda:inp.read(CHUNK),b""):n+=len(b);h.update(b);member.write(b)
                    need({"bytes":n,"sha256":h.hexdigest()}==row and identity(path)==row,"Original transfer changed during packing.")
            out.flush();os.fsync(out.fileno())
        got=identity(tmp)
        try: os.link(tmp,target)
        except FileExistsError:
            need(identity(target)==got,"A different original archive is retained.")
            settle_owned_link(target,target.parent,".econdb-archive-",got)
        sync(target.parent);return {"path":str(target),**got}
    finally:
        try: os.unlink(tmp)
        except FileNotFoundError: pass

def main():
    p=argparse.ArgumentParser();p.add_argument("action",choices=["extract","pack"]);p.add_argument("--source",required=True);p.add_argument("--destination",required=True);p.add_argument("--bytes",type=int);p.add_argument("--sha256");a=p.parse_args()
    value=extract(Path(a.source),a.destination,{"bytes":a.bytes,"sha256":a.sha256}) if a.action=="extract" else pack(a.source,a.destination)
    print(json.dumps(value))
if __name__=="__main__":main()
