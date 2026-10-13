"""Supported Library tool transport reused from the observed Aviary save bridge.

This module contains only the original save event/reply transport and strict
observed-response validation. Artifact restoration remains with the caller.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path
import sys

def library_name_matches(actual,requested):
 """Accept the original basename or Library's observed numbered collision name."""
 if not isinstance(actual,str) or Path(actual).name!=actual:return False
 if actual==requested:return True
 stem,suffix=os.path.splitext(requested)
 return re.fullmatch(re.escape(stem)+r"\([1-9][0-9]*\)"+re.escape(suffix),actual) is not None

def install_original_library_tool_bridge(n):
 original_finish=n["finish_saved_artifact"]
 def finish(path,kept,reused):
  if kept.get("transferSourceKind")!="official-library-local-file":
   return original_finish(path,kept,reused)
  rec=n["record"](path);n["require"](kept["source"]==rec,"Original official saved artifact bytes differ")
  evidence=Path(kept["officialToolEvidence"]["path"])
  n["require"](evidence==n["ROOT"]/"library-tool-receipts"/(Path(path).name+".response.json"),"Original official receipt path differs")
  normalized_result(kept["providerReceipt"],Path(path).name,rec["bytes"])
  raw=n["encoded"](kept["providerReceipt"])
  n["require"](len(raw)==kept["officialToolEvidence"]["bytes"] and n["sha"](raw)==kept["officialToolEvidence"]["sha256"],"Retained original official response bytes differ")
  n["publish"](evidence,raw);n["same"](kept["officialToolEvidence"],evidence)
  item=kept["result"]
  n["require"](item["local_path"]==str(path) and item["purpose"]=="create_library_file"
               and item["status"]=="succeeded" and item["file_id"] and item["library_file_id"],
               "Original official save receipt is incomplete")
  n["emit"]("ARTIFACT_SAVED",**item,bytes=rec["bytes"],sha256=rec["sha256"],reused=reused)
  n["pubjson"](n["SHARED"]/"receipts"/(Path(path).name+".json"),kept)
  return kept
 def read_command():
  line=bytearray()
  while not line.endswith(b"\n"):
   block=os.read(sys.stdin.fileno(),1)
   n["require"](block,"Official save reply input ended before its original receipt")
   line.extend(block);n["require"](len(line)<=2000000,"Official save reply exceeds its bound")
  return json.loads(line)
 def normalized_result(raw,name,size):
  n["require"](isinstance(raw,dict) and raw.get("isError") is False,"Official Library tool did not return success")
  item=raw.get("structuredContent")
  n["require"](isinstance(item,dict) and item.get("operation")=="create_library_file"
      and item.get("status")=="succeeded" and library_name_matches(item.get("file_name"),name)
      and item.get("file_size_bytes")==size and isinstance(item.get("file_id"),str)
      and item["file_id"].startswith("file_") and isinstance(item.get("library_file_id"),str)
      and item["library_file_id"].startswith("libfile_")
      and type(item.get("current_version_number")) is int,
      "Official Library returned identity/name/size/version does not match the exact staged artifact")
  return item
 def save(path):
  path=Path(path);rec=n["record"](path);name=path.name
  folder=n["ROOT"]/"library-receipts";folder.mkdir(parents=True,exist_ok=True,mode=0o700)
  journal=folder/(name+".json")
  if journal.exists():return finish(path,n["readjson"](journal),True)
  n["require"](not (folder/(name+".attempt.json")).exists(),"An original canonical upload remains unresolved; official save was not dispatched")
  bridge_root=n["ROOT"]/"library-tool-receipts";bridge_root.mkdir(parents=True,exist_ok=True,mode=0o700)
  stage=n["SHARED"]/"official-save-source"/name
  n["copy_exact"](path,stage,rec);stage_rec=n["record"](stage)
  request={"schema":"commons.aviary.official-library-local-save.v1","operation":n["OP"],
           "tool":"library_create_library_file","source":rec,"staged":stage_rec,
           "arguments":{"file":str(stage),"library_artifact_type":"other"}}
  request_sha=n["sha"](n["encoded"](request))
  intent=bridge_root/(name+".request.json");response=bridge_root/(name+".response.json")
  reused=intent.exists()
  if reused:
   n["require"](n["readjson"](intent)==request,"The retained official save request differs")
   n["require"](response.is_file(),"The original official save is unresolved; no duplicate save was requested")
  else:
   n["pubjson"](intent,request)
   n["emit"]("LIBRARY_SAVE_REQUEST",requestSha256=request_sha,name=name,source=rec,staged=stage_rec,
             arguments=request["arguments"],requestEvidence=n["record"](intent))
   command=read_command()
   n["require"](command.get("action")=="official-library-save-result" and command.get("requestSha256")==request_sha,
                "Official Library reply belongs to another original artifact")
   n["pubjson"](response,command["result"])
  raw=n["readjson"](response);selected=normalized_result(raw,name,rec["bytes"])
  n["same"](rec,path);n["same"](stage_rec,stage)
  xattrs=selected.get("xattrs",[])
  applied=[]
  for item in xattrs:
   if not isinstance(item,dict) or not isinstance(item.get("name"),str) or not isinstance(item.get("value"),str):continue
   for target in (path,stage):
    try:os.setxattr(target,item["name"],item["value"].encode());applied.append({"path":str(target),"name":item["name"],"applied":True})
    except OSError as error:applied.append({"path":str(target),"name":item["name"],"applied":False,"errno":error.errno})
  item={"local_path":str(path),"purpose":"create_library_file","status":"succeeded",
        "file_id":selected["file_id"],"library_file_id":selected["library_file_id"],"file_name":selected["file_name"],
        "current_version_number":selected.get("current_version_number",selected.get("version_number")),
        "local_metadata_applied":bool(applied) and all(x["applied"] for x in applied)}
  kept={"source":rec,"staged":stage_rec,"transferSourceKind":"official-library-local-file",
        "providerReceipt":raw,"officialToolEvidence":n["record"](response),
        "originalRequest":n["record"](intent),"result":item,"saved":n["now"](),
        "responseReconciled":reused,"xattrs":applied,
        "verification":"Supported library_create_library_file result, complete original response and exact private/staged bytes"}
  n["pubjson"](journal,kept);return finish(path,kept,reused)
 n["save_artifact"]=save;n["finish_saved_artifact"]=finish
