"""Continue the original commissioning operation with actual independent reviewer work.

Stages retain supplied actors, decisions, evidence, original command UUIDs and the
same Programme journal/lock. A person may edit the issued file between stages.
"""
import copy,html,os,stat,uuid,zipfile
from pathlib import Path
from .common import *
from .workspace import Workspace
from .exchange import source_inventory,export_workspace,receive_archive
from . import review_exchange as review
from . import review_host
from .receiving_program import Programme,_directory,_read_json,_reports,_clean_result,_ensure_archive,_browser

SCHEMA="bluewave.discrepancy-review-receiving.v1"
MODES=("ISSUE","BROWSER","RECEIVE","COMPARE","ADOPT","ONWARD")
def _keys(value,keys,label):
    require(isinstance(value,dict) and set(value)==set(keys),"REVIEW_RECEIVING_INPUT",label+" has unexpected or missing fields.")
def _read(path,limit=MAX_BLOB):
    fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0)|getattr(os,"O_NONBLOCK",0))
    try:
        before=os.fstat(fd);require(stat.S_ISREG(before.st_mode) and before.st_size<=limit,"FILE_LIMIT","Use a complete ordinary file within capacity.")
        chunks=[];size=0
        while True:
            raw=os.read(fd,min(1024*1024,limit+1-size))
            if not raw:break
            chunks.append(raw);size+=len(raw);require(size<=limit,"FILE_LIMIT","File exceeds its declared capacity.")
        after=os.fstat(fd)
        require((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns) and size==before.st_size,"SOURCE_CHANGED","Selected file changed while reading.")
        return b"".join(chunks)
    finally:os.close(fd)
def _measure(path):
    raw=_read(path,MAX_ARCHIVE)
    return {"path":str(path),"bytes":len(raw),"sha256":sha(raw)}
def _basis(workspace,expected):
    actual=workspace.current()
    require(actual["revision"]==expected["revision"] and actual["sha256"]==expected["sha256"],"REVISION_CONFLICT","The selected receiving basis changed; preserve this stage and select an explicit new stage.")
    return {"revision":actual["revision"],"sha256":actual["sha256"],"workspaceId":actual["state"]["id"]}
def _selected_files(plan,out):
    root=Path(plan["filesRoot"]);require(root.is_absolute(),"SOURCE_ROOT","Use the actual canonical reviewer files directory.")
    require(isinstance(plan["files"],list),"SOURCE_FILES","Supply complete selected file descriptors.")
    seen=set();total=0;files={}
    for item in plan["files"]:
        _keys(item,("path","bytes","sha256","name","mediaType"),"Selected reviewer file")
        safe_path(item["path"]);sha_id(item["sha256"]);text(item["name"],"Selected filename",240);text(item["mediaType"],"Selected media type",160)
        require(item["path"] not in seen and type(item["bytes"])is int and 0<=item["bytes"]<=MAX_BLOB,"SOURCE_FILE","Selected paths must be distinct ordinary files within capacity.")
        seen.add(item["path"])
        if item["sha256"]not in files:total+=item["bytes"]
        require(total<=MAX_BLOBS,"SOURCE_CAPACITY","Complete selected inputs exceed the existing workspace allowance.")
        retained=out/"inputs"/item["sha256"]
        if retained.exists():raw=_read(retained)
        else:
            require(root.resolve(strict=True)==root and root.is_dir(),"SOURCE_ROOT","Use the actual canonical reviewer files directory.")
            target=root/item["path"];require(target.resolve(strict=True).is_relative_to(root),"SOURCE_PATH","Selected reviewer file leaves its original directory.")
            raw=_read(target)
        require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"SOURCE_CHANGED","Selected complete reviewer bytes differ.")
        atomic_file(retained,raw,immutable=True)
        files[item["sha256"]]=raw
    return files
def _command(workspace,command,expected):
    value=workspace.execute(command,expected)
    saved=workspace.request(command["requestId"])
    require(saved is not None and saved["envelope"]=={"command":command,"expectedRevision":expected} and saved["result"]==_clean_result(value),"REQUEST_CHANGED","Original native request/result differs.")
    return value
def _document(workspace,record_id,role,out,name):
    value=review.document(workspace.current()["state"],record_id,role,workspace.read_blob)
    path=out/name;atomic_file(path,value["bytes"],immutable=True)
    return {**_measure(path),"descriptor":value["descriptor"]}
def _comparison_files(value,out):
    raw=canonical(value);path=out/"Complete_Review_Comparison.json";atomic_file(path,raw,immutable=True)
    rows=value["comparison"]["rows"]
    def cell(x):return html.escape(__import__("json").dumps(x,ensure_ascii=False,sort_keys=True,indent=2))
    table="".join("<tr><td><code>"+html.escape(x["findingId"])+"</code><br>"+html.escape(x["status"])+"</td><td><pre>"+cell(x["baselineDecision"])+"</pre></td><td><pre>"+cell(x["currentDecision"])+"</pre></td><td><pre>"+cell(x["returnedDecision"])+"</pre></td></tr>" for x in rows)
    body='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Property discrepancy comparison</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#171717;background:#fff;margin:24px}main{max-width:1600px;margin:auto}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:12px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace}code{overflow-wrap:anywhere}.scroll{overflow-x:auto}th{background:#eee}td{min-width:180px}p{max-width:90ch}</style><main><h1>Property discrepancy comparison</h1><p>Complete issued, current and proposed decisions for the selected original return. Apply an explicit choice for every finding in the original application. This downloaded view preserves the selected comparison.</p><p>Review SHA-256: <code>'+html.escape(value["comparison"]["reviewSha256"])+'</code></p><div class="scroll"><table><thead><tr><th>Finding / comparison</th><th>Issued decision</th><th>Current decision</th><th>Returned decision</th></tr></thead><tbody>'+table+'</tbody></table></div><h2>Complete selected comparison and history</h2><pre>'+cell(value)+'</pre></main></html>'
    rendered=out/"Complete_Review_Comparison.html";atomic_file(rendered,body.encode("utf-8"),immutable=True)
    return [_measure(path),_measure(rendered)]
def _comparison_selection(value):
    _keys(value,("returnId","editionId","adoptionId"),"Original historical comparison selection")
    identifier(value["returnId"]);identifier(value["editionId"])
    if value["adoptionId"]is not None:identifier(value["adoptionId"])
def _comparisons(workspace,selections):
    with workspace.lock:
        state=workspace.current()["state"]
        return [review.compare(state,x["returnId"],x["editionId"],workspace.read_blob,x["adoptionId"]) for x in selections]
def _delivery(out,files,result):
    members=[{"name":"Stage_Input.json",**_measure(out/"input.json")},{"name":"Stage_Result.json",**_measure(out/"result.json")}]
    for file in files:
        path=Path(file["path"]);require(path.resolve(strict=True).is_relative_to(out),"DELIVERY_PATH","Review delivery member leaves its original stage.")
        actual=_measure(path);require(actual["bytes"]==file["bytes"] and actual["sha256"]==file["sha256"],"DELIVERY_CHANGED","Complete review delivery file changed.")
        members.append({"name":path.relative_to(out).as_posix(),**actual})
    input_plan=_read_json(out/"input.json")
    for item in input_plan["files"]:
        path=out/"inputs"/item["sha256"];actual=_measure(path)
        require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"DELIVERY_CHANGED","A frozen complete reviewer input is absent or differs.")
        members.append({"name":"inputs/"+path.name,**actual})
    unique={}
    for item in members:
        if item["name"]in unique:require(unique[item["name"]]==item,"DELIVERY_CHANGED","Duplicate stage member differs.")
        unique[item["name"]]=item
    members=list(unique.values());require(sum(x["bytes"] for x in members)<=1024*1024*1024,"DELIVERY_CAPACITY","Complete stage delivery exceeds 1 GiB.")
    manifest={"schema":SCHEMA,"operationId":result["operationId"],"stageId":result["stageId"],"mode":result["mode"],"files":[{k:v for k,v in x.items() if k!="path"} for x in members]}
    target=out/"Property_Review_Complete_Stage.zip"
    if not target.exists():
        temporary=out/"delivery.partial.zip"
        with zipfile.ZipFile(temporary,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            for item in members:
                raw=_read(item["path"],MAX_ARCHIVE);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"DELIVERY_CHANGED","Review source changed during archiving.")
                info=zipfile.ZipInfo(item["name"],(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16;archive.writestr(info,raw)
            info=zipfile.ZipInfo("Delivery_Manifest.json",(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16;archive.writestr(info,canonical(manifest))
        fd=os.open(temporary,os.O_RDONLY)
        try:os.fsync(fd)
        finally:os.close(fd)
        os.replace(temporary,target);fsync_directory(out)
    with zipfile.ZipFile(target) as archive:
        require(len(archive.namelist())==len(members)+1 and set(archive.namelist())=={x["name"]for x in members}|{"Delivery_Manifest.json"},"DELIVERY_CHANGED","Complete review stage archive membership differs.")
        require(archive.read("Delivery_Manifest.json")==canonical(manifest),"DELIVERY_CHANGED","Complete review delivery manifest differs.")
        for item in members:
            raw=archive.read(item["name"]);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"DELIVERY_CHANGED","Archived review member differs.")
    raw=_read(target,1024*1024*1024)
    return {"path":str(target),"bytes":len(raw),"sha256":sha(raw),"members":len(members)+1}
def _restore_stage_files(programme,workspace,plan,source_root,selection,out,result):
    """Restore only exact selected artifacts from their original retained authorities."""
    label="review-exchange/"+plan["stageId"];mode=plan["mode"];details=result["details"]
    if mode=="ISSUE":
        _document(workspace,details["issueId"],"issued_json",out,"Property_Review_Issued.json")
        _document(workspace,details["issueId"],"issued_html",out,"Property_Review_Issued.html")
    elif mode=="RECEIVE":
        suffix=".html"if plan["body"]["command"]["body"]["file"]["mediaType"]=="text/html"else".json"
        _document(workspace,details["returnId"],"returned_file",out,"Property_Review_Returned"+suffix)
    elif mode=="BROWSER":
        for item in result["files"]:
            target=Path(item["path"])
            if target.exists():continue
            source=next((x["sourcePath"] for x in details["artifacts"] if x["path"]==item["path"]),None)
            require(source is not None,"BROWSER_OUTPUT","Original browser artifact identity is absent.")
            raw=_read(source,MAX_ARCHIVE);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"BROWSER_OUTPUT","Original browser artifact differs.")
            atomic_file(target,raw,immutable=True)
    elif mode in ("COMPARE","ADOPT"):
        _comparison_files(details["comparison"if mode=="COMPARE"else"historical"],out)
    else:
        exported=details["originalExport"]
        _ensure_archive(programme,workspace,label+"/export",exported,source_root,selection)
        raw=_read(exported["path"],MAX_ARCHIVE);require(len(raw)==exported["bytes"] and sha(raw)==exported["sha256"],"EXPORT_CHANGED","Original retained workspace export differs.")
        atomic_file(out/"Reviewed_Workspace.zip",raw,immutable=True)
        receiving=Path(plan["body"]["receivingDirectory"])
        with Workspace(receiving) as receiver:
            require(receiver.current()["state"]["id"]==plan["workspace"]["id"],"WORKSPACE_CHANGED","Retained recipient branch belongs to another case.")
            following=details["followingExport"]
            _ensure_archive(programme,receiver,label+"/following-export",following,receiving/"source",selection)
            raw=_read(following["path"],MAX_ARCHIVE);require(len(raw)==following["bytes"] and sha(raw)==following["sha256"],"EXPORT_CHANGED","Original following workspace export differs.")
            atomic_file(out/"Received_Reviewed_Workspace.zip",raw,immutable=True)
            reports=_reports(programme,receiver,label+"/received")
            for item in reports["files"]:
                atomic_file(out/"reports"/Path(item["path"]).name,_read(item["path"],MAX_ARCHIVE),immutable=True)
        atomic_file(out/"Received_Complete_Review_History.json",canonical(details["comparisons"]),immutable=True)
    for item in result["files"]:
        path=Path(item["path"]);require(path.resolve(strict=True).is_relative_to(out),"DELIVERY_CHANGED","A frozen artifact escaped its original stage.")
        actual=_measure(path);require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"DELIVERY_CHANGED","Restored artifact differs from its exact completed stage.")

def run_review_receiving(original_plan,operation_directory,source_root,plan):
    _keys(plan,("schema","operationId","stageId","mode","sourceSha256","workspace","expected","filesRoot","files","body"),"Complete review receiving stage")
    require(plan["schema"]==SCHEMA and plan["mode"]in MODES,"REVIEW_RECEIVING_INPUT","Select an original review receiving stage.")
    identifier(plan["operationId"]);identifier(plan["stageId"]);sha_id(plan["sourceSha256"])
    require(plan["operationId"]==original_plan["operationId"],"OPERATION_CHANGED","Continue the original commissioning operation.")
    _keys(plan["workspace"],("id","directory"),"Original receiving workspace")
    _keys(plan["expected"],("revision","sha256"),"Selected original revision")
    identifier(plan["workspace"]["id"]);sha_id(plan["expected"]["sha256"])
    require(type(plan["expected"]["revision"])is int and plan["expected"]["revision"]>=0,"REVISION","Supply the exact selected saved revision.")
    require(plan["workspace"]["id"]==original_plan["workspace"]["id"],"WORKSPACE_CHANGED","Keep the original property workspace identity.")
    source_root=Path(source_root).resolve(strict=True);selection=_read_json(source_root/"source-selection.json")
    require(selection["sha256"]==plan["sourceSha256"],"SOURCE_SELECTION","Select the complete installed review-enabled source edition.")
    source_inventory(source_root,selection)
    programme=Programme(operation_directory,original_plan);prior_state=programme.journal["state"];out=programme.directory/"review-exchange"/plan["stageId"]
    label="review-exchange/"+plan["stageId"];files=[];result=None
    def effect(name,value,run):return programme.effect(label+"/"+name,lambda:copy.deepcopy(value),run)
    try:
        _directory(out);atomic_file(out/"input.json",canonical(plan),immutable=True)
        prior_path=out/"original-programme-state.json"
        if prior_path.exists():prior_state=_read_json(prior_path)["state"]
        else:atomic_file(prior_path,canonical({"state":prior_state}),immutable=True)
        selected=_selected_files(plan,out)
        directory=Path(plan["workspace"]["directory"])
        require(directory.is_absolute() and directory.resolve(strict=True)==directory,"WORKSPACE_CHANGED","Use the original canonical physical workspace directory.")
        allowed={Path(original_plan["workspace"]["directory"]),Path(original_plan["receiving"]["directory"]),Path(original_plan["receiving"]["directory"]).parent/("following-"+plan["operationId"])}
        require(directory in allowed or directory.is_relative_to(programme.directory/"review-exchange"/"workspaces") or directory.is_relative_to(programme.directory/"managed-integration"/"workspaces"),"WORKSPACE_CHANGED","Select an original or received branch in this commissioning operation.")
        if (out/"result.json").exists():
            result=_read_json(out/"result.json");require(result["inputSha256"]==digest(plan) and result["state"]=="COMPLETE","STAGE_CHANGED","Completed review stage differs.")
            with Workspace(directory) as workspace:
                require(workspace.current()["state"]["id"]==plan["workspace"]["id"],"WORKSPACE_CHANGED","Original completed-stage workspace differs.")
                _restore_stage_files(programme,workspace,plan,source_root,selection,out,result)
            archive=_delivery(out,result["files"],result)
            programme.journal.setdefault("reviewExchangeStages",{})[plan["stageId"]]={"state":"COMPLETE","inputSha256":digest(plan),"resultSha256":digest(result),"archive":archive};programme.journal["state"]=prior_state;programme.save()
            return {**result,"archive":archive}
        with Workspace(directory) as workspace:
            require(workspace.current()["state"]["id"]==plan["workspace"]["id"],"WORKSPACE_CHANGED","The physical branch belongs to another original workspace.")
            effect("basis",plan["expected"],lambda x:_basis(workspace,x))
            mode=plan["mode"];body=plan["body"];details={}
            baseline_directories={Path(original_plan["workspace"]["directory"]),Path(original_plan["receiving"]["directory"])}
            if mode in ("ISSUE","RECEIVE","ADOPT") and directory in baseline_directories:
                completed=programme.directory/"native-result.json"
                native=_read_json(completed) if completed.exists() else None
                require(native is not None and native.get("state")=="COMPLETE" and native.get("operationId")==plan["operationId"] and native.get("inputSha256")==programme.identity,"BASELINE_CONTINUATION","Continue review in a named received branch while the original programme is unfinished: run ONWARD with commands=[] first, then select its receivingDirectory for reviewer work.")

            if mode=="ISSUE":
                _keys(body,("command",),"Issue preparation stage")
                prepared=effect("prepare",{"command":body["command"],"expectedRevision":plan["expected"]["revision"]},lambda x:review_host.prepare_issue(workspace,x["command"],x["expectedRevision"],source_root))
                committed=effect("command",{"command":prepared["command"],"expectedRevision":prepared["expectedRevision"]},lambda x:_command(workspace,x["command"],x["expectedRevision"]))
                issue_id=prepared["command"]["body"]["id"]
                files.extend([_document(workspace,issue_id,"issued_json",out,"Property_Review_Issued.json"),_document(workspace,issue_id,"issued_html",out,"Property_Review_Issued.html")])
                details={"issueId":issue_id,"preparation":prepared,"command":committed}
            elif mode=="BROWSER":
                _keys(body,("issuedHtmlPath","reviewer","decisions","attachmentFile"),"Original reviewer browser stage")
                def prepare_browser_inputs(frame):
                    frozen=copy.deepcopy(frame);retained=[]
                    for key in ("issuedHtmlPath","attachmentFile"):
                        original=Path(frame[key]);require(original.is_absolute(),"BROWSER_INPUT","Select the actual complete browser input path.")
                        raw=_read(original);target=out/"browser-inputs"/key/original.name
                        atomic_file(target,raw,immutable=True);frozen[key]=str(target)
                        retained.append({**_measure(target),"sourcePath":str(original)})
                    return {"reviewerCopy":frozen,"files":retained}
                prepared=effect("browser-inputs",body,prepare_browser_inputs)
                for item in prepared["files"]:
                    target=Path(item["path"])
                    if not target.exists():
                        raw=_read(item["sourcePath"]);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"BROWSER_INPUT","Original complete browser input changed.")
                        atomic_file(target,raw,immutable=True)
                    actual=_measure(target);require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"BROWSER_INPUT","Retained browser input changed.")
                    files.append(actual)
                browser=_browser(programme,workspace,source_root,selection,label,reviewer_copy=prepared["reviewerCopy"],expected_basis=plan["expected"])
                browser_root=programme.directory/"browser"/label;artifacts=[]
                browser_members=browser["screenshots"]+browser.get("downloads",[])+[{**x,"path":str(browser_root/"reviewer-copy"/x["path"])}for x in browser.get("reviewerCopy",{}).get("artifacts",[])]
                for item in browser_members:
                    source=Path(item["path"]);require(source.resolve(strict=True).is_relative_to(browser_root),"BROWSER_OUTPUT","Original browser output left its owned directory.")
                    raw=_read(source,MAX_ARCHIVE);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"BROWSER_OUTPUT","Original complete browser output changed.")
                    target=out/"browser"/source.relative_to(browser_root);atomic_file(target,raw,immutable=True)
                    measured=_measure(target);files.append(measured);artifacts.append({**measured,"sourcePath":str(source)})
                for item in prepared["files"]:artifacts.append(item)
                require(browser.get("reviewerCopy",{}).get("status")=="COMPLETE","BROWSER_RESULT","Original reviewer course did not complete.")
                returned=Path(browser["reviewerCopy"]["returnFile"])
                retained_return=out/"browser"/returned.relative_to(browser_root)
                require(retained_return.is_file(),"BROWSER_RESULT","Complete returned reviewer file was not retained in the browser artifacts.")
                details={"browser":browser,"artifacts":artifacts,"returnFile":str(retained_return),"editionId":browser["reviewerCopy"]["editionId"]}
            elif mode=="RECEIVE":
                _keys(body,("command",),"Complete returned-file receiving stage");command=body["command"]
                require(command.get("kind")=="review.receive","COMMAND","Use the original review.receive envelope.")
                descriptor=command["body"]["file"];key=descriptor["sha256"]
                require(key in selected and any({k:item[k]for k in ("sha256","bytes","name","mediaType")}==descriptor for item in plan["files"]),"SOURCE_CHANGED","Select the exact complete returned file, name and media type.")
                prepared=effect("prepare",{"file":descriptor,"expectedRevision":plan["expected"]["revision"]},lambda x:review_host.prepare_return(workspace,selected[key],x["file"],x["expectedRevision"]))
                committed=effect("command",{"command":command,"expectedRevision":plan["expected"]["revision"]},lambda x:_command(workspace,x["command"],x["expectedRevision"]))
                files.append(_document(workspace,command["body"]["id"],"returned_file",out,"Property_Review_Returned"+(".html"if descriptor["mediaType"]=="text/html"else".json")))
                details={"preparation":prepared,"command":committed,"returnId":command["body"]["id"]}
            elif mode=="COMPARE":
                _comparison_selection(body)
                def compare_selected(x):
                    with workspace.lock:
                        _basis(workspace,plan["expected"])
                        return review_host.compare(workspace,x["returnId"],x["editionId"],x["adoptionId"])
                value=effect("comparison",body,compare_selected);files.extend(_comparison_files(value,out));details={"comparison":value}
            elif mode=="ADOPT":
                _keys(body,("command",),"Explicit adoption stage");command=body["command"]
                require(command.get("kind")=="review.adopt","COMMAND","Use the original review.adopt envelope.")
                committed=effect("command",{"command":command,"expectedRevision":plan["expected"]["revision"]},lambda x:_command(workspace,x["command"],x["expectedRevision"]))
                def historical(x):return review_host.compare(workspace,x["returnId"],x["editionId"],x["id"])
                value=effect("historical-comparison",command["body"],historical);files.extend(_comparison_files(value,out))
                details={"command":committed,"historical":value}
            else:
                _keys(body,("receivingDirectory","followingDirectory","commands","comparisons"),"Complete onward receiving stage")
                require(isinstance(body["commands"],list) and isinstance(body["comparisons"],list),"RECEIVING_INPUT","Supply complete recipient edits and historical comparison selections.")
                for row in body["comparisons"]:_comparison_selection(row)
                destinations=[Path(body[x]) for x in ("receivingDirectory","followingDirectory")]
                owned=programme.directory/"review-exchange"/"workspaces";_directory(owned)
                for target in destinations:require(target.is_absolute() and target.is_relative_to(owned) and target!=owned,"RECEIVING_PATH","Use explicit received branches in this original operation.")
                require(destinations[0]!=destinations[1] and directory not in destinations and not destinations[0].is_relative_to(destinations[1]) and not destinations[1].is_relative_to(destinations[0]),"RECEIVING_PATH","Use distinct physical receiving branches.")
                def child(name):return str(uuid.uuid5(uuid.UUID(plan["stageId"]),name))
                exported=effect("export",{"publicationId":child("export"),"revision":plan["expected"]["revision"]},lambda x:export_workspace(workspace,x["publicationId"],source_root,selection,x["revision"]))
                _ensure_archive(programme,workspace,label+"/export",exported,source_root,selection)
                first_file=out/"Reviewed_Workspace.zip";raw=_read(exported["path"],MAX_ARCHIVE);require(len(raw)==exported["bytes"] and sha(raw)==exported["sha256"],"ARCHIVE_CHANGED","Original reviewed workspace archive differs.");atomic_file(first_file,raw,immutable=True);files.append(_measure(first_file))
                receiving={"archive":str(first_file),"directory":str(destinations[0]),"operationId":child("receive"),"sha256":exported["sha256"],"bytes":exported["bytes"]}
                received=effect("receive",receiving,lambda x:receive_archive(x["archive"],x["directory"],x["operationId"],x["sha256"],x["bytes"]))
                with Workspace(destinations[0]) as receiver:
                    for index,row in enumerate(body["commands"]):
                        _keys(row,("command","expectedRevision"),"Actual recipient command")
                        effect("recipient-command-"+str(index),row,lambda x:_command(receiver,x["command"],x["expectedRevision"]))
                    edited=effect("recipient-state",{},lambda x:{k:v for k,v in receiver.current().items()if k!="state"})
                    comparisons=effect("recipient-comparisons",body["comparisons"],lambda x:_comparisons(receiver,x))
                    comparison_path=out/"Received_Complete_Review_History.json";atomic_file(comparison_path,canonical(comparisons),immutable=True);files.append(_measure(comparison_path))
                    reports=_reports(programme,receiver,label+"/received")
                    for item in reports["files"]:
                        target=out/"reports"/Path(item["path"]).name;atomic_file(target,_read(item["path"],MAX_ARCHIVE),immutable=True);files.append(_measure(target))
                repeated=effect("repeat-receive-after-edit",receiving,lambda x:receive_archive(x["archive"],x["directory"],x["operationId"],x["sha256"],x["bytes"]))
                require(repeated["current"]["revision"]==edited["revision"] and repeated["current"]["sha256"]==edited["sha256"],"RECEIVING_EDIT","Repeated original receive changed the actual recipient edit.")
                with Workspace(destinations[0]) as receiver:
                    following=effect("following-export",{"publicationId":child("following-export"),"revision":edited["revision"]},lambda x:export_workspace(receiver,x["publicationId"],destinations[0]/"source",selection,x["revision"]))
                    _ensure_archive(programme,receiver,label+"/following-export",following,destinations[0]/"source",selection)
                following_file=out/"Received_Reviewed_Workspace.zip";raw=_read(following["path"],MAX_ARCHIVE);require(len(raw)==following["bytes"] and sha(raw)==following["sha256"],"ARCHIVE_CHANGED","Following reviewed workspace archive differs.");atomic_file(following_file,raw,immutable=True);files.append(_measure(following_file))
                cold=effect("following-receive",{"archive":str(following_file),"directory":str(destinations[1]),"operationId":child("following-receive"),"sha256":following["sha256"],"bytes":following["bytes"]},lambda x:receive_archive(x["archive"],x["directory"],x["operationId"],x["sha256"],x["bytes"]))
                with Workspace(destinations[1]) as receiver:
                    current=receiver.current();require(current["revision"]==edited["revision"] and current["sha256"]==edited["sha256"],"RECEIVING_CHANGED","Full onward workspace changed.")
                    actual=_comparisons(receiver,body["comparisons"]);require(canonical(actual)==canonical(comparisons),"REVIEW_HISTORY","Complete issued/returned/adopted history changed in onward receiving.")
                details={"originalExport":exported,"received":received,"edited":edited,"repeatReceive":repeated,"followingExport":following,"followingReceive":cold,"comparisons":comparisons}
            final={k:v for k,v in workspace.current().items()if k!="state"}
        result={"schema":SCHEMA,"operationId":plan["operationId"],"stageId":plan["stageId"],"mode":plan["mode"],"inputSha256":digest(plan),"originalInputSha256":programme.identity,"sourceSha256":selection["sha256"],"state":"COMPLETE","workspace":copy.deepcopy(plan["workspace"]),"final":final,"details":details,"files":files,"allOwnedResourcesClosed":True}
        atomic_file(out/"result.json",canonical(result),immutable=True);archive=_delivery(out,files,result)
        programme.journal.setdefault("reviewExchangeStages",{})[plan["stageId"]]={"state":"COMPLETE","inputSha256":digest(plan),"resultSha256":digest(result),"archive":archive};programme.journal["state"]=prior_state;programme.save()
        return {**result,"archive":archive}
    except BaseException as error:
        programme.journal.setdefault("reviewExchangeStages",{})[plan["stageId"]]={"state":"INTERRUPTED","inputSha256":digest(plan),"error":{"code":getattr(error,"code",type(error).__name__),"message":str(error)}};programme.journal["state"]=prior_state;programme.save();raise
    finally:programme.close()
