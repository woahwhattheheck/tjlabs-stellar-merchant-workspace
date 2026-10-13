"""Operate the complete TONDO make-up ledger from the independently received actual-PDF family.
Every household, notice, instructor approval, capacity, absence and attendance action is
a labelled engineering example. The original three PDF files and original payments
remain unchanged. This program performs no provider or customer communication.
"""
from __future__ import annotations
import argparse,copy,fcntl,io,json,os,pathlib,secrets,sys,zipfile
from makeup import MakeupWorkspace,POLICIES,canonical,sha,Conflict,ReceiveRejected
ACTOR="TJLabs make-up engineering operator 7108"
OPERATION="TONDO-MAKEUP-7108-20261013"
FIRST="2026-09-08T09:00:00Z"
FINAL="2026-10-12T14:00:00Z"

def need(value,message):
 if not value:raise AssertionError(message)
def ident(path):
 raw=pathlib.Path(path).read_bytes()
 return {"path":str(pathlib.Path(path).resolve()),"bytes":len(raw),"sha256":sha(raw)}
def private(path):
 path=pathlib.Path(path);path.mkdir(mode=0o700,parents=True,exist_ok=True)
 info=path.lstat()
 if path.is_symlink() or not path.is_dir() or info.st_mode&0o077:raise ValueError("Select an original private output directory")
 return path
def exact(path,raw):
 path=pathlib.Path(path);private(path.parent)
 if path.exists() or path.is_symlink():
  if path.is_symlink() or not path.is_file() or path.read_bytes()!=raw:raise ValueError("Retained original output differs: "+str(path))
  return ident(path)
 stage=path.with_name("."+path.name+".partial-"+secrets.token_hex(8))
 with stage.open("xb") as stream:
  os.fchmod(stream.fileno(),0o600);stream.write(raw);stream.flush();os.fsync(stream.fileno())
 need(stage.read_bytes()==raw,"Complete output stage differs")
 try:os.link(stage,path,follow_symlinks=False)
 except FileExistsError:need(path.is_file() and not path.is_symlink() and path.read_bytes()==raw,"Concurrent output differs")
 else:stage.unlink()
 fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
 return ident(path)
def named(note,at=FIRST):return {"reviewer":ACTOR,"note":note,"at":at}
def snapshot(w,only_family=False):
 tables=("sources","revisions","requests","family_revisions","family_requests") if only_family else ("sources","revisions","requests","family_revisions","family_requests","makeup_revisions","makeup_requests")
 values={}
 for table in tables:
  cols=[r[1] for r in w.db.execute("PRAGMA table_info("+table+")")]
  result=[]
  for row in w.db.execute("SELECT * FROM "+table+" ORDER BY "+",".join(cols[:2] if table.endswith("revisions") else cols[:1])):
   result.append([{"bytes":len(v),"sha256":sha(v)} if isinstance(v,bytes) else v for v in row])
  values[table]={"columns":cols,"rows":result}
 return sha(canonical(values))
def open_workspace(path):
 return MakeupWorkspace(path,create=not pathlib.Path(path).exists())
def zip_members(raw):
 with zipfile.ZipFile(io.BytesIO(raw)) as z:return {n:z.read(n) for n in z.namelist()}
def repack(members):
 out=io.BytesIO()
 with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
  for name,body in sorted(members.items()):
   info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,body)
 return out.getvalue()

def run(family_result,output):
 os.umask(0o077);output=private(pathlib.Path(output).resolve());family_result=pathlib.Path(family_result).resolve()
 with (output/"operate.lock").open("a+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  supplied=json.loads(family_result.read_bytes())
  need(supplied["schema"]=="class-intake.family-pdf-operated-case.v1" and supplied["state"]=="COMPLETE" and supplied["engineeringOnly"] is True and supplied["originalPaymentRowsUnchanged"] is True,"Select the original complete actual-PDF family continuation")
  selected=[f for f in supplied["files"] if pathlib.Path(f["path"]).name=="Family_Tuition_Actual_PDF_Complete.zip"]
  need(len(selected)==1,"Select the one complete original family packet")
  original=selected[0];raw=pathlib.Path(original["path"]).read_bytes()
  need(len(raw)==original["bytes"] and sha(raw)==original["sha256"],"The original full family packet differs")
  source=output/"owner-workspace";receiver=output/"recipient-workspace"
  selection={"schema":"class-intake.family-makeup-operated-selection.v1","operationId":OPERATION,"output":str(output),"familyResult":ident(family_result),"familyPacket":original,"family":supplied["review"],"actor":ACTOR,"engineeringOnly":True,"providerWrites":0}
  exact(output/"selection.json",canonical(selection))
  engine=ident(pathlib.Path(__file__).with_name("makeup.py"));driver=ident(__file__)
  exact(output/"source-editions"/(engine["sha256"]+".py"),pathlib.Path(engine["path"]).read_bytes())
  exact(output/"source-editions"/(driver["sha256"]+".py"),pathlib.Path(driver["path"]).read_bytes())
  result_path=output/"makeup-operated-case.json"
  if result_path.exists():
   result=json.loads(result_path.read_bytes())
   for f in result["files"]:need(ident(f["path"])==f,"A completed selected output changed")
   need(ident(result["package"]["path"])==result["package"],"Complete engineering package differs")
   return result
  files=[]
  def keep(name,body):
   f=exact(output/name,body);files.append(f);return f
  keep("inputs/family-result.json",family_result.read_bytes());keep("inputs/Family_Tuition_Actual_PDF_Complete.zip",raw)
  w=open_workspace(source)
  try:
   adopted=w.family.receive(raw);family=w.family.view(supplied["review"]["id"],supplied["review"]["revision"])
   need({k:family[k] for k in ("id","revision","derivedSha256")}==supplied["review"],"Actual-PDF family edition differs")
   need(family["derived"]["totals"]["USD"]["due_minor"]=="78000" and family["derived"]["totals"]["USD"]["unallocated_minor"]=="22000","Original explicitly reviewed PDF tuition differs")
   need(all(r["readyForRoster"] for r in family["derived"]["periodEnrollments"]),"The selected original family roster is not ready")
   for policy in POLICIES.values():need(sha(w.base.source(policy["source"]))==policy["source"],"A complete original policy PDF is absent")
   keep("inputs/complete-family-view.json",canonical(family));original_family=snapshot(w,True)
   policies=[
    {"id":"registration-selected","editionId":"registration-form-page3","source":POLICIES["registration-form-page3"]["source"],"semesters":[],**named("Explicit registration-form page 3 selection; no numerical annual cap is invented.","2026-09-08T08:00:00Z")},
    {"id":"terms-selected","editionId":"terms-pages1-2","source":POLICIES["terms-pages1-2"]["source"],"semesters":[{"id":"autumn-engineering","label":"Explicit engineering autumn semester","start":"2026-09-08","end":"2026-12-31"},{"id":"spring-engineering","label":"Explicit engineering spring semester","start":"2027-01-01","end":"2027-06-26"}],**named("Separate Terms pages 1–2 selection. Semester boundaries are named engineering decisions; neither precedence nor these dates is claimed from the PDF.","2026-09-08T08:01:00Z")}]
   def absence(id,eid,day,slot,policy="registration-selected",notice="2026-09-08T08:00:00Z",exception=False,at=FIRST):
    return {"id":id,"policyId":policy,"enrollmentId":eid,"date":day,"slotId":slot,"noticeAt":notice,"noticeRef":"engineering-notice-"+id,"reason":"illness" if exception else "other","exception":({"reference":"engineering-studio-exception-"+id,**named("Named synthetic studio discretion for illness; only notice is waived.","2026-09-08T08:30:00Z")} if exception else None),**named("Synthetic absence/cancellation of this exact original occurrence; no real student notice.",at)}
   absences=[absence("terms-"+str(i+1),"syn-enrollment-b",day,"tondo-7-12-weekday-2","terms-selected") for i,day in enumerate(("2026-09-09","2026-09-16","2026-09-23","2026-09-30","2026-10-07"))]
   absences += [absence("registration-lesson","syn-enrollment-a","2026-09-08","tondo-4-6-weekday-1",exception=True),absence("pause-expiry-lesson","syn-enrollment-a","2026-09-29","tondo-4-6-weekday-1"),absence("later-registration-selection","syn-enrollment-b","2026-10-14","tondo-7-12-weekday-2")]
   d={"name":"TONDO actual policy editions / engineering make-up ledger","notes":"Complete actual PDF policies and calendar with explicitly synthetic operational events. Conflicting policy editions remain separately named, selected per absence. Choosing the registration form for a later absence is explicit; its lack of a numerical annual limit does not change the retained Terms history. No customer action, genuine notice or instructor approval is claimed.","family":supplied["review"],"asOf":"2026-09-08T09:30:00Z","policies":policies,"absences":absences,"membershipEvents":[],"bookingEvents":[],"review":{"status":"reviewed",**named("Review both conflicting published policy editions and the unchanged actual-PDF family binding.","2026-09-08T09:30:00Z")}}
   def save(label,definition,at,prior=None,workspace=None):
    workspace=workspace or w;definition=copy.deepcopy(definition);definition["asOf"]=at;definition["review"]={"status":"reviewed",**named("Synthetic operated step: "+label,at)}
    request={"requestId":"tondo-makeup-"+label+"-7108","actor":ACTOR,"at":at,"definition":definition}
    if prior:request.update(id=prior["id"],expectedRevision=prior["revision"])
    keep("requests/"+label+".json",canonical(request));result=workspace.save(request);keep("revisions/"+label+".json",canonical(result));return result
   def target(day,slot,at,capacity=12,pending=False):
    return {"date":day,"slotId":slot,"capacity":capacity,"capacityRef":"original-family-synthetic-capacity-12","instructor":"" if pending else "Synthetic TONDO instructor","confirmation":{"status":"pending" if pending else "confirmed","reference":"" if pending else "engineering-studio-approval",**named("Synthetic studio availability and instructor observation; not an institution approval.",at)}}
   def event(id,aid,kind,at,day=None,slot=None,capacity=12,pending=False):
    return {"id":id,"absenceId":aid,"kind":kind,"target":target(day,slot,at,capacity,pending) if day else None,**named("Synthetic named "+kind+" observation preserving the original lesson identity.",at)}
   first=save("policy-and-absence-review",d,"2026-09-08T09:30:00Z")
   d=copy.deepcopy(first["definition"])
   for i,day in enumerate(("2026-09-12","2026-09-19","2026-09-26","2026-10-03")):
    d["bookingEvents"].append(event("terms-book-"+str(i+1),"terms-"+str(i+1),"book",f"2026-09-08T10:0{i+1}:00Z",day,"tondo-7-12-weekday-5"))
   d["bookingEvents"] += [
    event("registration-wait","registration-lesson","waitlist","2026-09-08T10:05:00Z","2026-09-11","tondo-4-6-weekday-4",pending=True),
    event("registration-book","registration-lesson","book","2026-09-08T10:06:00Z","2026-09-11","tondo-4-6-weekday-4"),
    event("registration-reschedule","registration-lesson","reschedule","2026-09-08T10:07:00Z","2026-09-18","tondo-4-6-weekday-4"),
    event("registration-cancel","registration-lesson","cancel","2026-09-08T10:08:00Z"),
    event("registration-rebook","registration-lesson","book","2026-09-08T10:09:00Z","2026-09-25","tondo-4-6-weekday-4")]
   second=save("original-booking-lifecycle",d,"2026-09-08T10:10:00Z",first)
   keep("packets/Original_Booking_Lifecycle.zip",w.export(second["id"],second["revision"]))
   rejection_results=[]
   def reject(label,anchor,mutate,codes,at="2026-09-08T10:30:00Z"):
    folder=output/"rejections"/label;private(folder)
    packet=w.export(anchor["id"],anchor["revision"])
    need(packet==(output/"packets/Original_Booking_Lifecycle.zip").read_bytes(),"Retain the one complete original rejection anchor")
    # Each rejected request leaves this independently received workspace unchanged.
    # Reuse that same verified journal instead of duplicating all original PDFs.
    q=open_workspace(output/"rejections"/"fifth-terms-entitlement"/"workspace")
    try:
     q.receive(packet);old=q.view(anchor["id"]);before=snapshot(q)
     definition=copy.deepcopy(old["definition"]);mutate(definition);definition["asOf"]=at;definition["review"]={"status":"reviewed",**named("Deliberate invalid engineering request: "+label,at)}
     req={"requestId":"tondo-makeup-reject-"+label+"-7108","actor":ACTOR,"at":at,"id":old["id"],"expectedRevision":old["revision"],"definition":definition}
     keep("rejections/"+label+"/request.json",canonical(req))
     try:q.save(req)
     except ValueError as error:
      message=str(error)
      need(all(c in message for c in codes),"Rejection did not reach its selected actual rule: "+message)
     else:raise AssertionError("Invalid "+label+" request was adopted")
     need(snapshot(q)==before and q.request(req["requestId"])["state"]=="NOT_RECORDED","Rejected request changed original source or journal")
     result={"label":label,"rejected":True,"requiredCodes":codes,"reason":message,"beforeSha256":before,"afterSha256":snapshot(q),"requestState":"NOT_RECORDED"}
     keep("rejections/"+label+"/result.json",canonical(result));rejection_results.append(result)
    finally:q.close()
   reject("fifth-terms-entitlement",second,lambda x:x["bookingEvents"].append(event("reject-fifth","terms-5","book","2026-09-08T10:20:00Z","2026-10-10","tondo-7-12-weekday-5")),["annual-limit"])
   reject("regular-student-overlap",second,lambda x:x["bookingEvents"].append(event("reject-overlap","terms-5","book","2026-09-08T10:20:00Z","2026-10-07","tondo-7-12-weekday-2")),["student-overlap"])
   reject("changed-capacity",second,lambda x:x["bookingEvents"].append(event("reject-capacity","terms-5","book","2026-09-08T10:20:00Z","2026-10-10","tondo-7-12-weekday-5",capacity=1)),["capacity-source-differs"])
   reject("outside-terms-window",second,lambda x:x["bookingEvents"].append(event("reject-window","terms-5","book","2026-09-08T10:20:00Z","2026-10-24","tondo-7-12-weekday-5")),["policy-window"])
   def late(x):
    x["absences"].append(absence("late-notice","syn-enrollment-b","2026-10-28","tondo-7-12-weekday-2","terms-selected",notice="2026-10-28T18:00:00Z",at="2026-10-28T19:00:00Z"))
    x["bookingEvents"].append(event("reject-notice","late-notice","book","2026-10-28T19:30:00Z","2026-10-30","tondo-7-12-weekday-4"))
   reject("late-terms-notice",second,late,["advance-notice"],"2026-10-28T20:00:00Z")
   def holiday(x):
    x["absences"].append(absence("closed-day","syn-enrollment-a","2026-11-26","tondo-4-6-weekday-1",notice="2026-11-01T08:00:00Z",at="2026-11-01T09:00:00Z"))
    x["bookingEvents"].append(event("reject-closed","closed-day","book","2026-11-01T10:00:00Z","2026-11-27","tondo-4-6-weekday-4"))
   reject("holiday-is-not-a-lesson",second,holiday,["holiday-or-break","target-calendar"],"2026-11-01T11:00:00Z")
   d=copy.deepcopy(second["definition"]);d["bookingEvents"] += [
    event("release-fourth","terms-4","cancel","2026-09-08T11:00:00Z"),
    event("reserve-fifth-after-release","terms-5","book","2026-09-08T11:01:00Z","2026-10-10","tondo-7-12-weekday-5"),
    event("book-before-planned-pause","pause-expiry-lesson","book","2026-09-08T11:02:00Z","2026-10-16","tondo-4-6-weekday-4"),
    event("explicit-other-policy-booking","later-registration-selection","book","2026-09-08T11:03:00Z","2026-10-16","tondo-7-12-weekday-4")]
   third=save("release-and-explicit-policy-choice",d,"2026-09-08T11:10:00Z",second)
   d=copy.deepcopy(third["definition"])
   for args in (("attended-first","terms-1","attended","2026-09-12T16:16:00Z"),("missed-second","terms-2","missed","2026-09-19T16:16:00Z"),("attended-registration","registration-lesson","attended","2026-09-25T21:31:00Z"),("attended-third","terms-3","attended","2026-09-26T16:16:00Z"),("missed-fifth","terms-5","missed","2026-10-10T16:16:00Z")):d["bookingEvents"].append(event(*args))
   fourth=save("attendance-and-missed-history",d,"2026-10-10T17:00:00Z",third)
   d=copy.deepcopy(fourth["definition"]);d["membershipEvents"]=[
    {"id":"planned-pause","enrollmentId":"syn-enrollment-a","date":"2026-10-15","kind":"pause","reference":"engineering-pause-record",**named("Named engineering pause expires unused registration-form entitlement.","2026-10-12T12:00:00Z")},
    {"id":"planned-resume","enrollmentId":"syn-enrollment-a","date":"2026-10-17","kind":"resume","reference":"engineering-resume-record",**named("Resumed membership permits later newly missed lessons; the expired earlier entitlement does not revive.","2026-10-12T12:01:00Z")}]
   fifth=save("membership-expiry-review",d,FINAL,fourth)
   a=next(r for r in fifth["derived"]["absences"] if r["id"]=="pause-expiry-lesson")
   need(a["state"]=="INELIGIBLE" and a["lastDate"]=="2026-10-14","Original pause did not expire the selected earlier entitlement")
   need(fifth["derived"]["counts"]["attended"]==3 and fifth["derived"]["counts"]["missed"]==2,"Complete attendance and missed history differs")
   annual=next(r for r in fifth["derived"]["annualCounts"] if r["studentId"]=="syn-student-b")
   need(annual["consumed"]==4 and annual["reserved"]==1 and annual["counted"]==5,"Separate explicit policy selection or retained annual accounting differs")
   need(snapshot(w,True)==original_family,"Make-up operations altered original family source/payment/history")
   request=json.loads((output/"requests/membership-expiry-review.json").read_bytes())
   need(w.save(request)==fifth,"Same original request did not replay its complete revision")
   changed=copy.deepcopy(request);changed["definition"]["notes"]+=" changed"
   before=snapshot(w)
   try:w.save(changed)
   except Conflict:pass
   else:raise AssertionError("Changed original request body was accepted")
   need(snapshot(w)==before,"Changed-ID rejection mutated state")
   packet=w.export(fifth["id"],fifth["revision"])
   packet_file=keep("Family_Makeup_Complete.zip",packet);need(w.export(fifth["id"],fifth["revision"])==packet,"Same source export changed")
   keep("complete-makeup-view.json",canonical(fifth));keep("complete-makeup-history.json",canonical(w.history(fifth["id"])));keep("complete-comparison.json",canonical(w.compare(fifth["id"],first["revision"],fifth["revision"])))
   keep("family-unchanged.json",canonical({"beforeSha256":original_family,"afterSha256":snapshot(w,True),"paymentRows":family["derived"]["datasets"]["payments"],"totals":family["derived"]["totals"]}))
   w.close();w=None
   r=open_workspace(receiver)
   try:
    received=r.receive(packet);need(received["selected"]==fifth and r.export(fifth["id"],fifth["revision"])==packet,"Complete independent source/history reconstruction differs")
    need(r.save(request)==fifth,"Received original request did not replay")
    local=copy.deepcopy(fifth["definition"]);local["notes"]+=" Independent recipient retains a named local review note."
    local=save("recipient-local-review",local,"2026-10-13T05:00:00Z",fifth,r)
    repeated=r.receive(packet);older=r.receive((output/"packets/Original_Booking_Lifecycle.zip").read_bytes())
    need(r.view(fifth["id"])==local and repeated["selected"]==fifth and older["selected"]==second,"Earlier complete packets replaced a later compatible recipient head")
    keep("receiving/selected.json",canonical(received["selected"]));keep("receiving/local-review.json",canonical(local));keep("receiving/complete-history.json",canonical(r.history(fifth["id"])))
    # The report is changed together with its self-consistent manifest. Only complete
    # native reconstruction, rather than checksum-only intake, rejects this packet.
    members=zip_members(packet);members["reports/bookings.csv"]+=b"\r\ninjected-report-row\r\n";manifest=json.loads(members["manifest.json"])
    for entry in manifest["files"]:
     if entry["path"]=="reports/bookings.csv":entry.update(bytes=len(members[entry["path"]]),sha256=sha(members[entry["path"]]))
    members["manifest.json"]=canonical(manifest);bad=repack(members);keep("rejections/changed-complete-report.zip",bad);prior=snapshot(r)
    try:r.receive(bad)
    except ReceiveRejected as error:message=str(error)
    else:raise AssertionError("Self-consistent altered report packet was adopted")
    need("report/history assets" in message and snapshot(r)==prior,"Rejected complete report changed recipient state or missed reconstruction boundary")
    keep("rejections/changed-complete-report.json",canonical({"rejected":True,"reason":message,"beforeSha256":prior,"afterSha256":snapshot(r)}))
   finally:r.close()
   # Advance a selected original family source only in a separate received copy.
   # Changed weekly allocation leaves original payments/tuition intact, while the
   # current make-up audit must expose its new collision with the regular roster.
   probe=open_workspace(output/"source-change-workspace")
   try:
    probe.receive(packet);pf=probe.family.view(family["id"],family["revision"]);pd=copy.deepcopy(pf["definition"])
    enrollment=next(x for x in pf["derived"]["datasets"]["enrollments"] if x["id"]=="syn-enrollment-b")
    pd["corrections"].append({"kind":"enrollments","source":enrollment["_source"],"row":enrollment["_row"],"field":"slot_ids","original":enrollment["slot_ids"],"value":json.dumps(["tondo-7-12-weekday-4"]),**named("Explicit synthetic regular-slot source correction in an independent receiving copy, without changing payments.","2026-10-13T05:10:00Z")})
    pd["review"]={"status":"reviewed",**named("Original payment amounts and allocations retained; inspect new regular roster collision.","2026-10-13T05:10:00Z")}
    fr={"requestId":"tondo-makeup-source-change-family-7108","id":pf["id"],"expectedRevision":pf["revision"],"actor":ACTOR,"at":"2026-10-13T05:10:00Z","definition":pd}
    pf2=probe.family.save(fr);keep("source-change/family-request.json",canonical(fr));keep("source-change/family-view.json",canonical(pf2))
    need(pf2["derived"]["datasets"]["payments"]==pf["derived"]["datasets"]["payments"] and pf2["derived"]["totals"]==pf["derived"]["totals"],"Independent source correction changed original money")
    md=copy.deepcopy(fifth["definition"]);md["family"]={k:pf2[k] for k in ("id","revision","derivedSha256")}
    current=save("source-change-current-audit",md,"2026-10-13T05:11:00Z",fifth,probe)
    row=next(x for x in current["derived"]["absences"] if x["id"]=="later-registration-selection")
    need(row["state"]=="INELIGIBLE" and any(i["code"]=="current-student-overlap" for i in row["blockers"]),"A later original roster collision was hidden in current booking state")
    keep("source-change/Family_Makeup_Source_Change.zip",probe.export(current["id"],current["revision"]))
   finally:probe.close()
   cold_owner=open_workspace(source);cold_receiver=open_workspace(receiver)
   try:
    need(cold_owner.view(fifth["id"])==fifth and cold_receiver.view(fifth["id"])==local,"Cold original case reopen differs")
    need(cold_owner.save(request)==fifth and cold_receiver.save(request)==fifth,"Cold original request replay differs")
    need(snapshot(cold_owner,True)==original_family,"Cold original family/payment history changed")
   finally:cold_owner.close();cold_receiver.close()
   ui_absence={"policyId":"registration-selected","enrollmentId":"syn-enrollment-a","date":"2026-10-20","slotId":"tondo-4-6-weekday-1","noticeAt":"2026-10-13T06:00:00Z","noticeRef":"engineering-future-ui-notice","reason":"other"}
   ui_booking={"date":"2026-10-23","slotId":"tondo-4-6-weekday-4","capacity":12,"capacityRef":"original-family-synthetic-capacity-12","instructor":"Synthetic TONDO browser instructor","reference":"engineering-browser-approval","note":"Synthetic future booking under the separately selected registration-form policy."}
   readme=("TONDO COMPLETE MAKE-UP ENGINEERING RECEIVING\n\nThe original three complete TONDO PDF sources, actual 2026–27 calendar, independently received family r4 and every original payment remain unchanged. Every operational notice, absence, capacity confirmation, approval, membership action and attendance record is synthetic engineering data.\n\nThe two conflicting policy editions are retained as separate named selections without inferred precedence. Terms use explicit engineering semester boundaries. The course exercises four Terms reservations, a rejected fifth, timely cancellation/replacement, separate registration-form selection, waitlist/booking/reschedule/cancel/rebook, named illness discretion, attended/missed history, pause expiry, current original-roster collision, complete portable receiving, later local edit, older-prefix receiving and cold reopen. Its annual reservation accounting is an explicit operational interpretation.\n\nOpen makeup-operated-case.json for selected original paths, complete files and the unused October 20→23 browser scenario. The source owner remains r5; the independent recipient remains locally edited r6. No external payment or customer action occurred.\n").encode()
   keep("README.txt",readme)
   # Only complete explicitly selected artifacts enter delivery. Retained output
   # stages and live workspace journals are preserved locally outside membership.
   unique={f["path"]:f for f in files};files=[unique[k] for k in sorted(unique)]
   result={"schema":"class-intake.family-makeup-operated-case.v1","state":"COMPLETE","operationId":OPERATION,"ownerWorkspace":str(source),"recipientWorkspace":str(receiver),"sourceChangeWorkspace":str(output/"source-change-workspace"),"family":supplied["review"],"review":{k:fifth[k] for k in ("id","revision","derivedSha256")},"recipientReview":{k:local[k] for k in ("id","revision","derivedSha256")},"counts":fifth["derived"]["counts"],"engineeringOnly":True,"providerWrites":0,"originalPaymentRowsUnchanged":True,"originalFamilyHistorySha256":original_family,"familyTotals":family["derived"]["totals"],"receivingRejections":rejection_results,"uiScenario":{"absence":ui_absence,"booking":ui_booking},"source":{"engine":engine,"driver":driver},"packet":packet_file,"files":files}
   selected_members={pathlib.Path(f["path"]).relative_to(output).as_posix():pathlib.Path(f["path"]).read_bytes() for f in files};selected_members["makeup-operated-case.json"]=canonical(result)
   selected_members["manifest.json"]=canonical({"schema":"class-intake.family-makeup-complete-delivery.v1","files":[{"path":n,"bytes":len(b),"sha256":sha(b)} for n,b in sorted(selected_members.items())]})
   bundle=repack(selected_members);package=exact(output/"TONDO_Makeup_Complete_Receiving.zip",bundle)
   with zipfile.ZipFile(io.BytesIO(bundle)) as z:need(set(z.namelist())==set(selected_members) and all(z.read(k)==v for k,v in selected_members.items()),"Complete delivery member verification differs")
   # The result inside the ZIP intentionally precedes the outer package descriptor.
   # The file list excludes the archive itself to avoid a circular hash.
   result["package"]=package;exact(result_path,canonical(result));return result
  finally:
   if w is not None:w.close()

if __name__=="__main__":
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--family-result",required=True);parser.add_argument("--output",required=True);args=parser.parse_args()
 print(json.dumps(run(args.family_result,args.output),ensure_ascii=False),flush=True)
