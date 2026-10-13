"""MIT. Receive one exact saved later-source service-choice review and reopen it.

This continues the original Directory workspace. It never acquires provider data,
creates a clinical referral or assumes provider availability. Applying a successor
requires a separate complete, explicitly confirmed native apply input.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import sys
from contextlib import contextmanager
from directory_runtime import InputError,ConflictError,source,original_workspace,private_directory,safe_read
from directory_workspace import Workspace
import directory_schema as schema

MAX=2147483648
def identity(path):
    path=Path(path)
    return {"bytes":original_workspace.regular(path,MAX).st_size,
            "sha256":original_workspace.file_digest(path,MAX)}

def sync(directory):
    fd=os.open(directory,os.O_RDONLY|getattr(os,"O_DIRECTORY",0))
    try:os.fsync(fd)
    finally:os.close(fd)

def folder(path):
    path=Path(os.path.abspath(path))
    if path.parent!=path:folder(path.parent)
    if not path.exists():
        path.mkdir(mode=0o700);sync(path.parent)
    if path.is_symlink()or not path.is_dir()or path.resolve()!=path:
        raise InputError("Use an ordinary Directory receiving path")
    return path

def install(destination,original):
    destination=Path(destination);expected=identity(original);folder(destination.parent)
    if destination.exists():
        if identity(destination)!=expected:raise ConflictError("A retained receiving file differs: "+destination.name)
        return expected
    pending=None
    try:
        fd,name=tempfile.mkstemp(prefix=".selection-refresh-",dir=destination.parent);pending=Path(name)
        with os.fdopen(fd,"wb")as out,Path(original).open("rb")as inp:
            shutil.copyfileobj(inp,out,1024*1024);out.flush();os.fsync(out.fileno())
        if identity(pending)!=expected or identity(original)!=expected:raise InputError("Original receiving bytes changed")
        try:os.link(pending,destination)
        except FileExistsError:
            if identity(destination)!=expected:raise ConflictError("Another receiving file differs")
        sync(destination.parent);return expected
    finally:
        if pending is not None:
            pending.unlink(missing_ok=True);sync(destination.parent)

def retain_json(destination,value):
    with tempfile.TemporaryDirectory(prefix=".refresh-json-",dir=destination.parent)as temp:
        original=Path(temp)/"input.json"
        original_workspace.private_write(original,source.jbytes(value))
        return install(destination,original)

@contextmanager
def owner_lock(directory):
    path=directory/".selection-refresh.lock";fd=None;owned=None
    try:
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        owned=os.fstat(fd);os.write(fd,str(os.getpid()).encode());os.fsync(fd);sync(directory)
        yield
    finally:
        failure=sys.exc_info()[1]
        if fd is not None:
            cleanup=None
            try:
                try:current=path.lstat()
                except FileNotFoundError:current=None
                if current is not None and (current.st_dev,current.st_ino)==(owned.st_dev,owned.st_ino):
                    path.unlink();sync(directory)
            except BaseException as error:cleanup=error
            try:os.close(fd)
            except BaseException as error:
                if cleanup is None:cleanup=error
            if cleanup is not None:
                if failure is None:raise cleanup
                failure.add_note("Owned receiving-lock cleanup: "+str(cleanup))

def operate(args):
    root=Path(os.path.abspath(args.workspace));out=Path(os.path.abspath(args.output))
    if root==out or root in out.parents or out in root.parents:raise InputError("Keep receiving output separate from the original workspace")
    root=folder(root)if root.exists()else root
    if not root.is_dir():raise InputError("Open the existing original Directory workspace")
    ident=source.identity(args.refresh_id)
    apply_bytes=safe_read(Path(args.apply_input),schema.MAX_RECORD)if args.apply_input else None
    applying=source.json_value(apply_bytes)if apply_bytes is not None else None
    if applying is not None:
        applying=schema.input_value("selection_refresh_apply",applying)
        if applying["refreshId"]!=ident:raise InputError("The accepting input selects another saved refresh")
    binding={"schema":"stellar-forge.directory-selection-refresh-receiving.v1","workspace":str(root),
        "workspaceId":args.expected_workspace_id,"refreshId":ident,
        "applyInput":None if apply_bytes is None else{"bytes":len(apply_bytes),"sha256":source.sha(apply_bytes)}}
    if out.exists()and any(out.iterdir())and not(out/"receiving-identity.json").exists():
        raise InputError("Use a fresh output or the exact bound receiving directory")
    out=folder(out)
    with owner_lock(out):
        retain_json(out/"receiving-identity.json",binding)
        with Workspace(root)as ws:
            if ws.workspace_id!=args.expected_workspace_id:raise InputError("The source workspace UUID differs")
            review=ws.directory_record("selectionRefreshes",ident)
            report=ws.directory_selection_refresh_report(ident)
            before=ws.directory_record("selections",review["selectionId"])
            files={}
            if apply_bytes is not None:
                with tempfile.TemporaryDirectory(dir=out)as temp:
                    p=Path(temp)/"apply.json";original_workspace.private_write(p,apply_bytes)
                    files["Apply_Input.json"]=install(out/"Apply_Input.json",p)
                successor=ws.apply_directory_selection_refresh(applying)
            else:successor=None
            files["Saved_Review.json"]=retain_json(out/"Saved_Review.json",review)
            files["Original_Choice.json"]=retain_json(out/"Original_Choice.json",before)
            if successor:files["Successor_Choice.json"]=retain_json(out/"Successor_Choice.json",successor)
            for name,expected in review["files"].items():
                p,_=ws.directory_selection_refresh_file(ident,name)
                if identity(p)!={k:expected[k]for k in ("bytes","sha256")}:raise InputError("Original report bytes differ")
                files[name]=install(out/name,p)
            archive=out/"Directory_Selection_Refresh_Workspace.zip"
            if not archive.exists():
                with tempfile.TemporaryDirectory(prefix=".refresh-workspace-",dir=out)as temp:
                    p=Path(temp)/archive.name;ws.export_workspace(p);install(archive,p)
            files[archive.name]=identity(archive)
        restored=out/"reopened-workspace"
        with Workspace(restored,create=not restored.exists())as received:
            received.import_workspace(archive)
            if received.workspace_id!=args.expected_workspace_id:raise InputError("Receiving changed the original UUID")
            if received.directory_record("selectionRefreshes",ident)!=review:raise InputError("Receiving changed the complete saved refresh")
            if received.directory_record("selections",before["id"])!=before:raise InputError("Receiving changed the original choice")
            if source.lexical_json(received.directory_selection_refresh_report(ident))!=source.lexical_json(report):raise InputError("Receiving changed the full original report")
            if successor and received.apply_directory_selection_refresh(applying)!=successor:raise InputError("Reopened apply did not recover the same successor")
        with Workspace(restored)as reopened:
            if reopened.directory_record("selectionRefreshes",ident)!=review:raise InputError("Cold reopening changed the saved review")
        result={**binding,"state":"complete","reviewId":ident,"originalSelectionId":before["id"],
            "successorSelectionId":successor["id"]if successor else None,
            "summary":review["summary"],"files":files,"reopenedWorkspace":str(restored),
            "opening":"START_HERE.html","visualReview":"Pending actual producing-operator use of every outgoing attachment"}
        retain_json(out/"COMPLETE.json",result)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--workspace",required=True);p.add_argument("--expected-workspace-id",required=True)
    p.add_argument("--refresh-id",required=True);p.add_argument("--output",required=True)
    p.add_argument("--apply-input",help="Exact complete native apply input with confirm=true, accepting actor and saved report SHA")
    operate(p.parse_args());return 0
if __name__=="__main__":raise SystemExit(main())
