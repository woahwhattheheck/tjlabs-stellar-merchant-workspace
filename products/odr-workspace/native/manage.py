"""Source-selected ODR installations; original core owns the whole workspace."""
from __future__ import annotations
from datetime import datetime,timezone
import os,sys,uuid
from pathlib import Path
from files import *
from source import *
INSTALL_SCHEMA="stellar-forge.odr-installation.v1"
SNAPSHOT_SCHEMA="stellar-forge.odr-installation-archive.v1"
SOURCE_ROOT=Path(__file__).resolve().parent
def now():return datetime.now(timezone.utc).isoformat()
def input_file(path):return {k:v for k,v in file_identity(path).items() if k in ("path","bytes","sha256")}
def python_selection(path):
    p=absolute(path).resolve(strict=True);v=file_identity(p);need(os.access(p,os.X_OK),"python_executable","Select an installed Python interpreter.")
    result=subprocess.run([str(p),"-c","import sys;print('.'.join(map(str,sys.version_info[:3])))"],capture_output=True,text=True,timeout=30)
    need(result.returncode==0 and tuple(map(int,result.stdout.strip().split(".")))>=(3,10),"python_version","Python 3.10 or later is required.")
    return {"path":str(p),"version":result.stdout.strip(),"sha256":v["sha256"],"bytes":v["bytes"]}
def installation(path,verify=True):
    root=directory(path,private=True);value=read_json(root/"installation.json")
    need(value.get("schema")==INSTALL_SCHEMA and value.get("directory")==str(root),"installation_changed","Select the complete original installation.")
    identifier(value["installation_id"]);need(value.get("workspace")==str(root/"workspace"),"workspace_changed","Keep the original inner workspace location.")
    if verify:read_edition(root,value["source_identity"]);verify_node(value["node"])
    return value
def summary(value):
    root=Path(value["directory"]);edition,app,_=read_edition(root,value["source_identity"]);info=root.stat()
    return {"installation_id":value["installation_id"],"operation_id":value["operation_id"],"source_identity":value["source_identity"],"workspace_id":value["workspace_id"],"python":value["python"],"node":value["node"],"paths":{"directory":str(root),"source":str(edition/"source"),"application":str(edition/"source"),"workspace":value["workspace"],"bridge":str(edition/"bridge"),"html":str(edition/"built"/"ODR_Alpha_Workbench.html")},"binding":{"directory":str(root),"device":str(info.st_dev),"inode":str(info.st_ino)},"received_from":value.get("received_from")}
def check_binding(value,binding):
    if binding is None:return
    exact(binding,("installation_id","source_identity"),("installation_id","source_identity"))
    need(all(value[k]==binding[k] for k in binding),"installation_changed","Inspect the original installation and source before operating it.")
def selected_engine(root,value,operation,args=None):
    return engine(Path(root),value["source_identity"],value["node"],operation,{"directory":str(root),**(args or {})})
def journal(root,op,kind,request):
    target=directory(root/"operations"/identifier(op),create=True,private=True)
    once(target/"REQUEST.json",encoded({"schema":"stellar-forge.odr-lifecycle-request.v1","operation_id":op,"kind":kind,"request":request}))
    return target
def finish(path,result):once(path/"RESULT.json",encoded(result));return result
def commit(root,path,result,handover=None):
    if handover is not None:
        if (path/"TARGET_HANDOVER.json").exists():need(read_json(path/"TARGET_HANDOVER.json",MAX_SOURCE_BYTES)==handover,"handover_changed","The retained transition handover differs.")
        else:once(path/"TARGET_HANDOVER.json",encoded(handover))
    once(path/"COMMIT.json",encoded(result))
    if handover is not None:save(root/"workspace"/"CURRENT.json",handover)
    save(root/"installation.json",result["installation"])
    return finish(path,result)
def replay(root,op,kind,selection):
    path=root/"operations"/identifier(op)
    if not (path/"REQUEST.json").exists():return None
    record=read_json(path/"REQUEST.json");request=record["request"]
    need(record["kind"]==kind and request["selection"]==selection,"operation_conflict","Keep the exact original operation and selected inputs.")
    result=read_json(path/"RESULT.json") if (path/"RESULT.json").exists() else None
    if result is None and (path/"COMMIT.json").exists():
        result=read_json(path/"COMMIT.json");target=result["installation"];read_edition(root,target["source_identity"])
        need(target["directory"]==str(root),"installation_changed","The retained transition identifies another directory.")
        if (root/"installation.json").exists():
            current=installation(root,False);before=read_json(path/"BEFORE.json") if (path/"BEFORE.json").exists() else None
            need(current==target or kind=="adopt_source" and current==before,"installation_changed","Receive the exact retained original source transition.")
        if (path/"TARGET_HANDOVER.json").exists():
            handover=read_json(path/"TARGET_HANDOVER.json",MAX_SOURCE_BYTES)
            # Source adoption is serialized by the operator lease. A completed
            # marker must never overwrite any later browser edition.
            if not (root/"installation.json").exists() or read_json(root/"installation.json")!=target:
                save(root/"workspace"/"CURRENT.json",handover)
        save(root/"installation.json",target);selected_engine(root,target,"inspect")
        finish(path,result)
    if result is None:return None
    if result.get("installation"):
        current=installation(root);need(current["installation_id"]==result["installation"]["installation_id"],"installation_changed","The directory belongs to another installation.")
        selected_engine(root,current,"inspect")
    for key in ("application","handover","archive"):
        original=request.get(key)
        if original and Path(original["path"]).exists():need(input_file(original["path"])==original,"input_changed","A surviving selected original input changed: "+key)
    if request.get("archive"):
        retained=input_file(root/"inputs"/"Original_Installation.zip")
        need(retained["sha256"]==request["archive"]["sha256"] and retained["bytes"]==request["archive"]["bytes"],"archive_changed","The retained complete original archive changed.")
    if result.get("archive"):need(input_file(result["archive"]["path"])==result["archive"],"output_changed","The complete output changed.")
    return {**result,"replayed":True}
def prepare(*,application_path,directory_path,node,python,operation_id,handover_path=None):
    root=directory(directory_path,create=True,private=True)
    selection={"application":str(absolute(application_path)),"handover":str(absolute(handover_path)) if handover_path else None,"node":str(absolute(node)),"python":str(absolute(python))}
    with locked(root/"installation.lock"):
        prior=replay(root,operation_id,"prepare",selection)
        if prior:return prior
        app,identity=selected(application_path);bridge=bridge_manifest(SOURCE_ROOT);sid=source_id(app,bridge);chosen_node=node_selection(node);chosen_python=python_selection(python)
        request={"selection":selection,"application":identity,"handover":input_file(handover_path) if handover_path else None,"source_identity":sid}
        path=journal(root,operation_id,"prepare",request)
        need(not (root/"installation.json").exists(),"installation_exists","Select an empty installation or receive the original named operation.")
        once(root/"CREATION.json",encoded({"operation_id":operation_id,"kind":"prepare","request_sha256":digest(encoded(request))}))
        materialize(root,app,SOURCE_ROOT,bridge);build(root,sid,chosen_node)
        if handover_path:copy_file(handover_path,root/"inputs"/"Original_Handover.json",request["handover"])
        target=path/"TARGET_HANDOVER.json"
        if not target.exists():
            engine(root,sid,chosen_node,"initialize",{"handover":str(root/"inputs"/"Original_Handover.json") if handover_path else None,"output":str(target)})
        handover=read_json(target,MAX_SOURCE_BYTES);directory(root/"workspace",create=True,private=True)
        value={"schema":INSTALL_SCHEMA,"installation_id":str(uuid.uuid4()),"operation_id":operation_id,"created_at":now(),"directory":str(root),"source_identity":sid,"source_history":[sid],"workspace_id":handover["workspace"]["id"],"workspace":str(root/"workspace"),"node":chosen_node,"python":chosen_python,"received_from":None}
        result=commit(root,path,{"installation":value,"replayed":False},handover)
        selected_engine(root,value,"inspect");return result
def inspect(root):
    value=installation(root);return {"installation":value,"workspace":selected_engine(root,value,"inspect"),"source_history":value["source_history"]}
def read_business(root,operation,args):
    value=installation(root);return selected_engine(root,value,operation,args)
def receive_workspace(root,file,expected_digest,op,binding=None):
    root=directory(root,private=True);selection={"file":str(absolute(file)),"expected_digest":expected_digest,"binding":binding}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"workspace.receive",selection)
        if prior:return prior
        value=installation(root);check_binding(value,binding);path=root/"operations"/identifier(op)
        if (path/"REQUEST.json").exists():
            saved=read_json(path/"REQUEST.json");need(saved["kind"]=="workspace.receive" and saved["request"]["selection"]==selection,"operation_conflict","Keep the exact original receiving request.");identity=saved["request"]["handover"]
            if Path(file).exists():need(input_file(file)==identity,"input_changed","The selected original handover changed.")
        else:identity=input_file(file)
        path=journal(root,op,"workspace.receive",{"selection":selection,"handover":identity,"source_identity":value["source_identity"]})
        retained=path/"INPUT_HANDOVER.json"
        if retained.exists():
            actual=input_file(retained);need(actual["bytes"]==identity["bytes"] and actual["sha256"]==identity["sha256"],"input_changed","Retained original receiving bytes changed.")
        else:copy_file(file,retained,identity)
        receipt=selected_engine(root,value,"workspace.receive",{"file":str(retained),"expected_digest":expected_digest})
        return finish(path,{"receipt":receipt,"workspace_id":value["workspace_id"],"replayed":False})
def export_original(root,kind,output,op):
    root=directory(root,private=True);output=absolute(output);selection={"kind":kind,"output":str(output)}
    need(kind in ("workspace","report","application"),"export_kind","Select whole workspace, report or application source.")
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"export",selection)
        if prior:return prior
        value=installation(root);path=journal(root,op,"export",{"selection":selection,"source_identity":value["source_identity"]})
        stage=path/("Original_Report.md" if kind=="report" else "Original_"+kind+".json")
        if not stage.exists():selected_engine(root,value,"workspace.export",{"kind":kind,"output":str(stage)})
        info=input_file(stage);once(path/"OUTPUT.json",encoded(info));copy_file(stage,output,info)
        return finish(path,{"archive":input_file(output),"kind":kind,"workspace_id":value["workspace_id"],"replayed":False})
def operation_rows(root):
    rows=[]
    for row in inventory(root):
        parts=Path(row["path"]).parts
        if len(parts)==2 and parts[1] in ("REQUEST.json","RESULT.json","COMMIT.json","BEFORE.json","BEFORE_HANDOVER.json","TARGET_HANDOVER.json","INPUT_HANDOVER.json","OUTPUT.json"):rows.append(row)
    return rows
def snapshot(root,output,op):
    root=directory(root,private=True);output=absolute(output);selection={"output":str(output)}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"snapshot",selection)
        if prior:return prior
        value=installation(root);selected_engine(root,value,"inspect");path=journal(root,op,"snapshot",{"selection":selection,"source_identity":value["source_identity"]})
        if output.exists():
            index=verify_zip(output,schema=SNAPSHOT_SCHEMA)
            need(index.get("operation_id")==op and index.get("installation_id")==value["installation_id"] and index.get("source_identity")==value["source_identity"],"archive_conflict","The completed archive identifies another request.")
            return finish(path,{"archive":input_file(output),"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"replayed":True})
        stage=directory(path/"attempts"/str(uuid.uuid4()),create=True,private=True)
        once(stage/"INSTALLATION.json",encoded(value))
        for name in ("editions","workspace","operations","lineage","inputs"):
            base=root/name
            if not base.exists():continue
            for row in operation_rows(base) if name=="operations" else inventory(base):
                if name=="operations" and Path(row["path"]).parts[0]==op:continue
                copy_file(base/row["path"],stage/name/row["path"],row)
        identity=write_zip(output,stage,inventory(stage),{"schema":SNAPSHOT_SCHEMA,"operation_id":op,"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"source_identity":value["source_identity"]})
        return finish(path,{"archive":{k:identity[k] for k in ("path","bytes","sha256")},"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"replayed":False})
def receive(*,archive_path,directory_path,node,python,operation_id):
    root=directory(directory_path,create=True,private=True);selection={"archive":str(absolute(archive_path)),"node":str(absolute(node)),"python":str(absolute(python))}
    with locked(root/"installation.lock"):
        prior=replay(root,operation_id,"receive",selection)
        if prior:return prior
        identity=input_file(archive_path);index=verify_zip(archive_path,schema=SNAPSHOT_SCHEMA)
        chosen_node=node_selection(node);chosen_python=python_selection(python);request={"selection":selection,"archive":identity}
        path=journal(root,operation_id,"receive",request)
        need(not (root/"installation.json").exists(),"installation_exists","Select a new independent receiving directory.")
        once(root/"CREATION.json",encoded({"operation_id":operation_id,"kind":"receive","request_sha256":digest(encoded(request))}))
        retained=root/"inputs"/"Original_Installation.zip";copy_file(archive_path,retained,identity);stage=directory(path/"input",create=True,private=True);extract_zip(retained,stage)
        old=read_json(stage/"INSTALLATION.json")
        need(old["schema"]==INSTALL_SCHEMA and all(old[k]==index[k] for k in ("installation_id","workspace_id","source_identity")),"archive_binding","The original complete installation binding differs.")
        for sid in old["source_history"]:
            _,app,bridge=read_edition(stage,sid);materialize(root,app,stage/"editions"/sid/"bridge",bridge);build(root,sid,chosen_node)
        lineage=directory(root/"lineage",create=True,private=True)
        if (stage/"lineage").exists():
            for row in inventory(stage/"lineage"):copy_file(stage/"lineage"/row["path"],lineage/row["path"],row)
        oldline=directory(lineage/old["installation_id"],create=True,private=True);once(oldline/"INSTALLATION.json",encoded(old))
        for name in ("operations","workspace","inputs"):
            if not (stage/name).exists():continue
            for row in inventory(stage/name):copy_file(stage/name/row["path"],oldline/name/row["path"],row)
        # Active save receipts belong to the receiving installation; original
        # receipts remain complete under its sender lineage.
        handover=read_json(stage/"workspace"/"CURRENT.json",MAX_SOURCE_BYTES)
        need(handover["workspace"]["id"]==old["workspace_id"],"workspace_changed","The archived original workspace UUID changed.")
        engine(root,old["source_identity"],chosen_node,"validate",{"handover":str(stage/"workspace"/"CURRENT.json")})
        directory(root/"workspace",create=True,private=True)
        value={**old,"installation_id":str(uuid.uuid4()),"operation_id":operation_id,"created_at":now(),"directory":str(root),"workspace":str(root/"workspace"),"node":chosen_node,"python":chosen_python,"received_from":{"installation_id":old["installation_id"],"archive_sha256":identity["sha256"],"operation_id":index["operation_id"]}}
        result=commit(root,path,{"installation":value,"original_archive":identity,"replayed":False},handover);selected_engine(root,value,"inspect");return result
def adopt_source(root,application_path,op,binding=None):
    root=directory(root,private=True);selection={"application":str(absolute(application_path)),"binding":binding}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"adopt_source",selection)
        if prior:return prior
        value=installation(root);check_binding(value,binding);app,identity=selected(application_path);bridge=bridge_manifest(SOURCE_ROOT);sid=source_id(app,bridge)
        path=journal(root,op,"adopt_source",{"selection":selection,"application":identity,"source_identity":sid});once(path/"BEFORE.json",encoded(value));once(path/"BEFORE_HANDOVER.json",read(root/"workspace"/"CURRENT.json",MAX_SOURCE_BYTES))
        materialize(root,app,SOURCE_ROOT,bridge);build(root,sid,value["node"])
        target=path/"TARGET_HANDOVER.json"
        if not target.exists():engine(root,sid,value["node"],"rebind",{"handover":str(path/"BEFORE_HANDOVER.json"),"output":str(target)})
        handover=read_json(target,MAX_SOURCE_BYTES);need(handover["workspace"]["id"]==value["workspace_id"],"workspace_changed","A source edition must preserve the original complete workspace.")
        selected_value={**value,"source_identity":sid,"source_history":value["source_history"]+([] if sid in value["source_history"] else [sid])}
        return commit(root,path,{"installation":selected_value,"previous_source_identity":value["source_identity"],"replayed":False},handover)
def request_record(root,request_id,origin_installation_id=None):
    value=installation(root);path=Path(root)
    if origin_installation_id:path=path/"lineage"/identifier(origin_installation_id)
    path=path/"operations"/identifier(request_id)
    return {"request":read_json(path/"REQUEST.json"),"result":read_json(path/"RESULT.json") if (path/"RESULT.json").exists() else None,"installation_id":origin_installation_id or value["installation_id"]}
def describe_commands(root,args):
    value=installation(root);info=summary(value);ready=absolute(args["ready_file"]);port=args.get("port",0)
    need(isinstance(port,int) and not isinstance(port,bool) and 0<=port<=65535,"port_invalid","Choose an available loopback port.")
    directory(ready.parent,create=True,private=True);need(not ready.exists(),"ready_file_exists","Select a new private service-ready file.")
    script=Path(info["paths"]["bridge"])/"launch.py";argv=[value["python"]["path"],"-B",str(script),"--directory",str(root),"--installation-id",value["installation_id"],"--source-identity",value["source_identity"],"--ready-file",str(ready),"--port",str(port)]
    return {"commands":[{"role":"operator","executable":argv[0],"argv":argv,"cwd":info["paths"]["application"],"script":str(script),"script_sha256":file_identity(script)["sha256"],"ready_file":str(ready),"workspace_id":value["workspace_id"]}]}
