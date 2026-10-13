"""Source-bound family tuition, agreements and recurring-period handover.
Python 3.11+, using the original Class Intake source store and exact-money contract.
"""
from __future__ import annotations
import argparse,calendar,copy,datetime as dt,io,json,pathlib,re,sys,tempfile,zipfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent/"class_intake"))
from class_intake import Workspace,Conflict,ReceiveRejected,canonical,sha,text,ident,stamp,exact_keys,money,amount,parse_table,csv_bytes,MAX_PACKET,MAX_SOURCE,atomic
SCHEMA="class-intake.family-tuition.v1"
FIELDS={
 "programmes":("id","title","min_age","max_age","duration_minutes","capacity","location"),
 "plans":("id","programme_id","frequency","tuition","currency"),
 "slots":("id","programme_id","weekday","start","end"),
 "households":("id","label","contact_ref"),
 "students":("id","household_id","name","birth_date","registration_type"),
 "enrollments":("id","student_id","plan_id","slot_ids","start","end","status"),
 "payments":("id","household_id","gross","refund","currency","status","posted_at","provider_ref"),
 "agreements":("id","student_id","document_source","signed_at","valid_from","valid_to","status","signer_ref"),
 "confirmations":("id","enrollment_id","period_id","status","actor","at")}
REQUIRED={k:tuple(v) for k,v in FIELDS.items()}
DATASETS=tuple(FIELDS)
def date(value):
 value=text(value,"date",limit=10)
 if not re.fullmatch(r"\d{4}-\d{2}-\d{2}",value):raise ValueError("Use an exact YYYY-MM-DD date")
 return dt.date.fromisoformat(value)
def unsigned(value,name,maximum=100000):
 if not isinstance(value,str) or not re.fullmatch(r"0|[1-9][0-9]*",value) or int(value)>maximum:raise ValueError(name+" must be a bounded integer string")
 return int(value)
def named(v,allowed,required):
 exact_keys(v,tuple(allowed)+("reviewer","note","at"),tuple(required)+("reviewer","note","at"))
 text(v["reviewer"],"reviewer");text(v["note"],"review note");stamp(v["at"])
def mapping(raw,s):
 exact_keys(s,("source","format","sheet","headers","fields","valueMaps"),("source","format","headers","fields"))
 table=parse_table(raw,s["format"],s.get("sheet"))
 if s["headers"]!=table["columns"]:raise ValueError("Mapping must retain the complete original header")
 for field,v in s["fields"].items():
  exact_keys(v,("index","constant"))
  if len(v)!=1:raise ValueError("Select one original column or explicit constant")
  if "index" in v and (type(v["index"])is not int or not 0<=v["index"]<len(table["columns"])):raise ValueError("Column out of range")
  if "constant" in v:text(v["constant"],"constant",True)
 vm=s.get("valueMaps",{})
 if not isinstance(vm,dict) or set(vm)-set(s["fields"]):raise ValueError("Unknown value mapping")
 for value in vm.values():
  if not isinstance(value,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in value.items()):raise ValueError("Value maps must preserve original text")
 rows=[]
 for i,row in enumerate(table["rows"]):
  item={k:(row[v["index"]] if "index" in v else v["constant"]) for k,v in s["fields"].items()}
  for k,values in vm.items():item[k]=values.get(item[k],item[k])
  rows.append({**item,"_source":s["source"],"_row":table.get("rowNumbers",range(2,len(table["rows"])+2))[i],"_raw":row})
 return rows
def definition(v):
 exact_keys(v,("name","notes","year","currencyDigits","selections","documents","registration","sibling","calendar","corrections","chargeDecisions","allocations","exceptions","review","rollover","linkedIntake"),("name","year","currencyDigits","selections","documents","registration","sibling","calendar","corrections","chargeDecisions","allocations","exceptions","review"))
 d=copy.deepcopy(v);d["name"]=text(d["name"],"name",limit=160);text(d.get("notes",""),"notes",True,20000)
 exact_keys(d["year"],("id","label","start","end","timezone","periods"),("id","label","start","end","timezone","periods"))
 y=d["year"];ident(y["id"]);text(y["label"],"year label");text(y["timezone"],"time zone")
 if not 0<=(date(y["end"])-date(y["start"])).days<=366:raise ValueError("Select an annual window of at most367 inclusive dates")
 from zoneinfo import ZoneInfo
 ZoneInfo(y["timezone"])
 if not isinstance(y["periods"],list) or not 1<=len(y["periods"])<=24:raise ValueError("Select one to24 explicit billing periods")
 prior=None;ids=set()
 for p in y["periods"]:
  exact_keys(p,("id","label","start","end","due"),("id","label","start","end","due"));ident(p["id"]);text(p["label"],"period label")
  first,last=date(p["start"]),date(p["end"]);date(p["due"])
  if p["id"] in ids or not 0<=(last-first).days<=30 or first<date(y["start"]) or last>date(y["end"]) or prior and first<=prior:raise ValueError("Periods must be unique, ordered and non-overlapping within the selected year")
  ids.add(p["id"]);prior=last
 digits=d["currencyDigits"]
 if not isinstance(digits,dict) or not digits or any(not re.fullmatch("[A-Z]{3}",k) or type(n)is not int or not 0<=n<=4 for k,n in digits.items()):raise ValueError("Select explicit currency precision")
 exact_keys(d["selections"],DATASETS,DATASETS)
 for kind,s in d["selections"].items():exact_keys(s["fields"],FIELDS[kind],REQUIRED[kind])
 if not isinstance(d["documents"],list) or len(d["documents"])!=len(set(d["documents"])):raise ValueError("Select unique complete document source IDs")
 named(d["registration"],("source","new","returning","currency","scope"),("source","new","returning","currency","scope"))
 if d["registration"]["scope"]!="student-year":raise ValueError("Registration is explicitly one charge per student per selected year")
 named(d["sibling"],("source","basisPoints","eligibleEnrollmentIds","rounding"),("source","basisPoints","eligibleEnrollmentIds","rounding"))
 s=d["sibling"]
 if type(s["basisPoints"])is not int or not 0<=s["basisPoints"]<=10000 or s["rounding"]!="half-up":raise ValueError("Select exact basis points and half-up minor-unit rounding")
 if not isinstance(s["eligibleEnrollmentIds"],list) or len(s["eligibleEnrollmentIds"])!=len(set(s["eligibleEnrollmentIds"])):raise ValueError("Select unique eligible enrollments")
 named(d["calendar"],("source","excludedDates","state"),("source","excludedDates","state"))
 if d["calendar"]["state"] not in ("unconfirmed","confirmed"):raise ValueError("Select calendar review state")
 if d["calendar"]["state"]=="confirmed" and not d["calendar"]["source"]:raise ValueError("A confirmed calendar requires its complete retained source")
 if not isinstance(d["calendar"]["excludedDates"],list) or len(d["calendar"]["excludedDates"])!=len(set(d["calendar"]["excludedDates"])):raise ValueError("Select unique excluded dates")
 for day in d["calendar"]["excludedDates"]:date(day)
 for key in ("corrections","chargeDecisions","allocations","exceptions"):
  if not isinstance(d[key],list) or len(d[key])>100000:raise ValueError("Invalid "+key)
 exact_keys(d["review"],("status","reviewer","note","at"),("status","reviewer","note","at"))
 if d["review"]["status"] not in ("draft","reviewed"):raise ValueError("Invalid review state")
 if d["review"]["status"]=="reviewed":text(d["review"]["reviewer"],"reviewer");text(d["review"]["note"],"note");stamp(d["review"]["at"])
 rollover=d.get("rollover")
 if rollover is not None:
  named(rollover,("fromRevision","fromDerivedSha256","studentIds","payments"),("fromRevision","fromDerivedSha256","studentIds","payments"))
  if not isinstance(rollover["studentIds"],list) or len(rollover["studentIds"])!=len(set(rollover["studentIds"])):raise ValueError("Select unique rollover students")
  if not isinstance(rollover["payments"],list):raise ValueError("Retain the complete original payment consumption snapshot")
  seen=set()
  for payment in rollover["payments"]:
   exact_keys(payment,("payment","householdId","currency","providerRef","originalNetMinor","consumedMinor","availableMinor"),("payment","householdId","currency","providerRef","originalNetMinor","consumedMinor","availableMinor"))
   ident(payment["payment"]);ident(payment["householdId"]);text(payment["currency"],"currency");text(payment["providerRef"],"provider reference",True)
   if payment["payment"] in seen:raise ValueError("Repeated carried payment")
   seen.add(payment["payment"])
   for key in ("originalNetMinor","consumedMinor","availableMinor"):
    if not isinstance(payment[key],str) or not re.fullmatch(r"0|[1-9][0-9]*",payment[key]):raise ValueError("Carry exact nonnegative integer-string payment amounts")
   if int(payment["availableMinor"])!=max(0,int(payment["originalNetMinor"])-int(payment["consumedMinor"])):raise ValueError("Carried available funds differ from original net less historical consumption")
 return d
def derive(d,source_get):
 d=definition(d);data={k:mapping(source_get(s["source"]),s) for k,s in d["selections"].items()}
 for sid in d["documents"]+[d["registration"]["source"],d["sibling"]["source"]]+([d["calendar"]["source"]] if d["calendar"]["source"] else []):source_get(sid)
 seen=set()
 for c in d["corrections"]:
  named(c,("kind","source","row","field","original","value"),("kind","source","row","field","original","value"))
  k=c["kind"];key=(k,c["source"],c["row"],c["field"])
  if k not in FIELDS or c["field"] not in FIELDS[k] or c["field"]=="id" or key in seen:raise ValueError("Invalid/repeated original cell correction")
  seen.add(key);rows=[r for r in data[k] if r["_source"]==c["source"] and r["_row"]==c["row"]]
  if len(rows)!=1 or rows[0][c["field"]]!=c["original"]:raise ValueError("Correction differs from original selected cell")
  text(c["value"],"correction",True);rows[0][c["field"]]=c["value"]
 evidence=sha(canonical({k:v for k,v in d.items() if k not in ("exceptions","review","notes")}))
 issues=[]
 def issue(code,row,note,severity="blocking",details=None):
  x={"code":code,"source":row.get("_source",""),"row":row.get("_row",0),"id":row.get("id",""),"note":note,"severity":severity,"evidenceSha256":evidence,"details":details}
  x["key"]=sha(canonical(x));issues.append(x)
 def index(kind):
  result={}
  for row in data[kind]:
   try:ident(row["id"])
   except ValueError:issue("invalid-id",row,"A stable source identifier is required");continue
   if row["id"] in result:issue("duplicate-id",row,"Duplicate source identifier");continue
   result[row["id"]]=row
  return result
 idx={k:index(k) for k in DATASETS};programmes=idx["programmes"];plans=idx["plans"];students=idx["students"];enrollments=idx["enrollments"];households=idx["households"]
 def numeric(row,field,minimum=0,maximum=100000):
  try:
   n=unsigned(row[field],field,maximum)
   if n<minimum:raise ValueError()
   return n
  except ValueError:issue("invalid-"+field,row,"Invalid nonnegative integer");return None
 def cash(row,field,cur=None):
  try:
   n=money(row[field],d["currencyDigits"][cur or row["currency"]])
   if n<0:raise ValueError()
   return n
  except (ValueError,KeyError):issue("invalid-"+field,row,"Amount requires an exact nonnegative decimal and selected currency");return None
 for p in programmes.values():
  p["_minimumAge"]=numeric(p,"min_age",0,150);p["_maximumAge"]=numeric(p,"max_age",0,150) if p["max_age"] else None;p["_duration"]=numeric(p,"duration_minutes",1,1440)
  if p["capacity"]:p["_capacity"]=numeric(p,"capacity",1,100000)
  else:p["_capacity"]=None;issue("capacity-unconfirmed",p,"Programme capacity needs an explicit owner decision","review")
  if p["_minimumAge"] is not None and p["_maximumAge"] is not None and p["_minimumAge"]>p["_maximumAge"]:issue("age-range",p,"Age band ends below its minimum")
 for p in plans.values():
  p["_frequency"]=numeric(p,"frequency",1,7);p["_tuition"]=cash(p,"tuition")
  if p["programme_id"] not in programmes:issue("unknown-programme",p,"Fee plan references an absent programme")
 slots={}
 for s in idx["slots"].values():
  try:
   weekday=unsigned(s["weekday"],"weekday",6);start=dt.time.fromisoformat(s["start"]);end=dt.time.fromisoformat(s["end"])
   if start.tzinfo or end.tzinfo or start.second or end.second or start.microsecond or end.microsecond or end<=start:raise ValueError()
   minutes=(end.hour-start.hour)*60+end.minute-start.minute
   if s["programme_id"] not in programmes:raise ValueError()
   slots[s["id"]]={**s,"_weekday":weekday,"_minutes":minutes,"_startMinute":start.hour*60+start.minute,"_endMinute":end.hour*60+end.minute}
   p=programmes[s["programme_id"]]
   if p["_duration"]!=minutes:issue("duration-conflict",s,"Published programme duration differs from its actual start/end slot","review",{"programmeDuration":p["_duration"],"slotDuration":minutes})
  except (ValueError,KeyError):issue("slot-invalid",s,"A slot requires its selected programme, weekday0–6 and ordered local times")
 for s in students.values():
  if s["household_id"] not in households:issue("household-missing",s,"Student must select an actual household")
  if s["registration_type"] not in ("new","returning"):issue("registration-type",s,"Select new or returning explicitly for this year")
  try:s["_birth"]=date(s["birth_date"]) if s["birth_date"] else None
  except ValueError:s["_birth"]=None;issue("birth-date",s,"Birth date is invalid")
  if s["_birth"] is None:issue("age-unconfirmed",s,"Age-band confirmation requires an approved date or a named exception","review")
 agreements={}
 for a in idx["agreements"].values():
  if a["student_id"] not in students:issue("agreement-student",a,"Agreement references an absent student");continue
  if a["status"] not in ("pending","signed","revoked"):issue("agreement-status",a,"Select pending, signed or revoked");continue
  if a["document_source"]:source_get(a["document_source"])
  if a["status"]=="signed":
   try:
    stamp(a["signed_at"]);date(a["valid_from"]);date(a["valid_to"]);source_get(a["document_source"]);text(a["signer_ref"],"observed signer reference")
    if a["valid_from"]>a["valid_to"]:raise ValueError()
    agreements.setdefault(a["student_id"],[]).append(a)
   except (ValueError,KeyError):issue("agreement-evidence",a,"Signed observation needs the complete retained document, signer reference and validity dates")
 confirmations={}
 periods={p["id"]:p for p in d["year"]["periods"]}
 for c in idx["confirmations"].values():
  key=(c["enrollment_id"],c["period_id"])
  try:
   if c["enrollment_id"] not in enrollments or c["period_id"] not in periods or c["status"] not in ("pending","confirmed","declined"):raise ValueError()
   text(c["actor"],"confirmation actor");stamp(c["at"])
   if key in confirmations:raise ValueError()
   confirmations[key]=c
  except (ValueError,KeyError):issue("confirmation-invalid",c,"Confirmation must uniquely bind an enrollment, period and named observed status")
 eligible=set(d["sibling"]["eligibleEnrollmentIds"])
 if eligible-set(enrollments):raise ValueError("Sibling decision selects absent enrollments")
 charges=[];period_rows=[];occurrences=[];active_students={}
 excluded=set(d["calendar"]["excludedDates"])
 if d["calendar"]["state"]!="confirmed":issue("calendar-unconfirmed",{"id":d["year"]["id"]},"Occurrence dates are a preview until the actual school calendar is reviewed","review")
 def charge(kind,key,student,enrollment,period,cur,value,detail):
  row={"id":kind+"-"+sha(canonical([d["year"]["id"],key,period]))[:24],"kind":kind,"student_id":student["id"],"household_id":student["household_id"],"enrollment_id":enrollment,"period_id":period,"currency":cur,"base_minor":str(value),"discount_minor":"0","due_minor":str(value),"paid_minor":"0","balance_minor":str(value),"detail":detail}
  charges.append(row);return row
 for e in enrollments.values():
  if e["status"] not in ("active","cancelled","waitlisted"):issue("enrollment-status",e,"Select active, cancelled or waitlisted");continue
  if e["student_id"] not in students or e["plan_id"] not in plans:issue("enrollment-reference",e,"Enrollment requires an actual student and fee-plan ID");continue
  s=students[e["student_id"]];p=plans[e["plan_id"]];programme=programmes.get(p["programme_id"])
  try:
   start,end=date(e["start"]),date(e["end"])
   if end<start or start<date(d["year"]["start"]) or end>date(d["year"]["end"]):raise ValueError()
   chosen=json.loads(e["slot_ids"])
   if not isinstance(chosen,list) or len(chosen)!=len(set(chosen)) or len(chosen)!=p["_frequency"] or any(key not in slots or slots[key]["programme_id"]!=p["programme_id"] for key in chosen):raise ValueError()
  except (ValueError,TypeError):issue("enrollment-schedule",e,"Select exact original weekly slots/frequency and dates within this year");continue
  if not programme or p["_tuition"] is None:continue
  if s["_birth"]:
   age=start.year-s["_birth"].year-((start.month,start.day)<(s["_birth"].month,s["_birth"].day))
   if programme["_minimumAge"] is not None and (age<programme["_minimumAge"] or programme["_maximumAge"] is not None and age>programme["_maximumAge"]):issue("age-band",e,"Student age differs from the explicitly selected programme band","review",{"age":age,"programme":programme["id"]})
  if e["status"]!="active":continue
  for period in d["year"]["periods"]:
   first,last=max(start,date(period["start"])),min(end,date(period["end"]))
   if first>last:continue
   if s["id"] not in active_students or date(period["start"])<date(periods[active_students[s["id"]]]["start"]):active_students[s["id"]]=period["id"]
   c=charge("tuition",e["id"],s,e["id"],period["id"],p["currency"],p["_tuition"],{"plan":p["id"],"programme":p["programme_id"],"feeSource":p["_source"],"feeRow":p["_row"],"frequency":p["_frequency"],"fullPeriod":first==date(period["start"]) and last==date(period["end"])})
   if e["id"] in eligible:
    family_peers={o["student_id"] for o in enrollments.values() if o["status"]=="active" and o["student_id"] in students and students[o["student_id"]]["household_id"]==s["household_id"] and o["start"]<=period["end"] and o["end"]>=period["start"]}
    if len(family_peers)<2:issue("sibling-eligibility",e,"Selected discount has fewer than two distinct active students in its household and period","review",{"period":period["id"]})
    discount=(p["_tuition"]*d["sibling"]["basisPoints"]+5000)//10000;c["discount_minor"]=str(discount);c["due_minor"]=str(p["_tuition"]-discount)
   agreement=[a for a in agreements.get(s["id"],[]) if a["valid_from"]<=first.isoformat() and a["valid_to"]>=last.isoformat()]
   confirmation=confirmations.get((e["id"],period["id"]))
   pr={"enrollment_id":e["id"],"student_id":s["id"],"household_id":s["household_id"],"programme_id":p["programme_id"],"plan_id":p["id"],"period_id":period["id"],"charge_id":c["id"],"agreementIds":[a["id"] for a in agreement],"confirmation":confirmation,"rosterState":"PENDING"}
   if not agreement:issue("agreement-missing",e,"No complete signed agreement covers the selected attendance period","review",{"period":period["id"]})
   if not confirmation or confirmation["status"]!="confirmed":issue("confirmation-pending",e,"A named staff confirmation has not been observed","review",{"period":period["id"]})
   period_rows.append(pr)
   day=first
   while day<=last:
    for key in chosen:
     slot=slots[key]
     if day.weekday()==slot["_weekday"] and day.isoformat() not in excluded:occurrences.append({"enrollment_id":e["id"],"student_id":s["id"],"household_id":s["household_id"],"programme_id":p["programme_id"],"period_id":period["id"],"slot_id":key,"date":day.isoformat(),"start":slot["start"],"end":slot["end"],"timezone":d["year"]["timezone"],"calendarState":d["calendar"]["state"],"capacity":programme["_capacity"],"location":programme["location"],"startMinute":slot["_startMinute"],"endMinute":slot["_endMinute"]})
    if len(occurrences)>250000:raise ValueError("Selected occurrence count exceeds250000")
    day+=dt.timedelta(days=1)
 r=d["registration"]
 for sid,period in sorted(active_students.items()):
  s=students[sid]
  if s["registration_type"] not in ("new","returning"):continue
  registration=cash({"id":sid,"currency":r["currency"],"fee":r[s["registration_type"]]},"fee")
  if registration is not None:charge("registration",sid,s,"",period,r["currency"],registration,{"registrationType":s["registration_type"],"ruleSource":r["source"],"scope":r["scope"]})
 charge_by_id={c["id"]:c for c in charges};used=set()
 for decision in d["chargeDecisions"]:
  named(decision,("charge","originalDueMinor","amount","reason"),("charge","originalDueMinor","amount","reason"))
  cid=decision["charge"]
  if cid in used or cid not in charge_by_id:raise ValueError("Charge decision must uniquely select an actual charge")
  used.add(cid);c=charge_by_id[cid]
  if c["due_minor"]!=decision["originalDueMinor"]:raise Conflict("Charge correction does not bind its original exact calculated amount")
  value=money(decision["amount"],d["currencyDigits"][c["currency"]])
  if value<0:raise ValueError("Charge correction cannot be negative")
  c["due_minor"]=str(value);c["decision"]=decision
 for c in charges:
  if c["kind"]=="tuition" and not c["detail"]["fullPeriod"] and c["id"] not in used:issue("partial-period",{"id":c["id"]},"Proration or full-month policy must be explicitly reviewed for this partial enrollment period")
 payment_balances={};payment_allocations={};payment_nets={};prior_consumed={}
 carried={p["payment"]:p for p in (d.get("rollover") or {}).get("payments",[])};provider_ids={}
 for pid,payment in carried.items():
  if payment["providerRef"]:provider_ids[payment["providerRef"]]=pid
 for p in idx["payments"].values():
  gross=cash(p,"gross");refund=cash(p,"refund")
  if p["household_id"] not in households:issue("payment-household",p,"Payment must select the original household")
  if p["status"] not in ("posted","pending","void"):issue("payment-status",p,"Use the actual posted, pending or void state")
  if gross is None or refund is None:continue
  if refund>gross:issue("refund-exceeds-gross",p,"Refund exceeds the original payment");continue
  net=gross-refund if p["status"]=="posted" else 0
  carry=carried.get(p["id"])
  if carry and (carry["householdId"]!=p["household_id"] or carry["currency"]!=p["currency"] or carry["providerRef"]!=p["provider_ref"]):raise Conflict("Carried payment identity, household, currency or provider reference changed")
  if p["provider_ref"]:
   if p["provider_ref"] in provider_ids and provider_ids[p["provider_ref"]]!=p["id"]:raise ValueError("The same actual provider receipt cannot be duplicated under another payment ID")
   provider_ids[p["provider_ref"]]=p["id"]
  consumed=int(carry["consumedMinor"]) if carry else 0
  payment_nets[p["id"]]=net;prior_consumed[p["id"]]=consumed
  if net<consumed:issue("historical-payment-deficit",p,"Current net receipt is below the amount already consumed in previous years",details={"netMinor":str(net),"previouslyConsumedMinor":str(consumed)})
  net=max(0,net-consumed)
  if p["status"]=="posted":
   try:stamp(p["posted_at"])
   except ValueError:issue("payment-posted-at",p,"Posted payment requires its observed offset timestamp")
  payment_balances[p["id"]]=net;payment_allocations[p["id"]]=0
 paid={cid:0 for cid in charge_by_id};seen=set()
 for a in d["allocations"]:
  named(a,("payment","charge","amount"),("payment","charge","amount"));key=(a["payment"],a["charge"])
  if key in seen or a["payment"] not in payment_balances or a["charge"] not in charge_by_id:raise ValueError("Allocation requires one unique existing payment/charge pair")
  seen.add(key);p=idx["payments"][a["payment"]];c=charge_by_id[a["charge"]]
  if p["status"]!="posted" or p["currency"]!=c["currency"] or p["household_id"]!=c["household_id"]:raise ValueError("Allocate only actual posted payment in the same currency and household")
  value=money(a["amount"],d["currencyDigits"][c["currency"]])
  if value<=0:raise ValueError("Allocation must be positive")
  payment_allocations[p["id"]]+=value;paid[c["id"]]+=value
 for pid,value in payment_allocations.items():
  if value>payment_balances[pid]:raise ValueError("Allocations exceed actual gross less refund and prior-year consumption")
 totals={}
 for c in charges:
  value=int(c["due_minor"]);c["paid_minor"]=str(paid[c["id"]]);c["balance_minor"]=str(value-paid[c["id"]])
  if paid[c["id"]]>value:issue("overpaid-charge",{"id":c["id"]},"Charge has an explicit credit balance; review its treatment","review")
  t=totals.setdefault(c["currency"],{"due_minor":0,"paid_minor":0,"balance_minor":0,"unallocated_minor":0})
  for key in ("due_minor","paid_minor","balance_minor"):t[key]+=int(c[key])
 for pid,value in payment_balances.items():
  cur=idx["payments"][pid]["currency"];t=totals.setdefault(cur,{"due_minor":0,"paid_minor":0,"balance_minor":0,"unallocated_minor":0});t["unallocated_minor"]+=value-payment_allocations[pid]
 for row in period_rows:
  tuition=charge_by_id[row["charge_id"]];registration=[c for c in charges if c["kind"]=="registration" and c["student_id"]==row["student_id"]]
  funded=int(tuition["balance_minor"])<=0 and all(int(c["balance_minor"])<=0 for c in registration)
  row["funded"]=funded;row["rosterState"]="CONFIRMED" if funded and row["agreementIds"] and row["confirmation"] and row["confirmation"]["status"]=="confirmed" and d["calendar"]["state"]=="confirmed" else "PENDING"
 sessions={};student_days={}
 for o in occurrences:
  sessions.setdefault((o["programme_id"],o["location"],o["date"]),[]).append(o)
  student_days.setdefault((o["student_id"],o["date"]),[]).append(o)
 for key,rows in sessions.items():
  events={}
  for o in rows:
   events.setdefault(o["startMinute"],[]).append((o["student_id"],1));events.setdefault(o["endMinute"],[]).append((o["student_id"],-1))
  bounds=sorted(events);active={};counts=[]
  for at in bounds:
   for student,change in events[at]:
    active[student]=active.get(student,0)+change
    if active[student]==0:del active[student]
   counts.append(len(active))
  # Range maximum over the actual minute boundaries: no quadratic overlap expansion.
  n=1
  while n<len(counts):n*=2
  tree=[0]*(2*n)
  for i,value in enumerate(counts):tree[n+i]=value
  for i in range(n-1,0,-1):tree[i]=max(tree[2*i],tree[2*i+1])
  positions={at:i for i,at in enumerate(bounds)}
  for o in rows:
   left=n+positions[o["startMinute"]];right=n+positions[o["endMinute"]];count=0
   while left<right:
    if left%2:count=max(count,tree[left]);left+=1
    if right%2:right-=1;count=max(count,tree[right])
    left//=2;right//=2
   o["occupancy"]=count
   if o["capacity"] is not None and count>o["capacity"]:issue("capacity-exceeded",{"id":o["slot_id"]},"Simultaneous class attendance exceeds the reviewed programme capacity",details={"programme":key[0],"location":key[1],"date":key[2],"start":o["start"],"end":o["end"],"count":count,"capacity":o["capacity"]})
 for key,rows in student_days.items():
  ordered=sorted(rows,key=lambda r:(r["startMinute"],r["endMinute"],r["enrollment_id"],r["slot_id"]));prior=None;first_conflict=None;count=0
  for row in ordered:
   if prior and row["startMinute"]<prior["endMinute"]:
    count+=1
    if first_conflict is None:first_conflict={"first":prior,"second":row}
   if prior is None or row["endMinute"]>prior["endMinute"]:prior=row
  if first_conflict:issue("student-session-overlap",{"id":key[0]},"One student is selected in overlapping attendance intervals",details={"date":key[1],"conflictingIntervals":count,**first_conflict})
 known={x["key"]:x for x in issues}
 for e in d["exceptions"]:
  named(e,("issue","decision"),("issue","decision"))
  if e["issue"] not in known or e["decision"] not in ("acknowledged","needs-correction"):raise ValueError("Exception must bind a current complete-evidence issue")
  if "decision" in known[e["issue"]]:raise ValueError("Repeated exception")
  known[e["issue"]]["decision"]=e
 for i in issues:i.setdefault("decision",None)
 unresolved=[i for i in issues if i["severity"]=="blocking" or not i["decision"] or i["decision"]["decision"]!="acknowledged"]
 if d["review"]["status"]=="reviewed" and unresolved:raise ValueError("Reviewed handover requires every blocking issue corrected and every review issue explicitly acknowledged")
 for row in period_rows:row["readyForRoster"]=row["rosterState"]=="CONFIRMED" and d["review"]["status"]=="reviewed" and not unresolved
 for row in data["students"]:row.pop("_birth",None)
 for kind,rows in data.items():
  for row in rows:
   for key in list(row):
    if key.startswith("_") and key not in ("_source","_row","_raw"):del row[key]
 return {"schema":SCHEMA,"datasets":data,"charges":charges,"periodEnrollments":period_rows,"occurrences":occurrences,"issues":issues,"totals":{c:{k:str(v) for k,v in t.items()} for c,t in totals.items()},"paymentBalances":[{"payment":pid,"original_net_minor":str(payment_nets[pid]),"prior_consumed_minor":str(prior_consumed[pid]),"available_minor":str(value),"allocated_minor":str(payment_allocations[pid]),"unallocated_minor":str(value-payment_allocations[pid])} for pid,value in sorted(payment_balances.items())],"counts":{"households":len(households),"students":len(students),"enrollments":len(enrollments),"charges":len(charges),"occurrences":len(occurrences),"unresolved":len(unresolved)},"providerWrites":0}

class FamilyWorkspace:
 def __init__(self,directory,create=False):
  self.base=Workspace(directory,create);self.root=self.base.root;self.db=self.base.db
  self.db.executescript("CREATE TABLE IF NOT EXISTS family_revisions(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));CREATE TABLE IF NOT EXISTS family_requests(id TEXT PRIMARY KEY,sha TEXT NOT NULL,body TEXT NOT NULL,result TEXT NOT NULL);")
 def close(self):self.base.close()
 def identity(self):return self.base.identity()
 def add_source(self,raw,metadata):return self.base.add_source(raw,metadata)
 def sources(self):return self.base.sources()
 def table(self,sid,format,sheet=None):return self.base.table(sid,format,sheet)
 def _sources(self,d,derived):
  ids={x["source"] for x in d["selections"].values()}|set(d["documents"])|{d["registration"]["source"],d["sibling"]["source"]}
  if d["calendar"]["source"]:ids.add(d["calendar"]["source"])
  ids.update(a["document_source"] for a in derived["datasets"]["agreements"] if a["document_source"])
  return [self.base.source_info(sid) for sid in sorted(ids)]
 def view(self,id,revision=None):
  if revision is None:row=self.db.execute("SELECT body FROM family_revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
  else:row=self.db.execute("SELECT body FROM family_revisions WHERE id=? AND revision=?",(id,revision)).fetchone()
  if row is None:raise ValueError("Unknown family review/revision")
  v=json.loads(row[0]);actual=derive(v["definition"],self.base.source)
  if sha(canonical(actual))!=v["derivedSha256"]:raise ValueError("Original family derivation differs")
  for src in v["sources"]:
   raw=self.base.source(src["id"])
   if len(raw)!=src["bytes"]:raise ValueError("Retained source length differs")
  return {**v,"derived":actual}
 def history(self,id):return [self.view(id,r[0]) for r in self.db.execute("SELECT revision FROM family_revisions WHERE id=? ORDER BY revision",(id,))]
 def state(self):
  return {"schema":SCHEMA,"workspaceId":self.identity(),"sources":self.sources(),"reviews":[self.view(r[0]) for r in self.db.execute("SELECT DISTINCT id FROM family_revisions ORDER BY id")],"contract":{"fields":FIELDS,"required":REQUIRED,"money":"exact integer-string minor units; source decimals retained","providerWrites":0,"maxSourceBytes":MAX_SOURCE,"maxPacketBytes":MAX_PACKET}}
 def request(self,rid):
  row=self.db.execute("SELECT sha,body,result FROM family_requests WHERE id=?",(rid,)).fetchone()
  return {"state":"NOT_RECORDED","requestId":rid,"workspaceId":self.identity()} if row is None else {"state":"RECORDED","requestId":rid,"workspaceId":self.identity(),"sha256":row[0],"request":json.loads(row[1]),"result":json.loads(row[2])}
 def rollover_preview(self,id,revision=None):
  old=self.view(id,revision);payments={p["payment"]:copy.deepcopy(p) for p in (old["definition"].get("rollover") or {}).get("payments",[])}
  rows={r["id"]:r for r in old["derived"]["datasets"]["payments"]}
  for p in old["derived"]["paymentBalances"]:
   r=rows[p["payment"]];consumed=int(p["prior_consumed_minor"])+int(p["allocated_minor"])
   payments[p["payment"]]={"payment":p["payment"],"householdId":r["household_id"],"currency":r["currency"],"providerRef":r["provider_ref"],"originalNetMinor":p["original_net_minor"],"consumedMinor":str(consumed),"availableMinor":str(max(0,int(p["original_net_minor"])-consumed))}
  return {"fromRevision":old["revision"],"fromDerivedSha256":old["derivedSha256"],"studentIds":[r["id"] for r in old["derived"]["datasets"]["students"]],"payments":[payments[k] for k in sorted(payments)]}
 def save(self,request):
  exact_keys(request,("requestId","id","expectedRevision","actor","at","definition"),("requestId","actor","at","definition"))
  rid=ident(request["requestId"]);text(request["actor"],"actor");stamp(request["at"])
  raw=canonical(request)
  if len(raw)>4*1024*1024:raise ValueError("Full original save exceeds4MiB")
  digest=sha(raw);d=definition(request["definition"])
  self.db.execute("BEGIN IMMEDIATE")
  try:
   prior=self.db.execute("SELECT sha,result FROM family_requests WHERE id=?",(rid,)).fetchone()
   if prior:
    if prior[0]!=digest:raise Conflict("Original request ID reused with a different complete body")
    selected=json.loads(prior[1]);self.db.commit();return self.view(selected["id"],selected["revision"])
   id=ident(request["id"]) if "id" in request else "family-"+digest[:24]
   latest=self.db.execute("SELECT revision,body FROM family_revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
   if latest:
    if type(request.get("expectedRevision"))is not int or request["expectedRevision"]!=latest[0]:raise Conflict("Family review changed; retain original request and inspect current state")
    revision=latest[0]+1
   else:
    if "id" in request or "expectedRevision" in request:raise Conflict("Create must omit saved identity and expected revision")
    revision=1
   actual=derive(d,self.base.source)
   linked=d.get("linkedIntake")
   if linked is not None:
    exact_keys(linked,("id","revision","derivedSha256"),("id","revision","derivedSha256"))
    original=self.base.view(linked["id"],linked["revision"])
    if original["derivedSha256"]!=linked["derivedSha256"]:raise Conflict("Linked intake original revision differs")
   rollover=d.get("rollover")
   previous=json.loads(latest[1]) if latest else None
   changed_year=previous and previous["definition"]["year"]["id"]!=d["year"]["id"]
   if changed_year and rollover is None:raise ValueError("Changing the selected school year requires an explicit rollover decision")
   prior_rollover=previous and previous["definition"].get("rollover")
   if previous and not changed_year and prior_rollover:
    if rollover is None or any(rollover.get(k)!=prior_rollover.get(k) for k in ("fromRevision","fromDerivedSha256","payments")):raise Conflict("Retain this year's original rollover anchor and complete historical payment consumption")
   if rollover is not None:
    if changed_year and rollover["fromRevision"]!=latest[0]:raise Conflict("Roll over the actual latest saved year so no later payment allocation is omitted")
    if not latest or type(rollover["fromRevision"])is not int or not 1<=rollover["fromRevision"]<revision:raise ValueError("Rollover must select an existing earlier revision of this same review")
    old=self.view(id,rollover["fromRevision"])
    if old["derivedSha256"]!=rollover["fromDerivedSha256"] or old["definition"]["year"]["id"]==d["year"]["id"] or date(old["definition"]["year"]["end"])>=date(d["year"]["start"]):raise Conflict("Rollover original edition/year differs or overlaps")
    snapshot=self.rollover_preview(id,rollover["fromRevision"])
    if rollover["payments"]!=snapshot["payments"]:raise Conflict("Rollover must retain the exact complete prior payment consumption snapshot")
    selected=rollover["studentIds"]
    if not isinstance(selected,list) or len(selected)!=len(set(selected)):raise ValueError("Select unique original student identities for rollover")
    before={r["id"]:r for r in old["derived"]["datasets"]["students"]};after={r["id"]:r for r in actual["datasets"]["students"]}
    for sid in selected:
     if sid not in before or sid not in after or before[sid]["birth_date"]!=after[sid]["birth_date"] or after[sid]["registration_type"]!="returning":raise ValueError("Rollover must preserve selected student identity and explicitly mark returning status")
   view={"schema":SCHEMA,"id":id,"revision":revision,"requestId":rid,"requestSha256":digest,"actor":request["actor"],"at":request["at"],"definition":d,"sources":self._sources(d,actual),"derivedSha256":sha(canonical(actual))}
   self.db.execute("INSERT INTO family_revisions VALUES(?,?,?)",(id,revision,canonical(view).decode()))
   self.db.execute("INSERT INTO family_requests VALUES(?,?,?,?)",(rid,digest,raw.decode(),canonical(view).decode()))
   self.db.commit();return {**view,"derived":actual}
  except BaseException:self.db.rollback();raise
 def compare(self,id,before,after):
  a=self.view(id,before);b=self.view(id,after);changes=[]
  for kind,key in (("charges","id"),("paymentBalances","payment"),("periodEnrollments",None),("occurrences",None)):
   def indexed(v):
    return {(r[key] if key else canonical({k:r.get(k) for k in ("enrollment_id","period_id","slot_id","date")}).decode()):r for r in v["derived"][kind]}
   aa,bb=indexed(a),indexed(b)
   for identity in sorted(set(aa)|set(bb)):
    if aa.get(identity)!=bb.get(identity):changes.append({"kind":kind,"id":identity,"before":aa.get(identity),"after":bb.get(identity)})
  for kind in DATASETS:
   aa={r["id"]:r for r in a["derived"]["datasets"][kind]};bb={r["id"]:r for r in b["derived"]["datasets"][kind]}
   for key in sorted(set(aa)|set(bb)):
    if aa.get(key)!=bb.get(key):changes.append({"kind":"source-"+kind,"id":key,"before":aa.get(key),"after":bb.get(key)})
  decisions=[{"field":k,"before":a["definition"].get(k),"after":b["definition"].get(k)} for k in sorted(set(a["definition"])|set(b["definition"])) if a["definition"].get(k)!=b["definition"].get(k)]
  return {"schema":"class-intake.family-comparison.v1","id":id,"beforeRevision":before,"afterRevision":after,"beforeDerivedSha256":a["derivedSha256"],"afterDerivedSha256":b["derivedSha256"],"changes":changes,"decisions":decisions,"beforeTotals":a["derived"]["totals"],"afterTotals":b["derived"]["totals"]}
 def export(self,id,revision=None):
  view=self.view(id,revision);history=self.history(id)[:view["revision"]];members={}
  for h in history:
   members["history/"+str(h["revision"])+".json"]=canonical({"view":{k:v for k,v in h.items() if k!="derived"},"request":self.request(h["requestId"])["request"]})
   for source in h["sources"]:
    members["sources/"+source["id"]]=self.base.source(source["id"])
    # Metadata is part of each original revision. One source can retain multiple contextual descriptors.
   linked=h["definition"].get("linkedIntake")
   if linked:members["linked-intake/"+linked["id"]+"-"+str(linked["revision"])+".zip"]=self.base.export(linked["id"],linked["revision"])
  members["selected.json"]=canonical({"id":id,"revision":view["revision"]});members["reports/complete.json"]=canonical(view)
  reports={"charges":("id","kind","household_id","student_id","enrollment_id","period_id","currency","base_minor","discount_minor","due_minor","paid_minor","balance_minor"),"periodEnrollments":("household_id","student_id","enrollment_id","programme_id","period_id","funded","rosterState","readyForRoster"),"occurrences":("household_id","student_id","enrollment_id","programme_id","period_id","slot_id","date","start","end","timezone","calendarState","capacity","occupancy"),"paymentBalances":("payment","original_net_minor","prior_consumed_minor","available_minor","allocated_minor","unallocated_minor")}
  for name,columns in reports.items():members["reports/"+name+".csv"]=csv_bytes(columns,[[r.get(c,"") for c in columns] for r in view["derived"][name]])
  members["reports/issues.csv"]=csv_bytes(("key","code","source","row","id","severity","note"),[[r.get(c,"") for c in ("key","code","source","row","id","severity","note")] for r in view["derived"]["issues"]])
  members["READ_ME.txt"]=b"Complete private family tuition workspace: original raw sources, complete signed-document references, request/revision history and exact derived money. All customer/person data remains private. No payment, refund, email or provider import is executed. Receive with workspace.py receive --workspace NEW --packet FILE. Source provenance distinguishes public facts, approved private input and synthetic engineering examples."
  manifest={"schema":"class-intake.family-packet.v1","selected":{"id":id,"revision":view["revision"]},"files":[{"path":n,"bytes":len(raw),"sha256":sha(raw)} for n,raw in sorted(members.items())]};members["manifest.json"]=canonical(manifest)
  if sum(len(b) for b in members.values())>MAX_PACKET:raise ValueError("Expanded family packet exceeds128MiB")
  output=io.BytesIO()
  with zipfile.ZipFile(output,"w",zipfile.ZIP_DEFLATED) as z:
   for name,body in sorted(members.items()):
    info=zipfile.ZipInfo(name,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,body)
  raw=output.getvalue()
  if len(raw)>MAX_PACKET:raise ValueError("Family packet exceeds128MiB")
  return raw
 def receive(self,raw):
  admission={"state":"NOT_ADOPTED"}
  try:return self._receive(raw,admission)
  except Exception as error:
   if admission["state"]=="NOT_ADOPTED":raise ReceiveRejected(str(error)) from error
   raise
 def _receive(self,raw,admission):
  if len(raw)>MAX_PACKET:raise ValueError("Family packet exceeds bound")
  with zipfile.ZipFile(io.BytesIO(raw)) as z:
   names=z.namelist()
   if len(names)!=len(set(names)) or sum(i.file_size for i in z.infolist())>MAX_PACKET:raise ValueError("Repeated or oversized family packet")
   for n in names:
    p=pathlib.PurePosixPath(n)
    if p.is_absolute() or ".." in p.parts:raise ValueError("Unsafe member path")
   members={n:z.read(n) for n in names}
  manifest=json.loads(members.pop("manifest.json"));exact_keys(manifest,("schema","selected","files"),("schema","selected","files"))
  if manifest["schema"]!="class-intake.family-packet.v1":raise ValueError("Unsupported family packet")
  if len(manifest["files"])!=len(members) or set(members)!={f["path"] for f in manifest["files"]}:raise ValueError("Complete family members differ")
  for f in manifest["files"]:
   exact_keys(f,("path","bytes","sha256"),("path","bytes","sha256"))
   if len(members[f["path"]])!=f["bytes"] or sha(members[f["path"]])!=f["sha256"]:raise ValueError("Family member bytes differ")
  selected=json.loads(members["selected.json"])
  if selected!=manifest["selected"] or type(selected["revision"])is not int or not 1<=selected["revision"]<=100000:raise ValueError("Invalid selected revision")
  with tempfile.TemporaryDirectory() as directory:
   verification=FamilyWorkspace(directory,True)
   try:
    for name,body in sorted(members.items()):
     if name.startswith("linked-intake/"):verification.base.receive(body)
    for revision in range(1,selected["revision"]+1):
     item=json.loads(members["history/"+str(revision)+".json"])
     for descriptor in item["view"]["sources"]:
      sid=descriptor["id"];body=members["sources/"+sid]
      if sha(body)!=sid or len(body)!=descriptor["bytes"]:raise ValueError("Original source inventory differs")
      meta={k:v for k,v in descriptor.items() if k not in ("id","bytes")}
      # Each historical descriptor is replayed with the actual original source metadata.
      existing=verification.db.execute("SELECT raw FROM sources WHERE id=?",(sid,)).fetchone()
      if existing and existing[0]!=body:raise Conflict("Original source collision")
      verification.add_source(body,meta) # Always apply the original complete metadata validator, including historical contexts.
      if existing:
       with verification.db:verification.db.execute("UPDATE sources SET metadata=? WHERE id=?",(canonical(meta).decode(),sid))
     actual=verification.save(item["request"])
     if {k:v for k,v in actual.items() if k!="derived"}!=item["view"]:raise ValueError("Family revision does not derive from its complete original request")
    if verification.export(selected["id"],selected["revision"])!=raw:raise ValueError("Family packet has unexplained report/history members")
    self.db.execute("BEGIN IMMEDIATE");admission["state"]="IN_PROGRESS"
    try:
     for sid,body,meta in verification.db.execute("SELECT id,raw,metadata FROM sources"):
      prior=self.db.execute("SELECT raw FROM sources WHERE id=?",(sid,)).fetchone()
      if prior and prior[0]!=body:raise Conflict("Source identity differs")
      if not prior:self.db.execute("INSERT INTO sources VALUES(?,?,?)",(sid,body,meta))
     for table in ("revisions","family_revisions"):
      for id,revision,body in verification.db.execute("SELECT id,revision,body FROM "+table):
       prior=self.db.execute("SELECT body FROM "+table+" WHERE id=? AND revision=?",(id,revision)).fetchone()
       if prior and prior[0]!=body:raise Conflict("Existing history diverges")
       if not prior:self.db.execute("INSERT INTO "+table+" VALUES(?,?,?)",(id,revision,body))
     for table in ("requests","family_requests"):
      for rid,digest,body,result in verification.db.execute("SELECT id,sha,body,result FROM "+table):
       prior=self.db.execute("SELECT sha,body,result FROM "+table+" WHERE id=?",(rid,)).fetchone()
       if prior and prior!=(digest,body,result):raise Conflict("Existing original request differs")
       if not prior:self.db.execute("INSERT INTO "+table+" VALUES(?,?,?,?)",(rid,digest,body,result))
     admission["state"]="UNKNOWN";self.db.commit();admission["state"]="ADOPTED"
    except BaseException:
     previous=admission["state"];self.db.rollback()
     if previous=="IN_PROGRESS":admission["state"]="NOT_ADOPTED"
     raise
   finally:verification.close()
  return {"selected":self.view(selected["id"],selected["revision"]),"history":self.history(selected["id"]),"packet":{"bytes":len(raw),"sha256":sha(raw)}}
def main():
 p=argparse.ArgumentParser();p.add_argument("command",choices=("init","state","source","table","save","view","history","request","rollover-preview","compare","export","receive"));p.add_argument("--workspace",required=True);p.add_argument("--input");p.add_argument("--metadata");p.add_argument("--id");p.add_argument("--revision",type=int);p.add_argument("--before",type=int);p.add_argument("--after",type=int);p.add_argument("--format");p.add_argument("--sheet");p.add_argument("--output");p.add_argument("--packet");a=p.parse_args()
 w=FamilyWorkspace(a.workspace,a.command in ("init","receive"))
 try:
  if a.command in ("init","state"):result=w.state()
  elif a.command=="source":result=w.add_source(pathlib.Path(a.input).read_bytes(),json.loads(pathlib.Path(a.metadata).read_text()))
  elif a.command=="table":result=w.table(a.id,a.format,a.sheet)
  elif a.command=="save":result=w.save(json.loads(pathlib.Path(a.input).read_text()))
  elif a.command=="view":result=w.view(a.id,a.revision)
  elif a.command=="history":result=w.history(a.id)
  elif a.command=="request":result=w.request(a.id)
  elif a.command=="rollover-preview":result=w.rollover_preview(a.id,a.revision)
  elif a.command=="compare":result=w.compare(a.id,a.before,a.after)
  elif a.command=="receive":result=w.receive(pathlib.Path(a.packet).read_bytes())
  elif a.command=="export":
   raw=w.export(a.id,a.revision);atomic(a.output,raw);result={"path":str(pathlib.Path(a.output).resolve()),"bytes":len(raw),"sha256":sha(raw)}
  print(json.dumps(result,ensure_ascii=False))
 finally:w.close()
if __name__=="__main__":main()
