"""Receive the actual TONDO PDF edition into an independent, explicitly reviewed 2026–27 family case."""
from __future__ import annotations
import argparse,copy,fcntl,json,pathlib
from workspace import FamilyWorkspace,FIELDS,canonical,sha,derive,atomic

def retain(path,raw):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 if path.exists():
  if path.read_bytes()!=raw:raise ValueError("Retained original output differs: "+str(path))
 else:atomic(path,raw)
 return {"path":str(path.resolve()),"bytes":len(raw),"sha256":sha(raw)}

def verify(d):
 raw=pathlib.Path(d["path"]).read_bytes()
 if len(raw)!=d["bytes"] or sha(raw)!=d["sha256"]:raise ValueError("Complete selected file differs: "+d["path"])
 return raw

def run(input_file):
 incoming_raw=pathlib.Path(input_file).read_bytes();i=json.loads(incoming_raw)
 expected={"operationId","familyPacket","originalsDirectory","outputDirectory","actor","at"}
 if set(i)!=expected:raise ValueError("Supply the complete PDF receiving input")
 output=pathlib.Path(i["outputDirectory"]).resolve();output.mkdir(parents=True,exist_ok=True)
 with (output/".pdf-operate.lock").open("a+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  packet=verify(i["familyPacket"]);examples=pathlib.Path(__file__).parent/"examples"
  names=("tondo-registration-pdf-2026-2027-facts.json","tondo-actual-calendar-2026-2027.json","tondo-actual-policy-comparison-2026-2027.json")
  facts={n:(examples/n).read_bytes() for n in names};fixture=json.loads(facts[names[0]]);calendar=json.loads(facts[names[1]]);policy=json.loads(facts[names[2]])
  documents={}
  for d in (fixture["source"],calendar["source"],policy["sources"]["terms"]):
   path=pathlib.Path(i["originalsDirectory"])/d["filename"];raw=path.read_bytes()
   if len(raw)!=d["bytes"] or sha(raw)!=d["sha256"]:raise ValueError("Original public PDF differs: "+str(path))
   documents[d["filename"]]=(d,raw)
  selection={"schema":"class-intake.family-pdf-selection.v1","input":i,"inputSHA256":sha(incoming_raw),"engine":sha(pathlib.Path(__file__).with_name("workspace.py").read_bytes()),"driver":sha(pathlib.Path(__file__).read_bytes()),"facts":{n:{"bytes":len(b),"sha256":sha(b)} for n,b in facts.items()},"originalPDFs":{n:{"bytes":len(b),"sha256":sha(b)} for n,(d,b) in documents.items()}}
  retain(output/"selection.json",canonical(selection));result_path=output/"pdf-operated-case.json"
  if result_path.exists():
   result=json.loads(result_path.read_text())
   for d in result["files"]:verify(d)
   return result
  files=[retain(output/"original-input.json",incoming_raw),retain(output/"original-family-packet.zip",packet)]
  owner=output/"owner-workspace";recipient=output/"recipient-workspace";w=FamilyWorkspace(owner,True)
  try:
   imported=w.receive(packet);prior=imported["selected"]
   if prior["revision"]!=3 or prior["definition"]["year"]["id"]!="school-2026-2027" or prior["derived"]["totals"]["USD"]["due_minor"]!="80500":raise ValueError("This receiving requires the unchanged original funded2026–27 r3 packet")
   original_definition=copy.deepcopy(prior["definition"]);original_payments=copy.deepcopy(prior["derived"]["datasets"]["payments"])
   d=copy.deepcopy(original_definition)
   def named(note):return {"reviewer":i["actor"],"note":note,"at":i["at"]}
   def add(raw,metadata):return w.add_source(raw,metadata)["id"]
   def factual(raw,label,name,url,collected,notice):
    return add(raw,{"label":label,"filename":name,"url":url,"retrievedAt":collected,"provenance":"public-derived","notice":notice})
   pdf_ids={}
   for name,(descriptor,raw) in documents.items():
    files.append(retain(output/"originals"/name,raw))
    pdf_ids[name]=factual(raw,"Complete original TONDO "+name,name,descriptor["url"],descriptor["collectedAt"],"Exact complete public PDF bytes; no student entry or genuine signature is asserted.")
   for name,raw in facts.items():
    files.append(retain(output/"facts"/name,raw))
   factual_ids=[factual(raw,"Complete reviewed public facts "+name,name,json.loads(raw).get("source",{}).get("url",fixture["source"]["url"]),fixture["source"]["collectedAt"],"Full source-bound factual transcription retained alongside all original PDF bytes.") for name,raw in facts.items()]
   for item in fixture["sources"]:
    sid=add(canonical(item["table"]),item["metadata"]);columns=item["table"]["columns"]
    d["selections"][item["kind"]]={"source":sid,"format":"json","headers":columns,"fields":{c:{"index":n} for n,c in enumerate(columns)},"valueMaps":{}}
   rows=[{k:r[k] for k in FIELDS["enrollments"]} for r in prior["derived"]["datasets"]["enrollments"]]
   for row in rows:
    row["start"]=max(row["start"],calendar["firstClassDate"]);row["end"]=min(row["end"],calendar["lastClassDate"])
    if row["id"]=="syn-enrollment-b":
     row["plan_id"]="tondo-7-12-1x-week";row["slot_ids"]=json.dumps(["tondo-7-12-weekday-2"])
   table={"columns":list(FIELDS["enrollments"]),"rows":[[r[c] for c in FIELDS["enrollments"]] for r in rows]}
   sid=add(canonical(table),{"label":"Synthetic enrollment choices for actual PDF/calendar edition","filename":"engineering-enrollments-pdf2026.json","url":None,"retrievedAt":i["at"],"provenance":"synthetic-engineering","notice":"Same two fabricated student/enrollment IDs. Named programme choice and actual first class date; no real enrollment."})
   d["selections"]["enrollments"]={"source":sid,"format":"json","headers":table["columns"],"fields":{c:{"index":n} for n,c in enumerate(table["columns"])},"valueMaps":{}}
   d["documents"]=list(dict.fromkeys(d["documents"]+list(pdf_ids.values())+factual_ids))
   d["registration"]["source"]=pdf_ids[fixture["source"]["filename"]]
   d["registration"].update(named("Original form page3 annual new50/returning25 fees; sibling25 is an explicit charge decision below."))
   d["sibling"]["source"]=pdf_ids[policy["sources"]["terms"]["filename"]]
   d["sibling"].update(named("Terms page3 selects10%off the second child. Synthetic Student B is explicitly selected; no household-order inference."))
   d["calendar"]={"source":pdf_ids[calendar["source"]["filename"]],"excludedDates":calendar["excludedDates"],"state":"confirmed",**named("Actual complete2026–27 calendar,18closed dates. Selected enrollments begin no earlier than Sep8 and end no later than Jun26. Art shows do not imply closure.")}
   selection=d["selections"]["programmes"];table=w.table(selection["source"],"json")
   d["corrections"]=[{"kind":"programmes","source":selection["source"],"row":n+2,"field":"capacity","original":row[5],"value":"12",**named("Explicit synthetic capacity12 retained for this engineering case; actual programme capacity is unpublished.")} for n,row in enumerate(table["rows"])]
   d["chargeDecisions"]=[];d["allocations"]=[];d["exceptions"]=[];d["review"]={"status":"draft",**named("Calculate the named PDF/calendar selection before preserving exact receipt allocations.")}
   calculated=derive(d,w.base.source)
   sibling_charge=next(c for c in calculated["charges"] if c["kind"]=="registration" and c["student_id"]=="syn-student-b")
   def decimal(value):return str(int(value)//100)+"."+str(int(value)%100).zfill(2)
   d["chargeDecisions"].append({"charge":sibling_charge["id"],"originalDueMinor":sibling_charge["due_minor"],"amount":"25.00","reason":"Original registration form page3: returning students AND siblings pay25USD; synthetic Student B is the expressly chosen sibling.",**named("Source-bound sibling registration adjustment; no automatic fee stacking.")})
   for c in calculated["charges"]:
    if c["kind"]=="tuition" and not c["detail"]["fullPeriod"]:
     d["chargeDecisions"].append({"charge":c["id"],"originalDueMinor":c["due_minor"],"amount":decimal(c["due_minor"]),"reason":"Actual registration/terms specify flat monthly tuition without hourly/weekly proration; retain full September tuition despite the first class date.",**named("Named original full-month policy selection for this specific partial period.")})
   for allocation in original_definition["allocations"]:
    copied=copy.deepcopy(allocation)
    if copied["charge"]==sibling_charge["id"]:
     if copied["amount"]!="50.00":raise ValueError("Original sibling registration allocation differs")
     copied["amount"]="25.00";copied.update(named("Reduce only the original sibling registration allocation by25USD after the exact sourced fee decision; preserve the original receipt."))
    d["allocations"].append(copied)
   d["notes"]="All original household/student/payment/agreement/staff rows remain synthetic. This named third-source edition uses the complete actual registration PDF and school calendar. The two public makeup policies remain unresolved until a separate named policy selection. Prior source editions and all original receipt bytes remain in history."
   calculated=derive(d,w.base.source)
   if any(x["severity"]=="blocking" for x in calculated["issues"]):raise AssertionError("PDF review has blocking issues: "+json.dumps(calculated["issues"]))
   d["exceptions"]=[{"issue":x["key"],"decision":"acknowledged",**named("Source-bound engineering review; no real family, signed agreement or studio capacity is asserted.")} for x in calculated["issues"]]
   d["review"]={"status":"reviewed",**named("Actual PDF/calendar edition and explicit fee decisions reviewed against complete originals; selected family remains synthetic.")}
   request={"requestId":"tondo-pdf-family-7108-20261013","id":prior["id"],"expectedRevision":prior["revision"],"actor":i["actor"],"at":i["at"],"definition":d}
   files.append(retain(output/"original-save-request.json",canonical(request)));current=w.save(request)
   if current["derived"]["datasets"]["payments"]!=original_payments or current["definition"]["selections"]["payments"]!=original_definition["selections"]["payments"]:raise AssertionError("Original complete payment input changed")
   if current["derived"]["totals"]["USD"]["due_minor"]!="78000" or current["derived"]["totals"]["USD"]["unallocated_minor"]!="22000":raise AssertionError("Sourced sibling registration adjustment did not preserve exact funds")
   if not all(r["readyForRoster"] for r in current["derived"]["periodEnrollments"]):raise AssertionError("PDF engineering roster is not ready")
   for o in current["derived"]["occurrences"]:
    if o["date"]<calendar["firstClassDate"] or o["date"]>calendar["lastClassDate"] or o["date"] in calendar["excludedDates"]:raise AssertionError("Occurrence violates original calendar")
   if w.save(request)!=current:raise AssertionError("Original PDF request replay differs")
   difference=w.compare(prior["id"],prior["revision"],current["revision"])
   files.append(retain(output/"complete-family-view.json",canonical(current)));files.append(retain(output/"original-to-pdf-comparison.json",canonical(difference)))
   final_packet=w.export(current["id"],current["revision"]);files.append(retain(output/"Family_Tuition_Actual_PDF_Complete.zip",final_packet))
   if w.view(prior["id"],3)!=prior:raise AssertionError("Prior funded edition changed")
  finally:w.close()
  receiving=FamilyWorkspace(recipient,True)
  try:
   received=receiving.receive(final_packet)
   if received["selected"]!=current or receiving.export(current["id"],current["revision"])!=final_packet:raise AssertionError("Independent whole PDF receive differs")
   receiving.receive(final_packet);receiving.receive(packet)
   if receiving.view(current["id"])!=current:raise AssertionError("Earlier original packet replaced current PDF edition")
  finally:receiving.close()
  receiving=FamilyWorkspace(recipient)
  try:
   if receiving.view(current["id"])!=current:raise AssertionError("Cold PDF reopen differs")
  finally:receiving.close()
  result={"schema":"class-intake.family-pdf-operated-case.v1","state":"COMPLETE","operationId":i["operationId"],"ownerWorkspace":str(owner),"recipientWorkspace":str(recipient),"review":{"id":current["id"],"revision":current["revision"],"derivedSha256":current["derivedSha256"]},"priorReview":{"id":prior["id"],"revision":prior["revision"],"derivedSha256":prior["derivedSha256"]},"engineeringOnly":True,"providerWrites":0,"originalPaymentRowsUnchanged":True,"priorDueMinor":"80500","currentDueMinor":"78000","unallocatedMinor":"22000","originalPDFs":selection["originalPDFs"],"files":files}
  retain(result_path,canonical(result));return result

if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--input",required=True);a=p.parse_args();print(json.dumps(run(a.input),ensure_ascii=False))
