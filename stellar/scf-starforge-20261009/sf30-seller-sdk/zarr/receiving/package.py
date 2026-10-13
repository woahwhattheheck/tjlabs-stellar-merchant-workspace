"""Package the closed original Zarr programme and exact selected source.

This module does not export a new array result or rewrite a publisher. It freezes
an inventory after the original native/merchant/Applications owners close, then
verifies every included file and the whole archive. A completed archive is reused.
"""
from __future__ import annotations
import argparse,fcntl,hashlib,importlib.util,json,os,stat,sys,time,uuid,zipfile
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("zarr_handover_start",HERE/"START.py")
start=importlib.util.module_from_spec(spec);spec.loader.exec_module(start)
need=start.need;identity=start.identity;encoded=start.encoded;digest=start.digest;save=start.save;private=start.private;sync=start.sync
SDK="stellar/scf-starforge-20261009/sf30-seller-sdk/zarr/"
TRANSIENT={"operation.lock","operator.lock","receiving.lock",".zarr-operator-connection.json","control.json"}
def read(path):return json.loads(Path(path).read_bytes())
def immutable(path,value):save(path,encoded(value))
def plan_row(path,source,role):
    source=Path(source)
    need(source.is_absolute() and source.resolve()==source and source.is_file() and not source.is_symlink(),"Original regular source member: "+str(source))
    stat0=source.stat();found=identity(source)
    return {"path":start.name(path),"source":str(source),**found,"executable":bool(stat0.st_mode&0o111),"role":role}
def scan(source,prefix,role,skip_roots=()):
    source=Path(source);need(source.is_dir() and not source.is_symlink(),"Original closed directory required: "+str(source))
    rows=[]
    for directory,folders,files in os.walk(source,followlinks=False):
        directory=Path(directory);rel=directory.relative_to(source)
        selected=[]
        for folder in sorted(folders):
            p=directory/folder
            if folder in ("__pycache__","node_modules") or not rel.parts and folder in skip_roots:continue
            need(not p.is_symlink(),"Do not bundle an unselected external directory link: "+str(p));selected.append(folder)
        folders[:]=selected
        for filename in sorted(files):
            p=directory/filename
            if filename in TRANSIENT or filename.endswith(".lock") or filename.endswith(".lock.owner.json"):continue
            need(not p.is_symlink(),"Do not bundle an unselected external file link: "+str(p))
            rows.append(plan_row(prefix+"/"+p.relative_to(source).as_posix(),p,role))
    return rows
def binding(input_path,result_path):
    input_bytes=Path(input_path).read_bytes();input=read(input_path);result=read(result_path)
    need(input["schema"]=="stellar-forge.zarr-receiving-input.v1" and result["state"]=="NATIVE_COMPLETE","Complete original native result required")
    need(result["operationId"]==input["operationId"] and result["inputSha256"]==digest(input_bytes),"Original operation/result input changed")
    need(identity(input["sourceManifest"]["file"])["sha256"]==input["sourceManifest"]["sha256"],"Original installed source manifest changed")
    need(identity(input["engineArchive"]["file"])=={k:input["engineArchive"][k] for k in ("bytes","sha256")},"Selected original source archive changed")
    return input,result
def publication_rows(input,result,merchant):
    selected=[]
    for key,frozen_id in result["frozen"].items():
        value=merchant[key]
        runs=[value["first"],value["second"]] if key=="primary" else [value["publication"]]
        selected.append({"id":key,"frozenId":frozen_id,"rows":value["rows"],"resultId":value["resultId"],
                         "runs":[{k:r[k] for k in ("planId","runId","snapshot","rows","valuesSha256")} for r in runs]})
    return selected
def new_plan(input_path,result_path,root,input,result):
    merchant=read(result["merchant"]["file"]);apps=read(result["applications"]["file"])
    need(merchant["state"]=="COMPLETE" and apps["state"]=="PASS","All original consumers must finish before packaging")
    need(identity(result["merchant"]["file"])=={k:result["merchant"][k] for k in ("bytes","sha256")},"Complete merchant result changed")
    need(identity(result["applications"]["file"])["sha256"]==result["applications"]["sha256"],"Complete Applications result changed")
    rows=[
      plan_row("source-workspace.zip",merchant["currentSourcePacket"]["path"],"native-source-workspace"),
      plan_row("programme-result.json",result_path,"original-receiving-result"),
      plan_row("receiving-input.json",input_path,"private-original-host-selection"),
      plan_row("engine/source-manifest.json",input["sourceManifest"]["file"],"original-selected-source-manifest"),
      plan_row("engine/merchant-source.tar.gz",input["engineArchive"]["file"],"original-selected-distribution"),
      plan_row("START.py",HERE/"START.py","whole-handover-entry"),
      plan_row("RECEIVING.md",HERE.parent/"RECEIVING.md","complete-operator-handover")
    ]
    source_manifest=read(input["sourceManifest"]["file"])
    for entry in source_manifest["files"]:
        if entry["path"].startswith(SDK):
            row=plan_row("operator/"+entry["path"][len(SDK):],Path(input["sourceRoot"])/entry["path"],"complete-selected-zarr-source")
            need(row["sha256"]==entry["sha256"] and row["bytes"]==entry["bytes"],"Selected operator source changed")
            rows.append(row)
    need(any(row["path"]=="operator/python/packet.py" for row in rows),"The complete original native packet application is required")
    original_stage=Path(input["sourceStage"]["resultFile"]).parent
    rows+=scan(original_stage,"original-source-stage","original-source-stage-history")
    merchant_root=Path(result["merchant"]["file"]).parent
    rows+=scan(merchant_root,"receiving/merchant","complete-original-merchant-receiving",("current-source-received","source-receiving"))
    rows+=scan(Path(result["applications"]["file"]).parent,"receiving/applications","complete-original-managed-receiving")
    for dirname in ("publishers","datasets","operator-publisher-requests"):
        directory=Path(input["workspaceDirectory"])/dirname
        if directory.exists():rows+=scan(directory,"workspace-additions/"+dirname,"original-native-publisher-state")
    rows.sort(key=lambda x:x["path"]);need(len(rows)<=start.MAX_FILES and len({r["path"] for r in rows})==len(rows),"Unique complete handover members")
    need(sum(r["bytes"] for r in rows)<start.MAX_BYTES,"Whole handover exceeds its declared bound")
    packet=next(r for r in rows if r["path"]=="source-workspace.zip")
    need({k:packet[k] for k in ("bytes","sha256")}=={k:merchant["currentSourcePacket"][k] for k in ("bytes","sha256")},"The completed native source packet changed")
    manifest={"schema":start.SCHEMA,"state":"COMPLETE","operationId":input["operationId"],"inputSha256":result["inputSha256"],
       "workspace":result["workspace"],"sourceManifestSha256":input["sourceManifest"]["sha256"],
       "engineArchive":{k:input["engineArchive"][k] for k in ("bytes","sha256")},"nativePacket":{k:packet[k] for k in ("bytes","sha256")},
       "publisherSelections":publication_rows(input,result,merchant),"private":True,
       "scope":{"nativeSource":"Original retained metadata, raw stores, typed values, accepted reviews, frozen sources and SQLite history.",
                "publisher":"Complete original two ordered publications and temperature publication; source bindings are relative to each publisher workspace.",
                "merchant":"Closed original SF82 release and customer/Applications histories. Host listener and release runtime declarations remain historical; receiving never restarts them automatically.",
                "customer":"Six generated customer files are separately available in receiving/merchant/received-client.",
                "source":"Complete selected original engine archive, exact manifest and complete Zarr source."},
       "files":[{k:v for k,v in row.items() if k!="source"} for row in rows]}
    manifest_bytes=encoded(manifest)
    return {"schema":"stellar-forge.zarr-complete-archive-plan.v1","operationId":input["operationId"],"inputSha256":result["inputSha256"],
            "result":identity(result_path),"manifest":manifest,"manifestIdentity":{"bytes":len(manifest_bytes),"sha256":digest(manifest_bytes)},"files":rows}
def write_archive(path,plan):
    with zipfile.ZipFile(path,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
        for row in plan["files"]:
            need(identity(row["source"])=={k:row[k] for k in ("bytes","sha256")},"Original closed file changed: "+row["path"])
            info=zipfile.ZipInfo(row["path"],(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=(stat.S_IFREG|0o600|(0o100 if row["executable"] else 0))<<16
            with archive.open(info,"w",force_zip64=row["bytes"]>=2*1024*1024*1024) as out,open(row["source"],"rb") as source:
                while part:=source.read(start.CHUNK):out.write(part)
            need(identity(row["source"])=={k:row[k] for k in ("bytes","sha256")},"Original closed file changed while copying")
        info=zipfile.ZipInfo("HANDOVER.json",(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(stat.S_IFREG|0o600)<<16
        archive.writestr(info,encoded(plan["manifest"]))
    fd=os.open(path,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    os.chmod(path,0o600)
    # Cross-file closure: every original member is still the frozen input.
    for row in plan["files"]:need(identity(row["source"])=={k:row[k] for k in ("bytes","sha256")},"The selected closed source inventory changed")
def build(input_path,result_path,directory):
    input,result=binding(input_path,result_path);root=private(Path(directory),True)
    fd=os.open(root/"package.lock",os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        plan_file=root/"archive-plan.json";receipt_file=root/"package-result.json";archive_file=root/"Zarr_Complete_Receiving.zip"
        if plan_file.exists():
            plan=read(plan_file);need(plan["operationId"]==input["operationId"] and plan["inputSha256"]==result["inputSha256"] and plan["result"]==identity(result_path),"Retain the original archive basis")
        else:
            plan=new_plan(input_path,result_path,root,input,result);immutable(plan_file,plan)
        if archive_file.exists():
            checked=start.inspect_archive(archive_file)
            need(checked["manifest"]==plan["manifestIdentity"],"Preserve different completed handover")
        else:
            # Adopt a completed unpublished attempt from this same frozen plan.
            candidate=None
            for old in sorted(root.glob("Zarr_Complete_Receiving.*.partial")):
                try:checked=start.inspect_archive(old)
                except (ValueError,zipfile.BadZipFile,EOFError):continue
                need(checked["manifest"]==plan["manifestIdentity"],"Preserve a different complete partial handover")
                candidate=old;break
            if candidate is None:
                candidate=root/("Zarr_Complete_Receiving."+str(uuid.uuid4())+".partial")
                write_archive(candidate,plan);checked=start.inspect_archive(candidate)
                need(checked["manifest"]==plan["manifestIdentity"],"Complete archive differs from its frozen inventory")
            os.link(candidate,archive_file);sync(root)
            a=candidate.lstat();b=archive_file.lstat();need((a.st_dev,a.st_ino)==(b.st_dev,b.st_ino),"Original archive publication changed")
            candidate.unlink();sync(root)
        # Reconcile the exact publication window without removing other partials.
        for old in root.glob("Zarr_Complete_Receiving.*.partial"):
            a=old.lstat();b=archive_file.lstat()
            if stat.S_ISREG(a.st_mode) and (a.st_dev,a.st_ino)==(b.st_dev,b.st_ino):old.unlink();sync(root)
        checked=start.inspect_archive(archive_file)
        need(checked["manifest"]==plan["manifestIdentity"],"Complete original archive verification")
        receipt={"schema":"stellar-forge.zarr-complete-package-result.v1","state":"COMPLETE","operationId":input["operationId"],"inputSha256":result["inputSha256"],
                 "archive":{"file":str(archive_file),**checked["archive"]},"manifest":checked["manifest"],"files":len(plan["files"])+1,
                 "workspace":result["workspace"],"sourceManifestSha256":input["sourceManifest"]["sha256"]}
        immutable(receipt_file,receipt);return receipt
    finally:os.close(fd)
if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("command",choices=["build"]);p.add_argument("--input",required=True);p.add_argument("--result",required=True);p.add_argument("--directory",required=True)
    a=p.parse_args()
    try:print(json.dumps(build(a.input,a.result,a.directory),separators=(",",":")),flush=True)
    except Exception as e:print(json.dumps({"state":"NOT_COMPLETE","code":"ZARR_COMPLETE_PACKAGE","message":str(e)}),file=sys.stderr,flush=True);raise SystemExit(2)
