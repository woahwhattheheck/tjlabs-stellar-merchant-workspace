#!/usr/bin/env python3
"""Install/reopen the exact original FROST client for one commissioning host."""
from __future__ import annotations
import argparse, contextlib, fcntl, hashlib, json, os, pathlib, shutil, stat, subprocess, sys, time, uuid

HERE=pathlib.Path(__file__).resolve().parent
SCHEMA="stellar-forge.frost-client-runtime.v1"
def digest(data):return hashlib.sha256(data).hexdigest()
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2,sort_keys=True)+"\n").encode()
def git_blob(data):return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
def private(path):
 p=pathlib.Path(path).absolute();p.mkdir(parents=True,exist_ok=True,mode=0o700)
 st=p.lstat()
 if p.resolve()!=p or not stat.S_ISDIR(st.st_mode) or st.st_uid!=os.getuid() or st.st_mode&0o077:raise RuntimeError("Use an owned private canonical operation directory: "+str(p))
 return p
def read_file(path,maximum=64*1024*1024):
 p=pathlib.Path(path);fd=os.open(p,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_size>maximum:raise RuntimeError("Expected a complete regular source file.")
  with os.fdopen(os.dup(fd),"rb") as inp:data=inp.read(maximum+1)
  after=os.fstat(fd)
  if len(data)!=before.st_size or (before.st_dev,before.st_ino,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_mtime_ns,after.st_ctime_ns):raise RuntimeError("Source changed while reading.")
  return data
 finally:os.close(fd)
def sync(path):
 fd=os.open(path,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def atomic(path,data):
 p=pathlib.Path(path);private(p.parent);q=p.with_name(p.name+"."+uuid.uuid4().hex+".tmp")
 fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 try:
  with os.fdopen(fd,"wb") as out:out.write(data);out.flush();os.fsync(out.fileno())
  os.replace(q,p);sync(p.parent)
 finally:
  with contextlib.suppress(FileNotFoundError):q.unlink()
def immutable(path,data):
 p=pathlib.Path(path)
 try:
  if read_file(p,max(len(data),1))!=data:raise RuntimeError("The selected immutable source changed: "+str(p))
 except FileNotFoundError:
  private(p.parent);q=p.with_name(p.name+"."+uuid.uuid4().hex+".tmp")
  fd=os.open(q,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  try:
   with os.fdopen(fd,"wb") as out:out.write(data);out.flush();os.fsync(out.fileno())
   try:os.link(q,p);sync(p.parent)
   except FileExistsError:
    if read_file(p,max(len(data),1))!=data:raise RuntimeError("The original immutable source changed.")
  finally:
   with contextlib.suppress(FileNotFoundError):q.unlink()
def relative(value):
 p=pathlib.PurePosixPath(value)
 if not value or p.is_absolute() or any(x in ("",".","..") for x in p.parts) or "\\" in value or ":" in value:raise RuntimeError("Unsafe original source member.")
 return p
def source_manifest():
 data=read_file(HERE/"frost-source.json");value=json.loads(data)
 if value.get("schema")!="stellar-forge.frost-client-source.v1" or value.get("version")!="1.1.53" or value.get("commit")!="9f41f7794725fced63fcb07e6b33dbc1f897f2bc":raise RuntimeError("Choose the original pinned FROST client manifest.")
 rows=value.get("files")
 if not isinstance(rows,list) or not rows or len({x["path"] for x in rows})!=len(rows):raise RuntimeError("Incomplete original source inventory.")
 for row in rows:relative(row["path"])
 return value,data
def checked_source(root,rows):
 records=[]
 for row in rows:
  p=root/relative(row["path"]);data=read_file(p)
  if len(data)!=row["bytes"] or git_blob(data)!=row["gitBlob"]:raise RuntimeError("Original FROST source differs: "+row["path"])
  records.append({**row,"sha256":digest(data)})
 return records
class Installer:
 def __init__(self,root,manifest,manifest_bytes):
  self.root=root;self.manifest=manifest;self.manifest_bytes=manifest_bytes
  self.logs=private(root/"logs");self.tmp=private(root/"tmp")
  self.lock_fd=os.open(root/"install.lock",os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
  fcntl.flock(self.lock_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  self.env={**os.environ,"TMPDIR":str(self.tmp),"PYTHONUNBUFFERED":"1","PIP_DISABLE_PIP_VERSION_CHECK":"1"}
  self.source=root/"upstream"/"FROST-Python-Client";self.venv=root/"venv";self.python=self.venv/"bin"/"python"
 def command(self,args,label,cwd=None):
  attempt=uuid.uuid4().hex;out=self.logs/(label+"-"+attempt+".stdout");err=self.logs/(label+"-"+attempt+".stderr")
  with open(out,"xb") as stdout,open(err,"xb") as stderr:
   os.chmod(out,0o600);os.chmod(err,0o600)
   # The original lock survives caller replacement until the actual child exits.
   child=subprocess.Popen([str(x) for x in args],cwd=str(cwd or self.root),env=self.env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,pass_fds=(self.lock_fd,))
   code=child.wait()
  receipt={"label":label,"attemptId":attempt,"returncode":code,"stdout":{"name":out.name,"bytes":out.stat().st_size,"sha256":digest(read_file(out))},"stderr":{"name":err.name,"bytes":err.stat().st_size,"sha256":digest(read_file(err))}}
  immutable(self.logs/(label+"-"+attempt+".json"),encoded(receipt))
  if code:raise RuntimeError("Original runtime step failed: "+label+"; retained logs identify the actual result.")
  return read_file(out)
 def materialize(self,args):
  selected=private(self.source);source_rows=self.manifest["files"]
  if args.upstream_source:
   provided=pathlib.Path(args.upstream_source).absolute()
   if provided.resolve()!=provided or not provided.is_dir():raise RuntimeError("Use the actual original source directory.")
   checked_source(provided,source_rows)
   for row in source_rows:immutable(selected/relative(row["path"]),read_file(provided/relative(row["path"])))
  elif args.git_cache:
   # Local exact objects only. This route does not fetch a provider or move a ref.
   cache=pathlib.Path(args.git_cache).absolute()
   for row in source_rows:
    data=self.command(["git","-C",cache,"cat-file","blob",row["gitBlob"]],"git-source")
    if len(data)!=row["bytes"] or git_blob(data)!=row["gitBlob"]:raise RuntimeError("Existing Git cache returned another source blob.")
    immutable(selected/relative(row["path"]),data)
  elif args.source_capsule:
   capsule=json.loads(read_file(args.source_capsule,16*1024*1024))
   if capsule.get("commit")!=self.manifest["commit"] or not isinstance(capsule.get("files"),dict):raise RuntimeError("Select the original full source capsule.")
   for row in source_rows:
    text=capsule["files"].get(row["path"])
    if not isinstance(text,str):raise RuntimeError("The source capsule omits "+row["path"])
    data=text.encode()
    if len(data)!=row["bytes"] or git_blob(data)!=row["gitBlob"]:raise RuntimeError("The source capsule changed "+row["path"])
    immutable(selected/relative(row["path"]),data)
  else:
   # Reopen an already materialized original source, without reacquiring it.
   checked_source(selected,source_rows)
  records=checked_source(selected,source_rows)
  immutable(self.root/"original-source-manifest.json",encoded({**self.manifest,"files":records}))
  return records
 def inspect(self):
  code=r"""
import hashlib,importlib.metadata,json,os,pathlib,sys
import frost_sta_client
from frost_sta_client.service.sensorthingsservice import SensorThingsService
root=pathlib.Path(frost_sta_client.__file__).resolve().parent
files=[]
for path in sorted(root.rglob("*.py")):
 if "__pycache__" in path.parts:continue
 data=path.read_bytes();files.append({"path":path.relative_to(root).as_posix(),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()})
distributions=[]
for dist in importlib.metadata.distributions():
 name=dist.metadata.get("Name")
 if name:distributions.append({"name":name,"version":dist.version})
print(json.dumps({"python":os.path.abspath(sys.executable),"pythonVersion":sys.version,"version":importlib.metadata.version("frost-sta-client"),"packageRoot":str(root),"files":files,"distributions":sorted(distributions,key=lambda x:x["name"].lower()),"executeCallable":callable(SensorThingsService.execute)},ensure_ascii=False))
"""
  value=json.loads(self.command([self.python,"-c",code],"runtime-inspect"))
  if value["python"]!=str(self.python) or value["version"]!=self.manifest["version"] or not value["executeCallable"]:raise RuntimeError("The actual selected FROST environment differs.")
  expected={x["path"].removeprefix("frost_sta_client/"):x for x in self.manifest["files"] if x["path"].startswith("frost_sta_client/")}
  if set(expected)!=set(x["path"] for x in value["files"]):raise RuntimeError("The installed FROST package source inventory differs.")
  for row in value["files"]:
   original=read_file(self.source/"frost_sta_client"/relative(row["path"]))
   if row["bytes"]!=len(original) or row["sha256"]!=digest(original):raise RuntimeError("The installed original client source changed.")
  return value
 def ready(self,args):
  receipt_path=self.root/"runtime-ready.json"
  if receipt_path.exists():
   prior=json.loads(read_file(receipt_path));checked_source(self.source,self.manifest["files"])
   if prior.get("schema")!=SCHEMA or prior.get("sourceManifestSha256")!=digest(self.manifest_bytes):raise RuntimeError("The existing runtime selects another source.")
   actual=self.inspect()
   if prior["python"]!=actual["python"] or prior["native"]["packageRoot"]!=actual["packageRoot"] or prior["native"]["files"]!=actual["files"] or prior["distributions"]!=actual["distributions"]:raise RuntimeError("The ready environment changed; select a new private installation.")
   return prior
  if not any((args.upstream_source,args.git_cache,args.source_capsule)) and not self.source.exists():
   args.source_capsule=str(HERE/"frost-upstream-source.json")
  rows=self.materialize(args)
  if not self.python.exists():
   self.command([sys.executable,"-m","venv",self.venv],"venv")
  report=self.root/"pip-install-report.json"
  install=[self.python,"-m","pip","install","--disable-pip-version-check","--no-input","--report",report,"-c",self.source/"requirements.txt"]
  if args.wheelhouse:
   wheelhouse=pathlib.Path(args.wheelhouse).absolute()
   if not wheelhouse.is_dir():raise RuntimeError("The existing wheelhouse is unavailable.")
   install.extend(["--no-index","--find-links",wheelhouse])
  install.append(self.source)
  self.command(install,"original-client-install",cwd=self.source)
  actual=self.inspect()
  constraints="\n".join(x["name"]+"=="+x["version"] for x in actual["distributions"])+"\n"
  immutable(self.root/"resolved-constraints.txt",constraints.encode())
  # Provider/package-manager raw logs stay local. The portable runtime identity
  # carries exact original sources and selected versions, with no registry auth.
  reproduction={"schema":"stellar-forge.frost-client-reproduction.v1","repository":self.manifest["repository"],"commit":self.manifest["commit"],"version":self.manifest["version"],
   "files":rows,"distributions":actual["distributions"],"constraintsSha256":digest(constraints.encode()),"pythonVersion":actual["pythonVersion"]}
  immutable(self.root/"reproduction.json",encoded(reproduction))
  ready={"schema":SCHEMA,"python":actual["python"],"pythonVersion":actual["pythonVersion"],"sourceManifestSha256":digest(self.manifest_bytes),
   "native":{"repository":self.manifest["repository"],"commit":self.manifest["commit"],"version":self.manifest["version"],"sourceRoot":str(self.source),
    "sourceFiles":rows,"packageRoot":actual["packageRoot"],"files":actual["files"]},"distributions":actual["distributions"],
   "reproduction":{"path":str(self.root/"reproduction.json"),"sha256":digest(encoded(reproduction))},
   "constraints":{"path":str(self.root/"resolved-constraints.txt"),"sha256":digest(constraints.encode())},
   "operator":{"environmentNames":["SENSORTHINGS_FROST_PYTHON","SENSORTHINGS_FROST_RUNTIME_READY"],"readyPath":str(receipt_path)}}
  immutable(receipt_path,encoded(ready));return ready
 def close(self):os.close(self.lock_fd)
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--root",required=True);sources=parser.add_mutually_exclusive_group()
 sources.add_argument("--upstream-source");sources.add_argument("--git-cache");sources.add_argument("--source-capsule")
 parser.add_argument("--wheelhouse",help="Existing original package cache for an offline native install.")
 args=parser.parse_args()
 if sys.version_info[:2]!=(3,12):raise RuntimeError("Use the selected CPython 3.12 bootstrap; its private venv path remains the evaluator authority.")
 os.umask(0o077);root=private(args.root);manifest,data=source_manifest();runner=Installer(root,manifest,data)
 try:
  result=runner.ready(args)
  print(json.dumps({"state":"READY","python":result["python"],"ready":result["operator"]["readyPath"],"nativeCommit":result["native"]["commit"],
   "nativeVersion":result["native"]["version"],"sourceFiles":len(result["native"]["sourceFiles"]),"installedDistributions":len(result["distributions"])},ensure_ascii=False))
 finally:runner.close()
if __name__=="__main__":
 try:main()
 except Exception as error:
  print(json.dumps({"state":"FAILED","error":type(error).__name__,"message":str(error)},ensure_ascii=False),file=sys.stderr);sys.exit(2)
