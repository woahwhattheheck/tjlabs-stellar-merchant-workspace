"""Whole supplied-input property continuity commissioning and cold receiving.

Business data, command UUIDs, operators, dates, decisions and expected revisions
come from the original input plan. This module supplies no customer example rows.
The application owner invokes this once and retains the same operation on retry.
"""
import argparse,copy,fcntl,os,stat,subprocess,sys,uuid,zipfile
from pathlib import Path
from .common import *
from .workspace import Workspace
from .server import Application
from .exchange import source_inventory,export_workspace,receive_archive,validate_archive
from . import domain

SCHEMA="bluewave.commissioning-programme.v1"
BROWSER_SCHEMA="bluewave.commissioning-browser.v1"

def _directory(path):
    path=Path(path).absolute()
    missing=[];current=path
    while not current.exists():
        missing.append(current);current=current.parent
    require(current.is_dir() and not current.is_symlink(),"PROGRAMME_DIRECTORY","Use a real owned directory.")
    for item in reversed(missing):item.mkdir(mode=0o700)
    resolved=path.resolve(strict=True)
    require(resolved==path and not path.is_symlink(),"PROGRAMME_DIRECTORY","Use a canonical operation path without links.")
    return path

def _read_json(path,limit=MAX_HISTORY):return loads(read_regular(path,limit))
def _measured(path,name=None,limit=MAX_ARCHIVE):
    raw=read_regular(path,limit)
    return {"path":str(Path(path).absolute()),"name":name or Path(path).name,"bytes":len(raw),"sha256":sha(raw)}
def _clean_result(value):return {k:v for k,v in value.items() if k!="reused"}

def _commands(values,initial,seen,label):
    require(isinstance(values,list) and 0<len(values)<=5000,"PROGRAMME_COMMANDS","Supply the complete original "+label+" command list.")
    for index,item in enumerate(values):
        require(isinstance(item,dict) and set(item)=={"label","expectedRevision","command"},"PROGRAMME_COMMANDS","Use label, expectedRevision and complete command.")
        text(item["label"],"Original command label",160)
        require(type(item["expectedRevision"])is int and item["expectedRevision"]==initial+index,"PROGRAMME_REVISION","Supply consecutive original expected revisions.")
        c=item["command"]
        require(isinstance(c,dict) and set(c)=={"requestId","kind","actor","at","body"},"PROGRAMME_COMMAND","Retain the complete original command envelope.")
        identifier(c["requestId"]);timestamp(c["at"]);text(c["kind"],"Original action",80)
        require(c["kind"] in domain.KINDS,"PROGRAMME_COMMAND","The selected original domain does not implement this action.")
        require(c["requestId"] not in seen,"PROGRAMME_ID","Each supplied business command needs its own original request ID.")
        seen.add(c["requestId"])
        require(isinstance(c["actor"],dict) and set(c["actor"])=={"id","name"},"PROGRAMME_ACTOR","Supply the actual named command actor.")
        text(c["actor"]["id"],"Operator reference",128);text(c["actor"]["name"],"Operator name",160)
        require(isinstance(c["body"],dict),"PROGRAMME_COMMAND","Use the actual original command body.")
        require(len(canonical(item))<=8*1024*1024,"PROGRAMME_CAPACITY","Original command exceeds its allowance.")
    return initial+len(values)

def _input(plan,source_root):
    require(isinstance(plan,dict) and set(plan)=={"schema","operationId","sourceSha256","filesRoot","files","workspace","commands","receiving","browser"},"PROGRAMME_INPUT","Supply the complete original programme input.")
    require(plan["schema"]==SCHEMA,"PROGRAMME_SCHEMA","Use the original commissioning input schema.")
    identifier(plan["operationId"]);sha_id(plan["sourceSha256"])
    source_root=Path(source_root).resolve(strict=True)
    selected=_read_json(source_root/"source-selection.json")
    require(selected["sha256"]==plan["sourceSha256"],"SOURCE_SELECTION","The consolidated application source differs from this original plan.")
    source_inventory(source_root,selected)
    root=Path(plan["filesRoot"])
    require(root.is_absolute() and root.resolve(strict=True)==root and root.is_dir(),"SOURCE_ROOT","Supply the canonical original files root.")
    require(isinstance(plan["files"],list) and len(plan["files"])<=2000,"SOURCE_FILES","Supply complete bounded raw-file descriptors.")
    paths=set();total=0;raw_files=[]
    for item in plan["files"]:
        require(isinstance(item,dict) and set(item)=={"path","bytes","sha256"},"SOURCE_FILE","Use relative path, bytes and SHA-256.")
        safe_path(item["path"]);sha_id(item["sha256"])
        require(item["path"] not in paths and type(item["bytes"])is int and 0<=item["bytes"]<=MAX_BLOB,"SOURCE_FILE","Original file paths must be distinct and bounded.")
        paths.add(item["path"]);total+=item["bytes"]
        require(total<=MAX_BLOBS,"SOURCE_CAPACITY","Complete original input exceeds the existing workspace allowance.")
        path=root/item["path"]
        require(path.resolve(strict=True).is_relative_to(root),"SOURCE_PATH","Original file escapes its selected root.")
        raw=read_regular(path);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"SOURCE_CHANGED","Original supplied file differs: "+item["path"])
        raw_files.append((path,item))
    w=plan["workspace"]
    require(isinstance(w,dict) and set(w)=={"directory","mode","id","title","createdAt","revision","sha256"},"WORKSPACE_PLAN","Supply the original complete workspace basis.")
    require(w["mode"] in ("create","existing"),"WORKSPACE_MODE","Select explicit create or existing.")
    identifier(w["id"]);text(w["title"],"Workspace title",200);timestamp(w["createdAt"])
    require(Path(w["directory"]).is_absolute() and type(w["revision"])is int and w["revision"]>=0,"WORKSPACE_PLAN","Use an absolute workspace and exact original revision.")
    if w["mode"]=="create":
        require(w["revision"]==0 and w["sha256"] is None,"WORKSPACE_PLAN","New workspace begins at revision zero without a fabricated state hash.")
    else:sha_id(w["sha256"])
    seen=set();after=_commands(plan["commands"],w["revision"],seen,"source")
    required={"source.import","mapping.save","mapping.review","reconciliation.create","rehearsal.record","cutover.plan","cutover.decide","cutover.close","handover.record"}
    require(required.issubset({x["command"]["kind"] for x in plan["commands"]}),"PROGRAMME_SCOPE","Supply the complete original population, mapping, reconciliation, rehearsal, cutover and handover command course.")
    rec=plan["receiving"]
    require(isinstance(rec,dict) and set(rec)=={"directory","commands"} and Path(rec["directory"]).is_absolute(),"RECEIVING_PLAN","Supply the independent receiving path and complete original edit list.")
    _commands(rec["commands"],after,seen,"receiving")
    source_path=Path(w["directory"]).absolute();destination=Path(rec["directory"]).absolute()
    require(source_path!=destination and not source_path.is_relative_to(destination) and not destination.is_relative_to(source_path),"RECEIVING_PLAN","Keep original and receiving workspaces separate.")
    browser=plan["browser"]
    require(isinstance(browser,dict) and set(browser)=={"node","playwrightModule","executablePath","actor","timeoutSeconds"},"BROWSER_PLAN","Supply the existing complete browser runtime and selected operator.")
    require(type(browser["timeoutSeconds"])is int and 60<=browser["timeoutSeconds"]<=3600,"BROWSER_TIMEOUT","Select the original bounded browser interval.")
    for key in ("node","playwrightModule","executablePath"):
        require(Path(browser[key]).is_absolute() and Path(browser[key]).is_file(),"BROWSER_RUNTIME","Use the existing installed "+key+".")
    require(isinstance(browser["actor"],dict) and set(browser["actor"])=={"id","name"},"BROWSER_ACTOR","Supply the actual reviewing operator.")
    text(browser["actor"]["id"],"Operator reference",128);text(browser["actor"]["name"],"Operator name",160)
    return source_root,selected,raw_files

class Programme:
    def __init__(self,directory,plan):
        self.directory=_directory(directory);self.plan=plan
        self.fd=os.open(self.directory/"operation.lock",os.O_RDWR|os.O_CREAT|getattr(os,"O_NOFOLLOW",0),0o600)
        try:
            try:fcntl.flock(self.fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:fail("PROGRAMME_ACTIVE","The original whole programme is still owned.")
            self.identity=digest(plan);self.journal_path=self.directory/"journal.json"
            atomic_file(self.directory/"input.json",canonical(plan),immutable=True)
            self.journal=_read_json(self.journal_path) if self.journal_path.exists() else {"schema":SCHEMA,"operationId":plan["operationId"],"inputSha256":self.identity,"state":"READY","phases":{}}
            require(self.journal["inputSha256"]==self.identity,"PROGRAMME_CONFLICT","Keep the original whole input and operation.")
        except BaseException:
            os.close(self.fd);self.fd=None;raise
    def close(self):
        if self.fd is not None:os.close(self.fd);self.fd=None
    def save(self):atomic_file(self.journal_path,canonical(self.journal))
    def child(self,label):return str(uuid.uuid5(uuid.UUID(self.plan["operationId"]),label))
    def effect(self,label,make_input,run):
        safe_path(label);step=self.directory/"phases"/label;_directory(step)
        input_path=step/"input.json";output_path=step/"result.json"
        if input_path.exists():frame=_read_json(input_path)
        else:frame=make_input();atomic_file(input_path,canonical(frame),immutable=True)
        input_sha=digest(frame)
        prior=self.journal["phases"].get(label)
        if prior:require(prior["inputSha256"]==input_sha,"PHASE_CHANGED","Original phase input changed.")
        if output_path.exists():
            result=_read_json(output_path)
            if prior and prior["state"]=="COMPLETE":require(prior["resultSha256"]==digest(result),"PHASE_CHANGED","Original phase result changed.")
        else:
            self.journal["state"]="RUNNING";self.journal["phases"][label]={"state":"RUNNING","inputSha256":input_sha};self.save()
            result=run(frame);atomic_file(output_path,canonical(result),immutable=True)
        self.journal["phases"][label]={"state":"COMPLETE","inputSha256":input_sha,"resultSha256":digest(result)};self.save()
        return result

def _run_commands(programme,workspace,items,prefix):
    results=[]
    for index,item in enumerate(items):
        result=programme.effect(prefix+"/"+str(index).zfill(4)+"-"+item["command"]["requestId"],lambda item=item:copy.deepcopy(item),lambda f:workspace.execute(f["command"],f["expectedRevision"]))
        actual=workspace.request(item["command"]["requestId"])
        require(actual is not None and actual["envelope"]=={"expectedRevision":item["expectedRevision"],"command":item["command"]},"REQUEST_CHANGED","Original native command is unavailable or differs.")
        require(actual["result"]==_clean_result(result),"RESULT_CHANGED","Retained first result differs from the real command result.")
        results.append(result)
    return results

def _all_pages(read,key):
    output=[];offset=0;total=None
    while True:
        value=read(offset);require(value["offset"]==offset,"PAGE_IDENTITY","Original page offset changed.")
        if total is None:total=value["total"]
        require(type(total)is int and 0<=total<=1000000 and value["total"]==total,"PAGE_IDENTITY","Original complete population changed.")
        rows=value[key];require(isinstance(rows,list) and len(rows)<=100,"PAGE_IDENTITY","Unexpected original page size.")
        output.extend(rows);next_offset=value["nextOffset"]
        if next_offset is None:
            require(len(output)==total,"PAGE_COVERAGE","Original complete page coverage is missing.");return output
        require(next_offset==len(output) and next_offset>offset,"PAGE_COVERAGE","Original page does not advance exactly.")
        offset=next_offset

def _reports(programme,workspace,label):
    def write(frame):
        current=workspace.current()
        require(current["revision"]==frame["revision"] and current["sha256"]==frame["sha256"],"REPORT_REVISION","Original report observation changed before its first execution.")
        state=current["state"];out=programme.directory/"reports"/label;_directory(out)
        outputs=[];summary=[]
        for record in state["reconciliations"]:
            identity=record["id"];value=domain.report(state,identity,workspace.read_blob)
            rows=_all_pages(lambda offset:domain.report_rows(state,identity,workspace.read_blob,offset,100),"rows")
            findings=_all_pages(lambda offset:domain.finding_rows(state,identity,workspace.read_blob,offset,100),"findings")
            require(rows==value["rows"] and findings==value["findings"],"REPORT_COVERAGE","Paged native report differs from complete original report.")
            html=domain.report_html(state,identity,workspace.read_blob)
            for suffix,raw in (("json",canonical(value)),("html",html.encode("utf-8") if isinstance(html,str) else html)):
                path=out/(identity+"."+suffix);workspace.put_blob(raw);atomic_file(path,raw,immutable=True);outputs.append(_measured(path))
            summary.append({"id":identity,"sha256":digest(value),"rows":len(rows),"findings":len(findings),"ready":value["ready"],"blocking":value["blocking"],"counts":value["counts"]})
        sources=[]
        for original in state["sourceEditions"]:
            rows=_all_pages(lambda offset:domain.source_rows(state,original["id"],workspace.read_blob,offset,100),"rows")
            sources.append({"id":original["id"],"rows":len(rows),"pagedRowsSha256":digest(rows)})
        history=_all_pages(lambda offset:workspace.history(offset,100),"items")
        require(len(history)==current["revision"],"HISTORY_COVERAGE","Every original command must remain available.")
        path=out/"Complete_Command_History.json";raw=canonical(history);workspace.put_blob(raw);atomic_file(path,raw,immutable=True);outputs.append(_measured(path))
        return {"revision":current["revision"],"stateSha256":current["sha256"],"reports":summary,"sources":sources,"commandCount":len(history),"files":outputs}
    result=programme.effect(label+"-reports",lambda:{k:v for k,v in workspace.current().items() if k!="state"},write)
    for item in result["files"]:
        raw=workspace.read_blob(item["sha256"]);require(len(raw)==item["bytes"],"REPORT_CHANGED","Retained report bytes differ.")
        atomic_file(Path(item["path"]),raw,immutable=True)
    return result

def _browser(programme,workspace,source_root,selection,label):
    def run(frame):
        require({k:v for k,v in workspace.current().items() if k!="state"}==frame["basis"],"BROWSER_REVISION","The selected read-only staff view changed.")
        app=None;process=None;directory=programme.directory/"browser"/label;_directory(directory)
        launch=directory/"private-launch.json";stdout=directory/"stdout.log";stderr=directory/"stderr.log"
        try:
            app=Application(workspace,source_root,selection,receiving_root=programme.directory/"browser-receiving")
            value={**frame,"schema":BROWSER_SCHEMA,"directory":str(directory),"origin":app.origin,"url":app.url}
            atomic_file(launch,canonical(value))
            with open(stdout,"ab",buffering=0) as output,open(stderr,"ab",buffering=0) as error:
                process=subprocess.Popen([programme.plan["browser"]["node"],str(source_root/"tools"/"receiving_browser.cjs"),str(launch)],stdin=subprocess.DEVNULL,stdout=output,stderr=error,pass_fds=(programme.fd,),env={**os.environ,"NODE_OPTIONS":"--max-old-space-size=192"})
                try:code=process.wait(timeout=programme.plan["browser"]["timeoutSeconds"])
                except subprocess.TimeoutExpired:
                    process.terminate()
                    try:process.wait(timeout=20)
                    except subprocess.TimeoutExpired:process.kill();process.wait()
                    fail("BROWSER_INTERRUPTED","The original browser interval ended without a complete result; its retained process custody controls reentry.")
            atomic_file(directory/"last-return.json",canonical({"exitCode":code,"at":now()}))
            require(code==0,"BROWSER_INTERRUPTED","Inspect the original browser return and retained error before continuation.")
            result=_read_json(directory/"result.json")
            require(result["state"]=="COMPLETE" and result["allOwnedResourcesClosed"] is True and result["inputSha256"]==digest(frame),"BROWSER_RESULT","Complete browser result differs from original input.")
            for item in result["screenshots"]+result.get("downloads",[]):
                actual=_measured(item["path"])
                require(actual["bytes"]==item["bytes"] and actual["sha256"]==item["sha256"],"BROWSER_OUTPUT","Actual reviewed screenshot bytes differ.")
            require({k:v for k,v in workspace.current().items() if k!="state"}==frame["basis"],"BROWSER_MUTATION","Read-only review changed the workspace.")
            return result
        finally:
            active_error=sys.exc_info()[1];closing_errors=[];closure={"at":now(),"nodeClosed":process is None,"httpClosed":app is None,"privateLaunchRemoved":False,"errors":[]}
            try:
                if process is not None and process.poll() is None:
                    process.terminate()
                    try:process.wait(timeout=20)
                    except subprocess.TimeoutExpired:process.kill();process.wait()
                closure["nodeClosed"]=process is None or process.poll() is not None
            except BaseException as error:closing_errors.append(error);closure["errors"].append({"resource":"node","error":str(error)})
            try:
                if app is not None:app.close()
                closure["httpClosed"]=True
            except BaseException as error:closing_errors.append(error);closure["errors"].append({"resource":"http","error":str(error)})
            try:
                try:launch.unlink();fsync_directory(directory)
                except FileNotFoundError:pass
                closure["privateLaunchRemoved"]=True
            except BaseException as error:closing_errors.append(error);closure["errors"].append({"resource":"private-launch","error":str(error)})
            try:atomic_file(directory/"resource-closure.json",canonical(closure))
            except BaseException as error:closing_errors.append(error)
            if closing_errors and active_error is None:raise closing_errors[0]
    return programme.effect(label+"-browser",lambda:{"operationId":programme.child(label+"-browser"),"sourceSha256":selection["sha256"],"workspaceId":workspace.current()["state"]["id"],"workspaceDirectory":str(workspace.directory),"basis":{k:v for k,v in workspace.current().items() if k!="state"},"playwrightModule":programme.plan["browser"]["playwrightModule"],"executablePath":programme.plan["browser"]["executablePath"],"actor":programme.plan["browser"]["actor"]},run)

def _ensure_archive(programme,workspace,label,descriptor,source_root,selection):
    if Path(descriptor["path"]).exists():
        actual=_measured(descriptor["path"])
        require(actual["sha256"]==descriptor["sha256"] and actual["bytes"]==descriptor["bytes"],"EXPORT_CHANGED","Original complete export changed.")
        return
    frame=_read_json(programme.directory/"phases"/label/"input.json")
    restored=export_workspace(workspace,frame["publicationId"],source_root,selection,frame["revision"])
    require(all(restored[k]==descriptor[k] for k in ("sha256","bytes","manifestSha256","manifest","path")),"EXPORT_CHANGED","Restored original export differs.")

def _archive_final(programme,native_result):
    result_path=programme.directory/"result.json"
    if result_path.exists():
        result=_read_json(result_path)
        require(result["inputSha256"]==programme.identity and result["nativeResultSha256"]==digest(native_result),"COMPLETE_CHANGED","Original completed package identity differs.")
        if Path(result["archive"]["path"]).exists():
            actual=_measured(result["archive"]["path"])
            require(actual["sha256"]==result["archive"]["sha256"] and actual["bytes"]==result["archive"]["bytes"],"COMPLETE_CHANGED","Original completed package differs.")
            return result
    items=[]
    for relative in ("input.json","native-result.json","completed-journal.json"):
        items.append((relative,programme.directory/relative))
    for category in ("phases","reports","browser"):
        root=programme.directory/category
        if root.exists():
            for path in sorted(root.rglob("*")):
                if not path.is_file() or path.is_symlink():continue
                relative=path.relative_to(programme.directory).as_posix()
                if category=="browser" and not (path.name in ("input.json","result.json","browser-owner.json","resource-closure.json") or "screenshots" in path.parts or "downloads" in path.parts or "launches" in path.parts):continue
                items.append((relative,path))
    for label,descriptor in native_result["workspaceArchives"].items():
        items.append(("workspaces/"+label+"/Bluewave_Commissioning_Workspace.zip",Path(descriptor["path"])))
    inventory=[]
    for name,path in items:
        m=_measured(path);inventory.append({"path":name,"bytes":m["bytes"],"sha256":m["sha256"]})
    require(sum(x["bytes"] for x in inventory)<=MAX_ARCHIVE,"DELIVERY_CAPACITY","Complete programme record exceeds the existing archive allowance.")
    recipe_path=programme.directory/"package-intent.json"
    recipe={"schema":"bluewave.commissioning-delivery.v1","operationId":programme.plan["operationId"],"inputSha256":programme.identity,"files":inventory}
    if recipe_path.exists():
        original=_read_json(recipe_path);require(original==recipe,"DELIVERY_CHANGED","Keep the exact original completed package recipe.")
    else:atomic_file(recipe_path,canonical(recipe),immutable=True)
    output=programme.directory/"Bluewave_Complete_Commissioning.zip";partial=programme.directory/"delivery.partial.zip"
    if not output.exists():
        with zipfile.ZipFile(partial,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
            for (name,path),item in zip(items,inventory):
                raw=read_regular(path,MAX_ARCHIVE);require(sha(raw)==item["sha256"] and len(raw)==item["bytes"],"DELIVERY_CHANGED","Original delivery file changed.")
                info=zipfile.ZipInfo(name,(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16
                archive.writestr(info,raw)
            info=zipfile.ZipInfo("Delivery_Manifest.json",(2026,10,13,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=0o100600<<16
            archive.writestr(info,canonical(recipe))
        with open(partial,"rb") as stream:os.fsync(stream.fileno())
        os.replace(partial,output);fsync_directory(programme.directory)
    with zipfile.ZipFile(output) as archive:
        require(set(archive.namelist())=={x["path"] for x in inventory}|{"Delivery_Manifest.json"} and loads(archive.read("Delivery_Manifest.json"))==recipe,"DELIVERY_CHANGED","Complete archive membership differs.")
        for item in inventory:
            raw=archive.read(item["path"]);require(len(raw)==item["bytes"] and sha(raw)==item["sha256"],"DELIVERY_CHANGED","Complete archive bytes differ.")
    result={"schema":recipe["schema"],"state":"COMPLETE","operationId":programme.plan["operationId"],"inputSha256":programme.identity,"nativeResultSha256":digest(native_result),"archive":_measured(output),"allOwnedResourcesClosed":True}
    atomic_file(result_path,canonical(result),immutable=True);return result

def run_programme(plan,operation_directory,source_root):
    # Verify all actual raw data and installed source before any application effect.
    source_root,selection,raw_files=_input(plan,source_root)
    programme=Programme(operation_directory,plan)
    try:
        completed=programme.directory/"native-result.json"
        if completed.exists():
            native_result=_read_json(completed)
            # Only exact retained bytes are restored; original business commands stay complete.
            for label,workspace_path,report_key,archive_key in (
                ("first-export",plan["workspace"]["directory"],"originalReports","original"),
                ("following-export",plan["receiving"]["directory"],"receivedReports","following")):
                with Workspace(workspace_path) as retained:
                    for item in native_result[report_key]["files"]:
                        raw=retained.read_blob(item["sha256"]);require(len(raw)==item["bytes"],"REPORT_CHANGED","Saved report size differs.")
                        atomic_file(Path(item["path"]),raw,immutable=True)
                    selected_root=source_root if archive_key=="original" else Path(workspace_path)/"source"
                    _ensure_archive(programme,retained,label,native_result["workspaceArchives"][archive_key],selected_root,selection)
            return _archive_final(programme,native_result)
        _directory(Path(plan["workspace"]["directory"]).parent)
        _directory(Path(plan["receiving"]["directory"]).parent)
        next_directory=Path(plan["receiving"]["directory"]).parent/("following-"+plan["operationId"])
        w=plan["workspace"]
        with Workspace(w["directory"],create=w["mode"]=="create",workspace_id=w["id"],title=w["title"],created_at=w["createdAt"]) as workspace:
            def basis(frame):
                current=workspace.current()
                require(current["state"]["id"]==w["id"] and current["state"]["title"]==w["title"] and current["state"]["createdAt"]==w["createdAt"],"WORKSPACE_BASIS","Original workspace identity differs.")
                require(current["revision"]==w["revision"] and (w["sha256"] is None or current["sha256"]==w["sha256"]),"WORKSPACE_BASIS","Original starting state differs.")
                return {k:v for k,v in current.items() if k!="state"}
            programme.effect("workspace-basis",lambda:copy.deepcopy(w),basis)
            for index,(path,item) in enumerate(raw_files):
                def retain_file(frame,path=path):
                    raw=read_regular(path);require(len(raw)==frame["bytes"] and sha(raw)==frame["sha256"],"SOURCE_CHANGED","Original raw input changed.")
                    return workspace.put_blob(raw,frame["sha256"])
                programme.effect("input-blobs/"+str(index).zfill(4),lambda item=item:copy.deepcopy(item),retain_file)
            originals=_run_commands(programme,workspace,plan["commands"],"source-commands")
            first_command=plan["commands"][0]
            replay=workspace.execute(first_command["command"],first_command["expectedRevision"])
            require(replay["reused"] is True and _clean_result(replay)==_clean_result(originals[0]),"REQUEST_REPLAY","Original request did not return its original first result.")
            first_reports=_reports(programme,workspace,"source")
            first_archive=programme.effect("first-export",lambda:{"publicationId":programme.child("first-export"),"revision":workspace.current()["revision"]},lambda f:export_workspace(workspace,f["publicationId"],source_root,selection,f["revision"]))
            _ensure_archive(programme,workspace,"first-export",first_archive,source_root,selection)
        receipt=programme.effect("first-receive",lambda:{"archive":first_archive["path"],"sha256":first_archive["sha256"],"bytes":first_archive["bytes"],"directory":plan["receiving"]["directory"],"operationId":programme.child("first-receive")},lambda f:receive_archive(f["archive"],f["directory"],f["operationId"],f["sha256"],f["bytes"]))
        with Workspace(plan["receiving"]["directory"]) as received:
            for _,item in raw_files:require(len(received.read_blob(item["sha256"]))==item["bytes"],"RECEIVED_SOURCE","Original raw file is missing after receiving.")
            _run_commands(programme,received,plan["receiving"]["commands"],"receiving-commands")
            edited=programme.effect("received-edit-basis",lambda:{},lambda f:{k:v for k,v in received.current().items() if k!="state"})
            second_reports=_reports(programme,received,"received")
        repeat=programme.effect("repeat-receive-after-edit",lambda:{"archive":first_archive["path"],"sha256":first_archive["sha256"],"bytes":first_archive["bytes"],"directory":plan["receiving"]["directory"],"operationId":programme.child("first-receive")},lambda f:receive_archive(f["archive"],f["directory"],f["operationId"],f["sha256"],f["bytes"]))
        require(repeat["reused"] is True and repeat["current"]["revision"]==edited["revision"] and repeat["current"]["sha256"]==edited["sha256"],"RECEIVING_EDIT","Repeat receiving did not preserve the supplied later edit.")
        with Workspace(plan["receiving"]["directory"]) as received:
            second_archive=programme.effect("following-export",lambda:{"publicationId":programme.child("following-export"),"revision":received.current()["revision"]},lambda f:export_workspace(received,f["publicationId"],Path(plan["receiving"]["directory"])/"source",selection,f["revision"]))
            _ensure_archive(programme,received,"following-export",second_archive,Path(plan["receiving"]["directory"])/"source",selection)
        following=programme.effect("following-cold-receive",lambda:{"archive":second_archive["path"],"sha256":second_archive["sha256"],"bytes":second_archive["bytes"],"directory":str(next_directory),"operationId":programme.child("following-cold-receive")},lambda f:receive_archive(f["archive"],f["directory"],f["operationId"],f["sha256"],f["bytes"]))
        require(following["current"]["revision"]==edited["revision"] and following["current"]["sha256"]==edited["sha256"],"FOLLOWING_RECEIVE","Following complete receiving changed the saved edition.")
        with Workspace(next_directory) as cold:
            browser=_browser(programme,cold,next_directory/"source",selection,"received")
            final={k:v for k,v in cold.current().items() if k!="state"}
        native_result={"schema":SCHEMA,"operationId":plan["operationId"],"inputSha256":programme.identity,"state":"COMPLETE","sourceSha256":selection["sha256"],"originalReports":first_reports,"receivedReports":second_reports,"workspaceArchives":{"original":first_archive,"following":second_archive},"originalReceive":receipt,"repeatReceive":repeat,"followingReceive":following,"receivedEdit":edited,"final":final,"browser":browser,"allOwnedResourcesClosed":True}
        programme.journal["state"]="COMPLETE";programme.journal["nativeResultSha256"]=digest(native_result);programme.journal.pop("error",None);programme.save()
        atomic_file(programme.directory/"completed-journal.json",canonical(programme.journal),immutable=True)
        atomic_file(completed,canonical(native_result),immutable=True)
        return _archive_final(programme,native_result)
    except BaseException as error:
        programme.journal["state"]="INTERRUPTED";programme.journal["error"]={"code":getattr(error,"code",type(error).__name__),"message":str(error)};programme.save();raise
    finally:programme.close()

def main():
    parser=argparse.ArgumentParser(description="Run the original supplied-input property continuity receiving programme")
    parser.add_argument("--input",required=True);parser.add_argument("--operation-directory",required=True);parser.add_argument("--source-root",required=True)
    args=parser.parse_args()
    return run_programme(_read_json(args.input),args.operation_directory,args.source_root)
if __name__=="__main__":
    try:print(canonical(main()).decode("utf-8"))
    except CommissioningError as error:
        print(canonical({"error":{"code":error.code,"message":str(error)}}).decode("utf-8"),file=sys.stderr);raise SystemExit(1)
