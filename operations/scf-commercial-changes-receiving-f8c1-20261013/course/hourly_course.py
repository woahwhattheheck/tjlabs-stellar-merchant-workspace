"""Operate hourly Work and customer authority in the original private receiving copy."""
import base64,copy,datetime,hashlib,importlib.util,io,json,os,subprocess,sys,time,zipfile
from decimal import Decimal
from pathlib import Path,PurePosixPath

OPERATION="SCF-HOURLY-WORK-CUSTOMER-BILLING-20261013"

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


def run_hourly_course(*,root,source,ops,pid,prepared,server,native_info,node,payload,chrome,playwright,stop_owned,checkpoint):
 from course import inspect_zip,inspect_customer_tar
 from model import digest
 root=Path(root);out=root/"course-output/hourly";out.mkdir(parents=True,exist_ok=True,mode=0o700)
 result={"schema":"commons.scf-hourly-billing-operated-course.v1","operation":OPERATION,"state":"STARTING","caseId":pid,"steps":[],"requests":[]}
 def retain(name,value):
  result["steps"].append({"name":name,"value":value,"at":datetime.datetime.now(datetime.timezone.utc).isoformat()})
  save(out/"hourly-course-result.json",result);checkpoint("hourly_"+name,value)
 actor="F8C1 internal hourly-billing receiving"
 def command(label,action,data,note):
  path=out/"requests"/(label+".json")
  if path.exists():
   body=json.loads(path.read_text())
   if body["action"]!=action or body["data"]!=data or body["note"]!=note:raise RuntimeError("Original hourly source request changed: "+label)
  else:
   body={"requestId":OPERATION+":"+label,"expectedVersion":ops._context(pid)["program"]["version"],"actor":actor,"action":action,"data":data,"note":note};save(path,body)
  receipt=ops.command(pid,body);save(out/"requests"/(label+".receipt.json"),receipt)
  result["requests"].append({"label":label,"body":body,"receipt":receipt});save(out/"hourly-course-result.json",result)
  return receipt
 adapter=ops.commercial.adapter;endpoint=prepared["endpointId"];customer=prepared["customerId"]
 if ops.work_billing.export_rows(pid)["items"]:raise RuntimeError("Continue the retained hourly course instead of opening another financial chain")
 try:
  context=ops._context(pid)
  if not context["records"]["contributors"] or not context["plan"]["scenario"]["future_costs"]:raise RuntimeError("The original case needs its retained contributor and work package")
  contributor=sorted(context["records"]["contributors"],key=lambda r:r["id"])[0]["id"]
  cost=sorted(context["plan"]["scenario"]["future_costs"],key=lambda r:r["id"])[0]["id"]
  today=datetime.datetime.now(datetime.timezone.utc).date()
  authorization=("Bryce authorized continued engineering and original product receiving in a newly restored private account copy. "
   "This internal receiving agreement uses an explicitly entered 1.0000-hour demonstration Work record, "
   "a USD 125.00 hourly rate and a whole-authority 0.2000-hour/USD 25.00 cap. "
   "The course selects 0.1600 hours/USD 20.00, then 0.1200 hours/USD 15.00 after credit and 0.0960 hours/USD 12.00 on replacement. "
   "The file records authorized engineering demonstration scope rather than outside customer assent. "
   "It authorizes no external invoice delivery, payment, allocation, refund or settlement.")
  terms={"schema":"commons.scf-hourly-private-receiving-terms.v1","authorization":authorization,
   "contributorId":contributor,"costId":cost,"customerId":customer,"endpointId":endpoint,
   "accountingIdentity":payload["originalIdentity"],"currency":{"code":"USD","scale":2},
   "hourlyRate":"125.00","rounding":"EXACT","hoursCap":"0.2000","amountCap":"25.00",
   "workHours":"1.0000","chargeHours":"0.1600","creditHours":"0.1200","replacementHours":"0.0960",
   "nativeImplementation":{"path":"stellar/scf_2026/sf47_budget_model/workspace/operations_work_billing.py",
      **file_record(source/"stellar/scf_2026/sf47_budget_model/workspace/operations_work_billing.py")}}
  terms_raw=raw_json(terms)
  attached=command("internal-hourly-terms","source.add",{"filename":"internal-hourly-billing-terms.json",
   "mediaType":"application/json","kind":"other","contentBase64":base64.b64encode(terms_raw).decode(),
   "sourceUrl":"","observedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")},
   "Retain original private receiving terms, declared hourly quantities and exact implementation source.")
  source_id=attached["recordId"]
  same(sha(bytes(ops.source(pid,source_id)[1])),sha(terms_raw),"Original hourly authority bytes")
  data={"contributorId":contributor,"costId":cost,"description":"Private receiving course: operate original hourly authority, Work source and native customer billing.",
   "startDate":today.isoformat(),"endDate":today.isoformat(),"hours":"1.0000","fundingBasis":"CUSTOMER",
   "sourceIds":[source_id],"sourceNote":"Explicit internal engineering demonstration quantity retained in the original private receiving source."}
  created=command("work-record","work.save",data,"Record the original Work ledger entry for the private receiving course.")
  work_id=created["recordId"]
  command("work-submit","work.submit",{"id":work_id},"Submit the original private receiving Work record.")
  command("work-accept","work.accept",{"id":work_id},"Accept the exact retained private receiving Work edition.")
  def work():return next(r for r in ops._context(pid)["records"]["work"] if r["id"]==work_id)
  original=work()
  if original["state"]!="ACCEPTED":raise RuntimeError("Actual original Work acceptance is absent")
  native_ids={r["invoiceId"] for r in prepared["milestones"] if r.get("invoiceId")}
  for domain in (ops.commercial_changes,ops.expense_billing):
   for row in domain.export_rows(pid)["items"]:
    if row.get("activeInvoiceId"):native_ids.add(row["activeInvoiceId"])
    if row["proposal"].get("invoiceId"):native_ids.add(row["proposal"]["invoiceId"])
  protected={ident:adapter("detail",{"endpointId":endpoint,"invoiceId":ident}) for ident in sorted(native_ids)}
  if len(protected)<2:raise RuntimeError("Original paid/open accounting identities are incomplete")
  baseline=out/"protected-invoices.json";save(baseline,protected)
  control=out/"control";control.mkdir(mode=0o700)
  cfg={"origin":server.origin,"token":server.token,"nativeBaseUrl":native_info["baseUrl"],"output":str(out/"browser"),
   "chrome":str(chrome),"playwright":str(playwright),"caseId":pid,"planId":ops._context(pid)["program"]["planId"],
   "actor":actor,"endpointId":endpoint,"customerId":customer,"currency":{"code":"USD","scale":2},
   "sourceId":source_id,"workId":work_id,"contributorId":contributor,"costId":cost,
   "chargeHours":"0.1600","creditHours":"0.1200","replacementHours":"0.0960","hourlyRate":"125.00",
   "amount":"20.00","creditAmount":"15.00","replacementAmount":"12.00",
   "issueDate":today.isoformat(),"dueDate":(today+datetime.timedelta(days=30)).isoformat(),"effectiveDate":today.isoformat(),
   "authorizedOn":today.isoformat(),"authorization":authorization,
   "reason":"Operate actual accepted Work and explicit retained hourly terms only in the restored private account.",
   "protectedInvoiceIds":sorted(native_ids),"protectedSnapshotsFile":str(baseline),"controlDir":str(control)}
  save(out/"browser-config.json",cfg);retain("accepted_original_work",{"terms":terms,"sourceId":source_id,"work":original})
  handled=False
  with (out/"browser.stdout").open("wb") as stdout,(out/"browser.stderr").open("wb") as stderr:
   child=subprocess.Popen([node,str(root/"course/browser-hourly.cjs"),str(out/"browser-config.json")],stdout=stdout,stderr=stderr,start_new_session=True,cwd=root)
   try:
    deadline=time.monotonic()+1200
    while child.poll() is None:
     request_path=control/"request.json"
     if request_path.exists() and not handled:
      request=json.loads(request_path.read_text())
      same(request,{"id":"change-source-once","action":"revise-work","workId":work_id,"expectedWorkSha256":digest(original)},"Original Work source-change request")
      same(work(),original,"Original Work before recorded correction")
      command("work-reopen","work.reopen",{"id":work_id},"Reopen the original Work for one actual description correction.")
      updated={**data,"id":work_id,"description":data["description"]+" Original source description clarified before native charge."}
      command("work-correct","work.save",updated,"Retain corrected original description with the same actual demonstration hours.")
      command("work-resubmit","work.submit",{"id":work_id},"Resubmit the corrected original Work.")
      command("work-reaccept","work.accept",{"id":work_id},"Accept the current original Work edition after clarification.")
      after=work()
      if digest(after)==digest(original) or after["hours"]!=original["hours"]:raise RuntimeError("Original Work correction changed quantity or failed to update")
      save(control/"response.json",{"id":request["id"],"state":"COMPLETED","work":after});handled=True
      retain("actual_work_source_correction",after)
     if time.monotonic()>deadline:raise TimeoutError("Complete hourly browser receiving exceeded its retained allowance")
     time.sleep(.1)
    code=child.returncode
   finally:stop_owned(child)
  browser=json.loads((out/"browser/browser-result.json").read_text());retain("browser_course",browser)
  if code or browser["state"]!="COMPLETE" or not handled:raise RuntimeError("Retain the complete original hourly case and journals after the browser outcome")
  rows=ops.work_billing.export_rows(pid);final=ops.work_billing.get(pid,browser["finalChargeId"],True)
  if len(rows["items"])!=6 or len([r for r in rows["items"] if r["state"]=="CANCELLED"])!=2 or len(rows["authorities"])!=1:raise RuntimeError("Complete original hourly review/authority history differs")
  applied=[r for r in rows["items"] if r["state"]=="APPLIED"]
  if sorted(r["proposal"]["mode"] for r in applied)!=["CREDIT","DRAFT_EDIT","NEW","REPLACE"]:raise RuntimeError("Original hourly correction course is incomplete")
  commands=[c for r in rows["items"] for c in r["commands"]]
  if len(commands)!=7 or any(c["state"]!="ACKNOWLEDGED" for c in commands):raise RuntimeError("Original hourly native acknowledgements are incomplete")
  for ident,previous in protected.items():
   actual=adapter("detail",{"endpointId":endpoint,"invoiceId":ident})
   same({k:v for k,v in previous.items() if k!="revision"},{k:v for k,v in actual.items() if k!="revision"},"Protected original invoice "+ident)
  invoice=adapter("detail",{"endpointId":endpoint,"invoiceId":final["activeInvoiceId"]})
  if invoice["invoice"]["status"]!="ISSUED" or invoice["document"]["totals"]["total"]!="12.00" or Decimal(invoice["invoice"]["paid"])!=0:raise RuntimeError("Actual hourly replacement differs")
  billing_raw=(out/"browser/complete-hourly-billing.zip").read_bytes()
  case_raw=(out/"browser/complete-operations-case.zip").read_bytes()
  inventory=inspect_zip(billing_raw,"complete original hourly billing");case_inventory=inspect_zip(case_raw,"complete original hourly Operations")
  with zipfile.ZipFile(io.BytesIO(billing_raw)) as z:
   manifest=json.loads(z.read("manifest.json"))
   for item in manifest["files"]:
    raw=z.read(item["path"])
    if len(raw)!=item["bytes"] or sha(raw)!=item["sha256"]:raise RuntimeError("Complete hourly billing member differs")
   same(json.loads(z.read("work-billing.json")),rows,"Complete original hourly authority/charge history")
   account_inventory=inspect_customer_tar(z.read("native-customer-account.tar"))
   with zipfile.ZipFile(io.BytesIO(z.read("operations.zip"))) as a,zipfile.ZipFile(io.BytesIO(case_raw)) as b:
    left=json.loads(a.read("operations.json"));right=json.loads(b.read("operations.json"));left.pop("exportedAt",None);right.pop("exportedAt",None)
    same(left,right,"Complete original hourly Operations records")
    same({n:sha(a.read(n)) for n in a.namelist() if n.startswith("sources/")},{n:sha(b.read(n)) for n in b.namelist() if n.startswith("sources/")},"Original hourly source bytes")
  result.update({"state":"COMPLETE_AWAITING_PIXEL_INSPECTION","rows":rows,"finalChargeId":final["id"],"finalInvoiceId":final["activeInvoiceId"],
   "nativeRequestIds":[c["requestId"] for c in commands],"sourceId":source_id,"workId":work_id,"terms":terms,"browser":browser,
   "caseExport":file_record(out/"browser/complete-operations-case.zip"),"billingExport":file_record(out/"browser/complete-hourly-billing.zip")})
  retain("complete_exports",{"billing":inventory,"case":case_inventory,"nativeAccount":account_inventory,"finalInvoice":invoice})
  return result
 except BaseException as error:
  result["state"]="HOURLY_COURSE_ERROR";result["error"]={"type":type(error).__name__,"message":str(error)}
  save(out/"hourly-course-result.json",result);raise
