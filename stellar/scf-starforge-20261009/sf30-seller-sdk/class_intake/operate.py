"""Operate the complete source-bound case with explicitly synthetic registration evidence."""
import argparse,copy,json,pathlib,sys,zipfile,io,hashlib,fcntl
from class_intake import Workspace,canonical,sha,atomic,course_sheet,Conflict
HERE=pathlib.Path(__file__).resolve().parent
STAMP="2026-10-13T04:00:00+00:00"
def source(w,name,columns,rows,provenance="synthetic-engineering",url=None):
 raw=canonical({"columns":columns,"rows":rows})
 info=w.add_source(raw,{"label":name,"filename":name+".json","url":url,"retrievedAt":STAMP,"provenance":provenance,"notice":"Engineering records are not customer registrations, payments or confirmations."})
 return {"source":info["id"],"format":"json","headers":columns,"fields":{c:{"index":i} for i,c in enumerate(columns)}}
def descriptor(p):
 b=p.read_bytes();return {"path":str(p.resolve()),"bytes":len(b),"sha256":sha(b)}
def run(destination):
 root=pathlib.Path(destination).resolve();root.mkdir(parents=True,exist_ok=True)
 with (root/".operation.lock").open("a+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  result_path=root/"result.json"
  if result_path.exists():
   result=json.loads(result_path.read_text())
   for f in result["files"]:
    p=pathlib.Path(f["path"])
    if not p.is_file() or descriptor(p)!=f:raise ValueError("Completed handover changed")
   return result
  w=Workspace(root/"workspace",True);retained=[]
  try:
   raw=(HERE/"examples"/"berea-fall-2026.json").read_bytes();fact=json.loads(raw)
   s=w.add_source(raw,{"label":"Berea Fall 2026 factual transcription","filename":"berea-fall-2026.json","url":"https://bereaarts.org/pdfs/FALL%202026.pdf?v2=","retrievedAt":STAMP,"provenance":"public-derived","notice":"26 rows derived from the public catalogue and linked registration form; original weekday/deadline conflicts retained. Ohio timezone normalization is an explicit interpretation."})
   mapping={"source":s["id"],"format":"json","headers":fact["columns"],"fields":{c:{"index":i} for i,c in enumerate(fact["columns"])}}
   definitions={"name":"Berea Fall 2026 · source review with engineering registrations","notes":"Public class facts; all registrations, transactions and confirmations below are explicitly synthetic engineering records. No customer account, payment or email has been operated.","currencyDigits":{"USD":2},"selections":{"catalogue":mapping},"catalogueDecisions":[],"matches":[],"exceptions":[],"cutover":{"state":"draft","reviewer":"","note":""}}
   definitions["selections"]["registrations"]=source(w,"SYNTHETIC-registrations",["id","class_id","student_key","status","fee","currency"],[
    ["SYN-R1","calligraphy-11-18","SYN-STUDENT-1","active","20.00","USD"],
    ["SYN-R2","calligraphy-11-18","SYN-STUDENT-2","cancelled","20.00","USD"],
    ["SYN-R3","pen-10-28","SYN-STUDENT-3","active","20.00","USD"],
    ["SYN-R4","bob-ross-10-17","SYN-STUDENT-4","active","30.00","USD"]])
   definitions["selections"]["transactions"]=source(w,"SYNTHETIC-transactions",["id","registration_id","gross","refund","service_fee","student_fee","net","currency","status","posted_at","payout_id","payout_date","provider_ref"],[
    ["SYN-T1","SYN-R1","20.00","0.00","0.88","0.00","19.12","USD","posted",STAMP,"SYN-PAYOUT-1","2026-10-14","SYN-PROVIDER-1"],
    ["SYN-T2","SYN-R2","20.00","15.00","0.88","0.00","4.12","USD","posted",STAMP,"SYN-PAYOUT-1","2026-10-14","SYN-PROVIDER-2"],
    ["SYN-T3","","20.00","0.00","1.00","0.00","19.00","USD","posted",STAMP,"SYN-PAYOUT-1","2026-10-14","SYN-PROVIDER-3"],
    ["SYN-T4","SYN-R4","30.00","0.00","","","","USD","pending","","","","SYN-PROVIDER-4"]])
   definitions["selections"]["confirmations"]=source(w,"SYNTHETIC-confirmations",["id","registration_id","status","actor","at"],[
    ["SYN-C1","SYN-R1","confirmed","Engineering instructor",STAMP],
    ["SYN-C3","SYN-R3","pending","Engineering instructor",STAMP],
    ["SYN-C4","SYN-R4","confirmed","Engineering instructor",STAMP]])
   req={"requestId":"berea-engineering-create-7108","actor":"7108 engineering receiver","at":STAMP,"definition":definitions}
   baseline=w.save(req)
   if len(baseline["derived"]["datasets"]["catalogue"])!=26:raise AssertionError("Full public catalogue absent")
   if not any(x["code"]=="weekday-conflict" for x in baseline["derived"]["issues"]):raise AssertionError("Real source conflict was lost")
   regs={x["id"]:x for x in baseline["derived"]["registrations"]}
   if regs["SYN-R1"]["balance_minor"]!="0" or regs["SYN-R4"]["paid_minor"]!="0":raise AssertionError("Fees or pending payment affected student balance")
   if w.save(req)!=baseline:raise AssertionError("Exact request replay changed")
   conflict=copy.deepcopy(req);conflict["definition"]["notes"]="Changed body"
   try:w.save(conflict);raise AssertionError("Changed request replay accepted")
   except Conflict:pass
   corrected=copy.deepcopy(definitions);corrected["matches"]=[{"transaction":"SYN-T3","registration":"SYN-R3","reviewer":"7108 engineering receiver","note":"Synthetic source record deliberately omitted its registration ID; named test match to the original generated student record.","at":STAMP}]
   second=w.save({"requestId":"berea-engineering-match-7108","id":baseline["id"],"expectedRevision":1,"actor":"7108 engineering receiver","at":STAMP,"definition":corrected})
   if next(r for r in second["derived"]["registrations"] if r["id"]=="SYN-R3")["balance_minor"]!="0":raise AssertionError("Original matching decision not applied")
   # Actual catalogue source conflicts remain open; no fabricated school policy approval.
   packet=w.export(second["id"],2);atomic(root/"Berea_Source_Review_Complete.zip",packet)
   retained.append(root/"Berea_Source_Review_Complete.zip")
   # Separately labelled engineering cutover demonstrates ready/release/rollback without changing Berea.
   eng_cat=[["ENGINEERING-C1","ENGINEERING ONLY – class import demonstration","fixed","2026-11-18T18:30:00-05:00","2026-11-18T20:00:00-05:00","Wednesday","20.00","USD","6","1","14","Engineering Instructor","Engineering Room","Demonstration only; not an actual class listing.",""]]
   eng=copy.deepcopy(definitions);eng["name"]="ENGINEERING ONLY · cutover and rollback";eng["selections"]={"catalogue":source(w,"SYNTHETIC-catalogue",fact["columns"],eng_cat)}
   eng["selections"]["registrations"]=source(w,"SYNTHETIC-cutover-registration",["id","class_id","student_key","status","fee","currency"],[["SYN-REG-C","ENGINEERING-C1","SYN-STUDENT-C","active","20.00","USD"]])
   eng["selections"]["transactions"]=source(w,"SYNTHETIC-cutover-transaction",["id","registration_id","gross","refund","currency","status"],[["SYN-TX-C","SYN-REG-C","20.00","0.00","USD","posted"]])
   eng["selections"]["confirmations"]=source(w,"SYNTHETIC-cutover-confirmation",["id","registration_id","status","actor","at"],[["SYN-CONF-C","SYN-REG-C","confirmed","Engineering Instructor",STAMP]])
   eng["importPlan"]={"provider":"coursestorm-csv","catalogue":"ENGINEERING ONLY – hidden import preview","selectedIds":["ENGINEERING-C1"],"reviewer":"7108 engineering receiver","note":"Documented import format demonstration; no CourseStorm action.","at":STAMP}
   eng["cutover"]={"state":"ready","reviewer":"7108 engineering receiver","note":"Engineering data only; all source and reconciliation decisions resolved.","at":STAMP}
   ready=w.save({"requestId":"class-intake-engineering-ready","actor":"7108 engineering receiver","at":STAMP,"definition":eng})
   eng["cutover"]["state"]="released";eng["cutover"]["note"]="Engineering release record only, no provider write."
   released=w.save({"requestId":"class-intake-engineering-release","id":ready["id"],"expectedRevision":1,"actor":"7108 engineering receiver","at":STAMP,"definition":eng})
   sheet=course_sheet(released);atomic(root/"ENGINEERING_ONLY_CourseStorm_Catalogue.csv",sheet["csv"]);retained.append(root/"ENGINEERING_ONLY_CourseStorm_Catalogue.csv")
   eng["cutover"]={"state":"rolled-back","reviewer":"7108 engineering receiver","note":"Engineering rollback record; original released edition retained.","at":STAMP,"rollbackRevision":2}
   rolled=w.save({"requestId":"class-intake-engineering-rollback","id":ready["id"],"expectedRevision":2,"actor":"7108 engineering receiver","at":STAMP,"definition":eng})
   engpacket=w.export(rolled["id"],3);atomic(root/"Engineering_Cutover_Complete.zip",engpacket);retained.append(root/"Engineering_Cutover_Complete.zip")
   expected=[(second["id"],2,packet),(rolled["id"],3,engpacket)]
   compare=w.compare(second["id"],1,2)
   allocation=next((x for x in compare["allocationChanges"] if x["id"]=="SYN-R3"),None)
   if not allocation or allocation["before"]["paid_minor"]!="0" or allocation["after"]["paid_minor"]!="2000" or allocation["after"]["balance_minor"]!="0":raise AssertionError("Named payment allocation absent from comparison")
   if not any(x["id"]=="matches" for x in compare["decisionChanges"]):raise AssertionError("Original match decision absent from comparison")
   atomic(root/"comparison.json",canonical(compare));retained.append(root/"comparison.json")
  finally:w.close()
  receiver=Workspace(root/"independent-receiver",True)
  try:
   for id,revision,body in expected:
    a=receiver.receive(body);b=receiver.receive(body)
    if a["selected"]!=b["selected"] or receiver.export(id,revision)!=body:raise AssertionError("Independent exact receive/replay failed")
  finally:receiver.close()
  cold=Workspace(root/"independent-receiver")
  try:
   for id,revision,body in expected:
    if cold.view(id,revision)["revision"]!=revision or cold.export(id,revision)!=body:raise AssertionError("Cold reopen failed")
  finally:cold.close()
  outer=root/"Class_Intake_Complete_Engineering_Handback.zip"
  with zipfile.ZipFile(outer,"w",zipfile.ZIP_DEFLATED) as z:
   for path in retained:z.write(path,path.name)
   for name in ("class_intake.py","server.py","README.md","operate.py","client.mjs","client.d.mts"):
    path=HERE/name
    if path.is_file():z.write(path,"source/"+name)
   for path in sorted((HERE/"public").rglob("*")):
    if path.is_file():z.write(path,"source/public/"+str(path.relative_to(HERE/"public")))
   for path in sorted((HERE/"examples").rglob("*")):
    if path.is_file():z.write(path,"source/examples/"+str(path.relative_to(HERE/"examples")))
  retained.append(outer)
  result={"schema":"class-intake.complete-engineering-receiving.v1","state":"COMPLETE","operationId":"CLASS-INTAKE-BEREA-ENGINEERING-7108-20261013","sourceCase":{"id":expected[0][0],"revision":2,"catalogueRows":26,"actualSourceConflictsRemainOpen":True},"engineeringCutover":{"id":expected[1][0],"revision":3,"providerWrites":0},"files":[descriptor(p) for p in retained],"workspace":str(root/"workspace"),"independentReceiver":str(root/"independent-receiver"),"browser":"NOT_RUN"}
  atomic(result_path,canonical(result));return result
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--output",required=True);a=p.parse_args();print(json.dumps(run(a.output),ensure_ascii=False))
