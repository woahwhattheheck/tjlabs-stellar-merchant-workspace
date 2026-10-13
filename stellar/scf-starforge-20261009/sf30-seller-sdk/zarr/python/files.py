"""Private retained files for the Zarr operator. Array decoding remains upstream."""
from __future__ import annotations
import contextlib, hashlib, json, os, stat
from pathlib import Path, PurePosixPath

class ZarrWorkspaceError(ValueError):
    def __init__(self, code, message, status=400):
        super().__init__(message); self.code=code; self.status=status
def require(condition, code, message, status=400):
    if not condition: raise ZarrWorkspaceError(code,message,status)
def object_fields(value, allowed, required=(), label="request"):
    require(isinstance(value,dict) and not set(value)-set(allowed) and set(required)<=set(value),
            "ZARR_FIELDS","Invalid fields in "+label)
    return value
def encoded(value):
    return (json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(",",":"),allow_nan=False)+"\n").encode()
def digest(data): return hashlib.sha256(data).hexdigest()
def value_digest(value): return digest(encoded(value))
def relative(value, allow_root=False):
    require(isinstance(value,str) and "\x00" not in value and "\\" not in value and len(value)<=2048,
            "ZARR_PATH","Choose a relative source member")
    if allow_root and value=="": return value
    p=PurePosixPath(value)
    require(value and not p.is_absolute() and all(x not in ("",".","..") for x in value.split("/")),
            "ZARR_PATH","Relative member paths must remain inside their store")
    return value
def private_directory(path, create=False):
    path=Path(path)
    require(path.is_absolute(),"ZARR_PATH","Use an absolute private workspace path")
    if create: path.mkdir(mode=0o700,parents=True,exist_ok=True)
    s=path.lstat()
    require(stat.S_ISDIR(s.st_mode) and not path.is_symlink(),"ZARR_PRIVATE_DIRECTORY","Use a real private directory")
    require(not s.st_mode&0o077,"ZARR_PRIVATE_DIRECTORY","The workspace must be private (mode 0700)")
    return path
def sync_directory(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)
def destination(root, rel):
    root=Path(root); rel=relative(rel)
    p=root/rel
    current=root
    for part in PurePosixPath(rel).parts[:-1]:
        current=current/part
        if not current.exists(): current.mkdir(mode=0o700)
        s=current.lstat()
        require(stat.S_ISDIR(s.st_mode) and not current.is_symlink(),"ZARR_PATH","A parent is not a real directory")
    return p
def read_file(path, maximum=1024*1024*1024):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,"ZARR_FILE","Expected a bounded regular file")
        blocks=[]; size=0
        while True:
            block=os.read(fd,min(1024*1024,maximum+1-size))
            if not block: break
            size+=len(block);require(size<=maximum,"ZARR_FILE_LIMIT","File exceeds the declared byte limit");blocks.append(block)
        after=os.fstat(fd)
        require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==
                (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and size==after.st_size,
                "ZARR_FILE_CHANGED","The original file changed while being read",409)
        return b"".join(blocks)
    finally: os.close(fd)
def file_identity(path, maximum=1024*1024*1024):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_size<=maximum,"ZARR_FILE","Expected a bounded regular file")
        h=hashlib.sha256();size=0
        while block:=os.read(fd,1024*1024):
            size+=len(block);require(size<=maximum,"ZARR_FILE_LIMIT","File exceeds its declaration");h.update(block)
        after=os.fstat(fd)
        require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==
                (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and size==after.st_size,
                "ZARR_FILE_CHANGED","The original file changed while being read",409)
        return {"bytes":size,"sha256":h.hexdigest()}
    finally:os.close(fd)
def copy_stream(open_source,target,expected,maximum=1024*1024*1024):
    """Copy exact declared bytes from a fresh original stream with prefix recovery."""
    target=Path(target)
    require(type(expected.get("bytes")) is int and 0<=expected["bytes"]<=maximum and
            isinstance(expected.get("sha256"),str) and len(expected["sha256"])==64,
            "ZARR_COPY_DECLARATION","Use an exact bounded original member identity")
    target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    partial=target.with_name(target.name+".partial")
    if target.exists() or target.is_symlink():
        require(file_identity(target,maximum)==expected,"ZARR_PUBLISHED_CHANGED","Preserve the different completed file",409)
        if partial.exists() or partial.is_symlink():
            a,b=partial.lstat(),target.lstat()
            require(stat.S_ISREG(a.st_mode) and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino),"ZARR_PARTIAL_CONFLICT","Preserve the unrelated original partial",409)
            partial.unlink();sync_directory(target.parent)
        return expected
    offset=0
    with open_source() as original:
        if partial.exists() or partial.is_symlink():
            st=partial.lstat()
            require(stat.S_ISREG(st.st_mode) and st.st_size<=expected["bytes"],"ZARR_PARTIAL_CONFLICT","Preserve the invalid original partial",409)
            previous_fd=os.open(partial,os.O_RDONLY|os.O_NOFOLLOW)
            with os.fdopen(previous_fd,"rb") as previous:
                while block:=previous.read(1024*1024):
                    require(original.read(len(block))==block,"ZARR_PARTIAL_CONFLICT","Preserve the changed original prefix",409)
                    offset+=len(block)
        fd=os.open(partial,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW|(0 if partial.exists() else os.O_CREAT|os.O_EXCL),0o600)
        with os.fdopen(fd,"ab") as out:
            remaining=expected["bytes"]-offset
            while remaining:
                block=original.read(min(1024*1024,remaining))
                require(block,"ZARR_COPY_TRUNCATED","The original complete source ended early",409)
                out.write(block);remaining-=len(block)
            require(not original.read(1),"ZARR_COPY_CHANGED","The original source grew beyond its declared size",409)
            out.flush();os.fsync(out.fileno())
    require(file_identity(partial,maximum)==expected,"ZARR_COPY_CHANGED","The completed original member differs",409)
    os.link(partial,target);sync_directory(target.parent);partial.unlink();sync_directory(target.parent)
    return expected
def copy_file(source,target,expected=None,maximum=1024*1024*1024):
    """Stream immutable complete bytes; recover only a matching original prefix."""
    source=Path(source);selected=file_identity(source,maximum)
    if expected is not None:require(selected==expected,"ZARR_COPY_SOURCE_CHANGED","The retained original file changed",409)
    def open_original():return os.fdopen(os.open(source,os.O_RDONLY|os.O_NOFOLLOW),"rb")
    result=copy_stream(open_original,target,selected,maximum)
    require(file_identity(source,maximum)==selected,"ZARR_COPY_CHANGED","The original file changed while copied",409)
    return result
def read_json(path,maximum=32*1024*1024): return json.loads(read_file(path,maximum))
def publish(path,data):
    """Create-only bytes; adopt exact complete partials and published hardlinks."""
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    pending=path.with_name(path.name+".partial")
    if path.exists() or path.is_symlink():
        require(read_file(path,max(len(data),1))==data,"ZARR_PUBLISHED_CHANGED","Preserve the different completed file",409)
        if pending.exists() or pending.is_symlink():
            a=pending.lstat();b=path.lstat()
            require(stat.S_ISREG(a.st_mode) and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino),
                    "ZARR_PARTIAL_CONFLICT","Preserve the unrelated partial file",409)
            pending.unlink();sync_directory(path.parent)
        return
    if pending.exists() or pending.is_symlink():
        previous=read_file(pending,max(len(data),1))
        require(data.startswith(previous),"ZARR_PARTIAL_CONFLICT","Preserve the changed original partial file",409)
        offset=len(previous);fd=os.open(pending,os.O_WRONLY|os.O_APPEND|os.O_NOFOLLOW)
    else: offset=0;fd=os.open(pending,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"ab") as f:
        f.write(data[offset:]);f.flush();os.fsync(f.fileno())
    require(read_file(pending,max(len(data),1))==data,"ZARR_PARTIAL_CONFLICT","Written bytes differ")
    os.link(pending,path);sync_directory(path.parent);pending.unlink();sync_directory(path.parent)
def atomic_json(path,value):
    path=Path(path);data=encoded(value)
    temp=path.with_name(path.name+".atomic-"+str(os.getpid()))
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(data);f.flush();os.fsync(f.fileno())
    os.replace(temp,path);sync_directory(path.parent)
def tree_manifest(root,maximum_files=100000,maximum_bytes=1024*1024*1024):
    root=Path(root);require(root.is_dir() and not root.is_symlink(),"ZARR_STORE","Use a real store directory")
    rows=[];total=0
    for base,dirs,names in os.walk(root,followlinks=False):
        for d in dirs:require(not (Path(base)/d).is_symlink(),"ZARR_STORE_LINK","Retain external links separately before importing")
        for name in sorted(names):
            p=Path(base)/name;rel=p.relative_to(root).as_posix();relative(rel)
            item=file_identity(p,maximum_bytes)
            total+=item["bytes"];require(len(rows)<maximum_files and total<=maximum_bytes,"ZARR_STORE_LIMIT","The complete store exceeds its declared limits")
            rows.append({"path":rel,**item})
    return sorted(rows,key=lambda x:x["path"])
def verify_tree(root,rows):
    actual=tree_manifest(root,maximum_files=max(len(rows),1),maximum_bytes=max(sum(x["bytes"] for x in rows),1))
    require(actual==rows,"ZARR_RETAINED_STORE_CHANGED","The retained complete store changed",409)
