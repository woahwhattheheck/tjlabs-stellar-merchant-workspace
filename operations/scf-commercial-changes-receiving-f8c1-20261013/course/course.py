"""Operate the original correction desk only in an authenticated private receiving copy."""
import base64,datetime,hashlib,io,json,os,shutil,sqlite3,subprocess,sys,tarfile,threading,time,urllib.request,zipfile
from decimal import Decimal
from pathlib import Path,PurePosixPath
from urllib.parse import urlsplit

CHROME_URL="https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-headless-shell-linux64.zip"
CHROME_SHA="39dcb8c46550632a3d911850ab3b8af840b4e3f6d8622faa2018eb8756278786"
CHROME_BYTES=124203329

def digest(raw):return hashlib.sha256(raw).hexdigest()
def packed(value):return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
def same(a,b,label):
 if packed(a)!=packed(b):raise RuntimeError(label+" changed")
def private_path(path,parent):
 path=Path(path).resolve();parent=Path(parent).resolve()
 if path==parent or parent not in path.parents:raise RuntimeError("Choose a private receiving descendant")
 return path
def file_record(path):
 raw=Path(path).read_bytes()
 return {"bytes":len(raw),"sha256":digest(raw)}
def tree_record(root):
 return {str(p.relative_to(root)):file_record(p) for p in sorted(Path(root).rglob("*")) if p.is_file() and not p.is_symlink()}

def browser_runtime(root,node,checkpoint):
 candidates=[]
 for key in ("CODEX_PRIMARY_RUNTIME_NODE_MODULES",):
  if os.environ.get(key):candidates.append(Path(os.environ[key])/"playwright")
 if os.environ.get("CODEX_PRIMARY_RUNTIME_ROOT"):
  candidates.extend([Path(os.environ["CODEX_PRIMARY_RUNTIME_ROOT"])/"node_modules/playwright",Path(os.environ["CODEX_PRIMARY_RUNTIME_ROOT"])/"dependencies/node/node_modules/playwright"])
 candidates.extend([Path("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"),Path("/usr/local/lib/node_modules/playwright")])
 playwright=next((p for p in candidates if (p/"package.json").is_file()),None)
 if playwright is None:
  check=subprocess.run([node,"-p","require.resolve('playwright/package.json')"],capture_output=True,text=True,timeout=20)
  if check.returncode==0:playwright=Path(check.stdout.strip()).parent
 if playwright is None:raise RuntimeError("The installed browser driver is unavailable; retain this complete course and use its original equipped host")
 selected=None
 for name in (os.environ.get("CHROME_BIN"),shutil.which("chrome-headless-shell"),shutil.which("chromium"),shutil.which("google-chrome")):
  if name and Path(name).is_file():
   version=subprocess.run([name,"--version"],capture_output=True,text=True,timeout=20)
   if version.returncode==0 and "155.0.8059.39" in version.stdout:selected=Path(name);break
 if selected is None:
  runtime=root/"browser-runtime";runtime.mkdir(exist_ok=True)
  archive=runtime/"chrome-headless-shell-linux64.zip"
  if not archive.exists():
   with urllib.request.urlopen(CHROME_URL,timeout=90) as response,archive.open("wb") as out:
    if response.status!=200:raise RuntimeError("Original Chrome distribution did not return HTTP200")
    count=0;h=hashlib.sha256()
    while True:
     block=response.read(1024*1024)
     if not block:break
     count+=len(block)
     if count>CHROME_BYTES:raise RuntimeError("Chrome distribution exceeds its original size")
     out.write(block);h.update(block)
   if count!=CHROME_BYTES or h.hexdigest()!=CHROME_SHA:raise RuntimeError("Original Chrome distribution differs")
  if file_record(archive)!={"bytes":CHROME_BYTES,"sha256":CHROME_SHA}:raise RuntimeError("Original Chrome archive differs")
  with zipfile.ZipFile(archive) as z:
   if z.testzip():raise RuntimeError("Chrome distribution CRC differs")
   for info in z.infolist():
    name=PurePosixPath(info.filename)
    if name.is_absolute() or ".." in name.parts or ((info.external_attr>>16)&0o170000)==0o120000:raise RuntimeError("Unsafe browser distribution member")
   z.extractall(runtime)
   for info in z.infolist():
    p=runtime/info.filename
    if p.is_file():p.chmod((info.external_attr>>16)&0o777 or 0o600)
  selected=runtime/"chrome-headless-shell-linux64/chrome-headless-shell"
 version=subprocess.run([str(selected),"--version"],capture_output=True,text=True,timeout=20)
 if version.returncode or "155.0.8059.39" not in version.stdout:raise RuntimeError("The original Chromium build did not start")
 record={"url":CHROME_URL,"bytes":CHROME_BYTES,"sha256":CHROME_SHA,"version":version.stdout.strip(),"executable":str(selected),"playwright":str(playwright),"playwrightVersion":json.loads((playwright/"package.json").read_text())["version"]}
 checkpoint("browser_runtime",record)
 return selected,playwright

def inspect_zip(raw,label):
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  names=z.namelist()
  if len(names)!=len(set(names)) or z.testzip():raise RuntimeError(label+" has repeated or corrupt members")
  rows=[]
  for entry in z.infolist():
   p=PurePosixPath(entry.filename)
   if p.is_absolute() or ".." in p.parts:raise RuntimeError("Unsafe "+label+" member")
   if entry.is_dir():continue
   data=z.read(entry);rows.append({"path":entry.filename,"bytes":len(data),"sha256":digest(data),"crc32":format(entry.CRC,"08x")})
  return rows

def inspect_customer_tar(raw):
 with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
  files={}
  for member in tar.getmembers():
   p=PurePosixPath(member.name)
   if p.is_absolute() or ".." in p.parts or not member.isfile():raise RuntimeError("Use original regular customer account members")
   if member.name in files:raise RuntimeError("Repeated customer account member")
   files[member.name]=tar.extractfile(member).read()
  manifest=json.loads(files["manifest.json"])
  for name,meta in manifest["files"].items():
   data=files[name]
   if len(data)!=meta["bytes"] or digest(data)!=meta["sha256"]:raise RuntimeError("Customer account member differs: "+name)
  return [{"path":name,"bytes":len(data),"sha256":digest(data)} for name,data in sorted(files.items())]

def native_recovery(source,node,action,arguments,key_path,out,stop_owned):
 key=Path(key_path).read_text().strip()
 if not 16<=len(key.encode())<=65536:raise RuntimeError("Retain the original private restore key")
 env=os.environ.copy();env["F8C1_CHANGE_RESTORE_SECRET"]=key
 script="import {pathToFileURL} from 'node:url';let raw='';for await(const x of process.stdin)raw+=x;const c=JSON.parse(raw);const m=await import(pathToFileURL(c.module));try{console.log(JSON.stringify(await m[c.action](c.arguments)))}catch(e){console.error(JSON.stringify({code:e.code,message:e.message}));process.exitCode=1}"
 config={"module":str(source/"stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/recovery.mjs"),"action":action,"arguments":{**arguments,"passEnv":"F8C1_CHANGE_RESTORE_SECRET"}}
 output=out/(action+".stdout");errors=out/(action+".stderr")
 with output.open("wb") as stdout,errors.open("wb") as stderr:
  child=subprocess.Popen([node,"--input-type=module","-e",script],stdin=subprocess.PIPE,stdout=stdout,stderr=stderr,text=True,env=env,start_new_session=True,cwd=out)
  try:child.communicate(json.dumps(config),timeout=300)
  finally:stop_owned(child)
 if child.returncode:raise RuntimeError("Native original backup/restore failed: "+errors.read_text()[-2500:])
 return json.loads(output.read_text())

def cold_receive_account(*,root,source,restored,account,node,out,payload,stop_owned,checkpoint,final_change_id,prepared_id,case_receipt,snapshot):
 from model import Workspace
 from operations import Operations
 from operations_commercial_adapter import CommercialConnectionAdapter
 key=restored/"private/restore-key.txt"
 backup=root/"corrected-native-backup"
 if snapshot["status"]!="ACCOUNTING_BACKUP_CREATED":raise RuntimeError("Full corrected native backup was not created")
 cold=root/"cold-account-receiving";cold.mkdir(mode=0o700)
 target=cold/"accounting"
 received=native_recovery(source,node,"restoreAccountingWorkspace",{"bundle":str(backup),"expectedSha256":snapshot["manifestSha256"],"directory":str(target),"stateRoot":str(cold),"quiesced":True,"relocate":True,**{"expectedWorkspaceId":payload["originalIdentity"]["workspaceId"],"expectedSourcesSha256":payload["originalIdentity"]["sourcesSha256"]}},key,out,stop_owned)
 if received["status"]!="ACCOUNTING_WORKSPACE_RESTORED" or received["originalWorkspaceSha256"]!=snapshot["workspaceSha256"]:raise RuntimeError("Cold account does not match its authenticated full backup")
 same({k:received["binding"][k] for k in ("workspaceId","sourcesSha256")},payload["originalIdentity"],"Cold native account identity")
 before=json.loads((out/"native-state-after.json").read_text());after=json.loads((target/"workspace.json").read_text())
 same(before["receivables"],after["receivables"],"Complete corrected native ledger and request histories")
 # Open the genuinely new directory with the current original native service.
 ready=out/"cold-native-ready.json";config=out/"cold-native-host.json"
 config.write_bytes(packed({"module":str(source/"stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs"),"directory":str(target),**payload["originalIdentity"],"before":str(out/"cold-native-before.json"),"after":str(out/"cold-native-after.json"),"ready":str(ready)})+b"\n");config.chmod(0o600)
 native=None
 with (out/"cold-native.stdout").open("wb") as stdout,(out/"cold-native.stderr").open("wb") as stderr:
  try:
   native=subprocess.Popen([node,str(root/"course/native-host.mjs"),str(config)],stdout=stdout,stderr=stderr,cwd=root,start_new_session=True)
   deadline=time.monotonic()+120
   while not ready.exists():
    if native.poll() is not None:raise RuntimeError("Cold original native service exited")
    if time.monotonic()>deadline:raise TimeoutError("Cold native service did not become ready")
    time.sleep(.1)
   info=json.loads(ready.read_text());private_path(info["directory"],cold)
   grant=source/"stellar/scf_2026/sf47_budget_model/workspace";work=Workspace(root/"independent-case-receiving",grant.parent/"sf10_current_candidate.json")
   try:
    operations=Operations(work);operations.commercial.adapter=CommercialConnectionAdapter(work)
    prepared=operations.commercial._plan(case_receipt["id"],prepared_id)
    endpoint=operations.commercial.adapter.configure({"id":prepared["endpointId"],"label":"Cold restored original corrected account","baseUrl":info["baseUrl"],"actor":"F8C1 internal receiving","requestId":"f8c1-changes-cold-connection-v1"})
    row=operations.commercial_changes.get(case_receipt["id"],final_change_id,True)
    if row["state"]!="APPLIED" or any(x["state"]!="ACKNOWLEDGED" for x in row["commands"]):raise RuntimeError("Cold original correction journal is incomplete")
    current=operations.commercial.adapter("detail",{"endpointId":prepared["endpointId"],"invoiceId":row["activeInvoiceId"]})
    if current["invoice"]["status"]!="ISSUED":raise RuntimeError("Cold issued replacement did not reopen")
    final_export=operations.export(case_receipt["id"]);(out/"cold-reopened-complete-case.zip").write_bytes(final_export)
    inspect_zip(final_export,"cold reopened complete case")
    checkpoint("cold_account_and_case_reopened",{"restore":received,"endpoint":endpoint,"caseId":case_receipt["id"],"changeId":row["id"],"nativeInvoiceId":row["activeInvoiceId"],"native":current,"caseExport":file_record(out/"cold-reopened-complete-case.zip")})
   finally:work.close()
  finally:
   if native is not None:stop_owned(native)
 same(json.loads((out/"cold-native-after.json").read_text())["receivables"],after["receivables"],"Cold native read-only reopening")
 return {"snapshot":snapshot,"restore":received,"originalKeyFile":str(key),"backupDirectory":str(backup),"receivingRoot":str(cold)}

def run_course(*,root,source,restored,opened,archive,payload,node,stop_owned,emit):
 from model import Workspace
 from operations import Operations
 from operations_commercial_adapter import CommercialConnectionAdapter,commercial_store
 from server import create_server
 root=Path(root);out=root/"course-output";out.mkdir(exist_ok=True)
 course={"schema":"commons.scf-commercial-changes-operated-course.v1","state":"STARTING","sourceEdition":payload["head"],"originalIdentity":payload["originalIdentity"],"steps":[],"boundary":{"operation":"internal product receiving","outboundCustomerSend":False,"externalSettlement":False}}
 def checkpoint(name,value):
  course["steps"].append({"name":name,"at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"value":value})
  (out/"course-result.json").write_bytes(json.dumps(course,indent=2,ensure_ascii=False).encode()+b"\n")
  emit("COURSE_PHASE",name=name)
 account=private_path(opened["binding"]["directory"],restored)
 receiving=private_path(restored/"work/receiving",restored)
 protected_source=private_path(restored/"work/source",restored)
 source_baseline=tree_record(protected_source);archive_baseline=file_record(archive)
 course["boundary"].update({"privateAccount":str(account),"privateReceivingCase":str(receiving),"preservedSourceCase":str(protected_source),"originalArchive":archive_baseline})
 if not (receiving/"planning.sqlite3").is_file():raise RuntimeError("The original receiving planning database is absent")
 same({k:opened["binding"][k] for k in ("workspaceId","sourcesSha256")},payload["originalIdentity"],"Authenticated original identity")
 grant=source/"stellar/scf_2026/sf47_budget_model/workspace"
 native_module=source/"stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs"
 native_before=out/"native-state-before.json";native_after=out/"native-state-after.json";ready=out/"native-ready.json"
 config=out/"native-host.json";config.write_bytes(packed({"module":str(native_module),"directory":str(account),**payload["originalIdentity"],"before":str(native_before),"after":str(native_after),"ready":str(ready)})+b"\n");config.chmod(0o600)
 native=None;server=None;thread=None;native_logs=[];workspace=None
 try:
  stdout=(out/"native.stdout").open("wb");stderr=(out/"native.stderr").open("wb");native_logs=[stdout,stderr]
  native=subprocess.Popen([node,str(root/"course/native-host.mjs"),str(config)],stdout=stdout,stderr=stderr,cwd=root,start_new_session=True)
  deadline=time.monotonic()+120
  while not ready.exists():
   if native.poll() is not None:raise RuntimeError("Original native service exited: "+(out/"native.stderr").read_text()[-4000:])
   if time.monotonic()>deadline:raise TimeoutError("Original native service did not become ready")
   time.sleep(.1)
  native_info=json.loads(ready.read_text());private_path(native_info["directory"],restored)
  same(str(account),str(Path(native_info["directory"]).resolve()),"Receiving account location")
  baseline=json.loads(native_before.read_text())
  server=create_server(receiving,grant.parent/"sf10_current_candidate.json",port=0)
  workspace=server.workspace;ops=Operations(workspace);billing=commercial_store(ops);adapter=billing.adapter
  rows=workspace.db.execute("SELECT id,program_id,body_json FROM ops_commercial_receivables ORDER BY id").fetchall()
  choices=[]
  for prepared_id,pid,body in rows:
   prepared=json.loads(body)
   if any(prepared.get("accountingIdentity",{}).get(k)!=v for k,v in payload["originalIdentity"].items()):continue
   adapter.configure({"id":prepared["endpointId"],"label":"Original account · private receiving copy","baseUrl":native_info["baseUrl"],"actor":"F8C1 internal receiving","requestId":"f8c1-changes-connect-"+hashlib.sha256(prepared["endpointId"].encode()).hexdigest()[:24]})
   actual=adapter("identity",{"endpointId":prepared["endpointId"]})
   same({k:actual[k] for k in ("workspaceId","sourcesSha256")},payload["originalIdentity"],"Running native identity")
   selected=billing.get(pid,prepared_id);details=[]
   for milestone in selected["milestones"]:
    if milestone.get("invoiceId") and not milestone.get("superseded"):
     detail=adapter("detail",{"endpointId":prepared["endpointId"],"invoiceId":milestone["invoiceId"]})
     details.append((milestone,detail))
   paid=[x for x in details if x[1]["invoice"]["status"]=="ISSUED" and Decimal(x[1]["invoice"]["paid"])>0 and Decimal(x[1]["invoice"]["amountDue"])==0]
   unpaid=[x for x in details if x[1]["invoice"]["status"]=="ISSUED" and Decimal(x[1]["invoice"]["paid"])==0 and Decimal(x[1]["invoice"]["amountDue"])>0 and not x[1]["credits"] and not x[1]["allocations"]]
   if len(paid)==1 and len(unpaid)==1:choices.append((pid,prepared_id,selected,paid[0],unpaid[0]))
  if len(choices)!=1:raise RuntimeError("The original paid/open milestone pair is not uniquely identified")
  pid,prepared_id,prepared,paid,unpaid=choices[0];milestone,detail=unpaid
  if not milestone["eligibility"].get("ready"):raise RuntimeError("Original actual milestone prerequisites remain unsatisfied")
  if ops.commercial_changes.export_rows(pid)["items"]:raise RuntimeError("A prior correction exists; continue its retained course instead of starting a new financial chain")
  scale=prepared["schedule"]["currency"]["scale"];units=int(Decimal(detail["draft"]["totals"]["total"])*(10**scale))
  if units<10:raise RuntimeError("The retained amount is too small for this revised-amount course")
  revised=Decimal(units*9//10).scaleb(-scale);amount=format(revised,"."+str(scale)+"f");zero=format(Decimal(0),"."+str(scale)+"f")
  today=datetime.datetime.now(datetime.timezone.utc).date()
  effective=max(today,datetime.date.fromisoformat(detail["draft"]["issueDate"]))
  due=max(effective+datetime.timedelta(days=30),datetime.date.fromisoformat(detail["draft"]["dueDate"]))
  actor="F8C1 internal correction-desk receiving"
  authorization=("Bryce authorized continued engineering and native product receiving on a newly restored private copy. "
   "This retained source records that internal demonstration scope, not customer assent to revised commercial terms. "
   "Only the original unpaid milestone may be credited/replaced and its replacement draft explicitly reviewed/issued in this private account. "
   "The original archive, paid milestone, receipts, allocations, issuer/customer correspondence and external settlement remain unchanged.")
  original_selection={"programId":pid,"preparedId":prepared_id,"milestoneId":milestone["milestoneId"],"originalInvoiceId":detail["invoice"]["id"],"paidInvoiceId":paid[1]["invoice"]["id"],"accountingIdentity":payload["originalIdentity"],"privateAccount":str(account),"revisedAmount":amount,"currency":prepared["schedule"]["currency"],"sourceEdition":payload["head"]}
  retained=packed({"schema":"commons.scf-internal-receiving-authorization.v1","scope":authorization,"originalSelection":original_selection,"ownerInstruction":"Continue the whole correction-desk course only in a newly restored private receiving copy.","source":"Existing authorized F8C1 engineering operation; no outside customer approval is asserted."})+b"\n"
  command=ops.command(pid,{"requestId":"f8c1-changes-internal-source-v1","expectedVersion":ops._context(pid)["program"]["version"],"actor":actor,"note":"Retain the actual internal receiving boundary before reviewing any native correction.","action":"source.add","data":{"filename":"internal-receiving-authorization.json","mediaType":"application/json","kind":"other","contentBase64":base64.b64encode(retained).decode(),"sourceUrl":"","observedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")}})
  source_id=command["recordId"]
  if bytes(ops.source(pid,source_id)[1])!=retained:raise RuntimeError("Retained authorization bytes differ")
  checkpoint("original_pair_and_private_boundary",{"selection":original_selection,"sourceId":source_id,"authorizationSha256":digest(retained),"paidInvoice":paid[1],"originalOpenInvoice":detail})
  before_changes=ops.commercial_changes.export_rows(pid)
  chrome,playwright=browser_runtime(root,node,checkpoint)
  cfg={"origin":server.origin,"token":server.token,"nativeBaseUrl":native_info["baseUrl"],"output":str(out/"browser"),"chrome":str(chrome),"playwright":str(playwright),"caseId":pid,"planId":ops._context(pid)["program"]["planId"],"preparedId":prepared_id,"milestoneId":milestone["milestoneId"],"sourceId":source_id,"actor":actor,"originalOpenInvoiceId":detail["invoice"]["id"],"originalPaidInvoiceId":paid[1]["invoice"]["id"],"revisedAmount":amount,"zero":zero,"description":milestone["label"]+" — internal receiving amendment","issueDate":effective.isoformat(),"dueDate":due.isoformat(),"effectiveDate":effective.isoformat(),"authorizedOn":today.isoformat(),"reason":"Demonstrate a reduced scope and a clarified replacement draft in the authenticated private receiving copy.","authorization":authorization}
  browser_config=out/"browser-config.json";browser_config.write_bytes(packed(cfg)+b"\n");browser_config.chmod(0o600)
  thread=threading.Thread(target=server.serve_forever,name="original-private-planning",daemon=False);thread.start()
  with (out/"browser.stdout").open("wb") as browser_stdout,(out/"browser.stderr").open("wb") as browser_stderr:
   child=subprocess.Popen([node,str(root/"course/browser.cjs"),str(browser_config)],stdout=browser_stdout,stderr=browser_stderr,start_new_session=True,cwd=root)
   try:code=child.wait(timeout=900)
   finally:stop_owned(child)
  browser_result=json.loads((out/"browser/browser-result.json").read_text())
  checkpoint("actual_browser_course",browser_result)
  if code or browser_result["state"]!="BROWSER_COURSE_COMPLETE":raise RuntimeError("Complete original browser course did not finish; retain its source, journal and private account for continuation")
  final=ops.commercial_changes.get(pid,browser_result["finalChangeId"],True)
  rows_after=ops.commercial_changes.export_rows(pid)
  applied_rows=[row for row in rows_after["items"] if row["state"]=="APPLIED"]
  cancelled_rows=[row for row in rows_after["items"] if row["state"]=="CANCELLED"]
  if len(rows_after["items"])!=3 or len(applied_rows)!=2 or len(cancelled_rows)!=1 or cancelled_rows[0]["commands"]:raise RuntimeError("Retain the unused cancelled preparation and the complete two-edition applied correction chain")
  if cancelled_rows[0]["id"]!=browser_result["cancelledChangeId"]:raise RuntimeError("Original cancelled preparation differs")
  replacement,clarified=applied_rows
  if replacement["proposal"]["mode"]!="REPLACE" or clarified["proposal"]["mode"]!="DRAFT_EDIT":raise RuntimeError("Unexpected original correction chain")
  if replacement["activeInvoiceId"]!=clarified["activeInvoiceId"]:raise RuntimeError("Draft refinement changed native invoice identity")
  commands=[c for row in rows_after["items"] for c in row["commands"]]
  if len(commands)!=4 or any(c["state"]!="ACKNOWLEDGED" for c in commands):raise RuntimeError("Expected original credit, replacement draft, draft correction and issue")
  after_paid=adapter("detail",{"endpointId":prepared["endpointId"],"invoiceId":paid[1]["invoice"]["id"]})
  same({k:v for k,v in paid[1].items() if k!="revision"},{k:v for k,v in after_paid.items() if k!="revision"},"Original paid milestone")
  original_after=adapter("detail",{"endpointId":prepared["endpointId"],"invoiceId":detail["invoice"]["id"]})
  same(original_after["document"],detail["document"],"Original issued invoice document")
  if len(original_after["credits"])!=1 or Decimal(original_after["invoice"]["amountDue"])!=0:raise RuntimeError("The reviewed original credit is missing")
  new_invoice=adapter("detail",{"endpointId":prepared["endpointId"],"invoiceId":final["activeInvoiceId"]})
  if new_invoice["invoice"]["status"]!="ISSUED" or new_invoice["document"]["totals"]["total"]!=amount or Decimal(new_invoice["invoice"]["paid"])!=0:raise RuntimeError("The reviewed replacement issue differs")
  # Inspect every complete exported member, including the original customer account archive.
  browser_dir=out/"browser";change_raw=(browser_dir/"complete-change-and-account.zip").read_bytes();case_raw=(browser_dir/"complete-operations-case.zip").read_bytes()
  change_inventory=inspect_zip(change_raw,"complete change export");case_inventory=inspect_zip(case_raw,"complete case export")
  with zipfile.ZipFile(io.BytesIO(change_raw)) as z:
   manifest=json.loads(z.read("manifest.json"))
   for row in manifest["files"]:
    data=z.read(row["path"])
    if len(data)!=row["bytes"] or digest(data)!=row["sha256"]:raise RuntimeError("Change archive member differs")
   same(json.loads(z.read("milestone-changes.json")),rows_after,"Complete exported correction history")
   native_inventory=inspect_customer_tar(z.read("current-customer-account.tar"))
   original_customer_inventory=inspect_zip(z.read("original-customer-account.zip"),"retained original customer source")
  checkpoint("complete_exports_inspected",{"change":change_inventory,"case":case_inventory,"nativeAccount":native_inventory,"originalCustomer":original_customer_inventory})
  # A fresh planning workspace receives the actual UI export through its unchanged importer.
  fresh_root=root/"independent-case-receiving";fresh=Workspace(fresh_root,grant.parent/"sf10_current_candidate.json")
  try:
   receiver=Operations(fresh);receipt=receiver.import_bundle(case_raw,"Original correction desk — independent receiving","f8c1-changes-complete-case-receive-v1",actor)
   actual=receiver.commercial_changes.export_rows(receipt["id"])
   same(actual,rows_after,"Original correction records and native command identities")
   received_prepared=receiver.commercial._plan(receipt["id"],prepared_id)
   same(received_prepared,ops.commercial._plan(pid,prepared_id),"Original prepared Workshare and milestone snapshot")
   if bytes(receiver.source(receipt["id"],source_id)[1])!=retained:raise RuntimeError("Original authorization source did not survive complete receiving")
   reexport=receiver.export(receipt["id"]);(out/"independently-received-case.zip").write_bytes(reexport)
   inspect_zip(reexport,"independent case re-export")
   receiver.commercial.adapter=CommercialConnectionAdapter(fresh)
   receiver.commercial.adapter.configure({"id":prepared["endpointId"],"label":"Same original private native account","baseUrl":native_info["baseUrl"],"actor":actor,"requestId":"f8c1-changes-received-connection-v1"})
   readback=receiver.commercial_changes.get(receipt["id"],final["id"],True)
   same(readback["commands"],final["commands"],"Reopened native issue commands")
   checkpoint("independent_case_reopened",{"receipt":receipt,"changeIds":[row["id"] for row in actual["items"]],"nativeInvoiceId":readback["activeInvoiceId"],"export":file_record(out/"independently-received-case.zip")})
  finally:fresh.close()
  checkpoint("native_financial_result",{"paidInvoice":after_paid,"creditedOriginal":original_after,"replacementInvoice":new_invoice,"changes":rows_after})
  course["state"]="NATIVE_BROWSER_EXPORT_RECEIVING_COMPLETE"
 except BaseException as error:
  course["state"]="COURSE_ERROR";course["error"]={"type":type(error).__name__,"message":str(error)}
  checkpoint("course_error",course["error"])
  raise
 finally:
  cleanup_errors=[]
  def cleanup_call(name,action):
   try:action()
   except BaseException as error:cleanup_errors.append({"service":name,"type":type(error).__name__,"message":str(error)})
  if server is not None:
   if thread is not None and thread.is_alive():
    cleanup_call("planning shutdown",server.shutdown)
    cleanup_call("planning thread",lambda:thread.join(timeout=30))
   cleanup_call("planning socket",server.server_close)
   cleanup_call("planning workspace",server.workspace.close)
  if native is not None:cleanup_call("original native process group",lambda:stop_owned(native))
  for index,handle in enumerate(native_logs):cleanup_call("native log "+str(index),handle.close)
  course["cleanupErrors"]=cleanup_errors
  if not cleanup_errors and native_before.exists():
   try:
    snapshot=native_recovery(source,node,"snapshotAccountingWorkspace",{"directory":str(account),"stateRoot":str(restored),"output":str(root/"corrected-native-backup"),"quiesced":True},restored/"private/restore-key.txt",out,stop_owned)
    if snapshot.get("status")!="ACCOUNTING_BACKUP_CREATED":raise RuntimeError("Native continuation backup is incomplete")
    course["continuationBackup"]=snapshot
    checkpoint("authenticated_continuation_backup",snapshot)
   except BaseException as error:
    course["continuationBackupError"]={"type":type(error).__name__,"message":str(error)}
    checkpoint("continuation_backup_error",course["continuationBackupError"])
  same(tree_record(protected_source),source_baseline,"Untouched restored source-case files")
  same(file_record(archive),archive_baseline,"Immutable original saved archive")
  if course["state"]=="NATIVE_BROWSER_EXPORT_RECEIVING_COMPLETE" and not (native_before.exists() and native_after.exists()):raise RuntimeError("Retain both exact native state observations before closing the course")
  if native_before.exists() and native_after.exists():
   before=json.loads(native_before.read_text());after=json.loads(native_after.read_text())
   for key in ("receipts","allocations"):same(before["receivables"].get(key,[]),after["receivables"].get(key,[]),"Original native "+key)
   for key in ("paymentRequests","refunds","bankImports","bankAccounts","creditDispositions"):same(before["receivables"].get(key,[]),after["receivables"].get(key,[]),"Original native "+key)
   original_ids={row["id"] for row in before["receivables"]["requests"]}
   for row in before["receivables"]["requests"]:
    matches=[x for x in after["receivables"]["requests"] if x["id"]==row["id"]]
    if len(matches)!=1:raise RuntimeError("Original native request disappeared")
    same(matches[0],row,"Original native request "+row["id"])
   if course["state"]=="NATIVE_BROWSER_EXPORT_RECEIVING_COMPLETE":
    added=[row for row in after["receivables"]["requests"] if row["id"] not in original_ids]
    if len(added)!=4:raise RuntimeError("The private correction course produced an unexpected native request count")
   course["originalNativeHistoryPreserved"]=True
  checkpoint("closed_and_preserved",{"state":course["state"],"immutableOriginal":archive_baseline,"sourceCaseFiles":len(source_baseline),"privateAccount":str(account)})
  if cleanup_errors:raise RuntimeError("Owned service cleanup did not fully complete: "+json.dumps(cleanup_errors))
 if course["state"]=="NATIVE_BROWSER_EXPORT_RECEIVING_COMPLETE":
  course["fullAccountReceiving"]=cold_receive_account(root=root,source=source,restored=restored,account=account,node=node,out=out,payload=payload,stop_owned=stop_owned,checkpoint=checkpoint,final_change_id=final["id"],prepared_id=prepared_id,case_receipt=receipt,snapshot=course["continuationBackup"])
  course["state"]="COMPLETE_AWAITING_PIXEL_INSPECTION"
  checkpoint("full_correction_product_received",{"state":course["state"],"browserViews":len(browser_result["screenshots"]),"paidInvoicePreserved":paid[1]["invoice"]["id"],"originalNativeIdentity":payload["originalIdentity"]})
 return course
