#!/usr/bin/env python3
"""Receive the original complete merchant case and deliver its portable workspace."""
import argparse, contextlib, fcntl, hashlib, json, os, pathlib, stat, subprocess, sys, uuid, zipfile

ORIGINAL_BYTES = 505232
ORIGINAL_SHA256 = "8275abdb2768178cd10685d3631996ec90f9ec3f41227850921eea54dfea354d"
ORIGINAL_ROOT = "/dev/x402api-merchant-7de2-20261012"
PRODUCT = "products/x402api-merchant-workspace"
OPERATION = "X402API-PORTABLE-MERCHANT-48DB-20261012"
SOURCE_PATHS = [
    "products/x402api-merchant-workspace/workspace.mjs",
    "products/x402api-merchant-workspace/server.mjs",
    "products/x402api-merchant-workspace/store.mjs",
    "products/x402api-merchant-workspace/provider.mjs",
    "products/x402api-merchant-workspace/protocol.mjs",
    "products/x402api-merchant-workspace/web/index.html",
    "products/x402api-merchant-workspace/web/style.css",
    "products/x402api-merchant-workspace/web/app.mjs",
    "products/x402api-merchant-workspace/fulfillment/file-delivery.mjs",
    "products/x402api-merchant-workspace/config.example.json",
    "products/x402api-merchant-workspace/README.md",
    "products/x402api-merchant-workspace/RECEIVING.md",
    "stellar/scf-starforge-20261009/distribution/contributions/x402api-merchant.json",
    "stellar/scf-starforge-20261009/sf31-buyer-client/response-file.mjs",
    "stellar/scf-starforge-20261009/sf31-buyer-client/response-stream.mjs",
    "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/result.mjs",
    "stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs",
    "stellar/scf-starforge-20261009/distribution/runtime-workspace/storage.mjs",
    "products/x402api-merchant-workspace/fixtures/protocol-fixture.mjs",
    "products/x402api-merchant-workspace/native-receiving.mjs",
    "products/x402api-merchant-workspace/run-native-receiving.py",
    "products/x402api-merchant-workspace/receive-native-source.py",
    "products/x402api-merchant-workspace/NATIVE_RECEIVING.md",
    "products/x402api-merchant-workspace/portable.mjs",
    "products/x402api-merchant-workspace/web/portable.js",
    "products/x402api-merchant-workspace/web/portable.css",
    "products/x402api-merchant-workspace/PORTABLE.md",
    "products/x402api-merchant-workspace/portable-receiving.mjs",
    "products/x402api-merchant-workspace/receive-portable-native.py",
    "products/x402api-merchant-workspace/portable-reservations.mjs",
  "products/x402api-merchant-workspace/portable-project-reservations.mjs",
    "products/x402api-merchant-workspace/portable-directory.mjs",
    "products/x402api-merchant-workspace/portable-directory-receiving.mjs",
    "products/x402api-merchant-workspace/portable_native.py",
    "products/x402api-merchant-workspace/PORTABLE_PROJECT.md",
    "products/x402api-merchant-workspace/PORTABLE_FOREGROUND.md",
    "products/x402api-merchant-workspace/process_family.py",
    "stellar/scf-starforge-20261009/sf30-seller-sdk/source_bundle_archive.py",
    "stellar/scf-starforge-20261009/distribution/runtime-unpack.py",
    "products/x402api-merchant-workspace/application-inputs.mjs",
    "products/x402api-merchant-workspace/application-provider.mjs",
    "products/x402api-merchant-workspace/managed-application.mjs",
    "products/x402api-merchant-workspace/package.json",
    "products/x402api-merchant-workspace/OPERATING.md",
    "products/x402api-merchant-workspace/INSTALLED_RECEIVING.md",
    "products/x402api-merchant-workspace/INSTALLED_FOREGROUND.md",
    "stellar/scf-starforge-20261009/distribution/runtime-profile.mjs",
    "stellar/scf-starforge-20261009/distribution/specification.mjs",
    "stellar/scf-starforge-20261009/distribution/product-package.mjs",
    "stellar/scf-starforge-20261009/distribution/source-selection.mjs",
    "stellar/scf-starforge-20261009/distribution/runtime-workspace/application-provider.mjs"
]

def digest(raw): return hashlib.sha256(raw).hexdigest()
def emit(value): print(json.dumps(value, separators=(",", ":")), flush=True)
def sync_directory(path):
    descriptor=os.open(path, os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(descriptor)
    finally: os.close(descriptor)
def complete_file(path, raw):
    if path.exists():
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or path.read_bytes()!=raw:
            raise ValueError("The original retained file changed: "+str(path))
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary=path.parent/("."+path.name+".receiving-"+uuid.uuid4().hex)
    descriptor=os.open(temporary, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(raw); output.flush(); os.fsync(output.fileno())
        # The enclosing receive() owns the original operation lease. Check the
        # destination again while that lease is held before atomic publication.
        try:
            info=path.lstat()
        except FileNotFoundError:
            os.rename(temporary, path)
            sync_directory(path.parent)
        else:
            if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or path.read_bytes()!=raw:
                raise ValueError("The original retained file changed: "+str(path))
    finally:
        try: temporary.unlink()
        except FileNotFoundError: pass
def save_json(path, value):
    complete_file(path,(json.dumps(value, ensure_ascii=False, indent=2)+"\n").encode("utf-8"))
@contextlib.contextmanager
def operation_lease(root):
    descriptor=os.open(root/"receiving-owner.lock",os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,"r+b") as lease:
        info=os.fstat(lease.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_mode&0o077:
            raise ValueError("Keep the original private receiving lease")
        try: fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError: raise RuntimeError("The original portable receiving process still owns this operation")
        try: yield lease
        finally: fcntl.flock(lease,fcntl.LOCK_UN)
def archive_inventory(path):
    with zipfile.ZipFile(path) as archive:
        names=archive.namelist()
        if len(names)!=len(set(names)): raise ValueError("Duplicate complete delivery member")
        inventory=json.loads(archive.read("DELIVERY_MANIFEST.json"))
        if inventory.get("schema")!="stellar-forge.x402api-portable-delivery.v1" or inventory.get("operation")!=OPERATION:
            raise ValueError("The original delivery identity changed")
        if set(names)!=set(inventory["files"])|{"DELIVERY_MANIFEST.json"}:
            raise ValueError("The complete delivery inventory changed")
        for name,item in inventory["files"].items():
            content=archive.read(name)
            if len(content)!=item["bytes"] or digest(content)!=item["sha256"]:
                raise ValueError("Complete delivery member changed: "+name)
        return inventory
def receive(options, root, original_zip, original_raw, lease):
    original=root/"original";original.mkdir(exist_ok=True,mode=0o700)
    with zipfile.ZipFile(original_zip) as archive:
        members=archive.infolist()
        if len(members)!=121 or len({member.filename for member in members})!=len(members):
            raise ValueError("The complete original case inventory changed")
        for member in members:
            selected=pathlib.PurePosixPath(member.filename)
            if not selected.parts or selected.is_absolute() or ".." in selected.parts or "\\" in member.filename or selected.as_posix()!=member.filename:
                raise ValueError("Unsafe original archive path")
            if stat.S_IFMT(member.external_attr>>16) not in (0,stat.S_IFREG):
                raise ValueError("Expected regular original archive members")
            complete_file(original/pathlib.Path(*selected.parts),archive.read(member))
    native=root/"native";source_root=pathlib.Path(__file__).resolve().parents[2]
    source=[]
    for relative in SOURCE_PATHS:
        raw=(source_root/relative).read_bytes()
        source.append({"path":relative,"bytes":len(raw),"sha256":digest(raw)})
    command=[options.node,str(source_root/PRODUCT/"portable-directory-receiving.mjs"),"--case",str(original),
        "--directory",str(native),"--original-root",ORIGINAL_ROOT,"--chromium",options.chromium,
        "--playwright-module",options.playwright_module]
    result_path=native/"portable-native-result.json";intent_path=root/"receiving-intent.json"
    intent={"operation":OPERATION,"originalZipSha256":ORIGINAL_SHA256,"originalZipBytes":ORIGINAL_BYTES,
        "command":command,"sourceRoot":str(source_root),"completeSource":source}
    save_json(intent_path,intent)
    if not result_path.exists():
        with open(root/"portable-native.log","ab",buffering=0) as log:
            os.chmod(root/"portable-native.log",0o600)
            process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,pass_fds=(lease.fileno(),))
            try:
                while True:
                    block=process.stdout.read1(65536)
                    if not block: break
                    log.write(block);sys.stdout.buffer.write(block);sys.stdout.buffer.flush()
                status=process.wait()
            finally:
                process.stdout.close()
                if process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=30)
                    except subprocess.TimeoutExpired: process.kill();process.wait()
            os.fsync(log.fileno())
        if status: raise RuntimeError("Original portable receiving exited "+str(status))
    result=json.loads(result_path.read_text())
    if (result.get("schema")!="stellar-forge.x402api-merchant-portable-receiving.v1" or
        result.get("operation")!=OPERATION or result.get("providerInvocations")!=[] or result.get("errors")!=[] or
        result.get("externalRequests")!=[] or result.get("export",{}).get("invoices")!=5 or
        result.get("export",{}).get("results")!=5 or
        result.get("archiveAuthority",{}).get("validStatus")!=200 or
        result.get("archiveAuthority",{}).get("foreignStatus")!=421 or
        result.get("archiveAuthority",{}).get("crossOriginResourcePolicy")!="same-origin" or
        not any(event.get("phase")=="restored_original_merchant_received" for event in result.get("events",[]))):
        raise ValueError("The complete original receiving result differs")
    delivery=root/"delivery";delivery.mkdir(exist_ok=True,mode=0o700)
    native_copy=delivery/"X402API_Portable_Merchant_Native_Receiving_20261012.json"
    complete_file(native_copy,result_path.read_bytes())
    output=delivery/"X402API_Complete_Portable_Merchant_20261012.zip"
    if not output.exists():
        stage=delivery/("."+output.name+".building-"+str(uuid.uuid4()))
        members={}
        try:
            with zipfile.ZipFile(stage,"x",compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
                def include_bytes(raw,name):
                    if name in members: raise ValueError("Duplicate receiving member: "+name)
                    members[name]={"bytes":len(raw),"sha256":digest(raw)}
                    info=zipfile.ZipInfo(name,date_time=(2026,10,12,0,0,0))
                    info.create_system=3;info.external_attr=(stat.S_IFREG|0o600)<<16
                    info.compress_type=zipfile.ZIP_DEFLATED
                    archive.writestr(info,raw,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
                def include(path,name):
                    info=path.lstat()
                    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
                        raise ValueError("Expected the complete regular receiving file: "+str(path))
                    include_bytes(path.read_bytes(),name)
                include_bytes(original_raw,"original/SCF_X402API_Merchant_Complete_Native_Receiving_20261012.zip")
                include(result_path,"receiving/portable-native-result.json")
                include(intent_path,"receiving/intent.json")
                include(root/"portable-native.log","receiving/portable-native.log")
                for folder,name in [(native/"handover","handover"),(native/"restored","restored")]:
                    for path in sorted(folder.rglob("*")):
                        if path.is_file(): include(path,name+"/"+path.relative_to(folder).as_posix())
                guide=("# Complete merchant receiving package\n\n"
                    "Open handover/index.html to inspect the complete original commissioning workspace. "
                    "The invoice viewer, histories and retained delivery files work from this directory.\n\n"
                    "The handover/ directory contains the portable business database, all original files, full source, "
                    "configuration and operator guide. Its source/products/x402api-merchant-workspace/PORTABLE.md "
                    "explains inspection, the local browser server and restoring a private working directory on Linux with Node 24.\n\n"
                    "Use the included restore command to choose the receiving machine's working directory. "
                    "The restored/ directory in this ZIP preserves the completed receiving run at its recorded location; "
                    "the handover/ directory is the complete source for a new restoration.\n\n"
                    "Run the restored merchant with this handover\'s retained server. To manage it through Applications, "
                    "use the existing ready x402api-merchant runtime, choose the restored configuration, and save a fresh input review. "
                    "Run build, install and installed-receiving commands from your complete maintained distribution checkout, "
                    "preserving its existing runtime and application records.\n\n"
                    "The original/ directory retains the entire previously completed 121-file commissioning ZIP. "
                    "The receiving/ directory contains the complete native receiving result, exact executed source inventory, "
                    "command and log. DELIVERY_MANIFEST.json lists every complete member with its original length and SHA256.\n")
                include_bytes(guide.encode(),"README.md")
                inventory={"schema":"stellar-forge.x402api-portable-delivery.v1","operation":OPERATION,
                    "completedAt":result["completedAt"],"files":members}
                info=zipfile.ZipInfo("DELIVERY_MANIFEST.json",date_time=(2026,10,12,0,0,0))
                info.create_system=3;info.external_attr=(stat.S_IFREG|0o600)<<16
                archive.writestr(info,json.dumps(inventory,ensure_ascii=False,indent=2)+"\n",
                    compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
            os.chmod(stage,0o600)
            with open(stage,"rb") as persisted: os.fsync(persisted.fileno())
            archive_inventory(stage)
            os.link(stage,output);stage.unlink();sync_directory(delivery)
        finally:
            if stage.exists(): stage.unlink()
    inventory=archive_inventory(output)
    archive_bytes=output.read_bytes()
    final={"event":"x402api_portable_merchant_delivered","operation":OPERATION,"path":str(output),
        "bytes":len(archive_bytes),"sha256":digest(archive_bytes),"members":len(inventory["files"])+1,
        "nativeResult":str(native_copy),"nativeResultBytes":native_copy.stat().st_size,
        "nativeResultSha256":digest(native_copy.read_bytes())}
    save_json(delivery/"delivery-result.json",final);emit(final)
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original-zip",required=True);parser.add_argument("--directory",required=True)
    parser.add_argument("--node",required=True);parser.add_argument("--chromium",required=True)
    parser.add_argument("--playwright-module",required=True);options=parser.parse_args()
    original_zip=pathlib.Path(options.original_zip).resolve();raw=original_zip.read_bytes()
    if len(raw)!=ORIGINAL_BYTES or digest(raw)!=ORIGINAL_SHA256:
        raise ValueError("Receive the exact original completed 121-member merchant package")
    root=pathlib.Path(options.directory).resolve();root.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(root,0o700)
    with operation_lease(root) as lease: receive(options,root,original_zip,raw,lease)
if __name__=="__main__": main()
