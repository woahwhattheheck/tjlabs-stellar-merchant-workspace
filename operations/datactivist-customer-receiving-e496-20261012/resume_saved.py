#!/usr/bin/env python3
"""Restore the saved original Datactivist case and complete its current customer delivery."""
from __future__ import annotations
import hashlib,json,os,runpy,subprocess,sys,tempfile,urllib.request,zipfile
from pathlib import Path

def digest(data): return hashlib.sha256(data).hexdigest()
def emit(value): print(json.dumps(value,ensure_ascii=False,separators=(",",":")),flush=True)
def resume(config):
    root=Path(config["root"]).resolve();root.mkdir(parents=True,exist_ok=True)
    temporary=root/"runtime-tmp";temporary.mkdir(mode=0o700,exist_ok=True)
    os.environ["TMPDIR"]=str(temporary);tempfile.tempdir=str(temporary)
    helpers=root/"helpers";saved=config["original_checkpoint"]
    retained=root/"retained";retained.mkdir(mode=0o700,exist_ok=True)
    transfer=saved["transfer"]
    if transfer.get("workspace_path"):
        archive_path=Path(transfer["workspace_path"])
        command=[sys.executable,"-B",str(helpers/"library_file_transfer.py"),"apply-xattrs",str(archive_path),transfer["library_file_id"]]
        request=transfer.get("xattrs",[])
    else:
        archive_path=retained/"Original_Operating_Checkpoint.zip"
        command=[sys.executable,"-B",str(helpers/"library_file_transfer.py"),"materialize",str(archive_path)]
        request=transfer
    acquired=subprocess.run(command,input=json.dumps(request),capture_output=True,text=True,env=dict(os.environ))
    (retained/"checkpoint-materialize.stdout").write_text(acquired.stdout,encoding="utf-8")
    (retained/"checkpoint-materialize.stderr").write_text(acquired.stderr,encoding="utf-8")
    if acquired.returncode:raise RuntimeError("Original checkpoint materialization failed; retained helper output: "+str(retained/"checkpoint-materialize.stderr"))
    archive=archive_path.read_bytes()
    if len(archive)!=saved["bytes"] or digest(archive)!=saved["sha256"]:raise ValueError("The saved original operating archive differs")
    workspace=root/"original-operation/workspace"
    has_workspace=(workspace/"operations.sqlite").is_file()
    source_history=root/"original-operation/operations/source-editions";source_history.mkdir(parents=True,exist_ok=True)
    members=0
    with zipfile.ZipFile(archive_path) as z:
        for item in z.infolist():
            if item.is_dir() or not item.filename.startswith("Datactivist_Original/"):continue
            relative=item.filename[len("Datactivist_Original/"):]
            if relative=="complete-application.json":
                old=z.read(item);previous=json.loads(old)
                destination=source_history/(previous["sourceCommit"]+".json")
            elif relative=="DATACTIVIST_NATIVE_RUN_RESULT.json":
                old=z.read(item);destination=source_history/"original-native-result.json"
            elif relative=="Original_Public_Source.zip":
                old=z.read(item);destination=root/relative
            elif relative.startswith("original-operation/"):
                if has_workspace:continue
                old=z.read(item);destination=root/relative
            elif relative.startswith("native-logs/"):
                old=z.read(item);destination=root/"native-logs"/"retained-original"/relative[len("native-logs/"):]
            elif relative.startswith("customer-receiving/"):
                if has_workspace:continue
                old=z.read(item);destination=root/relative
            else:continue
            destination=destination.resolve()
            if not destination.is_relative_to(root):raise ValueError("Unsafe retained original member")
            destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(old);members+=1
    # Native workspaces are private directories; ZIP recreation must preserve that contract.
    if workspace.is_symlink():raise ValueError("The retained workspace must not be a symlink")
    for directory in [workspace]+[p for p in workspace.rglob("*") if p.is_dir()]:
        if directory.is_symlink():raise ValueError("The retained workspace contains a symlink")
        directory.chmod(0o700)
    for retained_file in workspace.rglob("*"):
        if retained_file.is_symlink():raise ValueError("The retained workspace contains a symlink")
        if retained_file.is_file():retained_file.chmod(0o600)
    receiving=root/"customer-receiving"
    if receiving.is_dir():
        for directory in [receiving]+[p for p in receiving.rglob("*") if p.is_dir()]:
            if directory.is_symlink():raise ValueError("The retained receiving tree contains a symlink")
            directory.chmod(0o700)
        for retained_file in receiving.rglob("*"):
            if retained_file.is_symlink():raise ValueError("The retained receiving tree contains a symlink")
            if retained_file.is_file():retained_file.chmod(0o600)
    customer=json.loads((workspace/"customer/customer-result.json").read_text(encoding="utf-8"))
    for key in ("workspaceId","publicationId","snapshot"):
        if customer[key]!=config["original_identity"][key]:raise ValueError("The retained original "+key+" differs")
    original_result=root/"original-operation/operations/operation-result.json"
    if original_result.exists():(source_history/"original-operating-result.json").write_bytes(original_result.read_bytes())
    emit({"state":"ORIGINAL_CHECKPOINT_RESTORED","root":str(root),"members":members,"workspaceId":customer["workspaceId"],"publicationId":customer["publicationId"],"snapshot":customer["snapshot"],"existingWorkspace":has_workspace,"checkpointLibraryId":transfer["library_file_id"]})
    selected=config["current_application"]
    retained_source=selected.get("retained_source")
    if retained_source:
        source_path=(root/retained_source).resolve()
        if not source_path.is_relative_to(root):raise ValueError("Unsafe retained source path")
        raw=source_path.read_bytes()
    else:raw=urllib.request.urlopen(selected["url"],timeout=60).read()
    if len(raw)!=selected["bytes"] or digest(raw)!=selected["sha256"]:raise ValueError("The current application source differs")
    packet=json.loads(raw)
    for overlay in config.get("application_overlays",[]):
        body=(root/overlay["local_path"]).read_bytes()
        if len(body)!=overlay["bytes"] or digest(body)!=overlay["sha256"]:raise ValueError("The selected application overlay differs")
        git_sha=hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()
        if git_sha!=overlay["sha"]:raise ValueError("The selected overlay Git identity differs")
        matches=[f for f in packet["files"] if f["path"]==overlay["path"]]
        if len(matches)!=1:raise ValueError("The selected application overlay path is not unique")
        matches[0].update(content=body.decode("utf-8"),bytes=len(body),sha=git_sha,sha256=digest(body))
    packet["sourceCommit"]=config["selected_source_commit"]
    joined=json.dumps(packet,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    (root/"complete-application.json").write_bytes(joined)
    transition={"operationId":packet["operationId"],"originalIdentity":config["original_identity"],"checkpointLibraryId":transfer["library_file_id"],"checkpointSha256":saved["sha256"],"selectedSourceCommit":packet["sourceCommit"],"selectedSourceSha256":digest(joined),"currentSourceBase":selected["sourceCommit"],"overlays":[{k:v for k,v in x.items() if k!="local_path"} for x in config.get("application_overlays",[])]}
    (source_history/"current-source-continuation.json").write_text(json.dumps(transition,indent=2)+"\n",encoding="utf-8")
    native=dict(config["native"],root=str(root),capture_zip=str(root/"Original_Public_Source.zip"),source_url=selected.get("url",""),source_sha256=digest(joined),source_bytes=len(joined),source_files=len(packet["files"]),source_commit=packet["sourceCommit"],library_replacements=config["library_replacements"])
    (root/"resume-native-config.json").write_text(json.dumps({k:v for k,v in native.items() if k!="source_url"},indent=2)+"\n",encoding="utf-8")
    emit({"state":"CURRENT_APPLICATION_JOINED","files":len(packet["files"]),"sourceCommit":packet["sourceCommit"],"bytes":len(joined),"sha256":digest(joined)})
    previous=None;old=None
    del archive, raw, packet, joined
    runner=runpy.run_path(str(root/"runtime/native_runner.py"))
    return runner["run"](native)

if __name__=="__main__":
    if len(sys.argv)!=2:raise SystemExit("Use resume_saved.py /ABSOLUTE_CONFIG.json")
    result=resume(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    raise SystemExit(0 if result["complete"] else 1)
