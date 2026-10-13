#!/usr/bin/env python3
"""Materialize the original receiving capsule and run its unchanged programs."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
from datetime import datetime, timezone

def git_blob(data):
    return hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()

def write_json(path, value):
    data=(json.dumps(value,indent=2,ensure_ascii=False)+"\n").encode()
    with path.open("xb") as handle:
        os.chmod(path,0o600)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capsule-object",required=True,type=Path,
        help="Original GitHub git/blobs JSON for the retained capsule")
    parser.add_argument("--out",required=True,type=Path,help="New persistent private receiving directory")
    parser.add_argument("--sdk-profile",required=True,type=Path,
        help="Existing package.json used by createRequire to resolve the original Stellar SDK")
    parser.add_argument("--sdk-node-modules",type=Path,
        help="Existing node_modules for the original sf88 component")
    parser.add_argument("--mcp-node-modules",type=Path,
        help="Existing node_modules for the original MCP component")
    parser.add_argument("--node",default="node")
    parser.add_argument("--correction-object",type=Path,help="Pinned original Git blob JSON for an explicit maintained source correction")
    parser.add_argument("--program",action="append",help="Run a named original program; may be repeated")
    dependency_group=parser.add_mutually_exclusive_group(required=True)
    dependency_group.add_argument("--dependencies",type=Path,help="Original decoded pinned dependency capsule")
    dependency_group.add_argument("--dependencies-object",type=Path,help="Original GitHub git/blobs JSON for the dependency capsule")
    args=parser.parse_args()
    manifest=json.loads(Path(__file__).with_name("source.json").read_text())
    original=json.loads(args.capsule_object.read_text())
    if original.get("sha")!=manifest["sourceCapsule"]:
        raise ValueError("Select the retained original source capsule")
    if original.get("encoding")=="base64":
        raw=base64.b64decode("".join(original["content"].split()),validate=True)
    elif original.get("encoding") in ("utf-8","utf8"):
        raw=original["content"].encode()
    else:
        raise ValueError("Expected original Git blob content and encoding")
    if len(raw)!=manifest["sourceCapsuleBytes"] or git_blob(raw)!=manifest["sourceCapsule"]:
        raise ValueError("The original capsule bytes changed")
    capsule=json.loads(raw)
    expected={row["path"]:row for row in manifest["files"]}
    files=capsule.get("files",[])
    if capsule.get("sourceCommit")!=manifest["sourceCommit"] or len(files)!=len(expected):
        raise ValueError("The original capsule source selection changed")
    seen=set()
    for row in files:
        name=row.get("path");path=PurePosixPath(name or "")
        if name not in expected or name in seen or path.is_absolute() or ".." in path.parts:
            raise ValueError("The original source file inventory changed")
        content=row["content"].encode()
        if git_blob(content)!=expected[name]["gitBlob"]:
            raise ValueError("Original source bytes changed: "+name)
        seen.add(name)
    if args.dependencies_object is not None:
        dependency_object=json.loads(args.dependencies_object.read_text())
        if dependency_object.get("sha")!=manifest["dependencyCapsule"]:
            raise ValueError("Select the retained original dependency capsule")
        if dependency_object.get("encoding")=="base64":
            dependency_raw=base64.b64decode("".join(dependency_object["content"].split()),validate=True)
        elif dependency_object.get("encoding") in ("utf-8","utf8"):
            dependency_raw=dependency_object["content"].encode()
        else:
            raise ValueError("Expected original dependency Git blob content and encoding")
    else:
        dependency_raw=args.dependencies.read_bytes()
    if len(dependency_raw)!=manifest["dependencyCapsuleBytes"] or git_blob(dependency_raw)!=manifest["dependencyCapsule"]:
        raise ValueError("The original dependency capsule bytes changed")
    dependencies=json.loads(dependency_raw)
    if dependencies.get("sourceCommit")!=manifest["sourceCommit"] or dependencies.get("sourceTree")!=manifest["sourceTree"]:
        raise ValueError("The dependency capsule must use the original source commit and tree")
    dependency_files=dependencies.get("files",[])
    for row in dependency_files:
        name=row.get("path");path=PurePosixPath(name or "")
        if not name or name in seen or path.is_absolute() or ".." in path.parts:
            raise ValueError("Duplicate or invalid original dependency path")
        content=row["content"].encode()
        if git_blob(content)!=row["gitBlob"]:
            raise ValueError("Original dependency bytes changed: "+name)
        seen.add(name)
    corrections=[]
    correction_receipt=None
    if args.correction_object is not None:
        pin=manifest.get("sourceCorrection")
        if not isinstance(pin,dict):
            raise ValueError("This original receiver has no reviewed source correction")
        correction_object=json.loads(args.correction_object.read_text())
        if correction_object.get("sha")!=pin["gitBlob"] or correction_object.get("encoding")!="base64":
            raise ValueError("Select the exact maintained source correction blob")
        correction_raw=base64.b64decode("".join(correction_object["content"].split()),validate=True)
        if git_blob(correction_raw)!=pin["gitBlob"]:
            raise ValueError("Maintained source correction bytes changed")
        correction=json.loads(correction_raw)
        if correction.get("schema")!="commons.original-source-receiving-correction.v1" or correction.get("originalSourceCommit")!=manifest["sourceCommit"]:
            raise ValueError("Source correction does not belong to this original operation")
        corrections=correction.get("files",[])
        if not isinstance(corrections,list) or not corrections:
            raise ValueError("Source correction must retain its complete file inventory")
        original_files={row["path"]:row["content"].encode() for row in files+dependency_files}
        corrected=set()
        for row in corrections:
            name=row.get("path");path=PurePosixPath(name or "")
            if name not in original_files or name in corrected or path.is_absolute() or ".." in path.parts or name in manifest["programs"]:
                raise ValueError("Invalid maintained source correction path")
            content=row["content"].encode()
            if git_blob(original_files[name])!=row["originalGitBlob"] or git_blob(content)!=row["gitBlob"] or len(content)!=row["bytes"]:
                raise ValueError("Maintained correction does not match original and replacement bytes: "+name)
            corrected.add(name)
        correction_receipt={key:value for key,value in correction.items() if key!="files"}
        correction_receipt["gitBlob"]=pin["gitBlob"]
        correction_receipt["files"]=[{key:value for key,value in row.items() if key!="content"} for row in corrections]
    elif manifest.get("sourceCorrection"):
        raise ValueError("Supply the reviewed correction for this receiving continuation")
    programs=args.program or manifest["programs"]
    if len(programs)!=len(set(programs)) or any(name not in manifest["programs"] for name in programs):
        raise ValueError("Select unchanged original programs from the receiving manifest")
    profile=args.sdk_profile.resolve(strict=True)
    if not profile.is_file():
        raise ValueError("Select the existing SDK package profile")
    node=shutil.which(args.node)
    if node is None:
        raise ValueError("Node is unavailable")
    node_version=subprocess.check_output([node,"--version"],text=True).strip()
    if int(node_version.lstrip("v").split(".",1)[0])<22:
        raise ValueError("Use the original programs with Node 22 or later")
    out=args.out.absolute()
    out.mkdir(mode=0o700,parents=False,exist_ok=False)
    os.chmod(out,0o700)
    source=out/"source";source.mkdir(mode=0o700)
    results_dir=out/"results";results_dir.mkdir(mode=0o700)
    temporary=out/"runtime";temporary.mkdir(mode=0o700)
    for row in files+dependency_files:
        path=source/row["path"];path.parent.mkdir(parents=True,exist_ok=True)
        with path.open("xb") as handle:
            handle.write(row["content"].encode())
    for row in corrections:
        path=source/row["path"]
        if git_blob(path.read_bytes())!=row["originalGitBlob"]:
            raise ValueError("Original file changed before correction: "+row["path"])
        with path.open("wb") as handle:
            handle.write(row["content"].encode())
            handle.flush()
            os.fsync(handle.fileno())
    if correction_receipt is not None:
        write_json(out/"source-correction.json",correction_receipt)
    modules=[
        ("stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node_modules",
            args.sdk_node_modules or (profile.parent/"node_modules")),
        ("stellar-forge/mcp-paid-agent/node_modules",args.mcp_node_modules),
    ]
    for relative,candidate in modules:
        if candidate is None:continue
        location=candidate.resolve(strict=True)
        if not location.is_dir():raise ValueError("Select an existing native node_modules directory")
        destination=source/relative;destination.parent.mkdir(parents=True,exist_ok=True)
        destination.symlink_to(location,target_is_directory=True)
    env=os.environ.copy()
    env.update({"PYTHONDONTWRITEBYTECODE":"1","SCF_INVOICE_SDK_PACKAGE":str(profile),
        "TMPDIR":str(temporary),"SCF_MCP_RECEIVABLES_TMP":str(temporary)})
    identity={"sourceCommit":manifest["sourceCommit"],"sourceTree":manifest["sourceTree"],
        "sourceCapsule":manifest["sourceCapsule"],"sourceFiles":len(files),
        "trackedSourceFiles":sum(row["role"]=="original-source" for row in manifest["files"]),
        "dependencySourceFiles":len(dependency_files),
        "node":node_version,"startedAt":datetime.now(timezone.utc).isoformat(),
        "programs":programs,"sourceCorrection":correction_receipt}
    write_json(out/"source-received.json",identity)
    print(json.dumps({"event":"SOURCE_RECEIVED","directory":str(out),**identity}),flush=True)
    results=[]
    for name in programs:
        print(json.dumps({"event":"PROGRAM_START","program":name}),flush=True)
        completed=subprocess.run([node,str(source/name)],cwd=source,env=env,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        result={"program":name,"exitCode":completed.returncode,"stdout":completed.stdout,
            "stderr":completed.stderr,"completedAt":datetime.now(timezone.utc).isoformat()}
        target=results_dir/(name+".json")
        write_json(target,result)
        results.append({"program":name,"exitCode":completed.returncode,"resultFile":str(target)})
        print(json.dumps({"event":"PROGRAM_COMPLETE",**results[-1]}),flush=True)
    report={**identity,"results":results,"completedAt":datetime.now(timezone.utc).isoformat()}
    write_json(out/"receiving-result.json",report)
    print(json.dumps({"event":"RECEIVING_COMPLETE","resultFile":str(out/"receiving-result.json"),**report}),flush=True)
    return 0 if all(row["exitCode"]==0 for row in results) else 1

if __name__=="__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"event":"RECEIVING_FAILED","code":type(error).__name__,"message":str(error)}),file=sys.stderr,flush=True)
        raise SystemExit(1)
