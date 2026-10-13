"""Complete source-bound TONDO engineering example, with original household/year history.
No customer records, payment API, registration email or vendor import is executed.
"""
from __future__ import annotations
import argparse,copy,fcntl,json,pathlib,sys,zipfile,io,datetime as dt
from workspace import FamilyWorkspace,FIELDS,canonical,sha,derive,Conflict,atomic
AT="2026-10-13T05:15:25Z"
ACTOR="TJLabs family tuition receiving operator 7108"
def retained(path,body):
 path=pathlib.Path(path)
 if path.exists():
  if path.read_bytes()!=body:raise ValueError("Retained complete output differs: "+str(path))
 else:atomic(path,body)
 return {"path":str(path.resolve()),"bytes":len(body),"sha256":sha(body)}
def named(note):return {"reviewer":ACTOR,"note":note,"at":AT}
def full_table(kind,rows):return {"columns":list(FIELDS[kind]),"rows":[[str(row.get(k,"")) for k in FIELDS[kind]] for row in rows]}
def run(output):
 output=pathlib.Path(output).resolve();output.mkdir(parents=True,exist_ok=True)
 with (output/".operate.lock").open("a+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  fixture_root=pathlib.Path(__file__).parent/"examples"
  originals={name:(fixture_root/name).read_bytes() for name in ("tondo-homepage-2026-2027-facts.json","tondo-artclasses-2026-2027-facts.json","tondo-publication-comparison.json")}
  selection={"schema":"class-intake.family-operated-selection.v1","operationId":"TONDO-FAMILY-TUITION-7108-20261013","output":str(output),"sources":{n:{"bytes":len(b),"sha256":sha(b)} for n,b in originals.items()},"engine":sha(pathlib.Path(__file__).with_name("workspace.py").read_bytes()),"driver":sha(pathlib.Path(__file__).read_bytes()),"actor":ACTOR,"at":AT}
  retained(output/"selection.json",canonical(selection));result_path=output/"operated-case.json"
  if result_path.exists():
   result=json.loads(result_path.read_text())
   for f in result["files"]:
    raw=pathlib.Path(f["path"]).read_bytes()
    if len(raw)!=f["bytes"] or sha(raw)!=f["sha256"]:raise ValueError("Completed original result member differs")
   return result
  source=output/"owner-workspace";recipient=output/"recipient-workspace";w=FamilyWorkspace(source,True);files=[]
  try:
   fixtures={name:json.loads(body) for name,body in originals.items()};published={}
   for filename,fixture in fixtures.items():
    files.append(retained(output/"public-sources"/filename,originals[filename]))
    if "edition" not in fixture:continue
    edition=fixture["edition"];published[edition]={}
    for item in fixture["sources"]:
     row=w.add_source(canonical(item["table"]),item["metadata"]);columns=item["table"]["columns"]
     published[edition][item["kind"]]={"source":row["id"],"format":"json","headers":columns,"fields":{c:{"index":i} for i,c in enumerate(columns)},"valueMaps":{}}
    published[edition]["document"]=w.add_source(originals[filename],{"label":"Complete original public-facts edition "+edition,"filename":filename,"url":fixture["source"]["url"],"retrievedAt":fixture["source"]["collectedAt"],"provenance":"public-derived","notice":"Full factual transcription; original HTML/PDF bytes are not claimed."})["id"]
   def synthetic(kind,rows,label):
    table=full_table(kind,rows);info=w.add_source(canonical(table),{"label":label,"filename":label+".json","url":None,"retrievedAt":AT,"provenance":"synthetic-engineering","notice":"Fabricated operational example; no real household, student, agreement, receipt, capacity or confirmation."})
    return {"source":info["id"],"format":"json","headers":table["columns"],"fields":{c:{"index":i} for i,c in enumerate(table["columns"])},"valueMaps":{}}
   calendar=w.add_source(b"ENGINEERING CALENDAR ONLY. Two explicitly selected billing periods: September and October. No excluded dates. This is not TONDO's unavailable published calendar or terms.",{"label":"Engineering calendar decision","filename":"engineering-calendar.txt","retrievedAt":AT,"provenance":"synthetic-engineering","notice":"Not an institution calendar or terms document."})["id"]
   agreement=w.add_source(b"ENGINEERING AGREEMENT ONLY. Synthetic signatory reference; no legal signature and no actual student. Source observer records the selected annual validity dates.",{"label":"Synthetic agreement example","filename":"engineering-agreement.txt","retrievedAt":AT,"provenance":"synthetic-engineering","notice":"No genuine agreement or signature."})["id"]
   household=[{"id":"syn-household","label":"Engineering family","contact_ref":"synthetic-no-contact"}]
   students=[{"id":"syn-student-a","household_id":"syn-household","name":"Synthetic Student A","birth_date":"2021-01-15","registration_type":"new"},{"id":"syn-student-b","household_id":"syn-household","name":"Synthetic Student B","birth_date":"2018-02-10","registration_type":"new"}]
   def periods(year):return [{"id":"sep-"+str(year),"label":"September "+str(year),"start":str(year)+"-09-01","end":str(year)+"-09-30","due":str(year)+"-09-01"},{"id":"oct-"+str(year),"label":"October "+str(year),"start":str(year)+"-10-01","end":str(year)+"-10-31","due":str(year)+"-10-01"}]
   def enrollments(year,band):
    return [{"id":"syn-enrollment-a","student_id":"syn-student-a","plan_id":"tondo-4-6-1x-week","slot_ids":json.dumps(["tondo-4-6-weekday-1"]),"start":str(year)+"-09-01","end":str(year)+"-10-31","status":"active"},{"id":"syn-enrollment-b","student_id":"syn-student-b","plan_id":band+"-1x-week","slot_ids":json.dumps([band+"-weekday-2"]),"start":str(year)+"-09-01","end":str(year)+"-10-31","status":"active"}]
   def agreements(year):return [{"id":"syn-agreement-"+sid+"-"+str(year),"student_id":sid,"document_source":agreement,"signed_at":AT,"valid_from":str(year)+"-09-01","valid_to":str(year+1)+"-08-31","status":"signed","signer_ref":"synthetic-signatory"} for sid in ("syn-student-a","syn-student-b")]
   def confirmations(year):return [{"id":"syn-confirmation-"+eid+"-"+p["id"],"enrollment_id":eid,"period_id":p["id"],"status":"confirmed","actor":"Synthetic staff observer","at":AT} for eid in ("syn-enrollment-a","syn-enrollment-b") for p in periods(year)]
   payments=[{"id":"syn-receipt-1","household_id":"syn-household","gross":"1000.00","refund":"0.00","currency":"USD","status":"posted","posted_at":AT,"provider_ref":"synthetic-receipt-reference-1"}]
   home=published["homepage-2026-2027"];classes=published["artclasses-2026-2027"]
   selections={k:home[k] for k in ("programmes","plans","slots")}
   for kind,rows in (("households",household),("students",students),("enrollments",enrollments(2026,"tondo-7-10")),("payments",payments),("agreements",agreements(2026)),("confirmations",confirmations(2026))):selections[kind]=synthetic(kind,rows,"engineering-"+kind+"-2026-home")
   d={"name":"TONDO public-edition / engineering-family handover","notes":"All household, capacity, agreement, payment and confirmation rows are synthetic. The two current public programme editions are retained independently; no original terms or annual calendar has been received.","year":{"id":"school-2026-2027","label":"Engineering selection 2026–2027","start":"2026-09-01","end":"2027-08-31","timezone":"America/New_York","periods":periods(2026)},"currencyDigits":{"USD":2},"selections":selections,"documents":[home["document"],classes["document"],calendar,agreement],"registration":{"source":home["document"],"new":"50.00","returning":"25.00","currency":"USD","scope":"student-year",**named("Published fee amounts; once-per-student/year is an explicit engineering interpretation awaiting institutional confirmation.")},"sibling":{"source":home["document"],"basisPoints":1000,"eligibleEnrollmentIds":["syn-enrollment-b"],"rounding":"half-up",**named("Engineering eligibility selects only the second enrollment and tuition; the original listing does not define this basis.")},"calendar":{"source":calendar,"excludedDates":[],"state":"confirmed",**named("Confirmed only against the labelled engineering calendar; no institutional holidays or cancellation terms inferred.")},"corrections":[],"chargeDecisions":[],"allocations":[],"exceptions":[],"review":{"status":"draft",**named("Original homepage edition selected for an engineering baseline.")}}
   def capacities(definition):
    selection=definition["selections"]["programmes"];table=w.table(selection["source"],"json");rows=table["rows"]
    return [{"kind":"programmes","source":selection["source"],"row":i+2,"field":"capacity","original":row[5],"value":"12",**named("Synthetic capacity of twelve for the operational example; actual studio capacity is unpublished.")} for i,row in enumerate(rows)]
   d["corrections"]=capacities(d)
   def save(label,definition,prior=None):
    request={"requestId":"tondo-engineering-"+label+"-7108","actor":ACTOR,"at":AT,"definition":definition}
    if prior:request.update(id=prior["id"],expectedRevision=prior["revision"])
    result=w.save(request);files.append(retained(output/"requests"/(label+".json"),canonical(request)));files.append(retained(output/"revisions"/(label+".json"),canonical(result)));return result
   first=save("homepage-baseline",d)
   d=copy.deepcopy(d);d["selections"].update({k:classes[k] for k in ("programmes","plans","slots")});d["selections"]["enrollments"]=synthetic("enrollments",enrollments(2026,"tondo-7-9"),"engineering-enrollments-2026-artclasses");d["registration"]["source"]=classes["document"];d["sibling"]["source"]=classes["document"];d["corrections"]=capacities(d);d["review"]={"status":"draft",**named("Named selection of the independent artclasses page; original adult-price, age-band and duration conflicts remain preserved.")}
   second=save("artclasses-selection",d,first)
   difference=w.compare(first["id"],1,2)
   if not difference["changes"] or not any(x["kind"]=="source-plans" for x in difference["changes"]):raise AssertionError("Actual original publication differences missing")
   files.append(retained(output/"publication-comparison.json",canonical(difference)))
   def fund(definition):
    definition=copy.deepcopy(definition);definition["review"]={"status":"draft",**named("Calculate exact original receipt allocations")};definition["allocations"]=[];definition["exceptions"]=[]
    current=derive(definition,w.base.source);balances={p["payment"]:int(p["available_minor"]) for p in current["paymentBalances"]}
    for charge in current["charges"]:
     due=int(charge["due_minor"])
     for payment in sorted(balances):
      use=min(due,balances[payment])
      if use:
       definition["allocations"].append({"payment":payment,"charge":charge["id"],"amount":str(use//100)+"."+str(use%100).zfill(2),**named("Synthetic observed same-household receipt allocation; no provider transaction.")});due-=use;balances[payment]-=use
      if due==0:break
     if due:raise AssertionError("Example receipts do not fund the selected charges")
    current=derive(definition,w.base.source)
    if any(i["severity"]=="blocking" for i in current["issues"]):raise AssertionError("Example contains blocking issues: "+json.dumps(current["issues"]))
    definition["exceptions"]=[{"issue":i["key"],"decision":"acknowledged",**named("Source conflict retained for review; only the explicitly selected synthetic child enrollments are handed over. No absent institutional policy is asserted.")} for i in current["issues"]]
    definition["review"]={"status":"reviewed",**named("Complete engineering household/receipt/agreement/confirmation handover; public facts retain their original editions.")}
    return definition
   d=fund(d);third=save("funded-confirmed",d,second)
   if third["derived"]["totals"]["USD"]["due_minor"]!="80500" or third["derived"]["totals"]["USD"]["unallocated_minor"]!="19500" or not all(r["readyForRoster"] for r in third["derived"]["periodEnrollments"]):raise AssertionError("Actual engineering tuition/discount/registration/roster differs")
   old_packet=w.export(third["id"],third["revision"]);files.append(retained(output/"Year_2026_Complete.zip",old_packet))
   d=copy.deepcopy(d);d["year"]={"id":"school-2027-2028","label":"Engineering selection 2027–2028","start":"2027-09-01","end":"2028-08-31","timezone":"America/New_York","periods":periods(2027)}
   d["rollover"]={**w.rollover_preview(third["id"],third["revision"]),**named("Explicit carry of original student identities and only previously unused receipt funds.")}
   for s in students:s["registration_type"]="returning"
   for kind,rows in (("students",students),("enrollments",enrollments(2027,"tondo-7-9")),("agreements",agreements(2027)),("confirmations",confirmations(2027))):d["selections"][kind]=synthetic(kind,rows,"engineering-"+kind+"-2027")
   payments.append({"id":"syn-receipt-2","household_id":"syn-household","gross":"1000.00","refund":"0.00","currency":"USD","status":"posted","posted_at":AT,"provider_ref":"synthetic-receipt-reference-2"})
   d["selections"]["payments"]=synthetic("payments",payments,"engineering-payments-2027");d["allocations"]=[];d["chargeDecisions"]=[];d["exceptions"]=[];d["review"]={"status":"draft",**named("Original year rollover preserves previously consumed funds.")}
   fourth=save("rollover-draft",d,third)
   carried=next(p for p in fourth["derived"]["paymentBalances"] if p["payment"]=="syn-receipt-1")
   if carried["prior_consumed_minor"]!="80500" or carried["available_minor"]!="19500":raise AssertionError("Prior-year consumed receipt became available twice")
   d=fund(d);fifth=save("rollover-reviewed",d,fourth)
   if fifth["derived"]["totals"]["USD"]["due_minor"]!="75500" or fifth["derived"]["totals"]["USD"]["unallocated_minor"]!="44000":raise AssertionError("Actual returning-year fee/credit differs")
   original=json.loads((output/"requests"/"rollover-reviewed.json").read_text())
   if w.save(original)!=fifth:raise AssertionError("Same original request did not replay")
   changed=copy.deepcopy(original);changed["definition"]["notes"]="Changed body"
   try:w.save(changed)
   except Conflict:pass
   else:raise AssertionError("Changed request body reused original ID")
   final_packet=w.export(fifth["id"],fifth["revision"]);files.append(retained(output/"Family_Tuition_Complete.zip",final_packet));files.append(retained(output/"year-rollover-comparison.json",canonical(w.compare(first["id"],3,5))))
   w.close();w=None
   receiving=FamilyWorkspace(recipient,True)
   try:
    imported=receiving.receive(final_packet)
    if imported["selected"]!=fifth or receiving.export(fifth["id"],5)!=final_packet:raise AssertionError("Complete independent reconstruction differs")
    receiving.receive(final_packet);receiving.receive(old_packet)
    if receiving.view(fifth["id"])!=fifth:raise AssertionError("Earlier packet replaced later history")
   finally:receiving.close()
   receiving=FamilyWorkspace(recipient)
   try:
    if receiving.view(fifth["id"])!=fifth:raise AssertionError("Cold reopen differs")
   finally:receiving.close()
   result={"schema":"class-intake.family-operated-case.v1","state":"COMPLETE","operationId":selection["operationId"],"ownerWorkspace":str(source),"recipientWorkspace":str(recipient),"review":{"id":fifth["id"],"revision":fifth["revision"],"derivedSha256":fifth["derivedSha256"]},"publicEditions":list(published),"engineeringOnly":True,"providerWrites":0,"firstYearDueMinor":"80500","priorReceiptConsumedMinor":"80500","carriedCreditMinor":"19500","nextYearDueMinor":"75500","remainingCreditMinor":"44000","files":files}
   retained(result_path,canonical(result));return result
  finally:
   if w is not None:w.close()
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--output",required=True);a=p.parse_args();print(json.dumps(run(a.output),ensure_ascii=False))
