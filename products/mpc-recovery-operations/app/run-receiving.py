#!/usr/bin/env python3
"""Original MPC receiving, plus explicit receiving of its accepted browser workspace."""
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,zipfile

def run_original():
 root=pathlib.Path(__file__).resolve().parent
 owner=(root/"complete-receiving.lock").open("a+")
 try:fcntl.flock(owner,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError:raise RuntimeError("This receiving operation already has a running owner")
 owner.seek(0);owner.truncate();owner.write(str(os.getpid())+"\n");owner.flush()
 node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
 if not node:raise RuntimeError("An existing Node runtime is required")
 env=dict(os.environ,MPC_RECEIVING_PYTHON=sys.executable,NODE_OPTIONS="--max-old-space-size=192",OMP_NUM_THREADS="1",OPENBLAS_NUM_THREADS="1")
 with (root/"native.stdout.log").open("ab") as out,(root/"native.stderr.log").open("ab") as err:
  p=subprocess.Popen([node,"complete-receiving.mjs"],cwd=root,env=env,stdout=out,stderr=err)
  print(json.dumps({"operation":"mpc-recovery-complete-receiving-20261013","pid":p.pid}),flush=True)
  code=p.wait()
 if code:
  print((root/"native.stderr.log").read_text(errors="replace")[-8000:],flush=True)
  raise SystemExit(code)
 report=json.loads((root/"receiving/result.json").read_text())
 if report.get("status")!="COMPLETE":raise RuntimeError("The receiving programme is incomplete")
 archive=root/"MPC_Recovery_Complete_Receiving_20261013.zip"
 receipt_path=root/"delivery-result.json"
 if archive.exists():
  if not receipt_path.exists():raise RuntimeError("Existing delivery archive has no completion receipt")
  retained=json.loads(receipt_path.read_text())
  if retained.get("status")!="COMPLETE" or retained.get("operation")!=report["operation"] or retained.get("sha256")!=hashlib.sha256(archive.read_bytes()).hexdigest():raise RuntimeError("Existing delivery archive differs from its completion receipt")
  print(json.dumps(retained),flush=True);raise SystemExit(0)
 with zipfile.ZipFile(archive,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for path in sorted(root.rglob("*")):
   if path.is_file() and path!=archive and path!=receipt_path and "__pycache__" not in path.parts and path.suffix not in (".lock",".log",".png",".pyc"):z.write(path,path.relative_to(root).as_posix())
 b=archive.read_bytes()
 receipt={"operation":report["operation"],"status":"COMPLETE","path":str(archive),"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"result":report}
 (root/"delivery-result.json").write_text(json.dumps(receipt,indent=2)+"\n")
 print(json.dumps(receipt),flush=True)
 

def run_browser_branches():
 import argparse,stat,tempfile,uuid
 parser=argparse.ArgumentParser(description="Continue the original MPC browser branch receiving")
 parser.add_argument("--browser-branches",action="store_true",required=True)
 parser.add_argument("--accepted-archive",required=True)
 args=parser.parse_args()
 root=pathlib.Path(__file__).resolve().parent
 directory=root/"receiving-branches"
 directory.mkdir(mode=0o700,exist_ok=True)
 if directory.is_symlink() or directory.resolve()!=directory:raise RuntimeError("Use the original real branch receiving directory")
 def canonical(value):return (json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()
 def sync_dir(path):
  fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(fd)
  finally:os.close(fd)
 def regular(path,maximum=1024*1024*1024):
  st=path.lstat()
  if not stat.S_ISREG(st.st_mode) or path.is_symlink() or st.st_size>maximum:raise RuntimeError("Use the complete regular retained file: "+str(path))
  return path.read_bytes()
 def write(path,raw,immutable=True):
  path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
  if path.exists():
   if immutable and regular(path)!=raw:raise RuntimeError("Original retained bytes differ: "+str(path))
   if immutable:return
  fd,temp=tempfile.mkstemp(prefix="."+path.name+".",suffix=".partial",dir=path.parent)
  try:
   with os.fdopen(fd,"wb") as out:out.write(raw);out.flush();os.fsync(out.fileno())
   os.replace(temp,path);sync_dir(path.parent)
  finally:
   try:os.unlink(temp)
   except FileNotFoundError:pass
 def load(path):return json.loads(regular(path,64*1024*1024))
 def sha(raw):return hashlib.sha256(raw).hexdigest()
 def rel(value):
  if not isinstance(value,str) or not value or "\\" in value or "\0" in value:raise RuntimeError("Invalid original relative output path")
  p=pathlib.PurePosixPath(value)
  if p.is_absolute() or str(p)!=value or any(x in ("",".","..") for x in p.parts):raise RuntimeError("Invalid original relative output path")
  return p
 def selected_file(base,name):
  p=base/rel(name)
  if p.resolve()!=p or not p.resolve().is_relative_to(base):raise RuntimeError("Selected file crosses its original root")
  return p
 def checked(base,item):
  p=selected_file(base,item["path"]);raw=regular(p)
  if type(item["bytes"])is not int or len(raw)!=item["bytes"] or sha(raw)!=item["sha256"]:raise RuntimeError("Selected source or artifact bytes changed: "+str(p))
  return p,raw
 lock=(root/"complete-receiving.lock").open("a+")
 try:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError("The original MPC receiving operation still has an owner")
  archive=pathlib.Path(args.accepted_archive).absolute()
  if archive.resolve()!=archive:raise RuntimeError("Select the exact real accepted archive path")
  accepted=regular(archive,654095)
  expected="c6ca635c06acb75c34792de9b62c73094f59c51140ac218b58274a03715ff8a7"
  if len(accepted)!=654095 or sha(accepted)!=expected:raise RuntimeError("Use the exact completed original MPC archive")
  with zipfile.ZipFile(archive) as z:
   entries=z.infolist()
   matches=[x for x in entries if x.filename.endswith("receiving/browser-workspace.json") and not x.is_dir()]
   if not matches:matches=[x for x in entries if pathlib.PurePosixPath(x.filename).name=="browser-workspace.json" and not x.is_dir()]
   if len(matches)!=1:raise RuntimeError("The completed archive must contain one original browser workspace")
   member=matches[0]
   if member.flag_bits&1 or member.file_size>64*1024*1024 or stat.S_IFMT(member.external_attr>>16) not in (0,stat.S_IFREG):raise RuntimeError("Original browser workspace member is invalid")
   workspace=z.read(member)
   json.loads(workspace)
  accepted_path=directory/"input"/"accepted-workspace.json"
  receipt={"schema":"commons.mpc.accepted-browser-input.v1","operation":"mpc-browser-branches-receiving-20261013","archive":{"path":str(archive),"bytes":len(accepted),"sha256":expected},"member":{"path":member.filename,"bytes":len(workspace),"sha256":sha(workspace)}}
  write(directory/"input"/"accepted-archive-receipt.json",canonical(receipt))
  write(accepted_path,workspace)
  result_path=directory/"result.json"
  if not result_path.exists() or load(result_path).get("status")!="COMPLETE":
   node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
   if not node:raise RuntimeError("An existing Node runtime is required")
   attempts=directory/"node-attempts";attempts.mkdir(mode=0o700,exist_ok=True)
   attempt=attempts/str(uuid.uuid4());attempt.mkdir(mode=0o700)
   command=[node,"complete-receiving.mjs","--browser-branches"]
   env=dict(os.environ,MPC_RECEIVING_PYTHON=sys.executable,NODE_OPTIONS="--max-old-space-size=192",OMP_NUM_THREADS="1",OPENBLAS_NUM_THREADS="1",MPC_RECEIVING_GUARD_FD=str(lock.fileno()),MPC_BRANCH_DIRECTORY=str(directory),MPC_BRANCH_ACCEPTED_WORKSPACE=str(accepted_path))
   write(attempt/"input.json",canonical({"command":command,"cwd":str(root),"operation":receipt["operation"],"acceptedInput":receipt}))
   process=None;code=None;failure=None
   try:
    with (directory/"native.stdout.log").open("ab") as out,(directory/"native.stderr.log").open("ab") as err:
     process=subprocess.Popen(command,cwd=root,env=env,stdout=out,stderr=err,pass_fds=(lock.fileno(),))
     write(attempt/"accepted.json",canonical({"pid":process.pid,"command":command}))
     print(json.dumps({"operation":receipt["operation"],"pid":process.pid,"directory":str(directory)}),flush=True)
     code=process.wait()
   except BaseException as error:
    failure=error
    raise
   finally:
    if process is not None:
     if process.poll() is None:
      process.terminate()
      try:process.wait(timeout=30)
      except subprocess.TimeoutExpired:process.kill();process.wait()
     write(attempt/"return.json",canonical({"pid":process.pid,"exitCode":process.returncode,"nodeClosed":process.poll() is not None,"error":None if failure is None else type(failure).__name__}))
   if code:raise SystemExit(code)
  report=load(result_path)
  if report.get("status")!="COMPLETE" or report.get("operation")!=receipt["operation"] or report.get("browserClosed")is not True or report.get("serverClosed")is not True:raise RuntimeError("Original branch receiving has not completed and closed its owned resources")
  accepted_ref=report.get("acceptedArchive",{})
  if accepted_ref.get("bytes")!=654095 or accepted_ref.get("sha256")!=expected:raise RuntimeError("Completed branch result selected another accepted archive")
  source=load(directory/"source-selection.json")
  if source.get("sha256")!=report.get("sourceSha256") or not isinstance(source.get("files"),list) or not source["files"]:raise RuntimeError("Retain the complete original selected source")
  unsigned={k:v for k,v in source.items() if k!="sha256"}
  digest_source=sha(json.dumps(unsigned,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf-8"))
  if digest_source!=source["sha256"]:raise RuntimeError("Original source selection digest differs")
  source_names=[item["path"] for item in source["files"]]
  if len(source_names)!=len(set(source_names)):raise RuntimeError("Repeated original source selection path")
  members={}
  def add(name,path,raw):
   rel(name)
   if name in members:
    if members[name][1]!=raw:raise RuntimeError("Conflicting archive member: "+name)
   else:members[name]=(path,raw)
  for item in source["files"]:
   p,raw=checked(root,item);add("source/"+item["path"],p,raw)
  artifacts=report.get("artifacts")
  if not isinstance(artifacts,list):raise RuntimeError("The original complete artifact inventory is required")
  seen=set()
  for item in artifacts:
   if item["path"] in seen:raise RuntimeError("Repeated original artifact path")
   seen.add(item["path"]);parts=rel(item["path"]).parts
   if any(x in ("profiles","profile","chrome-profile","browser-profile","control") for x in parts) or parts[-1] in ("private-launch.json","launch.json"):raise RuntimeError("Private launch/profile data is not a customer artifact")
   p,raw=checked(directory,item);add("receiving-branches/"+item["path"],p,raw)
  for name in ("result.json","source-selection.json","input/accepted-workspace.json","input/accepted-archive-receipt.json"):
   p=selected_file(directory,name);add("receiving-branches/"+name,p,regular(p))
  # The fixed manifest is also the exact, immutable reconstruction recipe.
  recipe={"schema":"commons.mpc.branch-delivery.v1","operation":report["operation"],"sourceSha256":source["sha256"],"acceptedArchive":receipt["archive"],"resultSha256":sha(regular(result_path)),"files":[{"path":name,"bytes":len(raw),"sha256":sha(raw)} for name,(_,raw) in sorted(members.items())]}
  recipe_path=directory/"delivery-intent.json";write(recipe_path,canonical(recipe))
  add("Delivery_Manifest.json",recipe_path,canonical(recipe))
  output=root/"MPC_Recovery_Branches_Receiving_20261013.zip"
  delivery=directory/"delivery-result.json"
  if delivery.exists():
   saved=load(delivery);raw=regular(output)
   if saved.get("status")!="COMPLETE" or saved.get("operation")!=report["operation"] or saved.get("result")!=report or saved.get("bytes")!=len(raw) or saved.get("sha256")!=sha(raw) or saved.get("recipeSha256")!=sha(canonical(recipe)):raise RuntimeError("Saved branch delivery differs from its original completion")
   print(json.dumps(saved),flush=True);return
  fd,temp=tempfile.mkstemp(prefix=".MPC_Recovery_Branches_",suffix=".partial",dir=root);os.close(fd)
  try:
   with zipfile.ZipFile(temp,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name,(_,raw) in sorted(members.items()):
     info=zipfile.ZipInfo(name,(2026,10,13,0,0,0));info.create_system=3;info.external_attr=0o100600<<16;info.compress_type=zipfile.ZIP_DEFLATED
     z.writestr(info,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)
   with open(temp,"rb") as f:os.fsync(f.fileno())
   prepared=regular(pathlib.Path(temp))
   if output.exists():
    if regular(output)!=prepared:raise RuntimeError("Existing unresolved branch archive differs from exact original recipe reconstruction")
    os.unlink(temp)
   else:os.replace(temp,output);sync_dir(root)
   saved={"operation":report["operation"],"status":"COMPLETE","path":str(output),"bytes":len(prepared),"sha256":sha(prepared),"recipeSha256":sha(canonical(recipe)),"result":report}
   write(delivery,canonical(saved))
   print(json.dumps(saved),flush=True)
  finally:
   try:os.unlink(temp)
   except FileNotFoundError:pass
 finally:lock.close()

if __name__=="__main__":
 if "--browser-branches" in sys.argv[1:]:run_browser_branches()
 else:run_original()
