"""Complete private source-workspace packets; no array decoding or publisher engine."""
from __future__ import annotations
import contextlib,ctypes,errno,hashlib,json,os,sqlite3,stat,time,zipfile
from pathlib import Path
from files import (require,object_fields,encoded,digest,value_digest,relative,private_directory,
                   destination,read_file,read_json,file_identity,publish,copy_file,copy_stream,tree_manifest,
                   sync_directory)
from workspace import Workspace,workspace_lock,request_id,SCHEMA
import native

PACKET_SCHEMA="stellar-forge.zarr-workspace-packet.v1"
APP_FILES=("files.py","native.py","workspace.py","packet.py","cli.py")
DATA_ROOTS=("sources","selections","results","frozen","operation-artifacts")
EXCLUDED=("operation.lock","operator.lock",".zarr-operator-connection.json","exports","publishers","datasets","deployment","operator","receiving.json")
MAX_BYTES=2*1024*1024*1024
MAX_FILES=200000
START='''"""Receive the exact included private Zarr source workspace; never starts a service."""
from pathlib import Path
import argparse,json,sys
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent/"app"))
from packet import receive_directory
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--directory",required=True)
args=parser.parse_args()
print(json.dumps(receive_directory(Path(__file__).resolve().parent,args.directory),sort_keys=True))
'''
GUIDE="""# Retained Zarr source workspace

This private packet contains the original complete source stores and source archives,
native metadata, immutable selections, typed results, explicit reviews, frozen scalar
sources, original operation history and the exact source-workspace application.

Install Python 3.12 or later and the original zarr==3.4.1 distribution with its
declared dependencies. The exact engine/dependency versions used for these
observations remain in each native result; original chunks are not re-encoded.

After extracting the complete packet into a private directory, run:

    python START.py --directory /absolute/new/private/workspace

The receiver verifies every member and the original SQLite/source/result bindings
before publishing the new workspace on Linux using create-only directory publication.
It preserves the original workspace identity,
revision, source IDs and operation UUIDs. Repeating this exact receive reopens the
completed receipt and preserves any later original native work at that destination.
It does not run array extraction or start a network service.

The current installed CLI can also receive the original ZIP directly:

    python /installed/zarr/python/cli.py receive --archive /private/packet.zip --directory /private/new-workspace
    python /installed/zarr/python/cli.py status --directory /private/new-workspace

This is a complete source-authoring packet. The original merchant publisher,
dataset seller, managed deployment and host connection settings have their own
retained stores and are explicitly excluded here. The whole product receiving
archive carries those closed stores separately. Nothing is automatically connected
to the source host after receiving this packet.
"""

def application():
    root=Path(__file__).resolve().parent
    return [{"path":"app/"+name,**file_identity(root/name,2*1024*1024)} for name in APP_FILES]
def _sync_file(path):
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)
def _snapshot_info(path):
    db=sqlite3.connect(Path(path).as_uri()+"?mode=ro",uri=True)
    try:
        require(db.execute("PRAGMA quick_check").fetchall()==[("ok",)],"ZARR_PACKET_DATABASE","The retained database snapshot is incomplete",409)
        meta={k:json.loads(v) for k,v in db.execute("SELECT key,value FROM meta")}
        require(meta.get("schema")==SCHEMA and type(meta.get("revision")) is int,"ZARR_PACKET_DATABASE","Choose an original source-workspace database")
        pending=db.execute("SELECT id FROM operations WHERE state IN ('RUNNING','INTERRUPTED')").fetchall()
        require(not pending,"ZARR_PACKET_PENDING","Resume or explicitly close interrupted operations before exporting the workspace",409)
        return {"workspaceId":meta["id"],"revision":meta["revision"]}
    finally:db.close()
def _backup(workspace,directory):
    target=directory/"snapshot.sqlite";partial=directory/"snapshot.sqlite.partial"
    if target.exists():
        result=_snapshot_info(target)
        if partial.exists():
            a,b=partial.lstat(),target.lstat()
            require(stat.S_ISREG(a.st_mode) and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino),"ZARR_PARTIAL_CONFLICT","Preserve the unrelated original snapshot partial",409)
            partial.unlink();sync_directory(directory)
        return result
    if partial.exists():
        # SQLite backup finishes a coherent database before the original publication.
        # A corrupt/incomplete partial remains preserved for explicit operator recovery.
        result=_snapshot_info(partial)
        require(result["workspaceId"]==workspace.meta("id"),"ZARR_PACKET_DATABASE","The original partial belongs to another workspace",409)
    else:
        destination_db=sqlite3.connect(partial)
        try:workspace.db.backup(destination_db)
        finally:destination_db.close()
        os.chmod(partial,0o600);_sync_file(partial);result=_snapshot_info(partial)
    os.link(partial,target);sync_directory(directory);partial.unlink();sync_directory(directory)
    return result
def _source_rows(root):
    rows=[]
    for name in DATA_ROOTS:
        directory=root/name
        if directory.exists():
            for row in tree_manifest(directory,MAX_FILES,MAX_BYTES):rows.append({**row,"path":name+"/"+row["path"]})
    require(len(rows)<=MAX_FILES and sum(x["bytes"] for x in rows)<=MAX_BYTES,"ZARR_PACKET_LIMIT","The complete source workspace exceeds the packet limits")
    return sorted(rows,key=lambda x:x["path"])
def _manifest(value):
    object_fields(value,("schema","workspaceId","revision","exportId","createdAt","files","application","engine",
                         "scope","excluded","snapshot"),("schema","workspaceId","revision","exportId","files",
                         "application","engine","scope","excluded","snapshot"),"packet manifest")
    require(value["schema"]==PACKET_SCHEMA and value["scope"]=="complete-source-workspace","ZARR_PACKET_SCHEMA","Choose an original complete Zarr source-workspace packet")
    request_id(value["workspaceId"]);request_id(value["exportId"])
    require(type(value["revision"]) is int and value["revision"]>=0 and isinstance(value["files"],list) and
            0<len(value["files"])<=MAX_FILES,"ZARR_PACKET_MANIFEST","Invalid complete packet inventory")
    paths=[];seen=set();total=0
    for row in value["files"]:
        object_fields(row,("path","bytes","sha256"),("path","bytes","sha256"),"packet member")
        path=relative(row["path"])
        require(path=="workspace/workspace.sqlite" or
                any(path.startswith("workspace/"+name+"/") for name in DATA_ROOTS) or
                path.startswith("app/") or path in ("START.py","README.md"),
                "ZARR_PACKET_PATH","Packet member is outside the original declared scope")
        require(path not in seen and type(row["bytes"]) is int and row["bytes"]>=0 and
                isinstance(row["sha256"],str) and len(row["sha256"])==64 and all(x in "0123456789abcdef" for x in row["sha256"]),
                "ZARR_PACKET_MANIFEST","Invalid or duplicate complete member")
        total+=row["bytes"];paths.append(path);seen.add(path)
    require(total<=MAX_BYTES and "workspace/workspace.sqlite" in seen,"ZARR_PACKET_LIMIT","The complete packet is oversized or lacks its database")
    require(value["application"]==[x for x in value["files"] if x["path"].startswith("app/")],"ZARR_PACKET_APPLICATION","The included application does not match its member manifest")
    require({x["path"] for x in value["application"]}=={"app/"+name for name in APP_FILES},"ZARR_PACKET_APPLICATION","The complete original application is required")
    database=next(x for x in value["files"] if x["path"]=="workspace/workspace.sqlite")
    require(value["snapshot"]=={k:database[k] for k in ("bytes","sha256")},
            "ZARR_PACKET_DATABASE","The snapshot identity differs from its complete file manifest")
    require(set(value["excluded"])==set(EXCLUDED) and "START.py" in seen and "README.md" in seen,
            "ZARR_PACKET_APPLICATION","The complete receiving entrypoint and scope declaration are required")
    return value

def _zip_members(archive,manifest):
    expected={x["path"]:x for x in manifest["files"]}
    rows=archive.infolist();names=[x.filename for x in rows]
    require(len(names)==len(set(names)) and set(names)==set(expected)|{"PACKET.json"},"ZARR_PACKET_MEMBERS","Preserve the complete exact original packet; members differ",409)
    for member in rows:
        kind=stat.S_IFMT(member.external_attr>>16)
        require(not member.is_dir() and kind in (0,stat.S_IFREG) and not member.flag_bits&1,"ZARR_PACKET_MEMBER","Packet contains a link, directory, special or encrypted member")
        relative(member.filename)
        if member.filename=="PACKET.json":continue
        row=expected[member.filename]
        require(member.file_size==row["bytes"],"ZARR_PACKET_MEMBER","Declared member size differs",409)
        h=hashlib.sha256()
        with archive.open(member) as stream:
            for block in iter(lambda:stream.read(1024*1024),b""):h.update(block)
        require(h.hexdigest()==row["sha256"],"ZARR_PACKET_MEMBER","Original complete member bytes differ",409)
def inspect_packet(file):
    selected=file_identity(file,MAX_BYTES)
    with zipfile.ZipFile(file) as archive:
        require(archive.getinfo("PACKET.json").file_size<=32*1024*1024,"ZARR_PACKET_MANIFEST","Packet manifest is oversized")
        raw=archive.read("PACKET.json");manifest=_manifest(json.loads(raw));_zip_members(archive,manifest)
    require(file_identity(file,MAX_BYTES)==selected,"ZARR_PACKET_CHANGED","Original packet changed during verification",409)
    return {"schema":"stellar-forge.zarr-packet-inspection.v1","packet":selected,"manifestSha256":digest(raw),
            "workspaceId":manifest["workspaceId"],"revision":manifest["revision"],"exportId":manifest["exportId"],
            "files":len(manifest["files"]),"sourceBytes":sum(x["bytes"] for x in manifest["files"]),
            "application":manifest["application"],"scope":manifest["scope"]}
def _zip_write(contents,manifest,path):
    with zipfile.ZipFile(path,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        os.chmod(path,0o600)
        for name in sorted([x["path"] for x in manifest["files"]]+["PACKET.json"]):
            info=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.create_system=3;info.external_attr=(stat.S_IFREG|0o600)<<16
            with archive.open(info,"w",force_zip64=True) as writer,(contents/name).open("rb") as reader:
                for block in iter(lambda:reader.read(1024*1024),b""):writer.write(block)
    _sync_file(path)
    require(inspect_packet(path)["manifestSha256"]==value_digest(manifest),
            "ZARR_PACKET_CHANGED","Complete written archive changed",409)
def _write_zip(contents,manifest,target):
    expected=target.with_name(target.name+".expected");writing=expected.with_name(expected.name+".partial")
    if expected.exists() or expected.is_symlink():
        inspected=inspect_packet(expected)
        require(inspected["manifestSha256"]==value_digest(manifest),"ZARR_PACKET_CHANGED","Retained complete archive differs from its frozen basis",409)
        copy_file(expected,expected,maximum=MAX_BYTES)
    else:
        if writing.exists() or writing.is_symlink():
            try:
                inspected=inspect_packet(writing)
                require(inspected["manifestSha256"]==value_digest(manifest),"ZARR_PACKET_CHANGED",
                        "The original complete archive writer differs from its frozen basis",409)
            except zipfile.BadZipFile:
                # Rebuild only the deterministic archive from frozen files. The
                # original partial is retained and must match every prior byte.
                rebuilt=expected.with_name(expected.name+".rebuild")
                if not rebuilt.exists():_zip_write(contents,manifest,rebuilt)
                require(inspect_packet(rebuilt)["manifestSha256"]==value_digest(manifest),
                        "ZARR_PACKET_CHANGED","The original frozen archive reconstruction differs",409)
                copy_file(rebuilt,expected,maximum=MAX_BYTES)
            else:
                os.link(writing,expected);sync_directory(expected.parent);writing.unlink();sync_directory(expected.parent)
        else:
            _zip_write(contents,manifest,writing)
            os.link(writing,expected);sync_directory(expected.parent);writing.unlink();sync_directory(expected.parent)
    copy_file(expected,target,maximum=MAX_BYTES)
    return inspect_packet(target)

def export_packet(directory,ident,out):
    ident=request_id(ident);root=private_directory(Path(directory)).resolve();target=Path(out)
    require(target.is_absolute(),"ZARR_PACKET_DESTINATION","Choose an absolute new private archive path")
    target=target.resolve(strict=False)
    require(not target.is_relative_to(root) or target.parent==root/"exports",
            "ZARR_PACKET_DESTINATION","Inside a workspace, keep archive output directly in its exports directory")
    target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with workspace_lock(root),Workspace(root,readonly=True) as workspace:
        folder=root/"exports"/ident;folder.mkdir(mode=0o700,parents=True,exist_ok=True)
        receipt_file=folder/"receipt.json";basis_file=folder/"basis.json";intent_file=folder/"intent.json"
        # A completed original export retains its selected application edition.
        # Reopening it after a source upgrade must not select today's app bytes.
        # This also reconciles an exact published ZIP before its receipt was saved.
        if receipt_file.exists() or target.exists() or target.is_symlink():
            original=read_json(intent_file)
            object_fields(original,("schema","id","workspaceId","out","application"),
                          ("schema","id","workspaceId","out","application"),"original export intent")
            require(original["schema"]=="stellar-forge.zarr-export-intent.v1" and
                    original["id"]==ident and original["workspaceId"]==workspace.meta("id") and
                    original["out"]==str(target),"ZARR_PACKET_BINDING",
                    "The original export ID belongs to its retained workspace and destination",409)
            basis=_manifest(read_json(basis_file))
            require(basis["workspaceId"]==original["workspaceId"] and basis["exportId"]==ident and
                    sorted(original["application"],key=lambda x:x["path"])==basis["application"],
                    "ZARR_PACKET_BINDING","The completed original application selection changed",409)
            actual=inspect_packet(target)
            require(actual["manifestSha256"]==value_digest(basis) and
                    actual["workspaceId"]==basis["workspaceId"] and actual["revision"]==basis["revision"] and
                    actual["exportId"]==ident,"ZARR_PACKET_CHANGED","The completed original export changed",409)
            receipt={"schema":"stellar-forge.zarr-export-receipt.v1","id":ident,"workspaceId":basis["workspaceId"],
                     "revision":basis["revision"],"archive":str(target),"inspection":actual}
            if receipt_file.exists():
                require(read_json(receipt_file)==receipt,"ZARR_PACKET_CHANGED",
                        "The completed original receipt changed",409)
            else:publish(receipt_file,encoded(receipt))
            return {**receipt,"replayed":True}
        wanted={"schema":"stellar-forge.zarr-export-intent.v1","id":ident,"workspaceId":workspace.meta("id"),"out":str(target),"application":application()}
        # Incomplete exports still bind the original application. Finish with that
        # edition, or choose a new export ID explicitly after upgrading the app.
        publish(intent_file,encoded(wanted))
        if basis_file.exists():basis=read_json(basis_file)
        else:
            snapshot=_backup(workspace,folder)
            require(snapshot["workspaceId"]==workspace.meta("id") and snapshot["revision"]==workspace.meta("revision"),
                    "ZARR_PACKET_SELECTION_CHANGED","The original partial snapshot predates current work; preserve it and choose a new export ID",409)
            members=[{"path":"workspace/"+x["path"],"bytes":x["bytes"],"sha256":x["sha256"]} for x in _source_rows(root)]
            members.append({"path":"workspace/workspace.sqlite",**file_identity(folder/"snapshot.sqlite",MAX_BYTES)})
            members+=application()+[{"path":"START.py","bytes":len(START.encode()),"sha256":digest(START.encode())},
                                    {"path":"README.md","bytes":len(GUIDE.encode()),"sha256":digest(GUIDE.encode())}]
            members.sort(key=lambda x:x["path"])
            basis={"schema":PACKET_SCHEMA,**snapshot,"exportId":ident,"createdAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),
                   "files":members,"application":[x for x in members if x["path"].startswith("app/")],
                   "engine":{"provider":"zarr-python","version":native.ENGINE_VERSION,"sourceCommit":native.ENGINE_COMMIT},
                   "scope":"complete-source-workspace","excluded":list(EXCLUDED),
                   "snapshot":file_identity(folder/"snapshot.sqlite",MAX_BYTES)}
            _manifest(basis);publish(basis_file,encoded(basis))
        require(basis["workspaceId"]==workspace.meta("id") and basis["exportId"]==ident,"ZARR_PACKET_BINDING","The frozen export belongs to another workspace")
        require(file_identity(folder/"snapshot.sqlite",MAX_BYTES)==basis["snapshot"],"ZARR_PACKET_DATABASE","Frozen snapshot changed",409)
        contents=folder/"contents";contents.mkdir(mode=0o700,exist_ok=True)
        for row in basis["files"]:
            name=row["path"];dest=destination(contents,name);expected={k:row[k] for k in ("bytes","sha256")}
            if name=="START.py":publish(dest,START.encode())
            elif name=="README.md":publish(dest,GUIDE.encode())
            else:
                source=folder/"snapshot.sqlite" if name=="workspace/workspace.sqlite" else (
                       Path(__file__).resolve().parent/name[4:] if name.startswith("app/") else root/name[len("workspace/"):])
                copy_file(source,dest,expected,MAX_BYTES)
        publish(contents/"PACKET.json",encoded(basis))
        inspection=_write_zip(contents,basis,target)
        receipt={"schema":"stellar-forge.zarr-export-receipt.v1","id":ident,"workspaceId":basis["workspaceId"],
                 "revision":basis["revision"],"archive":str(target),"inspection":inspection}
        publish(receipt_file,encoded(receipt));return receipt

def _verify_native_workspace(root,manifest):
    selected=_snapshot_info(root/"workspace.sqlite")
    require(selected=={k:manifest[k] for k in ("workspaceId","revision")},"ZARR_PACKET_DATABASE","The native snapshot differs from the manifest",409)
    with Workspace(root,readonly=True) as workspace:
        for item in workspace.items("sources"):
            require(relative(item["file"]).startswith("sources/") and relative(item["store"]).startswith("sources/"),"ZARR_PACKET_SOURCE","Source paths escaped their retained scope")
            workspace.checked_source(item["id"])
        for item in workspace.items("selections"):
            require(read_json(root/"selections"/(item["id"]+".json"))==item,"ZARR_PACKET_SELECTION","Retained native selection changed")
            workspace.entity("sources",item["sourceId"])
        for item in workspace.items("results"):
            require(relative(item["file"]).startswith("results/"),"ZARR_PACKET_RESULT","Result path escaped its retained scope")
            workspace.read_result(item["id"],0,1)
        for item in workspace.frozen_items():workspace.frozen_source(item["id"])
        for row in workspace.db.execute("SELECT id FROM operations"):
            op=workspace.operation(row["id"])
            require(value_digest(op["request"])==op["request_sha"] and op["request"]["id"]==op["id"],"ZARR_PACKET_OPERATION","Original native request identity changed")
            require(op["state"] in ("COMPLETE","ABANDONED"),"ZARR_PACKET_OPERATION","Packet contains an unresolved native operation")
    return selected
def _verify_received_history(root,manifest,snapshot):
    selected=_snapshot_info(root/"workspace.sqlite")
    require(selected["workspaceId"]==manifest["workspaceId"] and selected["revision"]>=manifest["revision"],
            "ZARR_RECEIVING_CHANGED","The current workspace no longer contains its original received edition",409)
    # Native entities and completed operation identities are immutable. Later work
    # may append new reviews/results; it must not rewrite this received history.
    incoming=sqlite3.connect(Path(snapshot).as_uri()+"?mode=ro",uri=True)
    try:
        with Workspace(root,readonly=True) as workspace,workspace.read_snapshot():
            for table in ("sources","selections","results","reviews","operations"):
                for row in incoming.execute("SELECT * FROM "+table):
                    current=workspace.db.execute("SELECT * FROM "+table+" WHERE id=?",(row[0],)).fetchone()
                    require(current is not None and tuple(current)==tuple(row),
                            "ZARR_RECEIVING_CHANGED","Original received "+table+" history changed",409)
            for row in manifest["files"]:
                if row["path"].startswith("workspace/") and row["path"]!="workspace/workspace.sqlite":
                    require(file_identity(root/row["path"][len("workspace/"):],MAX_BYTES)==
                            {k:row[k] for k in ("bytes","sha256")},
                            "ZARR_RECEIVING_CHANGED","An original received source/result member changed",409)
    finally:incoming.close()
    return selected
def _publish_directory(source,target):
    # Linux renameat2 is the native create-only directory primitive. Never fall
    # back to replacing a directory that appeared after review.
    library=ctypes.CDLL(None,use_errno=True)
    rename=getattr(library,"renameat2",None)
    require(rename is not None,"ZARR_RECEIVING_PLATFORM","Receiving requires Linux create-only directory publication")
    rename.argtypes=(ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint)
    rename.restype=ctypes.c_int
    if rename(-100,os.fsencode(source),-100,os.fsencode(target),1)!=0:
        code=ctypes.get_errno()
        require(code not in (errno.EEXIST,errno.ENOTEMPTY),"ZARR_RECEIVING_EXISTS",
                "Preserve the destination that appeared before publication",409)
        raise OSError(code,os.strerror(code),str(target))
    sync_directory(target.parent)
def _receive(manifest,manifest_sha,directory,copy):
    root=Path(directory);require(root.is_absolute(),"ZARR_RECEIVING_PATH","Choose an absolute private receiving directory")
    root=root.resolve(strict=False)
    request={"schema":"stellar-forge.zarr-receiving-intent.v1","manifestSha256":manifest_sha,"workspaceId":manifest["workspaceId"],
             "revision":manifest["revision"],"directory":str(root)}
    root.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    stage=root.with_name(root.name+".receiving-"+manifest_sha[:24])
    if not stage.exists():stage.mkdir(mode=0o700)
    private_directory(stage)
    fd=os.open(stage/"receiving.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    import fcntl
    try:
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:require(False,"ZARR_RECEIVING_BUSY","The original receive still owns its private staging directory",409)
        publish(stage/"intent.json",encoded(request))
        snapshot=stage/"original-snapshot.sqlite"
        snapshot_row=next(x for x in manifest["files"] if x["path"]=="workspace/workspace.sqlite")
        copy(snapshot_row,snapshot)
        receipt=root/"receiving.json"
        if root.exists() or root.is_symlink():
            private_directory(root)
            require(receipt.is_file(),"ZARR_RECEIVING_EXISTS","Preserve the existing directory; use the original completed receipt or a new destination",409)
            saved=read_json(receipt)
            require(saved["request"]==request,"ZARR_RECEIVING_CHANGED","This destination belongs to another original packet",409)
            with workspace_lock(root):current=_verify_received_history(root,manifest,snapshot)
            return {**saved,"replayed":True,"currentRevision":current["revision"]}
        data=stage/"workspace";data.mkdir(mode=0o700,exist_ok=True)
        private_directory(data)
        for row in manifest["files"]:
            if row["path"].startswith("workspace/"):
                rel=row["path"][len("workspace/"):];copy(row,destination(data,rel))
        for name in (*DATA_ROOTS,"exports"):(data/name).mkdir(mode=0o700,exist_ok=True)
        _verify_native_workspace(data,manifest)
        saved={"schema":"stellar-forge.zarr-receiving-receipt.v1","state":"RECEIVED","request":request,
               "workspaceId":manifest["workspaceId"],"revision":manifest["revision"],"manifestSha256":manifest_sha,
               "nativeReadsRepeated":False,"originalIdsPreserved":True}
        publish(data/"receiving.json",encoded(saved));sync_directory(data)
        _publish_directory(data,root)
        return saved
    finally:os.close(fd)

def receive_packet(file,directory):
    before=file_identity(file,MAX_BYTES)
    with zipfile.ZipFile(file) as archive:
        require(archive.getinfo("PACKET.json").file_size<=32*1024*1024,"ZARR_PACKET_MANIFEST","Packet manifest is oversized")
        raw=archive.read("PACKET.json");manifest=_manifest(json.loads(raw));_zip_members(archive,manifest)
        require(file_identity(file,MAX_BYTES)==before,"ZARR_PACKET_CHANGED","Original packet changed during verification",409)
        def copy(row,target):
            expected={k:row[k] for k in ("bytes","sha256")}
            copy_stream(lambda:archive.open(row["path"]),target,expected,MAX_BYTES)
        return _receive(manifest,digest(raw),directory,copy)
def receive_directory(directory,target):
    base=private_directory(Path(directory));raw=read_file(base/"PACKET.json",32*1024*1024);manifest=_manifest(json.loads(raw))
    actual=tree_manifest(base,MAX_FILES,MAX_BYTES)
    expected=sorted([*manifest["files"],{"path":"PACKET.json","bytes":len(raw),"sha256":digest(raw)}],key=lambda x:x["path"])
    require(actual==expected,"ZARR_PACKET_MEMBERS","The extracted complete packet has changed or contains extra files",409)
    def copy(row,out):copy_file(base/row["path"],out,{k:row[k] for k in ("bytes","sha256")},MAX_BYTES)
    return _receive(manifest,digest(raw),target,copy)
