#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Complete continuation of the original SCF Bank operating case.
import os,sys,json,base64,hashlib,pathlib,tarfile,shutil,subprocess,time,traceback,signal,html,stat,uuid,re,io,fcntl
from datetime import datetime,timezone
os.umask(0o077)
PROGRAMME_SOURCE=pathlib.Path(__file__).read_text(encoding="utf8")
BASE=pathlib.Path(os.environ.get("SCF_BANK_RECEIVING_ROOT","/dev/shm/9f05-scf-bank-receiving-rd12"))
SOURCE=BASE/"source"
ORIGINAL=BASE/"deliveries/edition-2/SCF_Bank_Complete_Operating_Case.tgz"
ORIGINAL_SHA="9fe2e0775a8823280a3be66fce769c84adbfe60f05103dbeaf775b382ded20c3"
ORIGINAL_BYTES=9187689
CASE=pathlib.Path("/dev/dff77-bank-native-_c0twq6j/cases/merchant-bank-gxw5Sv")
RECEIVING=BASE/"continuation"
DELIVERY_ROOT=BASE/"deliveries"
DELIVERY_EDITION=DELIVERY_ROOT/("edition-"+os.environ.get("SCF_BANK_DELIVERY_EDITION","4"))
ATTEMPT_ID=uuid.uuid4().hex
DELIVERIES=DELIVERY_EDITION/"attempts"/ATTEMPT_ID
BANK="stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements"
CHROME=os.environ.get("SCF_BANK_CHROMIUM","/workspace/scratch/9f05c4298c2e/shared-native-toolchain/chrome-155.0.8059.39/chrome-headless-shell-linux64/chrome-headless-shell")
PACKET=json.loads(pathlib.Path(os.environ["SCF_BANK_SOURCE_PACKET"]).read_bytes())
OPERATION=PACKET["operation"]
CHECKPOINTS=BASE/"native-case-checkpoints"
CHECKPOINT_SCHEMA="stellar-forge.merchant-bank-native-case-checkpoint.v1"
BASE_CASE_SHA="6bbfbba8cb195aa1d89def502a285addf5e6e152eba3d89c27960cb1966139ed"
WORKSPACE_ID="06ad7c909f692184aaf9086e1b8cc3c698b7721897ac5449e4f76a9b37058845"
BASE_SOURCE_MANIFEST=PACKET["originalSourceFiles"]
def stamp(): return datetime.now(timezone.utc).isoformat()
def emit(value): print(json.dumps(value,ensure_ascii=False),flush=True)
def digest(path):
 h=hashlib.sha256()
 with pathlib.Path(path).open("rb") as f:
  for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
 return h.hexdigest()
def sync_parent(path):
 fd=os.open(str(pathlib.Path(path).parent),os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def regular(path):
 metadata=pathlib.Path(path).lstat()
 if not stat.S_ISREG(metadata.st_mode):raise RuntimeError("Original regular file required: "+str(path))
 return metadata
def write_new_or_same(path,data):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if path.exists():
  regular(path)
  if path.read_bytes()==data:return
  old=path.read_bytes()
  if len(old)>=len(data) or data[:len(old)]!=old:raise RuntimeError("Existing complete original file differs: "+str(path))
  os.replace(path,path.with_name(path.name+".interrupted-"+uuid.uuid4().hex))
 temp=path.with_name(path.name+".receiving-"+uuid.uuid4().hex)
 with temp.open("xb") as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
 temp.chmod(0o600);os.replace(temp,path);sync_parent(path)
def json_write(path,value):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 temp=path.with_name(path.name+".tmp-"+uuid.uuid4().hex)
 with temp.open("x",encoding="utf8") as stream:json.dump(value,stream,ensure_ascii=False,indent=2);stream.write("\n");stream.flush();os.fsync(stream.fileno())
 temp.chmod(0o600);os.replace(temp,path);sync_parent(path)
def safe_name(value):
 if not isinstance(value,str) or not value or "\\" in value or "\0" in value:raise RuntimeError("Original case path is invalid")
 path=pathlib.PurePosixPath(value)
 if path.is_absolute() or ".." in path.parts or str(path)!=value:raise RuntimeError("Original case path is not relative")
 return path
def receive_stream(path,stream,size,expected,*,optional_match=False,replace_owned=False):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if path.exists() and regular(path).st_size==size and digest(path)==expected:return True
 temp=path.with_name(path.name+".receiving-"+uuid.uuid4().hex);copied=0;hashes=hashlib.sha256()
 try:
  with temp.open("xb") as output:
   for chunk in iter(lambda:stream.read(262144),b""):output.write(chunk);copied+=len(chunk);hashes.update(chunk)
   output.flush();os.fsync(output.fileno())
  if copied!=size or hashes.hexdigest()!=expected:
   if optional_match:temp.unlink();return False
   raise RuntimeError("Complete original file differs: "+str(path))
  if path.exists():
   old_size=regular(path).st_size
   if replace_owned:
    old_sha=digest(path);predecessor=CHECKPOINTS/"receiving-predecessors"/old_sha
    with path.open("rb") as previous:receive_stream(predecessor,previous,old_size,old_sha)
   else:
    if old_size>=size:raise RuntimeError("An unrelated complete receiving predecessor exists: "+str(path))
    with path.open("rb") as old,temp.open("rb") as new:
     while True:
      a=old.read(262144)
      if not a:break
      if new.read(len(a))!=a:raise RuntimeError("Receiving predecessor is not the original incomplete prefix: "+str(path))
    os.replace(path,path.with_name(path.name+".interrupted-"+uuid.uuid4().hex))
  temp.chmod(0o600);os.replace(temp,path);sync_parent(path);return True
 except BaseException:
  if temp.exists():temp.unlink()
  raise
def check_state(state):
 if state.get("createdAt")!="2026-10-12T23:15:12.559Z" or type(state.get("revision")) is not int or state["revision"]<87:raise RuntimeError("Existing original workspace identity differs")
 for key,name in [("outboxDir","outbox"),("proofDir","proofs"),("termsFile","terms.json")]:
  if state.get("sources",{}).get(key)!=str(CASE/name):raise RuntimeError("Original saved source path differs: "+key)
 return state
def validate_case_location():
 for path in [CASE,*CASE.parents]:
  if path.exists() and path.is_symlink():raise RuntimeError("Original accounting path must remain a real directory")
 if CASE.exists() and (not CASE.is_dir() or CASE.resolve()!=CASE):raise RuntimeError("Original case identity differs")
def source_intake():
 current=BASE/"intake/CURRENT_SOURCE.json"
 if current.exists() and digest(current)!="30416ab0415e58f60a62835fb6ef6a672b099fb2dbaed10267953d1a56ba5ced":raise RuntimeError("Original full current source identity differs")
 incoming={file["path"]:file for file in PACKET["files"]}
 expected={file["path"]:file for file in BASE_SOURCE_MANIFEST}
 missing={name for name in expected if not (SOURCE/name).is_file()}
 if missing:
  if ORIGINAL.stat().st_size!=ORIGINAL_BYTES or digest(ORIGINAL)!=ORIGINAL_SHA:raise RuntimeError("Original complete source/case archive differs")
  with tarfile.open(ORIGINAL,"r:gz") as archive:
   for member in archive:
    if not member.isfile() or not member.name.startswith("source/"):continue
    name=member.name[len("source/"):]
    if name not in missing:continue
    safe_name(name);body=archive.extractfile(member).read()
    accepted={expected[name]["sha256"]}
    if name in incoming:accepted.update([incoming[name]["sha256"],*incoming[name].get("preimages",[])])
    if hashlib.sha256(body).hexdigest() not in accepted:raise RuntimeError("Retained complete source preimage differs: "+name)
    write_new_or_same(SOURCE/name,body);missing.remove(name)
  if missing:raise RuntimeError("Complete original source files are missing: "+", ".join(sorted(missing)))
 for name,file in expected.items():
  path=SOURCE/name;regular(path);observed=digest(path);accepted={file["sha256"]}
  if name in incoming:accepted.update([incoming[name]["sha256"],*incoming[name].get("preimages",[])])
  if observed not in accepted:raise RuntimeError("Original source preimage changed: "+name)
 for file in PACKET["files"]:
  body=file["content_utf8"].encode();path=SOURCE/file["path"]
  if len(body)!=file["bytes"] or hashlib.sha256(body).hexdigest()!=file["sha256"]:raise RuntimeError("Complete continuation source differs")
  if path.exists() and digest(path)!=file["sha256"]:
   accepted={expected[file["path"]]["sha256"]} if file["path"] in expected else set()
   accepted.update(file.get("preimages",[]))
   if digest(path) not in accepted:raise RuntimeError("Selected continuation preimage differs: "+file["path"])
   temp=path.with_name(path.name+".source-"+uuid.uuid4().hex)
   with temp.open("xb") as output:output.write(body);output.flush();os.fsync(output.fileno())
   temp.chmod(0o600);os.replace(temp,path);sync_parent(path)
  else:write_new_or_same(path,body)
 paths=set(expected)|set(incoming)
 manifest=[{"path":name,"bytes":(SOURCE/name).stat().st_size,"sha256":digest(SOURCE/name)} for name in sorted(paths)]
 json_write(RECEIVING/"current-source-manifest.json",{"operation":OPERATION,"originalSource":PACKET["completeCurrentSourceSha256"],"files":manifest})
 write_new_or_same(RECEIVING/"complete-continuation-source-edition-5.json",json.dumps(PACKET,separators=(",",":"),ensure_ascii=False).encode())
 return manifest
def read_pointer(name):
 path=CHECKPOINTS/name
 if not path.is_file():return None
 pointer=json.loads(path.read_bytes())
 if pointer.get("schema")!=CHECKPOINT_SCHEMA or pointer.get("operation")!=OPERATION:raise RuntimeError("Original checkpoint identity differs")
 selected=pointer.get("manifest","")
 if not re.fullmatch(r"manifests/[0-9]+-[0-9a-f]{64}\.json",selected):raise RuntimeError("Original checkpoint manifest path differs")
 manifest_path=CHECKPOINTS/selected;regular(manifest_path);body=manifest_path.read_bytes()
 if len(body)!=pointer["bytes"] or hashlib.sha256(body).hexdigest()!=pointer["sha256"]:raise RuntimeError("Complete checkpoint manifest differs")
 manifest=json.loads(body)
 if manifest.get("schema")!=CHECKPOINT_SCHEMA or manifest.get("operation")!=OPERATION or manifest.get("originalCaseSha256")!=BASE_CASE_SHA:raise RuntimeError("Original checkpoint source differs")
 if manifest.get("originalRoot")!=str(CASE) or manifest.get("accountingDirectory")!=str(CASE/"accounting") or manifest.get("workspaceId")!=WORKSPACE_ID:raise RuntimeError("Original checkpoint directory binding differs")
 if manifest.get("createdAt")!="2026-10-12T23:15:12.559Z" or type(manifest.get("revision")) is not int or manifest["revision"]<87 or manifest["revision"]!=pointer["revision"]:raise RuntimeError("Original checkpoint revision differs")
 seen=set()
 for file in manifest["files"]:
  safe_name(file["path"])
  if file["path"] in seen or type(file["bytes"]) is not int or file["bytes"]<0 or not re.fullmatch(r"[0-9a-f]{64}",file["sha256"]):raise RuntimeError("Complete original checkpoint file differs")
  seen.add(file["path"])
 for directory in manifest["directories"]:
  safe_name(directory)
  if directory in seen:raise RuntimeError("Original checkpoint file/directory collision")
 workspace=next((file for file in manifest["files"] if file["path"]=="accounting/workspace.json"),None)
 if not workspace or workspace["sha256"]!=pointer["workspaceSha256"]:raise RuntimeError("Original checkpoint workspace differs")
 return pointer,manifest
def missing_objects(manifest):
 missing={}
 for file in manifest["files"]:
  path=CHECKPOINTS/"objects"/file["sha256"]
  if not path.exists() or regular(path).st_size!=file["bytes"] or digest(path)!=file["sha256"]:missing[file["path"]]=file
 return missing
def recover_checkpoint_objects(manifest):
 missing=missing_objects(manifest)
 for file in missing.values():
  path=CHECKPOINTS/"objects"/file["sha256"]
  if path.exists():
   old_sha=digest(path);destination=CHECKPOINTS/"interrupted-objects"/(file["sha256"]+"-"+old_sha)
   destination.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
   if destination.exists():
    if regular(destination).st_size!=regular(path).st_size or digest(destination)!=old_sha:raise RuntimeError("Original incomplete object predecessor differs")
    path.unlink()
   else:os.replace(path,destination)
   sync_parent(path)
 for name,file in list(missing.items()):
  path=CASE/name
  if path.is_file() and not path.is_symlink() and path.stat().st_size==file["bytes"] and digest(path)==file["sha256"]:
   with path.open("rb") as stream:receive_stream(CHECKPOINTS/"objects"/file["sha256"],stream,file["bytes"],file["sha256"])
   del missing[name]
 archives=[ORIGINAL,*sorted((path for path in DELIVERY_ROOT.rglob("SCF_Bank_Complete_Operating_Case.tgz*") if path.is_file()),key=lambda path:path.stat().st_mtime,reverse=True)]
 for path in archives:
  if not missing or not path.is_file():continue
  try:
   with tarfile.open(path,"r|gz") as archive:
    for member in archive:
     if not member.isfile() or not member.name.startswith(CASE.name+"/"):continue
     name=member.name[len(CASE.name)+1:];file=missing.get(name)
     if not file or member.size!=file["bytes"]:continue
     with archive.extractfile(member) as stream:
      matched=receive_stream(CHECKPOINTS/"objects"/file["sha256"],stream,file["bytes"],file["sha256"],optional_match=True)
     if matched:del missing[name]
  except (EOFError,tarfile.ReadError,tarfile.StreamError) as error:
   emit({"phase":"retained_archive_prefix_read","file":path.name,"completeObjectsStillNeeded":len(missing),"error":type(error).__name__})
 if missing:
  json_write(RECEIVING/"checkpoint-recovery-needed.json",{"operation":OPERATION,"revision":manifest["revision"],"workspaceId":manifest["workspaceId"],"files":list(missing.values())})
  raise RuntimeError("The newer original checkpoint retains an unfinished receive; its exact remaining files must be recovered: "+", ".join(sorted(missing)))
def select_checkpoint():
 choices=[]
 for name in ("CURRENT.json","CANDIDATE.json"):
  record=read_pointer(name)
  if record:choices.append(record)
 if not choices:return None
 pointer,manifest=max(choices,key=lambda item:(item[1]["revision"],item[1].get("retainedAt","")))
 recover_checkpoint_objects(manifest)
 body=(CHECKPOINTS/"objects"/pointer["workspaceSha256"]).read_bytes();state=check_state(json.loads(body))
 if state["revision"]!=manifest["revision"] or manifest.get("sourceConfiguration",state["sources"])!=state["sources"]:raise RuntimeError("Original checkpoint source configuration differs")
 json_write(CHECKPOINTS/"CURRENT.json",{**pointer,"complete":True})
 return pointer,manifest
def restore_checkpoint(pointer,manifest):
 validate_case_location();CASE.mkdir(parents=True,exist_ok=True,mode=0o700);CASE.chmod(0o700)
 state_path=CASE/"accounting/workspace.json"
 previous=check_state(json.loads(state_path.read_bytes())) if state_path.is_file() else None
 if previous and previous["revision"]>manifest["revision"]:raise RuntimeError("A newer original case must be retained before an older checkpoint")
 if previous and previous["revision"]==manifest["revision"] and digest(state_path)!=pointer["workspaceSha256"]:raise RuntimeError("Same-revision financial state differs from the selected checkpoint")
 intent={"operation":OPERATION,"manifestSha256":pointer["sha256"],"revision":manifest["revision"],"originalRoot":str(CASE),"previousRevision":previous["revision"] if previous else None,"previousWorkspaceSha256":digest(state_path) if previous else None,"retainedPredecessors":[]}
 original_intent_path=RECEIVING/"checkpoint-restore-intent.json"
 if original_intent_path.is_file():
  existing_intent=json.loads(original_intent_path.read_bytes())
  if existing_intent.get("manifestSha256")==pointer["sha256"]:
   intent["retainedPredecessors"]=existing_intent.get("retainedPredecessors",[])
   if previous is None:
    intent["previousRevision"]=existing_intent.get("previousRevision");intent["previousWorkspaceSha256"]=existing_intent.get("previousWorkspaceSha256")
 json_write(original_intent_path,intent)
 for name in sorted(set(manifest["directories"]),key=lambda value:(value.count("/"),value)):
  path=CASE/safe_name(name)
  if path.exists() and (path.is_symlink() or not path.is_dir()):raise RuntimeError("Original checkpoint directory differs: "+name)
  path.mkdir(parents=True,exist_ok=True,mode=0o700);path.chmod(0o700)
 files=sorted(manifest["files"],key=lambda file:(file["path"]=="accounting/workspace.json",file["path"]))
 for file in files:
  path=CASE/safe_name(file["path"])
  for parent in [path,*path.parents]:
   if parent.exists() and parent.is_symlink():raise RuntimeError("Original case must use real directories")
  replace_owned=False
  if path.exists() and (regular(path).st_size!=file["bytes"] or digest(path)!=file["sha256"]) and intent["previousRevision"] is not None:
   kept={"path":file["path"],"bytes":regular(path).st_size,"sha256":digest(path)}
   if kept not in intent["retainedPredecessors"]:intent["retainedPredecessors"].append(kept);json_write(original_intent_path,intent)
   replace_owned=True
  with (CHECKPOINTS/"objects"/file["sha256"]).open("rb") as stream:receive_stream(path,stream,file["bytes"],file["sha256"],replace_owned=replace_owned)
 for file in files:
  path=CASE/file["path"]
  if regular(path).st_size!=file["bytes"] or digest(path)!=file["sha256"]:raise RuntimeError("Complete original checkpoint receiving differs")
 state=check_state(json.loads((CASE/"accounting/workspace.json").read_bytes()))
 json_write(RECEIVING/"original-case-received.json",{"operation":OPERATION,"receivedAt":stamp(),"directory":str(CASE),"checkpointManifestSha256":pointer["sha256"],"originalSha256":BASE_CASE_SHA,"files":len(files),"revision":state["revision"]})
 emit({"phase":"latest_complete_original_checkpoint_received","revision":state["revision"],"files":len(files),"manifestSha256":pointer["sha256"]})
def recover_interrupted_sources():
 path=DELIVERY_ROOT/"edition-3/SCF_Bank_Complete_Operating_Case.tgz.partial"
 if not path.is_file():return
 prefix=CASE.name+"/accounting/bank-statements/imports/8cf50c95-3d01-4f71-87e2-fe57167c98de/"
 expected={"original.csv":(286,"c71b4c7baf5da5cbf51b6484e5d7a81ea2aad19d2f3bd33505ae83b77b812c3f"),"parsed.json":(14238,"97ef0d304bff54ea18c0029200a9466c74b34758880cea02ee6bceb2dccc3264")}
 retained=[]
 try:
  with tarfile.open(path,"r|gz") as archive:
   for member in archive:
    if not member.isfile() or not member.name.startswith(prefix):continue
    name=member.name[len(prefix):]
    if name not in expected:continue
    size,hashes=expected[name]
    if member.size!=size:raise RuntimeError("Original interrupted correction source length differs")
    with archive.extractfile(member) as stream:receive_stream(RECEIVING/"interrupted-native-source"/"8cf50c95-3d01-4f71-87e2-fe57167c98de"/name,stream,size,hashes)
    retained.append({"path":member.name,"bytes":size,"sha256":hashes})
 except (EOFError,tarfile.ReadError,tarfile.StreamError):pass
 if len(retained)!=2:raise RuntimeError("Both complete original interrupted correction source files must remain present")
 json_write(RECEIVING/"interrupted-native-source-recovery.json",{"operation":OPERATION,"nativeAttempt":"59606","partialArchive":str(path),"partialBytes":path.stat().st_size,"partialSha256":digest(path),"files":retained,"completeWorkspaceJournalReceived":False})
def receive_case():
 validate_case_location();state=CASE/"accounting/workspace.json"
 if state.is_file():
  actual=check_state(json.loads(state.read_bytes()))
  actual=reconcile_actual_checkpoint(actual)
  for name in ("outbox","proofs"):(CASE/name).mkdir(exist_ok=True,mode=0o700)
  emit({"phase":"original_case_already_received","revision":actual["revision"],"directory":str(CASE)});return
 selected=select_checkpoint()
 if selected:restore_checkpoint(*selected);return
 if ORIGINAL.stat().st_size!=ORIGINAL_BYTES or digest(ORIGINAL)!=ORIGINAL_SHA:raise RuntimeError("Original saved case identity differs")
 expected_names=set();copied=0;total=0
 with tarfile.open(ORIGINAL,"r:gz") as archive:
  members=[]
  for member in archive:
   relative=safe_name(member.name)
   if not(member.isdir() or member.isfile()):raise RuntimeError("Original archive contains a special path")
   if not relative.parts or relative.parts[0]!=CASE.name:continue
   members.append((member,relative))
  for member,relative in sorted(members,key=lambda item:(str(item[1])==CASE.name+"/accounting/workspace.json",str(item[1]))):
   path=CASE.joinpath(*relative.parts[1:])
   if str(path) in expected_names:raise RuntimeError("Duplicate original archive member")
   expected_names.add(str(path))
   for parent in [path,*path.parents]:
    if parent.exists() and parent.is_symlink():raise RuntimeError("Original case must use real directories")
   if member.isdir():path.mkdir(parents=True,exist_ok=True,mode=0o700);continue
   body=archive.extractfile(member)
   content=body.read();hashes=hashlib.sha256(content).hexdigest()
   if len(content)!=member.size:raise RuntimeError("Complete original case member is truncated")
   receive_stream(path,io.BytesIO(content),member.size,hashes);copied+=1;total+=member.size
 for name in ("outbox","proofs"):(CASE/name).mkdir(exist_ok=True,mode=0o700)
 actual=check_state(json.loads(state.read_bytes()))
 if actual["revision"]!=87:raise RuntimeError("Original received revision differs")
 json_write(RECEIVING/"original-case-received.json",{"operation":OPERATION,"receivedAt":stamp(),"directory":str(CASE),"originalSha256":ORIGINAL_SHA,"files":copied,"bytes":total,"revision":87})
 emit({"phase":"original_case_received","revision":87,"files":copied,"bytes":total,"directory":str(CASE)})
def retain_stopped_case():
 state_path=CASE/"accounting/workspace.json"
 if not state_path.is_file():return None
 before=state_path.read_bytes();state=check_state(json.loads(before));files=[];directories=[]
 for folder,subdirs,names in os.walk(CASE,followlinks=False):
  for name in subdirs:
   path=pathlib.Path(folder)/name
   if path.is_symlink():raise RuntimeError("Original checkpoint has a linked directory")
   directories.append(path.relative_to(CASE).as_posix())
  for name in names:
   path=pathlib.Path(folder)/name;metadata=regular(path)
   files.append({"path":path.relative_to(CASE).as_posix(),"bytes":metadata.st_size,"sha256":digest(path)})
 if state_path.read_bytes()!=before:raise RuntimeError("Original workspace changed during stopped receiving")
 def priority(file):
  name=file["path"]
  return (0 if name=="accounting/workspace.json" else 1 if name=="complete-handover/saved-case-continuation.json" else 2 if name=="complete-handover/browser/browser-result.json" else 3 if name.startswith("accounting/bank-statements/imports/") else 4 if name.startswith("accounting/") else 5,name)
 files.sort(key=priority);directories.sort()
 browser_path=CASE/"complete-handover/browser/browser-result.json"
 browser=json.loads(browser_path.read_bytes()) if browser_path.is_file() else {}
 manifest={"schema":CHECKPOINT_SCHEMA,"operation":OPERATION,"originalCaseSha256":BASE_CASE_SHA,"originalRoot":str(CASE),"accountingDirectory":str(CASE/"accounting"),"workspaceId":WORKSPACE_ID,"createdAt":state["createdAt"],"revision":state["revision"],"sourceConfiguration":state["sources"],"retainedAt":stamp(),"browserStatus":browser.get("status","INTERRUPTED"),"directories":directories,"files":files}
 body=(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode();hashes=hashlib.sha256(body).hexdigest();name=str(state["revision"])+"-"+hashes+".json"
 write_new_or_same(CHECKPOINTS/"manifests"/name,body)
 pointer={"schema":CHECKPOINT_SCHEMA,"operation":OPERATION,"manifest":"manifests/"+name,"bytes":len(body),"sha256":hashes,"revision":state["revision"],"workspaceSha256":hashlib.sha256(before).hexdigest()}
 json_write(CHECKPOINTS/"CANDIDATE.json",{**pointer,"complete":False})
 for file in files:
  with (CASE/file["path"]).open("rb") as stream:receive_stream(CHECKPOINTS/"objects"/file["sha256"],stream,file["bytes"],file["sha256"])
 if state_path.read_bytes()!=before:raise RuntimeError("Original workspace changed before checkpoint publication")
 json_write(CHECKPOINTS/"CURRENT.json",{**pointer,"complete":True})
 emit({"phase":"complete_original_case_checkpoint","revision":state["revision"],"files":len(files),"manifestSha256":hashes})
 return pointer
def case_inventory():
 files=[];directories=[]
 for folder,subdirs,names in os.walk(CASE,followlinks=False):
  for name in subdirs:
   path=pathlib.Path(folder)/name
   if path.is_symlink():raise RuntimeError("Real original case directory required")
   directories.append(path.relative_to(CASE).as_posix())
  for name in names:
   path=pathlib.Path(folder)/name;metadata=regular(path)
   files.append({"path":path.relative_to(CASE).as_posix(),"bytes":metadata.st_size,"sha256":digest(path)})
 return {"directories":sorted(directories),"files":sorted(files,key=lambda row:row["path"])}
def signature(value):
 return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
def inventory_of_manifest(manifest):
 return {"directories":sorted(manifest["directories"]),"files":sorted(manifest["files"],key=lambda row:row["path"])}
def evidence_time():
 values=[]
 for name in ("complete-handover/saved-case-continuation.json","complete-handover/browser/browser-result.json","complete-handover/native-result.json"):
  path=CASE/name
  if not path.is_file():continue
  value=json.loads(path.read_bytes())
  values.extend(value.get(key) for key in ("checkpointAt","completedAt","failedAt","interruptedAt") if value.get(key))
  values.extend(phase.get("at") for phase in value.get("phases",[]) if phase.get("at"))
 parsed=[]
 for value in values:
  try:parsed.append(datetime.fromisoformat(value.replace("Z","+00:00")))
  except (ValueError,AttributeError):pass
 return max(parsed,default=datetime.min.replace(tzinfo=timezone.utc))
def reconcile_actual_checkpoint(actual):
 choices=[row for row in (read_pointer("CURRENT.json"),read_pointer("CANDIDATE.json")) if row]
 if not choices:return actual
 pointer,manifest=max(choices,key=lambda row:(row[1]["revision"],row[1].get("retainedAt","")))
 inventory=case_inventory();observed_sha=signature(inventory);planned_sha=signature(inventory_of_manifest(manifest))
 write_new_or_same(RECEIVING/"checkpoint-history"/(pointer["sha256"]+".json"),(json.dumps({"pointer":pointer,"manifest":manifest},ensure_ascii=False,indent=2)+"\n").encode())
 if actual["revision"]<manifest["revision"]:
  selected=select_checkpoint();restore_checkpoint(*selected)
  return check_state(json.loads((CASE/"accounting/workspace.json").read_bytes()))
 if actual["revision"]==manifest["revision"]:
  if digest(CASE/"accounting/workspace.json")!=pointer["workspaceSha256"]:raise RuntimeError("Same-revision original financial state differs from its named checkpoint")
  if observed_sha==planned_sha:
   recover_checkpoint_objects(manifest);json_write(CHECKPOINTS/"CURRENT.json",{**pointer,"complete":True});return actual
  retained_at=datetime.fromisoformat(manifest["retainedAt"].replace("Z","+00:00"))
  if evidence_time()<=retained_at:
   selected=select_checkpoint();restore_checkpoint(*selected)
   return check_state(json.loads((CASE/"accounting/workspace.json").read_bytes()))
 # The surviving actual writer/evidence is later; retain its complete state before replacing an older candidate.
 completed=retain_stopped_case()
 json_write(RECEIVING/"checkpoint-reconciliation.json",{"operation":OPERATION,"selectedManifestSha256":pointer["sha256"],"selectedRevision":manifest["revision"],"selectedInventorySha256":planned_sha,"actualRevision":actual["revision"],"actualInventorySha256":observed_sha,"receivedActualManifestSha256":completed["sha256"],"selection":"LATER_SURVIVING_ORIGINAL_CASE"})
 return actual
def verify_delivery_archive(path,expected=None):
 regular(path);names=set();manifest=None;observed={}
 with tarfile.open(path,"r:gz") as archive:
  for member in archive:
   safe_name(member.name)
   if not member.isfile() or member.name in names:raise RuntimeError("Complete operating archive has an unexpected member")
   names.add(member.name)
   with archive.extractfile(member) as stream:
    if member.name=="delivery-manifest.json":
     body=stream.read();manifest=json.loads(body);continue
    size=0;hashes=hashlib.sha256()
    for chunk in iter(lambda:stream.read(262144),b""):size+=len(chunk);hashes.update(chunk)
    if size!=member.size:raise RuntimeError("Original operating archive member is truncated")
    observed[member.name]={"bytes":size,"sha256":hashes.hexdigest()}
 if not manifest or manifest.get("schema")!="stellar-forge.merchant-bank-complete-delivery.v1" or manifest.get("operation")!=OPERATION:raise RuntimeError("Original complete delivery identity differs")
 if set(observed)!=set(manifest["files"]):raise RuntimeError("Complete original delivery file set differs")
 for name,value in observed.items():
  if value!=manifest["files"][name]:raise RuntimeError("Complete original delivery file differs: "+name)
 if expected and (manifest["caseFingerprint"]!=expected["caseFingerprint"] or manifest["sourceFingerprint"]!=expected["sourceFingerprint"]):raise RuntimeError("Saved archive belongs to another original continuation state")
 return manifest
def existing_complete_delivery(manifest):
 path=RECEIVING/"current-attempt.json"
 if not path.is_file():return None
 previous=json.loads(path.read_bytes())
 if previous.get("operation")!=OPERATION:raise RuntimeError("Original attempt identity differs")
 directory=pathlib.Path(previous["outputDirectory"])
 if not directory.is_relative_to(DELIVERY_ROOT) or directory.resolve()!=directory:raise RuntimeError("Original attempt directory differs")
 identity_path=directory/"DELIVERY_IDENTITY.json";result_path=directory/"SAVE_RESULT.json"
 if not identity_path.is_file() or not result_path.is_file():return None
 identity=json.loads(identity_path.read_bytes());result=json.loads(result_path.read_bytes())
 if identity.get("nativeStatus")!="PASS" or identity.get("caseFingerprint")!=signature(case_inventory()) or identity.get("sourceFingerprint")!=signature(manifest):return None
 rows=result.get("results",[]) if isinstance(result,dict) else []
 if len(rows)!=len(identity["outputs"]) or any(row.get("status")!="succeeded" for row in rows):return None
 for file in identity["outputs"]:
  target=pathlib.Path(file["path"])
  if not target.is_relative_to(directory) or not target.is_file() or regular(target).st_size!=file["bytes"] or digest(target)!=file["sha256"]:return None
 verify_delivery_archive(directory/"SCF_Bank_Complete_Operating_Case.tgz",identity)
 return {"attempt":previous,"identity":identity,"saveResult":result}
def active_original_group(process):
 active=[]
 for path in pathlib.Path("/proc").glob("[0-9]*/stat"):
  try:
   value=path.read_text();tail=value[value.rfind(")")+2:].split()
   if int(tail[2])==process.pid and int(tail[3])==process.pid and tail[0]!="Z":
    active.append({"pid":int(path.parent.name),"state":tail[0],"startTime":tail[19]})
  except (OSError,ValueError,IndexError):continue
 return active
def quiesce_original_writer(process,attempt):
 if process is None:return
 if process.poll() is None:
  process.terminate()
  try:process.wait(timeout=20)
  except subprocess.TimeoutExpired:
   attempt["stopFailure"]={"at":stamp(),"message":"Original writer did not stop during its first graceful interval","pid":process.pid}
   emit({"phase":"original_writer_stop_continuing",**attempt["stopFailure"]})
   try:json_write(RECEIVING/"native-attempt.json",attempt)
   except OSError as error:emit({"phase":"stop_observation_record_error","errno":error.errno})
 remaining=active_original_group(process)
 if remaining:
  # This process group was created for this one original financial writer and its CLI.
  try:os.killpg(process.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  until=time.monotonic()+10
  while remaining and time.monotonic()<until:
   time.sleep(0.25);remaining=active_original_group(process)
  if remaining:
   emit({"phase":"stopping_original_writer_group","group":process.pid,"processes":remaining})
   try:os.killpg(process.pid,signal.SIGKILL)
   except ProcessLookupError:pass
  while active_original_group(process):
   # Keep the same guard and producer alive; a live writer is never snapshotted as stopped.
   time.sleep(0.5)
 process.wait()
 attempt["writerStoppedAt"]=stamp()
def gallery(browser):
 rows=[]
 for screen in browser.get("screenshots",[]):
  path=pathlib.Path(screen["path"])
  if digest(path)!=screen["sha256"] or path.stat().st_size!=screen["bytes"]:raise RuntimeError("Original browser screen changed")
  encoded=base64.b64encode(path.read_bytes()).decode("ascii")
  title=screen["name"].replace("-"," ")+(" — phone, 390 px" if screen.get("mobile") else " — desktop, 1440 px")
  rows.append("<section><h2>"+html.escape(title)+"</h2><img alt="+json.dumps(title)+" src=\"data:image/png;base64,"+encoded+"\"></section>")
 return ("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Bank reconciliation — application views</title><style>body{font:16px system-ui,sans-serif;color:#222;background:#f7f7f7;margin:0 auto;padding:24px;max-width:1480px}h1{font-size:26px}h2{font-size:19px}section{background:#fff;border:1px solid #ccc;padding:16px;margin:22px 0}img{display:block;max-width:100%;height:auto;border:1px solid #bbb}p{max-width:78ch;line-height:1.5}</style><h1>Bank reconciliation — application views</h1><p>The original retained account continued through Bank statements and Bank receipts, receipt recovery, corrections, complete downloads and reopening. These are the actual desktop and phone views from that saved operating case.</p>"+"".join(rows)+"</html>").encode()
def capture(manifest,attempt):
 outputs=[];output=CASE/"complete-handover";DELIVERIES.mkdir(parents=True,exist_ok=True,mode=0o700)
 candidate=json.loads((output/"native-result.json").read_bytes()) if (output/"native-result.json").is_file() else None
 browser=json.loads((output/"browser/browser-result.json").read_bytes()) if (output/"browser/browser-result.json").is_file() else None
 state=check_state(json.loads((CASE/"accounting/workspace.json").read_bytes()))
 native=candidate if candidate and candidate.get("status")=="PASS" and attempt.get("exitCode")==0 and candidate.get("originalWorkspace",{}).get("revision")==state["revision"] else None
 json_write(RECEIVING/"native-attempt.json",attempt)
 try:retained_checkpoint=retain_stopped_case()
 except BaseException as error:
  retained_checkpoint=None;attempt["checkpointCaptureError"]={"name":type(error).__name__,"message":str(error)}
  try:json_write(RECEIVING/"native-attempt.json",attempt)
  except OSError as record_error:emit({"phase":"checkpoint_error_record_unavailable","errno":record_error.errno})
  emit({"phase":"checkpoint_capture_error","message":str(error)})
 if native:
  target=DELIVERIES/"SCF_Bank_Native_Receiving.json";write_new_or_same(target,(json.dumps(native,ensure_ascii=False,indent=2)+"\n").encode());outputs.append(target)
  target=DELIVERIES/"SCF_Bank_Application_Views.html";write_new_or_same(target,gallery(browser));outputs.append(target)
  target=DELIVERIES/"SCF_Bank_Complete_Accountant_Handover.tar";write_new_or_same(target,(output/"complete-december-account.tar").read_bytes());outputs.append(target)
  target=DELIVERIES/"SCF_Bank_Operating_Guide.md";write_new_or_same(target,(SOURCE/BANK/"README.md").read_bytes());outputs.append(target)
 else:
  target=DELIVERIES/"SCF_Bank_Native_Receiving.json";write_new_or_same(target,(json.dumps(attempt,ensure_ascii=False,indent=2)+"\n").encode());outputs.append(target)
 inventory=case_inventory();case_fingerprint=signature(inventory);source_fingerprint=signature(manifest)
 entries=[];names=set()
 def add(file,name):
  regular(file);safe_name(name)
  if name in names:raise RuntimeError("Duplicate original delivery member: "+name)
  names.add(name);entries.append({"file":file,"name":name,"bytes":file.stat().st_size,"sha256":digest(file)})
 critical=["accounting/workspace.json","complete-handover/saved-case-continuation.json","complete-handover/browser/browser-result.json"]
 files=[file for file in CASE.rglob("*") if file.is_file()]
 files.sort(key=lambda file:(critical.index(file.relative_to(CASE).as_posix()) if file.relative_to(CASE).as_posix() in critical else 3 if file.relative_to(CASE).as_posix().startswith("accounting/bank-statements/imports/") else 4,file.relative_to(CASE).as_posix()))
 for file in files:add(file,CASE.name+"/"+file.relative_to(CASE).as_posix())
 for file in sorted(path for path in SOURCE.rglob("*") if path.is_file()):add(file,"source/"+file.relative_to(SOURCE).as_posix())
 for file in sorted(path for path in RECEIVING.rglob("*") if path.is_file()):
  if file.name.endswith(".partial") or file.name=="native-receive.lock":continue
  add(file,"receiving/"+file.relative_to(RECEIVING).as_posix())
 if retained_checkpoint:add(CHECKPOINTS/retained_checkpoint["manifest"],"receiving/current-complete-case-manifest.json")
 predecessors=CHECKPOINTS/"receiving-predecessors"
 if predecessors.is_dir():
  for file in sorted(path for path in predecessors.iterdir() if path.is_file()):add(file,"receiving/retained-case-predecessors/"+file.name)
 add(ORIGINAL,"originals/"+ORIGINAL.name)
 original_close=BASE/"originals/partial-receipts-original-close(3).tar"
 if original_close.is_file():add(original_close,"originals/"+original_close.name)
 interrupted=DELIVERY_ROOT/"edition-3/SCF_Bank_Complete_Operating_Case.tgz.partial"
 if interrupted.is_file():add(interrupted,"originals/native-59606-complete-prefix.tgz.partial")
 for file in outputs:add(file,"deliveries/"+file.name)
 archive_manifest={"schema":"stellar-forge.merchant-bank-complete-delivery.v1","operation":OPERATION,"attemptId":ATTEMPT_ID,"originalRoot":str(CASE),"workspaceId":WORKSPACE_ID,"revision":state["revision"],"caseFingerprint":case_fingerprint,"sourceFingerprint":source_fingerprint,"caseInventory":inventory,"sourceInventory":manifest,"files":{entry["name"]:{"bytes":entry["bytes"],"sha256":entry["sha256"]} for entry in entries}}
 manifest_path=DELIVERIES/"delivery-manifest.json";json_write(manifest_path,archive_manifest)
 archive=DELIVERIES/"SCF_Bank_Complete_Operating_Case.tgz";partial=archive.with_name(archive.name+".partial")
 if archive.exists():raise RuntimeError("A completed archive belongs to an existing attempt; reconcile it before another capture")
 if partial.exists():os.replace(partial,partial.with_name(partial.name+".interrupted-"+uuid.uuid4().hex))
 with tarfile.open(partial,"w:gz",compresslevel=6) as tf:
  tf.add(manifest_path,arcname="delivery-manifest.json",recursive=False)
  for entry in entries:tf.add(entry["file"],arcname=entry["name"],recursive=False)
 with partial.open("rb") as saved:os.fsync(saved.fileno())
 os.replace(partial,archive);archive.chmod(0o600);sync_parent(archive)
 verify_delivery_archive(archive,{"caseFingerprint":case_fingerprint,"sourceFingerprint":source_fingerprint})
 if signature(case_inventory())!=case_fingerprint:raise RuntimeError("The original case changed during stopped full delivery")
 outputs.insert(0,archive)
 identity={"operation":OPERATION,"attemptId":ATTEMPT_ID,"nativeStatus":native.get("status") if native else attempt["status"],"revision":state["revision"],"caseFingerprint":case_fingerprint,"sourceFingerprint":source_fingerprint,"archiveManifestSha256":digest(manifest_path),"outputs":[{"path":str(path),"bytes":path.stat().st_size,"sha256":digest(path)} for path in outputs]}
 json_write(DELIVERIES/"DELIVERY_IDENTITY.json",identity)
 emit({"phase":"complete_case_preserved",**identity})
 return outputs,native,browser
for directory in (BASE,RECEIVING,BASE/"temporary",CHECKPOINTS/"objects",CHECKPOINTS/"manifests"):directory.mkdir(parents=True,exist_ok=True,mode=0o700)
guard=(RECEIVING/"native-receive.lock").open("a+b")
for directory in (BASE,CHECKPOINTS,CHECKPOINTS/"objects",CHECKPOINTS/"manifests"):
 metadata=directory.lstat()
 if not stat.S_ISDIR(metadata.st_mode) or directory.resolve()!=directory or metadata.st_mode&0o077:raise RuntimeError("Private real original receiving directory required")
try:fcntl.flock(guard.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit("The original bank receiving process already holds its native lease")
programme_digest=hashlib.sha256(PROGRAMME_SOURCE.encode()).hexdigest()
write_new_or_same(RECEIVING/"programmes"/(programme_digest+".py"),PROGRAMME_SOURCE.encode())
os.environ["TMPDIR"]=str(BASE/"temporary")
os.environ["AZCOPY_CONCURRENCY_VALUE"]="1";os.environ["AZCOPY_BUFFER_GB"]="0.125"
node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE","node")
manifest=[];attempt={"operation":OPERATION,"attemptId":ATTEMPT_ID,"outputDirectory":str(DELIVERIES),"startedAt":stamp(),"originalCaseSha256":ORIGINAL_SHA,"originalDirectory":str(CASE),"producerPid":os.getpid(),"producerSha256":programme_digest,"status":"STARTED"}
proc=None;native=None;browser=None;reused=None
try:
 manifest=source_intake();emit({"phase":"current_source_received","files":len(manifest),"originalSource":PACKET["completeCurrentSourceSha256"]})
 for name in ("EXERCISE.mjs","SAVED_CASE_RECEIVE.mjs","BROWSER_RECEIVE.mjs"):
  checked=subprocess.run([node,"--check",str(SOURCE/BANK/name)],capture_output=True,text=True)
  if checked.returncode:raise RuntimeError(name+": "+checked.stderr)
 recover_interrupted_sources();receive_case()
 reused=existing_complete_delivery(manifest)
 if not reused:
  DELIVERIES.mkdir(parents=True,exist_ok=True,mode=0o700)
  previous_path=RECEIVING/"current-attempt.json"
  if previous_path.is_file():
   previous=json.loads(previous_path.read_bytes())
   if previous.get("operation")!=OPERATION:raise RuntimeError("Original previous attempt identity differs")
   write_new_or_same(RECEIVING/"attempt-history"/(previous["attemptId"]+".json"),previous_path.read_bytes())
   attempt["previousAttemptId"]=previous["attemptId"]
  attempt["inputCaseFingerprint"]=signature(case_inventory());attempt["sourceFingerprint"]=signature(manifest)
  json_write(previous_path,attempt)
  if not pathlib.Path(CHROME).is_file():raise RuntimeError("The shared installed Chrome executable needs receiving on this host")
  env=os.environ.copy();env["SCF_BANK_EXISTING"]=str(CASE/"accounting");env["SCF_BANK_KEEP"]="1";env["SCF_BANK_CHROMIUM"]=CHROME;env["NODE_OPTIONS"]="--max-old-space-size=192";env["SCF_BANK_CHECKPOINT_ROOT"]=str(CHECKPOINTS);env["SCF_BANK_RECEIVING_FD"]=str(guard.fileno());env["SCF_BANK_RECEIVING_LOCK"]=str(RECEIVING/"native-receive.lock")
  error_offset=(RECEIVING/"native.stderr.log").stat().st_size if (RECEIVING/"native.stderr.log").exists() else 0
  with (RECEIVING/"native.stdout.log").open("ab",buffering=0) as out,(RECEIVING/"native.stderr.log").open("ab",buffering=0) as err:
   proc=subprocess.Popen([node,str(SOURCE/BANK/"EXERCISE.mjs")],cwd=SOURCE,env=env,stdout=out,stderr=err,start_new_session=True,pass_fds=(guard.fileno(),))
   attempt.update({"nodePid":proc.pid,"sourceFiles":len(manifest),"status":"RUNNING"});json_write(RECEIVING/"native-attempt.json",attempt)
   emit({"phase":"original_saved_case_running","pid":proc.pid,"directory":str(CASE),"sourceFiles":len(manifest),"attemptId":ATTEMPT_ID,"outputDirectory":str(DELIVERIES)})
   code=proc.wait()
  attempt.update({"exitCode":code,"status":"PASS" if code==0 else "FAILED","finishedAt":stamp()})
  if code:
   with (RECEIVING/"native.stderr.log").open("rb") as error_stream:
    error_stream.seek(error_offset);err=error_stream.read().decode("utf8","replace")
   attempt["stderrTail"]=err[-9000:];emit({"phase":"original_saved_case_returned","exitCode":code,"error":err[-3500:]})
except BaseException as error:
 attempt.update({"status":"FAILED","finishedAt":stamp(),"error":{"name":type(error).__name__,"message":str(error),"trace":traceback.format_exc(limit=10)}})
 emit({"phase":"original_saved_case_exception","error":attempt["error"]})
finally:
 if not reused:
  try:quiesce_original_writer(proc,attempt)
  except BaseException as stop_error:
   attempt["stopFailure"]={"name":type(stop_error).__name__,"message":str(stop_error),"pid":proc.pid if proc else None}
   try:json_write(RECEIVING/"native-attempt.json",attempt)
   except OSError as record_error:emit({"phase":"stop_observation_record_error","errno":record_error.errno})
   emit({"phase":"original_writer_stop_unresolved","error":attempt["stopFailure"]})
   raise
  try:outputs,native,browser=capture(manifest,attempt)
  except BaseException as error:
   try:json_write(RECEIVING/"preservation-error.json",{"at":stamp(),"attemptId":ATTEMPT_ID,"error":str(error),"trace":traceback.format_exc(limit=10)})
   except OSError as record_error:emit({"phase":"preservation_error_record_unavailable","errno":record_error.errno})
   emit({"phase":"preservation_error","message":str(error)});raise
  helpers=BASE/"helpers";sys.path.insert(0,str(helpers))
  from library_upload import LibraryUploadWorkflow,HostedAppsClient,LibraryFileMaterializer,SignedUrlUploader
  save_result=DELIVERIES/"SAVE_RESULT.json";save_started=DELIVERIES/"SAVE_STARTED.json"
  if save_result.exists() or save_started.exists():raise RuntimeError("This exact attempt already entered artifact saving; receive its retained result before another upload")
  uploads=[]
  for index,path in enumerate(outputs):
   replace_original=index==0 and native and native.get("status")=="PASS"
   item={"local_path":str(path),"purpose":"replace_library_file" if replace_original else "create_library_file"}
   if replace_original:item.update({"library_file_id":"libfile_5c86733c30188191a0dcbc75920fca5f","version_reason":"Continue the original bank case through its complete browser, accountant export and cold receiving, retaining original source, requests and earlier closes."})
   else:item["library_artifact_type"]="other"
   uploads.append(item)
  json_write(save_started,{"operation":OPERATION,"attemptId":ATTEMPT_ID,"startedAt":stamp(),"uploads":uploads})
  result=LibraryUploadWorkflow(apps_client=HostedAppsClient(),materializer=LibraryFileMaterializer(),uploader=SignedUrlUploader(),state_parent=BASE/"temporary").run({"uploads":uploads})
  json_write(save_result,result)
  rows=result.get("results",[]) if isinstance(result,dict) else []
  safe=[{key:value for key,value in row.items() if key in ("status","library_file_id","file_id","version_id","current_version","local_path","filename","file_name")} for row in rows]
  emit({"phase":"saved_complete_original_operation","attemptId":ATTEMPT_ID,"nativeExitCode":attempt.get("exitCode"),"nativeStatus":native.get("status") if native else attempt["status"],"revision":native.get("originalWorkspace",{}).get("revision") if native else None,"browserPhases":len(browser.get("phases",[])) if browser else 0,"screens":len(browser.get("screenshots",[])) if browser else 0,"downloads":len(browser.get("downloads",[])) if browser else 0,"sourceFiles":len(manifest),"saveResults":safe,"fullResultPath":str(save_result)})
  if len(rows)!=len(outputs) or any(row.get("status")!="succeeded" for row in rows):raise SystemExit(2)
if reused:
 rows=reused["saveResult"].get("results",[])
 emit({"phase":"original_complete_delivery_reconciled","attemptId":reused["attempt"]["attemptId"],"revision":reused["identity"]["revision"],"caseFingerprint":reused["identity"]["caseFingerprint"],"saveResults":[{key:value for key,value in row.items() if key in ("status","library_file_id","file_id","version_id","current_version","local_path","filename","file_name")} for row in rows]})
 raise SystemExit(0)
if not native or native.get("status")!="PASS":raise SystemExit(1)
