import argparse,ast,base64,fcntl,gzip,hashlib,json,os,shutil,stat,subprocess,sys,uuid,zipfile
from pathlib import Path, PurePosixPath
OP="HUMANITARIAN-COMPLETE-RECEIVING-7108-20261013"
parser=argparse.ArgumentParser(description="Receive complete selected source and operate the humanitarian application")
parser.add_argument("--frame",required=True,type=Path,help="Complete original base64 gzip source/input file")
parser.add_argument("--sha256",required=True,help="SHA-256 of the complete decoded source/input frame")
parser.add_argument("--directory",required=True,type=Path,help="Original private operating directory on this host")
parser.add_argument("--hold-delivery",action="store_true",help="Keep the original process available for delivery metadata")
parser.add_argument("--run-installed",action="store_true",help="Continue the same case through the full installed Applications and browser programme")
parser.add_argument("--npm-executable",type=Path)
parser.add_argument("--chromium-executable",type=Path)
parser.add_argument("--playwright-module",type=Path)
parser.add_argument("--actor-id",default="receiving-operator")
parser.add_argument("--actor-label",default="Swarm receiving operator")
args=parser.parse_args()
if sys.version_info<(3,11): parser.error("Use the existing Python 3.11 or newer")
if args.run_installed and not all((args.npm_executable,args.chromium_executable,args.playwright_module)):
    parser.error("--run-installed requires the three existing npm, Chromium and Playwright paths")
ROOT=args.directory.absolute()
if not args.frame.is_file() or args.frame.is_symlink() or args.frame.stat().st_size>16*1024*1024:
    raise RuntimeError("Select the complete original regular frame file")
os.umask(0o077)
print("HUMANITARIAN_FRAME_READY",flush=True)
with args.frame.open("rb") as frame:
    line=frame.readline(16*1024*1024)
    if frame.read(1): raise RuntimeError("Trailing data after complete original source frame")
if not line.endswith(b"\n"): raise RuntimeError("Incomplete original source frame")
compressed=base64.b64decode(line.strip(),validate=True)
with gzip.GzipFile(fileobj=__import__("io").BytesIO(compressed)) as reader:
    raw=reader.read(32*1024*1024+1)
if len(raw)>32*1024*1024 or hashlib.sha256(raw).hexdigest()!=args.sha256:
    raise RuntimeError("Complete original source/input frame differs")
packet=json.loads(raw)
if packet.get("operation")!=OP or packet.get("schema")!="stellar-forge.humanitarian-native-frame.v1":
    raise RuntimeError("Original operation differs")
ROOT.mkdir(parents=True,mode=0o700,exist_ok=True)
if ROOT.resolve()!=ROOT or not stat.S_ISDIR(ROOT.lstat().st_mode) or ROOT.stat().st_mode&0o077 or ROOT.stat().st_uid!=os.getuid():
    raise RuntimeError("Original native directory must be private and unaliased")
lease=open(ROOT/"native-receiving.lock","a+b")
fcntl.flock(lease.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
def sync(path):
    fd=os.open(path,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
def regular(path):
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode): raise RuntimeError("Original regular file required: "+str(path))
    return info
def sha(path):
    regular(path); result=hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda:stream.read(1024*1024),b""): result.update(block)
    return result.hexdigest()
def publish(path,data,mode=0o600):
    path.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
    if path.parent.resolve()!=path.parent: raise RuntimeError("Source parent alias changed")
    expected=hashlib.sha256(data).hexdigest()
    if path.exists() or path.is_symlink():
        if regular(path).st_size!=len(data) or sha(path)!=expected: raise RuntimeError("Original retained file differs: "+str(path))
        return
    stage=path.with_name("."+path.name+".stage-"+uuid.uuid4().hex)
    fd=os.open(stage,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode)
    with os.fdopen(fd,"wb") as out:
        out.write(data);out.flush();os.fsync(out.fileno())
    try: os.link(stage,path,follow_symlinks=False)
    except FileExistsError:
        if regular(path).st_size!=len(data) or sha(path)!=expected: raise RuntimeError("Source destination changed")
    sync(path.parent);stage.unlink();sync(path.parent)
selected=[];seen=set()
for item in packet["files"]:
    name=item["path"];parts=PurePosixPath(name).parts
    if not isinstance(name,str) or not parts or name.startswith("/") or "\\" in name or PurePosixPath(name).as_posix()!=name or any(p in ("",".","..") for p in parts) or name in seen:
        raise RuntimeError("Invalid complete source/input path")
    seen.add(name)
    encoding=item.get("encoding","utf-8")
    if encoding=="utf-8": body=item["content"].encode("utf-8")
    elif encoding=="base64": body=base64.b64decode(item["content"],validate=True)
    else: raise RuntimeError("Unsupported complete original source encoding")
    if len(body)!=item["bytes"] or hashlib.sha256(body).hexdigest()!=item["sha256"]:
        raise RuntimeError("Complete selected member changed: "+name)
    if item.get("gitBlob") and hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()!=item["gitBlob"]:
        raise RuntimeError("Original Git blob changed: "+name)
    mode=item.get("mode","100644")
    if mode not in ("100644","100755"): raise RuntimeError("Invalid original source mode")
    selected.append((ROOT/name,body,0o755 if mode=="100755" else 0o644))
manifest={k:v for k,v in packet.items() if k!="files"}
manifest["files"]=[{k:v for k,v in f.items() if k!="content"} for f in packet["files"]]
publish(ROOT/"source-and-input-selection.json",(json.dumps(manifest,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode())
for path,body,mode in selected: publish(path,body,mode)
reference_files=0
for path,body,mode in selected:
    rel=path.relative_to(ROOT)
    if rel.parts[0]=="reference":
        publish(ROOT/"case/originals/reference-provenance"/Path(*rel.parts[1:]),body,mode)
        reference_files+=1
if reference_files!=49: raise RuntimeError("Retain all 49 original administrative reference members")
if packet.get("launcher"):
    publish(ROOT/"native-core-launcher.py",packet["launcher"].encode())
print(json.dumps({"phase":"COMPLETE_SOURCE_RECEIVED","files":len(selected),"directory":str(ROOT)},separators=(",",":")),flush=True)
python_files=[]
core_prefix=ROOT/"repo/stellar/scf-starforge-20261009/sf30-seller-sdk"
def selected_runtime_source(path):
    return path.is_relative_to(core_prefix/"humanitarian") or path in {
        core_prefix/"xml/xml_source.py",core_prefix/"xml/workspace.py",
        core_prefix/"xml/server.py",core_prefix/"xml/native.mjs",core_prefix/"dataset-handler.mjs",
        ROOT/"repo/stellar/scf-starforge-20261009/distribution/runtime-workspace/application-humanitarian.mjs",
        ROOT/"repo/stellar/scf-starforge-20261009/distribution/runtime-workspace/providers/humanitarian.mjs"}
for path,body,mode in selected:
    if selected_runtime_source(path) and path.suffix==".py":
        ast.parse(body,filename=str(path));python_files.append(path.relative_to(ROOT).as_posix())
node=os.environ.get("SF30_XML_NODE") or shutil.which("node")
if not node: raise RuntimeError("Select the existing Node executable for the original Dataset engine")
node=str(Path(node).resolve(strict=True))
for path,body,mode in selected:
    if selected_runtime_source(path) and path.suffix in (".mjs",".js"):
        subprocess.run([node,"--check",str(path)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
sdk=ROOT/"repo/stellar/scf-starforge-20261009/sf30-seller-sdk"
sys.path.insert(0,str(sdk/"humanitarian"))
from humanitarian_source import canonical_decimal
assert canonical_decimal("0.30")=="0.3"
assert canonical_decimal("-0.00")=="0"
assert canonical_decimal("12345678901234567890123456789012345678")=="12345678901234567890123456789012345678"
publish(ROOT/"source-parse.json",(json.dumps({"python":python_files,"node":node,"exactDecimalChecks":3},sort_keys=True)+"\n").encode())
argv=[sys.executable,"-B",str(sdk/"humanitarian/receiving/operate.py"),
      "--reference-source",str(ROOT/"reference/application-reference-source.json"),
      "--reference-definition",str(ROOT/"reference/application-reference-definition.json"),
      "--directory",str(ROOT/"case")]
env=dict(os.environ);env["SF30_XML_NODE"]=node
env["PATH"]=str(Path(node).parent)+os.pathsep+env.get("PATH","")
publish(ROOT/"core-command.json",(json.dumps({"operation":OP,"argv":argv,"node":node},sort_keys=True)+"\n").encode())
attempt=ROOT/("core-attempt-"+uuid.uuid4().hex)
with attempt.with_suffix(".stdout").open("xb") as out,attempt.with_suffix(".stderr").open("xb") as err:
    child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=out,stderr=err,env=env,pass_fds=(lease.fileno(),))
    try: code=child.wait()
    except BaseException:
        child.wait();raise
    out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
if code:
    print(json.dumps({"phase":"CORE_RETURNED","exit":code,"stderr":attempt.with_suffix(".stderr").read_text()[-16000:],"directory":str(ROOT)}),flush=True)
    raise SystemExit(code)
result=json.loads((ROOT/"case/operated-case.json").read_bytes())
if result.get("status")!="COMPLETE" or result.get("operation")!=OP: raise RuntimeError("Original complete case result is missing")
output=ROOT/"Humanitarian_Complete_Engineering_Receiving_20261013.zip"
if not output.exists():
    stage=ROOT/(".complete-delivery-"+uuid.uuid4().hex+".partial")
    with zipfile.ZipFile(stage,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        for path in sorted(ROOT.rglob("*")):
            rel=path.relative_to(ROOT)
            if path==stage or path==output or path.name.endswith(".partial") or path.name=="native-receiving.lock" or "__pycache__" in rel.parts:
                continue
            if path.is_symlink(): raise RuntimeError("Original case contains a path alias")
            if path.is_dir():
                archive.writestr(zipfile.ZipInfo(rel.as_posix()+"/",(1980,1,1,0,0,0)),b"")
            elif path.is_file():
                info=zipfile.ZipInfo(rel.as_posix(),(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
                info.create_system=3;info.external_attr=(stat.S_IFREG|0o600)<<16
                with path.open("rb") as source,archive.open(info,"w",force_zip64=True) as target:
                    shutil.copyfileobj(source,target,1024*1024)
    with stage.open("rb") as stream: os.fsync(stream.fileno())
    with zipfile.ZipFile(stage) as archive:
        bad=archive.testzip()
        if bad: raise RuntimeError("Complete artifact CRC failed: "+bad)
    os.link(stage,output);sync(ROOT);stage.unlink();sync(ROOT)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None: raise RuntimeError("Retained complete artifact changed")
print(json.dumps({"phase":"CORE_COMPLETE","operation":OP,"source":packet["source"],"files":len(selected),
                  "case":str(ROOT/"case"),"repo":str(ROOT/"repo"),"counts":result["counts"],"comparison":result["comparison"],
                  "artifact":{"path":str(output),"bytes":regular(output).st_size,"sha256":sha(output)}},separators=(",",":")),flush=True)

if args.run_installed:
    selected_paths={}
    for key,path in (("npmExecutable",args.npm_executable),("chromiumExecutable",args.chromium_executable),
                     ("playwrightModule",args.playwright_module)):
        selected_paths[key]=str(path.expanduser().resolve(strict=True))
    authority=ROOT/"source-authority.json"
    if not authority.is_file(): raise RuntimeError("Complete original Git authority is missing")
    source_cache=ROOT/"source-cache"
    core_result=ROOT/"case/operated-case.json"
    installed_input={
        "schema":"stellar-forge.humanitarian-installed-complete.v1",
        "operationId":"HUMANITARIAN-INSTALLED-RECEIVING-7108-20261013",
        "outputDirectory":str(ROOT/"installed"),
        "sourceRoot":str(ROOT/"repo"),
        "sourceCommit":packet["source"]["commit"],
        "coreResult":{"path":str(core_result),"bytes":regular(core_result).st_size,"sha256":sha(core_result)},
        "runtime":{"repository":str(source_cache/"repository.git"),
                   "sourceReceiving":{"directory":str(source_cache),"metadata":str(authority),
                                      "donorRepositories":[],"donorSources":[str(ROOT/"repo")],
                                      "donorArchives":[],"incoming":[]},
                   "npmExecutable":selected_paths["npmExecutable"],"sourceOffline":True,"dependencyOffline":True},
        "actor":{"id":args.actor_id,"label":args.actor_label},
        "pythonExecutable":str(Path(sys.executable).absolute()),
        "chromiumExecutable":selected_paths["chromiumExecutable"],
        "playwrightModule":selected_paths["playwrightModule"]
    }
    input_path=ROOT/"installed-input.json"
    publish(input_path,(json.dumps(installed_input,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode())
    installed_argv=[node,str(sdk/"humanitarian/receiving/complete.mjs"),str(input_path)]
    publish(ROOT/"installed-command.json",(json.dumps({"argv":installed_argv,"cwd":str(ROOT)},sort_keys=True)+"\n").encode())
    installed_attempt=ROOT/("installed-attempt-"+uuid.uuid4().hex)
    print(json.dumps({"phase":"INSTALLED_DISPATCH","operation":installed_input["operationId"],
                      "sourceCommit":packet["source"]["commit"],"input":str(input_path)},separators=(",",":")),flush=True)
    with installed_attempt.with_suffix(".stdout").open("xb") as out,installed_attempt.with_suffix(".stderr").open("xb") as err:
        child=subprocess.Popen(installed_argv,cwd=ROOT,stdin=subprocess.DEVNULL,stdout=out,stderr=err,
                               env=env,pass_fds=(lease.fileno(),))
        try: code=child.wait()
        except BaseException:
            child.wait();raise
        out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
    if code:
        print(json.dumps({"phase":"INSTALLED_RETURNED","exit":code,
                          "stderr":installed_attempt.with_suffix(".stderr").read_text()[-24000:],
                          "directory":str(ROOT)}),flush=True)
        raise SystemExit(code)
    final=json.loads(installed_attempt.with_suffix(".stdout").read_bytes())
    if (final.get("state")!="COMPLETE" or final.get("operationId")!=installed_input["operationId"]
        or final.get("sourceCommit")!=packet["source"]["commit"]):
        raise RuntimeError("Original installed controller returned another complete selection")
    customer=final["customer"];output=Path(customer["path"])
    if (output!=ROOT/"installed/handover/HUMANITARIAN_Complete_Installed_Operator_Package.zip"
        or regular(output).st_size!=customer["bytes"] or sha(output)!=customer["sha256"]):
        raise RuntimeError("Original installed handover differs from its complete bytes")
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None: raise RuntimeError("The complete installed handover CRC changed")
    print(json.dumps({"phase":"INSTALLED_COMPLETE","operation":installed_input["operationId"],
                      "sourceCommit":packet["source"]["commit"],"artifact":customer,
                      "sourceReview":final["sourceReview"],"receivedReview":final["receivedReview"],
                      "checks":final["checks"]},separators=(",",":")),flush=True)

print("HUMANITARIAN_DELIVERY_READY",flush=True)
for line in (sys.stdin if args.hold_delivery else []):
    command=json.loads(line)
    if command.get("action")=="record-library":
        for entry in command.get("xattrs",[]):
            os.setxattr(output,entry["name"],entry["value"].encode())
        publish(ROOT/"library-delivery.json",(json.dumps(command["result"],ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode())
        print("HUMANITARIAN_LIBRARY_RECORDED",flush=True)
    elif command.get("action")=="close":
        break
    else:
        raise RuntimeError("Unknown original delivery continuation")
lease.close()
