"""Complete original text-source selection for an ODR offline workbench."""
from __future__ import annotations
import os, subprocess, contextlib
from pathlib import Path
from files import *
_original_locked=locked
_ACTIVE_LEASES=set()
@contextlib.contextmanager
def locked(*args,**kwargs):
    with _original_locked(*args,**kwargs) as fd:
        _ACTIVE_LEASES.add(fd)
        try:yield fd
        finally:_ACTIVE_LEASES.discard(fd)
def inherited_leases():return tuple(sorted(_ACTIVE_LEASES))
APPLICATION_SCHEMA="commons.odr-alpha-application.v1"
BRIDGE_FILES=("files.py","source.py","manage.py","operations.py","launch.py","engine.mjs","host.mjs")
REQUIRED=("src/core.mjs","src/app.js","src/template.html","src/style.css","src/hash.cjs","src/dataverse-contract.mjs","source/ACAS_SOURCE_SEED.json","source/DATAVERSE_SOURCES.json","operating/build.mjs","README.md","LICENSE")
def application_value(value):
    exact(value,("schema","files","manifest"),("schema","files","manifest"))
    need(value["schema"]==APPLICATION_SCHEMA and isinstance(value["files"],dict) and isinstance(value["manifest"],dict),"source_schema","Select the complete original APPLICATION_SOURCE.json.")
    need(set(value["files"])==set(value["manifest"]) and set(REQUIRED)<=set(value["files"]),"source_incomplete","Include every original runtime, source, build, guide and license member.")
    total=0
    for name,content in value["files"].items():
        relative(name)
        need((name.startswith(("src/","source/","docs/","operating/")) or name in ("README.md","LICENSE")) and isinstance(content,str),"source_member","Select complete original runtime text; keep commercial/private case files in their existing case.")
        raw=content.encode();total+=len(raw)
        need(len(raw)<=MAX_SOURCE_FILE and digest(raw)==value["manifest"][name],"source_changed","Original source bytes differ from their selected manifest.")
    need(total<=MAX_SOURCE_BYTES,"source_limit","The complete selected original source exceeds 128 MiB.")
    return value
def selected(path):
    raw=read(path,MAX_SOURCE_BYTES);return application_value(decode(raw)),{"path":str(absolute(path)),"bytes":len(raw),"sha256":digest(raw)}
def bridge_manifest(root):
    return [{"path":name,"bytes":file_identity(root/name)["bytes"],"sha256":file_identity(root/name)["sha256"]} for name in BRIDGE_FILES]
def source_id(application,bridge):
    return digest(encoded({"application":application,"bridge":bridge}))
def node_selection(path):
    p=absolute(path).resolve(strict=True);info=file_identity(p)
    need(os.access(p,os.X_OK),"node_executable","Select the actual installed Node executable.")
    reply=subprocess.run([str(p),"--version"],capture_output=True,text=True,timeout=30)
    need(reply.returncode==0 and reply.stdout.strip().startswith("v"),"node_version","The selected original Node runtime did not report its version.")
    major=int(reply.stdout.strip().split(".")[0][1:]);need(major>=20,"node_version","Node 20 or later is required.")
    return {"path":str(p),"version":reply.stdout.strip(),"bytes":info["bytes"],"sha256":info["sha256"]}
def verify_node(node):
    actual=file_identity(node["path"]);need(actual["bytes"]==node["bytes"] and actual["sha256"]==node["sha256"],"node_changed","The selected installed Node executable changed.")
def materialize(root,application,bridge_root,bridge):
    sid=source_id(application,bridge);edition=directory(root/"editions"/sid,create=True,private=True)
    once(edition/"APPLICATION.json",encoded(application));once(edition/"BRIDGE.json",encoded(bridge))
    for name,content in application["files"].items():once(edition/"source"/name,content.encode())
    for row in bridge:
        need(row["path"] in BRIDGE_FILES,"bridge_member","Select the complete original native bridge.")
        copy_file(bridge_root/row["path"],edition/"bridge"/row["path"],row)
    need(set(row["path"] for row in bridge)==set(BRIDGE_FILES),"bridge_incomplete","Retain the complete native bridge.")
    read_edition(root,sid)
    return sid
def read_edition(root,sid):
    need(isinstance(sid,str) and re.fullmatch(r"[a-f0-9]{64}",sid),"source_identity","Select an exact complete source edition.")
    edition=root/"editions"/sid;app=application_value(read_json(edition/"APPLICATION.json",MAX_SOURCE_BYTES));bridge=read_json(edition/"BRIDGE.json")
    need(source_id(app,bridge)==sid,"source_changed","The selected whole source edition changed.")
    need(set(r["path"] for r in bridge)==set(BRIDGE_FILES) and len(bridge)==len(BRIDGE_FILES),"bridge_changed","The complete original bridge membership changed.")
    for name,content in app["files"].items():need(read(edition/"source"/name)==content.encode(),"source_changed","An installed original source member changed.")
    for row in bridge:
        current=file_identity(edition/"bridge"/relative(row["path"]))
        need(current["bytes"]==row["bytes"] and current["sha256"]==row["sha256"],"bridge_changed","An original installed bridge member changed.")
    return edition,app,bridge
def build(root,sid,node):
    edition,application,_=read_edition(root,sid);verify_node(node)
    if (edition/"BUILD.json").exists():
        receipt=read_json(edition/"BUILD.json");actual=file_identity(edition/"built"/"ODR_Alpha_Workbench.html")
        need(actual["sha256"]==receipt["html"]["sha256"] and actual["bytes"]==receipt["html"]["bytes"],"built_source_changed","The original standalone application changed.")
        need(application_value(read_json(edition/"built"/"APPLICATION_SOURCE.json",MAX_SOURCE_BYTES))==application,"built_source_changed","The builder omitted or changed selected original source.")
        return receipt
    out=directory(edition/"built",create=True,private=True)
    reply=subprocess.run([node["path"],str(edition/"source"/"operating"/"build.mjs"),str(out)],cwd=edition/"source",capture_output=True,timeout=120,pass_fds=inherited_leases())
    need(reply.returncode==0,"original_build_failed","The complete original builder did not finish; its input remains retained.")
    receipt=read_json(out/"BUILD_RESULT.json")
    need(application_value(read_json(out/"APPLICATION_SOURCE.json",MAX_SOURCE_BYTES))==application,"built_source_changed","The original builder must carry every selected original source member.")
    actual=file_identity(out/"ODR_Alpha_Workbench.html")
    need(actual["sha256"]==receipt["html"]["sha256"] and actual["bytes"]==receipt["html"]["bytes"],"built_source_changed","The full built HTML differs from its original result.")
    save(edition/"BUILD.json",receipt);return receipt
def engine(root,sid,node,operation,args):
    edition,application,_=read_edition(root,sid);verify_node(node)
    request={"source":str(edition/"source"),"application":application,"operation":operation,"args":args}
    reply=subprocess.run([node["path"],str(edition/"bridge"/"engine.mjs")],input=encoded(request),capture_output=True,cwd=edition/"source",timeout=120,pass_fds=inherited_leases())
    try:result=decode(reply.stdout)
    except Exception:raise WorkbenchError("original_engine_failed","The original workspace engine did not return its complete result.")
    if not result.get("ok"):
        error=result.get("error") or {};exc=WorkbenchError(error.get("code","original_engine_failed"),error.get("message","Original workspace receiving failed."));exc.detail=error;raise exc
    need(reply.returncode==0,"original_engine_exit","Receive the retained original engine result before retrying.")
    return result["result"]
