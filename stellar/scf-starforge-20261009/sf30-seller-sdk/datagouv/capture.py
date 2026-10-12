#!/usr/bin/env python3
"""Retain one complete public data.gouv resource and its unchanged CSV values."""
import argparse, csv, datetime, hashlib, io, json, os, re, stat, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path
SCHEMA="stellar-forge.datagouv-capture.v1"
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def js(value): return (json.dumps(value,ensure_ascii=False,indent=2)+"\n").encode()
def digest(raw): return hashlib.sha256(raw).hexdigest()
def write_new(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with path.open("xb") as out:
        os.chmod(path,0o600);out.write(raw);out.flush();os.fsync(out.fileno())
def fetch(url,limit):
    p=urllib.parse.urlsplit(url)
    if p.scheme!="https" or p.username or p.password or p.fragment: raise ValueError("Public HTTPS source URL required")
    request=urllib.request.Request(url,headers={"User-Agent":"TJLabs-Datagouv-Publisher/1.0","Accept":"*/*","Accept-Encoding":"identity"})
    began=now()
    with urllib.request.urlopen(request,timeout=50) as response:
        raw=response.read(limit+1)
        if len(raw)>limit: raise ValueError("Source exceeds selected complete-file limit")
        header_bytes=response.headers.get("Content-Length")
        if header_bytes is not None and int(header_bytes)!=len(raw): raise ValueError("Incomplete HTTP response")
        final=urllib.parse.urlsplit(response.url)
        if final.scheme!="https" or final.username or final.password: raise ValueError("Source redirected away from public HTTPS")
        receipt={"requested_url":url,"final_url":response.url,"status":response.status,"started_at":began,"completed_at":now(),
          "bytes":len(raw),"sha256":digest(raw),"sha1":hashlib.sha1(raw).hexdigest(),
          "headers":{key:response.headers.get(key) for key in ["Content-Type","Content-Length","ETag","Last-Modified"] if response.headers.get(key) is not None}}
        return raw,receipt
def capture(directory, dataset, resource, operation, max_bytes=268435456):
    directory=Path(directory).absolute()
    manifest_file=directory/"capture.json"
    if manifest_file.exists():
        previous=json.loads(manifest_file.read_bytes())
        if (previous["operation_id"],previous["dataset_id"],previous["resource_id"])!=(operation,dataset,resource): raise ValueError("Retain the original capture operation")
        for member in previous["files"]:
            path=directory/member["path"]
            if path.is_symlink() or not path.is_file(): raise ValueError("Capture member missing")
            raw=path.read_bytes()
            if len(raw)!=member["bytes"] or digest(raw)!=member["sha256"]: raise ValueError("Retained capture changed")
        return previous
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    if any(directory.iterdir()): raise ValueError("Incomplete capture exists: preserve and inspect it before continuing the original operation")
    started=now();files=[];responses=[]
    def retain(path,raw):
        write_new(directory/path,raw);files.append({"path":path,"bytes":len(raw),"sha256":digest(raw)})
    api="https://www.data.gouv.fr/api/1/datasets/"+urllib.parse.quote(dataset,safe="")+"/"
    metadata_raw,metadata_http=fetch(api,8*1024*1024);retain("original/dataset.json",metadata_raw);responses.append(metadata_http)
    metadata=json.loads(metadata_raw)
    if metadata.get("id")!=dataset: raise ValueError("Dataset ID differs from selected original")
    matches=[v for v in metadata.get("resources",[]) if v.get("id")==resource]
    if len(matches)!=1: raise ValueError("Select one current resource by its real resource ID")
    selected=matches[0];url=selected.get("url")
    if not isinstance(url,str): raise ValueError("Selected resource has no source URL")
    raw,http=fetch(url,max_bytes);retain("original/resource.csv",raw);responses.append(http)
    if str(selected.get("format","")).lower()!="csv": raise ValueError("This full-file adapter requires an explicitly selected CSV")
    text=raw.decode("utf-8-sig",errors="strict")
    reader=csv.reader(io.StringIO(text,newline=""),delimiter=",",quotechar='"',strict=True)
    try: header=next(reader)
    except StopIteration: raise ValueError("Resource is missing its CSV header")
    if not header or len(header)>64 or any(not v for v in header) or len(set(header))!=len(header): raise ValueError("CSV header is empty, duplicated or too wide")
    records=[]; blanks={key:0 for key in header};leading={key:0 for key in header};null_tokens={key:0 for key in header};max_chars={key:0 for key in header}
    for index,row in enumerate(reader,1):
        if len(row)!=len(header): raise ValueError("CSV row "+str(index)+" has an inconsistent width")
        if index>1000000: raise ValueError("Complete source exceeds the selected one-million-row limit")
        record=dict(zip(header,row));records.append(record)
        for key,value in record.items():
            blanks[key]+=value=="";leading[key]+=len(value)>1 and value.startswith("0");null_tokens[key]+=value.upper() in ["NULL","NA","N/A"]
            max_chars[key]=max(max_chars[key],len(value))
    if not records: raise ValueError("No data records returned")
    rows_raw=("".join(json.dumps(v,ensure_ascii=False,separators=(",",":"))+"\n" for v in records)).encode()
    retain("rows.jsonl",rows_raw)
    key_analysis={}
    for key in header:
        counts={}
        for row in records: counts[row[key]]=counts.get(row[key],0)+1
        duplicate=[{"value":k,"count":v} for k,v in counts.items() if v>1]
        key_analysis[key]={"nonempty":blanks[key]==0,"distinct":len(counts),"duplicate_values":len(duplicate),"unique":len(counts)==len(records),"duplicates":duplicate}
    assertions={"primary":{"bytes":selected.get("filesize"),"checksum":selected.get("checksum")},"analysis":{k:v for k,v in selected.get("extras",{}).items() if "size" in k or "checksum" in k or "last-modified" in k}}
    manifest={"schema":SCHEMA,"provider":"datagouv","protocol":"udata-api-1","read_only":True,"state":"COMPLETE","operation_id":operation,
      "started_at":started,"completed_at":now(),"dataset_id":dataset,"resource_id":resource,"api_url":api,
      "organization":metadata.get("organization"),"title":metadata.get("title"),"description":metadata.get("description"),"license":metadata.get("license"),
      "dataset_last_modified":metadata.get("last_modified"),"resource_last_modified":selected.get("last_modified"),
      "temporal_coverage":metadata.get("temporal_coverage"),"frequency":metadata.get("frequency"),
      "selected_resource":selected,"metadata_assertions":assertions,"http_responses":responses,
      "encoding":"utf-8-sig","delimiter":",","header":header,"row_count":len(records),"csv_value_contract":"Every parsed field remains a string; an empty cell remains an empty string. Literal NA, NULL and N/A are preserved. No implied CSV null marker.",
      "blank_cells":blanks,"literal_null_tokens":null_tokens,"leading_zero_values":leading,"max_cell_chars":max_chars,"key_analysis":key_analysis,
      "files":files,"complete_source":True}
    retain_info=js(manifest)
    write_new(manifest_file,retain_info)
    return manifest
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--out",required=True);p.add_argument("--dataset",required=True);p.add_argument("--resource",required=True);p.add_argument("--operation",required=True);p.add_argument("--max-bytes",type=int,default=268435456);a=p.parse_args()
    m=capture(a.out,a.dataset,a.resource,a.operation,a.max_bytes)
    print(json.dumps({"capture":str(Path(a.out).absolute()/"capture.json"),"manifest_sha256":digest((Path(a.out)/"capture.json").read_bytes()),"dataset_id":m["dataset_id"],"resource_id":m["resource_id"],"header":m["header"],"row_count":m["row_count"],"blank_cells":m["blank_cells"],"leading_zero_values":m["leading_zero_values"],"csv":m["http_responses"][1],"metadata_assertions":m["metadata_assertions"],"keys":{k:{n:v for n,v in spec.items() if n!="duplicates"} for k,spec in m["key_analysis"].items()}}),flush=True)
if __name__=="__main__":main()
