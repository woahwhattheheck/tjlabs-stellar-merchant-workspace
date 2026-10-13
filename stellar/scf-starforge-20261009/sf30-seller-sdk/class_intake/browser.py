"""Own one browser lifetime and deterministically publish its complete retained handback."""
import argparse,fcntl,hashlib,io,json,os,pathlib,subprocess,zipfile
def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()
def digest(raw):return hashlib.sha256(raw).hexdigest()
def descriptor(path):
 path=pathlib.Path(path).resolve();raw=path.read_bytes();return {"path":str(path),"bytes":len(raw),"sha256":digest(raw)}
def immutable(path,raw):
 path=pathlib.Path(path)
 if path.exists():
  if path.read_bytes()!=raw:raise ValueError("Original retained selection differs: "+str(path))
  return
 stage=path.with_name(path.name+".publication.partial")
 if stage.exists():
  prior=stage.read_bytes()
  if not raw.startswith(prior):raise ValueError("Original retained partial differs: "+str(stage))
 else:prior=b""
 with stage.open("ab") as out:out.write(raw[len(prior):]);out.flush();os.fsync(out.fileno())
 try:os.link(stage,path)
 except FileExistsError:
  if path.read_bytes()!=raw:raise ValueError("Concurrent original selection differs")
 stage.unlink()
 parent=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(parent)
 finally:os.close(parent)
def read_member(item):
 raw=pathlib.Path(item["path"]).read_bytes()
 if "member" in item:
  with zipfile.ZipFile(io.BytesIO(raw)) as original:raw=original.read(item["member"])
 if len(raw)!=item["bytes"] or digest(raw)!=item["sha256"]:raise ValueError("Original package member changed: "+item["name"])
 return raw
def verify_closed(root,selection):
 receipt=json.loads((root/"complete-handover.json").read_text())
 selected=json.loads((root/"package-members.json").read_text())
 if receipt.get("schema")!="class-intake.complete-browser-handback.v1" or receipt.get("state")!="COMPLETE" or receipt.get("path")!=str(root/"Class_Intake_Complete_Browser_Handback.zip"):raise ValueError("Invalid completed package receipt")
 if receipt["selectionSha256"]!=digest(canonical(selection)) or receipt["membersSha256"]!=digest(canonical(selected)):raise ValueError("Completed package selection changed")
 for member in selected["members"]:read_member(member)
 if descriptor(receipt["path"])!={k:receipt[k] for k in ("path","bytes","sha256")}:raise ValueError("Completed archive changed")
 return receipt
def main():
 p=argparse.ArgumentParser();p.add_argument("--input",required=True);p.add_argument("--node",required=True);a=p.parse_args()
 input_path=pathlib.Path(a.input).resolve();config=json.loads(input_path.read_text());root=pathlib.Path(config["outputDirectory"]).resolve();root.mkdir(parents=True,exist_ok=True)
 with (root/".browser-owner.lock").open("a+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  selection={"schema":"class-intake.browser-package-selection.v1","input":config,"inputFile":descriptor(input_path),"coreResult":descriptor(config["coreResult"]),"node":a.node,"receiver":[descriptor(pathlib.Path(__file__).with_name(name)) for name in ("browser.py","browser.mjs")]}
  immutable(root/"browser-package-input.json",canonical(selection))
  if (root/"complete-handover.json").exists():print(json.dumps(verify_closed(root,selection)),flush=True);return
  stdout=root/"browser.stdout";stderr=root/"browser.stderr"
  if not (root/"package-members.json").exists():
   with stdout.open("ab",buffering=0) as out,stderr.open("ab",buffering=0) as err:
    child=subprocess.Popen([a.node,str(pathlib.Path(__file__).with_name("browser.mjs")),str(input_path)],stdout=out,stderr=err,pass_fds=(lock.fileno(),),env={**os.environ,"PYTHONDONTWRITEBYTECODE":"1"})
    code=child.wait()
   if code:
    print(json.dumps({"exitCode":code,"stdout":str(stdout),"stderr":str(stderr)}),flush=True);raise SystemExit(code)
   result=json.loads((root/"result.json").read_text());core=json.loads(pathlib.Path(config["coreResult"]).read_text())
   if result["state"]!="COMPLETE" or core["state"]!="COMPLETE":raise ValueError("Full core and browser results are required")
   if descriptor(config["coreResult"])!=selection["coreResult"]:raise ValueError("Complete core result changed")
   members=[]
   def add(name,path,member=None):
    path=pathlib.Path(path).resolve();raw=path.read_bytes()
    if member is not None:
     with zipfile.ZipFile(io.BytesIO(raw)) as original:raw=original.read(member)
    members.append({"name":name,"path":str(path),"bytes":len(raw),"sha256":digest(raw),**({"member":member} if member is not None else {})})
   add("core/result.json",config["coreResult"]);add("browser/result.json",root/"result.json")
   for section,items in (("core",core["files"]),("browser",result["files"])):
    for item in items:
     path=pathlib.Path(item["path"])
     if descriptor(path)!=item:raise ValueError("Retained original descriptor differs")
     add(section+"/"+path.name,path)
     if path.name.endswith(".zip"):
      with zipfile.ZipFile(path) as original:
       names=original.namelist()
       if len(names)!=len(set(names)):raise ValueError("Repeated original archive member")
       for member in original.infolist():
        if member.is_dir():continue
        rel=pathlib.PurePosixPath(member.filename)
        if rel.is_absolute() or ".." in rel.parts:raise ValueError("Unsafe retained archive")
        add(section+"/expanded/"+path.stem+"/"+member.filename,path,member.filename)
   for name in ("browser.py","browser.mjs"):add("source/"+name,pathlib.Path(__file__).with_name(name))
   for name in ("browser.stdout","browser.stderr","browser-package-input.json"):add("receiving/"+name,root/name)
   if len({m["name"] for m in members})!=len(members):raise ValueError("Duplicate final package name")
   selected={"schema":"class-intake.browser-package-members.v1","selectionSha256":digest(canonical(selection)),"members":sorted(members,key=lambda m:m["name"])}
   immutable(root/"package-members.json",canonical(selected))
  else:selected=json.loads((root/"package-members.json").read_text())
  if selected["selectionSha256"]!=digest(canonical(selection)):raise ValueError("Original package intent differs")
  buffer=io.BytesIO()
  with zipfile.ZipFile(buffer,"w",zipfile.ZIP_DEFLATED) as archive:
   for member in selected["members"]:
    info=zipfile.ZipInfo(member["name"],(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100644<<16
    archive.writestr(info,read_member(member))
  raw=buffer.getvalue();final=root/"Class_Intake_Complete_Browser_Handback.zip";immutable(final,raw)
  receipt={"schema":"class-intake.complete-browser-handback.v1","state":"COMPLETE",**descriptor(final),"selectionSha256":digest(canonical(selection)),"membersSha256":digest(canonical(selected)),"browser":json.loads((root/"result.json").read_text()),"core":json.loads(pathlib.Path(config["coreResult"]).read_text())}
  immutable(root/"complete-handover.json",canonical(receipt))
  print(json.dumps(verify_closed(root,selection)),flush=True)
if __name__=="__main__":main()
