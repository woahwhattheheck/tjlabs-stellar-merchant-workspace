"""Complete source-selected TONDO make-up ledger on the original FamilyWorkspace.
No payment, refund, message or provider operation is performed.
"""
from __future__ import annotations
import argparse,copy,datetime as dt,io,json,pathlib,re,tempfile,zipfile
from zoneinfo import ZoneInfo
from workspace import FamilyWorkspace,date,canonical,sha,text,ident,stamp,exact_keys,Conflict,ReceiveRejected,csv_bytes,MAX_PACKET,atomic

SCHEMA="class-intake.family-makeup.v1"
POLICIES={
 "registration-form-page3":{"id":"registration-form-page3","source":"eec6450f43b9798892d77c3688dba20f3aa9f11e4da9055e9f63f6d9ae754e7a","pages":[3],"noticeHours":24,"daysBefore":0,"daysAfter":30,"annualLimit":None,"studioExceptionReasons":["illness","emergency"],"expiresOnPauseOrWithdrawal":True,"semesterBound":False,"interpretation":"Thirty days after the missed lesson; this form does not explicitly permit before-absence scheduling."},
 "terms-pages1-2":{"id":"terms-pages1-2","source":"68fb0614ad67c0703ae2c74dfe455a9356c25bd720e651bf953fc95b386a313f","pages":[1,2],"noticeHours":24,"daysBefore":14,"daysAfter":14,"annualLimit":4,"studioExceptionReasons":[],"expiresOnPauseOrWithdrawal":False,"semesterBound":True,"interpretation":"Four make-ups September–June, within fourteen days before or after the missed lesson; no transfer to another explicitly selected semester."}}
ACCOUNTING="A confirmed unused booking reserves one entitlement. Rescheduling the same absence does not add one. Cancellation before the target starts releases that reservation. An unobserved past booking remains reserved until attendance or missed is recorded. Attended or missed make-ups remain consumed. This is the named operating interpretation, not additional quoted PDF wording."
NAMED=("reviewer","note","at")
DEFINITION=("name","notes","family","asOf","policies","absences","membershipEvents","bookingEvents","review")
TABLES=("revisions","family_revisions","makeup_revisions")
REQUEST_TABLES=("requests","family_requests","makeup_requests")

def instant(value):
 stamp(value);return dt.datetime.fromisoformat(value.replace("Z","+00:00")).astimezone(dt.timezone.utc)
def named(row,allowed,required=()):
 exact_keys(row,tuple(allowed)+NAMED,tuple(required)+NAMED)
 text(row["reviewer"],"named reviewer");text(row["note"],"review note",limit=20000);instant(row["at"])
def rows(value,label,limit):
 if not isinstance(value,list) or len(value)>limit:raise ValueError(label+" exceeds its complete row bound")
 return value
def integer(value,label,minimum,maximum):
 if type(value)is not int or not minimum<=value<=maximum:raise ValueError(label+" must be a bounded integer")
 return value
def local_moment(day,minute,zone):
 # Reject ambiguous/nonexistent local instants rather than silently choosing an offset.
 naive=dt.datetime.combine(date(day),dt.time(minute//60,minute%60));tz=ZoneInfo(zone)
 a=naive.replace(tzinfo=tz,fold=0);b=naive.replace(tzinfo=tz,fold=1)
 if a.utcoffset()!=b.utcoffset() or a.astimezone(dt.timezone.utc).astimezone(tz).replace(tzinfo=None)!=naive:
  raise ValueError("The selected local class time is ambiguous or nonexistent")
 return a.astimezone(dt.timezone.utc)
def minute(value):
 t=dt.time.fromisoformat(value)
 if t.tzinfo or t.second or t.microsecond:raise ValueError("Use an exact local hour and minute")
 return t.hour*60+t.minute
def definition(value):
 exact_keys(value,DEFINITION,DEFINITION);d=copy.deepcopy(value)
 d["name"]=text(d["name"],"name",limit=160);text(d["notes"],"notes",True,20000);instant(d["asOf"])
 exact_keys(d["family"],("id","revision","derivedSha256"),("id","revision","derivedSha256"))
 ident(d["family"]["id"]);integer(d["family"]["revision"],"family revision",1,100000)
 if not isinstance(d["family"]["derivedSha256"],str) or not re.fullmatch("[0-9a-f]{64}",d["family"]["derivedSha256"]):raise ValueError("Retain the exact original family derivation")
 named(d["review"],("status",),("status",))
 if d["review"]["status"] not in ("draft","reviewed"):raise ValueError("Select draft or reviewed")
 if instant(d["review"]["at"])>instant(d["asOf"]):raise ValueError("Review observation exceeds selected as-of")
 for key,limit in (("policies",32),("absences",5000),("membershipEvents",10000),("bookingEvents",20000)):
  rows(d[key],key,limit);seen=set()
  for row in d[key]:
   if not isinstance(row,dict):raise ValueError("Use complete named "+key+" records")
   ident(row.get("id"))
   if row["id"] in seen:raise ValueError("Repeated "+key+" identity")
   seen.add(row["id"])
   if instant(row["at"])>instant(d["asOf"]):raise ValueError("An observed event is later than the selected as-of instant")
 for p in d["policies"]:
  named(p,("id","editionId","source","semesters"),("id","editionId","source","semesters"))
  if p["editionId"] not in POLICIES or p["source"]!=POLICIES[p["editionId"]]["source"]:raise ValueError("Choose the exact complete original policy edition")
  rows(p["semesters"],"semesters",12);prior=None;ids=set()
  for term in p["semesters"]:
   exact_keys(term,("id","label","start","end"),("id","label","start","end"));ident(term["id"]);text(term["label"],"semester label")
   if term["id"] in ids or date(term["end"])<date(term["start"]) or prior and term["start"]<=prior:raise ValueError("Semester dates must be unique, ordered and non-overlapping")
   ids.add(term["id"]);prior=term["end"]
  if POLICIES[p["editionId"]]["semesterBound"] and not p["semesters"]:raise ValueError("Terms require explicit semester boundaries; the PDF does not supply their dates")
 for a in d["absences"]:
  named(a,("id","policyId","enrollmentId","date","slotId","noticeAt","noticeRef","reason","exception"),("id","policyId","enrollmentId","date","slotId","noticeAt","noticeRef","reason","exception"))
  ident(a["policyId"]);ident(a["enrollmentId"]);ident(a["slotId"]);date(a["date"]);instant(a["noticeAt"]);text(a["noticeRef"],"original advance-notice reference")
  if instant(a["noticeAt"])>instant(a["at"]):raise ValueError("Notice cannot be observed before its claimed receipt")
  if a["reason"] not in ("illness","emergency","other"):raise ValueError("Select an explicit absence reason")
  if a["exception"] is not None:
   named(a["exception"],("reference",),("reference",));text(a["exception"]["reference"],"original studio exception reference")
   if instant(a["exception"]["at"])>instant(d["asOf"]):raise ValueError("Studio exception is later than selected as-of")
 for e in d["membershipEvents"]:
  named(e,("id","enrollmentId","date","kind","reference"),("id","enrollmentId","date","kind","reference"))
  ident(e["enrollmentId"]);date(e["date"]);text(e["reference"],"original membership reference")
  if e["kind"] not in ("pause","resume","withdraw"):raise ValueError("Choose pause, resume or withdrawal")
 previous=None
 for e in d["bookingEvents"]:
  named(e,("id","absenceId","kind","target"),("id","absenceId","kind","target"));ident(e["absenceId"])
  at=instant(e["at"])
  if previous and at<previous:raise ValueError("Retain booking events in original observed order")
  previous=at
  if e["kind"] not in ("waitlist","book","reschedule","cancel","attended","missed","void"):raise ValueError("Unknown booking event")
  if e["kind"] in ("waitlist","book","reschedule"):
   t=e["target"];exact_keys(t,("date","slotId","capacity","capacityRef","instructor","confirmation"),("date","slotId","capacity","capacityRef","instructor","confirmation"))
   date(t["date"]);ident(t["slotId"]);text(t["capacityRef"],"capacity reference",True);text(t["instructor"],"instructor",True)
   if t["capacity"] is not None:integer(t["capacity"],"capacity",1,100000)
   named(t["confirmation"],("status","reference"),("status","reference"))
   if t["confirmation"]["status"] not in ("pending","confirmed"):raise ValueError("Select pending or confirmed instructor approval")
   text(t["confirmation"]["reference"],"approval reference",t["confirmation"]["status"]=="pending")
   if instant(t["confirmation"]["at"])>at:raise ValueError("Retain approval observed by the original booking event")
  elif e["target"] is not None:raise ValueError("Only booking, rescheduling or waiting-list events select a target")
 return d

def derive(value,family,source_get):
 d=definition(value);binding=d["family"]
 if any(family[k]!=binding[k] for k in ("id","revision","derivedSha256")):raise Conflict("Selected original family edition differs")
 f=family["definition"];derived=family["derived"];year=f["year"];zone=year["timezone"];asof=instant(d["asOf"]);today=asof.astimezone(ZoneInfo(zone)).date().isoformat()
 policies={p["id"]:p for p in d["policies"]}
 for p in policies.values():
  raw=source_get(p["source"])
  if sha(raw)!=p["source"]:raise ValueError("Complete policy source identity differs")
  for term in p["semesters"]:
   if term["start"]<year["start"] or term["end"]>year["end"]:raise ValueError("Explicit semesters must remain within the linked academic year")
 data=derived["datasets"];enrollments={r["id"]:r for r in data["enrollments"]};plans={r["id"]:r for r in data["plans"]};programmes={r["id"]:r for r in data["programmes"]};students={r["id"]:r for r in data["students"]}
 slots={}
 for row in data["slots"]:
  try:
   start,end=minute(row["start"]),minute(row["end"]);weekday=int(row["weekday"])
   if not 0<=weekday<=6 or end<=start or row["programme_id"] not in programmes:continue
   slots[row["id"]]={**row,"startMinute":start,"endMinute":end,"weekday":weekday}
  except (ValueError,KeyError):continue
 period_rows={(r["enrollment_id"],r["period_id"]):r for r in derived["periodEnrollments"]}
 periods={r["id"]:r for r in year["periods"]}
 excluded=set(f["calendar"]["excludedDates"])
 memberships={}
 for e in d["membershipEvents"]:
  if e["enrollmentId"] not in enrollments:raise ValueError("Membership event needs an original enrollment")
  memberships.setdefault(e["enrollmentId"],[]).append(e)
 for eid,events in memberships.items():
  prior=None;state="active"
  for e in events:
   if not year["start"]<=e["date"]<=year["end"] or prior and e["date"]<prior:raise ValueError("Membership dates must be ordered within this year")
   if state=="withdrawn" or e["kind"]=="resume" and state!="paused" or e["kind"]=="pause" and state!="active":raise ValueError("Membership event contradicts its preserved earlier state")
   state={"pause":"paused","resume":"active","withdraw":"withdrawn"}[e["kind"]];prior=e["date"]
 def active(eid,day):
  e=enrollments[eid]
  if e["status"]!="active" or not e["start"]<=day<=e["end"]:return False
  status="active"
  for event in memberships.get(eid,[]):
   if event["date"]<=day:status={"pause":"paused","resume":"active","withdraw":"withdrawn"}[event["kind"]]
  return status=="active"
 def ready(eid,day):
  candidates=[p for p in periods.values() if p["start"]<=day<=p["end"]]
  return len(candidates)==1 and period_rows.get((eid,candidates[0]["id"]),{}).get("readyForRoster") is True
 original={(r["enrollment_id"],r["date"],r["slot_id"]):r for r in derived["occurrences"]}
 regular_by_day={};student_regular={}
 for r in derived["occurrences"]:
  if r["date"] in excluded:continue
  regular_by_day.setdefault((r["programme_id"],r["location"],r["date"]),[]).append(r)
  student_regular.setdefault((r["student_id"],r["date"]),[]).append(r)
 absence_rows={};seen=set()
 def problem(code,note):return {"code":code,"note":note}
 for a in d["absences"]:
  if a["policyId"] not in policies or a["enrollmentId"] not in enrollments:raise ValueError("Absence requires original enrollment and named policy selection")
  key=(a["enrollmentId"],a["date"],a["slotId"])
  if key in seen:raise ValueError("One original missed lesson can have only one retained absence")
  seen.add(key)
  if instant(policies[a["policyId"]]["at"])>instant(a["at"]):raise ValueError("Select a policy reviewed before the absence observation")
  policy=POLICIES[policies[a["policyId"]]["editionId"]];e=enrollments[a["enrollmentId"]];p=plans[e["plan_id"]];o=original.get(key);problems=[]
  if not o:problems.append(problem("original-lesson-missing","Select an actual regular occurrence from the linked family edition"))
  if a["date"] in excluded:problems.append(problem("holiday-or-break","Closed dates do not create make-up entitlement"))
  if f["calendar"]["state"]!="confirmed":problems.append(problem("calendar-unconfirmed","Review the retained original calendar before booking"))
  if not active(e["id"],a["date"]):problems.append(problem("original-membership-inactive","The original lesson requires active enrollment"))
  if not ready(e["id"],a["date"]):problems.append(problem("original-roster-not-ready","The original lesson requires funded tuition, agreement and confirmed roster"))
  notice=None
  if o:
   start=local_moment(o["date"],o["startMinute"],zone);notice=int((start-instant(a["noticeAt"])).total_seconds())
   if notice<86400 and a["exception"] is None:problems.append(problem("advance-notice","Twenty-four hours advance notice is required"))
  if a["exception"] is not None and a["reason"] not in policy["studioExceptionReasons"]:raise ValueError("Only a named illness/emergency exception under the selected registration form can waive notice")
  first=(date(a["date"])-dt.timedelta(days=policy["daysBefore"])).isoformat();last=(date(a["date"])+dt.timedelta(days=policy["daysAfter"])).isoformat()
  first=max(first,year["start"],e["start"]);last=min(last,year["end"],e["end"])
  term=None
  if policy["semesterBound"]:
   if date(a["date"]).month in (7,8):problems.append(problem("outside-policy-year","The selected Terms grant make-ups only September through June"))
   start_year=date(year["start"]).year if date(year["start"]).month>=7 else date(year["start"]).year-1
   first=max(first,f"{start_year}-09-01");last=min(last,f"{start_year+1}-06-30")
   selected=[t for t in policies[a["policyId"]]["semesters"] if t["start"]<=a["date"]<=t["end"]]
   if len(selected)!=1:problems.append(problem("semester-unselected","Select the original absence's explicit semester"))
   else:term=selected[0];first=max(first,term["start"]);last=min(last,term["end"])
  expiry=[x for x in memberships.get(e["id"],[]) if x["kind"] in ("pause","withdraw") and x["date"]>=a["date"]] if policy["expiresOnPauseOrWithdrawal"] else []
  if expiry:last=min(last,(date(expiry[0]["date"])-dt.timedelta(days=1)).isoformat())
  absence_rows[a["id"]]={"id":a["id"],"studentId":e["student_id"],"enrollmentId":e["id"],"programmeId":p["programme_id"],"policyId":a["policyId"],"policyEdition":policy["id"],"original":o,"firstDate":first,"lastDate":last,"semester":term,"noticeSeconds":notice,"noticeException":a["exception"],"eligible":not problems and first<=last,"blockers":problems,"state":"REQUESTED","target":None,"lastEvent":None}
 origin_blockers={aid:copy.deepcopy(row["blockers"]) for aid,row in absence_rows.items()}
 states={aid:{"state":"REQUESTED","target":None,"lastEvent":None,"consumed":False} for aid in absence_rows};event_results=[]
 def temporal_target(a,t):
  row=absence_rows[a["id"]];problems=list(origin_blockers[a["id"]]);s=slots.get(t["slotId"])
  if s is None:return None,problems+[problem("target-slot-missing","Choose an actual original weekly slot")]
  programme=programmes[s["programme_id"]];day=t["date"]
  target={**copy.deepcopy(t),"programmeId":s["programme_id"],"location":programme["location"],"start":s["start"],"end":s["end"],"startMinute":s["startMinute"],"endMinute":s["endMinute"],"timezone":zone}
  if s["programme_id"]!=row["programmeId"]:problems.append(problem("target-programme","Make-up must remain in the selected source programme"))
  if date(day).weekday()!=s["weekday"] or day in excluded or not year["start"]<=day<=year["end"]:problems.append(problem("target-calendar","Target must be an open original programme slot within the academic year"))
  if not row["firstDate"]<=day<=row["lastDate"]:problems.append(problem("policy-window","Target falls outside this retained policy/semester/expiry window"))
  if row["original"] and row["policyEdition"]=="registration-form-page3" and local_moment(day,s["startMinute"],zone)<local_moment(a["date"],row["original"]["endMinute"],zone):problems.append(problem("after-original-lesson","Registration-form interpretation permits a target only after the original lesson"))
  if not active(a["enrollmentId"],day):problems.append(problem("target-membership-inactive","Active enrollment is required at the make-up"))
  if not ready(a["enrollmentId"],day):problems.append(problem("target-roster-not-ready","Target period must retain funded tuition, agreement and named confirmation"))
  published=programme["capacity"];capacity=int(published) if published else t["capacity"]
  if published and t["capacity"] not in (None,capacity):problems.append(problem("capacity-source-differs","Target capacity conflicts with the selected original programme"))
  if not published and t["capacity"] is not None and not t["capacityRef"].strip():problems.append(problem("capacity-reference","Unpublished capacity needs an explicit original operator reference"))
  target["effectiveCapacity"]=capacity
  return target,problems
 def effective(aid,state,atday):
  row=absence_rows[aid]
  if state["state"] not in ("REQUESTED","BOOKED","WAITLISTED"):return state["state"]
  if atday>row["lastDate"] and state["state"] in ("REQUESTED","WAITLISTED"):return "EXPIRED"
  if state["target"]:
   _,errors=temporal_target(absences[aid],state["target"])
   if errors:return "INELIGIBLE"
  # A past confirmed reservation remains accountable until attendance, missed or timely cancellation.
  return state["state"]
 def assigned(exclude=None):
  return [(aid,s) for aid,s in states.items() if aid!=exclude and s["state"] in ("BOOKED","ATTENDED","MISSED") and s["target"]]
 def target_counts(aid,target):
  regular=regular_by_day.get((target["programmeId"],target["location"],target["date"]),[])
  booked=[(k,s) for k,s in assigned(aid) if (s["target"]["programmeId"],s["target"]["location"],s["target"]["date"])==(target["programmeId"],target["location"],target["date"]) and effective(k,s,target["date"]) in ("BOOKED","ATTENDED","MISSED")]
  def overlap(t):return t["startMinute"]<target["endMinute"] and target["startMinute"]<t["endMinute"]
  cuts={target["startMinute"],target["endMinute"]}
  for r in regular+[s["target"] for _,s in booked]:
   if overlap(r):cuts.update((max(r["startMinute"],target["startMinute"]),min(r["endMinute"],target["endMinute"])))
  peak=0
  for cut in sorted(cuts)[:-1]:
   attendees={r["student_id"] for r in regular if r["startMinute"]<=cut<r["endMinute"] and active(r["enrollment_id"],r["date"])}
   attendees.update(absence_rows[k]["studentId"] for k,s in booked if s["target"]["startMinute"]<=cut<s["target"]["endMinute"])
   peak=max(peak,len(attendees))
  return peak,booked
 absences={a["id"]:a for a in d["absences"]}
 for event in d["bookingEvents"]:
  aid=event["absenceId"]
  if aid not in states:raise ValueError("Booking event must bind an original retained absence")
  a=absences[aid];row=absence_rows[aid];current=states[aid];kind=event["kind"];problems=[];target=None
  allowed={"waitlist":("REQUESTED","WAITLISTED","CANCELLED"),"book":("REQUESTED","WAITLISTED","CANCELLED"),"reschedule":("BOOKED",),"cancel":("BOOKED","WAITLISTED"),"attended":("BOOKED",),"missed":("BOOKED",),"void":("REQUESTED","WAITLISTED","CANCELLED")}
  if current["state"] not in allowed[kind]:raise ValueError("Booking transition conflicts with original event history: "+event["id"])
  if instant(event["at"])<instant(a["at"]):raise ValueError("Booking event predates its absence observation")
  if a["exception"] is not None and instant(a["exception"]["at"])>instant(event["at"]):raise ValueError("Studio exception must precede the selected booking action")
  if kind=="reschedule" and current["target"] and instant(event["at"])>=local_moment(current["target"]["date"],current["target"]["startMinute"],zone):raise ValueError("An already-started booking needs an attended or missed observation, not rescheduling")
  if kind in ("waitlist","book","reschedule"):
   target,problems=temporal_target(a,event["target"])
   if target:
    if instant(event["at"])>=local_moment(target["date"],target["startMinute"],zone):problems.append(problem("target-in-past","A new booking must be observed before the selected session begins"))
    if kind!="waitlist":
     if target["confirmation"]["status"]!="confirmed" or not target["instructor"].strip():problems.append(problem("instructor-approval","A named instructor and original studio approval are required"))
     if target["effectiveCapacity"] is None:problems.append(problem("capacity-unconfirmed","Unpublished capacity must be explicitly confirmed"))
     count,other=target_counts(aid,target);target["occupiedBefore"]=count;target["occupiedAfter"]=count+1
     if target["effectiveCapacity"] is not None and count+1>target["effectiveCapacity"]:problems.append(problem("capacity-full","Original regular roster and active make-ups exhaust shared programme capacity"))
     for _,otherstate in other:
      t=otherstate["target"]
      if t["startMinute"]<target["endMinute"] and target["startMinute"]<t["endMinute"] and t["effectiveCapacity"]!=target["effectiveCapacity"]:problems.append(problem("capacity-decision-conflict","Overlapping targets must retain the same explicit capacity decision"))
     conflicts=[r for r in student_regular.get((row["studentId"],target["date"]),[]) if r["startMinute"]<target["endMinute"] and target["startMinute"]<r["endMinute"] and active(r["enrollment_id"],r["date"])]
     conflicts.extend(s["target"] for k,s in assigned(aid) if absence_rows[k]["studentId"]==row["studentId"] and s["target"]["date"]==target["date"] and s["target"]["startMinute"]<target["endMinute"] and target["startMinute"]<s["target"]["endMinute"] and effective(k,s,target["date"]) in ("BOOKED","ATTENDED","MISSED"))
     if conflicts:problems.append(problem("student-overlap","Student already has an original class or confirmed make-up in this interval"))
     count=sum(1 for k,s in states.items() if k!=aid and absence_rows[k]["studentId"]==row["studentId"] and (s["consumed"] or s["state"]=="BOOKED"))
     limit=POLICIES[row["policyEdition"]]["annualLimit"]
     if limit is not None and count>=limit:problems.append(problem("annual-limit","The selected Terms limit is four retained student entitlements in this academic year"))
   # Waitlist keeps eligibility/capacity questions visible and reserves no place.
   nextstate="WAITLISTED" if kind=="waitlist" else "BOOKED"
   states[aid]={"state":nextstate,"target":target,"lastEvent":event["id"],"consumed":False}
  else:
   target=current["target"]
   if kind in ("attended","missed"):
    if target is None or instant(event["at"])<local_moment(target["date"],target["endMinute"],zone):raise ValueError("Attendance or missed observation requires an ended original booking")
    states[aid]={**current,"state":kind.upper(),"lastEvent":event["id"],"consumed":True}
   else:
    if kind=="cancel" and target and instant(event["at"])>=local_moment(target["date"],target["startMinute"],zone):raise ValueError("After the original session begins, record attended or missed rather than releasing consumed capacity")
    states[aid]={"state":"CANCELLED" if kind=="cancel" else "VOID","target":None,"lastEvent":event["id"],"consumed":False}
  event_results.append({"id":event["id"],"absenceId":aid,"kind":kind,"state":states[aid]["state"],"target":target,"blockers":problems,"eligible":not problems})
 issues=[];bookings=[];annual={}
 for aid,state in states.items():
  row=absence_rows[aid];current=effective(aid,state,today);blockers=list(row["blockers"])
  if state["target"]:_,current_errors=temporal_target(absences[aid],state["target"]);blockers=current_errors
  if state["state"]=="BOOKED" and state["target"]:
   t=state["target"];occupied,other=target_counts(aid,t)
   if t["effectiveCapacity"] is None or occupied+1>t["effectiveCapacity"]:blockers.append(problem("current-capacity","Current original roster and retained reservations exceed the selected capacity"))
   for _,otherstate in other:
    ot=otherstate["target"]
    if ot["startMinute"]<t["endMinute"] and t["startMinute"]<ot["endMinute"] and ot["effectiveCapacity"]!=t["effectiveCapacity"]:blockers.append(problem("current-capacity-conflict","Retained overlapping reservations select different capacity decisions"))
   clash=[r for r in student_regular.get((row["studentId"],t["date"]),[]) if r["startMinute"]<t["endMinute"] and t["startMinute"]<r["endMinute"] and active(r["enrollment_id"],r["date"])]
   clash.extend(otherstate["target"] for k,otherstate in assigned(aid) if absence_rows[k]["studentId"]==row["studentId"] and otherstate["target"]["date"]==t["date"] and otherstate["target"]["startMinute"]<t["endMinute"] and t["startMinute"]<otherstate["target"]["endMinute"] and effective(k,otherstate,t["date"]) in ("BOOKED","ATTENDED","MISSED"))
   if clash:blockers.append(problem("current-student-overlap","The current original roster or another retained reservation overlaps this student"))
   total=sum(1 for k,otherstate in states.items() if absence_rows[k]["studentId"]==row["studentId"] and (otherstate["consumed"] or otherstate["state"]=="BOOKED"))
   limit=POLICIES[row["policyEdition"]]["annualLimit"]
   if limit is not None and total>limit:blockers.append(problem("current-annual-limit","Current retained entitlements exceed this selected policy's annual limit"))
   if blockers:current="INELIGIBLE"
  if current=="EXPIRED":blockers.append(problem("expired","The original entitlement window has ended"))
  row.update(state=current,requestedState=state["state"],target=state["target"],lastEvent=state["lastEvent"],eligible=not blockers,blockers=blockers)
  bookings.append({"absenceId":aid,"studentId":row["studentId"],"state":current,"requestedState":state["state"],"target":state["target"],"lastEvent":state["lastEvent"],"consumed":state["consumed"]})
  counted=state["consumed"] or state["state"]=="BOOKED"
  entry=annual.setdefault(row["studentId"],{"studentId":row["studentId"],"yearId":year["id"],"reserved":0,"consumed":0,"counted":0,"byPolicy":{}})
  if counted:
   entry["counted"]+=1;entry["consumed" if state["consumed"] else "reserved"]+=1;entry["byPolicy"][row["policyEdition"]]=entry["byPolicy"].get(row["policyEdition"],0)+1
  for item in blockers:issues.append({"absenceId":aid,**item})
 sessions={}
 for row in derived["occurrences"]:
  key=(row["programme_id"],row["location"],row["date"],row["slot_id"])
  if row["date"] in excluded:continue
  if key not in sessions:sessions[key]={"id":"session-"+sha(canonical(key))[:24],"programmeId":row["programme_id"],"location":row["location"],"date":row["date"],"slotId":row["slot_id"],"start":row["start"],"end":row["end"],"startMinute":row["startMinute"],"endMinute":row["endMinute"],"timezone":zone,"capacity":row["capacity"]}
 for state in states.values():
  if state["target"]:
   t=state["target"];key=(t["programmeId"],t["location"],t["date"],t["slotId"]);sessions.setdefault(key,{"id":"session-"+sha(canonical(key))[:24],"programmeId":t["programmeId"],"location":t["location"],"date":t["date"],"slotId":t["slotId"],"start":t["start"],"end":t["end"],"startMinute":t["startMinute"],"endMinute":t["endMinute"],"timezone":zone,"capacity":t["effectiveCapacity"]})
 for s in sessions.values():
  count,_=target_counts(None,s);s["occupancy"]=count;s["available"]=None if s["capacity"] is None else max(0,s["capacity"]-count)
 return {"schema":SCHEMA,"family":binding,"year":copy.deepcopy(year),"asOf":d["asOf"],"policyCatalog":copy.deepcopy(list(POLICIES.values())),"accountingInterpretation":ACCOUNTING,"absences":list(absence_rows.values()),"bookings":bookings,"events":event_results,"sessions":sorted(sessions.values(),key=lambda r:(r["date"],r["startMinute"],r["programmeId"],r["slotId"])),"issues":issues,"annualCounts":list(annual.values()),"counts":{"absences":len(absence_rows),"bookingEvents":len(event_results),"booked":sum(b["state"]=="BOOKED" for b in bookings),"waitlisted":sum(b["state"]=="WAITLISTED" for b in bookings),"attended":sum(b["state"]=="ATTENDED" for b in bookings),"missed":sum(b["state"]=="MISSED" for b in bookings),"expired":sum(b["state"] in ("EXPIRED","INELIGIBLE") for b in bookings)},"familyTotals":copy.deepcopy(derived["totals"]),"providerWrites":0}

class MakeupWorkspace:
 def __init__(self,directory,create=False):
  self.family=FamilyWorkspace(directory,create);self.base=self.family.base;self.db=self.family.db;self.root=self.family.root
  self.db.executescript("CREATE TABLE IF NOT EXISTS makeup_revisions(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));CREATE TABLE IF NOT EXISTS makeup_requests(id TEXT PRIMARY KEY,sha TEXT NOT NULL,body TEXT NOT NULL,result TEXT NOT NULL);")
 def close(self):self.family.close()
 def identity(self):return self.family.identity()
 def preview(self,value):
  d=definition(value);return derive(d,self.family.view(d["family"]["id"],d["family"]["revision"]),self.base.source)
 def state(self):
  return {"schema":SCHEMA,"workspaceId":self.identity(),"policyCatalog":copy.deepcopy(list(POLICIES.values())),"accountingInterpretation":ACCOUNTING,"familyReviews":[self.family.view(r[0]) for r in self.db.execute("SELECT DISTINCT id FROM family_revisions ORDER BY id")],"reviews":[self.view(r[0]) for r in self.db.execute("SELECT DISTINCT id FROM makeup_revisions ORDER BY id")],"sources":self.base.sources(),"contract":{"definitionFields":list(DEFINITION),"providerWrites":0,"maxPacketBytes":MAX_PACKET}}
 def view(self,id,revision=None):
  row=self.db.execute("SELECT body FROM makeup_revisions WHERE id=?"+(" AND revision=?" if revision is not None else " ORDER BY revision DESC LIMIT 1"),(id,revision) if revision is not None else (id,)).fetchone()
  if row is None:raise ValueError("Unknown make-up review/revision")
  v=json.loads(row[0]);actual=self.preview(v["definition"])
  if sha(canonical(actual))!=v["derivedSha256"]:raise ValueError("Retained make-up derivation differs")
  retained=self.family.view(v["familyHead"]["id"],v["familyHead"]["revision"])
  if retained["derivedSha256"]!=v["familyHead"]["derivedSha256"]:raise ValueError("Retained original family history differs")
  for s in v["sources"]:
   if len(self.base.source(s["id"]))!=s["bytes"]:raise ValueError("Complete policy source length differs")
  return {**v,"derived":actual}
 def history(self,id):return [self.view(id,r[0]) for r in self.db.execute("SELECT revision FROM makeup_revisions WHERE id=? ORDER BY revision",(id,))]
 def request(self,rid):
  row=self.db.execute("SELECT sha,body,result FROM makeup_requests WHERE id=?",(rid,)).fetchone()
  return {"state":"NOT_RECORDED","requestId":rid,"workspaceId":self.identity()} if row is None else {"state":"RECORDED","requestId":rid,"workspaceId":self.identity(),"sha256":row[0],"request":json.loads(row[1]),"result":json.loads(row[2])}
 def save(self,request):
  exact_keys(request,("requestId","id","expectedRevision","actor","at","definition"),("requestId","actor","at","definition"));rid=ident(request["requestId"]);text(request["actor"],"actor");instant(request["at"]);raw=canonical(request)
  if len(raw)>4*1024*1024:raise ValueError("Complete make-up request exceeds4MiB")
  digest=sha(raw);d=definition(request["definition"])
  if instant(d["asOf"])>instant(request["at"]):raise ValueError("As-of cannot exceed this original observed save")
  self.db.execute("BEGIN IMMEDIATE")
  try:
   prior=self.db.execute("SELECT sha,result FROM makeup_requests WHERE id=?",(rid,)).fetchone()
   if prior:
    if prior[0]!=digest:raise Conflict("Original request ID reused with different complete input")
    v=json.loads(prior[1]);self.db.commit();return self.view(v["id"],v["revision"])
   family=self.family.view(d["family"]["id"],d["family"]["revision"]);key="makeup-"+sha(canonical([family["id"],family["definition"]["year"]["id"]]))[:24]
   if request.get("id",key)!=key:raise Conflict("Keep the one original ledger for this family and academic year")
   old=self.db.execute("SELECT revision,body FROM makeup_revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(key,)).fetchone()
   previous=json.loads(old[1]) if old else None
   if old:
    if request.get("id")!=key or type(request.get("expectedRevision"))is not int or request["expectedRevision"]!=old[0]:raise Conflict("Make-up ledger changed; reopen its original current revision")
    revision=old[0]+1;before=previous["definition"]
    for field in ("policies","absences","membershipEvents","bookingEvents"):
     if d[field][:len(before[field])]!=before[field] or len(d[field])<len(before[field]):raise Conflict("Preserve complete original "+field+"; append a named event")
    if instant(d["asOf"])<instant(before["asOf"]):raise Conflict("Do not move the observed ledger clock backward")
    if d["family"]["id"]!=before["family"]["id"] or d["family"]["revision"]<before["family"]["revision"]:raise Conflict("Retain the same family and move source revisions forward explicitly")
   else:
    if "id" in request or "expectedRevision" in request:raise Conflict("Create omits saved ID and expected revision")
    revision=1
   actual=derive(d,family,self.base.source)
   prior_events=len(previous["definition"]["bookingEvents"]) if previous else 0
   for event in actual["events"][prior_events:]:
    if event["kind"] in ("book","reschedule") and event["blockers"]:raise ValueError("Booking rejected: "+json.dumps(event["blockers"],ensure_ascii=False))
   # A newly received future-dated membership decision may legitimately expire an old booking;
   # the event and its originally accepted revision remain intact.
   head=self.family.view(family["id"]);sources=[self.base.source_info(s) for s in sorted({p["source"] for p in d["policies"]})]
   v={"schema":SCHEMA,"id":key,"revision":revision,"requestId":rid,"requestSha256":digest,"actor":request["actor"],"at":request["at"],"definition":d,"sources":sources,"familyHead":{k:head[k] for k in ("id","revision","derivedSha256")},"derivedSha256":sha(canonical(actual))}
   self.db.execute("INSERT INTO makeup_revisions VALUES(?,?,?)",(key,revision,canonical(v).decode()));self.db.execute("INSERT INTO makeup_requests VALUES(?,?,?,?)",(rid,digest,raw.decode(),canonical(v).decode()));self.db.commit();return {**v,"derived":actual}
  except BaseException:self.db.rollback();raise
 def compare(self,id,before,after):
  a,b=self.view(id,before),self.view(id,after);changes=[]
  for kind,key in (("absences","id"),("bookings","absenceId"),("annualCounts","studentId")):
   aa={r[key]:r for r in a["derived"][kind]};bb={r[key]:r for r in b["derived"][kind]}
   changes.extend({"kind":kind,"id":k,"before":aa.get(k),"after":bb.get(k)} for k in sorted(set(aa)|set(bb)) if aa.get(k)!=bb.get(k))
  return {"schema":"class-intake.family-makeup-comparison.v1","id":id,"beforeRevision":before,"afterRevision":after,"changes":changes,"beforeDerivedSha256":a["derivedSha256"],"afterDerivedSha256":b["derivedSha256"]}
 def export(self,id,revision=None):
  v=self.view(id,revision);history=self.history(id)[:v["revision"]];members={}
  for h in history:
   members["history/"+str(h["revision"])+".json"]=canonical({"view":{k:x for k,x in h.items() if k!="derived"},"request":self.request(h["requestId"])["request"]})
   f=h["familyHead"];members["family/"+f["id"]+"-"+str(f["revision"])+".zip"]=self.family.export(f["id"],f["revision"])
   for s in h["sources"]:members["sources/"+s["id"]]=self.base.source(s["id"])
  members["selected.json"]=canonical({"id":id,"revision":v["revision"]});members["reports/complete.json"]=canonical(v);members["reports/policies.json"]=canonical({"catalog":list(POLICIES.values()),"selections":v["definition"]["policies"],"accountingInterpretation":ACCOUNTING})
  for key,columns in (("bookings",("absenceId","studentId","state","requestedState","lastEvent","consumed")),("annualCounts",("studentId","yearId","reserved","consumed","counted")),("sessions",("id","programmeId","slotId","date","start","end","capacity","occupancy","available"))):
   members["reports/"+key+".csv"]=csv_bytes(columns,[[r.get(c,"") for c in columns] for r in v["derived"][key]])
  members["READ_ME.txt"]=b"Complete private make-up lesson review. Original family history, full policy PDFs, exact requests, named studio decisions and all booking/attendance history are retained. Conflicting policy editions are separate named selections. All payment records remain unchanged; no provider operation is executed."
  manifest={"schema":"class-intake.family-makeup-packet.v1","selected":{"id":id,"revision":v["revision"]},"files":[]}
  manifest["files"]=[{"path":n,"bytes":len(b),"sha256":sha(b)} for n,b in sorted(members.items())];members["manifest.json"]=canonical(manifest)
  if sum(map(len,members.values()))>MAX_PACKET:raise ValueError("Manifest-inclusive expanded packet exceeds128MiB")
  out=io.BytesIO()
  with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:
   for name,body in sorted(members.items()):
    info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,body)
  raw=out.getvalue()
  if len(raw)>MAX_PACKET:raise ValueError("Packet exceeds128MiB")
  return raw
 def receive(self,raw):
  admission="NOT_ADOPTED"
  try:
   if not isinstance(raw,bytes) or len(raw)>MAX_PACKET:raise ValueError("Complete packet exceeds bound")
   with zipfile.ZipFile(io.BytesIO(raw)) as z:
    names=z.namelist()
    if len(names)!=len(set(names)) or len(names)>100000 or sum(i.file_size for i in z.infolist())>MAX_PACKET:raise ValueError("Repeated or oversized complete packet")
    for n in names:
     p=pathlib.PurePosixPath(n)
     if not n or p.is_absolute() or str(p)!=n or "\\" in n or "\0" in n or any(x in (".","..") for x in p.parts):raise ValueError("Unsafe packet member")
    members={n:z.read(n) for n in names}
   manifest=json.loads(members.pop("manifest.json"));exact_keys(manifest,("schema","selected","files"),("schema","selected","files"))
   if manifest["schema"]!="class-intake.family-makeup-packet.v1" or len(manifest["files"])!=len(members) or set(members)!={f["path"] for f in manifest["files"]}:raise ValueError("Complete packet membership differs")
   for f in manifest["files"]:
    exact_keys(f,("path","bytes","sha256"),("path","bytes","sha256"))
    if len(members[f["path"]])!=f["bytes"] or sha(members[f["path"]])!=f["sha256"]:raise ValueError("Complete packet member differs")
   selected=json.loads(members["selected.json"]);exact_keys(selected,("id","revision"),("id","revision"));ident(selected["id"]);integer(selected["revision"],"selected revision",1,100000)
   if selected!=manifest["selected"]:raise ValueError("Packet selection differs")
   with tempfile.TemporaryDirectory() as directory:
    check=MakeupWorkspace(directory,True)
    try:
     for revision in range(1,selected["revision"]+1):
      item=json.loads(members["history/"+str(revision)+".json"]);exact_keys(item,("view","request"),("view","request"));view=item["view"];f=view["familyHead"]
      check.family.receive(members["family/"+f["id"]+"-"+str(f["revision"])+".zip"])
      for s in view["sources"]:
       source=members["sources/"+s["id"]]
       if sha(source)!=s["id"] or len(source)!=s["bytes"]:raise ValueError("Original policy source differs")
       metadata={k:v for k,v in s.items() if k not in ("id","bytes")};check.base.add_source(source,metadata)
       with check.db:check.db.execute("UPDATE sources SET metadata=? WHERE id=?",(canonical(metadata).decode(),s["id"]))
      actual=check.save(item["request"])
      if {k:v for k,v in actual.items() if k!="derived"}!=view:raise ValueError("Complete request/history reconstruction differs")
     if check.export(selected["id"],selected["revision"])!=raw:raise ValueError("Complete packet has changed, missing or unexplained report/history assets")
     self.db.execute("BEGIN IMMEDIATE");admission="IN_PROGRESS"
     try:
      for sid,body,metadata in check.db.execute("SELECT id,raw,metadata FROM sources"):
       prior=self.db.execute("SELECT raw FROM sources WHERE id=?",(sid,)).fetchone()
       if prior and prior[0]!=body:raise Conflict("Original source collision")
       if not prior:self.db.execute("INSERT INTO sources VALUES(?,?,?)",(sid,body,metadata))
      for table in TABLES:
       for id,revision,body in check.db.execute("SELECT id,revision,body FROM "+table):
        old=self.db.execute("SELECT body FROM "+table+" WHERE id=? AND revision=?",(id,revision)).fetchone()
        if old and old[0]!=body:raise Conflict("Existing original history diverges")
        if not old:self.db.execute("INSERT INTO "+table+" VALUES(?,?,?)",(id,revision,body))
      for table in REQUEST_TABLES:
       for rid,digest,body,result in check.db.execute("SELECT id,sha,body,result FROM "+table):
        old=self.db.execute("SELECT sha,body,result FROM "+table+" WHERE id=?",(rid,)).fetchone()
        if old and old!=(digest,body,result):raise Conflict("Existing original request differs")
        if not old:self.db.execute("INSERT INTO "+table+" VALUES(?,?,?,?)",(rid,digest,body,result))
      admission="UNKNOWN";self.db.commit();admission="ADOPTED"
     except BaseException:
      previous=admission;self.db.rollback()
      if previous=="IN_PROGRESS":admission="NOT_ADOPTED"
      raise
    finally:check.close()
   return {"selected":self.view(selected["id"],selected["revision"]),"history":self.history(selected["id"]),"packet":{"bytes":len(raw),"sha256":sha(raw)}}
  except Exception as error:
   if admission=="NOT_ADOPTED":raise ReceiveRejected(str(error)) from error
   raise

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("command",choices=("state","preview","save","view","history","request","compare","export","receive"));p.add_argument("--workspace",required=True);p.add_argument("--input");p.add_argument("--id");p.add_argument("--revision",type=int);p.add_argument("--before",type=int);p.add_argument("--after",type=int);p.add_argument("--packet");p.add_argument("--output");a=p.parse_args()
 w=MakeupWorkspace(a.workspace,a.command=="receive" and not pathlib.Path(a.workspace).exists())
 try:
  if a.command=="state":result=w.state()
  elif a.command=="preview":result=w.preview(json.loads(pathlib.Path(a.input).read_bytes()))
  elif a.command=="save":result=w.save(json.loads(pathlib.Path(a.input).read_bytes()))
  elif a.command=="view":result=w.view(a.id,a.revision)
  elif a.command=="history":result=w.history(a.id)
  elif a.command=="request":result=w.request(a.id)
  elif a.command=="compare":result=w.compare(a.id,a.before,a.after)
  elif a.command=="receive":result=w.receive(pathlib.Path(a.packet).read_bytes())
  else:
   raw=w.export(a.id,a.revision);atomic(a.output,raw);result={"path":str(pathlib.Path(a.output).resolve()),"bytes":len(raw),"sha256":sha(raw)}
  print(json.dumps(result,ensure_ascii=False))
 finally:w.close()
if __name__=="__main__":main()
