"""Dated teaching sessions and visit credits over an original Class Intake workspace."""
from __future__ import annotations
import argparse, copy, datetime as dt, io, json, pathlib, tempfile, zipfile
from zoneinfo import ZoneInfo
from class_intake import Workspace, Conflict, ReceiveRejected, canonical, sha, text, ident, stamp, exact_keys, csv_bytes, atomic, MAX_PACKET

SCHEMA="class-intake.attendance.v1"
STATES=("proposed","waitlist","booked","attended","missed","cancelled","rescheduled")
def need(value,message):
 if not value: raise ValueError(message)
def integer(value,label,low=0,high=10000):
 need(type(value)is int and low<=value<=high,label+" is outside its integer range");return value
def records(items,key,label):
 need(isinstance(items,list) and len(items)<=10000,label+" must be a bounded list")
 out={}
 for row in items:
  need(isinstance(row,dict),label+" must contain objects");identity=row.get(key)
  need(isinstance(identity,str) and identity.strip() and len(identity)<=2000,label+" identity must be nonempty original text")
  need(identity not in out,"Repeated "+label+" identity: "+identity);out[identity]=row
 return out
def instant(value):
 stamp(value);return dt.datetime.fromisoformat(value.replace("Z","+00:00"))
def dated(value,zone):
 parsed=instant(value);local=parsed.astimezone(dt.timezone.utc).astimezone(zone)
 need(local.replace(tzinfo=None)==parsed.replace(tzinfo=None) and local.utcoffset()==parsed.utcoffset(),
      "Session offset or wall time disagrees with its named timezone")
 return parsed
def confirmation(value,instructor):
 exact_keys(value,("instructor","at","method","reference"),("instructor","at","method","reference"))
 need(text(value["instructor"],"confirming instructor")==instructor,"Confirmation must name the selected session instructor")
 stamp(value["at"]);need(value["method"] in ("email","phone","in-person","source-record"),"Choose the actual confirmation method")
 text(value["reference"],"confirmation reference",limit=2000)
def selected_source(view):
 return {"id":view["id"],"revision":view["revision"],"derivedSha256":view["derivedSha256"]}
def derive(definition,intake):
 exact_keys(definition,("name","intake","note","sessions","enrollments","visits","adjustments"),
            ("name","intake","note","sessions","enrollments","visits","adjustments"))
 d=copy.deepcopy(definition);text(d["name"],"attendance name",limit=160);text(d["note"],"edition reason",limit=20000)
 need(d["intake"]==selected_source(intake),"Attendance must select one exact saved intake edition")
 classes=records(intake["derived"]["datasets"]["catalogue"],"id","catalogue")
 registrations=records(intake["derived"]["datasets"].get("registrations",[]),"id","registration")
 financial={x["id"]:x for x in intake["derived"]["registrations"]}
 sessions=records(d["sessions"],"id","session")
 enrollments=records(d["enrollments"],"registrationId","enrollment")
 visits=records(d["visits"],"id","visit")
 adjustments=records(d["adjustments"],"id","credit adjustment")
 issues=[]; clocks={};rosters={sid:[] for sid in sessions};balances={}
 for sid,s in sessions.items():
  exact_keys(s,("id","classId","start","end","timezone","capacity","instructor","state","reason"),
             ("id","classId","start","end","timezone","capacity","instructor","state","reason"))
  need(ident(sid)==sid,"New attendance record IDs must use canonical formatting");need(s["classId"] in classes,"Session class is absent from selected original catalogue")
  text(s["reason"],"session planning reason");instructor=text(s["instructor"],"session instructor")
  need(s["state"] in ("planned","scheduled","completed","cancelled"),"Unknown session state")
  zone=ZoneInfo(text(s["timezone"],"IANA timezone"));start=dated(s["start"],zone);end=dated(s["end"],zone)
  elapsed=(end.astimezone(dt.timezone.utc)-start.astimezone(dt.timezone.utc)).total_seconds()
  need(0<elapsed<=86400,"A teaching session must end after its start within 24 hours")
  integer(s["capacity"],"session capacity",1,1000);clocks[sid]=(start,end)
  cat=classes[s["classId"]]
  if cat.get("capacity","").isdigit():
   need(s["capacity"]<=int(cat["capacity"]),"Session exceeds selected catalogue capacity; revise the original named catalogue decision first")
  weekday=cat.get("weekday","")
  if weekday and start.strftime("%A")!=weekday:
   issues.append({"code":"weekday-review","sessionId":sid,"detail":"Explicit dated session differs from catalogue weekday "+weekday})
  if cat.get("schedule")=="fixed" and cat.get("start")!=s["start"]:
   issues.append({"code":"fixed-date-review","sessionId":sid,"detail":"Explicit session differs from the fixed catalogue start; retain the named planning reason"})
 active_sessions=[s for s in sessions.values() if s["state"] in ("scheduled","completed")]
 for index,left in enumerate(active_sessions):
  for right in active_sessions[index+1:]:
   if max(clocks[left["id"]][0],clocks[right["id"]][0])<min(clocks[left["id"]][1],clocks[right["id"]][1]):
    need(left["classId"]!=right["classId"],"Overlapping sessions cannot split the same class capacity")
    need(left["instructor"]!=right["instructor"],"The same named instructor has overlapping teaching sessions")
 for rid,e in enrollments.items():
  exact_keys(e,("registrationId","granted","reason"),("registrationId","granted","reason"))
  need(rid in registrations,"Enrollment must retain an original registration ID")
  integer(e["granted"],"granted visits",0,1000);text(e["reason"],"visit grant reason")
  reg=registrations[rid];need(reg["class_id"] in classes,"Registration class is absent")
  money=financial.get(rid,{})
  balances[rid]={"registrationId":rid,"studentKey":reg["student_key"],"classId":reg["class_id"],
                "granted":e["granted"],"adjusted":0,"used":0,"reserved":0,"remaining":0,"available":0,
                "registrationStatus":reg["status"],"sourceConfirmation":money.get("confirmation"),
                "feeMinor":money.get("fee_minor"),"paidMinor":money.get("paid_minor"),
                "balanceMinor":money.get("balance_minor"),"currency":reg["currency"]}
 for aid,a in adjustments.items():
  exact_keys(a,("id","registrationId","units","actor","at","reason"),("id","registrationId","units","actor","at","reason"))
  need(ident(aid)==aid,"New attendance record IDs must use canonical formatting");need(a["registrationId"] in balances,"Credit adjustment requires an enrolled original registration")
  integer(a["units"],"credit adjustment",-1000,1000);need(a["units"]!=0,"A credit adjustment must change visits")
  text(a["actor"],"adjustment actor");stamp(a["at"]);text(a["reason"],"credit adjustment reason")
  balances[a["registrationId"]]["adjusted"]+=a["units"]
 seen=set()
 for vid,v in visits.items():
  exact_keys(v,("id","registrationId","sessionId","state","confirmation","units","reason","replacementId"),
             ("id","registrationId","sessionId","state","confirmation","units","reason"))
  need(ident(vid)==vid,"New attendance record IDs must use canonical formatting");rid=v["registrationId"];sid=v["sessionId"]
  need(rid in enrollments and sid in sessions,"Visit requires an enrolled registration and selected session")
  need(v["state"] in STATES,"Unknown visit state");integer(v["units"],"consumed visits",0,1);text(v["reason"],"visit decision reason")
  s=sessions[sid];reg=registrations[rid];key=(rid,sid)
  need(reg["class_id"]==s["classId"],"Visit cannot move a registration into another class")
  need(key not in seen,"Use the original visit when correcting the same registration/session");seen.add(key)
  state=v["state"]
  if state in ("proposed","waitlist","booked","rescheduled"):need(v["units"]==0,"This visit state cannot consume a credit")
  if state=="attended":need(v["units"]==1,"Attendance consumes exactly one visit")
  if state in ("booked","attended","missed"):
   confirmation(v["confirmation"],s["instructor"])
   need(s["state"] in ("scheduled","completed"),"Confirm the dated session before booking or recording attendance")
  elif v["confirmation"] is not None:confirmation(v["confirmation"],s["instructor"])
  if state=="booked":need(reg["status"]=="active","Only an active original registration can hold a booked place")
  if state=="rescheduled":
   target=visits.get(v.get("replacementId"))
   need(target and target["id"]!=vid and target["registrationId"]==rid and target["sessionId"]!=sid,
        "Reschedule must name a separate visit for the same registration")
   chain={vid};cursor=target
   while cursor["state"]=="rescheduled":
    need(cursor["id"] not in chain,"Rescheduled visits cannot form a cycle");chain.add(cursor["id"])
    cursor=visits.get(cursor.get("replacementId"));need(cursor and cursor["registrationId"]==rid,"Reschedule chain lost the original registration")
   need(cursor["id"] not in chain,"Rescheduled visits cannot form a cycle")
  else:need(not v.get("replacementId"),"Only a rescheduled visit can point to a replacement")
  balances[rid]["used"]+=v["units"]
  if state=="booked":balances[rid]["reserved"]+=1
  rosters[sid].append({"visitId":vid,"registrationId":rid,"studentKey":reg["student_key"],"state":state,
                       "units":v["units"],"confirmation":v["confirmation"],"reason":v["reason"]})
  if state in ("missed","cancelled"):
   issues.append({"code":"cancellation-decision","visitId":vid,"detail":"Named decision consumes "+str(v["units"])+" visit(s). Financial refund remains in the original payment record."})
  if reg["status"]!="active" and state=="attended":
   issues.append({"code":"historic-registration-status","visitId":vid,"detail":"Attendance retained; selected registration status is "+reg["status"]})
 for rid,b in balances.items():
  b["remaining"]=b["granted"]+b["adjusted"]-b["used"];b["available"]=b["remaining"]-b["reserved"]
  need(b["available"]>=0,"Registration "+rid+" has fewer visit credits than attendance plus booked places")
 session_rows=[]
 for sid,s in sessions.items():
  rows=rosters[sid];occupied=sum(row["state"] in ("booked","attended","missed") for row in rows)
  need(occupied<=s["capacity"],"Session "+sid+" exceeds its shared capacity")
  session_rows.append({**s,"title":classes[s["classId"]]["title"],"occupied":occupied,
                       "placesAvailable":s["capacity"]-occupied,"waitlisted":sum(x["state"]=="waitlist" for x in rows),
                       "attended":sum(x["state"]=="attended" for x in rows),"roster":rows})
 # One student cannot hold two overlapping places, including different registrations.
 active=[v for v in visits.values() if v["state"] in ("booked","attended","missed")]
 by_student={}
 for v in active:by_student.setdefault(registrations[v["registrationId"]]["student_key"],[]).append(v)
 for student,rows in by_student.items():
  rows.sort(key=lambda v:clocks[v["sessionId"]][0])
  for left,right in zip(rows,rows[1:]):
   need(clocks[left["sessionId"]][1]<=clocks[right["sessionId"]][0],
        "Student "+student+" has overlapping selected sessions")
 return {"sessions":sorted(session_rows,key=lambda x:(x["start"],x["id"])),
         "balances":sorted(balances.values(),key=lambda x:x["registrationId"]),"issues":issues,
         "totals":{"sessions":len(sessions),"enrollments":len(enrollments),"visits":len(visits),
                   "used":sum(x["used"] for x in balances.values()),"reserved":sum(x["reserved"] for x in balances.values()),
                   "remaining":sum(x["remaining"] for x in balances.values())}}
def transition(before,after):
 for family,key in (("sessions","id"),("enrollments","registrationId"),("visits","id"),("adjustments","id")):
  old=records(before[family],key,family);new=records(after[family],key,family)
  need(set(old)<=set(new),"Retain earlier "+family+" and correct them through a new saved decision")
  for identity,row in old.items():
   current=new[identity]
   if family=="adjustments":need(row==current,"Credit adjustments are append-only; add a correcting adjustment")
   if family=="enrollments":need(row==current,"Retain the original visit grant; use a named credit adjustment")
   if family=="sessions":
    need(row["classId"]==current["classId"],"A session retains its original class")
    referenced=any(x["sessionId"]==identity for x in before["visits"])
    if referenced:
     need(all(row[k]==current[k] for k in ("start","end","timezone","instructor")),
          "An occupied session retains its date/instructor; cancel or reschedule visits to a new session")
   if family=="visits":need(all(row[k]==current[k] for k in ("registrationId","sessionId")),"Retain visit identity; reschedule to a separate named visit")
 need(before["intake"]["id"]==after["intake"]["id"],"Attendance remains attached to the same original intake review")

class Attendance:
 def __init__(self,workspace):
  self.workspace=workspace;self.db=workspace.db
  self.db.executescript("CREATE TABLE IF NOT EXISTS attendance_revisions(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));CREATE TABLE IF NOT EXISTS attendance_requests(id TEXT PRIMARY KEY,sha TEXT NOT NULL,body TEXT NOT NULL,result TEXT NOT NULL);")
 def view(self,id,revision=None):
  if revision is None:row=self.db.execute("SELECT body FROM attendance_revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
  else:row=self.db.execute("SELECT body FROM attendance_revisions WHERE id=? AND revision=?",(id,revision)).fetchone()
  if row is None:raise ValueError("Unknown attendance review/revision")
  value=json.loads(row[0]);d=value["definition"];actual=derive(d,self.workspace.view(d["intake"]["id"],d["intake"]["revision"]))
  need(sha(canonical(actual))==value["derivedSha256"],"Attendance derivation changed")
  return {**value,"derived":actual}
 def state(self):return {"schema":SCHEMA,"workspaceId":self.workspace.identity(),"reviews":[self.view(x[0]) for x in self.db.execute("SELECT DISTINCT id FROM attendance_revisions ORDER BY id")]}
 def history(self,id):return [self.view(id,x[0]) for x in self.db.execute("SELECT revision FROM attendance_revisions WHERE id=? ORDER BY revision",(id,))]
 def request(self,id):
  row=self.db.execute("SELECT body,result FROM attendance_requests WHERE id=?",(id,)).fetchone()
  return {"state":"NOT_RECORDED","requestId":id} if row is None else {"state":"RECORDED","requestId":id,"request":json.loads(row[0]),"result":json.loads(row[1])}
 def save(self,request):
  exact_keys(request,("requestId","id","expectedRevision","actor","at","definition"),("requestId","actor","at","definition"))
  rid=ident(request["requestId"]);text(request["actor"],"operator");stamp(request["at"]);raw=canonical(request);digest=sha(raw)
  self.db.execute("BEGIN IMMEDIATE")
  try:
   row=self.db.execute("SELECT sha,result FROM attendance_requests WHERE id=?",(rid,)).fetchone()
   if row:
    if row[0]!=digest:raise Conflict("Attendance request ID has a different complete body")
    result=json.loads(row[1]);self.db.commit();return self.view(result["id"],result["revision"])
   id=ident(request["id"]) if "id" in request else "attendance-"+digest[:24]
   row=self.db.execute("SELECT revision,body FROM attendance_revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
   if row is None:
    if "id" in request or "expectedRevision" in request:raise Conflict("New attendance review omits id and expectedRevision")
    revision=1
   else:
    if type(request.get("expectedRevision"))is not int or request["expectedRevision"]!=row[0]:raise Conflict("Attendance revision changed")
    revision=row[0]+1;transition(json.loads(row[1])["definition"],request["definition"])
   d=request["definition"];anchor=d["intake"];intake=self.workspace.view(anchor["id"],anchor["revision"])
   if row is not None:
    previous=json.loads(row[1])["definition"];old_anchor=previous["intake"]
    old_intake=self.workspace.view(old_anchor["id"],old_anchor["revision"])
    old_regs=records(old_intake["derived"]["datasets"].get("registrations",[]),"id","registration")
    new_regs=records(intake["derived"]["datasets"].get("registrations",[]),"id","registration")
    for enrollment in previous["enrollments"]:
     registration=enrollment["registrationId"]
     need(registration in new_regs and all(old_regs[registration][key]==new_regs[registration][key] for key in ("student_key","class_id")),
          "Existing attendance credits retain their original student and class when selecting a newer intake edition")
   actual=derive(d,intake)
   value={"schema":SCHEMA,"id":id,"revision":revision,"requestId":rid,"requestSha256":digest,
          "actor":request["actor"],"at":request["at"],"definition":d,"derivedSha256":sha(canonical(actual))}
   body=canonical(value).decode()
   self.db.execute("INSERT INTO attendance_revisions VALUES(?,?,?)",(id,revision,body))
   self.db.execute("INSERT INTO attendance_requests VALUES(?,?,?,?)",(rid,digest,raw.decode(),body));self.db.commit()
   return {**value,"derived":actual}
  except BaseException:self.db.rollback();raise
 def export(self,id,revision=None):
  selected=self.view(id,revision);history=[x for x in self.history(id) if x["revision"]<=selected["revision"]]
  highest=max(v["definition"]["intake"]["revision"] for v in history);anchor=selected["definition"]["intake"]
  members={"intake.zip":self.workspace.export(anchor["id"],highest),
           "selection.json":canonical({"id":selected["id"],"revision":selected["revision"]}),
           "attendance.json":canonical(selected)}
  for v in history:
   request=self.request(v["requestId"])["request"]
   members["history/"+str(v["revision"])+".json"]=canonical({"request":request,"view":{k:x for k,x in v.items() if k!="derived"}})
  bcols=("registrationId","studentKey","classId","granted","adjusted","used","reserved","remaining","available","registrationStatus","currency","feeMinor","paidMinor","balanceMinor")
  members["visit-balances.csv"]=csv_bytes(bcols,[[r.get(c,"") for c in bcols] for r in selected["derived"]["balances"]])
  cols=("sessionId","classId","start","end","timezone","instructor","capacity","registrationId","studentKey","state","units","confirmation","reason")
  rows=[]
  for s in selected["derived"]["sessions"]:
   for r in s["roster"]:rows.append([s["id"],s["classId"],s["start"],s["end"],s["timezone"],s["instructor"],s["capacity"],r["registrationId"],r["studentKey"],r["state"],r["units"],json.dumps(r["confirmation"],ensure_ascii=False),r["reason"]])
  members["attendance-register.csv"]=csv_bytes(cols,rows)
  manifest={"schema":"class-intake.attendance-packet.v1","selected":{"id":selected["id"],"revision":selected["revision"]},
            "files":[{"path":p,"bytes":len(b),"sha256":sha(b)} for p,b in sorted(members.items())]}
  members["manifest.json"]=canonical(manifest);need(sum(map(len,members.values()))<=MAX_PACKET,"Attendance handover exceeds 128 MiB")
  out=io.BytesIO()
  with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
   for p,b in sorted(members.items()):
    info=zipfile.ZipInfo(p,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,b)
  packet=out.getvalue();need(len(packet)<=MAX_PACKET,"Compressed attendance handover exceeds 128 MiB")
  return packet
 def receive(self,raw):
  self._receiving_publish_started=False
  try:return self._receive(raw)
  except ReceiveRejected:raise
  except Exception as error:
   if not self._receiving_publish_started:raise ReceiveRejected(str(error)) from error
   raise
 def _receive(self,raw):
  need(isinstance(raw,bytes) and len(raw)<=MAX_PACKET,"Attendance packet exceeds 128 MiB")
  with zipfile.ZipFile(io.BytesIO(raw)) as z:
   entries=z.infolist();names=[x.filename for x in entries]
   need(len(names)==len(set(names)) and sum(x.file_size for x in entries)<=MAX_PACKET,"Repeated or oversized attendance packet")
   members={n:z.read(n) for n in names}
  manifest=json.loads(members.pop("manifest.json"))
  need(manifest["schema"]=="class-intake.attendance-packet.v1","Unsupported attendance packet")
  descriptors=records(manifest["files"],"path","packet member")
  need(set(members)==set(descriptors),"Attendance packet member selection differs")
  for name,body in members.items():
   wanted=descriptors[name];need(len(body)==wanted["bytes"] and sha(body)==wanted["sha256"],"Attendance packet member changed")
  selection=json.loads(members["selection.json"]);need(selection==manifest["selected"],"Attendance packet selection differs")
  with tempfile.TemporaryDirectory() as tmp:
   verified=Workspace(tmp,True)
   try:
    verified.receive(members["intake.zip"]);attendance=Attendance(verified)
    for revision in range(1,selection["revision"]+1):
     item=json.loads(members["history/"+str(revision)+".json"]);actual=attendance.save(item["request"])
     need({k:v for k,v in actual.items() if k!="derived"}==item["view"],"Attendance history differs from its complete original request")
    need(attendance.export(selection["id"],selection["revision"])==raw,"Complete attendance packet does not reconstruct")
    # Adopt both original core and attendance histories in one SQLite transaction.
    self._receiving_publish_started=True
    self.db.execute("BEGIN IMMEDIATE")
    try:
     specs=[("sources",("id",),("id","raw","metadata")),("revisions",("id","revision"),("id","revision","body")),
            ("requests",("id",),("id","sha","body","result")),("attendance_revisions",("id","revision"),("id","revision","body")),
            ("attendance_requests",("id",),("id","sha","body","result"))]
     for table,keys,columns in specs:
      names=",".join(columns);where=" AND ".join(k+"=?" for k in keys)
      for row in verified.db.execute("SELECT "+names+" FROM "+table):
       wanted=[row[columns.index(k)] for k in keys];prior=self.db.execute("SELECT "+names+" FROM "+table+" WHERE "+where,wanted).fetchone()
       if prior and prior!=row:
        # As in core receiving, first source metadata remains owned by the recipient.
        if table!="sources" or prior[:2]!=row[:2]:raise Conflict("Received "+table+" diverges from local history")
       if not prior:self.db.execute("INSERT INTO "+table+" ("+names+") VALUES("+",".join("?" for _ in columns)+")",row)
     self.db.commit()
    except BaseException as error:
     if self.db.in_transaction:
      self.db.rollback()
      if isinstance(error,Exception):raise ReceiveRejected(str(error)) from error
     raise
   finally:verified.close()
  return {"selected":self.view(selection["id"],selection["revision"]),"current":self.view(selection["id"]),
          "packet":{"bytes":len(raw),"sha256":sha(raw)}}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("command",choices=("state","view","history","request","save","export","receive"))
 p.add_argument("--workspace",required=True);p.add_argument("--id");p.add_argument("--revision",type=int);p.add_argument("--input");p.add_argument("--output");a=p.parse_args()
 w=Workspace(a.workspace,a.command=="receive");attendance=Attendance(w)
 try:
  if a.command=="state":value=attendance.state()
  elif a.command=="view":value=attendance.view(a.id,a.revision)
  elif a.command=="history":value=attendance.history(a.id)
  elif a.command=="request":value=attendance.request(a.id)
  elif a.command=="save":value=attendance.save(json.loads(pathlib.Path(a.input).read_bytes()))
  elif a.command=="receive":value=attendance.receive(pathlib.Path(a.input).read_bytes())
  else:
   raw=attendance.export(a.id,a.revision);atomic(a.output,raw);value={"path":str(pathlib.Path(a.output).resolve()),"bytes":len(raw),"sha256":sha(raw)}
  print(json.dumps(value,ensure_ascii=False))
 finally:w.close()
if __name__=="__main__":main()
