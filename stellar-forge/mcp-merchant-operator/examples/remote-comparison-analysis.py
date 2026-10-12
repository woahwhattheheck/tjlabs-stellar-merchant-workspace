#!/usr/bin/env python3
"""Receive the selected remote comparison document through original Analysis."""
from __future__ import annotations
import argparse, csv, hashlib, json, os, shutil, subprocess, sys, time, tempfile
from pathlib import Path

def need(value,message):
    if not value: raise RuntimeError(message)
def encoded(value): return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode()
def sha(raw): return hashlib.sha256(raw).hexdigest()
def ident(path):
    with Path(path).open("rb") as stream:
        info=os.fstat(stream.fileno())
        return {"path":str(path),"bytes":info.st_size,"sha256":hashlib.file_digest(stream,"sha256").hexdigest()}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkout",required=True);parser.add_argument("--operation",required=True);parser.add_argument("--node",required=True)
    args=parser.parse_args();checkout=Path(args.checkout).resolve();out=Path(args.operation).resolve()
    completed=json.loads((out/"remote-customer-result.json").read_bytes())
    need(completed["state"]=="COMPLETE","Complete the selected original remote receiving first.")
    sys.path.insert(0,str(checkout/"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python"))
    from stellar_forge_buyer.analysis_workspace import AnalysisWorkspace
    from stellar_forge_buyer.storage import dump
    from stellar_forge_buyer.response_documents import document_path
    from stellar_forge_buyer.workspace_archive_receive import restore_archive
    path=out/"remote-analysis-operation.json"
    selection={"operation_id":completed["operation_id"],"source_sha256":completed["new_edition"]["sha256"],
               "comparison_sha256":completed["comparison_sha256"]}
    journal=json.loads(path.read_bytes()) if path.exists() else {"schema":"stellar-forge.odata-remote-analysis-operation.v1",
        "selection":selection,"state":"RUNNING","steps":{}}
    need(journal["selection"]==selection,"Preserve the selected original analytical document.")
    def save():dump(path,journal)
    def publish(name,raw):
        target=out/name
        if target.exists():need(target.read_bytes()==raw,"Preserve different original analytical output: "+name)
        else:
            with target.open("xb") as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        return ident(target)
    def step_id(label,number=0):return sha((completed["operation_id"]+":"+label+":"+str(number)).encode())[:32]
    def job(ws,label,kind,request):
        entry=journal["steps"].setdefault(label,{"kind":kind,"request":request,"attempts":[{"id":step_id(label)}]})
        need(entry["kind"]==kind and entry["request"]==request,"The original analytical request changed.")
        save();attempt=entry["attempts"][-1]
        try:result=ws.job(attempt["id"])
        except Exception as error:
            if getattr(error,"code",None)!="ANALYSIS_JOB_NOT_FOUND":raise
            result=ws.start(kind,{"id":attempt["id"],**request})
        if result["status"] in {"FAILED","INTERRUPTED","CANCELLED"}:
            attempt.update(status=result["status"],error=result.get("error"))
            attempt={"id":step_id(label,len(entry["attempts"]))};entry["attempts"].append(attempt);save()
            result=ws.start(kind,{"id":attempt["id"],**request})
        deadline=time.monotonic()+600
        while result["status"]=="RUNNING":
            need(time.monotonic()<deadline,"The original analytical job remains active: "+attempt["id"])
            time.sleep(.2);result=ws.job(attempt["id"])
        attempt.update(status=result["status"],error=result.get("error"));save()
        need(result["status"]=="COMPLETE","Original Analysis "+label+": "+str(result.get("error")))
        result_sha=sha(json.dumps(result["result"],sort_keys=True,separators=(",",":"),ensure_ascii=False).encode())
        need(attempt.get("result_sha256",result_sha)==result_sha,"A completed original analytical result changed.")
        attempt["result_sha256"]=result_sha;save()
        print(json.dumps({"phase":"remote-analysis","step":label,"id":result["id"],"status":"COMPLETE"}),flush=True)
        return result
    workspace=receiving=None
    try:
        source=Path(completed["analysis_source_manifest"])
        need(ident(source)["sha256"]==selection["source_sha256"],"Register the actual downloaded published edition.")
        workspace=AnalysisWorkspace(out/"analysis-workspace",checkout=checkout,node=args.node)
        registered=workspace.responses.register("remote_orders_comparison","document",manifest=source,format="csv",expected_revision=0)
        publish("Analysis_Source_Registration.json",encoded(registered))
        cli=checkout/"stellar-forge/mcp-merchant-operator/odata-comparison-cli.mjs"
        mapping_file=out/"Analysis_Import_Mapping.json"
        command=[args.node,str(cli),"analysis-mapping","--directory",completed["comparison_directory"],
                 "--source",registered["name"],"--revision",str(registered["revision"]),"--out",str(mapping_file)]
        result=subprocess.run(command,text=True,capture_output=True,check=False)
        publish("Analysis_Mapping_Command.json",encoded({"argv":command,"returncode":result.returncode,"stdout":result.stdout,"stderr":result.stderr}))
        need(result.returncode==0,"The original client mapping command failed: "+result.stderr)
        mapping=json.loads(mapping_file.read_bytes())
        need(mapping["source"]==registered["name"] and mapping["source_revision"]==registered["revision"],
             "Bind the actual original source alias revision.")
        preview=job(workspace,"preview","response-preview",mapping)
        imported=job(workspace,"import","response-import",{"preview_id":preview["id"],
            "preview_sha256":preview["result"]["preview_sha256"],"allow_incomplete":False})
        version=imported["result"]["version"];need(version["row_count"]==4150,"The complete mapped comparison must retain 4,150 original rows.")
        view="remote_order_comparison";active=workspace.database.current(view)
        if active["version"] is None:workspace.database.activate(view,version["version_id"],expected_revision=0)
        else:need(active["version"]["version_id"]==version["version_id"],"The selected customer dataset changed.")
        columns=[item["name"] for item in mapping["mapping"]["columns"]]
        quote=lambda value:'"'+value.replace('"','""')+'"'
        sql="SELECT "+",".join(map(quote,columns))+" FROM "+quote(view)+" ORDER BY "+quote(version["row_order_column"])
        request={"sql":sql,"parameters_text":"[]","max_rows":100000,"expected_views":workspace.database.view_bindings()}
        queried=job(workspace,"original-rows","query",request)
        raw,_,_=workspace.export_result(queried["id"],"json");observed=json.loads(raw)
        manifest=json.loads(source.read_bytes());table=source.parent/manifest["document"]["path"]
        with table.open(newline="",encoding="utf-8") as stream:
            reader=csv.reader(stream);need(next(reader)==columns,"The selected source column mapping changed.");expected=list(reader)
        need(observed["rows"]==expected and len(expected)==4150 and not observed["truncated"],
             "The native Analysis result differs from the complete original document.")
        query_json=publish("Remote_Original_Comparison_Rows.json",raw)
        csv_raw,_,_=workspace.export_result(queried["id"],"csv");query_csv=publish("Remote_Original_Comparison_Rows.csv",csv_raw)
        held=document_path(workspace.database.directory,registered["document_id"])
        need(ident(held)["sha256"]==selection["source_sha256"],"Analysis retained another edition.")
        archive_review=workspace.archives.review();need(archive_review["ready"],"The customer workspace has missing original files.")
        exported=job(workspace,"complete-analysis-workspace","workspace-export",{"include_previous_backups":False})
        archive_record=next(item for item in exported["result"]["files"] if item["name"]=="workspace.zip")
        original_archive=Path(exported["result"]["directory"])/"workspace.zip"
        archive=out/"OData_Remote_Analysis_Workspace.zip"
        if not archive.exists():
            descriptor,temporary=tempfile.mkstemp(prefix=".remote-analysis-archive-",dir=out)
            try:
                with original_archive.open("rb") as inp,os.fdopen(descriptor,"wb") as output:
                    shutil.copyfileobj(inp,output,1024*1024);output.flush();os.fsync(output.fileno())
                candidate=ident(temporary)
                need(all(candidate[key]==archive_record[key] for key in ("bytes","sha256")),"The complete archive candidate changed.")
                try:os.link(temporary,archive)
                except FileExistsError:pass
            finally:
                if os.path.exists(temporary):os.unlink(temporary)
        archive_identity=ident(archive)
        need(all(archive_identity[key]==archive_record[key] for key in ("bytes","sha256")),"The original complete Analysis archive changed.")
        source_state=workspace.state();workspace.close();workspace=None
        restored=restore_archive(archive,out/"received-analysis-workspace",operation=step_id("restore-analysis"),
            expected_sha256=archive_identity["sha256"])
        stable={key:value for key,value in restored.items() if key!="reused"}
        if "restored" not in journal:journal["restored"]={"identity":stable,"receipt":restored};save()
        else:need(journal["restored"]["identity"]==stable,"The original restored analytical identity changed.")
        receiving=AnalysisWorkspace(out/"received-analysis-workspace",checkout=checkout,node=args.node)
        need(receiving.state()["workspace_id"]==source_state["workspace_id"],"The restored analytical workspace changed identity.")
        replay=job(receiving,"received-original-rows","query",{**request,"expected_views":receiving.database.view_bindings()})
        replay_raw,_,_=receiving.export_result(replay["id"],"json")
        need(json.loads(replay_raw)["rows"]==expected,"The independently reopened analytical rows changed.")
        receiving.close();receiving=None
        final={"schema":"stellar-forge.odata-remote-analysis-customer.v1","state":"COMPLETE","operation_id":completed["operation_id"],
            "comparison_sha256":selection["comparison_sha256"],"source_sha256":selection["source_sha256"],
            "source_registration":registered,"mapping":mapping,"dataset_version":version,"rows":4150,
            "query":query_json,"csv":query_csv,"workspace_id":source_state["workspace_id"],
            "workspace_archive":archive_identity,"restore":journal["restored"]["receipt"],"replayed_query_id":replay["id"]}
        publish("remote-analysis-result.json",encoded(final))
        journal["state"]="COMPLETE";journal.pop("error",None);save()
        print(json.dumps({"phase":"remote-analysis-customer","state":"COMPLETE","rows":4150,"workspace_id":source_state["workspace_id"]}),flush=True)
    except BaseException as error:
        journal["state"]="NEEDS_ATTENTION";journal["error"]={"name":type(error).__name__,"message":str(error)};save();raise
    finally:
        if receiving is not None:receiving.close()
        if workspace is not None:workspace.close()
if __name__=="__main__":main()
