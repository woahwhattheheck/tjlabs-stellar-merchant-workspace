#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Run the maintained complete CAMT source/application receiving operation."""
import argparse,hashlib,json,pathlib
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--artifacts",required=True,help="Directory retaining the complete case ZIP, result and transfer receipt")
parser.add_argument("--temporary-directory",help="Writable directory for this invocation's private expanded runtime")
parser.add_argument("--keep-runtime",action="store_true",help="Retain this stopped original installation/account for actual browser receiving")
parser.add_argument("--pdf",help="Complete issuer PDF for the original installed accounting case")
parser.add_argument("--pdf-working-copy",help="Complete reviewed working copy for that exact PDF")
parser.add_argument("--pdf-browser-module",help="Absolute existing Playwright module file")
parser.add_argument("--pdf-browser-executable",help="Existing local Chromium executable, if selected")
parser.add_argument("--pdf-prepare-only",action="store_true",help="Extract/render every original page and retain complete inputs for the same case")
parser.add_argument("--pdf-receive",action="store_true",help="Receive the supplied reviewed source through the original Bank writer")
parser.add_argument("--pdf-acknowledge-balance-difference",action="store_true",help="Explicitly retain the inspected original printed balance discrepancy")
parser.add_argument("--pdf-scale",type=float,default=1.5,help="Original page render scale, from0.1 to4")
parser.add_argument("--pdf-password-env",help="Environment variable containing the original PDF password")
args=parser.parse_args()
if any((args.pdf_working_copy,args.pdf_browser_module,args.pdf_browser_executable,args.pdf_prepare_only,args.pdf_receive,args.pdf_acknowledge_balance_difference,args.pdf_password_env))and not args.pdf:parser.error("PDF options require --pdf")
if args.pdf_receive and(not args.pdf_working_copy or args.pdf_prepare_only):parser.error("--pdf-receive requires --pdf-working-copy and the browser course")
if args.pdf and not(args.pdf_prepare_only or args.pdf_browser_module):parser.error("Choose the existing --pdf-browser-module or explicit --pdf-prepare-only")
if not 0.1<=args.pdf_scale<=4:parser.error("--pdf-scale must be from0.1 to4")
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
cfg["application"]["bankSourcesProgram"]=texts["receive-bank-sources.mjs"]
cfg["pdfProgram"]=texts["receive-pdf.mjs"]
if args.pdf:
 cfg["pdfInput"]={"path":str(pathlib.Path(args.pdf).expanduser().resolve()),"scale":args.pdf_scale,
  "prepareOnly":args.pdf_prepare_only,"receive":args.pdf_receive,"acknowledgeBalanceDifference":args.pdf_acknowledge_balance_difference}
 for key,value in (("workingCopy",args.pdf_working_copy),("browserModule",args.pdf_browser_module),("browserExecutable",args.pdf_browser_executable)):
  if value:cfg["pdfInput"][key]=str(pathlib.Path(value).expanduser().resolve())
 if args.pdf_password_env:cfg["pdfInput"]["passwordEnv"]=args.pdf_password_env
cfg["keepRuntime"]=args.keep_runtime
cfg["artifactDirectory"]=str(pathlib.Path(args.artifacts).expanduser().resolve())
if args.temporary_directory:
 temporary=pathlib.Path(args.temporary_directory).expanduser().resolve()
 temporary.mkdir(parents=True,exist_ok=True,mode=0o700)
 cfg["temporaryDirectory"]=str(temporary)
exec(compile(texts["producer.py"],str(here/"producer.py"),"exec"),{"cfg":cfg,"__name__":"__main__"})
