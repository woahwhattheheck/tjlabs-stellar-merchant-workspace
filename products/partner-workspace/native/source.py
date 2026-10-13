"""Complete original mobility and education runtime source selection."""
from __future__ import annotations
import contextlib,importlib,os,re,subprocess,sys
from pathlib import Path
from files import *
SOURCE_SCHEMA="stellar-forge.partner-product-source.v1"
EDITION_SCHEMA="stellar-forge.partner-source-edition.v1"
BRIDGE_FILES=("files.py","source.py","manage.py","operations.py","launch.py")
REQUIRED=("workbench/__init__.py","workbench/core.py","workbench/app.py","workbench/mobility.py","workbench/education.py","run.py","static/app.js","static/index.html","static/style.css","README.md","LICENSE")
def manifest_value(value):
    exact(value,("schema","title","product","files","provenance"),("schema","title","product","files"))
    need(value["schema"]==SOURCE_SCHEMA and value["product"] in ("mobility","education"),"source_schema","Select a complete original mobility or education source manifest.")
    need(isinstance(value["title"],str) and 1<=len(value["title"])<=240,"source_title","Give the original application a title.")
    rows=value["files"];need(isinstance(rows,list) and 1<=len(rows)<=10000,"source_members","Select every complete runtime member.")
    paths=set();total=0
    for row in rows:
        exact(row,("path","bytes","sha256"),("path","bytes","sha256"))
        path=relative(row["path"])
        need(path not in paths and (path.startswith(("workbench/","static/")) or path in ("run.py","README.md","LICENSE")) and "__pycache__" not in Path(path).parts and (path=="LICENSE" or Path(path).suffix in (".py",".js",".css",".html",".md",".json",".txt")),"source_member","Select the complete runtime members supported by the original archive; keep commercial and receiving files in their original case.")
        need(isinstance(row["bytes"],int) and not isinstance(row["bytes"],bool) and 0<=row["bytes"]<=MAX_SOURCE_FILE and re.fullmatch(r"[a-f0-9]{64}",str(row["sha256"])),"source_member","Retain complete file identities.")
        paths.add(path);total+=row["bytes"]
    need(set(REQUIRED)<=paths and total<=MAX_SOURCE_BYTES,"source_incomplete","Include the original runtime, static application, guide and LICENSE.")
    return value
def selected_manifest(path):
    raw=read(path,8*1024*1024);return manifest_value(decode(raw)),{"path":str(absolute(path)),"bytes":len(raw),"sha256":digest(raw)}
def bridge_manifest(root):
    return [{"path":name,**{k:v for k,v in file_identity(absolute(root)/name).items() if k in ("bytes","sha256")}} for name in BRIDGE_FILES]
def source_identity(manifest,bridge):
    return digest(encoded({"source":manifest,"bridge":bridge}))
def check_source(root,manifest):
    root=directory(root)
    for row in manifest["files"]:
        actual=file_identity(root/row["path"],MAX_SOURCE_FILE)
        need(actual["bytes"]==row["bytes"] and actual["sha256"]==row["sha256"],"source_changed","Original source member changed: "+row["path"])
    return root
def materialize_edition(root,source_root,manifest,bridge_root,bridge):
    manifest_value(manifest);check_source(source_root,manifest)
    need(bridge==bridge_manifest(bridge_root),"bridge_changed","Select the complete original native bridge.")
    identity=source_identity(manifest,bridge);edition=directory(absolute(root)/"editions"/identity,create=True,private=True)
    for rows,src,dst in ((manifest["files"],absolute(source_root),edition/"source"),(bridge,absolute(bridge_root),edition/"bridge")):
        for row in rows:copy_file(src/row["path"],dst/row["path"],row)
    once(edition/"SOURCE.json",encoded(manifest));once(edition/"BRIDGE.json",encoded(bridge))
    value={"schema":EDITION_SCHEMA,"source_identity":identity,"product_source_identity":digest(encoded(manifest)),"directory":str(edition),"source":str(edition/"source"),"bridge":str(edition/"bridge")}
    once(edition/"EDITION.json",encoded(value));return value
def read_edition(root,identity,verify=True):
    need(isinstance(identity,str) and re.fullmatch(r"[a-f0-9]{64}",identity),"source_identity","Select an original source edition.")
    path=directory(absolute(root)/"editions"/identity);value=read_json(path/"EDITION.json")
    manifest=manifest_value(read_json(path/"SOURCE.json"));bridge=read_json(path/"BRIDGE.json")
    expected={"schema":EDITION_SCHEMA,"source_identity":identity,"product_source_identity":digest(encoded(manifest)),"directory":str(path),"source":str(path/"source"),"bridge":str(path/"bridge")}
    need(value==expected and [r.get("path") for r in bridge]==list(BRIDGE_FILES) and source_identity(manifest,bridge)==identity,"source_edition_changed","The complete source edition binding changed.")
    if verify:
        check_source(path/"source",manifest);need(bridge_manifest(path/"bridge")==bridge,"bridge_changed","The installed native bridge changed.")
    return value,manifest
def python_selection(value):
    requested=absolute(value);resolved=requested.resolve(strict=True)
    need(resolved.is_file() and os.access(resolved,os.X_OK),"python_unavailable","Select an installed Python executable.")
    result=subprocess.run([str(resolved),"-B","-c","import json,pathlib,sqlite3,sys;print(json.dumps({'path':str(pathlib.Path(sys.executable).resolve()),'version':list(sys.version_info[:3]),'sqlite':sqlite3.sqlite_version}))"],capture_output=True,timeout=30)
    need(result.returncode==0,"python_unavailable","The selected Python could not load its standard SQLite runtime.")
    selected=decode(result.stdout);need(selected["path"]==str(resolved) and selected["version"][:2]>=[3,11],"python_version","Select Python 3.11 or later.")
    return selected
@contextlib.contextmanager
def application(root,selected):
    edition,manifest=read_edition(root,selected["source_identity"]);source=Path(edition["source"]);before=list(sys.path)
    names=[name for name in sys.modules if name=="workbench" or name.startswith("workbench.")]
    saved={name:sys.modules.pop(name) for name in names}
    try:
        sys.path.insert(0,str(source));importlib.invalidate_caches()
        core=importlib.import_module("workbench.core");app=importlib.import_module("workbench.app")
        for module in (core,app):
            need(Path(module.__file__).resolve().is_relative_to(source/"workbench"),"original_module_changed","The original module resolved outside its selected complete source.")
        yield {"edition":edition,"manifest":manifest,"source":source,"core":core,"app":app,"Workspace":core.Workspace,"restore":core.restore}
    finally:
        for name in list(sys.modules):
            if name=="workbench" or name.startswith("workbench."):sys.modules.pop(name,None)
        sys.modules.update(saved);sys.path[:]=before;importlib.invalidate_caches()
