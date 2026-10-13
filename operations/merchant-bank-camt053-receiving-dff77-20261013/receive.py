#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the maintained complete CAMT source/application receiving operation."""
import argparse,hashlib,json,pathlib
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--artifacts",required=True,help="Directory retaining the complete case ZIP, result and transfer receipt")
parser.add_argument("--temporary-directory",help="Writable directory for this invocation's private expanded runtime")
parser.add_argument("--keep-runtime",action="store_true",help="Retain this stopped original installation/account for actual browser receiving")
args=parser.parse_args()
here=pathlib.Path(__file__).resolve().parent
manifest=json.loads((here/"receiving-manifest.json").read_text(encoding="utf-8"))
assert manifest["schema"]=="stellar-forge.camt053.maintained-receiver.v1"
texts={}
for item in manifest["files"]:
 path=pathlib.PurePosixPath(item["path"])
 if path.is_absolute()or ".."in path.parts:raise ValueError("Original receiver path must remain inside its directory")
 data=(here/path).read_bytes()
 assert len(data)==item["bytes"]and hashlib.sha256(data).hexdigest()==item["sha256"],item["path"]
 assert hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()==item["git_blob_sha1"],item["path"]
 texts[item["path"]]=data.decode("utf-8")
cfg=json.loads(texts["source-config.json"])
cfg["bundesbankOriginals"]=json.loads(texts["BUNDESBANK_ORIGINALS.json"])
cfg["nodeProgram"]=texts["receive-originals.mjs"]
cfg["application"]["nodeProgram"]=texts["receive-application.mjs"]
cfg["application"]["mcpProgram"]=texts["receive-account-mcp.mjs"]
cfg["keepRuntime"]=args.keep_runtime
cfg["artifactDirectory"]=str(pathlib.Path(args.artifacts).expanduser().resolve())
if args.temporary_directory:
 temporary=pathlib.Path(args.temporary_directory).expanduser().resolve()
 temporary.mkdir(parents=True,exist_ok=True,mode=0o700)
 cfg["temporaryDirectory"]=str(temporary)
exec(compile(texts["producer.py"],str(here/"producer.py"),"exec"),{"cfg":cfg,"__name__":"__main__"})
