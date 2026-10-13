#!/usr/bin/env python3
"""Select actual completed original browser archives for installed receiving."""
from __future__ import annotations
import argparse,fcntl,hashlib,json,os,pathlib,sys,zipfile
os.umask(0o077)
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"native"))
from files import directory,absolute,file_identity,once,encoded,read_json,need
from source import manifest_value,check_source
p=argparse.ArgumentParser();p.add_argument("--original-root",required=True);p.add_argument("--out",required=True);p.add_argument("--edition",choices=("restored","original"),default="restored");a=p.parse_args()
root=directory(a.original_root);out=directory(a.out,create=True,private=True)
result={"schema":"stellar-forge.partner-installed-receiving-input.v1","operation_id":"PARTNER-INSTALLED-RECEIVING-64B7-20261013","products":{}}
for product,folder,operation,lock_name in (
 ("mobility","smip","MOSAIC-SMIP-WORKSHARE-64B7-20261013","MOSAIC_OPERATION.lock"),
 ("education","education","3S-EDUCATION-QA-WORKSHARE-64B7-20261013","EDUCATION_OPERATION.lock")):
 with (root/lock_name).open("r+b") as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  native_path=root/folder/"receiving"/"NATIVE_RESULT.json";native=read_json(native_path)
  need(native.get("id")==operation and native.get("complete") is True,"original_case_incomplete","Receive this existing complete original source/browser programme first.")
  browser=native[a.edition+"_browser"]
  need(browser.get("complete") is True and browser.get("mode")==a.edition,"original_browser_incomplete","Select the actual completed original browser edition.")
  archive=absolute(browser["archive"]);identity=file_identity(archive)
  if browser.get("archive_sha256"):need(identity["sha256"]==browser["archive_sha256"],"original_archive_changed","The original completed browser archive changed.")
  if browser.get("archive_bytes"):need(identity["bytes"]==browser["archive_bytes"],"original_archive_changed","The original completed browser archive length changed.")
  application=root/"application" if a.edition=="original" else root/folder/"independent-delivery"/"application"
  with zipfile.ZipFile(archive) as z:
   names=z.namelist();need(len(names)==len(set(names)),"original_archive_members","The original archive has duplicate members.")
   manifest=json.loads(z.read("MANIFEST.json"));need(manifest.get("schema")=="partner-delivery-archive.v1" and manifest["workspace"]==browser["workspace"] and manifest["workspace"]["product"]==product,"original_archive_binding","The original completed archive identifies another workspace.")
   need(z.testzip() is None,"original_archive_crc","The original complete archive failed CRC.")
   need(set(names)=={"MANIFEST.json"}|{x["path"] for x in manifest["files"]},"original_archive_members","The original complete manifest differs from the archive.")
   rows=[]
   for item in manifest["files"]:
    h=hashlib.sha256();length=0
    with z.open(item["path"]) as stream:
     for block in iter(lambda:stream.read(1024*1024),b""):h.update(block);length+=len(block)
    need(length==item["bytes"] and h.hexdigest()==item["sha256"],"original_archive_member","An original complete archive member changed.")
    if item["path"].startswith("application/"):rows.append({"path":item["path"][len("application/"):],"bytes":item["bytes"],"sha256":item["sha256"]})
  source=manifest_value({"schema":"stellar-forge.partner-product-source.v1","title":"Original "+product+" review application","product":product,"files":sorted(rows,key=lambda x:x["path"]),"provenance":{"original_operation":operation,"browser_edition":a.edition,"native_result":{k:v for k,v in file_identity(native_path).items() if k in ("path","bytes","sha256")},"archive":{k:v for k,v in identity.items() if k in ("path","bytes","sha256")}}})
  check_source(application,source);source_path=out/(product+"-source.json");once(source_path,encoded(source))
  result["products"][product]={"product":product,"original_operation":operation,"source_root":str(application),"source_manifest":{k:v for k,v in file_identity(source_path).items() if k in ("path","bytes","sha256")},"original_archive":{**{k:v for k,v in identity.items() if k in ("path","bytes","sha256")},"workspace_id":manifest["workspace"]["id"],"browser_mode":a.edition,"native_result":str(native_path)}}
target=out/"Original_Installed_Inputs.json";once(target,encoded(result))
print(json.dumps({"inputs":str(target),"products":{k:{"workspace_id":v["original_archive"]["workspace_id"],"archive_sha256":v["original_archive"]["sha256"],"edition":a.edition} for k,v in result["products"].items()}}))
