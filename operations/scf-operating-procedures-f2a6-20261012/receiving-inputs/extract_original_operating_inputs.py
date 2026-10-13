#!/usr/bin/env python3
"""Extract the complete original SF47 planning history and saved SCF v6 submission.

Usage:
  python3 extract_original_operating_inputs.py --sf47 /absolute/original-sf47.zip \
      --submission /absolute/original-v6.zip --output-directory /absolute/output

Materialize the two exact Library file versions listed in SOURCES first.
This command reads those original archives and writes one complete JSON document.
It preserves every inner planning file, complete binary planning.zip, and the full
independently received submission. It performs no mutation of either saved case.
"""
import argparse, base64, hashlib, io, json, pathlib, zipfile

SOURCES = [
  {
    "kind": "sf47",
    "library_file_id": "libfile_3db806b0043c8191a8dd0b55350ddca4",
    "file_id": "file_0000000040c081f59441ecb2a12588ac",
    "version": 0,
    "filename": "SCF_Operating_Case_with_Freeform_Event_Timing_20261012.zip",
    "bytes": 647130,
    "sha256": "c71303844660d5a859d3936a569b5461c7b1679b739dfead95d907759693df2b"
  },
  {
    "kind": "submission",
    "library_file_id": "libfile_7b82273778008191b8469d83ce95be8c",
    "file_id": "file_000000000e4081fdb9876e16c414b89c",
    "version": 6,
    "filename": "SCF-Current-Application-and-Review.zip",
    "bytes": 28872116,
    "sha256": "74cf13a1a123dd3cac9e987897ee00620d534d49e27c93f3eba797418aff70d3"
  }
]

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--sf47",required=True,type=pathlib.Path)
parser.add_argument("--submission",required=True,type=pathlib.Path)
parser.add_argument("--output-directory",required=True,type=pathlib.Path)
args=parser.parse_args()
work=args.output_directory.resolve()
work.mkdir(parents=True,exist_ok=True)
sources=[]
for expected in SOURCES:
 path=(args.sf47 if expected["kind"]=="sf47" else args.submission).resolve()
 data=path.read_bytes()
 if len(data)!=expected["bytes"] or hashlib.sha256(data).hexdigest()!=expected["sha256"]:
  raise ValueError("Original archive does not match the selected file version: "+expected["kind"])
 with zipfile.ZipFile(io.BytesIO(data)) as archive:
  names=archive.namelist()
  if len(names)!=len(set(names)):
   raise ValueError("Duplicate member name in the original archive: "+expected["kind"])
 sources.append((dict(expected,local_path=str(path)),data))
def body(path,data):
 record={"path":path,"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
 try:record.update(encoding="utf-8",content=data.decode("utf-8"))
 except UnicodeDecodeError:record.update(encoding="base64",content=base64.b64encode(data).decode())
 return record
scf={"schema":"commons.scf.original-operating-inputs.v1","operation":"SCF-ORIGINAL-OPERATING-INPUTS-81CF-20261013","sources":[]}
sdk=None
for record,data in sources:
 provenance={key:value for key,value in record.items() if key!="local_path"}
 if record["kind"]=="sf47":
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   matches=[n for n in z.namelist() if not n.endswith("/") and pathlib.PurePosixPath(n).name=="planning.zip"]
   selected=[(n,z.read(n)) for n in matches if hashlib.sha256(z.read(n)).hexdigest()=="2fcc813903a1fbd66532c0a3a17ed07d250f04d3e856f8a4c5dc84309a10e086"]
   if len(selected)!=1:raise ValueError("Original SF47 planning archive not uniquely present")
   name,archive=selected[0];files=[]
   with zipfile.ZipFile(io.BytesIO(archive)) as inner:
    if len(inner.namelist())!=len(set(inner.namelist())):raise ValueError("Duplicate original planning archive member")
    for info in inner.infolist():
     if info.is_dir():continue
     path=pathlib.PurePosixPath(info.filename)
     if path.is_absolute() or ".." in path.parts or "\\" in info.filename:raise ValueError("Invalid original planning member path")
     files.append(body(info.filename,inner.read(info.filename)))
   provenance["selected_archive"]=body(name,archive);provenance["files"]=files
   scf["sources"].append(provenance)
   print(json.dumps({"phase":"SF47_COMPLETE_PLANNING_EXTRACTED","archive_path":name,"files":[{k:f[k] for k in ["path","bytes","sha256","encoding"]} for f in files]}),flush=True)
 elif record["kind"]=="submission":
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   suffix="receiving/review-continuation/downloads/Independently_Received_Submission.json"
   matches=[n for n in z.namelist() if n==suffix or n.endswith("/"+suffix)]
   if len(matches)!=1:raise ValueError("Original independently received submission not uniquely present")
   content=z.read(matches[0])
   if hashlib.sha256(content).hexdigest()!="b6a94873e0c1599c023ee9f161c338a5dd6d3832e0290a3f226af49e72ae5cfc":raise ValueError("Original saved submission changed")
   json.loads(content);provenance["files"]=[body(matches[0],content)];scf["sources"].append(provenance)
   print(json.dumps({"phase":"ORIGINAL_SUBMISSION_EXTRACTED","member":matches[0],"bytes":len(content),"sha256":hashlib.sha256(content).hexdigest()}),flush=True)
 else:
  sdk={"source":provenance,"review":body(record["filename"],data)}
scf_bytes=(json.dumps(scf,ensure_ascii=False,indent=2)+"\n").encode()
output=work/"SCF_Original_Operating_Inputs_20261013.json";output.write_bytes(scf_bytes)
print(json.dumps({"phase":"SCF_ORIGINAL_INPUTS_COMPLETE","path":str(output),"bytes":len(scf_bytes),"sha256":hashlib.sha256(scf_bytes).hexdigest()}),flush=True)
