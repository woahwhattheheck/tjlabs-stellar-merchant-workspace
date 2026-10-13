"""Source-bound class intake and reconciliation. Python 3.11+, standard library."""
from __future__ import annotations
import argparse, base64, csv, datetime as dt, decimal, hashlib, io, json, os, pathlib, re, sqlite3, tempfile, uuid, zipfile
from contextlib import contextmanager
import xml.etree.ElementTree as ET

SCHEMA="class-intake.workspace.v1"
MAX_SOURCE=32*1024*1024
MAX_PACKET=128*1024*1024
KINDS=("catalogue","registrations","transactions","confirmations")
FIELDS={
 "catalogue":("id","title","schedule","start","weekday","amount","currency","capacity","minimum","registration_days","instructor","location","end","description","categories","class_type","continuous_enrollment","price_options"),
 "registrations":("id","class_id","student_key","status","fee","currency"),
 "transactions":("id","registration_id","gross","refund","service_fee","student_fee","net","currency","status","posted_at","payout_id","payout_date","provider_ref"),
 "confirmations":("id","registration_id","status","actor","at")}
REQUIRED={"catalogue":("id","title","schedule","amount","currency"),"registrations":("id","class_id","student_key","status","fee","currency"),"transactions":("id","gross","refund","currency","status"),"confirmations":("id","registration_id","status","actor")}
class Conflict(ValueError): pass
def canonical(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":"),allow_nan=False).encode("utf-8")
def sha(b): return hashlib.sha256(b).hexdigest()
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def text(v,field,empty=False,limit=2000):
 if not isinstance(v,str) or len(v)>limit or (not empty and not v.strip()): raise ValueError(field+" must be text")
 return v if empty else v.strip()
def ident(v): 
 v=text(v,"id",limit=100)
 if not re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]*",v): raise ValueError("Invalid identifier")
 return v
def exact_keys(obj,allowed,required=()):
 if not isinstance(obj,dict) or set(obj)-set(allowed) or set(required)-set(obj): raise ValueError("Unexpected or missing keys: "+repr(obj if not isinstance(obj,dict) else sorted(obj)))
def stamp(v):
 v=text(v,"timestamp",limit=80)
 if dt.datetime.fromisoformat(v.replace("Z","+00:00")).tzinfo is None: raise ValueError("Timezone is required")
 return v
def csv_cell(v):
 v=str(v)
 return "'"+v if v.lstrip().startswith(("=","+","-","@","\t","\r")) else v
def csv_bytes(columns,rows):
 s=io.StringIO(newline=""); w=csv.writer(s,lineterminator="\r\n");w.writerow([csv_cell(x) for x in columns]);w.writerows([[csv_cell(x) for x in row] for row in rows]);return s.getvalue().encode("utf-8-sig")
def money(v,digits):
 if not isinstance(v,str) or not re.fullmatch(r"-?(?:0|[1-9][0-9]{0,14})(?:\.[0-9]+)?",v): raise ValueError("Amount must be an unformatted decimal string")
 n=decimal.Decimal(v)*(10**digits)
 if n!=n.to_integral_value(): raise ValueError("Amount exceeds currency precision")
 return int(n)
def amount(n,digits):
 sign="-" if n<0 else "";n=abs(n)
 return sign+str(n//10**digits)+(("." + str(n%10**digits).zfill(digits)) if digits else "")
def atomic(path,body):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 fd,tmp=tempfile.mkstemp(prefix="."+path.name+".",dir=path.parent)
 try:
  with os.fdopen(fd,"wb") as f:f.write(body);f.flush();os.fsync(f.fileno())
  os.replace(tmp,path)
 finally:
  if os.path.exists(tmp):os.unlink(tmp)
def parse_table(raw,format,sheet=None):
 if len(raw)>MAX_SOURCE:raise ValueError("Source exceeds 32 MiB")
 if format=="csv":
  rows=list(csv.reader(io.StringIO(raw.decode("utf-8-sig"),newline="")))
 elif format=="json":
  obj=json.loads(raw)
  if not isinstance(obj,dict) or set(obj)!={"columns","rows"}:raise ValueError("JSON source requires columns and rows")
  rows=[obj["columns"]]+obj["rows"]
 elif format=="xlsx":
  ns={"s":"http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
  with zipfile.ZipFile(io.BytesIO(raw)) as z:
   if sum(x.file_size for x in z.infolist())>MAX_PACKET:raise ValueError("Workbook expansion exceeds bound")
   workbook=ET.fromstring(z.read("xl/workbook.xml"))
   rels=ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
   targets={r.attrib["Id"]:r.attrib["Target"] for r in rels}
   all_sheets=workbook.find("s:sheets",ns)
   chosen=[s for s in all_sheets if s.attrib["name"]==sheet]
   if len(chosen)!=1:raise ValueError("Select one exact workbook sheet name")
   rid=chosen[0].attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]; target=targets[rid]
   target=("xl/"+target) if not target.startswith("/") else target.lstrip("/")
   target=str(pathlib.PurePosixPath(target))
   if ".." in pathlib.PurePosixPath(target).parts:raise ValueError("Unsafe sheet target")
   strings=[]
   if "xl/sharedStrings.xml" in z.namelist():
    strings=["".join(e.itertext()) for e in ET.fromstring(z.read("xl/sharedStrings.xml"))]
   rows=[]
   for row in ET.fromstring(z.read(target)).findall(".//s:sheetData/s:row",ns):
    cells={}
    for c in row:
     addr=c.attrib.get("r","");letters=re.match(r"[A-Z]+",addr)
     if not letters:raise ValueError("Workbook cell lacks address")
     col=0
     for ch in letters[0]:col=col*26+ord(ch)-64
     if c.find("s:f",ns) is not None:raise ValueError("Formula cells require an explicitly values-only source export")
     val=c.find("s:v",ns); t=c.attrib.get("t")
     value=val.text or "" if val is not None else ""
     if t=="s":value=strings[int(value)]
     elif t=="inlineStr":value="".join(c.find("s:is",ns).itertext())
     cells[col-1]=value
    rows.append([cells.get(i,"") for i in range(max(cells,default=-1)+1)])
 else:raise ValueError("format must be csv, json or xlsx")
 if not rows or not isinstance(rows[0],list) or not rows[0]:raise ValueError("Source needs a header")
 columns=rows[0]
 if any(not isinstance(x,str) for x in columns):raise ValueError("Headers must be strings")
 width=len(columns); out=[]
 for i,row in enumerate(rows[1:],2):
  if not isinstance(row,list) or len(row)>width:raise ValueError("Row width exceeds header at "+str(i))
  row=row+[""]*(width-len(row))
  if any(not isinstance(x,str) for x in row):raise ValueError("Every source cell must be a string")
  out.append(row)
 if len(out)>100000:raise ValueError("Maximum 100,000 rows per selected source")
 return {"columns":columns,"rows":out}
def mapped(table,selection,kind):
 exact_keys(selection,("source","format","sheet","headers","fields","valueMaps"),("source","format","headers","fields"))
 if selection["headers"]!=table["columns"]:raise ValueError("Mapping headers do not match the complete original source")
 fields=selection["fields"];vm=selection.get("valueMaps",{})
 exact_keys(fields,FIELDS[kind],REQUIRED[kind])
 if not isinstance(vm,dict) or set(vm)-set(fields):raise ValueError("Unexpected value map")
 for k,v in fields.items():
  exact_keys(v,("index","constant"))
  if len(v)!=1:raise ValueError("Choose exactly one column index or constant")
  if "index" in v and (type(v["index"]) is not int or not 0<=v["index"]<len(table["columns"])):raise ValueError("Column index out of range")
  if "constant" in v:text(v["constant"],"constant",empty=True)
 for field,values in vm.items():
  if not isinstance(values,dict) or any(not isinstance(k,str) or not isinstance(v,str) for k,v in values.items()):raise ValueError("Value maps require exact original strings")
 out=[]
 for line,row in enumerate(table["rows"],2):
  item={k:(row[v["index"]] if "index" in v else v["constant"]) for k,v in fields.items()}
  for k,values in vm.items():
   if item[k] in values:item[k]=values[item[k]]
  item.update({"_source":selection["source"],"_row":line,"_raw":row})
  out.append(item)
 return out
def definition(v):
 exact_keys(v,("name","notes","currencyDigits","selections","catalogueDecisions","matches","exceptions","cutover","importPlan"),("name","currencyDigits","selections","catalogueDecisions","matches","exceptions","cutover"))
 d=json.loads(canonical(v));d["name"]=text(d["name"],"name",limit=160);text(d.get("notes",""),"notes",True,20000)
 digits=d["currencyDigits"]
 if not isinstance(digits,dict) or not digits or any(not re.fullmatch("[A-Z]{3}",k) or type(n)is not int or not 0<=n<=4 for k,n in digits.items()):raise ValueError("Explicit currency precision is required")
 exact_keys(d["selections"],KINDS)
 if "catalogue" not in d["selections"]:raise ValueError("Catalogue source is required")
 for key in ("catalogueDecisions","matches","exceptions"):
  if not isinstance(d[key],list):raise ValueError(key+" must be an array")
 exact_keys(d["cutover"],("state","reviewer","note","at","rollbackRevision"),("state","reviewer","note"))
 if d["cutover"]["state"] not in ("draft","ready","released","rolled-back"):raise ValueError("Invalid cutover state")
 if d["cutover"]["state"]!="draft":
  text(d["cutover"]["reviewer"],"reviewer");text(d["cutover"]["note"],"review note");stamp(d["cutover"].get("at"))
 return d
def derive(d,source_get):
 d=definition(d); datasets={}
 for kind,selected in d["selections"].items():
  raw=source_get(selected["source"])
  datasets[kind]=mapped(parse_table(raw,selected["format"],selected.get("sheet")),selected,kind)
 issues=[]
 def issue(code,kind,item,note,severity="blocking"):
  raw={"code":code,"kind":kind,"source":item.get("_source",""),"row":item.get("_row",0),"id":item.get("id",""),"note":note,"severity":severity}
  raw["key"]=sha(canonical(raw));issues.append(raw)
 def unique(kind):
  found={}
  for x in datasets.get(kind,[]):
   key=x.get("id","")
   if not key:issue("missing-id",kind,x,"A stable original ID is required")
   elif key in found:issue("duplicate-id",kind,x,"Duplicate ID in selected source")
   else:found[key]=x
  return found
 cats=unique("catalogue");regs=unique("registrations");txs=unique("transactions");confs=unique("confirmations")
 seen=set()
 for decision in d["catalogueDecisions"]:
  exact_keys(decision,("source","row","field","original","value","reviewer","note","at"),("source","row","field","original","value","reviewer","note","at"))
  key=(decision["source"],decision["row"],decision["field"])
  if key in seen:raise ValueError("Repeated catalogue decision")
  seen.add(key);text(decision["reviewer"],"reviewer");text(decision["note"],"decision note");stamp(decision["at"])
  if decision["field"] not in FIELDS["catalogue"] or decision["field"]=="id":raise ValueError("Decision cannot replace source identity")
  selected=[r for r in datasets["catalogue"] if r["_source"]==decision["source"] and r["_row"]==decision["row"]]
  if len(selected)!=1 or selected[0].get(decision["field"],"")!=decision["original"]:raise ValueError("Decision does not bind the exact original cell")
  text(decision["value"],"decision value",True);selected[0][decision["field"]]=decision["value"]
 def value(row,field,kind,default=None,nonnegative=True):
  if row.get(field,"")=="" and default is not None:return default
  try:
   n=money(row.get(field,""),d["currencyDigits"][row.get("currency")])
   if nonnegative and n<0:raise ValueError("Negative amount")
   return n
  except (ValueError,KeyError):
   issue("invalid-"+field,kind,row,"Missing, negative, invalid currency or precision");return None
 for c in cats.values():
  c["_amount"]=value(c,"amount","catalogue")
  if c.get("price_options",""):issue("price-options","catalogue",c,"Multiple source prices require an explicit target-site price/discount configuration","review")
  if c["schedule"] not in ("fixed","flexible"):issue("schedule","catalogue",c,"Choose fixed or flexible explicitly")
  if c["schedule"]=="fixed":
   try:
    start=dt.datetime.fromisoformat(c.get("start","").replace("Z","+00:00"))
    if start.tzinfo is None:raise ValueError()
    end=dt.datetime.fromisoformat(c.get("end","").replace("Z","+00:00"))
    if end.tzinfo is None or end<start:raise ValueError()
    day=c.get("weekday","")
    if day and day.lower()!=start.strftime("%A").lower():issue("weekday-conflict","catalogue",c,"Source weekday differs from selected date")
   except ValueError:issue("start","catalogue",c,"Fixed class needs complete offset start/end date-times in order")
  for field in ("capacity","minimum","registration_days"):
   if c.get(field,"") and not re.fullmatch("[0-9]+",c[field]):issue("invalid-"+field,"catalogue",c,"Expected a whole nonnegative number")
  if not c.get("capacity",""):issue("capacity-unset","catalogue",c,"Capacity has not been confirmed","review")
  if not c.get("registration_days",""):issue("deadline-unset","catalogue",c,"Registration deadline has not been confirmed","review")
 matches={}
 for m in d["matches"]:
  exact_keys(m,("transaction","registration","reviewer","note","at"),("transaction","registration","reviewer","note","at"))
  if m["transaction"] in matches:raise ValueError("Duplicate payment matching decision")
  if m["transaction"] not in txs or m["registration"] not in regs:raise ValueError("Match must select actual transaction and registration IDs")
  text(m["reviewer"],"reviewer");text(m["note"],"match note");stamp(m["at"]);matches[m["transaction"]]=m["registration"]
 totals={};paid={};reported={}
 for t in txs.values():
  status=t.get("status");cur=t.get("currency");gross=value(t,"gross","transactions");refund=value(t,"refund","transactions")
  for field in ("service_fee","student_fee","net"):
   t["_"+field]=value(t,field,"transactions",default=0 if field!="net" else None,nonnegative=field!="net") if t.get(field,"") else None
  t["_gross"]=gross;t["_refund"]=refund
  if status not in ("posted","pending","void"):issue("transaction-status","transactions",t,"Map status to posted, pending or void")
  reg=matches.get(t["id"],t.get("registration_id",""));t["_registration"]=reg
  if not reg:issue("unmatched-payment","transactions",t,"No registration match")
  elif reg not in regs:issue("unknown-registration","transactions",t,"Payment references an unselected registration")
  elif cur!=regs[reg].get("currency"):issue("currency-mismatch","transactions",t,"Payment and registration currencies differ")
  elif status=="posted" and gross is not None and refund is not None:paid[reg]=paid.get(reg,0)+gross-refund
  if status=="posted" and gross is not None and refund is not None:
   q=totals.setdefault(cur,{"gross":0,"refund":0,"paid":0,"service_fee":0,"student_fee":0,"reported_net":0,"reported_net_rows":0})
   q["gross"]+=gross;q["refund"]+=refund;q["paid"]+=gross-refund
   for field in ("service_fee","student_fee"):
    if t["_"+field] is not None:q[field]+=t["_"+field]
   if t["_net"] is not None:q["reported_net"]+=t["_net"];q["reported_net_rows"]+=1
  if refund is not None and gross is not None and refund>gross:issue("refund-exceeds-gross","transactions",t,"Retain adjustment and review source; do not infer a payment action","review")
 confirmations={}
 for c in confs.values():
  r=c.get("registration_id")
  if r not in regs:issue("confirmation-registration","confirmations",c,"Unknown registration")
  if c.get("status") not in ("confirmed","declined","pending"):issue("confirmation-status","confirmations",c,"Map confirmation state explicitly")
  if r in confirmations:issue("duplicate-confirmation","confirmations",c,"Select one current instructor confirmation per registration")
  else:confirmations[r]=c
 counts={}
 registration_rows=[]
 for r in regs.values():
  fee=value(r,"fee","registrations");class_id=r.get("class_id");c=cats.get(class_id);payment=paid.get(r["id"],0);balance=None if fee is None else fee-payment
  if c is None:issue("unknown-class","registrations",r,"Registration references an unselected class")
  elif r.get("currency")!=c.get("currency"):issue("class-currency","registrations",r,"Registration and class currencies differ")
  elif fee is not None and fee!=c.get("_amount"):
   allowed=[]
   try:allowed=[money(x.strip(),d["currencyDigits"][r["currency"]]) for x in c.get("price_options","").split(";") if x.strip()]
   except ValueError:pass
   if fee not in allowed:issue("fee-quote","registrations",r,"Registration fee differs from all selected source prices","review")
  if r.get("status") not in ("active","cancelled","waitlist"):issue("registration-status","registrations",r,"Map status to active, cancelled or waitlist")
  confirmation=confirmations.get(r["id"],{}).get("status","missing")
  if r.get("status")=="active":
   counts[class_id]=counts.get(class_id,0)+1
   if confirmation!="confirmed":issue("instructor-confirmation","registrations",r,"Attendance confirmation has not been recorded","review")
   if balance is not None and balance!=0:issue("balance","registrations",r,"Registration balance is "+amount(balance,d["currencyDigits"][r["currency"]]),"review")
  registration_rows.append({**r,"fee_minor":fee,"paid_minor":payment,"balance_minor":balance,"confirmation":confirmation})
 for k,c in cats.items():
  if re.fullmatch("[0-9]+",c.get("capacity","")) and counts.get(k,0)>int(c["capacity"]):issue("over-capacity","catalogue",c,"Active registrations exceed confirmed capacity")
  if re.fullmatch("[0-9]+",c.get("minimum","")) and counts.get(k,0)<int(c["minimum"]):issue("below-minimum","catalogue",c,"Current active registrations are below the selected minimum","review")
 decisions={}
 for x in d["exceptions"]:
  exact_keys(x,("key","reviewer","note","at"),("key","reviewer","note","at"));text(x["reviewer"],"reviewer");text(x["note"],"exception note");stamp(x["at"])
  if x["key"] in decisions:raise ValueError("Duplicate exception decision")
  decisions[x["key"]]=x
 if set(decisions)-{i["key"] for i in issues}:raise ValueError("Exception decision is stale or belongs to another source")
 for x in issues:x["decision"]=decisions.get(x["key"])
 unresolved=[i for i in issues if i["severity"]=="blocking" or not i["decision"]]
 if d["cutover"]["state"] in ("ready","released") and unresolved:raise ValueError("Resolve source blockers and explicitly review all open exceptions before cutover")
 return {"datasets":datasets,"registrations":registration_rows,"issues":issues,"unresolved":len(unresolved),"totals":totals,"classCounts":counts,"matches":matches}

def course_sheet(view):
 """Documented human-mapped CourseStorm CSV; this never uploads or activates classes."""
 plan=view["definition"].get("importPlan")
 if not plan:raise ValueError("Save an explicit CourseStorm import plan first")
 exact_keys(plan,("provider","catalogue","selectedIds","reviewer","note","at"),("provider","catalogue","selectedIds","reviewer","note","at"))
 if plan["provider"]!="coursestorm-csv":raise ValueError("Unknown import provider")
 text(plan["catalogue"],"target catalogue");text(plan["reviewer"],"reviewer");text(plan["note"],"import review");stamp(plan["at"])
 if not isinstance(plan["selectedIds"],list) or not plan["selectedIds"] or len(set(plan["selectedIds"]))!=len(plan["selectedIds"]):raise ValueError("Select unique class IDs")
 rows={c["id"]:c for c in view["derived"]["datasets"]["catalogue"]}
 columns=["Class Name","Description","Price","Start Date","End Date","Start Time","End Time","Instructor","Location","Max Seats","Min Seats","Class Type","Categories","Continuous Enrollment","Visibility"]
 out=[]
 for key in plan["selectedIds"]:
  if key not in rows:raise ValueError("Unknown selected class")
  c=rows[key]
  if any(x["kind"]=="catalogue" and x["id"]==key and (x["severity"]=="blocking" or not x["decision"]) for x in view["derived"]["issues"]):raise ValueError("Selected class still has unresolved source decisions")
  if c.get("price_options",""):raise ValueError("Multiple source prices require a saved target-site price configuration; this simple class sheet cannot represent them")
  if c["currency"]!="USD":raise ValueError("This received CourseStorm import profile is explicitly USD; obtain the actual tenant profile for other currencies")
  try:
   start=dt.datetime.fromisoformat(c["start"].replace("Z","+00:00"));end=dt.datetime.fromisoformat(c["end"].replace("Z","+00:00"))
   if start.tzinfo is None or end.tzinfo is None or end<start:raise ValueError()
  except (KeyError,ValueError):raise ValueError("A reviewed dated enrollment window is required even for flexible attendance; no dates are invented")
  continuous=c.get("continuous_enrollment","")
  if c["schedule"]=="flexible" and continuous!="yes":raise ValueError("Flexible attendance requires a reviewed continuous-enrollment decision and target-site confirmation")
  if not c.get("capacity"):raise ValueError("Confirm capacity rather than importing a blank unlimited maximum")
  price=amount(c["_amount"],view["definition"]["currencyDigits"]["USD"])
  out.append([c["title"],c.get("description",""),price,start.date().isoformat(),end.date().isoformat(),start.strftime("%H:%M"),end.strftime("%H:%M"),c.get("instructor",""),c.get("location",""),c["capacity"],c.get("minimum",""),c.get("class_type",""),c.get("categories",""),continuous or "no","hidden"])
 return {"catalogue":plan["catalogue"],"columns":columns,"rows":out,"csv":csv_bytes(columns,out),"reviewer":plan["reviewer"],"note":plan["note"]}

class Workspace:
 def __init__(self,directory,create=False):
  self.root=pathlib.Path(directory).resolve()
  if not create and not (self.root/"workspace.sqlite").is_file():raise ValueError("Existing workspace required")
  self.root.mkdir(parents=True,exist_ok=True);self.db=sqlite3.connect(self.root/"workspace.sqlite",timeout=30)
  self.db.execute("PRAGMA foreign_keys=ON");self.db.execute("PRAGMA busy_timeout=30000")
  self.db.executescript("CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,raw BLOB NOT NULL,metadata TEXT NOT NULL);CREATE TABLE IF NOT EXISTS revisions(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(id,revision));CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,sha TEXT NOT NULL,body TEXT NOT NULL,result TEXT NOT NULL);")
  with self.db:self.db.execute("INSERT OR IGNORE INTO metadata VALUES('identity',?)",(uuid.uuid4().hex,))
 def close(self):self.db.close()
 def identity(self):return self.db.execute("SELECT value FROM metadata WHERE key='identity'").fetchone()[0]
 def add_source(self,raw,metadata):
  if not isinstance(raw,bytes) or len(raw)>MAX_SOURCE:raise ValueError("Source exceeds bound")
  exact_keys(metadata,("label","filename","url","retrievedAt","provenance","notice"),("label","filename","retrievedAt","provenance"))
  text(metadata["label"],"label");text(metadata["filename"],"filename");stamp(metadata["retrievedAt"])
  if metadata["provenance"] not in ("public-original","public-derived","approved-private","synthetic-engineering"):raise ValueError("Source provenance must be explicit")
  sid=sha(raw);body=canonical(metadata).decode()
  with self.db:
   old=self.db.execute("SELECT raw,metadata FROM sources WHERE id=?",(sid,)).fetchone()
   if old and old[0]!=raw:raise Conflict("Source collision")
   if not old:self.db.execute("INSERT INTO sources VALUES(?,?,?)",(sid,raw,body))
  return self.source_info(sid)
 def source(self,sid):
  row=self.db.execute("SELECT raw FROM sources WHERE id=?",(sid,)).fetchone()
  if row is None:raise ValueError("Unknown source "+str(sid))
  if sha(row[0])!=sid:raise ValueError("Stored source integrity failed")
  return row[0]
 def source_info(self,sid):
  row=self.db.execute("SELECT metadata,length(raw) FROM sources WHERE id=?",(sid,)).fetchone()
  if row is None:raise ValueError("Unknown source")
  return {"id":sid,"bytes":row[1],**json.loads(row[0])}
 def sources(self):return [self.source_info(x[0]) for x in self.db.execute("SELECT id FROM sources ORDER BY id")]
 def table(self,sid,format,sheet=None):return parse_table(self.source(sid),format,sheet)
 def view(self,id,revision=None):
  if revision is None:row=self.db.execute("SELECT body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
  else:row=self.db.execute("SELECT body FROM revisions WHERE id=? AND revision=?",(id,revision)).fetchone()
  if row is None:raise ValueError("Unknown review/revision")
  result=json.loads(row[0])
  actual=derive(result["definition"],self.source)
  if sha(canonical(actual))!=result["derivedSha256"]:raise ValueError("Saved derivation integrity failed")
  return {**result,"derived":actual}
 def history(self,id):return [self.view(id,x[0]) for x in self.db.execute("SELECT revision FROM revisions WHERE id=? ORDER BY revision",(id,))]
 def state(self):return {"schema":SCHEMA,"workspaceId":self.identity(),"sources":self.sources(),"reviews":[self.view(x[0]) for x in self.db.execute("SELECT DISTINCT id FROM revisions ORDER BY id")],"contract":{"fields":FIELDS,"required":REQUIRED}}
 def request(self,rid):
  row=self.db.execute("SELECT sha,body,result FROM requests WHERE id=?",(rid,)).fetchone()
  return {"state":"NOT_RECORDED","requestId":rid,"workspaceId":self.identity()} if row is None else {"state":"RECORDED","requestId":rid,"workspaceId":self.identity(),"sha256":row[0],"request":json.loads(row[1]),"result":json.loads(row[2])}
 def save(self,request):
  exact_keys(request,("requestId","id","expectedRevision","actor","at","definition"),("requestId","actor","at","definition"))
  rid=ident(request["requestId"]);text(request["actor"],"actor");stamp(request["at"]);body=canonical(request);digest=sha(body);d=definition(request["definition"])
  self.db.execute("BEGIN IMMEDIATE")
  try:
   prior=self.db.execute("SELECT sha,result FROM requests WHERE id=?",(rid,)).fetchone()
   if prior:
    if prior[0]!=digest:raise Conflict("Request ID reused with a different complete body")
    result=json.loads(prior[1]);self.db.commit();return self.view(result["id"],result["revision"])
   id=ident(request["id"]) if "id" in request else "review-"+sha(body)[:24]
   previous=self.db.execute("SELECT revision,body FROM revisions WHERE id=? ORDER BY revision DESC LIMIT 1",(id,)).fetchone()
   if previous is None:
    if "id" in request or "expectedRevision" in request:raise Conflict("Create must omit id and expectedRevision")
    revision=1
   else:
    if request.get("expectedRevision")!=previous[0] or type(request.get("expectedRevision")) is not int:raise Conflict("Review revision changed")
    revision=previous[0]+1
   if d["cutover"]["state"]=="rolled-back":
    target=d["cutover"].get("rollbackRevision")
    if type(target)is not int or not previous or not 1<=target<revision:raise ValueError("Rollback must name a previous released revision")
    target_view=self.view(id,target)
    if target_view["definition"]["cutover"]["state"]!="released":raise ValueError("Rollback target was not released")
   actual=derive(d,self.source)
   if d.get("importPlan") and d["cutover"]["state"] in ("ready","released"):course_sheet({"definition":d,"derived":actual})
   info=[self.source_info(s) for s in sorted({x["source"] for x in d["selections"].values()})]
   result={"schema":SCHEMA,"id":id,"revision":revision,"requestId":rid,"requestSha256":digest,"actor":request["actor"],"at":request["at"],"definition":d,"sources":info,"derivedSha256":sha(canonical(actual))}
   self.db.execute("INSERT INTO revisions VALUES(?,?,?)",(id,revision,canonical(result).decode()))
   self.db.execute("INSERT INTO requests VALUES(?,?,?,?)",(rid,digest,body.decode(),canonical(result).decode()));self.db.commit()
   return {**result,"derived":actual}
  except BaseException:self.db.rollback();raise
 def compare(self,id,before,after):
  a=self.view(id,before);b=self.view(id,after)
  changes=[]
  for kind in KINDS:
   aa={x["id"]:x for x in a["derived"]["datasets"].get(kind,[]) if x.get("id")};bb={x["id"]:x for x in b["derived"]["datasets"].get(kind,[]) if x.get("id")}
   for key in sorted(set(aa)|set(bb)):
    av=aa.get(key);bv=bb.get(key)
    ac=None if av is None else {k:v for k,v in av.items() if not k.startswith("_")}
    bc=None if bv is None else {k:v for k,v in bv.items() if not k.startswith("_")}
    if ac!=bc:changes.append({"kind":kind,"id":key,"before":av,"after":bv})
  return {"id":id,"beforeRevision":before,"afterRevision":after,"changes":changes,"beforeTotals":a["derived"]["totals"],"afterTotals":b["derived"]["totals"]}
 def export(self,id,revision=None):
  view=self.view(id,revision);history=self.history(id)[:view["revision"]];members={}
  for h in history:
   request=self.request(h["requestId"])["request"]
   members["history/"+str(h["revision"])+".json"]=canonical({"view":{k:v for k,v in h.items() if k!="derived"},"request":request})
   for s in h["sources"]:members["sources/"+s["id"]]=self.source(s["id"]);members["sources/"+s["id"]+".json"]=canonical(s)
  members["selected.json"]=canonical({"id":id,"revision":view["revision"]})
  cols=["id","class_id","student_key","status","fee","currency","paid_minor","balance_minor","confirmation"]
  members["reports/registrations.csv"]=csv_bytes(cols,[[x.get(c,"") for c in cols] for x in view["derived"]["registrations"]])
  members["reports/reconciliation.json"]=canonical(view["derived"])
  members["reports/issues.csv"]=csv_bytes(["key","code","kind","source","row","id","note","severity","reviewer","review_note"],[[x.get(c,"") for c in ("key","code","kind","source","row","id","note","severity")]+[(x["decision"] or {}).get("reviewer",""),(x["decision"] or {}).get("note","")] for x in view["derived"]["issues"]])
  if view["definition"].get("importPlan"):
   try:
    sheet=course_sheet(view);members["reports/coursestorm-reviewed-catalogue.csv"]=sheet.pop("csv");members["reports/coursestorm-import-plan.json"]=canonical(sheet)
   except ValueError as error:members["reports/coursestorm-import-not-ready.json"]=canonical({"state":"NEEDS_REVIEW","reason":str(error),"plan":view["definition"]["importPlan"]})
  members["READ_ME.txt"]=("Complete class intake handover. Raw sources, immutable requests and review history are retained. No payment/refund or CourseStorm action has been performed. Reports use integer minor units with explicit currency precision. Any synthetic source remains labelled in source metadata. Receive with class_intake.py receive --workspace NEW --packet FILE.").encode()
  manifest={"schema":"class-intake.packet.v1","selected":{"id":id,"revision":view["revision"]},"files":[{"path":n,"bytes":len(b),"sha256":sha(b)} for n,b in sorted(members.items())]}
  members["manifest.json"]=canonical(manifest);out=io.BytesIO()
  with zipfile.ZipFile(out,"w",compression=zipfile.ZIP_DEFLATED) as z:
   for n,b in sorted(members.items()):
    info=zipfile.ZipInfo(n,(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;z.writestr(info,b)
  return out.getvalue()
 def receive(self,raw):
  if len(raw)>MAX_PACKET:raise ValueError("Packet exceeds bound")
  with zipfile.ZipFile(io.BytesIO(raw)) as z:
   names=z.namelist()
   if len(names)!=len(set(names)) or sum(i.file_size for i in z.infolist())>MAX_PACKET:raise ValueError("Unsafe/oversized packet")
   members={n:z.read(n) for n in names}
  manifest=json.loads(members.pop("manifest.json"));exact_keys(manifest,("schema","selected","files"),("schema","selected","files"))
  if manifest["schema"]!="class-intake.packet.v1":raise ValueError("Unsupported packet")
  if set(members)!={x["path"] for x in manifest["files"]}:raise ValueError("Packet member mismatch")
  for f in manifest["files"]:
   if len(members[f["path"]])!=f["bytes"] or sha(members[f["path"]])!=f["sha256"]:raise ValueError("Packet hash mismatch")
  selected=json.loads(members["selected.json"])
  if selected!=manifest["selected"]:raise ValueError("Selection mismatch")
  with tempfile.TemporaryDirectory() as tmp:
   verification=Workspace(tmp,True)
   try:
    source_ids=sorted(n.removeprefix("sources/") for n in members if n.startswith("sources/") and not n.endswith(".json"))
    for sid in source_ids:
     meta=json.loads(members["sources/"+sid+".json"])
     if meta.pop("id")!=sid or meta.pop("bytes")!=len(members["sources/"+sid]) or sha(members["sources/"+sid])!=sid:raise ValueError("Invalid source descriptor")
     verification.add_source(members["sources/"+sid],meta)
    for revision in range(1,selected["revision"]+1):
     item=json.loads(members["history/"+str(revision)+".json"]);actual=verification.save(item["request"])
     if {k:v for k,v in actual.items() if k!="derived"}!=item["view"]:raise ValueError("History does not derive from the complete original request")
    rebuilt=verification.export(selected["id"],selected["revision"])
    if rebuilt!=raw:raise ValueError("Packet has unexplained derived or structural differences")
    self.db.execute("BEGIN IMMEDIATE")
    try:
     for sid,body,metadata in verification.db.execute("SELECT id,raw,metadata FROM sources"):
      prior=self.db.execute("SELECT raw FROM sources WHERE id=?",(sid,)).fetchone()
      if prior and prior[0]!=body:raise Conflict("Source collision")
      if not prior:self.db.execute("INSERT INTO sources VALUES(?,?,?)",(sid,body,metadata))
     for id,revision,body in verification.db.execute("SELECT id,revision,body FROM revisions"):
      prior=self.db.execute("SELECT body FROM revisions WHERE id=? AND revision=?",(id,revision)).fetchone()
      if prior and prior[0]!=body:raise Conflict("Review diverges")
      if not prior:self.db.execute("INSERT INTO revisions VALUES(?,?,?)",(id,revision,body))
     for rid,digest,body,result in verification.db.execute("SELECT id,sha,body,result FROM requests"):
      prior=self.db.execute("SELECT sha,body,result FROM requests WHERE id=?",(rid,)).fetchone()
      if prior and prior!=(digest,body,result):raise Conflict("Request diverges")
      if not prior:self.db.execute("INSERT INTO requests VALUES(?,?,?,?)",(rid,digest,body,result))
     self.db.commit()
    except BaseException:self.db.rollback();raise
   finally:verification.close()
  return {"selected":self.view(selected["id"],selected["revision"]),"history":self.history(selected["id"]),"packet":{"bytes":len(raw),"sha256":sha(raw)}}
def main():
 p=argparse.ArgumentParser();p.add_argument("command",choices=("init","state","source","table","save","view","history","request","compare","catalogue-sheet","export","receive"));p.add_argument("--workspace",required=True);p.add_argument("--input");p.add_argument("--metadata");p.add_argument("--id");p.add_argument("--revision",type=int);p.add_argument("--before",type=int);p.add_argument("--after",type=int);p.add_argument("--format");p.add_argument("--sheet");p.add_argument("--output");p.add_argument("--packet");a=p.parse_args()
 w=Workspace(a.workspace,a.command in ("init","receive"))
 try:
  if a.command in ("init","state"):result=w.state()
  elif a.command=="source":result=w.add_source(pathlib.Path(a.input).read_bytes(),json.loads(pathlib.Path(a.metadata).read_text()))
  elif a.command=="table":result=w.table(a.id,a.format,a.sheet)
  elif a.command=="save":result=w.save(json.loads(pathlib.Path(a.input).read_text()))
  elif a.command=="view":result=w.view(a.id,a.revision)
  elif a.command=="history":result=w.history(a.id)
  elif a.command=="request":result=w.request(a.id)
  elif a.command=="compare":result=w.compare(a.id,a.before,a.after)
  elif a.command=="receive":result=w.receive(pathlib.Path(a.packet).read_bytes())
  elif a.command=="catalogue-sheet":
   s=course_sheet(w.view(a.id,a.revision));b=s.pop("csv");atomic(a.output,b);result={**s,"path":str(pathlib.Path(a.output).resolve()),"bytes":len(b),"sha256":sha(b)}
  elif a.command=="export":
   b=w.export(a.id,a.revision);atomic(a.output,b);result={"path":str(pathlib.Path(a.output).resolve()),"bytes":len(b),"sha256":sha(b)}
  print(json.dumps(result,ensure_ascii=False))
 finally:w.close()
if __name__=="__main__":main()
