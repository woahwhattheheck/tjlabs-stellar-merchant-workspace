import ast,hashlib,json,os,sys,tty,traceback
from pathlib import Path
if sys.stdin.isatty():tty.setraw(sys.stdin.fileno())
print(json.dumps({"event":"CUSTOMER_INPUT_READY","namespacePid":os.getpid()}),flush=True)
import base64
import hashlib
import json
import os
import zlib

def decode_exact_native_input(descriptor, wire_bytes, wire_sha256, input_bytes, input_sha256):
    if type(wire_bytes) is not int or type(input_bytes) is not int or not 0 < wire_bytes <= 16000000 or not 0 < input_bytes <= 64000000:
        raise ValueError("Complete native input bounds are invalid")
    wire = bytearray()
    while len(wire) < wire_bytes:
        block = os.read(descriptor, min(65536, wire_bytes - len(wire)))
        if not block:
            raise RuntimeError("The complete original native input ended early")
        wire.extend(block)
    if hashlib.sha256(wire).hexdigest() != wire_sha256:
        raise RuntimeError("The original compressed native input differs")
    compressed = base64.b64decode(wire, validate=True)
    decoder = zlib.decompressobj(-15)
    raw = decoder.decompress(compressed, input_bytes + 1)
    if len(raw) != input_bytes or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
        raise RuntimeError("The decoded native input is incomplete, oversized or has trailing bytes")
    if hashlib.sha256(raw).hexdigest() != input_sha256:
        raise RuntimeError("The decoded native input differs from its original source bytes")
    return raw

raw=decode_exact_native_input(sys.stdin.fileno(),1272004,"d8882f32aeab098c7af69d188d6d89feff03c4be631674ef5106f62d33a6156b",4219373,"7b8e9da2183f227a1976783687dd576b1ed8c152ee104347be4d14f7144da764")
value=json.loads(raw);del raw
source=value["mainSource"];ast.parse(source,filename="complete_customer_delivery.py")
print(json.dumps({"event":"CUSTOMER_INPUT_VERIFIED","bytes":4219373,"sha256":"7b8e9da2183f227a1976783687dd576b1ed8c152ee104347be4d14f7144da764"}),flush=True)
def original_lifetime():
 raw=Path("/proc/self/stat").read_text();fields=raw[raw.rfind(")")+2:].split()
 boot=Path("/proc/sys/kernel/random/boot_id").read_text().strip()
 current={"pid":int(raw.split("(",1)[0].strip()),"startTicks":fields[19],"bootId":boot,"namespacePid":os.getpid()}
 previous={"pid":348028,"startTicks":"1854700","bootId":"bcc80c23-bcac-4c6b-8daa-1f97825fc4ae"}
 state="different boot"
 if boot==previous["bootId"]:
  if current["pid"]==previous["pid"] and current["startTicks"]==previous["startTicks"]:state="same original owned parent"
  else:
   try:
    old=Path("/proc",str(previous["pid"]),"stat").read_text();parts=old[old.rfind(")")+2:].split()
    if parts[19]==previous["startTicks"] and parts[0]!="Z":raise RuntimeError("The original94753 customer parent remains active")
    state="original PID changed or original is a zombie"
   except FileNotFoundError:state="original parent absent"
 for proc in Path("/proc").iterdir():
  if not proc.name.isdecimal() or int(proc.name)==current["pid"]:continue
  try:
   raw=(proc/"stat").read_text();parts=raw[raw.rfind(")")+2:].split()
   if parts[0]=="Z":continue
   argv=[os.fsdecode(x) for x in (proc/"cmdline").read_bytes().split(b"\0") if x]
  except FileNotFoundError:continue
  except PermissionError:raise RuntimeError("Original customer child custody cannot be observed")
  roots=("/dev/canadabuys-customer-6ba15-20261013/","/dev/shm/canadabuys-customer-6ba15-20261013/")
  if any(part.startswith(roots) for part in argv):raise RuntimeError("An original customer child remains active: "+proc.name)
 return {"current":current,"previous":previous,"previousState":state,"matchingOriginalChildren":[]}
namespace=None
try:
 lifetime=original_lifetime()
 root=Path("/dev/canadabuys-customer-6ba15-20261013")
 if root.is_symlink() or (root.exists() and (not root.is_dir() or root.resolve()!=root)):raise RuntimeError("Original customer root is not a canonical directory")
 original=root/"original-input.json";received=value
 if original.exists():
  if original.is_symlink() or not original.is_file():raise RuntimeError("Original complete customer input is not a regular file")
  oldraw=original.read_bytes();old=json.loads(oldraw)
  if {k:v for k,v in old.items() if k!="preparationHistory"}!={k:v for k,v in received.items() if k!="preparationHistory"}:raise RuntimeError("Retained original customer source/input differs")
  canonical=(json.dumps(old,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
  if oldraw!=canonical:raise RuntimeError("Original customer input bytes differ from its native publication")
  value=old
 else:canonical=(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=False)+"\n").encode()
 namespace={"__name__":"canadabuys_original_receiving_entry","__file__":str(root/"producer/complete_customer_delivery.py"),"NATIVE_INPUT":value}
 exec(compile(source,str(root/"producer/complete_customer_delivery.py"),"exec"),namespace)
 handoff={"schema":"commons.canadabuys-customer-native-handoff.v1","operationId":value["operationId"],"sourceCommit":value["sourceCommit"],
  "selectedInput":{"bytes":4219373,"sha256":"7b8e9da2183f227a1976783687dd576b1ed8c152ee104347be4d14f7144da764"},"executedInput":{"bytes":len(canonical),"sha256":hashlib.sha256(canonical).hexdigest()},
  "retainedInputReused":original.exists(),"lifetime":lifetime,"preparationHistory":received.get("preparationHistory")}
 name="7b8e9da2183f227a1976783687dd576b1ed8c152ee104347be4d14f7144da764-"+str(lifetime["current"]["pid"])+"-"+lifetime["current"]["startTicks"]+".json"
 namespace["pubjson"](root/"recovery"/"execution-handoffs"/name,handoff)
 print(json.dumps({"event":"CUSTOMER_ORIGINAL_LIFETIME_BOUND","sourceCommit":value["sourceCommit"],"retainedInputReused":handoff["retainedInputReused"],"lifetime":lifetime}),flush=True)
 value=None;received=None;canonical=None;handoff=None
 namespace["main"]()
except BaseException as error:
 print(json.dumps({"event":"ORIGINAL_COMMAND_FAILED","error":str(error),"traceback":traceback.format_exc()}),flush=True)
finally:
 if namespace is not None:namespace.clear()
 namespace=None;source=None;value=None
 print(json.dumps({"event":"READY_FOR_NEXT_ORIGINAL_JOB","namespacePid":os.getpid(),"protocol":"JSON header bytes/sha256 followed by exact JSON {program} UTF-8 bytes; stop with {stop:true,exit_code:0}"}),flush=True)

while True:
 line=bytearray()
 while not line.endswith(b"\n"):
  block=os.read(sys.stdin.fileno(),1)
  if not block:raise SystemExit(0)
  line.extend(block)
  if len(line)>8192:raise RuntimeError("Original next-job header exceeds its bound")
 header=json.loads(line)
 if header.get("stop") is True:raise SystemExit(int(header.get("exit_code",0)))
 length=header.get("bytes")
 if type(length) is not int or not 0<length<=20000000:raise RuntimeError("Original whole next-job size is invalid")
 raw=bytearray()
 while len(raw)<length:
  block=os.read(sys.stdin.fileno(),min(65536,length-len(raw)))
  if not block:raise RuntimeError("Original next-job input ended early")
  raw.extend(block)
 if hashlib.sha256(raw).hexdigest()!=header.get("sha256"):raise RuntimeError("Original next-job source differs")
 job=json.loads(raw);del raw
 scope={"__name__":"__main__","__file__":"retained_original_job.py"}
 try:
  exec(compile(job["program"],"retained_original_job.py","exec"),scope)
  print(json.dumps({"event":"ORIGINAL_COMMAND_COMPLETE"}),flush=True)
 except BaseException as error:print(json.dumps({"event":"ORIGINAL_COMMAND_FAILED","error":str(error),"traceback":traceback.format_exc()}),flush=True)
 finally:scope.clear();job=None
