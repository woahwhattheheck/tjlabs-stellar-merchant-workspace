import ast,hashlib,json,os,sys,tty,traceback
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

raw=decode_exact_native_input(sys.stdin.fileno(),1266072,"609f53ef719698e4a811529c30360ce455dc570d46876520a6a4de36b1ee7193",4204142,"a96dbb36c226c0f3ecbc39fcce61423beff55a515d468f1153f283992e94d2a0")
value=json.loads(raw);del raw
source=value["mainSource"];ast.parse(source,filename="complete_customer_delivery.py")
namespace={"__name__":"__main__","__file__":"complete_customer_delivery.py","NATIVE_INPUT":value}
value=None
print(json.dumps({"event":"CUSTOMER_INPUT_VERIFIED","bytes":4204142,"sha256":"a96dbb36c226c0f3ecbc39fcce61423beff55a515d468f1153f283992e94d2a0"}),flush=True)
try:exec(compile(source,"complete_customer_delivery.py","exec"),namespace)
except BaseException as error:
 print(json.dumps({"event":"ORIGINAL_COMMAND_FAILED","error":str(error),"traceback":traceback.format_exc()}),flush=True)
finally:
 namespace.clear();source=None
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
