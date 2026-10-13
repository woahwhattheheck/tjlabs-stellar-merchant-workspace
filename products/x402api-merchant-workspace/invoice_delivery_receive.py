#!/usr/bin/env python3
"""Verify every customer-delivery member and open it in a new private directory."""
import argparse,hashlib,json,os,pathlib,shutil,stat,tempfile,zipfile
def need(value,message):
    if not value:raise ValueError(message)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--archive",required=True);p.add_argument("--directory",required=True)
    a=p.parse_args();source=pathlib.Path(a.archive).absolute();target=pathlib.Path(a.directory).absolute();parent=target.parent
    need(parent.resolve()==parent and parent.is_dir() and not os.lstat(parent).st_mode&0o077,"Choose an existing private parent directory.")
    need(not os.path.lexists(target),"Keep the existing delivery; choose a new receiving directory.")
    stage=pathlib.Path(tempfile.mkdtemp(prefix=".invoice-receiving-",dir=parent))
    try:
        with zipfile.ZipFile(source) as archive:
            entries=archive.infolist();names=[i.filename for i in entries]
            need(4<=len(names)<=6 and len(set(names))==len(names),"Keep one complete customer delivery.")
            need(all(not i.is_dir() and not i.flag_bits&1 and i.file_size<=1073741824 for i in entries),"A customer member has unsupported size or encoding.")
            need("MANIFEST.json" in names and archive.getinfo("MANIFEST.json").file_size<=1048576,"Keep the full original manifest.")
            manifest=json.loads(archive.read("MANIFEST.json"))
            need(manifest.get("schema")=="stellar-forge.merchant-invoice-delivery-manifest.v1","Select an original merchant customer delivery.")
            members=manifest["members"];expected={i["name"]:i for i in members}
            need(len(expected)==len(members) and set(expected)==set(names)-{"MANIFEST.json"},"Keep every original declared member.")
            need({"index.html","invoice.json","README.txt"}<=set(expected),"Keep the complete invoice and customer instructions.")
            for info in entries:
                name=info.filename;parts=pathlib.PurePosixPath(name).parts
                need(name and "\\" not in name and not name.startswith("/") and all(x not in ("",".","..") for x in parts),"An archive member path is invalid.")
                need((info.external_attr>>16)&0o170000 in (0,stat.S_IFREG),"Receive ordinary customer files only.")
                destination=stage.joinpath(*parts);destination.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
                digest=hashlib.sha256();count=0
                with archive.open(info) as incoming,os.fdopen(os.open(destination,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),"wb") as outgoing:
                    while True:
                        block=incoming.read(1048576)
                        if not block:break
                        count+=len(block);need(count<=info.file_size,"An original member grew.");digest.update(block);outgoing.write(block)
                    outgoing.flush();os.fsync(outgoing.fileno())
                need(count==info.file_size,"An original member is incomplete.")
                if name!="MANIFEST.json":need(count==expected[name]["bytes"] and digest.hexdigest()==expected[name]["sha256"],"An original member changed.")
            need((stage/"invoice.json").stat().st_size<=67108864,"Keep the original bounded invoice document.")
            record=json.loads((stage/"invoice.json").read_bytes())
            need(record["schema"]=="stellar-forge.merchant-invoice-delivery.v1" and record["owner"]==manifest["owner"] and record["invoice"]["id"]==manifest["invoiceId"] and record["revision"]==manifest["revision"],"Invoice and package identities differ.")
            results=[m for m in members if m["name"].startswith("result/")]
            if record["invoice"]["state"]=="COMPLETE":
                original=record["invoice"]["result"];need(len(results)==1 and all(results[0][k]==original[k] for k in ("bytes","sha256","contentType")),"Keep the complete original delivered file.")
            else:need(not results,"A pending invoice has no completed result.")
            need(("payment-request.json" in names)==(record["envelope"] is not None),"Keep the original available wallet request.")
            if record["envelope"] is not None:need(json.loads((stage/"payment-request.json").read_bytes())==record["envelope"],"The original wallet request changed.")
        need(not os.path.lexists(target),"Keep the existing receiving directory.")
        os.rename(stage,target);stage=None
        print(json.dumps({"directory":str(target),"invoiceId":manifest["invoiceId"],"revision":manifest["revision"],"members":len(names),"result":results[0] if results else None},separators=(",",":")))
    finally:
        if stage is not None:shutil.rmtree(stage)
if __name__=="__main__":main()
