#!/usr/bin/env python3
"""Receive the complete original source parts and run their retained controller."""
import argparse,base64,hashlib,json
from pathlib import Path

def unpack(blob,maximum):
    index=0;result=bytearray()
    while index<len(blob):
        flags=blob[index];index+=1
        for bit in range(8):
            if index>=len(blob):break
            if flags&(1<<bit):
                if index+3>len(blob):raise ValueError("Truncated source transport")
                distance=blob[index]|(blob[index+1]<<8);count=blob[index+2]+3;index+=3
                if not distance or distance>len(result) or len(result)+count>maximum:raise ValueError("Invalid source transport")
                for _ in range(count):result.append(result[-distance])
            else:
                if len(result)>=maximum:raise ValueError("Source exceeds declared size")
                result.append(blob[index]);index+=1
    if len(result)!=maximum:raise ValueError("Source size differs")
    return bytes(result)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--manifest",required=True)
    parser.add_argument("--parts-directory",required=True)
    args=parser.parse_args()
    manifest=json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if manifest["schema"]!="tjlabs.scf-commercial-changes-complete-receiving.v1":raise ValueError("Select the complete source manifest")
    files=[];seen=set()
    for expected in manifest["parts"]:
        original=(Path(args.parts_directory)/("part-%02d.json"%expected["part"])).read_bytes()
        if len(original)!=expected["bytes"] or hashlib.sha256(original).hexdigest()!=expected["sha256"]:raise ValueError("Part bytes differ")
        envelope=json.loads(original)
        if envelope["codec"]!="lzss16-base64" or envelope["bytes"]!=expected["decodedBytes"] or envelope["sha256"]!=expected["decodedSha256"]:raise ValueError("Part envelope differs")
        decoded=unpack(base64.b64decode(envelope["data"],validate=True),expected["decodedBytes"])
        if hashlib.sha256(decoded).hexdigest()!=expected["decodedSha256"]:raise ValueError("Decoded part differs")
        part=json.loads(decoded)
        if part["operation"]!=manifest["operation"] or part["sourceCommit"]!=manifest["sourceCommit"] or part["part"]!=expected["part"] or part["parts"]!=len(manifest["parts"]):raise ValueError("Part selection differs")
        for item in part["files"]:
            if item["path"] in seen:raise ValueError("Duplicate original source")
            seen.add(item["path"]);content=item["content"].encode("utf-8")
            if len(content)!=item["bytes"] or hashlib.sha256(content).hexdigest()!=item["sha256"]:raise ValueError("Source content differs")
            git=hashlib.sha1(b"blob "+str(len(content)).encode()+b"\0"+content).hexdigest()
            if git!=item["gitBlob"]:raise ValueError("Original Git identity differs")
            files.append(item)
    inventory=[{k:item[k] for k in ("path","bytes","sha256","gitBlob")} for item in files]
    if inventory!=manifest["sourceInventory"] or len(files)!=manifest["sourceFiles"] or sum(item["bytes"] for item in files)!=manifest["sourceBytes"]:raise ValueError("Complete source selection differs")
    payload=dict(manifest["receiver"],files=files)
    raw=json.dumps(payload,ensure_ascii=False)
    exec(compile(payload["controller"],"<original-commercial-changes-receiver>","exec"),{"raw":raw,"__name__":"__main__"})
if __name__=="__main__":main()
