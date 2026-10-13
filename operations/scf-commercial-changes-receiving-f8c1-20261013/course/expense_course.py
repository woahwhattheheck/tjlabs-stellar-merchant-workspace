"""Receive the original issued Buyer Expenses source and operate customer recovery billing."""
import base64,copy,datetime,hashlib,importlib.util,io,json,os,subprocess,sys,time,zipfile
from decimal import Decimal
from pathlib import Path,PurePosixPath

OPERATION="SCF-CUSTOMER-EXPENSE-BILLING-F8C1-20261013"
BUYER_ID="workspace-2d4f4be1-c781-423a-9726-046d303f71f2"
BUYER_SHA="d21bd47c8b720ef64727876214df71376ee2c4aa7915946df557e0a346a24524"
BUYER_BYTES=509912

def raw_json(value):return (json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
def sha(raw):return hashlib.sha256(raw).hexdigest()
def same(a,b,label):
 if raw_json(a)!=raw_json(b):raise RuntimeError(label+" differs")
def save(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 data=value if isinstance(value,bytes) else raw_json(value)
 temporary=path.with_name(path.name+".writing")
 with temporary.open("wb") as stream:os.chmod(temporary,0o600);stream.write(data);stream.flush();os.fsync(stream.fileno())
 os.replace(temporary,path)
def file_record(path):
 data=Path(path).read_bytes();return {"path":str(path),"bytes":len(data),"sha256":sha(data)}

BUYER_EXPORT=r"""
import hashlib,json,sys
from pathlib import Path
root,output,node=map(str,sys.argv[1:4]);root,output=Path(root),Path(output)
sys.path.insert(0,str(root/'app/sf36-spend-governor/expense-workspace'))
from store import Store
store=Store(root/'project',node_executable=node)
try:
 before=store.revision()
 closes=[r[0] for r in store.connection.execute('SELECT id FROM closes ORDER BY id')]
 results=[]
 for ident in closes:
  count=store.connection.execute('SELECT COUNT(*) FROM accountant_returns WHERE close_id=?',(ident,)).fetchone()[0]
  if not count:continue
  source=store.accountant_source(ident);document=json.loads(source)
  delivery=store.accountant_delivery(ident,expected_revision=before)
  directory=output/hashlib.sha256(ident.encode()).hexdigest()[:20];directory.mkdir(parents=True,mode=0o700)
  files=[]
  for name,raw in [('issued-buyer-source.json',source),('buyer-accountant-delivery.zip',delivery)]:
   target=directory/name;target.write_bytes(raw);target.chmod(0o600)
   files.append({'path':str(target),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
  results.append({'workspaceId':document['workspaceId'],'closeId':ident,'revision':before,'returns':count,'files':files})
 if store.revision()!=before:raise RuntimeError('Original Buyer source export changed its revision')
 if not results:raise RuntimeError('Original account has no issued close with retained accountant returns')
 print(json.dumps({'revision':before,'closes':closes,'issued':results}))
finally:store.close()
"""

def receive_buyer(*,root,out,node,stop_owned):
 archive=root/"original-buyer.zip";raw=archive.read_bytes()
 if len(raw)!=BUYER_BYTES or sha(raw)!=BUYER_SHA:raise RuntimeError("The frozen original Buyer Expenses archive differs")
 extracted=out/"original-buyer";extracted.mkdir(mode=0o700)
 members=[]
 with zipfile.ZipFile(io.BytesIO(raw)) as z:
  entries=z.infolist()
  if len(entries)>2000 or sum(e.file_size for e in entries)>64*1024*1024:raise RuntimeError("Original Buyer archive exceeds its retained source bound")
  seen=set()
  for item in entries:
   p=PurePosixPath(item.filename);mode=(item.external_attr>>16)&0o170000
   if item.filename in seen or not item.filename or p.is_absolute() or ".." in p.parts or "\\" in item.filename or p.as_posix()!=item.filename or mode not in (0,0o100000,0o040000):raise RuntimeError("Original Buyer archive has an unsafe or repeated member")
   seen.add(item.filename)
   if item.is_dir():continue
   data=z.read(item)
   if len(data)!=item.file_size:raise RuntimeError("Incomplete original Buyer member")
   save(extracted/item.filename,data);members.append({"path":item.filename,"bytes":len(data),"sha256":sha(data),"crc32":format(item.CRC,"08x")})
 issued=out/"issued-originals"
 with (out/"buyer-export.stdout").open("wb") as stdout,(out/"buyer-export.stderr").open("wb") as stderr:
  child=subprocess.Popen([sys.executable,"-I","-B","-c",BUYER_EXPORT,str(extracted),str(issued),node],stdout=stdout,stderr=stderr,start_new_session=True,cwd=out)
  try:code=child.wait(timeout=180)
  finally:stop_owned(child)
 if code:raise RuntimeError("Original native Buyer exporter failed: "+(out/"buyer-export.stderr").read_text()[-4000:])
 result=json.loads((out/"buyer-export.stdout").read_text())
 if any(x["workspaceId"]!=BUYER_ID for x in result["issued"]):raise RuntimeError("The original issued Buyer workspace identity differs")
 for row in result["issued"]:
  for record in row["files"]:
   actual=file_record(record["path"])
   if any(actual[k]!=record[k] for k in ("bytes","sha256")):raise RuntimeError("Original Buyer exported bytes differ")
 save(out/"original-buyer-inventory.json",members)
 return {**result,"archive":file_record(archive),"members":members}

def run_expense_course(*,root,source,ops,pid,prepared,server,native_info,node,payload,chrome,playwright,stop_owned,checkpoint):
 import operations_expenses as expenses
 from course import inspect_zip,inspect_customer_tar
 root=Path(root);out=root/"course-output/expense";out.mkdir(parents=True,exist_ok=True,mode=0o700)
 result={"schema":"commons.scf-expense-billing-operated-course.v1","operation":OPERATION,"state":"STARTING","caseId":pid,"steps":[],"requests":[]}
 def retain(name,value):
  result["steps"].append({"name":name,"value":value,"at":datetime.datetime.now(datetime.timezone.utc).isoformat()})
  save(out/"expense-course-result.json",result);checkpoint("expense_"+name,value)
 def current():return ops.read(pid)["expenseAttribution"]
 def original_command(label,action,data,note):
  path=out/"requests"/(label+".json")
  if path.exists():
   body=json.loads(path.read_text())
   if body["action"]!=action or body["data"]!=data or body["note"]!=note:raise RuntimeError("Original source command identity differs: "+label)
  else:
   body={"requestId":OPERATION+":"+label,"expectedVersion":ops._context(pid)["program"]["version"],"actor":actor,"note":note,"action":action,"data":data};save(path,body)
  receipt=ops.command(pid,body);save(out/"requests"/(label+".receipt.json"),receipt)
  result["requests"].append({"label":label,"body":body,"receipt":receipt});save(out/"expense-course-result.json",result)
  return receipt
 def attribution(ident):
  return next(x for x in current()["attributions"] if x["id"]==ident)
 def transition(label,action,ident,note):
  row=attribution(ident)
  return original_command(label,action,{"id":ident,"expectedContentSha256":row["contentSha256"]},note)
 actor="F8C1 internal expense-billing receiving"
 adapter=ops.commercial.adapter;endpoint=prepared["endpointId"];customer=prepared["customerId"]
 existing=ops.expense_billing.export_rows(pid)
 if existing["items"]:raise RuntimeError("This private case already has expense billing; continue its retained course and original commands")
 try:
  buyer=receive_buyer(root=root,out=out,node=node,stop_owned=stop_owned)
  retain("original_buyer_received",buyer)
  candidates=[]
  for edition in buyer["issued"]:
   selected=next(x for x in edition["files"] if x["path"].endswith("buyer-accountant-delivery.zip"))
   data=Path(selected["path"]).read_bytes()
   check=expenses.preview(ops._context(pid),{"expectedVersion":ops._context(pid)["program"]["version"],"filename":"buyer-accountant-delivery.zip","contentBase64":base64.b64encode(data).decode()})
   if not check["inspection"]["bookkeeping"]["returns"]:raise RuntimeError("Original accountant return history is missing")
   positive=[r for r in check["inspection"]["rows"] if r["kind"]=="EXPENSE" and int(r["original"]["amount"])>=4]
   if positive:candidates.append((edition,sorted(positive,key=lambda r:r["sourceLineId"])[0]))
  if not candidates:raise RuntimeError("The original issued account has no positive expense for this customer-funded receiving")
  candidates.sort(key=lambda x:(x[0]["closeId"],x[1]["sourceLineId"]));edition,chosen=candidates[0]
  retain("original_edition_selected",{"available":[{"closeId":x[0]["closeId"],"sourceLineId":x[1]["sourceLineId"]} for x in candidates],"selectedCloseId":edition["closeId"],"sourceLineId":chosen["sourceLineId"],"reason":"First stable original close/source ID with retained accountant returns and positive native quantity."})
  for index,record in enumerate(edition["files"]):
   data=Path(record["path"]).read_bytes();name=Path(record["path"]).name
   review=expenses.preview(ops._context(pid),{"expectedVersion":ops._context(pid)["program"]["version"],"filename":name,"contentBase64":base64.b64encode(data).decode()})
   save(out/("source-preview-"+str(index)+".json"),review)
   original_command("receive-original-"+str(index),"expense.receive",{"filename":name,"contentBase64":base64.b64encode(data).decode(),"expectedPreviewSha256":review["previewSha256"]},"Retain the original issued Buyer source and accepted accountant return edition.")
  desk=current();selected=[r for r in desk["lines"] if r["workspaceId"]==BUYER_ID and r["closeId"]==edition["closeId"] and r["sourceLineId"]==chosen["sourceLineId"]]
  if len(selected)!=1:raise RuntimeError("Received original Buyer source line is not unique")
  line=selected[0]
  if line.get("attributionId"):raise RuntimeError("The original Buyer source is already attributed; retain and review its existing allocation before this separate course")
  if not desk["costs"]:raise RuntimeError("The original Operations plan has no funded work package")
  cost=sorted(desk["costs"],key=lambda x:x["id"])[0]["id"];quantity=line["original"]["amount"]
  body={"intakeId":line["intakeId"],"sourceLineId":line["sourceLineId"],"expectedSourceRowSha256":line["sourceRowSha256"],
   "allocations":[{"costId":cost,"fundingBasis":"CUSTOMER","nativeAmount":quantity,"memo":"Internal receiving selection of this retained original Buyer expense; no exchange rate is inferred."}],
   "valuation":None,"unattributedReason":"","linkedInvoiceIds":[],"linkedPurchaseIds":[],"linkedWorkIds":[]}
  saved=original_command("reviewed-customer-allocation","expense.save",body,"Select a customer-funded original native quantity for this private receiving demonstration.")
  ident=saved["recordId"];transition("customer-allocation-review","expense.review",ident,"Reviewed the exact original Buyer quantity and current accountant edition.")
  reviewed=attribution(ident)
  if reviewed["state"]!="REVIEWED" or reviewed["bookkeepingChanged"]:raise RuntimeError("The original allocation is not currently reviewed")
  amount="20.00";credit="15.00";replacement="12.00";today=datetime.datetime.now(datetime.timezone.utc).date()
  authorization=("Bryce authorized continued engineering and original product receiving in a newly restored private copy. "
   "This retained internal demonstration selects a portion of the actual issued Buyer expense for explicit USD 20.00 customer-recovery terms, "
   "then reviews USD 15.00 remaining after credit and USD 12.00 replacement. Native source units remain distinct from agreed invoice money. "
   "It records engineering scope, not outside customer assent. No outbound invoice delivery, payment, allocation or settlement is authorized by this source.")
  terms={"schema":"commons.scf-expense-private-receiving-terms.v1","authorization":authorization,"buyer":BUYER_ID,"closeId":edition["closeId"],"sourceLineId":line["sourceLineId"],"sourceRowSha256":line["sourceRowSha256"],"attributionId":ident,"costId":cost,"nativeQuantity":quantity,"chargeNativeQuantity":str(int(quantity)//2),"customerId":customer,"endpointId":endpoint,"accountingIdentity":payload["originalIdentity"],"currency":{"code":"USD","scale":2},"amount":amount,"remainingAfterCredit":credit,"replacementAmount":replacement}
  terms_raw=raw_json(terms)
  receipt=original_command("internal-expense-terms","source.add",{"filename":"internal-expense-billing-terms.json","mediaType":"application/json","kind":"other","contentBase64":base64.b64encode(terms_raw).decode(),"sourceUrl":"","observedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")},"Retain explicit internal receiving terms and actual source/customer identities.")
  source_id=receipt["recordId"];same(bytes(ops.source(pid,source_id)[1]).decode(),terms_raw.decode(),"Retained original expense terms")
  native_ids=set()
  for row in ops.commercial_changes.export_rows(pid)["items"]:
   if row.get("activeInvoiceId"):native_ids.add(row["activeInvoiceId"])
   if row["proposal"].get("invoiceId"):native_ids.add(row["proposal"]["invoiceId"])
  for row in prepared["milestones"]:
   if row.get("invoiceId"):native_ids.add(row["invoiceId"])
  protected={invoice:adapter("detail",{"endpointId":endpoint,"invoiceId":invoice}) for invoice in sorted(native_ids)}
  if len(protected)<2:raise RuntimeError("Original native paid/open invoice selection is incomplete")
  baseline_path=out/"protected-invoices.json";save(baseline_path,protected)
  control=out/"control";control.mkdir(mode=0o700)
  cfg={"origin":server.origin,"token":server.token,"nativeBaseUrl":native_info["baseUrl"],"output":str(out/"browser"),"chrome":str(chrome),"playwright":str(playwright),"caseId":pid,"planId":ops._context(pid)["program"]["planId"],"actor":actor,"endpointId":endpoint,"customerId":customer,"currency":{"code":"USD","scale":2},"sourceId":source_id,"attributionId":ident,"sourceLineId":line["sourceLineId"],"costId":cost,"expectedContentSha256":reviewed["contentSha256"],"nativeAmount":quantity,"chargeNativeAmount":terms["chargeNativeQuantity"],"amount":amount,"creditAmount":credit,"replacementAmount":replacement,"issueDate":today.isoformat(),"dueDate":(today+datetime.timedelta(days=30)).isoformat(),"effectiveDate":today.isoformat(),"authorizedOn":today.isoformat(),"authorization":authorization,"creditReviewNote":"The original Buyer credit rows remain retained and visible. These explicit internal receiving amounts do not automatically net or value those native source credits.","reason":"Operate original source portions, reviewed customer terms and recoverable native billing only in the restored private account.","protectedInvoiceIds":sorted(native_ids),"protectedSnapshotsFile":str(baseline_path),"controlDir":str(control)}
  save(out/"browser-config.json",cfg);retain("reviewed_customer_source",{"terms":terms,"sourceId":source_id,"attribution":reviewed,"protectedInvoiceIds":sorted(native_ids)})
  handled=False;child=None
  with (out/"browser.stdout").open("wb") as stdout,(out/"browser.stderr").open("wb") as stderr:
   child=subprocess.Popen([node,str(root/"course/browser-expense.cjs"),str(out/"browser-config.json")],stdout=stdout,stderr=stderr,start_new_session=True,cwd=root)
   try:
    deadline=time.monotonic()+1200
    while child.poll() is None:
     request_path=control/"request.json"
     if request_path.exists() and not handled:
      request=json.loads(request_path.read_text())
      same(request,{"id":"change-source-once","action":"revise-expense","attributionId":ident,"expectedContentSha256":reviewed["contentSha256"]},"Original browser source-change request")
      row=attribution(ident)
      if row["contentSha256"]!=request["expectedContentSha256"]:raise RuntimeError("The original source changed before its retained browser request")
      transition("source-change-reopen","expense.reopen",ident,"Reopen the original reviewed source for one actual note correction.")
      updated=expenses.allocation_input(attribution(ident));updated["allocations"][0]["memo"]+=" Original source-note correction retained during the prepared invoice review."
      original_command("source-change-save","expense.save",updated,"Retain the same original quantity with its corrected allocation note.")
      transition("source-change-review","expense.review",ident,"Review the original source after its actual note correction.")
      after=attribution(ident)
      if after["contentSha256"]==row["contentSha256"]:raise RuntimeError("Actual source correction did not produce a new original content edition")
      same([(x["costId"],x["fundingBasis"],x["nativeAmount"]) for x in row["allocations"]],[(x["costId"],x["fundingBasis"],x["nativeAmount"]) for x in after["allocations"]],"Original native allocation quantity")
      response={"id":request["id"],"state":"COMPLETED","attribution":after};save(control/"response.json",response);handled=True;retain("actual_source_note_correction",response)
     if time.monotonic()>deadline:raise TimeoutError("The complete original expense browser course exceeded its retained run allowance")
     time.sleep(.1)
    code=child.returncode
   finally:stop_owned(child)
  browser=json.loads((out/"browser/browser-result.json").read_text());retain("browser_course",browser)
  if code or browser["state"]!="COMPLETE" or not handled:raise RuntimeError("The complete original expense browser course stopped; retain this private account and exact journals")
  rows=ops.expense_billing.export_rows(pid);final=ops.expense_billing.get(pid,browser["finalChargeId"],True)
  if len(rows["items"])!=6 or len([r for r in rows["items"] if r["state"]=="CANCELLED"])!=2:raise RuntimeError("Retain both unused reviews and the four original applied expense editions")
  applied=[r for r in rows["items"] if r["state"]=="APPLIED"]
  if sorted(r["proposal"]["mode"] for r in applied)!=["CREDIT","DRAFT_EDIT","NEW","REPLACE"]:raise RuntimeError("Unexpected original expense correction history")
  commands=[c for r in rows["items"] for c in r["commands"]]
  if len(commands)!=7 or any(c["state"]!="ACKNOWLEDGED" for c in commands):raise RuntimeError("Retain seven acknowledged original expense draft/credit/replacement/issue commands")
  for invoice,previous in protected.items():
   actual=adapter("detail",{"endpointId":endpoint,"invoiceId":invoice})
   same({k:v for k,v in previous.items() if k!="revision"},{k:v for k,v in actual.items() if k!="revision"},"Protected original invoice "+invoice)
  invoice=adapter("detail",{"endpointId":endpoint,"invoiceId":final["activeInvoiceId"]})
  if invoice["invoice"]["status"]!="ISSUED" or invoice["document"]["totals"]["total"]!=replacement or Decimal(invoice["invoice"]["paid"])!=0:raise RuntimeError("Final original expense replacement differs")
  billing_raw=(out/"browser/complete-expense-billing.zip").read_bytes();case_raw=(out/"browser/complete-operations-case.zip").read_bytes()
  inventory=inspect_zip(billing_raw,"complete original expense billing");case_inventory=inspect_zip(case_raw,"complete original expense Operations case")
  with zipfile.ZipFile(io.BytesIO(billing_raw)) as z:
   manifest=json.loads(z.read("manifest.json"))
   for item in manifest["files"]:
    data=z.read(item["path"])
    if len(data)!=item["bytes"] or sha(data)!=item["sha256"]:raise RuntimeError("Expense billing member differs")
   same(json.loads(z.read("expense-billing.json")),rows,"Complete expense billing history")
   account_inventory=inspect_customer_tar(z.read("native-customer-account.tar"))
   embedded=z.read("operations.zip")
   # Compare the original operating records and retained source bytes; each exporter records its own export time.
   with zipfile.ZipFile(io.BytesIO(embedded)) as a,zipfile.ZipFile(io.BytesIO(case_raw)) as b:
    left=json.loads(a.read("operations.json"));right=json.loads(b.read("operations.json"))
    left.pop("exportedAt",None);right.pop("exportedAt",None)
    same(left,right,"Independent complete Operations records")
    same({n:sha(a.read(n)) for n in a.namelist() if n.startswith("sources/")},{n:sha(b.read(n)) for n in b.namelist() if n.startswith("sources/")},"Original Operations attachment bytes")
    with zipfile.ZipFile(io.BytesIO(a.read("planning.zip"))) as pa,zipfile.ZipFile(io.BytesIO(b.read("planning.zip"))) as pb:
     wa=json.loads(pa.read("workspace.json"));wb=json.loads(pb.read("workspace.json"));wa.pop("exportedAt",None);wb.pop("exportedAt",None)
     same(wa,wb,"Original planning source and complete revision history")
     same(sha(pa.read("original-source.json")),sha(pb.read("original-source.json")),"Original planning bytes")
  result.update({"state":"COMPLETE_AWAITING_PIXEL_INSPECTION","rows":rows,"finalChargeId":final["id"],"finalInvoiceId":final["activeInvoiceId"],"nativeRequestIds":[c["requestId"] for c in commands],"sourceId":source_id,"attributionId":ident,"terms":terms,"browser":browser,"caseExport":file_record(out/"browser/complete-operations-case.zip"),"billingExport":file_record(out/"browser/complete-expense-billing.zip")})
  retain("complete_exports",{"billing":inventory,"case":case_inventory,"nativeAccount":account_inventory,"finalInvoice":invoice})
  same(file_record(root/"original-buyer.zip")["sha256"],BUYER_SHA,"Original frozen Buyer archive")
  return result
 except BaseException as error:
  result["state"]="EXPENSE_COURSE_ERROR";result["error"]={"type":type(error).__name__,"message":str(error)}
  save(out/"expense-course-result.json",result);raise
