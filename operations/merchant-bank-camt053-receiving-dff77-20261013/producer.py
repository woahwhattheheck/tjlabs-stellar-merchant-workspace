import os,sys,json,pathlib,base64,zlib,hashlib,tempfile,subprocess,zipfile,io,shutil,xml.etree.ElementTree as ET,decimal,traceback,urllib.request
from datetime import datetime,timezone
decimal.getcontext().prec=80
temp_parent=pathlib.Path(cfg.get("temporaryDirectory")or("/dev"if os.path.isdir("/dev")and os.access("/dev",os.W_OK)else tempfile.gettempdir()))
root=pathlib.Path(tempfile.mkdtemp(prefix="dff77-camt053-source-",dir=temp_parent))
out={"schema":"stellar-forge.camt053.native-receiving-capture.v1","operation":"SCF-BANK-CAMT053-SOURCE-DFF77-20261013","root":str(root),"startedAt":datetime.now(timezone.utc).isoformat(),"sourceBundle":cfg["sourceBundleIdentity"]}
print(json.dumps({"event":"CAMT_SOURCE_RECEIVING_START","root":str(root)}),flush=True)
def sha(data):return hashlib.sha256(data).hexdigest()
def txt(parent,path):
 node=parent.find(path,ns)
 return (node.text or "").strip() if node is not None else ""
def canonical(value):
 value=decimal.Decimal(value)
 if value==0:return "0"
 s=format(value,"f")
 return s.rstrip("0").rstrip(".") if "." in s else s
def expected(data,profile=None):
 global ns
 tree=ET.fromstring(data);namespace=tree.tag[1:].split("}")[0]if tree.tag.startswith("{")else"";ns={"c":namespace}
 profile=profile or{}
 if not namespace:
  assert profile.get("namespaceMode")=="UNQUALIFIED"and profile.get("messageVersion")=="camt.053.001.08","Retain the explicit unqualified original interpretation"
 result={"messageVersion":namespace.split(":")[-1]if namespace else profile["messageVersion"],"statements":[]}
 for stmt in tree.findall("c:BkToCstmrStmt/c:Stmt",ns):
  record={"id":txt(stmt,"c:Id"),"hasPeriod":stmt.find("c:FrToDt",ns)is not None,"entries":[],"bookedTotals":[]};totals={}
  for entry in stmt.findall("c:Ntry",ns):
   amount_node=entry.find("c:Amt",ns);amount_text=(amount_node.text or "").strip();direction=txt(entry,"c:CdtDbtInd")
   amount=canonical(("-" if direction=="DBIT" else "")+amount_text)
   status=txt(entry,"c:Sts/c:Cd") or txt(entry,"c:Sts")
   reversal_text=txt(entry,"c:RvslInd")
   currency=amount_node.attrib.get("Ccy","")
   record["entries"].append({"amount":amount,"currency":currency,"direction":direction,"status":status,"reversal":None if not reversal_text else reversal_text in ("true","1"),"entryReference":txt(entry,"c:NtryRef"),"accountServicerReference":txt(entry,"c:AcctSvcrRef"),"detailCount":len(entry.findall("c:NtryDtls/c:TxDtls",ns)),"bookingDate":(txt(entry,"c:BookgDt/c:Dt") or txt(entry,"c:BookgDt/c:DtTm"))[:10]})
   if status=="BOOK":totals[currency]=totals.get(currency,decimal.Decimal(0))+decimal.Decimal(amount)
  record["bookedTotals"]=[{"currency":currency,"net":canonical(total)}for currency,total in totals.items()]
  result["statements"].append(record)
 return result
def original_expected(data,profile=None):
 try:return expected(data,profile)
 except ET.ParseError:
  if sha(data)in cfg.get("expectedOriginalRejections",{}):return None
  raise
try:
 (root/"reports").mkdir();(root/"originals").mkdir();(root/"issued-zips").mkdir()
 for item in cfg["files"]:
  data=item["content"].encode("utf-8")
  assert len(data)==item["bytes"]and sha(data)==item["sha256"]
  assert hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()==item["git_blob_sha1"]
  (root/pathlib.PurePosixPath(item["path"]).name).write_bytes(data)
 (root/"receive-originals.mjs").write_text(cfg["nodeProgram"],encoding="utf-8")
 inputs=[]
 for item in cfg["examples"]:
  data=item["content"].encode("utf-8");path="originals/"+item["name"];(root/path).write_bytes(data)
  inputs.append({"name":item["name"],"label":item["name"].replace(".xml",""),"local":path,"sourceKind":"MAINTAINED_DONOR_EXAMPLE","accountNamespace":"MAINTAINED-SYNTHETIC-EXAMPLES","expected":expected(data)})
 manifest=cfg["retrieval"];out["retrieval"]=manifest;out["edition"]=cfg.get("edition");out["previousReceiver"]=cfg.get("previousReceiver")
 for item in manifest["files"]:
  archive_source=next(source for source in cfg["issuedArchives"] if source["sha256"]==item["sha256"])
  archive=base64.b64decode(archive_source["content_base64"],validate=True)
  assert len(archive)==item["bytes"]and sha(archive)==item["sha256"],item["label"]
  (root/"issued-zips"/pathlib.Path(item["path"]).name).write_bytes(archive)
  with zipfile.ZipFile(io.BytesIO(archive))as zf:
   members=[zi for zi in zf.infolist()if not zi.is_dir()]
   assert len(members)==1,item["label"]
   member=members[0];data=zf.read(member)
   original_name=pathlib.PurePosixPath(member.filename).name
   path="originals/"+item["label"]+".xml";(root/path).write_bytes(data)
   inputs.append({"name":original_name,"label":"nordea-"+item["label"],"local":path,"sourceKind":"NORDEA_BANK_ISSUED_EXAMPLE","archive":item,"originalMember":member.filename,"bytes":len(data),"sha256":sha(data),"expected":original_expected(data)})
 for item in cfg.get("publishedSources",[]):
  data=item["content"].encode("utf-8");identity=item["identity"]
  assert len(data)==identity["bytes"]and sha(data)==identity["sha256"],item["name"]
  assert hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()==identity["git_blob_sha1"],item["name"]
  path="originals/"+item["name"];(root/path).write_bytes(data)
  inputs.append({"name":item["name"],"label":item["name"].removesuffix(".xml"),"local":path,
   "sourceKind":"GS_ISSUER_PUBLISHED_EXAMPLE","accountNamespace":"GS-ISSUER-PUBLISHED-EXAMPLES",
   "provenance":item["provenance"],"bytes":len(data),"sha256":sha(data),"expected":original_expected(data)})
 (root/"PUBLISHED_SOURCE_CAPTURE.json").write_text(json.dumps(cfg.get("publishedSourceCapture",{}),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 (root/"SAMPLE_OPERATOR_REVIEW.json").write_text(json.dumps(cfg.get("applicationCloseReviews",{}),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 delivery=cfg["bundesbankOriginals"]
 assert delivery["schema"]=="stellar-forge.bank-issued-originals.v1"and len(delivery["archives"])==2 and len(delivery["files"])==22
 retained_members={};out["bundesbankOriginals"]={"archives":[],"files":[]}
 for archive in delivery["archives"]:
  data=base64.b64decode(archive["dataBase64"],validate=True)
  assert len(data)==archive["bytes"]and sha(data)==archive["sha256"],archive["name"]
  name=pathlib.PurePosixPath(archive["name"])
  assert len(name.parts)==1 and name.name not in(".","..")
  (root/"issued-zips"/name.name).write_bytes(data)
  metadata={key:archive[key]for key in("name","bytes","sha256","url")}
  metadata["members"]=archive["members"];out["bundesbankOriginals"]["archives"].append(metadata)
  with zipfile.ZipFile(io.BytesIO(data))as zf:
   actual=zf.infolist();expected_members={item["name"]:item for item in archive["members"]}
   assert len(actual)==len(expected_members)and set(item.filename for item in actual)==set(expected_members),"Original complete member inventory"
   for member in actual:
    original=zf.read(member);identity=expected_members[member.filename]
    assert len(original)==identity["bytes"]and sha(original)==identity["sha256"]and member.CRC==identity["crc32"],member.filename
    if not member.is_dir():retained_members[(archive["name"],member.filename)]=original
 for index,item in enumerate(delivery["files"]):
  data=base64.b64decode(item["dataBase64"],validate=True)
  assert len(data)==item["bytes"]and sha(data)==item["sha256"],item["name"]
  assert data==retained_members[(item["archive"],item["archiveMember"])],"Retain the exact original ZIP member"
  label="bundesbank-"+str(index+1);path="originals/"+label+".xml";(root/path).write_bytes(data)
  retained={key:item[key]for key in("name","archive","archiveMember","bytes","sha256","format","included","mapping","note")}
  retained["local"]=path;out["bundesbankOriginals"]["files"].append(retained)
  if not item["included"]:continue
  mapping=item["mapping"];profile={"namespaceMode":mapping["camtNamespaceMode"],"messageVersion":mapping["camtMessageVersion"],"referencePolicy":mapping["camtReferencePolicy"],"detailPolicy":mapping["camtDetailPolicy"]}
  inputs.append({"name":item["name"],"label":label,"local":path,"sourceKind":"BUNDESBANK_BANK_ISSUED_EXAMPLE","accountNamespace":mapping["accountNamespace"],
   "camt":profile,"originalMember":item["archiveMember"],"bytes":len(data),"sha256":sha(data),"expected":original_expected(data,profile),
   "provenance":{"archive":item["archive"],"member":item["archiveMember"],"sourcePage":delivery["sourcePage"]}})
 assert len(retained_members)==22 and sum(item["included"]for item in delivery["files"])==2
 (root/"BUNDESBANK_ORIGINALS.json").write_text(json.dumps(out["bundesbankOriginals"],ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 for item in inputs:
  original_sha=sha((root/item["local"]).read_bytes())
  if original_sha in cfg.get("expectedOriginalRejections",{}):item["expectedRejection"]=cfg["expectedOriginalRejections"][original_sha]
  if original_sha in cfg.get("expectedReportIdentities",{}):item["expectedReportIdentity"]=cfg["expectedReportIdentities"][original_sha]

 (root/"inputs.json").write_text(json.dumps(inputs,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 (root/"retrieval.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 node=shutil.which("node")or os.environ.get("CODEX_PRIMARY_RUNTIME_NODE")
 if not node:raise RuntimeError("Original source receiving requires the existing Node runtime")
 run=subprocess.run([node,str(root/"receive-originals.mjs")],cwd=root,text=True,capture_output=True,timeout=90)
 out["nodeExecutable"]=node;out["exitCode"]=run.returncode;out["stdout"]=run.stdout;out["stderr"]=run.stderr
 (root/"native-stdout.log").write_text(run.stdout,encoding="utf-8");(root/"native-stderr.log").write_text(run.stderr,encoding="utf-8")
 if(root/"receiving-result.json").exists():out["result"]=json.loads((root/"receiving-result.json").read_text())

 if run.returncode==0 and cfg.get("application"):
  application=cfg["application"];app_root=root/"application";app_root.mkdir(mode=0o700)
  import re,posixpath
  git=shutil.which("git")
  if not git:raise RuntimeError("Current immutable application source requires the installed Git transport")
  git_env={**os.environ,"GIT_TERMINAL_PROMPT":"0","GIT_LFS_SKIP_SMUDGE":"1"}
  git_log=[]
  def git_run(args,timeout=120,binary=False):
   attempt=subprocess.run([git,"-C",str(app_root),*args],capture_output=True,timeout=timeout,env=git_env)
   git_log.append({"args":args,"exitCode":attempt.returncode,"stderr":attempt.stderr.decode("utf-8","replace")[-4000:]})
   (root/"CURRENT_SOURCE_GIT.json").write_text(json.dumps(git_log,indent=2)+"\n")
   if attempt.returncode:raise RuntimeError("Current original Git operation failed: "+args[0])
   return attempt.stdout if binary else attempt.stdout.decode("utf-8")
  git_run(["init","--quiet"])
  git_run(["remote","add","origin",application["repository_url"]])
  git_run(["fetch","--quiet","--depth=1","--filter=blob:none","origin",application["source_commit"]],180)
  assert git_run(["rev-parse","FETCH_HEAD"]).strip()==application["source_commit"]
  tree_entries={}
  for entry in git_run(["ls-tree","-r","-z",application["source_commit"]],binary=True).split(b"\0"):
   if not entry:continue
   metadata,name=entry.split(b"\t",1);mode,kind,blob=metadata.decode().split()
   if kind=="blob":tree_entries[name.decode("utf-8")]={"mode":mode,"git_blob_sha1":blob}
  selected=set(application["seed_paths"])|{item["path"]for item in application["expected_files"]}
  missing=selected-set(tree_entries)
  if missing:raise RuntimeError("Current source removed selected original paths: "+",".join(sorted(missing)))
  git_run(["config","core.sparseCheckout","true"])
  patterns=app_root/".git/info/sparse-checkout";patterns.parent.mkdir(parents=True,exist_ok=True)
  patterns.write_text("".join("/"+name+"\n"for name in sorted(selected)))
  git_run(["checkout","--quiet","--detach",application["source_commit"]],180)
  reviewed=set();dependency_records=[]
  def dependency(parent,reference,reason):
   if not isinstance(reference,str)or not reference.startswith(".")or reference in {".","..","./","../"}:return
   name=posixpath.normpath(posixpath.join(posixpath.dirname(parent),reference.split("?",1)[0].split("#",1)[0]))
   if name.startswith("../")or name.startswith("/"):raise ValueError("Source import leaves original repository")
   if name in tree_entries:
    dependency_records.append({"source":parent,"reference":reference,"target":name,"kind":reason})
    selected.add(name);return
   if reference.endswith("/"):return
   choices=[name+".mjs",name+".js",name+".json",name+"/index.mjs",name+"/index.js"]
   found=next((candidate for candidate in choices if candidate in tree_entries),None)
   if found:selected.add(found);dependency_records.append({"source":parent,"reference":reference,"target":found,"kind":reason});return
   if reason=="module":raise RuntimeError("Original local module is absent at selected commit: "+parent+" "+reference)
  for generation in range(24):
   pending=selected-reviewed
   if not pending:break
   missing_files=[name for name in sorted(pending)if not(app_root/name).exists()]
   if missing_files:
    patterns.write_text("".join("/"+name+"\n"for name in sorted(selected)))
    git_run(["read-tree","-mu","HEAD"],180)
   for name in sorted(pending):
    target=app_root/name
    if target.is_symlink()or not target.is_file():raise ValueError("Select only ordinary original source files")
    raw=target.read_bytes();expected_blob=tree_entries[name]["git_blob_sha1"]
    assert hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()==expected_blob,name
    reviewed.add(name)
    if target.suffix.lower()not in{".mjs",".cjs",".js",".json",".html",".css"}:continue
    source=raw.decode("utf-8")
    if target.suffix.lower()in{".mjs",".cjs",".js"}:
     for match in re.finditer(r"(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['\"](\.[^'\"]+)['\"]",source):
      dependency(name,match.group(1),"module")
     for match in re.finditer(r"new\s+URL\s*\(\s*['\"](\.[^'\"]+)['\"]",source):
      dependency(name,match.group(1),"source-url")
    elif target.suffix.lower()==".json":
     try:asset=json.loads(source)
     except ValueError:continue
     if isinstance(asset,dict)and asset.get("schema")=="stellar-forge.browser-assets.v1":
      for route,entry in asset["routes"]:
       reference=posixpath.join(asset["root"],entry[0])
       if not reference.startswith("."):reference="./"+reference
       dependency(name,reference,"browser-asset")
    elif target.suffix.lower()==".html":
     for match in re.finditer(r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]",source):
      reference=match.group(1)
      if not reference.startswith(("/","#","http:","https:","data:")):
       dependency(name,reference if reference.startswith(".")else"./"+reference,"html-asset")
  else:raise RuntimeError("Original dependency traversal did not finish")
  source_files=[]
  for name in sorted(reviewed):
   data=(app_root/name).read_bytes()
   source_files.append({"path":name,"bytes":len(data),"sha256":sha(data),"git_blob_sha1":tree_entries[name]["git_blob_sha1"]})
  lookup={item["path"]:item for item in source_files}
  for expected_file in application["expected_files"]+application["bootstrap_expected_files"]:
   for key in ("bytes","sha256","git_blob_sha1"):
    assert lookup[expected_file["path"]][key]==expected_file[key],expected_file["path"]+" "+key
  source_manifest={"schema":"stellar-forge.camt053.current-source-receiving.v1","sourceCommit":application["source_commit"],
    "tree":git_run(["rev-parse","HEAD^{tree}"]).strip(),"repository":application["repository_url"],"files":source_files,"dependencies":dependency_records}
  (root/"APPLICATION_SOURCE_MANIFEST.json").write_text(json.dumps(source_manifest,indent=2)+"\n")
  bank=app_root/"stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements"
  # The maintained product builder and runtime installer own source selection,
  # dependency versions, the generated package lock and native import readiness.
  distribution=app_root/"stellar/scf-starforge-20261009/distribution"
  def runtime_command(label,arguments,timeout):
   attempt=subprocess.run([node,*map(str,arguments)],cwd=app_root,text=True,capture_output=True,timeout=timeout)
   record={"arguments":list(map(str,arguments)),"exitCode":attempt.returncode,"stdout":attempt.stdout,"stderr":attempt.stderr}
   (root/(label+".json")).write_text(json.dumps(record,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
   if attempt.returncode:raise RuntimeError("Original runtime operation failed: "+label)
   return json.loads(attempt.stdout)
  release=runtime_command("PRODUCT_RELEASE",[distribution/"build.mjs","--repo",app_root,"--ref",application["source_commit"],
    "--selection","merchant-bank-statements","--out",root/"product-release","--python",sys.executable],1200)
  if release["sourceCommit"]!=application["source_commit"]:raise ValueError("Original release changed its selected commit")
  runtime_directory=root/"installed-runtime"
  prepared=runtime_command("RUNTIME_PREPARED",[distribution/"runtime-install-cli.mjs","prepare","--dir",runtime_directory,
    "--archive",release["archive"],"--sha256",release["sha256"],"--native","--feature","schema","--feature","openapi","--feature","mcp","--operator"],300)
  installed=runtime_command("RUNTIME_INSTALLED",[distribution/"runtime-install-cli.mjs","install","--dir",runtime_directory],1800)
  inspected=runtime_command("RUNTIME_INSPECTED",[distribution/"runtime-install-cli.mjs","inspect","--dir",runtime_directory,"--load","--source"],600)
  if installed["status"]!="READY"or inspected.get("ready")is not True or inspected.get("sourceVerified")is not True:
   raise ValueError("The maintained original runtime has not completed source/dependency receiving")
  installed_source=pathlib.Path(installed["sourceRoot"])
  for expected_file in application["expected_files"]:
   installed_file=installed_source/expected_file["path"]
   data=installed_file.read_bytes()
   assert len(data)==expected_file["bytes"]and sha(data)==expected_file["sha256"],expected_file["path"]
  out["installedRuntime"]={"release":release,"prepared":prepared,"installed":installed,"inspection":inspected,
    "dependencyLockSha256":sha((runtime_directory/"package-lock.json").read_bytes()),
    "retention":"Complete original source release, installed source, dependency tree, runtime plans, exact dependency lock and logs."}
  bank=installed_source/"stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements"
  receiver=bank/"CAMT_RECEIVE.mjs";receiver.write_text(application["nodeProgram"],encoding="utf-8")
  (bank/"MCP_RECEIVE.mjs").write_text(application["mcpProgram"],encoding="utf-8")
  shutil.rmtree(app_root/".git")
  app_run=subprocess.run([node,str(receiver),str(root),str(root/"application-result")],cwd=installed_source,text=True,capture_output=True,timeout=1200)
  out["application"]={"sourceCommit":application["source_commit"],"sourceFiles":len(source_files),"exitCode":app_run.returncode,"stdout":app_run.stdout,"stderr":app_run.stderr}
  (root/"application-stdout.log").write_text(app_run.stdout,encoding="utf-8");(root/"application-stderr.log").write_text(app_run.stderr,encoding="utf-8")
  if(root/"application-result/APPLICATION_RESULT.json").exists():out["application"]["result"]=json.loads((root/"application-result/APPLICATION_RESULT.json").read_text())
  if app_run.returncode:out["exitCode"]=app_run.returncode

except Exception as error:
 out["exitCode"]=out.get("exitCode") or 1
 out["error"]={"type":type(error).__name__,"message":str(error),"traceback":traceback.format_exc()}
finally:
 out["finishedAt"]=datetime.now(timezone.utc).isoformat()
 (root/"native-capture.json").write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 files=[]
 for path in sorted(root.rglob("*")):
  if path.is_file() and ".git" not in path.relative_to(root).parts:
   data=path.read_bytes();files.append({"path":path.relative_to(root).as_posix(),"bytes":len(data),"sha256":sha(data)})
 (root/"file-manifest.json").write_text(json.dumps({"schema":"stellar-forge.camt053.receiving-files.v1","files":files},indent=2)+"\n",encoding="utf-8")
 artifact_directory=pathlib.Path(cfg.get("artifactDirectory")or root.parent).expanduser().resolve()
 artifact_directory.mkdir(parents=True,exist_ok=True,mode=0o700)
 archive_path=artifact_directory/(root.name+".zip")
 with zipfile.ZipFile(archive_path,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=9)as zf:
  for path in sorted(root.rglob("*")):
   if path.is_file()and ".git"not in path.relative_to(root).parts:zf.write(path,path.relative_to(root).as_posix())
 def file_identity(path):
  digest=hashlib.sha256()
  with path.open("rb")as stream:
   for block in iter(lambda:stream.read(1024*1024),b""):digest.update(block)
  return {"path":str(path),"bytes":path.stat().st_size,"sha256":digest.hexdigest()}
 short={"schema":out["schema"],"operation":out["operation"],"root":str(root),"exitCode":out.get("exitCode"),"error":out.get("error"),"stderr":out.get("stderr"),"runtime":out.get("result",{}).get("runtime"),"files":[{k:v for k,v in item.items()if k!="statements"}for item in out.get("result",{}).get("files",[])],"archive":file_identity(archive_path),"sourceFiles":files,"bundesbankOriginals":out.get("bundesbankOriginals"),"application":out.get("application")}
 summary_path=artifact_directory/(root.name+"-result.json")
 summary_path.write_text(json.dumps(short,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 uploads=[];reservations=cfg.get("uploads",[])
 if reservations and len(reservations)!=2:raise ValueError("Provide both original archive and result upload reservations, or an artifactDirectory without uploads")
 for reservation,path in zip(reservations,(archive_path,summary_path)):
  identity=file_identity(path)
  item={"file_id":reservation["file_id"],"file_name":reservation["file_name"],"bytes":identity["bytes"],"sha256":identity["sha256"]}
  uploads.append(item)
  try:
   headers={**reservation.get("required_headers",{}),"Content-Length":str(identity["bytes"])}
   with path.open("rb")as body:
    request=urllib.request.Request(reservation["upload_url"],data=body,headers=headers,method=reservation.get("method","PUT"))
    with urllib.request.urlopen(request,timeout=120)as response:
     response.read(1000);item["status"]=response.status;item["complete"]=200<=response.status<300
  except Exception as error:item["error"]={"type":type(error).__name__,"httpStatus":getattr(error,"code",None)}
 short["uploads"]=uploads
 receipt_path=artifact_directory/(root.name+"-transfer.json")
 receipt_path.write_text(json.dumps({"schema":"stellar-forge.camt053.artifact-transfer.v1","operation":out["operation"],"archive":short["archive"],"result":file_identity(summary_path),"uploads":uploads},indent=2)+"\n")
 print(json.dumps({"event":"CAMT_APPLICATION_RECEIVING_COMPLETE","operation":out["operation"],"exitCode":out.get("exitCode"),"error":out.get("error"),
  "archive":short["archive"],"result":file_identity(summary_path),"transferReceipt":str(receipt_path),"uploads":uploads,
  "sourceRuntime":short["runtime"],"originalSources":[{"name":x["name"],"status":x.get("status"),"entryCount":x.get("entryCount"),"detailCount":x.get("detailCount"),"error":x.get("error")}for x in short["files"]],
  "application":{"sourceCommit":out.get("application",{}).get("sourceCommit"),"sourceFiles":out.get("application",{}).get("sourceFiles"),"exitCode":out.get("application",{}).get("exitCode"),"completed":out.get("application",{}).get("result",{}).get("completed"),"error":out.get("application",{}).get("result",{}).get("error")}},ensure_ascii=False),flush=True)
 if len(uploads)==2 and all(item.get("complete")for item in uploads):
  shutil.rmtree(root);archive_path.unlink();summary_path.unlink();receipt_path.unlink()
  print(json.dumps({"event":"CAMT_OWNED_TEMPORARY_FILES_REMOVED","root":str(root)}),flush=True)
 else:
  shutil.rmtree(root)
  print(json.dumps({"event":"CAMT_ARTIFACT_DIRECTORY_READY","directory":str(artifact_directory),"archive":str(archive_path),"result":str(summary_path),"transferReceipt":str(receipt_path),"expandedOwnedRootRemoved":True}),flush=True)
sys.exit(out.get("exitCode",1))
