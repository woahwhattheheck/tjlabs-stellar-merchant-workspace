import os,sys,json,hashlib,pathlib,urllib.request,tarfile,subprocess,stat
os.umask(0o077)
root=pathlib.Path(payload.get("workDirectory","/dev/commons-ckan-remote-814b")).absolute()
root.mkdir(mode=0o700,exist_ok=True)
if root.is_symlink() or root.stat().st_uid!=os.geteuid() or root.stat().st_mode&0o077: raise ValueError("private original programme directory required")
import tempfile
def private_directory(path):
    path=path.absolute()
    relative=path.relative_to(root)
    current=root
    for part in relative.parts:
        current=current/part
        try: current.mkdir(mode=0o700)
        except FileExistsError: pass
        info=current.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.geteuid(): raise ValueError("owned directory required")
        if info.st_mode&0o077: current.chmod(0o700)
    return path
def checksum(path,kind):
    with path.open("rb") as incoming:
        return hashlib.file_digest(incoming,kind).hexdigest()
def admit(target,parts,size,sha256=None,blob_sha=None):
    target=target.absolute()
    target.relative_to(root)
    private_directory(target.parent)
    def matches(path):
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid() or info.st_size!=size: return False
        if sha256 and checksum(path,"sha256")!=sha256: return False
        if blob_sha:
            value=hashlib.sha1(b"blob "+str(size).encode()+b"\0")
            with path.open("rb") as incoming:
                for chunk in iter(lambda:incoming.read(65536),b""): value.update(chunk)
            if value.hexdigest()!=blob_sha:return False
        return True
    if target.exists() or target.is_symlink():
        if not matches(target):raise ValueError("changed original received file: "+str(target))
        return
    stage_root=private_directory(root/".receiving")
    fd,name=tempfile.mkstemp(prefix="member-",dir=str(stage_root))
    stage=pathlib.Path(name)
    try:
        total=0
        with os.fdopen(fd,"wb") as output:
            for chunk in parts:
                total+=len(chunk)
                if total>size:raise ValueError("received file exceeds original size")
                output.write(chunk)
            output.flush();os.fsync(output.fileno())
        if not matches(stage):raise ValueError("received original file identity mismatch")
        try: os.link(stage,target)
        except FileExistsError:
            if not matches(target):raise ValueError("concurrent received file differs")
    finally:
        stage.unlink(missing_ok=True)
for name,body in payload["files"].items():
    path=pathlib.PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts: raise ValueError("source path")
    raw=body.encode("utf8")
    expected=payload["sourceBlobs"][name]
    if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=expected: raise ValueError("source identity "+name)
    admit(root/path,[raw],len(raw),blob_sha=expected)
program=payload["program"].encode("utf8")
admit(root/"remote-publication-journey.mjs",[program],len(program),sha256=hashlib.sha256(program).hexdigest())
transfer=payload["transfer"]
capture=root/"Liip_Zurich_Source_Captures.tar.gz"
capture_sha="b093a0a66b12830f7daf507980b77a9f6f692e22dcf44cd195ef2e599998979c"
if not capture.exists():
    retained=pathlib.Path("/workspace/scratch/814bb67cccdc/liip-complete-delivery-20261013/Liip_Zurich_Complete_Delivery.tar.gz")
    if retained.is_file():
        with tarfile.open(retained,"r:gz") as existing:
            members=[m for m in existing.getmembers() if m.isfile() and m.name.endswith("/Liip_Zurich_Source_Captures.tar.gz")]
            if len(members)==1:
                with existing.extractfile(members[0]) as source_stream:
                    admit(capture,iter(lambda:source_stream.read(65536),b""),434557,sha256=capture_sha)
if not capture.exists():
    request=urllib.request.Request(transfer["download_url"],headers=transfer.get("headers") or {},method=transfer.get("method","GET"))
    with urllib.request.urlopen(request,timeout=60) as response:
        admit(capture,iter(lambda:response.read(65536),b""),434557,sha256=capture_sha)
admit(capture,[],434557,sha256=capture_sha)
for x in transfer.get("xattrs",[]): os.setxattr(capture,x["name"],x["value"].encode())
source=private_directory(root/"captures")
with tarfile.open(capture,"r:gz") as archive:
    members=archive.getmembers()
    if len(members)>200 or sum(m.size for m in members)>33554432: raise ValueError("capture size")
    for member in members:
        part=pathlib.PurePosixPath(member.name)
        if part.is_absolute() or ".." in part.parts or not(member.isdir() or member.isfile()): raise ValueError("capture member")
        dest=source/part
        if member.isdir():private_directory(dest)
        else:
            with archive.extractfile(member) as incoming:raw=incoming.read()
            if len(raw)!=member.size:raise ValueError("capture length")
            admit(dest,[raw],len(raw),sha256=hashlib.sha256(raw).hexdigest())
captures=sorted(str(p) for p in source.rglob("capture.json"))
if len(captures)!=2: raise ValueError("capture manifests")
browser_executable=payload.get("browserExecutable") or os.environ.get("CKAN_REMOTE_BROWSER_EXECUTABLE")
if browser_executable:
    browser_path=pathlib.Path(browser_executable)
    if not browser_path.is_absolute() or not browser_path.is_file() or not os.access(browser_path,os.X_OK): raise ValueError("existing browser executable")
    browser_executable=str(browser_path.resolve(strict=True))
(root/"journey-input.json").write_text(json.dumps({"captures":captures,"browserExecutable":browser_executable}))
modules=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules")
if os.path.isdir(modules) and not (root/"node_modules").exists(): (root/"node_modules").symlink_to(modules,target_is_directory=True)
node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
print(json.dumps({"phase":"source-ready","pid":os.getpid(),"host":os.uname().nodename,"source_files":len(payload["files"]),"capture_bytes":capture.stat().st_size}),flush=True)
syntax=["remote-json.mjs","remote-adapter.mjs","remote-workspace.mjs","model.mjs","archive.mjs","server.mjs","cli.mjs","public/app.mjs","public/remote-publication.mjs"]
for name in syntax:
    checked=subprocess.run([node,"--check",str(root/"stellar/scf-starforge-20261009/sf30-seller-sdk/ckan"/name)],cwd=root,timeout=20,capture_output=True,text=True)
    if checked.returncode:
        print(json.dumps({"phase":"syntax","file":name,"stderr":checked.stderr}),flush=True)
        sys.exit(checked.returncode)
print(json.dumps({"phase":"syntax","files":len(syntax),"state":"PASS"}),flush=True)
import signal
with (root/"native-remote-publication.log").open("ab") as log:
    child=subprocess.Popen([node,str(root/"remote-publication-journey.mjs")],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    print(json.dumps({"phase":"original-native-child","pid":child.pid,"operation":"CKAN-REMOTE-PUBLICATION-814B-20261013"}),flush=True)
    try: native_exit=child.wait(timeout=600)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid,signal.SIGTERM)
        try: native_exit=child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid,signal.SIGKILL);native_exit=child.wait()
result=type("NativeResult",(),{"returncode":native_exit})()
report=root/"remote-publication-result.json"
if report.is_file():
    actual=json.loads(report.read_text())
    print(json.dumps({"phase":"actual-native-result","state":actual.get("state"),"checks":actual.get("checks"),
        "observations":actual.get("observations"),"browser":actual.get("browser"),"error":actual.get("error")}),flush=True)

# Keep actual rendered views separate from the portable customer workspace.
visual_root=root/"rendered-product"
if visual_root.is_dir():
    import zipfile,tempfile
    descriptor,temp_name=tempfile.mkstemp(prefix="rendered-product-",suffix=".zip",dir=str(root))
    os.close(descriptor)
    staged_zip=pathlib.Path(temp_name)
    try:
        total=0;members=[]
        with zipfile.ZipFile(staged_zip,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as outgoing:
            for path in sorted(visual_root.iterdir()):
                info=path.lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.geteuid():raise ValueError("rendered attachment must be an owned regular file")
                total+=info.st_size
                if total>268435456 or len(members)>=100:raise ValueError("rendered attachment bound")
                outgoing.write(path,"rendered-product/"+path.name);members.append(path.name)
        destination=root/"Rendered_Product_Views.zip"
        if destination.is_symlink():raise ValueError("rendered archive path")
        os.replace(staged_zip,destination)
        print(json.dumps({"phase":"rendered-product-attachments","file":str(destination),
            "bytes":destination.stat().st_size,"sha256":checksum(destination,"sha256"),
            "members":members,"inspection":"awaiting-producing-peer-view"}),flush=True)
    finally:staged_zip.unlink(missing_ok=True)

print(json.dumps({"phase":"controller-complete","returncode":result.returncode}),flush=True)
sys.exit(result.returncode)
