#!/usr/bin/env python3
"""MIT. Original FROST client transport with exact request and receiving custody."""
from __future__ import annotations
import argparse, datetime as dt, decimal, fcntl, hashlib, importlib.metadata, json, os, pathlib, re, signal, sys, time, uuid
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit, urlunsplit, quote, unquote, urlencode

SCHEMA = "stellar-forge.sensorthings-commissioning-native.v1"
NATIVE_COMMIT = "9f41f7794725fced63fcb07e6b33dbc1f897f2bc"
NATIVE_VERSION = "1.1.53"
KINDS = ("Locations", "Things", "Sensors", "ObservedProperties", "FeaturesOfInterest", "Datastreams", "MultiDatastreams", "HistoricalLocations", "Observations")
RELATIONS = {
 "Things":{"Locations":("Locations",True)},
 "Datastreams":{"Thing":("Things",False),"Sensor":("Sensors",False),"ObservedProperty":("ObservedProperties",False)},
 "MultiDatastreams":{"Thing":("Things",False),"Sensor":("Sensors",False),"ObservedProperties":("ObservedProperties",True)},
 "HistoricalLocations":{"Thing":("Things",False),"Locations":("Locations",True)},
 "Observations":{"Datastream":("Datastreams",False),"MultiDatastream":("MultiDatastreams",False),"FeatureOfInterest":("FeaturesOfInterest",False)}
}
WRITABLE = {
 "Things":("name","description","properties"), "Locations":("name","description","encodingType","location","properties"),
 "Sensors":("name","description","encodingType","metadata","properties"),"ObservedProperties":("name","description","definition","properties"),
 "FeaturesOfInterest":("name","description","encodingType","feature","properties"),
 "Datastreams":("name","description","observationType","unitOfMeasurement","observedArea","properties"),
 "MultiDatastreams":("name","description","multiObservationDataTypes","unitOfMeasurements","observedArea","properties"),
 "HistoricalLocations":("time",), "Observations":("phenomenonTime","resultTime","result","resultQuality","validTime","parameters")
}
class NativeError(Exception):
 def __init__(self, code, message, **details):
  super().__init__(message); self.code=code; self.details=details
class Number:
 def __init__(self, text):
  if not re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?", text): raise ValueError("Invalid exact JSON number")
  self.text=text
 def __repr__(self): return "Number("+self.text+")"
def duplicates(pairs):
 result={}
 for key,value in pairs:
  if key in result: raise NativeError("DUPLICATE_JSON_KEY","An original JSON object repeats a member.",key=key)
  result[key]=value
 return result
def source_loads(data):
 return json.loads(data, parse_int=Number, parse_float=Number, parse_constant=lambda v:(_ for _ in ()).throw(ValueError(v)),object_pairs_hook=duplicates)
def exact(value):
 if isinstance(value,Number): return value.text
 if value is None: return "null"
 if value is True: return "true"
 if value is False: return "false"
 if isinstance(value,str): return json.dumps(value,ensure_ascii=False)
 if isinstance(value,(int,float)): return json.dumps(value,allow_nan=False)
 if isinstance(value,list): return "["+",".join(exact(x) for x in value)+"]"
 if isinstance(value,dict): return "{"+",".join(json.dumps(k,ensure_ascii=False)+":"+exact(v) for k,v in value.items())+"}"
 raise TypeError(type(value).__name__)
def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def sha(data): return hashlib.sha256(data).hexdigest()
def encoded(value): return (json.dumps(value,ensure_ascii=False,separators=(",",":"),allow_nan=False)+"\n").encode()
def private_directory(path):
 path=pathlib.Path(path).absolute(); path.mkdir(parents=True,exist_ok=True,mode=0o700)
 stat=path.lstat()
 if path.resolve()!=path or not path.is_dir() or stat.st_mode&0o077 or stat.st_uid!=os.getuid(): raise NativeError("PRIVATE_DIRECTORY","Use the original owned private operation directory.")
 return path
def read_owned(path,maximum=256*1024*1024):
 path=pathlib.Path(path).absolute()
 if path.resolve()!=path: raise NativeError("SOURCE_PATH_CHANGED","A retained source path changed.")
 fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
 try:
  before=os.fstat(fd)
  if not __import__("stat").S_ISREG(before.st_mode) or before.st_mode&0o077 or before.st_uid!=os.getuid() or before.st_size>maximum: raise NativeError("PRIVATE_FILE","The retained file identity or access changed.")
  with os.fdopen(os.dup(fd),"rb") as inp: data=inp.read(maximum+1)
  after=os.fstat(fd)
  if len(data)!=before.st_size or (before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_size,after.st_mtime_ns,after.st_ctime_ns): raise NativeError("SOURCE_CHANGED","The retained file changed during reading.")
  return data
 finally: os.close(fd)
def sync_dir(path):
 fd=os.open(path,os.O_RDONLY)
 try: os.fsync(fd)
 finally: os.close(fd)
def atomic(path,data):
 path=pathlib.Path(path); temp=path.with_name(path.name+"."+uuid.uuid4().hex+".tmp")
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0),0o600)
 try:
  with os.fdopen(fd,"wb") as out: out.write(data);out.flush();os.fsync(out.fileno())
  os.replace(temp,path);sync_dir(path.parent)
 finally:
  try: temp.unlink()
  except FileNotFoundError: pass
def write_json(path,value): atomic(path,encoded(value))
def load_json(path,default=None):
 try: return json.loads(read_owned(path))
 except FileNotFoundError:
  if default is not None:return default
  raise
def retain(root,data):
 digest=sha(data);path=root/"objects"/digest
 try:
  previous=read_owned(path,max(len(data),1024))
  if previous!=data:raise NativeError("IMMUTABLE_CHANGED","An immutable native object changed.")
 except FileNotFoundError:
  temp=path.with_name(digest+"."+uuid.uuid4().hex+".tmp")
  fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,"O_NOFOLLOW",0),0o600)
  try:
   with os.fdopen(fd,"wb") as out:out.write(data);out.flush();os.fsync(out.fileno())
   try:os.link(temp,path);sync_dir(path.parent)
   except FileExistsError:
    if read_owned(path,max(len(data),1024))!=data:raise NativeError("IMMUTABLE_CHANGED","An immutable native object changed.")
  finally:
   try:temp.unlink()
   except FileNotFoundError:pass
 return {"path":"objects/"+digest,"sha256":digest,"bytes":len(data)}
def object_bytes(root,record):
 path=record.get("path","")
 if not re.fullmatch(r"objects/[a-f0-9]{64}",path):raise NativeError("OBJECT_PATH","Select an original relative native object.")
 data=read_owned(root/path)
 if len(data)!=record["bytes"] or sha(data)!=record["sha256"]:raise NativeError("OBJECT_CHANGED","A native request/response object changed.")
 return data
def validate_id(value):
 parsed=source_loads(value)
 if not isinstance(parsed,(Number,str)):raise NativeError("TARGET_ID","A native target identifier must be a JSON number or string.")
 return parsed
def id_key(value):
 parsed=validate_id(value)
 if isinstance(parsed,Number):
  parts=decimal.Decimal(parsed.text).as_tuple();digits="".join(str(x) for x in parts.digits).lstrip("0")
  if not digits:return "number:0"
  exponent=parts.exponent
  while digits.endswith("0"):digits=digits[:-1];exponent+=1
  return "number:"+("-" if parts.sign else "")+digits+"e"+str(exponent)
 return "string:"+json.dumps(parsed,ensure_ascii=False)
def target_url(profile,value="",base=None):
 root=profile["serviceUrl"];url=urljoin(base or root,value);a,b=urlsplit(root),urlsplit(url)
 if b.scheme!=a.scheme or b.netloc!=a.netloc or b.username or b.password or b.fragment or not b.path.startswith(a.path):raise NativeError("TARGET_URL","The native target link left the selected service root.")
 if any(part in (".","..") for part in unquote(b.path).split("/")) or "\\" in unquote(b.path):raise NativeError("TARGET_URL","The native target link is not a canonical service path.")
 return url
def entity_url(profile,kind,id_json,expand=False):
 if kind not in KINDS:raise NativeError("ENTITY_KIND","Choose an original SensorThings entity collection.")
 value=validate_id(id_json)
 literal=value.text if isinstance(value,Number) else "'"+value.replace("'","''")+"'"
 url=target_url(profile,kind+"("+quote(literal,safe="'-._~")+")")
 if expand and RELATIONS.get(kind):url+="?"+urlencode({"$expand":",".join(RELATIONS[kind])})
 return url
def returned_id(kind,response,root):
 candidates=[];location=response.get("headers",{}).get("location")
 if location:
  url=target_url(root,location)
  part=unquote(urlsplit(url).path.rsplit("/",1)[-1])
  match=re.fullmatch(re.escape(kind)+r"\((.*)\)",part)
  if match:
   value=match.group(1)
   candidates.append(exact(value[1:-1].replace("''","'")) if value.startswith("'") and value.endswith("'") else exact(Number(value)))
 if response["body"].get("complete",True):
  try:
   doc=source_loads(response["_bytes"])
   if isinstance(doc,dict) and "@iot.id" in doc:candidates.append(exact(doc["@iot.id"]))
  except (ValueError,UnicodeError):pass
 if not candidates:return None
 for value in candidates:validate_id(value)
 if len({id_key(value) for value in candidates})!=1:raise NativeError("TARGET_ID_CONFLICT","The native Location and response identifier disagree.")
 return candidates[-1]
def selected_runtime(ready_path):
 receipt=load_json(ready_path)
 if receipt.get("schema")!="stellar-forge.frost-client-runtime.v1" or receipt.get("native",{}).get("commit")!=NATIVE_COMMIT or receipt.get("native",{}).get("version")!=NATIVE_VERSION:raise NativeError("RUNTIME_RECEIPT","Use the complete original selected FROST runtime receipt.")
 if os.path.abspath(sys.executable)!=os.path.abspath(receipt["python"]):raise NativeError("RUNTIME_INTERPRETER","The selected original environment interpreter changed.")
 if importlib.metadata.version("frost-sta-client")!=NATIVE_VERSION:raise NativeError("NATIVE_VERSION","The installed native FROST client differs from the selected source.")
 import frost_sta_client
 root=pathlib.Path(frost_sta_client.__file__).resolve().parent
 if str(root)!=receipt["native"]["packageRoot"]:raise NativeError("NATIVE_ORIGIN","The original FROST package was loaded from another directory.")
 for item in receipt["native"]["files"]:
  path=pathlib.PurePosixPath(item["path"])
  if path.is_absolute() or ".." in path.parts:raise NativeError("NATIVE_SOURCE","The native source manifest has an unsafe path.")
  data=(root/path).read_bytes()
  if len(data)!=item["bytes"] or sha(data)!=item["sha256"]:raise NativeError("NATIVE_SOURCE","The selected native client source changed.",path=item["path"])
 return {"schema":"stellar-forge.frost-client-runtime-identity.v1","pythonVersion":sys.version,"nativeCommit":NATIVE_COMMIT,"nativeVersion":NATIVE_VERSION,
  "sourceManifestSha256":sha(encoded(receipt["native"]["files"])),"receiptSha256":sha(read_owned(ready_path))}
def time_value(value):
 if not isinstance(value,str):return None
 parts=value.split("/")
 if len(parts)>2:return None
 result=[]
 for part in parts:
  match=re.fullmatch(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})",part)
  if not match:return None
  base=dt.datetime.fromisoformat(match.group(1)+match.group(3).replace("Z","+00:00"))
  epoch=dt.datetime(1970,1,1,tzinfo=dt.timezone.utc);delta=base-epoch
  result.append(decimal.Decimal(delta.days*86400+delta.seconds)+decimal.Decimal("0."+(match.group(2) or "0")))
 return tuple(result)
def same(a,b):
 if isinstance(a,Number) and isinstance(b,Number):return decimal.Decimal(a.text)==decimal.Decimal(b.text)
 if type(a)!=type(b):return False
 if isinstance(a,dict):return a.keys()==b.keys() and all(same(a[k],b[k]) for k in a)
 if isinstance(a,list):return len(a)==len(b) and all(same(x,y) for x,y in zip(a,b))
 return a==b
def display(value):
 return {"state":"value","json":exact(value),"type":"number" if isinstance(value,Number) else "null" if value is None else type(value).__name__}
def compare_fields(expected,actual,kind,relations=None,strict=False):
 differences=[];equivalent=[]
 for key,value in expected.items():
  if key not in actual:differences.append({"field":key,"source":display(value),"target":{"state":"missing"}});continue
  target=actual[key]
  if same(value,target):continue
  try:temporal=key in ("phenomenonTime","resultTime","validTime","time") and time_value(value) is not None and time_value(value)==time_value(target)
  except (ValueError,OverflowError,decimal.InvalidOperation):temporal=False
  if temporal:equivalent.append({"field":key,"sourceJson":exact(value),"targetJson":exact(target),"meaning":"Same explicit instant/interval; original text differs."})
  else:differences.append({"field":key,"source":display(value),"target":display(target)})
 if strict:
  for key in WRITABLE[kind]:
   if key in actual and key not in expected:differences.append({"field":key,"source":{"state":"missing"},"target":display(actual[key])})
 for name,definition in (relations or {}).items():
  expected_ids=definition.get("ids",[])
  value=actual.get(name);members=value if isinstance(value,list) else [value] if isinstance(value,dict) else []
  ids=[]
  for member in members:
   if isinstance(member,dict) and "@iot.id" in member:ids.append(exact(member["@iot.id"]))
  if len(ids)!=len(expected_ids) or any(id_key(a)!=id_key(b) for a,b in zip(ids,expected_ids)):
   differences.append({"relation":name,"expectedIdJson":expected_ids,"actualIdJson":ids,"state":"missing" if value is None else "different"})
 return {"matched":not differences,"differences":differences,"equivalentTimeRepresentations":equivalent,"meaning":"Selected original fields and typed relations; no inferred unit/quality conversion."}
def response_wait(headers):
 value=headers.get("retry-after")
 if not value:return None
 try:
  if re.fullmatch(r"\d+",value):return (dt.datetime.now(dt.timezone.utc)+dt.timedelta(seconds=int(value))).isoformat().replace("+00:00","Z")
  return parsedate_to_datetime(value).astimezone(dt.timezone.utc).isoformat().replace("+00:00","Z")
 except (ValueError,OverflowError):return None
def json_pointer(key):return "/"+key.replace("~","~0").replace("/","~1")
class Worker:
 def __init__(self,root,job,ready):
  self.root=root;self.job=job;self.plan=job["plan"];self.profile=self.plan["target"];self.ready=ready
  self.stopped=False;self.counts={"total":len(self.plan["steps"]),"complete":0,"failed":0,"awaitingReconciliation":0}
  self.records={};self.bindings={};self.attempt_id=uuid.uuid4().hex
  self.journal=load_json(root/"journal.json",{"schema":SCHEMA,"jobId":job["id"],"planSha256":sha(encoded(self.plan)),"state":"QUEUED","createdAt":job["createdAt"],"sequence":0,"attempts":[]})
  if self.journal["jobId"]!=job["id"] or self.journal["planSha256"]!=sha(encoded(self.plan)):raise NativeError("JOB_IDENTITY","The original native job plan changed.")
  for definition in self.plan["steps"]:
   path=root/"steps"/(definition["stepId"]+".json")
   record=load_json(path,{"stepId":definition["stepId"],"entityKind":definition.get("entityKind"),"sourceKey":definition.get("sourceKey"),"originalStepId":definition.get("originalStepId"),"mode":definition["mode"],"state":"QUEUED","attempts":[],"usedResolutionIds":[]})
   self.records[definition["stepId"]]=record
   if definition.get("targetIdJson") and definition["mode"] in ("bind","update","restore","delete"):self.bindings[definition.get("sourceKey")]=definition["targetIdJson"]
   if record["state"]=="COMPLETE" and record.get("targetIdJson"):self.bindings[definition.get("sourceKey")]=record["targetIdJson"]
  from frost_sta_client.service.sensorthingsservice import SensorThingsService
  self.service=SensorThingsService(self.profile["serviceUrl"])
 def control(self):
  value=load_json(self.root/"control.json",{"jobId":self.job["id"],"cancel":False,"resolutions":{}})
  if value.get("jobId")!=self.job["id"]:raise NativeError("CONTROL_IDENTITY","The original job control belongs to another operation.")
  return value
 def cancelled(self):return self.stopped or self.control().get("cancel") is True
 def save_step(self,record):
  record["updatedAt"]=now();write_json(self.root/"steps"/(record["stepId"]+".json"),record)
 def save(self,state=None,**values):
  if state:self.journal["state"]=state
  self.journal.update(values);self.journal["sequence"]+=1;self.journal["updatedAt"]=now()
  self.counts.update({name:sum(x["state"]==state for x in self.records.values()) for name,state in (("complete","COMPLETE"),("failed","FAILED"),("awaitingReconciliation","AWAITING_RECONCILIATION"))})
  self.journal["counts"]=self.counts;write_json(self.root/"journal.json",self.journal)
 def request(self,record,method,url,body=None,headers=None,purpose="native"):
  url=target_url(self.profile,url);payload=b"" if body is None else body
  actual_headers={"Accept":"application/json",**(headers or {})};environment_name=self.profile.get("authorizationEnv")
  if environment_name:
   secret=os.environ.get(environment_name)
   if not secret:raise NativeError("AUTH_ENVIRONMENT","The selected host environment reference is unset.")
   actual_headers["Authorization"]=secret
  request={"method":method,"url":url,"body":retain(self.root,payload),"headers":headers or {},"authentication":"HOST_ENVIRONMENT" if environment_name else "NONE"}
  attempt={"attemptId":uuid.uuid4().hex,"workerAttemptId":self.attempt_id,"purpose":purpose,"state":"STARTED","startedAt":now(),"request":request}
  record["attempts"].append(attempt);self.save_step(record);self.save(currentStepId=record["stepId"])
  response=None
  try:
   try:
    response=self.service.execute(method,url,data=None if body is None else payload,headers=actual_headers,
     timeout=self.profile["requestTimeoutMs"]/1000.0,allow_redirects=False,stream=True)
   except Exception as error:
    response=getattr(error,"response",None)
    if response is None:raise
   selected={key.lower():str(value) for key,value in response.headers.items() if key.lower() in ("content-type","etag","location","retry-after","date","odata-version","content-encoding")}
   # A redirect is an observed response; it is never followed with credentials.
   chunks=[];size=0;complete=True
   for chunk in response.iter_content(chunk_size=65536):
    if not chunk:continue
    remaining=self.profile["maxResponseBytes"]-size
    if len(chunk)>remaining:chunks.append(chunk[:max(0,remaining)]);size+=max(0,remaining);complete=False;break
    chunks.append(chunk);size+=len(chunk)
   data=b"".join(chunks);saved={**retain(self.root,data),"complete":complete}
   retained={"status":response.status_code,"url":target_url(self.profile,response.url),"headers":selected,"body":saved,"completedAt":now(),"bodyRepresentation":"requests-decoded-entity-body"}
   attempt["response"]=retained;attempt["state"]="RESPONSE";attempt["completedAt"]=retained["completedAt"];self.save_step(record)
   return {**retained,"_bytes":data}
  except Exception as error:
   attempt["state"]="UNOBSERVED";attempt["endedAt"]=now()
   # Provider exception strings can contain URLs or headers; retain the class,
   # selected request and a fixed message instead of serializing credentials.
   attempt["error"]={"code":getattr(error,"code","NATIVE_TRANSPORT_UNOBSERVED"),"type":type(error).__name__,"message":"The original native request ended without a complete observed response."}
   self.save_step(record);raise
  finally:
   if response is not None:response.close()
 def inspect_response(self,response):
  if not response["body"]["complete"]:raise NativeError("RESPONSE_CAPACITY","The retained original response exceeded the selected byte limit.",status=response["status"])
  if not 200<=response["status"]<300:raise NativeError("HTTP_RESPONSE","The original FROST service returned an unsuccessful HTTP response.",status=response["status"],notBefore=response_wait(response["headers"]))
  try:return source_loads(response["_bytes"])
  except (ValueError,UnicodeError) as error:raise NativeError("RESPONSE_JSON","The actual native response is not valid original JSON.") from error
 def materialize(self,definition):
  body=source_loads(definition.get("bodyText","{}"));relations={}
  if not isinstance(body,dict):raise NativeError("PLAN_BODY","The reviewed native entity body is not an object.")
  for name,spec in definition.get("relations",{}).items():
   ids=[]
   for value in spec["values"]:
    identity=value.get("targetIdJson") or self.bindings.get(value.get("sourceKey"))
    if identity is None:raise NativeError("RELATION_UNRESOLVED","A preceding native relationship has no reconciled target identity.",relation=name,sourceKey=value.get("sourceKey"))
    validate_id(identity);ids.append(identity)
   related=[{"@iot.id":validate_id(identity)} for identity in ids]
   body[name]=related if spec.get("many") else related[0]
   relations[name]={"kind":spec["kind"],"many":bool(spec.get("many")),"ids":ids}
  return body,relations
 def read_target(self,record,definition,id_json,purpose):
  response=self.request(record,"GET",entity_url(self.profile,definition["entityKind"],id_json,expand=True),purpose=purpose)
  doc=self.inspect_response(response)
  if not isinstance(doc,dict):raise NativeError("TARGET_ENTITY","The native entity read returned another representation.")
  if "@iot.id" in doc and id_key(exact(doc["@iot.id"]))!=id_key(id_json):raise NativeError("TARGET_ID_CHANGED","The native response differs from the selected target identifier.")
  return doc,response
 def before_check(self,record,definition):
  before=definition.get("beforeImage")
  if not before:raise NativeError("BEFORE_IMAGE","The reviewed update/delete has no retained original target image.")
  current,response=self.read_target(record,definition,definition["targetIdJson"],"before-write")
  expected=source_loads(before["bodyText"]);body={k:v for k,v in expected.items() if k in WRITABLE[definition["entityKind"]]}
  relations={}
  for name,spec in before.get("targetRelations",{}).items():relations[name]={"ids":[v["targetIdJson"] for v in spec["values"]]}
  comparison=compare_fields(body,current,definition["entityKind"],relations,strict=True)
  if not comparison["matched"]:raise NativeError("TARGET_CHANGED","The selected target differs from its reviewed before-image.",comparison=comparison)
  return response["headers"].get("etag")
 def resolve(self,record,definition):
  pending=[x for x in self.control().get("resolutions",{}).get(record["stepId"],[]) if x["id"] not in record.get("usedResolutionIds",[])]
  if not pending:return False
  decision=pending[0];record.setdefault("usedResolutionIds",[]).append(decision["id"]);record.setdefault("resolutions",[]).append(decision);self.save_step(record)
  if decision["decision"]=="retry":
   record["state"]="QUEUED";record["error"]=None;self.save_step(record);return True
  identity=decision.get("targetIdJson");validate_id(identity)
  body,relations=self.materialize(definition);doc,response=self.read_target(record,definition,identity,"reconcile-adopt")
  expected={k:v for k,v in body.items() if k in WRITABLE[definition["entityKind"]]}
  comparison=compare_fields(expected,doc,definition["entityKind"],relations)
  record["reconciliationComparison"]=comparison
  if not comparison["matched"]:record["state"]="AWAITING_RECONCILIATION";self.save_step(record);return False
  record.update(state="COMPLETE",targetIdJson=identity,targetUrl=entity_url(self.profile,definition["entityKind"],identity),
   materializedBodyText=exact(expected),materializedRelations=relations,completedAt=now(),adoptedBy=decision["id"])
  self.bindings[definition.get("sourceKey")]=identity;self.save_step(record);return True
 def execute_step(self,definition,record):
  mode=definition["mode"]
  if mode=="inspect-root":
   response=self.request(record,"GET",self.profile["serviceUrl"],purpose="service-inspection");self.inspect_response(response)
   record.update(state="COMPLETE",completedAt=now());self.save_step(record);return
  if mode in ("inspect","verify","bind"):
   target=definition["targetIdJson"];doc,response=self.read_target(record,definition,target,mode)
   if mode=="verify":
    expected=source_loads(definition.get("expectedBodyText",definition.get("bodyText","{}")))
    record["verification"]=compare_fields(expected,doc,definition["entityKind"],definition.get("expectedRelations",{}))
   elif mode=="bind":
    body,relations=self.materialize(definition);expected={k:v for k,v in body.items() if k in WRITABLE[definition["entityKind"]]}
    comparison=compare_fields(expected,doc,definition["entityKind"],relations)
    if not comparison["matched"]:raise NativeError("BIND_TARGET_CHANGED","The selected existing target does not match the reviewed source/override fields.",comparison=comparison)
    record["verification"]=comparison;record["materializedBodyText"]=exact(expected);record["materializedRelations"]=relations
   record.update(state="COMPLETE",targetIdJson=target,targetUrl=entity_url(self.profile,definition["entityKind"],target),completedAt=now());self.bindings[definition.get("sourceKey")]=target;self.save_step(record);return
  body,relations=self.materialize(definition)
  record["materializedBodyText"]=exact({k:v for k,v in body.items() if k in WRITABLE[definition["entityKind"]]})
  record["materializedRelations"]=relations;headers={"Content-Type":"application/json"}
  if mode=="create":method="POST";url=target_url(self.profile,definition["entityKind"]);payload=exact(body).encode()
  else:
   etag=self.before_check(record,definition)
   if etag:headers["If-Match"]=etag
   url=entity_url(self.profile,definition["entityKind"],definition["targetIdJson"])
   if mode=="delete":method="DELETE";payload=None
   else:
    # Same RFC6902 operation shape and content type as the original DAO.patch.
    method="PATCH";headers["Content-Type"]="application/json-patch+json"
    payload=exact([{"op":"add","path":json_pointer(key),"value":value} for key,value in body.items()]).encode()
  response=self.request(record,method,url,payload,headers,purpose="target-write")
  self.inspect_response_status(record,response)
  target=returned_id(definition["entityKind"],response,self.profile) if mode=="create" else definition["targetIdJson"]
  if mode=="create" and target is None:raise NativeError("CREATED_ID_UNOBSERVED","The successful create response has no retained target identifier.")
  record.update(state="COMPLETE",targetIdJson=target,targetUrl=entity_url(self.profile,definition["entityKind"],target),completedAt=now())
  self.bindings[definition.get("sourceKey")]=target;self.save_step(record)
 def inspect_response_status(self,record,response):
  status=response["status"]
  if not response["body"]["complete"]:raise NativeError("RESPONSE_CAPACITY","The actual native response exceeded its selected byte capacity.",status=status)
  if 200<=status<300:return
  raise NativeError("HTTP_RESPONSE","The original target write returned an unsuccessful HTTP response.",status=status,notBefore=response_wait(response["headers"]))
 def run(self):
  runtime=selected_runtime(self.ready);self.journal["runtimeIdentity"]=runtime
  self.journal["attempts"].append({"attemptId":self.attempt_id,"startedAt":now(),"runtimeIdentity":runtime})
  self.save("RUNNING",currentStepId=None,error=None,notBefore=None)
  for definition in self.plan["steps"]:
   record=self.records[definition["stepId"]]
   if record["state"]=="COMPLETE":continue
   if self.cancelled():self.save("CANCELLED",currentStepId=None,cancelledAt=now());return
   # A previous started target write remains uncertain after process death.
   last_write=next((x for x in reversed(record["attempts"]) if x["purpose"]=="target-write"),None)
   if last_write and last_write["state"] in ("STARTED","UNOBSERVED"):record["state"]="AWAITING_RECONCILIATION";self.save_step(record)
   if record["state"]=="AWAITING_RECONCILIATION":
    if not self.resolve(record,definition):self.save("AWAITING_RECONCILIATION",currentStepId=record["stepId"]);return
    if record["state"]=="COMPLETE":continue
   not_before=record.get("notBefore")
   if not_before and dt.datetime.fromisoformat(not_before.replace("Z","+00:00"))>dt.datetime.now(dt.timezone.utc):self.save("DEFERRED",notBefore=not_before,currentStepId=record["stepId"]);return
   try:
    record["state"]="RUNNING";record["error"]=None;self.save_step(record);self.execute_step(definition,record);self.save("RUNNING",currentStepId=record["stepId"])
   except Exception as error:
    details=getattr(error,"details",{});code=getattr(error,"code","NATIVE_OPERATION_FAILED");status=details.get("status")
    last_write=next((x for x in reversed(record["attempts"]) if x["purpose"]=="target-write"),None)
    current_write=bool(record["attempts"] and record["attempts"][-1]["purpose"]=="target-write")
    observed_status=last_write.get("response",{}).get("status") if last_write else None
    unknown_write=last_write is not None and current_write and (last_write["state"] in ("STARTED","UNOBSERVED") or observed_status is not None and (200<=observed_status<300 or observed_status>=500 or observed_status==408) or code=="RESPONSE_CAPACITY")
    state="AWAITING_RECONCILIATION" if unknown_write else "DEFERRED" if status==429 else "FAILED"
    record.update(state=state,error={"code":code,"message":str(error) if isinstance(error,NativeError) else "The selected original native operation failed.","details":details},notBefore=details.get("notBefore"))
    self.save_step(record);self.save(state,currentStepId=record["stepId"],error=record["error"],notBefore=record.get("notBefore"));return
  self.save("COMPLETE",currentStepId=None,completedAt=now(),error=None)
  self.journal["attempts"][-1]["completedAt"]=self.journal["completedAt"];write_json(self.root/"journal.json",self.journal)
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--operation",required=True);parser.add_argument("--job",required=True)
 parser.add_argument("--job-sha256",required=True);parser.add_argument("--runtime-ready",required=True);args=parser.parse_args()
 root=private_directory(args.operation)
 for name in ("objects","steps"):private_directory(root/name)
 data=read_owned(args.job)
 if sha(data)!=args.job_sha256:raise NativeError("JOB_SOURCE_CHANGED","The immutable job input differs from its selected hash.")
 job=json.loads(data)
 if job.get("schema")!="stellar-forge.sensorthings-commissioning-job.v1" or not re.fullmatch(r"[a-f0-9]{64}",job.get("id","")):raise NativeError("JOB_SCHEMA","Use the original complete job input.")
 target_lock=root.parent/("target-"+sha(job["plan"]["target"]["serviceUrl"].encode())+".lock")
 fd=os.open(target_lock,os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
 job_fd=os.open(root/"lifetime.lock",os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
 try:
  try:
   fcntl.flock(job_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   print(json.dumps({"state":"OWNED_BY_ORIGINAL_WORKER","jobId":job["id"]}));return 75
  # This descriptor lives with the actual native worker even if its Node caller
  # exits. The original job/target cannot overlap its surviving provider write.
  os.set_inheritable(fd,False)
  worker=Worker(root,job,args.runtime_ready)
  signal.signal(signal.SIGTERM,lambda *_:setattr(worker,"stopped",True));signal.signal(signal.SIGINT,lambda *_:setattr(worker,"stopped",True))
  worker.run();print(json.dumps({key:worker.journal.get(key) for key in ("jobId","state","sequence","counts","completedAt","error","notBefore")},ensure_ascii=False))
  return 0 if worker.journal["state"]=="COMPLETE" else 75 if worker.journal["state"]=="DEFERRED" else 2
 finally:os.close(fd);os.close(job_fd)
if __name__=="__main__":
 try:sys.exit(main())
 except NativeError as error:
  print(json.dumps({"error":error.code,"message":str(error),"details":error.details}),file=sys.stderr);sys.exit(2)
