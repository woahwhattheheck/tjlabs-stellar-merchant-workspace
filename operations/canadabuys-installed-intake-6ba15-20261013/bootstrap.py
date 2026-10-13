import ast,hashlib,json,os,sys,tty,traceback
from pathlib import Path
if sys.stdin.isatty():tty.setraw(sys.stdin.fileno())
print(json.dumps({"event":"CUSTOMER_INPUT_READY","namespacePid":os.getpid()}),flush=True)
raw=bytearray()
while len(raw)<4685476:
 block=os.read(sys.stdin.fileno(),min(65536,4685476-len(raw)))
 if not block:raise RuntimeError("Complete installed intake input ended early")
 raw.extend(block)
if hashlib.sha256(raw).hexdigest()!="9c178e83f92a8d11b2dedafcc1466c25701c79621a1ef50edcc78ef1f767815a":raise RuntimeError("Complete installed intake input changed")
value=json.loads(raw);del raw
source=value["mainSource"];ast.parse(source,filename="complete_intake_delivery.py")
print(json.dumps({"event":"CUSTOMER_INPUT_VERIFIED","bytes":4685476,"sha256":"9c178e83f92a8d11b2dedafcc1466c25701c79621a1ef50edcc78ef1f767815a"}),flush=True)
namespace={"__name__":"installed_intake_receiving","__file__":"/dev/canadabuys-installed-intake-6ba15-20261013/producer/complete_customer_delivery.py","NATIVE_INPUT":value}
try:
 exec(compile(source,namespace["__file__"],"exec"),namespace)
 namespace["main"]()
except BaseException as error:
 print(json.dumps({"event":"ORIGINAL_COMMAND_FAILED","error":str(error),"traceback":traceback.format_exc()}),flush=True)
finally:
 namespace.clear();namespace=None;source=None;value=None
 print(json.dumps({"event":"READY_FOR_NEXT_ORIGINAL_JOB","namespacePid":os.getpid(),"protocol":"JSON header bytes/sha256 followed by exact JSON {program}; stop with {stop:true,exit_code:0}"}),flush=True)

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
