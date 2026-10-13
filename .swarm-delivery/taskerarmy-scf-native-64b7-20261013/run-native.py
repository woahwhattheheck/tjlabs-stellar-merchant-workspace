import sys,os,json,pathlib,hashlib,shutil,subprocess,fcntl
os.umask(0o077)
if len(sys.argv)==3 and sys.argv[1]=="--packet":
 path=pathlib.Path(sys.argv[2])
 if not path.is_file() or path.is_symlink() or path.stat().st_size>2000000: raise ValueError("Select the complete original source packet")
 raw=path.read_bytes()
else:
 print("TASKER_SOURCE_INPUT_READY",flush=True)
 header=sys.stdin.buffer.readline();length=int(header)
 if not 0<length<=2000000: raise ValueError("Invalid original source length")
 parts=[];remaining=length
 while remaining:
  part=sys.stdin.buffer.read(min(65536,remaining))
  if not part: raise EOFError("Original source packet ended")
  parts.append(part);remaining-=len(part)
 raw=b"".join(parts)
packet=json.loads(raw.decode("utf-8"))
if packet["schema"]!="taskerarmy.complete-scf-integration-source.v1": raise ValueError("Wrong source schema")
root=pathlib.Path(packet["native_root"])
root.mkdir(parents=True,exist_ok=True,mode=0o700)
lock=os.open(str(root/"native-workflow.lock"),os.O_CREAT|os.O_RDWR,0o600)
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
case=root/"case"
if case.exists() and any(case.iterdir()):
 result_path=case/"RESULT.json"
 original=json.loads(result_path.read_text()) if result_path.is_file() else {}
 print(json.dumps({"existing_native_case":str(case),"complete":original.get("complete",False),"result_file":str(result_path),"stages":len(original.get("stages",[])),"reason":"Original inputs and native case retained; continue that exact case explicitly."}),flush=True)
 sys.exit(0 if original.get("complete") else 2)
repo=root/"repo";repo.mkdir(exist_ok=True,mode=0o700)
for item in packet["files"]+packet["native_support"]+[packet["native_program"]]:
 relative=pathlib.PurePosixPath(item["path"])
 if relative.is_absolute() or ".." in relative.parts: raise ValueError("Invalid source path")
 data=item["content"].encode("utf-8")
 if len(data)!=item["bytes"] or hashlib.sha256(data).hexdigest()!=item["sha256"]: raise ValueError("Changed source bytes")
 if item.get("git_blob") and hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()!=item["git_blob"]: raise ValueError("Changed original Git source")
 destination=repo.joinpath(*relative.parts);destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if destination.exists():
  if destination.is_symlink() or destination.read_bytes()!=data: raise ValueError("Existing original source differs")
 else:
  with destination.open("xb") as stream: stream.write(data)
source_input=root/"SOURCE_INPUT.json"
if source_input.exists():
 if source_input.is_symlink() or source_input.read_bytes()!=raw: raise ValueError("Original source input differs; preserve it")
else:
 with source_input.open("xb") as stream: stream.write(raw)
node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
if not node or not pathlib.Path(node).is_file(): raise ValueError("Node runtime is unavailable")
for item in packet["files"]:
 if item["path"].endswith(".mjs"):
  result=subprocess.run([node,"--check",str(repo/item["path"])],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  if result.returncode: raise RuntimeError("Original Node syntax "+item["path"]+": "+result.stderr.decode()[:3000])
 elif item["path"].endswith(".py"):
  compile(item["content"],str(repo/item["path"]),"exec")
print(json.dumps({"source_received":len(packet["files"]),"support_received":len(packet["native_support"]),"node":node,"python":sys.executable,"source_sha256":hashlib.sha256(raw).hexdigest()}),flush=True)
case.mkdir(exist_ok=True,mode=0o700)
if lock!=3: os.dup2(lock,3);os.close(lock)
os.set_inheritable(3,True)
os.execv(node,[node,"--max-old-space-size=96",str(repo/packet["native_program"]["path"]),str(repo),str(case),str(pathlib.Path(sys.executable).resolve())])
