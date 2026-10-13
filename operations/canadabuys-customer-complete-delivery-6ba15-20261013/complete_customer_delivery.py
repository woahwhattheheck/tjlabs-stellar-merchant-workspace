#!/usr/bin/env python3
"""Build, install, receive and preserve the complete original CanadaBuys customer workflow."""
from __future__ import annotations
import ast,contextlib,fcntl,hashlib,json,os,select,shutil,signal,stat,subprocess,sys,time,traceback,uuid,zipfile
from pathlib import Path
from datetime import datetime,timezone

OP="CANADABUYS-AGENT-CUSTOMER-6BA15-20261012"
ROOT=Path("/dev/canadabuys-customer-6ba15-20261013")
SHARED=Path("/workspace/scratch/6ba15c52ace4/canadabuys-customer-delivery-20261013")
OWNED=None
def now():return datetime.now(timezone.utc).isoformat()
def encoded(value):return (json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def require(value,message):
 if not value:raise RuntimeError(message)
def emit(event_name,**values):print(json.dumps({"event":event_name,"operationId":OP,"at":now(),**values},separators=(",",":")),flush=True)
def private(path):
 path=Path(path);path.mkdir(parents=True,exist_ok=True,mode=0o700)
 require(not path.is_symlink() and path.is_dir() and path.resolve()==path,"Expected a canonical owned directory: "+str(path))
 os.chmod(path,0o700);return path
def record(path):
 path=Path(path);handle=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(handle);require(stat.S_ISREG(before.st_mode),"Expected a regular original file")
  digest=hashlib.sha256();size=0
  while True:
   block=os.read(handle,1048576)
   if not block:break
   size+=len(block);digest.update(block)
  after=os.fstat(handle);named=path.lstat()
  require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
          and (named.st_dev,named.st_ino)==(before.st_dev,before.st_ino) and size==before.st_size,"Original file changed while read")
  return {"path":str(path),"bytes":size,"sha256":digest.hexdigest()}
 finally:os.close(handle)
def syncdir(path):
 fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
def publish(path,raw):
 path=Path(path);private(path.parent)
 if path.exists():
  selected=record(path);require(selected["bytes"]==len(raw) and selected["sha256"]==sha(raw),"Original immutable file differs: "+str(path));return path
 temporary=path.with_name("."+path.name+"."+uuid.uuid4().hex+".tmp")
 fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,"wb",closefd=False) as stream:stream.write(raw);stream.flush();os.fsync(fd)
 finally:os.close(fd)
 try:
  try:os.link(temporary,path)
  except FileExistsError:require(record(path)["sha256"]==sha(raw),"Concurrent immutable file differs")
  syncdir(path.parent)
 finally:temporary.unlink(missing_ok=True)
 return path
def pubjson(path,value):return publish(path,encoded(value))
def readjson(path):return json.loads(Path(path).read_bytes())
def same(expected,path):
 actual=record(path);require(actual==expected,"Original exact file descriptor differs: "+str(path));return actual
def copy_exact(source,destination,expected):
 source=Path(source);destination=Path(destination);same(expected,source);private(destination.parent)
 if destination.exists():
  selected=record(destination);require(selected["bytes"]==expected["bytes"] and selected["sha256"]==expected["sha256"],"Staged original file differs");return destination
 temporary=destination.with_name("."+destination.name+"."+uuid.uuid4().hex+".copy")
 with source.open("rb") as inp,temporary.open("xb") as out:
  os.chmod(temporary,0o600);shutil.copyfileobj(inp,out,1048576);out.flush();os.fsync(out.fileno())
 try:
  selected=record(temporary);require(selected["bytes"]==expected["bytes"] and selected["sha256"]==expected["sha256"],"Complete staging copy differs")
  os.link(temporary,destination);syncdir(destination.parent)
 finally:temporary.unlink(missing_ok=True)
 same(expected,source);return destination
def finish_saved_artifact(path,kept,reused):
 raise RuntimeError("This operation uses its current supported Library tool receipt")
def save_artifact(path):raise RuntimeError("The supported Library bridge is not installed")
def observation():
 raw=Path("/proc/self/stat").read_text();end=raw.rfind(")");f=raw[end+2:].split()
 return {"pid":int(raw.split("(",1)[0].strip()),"startTicks":f[19],"bootId":Path("/proc/sys/kernel/random/boot_id").read_text().strip(),"namespacePid":os.getpid()}
def inactive(selected):
 if selected["bootId"]!=Path("/proc/sys/kernel/random/boot_id").read_text().strip():return True
 try:raw=Path("/proc")/str(selected["pid"])/"stat";text=raw.read_text()
 except FileNotFoundError:return True
 f=text[text.rfind(")")+2:].split()
 return f[19]!=selected["startTicks"] or f[0]=="Z"
def resource():
 value={"observer":observation()}
 for name in ("memory.current","memory.max","memory.peak","memory.events"):
  try:value[name]=Path("/sys/fs/cgroup",name).read_text().strip()
  except OSError as error:value[name]={"errno":error.errno}
 return value
def stop_child(child):
 if child is None or child.poll() is not None:return
 with contextlib.suppress(ProcessLookupError):os.killpg(child.pid,signal.SIGTERM)
 try:child.wait(timeout=10)
 except subprocess.TimeoutExpired:
  with contextlib.suppress(ProcessLookupError):os.killpg(child.pid,signal.SIGKILL)
  child.wait(timeout=10)
def run_command(label,argv,environment,timeout=1800):
 global OWNED
 directory=private(ROOT/"commands"/label)
 request={"schema":"commons.canadabuys-customer-command.v1","operationId":OP,"label":label,"argv":argv,"sourceCommit":PAYLOAD["sourceCommit"]}
 request_path=pubjson(directory/"request.json",request);request_hash=record(request_path)["sha256"]
 completed=directory/"completed.json"
 if completed.exists():
  old=readjson(completed);require(old["requestSha256"]==request_hash and old["exitCode"]==0,"Original completed command differs")
  same(old["stdout"],Path(old["stdout"]["path"]));same(old["stderr"],Path(old["stderr"]["path"]));emit("COMMAND_REUSED",label=label);return old
 for intent in sorted(directory.glob("*.intent.json")):
  original=readjson(intent);require(original["requestSha256"]==request_hash,"Original command intent differs")
  prefix=intent.name[:-len(".intent.json")]
  process_path=directory/(prefix+".process.json");result_path=directory/(prefix+".result.json")
  require(process_path.exists(),"An original command intent has no resolved acquired-child receipt")
  process_record=readjson(process_path)
  require(process_record["requestSha256"]==request_hash and inactive(process_record["process"]),"An original acquired command remains active")
  require(result_path.exists(),"The original command has no terminal receipt; reconcile that same command before continuing")
  previous=readjson(result_path)
  require(previous["requestSha256"]==request_hash and previous["process"]==process_record["process"],"Original terminal command binding differs")
  same(previous["stdout"],Path(previous["stdout"]["path"]));same(previous["stderr"],Path(previous["stderr"]["path"]))
  if previous["exitCode"]==0:
   pubjson(completed,previous);emit("COMMAND_REUSED",label=label,reconciledTerminal=True);return previous
 attempt=uuid.uuid4().hex
 stdout=directory/(attempt+".stdout.log");stderr=directory/(attempt+".stderr.log")
 pubjson(directory/(attempt+".intent.json"),{"requestSha256":request_hash,"parent":observation(),"createdAt":now(),"resources":resource()})
 parent=observation();identity_r,identity_w=os.pipe();child=None
 with stdout.open("xb",buffering=0) as out,stderr.open("xb",buffering=0) as errors:
  os.chmod(stdout,0o600);os.chmod(stderr,0o600)
  try:
   child=subprocess.Popen([sys.executable,"-u",str(ROOT/"producer/child_gate.py"),str(request_path),str(identity_w)],
     stdin=subprocess.PIPE,stdout=out,stderr=errors,env=environment,start_new_session=True,pass_fds=(identity_w,),close_fds=True,cwd=str(ROOT))
   OWNED=child;os.close(identity_w);identity_w=None
   deadline=time.monotonic()+30;raw=bytearray()
   while True:
    remaining=deadline-time.monotonic();require(remaining>0,"Original child identity timed out")
    ready,_,_=select.select([identity_r],[],[],remaining);require(ready,"Original child identity unavailable")
    block=os.read(identity_r,4096)
    if not block:break
    raw.extend(block);require(len(raw)<16384,"Original child identity too large")
   selected=json.loads(raw);os.close(identity_r);identity_r=None
   require(selected["requestSha256"]==request_hash and selected["argv"]==argv and selected["namespacePid"]==child.pid
           and selected["parentHostPid"]==parent["pid"] and selected["process"]["bootId"]==parent["bootId"]
           and child.poll() is None,"Original acquired child identity differs")
   pubjson(directory/(attempt+".process.json"),selected)
   pubjson(directory/(attempt+".dispatch.json"),{"requestSha256":request_hash,"process":selected["process"],"releasedAt":now()})
   child.stdin.write(b"START\n");child.stdin.flush();child.stdin.close()
   emit("COMMAND_STARTED",label=label,process=selected["process"],namespacePid=child.pid,resources=resource())
   started=time.monotonic();position=0;pending=b""
   while child.poll() is None:
    require(time.monotonic()-started<timeout,"Original complete command exceeded its selected lifetime")
    with stdout.open("rb") as stream:stream.seek(position);block=stream.read(65536);position+=len(block)
    pending+=block
    while b"\n" in pending:
     line,pending=pending.split(b"\n",1)
     try:
      value=json.loads(line)
      if isinstance(value,dict) and value.get("event"):print(json.dumps(value,separators=(",",":")),flush=True)
     except (ValueError,UnicodeError):pass
    time.sleep(0.2)
   code=child.wait()
  except BaseException:
   stop_child(child);raise
  finally:
   for fd in (identity_r,identity_w):
    if fd is not None:
     with contextlib.suppress(OSError):os.close(fd)
   if child is not None and child.poll() is None:stop_child(child)
   OWNED=None;out.flush();errors.flush();os.fsync(out.fileno());os.fsync(errors.fileno())
 result={"schema":"commons.canadabuys-customer-command-result.v1","requestSha256":request_hash,"process":selected["process"],"exitCode":code,"completedAt":now(),"stdout":record(stdout),"stderr":record(stderr),"resources":resource()}
 pubjson(directory/(attempt+".result.json"),result)
 if code!=0:
  tail=stderr.read_text(errors="replace")[-12000:]
  emit("COMMAND_FAILED",label=label,exitCode=code,stderr=tail,stdout=str(stdout))
  raise RuntimeError("Original command "+label+" failed with exit "+str(code))
 pubjson(completed,result);emit("COMMAND_COMPLETE",label=label,exitCode=0);return result
def complete_archive(filename,kind):
 output=ROOT/"deliveries"/filename;private(output.parent)
 descriptor=output.with_suffix(output.suffix+".json")
 if output.exists():
  require(descriptor.exists(),"Original published archive receipt is absent; reconcile its bytes")
  receipt=readjson(descriptor);same(receipt["archive"],output);return output
 selected=[]
 for directory,names,files in os.walk(ROOT,followlinks=False):
  current=Path(directory)
  if current==ROOT/"deliveries":names[:]=[];continue
  names[:]=sorted(names)
  for name in sorted(files):
   file=current/name
   require(not file.is_symlink() and file.is_file(),"Portable source contains a linked or special file")
   selected.append({"path":file.relative_to(ROOT).as_posix(),"file":file,**{k:v for k,v in record(file).items() if k!="path"}})
 manifest={"schema":"commons.canadabuys-customer-complete-delivery.v1","operationId":OP,"kind":kind,"sourceCommit":PAYLOAD["sourceCommit"],
           "files":[{k:v for k,v in row.items() if k!="file"} for row in selected]}
 raw=encoded(manifest);temporary=output.with_name("."+output.name+"."+uuid.uuid4().hex+".zip")
 with zipfile.ZipFile(temporary,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
  for row in selected:
   before=record(row["file"]);require(before["bytes"]==row["bytes"] and before["sha256"]==row["sha256"],"Delivery source changed")
   archive.write(row["file"],row["path"]);same(before,row["file"])
  archive.writestr("DELIVERY_MEMBERS.json",raw)
 with temporary.open("rb") as handle:os.fsync(handle.fileno())
 with zipfile.ZipFile(temporary) as archive:
  require(len(archive.namelist())==len(selected)+1 and len(set(archive.namelist()))==len(selected)+1,"Complete archive inventory differs")
  for row in selected:
   with archive.open(row["path"]) as source:
    digest=hashlib.sha256();size=0
    while True:
     block=source.read(1048576)
     if not block:break
     digest.update(block);size+=len(block)
   require(size==row["bytes"] and digest.hexdigest()==row["sha256"],"Complete archive member differs")
 os.link(temporary,output);temporary.unlink();syncdir(output.parent)
 pubjson(descriptor,{"archive":record(output),"manifest":{"bytes":len(raw),"sha256":sha(raw)},"members":len(selected)+1,"kind":kind,"at":now()})
 emit("COMPLETE_ARCHIVE_VERIFIED",**record(output),members=len(selected)+1,kind=kind);return output
def main():
 global PAYLOAD
 PAYLOAD=NATIVE_INPUT
 private(ROOT);private(SHARED)
 lease=os.open(ROOT/"producer.lock",os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600);fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  require(PAYLOAD["operationId"]==OP,"Original whole input belongs to another operation")
  pubjson(ROOT/"original-input.json",PAYLOAD)
  if PAYLOAD.get("preparationHistory") is not None:pubjson(ROOT/"recovery/original-materialization-history.json",PAYLOAD["preparationHistory"])
  publish(ROOT/"producer/complete_customer_delivery.py",PAYLOAD["mainSource"].encode())
  publish(ROOT/"producer/installed_customer.mjs",PAYLOAD["nodeDriver"].encode())
  publish(ROOT/"producer/child_gate.py",PAYLOAD["gateSource"].encode())
  publish(ROOT/"producer/official_library_save_bridge.py",PAYLOAD["saveBridge"].encode())
  ast.parse(PAYLOAD["gateSource"]);ast.parse(PAYLOAD["saveBridge"])
  bridge={"__name__":"customer_original_library_bridge"};exec(compile(PAYLOAD["saveBridge"],str(ROOT/"producer/official_library_save_bridge.py"),"exec"),bridge)
  bridge["install_original_library_tool_bridge"](globals())
  emit("CUSTOMER_SOURCE_MATERIALIZING",sourceCommit=PAYLOAD["sourceCommit"],files=len(PAYLOAD["sourceFiles"]),resources=resource())
  for item in PAYLOAD["sourceFiles"]:
   name=item["path"];require(not name.startswith("/") and all(x not in ("",".","..") for x in name.split("/")) and "\\" not in name,"Invalid source path")
   raw=item["content"].encode();require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"Full received source differs: "+name)
   path=publish(ROOT/"incoming-source"/name,raw);os.chmod(path,0o755 if item["mode"]=="100755" else 0o644)
  pubjson(ROOT/"git-metadata.json",PAYLOAD["gitMetadata"])
  publish(ROOT/"input/canadabuys-original-receiving-input.json",PAYLOAD["fixtureText"].encode())
  node=Path(os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node") or "").resolve(strict=True)
  npm=shutil.which("npm",path=str(node.parent)+os.pathsep+os.environ.get("PATH",""));require(npm,"Original npm executable unavailable")
  environment=dict(os.environ);environment["PATH"]=str(node.parent)+os.pathsep+environment.get("PATH","")
  environment["NODE_OPTIONS"]=(environment.get("NODE_OPTIONS","")+" --max-old-space-size=256").strip()
  private(ROOT/"npm-cache");private(ROOT/"tmp");environment["TMPDIR"]=str(ROOT/"tmp")
  pubjson(ROOT/"driver-input.json",{"operationId":OP,"root":str(ROOT),"sourceCommit":PAYLOAD["sourceCommit"],"python":sys.executable,"node":str(node),"npm":npm})
  # Complete source bytes are now retained on disk before the Node/npm lifetime.
  source_commit=PAYLOAD["sourceCommit"]
  PAYLOAD={"operationId":OP,"sourceCommit":source_commit}
  globals().pop("NATIVE_INPUT",None)
  emit("CUSTOMER_RECEIVING_STARTED",sourceCommit=source_commit,node=str(node),python=sys.executable,npm=npm,resources=resource())
  try:
   helper=ROOT/"incoming-source/stellar/scf-starforge-20261009/distribution/git-object-receiving.py"
   run_command("original-git-source",[sys.executable,"-B",str(helper),"--metadata",str(ROOT/"git-metadata.json"),"--commit",source_commit,
     "--directory",str(ROOT/"git-cache"),"--donor-source",str(ROOT/"incoming-source"),"--materialize",str(ROOT/"source")],environment)
   run_command("complete-installed-receiving",[str(node),str(ROOT/"producer/installed_customer.mjs"),str(ROOT/"driver-input.json")],environment)
   result=readjson(ROOT/"execution.json");require(result["status"]=="PASS" and result["receiving"]["servicesDrained"],"Whole receiving result is incomplete")
   guide=ROOT/"deliveries/CanadaBuys_Customer_START_HERE_20261013.md"
   original_guide=(ROOT/"receiving/START_HERE.md").read_text()
   package_guide=(ROOT/"runtime/package/README.md").read_text()
   publish(guide,(original_guide+"\n\n## Complete installed customer guide\n\n"+package_guide).encode())
   exported=ROOT/"deliveries/CanadaBuys_Customer_Receiving_Result_20261013.json";copy_exact(ROOT/"execution.json",exported,record(ROOT/"execution.json"))
   build=readjson(ROOT/"receipts/distribution.json");distribution=ROOT/"deliveries/CanadaBuys_Customer_Installed_Source_20261013.tgz";copy_exact(Path(build["archive"]),distribution,record(Path(build["archive"])))
   archive=complete_archive("CanadaBuys_Customer_Complete_Receiving_20261013.zip","COMPLETE")
   saved=[]
   for path in (archive,distribution,guide,exported):saved.append(save_artifact(path))
   final={"schema":"commons.canadabuys-customer-final.v1","operationId":OP,"state":"SAVED","status":"PASS","sourceCommit":source_commit,
          "artifacts":[x["result"] for x in saved],"receiving":result["receiving"],"at":now()}
   pubjson(ROOT/"final-delivery.json",final);pubjson(SHARED/"final-delivery.json",final);emit("CUSTOMER_DELIVERY_COMPLETE",**final)
  except BaseException as error:
   stop_child(OWNED)
   failed={"schema":"commons.canadabuys-customer-failure.v1","operationId":OP,"sourceCommit":source_commit,"at":now(),"error":str(error),
           "traceback":traceback.format_exc(),"resources":resource()}
   pubjson(ROOT/"failures"/(uuid.uuid4().hex+".json"),failed);emit("CUSTOMER_RECEIVING_INCOMPLETE",**failed)
   try:
    path=complete_archive("CanadaBuys_Customer_Interrupted_Checkpoint_"+sha(encoded(failed))[:16]+".zip","INTERRUPTED")
    kept=save_artifact(path);emit("CUSTOMER_CHECKPOINT_SAVED",**kept["result"],bytes=kept["source"]["bytes"],sha256=kept["source"]["sha256"])
   except BaseException as save_error:emit("CUSTOMER_CHECKPOINT_SAVE_FAILED",error=str(save_error),path=str(ROOT))
   raise
 finally:
  stop_child(OWNED);os.close(lease)

if __name__=="__main__":main()
