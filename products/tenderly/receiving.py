#!/usr/bin/env python3
"""MIT. Continue the original saved Tenderly case through its managed customer product."""
from __future__ import annotations
import argparse,hashlib,io,json,os,shutil,signal,stat,subprocess,sys,tarfile,time,zipfile
from pathlib import Path
SOURCE_COMMIT="b9d888ab2c417d956c804b9b9133ed86ac3c9c0a"
PACKAGE_SHA="8c4374a9cb0e1494a02769526871df0c0bf06162dd542449b1207a8e1f4893a5"
WORKSPACE_SHA="2eb50abf345d42992d214bbc0d7e3d89bac83b36bd96f877225acb52446fb0fa"
def sha(data):return hashlib.sha256(data).hexdigest()
def write(path,data):
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with path.open("xb") as output:
        os.chmod(path,0o600);output.write(data);output.flush();os.fsync(output.fileno())
def private_directory(path):
    if not path.is_absolute() or path.resolve()!=path:raise ValueError("Use an absolute canonical private directory")
    info=path.stat()
    if not path.is_dir() or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)&0o077:
        raise ValueError("Use an owned private directory with mode 0700")
def resources():
    result={}
    for name in ("memory.current","memory.max","memory.events","pids.current","pids.max"):
        try:result[name]=(Path("/sys/fs/cgroup")/name).read_text().strip()
        except OSError:pass
    return result
def group_members(group):
    members=[]
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():continue
        try:
            data=(entry/"stat").read_text().rsplit(")",1)[1].split()
            if int(data[2])==group and int(data[3])==group and data[0]!="Z":members.append(int(entry.name))
        except (OSError,ValueError,IndexError):pass
    return members
def retire_group(group):
    active=group_members(group)
    if active:
        try:os.killpg(group,signal.SIGTERM)
        except ProcessLookupError:pass
        until=time.monotonic()+10
        while group_members(group) and time.monotonic()<until:time.sleep(.1)
        if group_members(group):
            try:os.killpg(group,signal.SIGKILL)
            except ProcessLookupError:pass
            until=time.monotonic()+5
            while group_members(group) and time.monotonic()<until:time.sleep(.1)
    return {"ownedProcessGroup":group,"activeBeforeDrain":active,"activeAfterDrain":group_members(group)}
def copy_regular_tree(original,target):
    original=original.resolve()
    if not original.is_dir():raise ValueError("The original customer export directory is absent")
    target.mkdir(mode=0o700)
    for path in sorted(original.rglob("*")):
        info=path.lstat();relative=path.relative_to(original)
        if stat.S_ISLNK(info.st_mode):raise ValueError("Keep the original complete customer export as regular files")
        if path.is_dir():(target/relative).mkdir(mode=0o700,parents=True,exist_ok=True)
        elif path.is_file():write(target/relative,path.read_bytes())
        else:raise ValueError("The original customer export contains an unsupported entry")
def read_checkpoint(path):
    body=path.resolve().read_bytes()
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        entries=archive.infolist();names=[entry.filename for entry in entries]
        if len(set(names))!=len(names):raise ValueError("The saved customer ZIP contains duplicate members")
        for entry in entries:
            name=Path(entry.filename)
            if name.is_absolute() or ".." in name.parts or stat.S_ISLNK(entry.external_attr>>16):
                raise ValueError("The saved customer ZIP contains an unsafe member")
        manifest=json.loads(archive.read("files.json"))
        if manifest.get("schema")!="stellar-forge.tenderly-managed-customer-files.v1":
            raise ValueError("Use the complete original Tenderly customer or checkpoint ZIP")
        files=manifest["members"];directories=manifest["directories"]
        if set(names)!=set(files)|set(directories)|{"files.json"}:
            raise ValueError("The complete saved customer ZIP differs from its member manifest")
        selected={}
        for name,pin in files.items():
            data=archive.read(name)
            if len(data)!=pin["bytes"] or sha(data)!=pin["sha256"]:
                raise ValueError("The saved original customer member changed: "+name)
            if name=="original-workspace.tar.gz" or name.startswith(("customer-exports/node/","customer-exports/python/")):
                selected[name]=data
        if "original-workspace.tar.gz" not in selected:raise ValueError("The saved customer ZIP has no original workspace archive")
        for language in ("node","python"):
            if not any(name.startswith("customer-exports/"+language+"/") for name in selected):
                raise ValueError("The saved customer ZIP must retain both complete original customer exports")
        return {"sha256":sha(body),"files":selected,"directories":directories}
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root",required=True,type=Path)
    parser.add_argument("--directory",required=True,type=Path,help="New directory beneath an existing owned private parent")
    parser.add_argument("--checkpoint",type=Path,help="Complete saved customer or checkpoint ZIP; restores its original archive and both customer exports")
    parser.add_argument("--package",type=Path)
    parser.add_argument("--original-driver",required=True,type=Path,help="Existing original selected-case and private-environment definitions")
    parser.add_argument("--customer-node",type=Path)
    parser.add_argument("--customer-python",type=Path)
    parser.add_argument("--node",default="node")
    parser.add_argument("--node-modules",required=True,type=Path)
    parser.add_argument("--save-helper",type=Path,help="Current library_upload.py; saves the complete result and archive together")
    args=parser.parse_args()
    if args.checkpoint:
        if any((args.package,args.customer_node,args.customer_python)):
            parser.error("Select either a saved checkpoint ZIP or the three original input paths")
    elif not all((args.package,args.customer_node,args.customer_python)):
        parser.error("Provide --checkpoint or all of --package, --customer-node and --customer-python")
    private_directory(args.directory.parent)
    checkpoint=read_checkpoint(args.checkpoint) if args.checkpoint else None
    body=checkpoint["files"]["original-workspace.tar.gz"] if checkpoint else args.package.resolve().read_bytes()
    if len(body)!=55271 or sha(body)!=PACKAGE_SHA:raise ValueError("Use the unchanged original Tenderly workspace archive")
    manifest=json.loads(Path(__file__).with_name("receiving-source.json").read_text())
    if manifest["sourceCommit"]!=SOURCE_COMMIT:raise ValueError("Use the selected original receiving source")
    original_source=args.source_root.resolve()
    directory=args.directory;directory.mkdir(mode=0o700)
    source=directory/"source";source.mkdir(mode=0o700)
    for name,pin in manifest["files"].items():
        path=Path(name)
        if path.is_absolute() or ".." in path.parts:raise ValueError("Unsafe source member")
        data=(original_source/path).read_bytes()
        if len(data)!=pin["bytes"] or sha(data)!=pin["sha256"]:raise ValueError("Selected original source changed: "+name)
        if hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()!=pin["blob"]:
            raise ValueError("Selected original Git object changed: "+name)
        write(source/path,data)
    modules=args.node_modules.resolve()
    if not modules.is_dir():raise ValueError("Use the existing compatible installed dependencies")
    (source/"node_modules").symlink_to(modules,target_is_directory=True)
    driver=Path(__file__).with_suffix(".mjs").read_bytes()
    if len(driver)!=manifest["receivingDriver"]["bytes"] or sha(driver)!=manifest["receivingDriver"]["sha256"]:
        raise ValueError("Use the complete selected original receiving driver")
    write(directory/"journey.mjs",driver)
    inputs=directory/"private-inputs";inputs.mkdir(mode=0o700)
    original_driver=args.original_driver.resolve().read_bytes()
    write(inputs/"original-driver.mjs",original_driver)
    write(inputs/"original-workspace.tar.gz",body)
    customers=directory/"customer-exports";customers.mkdir(mode=0o700)
    if checkpoint:
        for name in checkpoint["directories"]:
            if name in ("customer-exports/node/","customer-exports/python/") or name.startswith(("customer-exports/node/","customer-exports/python/")):
                (directory/name).mkdir(mode=0o700,parents=True,exist_ok=True)
        for name,data in checkpoint["files"].items():
            if name.startswith("customer-exports/"):write(directory/name,data)
    else:
        copy_regular_tree(args.customer_node,customers/"node")
        copy_regular_tree(args.customer_python,customers/"python")
    receiving=directory/"received";receiving.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(body),mode="r:gz") as archive:
        members=archive.getmembers()
        if any(member.issym() or member.islnk() or member.name.startswith("/") or ".." in Path(member.name).parts for member in members):
            raise ValueError("The original workspace archive contains an unsafe member")
        archive.extractall(receiving,filter="data")
    for parent,children,files in os.walk(receiving):
        os.chmod(parent,0o700)
        for name in files:os.chmod(Path(parent)/name,0o600)
    identity=receiving/"workspace/workspace.json"
    if sha(identity.read_bytes())!=WORKSPACE_SHA:raise ValueError("The original Tenderly workspace identity changed")
    environment=dict(os.environ)
    environment["TENDERLY_ARCHIVE_SHA"]=PACKAGE_SHA
    environment["TENDERLY_ORIGINAL_DRIVER"]=str(inputs/"original-driver.mjs")
    environment["TENDERLY_CUSTOMER_DELIVERIES"]=json.dumps([["node",str(customers/"node")],["python",str(customers/"python")]])
    environment["TMPDIR"]=str(directory)
    before=resources()
    print(json.dumps({"stage":"EXACT_ORIGINAL_TENDERLY_SOURCE_RECEIVED","sourceCommit":SOURCE_COMMIT,
        "sourceFiles":len(manifest["files"]),"sourceBytes":sum(item["bytes"] for item in manifest["files"].values()),
        "originalArchiveSha256":PACKAGE_SHA,"originalDriverSha256":sha(original_driver),"directory":str(directory)}),flush=True)
    started=time.monotonic();child=None;process={"before":before};error=None
    try:
        child=subprocess.Popen([args.node,str(directory/"journey.mjs"),str(directory)],env=environment,start_new_session=True)
        try:returncode=child.wait(timeout=240)
        except subprocess.TimeoutExpired:
            process["timedOut"]=True
            try:os.killpg(child.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:returncode=child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid,signal.SIGKILL);returncode=child.wait()
        process.update({"pid":child.pid,"returncode":returncode,"signal":-returncode if returncode<0 else None})
    except Exception as failure:
        error={"type":type(failure).__name__,"message":str(failure)}
        process["returncode"]=None
    finally:
        if child:
            process.update(retire_group(child.pid))
            if child.poll() is None:
                try:child.wait(timeout=5)
                except subprocess.TimeoutExpired:child.kill();child.wait()
        process["seconds"]=round(time.monotonic()-started,3);process["after"]=resources()
        write(directory/"native-process.json",(json.dumps(process,indent=2)+"\n").encode())
        print(json.dumps({"stage":"ORIGINAL_TENDERLY_PROCESS_EXIT",**process}),flush=True)
    result_path=directory/"receiving-result.json"
    completed=process.get("returncode")==0 and result_path.is_file() and not process.get("activeAfterDrain")
    result=json.loads(result_path.read_text()) if completed else {
        "schema":"stellar-forge.tenderly-managed-receiving-checkpoint.v1","operation":"SCF-TENDERLY-SHARED-OPERATOR-E881-20261012",
        "sourceCommit":SOURCE_COMMIT,"originalArchiveSha256":PACKAGE_SHA,"originalWorkspaceSha256":WORKSPACE_SHA,"error":error,
    }
    result.update({"completed":completed,"nativeProcess":process,"sourceFiles":len(manifest["files"]),
        "originalDriverSha256":sha(original_driver),"receivingDriverSha256":sha(driver),
        "originalCheckpointSha256":checkpoint["sha256"] if checkpoint else None})
    title="Starforge_Tenderly_Managed_2026-10-12"
    report=directory/(title+("_Receiving.json" if completed else "_Checkpoint.json"))
    write(report,(json.dumps(result,indent=2)+"\n").encode())
    guide=(
        "# Tenderly managed customer operation\n\n"
        "This complete delivery continues the original retained Tenderly provider result through the shared Applications, "
        "typed client and merchant workspace. It retains the original workspace identity, response and both original customer exports.\n\n"
        "Read the included receiving JSON for the actual completed phases and process outcome. "
        "The closed workspace is in received/workspace; customer-exports/node and customer-exports/python contain the complete "
        "original customer deliveries. analysis-export, when present, contains the original full response and its received analysis.\n\n"
        "The managed product, installed commands and typed client are maintained at:\n\n"
        "https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/"+SOURCE_COMMIT+"/products/tenderly\n\n"
        "Use selection tenderly-simulation-workspace with its original configured private environment to reopen the received operator. "
        "The complete operating guide documents the READY source root and managed Applications command. "
        "The original environment remains with the existing operator; this delivery binds its original driver by SHA-256.\n"
    )
    write(directory/"START_HERE.md",guide.encode())
    output=directory/(title+("_Customer.zip" if completed else "_Checkpoint.zip"))
    members={};directories=[]
    with zipfile.ZipFile(output,"x",zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        selected=[directory/"START_HERE.md",report,directory/"native-process.json",inputs/"original-workspace.tar.gz"]
        for folder in ["received","customer-exports","analysis-export"]:
            path=directory/folder
            if path.is_dir():selected.append(path);selected.extend(sorted(path.rglob("*")))
        if result_path.is_file():selected.append(result_path)
        for path in selected:
            info=path.lstat()
            if stat.S_ISLNK(info.st_mode):raise ValueError("The complete customer operation contains a linked file")
            if path.is_dir():
                name=str(path.relative_to(directory))+"/";entry=zipfile.ZipInfo(name)
                entry.create_system=3;entry.external_attr=((stat.S_IFDIR|0o700)<<16)|0x10
                archive.writestr(entry,b"");directories.append(name);continue
            if not path.is_file():continue
            name="original-workspace.tar.gz" if path==inputs/"original-workspace.tar.gz" else str(path.relative_to(directory))
            data=path.read_bytes();members[name]={"bytes":len(data),"sha256":sha(data)};archive.writestr(name,data)
        archive.writestr("files.json",json.dumps({"schema":"stellar-forge.tenderly-managed-customer-files.v1","members":members,"directories":directories},indent=2)+"\n")
    output.chmod(0o600)
    delivery={"completed":completed,"report":str(report),"archive":str(output),"archiveBytes":output.stat().st_size,
        "archiveSha256":sha(output.read_bytes()),"files":len(members),"directory":str(directory)}
    print(json.dumps({"stage":"COMPLETE_TENDERLY_CUSTOMER_DELIVERY" if completed else "ORIGINAL_TENDERLY_CHECKPOINT",**delivery}),flush=True)
    if args.save_helper:
        helper=args.save_helper.resolve();helpers=helper.parent
        for name in ("library_upload.py","library_hosted_apps.py","library_file_transfer.py",
                     "native_library_delivery.py","native_library_requests.py"):
            if not (helpers/name).is_file():raise ValueError("Keep the five current delivery helper files together: "+name)
        request={"uploads":[{"local_path":str(report),"purpose":"create_library_file","library_artifact_type":"other"},
                            {"local_path":str(output),"purpose":"create_library_file","library_artifact_type":"other"}]}
        request_path=directory/"library-save-request.json"
        result_path=directory/"library-save-result.json"
        receipt_path=directory/"library-save-receipts.jsonl"
        provider_requests=directory/"library-provider-requests"
        write(request_path,(json.dumps(request)+"\n").encode())
        worker="""import sys
from pathlib import Path
helpers=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(helpers))
from native_library_delivery import _worker
sys.exit(_worker(helpers,Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),
    Path(sys.argv[5]),Path(sys.argv[6]),upload_mode="returned-put"))
"""
        saved=subprocess.run([sys.executable,"-c",worker,str(helpers),str(request_path),str(result_path),
            str(receipt_path),str(directory),str(provider_requests)],text=True,
            stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=300)
        write(directory/"library-save-stdout.txt",saved.stdout.encode())
        write(directory/"library-save-stderr.txt",saved.stderr.encode())
        for stream in (saved.stdout,saved.stderr):
            for line in stream.splitlines():
                if line.startswith("__OPENAI_LIBRARY_FILE_WRITE_RECEIPT_V1__="):print(line,file=sys.stderr,flush=True)
        if result_path.is_file():print(result_path.read_text(),end="",flush=True)
        if saved.returncode:raise RuntimeError("The complete customer files remain in the receiving directory; their save did not finish")
    return 0 if completed else 1
if __name__=="__main__":sys.exit(main())
