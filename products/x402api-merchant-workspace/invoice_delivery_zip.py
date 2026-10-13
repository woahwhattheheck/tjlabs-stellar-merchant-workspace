#!/usr/bin/env python3
"""Stream a complete original invoice delivery into a standard ZIP."""
import hashlib,json,os,pathlib,stat,sys,zipfile
def need(value,code):
    if not value:raise RuntimeError(code)
def inspect(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        need(stat.S_ISREG(info.st_mode),"INVOICE_DELIVERY_SOURCE_FILE")
        return fd,info
    except BaseException:
        os.close(fd);raise
def same(a,b):return(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_dev,b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns)
def main():
    raw=sys.stdin.buffer.read(1048577);need(len(raw)<=1048576,"INVOICE_DELIVERY_REQUEST_LIMIT")
    request=json.loads(raw);directory=pathlib.Path(request["directory"])
    info=os.lstat(directory)
    need(directory.is_absolute() and directory.resolve()==directory and stat.S_ISDIR(info.st_mode) and not info.st_mode&0o077 and info.st_uid==os.getuid(),"INVOICE_DELIVERY_PRIVATE_DIRECTORY")
    files=request["files"];need(4<=len(files)<=6,"INVOICE_DELIVERY_MEMBER_COUNT")
    names=[f["name"] for f in files];need(len(set(names))==len(names),"INVOICE_DELIVERY_DUPLICATE_MEMBER")
    need(set(["index.html","invoice.json","README.txt","MANIFEST.json"]).issubset(names),"INVOICE_DELIVERY_COMPLETE_MEMBERS")
    target=directory/"invoice-delivery.zip";pending=directory/"invoice-delivery.partial"
    fd=os.open(pending,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        with os.fdopen(fd,"wb") as output:
            with zipfile.ZipFile(output,"w",compression=zipfile.ZIP_STORED,allowZip64=True) as archive:
                for item in sorted(files,key=lambda f:f["name"]):
                    name=item["name"];parts=pathlib.PurePosixPath(name).parts
                    need(name and "\\" not in name and not name.startswith("/") and all(p not in ("",".","..") for p in parts),"INVOICE_DELIVERY_MEMBER_PATH")
                    expected=item["bytes"];need(isinstance(expected,int) and 0<=expected<=1073741824,"INVOICE_DELIVERY_MEMBER_SIZE")
                    source,original=inspect(item["path"])
                    digest=hashlib.sha256();count=0
                    try:
                        need(original.st_size==expected,"INVOICE_DELIVERY_SOURCE_SIZE")
                        metadata=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));metadata.compress_type=zipfile.ZIP_STORED
                        metadata.external_attr=(stat.S_IFREG|0o600)<<16
                        with archive.open(metadata,"w",force_zip64=expected>=2147483648) as out:
                            while True:
                                block=os.read(source,1048576)
                                if not block:break
                                count+=len(block);need(count<=expected,"INVOICE_DELIVERY_SOURCE_GREW");digest.update(block);out.write(block)
                        need(count==expected and digest.hexdigest()==item["sha256"] and same(original,os.fstat(source)),"INVOICE_DELIVERY_SOURCE_CHANGED")
                    finally:os.close(source)
            output.flush();os.fsync(output.fileno())
        os.link(pending,target);os.unlink(pending)
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
        digest=hashlib.sha256()
        with target.open("rb") as complete:
            for block in iter(lambda:complete.read(1048576),b""):digest.update(block)
        print(json.dumps({"path":str(target),"bytes":target.stat().st_size,"sha256":digest.hexdigest()},separators=(",",":")))
    finally:
        if pending.exists():pending.unlink()
if __name__=="__main__":
    try:main()
    except BaseException as error:
        print(json.dumps({"error":str(error)[:200]}),file=sys.stderr);sys.exit(1)
