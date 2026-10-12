import base64, fcntl, hashlib, json, os, shutil, signal, stat, subprocess, sys, tempfile, time, traceback, zipfile
from pathlib import Path, PurePosixPath
os.umask(0o077)
OPERATION="ODATA-REMOTE-COMPARISON-CUSTOMER-F971-20261012-R1"
PRIVATE=Path("/dev/f971-odata-remote-comparison-r1")
SOURCE=PRIVATE/"SOURCE";INPUT=PRIVATE/"INPUT";OUTPUT=PRIVATE/"CUSTOMER"
ARCHIVE=Path("/workspace/scratch/f97104b7bf97/receipts/odata-comparison-customer-retained/OData_Complete_Comparison_Customer_Edition.zip")
ARCHIVE_BYTES=12405771
ARCHIVE_SHA="bac079568f9a4d73133540b7db6e0831307bd7daf016d87c2e57a40363d4d2d8"
NODE=Path("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
MODULES=Path("/workspace/scratch/9345d3fc660b/native-runtime/node_modules")
HELPER=Path("/workspace/scratch/f97104b7bf97/ncua-original-source-transfer/current-library-helper/library_upload.py")
HELPERS={"library_upload.py":"5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767",
"library_hosted_apps.py":"97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59",
"library_file_transfer.py":"5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378"}
PACKET_BYTES=121738
PACKET_SHA="61fb483bdb85aa9bb81bbb612121b7469a506a3d932fe5acaef434d14d4c1d25"
DECODED_BYTES=278456
DECODED_SHA="91aef0393c31af124e65acd3ed1efb6bf6359971a3a1daa789bd8f7ea014063a"
def need(value,message):
    if not value:raise RuntimeError(message)
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode()
def digest(path):
    with Path(path).open("rb") as stream:return hashlib.file_digest(stream,"sha256").hexdigest()
def identity(path):return {"path":str(path),"bytes":Path(path).stat().st_size,"sha256":digest(path)}
def private(path):
    path.mkdir(parents=True,mode=0o700,exist_ok=True)
    need(path.resolve()==path and stat.S_ISDIR(path.lstat().st_mode) and not path.stat().st_mode&0o077,"Use a private original directory: "+str(path))
    return path
def sync_directory(path):
    handle=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(handle)
    finally:os.close(handle)
def save(path,raw):
    raw=raw if isinstance(raw,bytes) else encoded(raw)
    private(path.parent)
    descriptor,temporary=tempfile.mkstemp(prefix="."+path.name+".",dir=path.parent)
    try:
        with os.fdopen(descriptor,"wb") as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path);sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)
def immutable(path,raw):
    raw=raw if isinstance(raw,bytes) else encoded(raw)
    private(path.parent)
    if path.exists():
        need(not path.is_symlink() and path.read_bytes()==raw,"Preserve different original selected bytes: "+str(path));return
    descriptor,temporary=tempfile.mkstemp(prefix="."+path.name+".",dir=path.parent)
    try:
        with os.fdopen(descriptor,"wb") as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        try:os.link(temporary,path)
        except FileExistsError:need(path.read_bytes()==raw,"Another original source differs.")
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):os.unlink(temporary)
def safe_name(name):
    path=PurePosixPath(name)
    need(isinstance(name,str) and name and path.as_posix()==name and not path.is_absolute() and
         ".." not in path.parts and "\\" not in name and not name.endswith("/"),"Use original regular customer member names.")
    return path
def decode(envelope):
    need(envelope.get("schema")=="commons.source-packet/v1" and envelope.get("encoding")=="commons-lz77-v1+base64","Use the original source-packet codec.")
    expected=envelope["bytes"];need(type(expected)is int and 0<expected<8*1024*1024,"Retain a complete bounded source packet.")
    packed=base64.b64decode(envelope["data"],validate=True);plain=bytearray();position=0
    while position<len(packed):
        flag=packed[position];position+=1
        if flag<128:
            count=flag+1;need(position+count<=len(packed),"Truncated original source literal.")
            plain.extend(packed[position:position+count]);position+=count
        else:
            count=flag-128+3;need(position+2<=len(packed),"Truncated original source reference.")
            distance=packed[position]*256+packed[position+1];position+=2
            need(0<distance<=len(plain),"Invalid original source reference.")
            for _ in range(count):plain.append(plain[-distance])
        need(len(plain)<=expected,"The original source packet exceeded its bound.")
    need(len(plain)==expected and hashlib.sha256(plain).hexdigest()==envelope["sha256"],"The complete source packet changed.")
    return json.loads(plain)
for path in (PRIVATE,SOURCE,INPUT,OUTPUT,PRIVATE/"temporary",PRIVATE/"provider"):private(path)
os.environ["TMPDIR"]=str(PRIVATE/"temporary");tempfile.tempdir=str(PRIVATE/"temporary")
os.environ["PYTHONDONTWRITEBYTECODE"]="1";os.environ["NODE_OPTIONS"]="--max-old-space-size=512"
lease=os.open(PRIVATE/"remote-customer-host.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
child=None
receipt_path=PRIVATE/"remote-host.json"
def print_status(phase,**values):print(json.dumps({"phase":phase,"operation_id":OPERATION,**values}),flush=True)

def resource_snapshot(label):
    value={"label":label,"observed_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"pid":os.getpid(),"filesystem":{},"cgroup":{}}
    for name,path in (("workspace",ARCHIVE.parent),("private",PRIVATE)):
        try:
            v=os.statvfs(path);value["filesystem"][name]={"path":str(path),"total":v.f_blocks*v.f_frsize,"free":v.f_bfree*v.f_frsize,"available":v.f_bavail*v.f_frsize}
        except OSError as error:value["filesystem"][name]={"error":str(error)}
    try:value["meminfo"]=Path("/proc/meminfo").read_text()
    except OSError as error:value["meminfo_error"]=str(error)
    roots=[Path("/sys/fs/cgroup")]
    try:
        for line in Path("/proc/self/cgroup").read_text().splitlines():
            parts=line.split(":",2)
            if len(parts)==3 and parts[0]=="0":roots.insert(0,Path("/sys/fs/cgroup")/parts[2].lstrip("/"))
    except OSError:pass
    for name in ("memory.current","memory.max","memory.events","memory.peak"):
        for root in roots:
            try:value["cgroup"][name]=(root/name).read_text().strip();break
            except OSError:pass
    receipt.setdefault("resources",[]).append(value);save(receipt_path,receipt)
    print_status("remote-resource-observation",label=label,filesystem=value["filesystem"],cgroup=value["cgroup"])
    return value
def close_original_child():
    global child
    if child is None:return
    try:
        if child.poll() is None:
            os.killpg(child.pid,signal.SIGTERM)
            try:child.wait(timeout=20)
            except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
        else:child.wait()
    except ProcessLookupError:child.wait()
    child=None
def checkpoint_verify(path,label=None):
    with zipfile.ZipFile(path) as archive:
        members=archive.infolist()
        need(len(members)<=20000 and len({m.filename for m in members})==len(members),"Preserve the complete unique checkpoint membership.")
        need(sum(m.file_size for m in members)<=2*1024**3,"The complete checkpoint exceeds its receiving bound.")
        marker="remote-checkpoint.json";raw=archive.read(marker);manifest=json.loads(raw)
        need(manifest.get("schema")=="stellar-forge.odata-remote-customer-checkpoint.v1" and
             manifest.get("operation_id")==OPERATION and manifest.get("private_root")==str(PRIVATE) and
             manifest.get("original_archive_sha256")==ARCHIVE_SHA and manifest.get("decoded_source_sha256")==DECODED_SHA,
             "Receive the original operation, source and customer checkpoint.")
        if label is not None:need(manifest["label"]==label,"Preserve the selected checkpoint phase.")
        declared={f["path"]:f for f in manifest["files"]}
        need(len(declared)==len(manifest["files"]) and set(declared)|{marker}=={m.filename for m in members},
             "Preserve every original checkpoint file.")
        need("remote-host.json" in declared and "remote-customer-native-host.py" in declared,"Retain the original host and journal.")
        for member in members:
            safe_name(member.filename)
            need(not member.is_dir() and stat.S_IFMT(member.external_attr>>16) in (0,stat.S_IFREG),"Receive regular checkpoint files only.")
            if member.filename==marker:continue
            name=member.filename;parts=PurePosixPath(name).parts
            need((len(parts)>1 and parts[0] in {"SOURCE","INPUT","CUSTOMER","provider"}) or
                 (len(parts)==1 and (name in {"remote-host.json","remote-customer-native-host.py","OData_Remote_Comparison_Customer_Edition.zip","OData_Remote_Comparison_Customer_Result.json","remote-customer-files.json","START.md"} or
                  name.endswith((".stdout.ndjson",".stderr.log")))),"The checkpoint selected a foreign path.")
            need("node_modules" not in parts and ".git" not in parts,"Restore the original source without mutable installations.")
            expected=declared[name]
            with archive.open(member) as stream:
                need(member.file_size==expected["bytes"] and hashlib.file_digest(stream,"sha256").hexdigest()==expected["sha256"],
                     "The complete checkpoint file changed: "+name)
        need(declared["remote-customer-native-host.py"]["sha256"]==hashlib.sha256(_receiving_host_source.encode()).hexdigest(),
             "Resume with the exact original checkpoint host source.")
    return manifest
def receive_checkpoint(selection):
    path=Path(selection["path"])
    need(path.is_file() and not path.is_symlink() and path.stat().st_size==selection["bytes"] and digest(path)==selection["sha256"],
         "Select the complete original retained checkpoint bytes.")
    manifest=checkpoint_verify(path);record=PRIVATE/"remote-checkpoint-receiving.json"
    selected={"archive":identity(path),"operation_id":OPERATION,"label":manifest["label"]}
    if record.exists():
        need(json.loads(record.read_bytes())==selected,"Preserve the original checkpoint receiving selection.");return selected
    with zipfile.ZipFile(path) as archive:
        for item in manifest["files"]:
            target=PRIVATE/item["path"];private(target.parent)
            if target.exists():
                need(not target.is_symlink() and target.stat().st_size==item["bytes"] and digest(target)==item["sha256"],
                     "Preserve later or different original receiving work: "+item["path"]);continue
            fd,temporary=tempfile.mkstemp(prefix="."+target.name+".receiving-",dir=target.parent)
            try:
                with os.fdopen(fd,"wb") as out,archive.open(item["path"]) as original:
                    shutil.copyfileobj(original,out,1024*1024);out.flush();os.fsync(out.fileno())
                need(Path(temporary).stat().st_size==item["bytes"] and digest(temporary)==item["sha256"],"The received original member changed.")
                try:os.link(temporary,target)
                except FileExistsError:need(target.stat().st_size==item["bytes"] and digest(target)==item["sha256"],"The original receiving target changed.")
                sync_directory(target.parent)
            finally:
                if os.path.exists(temporary):os.unlink(temporary)
    immutable(record,selected);return selected
def checkpoint(label):
    need(child is None,"Close the original native child before taking its complete checkpoint.")
    records=receipt.setdefault("checkpoints",{})
    book=records.setdefault(label,{"label":label,"state":"SELECTED","selected_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())})
    if book.get("received"):return book
    root=private(PRIVATE/"checkpoints")
    target=root/("OData_Remote_Comparison_"+label+"_Checkpoint.zip");candidate=root/("."+target.name+".building")
    save(receipt_path,receipt)
    if not target.exists():
        if candidate.exists():
            try:checkpoint_verify(candidate,label)
            except zipfile.BadZipFile:
                old=identity(candidate);book.setdefault("retired_incomplete",[]).append(old);save(receipt_path,receipt)
                need(identity(candidate)==old,"The original incomplete checkpoint changed.");candidate.unlink()
        if not candidate.exists():
            selected={}
            for parent in (SOURCE,INPUT,OUTPUT,PRIVATE/"provider"):
                for current,dirs,names in os.walk(parent,followlinks=False):
                    for name in list(dirs):
                        p=Path(current)/name
                        if p.is_symlink():
                            need(p==SOURCE/"node_modules" and p.readlink()==MODULES,"Preserve a foreign checkpoint directory.");dirs.remove(name)
                    for name in names:
                        p=Path(current)/name
                        need(p.is_file() and not p.is_symlink(),"Preserve non-regular original checkpoint input: "+str(p))
                        selected[str(p.relative_to(PRIVATE))]=p
            for p in PRIVATE.iterdir():
                if p.name in {"remote-host.json","remote-customer-native-host.py","OData_Remote_Comparison_Customer_Edition.zip","OData_Remote_Comparison_Customer_Result.json","remote-customer-files.json","START.md"} or p.name.endswith((".stdout.ndjson",".stderr.log")):
                    need(p.is_file() and not p.is_symlink(),"Preserve a foreign original host file.");selected[p.name]=p
            files=[{"path":name,"bytes":p.stat().st_size,"sha256":digest(p)} for name,p in sorted(selected.items())]
            manifest={"schema":"stellar-forge.odata-remote-customer-checkpoint.v1","operation_id":OPERATION,
                "private_root":str(PRIVATE),"original_archive_sha256":ARCHIVE_SHA,"decoded_source_sha256":DECODED_SHA,
                "label":label,"selected_at":book["selected_at"],"files":files}
            with zipfile.ZipFile(candidate,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
                for item in files:
                    p=selected[item["path"]];before=identity(p)
                    need(all(before[k]==item[k] for k in ("bytes","sha256")),"The original checkpoint selection changed.")
                    info=zipfile.ZipInfo(item["path"]);info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o600)<<16
                    with p.open("rb") as original,archive.open(info,"w",force_zip64=True) as out:shutil.copyfileobj(original,out,1024*1024)
                    need(identity(p)==before,"An original checkpoint member changed during publication.")
                archive.writestr("remote-checkpoint.json",encoded(manifest))
            with candidate.open("rb") as stream:os.fsync(stream.fileno())
            checkpoint_verify(candidate,label)
        try:os.link(candidate,target)
        except FileExistsError:checkpoint_verify(target,label)
        candidate.unlink();sync_directory(root)
    checkpoint_verify(target,label)
    book["archive"]=identity(target);book["state"]="READY";save(receipt_path,receipt)
    print_status("remote-closed-checkpoint",label=label,archive=book["archive"])
    return book
def library_return_success(body,paths):
    if not isinstance(body,dict) or not isinstance(body.get("results"),list):return False
    rows=body["results"]
    if len(rows)!=len(paths) or len({r.get("local_path") for r in rows if isinstance(r,dict)})!=len(paths):return False
    by_path={r.get("local_path"):r for r in rows if isinstance(r,dict)}
    return set(by_path)==set(paths) and all(r.get("status")=="succeeded" and r.get("file_id") and r.get("library_file_id") for r in rows)
def reconcile_library_return(record,request,stdout,stderr,files):
    request_path=Path(record["request"]["path"])
    need(identity(request_path)==record["request"] and json.loads(request_path.read_bytes())==request,
         "Preserve the exact original Library request.")
    expected=[{"local_path":item["path"],"purpose":"create_library_file","library_artifact_type":"other"} for item in files]
    need(request=={"uploads":expected} and record.get("files")==files,"Preserve the original selected upload files.")
    for item in files:
        path=Path(item["path"])
        if path.exists():need(identity(path)==item,"A selected original upload changed before provider reconciliation.")
    if not stdout.exists():return False
    if record.get("stdout"):need(identity(stdout)==record["stdout"],"The original provider return changed.")
    try:body=json.loads(stdout.read_bytes())
    except (ValueError,UnicodeError):return False
    if not library_return_success(body,[item["path"] for item in files]):return False
    record["stdout"]=identity(stdout)
    if stderr.exists():record["stderr"]=identity(stderr)
    record["state"]="SUCCEEDED";record["success_evidence"]="complete_original_provider_results"
    record["provider_results"]=body["results"]
    save(receipt_path,receipt)
    return True
def save_checkpoint(label):
    global child
    records=receipt.setdefault("checkpoint_saves",{})
    provider=private(PRIVATE/"provider"/("checkpoint-"+label))
    prior=records.get(label)
    if prior:
        request_path=Path(prior["request"]["path"])
        need(reconcile_library_return(prior,json.loads(request_path.read_bytes()),provider/"stdout.json",provider/"stderr.log",prior["files"]),
             "Reconcile the original checkpoint provider outcome before another invocation: "+label)
        print_status("original-checkpoint-save-reconciled",label=label,returncode=prior.get("returncode"),results=prior["provider_results"])
        return prior
    book=checkpoint(label)
    if book.get("received"):return book
    files=[book["archive"]]
    request={"uploads":[{"local_path":item["path"],"purpose":"create_library_file","library_artifact_type":"other"} for item in files]}
    immutable(provider/"request.json",request)
    record={"state":"SELECTED","request":identity(provider/"request.json"),"archive":book["archive"],"files":files}
    records[label]=record;save(receipt_path,receipt)
    with (provider/"stdout.json").open("xb",buffering=0) as out,(provider/"stderr.log").open("xb",buffering=0) as err:
        child=subprocess.Popen([sys.executable,"-B",str(HELPER)],stdin=subprocess.PIPE,stdout=out,stderr=err,
            cwd=provider,env={**os.environ,"TMPDIR":str(PRIVATE/"temporary")},pass_fds=(lease,),start_new_session=True)
        record["pid"]=child.pid;save(receipt_path,receipt)
        child.communicate(json.dumps(request).encode());record["returncode"]=child.returncode;child=None
    record["stdout"]=identity(provider/"stdout.json");record["stderr"]=identity(provider/"stderr.log");record["state"]="RETURNED"
    save(receipt_path,receipt)
    succeeded=reconcile_library_return(record,request,provider/"stdout.json",provider/"stderr.log",files)
    print_status("remote-checkpoint-library-return",label=label,state=record["state"],returncode=record.get("returncode"),
                 result=(provider/"stdout.json").read_text(errors="replace"),stderr=(provider/"stderr.log").read_text(errors="replace")[-4000:])
    need(succeeded,"The complete original checkpoint save needs its actual provider result reconciled.")
    return record

receiving=receive_checkpoint(_remote_checkpoint) if globals().get("_remote_checkpoint") else None
selection={"schema":"stellar-forge.odata-remote-customer-native-host.v1","operation_id":OPERATION,
    "private_root":str(PRIVATE),"original_customer_archive":{"path":str(ARCHIVE),"bytes":ARCHIVE_BYTES,"sha256":ARCHIVE_SHA},
    "source_packet":{"bytes":PACKET_BYTES,"sha256":PACKET_SHA,"decoded_bytes":DECODED_BYTES,"decoded_sha256":DECODED_SHA}}
if receipt_path.exists():
    receipt=json.loads(receipt_path.read_bytes())
    need(all(receipt.get(key)==value for key,value in selection.items()),"Preserve the exact original host operation and source selection.")
else:
    receipt={**selection,"started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"state":"PREPARING","attempts":[]}
receipt["pid"]=os.getpid()
if receiving:
    label=receiving["label"];receipt.setdefault("checkpoints",{}).setdefault(label,{})["received"]=receiving
immutable(PRIVATE/"remote-customer-native-host.py",_receiving_host_source.encode())
save(receipt_path,receipt)
resource_snapshot("initial")
def acquire_source_packet():
    decoded=INPUT/"remote-source.decoded.json"
    if decoded.exists():
        need(not decoded.is_symlink() and decoded.stat().st_size==DECODED_BYTES and digest(decoded)==DECODED_SHA,
             "Preserve the complete decoded original source packet.")
        return decoded
    path=INPUT/"remote-source.packet.json"
    if path.exists():
        need(path.stat().st_size==PACKET_BYTES and digest(path)==PACKET_SHA,"Preserve the complete selected source packet.");return path
    previous=None
    if os.isatty(0):
        import termios,tty
        previous=termios.tcgetattr(0);tty.setraw(0)
    print_status("AWAITING_REMOTE_CUSTOMER_SOURCE",bytes=PACKET_BYTES,sha256=PACKET_SHA)
    try:
        raw=bytearray()
        while len(raw)<PACKET_BYTES:
            data=sys.stdin.buffer.read(min(65536,PACKET_BYTES-len(raw)))
            need(data,"The complete original source input ended early.");raw.extend(data)
        need(hashlib.sha256(raw).hexdigest()==PACKET_SHA,"The selected full source bytes changed.")
        immutable(path,bytes(raw))
    finally:
        if previous is not None:termios.tcsetattr(0,termios.TCSADRAIN,previous)
    return path
def stage_source():
    path=acquire_source_packet()
    packet=json.loads(path.read_bytes()) if path.name=="remote-source.decoded.json" else decode(json.loads(path.read_bytes()))
    need(packet["schema"]=="stellar-forge.odata-remote-comparison-customer-source.v1" and packet["operationId"]==OPERATION,"Choose this original remote customer operation.")
    need(ARCHIVE.stat().st_size==ARCHIVE_BYTES and digest(ARCHIVE)==ARCHIVE_SHA,"The already completed customer archive changed.")
    for file in (NODE,MODULES,HELPER):need(file.exists(),"The selected installed runtime is absent: "+str(file))
    for name,expected in HELPERS.items():need(digest(HELPER.parent/name)==expected,"The unchanged Library helper differs: "+name)
    selected={}
    with zipfile.ZipFile(ARCHIVE) as archive:
        members=archive.infolist()
        need(len(members)==1452 and len({item.filename for item in members})==1452,"The original customer member count changed.")
        need(sum(item.file_size for item in members)<=512*1024*1024,"The selected complete archive exceeded its original receiving bound.")
        manifest=json.loads(archive.read("comparison-customer-files.json"))
        need(manifest["schema"]=="stellar-forge.odata-comparison-customer-files.v1","Choose the original full customer member manifest.")
        declared={item["name"]:item for item in manifest["files"]}
        need(len(declared)==1451 and set(declared)|{"comparison-customer-files.json"}=={item.filename for item in members},
             "The complete original customer membership changed.")
        for item in members:
            safe_name(item.filename)
            need(not item.is_dir() and stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFREG),"The original archive contains a non-regular member.")
            if item.filename in declared:
                expected=declared[item.filename]
                with archive.open(item) as stream:
                    need(item.file_size==expected["bytes"] and hashlib.file_digest(stream,"sha256").hexdigest()==expected["sha256"],
                         "The original complete customer bytes changed: "+item.filename)
            if item.filename.startswith("SOURCE/"):
                name=item.filename[len("SOURCE/"):]
                safe_name(name);need("node_modules" not in PurePosixPath(name).parts and ".git" not in PurePosixPath(name).parts,"Use the retained source without mutable dependencies.")
                destination=SOURCE/name
                original_raw=archive.read(item)
                if name in packet["postimages"] and destination.exists():
                    need(destination.read_bytes() in (original_raw,packet["postimages"][name]["content"].encode()),
                         "Preserve a changed original source while reopening this operator: "+name)
                else:immutable(destination,original_raw)
                selected[name]=identity(destination)
            elif item.filename in {"OData_Comparison_Workspace.json","worked-comparison-customer.json",
                    "runtime-source-selection.json","comparison-customer-files.json","Original_Comparison_Reviews.json"}:
                immutable(INPUT/item.filename,archive.read(item))
        need(len(selected)==1433,"The full original runtime source is incomplete.")
    for name,value in packet["postimages"].items():
        safe_name(name);raw=value["content"].encode()
        need(len(raw)==value["bytes"] and hashlib.sha256(raw).hexdigest()==value["sha256"] and
             hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()==value["gitBlobSha"],
             "The exact reviewed source postimage changed: "+name)
        save(SOURCE/name,raw);selected[name]=identity(SOURCE/name)
        selected[name]["git_blob_sha"]=value["gitBlobSha"]
    examples=SOURCE/"stellar-forge/mcp-merchant-operator/examples"
    private(examples)
    immutable(examples/"remote-comparison-customer.mjs",packet["operator"]["node"].encode())
    immutable(examples/"remote-comparison-analysis.py",packet["operator"]["analysis"].encode())
    for name in ("remote-comparison-customer.mjs","remote-comparison-analysis.py"):
        path=examples/name;selected[str(path.relative_to(SOURCE))]=identity(path)
    modules=SOURCE/"node_modules"
    if modules.is_symlink():need(modules.readlink()==MODULES,"The existing selected dependency view changed.")
    else:need(not modules.exists(),"Preserve a different dependency view.");modules.symlink_to(MODULES,target_is_directory=True)
    source_files=[{"path":name,"bytes":value["bytes"],"sha256":value["sha256"],
                  **({"git_blob_sha":value["git_blob_sha"]} if "git_blob_sha" in value else {})} for name,value in sorted(selected.items())]
    inventory={"schema":"stellar-forge.odata-remote-customer-source.v1","client_commit":packet["clientCommit"],
        "mcp_merge":packet["mcpMerge"],"original_archive_sha256":ARCHIVE_SHA,"files":source_files,"node_modules":str(MODULES)}
    immutable(INPUT/"runtime-source-selection.json.remote",inventory)
    worked=json.loads((INPUT/"worked-comparison-customer.json").read_bytes())
    baseline=INPUT/"OData_Comparison_Workspace.json"
    descriptor={"schema":"stellar-forge.odata-remote-comparison-customer-input.v1","operationId":OPERATION,
        "checkout":str(SOURCE),"outputDirectory":str(OUTPUT),"workspaceTransfer":str(baseline),
        "workspaceTransferSha256":digest(baseline),"worked":str(INPUT/"worked-comparison-customer.json"),
        "archiveSha256":ARCHIVE_SHA,"comparisonSha256":worked["comparison_sha256"],
        "liveServiceId":"orders","comparisonId":"orders-projection-review"}
    immutable(INPUT/"remote-customer-input.json",descriptor)
    receipt["source"]={"files":len(source_files),"bytes":sum(item["bytes"] for item in source_files),
        "inventory":identity(INPUT/"runtime-source-selection.json.remote"),"client_commit":packet["clientCommit"],
        "mcp_merge":packet["mcpMerge"]}
    save(receipt_path,receipt);print_status("remote-source-ready",files=len(source_files),bytes=receipt["source"]["bytes"])
    return descriptor
def run_command(label,command):
    global child
    attempt={"label":label,"argv":command,"started_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
    receipt["attempts"].append(attempt);save(receipt_path,receipt)
    log=PRIVATE/(label+"-"+str(len(receipt["attempts"])))
    with log.with_suffix(".stdout.ndjson").open("ab",buffering=0) as output,log.with_suffix(".stderr.log").open("ab",buffering=0) as error:
        child=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=error,cwd=SOURCE,env=os.environ.copy(),
            pass_fds=(lease,),start_new_session=True)
        attempt["pid"]=child.pid
        try:attempt["process_stat"]=Path("/proc/"+str(child.pid)+"/stat").read_text()
        except OSError:pass
        save(receipt_path,receipt);print_status("remote-native-started",stage=label,child_pid=child.pid)
        for line in child.stdout:
            output.write(line)
            if len(line)<20000:sys.stdout.buffer.write(line);sys.stdout.buffer.flush()
        code=child.wait();child=None
    attempt["exit_code"]=code;attempt["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    attempt["stdout"]=identity(log.with_suffix(".stdout.ndjson"));attempt["stderr"]=identity(log.with_suffix(".stderr.log"))
    save(receipt_path,receipt)
    if code:
        print_status("remote-native-needs-attention",stage=label,exit_code=code,stderr=log.with_suffix(".stderr.log").read_text(errors="replace")[-7000:])
        raise RuntimeError("The same original "+label+" returned "+str(code))
def package_customer():
    source_inventory=json.loads((INPUT/"runtime-source-selection.json.remote").read_bytes())
    result=json.loads((OUTPUT/"remote-customer-result.json").read_bytes());analysis=json.loads((OUTPUT/"remote-analysis-result.json").read_bytes())
    need(result["state"]==analysis["state"]=="COMPLETE","Complete the selected remote and analytical receiving before delivery.")
    start="""# OData remote comparison customer
The complete original 830-entity comparison was opened through the native HTTP merchant host, reviewed through four scopes, published, downloaded through its ranged-file interface, and received independently. The selected 4,150 field-selection rows were then registered and imported into the original Analysis workspace and reopened after complete export.

SOURCE/ contains the exact complete runtime and the reviewed customer client. CUSTOMER/download/source.json is the selected published review edition. Its declared files, complete download checkpoint, received native comparison, original request JSON, all command returns and complete workspace exports accompany it.

## Open the received comparison
Set SOURCE to this extracted SOURCE directory and NODE to Node 24. Use the original dependency closure named by INPUT/runtime-source-selection.json.remote or install the source package using its existing distribution guide.
Run:
  "$NODE" "$SOURCE/stellar-forge/mcp-merchant-operator/odata-comparison-cli.mjs" inspect-received --directory "$DELIVERY/CUSTOMER/received-comparison" --replay true
  "$NODE" "$SOURCE/stellar-forge/mcp-merchant-operator/odata-comparison-cli.mjs" received-rows --directory "$DELIVERY/CUSTOMER/received-comparison" --kind cells --offset 4100 --limit 100
Keep extracted private directories 0700 and files 0600.

## Continue through a merchant
Restore CUSTOMER/OData_Remote_Customer_Workspace.json with the original OData workspace receiver into a private merchant directory. The complete ODATA_COMPARISON_CUSTOMER.md in SOURCE/stellar-forge/mcp-merchant-operator describes host configuration, the customer command and each retained request/edition. Configure a fresh private bearer credential for the selected listener.
The original four review requests under CUSTOMER/requests retain their IDs and content for same-request recovery. New review decisions require their own new request IDs and the current inspected revision.

## Open Analysis
CUSTOMER/OData_Remote_Analysis_Workspace.zip contains the complete independently received Analysis source and all 4,150 mapped rows. Use the original stellar_forge_buyer.workspace_archive_receive command from SOURCE/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python and the archive digest in CUSTOMER/remote-analysis-result.json. Its original Analysis workspace can then be opened with analysis_workspace serve.
CUSTOMER/Analysis_Import_Mapping.json uses the actual saved source name/revision. When registering this exact downloaded source under a new name, generate the mapping for that returned revision with odata-comparison-customer analysis-mapping.

remote-customer-files.json binds every delivered file by complete bytes and SHA-256. CUSTOMER/remote-customer-result.json and remote-analysis-result.json preserve the exact original source, review, publication, receiving and analytical outcomes.
"""
    immutable(PRIVATE/"START.md",start.encode())
    selected={}
    for item in source_inventory["files"]:
        path=SOURCE/item["path"];actual=identity(path)
        need(all(actual[key]==item[key] for key in ("bytes","sha256")),"The selected full runtime changed before packaging.")
        selected["SOURCE/"+item["path"]]=path
    for directory in ("download","received-comparison","requests","steps","logs"):
        root=OUTPUT/directory
        for path in sorted(root.rglob("*")):
            if path.is_file() and not path.is_symlink():selected["CUSTOMER/"+str(path.relative_to(OUTPUT))]=path
    for path in sorted(OUTPUT.iterdir()):
        if path.is_file() and path.name!="merchant-access.private" and path.suffix in {".json",".csv",".zip"}:
            selected["CUSTOMER/"+path.name]=path
    for name in ("runtime-source-selection.json.remote","worked-comparison-customer.json","comparison-customer-files.json","Original_Comparison_Reviews.json","remote-customer-input.json"):
        selected["INPUT/"+name]=INPUT/name
    selected["START.md"]=PRIVATE/"START.md"
    selected["OPERATING/remote-customer-native-host.py"]=PRIVATE/"remote-customer-native-host.py"
    files=[{"name":name,"bytes":path.stat().st_size,"sha256":digest(path)} for name,path in sorted(selected.items())]
    immutable(PRIVATE/"remote-customer-files.json",{"schema":"stellar-forge.odata-remote-customer-files.v1","files":files})
    selected["remote-customer-files.json"]=PRIVATE/"remote-customer-files.json"
    final=PRIVATE/"OData_Remote_Comparison_Customer_Edition.zip";candidate=PRIVATE/".OData_Remote_Comparison_Customer_Edition.building.zip"
    declared={name:identity(path) for name,path in selected.items()}
    def verify(path):
        with zipfile.ZipFile(path) as archive:
            members=archive.infolist()
            need(len(members)==len(selected) and {item.filename for item in members}==set(selected),"The complete customer archive membership changed.")
            for item in members:
                value=declared[item.filename]
                with archive.open(item) as stream:
                    need(item.file_size==value["bytes"] and hashlib.file_digest(stream,"sha256").hexdigest()==value["sha256"],
                         "A completed customer archive member changed.")
    if final.exists():verify(final)
    else:
        if candidate.exists():
            try:verify(candidate)
            except zipfile.BadZipFile:
                old=identity(candidate);receipt.setdefault("incomplete_candidates",[]).append(old);save(receipt_path,receipt)
                need(identity(candidate)==old,"The original incomplete candidate changed.");candidate.unlink()
        if not candidate.exists():
            with zipfile.ZipFile(candidate,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
                for name,path in sorted(selected.items()):
                    before=identity(path);need(before==declared[name],"The selected completed member changed before streaming.")
                    info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o600)<<16
                    with path.open("rb") as source,archive.open(info,"w",force_zip64=True) as output:
                        shutil.copyfileobj(source,output,1024*1024)
                    need(identity(path)==before,"The original member changed during customer publication.")
            with candidate.open("rb") as stream:os.fsync(stream.fileno())
            verify(candidate)
        try:os.link(candidate,final)
        except FileExistsError:verify(final)
        candidate.unlink();sync_directory(PRIVATE)
    receipt["customer_archive"]=identity(final);receipt["state"]="COMPLETE";save(receipt_path,receipt)
    concise={"schema":"stellar-forge.odata-remote-customer-delivery.v1","operation_id":OPERATION,"state":"COMPLETE",
        "original_archive_sha256":ARCHIVE_SHA,"source":receipt["source"],"comparison_sha256":result["comparison_sha256"],
        "source_rows":830,"changed_cells":4150,"original_review_revision":result["original_review_revision"],
        "review_revision":result["review_revision"],"edition_id":result["new_edition"]["editionId"],
        "source_document_sha256":result["new_edition"]["sha256"],"analysis_workspace_id":analysis["workspace_id"],
        "archive":receipt["customer_archive"],"members":len(selected),"native_children_closed":child is None}
    immutable(PRIVATE/"OData_Remote_Comparison_Customer_Result.json",concise)
    print_status("remote-customer-packaged",**{"archive":receipt["customer_archive"],"members":len(selected)})
    return [final,PRIVATE/"OData_Remote_Comparison_Customer_Result.json"]
def save_completed_customer(files):
    global child
    selected=[identity(path) for path in files]
    request={"uploads":[{"local_path":item["path"],"purpose":"create_library_file","library_artifact_type":"other"} for item in selected]}
    stdout=PRIVATE/"provider/library-stdout.json";stderr=PRIVATE/"provider/library-stderr.log"
    intent=receipt.get("library_intent")
    if intent:
        record=receipt.setdefault("library_save",{"state":"SELECTED","request":intent["request"],"files":intent["files"]})
        need(reconcile_library_return(record,request,stdout,stderr,selected),
             "Reconcile the original selected final provider outcome before another invocation.")
        print_status("original-library-save-reconciled",returncode=record.get("returncode"),results=record["provider_results"])
        return record
    immutable(PRIVATE/"provider/library-request.json",request)
    intent={"request":identity(PRIVATE/"provider/library-request.json"),"state":"SELECTED","files":selected}
    receipt["library_intent"]=intent
    record={"state":"SELECTED","request":intent["request"],"files":selected};receipt["library_save"]=record
    save(receipt_path,receipt)
    with stdout.open("xb",buffering=0) as out,stderr.open("xb",buffering=0) as err:
        child=subprocess.Popen([sys.executable,"-B",str(HELPER)],stdin=subprocess.PIPE,stdout=out,stderr=err,
            cwd=PRIVATE/"provider",env={**os.environ,"TMPDIR":str(PRIVATE/"temporary")},pass_fds=(lease,),start_new_session=True)
        intent["pid"]=child.pid;record["pid"]=child.pid;save(receipt_path,receipt)
        child.communicate(json.dumps(request).encode());record["returncode"]=child.returncode;child=None
    record["stdout"]=identity(stdout);record["stderr"]=identity(stderr);record["state"]="RETURNED";save(receipt_path,receipt)
    succeeded=reconcile_library_return(record,request,stdout,stderr,selected)
    print_status("remote-customer-library-return",state=record["state"],returncode=record.get("returncode"),
        result=stdout.read_text(errors="replace"),stderr=stderr.read_text(errors="replace")[-4000:])
    need(succeeded,"The completed customer edition retains an unresolved original provider outcome.")
    return record
_active=False
def run_original_remote_customer():
    global _active,child
    need(not _active,"The original remote customer process is active.")
    _active=True
    try:
        descriptor=stage_source()
        if receipt.get("customer_archive"):
            saved=receipt["customer_archive"];path=Path(saved["path"])
            need(identity(path)==saved,"Preserve the already completed original customer archive.")
            save_completed_customer(package_customer());return
        run_command("remote-customer",[str(NODE),str(SOURCE/"stellar-forge/mcp-merchant-operator/examples/remote-comparison-customer.mjs"),
            str(INPUT/"remote-customer-input.json")])
        receipt["state"]="NATIVE_COMPLETE";save(receipt_path,receipt)
        save_checkpoint("native-complete")
        run_command("remote-analysis",[sys.executable,"-B",str(SOURCE/"stellar-forge/mcp-merchant-operator/examples/remote-comparison-analysis.py"),
            "--checkout",str(SOURCE),"--operation",str(OUTPUT),"--node",str(NODE)])
        receipt["state"]="ANALYSIS_COMPLETE";save(receipt_path,receipt);resource_snapshot("complete")
        save_completed_customer(package_customer())
    except BaseException as error:
        close_original_child()
        receipt["state"]="NEEDS_ATTENTION";receipt["error"]={"type":type(error).__name__,"message":str(error),"traceback":traceback.format_exc()}
        save(receipt_path,receipt);resource_snapshot("failure")
        print_status("remote-original-preserved",error=receipt["error"],private_root=str(PRIVATE))
        try:save_checkpoint("failure-"+str(len(receipt.get("attempts",[]))))
        except BaseException as saving_error:
            receipt["checkpoint_error"]={"type":type(saving_error).__name__,"message":str(saving_error)};save(receipt_path,receipt)
            print_status("remote-checkpoint-preserved",error=receipt["checkpoint_error"],private_root=str(PRIVATE))
    finally:
        close_original_child()
        _active=False
        print_status("REMOTE_CUSTOMER_ATTACHED",state=receipt["state"],private_root=str(PRIVATE),resume="run_original_remote_customer()")
run_original_remote_customer()
