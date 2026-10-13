import os,sys,json,hashlib,pathlib,urllib.request,tarfile,subprocess,stat
os.umask(0o077)
root=pathlib.Path(payload.get("workDirectory","/dev/commons-ckan-acquisition-814b")).absolute()
root.mkdir(mode=0o700,exist_ok=True)
if root.is_symlink() or root.stat().st_uid!=os.geteuid() or root.stat().st_mode&0o077: raise ValueError("private original programme directory required")
for name,body in payload["files"].items():
    path=pathlib.PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts: raise ValueError("source path")
    target=root/path
    target.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
    raw=body.encode("utf8")
    expected=payload["sourceBlobs"][name]
    if hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()!=expected: raise ValueError("source identity "+name)
    if target.exists():
        if target.is_symlink() or target.read_bytes()!=raw: raise ValueError("changed original source "+name)
    else:
        with target.open("xb") as output: output.write(raw)
(root/"capture-acquisition-journey.mjs").write_text(payload["program"],encoding="utf8")
transfer=payload["transfer"]
capture=root/"Liip_Zurich_Source_Captures.tar.gz"
if not capture.exists():
    retained=pathlib.Path("/workspace/scratch/814bb67cccdc/liip-complete-delivery-20261013/Liip_Zurich_Complete_Delivery.tar.gz")
    if retained.is_file():
        with tarfile.open(retained,"r:gz") as existing:
            members=[m for m in existing.getmembers() if m.isfile() and m.name.endswith("/Liip_Zurich_Source_Captures.tar.gz")]
            if len(members)==1:
                with existing.extractfile(members[0]) as source_stream, capture.open("xb") as output:
                    while True:
                        chunk=source_stream.read(65536)
                        if not chunk: break
                        output.write(chunk)
if not capture.exists():
    request=urllib.request.Request(transfer["download_url"],headers=transfer.get("headers") or {},method=transfer.get("method","GET"))
    with urllib.request.urlopen(request,timeout=60) as response, capture.open("xb") as output:
        while True:
            chunk=response.read(65536)
            if not chunk: break
            output.write(chunk)
if capture.stat().st_size!=434557 or hashlib.file_digest(capture.open("rb"),"sha256").hexdigest()!="b093a0a66b12830f7daf507980b77a9f6f692e22dcf44cd195ef2e599998979c": raise ValueError("capture mismatch")
for x in transfer.get("xattrs",[]): os.setxattr(capture,x["name"],x["value"].encode())
source=root/"captures"
source.mkdir(mode=0o700,exist_ok=True)
with tarfile.open(capture,"r:gz") as archive:
    members=archive.getmembers()
    if len(members)>200 or sum(m.size for m in members)>33554432: raise ValueError("capture size")
    for member in members:
        part=pathlib.PurePosixPath(member.name)
        if part.is_absolute() or ".." in part.parts or not(member.isdir() or member.isfile()): raise ValueError("capture member")
        dest=source/part
        if member.isdir(): dest.mkdir(parents=True,mode=0o700,exist_ok=True)
        else:
            dest.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
            body=archive.extractfile(member).read()
            if len(body)!=member.size: raise ValueError("capture length")
            dest.write_bytes(body)
captures=sorted(str(p) for p in source.rglob("capture.json"))
if len(captures)!=2: raise ValueError("capture manifests")
browser_executable=payload.get("browserExecutable") or os.environ.get("CKAN_ACQUISITION_BROWSER_EXECUTABLE")
if browser_executable:
    browser_path=pathlib.Path(browser_executable)
    if not browser_path.is_absolute() or not browser_path.is_file() or not os.access(browser_path,os.X_OK): raise ValueError("existing browser executable")
    browser_executable=str(browser_path.resolve(strict=True))
(root/"journey-input.json").write_text(json.dumps({"captures":captures,"browserExecutable":browser_executable}))
modules=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE_MODULES","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules")
if os.path.isdir(modules) and not (root/"node_modules").exists(): (root/"node_modules").symlink_to(modules,target_is_directory=True)
node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE","/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node")
print(json.dumps({"phase":"source-ready","pid":os.getpid(),"host":os.uname().nodename,"source_files":len(payload["files"]),"capture_bytes":capture.stat().st_size}),flush=True)
syntax=["capture-plans.mjs","capture.mjs","model.mjs","archive.mjs","server.mjs","cli.mjs","dcat-cli.mjs","workbench-owner.mjs","capture-plan-client.mjs","public/app.mjs","public/capture-plans.mjs","dcat-semantic.mjs","dcat-semantic-native.mjs","dcat-semantic-cli.mjs","public/dcat-semantic.mjs"]
for name in syntax:
    checked=subprocess.run([node,"--check",str(root/"stellar/scf-starforge-20261009/sf30-seller-sdk/ckan"/name)],cwd=root,timeout=20,capture_output=True,text=True)
    if checked.returncode:
        print(json.dumps({"phase":"syntax","file":name,"stderr":checked.stderr}),flush=True)
        sys.exit(checked.returncode)
print(json.dumps({"phase":"syntax","files":len(syntax),"state":"PASS"}),flush=True)
import signal
with (root/"native-acquisition.log").open("ab") as log:
    child=subprocess.Popen([node,str(root/"capture-acquisition-journey.mjs")],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    print(json.dumps({"phase":"original-native-child","pid":child.pid,"operation":"CKAN-DATASTORE-ACQUISITION-814B-20261013"}),flush=True)
    try: native_exit=child.wait(timeout=1800)
    except subprocess.TimeoutExpired:
        os.killpg(child.pid,signal.SIGTERM)
        try: native_exit=child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid,signal.SIGKILL);native_exit=child.wait()
result=type("NativeResult",(),{"returncode":native_exit})()
report=root/"acquisition-result.json"
if report.is_file():
    actual=json.loads(report.read_text())
    print(json.dumps({"phase":"actual-native-result","state":actual.get("state"),"checks":actual.get("checks"),
        "observations":actual.get("observations"),"browser":actual.get("browser"),"error":actual.get("error")}),flush=True)
print(json.dumps({"phase":"controller-complete","returncode":result.returncode}),flush=True)
sys.exit(result.returncode)
