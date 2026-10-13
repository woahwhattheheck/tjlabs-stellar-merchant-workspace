"""Run the complete attendance case and optional existing Chromium operator, then package."""
import argparse,fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,zipfile
from class_intake import Workspace,atomic,canonical,sha
HERE=pathlib.Path(__file__).resolve().parent
def identity(path):
 raw=path.read_bytes();return {"path":str(path),"bytes":len(raw),"sha256":sha(raw)}
def need(value,message):
 if not value:raise ValueError(message)
def run(config):
 os.umask(0o077);root=pathlib.Path(config["outputDirectory"]).absolute();root.mkdir(parents=True,mode=0o700,exist_ok=True)
 need(root.resolve()==root and not root.is_relative_to(HERE) and not HERE.is_relative_to(root),"Keep the original private operation beside the complete source directory")
 with (root/"complete.lock").open("a+b") as lease:
  fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
  original_path=pathlib.Path(config["intakeResult"]).absolute();original=json.loads(original_path.read_bytes())
  need(original.get("schema")=="class-intake.complete-engineering-receiving.v1" and original.get("state")=="COMPLETE","Select the original complete intake result")
  for descriptor in original["files"]:need(identity(pathlib.Path(descriptor["path"]))==descriptor,"Original complete intake member changed")
  selected_sources=[identity(path) for path in sorted(HERE.rglob("*")) if path.is_file() and not any(part in ("__pycache__",".git") for part in path.relative_to(HERE).parts)]
  base_selection={"operation":"CLASS-INTAKE-BEREA-ATTENDANCE-7108-20261013","outputDirectory":str(root),"intakeResult":identity(original_path),"workspace":original["workspace"],"source":selected_sources}
  def selected(path,value):
   if path.exists():need(json.loads(path.read_bytes())==value,"Original complete operation selection changed: "+str(path))
   else:atomic(path,canonical(value))
  selected(root/"complete-selection.json",base_selection)
  original_browser=None
  if config.get("intakeBrowserResult"):
   original_browser_path=pathlib.Path(config["intakeBrowserResult"]).absolute();original_browser=json.loads(original_browser_path.read_bytes())
   need(original_browser.get("schema")=="class-intake.browser-receiving.v1" and original_browser.get("operationId")=="CLASS-INTAKE-BEREA-BROWSER-7108-20261013" and original_browser.get("state")=="COMPLETE","Select the complete original intake browser operation")
   need(original_browser["review"]==original["sourceCase"]["id"],"The browser belongs to a different original intake")
   for descriptor in original_browser["files"]:need(identity(pathlib.Path(descriptor["path"]))==descriptor,"Original browser member changed")
   browser_selection=[x for x in original_browser["files"] if pathlib.Path(x["path"]).name=="selection.json"]
   need(len(browser_selection)==1,"Original browser source selection is absent")
   browser_input=json.loads(pathlib.Path(browser_selection[0]["path"]).read_bytes())
   need(browser_input.get("coreResult")==identity(original_path),"Original browser selected a different complete core result")
   workspace=Workspace(original["workspace"])
   try:
    view=workspace.view(original_browser["review"],original_browser["revision"])
    need(view["revision"]>=original["sourceCase"]["revision"] and len(view["derived"]["datasets"]["catalogue"])==26,"Original browser edition differs")
   finally:workspace.close()
   selected(root/"intake-browser-selection.json",{"intakeBrowserResult":identity(original_browser_path),"coreResult":identity(original_path)})
  if config.get("browser"):
   selected(root/"attendance-browser-selection.json",{"nodeExecutable":config["nodeExecutable"],"browser":config["browser"],"intakeResult":identity(original_path)})
  def child(name,argv):
   folder=root/"attempts";folder.mkdir(exist_ok=True);index=len(list(folder.glob(name+"-*.stdout")))
   out=folder/(name+"-"+str(index)+".stdout");err=folder/(name+"-"+str(index)+".stderr")
   with out.open("xb") as stdout,err.open("xb") as stderr:
    process=subprocess.Popen(argv,cwd=HERE,stdout=stdout,stderr=stderr,stdin=subprocess.DEVNULL,pass_fds=(lease.fileno(),),env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
    code=process.wait()
   if code:raise RuntimeError(name+" returned "+str(code)+"; complete stderr: "+str(err)+"\n"+err.read_text()[-12000:])
  child("core",[sys.executable,"-B",str(HERE/"attendance_operate.py"),"--output",str(root/"core"),"--intake-result",str(pathlib.Path(config["intakeResult"]).absolute())])
  core_path=root/"core/result.json";core=json.loads(core_path.read_bytes());need(core["state"]=="COMPLETE","Original core did not complete")
  groups={"intake":[identity(original_path),*original["files"]],"core":[identity(core_path),*core["files"]]}
  if original_browser is not None:
   groups["intake-browser"]=[identity(original_browser_path),*original_browser["files"]]
  if config.get("browser"):
   browser={**config["browser"],"outputDirectory":str(root/"browser"),"coreResult":str(core_path),"pythonExecutable":str(pathlib.Path(sys.executable).resolve())}
   browser_input=root/"browser-input.json"
   if browser_input.exists():need(json.loads(browser_input.read_bytes())==browser,"Retain the same browser input and operation")
   else:atomic(browser_input,canonical(browser))
   child("browser",[config["nodeExecutable"],str(HERE/"attendance_browser.mjs"),str(browser_input)])
   browser_result=root/"browser/result.json";observed=json.loads(browser_result.read_bytes());need(observed["state"]=="COMPLETE","Original browser did not complete")
   groups["browser"]=[identity(browser_result),*observed["files"]]
  members={}
  for role,files in groups.items():
   for descriptor in files:
    path=pathlib.Path(descriptor["path"]);need(identity(path)==descriptor,"Original returned output changed")
    name=role+"/"+path.name;need(name not in members,"Duplicate delivery member");members[name]=path.read_bytes()
  for path in sorted(HERE.rglob("*")):
   if path.is_file() and not any(part in ("__pycache__",".git") for part in path.relative_to(HERE).parts):
    name="application/"+path.relative_to(HERE).as_posix();members[name]=path.read_bytes()
  state="COMPLETE" if "browser" in groups else "CORE_COMPLETE"
  manifest={"schema":"class-intake.attendance-handover.v1","state":state,
            "operation":"CLASS-INTAKE-BEREA-ATTENDANCE-7108-20261013",
            "files":[{"path":name,"bytes":len(raw),"sha256":sha(raw)} for name,raw in sorted(members.items())]}
  members["manifest.json"]=canonical(manifest)
  output=root/("Class_Attendance_Complete_Operator_"+sha(canonical(manifest))[:12]+".zip")
  fd,tmp=tempfile.mkstemp(prefix=".attendance-handover-",suffix=".partial",dir=root);os.close(fd)
  with zipfile.ZipFile(tmp,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
   for name,raw in sorted(members.items()):
    info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100600<<16;archive.writestr(info,raw)
  with zipfile.ZipFile(tmp) as archive:
   need(set(archive.namelist())==set(members) and len(archive.namelist())==len(members),"Handover members differ")
   for name,raw in members.items():need(archive.read(name)==raw,"Complete handover changed: "+name)
  if output.exists():
   need(output.read_bytes()==pathlib.Path(tmp).read_bytes(),"Original completed handover differs");pathlib.Path(tmp).unlink()
  else:os.link(tmp,output);pathlib.Path(tmp).unlink()
  result={"operation":manifest["operation"],"state":state,"artifact":identity(output),"core":core,"browser":observed if "browser" in groups else None}
  atomic(root/"complete-result.json",canonical(result));return result
if __name__=="__main__":
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--input",required=True);a=parser.parse_args()
 print(json.dumps(run(json.loads(pathlib.Path(a.input).read_bytes())),ensure_ascii=False))
