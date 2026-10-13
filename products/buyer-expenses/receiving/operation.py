import os,pathlib,json,subprocess,datetime,hashlib,tempfile,shutil,sys,zipfile,traceback,gzip,signal,time
os.umask(0o077)
def interrupt_original_operation(signum,frame):
 raise InterruptedError("Original financial receiving interrupted by signal "+str(signum))
signal.signal(signal.SIGTERM,interrupt_original_operation)
root=pathlib.Path(tempfile.mkdtemp(prefix="buyer-finance-6200-",dir=_original_source["temporary_directory"]))
tmp=root/"tmp";tmp.mkdir(mode=0o700);os.environ["TMPDIR"]=str(tmp);tempfile.tempdir=str(tmp)
os.environ["AZCOPY_CONCURRENCY_VALUE"]="1";os.environ["PYTHONDONTWRITEBYTECODE"]="1"
source="9e1dad6b3d1a444170c249b18cde76da1aca8ce9"
operation={"schema":"stellar-forge.buyer-finance-selected-native.v1","operation":"BUYER-FINANCE-STANDALONE-6200-20261012","sourceCommit":source,"originalPublishedMerge":"b86b7da8a72aed4ebd9f38aef7c2c37129940410","sourceRefinement":"9e1dad6b3d1a444170c249b18cde76da1aca8ce9","originalCase":"governed-buyer-expense-receiving-f232-20261012","directory":str(root),"pid":os.getpid(),"startedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"phases":[],"artifacts":[]}
def save():
 p=root/"native-operation.json"
 with p.open("w") as f:json.dump(operation,f,indent=2);f.write("\n");f.flush();os.fsync(f.fileno())
def show(value):print(json.dumps(value),flush=True)
def digest(path):
 h=hashlib.sha256()
 with pathlib.Path(path).open("rb") as f:
  while chunk:=f.read(65536):h.update(chunk)
 return h.hexdigest()
def stop_owned_group(process):
 record={"pid":process.pid,"processGroup":process.pid,"signals":[]}
 operation["active"]["ownedChildCleanup"]=record
 try:
  os.killpg(process.pid,signal.SIGTERM);record["signals"].append("SIGTERM")
 except ProcessLookupError:record["groupAlreadyExited"]=True
 try:
  process.wait(timeout=8)
 except subprocess.TimeoutExpired:
  try:
   os.killpg(process.pid,signal.SIGKILL);record["signals"].append("SIGKILL")
  except ProcessLookupError:pass
  process.wait(timeout=8)
 # End descendants that outlived their group leader before taking any archive.
 try:
  os.killpg(process.pid,signal.SIGKILL);record["signals"].append("SIGKILL_REMAINING_GROUP")
 except ProcessLookupError:pass
 record["exit"]=process.wait(timeout=8);record["leaderReaped"]=True
 deadline=time.monotonic()+8
 while True:
  try:os.killpg(process.pid,0)
  except ProcessLookupError:break
  if time.monotonic()>=deadline:raise RuntimeError("Original owned child group has not ended: "+str(process.pid))
  time.sleep(0.05)
 record["groupExited"]=True
 return record
def run(label,args,cwd=None):
 operation["phase"]=label;save();show({"phase":label,"directory":str(root),"sourceCommit":source})
 stdout=root/(label+".stdout.json");stderr=root/(label+".stderr.log")
 process=None
 try:
  with stdout.open("wb") as out,stderr.open("ab") as err:
   process=subprocess.Popen(args,cwd=cwd,stdout=out,stderr=err,start_new_session=True)
   operation["active"]={"label":label,"pid":process.pid,"processGroup":process.pid,"argv":args};save()
   code=process.wait()
  if code:
   show({"phase":label,"exit":code,"stdout":stdout.name,"stderr":stderr.name,"error":stderr.read_text(errors="replace")[-6500:]})
   raise RuntimeError(label+" exited "+str(code))
  operation["active"]=None
  result={"phase":label,"exit":code,"stdout":stdout.name,"stderr":stderr.name}
  operation["phases"].append(result);save()
  return stdout
 except BaseException as error:
  if process is not None:
   active={"label":label,"pid":process.pid,"processGroup":process.pid,"argv":args}
   operation["active"]=active
   try:
    cleanup=stop_owned_group(process)
    operation["active"]=None
    operation["phases"].append({"phase":label,"exit":process.returncode,"stdout":stdout.name,"stderr":stderr.name,
      "interrupted":True,"error":{"type":type(error).__name__,"message":str(error)},"ownedChildCleanup":cleanup})
    show({"phase":"owned-child-stopped","label":label,**cleanup})
   except BaseException as cleanup_error:
    active["cleanupError"]={"type":type(cleanup_error).__name__,"message":str(cleanup_error)}
    show({"phase":"owned-child-stop-incomplete","active":active})
   try:save()
   except BaseException as journal_error:
    show({"phase":"owned-child-result-journal-error","error":{"type":type(journal_error).__name__,"message":str(journal_error)}})
  raise
def preserve(path,label):
 path=pathlib.Path(path)
 info={"label":label,"file":str(path),"bytes":path.stat().st_size,"sha256":digest(path)}
 if _original_source.get("archive_directory"):
  destination=pathlib.Path(_original_source["archive_directory"])
  target=destination/(path.stem+"-"+info["sha256"][:16]+path.suffix)
  if target.exists():
   if not target.is_file() or target.is_symlink() or digest(target)!=info["sha256"]:raise RuntimeError("Existing receiving archive differs")
  else:
   descriptor,temporary=tempfile.mkstemp(prefix=".receiving-",dir=destination)
   try:
    with os.fdopen(descriptor,"wb") as output,path.open("rb") as source_file:
     shutil.copyfileobj(source_file,output,length=65536);output.flush();os.fsync(output.fileno())
    try:os.link(temporary,target)
    except FileExistsError:
     if not target.is_file() or target.is_symlink() or digest(target)!=info["sha256"]:raise RuntimeError("Concurrent receiving archive differs")
    directory_fd=os.open(destination,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(directory_fd)
    finally:os.close(directory_fd)
   finally:
    pathlib.Path(temporary).unlink(missing_ok=True)
  if digest(target)!=info["sha256"]:raise RuntimeError("Retained receiving archive changed")
  result={"results":[{"status":"succeeded","path":str(target),"bytes":target.stat().st_size,"sha256":info["sha256"]}]}
 else:
  result=uploader.run({"uploads":[{"local_path":str(path),"purpose":"create_library_file","library_artifact_type":"other"}]})
 info["retention"]=result;operation["artifacts"].append(info);save();show({"phase":"artifact-retained",**info})
 if not all(item.get("status")=="succeeded" for item in result.get("results",[])) or not result.get("results"):
  raise RuntimeError("Original artifact retention incomplete: "+label)
 return info
save();show({"phase":"accepted-original-financial-operation",**operation})
uploader=None
if _original_source.get("library_helpers"):
 sys.path.insert(0,_original_source["library_helpers"])
 from library_upload import LibraryUploadWorkflow,SignedUrlUploader
 from library_hosted_apps import HostedAppsClient
 from library_file_transfer import LibraryFileMaterializer
 uploader=LibraryUploadWorkflow(apps_client=HostedAppsClient(),materializer=LibraryFileMaterializer(),uploader=SignedUrlUploader(),state_parent=tmp)
outcome=1
try:
 outer=pathlib.Path(_original_source["original_receiving"])
 if digest(outer)!="31f88f9daa0d4f4d65bc23b463dbd3e90c7c80182f19cd7c41e1722b8731b880":raise RuntimeError("Original complete receiving input changed")
 original=pathlib.Path(_original_source["original_project"])
 original_sha="46329775e2298e49fbf9deb1dc6300f63db798f10e252ac3e727ab4e0f815c7b"
 if digest(original)!=original_sha:raise RuntimeError("Original project bytes changed")
 shutil.copyfile(original,root/"original-complete-buyer-expense-project.zip")
 with zipfile.ZipFile(outer) as z:original_case=json.loads(z.read("case/operation.json"))
 shutil.copyfile(_original_source["receiving_driver"],root/"receive.mjs")
 expected=json.loads("[{\"path\":\"stellar/scf-starforge-20261009/distribution/build.mjs\",\"sha\":\"4e8bff0196a1ec00cdc0b26d3b3b82cd5742f4d0\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/git-source.mjs\",\"sha\":\"3d2a0c9f34d27cce9b6ef64e39cf130dc620f8d7\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/build-state.mjs\",\"sha\":\"eb9543e9ad3e594e4c343bb15375918a42149a9a\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/runtime-profile.mjs\",\"sha\":\"dd2ecfa155a5806dec9feed4f4d9a5bd15005d95\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs\",\"sha\":\"e9079549ce8644041c62779dec6109752a4b3251\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/runtime-install.mjs\",\"sha\":\"6d9374932166d7c597fb55148912be193116fa7b\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/browser-assets.mjs\",\"sha\":\"63801fa838c0479e6ae156d9f155461f02df0cfb\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/product-package.mjs\",\"sha\":\"2c668933f214f201137ac6d3c6b7410525955c9b\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/source-selection.mjs\",\"sha\":\"206723af33889fdd8efcc77eb6e67f9de0a57845\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/specification.mjs\",\"sha\":\"a9c57222ca9514be0e03d542063cce0eadcf3f16\"},{\"path\":\"stellar/scf-starforge-20261009/distribution/runtime-unpack.py\",\"sha\":\"6981dc29e20a6795c9b656d8956b0976d2434ffc\"}]")
 for item in expected:
  captured=next((x for x in _original_source["incoming"] if x["sha"]==item["sha"]),None)
  if captured is None:raise RuntimeError("Original bootstrap source is absent: "+item["path"])
  data=captured["content"].encode("utf-8")
  oid=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
  if oid!=item["sha"]:raise RuntimeError("Original bootstrap source changed: "+item["path"])
  target=root/"bootstrap"/item["path"];target.parent.mkdir(parents=True,exist_ok=True,mode=0o700);target.write_bytes(data)
 toolkit=root/"bootstrap/stellar/scf-starforge-20261009/distribution"
 metadata=_original_source["metadata"]
 candidates=_original_source["commit_candidates"]
 matched=[text for text in candidates if hashlib.sha1(b"commit "+str(len(text.encode("utf-8"))).encode()+b"\0"+text.encode("utf-8")).hexdigest()==source]
 if len(matched)!=1:raise RuntimeError("Exact original commit body did not match retained GitData")
 metadata["commitText"]=matched[0]
 with gzip.open(root/"source-metadata.json.gz","wt",encoding="utf-8") as f:json.dump(metadata,f,separators=(",",":"),ensure_ascii=False)
 receiver_source=_original_source["receiver_source"].encode("utf-8")
 if hashlib.sha1(b"blob "+str(len(receiver_source)).encode()+b"\0"+receiver_source).hexdigest()!="6fe4119a46e89c2a5831abe9a5c5726f4dc5668a":raise RuntimeError("Original Git object receiver changed")
 (toolkit/"git-object-receiving.py").write_bytes(receiver_source)
 incoming=root/"original-blobs";incoming.mkdir(mode=0o700)
 for item in _original_source["incoming"]:
  data=item["content"].encode("utf-8")
  if hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()!=item["sha"]:raise RuntimeError("Captured original blob changed: "+item["path"])
  (incoming/(item["sha"]+".blob")).write_bytes(data)
 # All original source is now verified in the native receiver input files.
 # Release the retained JSON bodies before the source/build/install children.
 for name in ("incoming","metadata","commit_candidates","receiver_source"):
  _original_source.pop(name,None)
 del metadata,candidates,matched,captured,item,data,receiver_source
 object_directory=root/"source-receiving"
 arguments=[sys.executable,str(toolkit/"git-object-receiving.py"),"--metadata",str(root/"source-metadata.json.gz"),"--commit",source,"--directory",str(object_directory),"--incoming",str(incoming)]
 for donor in _original_source.get("donor_repositories",[]):
  arguments.extend(["--donor-repository",str(donor)])
 for donor in _original_source.get("donor_sources",[]):
  arguments.extend(["--donor-source",str(donor)])
 for donor_sha,donor_path in _original_source.get("donor_archives",[]):
  arguments.extend(["--donor-archive",donor_sha,str(donor_path)])
 for directory in _original_source.get("incoming_directories",[]):
  arguments.extend(["--incoming",str(directory)])
 for path in _original_source.get("additional_paths",[]):
  arguments.extend(["--additional-path",path])
 run("source-object-receiving",arguments)
 source_receipt=json.loads((object_directory/"source-receiving.json").read_text())
 if source_receipt.get("phase")!="OBJECTS_AVAILABLE" or source_receipt.get("missingObjects")!=0:raise RuntimeError("Original source receiving is incomplete")
 operation["sourceReceiving"]=source_receipt;save()
 repo=object_directory/"repository.git"
 build_script="""import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const [modulePath,repository,ref,output,issueFile]=process.argv.slice(2);
try {
 const {buildDistribution}=await import(pathToFileURL(modulePath));
 const result=await buildDistribution({repository,ref,output,selection:'buyer-expenses',offline:true});
 console.log(JSON.stringify(result));
} catch(error) {
 const issue={code:error.code??error.name,message:error.message,missingObjects:error.missingObjects??[],sourceCommit:error.sourceCommit??ref};
 await writeFile(issueFile,JSON.stringify(issue)+'\\n',{mode:0o600});
 console.error(JSON.stringify(issue));process.exitCode=1;
}
"""
 (root/"build-selected.mjs").write_text(build_script,encoding="utf-8")
 run("original-selected-build",["node",str(root/"build-selected.mjs"),str(toolkit/"build.mjs"),str(repo),source,str(root/"release"),str(root/"build-source-issue.json")])
 build=json.loads((root/"original-selected-build.stdout.json").read_text())
 if build["sourceCommit"]!=source or build.get("sourceSelection",{}).get("id")!="buyer-expenses":raise RuntimeError("Completed build selection changed")
 archive=pathlib.Path(build["archive"])
 if not archive.is_absolute():archive=(root/"release"/archive).resolve()
 if not archive.is_relative_to(root/"release"):raise RuntimeError("Built archive left selected output")
 archive_sha=digest(archive)
 if archive_sha!=build["sha256"]:raise RuntimeError("Original built archive hash changed")
 operation["build"]=build;save();preserve(archive,"selected-product")
 runtime=root/"runtime"
 run("runtime-prepare",["node",str(toolkit/"runtime-install-cli.mjs"),"prepare","--dir",str(runtime),"--archive",str(archive),"--sha256",archive_sha,"--native","--feature","schema","--feature","mcp","--operator"])
 prepared=json.loads((root/"runtime-prepare.stdout.json").read_text());operation["installation"]=prepared;save()
 run("runtime-install",["node",str(toolkit/"runtime-install-cli.mjs"),"install","--dir",str(runtime),"--cache",_original_source.get("npm_cache",str(root/"npm-cache"))]+(["--offline"] if _original_source.get("npm_offline") else [])+(["--node-headers",_original_source["node_headers"]] if _original_source.get("node_headers") else []))
 run("runtime-inspect",["node",str(toolkit/"runtime-install-cli.mjs"),"inspect","--dir",str(runtime),"--load","--source"])
 inspected=json.loads((root/"runtime-inspect.stdout.json").read_text())
 if inspected.get("status")!="READY" or not inspected.get("ready") or inspected.get("sourceCommit")!=source or not inspected.get("sourceVerified"):raise RuntimeError("Original runtime inspection did not return selected READY source")
 operation["runtime"]=inspected;save()
 run("installed-source",["node",str(toolkit/"runtime-install-cli.mjs"),"run","--dir",str(runtime),"--","source"])
 run("installed-registrations",["node",str(toolkit/"runtime-install-cli.mjs"),"run","--dir",str(runtime),"--","registrations","--source","buyer-expenses"])
 receiver={"operation":operation["operation"],"sourceCommit":source,"sourceRoot":inspected["sourceRoot"],"directory":str(root/"case"),"originalProject":str(root/"original-complete-buyer-expense-project.zip"),"originalProjectSha256":original_sha,"originalCase":original_case}
 (root/"receiving-input.json").write_text(json.dumps(receiver,indent=2)+"\n",encoding="utf-8")
 run("original-financial-receiving",["node",str(root/"receive.mjs"),str(root/"receiving-input.json")])
 native=json.loads((root/"case/operation.json").read_text())
 if native.get("outcome")!="PASS":raise RuntimeError("Original financial receiving did not complete")
 operation["receiving"]={k:native[k] for k in ["outcome","workspaceId","revision","successfulRequests","accountantReturns","finalProject"]}
 operation["outcome"]="PASS";operation["completedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat();save();outcome=0
except BaseException as error:
 operation["outcome"]="FAILED";operation["error"]={"type":type(error).__name__,"message":str(error)};operation["failedAt"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
 missing=root/"source-receiving/missing-objects.json"
 if missing.is_file():
  captured=json.loads(missing.read_text())
  if captured.get("objects"):
   operation["outcome"]="SOURCE_NEEDED";operation["sourceMissing"]=captured
   show({"phase":"original-source-needed",**captured})
 issue=root/"build-source-issue.json"
 if issue.is_file():operation["buildSourceIssue"]=json.loads(issue.read_text())
 save();show({"phase":"original-operation-ended","outcome":operation["outcome"],"error":operation["error"]})
finally:
 try:
  if operation.get("active") is not None:raise RuntimeError("Reconcile the original owned child before packaging its changing files")
  object_directory=root/"source-receiving"
  if object_directory.is_dir():
   with zipfile.ZipFile(root/"retained-original-source-cache.zip","x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as cachezip:
    for p in sorted(object_directory.rglob("*")):
     if p.is_file() and not p.is_symlink():cachezip.write(p,p.relative_to(root),compress_type=zipfile.ZIP_STORED if "/objects/" in str(p) else zipfile.ZIP_DEFLATED)
  checkpoint=root/"BUYER_FINANCE_Selected_Receiving_9e1dad6b_20261012.zip"
  selections=[]
  for p in root.iterdir():
   if p.is_file() and p!=checkpoint:selections.append(p)
  for relative in ["release/distribution.json","runtime/RUNBOOK.md","runtime/runtime-profile.json","runtime/runtime-install.json","runtime/install-state.json","runtime/package.json","runtime/package-lock.json"]:
   p=root/relative
   if p.is_file():selections.append(p)
  case_directory=root/"case"
  if case_directory.is_dir():
   for p in sorted(case_directory.rglob("*")):
    if p.is_symlink():raise RuntimeError("Unexpected linked file in original receiving output")
    if p.is_file():selections.append(p)
  with zipfile.ZipFile(checkpoint,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for p in sorted(set(selections)):z.write(p,p.relative_to(root),compress_type=zipfile.ZIP_STORED if p.suffix in [".zip",".tgz"] else zipfile.ZIP_DEFLATED)
  preserve(checkpoint,"complete-native-operation")
 except BaseException as error:
  operation["preservationError"]={"type":type(error).__name__,"message":str(error)};outcome=1
  if operation.get("outcome")=="PASS":operation["receivingOutcome"]="PASS";operation["outcome"]="RETENTION_NEEDED"
  save();show({"phase":"retained-native-preservation-error","error":operation["preservationError"]})
 show({"phase":"terminal-original-financial-operation","operation":operation})
raise SystemExit(outcome)
