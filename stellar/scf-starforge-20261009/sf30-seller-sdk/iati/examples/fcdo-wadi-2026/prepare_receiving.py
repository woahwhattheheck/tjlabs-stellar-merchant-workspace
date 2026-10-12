"""MIT. Resolve the original complete public WADI receiving selection onto one owner-selected host."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

SDK="stellar/scf-starforge-20261009/sf30-seller-sdk/iati"
def require(condition,message):
    if not condition:raise ValueError(message)
def digest(path):
    total=0;result=hashlib.sha256()
    with os.fdopen(os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),"rb")as stream:
        require(stat.S_ISREG(os.fstat(stream.fileno()).st_mode),"Select complete original regular files")
        for block in iter(lambda:stream.read(65536),b""):
            total+=len(block);require(total<=32*1024**2,"Selected input exceeds the original receiving limit")
            result.update(block)
    return {"path":str(path),"bytes":total,"sha256":result.hexdigest()}
def durable(path,content):
    if path.exists():
        require(path.is_file()and not path.is_symlink()and path.read_bytes()==content,"Retain the original resolved input; another host/selection needs its original reviewed continuation")
        return
    temp=path.with_name(path.name+".pending")
    if temp.exists():
        require(temp.is_file()and not temp.is_symlink()and temp.read_bytes()==content,"Retain the original interrupted preparation before changing its selected paths")
    else:
        with os.fdopen(os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"wb")as stream:
            stream.write(content);stream.flush();os.fsync(stream.fileno())
    os.replace(temp,path)
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root",required=True)
    parser.add_argument("--directory",required=True)
    args=parser.parse_args()
    source=Path(args.source_root);root=Path(args.directory)
    require(source.is_absolute()and source.resolve()==source,"Use the actual complete selected source root")
    require(root.is_absolute()and root!=Path("/")and root.resolve()==root,"Use one explicit owner-selected private operation directory")
    root.mkdir(mode=0o700,parents=True,exist_ok=True)
    metadata=root.lstat()
    require(stat.S_ISDIR(metadata.st_mode)and not root.is_symlink()and metadata.st_uid==os.getuid()and not metadata.st_mode&0o077,"The original operation directory must remain owned and private")
    base=source/SDK/"examples"/"fcdo-wadi-2026"
    selection=json.loads((base/"receiving-selection.json").read_bytes())
    feedback=base/"receiving-feedback.csv";evidence=base/"receiving-evidence.json"
    publisher=base/"FCDO-set-20.xml.gz";receipt=base/"publisher-receipt.json"
    require(digest(feedback)["sha256"]==selection["feedbackSha256"],"The complete original feedback selection changed")
    publisher_identity=digest(publisher)
    require(publisher_identity["bytes"]==647227 and publisher_identity["sha256"]=="4df991d0ce8bbcc2ff44d0c71644f9f6fb2f4b10c9edd037294d146634433645","Select the complete retained FCDO gzip")
    original=json.loads(receipt.read_bytes())
    require(original.get("bytes")==8496890 and original.get("sha256")=="98a6bad80d60aa8deaa35fe1a593313515649a9fae7456895d1bfed4ac4a756d","Retain the exact full original publisher receipt")
    configuration={**selection,"sourceRoot":str(source),"workspaceDirectory":str(root/"workspace"),
        "receivedDirectory":str(root/"received"),"outputDirectory":str(root/"core-output"),
        "publisherFile":str(publisher),"publisherReceipt":str(receipt),"feedbackFile":str(feedback),
        "evidenceFiles":[{"path":str(evidence),"sha256":digest(evidence)["sha256"],
            "label":"Original public-source observation and explicit local demonstration decisions",
            "media":"application/json","sourceUrl":"https://iati.fcdo.gov.uk/iati_files/solr/FCDO-set-20.xml"}]}
    encoded=(json.dumps(configuration,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+"\n").encode()
    target=root/"core-input.json";durable(target,encoded)
    custody={"schema":"stellar-forge.iati-participant-receiving-input.v1","operationId":selection["operationId"],
        "coreInput":digest(target),"originalFiles":[digest(base/name)for name in
        ["receiving-selection.json","receiving-feedback.csv","receiving-evidence.json","publisher-receipt.json","FCDO-set-20.xml.gz"]],
        "argv":[sys.executable,str(source/SDK/"receiving"/"publishing.py"),"--input",str(target)]}
    durable(root/"input-custody.json",(json.dumps(custody,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode())
    print(json.dumps(custody,ensure_ascii=False,sort_keys=True),flush=True)
if __name__=="__main__":main()
