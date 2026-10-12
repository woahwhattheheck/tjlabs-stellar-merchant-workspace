import argparse, base64, fcntl, hashlib, json, os, shutil, signal, stat, subprocess, sys, tempfile, time, traceback, zipfile
from pathlib import Path, PurePosixPath
os.umask(0o077)
OPERATION="ODATA-SUBSCRIPTION-CUSTOMER-F971-20261012-R1"
PRIVATE=Path("/dev/f971-odata-subscription-customer-r1")
SOURCE=PRIVATE/"SOURCE";INPUT=PRIVATE/"INPUT";OUTPUT=PRIVATE/"CUSTOMER"
ARCHIVE=Path("/workspace/scratch/f97104b7bf97/receipts/odata-comparison-customer-retained/OData_Complete_Comparison_Customer_Edition.zip")
ARCHIVE_BYTES=12405771
ARCHIVE_SHA="bac079568f9a4d73133540b7db6e0831307bd7daf016d87c2e57a40363d4d2d8"
NODE=Path("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
MODULES=Path("/workspace/scratch/9345d3fc660b/native-runtime/node_modules")
HELPER=PRIVATE/"original-library-helper/library_upload.py"
HELPERS={"library_upload.py":"5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767",
"library_hosted_apps.py":"97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59",
"library_file_transfer.py":"5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378"}
PACKET_BYTES=178670
PACKET_SHA="d89915508892392d85b38e671d3098817456e866a3de2f33d1d0e17da320ed8e"
DECODED_BYTES=394772
DECODED_SHA="cdecf40ce3ed0c723f61989b479b8036a2b5544058cd0312a1bc25f0ed61b788"
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
if not globals().get("_receiving_host_source"):
    need(globals().get("__file__"),"Retain the exact published host source in the owning invocation.")
    _receiving_host_source=Path(__file__).read_text(encoding="utf-8")
if not globals().get("_subscription_source_packet") and not globals().get("_subscription_source_packet_path"):
    parser=argparse.ArgumentParser(description="Operate the complete original subscription customer and save its closed phases.")
    parser.add_argument("--packet",required=True,help="Exact complete published subscription source-packet JSON.")
    parser.add_argument("--checkpoint",help="Original checkpoint descriptor JSON with path, bytes and sha256.")
    options=parser.parse_args()
    _subscription_source_packet_path=options.packet
    if options.checkpoint:
        _subscription_checkpoint=json.loads(Path(options.checkpoint).read_bytes())
need(sys.flags.interactive and sys.stdin.isatty(),"Run the complete original host with python3 -B -i in an attached terminal; keep its owning lifetime through every save.")
for path in (PRIVATE,SOURCE,INPUT,OUTPUT,PRIVATE/"temporary",PRIVATE/"provider",HELPER.parent):private(path)
os.environ["TMPDIR"]=str(PRIVATE/"temporary");tempfile.tempdir=str(PRIVATE/"temporary")
os.environ["PYTHONDONTWRITEBYTECODE"]="1";os.environ["NODE_OPTIONS"]="--max-old-space-size=512"
lease=os.open(PRIVATE/"subscription-host.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
child=None
receipt_path=PRIVATE/"subscription-host.json"
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
    print_status("subscription-resource-observation",label=label,filesystem=value["filesystem"],cgroup=value["cgroup"])
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
        marker="subscription-checkpoint.json";raw=archive.read(marker);manifest=json.loads(raw)
        need(manifest.get("schema")=="stellar-forge.odata-subscription-customer-checkpoint.v1" and
             manifest.get("operation_id")==OPERATION and manifest.get("private_root")==str(PRIVATE) and
             manifest.get("original_archive_sha256")==ARCHIVE_SHA and manifest.get("decoded_source_sha256")==DECODED_SHA,
             "Receive the original operation, source and customer checkpoint.")
        if label is not None:need(manifest["label"]==label,"Preserve the selected checkpoint phase.")
        declared={f["path"]:f for f in manifest["files"]}
        need(len(declared)==len(manifest["files"]) and set(declared)|{marker}=={m.filename for m in members},
             "Preserve every original checkpoint file.")
        need("subscription-host.json" in declared and "subscription-native-host.py" in declared,"Retain the original host and journal.")
        for member in members:
            safe_name(member.filename)
            need(not member.is_dir() and stat.S_IFMT(member.external_attr>>16) in (0,stat.S_IFREG),"Receive regular checkpoint files only.")
            if member.filename==marker:continue
            name=member.filename;parts=PurePosixPath(name).parts
            need((len(parts)>1 and parts[0] in {"SOURCE","INPUT","CUSTOMER","provider","original-library-helper"}) or
                 (len(parts)==1 and (name in {"subscription-host.json","subscription-native-host.py","ODATA_SUBSCRIPTION_NATIVE_HOST.md","OData_Subscription_Customer_Edition.zip","OData_Subscription_Customer_Result.json","subscription-customer-files.json","START.md"} or
                  name.endswith((".stdout.ndjson",".stderr.log")))),"The checkpoint selected a foreign path.")
            need("node_modules" not in parts and ".git" not in parts,"Restore the original source without mutable installations.")
            expected=declared[name]
            with archive.open(member) as stream:
                need(member.file_size==expected["bytes"] and hashlib.file_digest(stream,"sha256").hexdigest()==expected["sha256"],
                     "The complete checkpoint file changed: "+name)
        need(declared["subscription-native-host.py"]["sha256"]==hashlib.sha256(_receiving_host_source.encode()).hexdigest(),
             "Resume with the exact original checkpoint host source.")
    return manifest
def receive_checkpoint(selection):
    path=Path(selection["path"])
    need(path.is_file() and not path.is_symlink() and path.stat().st_size==selection["bytes"] and digest(path)==selection["sha256"],
         "Select the complete original retained checkpoint bytes.")
    manifest=checkpoint_verify(path);record=PRIVATE/"subscription-checkpoint-receiving.json"
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
    target=root/("OData_Subscription_"+label+"_Checkpoint.zip");candidate=root/("."+target.name+".building")
    save(receipt_path,receipt)
    if not target.exists():
        if candidate.exists():
            try:checkpoint_verify(candidate,label)
            except zipfile.BadZipFile:
                old=identity(candidate);book.setdefault("retired_incomplete",[]).append(old);save(receipt_path,receipt)
                need(identity(candidate)==old,"The original incomplete checkpoint changed.");candidate.unlink()
        if not candidate.exists():
            selected={}
            for parent in (SOURCE,INPUT,OUTPUT,PRIVATE/"provider",HELPER.parent):
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
                if p.name in {"subscription-host.json","subscription-native-host.py","ODATA_SUBSCRIPTION_NATIVE_HOST.md","OData_Subscription_Customer_Edition.zip","OData_Subscription_Customer_Result.json","subscription-customer-files.json","START.md"} or p.name.endswith((".stdout.ndjson",".stderr.log")):
                    need(p.is_file() and not p.is_symlink(),"Preserve a foreign original host file.");selected[p.name]=p
            files=[{"path":name,"bytes":p.stat().st_size,"sha256":digest(p)} for name,p in sorted(selected.items())]
            manifest={"schema":"stellar-forge.odata-subscription-customer-checkpoint.v1","operation_id":OPERATION,
                "private_root":str(PRIVATE),"original_archive_sha256":ARCHIVE_SHA,"decoded_source_sha256":DECODED_SHA,
                "label":label,"selected_at":book["selected_at"],"files":files}
            with zipfile.ZipFile(candidate,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
                for item in files:
                    p=selected[item["path"]];before=identity(p)
                    need(all(before[k]==item[k] for k in ("bytes","sha256")),"The original checkpoint selection changed.")
                    info=zipfile.ZipInfo(item["path"]);info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o600)<<16
                    with p.open("rb") as original,archive.open(info,"w",force_zip64=True) as out:shutil.copyfileobj(original,out,1024*1024)
                    need(identity(p)==before,"An original checkpoint member changed during publication.")
                archive.writestr("subscription-checkpoint.json",encoded(manifest))
            with candidate.open("rb") as stream:os.fsync(stream.fileno())
            checkpoint_verify(candidate,label)
        try:os.link(candidate,target)
        except FileExistsError:checkpoint_verify(target,label)
        candidate.unlink();sync_directory(root)
    checkpoint_verify(target,label)
    book["archive"]=identity(target);book["state"]="READY";save(receipt_path,receipt)
    print_status("subscription-closed-checkpoint",label=label,archive=book["archive"])
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
    print_status("subscription-checkpoint-library-return",label=label,state=record["state"],returncode=record.get("returncode"),
                 result=(provider/"stdout.json").read_text(errors="replace"),stderr=(provider/"stderr.log").read_text(errors="replace")[-4000:])
    need(succeeded,"The complete original checkpoint save needs its actual provider result reconciled.")
    return record

receiving=receive_checkpoint(_subscription_checkpoint) if globals().get("_subscription_checkpoint") else None
selection={"schema":"stellar-forge.odata-subscription-customer-native-host.v1","operation_id":OPERATION,
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
immutable(PRIVATE/"subscription-native-host.py",_receiving_host_source.encode())
save(receipt_path,receipt)
resource_snapshot("initial")
def acquire_source_packet():
    decoded=INPUT/"subscription-source.decoded.json"
    if decoded.exists():
        need(not decoded.is_symlink() and decoded.stat().st_size==DECODED_BYTES and digest(decoded)==DECODED_SHA,
             "Preserve the complete decoded original subscription source.")
        return decoded
    path=INPUT/"subscription-source.packet.json"
    if path.exists():
        need(not path.is_symlink() and path.stat().st_size==PACKET_BYTES and digest(path)==PACKET_SHA,
             "Preserve the complete selected subscription source packet.")
        return path
    supplied=globals().get("_subscription_source_packet")
    if supplied is None and globals().get("_subscription_source_packet_path"):
        supplied=Path(_subscription_source_packet_path).read_bytes()
    if supplied is not None:
        raw=supplied.encode() if isinstance(supplied,str) else supplied
        need(isinstance(raw,bytes) and len(raw)==PACKET_BYTES and hashlib.sha256(raw).hexdigest()==PACKET_SHA,
             "Select the exact complete subscription source packet in the initial invocation.")
        immutable(path,raw);return path
    raise RuntimeError("Supply the complete source packet before this owning invocation; no later interactive source feed is required.")
def stage_source():
    path=acquire_source_packet()
    packet=json.loads(path.read_bytes()) if path.name=="subscription-source.decoded.json" else decode(json.loads(path.read_bytes()))
    need(packet["schema"]=="stellar-forge.odata-subscription-customer-source.v1" and packet["operationId"]==OPERATION,
         "Choose the complete selected subscription operation.")
    need(packet["productCommit"]=="aee52023940d5c8fad821740943b2b05a62a7b0f" and
         packet["customerCommit"]=="54370f693343839ec54379ab2de400187dc66197" and
         packet["customerProgramCommit"]=="e0954b6f9aa77f31581fc3a0f1c6b4d395fcae03",
         "Preserve the reviewed whole product and original customer programmes.")
    need(packet["originalArchive"]=={"bytes":ARCHIVE_BYTES,"sha256":ARCHIVE_SHA},
         "The source packet selects another original complete archive.")
    need(ARCHIVE.is_file() and not ARCHIVE.is_symlink() and ARCHIVE.stat().st_size==ARCHIVE_BYTES and digest(ARCHIVE)==ARCHIVE_SHA,
         "The already completed original comparison archive changed.")
    for file in (NODE,MODULES):need(file.exists(),"The selected installed runtime is absent: "+str(file))
    need(set(packet["helpers"])==set(HELPERS),"Retain all three unchanged original Library helper files.")
    for name,expected in HELPERS.items():
        value=packet["helpers"][name];raw=value["content"].encode()
        need(len(raw)==value["bytes"] and hashlib.sha256(raw).hexdigest()==value["sha256"]==expected,
             "The unchanged Library helper differs: "+name)
        immutable(HELPER.parent/name,raw)
    operating_guide=packet["operatingGuide"];guide_raw=operating_guide["content"].encode()
    need(len(guide_raw)==operating_guide["bytes"] and hashlib.sha256(guide_raw).hexdigest()==operating_guide["sha256"],
         "The complete original operating guide changed.")
    immutable(PRIVATE/"ODATA_SUBSCRIPTION_NATIVE_HOST.md",guide_raw)
    selected={}
    with zipfile.ZipFile(ARCHIVE) as archive:
        members=archive.infolist()
        need(len(members)==1452 and len({item.filename for item in members})==1452,
             "The original complete customer member count changed.")
        need(sum(item.file_size for item in members)<=512*1024*1024,
             "The selected complete archive exceeded its receiving bound.")
        manifest=json.loads(archive.read("comparison-customer-files.json"))
        need(manifest["schema"]=="stellar-forge.odata-comparison-customer-files.v1",
             "Choose the original complete customer member manifest.")
        declared={item["name"]:item for item in manifest["files"]}
        need(len(declared)==1451 and set(declared)|{"comparison-customer-files.json"}=={item.filename for item in members},
             "The complete original customer membership changed.")
        for item in members:
            safe_name(item.filename)
            need(not item.is_dir() and stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFREG),
                 "The original archive contains a non-regular member.")
            if item.filename in declared:
                expected=declared[item.filename]
                with archive.open(item) as stream:
                    need(item.file_size==expected["bytes"] and hashlib.file_digest(stream,"sha256").hexdigest()==expected["sha256"],
                         "The complete original customer bytes changed: "+item.filename)
            if item.filename.startswith("SOURCE/"):
                name=item.filename[len("SOURCE/"):]
                safe_name(name)
                need("node_modules" not in PurePosixPath(name).parts and ".git" not in PurePosixPath(name).parts,
                     "Use the retained source without mutable dependencies.")
                destination=SOURCE/name;original_raw=archive.read(item)
                if name in packet["postimages"] and destination.exists():
                    need(not destination.is_symlink() and destination.read_bytes() in (original_raw,packet["postimages"][name]["content"].encode()),
                         "Preserve a changed original source while reopening this operation: "+name)
                else:immutable(destination,original_raw)
                selected[name]=identity(destination)
                selected[name]["git_blob_sha"]=hashlib.sha1(b"blob "+str(len(original_raw)).encode()+b"\0"+original_raw).hexdigest()
            elif item.filename in {"OData_Comparison_Workspace.json","worked-comparison-customer.json",
                    "runtime-source-selection.json","comparison-customer-files.json","Original_Comparison_Reviews.json"}:
                immutable(INPUT/item.filename,archive.read(item))
        need(len(selected)==1433,"The full original runtime source is incomplete.")
    need(len(packet["postimages"])==28,"Retain all 24 product leaves, the original asset dependency and all three operating files.")
    for name,value in packet["postimages"].items():
        safe_name(name);raw=value["content"].encode()
        need(len(raw)==value["bytes"] and hashlib.sha256(raw).hexdigest()==value["sha256"] and
             hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()==value["gitBlobSha"],
             "The exact reviewed source postimage changed: "+name)
        save(SOURCE/name,raw);selected[name]=identity(SOURCE/name)
        selected[name]["git_blob_sha"]=value["gitBlobSha"]
    modules=SOURCE/"node_modules"
    if modules.is_symlink():need(modules.readlink()==MODULES,"The selected dependency view changed.")
    else:need(not modules.exists(),"Preserve a different dependency view.");modules.symlink_to(MODULES,target_is_directory=True)
    source_files=[{"path":name,"bytes":value["bytes"],"sha256":value["sha256"],"git_blob_sha":value["git_blob_sha"]}
                  for name,value in sorted(selected.items())]
    inventory={"schema":"stellar-forge.odata-subscription-customer-source.v1",
        "product_commit":packet["productCommit"],"customer_commit":packet["customerCommit"],
        "customer_program_commit":packet["customerProgramCommit"],"original_archive_sha256":ARCHIVE_SHA,
        "files":source_files,"node_modules":str(MODULES)}
    immutable(INPUT/"runtime-source-selection.json.subscription",inventory)
    baseline=INPUT/"OData_Comparison_Workspace.json"
    descriptor={"schema":"stellar-forge.odata-subscription-customer-input.v1","operationId":OPERATION,
        "title":"Orders subscription customer: original retained 830-row editions",
        "checkout":str(SOURCE),"outputDirectory":str(OUTPUT),"workspaceTransfer":str(baseline),
        "workspaceTransferSha256":digest(baseline),"archiveSha256":ARCHIVE_SHA,
        "beforeCollection":"live/products/orders/collections/orders-complete",
        "afterCollection":"live/products/orders/collections/orders-country-selection",
        "expectedRows":830,
        "expectedChanges":{"after":830,"matched":830,"added":0,"removed":0,"changed":0,"unchanged":830,"events":0}}
    immutable(INPUT/"subscription-customer-input.json",descriptor)
    receipt["source"]={"files":len(source_files),"bytes":sum(item["bytes"] for item in source_files),
        "inventory":identity(INPUT/"runtime-source-selection.json.subscription"),"product_commit":packet["productCommit"],
        "customer_commit":packet["customerCommit"],"customer_program_commit":packet["customerProgramCommit"]}
    save(receipt_path,receipt)
    print_status("subscription-source-ready",files=len(source_files),bytes=receipt["source"]["bytes"])
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
        save(receipt_path,receipt);print_status("subscription-native-started",stage=label,child_pid=child.pid)
        for line in child.stdout:
            output.write(line)
            if len(line)<20000:sys.stdout.buffer.write(line);sys.stdout.buffer.flush()
        code=child.wait();child=None
    attempt["exit_code"]=code;attempt["finished_at"]=time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
    attempt["stdout"]=identity(log.with_suffix(".stdout.ndjson"));attempt["stderr"]=identity(log.with_suffix(".stderr.log"))
    save(receipt_path,receipt)
    if code:
        print_status("subscription-native-needs-attention",stage=label,exit_code=code,stderr=log.with_suffix(".stderr.log").read_text(errors="replace")[-7000:])
        raise RuntimeError("The same original "+label+" returned "+str(code))
def package_customer():
    source_inventory=json.loads((INPUT/"runtime-source-selection.json.subscription").read_bytes())
    result=json.loads((OUTPUT/"subscription-customer-result.json").read_bytes())
    analysis=json.loads((OUTPUT/"subscription-analysis-result.json").read_bytes())
    need(result["state"]==analysis["state"]=="COMPLETE" and
         result["operation_id"]==analysis["operation_id"]==OPERATION and
         result["archive_sha256"]==ARCHIVE_SHA and
         result["source_rows"]==analysis["rows"]==830 and
         result["definition_sha256"]==analysis["definition_sha256"] and
         result["analysis_source_sha256"]==analysis["source_sha256"] and
         result["final_customer"]["editionSha256"]==analysis["edition_sha256"],
         "Complete the same selected native and analytical customer before delivery.")
    for item in result["final_files"]:
        need(identity(Path(item["path"]))==item,"A selected original final native file changed.")
    need(identity(Path(analysis["workspace_archive"]["path"]))==analysis["workspace_archive"],
         "The independently received Analysis archive changed.")
    start="""# Complete OData subscription customer
This edition contains the complete publisher/customer operation over two original 830-row Orders collections and the independently received Analysis workspace. The selected field intersection has 830 unchanged rows, zero additions/removals and zero changed values. The second collection selects fewer fields; the earlier comparison's 4,150 selection-changed cells are not supplier updates.

SOURCE/ is the complete retained runtime with all 24 published subscription product leaves, the original browser-asset dependency, and the three complete customer operating files. INPUT/ retains the exact source packet, complete original workspace transfer and input identities. CUSTOMER/ retains the complete publisher and customer directories, original source workspace, all three transfers, publisher/customer backups, proof documents, Analysis workspaces, queries, step returns and journals.

Read SOURCE/stellar-forge/mcp-merchant-operator/examples/SUBSCRIPTION_CUSTOMER.md for the complete operation and continuing application. The product's SUBSCRIPTIONS.md describes the browser, CLI and MCP interfaces.

## Open the continuing subscription
The original generated CUSTOMER/Subscription_Connection.json selects the actual publisher and customer paths in its operated host. To move this edition, receive CUSTOMER/backups/publisher-3 and CUSTOMER/backups/customer-3 through the original native subscription backup receivers into new private directories, then use those returned paths in a new connection. Preserve the original connection and journals as operated evidence. The original source guide gives every alias, command and request shape.

## Open the independently received Analysis workspace
CUSTOMER/OData_Subscription_Analysis_Workspace.zip contains the complete retained source and dataset. Receive it with the original stellar_forge_buyer.workspace_archive_receive command in SOURCE/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python, using the exact digest in CUSTOMER/subscription-analysis-result.json. Then open it through the original Analysis application.

subscription-customer-files.json covers every delivered file with its exact byte count and SHA-256. OPERATING/subscription-native-host.py and OPERATING/original-library-helper/ contain the original operating/save source. Provider request journals and signed transfer details remain in the separate private operation checkpoint.
"""
    immutable(PRIVATE/"START.md",start.encode())
    selected={}
    for item in source_inventory["files"]:
        path=SOURCE/item["path"];actual=identity(path)
        need(all(actual[key]==item[key] for key in ("bytes","sha256")),
             "The selected full runtime changed before packaging.")
        selected["SOURCE/"+item["path"]]=path
    for prefix,root in (("CUSTOMER",OUTPUT),("INPUT",INPUT)):
        for current,dirs,names in os.walk(root,followlinks=False):
            for name in dirs:need(not (Path(current)/name).is_symlink(),"Preserve a foreign customer directory.")
            for name in names:
                path=Path(current)/name
                need(path.is_file() and not path.is_symlink(),"Preserve a non-regular customer file.")
                selected[prefix+"/"+str(path.relative_to(root))]=path
    selected["START.md"]=PRIVATE/"START.md"
    selected["OPERATING/subscription-native-host.py"]=PRIVATE/"subscription-native-host.py"
    selected["OPERATING/ODATA_SUBSCRIPTION_NATIVE_HOST.md"]=PRIVATE/"ODATA_SUBSCRIPTION_NATIVE_HOST.md"
    for name in HELPERS:selected["OPERATING/original-library-helper/"+name]=HELPER.parent/name
    files=[{"name":name,"bytes":path.stat().st_size,"sha256":digest(path)} for name,path in sorted(selected.items())]
    immutable(PRIVATE/"subscription-customer-files.json",
        {"schema":"stellar-forge.odata-subscription-customer-files.v1","operation_id":OPERATION,"files":files})
    selected["subscription-customer-files.json"]=PRIVATE/"subscription-customer-files.json"
    final=PRIVATE/"OData_Subscription_Customer_Edition.zip"
    candidate=PRIVATE/".OData_Subscription_Customer_Edition.building.zip"
    declared={name:identity(path) for name,path in selected.items()}
    def verify(path):
        with zipfile.ZipFile(path) as archive:
            members=archive.infolist()
            need(len(members)==len(selected) and {item.filename for item in members}==set(selected),
                 "The complete customer archive membership changed.")
            for item in members:
                need(not item.is_dir() and stat.S_IFMT(item.external_attr>>16) in (0,stat.S_IFREG),
                     "The complete customer archive contains a non-regular member.")
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
                    before=identity(path)
                    need(before==declared[name],"The selected completed member changed before streaming.")
                    info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_DEFLATED
                    info.external_attr=(stat.S_IFREG|0o600)<<16
                    with path.open("rb") as source,archive.open(info,"w",force_zip64=True) as output:
                        shutil.copyfileobj(source,output,1024*1024)
                    need(identity(path)==before,"The original member changed during customer publication.")
            with candidate.open("rb") as stream:os.fsync(stream.fileno())
            verify(candidate)
        try:os.link(candidate,final)
        except FileExistsError:verify(final)
        candidate.unlink();sync_directory(PRIVATE)
    receipt["customer_archive"]=identity(final);receipt["state"]="PACKAGED";save(receipt_path,receipt)
    concise={"schema":"stellar-forge.odata-subscription-customer-delivery.v1","operation_id":OPERATION,"state":"COMPLETE",
        "original_archive_sha256":ARCHIVE_SHA,"source":receipt["source"],
        "source_rows":result["source_rows"],"observed_changes":result["observed_changes"],
        "definition_sha256":result["definition_sha256"],"edition":result["final_customer"]["revision"],
        "edition_sha256":result["final_customer"]["editionSha256"],
        "source_document_sha256":result["analysis_source_sha256"],"analysis_workspace_id":analysis["workspace_id"],
        "archive":receipt["customer_archive"],"members":len(selected),"native_children_closed":child is None}
    immutable(PRIVATE/"OData_Subscription_Customer_Result.json",concise)
    print_status("subscription-customer-packaged",archive=receipt["customer_archive"],members=len(selected))
    return [final,PRIVATE/"OData_Subscription_Customer_Result.json"]
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
    print_status("subscription-customer-library-return",state=record["state"],returncode=record.get("returncode"),
        result=stdout.read_text(errors="replace"),stderr=stderr.read_text(errors="replace")[-4000:])
    need(succeeded,"The completed customer edition retains an unresolved original provider outcome.")
    return record
_active=False
def run_original_subscription_customer():
    global _active,child
    need(not _active,"The original subscription customer process is active.")
    _active=True
    try:
        descriptor=stage_source()
        if receipt.get("customer_archive"):
            saved=receipt["customer_archive"];path=Path(saved["path"])
            need(identity(path)==saved,"Preserve the already completed original customer archive.")
            save_completed_customer(package_customer())
            receipt["state"]="COMPLETE";save(receipt_path,receipt);return
        run_command("subscription-customer",[str(NODE),
            str(SOURCE/"stellar-forge/mcp-merchant-operator/examples/subscription-customer.mjs"),
            str(INPUT/"subscription-customer-input.json")])
        native=json.loads((OUTPUT/"subscription-customer-result.json").read_bytes())
        need(native.get("state")=="COMPLETE" and native.get("operation_id")==OPERATION,
             "The native subscription producer has not completed this selected operation.")
        receipt["native_result"]=identity(OUTPUT/"subscription-customer-result.json")
        receipt["state"]="NATIVE_COMPLETE";save(receipt_path,receipt)
        save_checkpoint("native-complete")
        run_command("subscription-analysis",[sys.executable,"-B",
            str(SOURCE/"stellar-forge/mcp-merchant-operator/examples/subscription-customer-analysis.py"),
            "--checkout",str(SOURCE),"--operation",str(OUTPUT),"--node",str(NODE)])
        receipt["state"]="ANALYSIS_COMPLETE";save(receipt_path,receipt);resource_snapshot("complete")
        save_completed_customer(package_customer())
        receipt["state"]="COMPLETE";save(receipt_path,receipt)
    except BaseException as error:
        close_original_child()
        receipt["state"]="NEEDS_ATTENTION"
        receipt["error"]={"type":type(error).__name__,"message":str(error),"traceback":traceback.format_exc()}
        save(receipt_path,receipt);resource_snapshot("failure")
        print_status("subscription-original-preserved",error=receipt["error"],private_root=str(PRIVATE))
        try:save_checkpoint("failure-"+str(len(receipt.get("attempts",[]))))
        except BaseException as saving_error:
            receipt["checkpoint_error"]={"type":type(saving_error).__name__,"message":str(saving_error)}
            save(receipt_path,receipt)
            print_status("subscription-checkpoint-preserved",error=receipt["checkpoint_error"],private_root=str(PRIVATE))
    finally:
        close_original_child();_active=False
        print_status("SUBSCRIPTION_CUSTOMER_ATTACHED",state=receipt["state"],private_root=str(PRIVATE),
                     resume="run_original_subscription_customer()")
run_original_subscription_customer()
