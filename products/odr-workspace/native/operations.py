#!/usr/bin/env python3
"""Typed JSON boundary for the original source-selected ODR workspace."""
from pathlib import Path
import argparse,sys,subprocess,zipfile
from files import *
import manage
from source import selected
REQUEST="stellar-forge.odr-operation-request.v1"
RESULT="stellar-forge.odr-operation-result.v1"
CURRENT={}
READS={"workspace.state":(),"workspace.record":("kind","id"),"workspace.history":("kind","id"),"workspace.comparison":("ids","baseline_id"),"workspace.handover":()}
FIELDS={
"source.inspect":(("application",),("application",)),
"installation.prepare":(("application","directory","node","python","handover"),("application","directory","node")),
"installation.inspect":((),()),
"installation.receive":(("archive_path","directory","node","python"),("archive_path","directory","node")),
"installation.snapshot":(("output",),("output",)),
"installation.adopt_source":(("application",),("application",)),
"workspace.receive":(("file","expected_digest"),("file","expected_digest")),
"workspace.export":(("kind","output"),("kind","output")),
"commands.describe":(("ready_file","port"),("ready_file",)),
"requests.get":(("request_id","origin_installation_id"),("request_id",))}
MUTATIONS={"installation.prepare","installation.receive","installation.snapshot","installation.adopt_source","workspace.receive","workspace.export"}
def run(request):
    exact(request,("schema","operation","arguments","installation","request_id","binding"),("schema","operation"))
    need(request["schema"]==REQUEST,"request_schema","Use the original ODR native request schema.")
    operation=request["operation"];args=request.get("arguments",{});exact(args,*( (READS[operation],READS[operation]) if operation in READS else FIELDS.get(operation,((),())) ))
    need(operation in READS or operation in FIELDS,"unknown_operation","Select a declared original workspace operation.")
    request_id=request.get("request_id")
    if operation in MUTATIONS or request_id is not None:identifier(request_id)
    root=request.get("installation");binding=request.get("binding")
    if operation not in ("source.inspect","installation.prepare","installation.receive"):need(root is not None,"installation_required","Select a complete prepared installation.")
    if root is not None and operation not in ("installation.adopt_source","workspace.receive"):manage.check_binding(manage.installation(root),binding)
    value=None
    if operation=="source.inspect":
        app,identity=selected(args["application"]);result={"source":identity,"schema":app["schema"],"manifest":app["manifest"],"files":len(app["files"])}
    elif operation=="installation.prepare":
        result=manage.prepare(application_path=args["application"],directory_path=args["directory"],node=args["node"],python=args.get("python",str(Path(sys.executable).resolve())),operation_id=request_id,handover_path=args.get("handover"));value=result["installation"]
    elif operation=="installation.receive":
        result=manage.receive(archive_path=args["archive_path"],directory_path=args["directory"],node=args["node"],python=args.get("python",str(Path(sys.executable).resolve())),operation_id=request_id);value=result["installation"]
    elif operation=="installation.inspect":result=manage.inspect(root);value=result["installation"]
    elif operation=="installation.snapshot":result=manage.snapshot(root,args["output"],request_id)
    elif operation=="installation.adopt_source":result=manage.adopt_source(root,args["application"],request_id,binding);value=result["installation"]
    elif operation=="workspace.receive":result=manage.receive_workspace(root,args["file"],args["expected_digest"],request_id,binding)
    elif operation=="workspace.export":result=manage.export_original(root,args["kind"],args["output"],request_id)
    elif operation=="commands.describe":result=manage.describe_commands(root,args)
    elif operation=="requests.get":result=manage.request_record(root,args["request_id"],args.get("origin_installation_id"))
    else:result=manage.read_business(root,operation,args)
    if value is None and root is not None:value=manage.installation(root)
    return {"schema":RESULT,"ok":True,"operation":operation,"request_id":request_id,"installation":manage.summary(value) if value else None,"result":result,"replayed":bool(isinstance(result,dict) and result.get("replayed")),"adapter_sha256":digest(Path(__file__).read_bytes())}
def main():
    global CURRENT
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--request",default="-");a=p.parse_args()
    raw=sys.stdin.buffer.read(2*1024*1024+1) if a.request=="-" else read(absolute(a.request),2*1024*1024)
    need(len(raw)<=2*1024*1024,"request_size","Select whole JSON source files by path; the native request limit is two MiB.")
    CURRENT=decode(raw);exact(CURRENT,("schema","operation","arguments","installation","request_id","binding"),("schema","operation"))
    target=CURRENT.get("arguments",{}).get("python")
    if target is None and CURRENT.get("installation"):
        target=manage.installation(CURRENT["installation"],False)["python"]["path"]
    if target and absolute(target).resolve(strict=True)!=Path(sys.executable).resolve():
        return subprocess.run([str(absolute(target).resolve()),"-B",str(Path(__file__).resolve())],input=raw).returncode
    print(encoded(run(CURRENT)).decode(),end="",flush=True);return 0
if __name__=="__main__":
    try:raise SystemExit(main())
    except (WorkbenchError,ValueError,KeyError,TypeError,OSError,EOFError,ImportError,zipfile.BadZipFile,subprocess.SubprocessError) as error:
        detail=getattr(error,"detail",{})
        print(encoded({"schema":RESULT,"ok":False,"operation":CURRENT.get("operation"),"request_id":CURRENT.get("request_id"),"error":{"code":getattr(error,"code","original_odr_operation_failed"),"message":str(error)[:2000],**{k:detail[k] for k in ("currentDigest","currentHandover") if k in detail}},"adapter_sha256":digest(Path(__file__).read_bytes())}).decode(),end="",flush=True)
        raise SystemExit(2)
