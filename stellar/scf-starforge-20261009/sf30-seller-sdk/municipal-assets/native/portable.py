"""Complete stopped-workspace handover using the original consistent SQLite backup."""
from __future__ import annotations
from contextlib import contextmanager
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import stat
import tempfile
import zipfile

SCHEMA = "stellar-forge.municipal-asset-handover.v1"
MAXIMUM = 2 * 1024**3
def need(value, message):
    if not value: raise ValueError(message)
def sha(body):
    return hashlib.sha256(body).hexdigest()
def wire(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False)+"\n").encode()
def read(path, maximum=MAXIMUM):
    path=Path(path)
    need(not path.is_symlink(), "Use original regular files: "+str(path))
    with path.open("rb") as stream:
        before=os.fstat(stream.fileno())
        need(stat.S_ISREG(before.st_mode) and before.st_nlink==1 and before.st_size<=maximum,
             "The selected file exceeds its complete regular-file contract")
        body=stream.read(maximum+1);after=os.fstat(stream.fileno())
    need(len(body)==before.st_size and (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==
         (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),"The original file changed during reading")
    return body
def safe(name):
    need(isinstance(name,str) and not name.startswith(("/","\\")) and "\\" not in name and
         ":" not in name and not any(ord(ch)<32 or ord(ch)==127 for ch in name) and
         all(p and p not in (".","..") for p in name.split("/")),"Invalid complete package member")
    return name
def atomic(path, body):
    path=Path(path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    if path.exists():
        need(read(path)==body,"Preserve the differing original output: "+str(path));return
    fd,temporary=tempfile.mkstemp(prefix=".municipal-retain-",dir=path.parent)
    try:
        with os.fdopen(fd,"wb") as stream:
            os.chmod(temporary,0o600);stream.write(body);stream.flush();os.fsync(stream.fileno())
        try:os.link(temporary,path)
        except FileExistsError:need(read(path)==body,"Concurrent complete output differs")
    finally:Path(temporary).unlink(missing_ok=True)
def sidecars(root):
    selected=[]
    for path in sorted(root.rglob("*")):
        relative=path.relative_to(root).as_posix()
        if relative.split("/")[0] not in ("capture-operations","public-refresh","managed-receiving"):
            continue
        need(not path.is_symlink(),"Retain original source files; symlink found: "+relative)
        if path.is_dir():continue
        if relative in ("workspace.sqlite3","workspace.sqlite3-wal","workspace.sqlite3-shm","operator-password.txt"):
            continue
        if path.name.endswith(".lock") or path.name=="operator-password.txt":continue
        selected.append((relative,read(path)))
    return selected
def inspect_archive(body):
    need(len(body)<=MAXIMUM,"Complete handover exceeds 2 GiB")
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        entries=archive.infolist()
        need(len(entries)<=100000 and len({x.filename for x in entries})==len(entries),
             "The complete package has repeated or excessive members")
        need(sum(x.file_size for x in entries)<=MAXIMUM,"Unpacked handover exceeds 2 GiB")
        for item in entries:
            safe(item.filename)
            need(not item.is_dir() and not (item.flag_bits & 1) and
                 stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFREG),
                 "Read an original unencrypted regular-file package")
        values={x.filename:archive.read(x) for x in entries}
    need("HANDOVER.json" in values,"Open the complete municipal handover")
    manifest=json.loads(values.pop("HANDOVER.json"))
    need(manifest.get("schema")==SCHEMA and isinstance(manifest.get("files"),list),
         "Unsupported complete municipal handover")
    names=set()
    for row in manifest["files"]:
        name=safe(row["path"])
        need(name not in names and name in values,"Package selection differs")
        names.add(name);value=values[name]
        need(len(value)==row["bytes"] and sha(value)==row["sha256"],"Complete member differs: "+name)
        need(name=="database.zip" or name.startswith("original/"),"Unsupported complete member")
    need(names==set(values) and "database.zip" in names,"Preserve every original selected member")
    return manifest,values
def database_projects(backup):
    from workspace.engine import restore_backup,Workspace
    with tempfile.TemporaryDirectory(prefix="municipal-snapshot-inspection-") as folder:
        folder=Path(folder);source=folder/"database.zip"
        source.write_bytes(backup)
        restore_backup(source,folder/"workspace")
        return Workspace(folder/"workspace").projects()
def handover(directory, output, operation, source_sha, inspection):
    from workspace.engine import Workspace
    from workspace.capture_intake import locked
    root=Path(directory).resolve();output=Path(output).absolute()
    need(not output.is_relative_to(root),"Save the complete handover outside its original workspace")
    need(isinstance(operation,str) and 1<=len(operation)<=100,"Retain a named original handover operation")
    folder=root/"managed-handover"/sha(operation.encode())
    folder.mkdir(mode=0o700,parents=True,exist_ok=True)
    with locked(root/".managed-server.lock"), locked(folder/"operation.lock"):
        binding={"operation":operation,"directory":str(root),"output":str(output),
                 "workspace":inspection["binding"]["workspace"],"source_sha256":source_sha}
        request=folder/"request.json"
        atomic(request,wire(binding))
        retained=folder/"complete.zip"
        if retained.exists():
            body=read(retained);manifest,values=inspect_archive(body)
            need(manifest.get("binding")==binding,"Retain this original handover selection")
        else:
            workspace=Workspace(root)
            before=sidecars(root)
            # SQLite's native backup retains all project, original input, Maximo and request history.
            values={"database.zip":workspace.backup()}
            values.update({"original/"+name:value for name,value in before})
            after=sidecars(root)
            need([(n,sha(b)) for n,b in before]==[(n,sha(b)) for n,b in after],
                 "Stop the original external workers before saving their whole handover")
            manifest={"schema":SCHEMA,"binding":binding,
                      "origin_directory":str(root),"workspace":inspection["binding"]["workspace"],
                      "projects":database_projects(values["database.zip"]),
                      "files":[]}
            manifest["files"]=[{"path":name,"bytes":len(value),"sha256":sha(value)}
                               for name,value in sorted(values.items())]
            values["HANDOVER.json"]=wire(manifest)
            need(sum(map(len,values.values()))<=MAXIMUM,"Complete handover exceeds 2 GiB")
            body=Workspace._zip(values);inspect_archive(body)
            atomic(retained,body)
        atomic(output,body)
        receipt={"schema":SCHEMA,"state":"completed","operation":operation,
                 "file":str(output),"bytes":len(body),"sha256":sha(body),
                 "workspace":manifest["workspace"],"projects":manifest["projects"]}
        atomic(folder/"result.json",wire(receipt))
        return receipt
def receive(package, destination, source_sha, inspect_workspace):
    from workspace.engine import Workspace,restore_backup
    from workspace.capture_intake import locked
    package=Path(package).absolute();destination=Path(destination).absolute()
    need(destination==destination.resolve(),"Choose a real original receiving parent")
    body=read(package);manifest,values=inspect_archive(body)
    destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    binding={"schema":SCHEMA,"archive_sha256":sha(body),"archive_bytes":len(body),
             "destination":str(destination),"source_sha256":source_sha,
             "origin_directory":manifest["origin_directory"],"workspace":manifest["workspace"]}
    marker_name="managed-receiving/receiving.json"
    lockfile=destination.parent/(".municipal-receive-"+sha(str(destination).encode())+".lock")
    with locked(lockfile):
        if destination.exists():
            marker=destination/marker_name
            need(marker.is_file() and json.loads(read(marker))==binding,
                 "Preserve this existing workspace; continue its original complete receiving")
            current=inspect_workspace(destination)
            need(current["binding"]["workspace"]==manifest["workspace"],
                 "The received workspace identity changed")
            return {"schema":SCHEMA,"state":"received","replayed":True,
                    "binding":binding,"inspection":current}
        with tempfile.TemporaryDirectory(prefix=".municipal-receive-",dir=destination.parent) as temporary:
            temporary=Path(temporary);staged=temporary/"workspace"
            backup=temporary/"database.zip";backup.write_bytes(values["database.zip"])
            restore_backup(backup,staged)
            for name,value in values.items():
                if name=="database.zip":continue
                relative=safe(name.removeprefix("original/"))
                need(relative not in ("workspace.sqlite3","operator-password.txt") and
                     not relative.startswith("managed-handover/"),
                     "Original member conflicts with the native receiving boundary")
                if relative == marker_name:
                    relative="managed-receiving/parents/"+sha(value)+".json"
                target=staged/relative
                target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                atomic(target,value)
            password=staged/"operator-password.txt"
            atomic(password,(secrets.token_urlsafe(32)+"\n").encode())
            # Verify the original logical identity and full project selection before publication.
            checked=inspect_workspace(staged)
            need(checked["binding"]["workspace"]==manifest["workspace"],
                 "Received database differs from its original managed identity")
            workspace=Workspace(staged)
            need(workspace.projects()==manifest["projects"],"The original saved project selection differs")
            atomic(staged/"managed-receiving/parents"/(sha(body)+"-manifest.json"),wire(manifest))
            atomic(staged/marker_name,wire(binding))
            if destination.exists():raise ValueError("The receiving destination changed during preparation")
            os.rename(staged,destination)
        current=inspect_workspace(destination)
        return {"schema":SCHEMA,"state":"received","replayed":False,
                "binding":binding,"inspection":current}
