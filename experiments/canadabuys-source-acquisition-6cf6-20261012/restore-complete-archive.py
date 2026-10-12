#!/usr/bin/env python3
"""Reconstruct and verify one complete original archive from its numbered ZIP parts."""
import argparse,hashlib,json,os,pathlib,tempfile,zipfile
def digest(path):
    h=hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda:stream.read(1024*1024),b""):h.update(block)
    return h.hexdigest()
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory",required=True,type=pathlib.Path)
    parser.add_argument("--output",required=True,type=pathlib.Path)
    args=parser.parse_args();directory=args.directory.resolve();output=args.output.resolve()
    manifest=json.loads((directory/"complete-archive-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema")!="commons.lossless-archive-parts.v1":raise ValueError("Unknown archive manifest")
    parts=manifest["parts"]
    if [p["number"] for p in parts]!=list(range(1,len(parts)+1)):raise ValueError("Archive part order is incomplete")
    output.parent.mkdir(parents=True,exist_ok=True)
    if output.exists():
        if output.stat().st_size==manifest["archive_bytes"] and digest(output)==manifest["archive_sha256"]:
            print("Already restored and verified: "+str(output));return
        raise ValueError("The output already contains a different file")
    fd,temporary=tempfile.mkstemp(prefix=output.name+".receiving-",dir=output.parent)
    try:
        with os.fdopen(fd,"wb") as destination:
            for row in parts:
                path=directory/row["file_name"]
                if path.stat().st_size!=row["container_bytes"] or digest(path)!=row["container_sha256"]:raise ValueError("Complete part differs: "+row["file_name"])
                with zipfile.ZipFile(path) as source:
                    info=json.loads(source.read("part.json"))
                    for key in ("number","payload_bytes","payload_sha256","archive_sha256"):
                        if info[key]!=row[key]:raise ValueError("Part metadata differs: "+row["file_name"])
                    payload=source.read("archive-part.bin")
                if len(payload)!=row["payload_bytes"] or hashlib.sha256(payload).hexdigest()!=row["payload_sha256"]:raise ValueError("Part payload differs")
                destination.write(payload)
            destination.flush();os.fsync(destination.fileno())
        temp=pathlib.Path(temporary)
        if temp.stat().st_size!=manifest["archive_bytes"] or digest(temp)!=manifest["archive_sha256"]:raise ValueError("Reconstructed original archive differs")
        with zipfile.ZipFile(temp) as archive:
            if archive.testzip() is not None:raise ValueError("Reconstructed archive CRC differs")
        os.replace(temp,output)
        print("Restored complete original archive: "+str(output))
        print("SHA-256: "+manifest["archive_sha256"])
    finally:
        pathlib.Path(temporary).unlink(missing_ok=True)
if __name__=="__main__":main()
