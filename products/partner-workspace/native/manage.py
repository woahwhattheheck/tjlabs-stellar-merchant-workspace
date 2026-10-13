"""Whole source-selected installations; original workbench owns business state."""
from __future__ import annotations
from datetime import datetime,timezone
import os,re,shutil,sys,uuid,zipfile
from pathlib import Path
from files import *
from source import *
INSTALL_SCHEMA="stellar-forge.partner-installation.v1"
SNAPSHOT_SCHEMA="stellar-forge.partner-installation-archive.v1"
SOURCE_ROOT=Path(__file__).resolve().parent
def now():return datetime.now(timezone.utc).isoformat()
def input_file(path):return {k:v for k,v in file_identity(path).items() if k in ("path","bytes","sha256")}
def installation(path,verify=True):
    root=directory(path,private=True);value=read_json(root/"installation.json")
    need(value.get("schema")==INSTALL_SCHEMA and value.get("directory")==str(root) and re.fullmatch(r"[a-f0-9-]{36}",str(value.get("installation_id",""))),"installation_changed","Select the complete original installation.")
    workspace=absolute(value["workspace"]);need((root/"workspaces") in workspace.parents,"workspace_changed","Keep the original workspace inside its installation.")
    need((workspace/"workspace.sqlite3").is_file(),"workspace_missing","The original workspace database is absent.")
    _,manifest=read_edition(root,value["source_identity"],verify)
    need(value["product"]==manifest["product"],"product_changed","The selected source belongs to another product.")
    return value
def summary(value):
    root=Path(value["directory"]);edition,manifest=read_edition(root,value["source_identity"],False);info=root.stat()
    return {"installation_id":value["installation_id"],"operation_id":value["operation_id"],"source_identity":value["source_identity"],"product_source_identity":edition["product_source_identity"],"product":value["product"],"title":manifest["title"],"workspace_id":value["workspace_id"],"python":value["python"],"paths":{"directory":str(root),"source":edition["source"],"application":edition["source"],"workspace":value["workspace"],"database":str(Path(value["workspace"])/"workspace.sqlite3"),"bridge":edition["bridge"]},"binding":{"directory":str(root),"device":str(info.st_dev),"inode":str(info.st_ino)},"received_from":value.get("received_from")}
def check_binding(value,binding):
    if binding is None:return
    exact(binding,("installation_id","source_identity"),("installation_id","source_identity"))
    need(all(value[k]==binding[k] for k in binding),"installation_changed","Inspect the selected original installation and source before operating it.")
def journal(root,op,kind,request):
    path=directory(Path(root)/"operations"/identifier(op),create=True,private=True)
    once(path/"REQUEST.json",encoded({"schema":"stellar-forge.partner-lifecycle-request.v1","operation_id":op,"kind":kind,"request":request}))
    return path,read_json(path/"RESULT.json") if (path/"RESULT.json").exists() else None
def finish(path,result):
    once(path/"RESULT.json",encoded(result));return result
def replay(root,op,kind,selection):
    path=root/"operations"/identifier(op)
    if not (path/"REQUEST.json").exists():return None
    record=read_json(path/"REQUEST.json");request=record["request"]
    need(record["kind"]==kind and request["selection"]==selection,"operation_conflict","Retain the exact original operation and selected inputs.")
    result=read_json(path/"RESULT.json") if (path/"RESULT.json").exists() else None
    if not result and (path/"COMMIT.json").exists():
        committed=read_json(path/"COMMIT.json");target=committed["installation"]
        need(target["directory"]==str(root),"installation_changed","The retained commit identifies another directory.")
        read_edition(root,target["source_identity"])
        with application(root,target) as ctx:
            ws=ctx["Workspace"](target["workspace"],target["product"]);ws.validate()
            need(ws.meta["id"]==target["workspace_id"],"workspace_changed","The retained committed workspace changed.")
        if (root/"installation.json").exists():
            current=installation(root)
            before=read_json(path/"BEFORE.json") if (path/"BEFORE.json").exists() else None
            need(current==target or kind=="adopt_source" and current==before,"installation_changed","The interrupted installation marker differs from its retained transition.")
        save(root/"installation.json",target)
        result=finish(path,committed)
    if result:
        if result.get("installation"):
            current=installation(root);need(current["installation_id"]==result["installation"]["installation_id"],"installation_changed","The directory now belongs to another installation.")
            read_edition(root,result["installation"]["source_identity"])
        for key in ("source_manifest","workspace_archive","archive"):
            value=request.get(key)
            if value and Path(value["path"]).exists():
                actual=input_file(value["path"]);need(actual==value,"operation_input_changed","A surviving original input changed: "+key)
        if request.get("source_identity") and Path(selection.get("source_root","/nonexistent")).exists():
            _,manifest=read_edition(root,request["source_identity"]);check_source(selection["source_root"],manifest)
        if request.get("archive"):
            original=root/"inputs"/"Original_Installation.zip"
            actual=input_file(original);need(actual["bytes"]==request["archive"]["bytes"] and actual["sha256"]==request["archive"]["sha256"],"original_archive_changed","The retained original installation archive changed.")
        if result.get("archive"):
            actual=input_file(result["archive"]["path"]);need(actual==result["archive"],"archive_changed","The completed archive changed.")
        return {**result,"replayed":True}
    return None
def commit(root,path,result):
    once(path/"COMMIT.json",encoded(result));save(root/"installation.json",result["installation"]);return finish(path,result)
def restore_original(root,path,selected,archive):
    attempts=directory(path/"attempts",create=True,private=True)
    for attempt in sorted(attempts.iterdir()):
        if (attempt/"RESTORED.json").exists():
            value=read_json(attempt/"RESTORED.json")
            with application(root,selected) as ctx:
                ws=ctx["Workspace"](value["workspace"],ctx["manifest"]["product"]);ws.validate()
                need(ws.meta==value["metadata"],"workspace_changed","Retained workspace identity changed.")
            return value
    attempt=directory(attempts/str(uuid.uuid4()),create=True,private=True);outer=root/"workspaces"/str(uuid.uuid4())
    directory(outer.parent,create=True,private=True)
    with application(root,selected) as ctx:
        if archive:
            ctx["restore"](archive,outer);workspace=outer/"workspace"
        else:
            directory(outer,create=True,private=True);workspace=outer/"workspace";ctx["Workspace"](workspace,ctx["manifest"]["product"],True)
        ws=ctx["Workspace"](workspace,ctx["manifest"]["product"]);ws.validate()
        value={"workspace":str(workspace),"metadata":ws.meta,"completed_at":now(),"archive":input_file(archive) if archive else None}
    save(attempt/"RESTORED.json",value);return value
def prepare(*,source_root,source_manifest,directory_path,python,operation_id,workspace_archive=None):
    root=directory(directory_path,create=True,private=True)
    selection={"source_root":str(absolute(source_root)),"source_manifest":str(absolute(source_manifest)),"python":str(absolute(python)),"workspace_archive":str(absolute(workspace_archive)) if workspace_archive else None}
    with locked(root/"installation.lock"):
        prior=replay(root,operation_id,"prepare",selection)
        if prior:return prior
        manifest,identity=selected_manifest(source_manifest);check_source(source_root,manifest)
        bridge=bridge_manifest(SOURCE_ROOT);sid=source_identity(manifest,bridge);chosen_python=python_selection(python)
        request={"selection":selection,"source_identity":sid,"source_manifest":identity,"workspace_archive":input_file(workspace_archive) if workspace_archive else None}
        path,_=journal(root,operation_id,"prepare",request)
        need(not (root/"installation.json").exists(),"installation_exists","Select an empty installation or receive its existing named operation.")
        once(root/"CREATION.json",encoded({"operation_id":operation_id,"kind":"prepare","request_sha256":digest(encoded(request))}))
        materialize_edition(root,source_root,manifest,SOURCE_ROOT,bridge)
        archive=None
        if workspace_archive:
            archive=root/"inputs"/"Original_Workspace.zip";copy_file(workspace_archive,archive,request["workspace_archive"])
        restored=restore_original(root,path,{"source_identity":sid},archive)
        value={"schema":INSTALL_SCHEMA,"installation_id":str(uuid.uuid4()),"operation_id":operation_id,"created_at":now(),"directory":str(root),"source_identity":sid,"source_history":[sid],"product":manifest["product"],"workspace_id":restored["metadata"]["id"],"workspace":restored["workspace"],"python":chosen_python,"received_from":None}
        return commit(root,path,{"installation":value,"restored":restored,"replayed":False})
def inspect(root):
    value=installation(root)
    with application(root,value) as ctx:
        ws=ctx["Workspace"](value["workspace"],value["product"]);ws.validate()
        need(ws.meta["id"]==value["workspace_id"],"workspace_changed","The actual original workspace UUID changed.")
        with ws.connect() as db:
            tables=[{"name":row[0],"rows":db.execute('SELECT COUNT(*) FROM "'+row[0].replace('"','""')+'"').fetchone()[0]} for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        return {"installation":value,"workspace":ws.meta,"database":{"integrity":"ok","tables":tables},"source_files":len(ctx["manifest"]["files"]),"source_history":value["source_history"]}
def read_business(root,operation,args):
    value=installation(root)
    with application(root,value) as ctx:
        ws=ctx["Workspace"](value["workspace"],value["product"])
        if operation=="workspace.state":return ctx["app"].state(ws)
        if operation=="workspace.record":return ws.get(args["kind"],args["id"])
        if operation=="workspace.history":return ws.history(args["kind"],args["id"])
        if operation=="workspace.source":
            source=ws.source(args["id"]);source["original_file"]=input_file(ws.source_path(args["id"]));return source
        if operation=="workspace.compare":
            need(value["product"]=="mobility","product_operation","Comparison belongs to mobility.")
            return ctx["app"].mobility.compare(ws,args["ids"])
        if operation=="workspace.stations":
            need(value["product"]=="mobility","product_operation","Station flow belongs to mobility.")
            return ctx["app"].mobility.station_flow(ws,args["id"])
    raise WorkbenchError("unknown_operation","Select an original workspace read operation.")
def verify_original_workspace(path,metadata,source_manifest):
    manifest=verify_zip(path,"MANIFEST.json",schema="partner-delivery-archive.v1")
    need(manifest["workspace"]==metadata,"archive_changed","The complete original export identifies another workspace.")
    expected={"application/"+row["path"]:(row["bytes"],row["sha256"]) for row in source_manifest["files"]}
    actual={row["path"]:(row["bytes"],row["sha256"]) for row in manifest["files"] if row["path"].startswith("application/")}
    need(actual==expected,"archive_source_changed","The complete exported runtime differs from its selected source edition.")
    return manifest
def export_original(root,kind,output,op):
    root=directory(root,private=True);output=absolute(output);selection={"kind":kind,"output":str(output)}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"export",selection)
        if prior:return prior
        value=installation(root);path,_=journal(root,op,"export",{"selection":selection,"source_identity":value["source_identity"]})
        staged=path/("Original_Workspace.zip" if kind=="workspace" else "Original_Report.md" if kind=="report" else "Original_Data.csv")
        with application(root,value) as ctx:
            ws=ctx["Workspace"](value["workspace"],value["product"]);ws.validate()
            if kind=="workspace":
                if not staged.exists():ws.archive(staged,ctx["source"])
                verify_original_workspace(staged,ws.meta,ctx["manifest"])
            elif not staged.exists():
                domain=ctx["app"].mobility if value["product"]=="mobility" else ctx["app"].education
                if kind=="report":raw=domain.report(ws)
                elif kind=="csv":
                    if value["product"]=="education":raw=domain.export_csv(ws)
                    else:raw=domain.csv_bytes([dict(city=x["city"],period=x["period"],source_sha256=x["sha256"],**domain.analysis(ws,x["id"])["metrics"]) for x in domain.imports(ws)])
                else:raise WorkbenchError("export_kind","Select workspace, report or csv.")
                once(staged,raw.encode() if isinstance(raw,str) else raw)
        original=input_file(staged);once(path/"OUTPUT.json",encoded(original));copy_file(staged,output,original)
        return finish(path,{"archive":input_file(output),"kind":kind,"workspace_id":value["workspace_id"],"replayed":False})
def operation_rows(root):
    # Preserve complete named requests/results and restoration lineage; duplicate
    # staging inputs and failed materialization copies remain in the producing host.
    rows=[]
    for row in inventory(root):
        parts=Path(row["path"]).parts
        if len(parts)==2 and parts[1] in ("REQUEST.json","RESULT.json","COMMIT.json","BEFORE.json","RESTORED.json","OUTPUT.json"):
            rows.append(row)
        elif len(parts)==4 and parts[1]=="attempts" and parts[3]=="RESTORED.json":rows.append(row)
    return rows

def snapshot(root,output,op):
    root=directory(root,private=True);output=absolute(output);selection={"output":str(output)}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"snapshot",selection)
        if prior:return prior
        value=installation(root);path,_=journal(root,op,"snapshot",{"selection":selection,"source_identity":value["source_identity"]})
        if output.exists():
            index=verify_zip(output,schema=SNAPSHOT_SCHEMA)
            need(index.get("operation_id")==op and index.get("installation_id")==value["installation_id"],"archive_conflict","The completed original snapshot identifies another request.")
            return finish(path,{"archive":input_file(output),"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"replayed":True})
        attempts=directory(path/"attempts",create=True,private=True);stage=directory(attempts/str(uuid.uuid4()),create=True,private=True)
        with application(root,value) as ctx:
            ws=ctx["Workspace"](value["workspace"],value["product"]);ws.validate();ws.archive(stage/"Original_Workspace.zip",ctx["source"]);verify_original_workspace(stage/"Original_Workspace.zip",ws.meta,ctx["manifest"])
        once(stage/"INSTALLATION.json",encoded(value))
        for name in ("editions","operations","lineage"):
            base=root/name
            if not base.exists():continue
            for row in (operation_rows(base) if name=="operations" else inventory(base)):
                if name=="operations" and Path(row["path"]).parts[0]==op:continue
                copy_file(base/row["path"],stage/name/row["path"],row)
        rows=inventory(stage);identity=write_zip(output,stage,rows,{"schema":SNAPSHOT_SCHEMA,"operation_id":op,"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"product":value["product"],"source_identity":value["source_identity"]})
        return finish(path,{"archive":{k:identity[k] for k in ("path","bytes","sha256")},"installation_id":value["installation_id"],"workspace_id":value["workspace_id"],"replayed":False})
def receive(*,archive_path,directory_path,python,operation_id):
    root=directory(directory_path,create=True,private=True);selection={"archive":str(absolute(archive_path)),"python":str(absolute(python))}
    with locked(root/"installation.lock"):
        prior=replay(root,operation_id,"receive",selection)
        if prior:return prior
        identity=input_file(archive_path);index=verify_zip(archive_path,schema=SNAPSHOT_SCHEMA);chosen_python=python_selection(python)
        request={"selection":selection,"archive":identity};path,_=journal(root,operation_id,"receive",request)
        need(not (root/"installation.json").exists(),"installation_exists","Select a new independent receiving directory.")
        once(root/"CREATION.json",encoded({"operation_id":operation_id,"kind":"receive","request_sha256":digest(encoded(request))}))
        retained=root/"inputs"/"Original_Installation.zip";copy_file(archive_path,retained,identity)
        staged=directory(path/"input",create=True,private=True);extract_zip(retained,staged)
        old=read_json(staged/"INSTALLATION.json")
        need(old["schema"]==INSTALL_SCHEMA and old["installation_id"]==index["installation_id"] and old["workspace_id"]==index["workspace_id"] and old["product"]==index["product"] and old["source_identity"]==index["source_identity"],"archive_binding","The complete original installation binding differs.")
        for sid in old["source_history"]:
            selected=staged/"editions"/sid;manifest=manifest_value(read_json(selected/"SOURCE.json"));bridge=read_json(selected/"BRIDGE.json")
            need(source_identity(manifest,bridge)==sid,"source_changed","The original source edition identity changed.")
            materialize_edition(root,selected/"source",manifest,selected/"bridge",bridge)
        lineage=directory(root/"lineage",create=True,private=True)
        if (staged/"lineage").exists():
            for row in inventory(staged/"lineage"):copy_file(staged/"lineage"/row["path"],lineage/row["path"],row)
        oldline=directory(lineage/old["installation_id"],create=True,private=True)
        once(oldline/"INSTALLATION.json",encoded(old))
        if (staged/"operations").exists():
            for row in inventory(staged/"operations"):copy_file(staged/"operations"/row["path"],oldline/"operations"/row["path"],row)
        restored=restore_original(root,path,{"source_identity":old["source_identity"]},staged/"Original_Workspace.zip")
        need(restored["metadata"]["id"]==old["workspace_id"] and restored["metadata"]["product"]==old["product"],"workspace_changed","The complete restored workspace differs from its original selection.")
        value={**old,"installation_id":str(uuid.uuid4()),"operation_id":operation_id,"created_at":now(),"directory":str(root),"workspace":restored["workspace"],"python":chosen_python,"received_from":{"installation_id":old["installation_id"],"archive_sha256":identity["sha256"],"operation_id":index["operation_id"]}}
        return commit(root,path,{"installation":value,"restored":restored,"original_archive":identity,"replayed":False})
def adopt_source(root,source_root,source_manifest,op,binding=None):
    root=directory(root,private=True);selection={"source_root":str(absolute(source_root)),"source_manifest":str(absolute(source_manifest)),"binding":binding}
    with locked(root/"installation.lock"),locked(root/"services"/"operator.lock"):
        prior=replay(root,op,"adopt_source",selection)
        if prior:return prior
        value=installation(root);check_binding(value,binding);manifest,identity=selected_manifest(source_manifest);need(manifest["product"]==value["product"],"product_changed","An existing workspace keeps its original product.")
        bridge=bridge_manifest(SOURCE_ROOT);sid=source_identity(manifest,bridge);request={"selection":selection,"source_manifest":identity,"source_identity":sid}
        path,_=journal(root,op,"adopt_source",request);once(path/"BEFORE.json",encoded(value));materialize_edition(root,source_root,manifest,SOURCE_ROOT,bridge)
        selected={**value,"source_identity":sid,"source_history":value["source_history"]+([] if sid in value["source_history"] else [sid])}
        with application(root,selected) as ctx:
            ws=ctx["Workspace"](selected["workspace"],selected["product"]);ws.validate();need(ws.meta["id"]==value["workspace_id"],"workspace_changed","The source successor changed the original workspace identity.")
        return commit(root,path,{"installation":selected,"previous_source_identity":value["source_identity"],"replayed":False})
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
    return {"commands":[{"role":"operator","executable":argv[0],"argv":argv,"cwd":info["paths"]["application"],"script":str(script),"script_sha256":file_identity(script)["sha256"],"ready_file":str(ready),"workspace_id":value["workspace_id"],"product":value["product"]}]}
