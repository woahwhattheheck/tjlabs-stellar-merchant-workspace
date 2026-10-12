import base64,fcntl,hashlib,json,os,pathlib,selectors,shutil,stat,subprocess,sys,tempfile,threading,time,traceback,zipfile
from datetime import datetime,timezone
P=pathlib.Path
OP="SCF-DATASETTE-SOURCE-EDITIONS-07476-20261012"
def stamp():return datetime.now(timezone.utc).isoformat()
def emit(stage,**items):print(json.dumps({"stage":stage,"at":stamp(),**items},separators=(",",":")),flush=True)
def digest(path):
    h=hashlib.sha256()
    with P(path).open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
    return h.hexdigest()
def save_json(path,value):
    path=P(path);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    temp=path.with_name(path.name+".pending-"+str(os.getpid()))
    with temp.open("w",encoding="utf-8") as f:
        json.dump(value,f,indent=2,sort_keys=True);f.write("\n");f.flush();os.fsync(f.fileno())
    os.replace(temp,path)
def read_json(path):
    try:return json.loads(P(path).read_bytes())
    except (FileNotFoundError,json.JSONDecodeError):return None
def public_save(row):
    keys=("local_path","status","library_file_id","file_id","file_name","current_version_number","error_code","bytes")
    return {k:row[k] for k in keys if k in row}
def succeeded(row):return row.get("status")=="succeeded" and bool(row.get("library_file_id")) and bool(row.get("file_id"))
os.umask(0o077);sys.dont_write_bytecode=True
original_root=os.environ.get("DATASETTE_DELIVERY_ROOT")
root=P(original_root).resolve(strict=True) if original_root else P(tempfile.mkdtemp(prefix="datasette-publisher-a49aa-",dir="/dev"))
if original_root and not (root/"delivery-input.json").is_file():raise RuntimeError("Resume requires the complete retained original delivery directory.")
tmp=root/"private-temp";tmp.mkdir(mode=0o700,exist_ok=True)
os.environ["TMPDIR"]=str(tmp);tempfile.tempdir=str(tmp)
os.environ.setdefault("AZCOPY_CONCURRENCY_VALUE","4")
os.environ["GIT_TERMINAL_PROMPT"]="0"
node=P(os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
os.environ["PATH"]=str(node.parent)+os.pathsep+os.environ.get("PATH","")
os.environ["npm_config_cache"]=str(tmp/"npm-cache")
os.environ["npm_config_update_notifier"]="false"
helpers=root/"helpers";helpers.mkdir(mode=0o700,exist_ok=True)
for name,content in payload["helpers"].items():
    if P(name).name!=name:raise RuntimeError("Unexpected helper path.")
    (helpers/name).write_text(content,encoding="utf-8")
sys.path.insert(0,str(helpers))
lease=(root/"delivery-controller.lock").open("a+b")
fcntl.flock(lease.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
source_identity={"operation":OP,"capsule_sha256":payload["capsule_sha256"],"installed_source_ref":payload["installed_source_ref"],"installed_runner_sha256":payload["installed_runner_sha256"],"original_request":payload["original_request"]}
retained=read_json(root/"delivery-input.json")
if retained and retained!=source_identity:
    successor=payload.get("installed_source_successor",{})
    expected=dict(retained);expected["installed_source_ref"]=successor.get("to")
    if (retained.get("installed_source_ref")!=successor.get("from") or source_identity!=expected
        or successor.get("from")!="3038f81d9a99f785be987281824df0ee537c187a"
        or successor.get("to")!="a78709d02d323924446702a851e85bcf256f2437"
        or successor.get("source_owner_reply")!="1791837691.027549"
        or (root/"installed/installed-browser-journey.json").exists()):
        raise RuntimeError("The retained original delivery source and request differ.")
    selection={"selected_at":stamp(),"previous":retained,"selected":source_identity,"source_owner":successor}
    selection_path=root/"run-history"/"installed-source-selection-a78709d.json"
    prior_selection=read_json(selection_path)
    if prior_selection:
        if any(prior_selection.get(k)!=selection[k] for k in ("previous","selected","source_owner")):raise RuntimeError("The original installed selection history differs.")
    else:save_json(selection_path,selection)
    emit("datasette_installed_source_selected",previous=successor["from"],selected=successor["to"],source_owner_reply=successor["source_owner_reply"])
save_json(root/"delivery-input.json",source_identity)
(root/"delivery-payload.json").write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
(root/"run-delivery.py").write_text('import json\nfrom pathlib import Path\npayload=json.loads((Path(__file__).parent/"delivery-payload.json").read_bytes())\nexec(compile(payload["driver"],"<Datasette complete original delivery>","exec"))\n',encoding="utf-8")
(root/"delivery-controller.py").write_text(payload["driver"],encoding="utf-8")
emit("datasette_receiver_accepted",operation=OP,pid=os.getpid(),procfs_pid=os.readlink("/proc/self"),root=str(root),original_request=payload["original_request"])
outcome={"schema":"commons.datasette-complete-installed-delivery.v1",**source_identity,"root":str(root),"started_at":stamp(),"state":"RUNNING"}
done=threading.Event()
def progress():
    previous={}
    while not done.wait(15):
        for label,name in (("publisher",root/"journey/publisher-programme-state.json"),("installed",root/"installed/installed-browser-journey.json")):
            value=read_json(name)
            if value:
                state={k:value[k] for k in ("id","phase","runId","updatedAt","completedAt") if k in value}
                if state!=previous.get(label):emit("datasette_progress",programme=label,**state);previous[label]=state
threading.Thread(target=progress,daemon=True).start()
def run(arguments,label,cwd=None,timeout=None):
    out=root/(label+".stdout");err=root/(label+".stderr")
    started=time.monotonic()
    with out.open("wb") as stdout,err.open("wb") as stderr:
        process=subprocess.Popen([str(a) for a in arguments],cwd=str(cwd or root),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        emit("datasette_process_started",phase=label,pid=process.pid)
        select=selectors.DefaultSelector()
        select.register(process.stdout,selectors.EVENT_READ,(stdout,"stdout"));select.register(process.stderr,selectors.EVENT_READ,(stderr,"stderr"))
        pending={"stdout":b"","stderr":b""}
        while select.get_map():
            if timeout and time.monotonic()-started>timeout:
                import signal
                os.killpg(process.pid,signal.SIGTERM)
                try:process.wait(10)
                except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
                raise TimeoutError(label+" did not finish within its selected runtime.")
            for key,_ in select.select(timeout=1):
                stream,kind=key.data;raw=os.read(key.fileobj.fileno(),65536)
                if not raw:
                    select.unregister(key.fileobj);key.fileobj.close();continue
                stream.write(raw);stream.flush();pending[kind]+=raw
                while b"\n" in pending[kind]:
                    line,pending[kind]=pending[kind].split(b"\n",1)
                    if line.startswith(b"{") and len(line)<6000:
                        try:
                            value=json.loads(line)
                            if isinstance(value,dict) and ("phase" in value or "stage" in value or "state" in value):emit("datasette_native_progress",programme=label,channel=kind,event=value)
                        except json.JSONDecodeError:pass
        code=process.wait()
    emit("datasette_process_exited",phase=label,returncode=code,seconds=round(time.monotonic()-started,2))
    if code:
        raise RuntimeError(label+" returned "+str(code)+": "+err.read_text(errors="replace")[-6000:])
    return {"returncode":code,"stdout":str(out),"stderr":str(err)}
def persist_complete_phase(original_outcome,phase):
    outcome=json.loads(json.dumps(original_outcome))
    outcome["checkpoint_phase"]=phase
    if phase=="publisher":outcome["state"]="PUBLISHER_COMPLETE"
    delivery_result={}
    def delivered(**values):
        delivery_result.update({"state":outcome["state"],"checkpoint_phase":phase,**values})
        emit("datasette_delivery_saved",**delivery_result)
    outcome["finished_at"]=stamp()
    capacity={"observed_at":stamp(),"cgroup":{},"filesystems":{}}
    for name in ("memory.stat","memory.current","memory.max","memory.events"):
        path=P("/sys/fs/cgroup")/name
        try:capacity["cgroup"][name]=path.read_text(encoding="utf-8").strip()
        except OSError as error:capacity["cgroup"][name]={"error":type(error).__name__,"errno":error.errno}
    for selected_path in ("/workspace/scratch/49aa6abb32bb","/dev/shm","/dev","/mnt/data"):
        try:
            value=os.statvfs(selected_path)
            capacity["filesystems"][selected_path]={"total_bytes":value.f_blocks*value.f_frsize,"free_bytes":value.f_bfree*value.f_frsize,"available_bytes":value.f_bavail*value.f_frsize,"free_inodes":value.f_favail}
        except OSError as error:capacity["filesystems"][selected_path]={"error":type(error).__name__,"errno":error.errno}
    outcome["host_capacity_at_save"]=capacity
    save_json(root/"host-capacity-at-save.json",capacity)
    emit("datasette_host_capacity_at_save",**capacity)
    report=root/("Datasette_Publisher_Complete_Result.json" if phase=="publisher" else "Datasette_Publisher_Installed_Operating_Result.json")
    save_json(report,outcome)
    prior_manifest=root/"complete-checkpoint-manifest.json"
    if prior_manifest.is_file():
        previous_digest=digest(prior_manifest)
        retained_manifest=root/"run-history"/"checkpoint-manifests"/(previous_digest+".json")
        retained_manifest.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        if retained_manifest.exists():
            if digest(retained_manifest)!=previous_digest:raise RuntimeError("The preceding checkpoint manifest changed.")
        else:shutil.copy2(prior_manifest,retained_manifest)
    export=root/"export";export.mkdir(mode=0o700,exist_ok=True)
    archive_path=export/("Datasette_Publisher_Complete_Checkpoint.zip" if phase=="publisher" else "Datasette_Publisher_Installed_Operating_Checkpoint.zip")
    members=[];excluded=[]
    with zipfile.ZipFile(archive_path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        for folder,dirs,files in os.walk(root,followlinks=False):
            dirs.sort();files.sort()
            for name in list(dirs):
                path=P(folder)/name
                if path in (tmp,export):
                    excluded.append({"path":path.relative_to(root).as_posix(),"kind":"reproducible-temporary-cache" if path==tmp else "generated-export"});dirs.remove(name)
                elif path.is_symlink():
                    info=path.lstat();rel=path.relative_to(root).as_posix()
                    data=os.readlink(path).encode()
                    zi=zipfile.ZipInfo(rel);zi.create_system=3;zi.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(zi,data)
                    members.append({"path":rel,"kind":"symlink","target":os.readlink(path)});dirs.remove(name)
            for name in files:
                path=P(folder)/name;rel=path.relative_to(root).as_posix();info=path.lstat()
                if rel=="complete-checkpoint-manifest.json":excluded.append({"path":rel,"kind":"preceding-manifest-preserved-in-run-history"});continue
                if stat.S_ISSOCK(info.st_mode):excluded.append({"path":rel,"kind":"runtime-socket"});continue
                if stat.S_ISLNK(info.st_mode):
                    data=os.readlink(path).encode();zi=zipfile.ZipInfo(rel);zi.create_system=3;zi.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(zi,data)
                    members.append({"path":rel,"kind":"symlink","target":os.readlink(path)});continue
                if not stat.S_ISREG(info.st_mode):excluded.append({"path":rel,"kind":"non-regular-runtime-member"});continue
                z.write(path,rel);members.append({"path":rel,"bytes":info.st_size,"sha256":digest(path),"mtime_ns":info.st_mtime_ns})
        z.writestr("complete-checkpoint-manifest.json",json.dumps({"schema":"commons.datasette-complete-checkpoint.v1","operation":OP,"original_root":str(root),"state":outcome["state"],"source":source_identity,"files":members,"excluded":excluded},indent=2)+"\n")
    archive_identity={"file_name":archive_path.name,"bytes":archive_path.stat().st_size,"sha256":digest(archive_path),"members":len(members)+1}
    emit("datasette_complete_checkpoint",state=outcome["state"],**archive_identity)
    def save_files(paths,label):
        request={"uploads":[{"local_path":str(path),"purpose":"create_library_file","library_artifact_type":"report" if path.suffix==".json" else "other"} for path in paths]}
        completed=subprocess.run([sys.executable,helpers/"library_private_upload.py",tmp],input=json.dumps(request).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        (tmp/(label+".stdout")).write_bytes(completed.stdout);(tmp/(label+".stderr")).write_bytes(completed.stderr)
        for line in completed.stderr.decode(errors="replace").splitlines():
            if line.startswith("__OPENAI_LIBRARY_FILE_WRITE_RECEIPT_V1__"):print(line,flush=True)
        if completed.returncode:raise RuntimeError("Canonical save helper failed: "+str(completed.returncode))
        response=json.loads(completed.stdout);rows=response.get("results")
        if not isinstance(rows,list) or len(rows)!=len(paths):raise RuntimeError("The canonical save returned another artifact selection.")
        for path,row in zip(paths,rows):
            if row.get("local_path")!=str(path):raise RuntimeError("The save returned another original local file.")
            if row.get("status")=="succeeded" and not succeeded(row):raise RuntimeError("The saved file identity is incomplete.")
        return rows
    saved=save_files([archive_path,report],"complete-save-01")
    for i,row in enumerate(saved):
        if not succeeded(row) and row.get("error_code")=="transfer_failed":
            emit("datasette_save_transfer_retry",artifact=[archive_path,report][i].name)
            saved[i]=save_files([[archive_path,report][i]],"complete-save-retry-"+str(i))[0]
    if all(succeeded(row) for row in saved):
        delivered(mode="complete_archive",archive=archive_identity,saved=[public_save(row) for row in saved])
    else:
        parts=[];partsdir=export/"parts";partsdir.mkdir(mode=0o700,exist_ok=True)
        with archive_path.open("rb") as source:
            while True:
                data=source.read(10*1024*1024)
                if not data:break
                path=partsdir/(archive_path.name+".part-"+str(len(parts)+1).zfill(3));path.write_bytes(data);parts.append(path)
        rows=save_files(parts,"complete-parts-save-01")
        for i,row in enumerate(rows):
            if not succeeded(row) and row.get("error_code")=="transfer_failed":rows[i]=save_files([parts[i]],"complete-part-retry-"+str(i))[0]
        if not succeeded(saved[1]):saved[1]=save_files([report],"complete-report-retry")[0]
        manifest=export/"Datasette_Operating_Checkpoint_Parts.json"
        value={"schema":"commons.complete-checkpoint-parts.v1","operation":OP,"state":outcome["state"],"archive":archive_identity,"parts":[{"order":i+1,"file_name":path.name,"bytes":path.stat().st_size,"sha256":digest(path),"saved":public_save(rows[i])} for i,path in enumerate(parts)],"report":public_save(saved[1]),"assembly":"Concatenate the complete raw part files in ascending order, verify the complete archive byte count and SHA256, then restore its original retained root before resuming the same journals."}
        save_json(manifest,value);manifest_row=save_files([manifest],"complete-parts-manifest")[0]
        if all(succeeded(row) for row in [*rows,saved[1],manifest_row]):delivered(mode="complete_archive_parts",archive=archive_identity,parts=value["parts"],saved=[public_save(saved[1]),public_save(manifest_row)])
        else:
            emit("datasette_save_retry_required",root=str(root),archive=archive_identity,saved=[public_save(row) for row in [*saved,*rows,manifest_row]])
            while True:
                line=sys.stdin.readline()
                if not line:raise RuntimeError("The full original Datasette checkpoint awaits canonical save at "+str(archive_path))
                if json.loads(line).get("action")!="retry-save":continue
                needed=[i for i,row in enumerate(saved) if not succeeded(row)]
                updates=save_files([[archive_path,report][i] for i in needed],"complete-held-save")
                for i,row in zip(needed,updates):saved[i]=row
                if all(succeeded(row) for row in saved):
                    delivered(mode="complete_archive",archive=archive_identity,saved=[public_save(row) for row in saved]);break
                emit("datasette_save_retry_required",root=str(root),archive=archive_identity,saved=[public_save(row) for row in saved])
    return delivery_result

native_error=None
try:
    raw=payload["capsule_raw"].encode("utf-8")
    if hashlib.sha256(raw).hexdigest()!=payload["capsule_sha256"]:raise RuntimeError("The original complete publisher capsule differs.")
    capsule=json.loads(raw)
    if capsule["operationId"]!=OP or len(capsule["files"])!=119:raise RuntimeError("Use the whole original 119-file publisher programme.")
    (root/"publisher-capsule.json").write_bytes(raw)
    (root/"publisher-native.py").write_text(capsule["runnerSource"],encoding="utf-8")
    version=subprocess.check_output([node,"--version"],text=True).strip()
    if int(version.lstrip("v").split(".")[0])<24:raise RuntimeError("The maintained programme requires the existing Node24.")
    asset_pins=[]
    for item in payload.get("publisher_source_assets",[]):
        relative=pathlib.PurePosixPath(item["path"])
        if relative.is_absolute() or ".." in relative.parts:raise RuntimeError("Original supplemental asset path differs.")
        data=item["content"].encode("utf-8")
        if len(data)!=item["bytes"] or hashlib.sha256(data).hexdigest()!=item["sha256"]:raise RuntimeError("The retained original publisher asset differs.")
        destination=root/"source"/relative
        destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        if destination.exists() and digest(destination)!=item["sha256"]:raise RuntimeError("A publisher supplemental asset changed.")
        destination.write_bytes(data)
        asset_pins.append({key:item[key] for key in ("path","bytes","sha256","git_blob_sha","source_ref")})
    save_json(root/"publisher-original-assets.json",asset_pins)
    outcome["publisher_original_assets"]=asset_pins
    emit("datasette_publisher_started",operation=OP,source_files=len(capsule["files"]),supplemental_source_files=len(asset_pins),input_files=len(capsule["inputs"]),node=version,journal=str(root/"journey/publisher-programme-state.json"))
    effective=json.loads(json.dumps(capsule))
    effective_files={item["path"]:item for item in effective["files"]}
    for item in payload.get("publisher_source_assets",[]):
        if item["path"] in effective_files:raise RuntimeError("Supplemental original file is already selected.")
        supplied={key:item[key] for key in ("path","content","bytes","sha256")}
        effective["files"].append(supplied);effective_files[item["path"]]=supplied
    applied=[]
    for item in payload.get("publisher_source_overlays",[]):
        prior=effective_files.get(item["path"])
        if prior is None or prior["sha256"]!=item["preimage_sha256"]:raise RuntimeError("Source correction preimage differs.")
        data=item["content"].encode("utf-8")
        if len(data)!=item["bytes"] or hashlib.sha256(data).hexdigest()!=item["sha256"]:raise RuntimeError("Complete source correction differs.")
        prior.update({key:item[key] for key in ("content","bytes","sha256")})
        applied.append({key:item[key] for key in ("path","bytes","sha256","preimage_sha256")})
    effective["sourceRecovery"]={"originalCapsuleSha256":payload["capsule_sha256"],"originalAssets":asset_pins,"postimages":applied}
    effective_raw=json.dumps(effective,separators=(",",":")).encode("utf-8")
    (root/"publisher-effective-capsule.json").write_bytes(effective_raw)
    outcome["publisher_source_selection"]={"files":len(effective["files"]),"bytes":len(effective_raw),"sha256":hashlib.sha256(effective_raw).hexdigest(),"postimages":applied}
    namespace={"q":{"capsule":effective},"root":str(root),"__name__":"__datasette_original_publisher__"}
    try:exec(compile(capsule["runnerSource"],"<original 119-file publisher runner>","exec"),namespace)
    except SystemExit as error:
        if error.code not in (None,0):raise RuntimeError("Original publisher runner returned "+str(error.code)+": "+(root/"native.stderr").read_text(errors="replace")[-9000:])
    native=read_json(root/"native-result.json")
    programme=read_json(root/"journey/publisher-programme-result.json")
    journal=read_json(root/"journey/publisher-programme-state.json")
    if not native or native.get("returncode")!=0 or not journal or journal.get("phase")!="COMPLETE":raise RuntimeError("The original publisher has not reached its completed journal.")
    if programme.get("sourceRefresh",{}).get("state")!="COMPLETE" or not programme.get("mcpReceiving",{}).get("passed") or programme.get("managedUpload",{}).get("resumed",{}).get("state")!="COMPLETE":raise RuntimeError("The whole original refresh, upload and MCP receiving programme must complete.")
    outcome["publisher_native"]=native;outcome["publisher"]=programme
    emit("datasette_publisher_complete",journal=str(root/"journey/publisher-programme-state.json"),received_workspace=programme.get("receiving",{}).get("directory"),refresh=programme["sourceRefresh"]["state"],mcp_passed=programme["mcpReceiving"]["passed"])
    outcome["publisher_checkpoint"]=persist_complete_phase(outcome,"publisher")
    repository=root/"canonical-repository";repository.mkdir(mode=0o700,exist_ok=True)
    if not (repository/".git").is_dir():
        run(["git","init",repository],"canonical-git-init")
        run(["git","-C",repository,"remote","add","origin",payload["repository_url"]],"canonical-git-origin")
    resolved=subprocess.run(["git","-C",repository,"rev-parse","--verify",payload["installed_source_ref"]+"^{commit}"],capture_output=True,text=True)
    if resolved.returncode:
        run(["git","-C",repository,"-c","http.version=HTTP/1.1","-c","pack.threads=1","-c","pack.windowMemory=32m","fetch","--depth","1","--no-tags","origin",payload["installed_source_ref"]],"canonical-git-fetch",timeout=600)
    run(["git","-C",repository,"checkout","--detach",payload["installed_source_ref"]],"canonical-git-checkout")
    got=subprocess.check_output(["git","-C",repository,"rev-parse","HEAD"],text=True).strip()
    if got!=payload["installed_source_ref"]:raise RuntimeError("The canonical installed Git source differs.")
    outcome["installed_git"]={"commit":got,"repository":payload["repository_url"],"directory":str(repository)}
    continuation=root/"installed-continuation";continuation.mkdir(mode=0o700,exist_ok=True)
    for file in payload["installed_files"]:
        data=file["content"].encode()
        if len(data)!=file["bytes"] or hashlib.sha256(data).hexdigest()!=file["sha256"]:raise RuntimeError("The complete installed source postimage differs.")
        (continuation/P(file["path"]).name).write_bytes(data)
    chromium=P(os.environ.get("DATASETTE_CHROMIUM","/workspace/scratch/bc0850d7ba23/browser-runtime/chrome-headless-shell"))
    playwright=P(os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules"))/"playwright/index.mjs"
    if not playwright.is_file():playwright=playwright.with_name("index.js")
    if not chromium.is_file() or not playwright.is_file():raise RuntimeError("Select the actual already installed Playwright and Chromium.")
    installed_input={"repository":str(repository),"sourceRef":got,"publisherProgrammeDirectory":str(root/"journey"),"outputDirectory":str(root/"installed"),"playwrightModule":str(playwright),"browserExecutable":str(chromium),"port":53173,"receivedPort":53174,"offline":False,"npmCache":str(tmp/"npm-cache"),"python":sys.executable,"npm":str(node.parent/"npm")}
    save_json(root/"installed-input.json",installed_input)
    emit("datasette_installed_started",source_ref=got,port=53173,received_port=53174,publisher_directory=str(root/"journey"))
    run([node,continuation/"run-installed.mjs","--input",root/"installed-input.json"],"installed-programme",timeout=1800)
    installed_journal=read_json(root/"installed/installed-browser-journey.json")
    if not installed_journal or installed_journal.get("phase")!="COMPLETE":raise RuntimeError("The actual installed browser programme did not reach COMPLETE.")
    outcome.update({"state":"COMPLETE","installed":installed_journal,"completed_at":stamp()})
    emit("datasette_installed_complete",checks=installed_journal.get("checks"),workspace_id=installed_journal.get("input",{}).get("workspaceId"),browser_errors=len(installed_journal.get("browserErrors",[])),artifacts=len(installed_journal.get("artifacts",[])))
except BaseException as error:
    if isinstance(error,KeyboardInterrupt):raise
    native_error={"type":type(error).__name__,"message":str(error),"traceback":traceback.format_exc()}
    outcome.update({"state":"PRESERVED_FOR_CONTINUATION","error":native_error,"publisher_state":read_json(root/"journey/publisher-programme-state.json"),"publisher_native":read_json(root/"native-result.json"),"installed_state":read_json(root/"installed/installed-browser-journey.json")})
    emit("datasette_original_continuation_preserved",error_type=native_error["type"],message=native_error["message"])
finally:
    done.set()
persist_complete_phase(outcome,"installed")
fcntl.flock(lease.fileno(),fcntl.LOCK_UN);lease.close()
if native_error:raise SystemExit(1)
