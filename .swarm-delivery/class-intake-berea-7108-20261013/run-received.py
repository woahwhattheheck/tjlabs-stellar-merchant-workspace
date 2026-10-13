"""Receive the complete 24-file Class Intake product and operate its original whole case."""
import argparse,base64,fcntl,gzip,hashlib,io,json,os,pathlib,subprocess,sys,tempfile
OP="CLASS-INTAKE-BEREA-COMPLETE-7108-20261013"
def need(v,m):
 if not v:raise ValueError(m)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(v):return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def identity(path):
 raw=path.read_bytes();return {"path":str(path),"bytes":len(raw),"sha256":digest(raw)}
def immutable(path,raw):
 if path.exists():need(path.read_bytes()==raw,"Original complete selection differs: "+str(path));return
 fd,tmp=tempfile.mkstemp(prefix="."+path.name+".",suffix=".partial",dir=path.parent)
 try:
  with os.fdopen(fd,"wb") as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
  try:os.link(tmp,path)
  except FileExistsError:need(path.read_bytes()==raw,"Concurrent complete selection differs")
 finally:pathlib.Path(tmp).unlink(missing_ok=True)
def run(frame_path,expected,config):
 os.umask(0o077);root=pathlib.Path(config["operationDirectory"]).absolute()
 need(root==root.resolve(),"Use one original absolute directory without symlink components")
 root.mkdir(parents=True,mode=0o700,exist_ok=True)
 with (root/"receiver.lock").open("a+b") as lease:
  fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  encoded=pathlib.Path(frame_path).read_bytes();need(len(encoded)<16*1024*1024,"Source frame exceeds bound")
  compressed=base64.b64decode(encoded,validate=False)
  with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as stream:raw=stream.read(32*1024*1024+1)
  need(len(raw)<32*1024*1024 and digest(raw)==expected,"Complete expanded source differs")
  packet=json.loads(raw);need(packet.get("schema")=="class-intake.complete-joined-source.v1" and len(packet["files"])==24,"Select the complete Class Intake source")
  source=root/"source";source.mkdir(mode=0o700,exist_ok=True);members={}
  for f in packet["files"]:
   rel=pathlib.PurePosixPath(f["path"]);need(not rel.is_absolute() and ".." not in rel.parts and f["path"]==rel.as_posix(),"Unsafe complete source member")
   body=f["content"].encode();need(len(body)==f["bytes"] and digest(body)==f["sha256"],"Complete source member differs")
   need(f["path"] not in members,"Repeated complete source member");members[f["path"]]=body
  for key in ("nodeExecutable","chromiumExecutable","playwrightModule"):
   value=pathlib.Path(config[key]);need(value.is_absolute() and value.is_file(),"Select an actual installed "+key)
  need(isinstance(config.get("actor"),str) and config["actor"].strip(),"Name the receiving operator")
  selection={"operation":OP,"sourceSha256":expected,"input":config,"receiver":identity(pathlib.Path(__file__).resolve()),"python":str(pathlib.Path(sys.executable).resolve())}
  immutable(root/"selection.json",canonical(selection))
  for name,body in members.items():
   target=source/name;target.parent.mkdir(parents=True,mode=0o700,exist_ok=True);immutable(target,body)
  attempts=root/"attempts";attempts.mkdir(exist_ok=True)
  def child(label,argv):
   sequence=len(list(attempts.glob(label+"-*.stdout")));out=attempts/(label+"-"+str(sequence)+".stdout");err=attempts/(label+"-"+str(sequence)+".stderr")
   with out.open("xb") as stdout,err.open("xb") as stderr:
    process=subprocess.Popen(argv,cwd=source,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,pass_fds=(lease.fileno(),),env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
    code=process.wait()
   need(code==0,label+" returned "+str(code)+"; complete log "+str(err)+"\n"+err.read_text()[-12000:])
  child("intake",[sys.executable,"-B",str(source/"operate.py"),"--output",str(root/"intake")])
  base={"outputDirectory":str(root/"intake-browser"),"sourceRoot":str(source),"coreResult":str(root/"intake/result.json"),"pythonExecutable":sys.executable,"playwrightModule":config["playwrightModule"],"chromiumExecutable":config["chromiumExecutable"]}
  base_input=root/"intake-browser-input.json";immutable(base_input,canonical(base))
  child("intake-browser",[sys.executable,"-B",str(source/"browser.py"),"--input",str(base_input),"--node",config["nodeExecutable"]])
  attendance={"outputDirectory":str(root/"attendance"),"intakeResult":str(root/"intake/result.json"),"intakeBrowserResult":str(root/"intake-browser/result.json"),"nodeExecutable":config["nodeExecutable"],
              "browser":{"chromiumExecutable":config["chromiumExecutable"],"playwrightModule":config["playwrightModule"],"actor":config["actor"]}}
  attendance_input=root/"attendance-input.json";immutable(attendance_input,canonical(attendance))
  child("attendance",[sys.executable,"-B",str(source/"attendance_complete.py"),"--input",str(attendance_input)])
  result_path=root/"attendance/complete-result.json";result=json.loads(result_path.read_bytes())
  need(result["state"]=="COMPLETE","Full operator programme has not completed")
  need(identity(pathlib.Path(result["artifact"]["path"]))==result["artifact"],"Complete delivered package changed")
  final={"operation":OP,"state":"COMPLETE","sourceSha256":expected,"artifact":result["artifact"],"completeResult":identity(result_path),"workspace":str(root/"intake/workspace")}
  immutable(root/"result.json",canonical(final));return final
if __name__=="__main__":
 p=argparse.ArgumentParser(description=__doc__);p.add_argument("--frame",required=True);p.add_argument("--sha256",required=True);p.add_argument("--input",required=True);a=p.parse_args()
 print(json.dumps(run(a.frame,a.sha256,json.loads(pathlib.Path(a.input).read_bytes())),ensure_ascii=False))
