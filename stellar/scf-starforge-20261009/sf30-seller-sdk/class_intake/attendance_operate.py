"""Operate the complete source-bound four-visit attendance and independent handover."""
import argparse,copy,datetime as dt,fcntl,json,os,pathlib,sys,zipfile
from class_intake import Workspace,canonical,sha,atomic
from attendance import Attendance,selected_source
HERE=pathlib.Path(__file__).resolve().parent
OP="CLASS-INTAKE-BEREA-ATTENDANCE-7108-20261013"
def need(ok,message):
 if not ok:raise RuntimeError(message)
def file(path):
 body=path.read_bytes();return {"path":str(path),"bytes":len(body),"sha256":sha(body)}
def table_source(w,kind,columns,rows):
 raw=canonical({"columns":columns,"rows":rows})
 source=w.add_source(raw,{"label":"Engineering "+kind,"filename":kind+".json","retrievedAt":"2026-10-13T04:00:00+00:00","provenance":"synthetic-engineering","notice":"Generated operator example; fictional student keys and confirmations."})
 return {"source":source["id"],"format":"json","headers":columns,"fields":{key:{"index":i} for i,key in enumerate(columns)}}
def session(id,start,end,state="scheduled",capacity=6):
 return {"id":id,"classId":"drawing-flex","start":start,"end":end,"timezone":"America/New_York","capacity":capacity,
         "instructor":"Engineering instructor","state":state,"reason":"Explicit engineering date; demonstrates separated weekly visits and the original six-place maximum."}
def visit(id,registration,session,state,units):
 return {"id":id,"registrationId":registration,"sessionId":session,"state":state,"units":units,
         "confirmation":{"instructor":"Engineering instructor","at":"2026-10-06T10:00:00-04:00","method":"source-record","reference":"Explicit generated receiving-example confirmation"},
         "reason":"Engineering attendance decision."}
def operate(root,intake_result):
 os.umask(0o077);root.mkdir(parents=True,exist_ok=True);lock=(root/"operation.lock").open("a+b");fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  intake_path=pathlib.Path(intake_result).absolute();base=json.loads(intake_path.read_bytes())
  need(base.get("schema")=="class-intake.complete-engineering-receiving.v1" and base.get("state")=="COMPLETE","Select the complete original Berea intake result")
  for item in base["files"]:need(file(pathlib.Path(item["path"]))==item,"Original intake output changed")
  workspace=pathlib.Path(base["workspace"]).absolute()
  need(workspace.resolve()==workspace and workspace.is_dir(),"Select the existing original workspace")
  selection={"operation":OP,"intakeResult":file(intake_path),"workspace":str(workspace),"intakeId":base["sourceCase"]["id"]}
  selection_path=root/"selection.json"
  if selection_path.exists():need(json.loads(selection_path.read_bytes())==selection,"Continue the same complete original intake selection")
  else:atomic(selection_path,canonical(selection))
  done=root/"result.json"
  if done.exists():
   result=json.loads(done.read_bytes());need(result["operation"]==OP,"Original operation changed")
   for item in result["files"]:
    actual=file(pathlib.Path(item["path"]));need(actual==item,"Original completed output changed")
   return result
  w=Workspace(workspace)
  try:
   original=w.view(base["sourceCase"]["id"])
   # Persist the complete next edition before saving so interrupted operation resumes exactly.
   request_path=root/"intake-extension-request.json"
   if request_path.exists():
    intake_request=json.loads(request_path.read_bytes())
    need(intake_request["id"]==original["id"],"Original intake identity changed")
   else:
    selected=copy.deepcopy(original["definition"]["selections"]);registration=selected["registrations"]
    need(registration["format"]=="json","Original engineering registration source must retain JSON rows")
    original_table=json.loads(w.source(registration["source"]))
    columns=["id","class_id","student_key","status","fee","currency"]
    need(original_table["columns"]==columns and registration["headers"]==columns,"Original registration columns changed")
    need(registration["fields"]=={key:{"index":i} for i,key in enumerate(columns)} and not registration.get("valueMaps"),"Retain the original registration interpretation")
    need(all(row[0] not in ("engineering-drawing-a","engineering-drawing-b") for row in original_table["rows"]),"Attendance example registrations already exist outside this operation")
    rows=copy.deepcopy(original_table["rows"])+[
     ["engineering-drawing-a","drawing-flex","engineering-student-a","active","65.00","USD"],
     ["engineering-drawing-b","drawing-flex","engineering-student-b","active","65.00","USD"]]
    selected["registrations"]=table_source(w,"registrations-with-attendance-example",columns,rows)
    definition=copy.deepcopy(original["definition"]);definition["selections"]=selected
    definition["notes"]+="\nAttendance receiving example adds two labelled fictional drawing registrations to the complete original source edition."
    intake_request={"requestId":"attendance-example-intake-extension","id":original["id"],"expectedRevision":original["revision"],
     "actor":"Engineering receiving operator","at":"2026-10-13T04:00:00+00:00","definition":definition}
    atomic(request_path,canonical(intake_request))
   previous=w.view(intake_request["id"],intake_request["expectedRevision"])
   intake=w.save(intake_request)
   need(intake["definition"]["selections"]["catalogue"]==previous["definition"]["selections"]["catalogue"],"Attendance extension changed the original catalogue")
   for kind in ("transactions","confirmations"):
    need(intake["definition"]["selections"].get(kind)==previous["definition"]["selections"].get(kind),"Attendance extension changed original "+kind)
   def payments(view):
    return {r["id"]:{k:copy.deepcopy(v) for k,v in r.items() if k not in ("_source","_row","_raw")} for r in view["derived"]["registrations"]}
   original_payments=payments(previous);extended_payments=payments(intake)
   need(all(extended_payments.get(key)==value for key,value in original_payments.items()),"Original student/payment calculations changed")
   source_before=json.loads(w.source(previous["definition"]["selections"]["registrations"]["source"]))
   source_after=json.loads(w.source(intake["definition"]["selections"]["registrations"]["source"]))
   need(source_after["rows"][:len(source_before["rows"])]==source_before["rows"],"Original registration rows changed")
   catalogue=json.loads(w.source(intake["definition"]["selections"]["catalogue"]["source"]))
   financial=canonical(intake["derived"]["registrations"]);core_request_count=w.db.execute("SELECT count(*) FROM requests").fetchone()[0]
   a=Attendance(w)
   definition={"name":"Four nonconsecutive visits — engineering example","intake":selected_source(intake),"note":"Explicitly selected engineering dates and visit grant.",
    "sessions":[session("drawing-oct07","2026-10-07T16:30:00-04:00","2026-10-07T18:00:00-04:00","completed"),
                session("drawing-oct21","2026-10-21T16:30:00-04:00","2026-10-21T18:00:00-04:00"),
                session("drawing-nov04","2026-11-04T16:30:00-05:00","2026-11-04T18:00:00-05:00"),
                session("drawing-nov18","2026-11-18T16:30:00-05:00","2026-11-18T18:00:00-05:00",capacity=1)],
    "enrollments":[{"registrationId":"engineering-drawing-a","granted":4,"reason":"Original four-visit engineering enrollment"},
                   {"registrationId":"engineering-drawing-b","granted":4,"reason":"Second engineering enrollment, separately unpaid"}],
    "visits":[visit("visit-a-oct07","engineering-drawing-a","drawing-oct07","attended",1),
              visit("visit-a-oct21","engineering-drawing-a","drawing-oct21","booked",0)],"adjustments":[]}
   request={"requestId":"attendance-example-r1","actor":"Engineering receiving operator","at":"2026-10-13T04:01:00+00:00","definition":definition}
   first=a.save(request);need(a.save(request)==first,"Original complete attendance request replay changed")
   balance=next(x for x in first["derived"]["balances"] if x["registrationId"]=="engineering-drawing-a")
   need((balance["used"],balance["reserved"],balance["remaining"],balance["available"])==(1,1,3,2),"Original grant/reservation balance differs")
   moved=copy.deepcopy(definition);old=moved["visits"][1];old.update(state="rescheduled",replacementId="visit-a-nov04",reason="Engineering move skips the intervening weeks.")
   moved["visits"].append(visit("visit-a-nov04","engineering-drawing-a","drawing-nov04","booked",0));moved["note"]="Named rescheduling to a separate dated session."
   r2=a.save({"requestId":"attendance-example-r2","id":first["id"],"expectedRevision":1,"actor":"Engineering receiving operator","at":"2026-10-13T04:02:00+00:00","definition":moved})
   need(r2["derived"]["totals"]["reserved"]==1 and r2["derived"]["totals"]["used"]==1,"Rescheduling double-charged the original visit")
   corrected=copy.deepcopy(moved);corrected["visits"][-1].update(state="cancelled",units=0,reason="Explicit engineering accommodation retains this visit credit.")
   corrected["visits"].append(visit("visit-b-nov18","engineering-drawing-b","drawing-nov18","booked",0))
   corrected["adjustments"].append({"id":"credit-a-extra","registrationId":"engineering-drawing-a","units":1,"actor":"Engineering receiving operator","at":"2026-10-13T04:03:00+00:00","reason":"Explicit engineering extra-visit accommodation."})
   corrected["note"]="Named cancellation and credit accommodation; payment source remains the same."
   third=a.save({"requestId":"attendance-example-r3","id":first["id"],"expectedRevision":2,"actor":"Engineering receiving operator","at":"2026-10-13T04:03:00+00:00","definition":corrected})
   need(canonical(w.view(intake["id"])["derived"]["registrations"])==financial and w.db.execute("SELECT count(*) FROM requests").fetchone()[0]==core_request_count,"Attendance changed original payment or intake history")
   # A real fourth booking would overfill the explicitly one-place dated session.
   over=copy.deepcopy(corrected);over["visits"].append(visit("visit-a-overflow","engineering-drawing-a","drawing-nov18","booked",0));over["note"]="Engineering capacity refusal"
   rejected=False
   try:a.save({"requestId":"attendance-example-overflow","id":first["id"],"expectedRevision":3,"actor":"Engineering receiving operator","at":"2026-10-13T04:04:00+00:00","definition":over})
   except ValueError as error:
    need("capacity" in str(error),"Unexpected capacity result: "+str(error));rejected=True
   need(rejected and a.view(first["id"])==third,"Capacity refusal changed attendance history")
   packet=a.export(first["id"],3);packet_path=root/"Class_Attendance_Complete.zip";atomic(packet_path,packet)
   atomic(root/"source-attendance.json",canonical(third));atomic(root/"source-intake.json",canonical(intake))
  finally:w.close()
  receiving=Workspace(root/"independent-receiver",True)
  try:
   model=Attendance(receiving);received=model.receive(packet);need(received["selected"]==third,"Independent source/history reconstruction differs")
   need(model.export(first["id"],3)==packet,"Whole independent handover differs")
   local=copy.deepcopy(third["definition"]);local["note"]="Independent receiver's retained operator note."
   fourth=model.save({"requestId":"attendance-independent-r4","id":first["id"],"expectedRevision":3,"actor":"Independent receiving operator","at":"2026-10-13T04:05:00+00:00","definition":local})
   older=model.receive(packet);need(older["current"]==fourth,"Older source packet replaced the receiver's later note")
   atomic(root/"Class_Attendance_Received_History.zip",model.export(first["id"],4));atomic(root/"received-attendance.json",canonical(fourth))
  finally:receiving.close()
  reopened=Workspace(root/"independent-receiver")
  try:need(Attendance(reopened).view(first["id"])==fourth,"Cold reopening lost received attendance history")
  finally:reopened.close()
  source=Workspace(workspace)
  try:need(Attendance(source).view(first["id"])==third and canonical(source.view(intake["id"])["derived"]["registrations"])==financial,"Cold source reopening changed original attendance/payment state")
  finally:source.close()
  names=["Class_Attendance_Complete.zip","Class_Attendance_Received_History.zip","source-attendance.json","source-intake.json","received-attendance.json"]
  result={"operation":OP,"state":"COMPLETE","intake":{"id":intake["id"],"revision":intake["revision"]},"attendance":{"id":first["id"],"sourceRevision":3,"receivedRevision":4},
          "workspace":str(workspace),"originalIntakeResult":file(intake_path),"preservedOriginalRegistrations":len(original_payments),"publicCatalogueRows":len(catalogue["rows"]),"sessionDates":["2026-10-07","2026-10-21","2026-11-04","2026-11-18"],
          "checks":{"nonconsecutiveVisits":True,"namedConfirmation":True,"reservationBalance":True,"reschedule":True,"namedCancellation":True,"creditAdjustment":True,"sharedCapacity":True,"unchangedPayments":True,"independentReceiving":True,"olderPacketPreservesLocal":True,"coldReopen":True},
          "files":[file(root/name) for name in names]}
  atomic(done,canonical(result));return result
 finally:lock.close()
if __name__=="__main__":
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--output",required=True);p.add_argument("--intake-result",required=True);a=p.parse_args();print(json.dumps(operate(pathlib.Path(a.output).absolute(),a.intake_result),ensure_ascii=False))
