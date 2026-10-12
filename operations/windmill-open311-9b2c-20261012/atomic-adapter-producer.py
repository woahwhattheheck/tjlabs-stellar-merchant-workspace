import os, sys, json, hashlib, base64, tempfile, pathlib, subprocess, time, socket, io, zipfile, tty, termios, traceback, datetime
EXPECTED_BYTES = 457314
EXPECTED_GIT = "364a0a210027b8e42ba50386e82e14ef5cbb9d0b"
original_tty = termios.tcgetattr(0)
tty.setraw(0)
child = None
log = None
archive = None
result = None
def emit(value):
    os.write(1,(json.dumps(value,separators=(",",":"))+"\n").encode())
def git_hash(data):
    return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def read_line():
    raw=bytearray()
    while True:
        piece=os.read(0,1)
        if not piece: return None
        if piece==b"\n": return raw.decode().strip()
        raw.extend(piece)
def port_used(port):
    with socket.socket() as s:
        s.settimeout(0.2)
        return s.connect_ex(("127.0.0.1",port))==0
try:
    emit({"phase":"ready","expectedBytes":EXPECTED_BYTES,"pid":os.getpid()})
    raw=bytearray()
    while len(raw)<EXPECTED_BYTES:
        piece=os.read(0,min(65536,EXPECTED_BYTES-len(raw)))
        if not piece: raise RuntimeError("Incomplete original source packet.")
        raw.extend(piece)
    raw=bytes(raw)
    if git_hash(raw)!=EXPECTED_GIT: raise RuntimeError("Original packet Git blob mismatch.")
    packet=json.loads(raw)
    root=pathlib.Path(tempfile.mkdtemp(prefix="windmill-open311-9b2c-20261012-",dir="/dev"))
    source=root/"source"
    source.mkdir(mode=0o700)
    manifest=[]
    for entry in packet["files"]:
        rel=pathlib.PurePosixPath(entry["path"])
        if rel.is_absolute() or ".." in rel.parts: raise RuntimeError("Unsafe source path.")
        data=entry["content"].encode()
        if len(data)!=entry["bytes"] or git_hash(data)!=entry["gitSha1"]: raise RuntimeError("Original source mismatch: "+entry["path"])
        path=source/str(rel)
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_bytes(data)
        manifest.append({k:entry[k] for k in ("path","bytes","gitSha1")})
    (root/"source-packet.json").write_bytes(raw)
    (root/"source-manifest.json").write_text(json.dumps({"source":packet["source"],"files":manifest},indent=2)+"\n")
    (root/"prior-adapter-run.json").write_text(json.dumps(packet["priorCompletedAdapterRun"],indent=2)+"\n")
    integration=source/"integrations/windmill/open311"
    checks=[]
    for path in [integration/"start-workspaces.mjs", integration/"adapter-journey.mjs",integration/"workspace/f/tjlabs_open311/workspace.ts"]:
        check=subprocess.run(["node","--check",str(path)],cwd=source,capture_output=True,text=True,timeout=20)
        checks.append({"argv":check.args,"exitCode":check.returncode,"stdout":check.stdout,"stderr":check.stderr})
        if check.returncode: raise RuntimeError("Native syntax failed: "+str(path))
    for name in ("commission.py","native-journey.py"):
        compile((integration/name).read_text(),str(integration/name),"exec")
    (root/"syntax-results.json").write_text(json.dumps(checks,indent=2)+"\n")
    if port_used(7311) or port_used(7312): raise RuntimeError("The requested original service ports are already occupied.")
    env=dict(os.environ,OPEN311_DATA=str(root/"data"),OPEN311_SOURCE_MODE="retained")
    log=open(root/"services.log","wb")
    child=subprocess.Popen(["node",str(integration/"start-workspaces.mjs")],cwd=source,env=env,stdout=log,stderr=subprocess.STDOUT)
    deadline=time.monotonic()+20
    while not (port_used(7311) and port_used(7312)):
        if child.poll() is not None: raise RuntimeError("Original service exited "+str(child.returncode))
        if time.monotonic()>deadline: raise RuntimeError("Original service did not start within 20 seconds.")
        time.sleep(0.05)
    emit({"phase":"source-running","root":str(root),"files":len(manifest),"sourceBytes":sum(x["bytes"] for x in manifest),"nodePid":child.pid})
    run=subprocess.run(["node",str(integration/"adapter-journey.mjs"),str(root/"journey")],cwd=source,env=env,capture_output=True,text=True,timeout=90)
    command={"argv":run.args,"exitCode":run.returncode,"stdout":run.stdout,"stderr":run.stderr}
    (root/"command-result.json").write_text(json.dumps(command,indent=2)+"\n")
    result=json.loads((root/"journey/result.json").read_text())
    child.terminate()
    try: child.wait(timeout=10)
    except subprocess.TimeoutExpired:
        child.kill();child.wait(timeout=5)
    log.close();log=None
    result["producingProcess"]={"pid":os.getpid(),"root":str(root),"childExitCode":child.returncode,"sourcePacketGitSha1":EXPECTED_GIT,"sourceFileCount":len(manifest)}
    (root/"complete-result.json").write_text(json.dumps(result,indent=2)+"\n")
    buffer=io.BytesIO()
    members=[]
    with zipfile.ZipFile(buffer,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                relative=str(path.relative_to(root))
                z.write(path,relative)
                members.append({"path":relative,"bytes":path.stat().st_size})
    archive=buffer.getvalue()
    emit({"phase":"archive-ready","bytes":len(archive),"sha256":hashlib.sha256(archive).hexdigest(),"gitSha1":git_hash(archive),"members":len(members),"sourceHead":packet["source"]["integrationCommit"],"result":result})
    while True:
        line=read_line()
        if line is None or line=="QUIT": break
        if line=="RESULT": emit({"phase":"result","result":result});continue
        fields=line.split()
        if len(fields)==3 and fields[0]=="GET":
            offset=int(fields[1]);size=int(fields[2])
            if offset<0 or size<1 or size>49152 or offset>=len(archive): raise RuntimeError("Invalid archive chunk bounds.")
            data=archive[offset:offset+size]
            emit({"phase":"archive-chunk","offset":offset,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"content_base64":base64.b64encode(data).decode()})
        else: emit({"phase":"unknown-command"})
except Exception as error:
    emit({"phase":"failed","error":str(error),"traceback":traceback.format_exc()})
finally:
    if child is not None and child.poll() is None:
        child.terminate()
        try: child.wait(timeout=5)
        except subprocess.TimeoutExpired: child.kill();child.wait()
    if log is not None: log.close()
    termios.tcsetattr(0,termios.TCSADRAIN,original_tty)
