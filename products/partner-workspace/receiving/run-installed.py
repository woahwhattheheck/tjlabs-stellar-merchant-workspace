#!/usr/bin/env python3
"""Receive both existing complete source workspaces through their installed product."""
from __future__ import annotations
import argparse,fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,time,uuid,zipfile
os.umask(0o077)
p=argparse.ArgumentParser()
p.add_argument("--packet",required=True);selection_args=p.add_mutually_exclusive_group(required=True)
selection_args.add_argument("--inputs");selection_args.add_argument("--original-root");p.add_argument("--edition",choices=("restored","original"),default="restored")
p.add_argument("--directory",required=True);p.add_argument("--resume",action="store_true")
p.add_argument("--browser",default=os.environ.get("PARTNER_BROWSER_EXECUTABLE"))
a=p.parse_args()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def fail(message):raise ValueError(message)
def original(path):
 p=pathlib.Path(path).absolute()
 if p.resolve()!=p or p.is_symlink() or not p.is_file():fail("Select an ordinary canonical original file: "+str(p))
 return p
def private(path):
 p=pathlib.Path(path).absolute()
 missing=[];parent=p
 while not parent.exists():missing.append(parent);parent=parent.parent
 if parent.resolve()!=parent or not parent.is_dir():fail("Select a canonical ordinary parent")
 for item in reversed(missing):item.mkdir(mode=0o700)
 if p.resolve()!=p or p.stat().st_mode&0o077:fail("Select an owned private directory")
 return p
def save(path,data):
 path=pathlib.Path(path);private(path.parent)
 if path.exists():
  if path.is_symlink() or path.read_bytes()!=data:fail("Retain the exact original file: "+str(path))
  return
 with path.open("xb") as f:f.write(data);f.flush();os.fsync(f.fileno())
 fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def encode(value):return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode()
def check(item,data):
 if len(data)!=item["bytes"] or sha(data)!=item["sha256"]:fail("Original whole file identity changed: "+str(item.get("path","source")))
 if item.get("git_blob") and hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()!=item["git_blob"]:fail("Original Git source identity changed")
def member(base,item):
 name=pathlib.PurePosixPath(item["path"])
 if name.is_absolute() or ".." in name.parts or "\\" in str(name) or not name.parts:fail("Invalid original member path")
 raw=item["content"].encode();check(item,raw);save(base.joinpath(*name.parts),raw)
def streamcopy(source,dest,identity):
 source=pathlib.Path(source).absolute();h=hashlib.sha256();size=0
 if not source.exists() and dest.is_file():
  with dest.open("rb") as retained:
   if dest.is_symlink() or dest.stat().st_size!=identity["bytes"] or hashlib.file_digest(retained,"sha256").hexdigest()!=identity["sha256"]:fail("Retained original input changed")
  return
 source=original(source)
 with source.open("rb") as f:
  for b in iter(lambda:f.read(1024*1024),b""):size+=len(b);h.update(b)
 if size!=identity["bytes"] or h.hexdigest()!=identity["sha256"]:fail("Original selected archive changed")
 if dest.exists():
  with dest.open("rb") as f:
   if dest.is_symlink() or dest.stat().st_size!=size or hashlib.file_digest(f,"sha256").hexdigest()!=identity["sha256"]:fail("Retained original input changed")
  return
 private(dest.parent);tmp=dest.with_name(dest.name+"."+uuid.uuid4().hex+".tmp")
 copied=hashlib.sha256();copied_bytes=0
 try:
  with source.open("rb") as src,tmp.open("xb") as dst:
   for block in iter(lambda:src.read(1024*1024),b""):dst.write(block);copied.update(block);copied_bytes+=len(block)
   dst.flush();os.fsync(dst.fileno())
  if copied_bytes!=identity["bytes"] or copied.hexdigest()!=identity["sha256"]:fail("The actual streamed original archive changed")
  os.replace(tmp,dest)
  parent_fd=os.open(dest.parent,os.O_RDONLY)
  try:os.fsync(parent_fd)
  finally:os.close(parent_fd)
 finally:
  if tmp.exists():tmp.unlink()
root=private(a.directory)
lock=os.open(root/"installed-receiving.lock",os.O_RDWR|os.O_CREAT,0o600)
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
packet_path=original(a.packet);packet_raw=packet_path.read_bytes();packet=json.loads(packet_raw)
if packet["schema"]!="stellar-forge.partner-installed-receiving-source.v1":fail("Wrong full source packet")
case=root/"case"
if case.exists() and any(case.iterdir()) and not a.resume:
 print(json.dumps({"existing_native_case":str(case),"result":str(case/"RESULT.json"),"action":"Receive existing output or use --resume for the exact retained inputs."}),flush=True);sys.exit(2)
save(root/"SOURCE_INPUT.json",packet_raw)
repo=private(root/"repo")
for item in packet["files"]+packet["native_support"]+[packet["native_program"]]:member(repo,item)
selection={"inputs":str(pathlib.Path(a.inputs).absolute()) if a.inputs else None,"original_root":str(pathlib.Path(a.original_root).absolute()) if a.original_root else None,"edition":a.edition}
save(root/"INPUT_SELECTION.json",encode(selection))
if (root/"ORIGINAL_INPUT.json").is_file():
 input_raw=(root/"ORIGINAL_INPUT.json").read_bytes()
 if a.inputs and pathlib.Path(a.inputs).exists() and original(a.inputs).read_bytes()!=input_raw:fail("The surviving selected input JSON changed")
else:
 if a.original_root:
  selected_output=private(root/"selected-inputs")
  subprocess.run([sys.executable,"-B",str(repo/"products/partner-workspace/receiving/select-original.py"),"--original-root",selection["original_root"],"--out",str(selected_output),"--edition",a.edition],check=True)
  input_path=selected_output/"Original_Installed_Inputs.json"
 else:input_path=original(a.inputs)
 input_raw=input_path.read_bytes()
selected=json.loads(input_raw)
if selected["schema"]!="stellar-forge.partner-installed-receiving-input.v1" or set(selected["products"])!={"mobility","education"}:fail("Select both complete original product archives")
if selected["operation_id"]!=packet["operation_id"]:fail("Keep this exact original installation operation")
save(root/"ORIGINAL_INPUT.json",input_raw)
materialized={"schema":selected["schema"],"operation_id":selected["operation_id"],"products":{}}
for product,value in selected["products"].items():
 if value["product"]!=product or not value["original_operation"]:fail("Keep each original business operation and product")
 destination=private(root/"inputs"/product/"application");saved_manifest=destination.parent/"Product_Source.json"
 manifest_path=pathlib.Path(value["source_manifest"]["path"]).absolute()
 if manifest_path.exists():manifest_raw=original(manifest_path).read_bytes()
 elif saved_manifest.is_file():manifest_raw=original(saved_manifest).read_bytes()
 else:fail("Receive the complete original selected source manifest")
 check(value["source_manifest"],manifest_raw);manifest=json.loads(manifest_raw)
 if manifest["schema"]!="stellar-forge.partner-product-source.v1" or manifest["product"]!=product:fail("Select the corresponding original source manifest")
 source=pathlib.Path(value["source_root"]).absolute()
 if source.exists() and (source.resolve()!=source or not source.is_dir()):fail("Select the original complete source root")
 for item in manifest["files"]:
  path=pathlib.PurePosixPath(item["path"])
  if path.is_absolute() or ".." in path.parts or "\\" in str(path):fail("Invalid source member")
  donor=source.joinpath(*path.parts);retained=destination.joinpath(*path.parts)
  input_member=original(donor if donor.exists() else retained);body=input_member.read_bytes();check(item,body);save(retained,body)
 save(saved_manifest,manifest_raw)
 archive=value["original_archive"];saved_archive=destination.parent/"Original_Workspace.zip"
 streamcopy(archive["path"],saved_archive,archive)
 with zipfile.ZipFile(saved_archive) as z:
  if z.testzip():fail("Original workspace archive CRC failed")
  manifest_archive=json.loads(z.read("MANIFEST.json"))
  if manifest_archive["schema"]!="partner-delivery-archive.v1" or manifest_archive["workspace"]["id"]!=archive["workspace_id"] or manifest_archive["workspace"]["product"]!=product:fail("Original source archive binding changed")
 materialized["products"][product]={"product":product,"original_operation":value["original_operation"],"source_root":str(destination),"source_manifest":str(saved_manifest),"original_archive":{**archive,"path":str(saved_archive)}}
save(root/"RECEIVING_INPUT.json",encode(materialized))
node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
if not node:fail("Select the existing Node runtime")
browser=original(a.browser) if a.browser else None
if not browser or not os.access(browser,os.X_OK):fail("Select the existing permitted Chromium executable using --browser")
for item in packet["files"]+[packet["native_program"]]:
 if item["path"].endswith(".py"):compile(item["content"],item["path"],"exec")
 elif item["path"].endswith(".mjs"):
  result=subprocess.run([node,"--check",str(repo/item["path"])],capture_output=True)
  if result.returncode:fail(result.stderr.decode())
private(case);attempt=private(root/"attempts"/uuid.uuid4().hex);log=attempt/"native.log"
if (case/"RESULT.json").is_file():save(attempt/"PRIOR_RESULT.json",(case/"RESULT.json").read_bytes())
if lock!=3:os.dup2(lock,3);os.close(lock)
os.set_inheritable(3,True)
env=dict(os.environ);env["PARTNER_RECEIVING_ATTEMPT"]=attempt.name;env["PARTNER_BROWSER_EXECUTABLE"]=str(browser);env["TMPDIR"]=str(private(root/"tmp"))
command=[node,"--max-old-space-size=256",str(repo/packet["native_program"]["path"]),str(repo),str(case),str(pathlib.Path(sys.executable).resolve()),str(root/"RECEIVING_INPUT.json")]
with log.open("xb") as output:
 child=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,pass_fds=(3,))
 save(attempt/"LAUNCH.json",encode({"operation_id":selected["operation_id"],"pid":child.pid,"started_at":time.time(),"command":command,"source_sha256":sha(packet_raw),"original_input_sha256":sha(input_raw)}))
 print(json.dumps({"native_started":child.pid,"attempt":str(attempt),"operation_id":selected["operation_id"]}),flush=True)
 for line in child.stdout:
  output.write(line);output.flush();os.fsync(output.fileno());sys.stdout.buffer.write(line);sys.stdout.buffer.flush()
 status=child.wait()
result=json.loads((case/"RESULT.json").read_text()) if (case/"RESULT.json").is_file() else {"complete":False,"error":{"message":"Original native child ended before its result"}}
if result.get("attempt_id")!=attempt.name:result={"complete":False,"error":{"message":"Current native attempt ended before receiving its own result"},"prior_result":str(attempt/"PRIOR_RESULT.json") if (attempt/"PRIOR_RESULT.json").exists() else None}
complete=status==0 and result.get("complete") is True
if status==0 and not complete:status=1
archive=attempt/"Partner_Installed_Complete_Delivery.zip";rows=[]
with zipfile.ZipFile(archive,"x",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for base in (repo,root/"inputs",case):
  for path in sorted(base.rglob("*")):
   if path.is_symlink():fail("Unexpected delivery symlink")
   if not path.is_file():continue
   name=str(path.relative_to(root));info=path.stat();h=hashlib.sha256()
   with path.open("rb") as src,z.open(name,"w",force_zip64=True) as dst:
    for block in iter(lambda:src.read(1024*1024),b""):h.update(block);dst.write(block)
   after=path.stat()
   if (info.st_size,info.st_mtime_ns,info.st_ino)!=(after.st_size,after.st_mtime_ns,after.st_ino):fail("Original delivery file changed while being retained")
   rows.append({"path":name,"bytes":info.st_size,"sha256":h.hexdigest()})
 for path in (root/"SOURCE_INPUT.json",root/"INPUT_SELECTION.json",root/"ORIGINAL_INPUT.json",root/"RECEIVING_INPUT.json",attempt/"LAUNCH.json",log):
  raw=path.read_bytes();name=str(path.relative_to(root));z.writestr(name,raw);rows.append({"path":name,"bytes":len(raw),"sha256":sha(raw)})
 z.writestr("FILES.json",encode({"schema":"stellar-forge.partner-installed-complete-delivery.v1","operation_id":selected["operation_id"],"files":rows}))
with archive.open("rb") as stream:os.fsync(stream.fileno());archive_sha=hashlib.file_digest(stream,"sha256").hexdigest()
with zipfile.ZipFile(archive) as z:
 if z.testzip():fail("Complete installed output CRC failed")
identity={"operation_id":selected["operation_id"],"complete":complete,"exit_code":status,"archive":str(archive),"bytes":archive.stat().st_size,"sha256":archive_sha,"members":len(rows)+1,"result":str(case/"RESULT.json"),"error":result.get("error")}
save(attempt/"FULL_DELIVERY.json",encode(identity))
print(json.dumps(identity),flush=True)
sys.exit(status)
