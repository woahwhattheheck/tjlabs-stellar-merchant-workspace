#!/usr/bin/env python3
"""Open the complete original correction account and retain its next full edition."""
from __future__ import annotations
import argparse,contextlib,copy,datetime,fcntl,hashlib,json,os,re,shutil,signal,sqlite3,stat,subprocess,sys,tempfile,threading,time,uuid,zipfile
from pathlib import Path,PurePosixPath
sys.dont_write_bytecode=True

SCHEMA="commons.scf-correction-customer-receiving.v1"
SELECTION="course-output/current-source-selection.json"
COURSE="course-output/course-result.json"
RECOVERY="stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/recovery.mjs"
BINDING="stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/binding.mjs"
NATIVE_SERVER="stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs"
GRANT="stellar/scf_2026/sf47_budget_model/workspace"
MAX_ZIP=8*1024**3
MAX_MEMBERS=30000
HEX=re.compile(r"[a-f0-9]{64}")
NATIVE_CALL=r"""
import {pathToFileURL} from 'node:url';
let raw='';for await(const block of process.stdin)raw+=block;
const config=JSON.parse(raw);
try{
 const module=await import(pathToFileURL(config.module).href);
 const value=config.binding?await module.inspectAccountingWorkspaceBinding(config.directory):
   await module[config.action]({...config.arguments,passEnv:'SCF_CORRECTION_RESTORE_SECRET'});
 console.log(JSON.stringify(value));
}catch(error){console.error(JSON.stringify({code:error.code,message:error.message}));process.exitCode=1;}
"""
NATIVE_HOST=r"""
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const c=JSON.parse(await readFile(process.argv[2],'utf8'));
const {createReceivablesServer}=await import(pathToFileURL(c.module).href);
const state=JSON.parse(await readFile(c.directory+'/workspace.json','utf8'));
let service,closing=false,requested=false;
async function close(){requested=true;if(closing||!service)return;closing=true;
 try{await service.close();await writeFile(c.closed,JSON.stringify({closed:true})+'\n',{mode:0o600});}
 catch(e){console.error(e.stack);process.exitCode=1;}}
process.on('SIGTERM',close);process.on('SIGINT',close);
service=await createReceivablesServer({directory:c.directory,...state.sources,
 expectedWorkspaceId:c.identity.workspaceId,expectedSourcesSha256:c.identity.sourcesSha256,host:'127.0.0.1',port:0});
if(requested)await close();
else await writeFile(c.ready,JSON.stringify({directory:service.workspace.directory,
 baseUrl:new URL('/api/receivables',service.url).href})+'\n',{mode:0o600});
"""

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(ok,message):
    if not ok:raise ValueError(message)
def canonical(value):return (json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False)+"\n").encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def identity(path):
    h=hashlib.sha256();size=0
    with Path(path).open("rb") as stream:
        for block in iter(lambda:stream.read(1024*1024),b""):h.update(block);size+=len(block)
    return {"bytes":size,"sha256":h.hexdigest()}
def safe_name(value):
    require(isinstance(value,str) and value and "\\" not in value and ":" not in value and "\0" not in value,"Use a normalized relative package path.")
    path=PurePosixPath(value)
    require(not path.is_absolute() and str(path)==value and all(p not in {".","..",""} for p in path.parts),"A package path escapes its original root.")
    return value
def read_json(path,limit=32*1024*1024):
    require(Path(path).stat().st_size<=limit,"The retained JSON exceeds its original complete bound.")
    return json.loads(Path(path).read_bytes())
def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    temporary=path.with_name(path.name+"."+uuid.uuid4().hex+".partial")
    try:
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"wb") as out:out.write(canonical(value));out.flush();os.fsync(out.fileno())
        os.replace(temporary,path)
    finally:temporary.unlink(missing_ok=True)
def private_directory(path,create=False):
    path=Path(path).expanduser().absolute()
    if create:path.mkdir(mode=0o700,parents=False)
    st=path.lstat()
    require(stat.S_ISDIR(st.st_mode) and not path.is_symlink() and path.resolve()==path and st.st_uid==os.getuid() and not st.st_mode&0o077,
            "Use a real owner-private directory with mode 0700.")
    return path
def tree_files(root):
    root=Path(root)
    for path in sorted(root.rglob("*"),key=lambda p:p.relative_to(root).as_posix()):
        require(not path.is_symlink(),"Keep ordinary private files; a retained symlink is not followed.")
        if path.is_file():
            st=path.stat()
            require(stat.S_ISREG(st.st_mode) and st.st_nlink==1,"Keep regular unlinked retained files.")
            yield path.relative_to(root).as_posix(),path
def copy_new_tree(source,destination):
    destination.mkdir(mode=0o700)
    for rel,path in tree_files(source):
        target=destination/rel;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        with path.open("rb") as incoming,target.open("xb") as out:
            shutil.copyfileobj(incoming,out,1024*1024);out.flush();os.fsync(out.fileno())
        target.chmod(0o600)

def inspect_package(archive,expected):
    require(isinstance(expected,str) and HEX.fullmatch(expected),"Supply the exact delivered ZIP SHA-256.")
    archive=Path(archive).expanduser().resolve()
    before=identity(archive)
    require(0<before["bytes"]<=MAX_ZIP and before["sha256"]==expected,"The complete delivered ZIP differs from its required SHA-256.")
    with zipfile.ZipFile(archive) as z:
        infos=z.infolist();names=[i.filename for i in infos]
        require(len(names)==len(set(names)) and 0<len(names)<=MAX_MEMBERS and sum(i.file_size for i in infos)<=MAX_ZIP,"Keep the complete bounded original member set.")
        actual={}
        for item in infos:
            require(not item.is_dir(),"The complete course contains regular file members only.")
            safe_name(item.filename)
            mode=item.external_attr>>16
            require(not stat.S_ISLNK(mode) and not item.flag_bits&1 and item.compress_type in {zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED},"Unsupported or unsafe ZIP member.")
            h=hashlib.sha256();size=0
            with z.open(item) as stream:
                for block in iter(lambda:stream.read(1024*1024),b""):h.update(block);size+=len(block)
            require(size==item.file_size,"An original member is incomplete.")
            actual[item.filename]={"bytes":size,"sha256":h.hexdigest()}
        for name in (SELECTION,COURSE,"receiving-result.json","corrected-native-backup/backup.json",
                     "corrected-native-backup/encrypted/manifest.json","original-account/private/restore-key.txt",
                     "original-account/work/receiving/planning.sqlite3"):
            require(name in actual,"The retained continuation is missing "+name)
        require(actual[SELECTION]["bytes"]<=8*1024*1024 and actual[COURSE]["bytes"]<=32*1024*1024,"The complete receiving metadata is unexpectedly large.")
        selection=json.loads(z.read(SELECTION));course=json.loads(z.read(COURSE))
        require(selection.get("schema")=="commons.scf-correction-runtime-selection.v1" and isinstance(selection.get("files"),list),"Use the original selected correction runtime.")
        require(selection.get("operation")==course.get("operation",selection.get("operation")) and re.fullmatch(r"[a-f0-9]{40}",selection.get("sourceCommit","")),"Retain the original operation/source commit.")
        expected_files={}
        for row in selection["files"]:
            path=safe_name(row["path"]);name="source/"+path
            require(path not in expected_files and type(row["bytes"]) is int and row["bytes"]>=0 and HEX.fullmatch(row["sha256"]),"The selected source inventory is incomplete or repeated.")
            require(actual.get(name)=={"bytes":row["bytes"],"sha256":row["sha256"]},"A selected source differs: "+path)
            require(re.fullmatch(r"[a-f0-9]{40}",row.get("gitBlob","")),"Keep each selected source Git identity.")
            h=hashlib.sha1();h.update(b"blob "+str(row["bytes"]).encode()+b"\0")
            with z.open(name) as stream:
                for block in iter(lambda:stream.read(1024*1024),b""):h.update(block)
            require(h.hexdigest()==row["gitBlob"],"A selected Git source differs: "+path)
            expected_files[path]=row
        for path in (RECOVERY,BINDING,NATIVE_SERVER,GRANT+"/server.py",GRANT+"/operations.py",
                     GRANT+"/operations_commercial_adapter.py","stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json"):
            require(path in expected_files,"The current complete runtime lacks "+path)
        # Only source files named by the actual selection are executed. Retained
        # bytecode is preserved but Python uses a new private cache namespace.
        for name in actual:
            if name.startswith("source/"):
                rel=name[len("source/"):]
                require(rel in expected_files or "__pycache__" in PurePosixPath(rel).parts or rel.endswith(".pyc"),
                        "An unselected runtime file is present: "+rel)
        pair=course.get("originalIdentity",{})
        require(set(pair)=={"workspaceId","sourcesSha256"} and all(HEX.fullmatch(str(x)) for x in pair.values()),"The original accounting identity is absent.")
        backup=course.get("continuationBackup")
        if not isinstance(backup,dict):
            backup=course.get("fullAccountReceiving",{}).get("snapshot")
        require(isinstance(backup,dict) and backup.get("status")=="ACCOUNTING_BACKUP_CREATED" and HEX.fullmatch(backup.get("manifestSha256","")) and HEX.fullmatch(backup.get("workspaceSha256","")),
                "This continuation has no completed authenticated native snapshot; retain its original failure and account.")
        receipt=json.loads(z.read("corrected-native-backup/backup.json"))
        require(receipt.get("manifestSha256")==backup["manifestSha256"] and
                actual["corrected-native-backup/encrypted/manifest.json"]["sha256"]==backup["manifestSha256"],
                "The retained native backup differs from the course receipt.")
        require(16<=actual["original-account/private/restore-key.txt"]["bytes"]<=65536,"Retain the original private transport key.")
    require(identity(archive)==before,"The delivered ZIP changed while it was inspected.")
    return {"schema":SCHEMA,"input":before,"sourceSelection":selection,"sourceSelectionSha256":actual[SELECTION]["sha256"],
            "originalIdentity":pair,"backup":backup,"files":actual,"courseState":course.get("state"),"inspectedAt":now()}

def extract_package(archive,destination,inspection):
    destination.mkdir(mode=0o700)
    with zipfile.ZipFile(archive) as z:
        for name,meta in inspection["files"].items():
            target=destination/safe_name(name);target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            h=hashlib.sha256();size=0
            with z.open(name) as source,target.open("xb") as out:
                for block in iter(lambda:source.read(1024*1024),b""):out.write(block);h.update(block);size+=len(block)
                out.flush();os.fsync(out.fileno())
            target.chmod(0o600)
            require({"bytes":size,"sha256":h.hexdigest()}==meta,"An extracted original member differs.")
    atomic_json(destination/"extraction-complete.json",{"input":inspection["input"],"sourceSelectionSha256":inspection["sourceSelectionSha256"]})

@contextlib.contextmanager
def custody(root):
    fd=os.open(root/".correction-opener.lock",os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        require(os.fstat(fd).st_nlink==1,"Keep the original private opener lease.")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        yield
    finally:os.close(fd)

def stop_group(child):
    if child is None:return
    try:os.killpg(child.pid,signal.SIGTERM)
    except ProcessLookupError:pass
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        child.poll()
        try:os.killpg(child.pid,0)
        except ProcessLookupError:break
        time.sleep(.1)
    else:
        try:os.killpg(child.pid,signal.SIGKILL)
        except ProcessLookupError:pass
    child.wait(timeout=10)

def node_path(value):
    found=shutil.which(value) if value else None
    found=found or value or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
    require(found and Path(found).is_file(),"Use an installed Node runtime for the original native engine.")
    found=str(Path(found).resolve());os.environ["PATH"]=str(Path(found).parent)+os.pathsep+os.environ.get("PATH","")
    return found

def native_call(root,node,module,*,action=None,arguments=None,binding=None,key=None,tag="native"):
    logs=root/"opener-logs";logs.mkdir(mode=0o700,exist_ok=True)
    name=tag+"-"+uuid.uuid4().hex
    config={"module":str(module)}
    if binding:config.update(binding=True,directory=str(binding))
    else:config.update(action=action,arguments=arguments)
    env=os.environ.copy()
    if key:
        secret=Path(key).read_text().strip();require(16<=len(secret.encode())<=65536,"Retain the private restoration key.")
        env["SCF_CORRECTION_RESTORE_SECRET"]=secret
    child=None;stdout="";stderr="";failure=None
    try:
        child=subprocess.Popen([node,"--input-type=module","-e",NATIVE_CALL],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                               text=True,env=env,cwd=root,start_new_session=True)
        try:stdout,stderr=child.communicate(json.dumps(config),timeout=300)
        except BaseException as error:
            failure=error
            stop_group(child)
            stdout,stderr=child.communicate(timeout=10)
    finally:
        try:stop_group(child)
        finally:
            (logs/(name+".stdout")).write_text(stdout);(logs/(name+".stderr")).write_text(stderr)
            atomic_json(logs/(name+".json"),{"action":action or "inspect-binding","returncode":None if child is None else child.returncode,"at":now(),
                                           "error":None if failure is None else {"type":type(failure).__name__,"message":str(failure)}})
    if failure:raise failure
    require(child is not None and child.returncode==0,"The original native "+str(action or "identity inspection")+" failed; complete logs are retained.")
    return json.loads(stdout)

def retained(root):
    root=private_directory(root)
    record=read_json(root/"receiving.json")
    require(record.get("schema")==SCHEMA and record.get("state")=="READY","Finish this original receiving installation before opening its account.")
    package=root/"package";selection=read_json(package/SELECTION)
    require(identity(package/SELECTION)["sha256"]==record["sourceSelectionSha256"],"The installed source selection changed.")
    for row in selection["files"]:
        require(identity(package/"source"/safe_name(row["path"]))=={"bytes":row["bytes"],"sha256":row["sha256"]},"An installed selected source changed: "+row["path"])
    return record,package

def restore(archive,expected,directory,node):
    inspection=inspect_package(archive,expected);root=Path(directory).expanduser().absolute()
    require(not root.exists(),"Choose a new private root. Reopen installed work with the open command; existing work is never replaced.")
    root=private_directory(root,create=True)
    with custody(root):
        temp=root/"temporary";temp.mkdir(mode=0o700)
        os.environ["TMPDIR"]=str(temp);tempfile.tempdir=str(temp);sys.pycache_prefix=str(temp/"python-cache")
        record={"schema":SCHEMA,"state":"RECEIVING","createdAt":now(),"originalIdentity":inspection["originalIdentity"],
                "input":inspection["input"],"sourceSelectionSha256":inspection["sourceSelectionSha256"],"sourceCommit":inspection["sourceSelection"]["sourceCommit"],
                "backup":inspection["backup"]}
        atomic_json(root/"receiving.json",record)
        try:
            package=root/"package";extract_package(archive,package,inspection)
            state=root/"native-state";state.mkdir(mode=0o700)
            account=state/"accounting";key=package/"original-account/private/restore-key.txt"
            receipt=native_call(root,node,package/"source"/RECOVERY,action="restoreAccountingWorkspace",
                arguments={"bundle":str(package/"corrected-native-backup"),"expectedSha256":inspection["backup"]["manifestSha256"],
                           "directory":str(account),"stateRoot":str(state),"quiesced":True,"relocate":True,
                           "expectedWorkspaceId":inspection["originalIdentity"]["workspaceId"],"expectedSourcesSha256":inspection["originalIdentity"]["sourcesSha256"]},
                key=key,tag="restore-account")
            require(receipt.get("status")=="ACCOUNTING_WORKSPACE_RESTORED" and receipt.get("originalWorkspaceSha256")==inspection["backup"]["workspaceSha256"],
                    "The restored complete account differs from its authenticated backup.")
            require({k:receipt["binding"][k] for k in inspection["originalIdentity"]}==inspection["originalIdentity"],"The original native identity changed.")
            atomic_json(root/"native-restore-receipt.json",receipt)
            copy_new_tree(package/"original-account/work",root/"planning")
            require((root/"planning/receiving/planning.sqlite3").is_file(),"The original primary receiving planning database is absent.")
            record.update(state="READY",restoredAt=now(),nativeDirectory="native-state/accounting",planningDirectory="planning/receiving")
            atomic_json(root/"receiving.json",record)
        except BaseException as error:
            record.update(state="RECEIVING_INTERRUPTED",error={"type":type(error).__name__,"message":str(error)})
            atomic_json(root/"receiving.json",record);raise
    return {"schema":SCHEMA,"state":"READY","root":str(root),"originalIdentity":record["originalIdentity"],"sourceCommit":record["sourceCommit"]}

def snapshot(root,record,package,node):
    bound=native_call(root,node,package/"source"/BINDING,binding=root/"native-state/accounting",tag="inspect-before-snapshot")
    require({key:bound[key] for key in record["originalIdentity"]}==record["originalIdentity"],"The current account no longer has the original connection identity; preserve its existing work for explicit review.")
    snapshots=root/"snapshots";snapshots.mkdir(mode=0o700,exist_ok=True)
    output=snapshots/("account-"+uuid.uuid4().hex)
    result=native_call(root,node,package/"source"/RECOVERY,action="snapshotAccountingWorkspace",
            arguments={"directory":str(root/"native-state/accounting"),"stateRoot":str(root/"native-state"),"output":str(output),"quiesced":True},
            key=package/"original-account/private/restore-key.txt",tag="snapshot-account")
    require(result.get("status")=="ACCOUNTING_BACKUP_CREATED","The current native snapshot did not complete.")
    atomic_json(root/"latest-native-snapshot.json",result)
    return result

def export_closed(root,node,output=None):
    record,package=retained(root);receipt=snapshot(root,record,package,node)
    selection=read_json(package/SELECTION)
    destination=Path(output).expanduser().absolute() if output else root/"deliveries"/("SCF_Correction_Desk_"+datetime.datetime.now().strftime("%Y%m%d_%H%M%S")+"_"+uuid.uuid4().hex[:8]+".zip")
    destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    require(not destination.exists(),"Keep every complete saved delivery; choose a new output filename.")
    # A new full delivery keeps the same native receiving layout. Earlier native
    # backups remain addressable by their original manifest identity.
    paths={name:path for name,path in tree_files(package) if name!="extraction-complete.json"}
    old_backup=read_json(package/"corrected-native-backup/backup.json")["manifestSha256"]
    for name in list(paths):
        if name.startswith("corrected-native-backup/"):
            rel=name[len("corrected-native-backup/"):]
            retained_name="retained-native-backups/"+old_backup+"/"+rel
            if retained_name in paths:require(identity(paths[retained_name])==identity(paths[name]),"An earlier retained backup identity differs.")
            else:paths[retained_name]=paths[name]
            del paths[name]
        elif name.startswith("original-account/work/"):del paths[name]
    for rel,path in tree_files(Path(receipt["output"])):paths["corrected-native-backup/"+rel]=path
    for rel,path in tree_files(root/"planning"):paths["original-account/work/"+rel]=path
    for rel,path in tree_files(root/"opener-logs"):paths["customer-opening-logs/"+rel]=path
    course=read_json(package/COURSE);course["continuationBackup"]=receipt
    history_path=root/"opening-history.json";history=read_json(history_path) if history_path.exists() else []
    previous=read_json(package/"course-output/customer-opening-history.json") if (package/"course-output/customer-opening-history.json").exists() else []
    combined=previous+history
    course["customerContinuation"]={"updatedAt":now(),"priorDelivery":record["input"],"primaryPlanning":"original-account/work/receiving/planning.sqlite3",
                                    "sourceCommit":selection["sourceCommit"],"nativeIdentity":record["originalIdentity"],"openingCount":len(combined)}
    overrides={COURSE:canonical(course),"course-output/customer-opening-history.json":canonical(combined),
               "course/open-correction-desk.py":Path(__file__).read_bytes()}
    outer=read_json(package/"receiving-result.json")
    outer["customerContinuation"]=course["customerContinuation"]
    if isinstance(outer.get("course"),dict):outer["course"]["continuationBackup"]=receipt
    overrides["receiving-result.json"]=canonical(outer)
    temporary=destination.with_name(destination.name+"."+uuid.uuid4().hex+".partial")
    try:
        with zipfile.ZipFile(temporary,"x",zipfile.ZIP_DEFLATED,compresslevel=3) as z:
            for name in sorted(set(paths)|set(overrides)):
                safe_name(name)
                if name in overrides:
                    info=zipfile.ZipInfo(name);info.external_attr=0o100600<<16;info.compress_type=zipfile.ZIP_DEFLATED
                    z.writestr(info,overrides[name])
                else:z.write(paths[name],name)
        temporary.chmod(0o600)
        with temporary.open("rb") as handle:os.fsync(handle.fileno())
        actual=identity(temporary);checked=inspect_package(temporary,actual["sha256"])
        require(checked["originalIdentity"]==record["originalIdentity"],"The outgoing original identity changed.")
        os.link(temporary,destination)
    finally:temporary.unlink(missing_ok=True)
    result={"state":"COMPLETE_PACKAGE_SAVED","path":str(destination),**actual,"originalIdentity":record["originalIdentity"],
            "backupManifestSha256":receipt["manifestSha256"],"sourceCommit":selection["sourceCommit"]}
    atomic_json(root/"last-delivery.json",result);return result

def open_workspace(directory,node,port=0):
    root=private_directory(directory)
    with custody(root):
        record,package=retained(root)
        temporary=root/"temporary";temporary.mkdir(mode=0o700,exist_ok=True)
        os.environ["TMPDIR"]=str(temporary);tempfile.tempdir=str(temporary);sys.pycache_prefix=str(temporary/"python-cache")
        pair=record["originalIdentity"];account=root/"native-state/accounting"
        bound=native_call(root,node,package/"source"/BINDING,binding=account,tag="inspect-current-account")
        require({k:bound[k] for k in pair}==pair,"The installed original account identity differs.")
        run_id=uuid.uuid4().hex;logs=root/"opener-logs"
        ready=logs/(run_id+"-native-ready.json");closed=logs/(run_id+"-native-closed.json")
        script=logs/(run_id+"-native-host.mjs");script.write_text(NATIVE_HOST);script.chmod(0o600)
        config=logs/(run_id+"-native-config.json")
        atomic_json(config,{"module":str(package/"source"/NATIVE_SERVER),"directory":str(account),"identity":pair,"ready":str(ready),"closed":str(closed)})
        native=None;server=None;thread=None;handles=[];failure=None;cleanup=[];delivery=None
        opening={"id":run_id,"startedAt":now(),"state":"OPENING","identity":pair,"sourceCommit":record["sourceCommit"],"financialCommands":0}
        history_path=root/"opening-history.json";history=read_json(history_path) if history_path.exists() else []
        history.append(opening);atomic_json(history_path,history)
        try:
            stdout=(logs/(run_id+"-native.stdout")).open("wb");stderr=(logs/(run_id+"-native.stderr")).open("wb");handles=[stdout,stderr]
            native=subprocess.Popen([node,str(script),str(config)],cwd=root,stdout=stdout,stderr=stderr,start_new_session=True,env=os.environ.copy())
            deadline=time.monotonic()+120
            while not ready.exists():
                require(native.poll() is None,"The original accounting server exited; retain its complete logs.")
                if time.monotonic()>deadline:raise TimeoutError("The original accounting server did not become ready.")
                time.sleep(.1)
            info=read_json(ready);require(Path(info["directory"]).resolve()==account.resolve(),"The original accounting service opened another directory.")
            sys.path.insert(0,str(package/"source"/GRANT))
            from server import create_server
            from operations import Operations
            from operations_commercial_adapter import CommercialConnectionAdapter
            server=create_server(root/"planning/receiving",package/"source/stellar/scf_2026/sf47_budget_model/sf10_current_candidate.json",port=port)
            ops=Operations(server.workspace);adapter=CommercialConnectionAdapter(server.workspace)
            endpoints={}
            for raw, in server.workspace.db.execute("SELECT body_json FROM ops_commercial_receivables"):
                prepared=json.loads(raw);candidate=prepared.get("accountingIdentity",{})
                if all(candidate.get(k)==v for k,v in pair.items()):endpoints[prepared["endpointId"]]=True
            require(endpoints,"The original received planning case has no connection to this account.")
            # Updating the local transport URL is the existing adapter action.
            # Every original endpoint ID and both identity guards remain intact.
            receipts=[]
            for ident in sorted(endpoints):
                request={"id":ident,"label":"Retained correction account · local customer workspace","baseUrl":info["baseUrl"],
                         "actor":"Local correction workspace operator","requestId":"correction-open-"+run_id+"-"+hashlib.sha256(ident.encode()).hexdigest()[:16]}
                atomic_json(logs/(run_id+"-connection-"+hashlib.sha256(ident.encode()).hexdigest()[:16]+".json"),{"request":request,"state":"DISPATCH_PENDING"})
                value=adapter.configure(request);receipts.append(value)
            opening.update(state="OPEN",connections=receipts,planningOrigin=server.origin,nativeBaseUrl=info["baseUrl"])
            atomic_json(history_path,history)
            access=server.origin+"/#access="+server.token
            atomic_json(root/"private-access.json",{"planning":access,"accounting":info["baseUrl"],"openedAt":now(),"operation":run_id})
            thread=threading.Thread(target=server.serve_forever,name="original-correction-planning",daemon=False);thread.start()
            print(json.dumps({"state":"OPEN","root":str(root),"planning":access,"accounting":info["baseUrl"],
                              "message":"Open Delivery operations, the retained case, Customer billing and its original saved schedule. Stop with Ctrl-C to close and save the whole updated account."}),flush=True)
            while thread.is_alive():
                require(native.poll() is None,"The original accounting server closed; retaining the complete continuation.")
                time.sleep(.25)
        except (KeyboardInterrupt,SystemExit) as error:
            opening["stop"]={"type":type(error).__name__,"message":str(error)}
        except BaseException as error:
            failure=error;opening["error"]={"type":type(error).__name__,"message":str(error)}
        finally:
            # Every owned close runs, even when a preceding close fails.
            operations=[]
            if server is not None:
                if thread is not None and thread.is_alive():operations.extend([("planning shutdown",server.shutdown),("planning join",lambda:thread.join(timeout=30))])
                operations.extend([("planning socket",server.server_close),("planning workspace",server.workspace.close)])
            if native is not None:operations.append(("native process group",lambda:stop_group(native)))
            operations.extend(("native log",handle.close) for handle in handles)
            for label,action in operations:
                try:action()
                except BaseException as error:cleanup.append({"step":label,"type":type(error).__name__,"message":str(error)})
            if thread is not None and thread.is_alive():cleanup.append({"step":"planning thread","message":"The owned planning thread remains active."})
            opening.update(state="CLOSED" if not cleanup else "CLOSE_FAILED",closedAt=now(),cleanupErrors=cleanup)
            atomic_json(history_path,history)
            if not cleanup:
                try:delivery=export_closed(root,node);opening["delivery"]=delivery;atomic_json(history_path,history)
                except BaseException as error:
                    opening["saveError"]={"type":type(error).__name__,"message":str(error)};atomic_json(history_path,history)
                    if failure is None:failure=error
            else:
                if failure is None:failure=RuntimeError("Owned-service close did not complete; current files were retained without claiming a quiesced backup.")
        if delivery:print(json.dumps(delivery),flush=True)
        if failure:raise failure
        return delivery

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node",default=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or "node")
    sub=parser.add_subparsers(dest="command",required=True)
    check=sub.add_parser("inspect");check.add_argument("archive",type=Path);check.add_argument("--sha256",required=True)
    receive=sub.add_parser("restore");receive.add_argument("archive",type=Path);receive.add_argument("--sha256",required=True);receive.add_argument("--root",type=Path,required=True)
    serve=sub.add_parser("open");serve.add_argument("root",type=Path);serve.add_argument("--port",type=int,default=0)
    pack=sub.add_parser("export");pack.add_argument("root",type=Path);pack.add_argument("--output",type=Path)
    args=parser.parse_args()
    old_handlers={}
    def stopping(number,_):
        signal.signal(signal.SIGTERM,signal.SIG_IGN)
        signal.signal(signal.SIGINT,signal.SIG_IGN)
        raise SystemExit(128+number)
    for sig in (signal.SIGINT,signal.SIGTERM):old_handlers[sig]=signal.signal(sig,stopping)
    try:
        if args.command=="inspect":
            result=inspect_package(args.archive,args.sha256)
            print(json.dumps({k:result[k] for k in ("schema","input","sourceSelectionSha256","originalIdentity","backup","courseState")},indent=2));return
        node=node_path(args.node)
        if args.command=="restore":result=restore(args.archive,args.sha256,args.root,node);print(json.dumps(result,indent=2))
        elif args.command=="open":open_workspace(args.root,node,args.port)
        else:
            root=private_directory(args.root)
            with custody(root):
                temporary=root/"temporary";temporary.mkdir(mode=0o700,exist_ok=True)
                os.environ["TMPDIR"]=str(temporary);tempfile.tempdir=str(temporary);sys.pycache_prefix=str(temporary/"python-cache")
                print(json.dumps(export_closed(root,node,args.output),indent=2))
    finally:
        for sig,handler in old_handlers.items():signal.signal(sig,handler)

if __name__=="__main__":
    try:main()
    except (ValueError,OSError,RuntimeError,TimeoutError) as error:
        print(json.dumps({"state":"RETAINED_WITH_ERROR","type":type(error).__name__,"message":str(error)}),file=sys.stderr)
        raise SystemExit(1)
