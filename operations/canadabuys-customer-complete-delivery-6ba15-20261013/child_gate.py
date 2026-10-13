#!/usr/bin/env python3
"""Report the acquired child's own procfs identity before the parent's START."""
import hashlib,json,os,sys
from pathlib import Path
request_path=Path(sys.argv[1]);write_fd=int(sys.argv[2])
raw=request_path.read_bytes();request=json.loads(raw)
stat=Path("/proc/self/stat").read_text();end=stat.rfind(")");fields=stat[end+2:].split()
identity={"pid":int(stat.split("(",1)[0].strip()),"startTicks":fields[19],
          "bootId":Path("/proc/sys/kernel/random/boot_id").read_text().strip()}
value={"process":identity,"parentHostPid":int(fields[1]),"namespacePid":os.getpid(),
       "requestSha256":hashlib.sha256(raw).hexdigest(),"argv":request["argv"]}
with os.fdopen(write_fd,"wb",buffering=0) as handle:
 handle.write((json.dumps(value,separators=(",",":"))+"\n").encode())
if sys.stdin.buffer.readline()!=b"START\n":raise RuntimeError("Original receiving child was not released")
os.execvpe(request["argv"][0],request["argv"],os.environ)
