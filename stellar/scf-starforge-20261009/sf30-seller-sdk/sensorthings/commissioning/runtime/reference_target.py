#!/usr/bin/env python3
"""Own one private original FROST/PostGIS Compose installation and its receipt."""
from __future__ import annotations
import argparse,contextlib,fcntl,hashlib,json,os,pathlib,re,secrets,stat,subprocess,sys,time,urllib.error,urllib.request,uuid

SCHEMA="stellar-forge.frost-reference-target.v1"
UPSTREAM="https://github.com/FraunhoferIOSB/FROST-Python-Client/blob/9f41f7794725fced63fcb07e6b33dbc1f897f2bc/frost_server/docker-compose.yaml"
def digest(b):return hashlib.sha256(b).hexdigest()
def data(v):return (json.dumps(v,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode()
def private(p):
 p=pathlib.Path(p).absolute();p.mkdir(mode=0o700,parents=True,exist_ok=True);s=p.lstat()
 if p.resolve()!=p or not stat.S_ISDIR(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077:raise RuntimeError("Select an owned private canonical target directory.")
 return p
def read(p):
 fd=os.open(p,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_size>32*1024*1024:raise RuntimeError("Expected a complete retained regular file.")
  with os.fdopen(os.dup(fd),"rb") as f:b=f.read()
  end=os.fstat(fd)
  if len(b)!=s.st_size or (s.st_dev,s.st_ino,s.st_mtime_ns,s.st_ctime_ns)!=(end.st_dev,end.st_ino,end.st_mtime_ns,end.st_ctime_ns):raise RuntimeError("A retained target file changed while reading.")
  return b
 finally:os.close(fd)
def atomic(p,b,unchanged=False):
 p=pathlib.Path(p);private(p.parent)
 if unchanged and p.exists():
  if read(p)!=b:raise RuntimeError("The original target selection changed.")
  return
 q=p.with_name(p.name+"."+uuid.uuid4().hex+".tmp")
 with open(q,"xb") as f:os.chmod(q,0o600);f.write(b);f.flush();os.fsync(f.fileno())
 try:
  if unchanged:
   try:os.link(q,p)
   except FileExistsError:
    if read(p)!=b:raise RuntimeError("The original target selection changed.")
  else:os.replace(q,p)
  fd=os.open(p.parent,os.O_RDONLY)
  try:os.fsync(fd)
  finally:os.close(fd)
 finally:
  with contextlib.suppress(FileNotFoundError):q.unlink()
def iso():return time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
class Target:
 def __init__(self,args):
  self.args=args;self.root=private(args.root);self.logs=private(self.root/"logs")
  self.lock=os.open(self.root/"target.lock",os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
  fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  self.receipt=self.root/"target.json";self.compose=self.root/"compose.json";self.prepared=self.root/"prepared-target.json"
 def run(self,argv,label,timeout=180):
  ident=uuid.uuid4().hex;out=self.logs/(ident+".stdout");err=self.logs/(ident+".stderr")
  with open(out,"xb") as o,open(err,"xb") as e:
   os.chmod(out,0o600);os.chmod(err,0o600)
   child=subprocess.Popen([str(v) for v in argv],cwd=self.root,stdin=subprocess.DEVNULL,stdout=o,stderr=e,pass_fds=(self.lock,))
   try:code=child.wait(timeout=timeout)
   except subprocess.TimeoutExpired:
    child.terminate()
    try:child.wait(timeout=10)
    except subprocess.TimeoutExpired:child.kill();child.wait()
    code=124
  ob=read(out);eb=read(err)
  atomic(self.logs/(ident+".json"),data({"label":label,"observedAt":iso(),"returncode":code,"stdout":{"name":out.name,"bytes":len(ob),"sha256":digest(ob)},"stderr":{"name":err.name,"bytes":len(eb),"sha256":digest(eb)}}),True)
  if code:raise RuntimeError("Original engine command failed: "+label+"; complete private logs are retained.")
  return ob
 def compose_run(self,*argv):
  return self.run([self.args.engine,"compose","--project-name",self.selected["project"],"--file",self.compose,*argv],"compose-"+argv[0])
 def images(self,image,repository):
  if not re.fullmatch(r"sha256:[a-f0-9]{64}",image or ""):raise RuntimeError("Select an already available immutable original image ID.")
  record=json.loads(self.run([self.args.engine,"image","inspect",image],"image-inspect"))[0]
  if record.get("Id")!=image:raise RuntimeError("The engine returned another image.")
  names=record.get("RepoDigests",[])+record.get("RepoTags",[])
  if not any(re.fullmatch(r"(?:docker\.io/)?"+re.escape(repository)+r"(?::[^/]+|@sha256:[a-f0-9]{64})",n) for n in names):
   raise RuntimeError("The selected image has no retained original "+repository+" repository identity.")
  return {k:record.get(k) for k in ("Id","RepoTags","RepoDigests","Created","Os","Architecture")}
 def select(self):
  if not pathlib.Path(self.args.engine).is_absolute():raise RuntimeError("Select the actual existing Docker executable by absolute path.")
  if self.receipt.exists():
   value=json.loads(read(self.receipt))
   if value.get("schema")!=SCHEMA or value["engine"]!=self.args.engine:raise RuntimeError("Select the original target engine/receipt.")
   for arg,key in (("frost_image","frostImage"),("postgis_image","postgisImage"),("port","port")):
    requested=getattr(self.args,arg)
    if requested is not None and requested!=value[key]:raise RuntimeError("Reopen this target with its original immutable selection.")
   if digest(read(self.compose))!=value["composeSha256"]:raise RuntimeError("The original private Compose definition changed.")
   self.selected=value;return
  if self.prepared.exists():
   prepared=json.loads(read(self.prepared));value=prepared["selected"];encoded=data(prepared["compose"])
   if value.get("schema")!=SCHEMA or value["engine"]!=self.args.engine or digest(encoded)!=value["composeSha256"]:raise RuntimeError("The original prepared target differs.")
   for arg,key in (("frost_image","frostImage"),("postgis_image","postgisImage"),("port","port")):
    requested=getattr(self.args,arg)
    if requested is not None and requested!=value[key]:raise RuntimeError("Reopen the original prepared target selection.")
   atomic(self.compose,encoded,True);atomic(self.receipt,data(value),True);self.selected=value;return
  if self.args.command!="up":raise RuntimeError("This original target has not been created.")
  if not self.args.frost_image or not self.args.postgis_image:raise RuntimeError("First startup requires both actual original immutable image IDs.")
  port=self.args.port or 8784
  if not 1024<=port<=65535:raise RuntimeError("Select a private loopback TCP port from 1024 to 65535.")
  engine=json.loads(self.run([self.args.engine,"version","--format","{{json .}}"],"engine-version"))
  if not engine.get("Server"):raise RuntimeError("No actual Docker engine answered.")
  compose_version=self.run([self.args.engine,"compose","version","--short"],"compose-version").decode().strip()
  frost=self.images(self.args.frost_image,"fraunhoferiosb/frost-server")
  postgis=self.images(self.args.postgis_image,"postgis/postgis")
  ident="datacove-"+hashlib.sha256(str(self.root).encode()).hexdigest()[:20]
  origin="http://127.0.0.1:"+str(port)+"/FROST-Server";password=secrets.token_urlsafe(32)
  label={"org.tokenjunkielabs.operation":"DATACOVE-SENSORTHINGS-COMMISSIONING-0C7A-20261012","org.tokenjunkielabs.target":ident}
  compose={"services":{
   "web":{"image":self.args.frost_image,"pull_policy":"never","labels":label,"mem_limit":"1536m",
    "environment":{"serviceRootUrl":origin,"plugins_multiDatastream.enable":"true","persistence_db_driver":"org.postgresql.Driver",
     "persistence_db_url":"jdbc:postgresql://database:5432/sensorthings","persistence_db_username":"sensorthings","persistence_db_password":password,
     "persistence_autoUpdateDatabase":"true","JAVA_TOOL_OPTIONS":"-XX:MaxRAMPercentage=65.0"},
    "ports":["127.0.0.1:"+str(port)+":8080"],"depends_on":{"database":{"condition":"service_healthy"}}},
   "database":{"image":self.args.postgis_image,"pull_policy":"never","labels":label,"mem_limit":"512m",
    "environment":{"POSTGRES_DB":"sensorthings","POSTGRES_USER":"sensorthings","POSTGRES_PASSWORD":password},
    "volumes":["postgis_volume:/var/lib/postgresql/data"],
    "healthcheck":{"test":["CMD","pg_isready","-d","sensorthings","-U","sensorthings"],"interval":"2s","timeout":"2s","retries":60}}},
   "volumes":{"postgis_volume":{"labels":label}}}
  encoded=data(compose)
  selected={"schema":SCHEMA,"createdAt":iso(),"project":ident,"engine":self.args.engine,"engineVersion":engine["Server"].get("Version"),
   "composeVersion":compose_version,"frostImage":self.args.frost_image,"postgisImage":self.args.postgis_image,"images":{"frost":frost,"postgis":postgis},
   "port":port,"serviceUrl":origin+"/v1.1/","composeSha256":digest(encoded),"source":UPSTREAM,
   "realization":{"loopbackOnly":True,"nativeAuthentication":"default anonymous in this private reference only","databaseCredential":"private generated value in compose.json",
    "nativeMultiDatastream":True,"hostMqttPortPublished":False,"existingImagesOnly":True,"automaticImagePull":False,"deleteVolumeAction":False}}
  atomic(self.prepared,data({"schema":"stellar-forge.frost-reference-target-prepared.v1","selected":selected,"compose":compose}),True)
  atomic(self.compose,encoded,True);atomic(self.receipt,data(selected),True);self.selected=selected
 def containers(self):
  ids=self.compose_run("ps","--all","--quiet").decode().split()
  if not ids:return []
  values=json.loads(self.run([self.args.engine,"inspect",*ids],"owned-container-inspect"))
  out=[]
  for row in values:
   labels=row.get("Config",{}).get("Labels",{})
   if labels.get("com.docker.compose.project")!=self.selected["project"] or labels.get("org.tokenjunkielabs.target")!=self.selected["project"]:
    raise RuntimeError("The selected Compose container has another original owner.")
   out.append({"id":row["Id"],"service":labels.get("com.docker.compose.service"),"image":row.get("Image"),
    "state":{k:row.get("State",{}).get(k) for k in ("Status","Running","ExitCode","StartedAt","FinishedAt","Health")},
    "ports":row.get("NetworkSettings",{}).get("Ports",{})})
  return out
 def health(self):
  request=urllib.request.Request(self.selected["serviceUrl"],headers={"Accept":"application/json"})
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
  started=iso();body=b"";status=None;error=None
  try:
   with opener.open(request,timeout=5) as response:status=response.status;body=response.read(16*1024*1024+1)
  except urllib.error.HTTPError as response:status=response.code;body=response.read(16*1024*1024+1)
  except Exception as exc:error=type(exc).__name__
  if len(body)>16*1024*1024:raise RuntimeError("The original root response exceeds the retained read limit.")
  sha=digest(body);path=self.root/"health"/(sha+".body")
  atomic(path,body,True)
  value=None
  if status==200:
   try:value=json.loads(body)
   except (ValueError,UnicodeDecodeError):pass
  ready=isinstance(value,dict) and isinstance(value.get("value"),list) and any(x.get("name")=="Things" for x in value["value"] if isinstance(x,dict))
  record={"startedAt":started,"completedAt":iso(),"url":self.selected["serviceUrl"],"status":status,"error":error,
   "body":{"path":str(path.relative_to(self.root)),"bytes":len(body),"sha256":sha},"ready":ready}
  atomic(self.root/"health"/("read-"+uuid.uuid4().hex+".json"),data(record),True)
  return record
 def execute(self):
  self.select()
  if self.args.command=="up":
   # Exactly the selected engine/images; the server owns its normal database.
   self.compose_run("up","--detach","--no-build","--pull","never")
   deadline=time.monotonic()+self.args.startup_timeout
   while True:
    health=self.health()
    if health["ready"]:break
    if time.monotonic()>=deadline:raise RuntimeError("Original FROST startup did not become ready within the selected deadline; keep this target and its logs.")
    time.sleep(1)
   result={"state":"READY","serviceUrl":self.selected["serviceUrl"],"targetReceipt":str(self.receipt),"targetSha256":digest(read(self.receipt)),
    "project":self.selected["project"],"containers":self.containers(),"health":health}
   atomic(self.root/"target-ready.json",data(result));return result
  if self.args.command=="stop":
   self.compose_run("stop","--timeout","45")
   result={"state":"STOPPED","project":self.selected["project"],"containers":self.containers(),"databaseVolumeRetained":True}
  else:result={"state":"OBSERVED","project":self.selected["project"],"containers":self.containers(),"health":self.health()}
  atomic(self.root/("observation-"+uuid.uuid4().hex+".json"),data(result),True);return result
 def close(self):os.close(self.lock)
def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("command",choices=["up","status","stop"])
 parser.add_argument("--root",required=True);parser.add_argument("--engine",required=True)
 parser.add_argument("--frost-image");parser.add_argument("--postgis-image");parser.add_argument("--port",type=int)
 parser.add_argument("--startup-timeout",type=int,default=180)
 args=parser.parse_args()
 if not 10<=args.startup_timeout<=900:raise RuntimeError("Choose a finite original startup deadline from 10 to 900 seconds.")
 os.umask(0o077);target=Target(args)
 try:print(json.dumps(target.execute(),ensure_ascii=False))
 finally:target.close()
if __name__=="__main__":
 try:main()
 except Exception as error:print(json.dumps({"state":"FAILED","error":type(error).__name__,"message":str(error)}),file=sys.stderr);sys.exit(2)
