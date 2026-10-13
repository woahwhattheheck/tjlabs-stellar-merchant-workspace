#!/usr/bin/env python3
# MIT. Original OpenAQ Buyer receiving: one retained Git/source/native lifetime.
import os,sys,json,stat,fcntl,hashlib,subprocess,signal,time,ctypes,tempfile,shutil,selectors,errno,zipfile,termios
from pathlib import Path
COMMIT="c7ac4399e3bb419fafd42395841bace7d089036a"
REPOSITORY="https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git"
CONTROL=Path("/dev/shm/921ba0-openaq-buyer-native-20261012")
active=None
requested=None
libc=ctypes.CDLL(None,use_errno=True)
if libc.prctl(36,1,0,0,0)!=0: raise OSError(ctypes.get_errno(),"child subreaper")
def digest(raw): return hashlib.sha256(raw).hexdigest()
def say(value): print(json.dumps(value,separators=(",",":")),flush=True)
def owned(path):
 s=path.lstat()
 if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or path.resolve()!=path:
  raise RuntimeError("ORIGINAL_PRIVATE_DIRECTORY_REQUIRED:"+str(path))
 return s
def exact(path,raw):
 if path.exists():
  s=path.lstat()
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or path.read_bytes()!=raw: raise RuntimeError("ORIGINAL_RETAINED_FILE_CHANGED:"+str(path))
  return
 temp=path.with_name(path.name+".pending")
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077: raise RuntimeError("ORIGINAL_PENDING_FILE_CHANGED")
  os.ftruncate(fd,0)
  with os.fdopen(fd,"wb",closefd=False) as out: out.write(raw);out.flush()
  os.fsync(fd)
 finally: os.close(fd)
 try: os.link(temp,path)
 except FileExistsError:
  if path.read_bytes()!=raw: raise RuntimeError("ORIGINAL_RETAINED_FILE_CHANGED")
 temp.unlink()
 fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
 try: os.fsync(fd)
 finally: os.close(fd)
def encoded(value): return (json.dumps(value,sort_keys=True,separators=(",",":"))+"\n").encode()
def group_signal(child,sig):
 try: os.killpg(child.pid,sig)
 except ProcessLookupError: pass
def relay(sig,frame):
 global requested
 requested=sig
 if active is not None: group_signal(active,sig)
signal.signal(signal.SIGINT,relay);signal.signal(signal.SIGTERM,relay)
def group_alive(child):
 try: os.killpg(child.pid,0);return True
 except ProcessLookupError:return False
def reap_group(child):
 # Only after Popen itself owns and records its leader result.
 if child.returncode is None:return
 while True:
  try:
   pid,status=os.waitpid(-child.pid,os.WNOHANG)
   if pid==0:return
  except ChildProcessError:return
def run(args,cwd,environment=None,grace=180,terminal=False,timeout=None,*,guard_fd):
 global active
 if requested: raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
 master=slave=None
 ownership={"start_new_session":not terminal,"pass_fds":(guard_fd,)}
 try:
  if terminal:
   master,slave=os.openpty()
   def control_terminal():
    os.setsid()
    fcntl.ioctl(slave,termios.TIOCSCTTY,0)
   ownership={"preexec_fn":control_terminal,"pass_fds":(guard_fd,slave)}
  child=subprocess.Popen(args,cwd=cwd,env=environment,**ownership,
   stdin=slave if terminal else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 except BaseException:
  for descriptor in (master,slave):
   if descriptor is not None:os.close(descriptor)
  raise
 active=child
 selector=None;primary=None;tail=bytearray();eof=False;started_stop=None;killed=False;started=time.monotonic()
 try:
  if slave is not None:os.close(slave);slave=None
  if requested:group_signal(child,requested);started_stop=time.monotonic()
  selector=selectors.DefaultSelector()
  os.set_blocking(child.stdout.fileno(),False)
  selector.register(child.stdout,selectors.EVENT_READ)
  if master is not None:
   os.set_blocking(master,False);selector.register(master,selectors.EVENT_READ)
  while True:
   if timeout is not None and time.monotonic()-started>=timeout and started_stop is None:
    primary=TimeoutError("ORIGINAL_SOURCE_READ_DEADLINE")
    group_signal(child,signal.SIGTERM);started_stop=time.monotonic()
   if requested and started_stop is None:group_signal(child,requested);started_stop=time.monotonic()
   if started_stop is not None and time.monotonic()-started_stop>=grace and not killed:
    group_signal(child,signal.SIGKILL);killed=True
   for key,event in selector.select(.25):
    try:raw=os.read(key.fd,65536)
    except BlockingIOError:continue
    except OSError as error:
     if master is not None and key.fd==master and error.errno==errno.EIO:raw=b""
     else:raise
    if raw:
     tail.extend(raw)
     if len(tail)>65536:del tail[:-65536]
     # Original child diagnostics/phase output; no credential is requested.
     sys.stdout.buffer.write(raw);sys.stdout.buffer.flush()
    else:
     eof=True;selector.unregister(key.fileobj)
   code=child.poll()
   if code is not None:
    reap_group(child)
    if not group_alive(child) and not selector.get_map():break
    if started_stop is None:group_signal(child,signal.SIGTERM);started_stop=time.monotonic()
  code=child.wait()
 except BaseException as error:
  primary=error
 finally:
  # Acquired-child errors use this independent retirement path, even if the
  # selector could not be initialized. Never discard an active owner.
  if child.returncode is None or group_alive(child):
   group_signal(child,signal.SIGTERM)
   deadline=time.monotonic()+grace
   while True:
    child.poll();reap_group(child)
    if child.returncode is not None and not group_alive(child):break
    if time.monotonic()>=deadline:group_signal(child,signal.SIGKILL)
    try:
     if child.stdout is not None:
      os.set_blocking(child.stdout.fileno(),False)
      while os.read(child.stdout.fileno(),65536):pass
    except (OSError,ValueError):pass
    time.sleep(.1)
  child.wait();reap_group(child)
  if selector is not None:selector.close()
  child.stdout.close()
  for descriptor in (master,slave):
   if descriptor is not None:os.close(descriptor)
  active=None
 if primary:raise primary
 if requested:raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
 if child.returncode:raise RuntimeError("ORIGINAL_CHILD_EXIT_"+str(child.returncode))
 return bytes(tail)

SOURCE_MANIFEST_SHA="6c9d4ca8c04c5a3c52d6aba940660682dff02ad244bb36e6a35da2309ddde15c"
SOURCE_FILE_COUNT=808
def source_parent(source,relative):
 if not isinstance(relative,str) or relative.startswith("/") or "\\" in relative or "\0" in relative:raise RuntimeError("ORIGINAL_SOURCE_PATH_INVALID")
 parts=relative.split("/")
 if not parts or any(p in ("",".","..") for p in parts):raise RuntimeError("ORIGINAL_SOURCE_PATH_INVALID")
 parent=source
 for part in parts[:-1]:
  parent=parent/part;parent.mkdir(mode=0o700,exist_ok=True)
  s=parent.lstat()
  if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or s.st_uid!=os.getuid() or parent.resolve()!=parent:raise RuntimeError("ORIGINAL_SOURCE_PARENT_CHANGED")
 return parent/parts[-1]
SIGNER_SOURCE_REPAIR={"schema":"stellar-forge.openaq-buyer-source-repair.v1","repository":"woahwhattheheck/tjlabs-stellar-merchant-workspace","baseCommit":"c7ac4399e3bb419fafd42395841bace7d089036a","reason":"Import the original native signing diagnostic validator from its actual diagnostics module; preserve the original signer adapter and all request/payment behavior.","before":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/native-signer.mjs","gitBlob":"053825b1862f3a5b3fc42aaa248f6b8aa6401254","bytes":13420,"sha256":"66d744c89f3e23157ba895f228729d6b294893260202cfdfe830cb7a8215461c"},"after":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/native-signer.mjs","gitBlob":"c12720ce4f432e24f4972523021d71fa9d85e2ce","bytes":13483,"sha256":"b30f43740c9d0a7f99439ac8e6876aea6284d15efad71cf5168bed9d8c705cc0"}}
UNPAID_SOURCE_REPAIR={"schema":"stellar-forge.openaq-buyer-unpaid-source-selection.v1","repository":"woahwhattheheck/tjlabs-stellar-merchant-workspace","baseCommit":"c7ac4399e3bb419fafd42395841bace7d089036a","sourceManifestSha256":"6c9d4ca8c04c5a3c52d6aba940660682dff02ad244bb36e6a35da2309ddde15c","assetsSha256":"6b2dbcd5dacf9e8ecb280611772da607198731e0f73bb526c7a4c75504a9dcbc","packetSha256":"6b1737f1f98c82ef777e3f3dde78433bb0e55287aa0efc906897aea090e52998","reason":"Preserve the original Dataset unsigned wire and linked SF82 checkout records in its existing unpaid history before explicit same-page continuation.","files":[{"before":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/attempt-wire.mjs","gitBlob":"e87fd6310a8261c490930ace3225dbd3a857de78","bytes":36219,"sha256":"8247cf9b2f0a6df5e5417adaf9cf8d14a491b4c1c8477029e43b2c514254f35b"},"after":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/attempt-wire.mjs","bytes":43462,"sha256":"055e76e4f6f4655a1cce000dc8b13cec2a24d733d746d6f43be68dbe4978cf2c","gitBlob":"092304ce9ed33fe7a2c1d483501a091e3db6c7b9"}},{"before":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-unpaid.mjs","gitBlob":"d01a8e16d70d35a27ec7bc67fd2e1d51461dc743","bytes":14526,"sha256":"7d098e04db4524c223e3e7f8849e65938b1a334c6654a35889b08f91586a82e7"},"after":{"path":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/dataset-unpaid.mjs","bytes":22182,"sha256":"f9b9832a16c09cab1ca4b6ced416f94e060d778c1be38606cad4a93cfbfb99fe","gitBlob":"a99c40ec7ee4c2df8a8df9d9339b05a3e469ba08"}}]}
def source_body_matches(raw,item):
 return len(raw)==item["bytes"] and digest(raw)==item["sha256"] and hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()==item["gitBlob"]
def verify_source_file(path,item):
 try:
  before=path.lstat()
 except FileNotFoundError:return False
 if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode) or before.st_uid!=os.getuid() or path.resolve()!=path:raise RuntimeError("ORIGINAL_SOURCE_FILE_CHANGED:"+str(path))
 raw=path.read_bytes();after=path.lstat()
 if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise RuntimeError("ORIGINAL_SOURCE_FILE_CHANGED:"+str(path))
 if not source_body_matches(raw,item):
  repairs=[SIGNER_SOURCE_REPAIR]+UNPAID_SOURCE_REPAIR["files"]
  if not any(item==repair["before"] and source_body_matches(raw,repair["after"]) for repair in repairs):raise RuntimeError("ORIGINAL_SOURCE_FILE_CHANGED:"+str(path))
 return True
def source_manifest(raw):
 if digest(raw)!=SOURCE_MANIFEST_SHA:raise RuntimeError("ORIGINAL_SOURCE_MANIFEST_CHANGED")
 value=json.loads(raw)
 if value["schema"]!="stellar-forge.openaq-buyer-native-source.v1" or value["repository"]!="woahwhattheheck/tjlabs-stellar-merchant-workspace" or value["commit"]!=COMMIT or len(value["files"])!=SOURCE_FILE_COUNT:raise RuntimeError("ORIGINAL_SOURCE_SELECTION_CHANGED")
 if len({f["path"] for f in value["files"]})!=SOURCE_FILE_COUNT:raise RuntimeError("ORIGINAL_SOURCE_PATH_REPEATED")
 return value
def receive_source(source):
 import base64,gzip,select,uuid
 retained_manifest=CONTROL/"source-manifest.json"
 if retained_manifest.exists():
  raw=retained_manifest.read_bytes();selected=source_manifest(raw)
  if all(verify_source_file(source_parent(source,f["path"]),f) for f in selected["files"]):
   exact(source/"SOURCE-SELECTION.json",raw)
   say({"phase":"ORIGINAL_EXACT_SOURCE_REOPENED","files":SOURCE_FILE_COUNT,"manifestSha256":SOURCE_MANIFEST_SHA});return
 capsule=CONTROL/"source-capsule.gz";temporary=None;output=None;holder=None;file=None;terminal_state=None
 pending=bytearray()
 if capsule.exists():
  info=capsule.lstat()
  if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise RuntimeError("ORIGINAL_SOURCE_CAPSULE_CHANGED")
  holder=gzip.open(capsule,"rb")
  def record():
   value=holder.readline(2*1024*1024+1)
   if not value.endswith(b"\n") or len(value)>2*1024*1024:raise RuntimeError("ORIGINAL_SOURCE_RECORD_INCOMPLETE")
   return value
  say({"phase":"ORIGINAL_SOURCE_CAPSULE_REOPEN","manifestSha256":SOURCE_MANIFEST_SHA})
 else:
  if sys.stdin.isatty():
   terminal_state=termios.tcgetattr(sys.stdin.fileno());settings=list(terminal_state);settings[3]&=~(termios.ECHO|termios.ICANON)
   termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,settings)
  def record():
   deadline=time.monotonic()+180
   while b"\n" not in pending:
    if requested:raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
    remaining=deadline-time.monotonic()
    if remaining<=0:raise TimeoutError("ORIGINAL_SOURCE_INPUT_DEADLINE")
    if not select.select([sys.stdin.fileno()],[],[],min(remaining,1))[0]:continue
    chunk=os.read(sys.stdin.fileno(),65536)
    if not chunk:raise RuntimeError("ORIGINAL_SOURCE_INPUT_CLOSED")
    pending.extend(chunk)
    if len(pending)>4*1024*1024:raise RuntimeError("ORIGINAL_SOURCE_RECORD_TOO_LARGE")
   boundary=pending.index(10)+1;raw=bytes(pending[:boundary]);del pending[:boundary]
   if len(raw)>2*1024*1024:raise RuntimeError("ORIGINAL_SOURCE_RECORD_TOO_LARGE")
   return raw
  temporary=CONTROL/("source-stream-"+str(uuid.uuid4())+".pending")
  file=os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),"wb")
  output=gzip.GzipFile(filename="",mode="wb",fileobj=file,mtime=0)
  say({"phase":"READY_FOR_ORIGINAL_SOURCE","files":SOURCE_FILE_COUNT,"manifestSha256":SOURCE_MANIFEST_SHA})
 try:
  header=record();selected=source_manifest(header)
  if output:output.write(header)
  for index,item in enumerate(selected["files"]):
   raw=record();entry=json.loads(raw)
   if entry.get("path")!=item["path"] or entry.get("gitBlob")!=item["gitBlob"]:raise RuntimeError("ORIGINAL_SOURCE_RECORD_IDENTITY_CHANGED")
   if entry.get("encoding")=="base64":body=base64.b64decode(entry["content"].encode("ascii").replace(b"\n",b"").replace(b"\r",b""),validate=True)
   elif entry.get("encoding")=="utf-8":body=entry["content"].encode("utf-8")
   else:raise RuntimeError("ORIGINAL_SOURCE_ENCODING_CHANGED")
   if len(body)!=item["bytes"] or digest(body)!=item["sha256"] or hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()!=item["gitBlob"]:raise RuntimeError("ORIGINAL_SOURCE_BODY_CHANGED:"+item["path"])
   target=source_parent(source,item["path"])
   if not verify_source_file(target,item):exact(target,body)
   if output:output.write(raw)
   if (index+1)%100==0:say({"phase":"ORIGINAL_SOURCE_RECEIVED","files":index+1,"of":SOURCE_FILE_COUNT})
  if holder and holder.read(1):raise RuntimeError("ORIGINAL_SOURCE_CAPSULE_TRAILING_BYTES")
  if output:
   output.close();output=None;file.flush();os.fsync(file.fileno());file.close()
   try:os.link(temporary,capsule)
   except FileExistsError:
    if digest(temporary.read_bytes())!=digest(capsule.read_bytes()):raise RuntimeError("ORIGINAL_SOURCE_CAPSULE_ALREADY_EXISTS")
   temporary.unlink()
   directory_fd=os.open(CONTROL,os.O_RDONLY|os.O_DIRECTORY)
   try:os.fsync(directory_fd)
   finally:os.close(directory_fd)
  exact(retained_manifest,header);exact(source/"SOURCE-SELECTION.json",header)
  say({"phase":"ORIGINAL_EXACT_SOURCE_READY","files":SOURCE_FILE_COUNT,"manifestSha256":SOURCE_MANIFEST_SHA,"capsule":str(capsule),"capsuleBytes":capsule.stat().st_size})
 finally:
  if holder:holder.close()
  try:
   if output:output.close()
  finally:
   try:
    if file is not None and not file.closed:file.close()
   finally:
    if terminal_state is not None:termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,terminal_state)

SOURCE_ASSETS_SHA="6b2dbcd5dacf9e8ecb280611772da607198731e0f73bb526c7a4c75504a9dcbc"
SOURCE_ASSET_COUNT=19
def receive_assets(source,raw=None):
 import select
 retained=CONTROL/"source-assets.json"
 if raw is None and retained.exists():raw=retained.read_bytes()
 if raw is None:
  terminal_state=None;pending=bytearray()
  try:
   if sys.stdin.isatty():
    terminal_state=termios.tcgetattr(sys.stdin.fileno());settings=list(terminal_state);settings[3]&=~(termios.ECHO|termios.ICANON)
    termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,settings)
   say({"phase":"READY_FOR_ORIGINAL_ASSETS","files":SOURCE_ASSET_COUNT,"sha256":SOURCE_ASSETS_SHA})
   deadline=time.monotonic()+180
   while b"\n" not in pending:
    if requested:raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
    remaining=deadline-time.monotonic()
    if remaining<=0:raise TimeoutError("ORIGINAL_ASSET_INPUT_DEADLINE")
    if not select.select([sys.stdin.fileno()],[],[],min(remaining,1))[0]:continue
    chunk=os.read(sys.stdin.fileno(),65536)
    if not chunk:raise RuntimeError("ORIGINAL_ASSET_INPUT_CLOSED")
    pending.extend(chunk)
    if len(pending)>1024*1024:raise RuntimeError("ORIGINAL_ASSET_RECORD_TOO_LARGE")
   boundary=pending.index(10)+1
   if boundary!=len(pending):raise RuntimeError("ORIGINAL_ASSET_TRAILING_BYTES")
   raw=bytes(pending)
  finally:
   if terminal_state is not None:termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,terminal_state)
 if digest(raw)!=SOURCE_ASSETS_SHA:raise RuntimeError("ORIGINAL_SOURCE_ASSETS_CHANGED")
 value=json.loads(raw)
 if value["schema"]!="stellar-forge.openaq-buyer-native-source-assets.v1" or value["repository"]!="woahwhattheheck/tjlabs-stellar-merchant-workspace" or value["commit"]!=COMMIT or value["baseManifestSha256"]!=SOURCE_MANIFEST_SHA or len(value["files"])!=SOURCE_ASSET_COUNT:raise RuntimeError("ORIGINAL_SOURCE_ASSET_SELECTION_CHANGED")
 if len({f["path"] for f in value["files"]})!=SOURCE_ASSET_COUNT:raise RuntimeError("ORIGINAL_SOURCE_ASSET_REPEATED")
 for item in value["files"]:
  if item["encoding"]!="utf-8":raise RuntimeError("ORIGINAL_SOURCE_ASSET_ENCODING")
  body=item["content"].encode("utf-8")
  if len(body)!=item["bytes"] or digest(body)!=item["sha256"] or hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()!=item["gitBlob"]:raise RuntimeError("ORIGINAL_SOURCE_ASSET_BODY_CHANGED")
  target=source_parent(source,item["path"])
  if not verify_source_file(target,item):exact(target,body)
 exact(retained,raw)
 base=source_manifest((CONTROL/"source-manifest.json").read_bytes())
 additions=[{k:f[k] for k in ("path","gitBlob","bytes","sha256")} for f in value["files"]]
 if {f["path"] for f in additions}&{f["path"] for f in base["files"]}:raise RuntimeError("ORIGINAL_SOURCE_ASSET_OVERLAP")
 selection={"schema":"stellar-forge.openaq-buyer-complete-source.v1","commit":COMMIT,"baseManifestSha256":SOURCE_MANIFEST_SHA,"assetsSha256":SOURCE_ASSETS_SHA,"files":base["files"]+additions}
 exact(source/"SOURCE-ASSETS.json",encoded(selection))
 say({"phase":"ORIGINAL_RUNTIME_ASSETS_READY","files":SOURCE_ASSET_COUNT,"totalSourceFiles":SOURCE_FILE_COUNT+SOURCE_ASSET_COUNT,"sha256":SOURCE_ASSETS_SHA})

def apply_signer_source_repair(source):
 item=SIGNER_SOURCE_REPAIR["before"];post=SIGNER_SOURCE_REPAIR["after"]
 target=source_parent(source,item["path"])
 if not verify_source_file(target,item):raise RuntimeError("ORIGINAL_SIGNER_SOURCE_REQUIRED")
 info=target.lstat();raw=target.read_bytes()
 exact(CONTROL/"source-signing-import-repair.json",encoded(SIGNER_SOURCE_REPAIR))
 if not source_body_matches(raw,post):
  if not source_body_matches(raw,item):raise RuntimeError("ORIGINAL_SIGNER_SOURCE_PREIMAGE_CHANGED")
  original=b"import { createNativeBuyerSigner, readNativeSigningDiagnostic } from '../sf103-native-buyer-signer/adapter.mjs';"
  replacement=b"import { createNativeBuyerSigner } from '../sf103-native-buyer-signer/adapter.mjs';\nimport { readNativeSigningDiagnostic } from '../sf103-native-buyer-signer/diagnostics.mjs';"
  if raw.count(original)!=1:raise RuntimeError("ORIGINAL_SIGNER_IMPORT_CHANGED")
  corrected=raw.replace(original,replacement)
  if not source_body_matches(corrected,post):raise RuntimeError("ORIGINAL_SIGNER_POSTIMAGE_CHANGED")
  pending=target.with_name(target.name+"."+post["gitBlob"]+".pending")
  exact(pending,corrected)
  current=target.lstat()
  identity=lambda value:(value.st_dev,value.st_ino,value.st_size,value.st_mtime_ns,value.st_ctime_ns)
  if identity(info)!=identity(current) or target.read_bytes()!=raw:raise RuntimeError("ORIGINAL_SIGNER_SOURCE_MOVED")
  os.replace(pending,target)
  parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(parent)
  finally:os.close(parent)
 if not verify_source_file(target,post):raise RuntimeError("ORIGINAL_SIGNER_CORRECTION_INCOMPLETE")
 exact(source/"SOURCE-REPAIRS.json",encoded(SIGNER_SOURCE_REPAIR))
 say({"phase":"ORIGINAL_SIGNER_IMPORT_READY","path":item["path"],"before":item["gitBlob"],"after":post["gitBlob"]})

def receive_unpaid_repairs(source,inline=None):
 import select
 retained=CONTROL/("source-unpaid-repairs."+UNPAID_SOURCE_REPAIR["packetSha256"]+".json")
 if inline is not None:raw=inline
 elif retained.exists():
  info=retained.lstat()
  if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise RuntimeError("ORIGINAL_UNPAID_REPAIR_PACKET_CHANGED")
  raw=retained.read_bytes()
 else:
  terminal_state=None;pending=bytearray();deadline=time.monotonic()+180
  try:
   if os.isatty(sys.stdin.fileno()):
    terminal_state=termios.tcgetattr(sys.stdin.fileno());current=termios.tcgetattr(sys.stdin.fileno())
    current[3]&=~(termios.ECHO|termios.ICANON);termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,current)
   say({"phase":"READY_FOR_ORIGINAL_UNPAID_REPAIRS","files":2,"sha256":UNPAID_SOURCE_REPAIR["packetSha256"]})
   while b"\n" not in pending:
    if requested:raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
    remaining=deadline-time.monotonic()
    if remaining<=0:raise TimeoutError("ORIGINAL_UNPAID_REPAIR_INPUT_DEADLINE")
    if not select.select([sys.stdin.fileno()],[],[],min(remaining,1))[0]:continue
    chunk=os.read(sys.stdin.fileno(),65536)
    if not chunk:raise RuntimeError("ORIGINAL_UNPAID_REPAIR_INPUT_CLOSED")
    pending.extend(chunk)
    if len(pending)>262144:raise RuntimeError("ORIGINAL_UNPAID_REPAIR_INPUT_TOO_LARGE")
   if pending.index(10)+1!=len(pending):raise RuntimeError("ORIGINAL_UNPAID_REPAIR_TRAILING_BYTES")
   raw=bytes(pending)
  finally:
   if terminal_state is not None:termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,terminal_state)
 if digest(raw)!=UNPAID_SOURCE_REPAIR["packetSha256"]:raise RuntimeError("ORIGINAL_UNPAID_REPAIR_PACKET_CHANGED")
 value=json.loads(raw)
 if value["schema"]!="stellar-forge.openaq-buyer-unpaid-source.v1" or value["repository"]!=UNPAID_SOURCE_REPAIR["repository"] or value["baseCommit"]!=COMMIT or value["sourceManifestSha256"]!=SOURCE_MANIFEST_SHA or value["assetsSha256"]!=SOURCE_ASSETS_SHA or len(value["files"])!=2:raise RuntimeError("ORIGINAL_UNPAID_REPAIR_SELECTION_CHANGED")
 for file,pin in zip(value["files"],UNPAID_SOURCE_REPAIR["files"]):
  if file["before"]!=pin["before"] or file["after"]!=pin["after"] or file["encoding"]!="utf-8" or not source_body_matches(file["content"].encode("utf-8"),pin["after"]):raise RuntimeError("ORIGINAL_UNPAID_REPAIR_BODY_CHANGED")
 exact(retained,raw)
 exact(CONTROL/("source-unpaid-repair-selection."+UNPAID_SOURCE_REPAIR["packetSha256"]+".json"),encoded(UNPAID_SOURCE_REPAIR))
 for file in value["files"]:
  before=file["before"];post=file["after"];target=source_parent(source,before["path"])
  if not verify_source_file(target,before):raise RuntimeError("ORIGINAL_UNPAID_SOURCE_REQUIRED")
  info=target.lstat();current=target.read_bytes()
  if not source_body_matches(current,post):
   if not source_body_matches(current,before):raise RuntimeError("ORIGINAL_UNPAID_SOURCE_PREIMAGE_CHANGED")
   pending=target.with_name(target.name+"."+post["gitBlob"]+".pending")
   exact(pending,file["content"].encode("utf-8"))
   latest=target.lstat()
   identity=lambda entry:(entry.st_dev,entry.st_ino,entry.st_size,entry.st_mtime_ns,entry.st_ctime_ns)
   if identity(info)!=identity(latest) or target.read_bytes()!=current:raise RuntimeError("ORIGINAL_UNPAID_SOURCE_MOVED")
   os.replace(pending,target)
   parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
   try:os.fsync(parent)
   finally:os.close(parent)
  if not verify_source_file(target,post):raise RuntimeError("ORIGINAL_UNPAID_SOURCE_INCOMPLETE")
 exact(source/"SOURCE-UNPAID-REPAIRS.json",encoded(UNPAID_SOURCE_REPAIR))
 say({"phase":"ORIGINAL_UNPAID_HISTORY_SOURCE_READY","files":2,"packetSha256":UNPAID_SOURCE_REPAIR["packetSha256"]})

SOURCE_OPERATOR_SELECTION={"schema":"stellar-forge.openaq-buyer-original-operator-source.v1","repository":"woahwhattheheck/tjlabs-stellar-merchant-workspace","baseCommit":"c7ac4399e3bb419fafd42395841bace7d089036a","sourceManifestSha256":"6c9d4ca8c04c5a3c52d6aba940660682dff02ad244bb36e6a35da2309ddde15c","assetsSha256":"6b2dbcd5dacf9e8ecb280611772da607198731e0f73bb526c7a4c75504a9dcbc","files":[{"path":"stellar/scf-starforge-20261009/sf62-human-approval-cli/console.py","gitBlob":"9edcb4f9ac15a4659438bf82e781bbaf76b2b122","bytes":10763,"sha256":"67abdaf937e11211bb6b2d1862b613488e966a98d7f42a93a088960ac86fdbc7","encoding":"utf-8"},{"path":"stellar/scf-starforge-20261009/sf54-buyer-governor-intent/intent_adapter.py","gitBlob":"6d61d651b7137ba411d2b24cb69f0639080e1515","bytes":4084,"sha256":"873b576c1738dfcba7fe32cb1afcc514d827f95c950a7b1e6e511d474460a836","encoding":"utf-8"},{"path":"stellar/scf-starforge-20261009/sf59-operator-reservation-gate/operator_gate.py","gitBlob":"9817043b7f74d6f570905c09c0592e442bfa85cb","bytes":3785,"sha256":"e14bea10b2cfb7c5cfbeea142f339e0939b39a1863212465a61d0b2ba59c36ce","encoding":"utf-8"}],"packetSha256":"df6a22deeba2837845775f1759f78c48500492e29b2ed6da40f8740af914819d"}
def receive_operator_sources(source,raw=None):
 retained=CONTROL/"source-operator.json"
 if raw is None:
  if not retained.exists():raise RuntimeError("ORIGINAL_OPERATOR_SOURCE_PACKET_REQUIRED")
  raw=retained.read_bytes()
 if digest(raw)!=SOURCE_OPERATOR_SELECTION["packetSha256"]:raise RuntimeError("ORIGINAL_OPERATOR_SOURCE_PACKET_CHANGED")
 value=json.loads(raw)
 expected={k:v for k,v in SOURCE_OPERATOR_SELECTION.items() if k not in ("packetSha256","files")}
 if {k:v for k,v in value.items() if k!="files"}!=expected or len(value.get("files",[]))!=len(SOURCE_OPERATOR_SELECTION["files"]):raise RuntimeError("ORIGINAL_OPERATOR_SOURCE_SELECTION_CHANGED")
 paths=set()
 for item,selected in zip(value["files"],SOURCE_OPERATOR_SELECTION["files"]):
  if {k:v for k,v in item.items() if k!="content"}!=selected or item["path"] in paths:raise RuntimeError("ORIGINAL_OPERATOR_SOURCE_MEMBER_CHANGED")
  paths.add(item["path"])
  body=item["content"].encode("utf-8")
  if item["encoding"]!="utf-8" or not source_body_matches(body,item):raise RuntimeError("ORIGINAL_OPERATOR_SOURCE_BODY_CHANGED")
  target=source_parent(source,item["path"])
  if not verify_source_file(target,item):exact(target,body)
 exact(retained,raw)
 exact(source/"SOURCE-OPERATOR.json",encoded(SOURCE_OPERATOR_SELECTION))
 say({"phase":"ORIGINAL_OPERATOR_SOURCE_READY","files":len(value["files"]),"packetSha256":SOURCE_OPERATOR_SELECTION["packetSha256"]})

def main(journey,stream_source=False,assets=None,repairs=None,operator_sources=None):
 CONTROL.mkdir(mode=0o700,exist_ok=True);owned(CONTROL)
 fd=os.open(CONTROL/"operation.lock",os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  expected={"schema":"stellar-forge.openaq-buyer-native-bootstrap.v1","operation":"openaq-native-921ba0-20261012",
   "repository":REPOSITORY,"commit":COMMIT,"journeySha256":digest(journey)}
  initial=CONTROL/"request.json"
  predecessor="43bc5e869bbc5f5e3cfe9506512b0f8b36915cecac974012dad67eabed6013ba"
  if initial.exists():
   prior=json.loads(initial.read_text())
   if {k:v for k,v in prior.items() if k!="journeySha256"}!={k:v for k,v in expected.items() if k!="journeySha256"} or prior["journeySha256"] not in (predecessor,"96ba6cf6fff8daa7afea3b9a4188840280114fec25e3f2836c43cbcbc97d8ab6",expected["journeySha256"]):raise RuntimeError("ORIGINAL_OPERATION_SELECTION_CHANGED")
   if prior["journeySha256"]!=expected["journeySha256"]:
    exact(CONTROL/("driver-"+expected["journeySha256"]+".json"),encoded({"previous":prior["journeySha256"],"current":expected["journeySha256"],"reason":"Correct the original true-admission Dataset handler and explicitly continue the reviewed unsigned page through complete original checkout/wire history; retain all source, Buyer and native request identities."}))
  else:exact(initial,encoded(expected))
  # Mutable original journals survive invocation-specific /dev mounts.
  # Git and dependencies are exact reproducible source only.
  old_pointer=CONTROL/"bulk.json"
  if old_pointer.exists():
   old=json.loads(old_pointer.read_text())
   if not Path(old["directory"]).exists():
    exact(CONTROL/"attempt1-bulk-unavailable.json",encoded({"directory":old["directory"],"observation":"ABSENT_ON_NEXT_INVOCATION","lastNativeState":"Three original source/publication/handoff phases completed; broker listen EPERM before Buyer initialization.","buyerCreated":False,"paymentExecuted":False}))
  bulk=Path("/dev/921ba0-openaq-runtime-20261012")
  bulk.mkdir(mode=0o700,exist_ok=True);owned(bulk)
  exact(bulk/"source-owner.json",encoded({"operation":expected["operation"],"repository":REPOSITORY,"commit":COMMIT}))
  source=bulk/"source";native=CONTROL/"native";deps=bulk/"dependencies"
  for path in (native,deps):path.mkdir(mode=0o700,exist_ok=True);owned(path)
  driver=native/"native-journey.mjs"
  if (native/"NATIVE_RESULT.json").exists() and json.loads((native/"NATIVE_RESULT.json").read_text()).get("driverSha256")!=expected["journeySha256"]:raise RuntimeError("ORIGINAL_COMPLETED_JOURNEY_SOURCE_CHANGED")
  if driver.exists() and digest(driver.read_bytes())!=expected["journeySha256"]:
   old=driver.read_bytes()
   if digest(old) not in (predecessor,"0e3e0b98a86ccef0f891c9aba31d1eff95c615d9da8515094d1c1ba57e2b5544","96ba6cf6fff8daa7afea3b9a4188840280114fec25e3f2836c43cbcbc97d8ab6"):raise RuntimeError("ORIGINAL_JOURNEY_SOURCE_CHANGED")
   exact(native/("native-journey."+digest(old)+".mjs"),old)
   pending=native/("native-journey."+expected["journeySha256"]+".mjs")
   exact(pending,journey)
   os.replace(pending,driver)
  else:exact(driver,journey)
  completed=(native/"NATIVE_RESULT.json").exists()
  if completed:
   saved_result=json.loads((native/"NATIVE_RESULT.json").read_text())
   if saved_result.get("driverSha256")!=expected["journeySha256"]:raise RuntimeError("ORIGINAL_COMPLETED_JOURNEY_SOURCE_CHANGED")
   say({"state":"COMPLETE_REOPENED","result":saved_result,"directory":str(native)})
   target=CONTROL/"OpenAQ_Original_Buyer_Workspace.zip"
   if target.exists() and (CONTROL/"package.json").exists():
    saved=json.loads((CONTROL/"package.json").read_text())
    if target.stat().st_size!=saved["bytes"] or digest(target.read_bytes())!=saved["sha256"]:raise RuntimeError("ORIGINAL_PACKAGE_CHANGED")
    say(saved);return
  # Source is reproducible; restore it for an interrupted package-only reopen
  # even after /dev changes. A completed native result is never rerun.
  say({"phase":"ORIGINAL_SOURCE_ACQUISITION","bulk":str(bulk),"commit":COMMIT})
  if stream_source:
   source.mkdir(mode=0o700,exist_ok=True);owned(source);receive_source(source);receive_assets(source,assets)
  else:
   if not source.exists():
    source.mkdir(mode=0o700);run(["git","init","--quiet",str(source)],str(bulk),guard_fd=fd)
   owned(source)
   # Normal configured Git fetch; no authenticated REST or account replacement.
   head=subprocess.run(["git","rev-parse","HEAD"],cwd=source,capture_output=True,text=True,pass_fds=(fd,))
   if head.returncode:
    run(["git","-c","http.lowSpeedLimit=1","-c","http.lowSpeedTime=60","fetch","--no-tags","--depth=1",REPOSITORY,COMMIT],str(source),grace=30,timeout=180,guard_fd=fd)
    run(["git","checkout","--quiet","--detach","FETCH_HEAD"],str(source),guard_fd=fd)
   selected_head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=source,text=True,pass_fds=(fd,)).strip()
   if selected_head!=COMMIT:raise RuntimeError("ORIGINAL_SOURCE_COMMIT_CHANGED")
   dirty=subprocess.check_output(["git","status","--porcelain","--untracked-files=no"],cwd=source,text=True,pass_fds=(fd,))
   if dirty:
    allowed={repair["after"]["path"]:repair["after"] for repair in [SIGNER_SOURCE_REPAIR]+UNPAID_SOURCE_REPAIR["files"]}
    for line in dirty.splitlines():
     path=line[3:]
     if not line.startswith(" M ") or path not in allowed or not source_body_matches(source_parent(source,path).read_bytes(),allowed[path]):raise RuntimeError("ORIGINAL_TRACKED_SOURCE_CHANGED")
  receive_operator_sources(source,operator_sources)
  apply_signer_source_repair(source)
  receive_unpaid_repairs(source,repairs)
  if not completed:
   # The exact original SF88 profile supplies all original buyer SDK versions.
   original=source/"stellar/scf-starforge-20261009/sf88-operator-buyer-cli"
   for name in ("package.json","package-lock.json"):exact(deps/name,(original/name).read_bytes())
   dependency_ready=deps/"dependency-ready.json"
   dependency_selection=encoded({"schema":"stellar-forge.openaq-original-dependencies.v1","commit":COMMIT,
    "packageSha256":digest((deps/"package.json").read_bytes()),
    "lockSha256":digest((deps/"package-lock.json").read_bytes())})
   if dependency_ready.exists():
    exact(dependency_ready,dependency_selection)
    if not (deps/"node_modules/@x402/stellar/package.json").is_file():raise RuntimeError("ORIGINAL_DEPENDENCY_READY_TREE_CHANGED")
   else:
    npm=shutil.which("npm")
    if not npm:raise RuntimeError("ORIGINAL_NPM_REQUIRED")
    env=dict(os.environ);env["npm_config_cache"]=str(CONTROL/"npm-cache");env["npm_config_prefer_offline"]="true"
    env["NODE_OPTIONS"]=env.get("NODE_OPTIONS","")+" --max-old-space-size=192"
    run([npm,"ci","--ignore-scripts","--no-audit","--no-fund"],str(deps),env,guard_fd=fd)
    exact(dependency_ready,dependency_selection)
   link=source/"node_modules"
   if link.is_symlink():
    if link.resolve()!=(deps/"node_modules").resolve():raise RuntimeError("ORIGINAL_DEPENDENCY_SELECTION_CHANGED")
   elif link.exists():raise RuntimeError("ORIGINAL_DEPENDENCY_DESTINATION_EXISTS")
   else:link.symlink_to(deps/"node_modules",target_is_directory=True)
   tls=native/"tls";tls.mkdir(mode=0o700,exist_ok=True);owned(tls)
   if not (tls/"cert.pem").exists():
    if (tls/"key.pem").exists():raise RuntimeError("ORIGINAL_TLS_PREPARATION_INCOMPLETE")
    run(["openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","2","-subj","/CN=openaq-native.example",
     "-addext","subjectAltName=DNS:openaq-native.example","-keyout",str(tls/"key.pem"),"-out",str(tls/"cert.pem")],str(native),guard_fd=fd)
   for path in (tls/"key.pem",tls/"cert.pem"):path.chmod(0o600)
   node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
   if not node or not Path(node).exists():raise RuntimeError("ORIGINAL_NODE_REQUIRED")
   environment=dict(os.environ);environment["NODE_EXTRA_CA_CERTS"]=str(tls/"cert.pem")
   environment["NODE_OPTIONS"]=environment.get("NODE_OPTIONS","")+" --max-old-space-size=384"
   say({"phase":"ORIGINAL_NATIVE_PROGRAMME","directory":str(native),"node":node,"python":sys.executable})
   run([node,str(native/"native-journey.mjs"),str(native),str(source),str(Path(sys.executable).resolve())],str(native),environment,terminal=True,guard_fd=fd)
  result=json.loads((native/"NATIVE_RESULT.json").read_text())
  if result["state"]!="COMPLETE" or not result["allOwnersRetired"]:raise RuntimeError("ORIGINAL_COMPLETE_RESULT_REQUIRED")
  # Whole customer receiving package; original operator/signing custody stays local.
  target=CONTROL/"OpenAQ_Original_Buyer_Workspace.zip"
  if target.exists() and (CONTROL/"package.json").exists():
   saved=json.loads((CONTROL/"package.json").read_text())
   if target.stat().st_size!=saved["bytes"] or digest(target.read_bytes())!=saved["sha256"]:raise RuntimeError("ORIGINAL_PACKAGE_CHANGED")
   say(saved);return
  temporary=CONTROL/"OpenAQ_Original_Buyer_Workspace.zip.pending"
  with zipfile.ZipFile(temporary,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
   for folder in ("delivery","receiving"):
    for base,dirs,files in os.walk(native/folder):
     for name in sorted(files):
      file=Path(base,name)
      if file.is_symlink():raise RuntimeError("ORIGINAL_CUSTOMER_SYMLINK")
      archive.write(file,file.relative_to(native).as_posix())
   for name in ("NATIVE_RESULT.json","native-journey.mjs","original-accounting.json","unpaid-continuation-request.json"):
    if (native/name).exists():archive.write(native/name,name)
   for repair in [SIGNER_SOURCE_REPAIR]+UNPAID_SOURCE_REPAIR["files"]:
    archive.write(source/repair["after"]["path"],"source-corrections/"+repair["after"]["path"])
   for item in SOURCE_OPERATOR_SELECTION["files"]:
    archive.write(source/item["path"],"source-original-operator/"+item["path"])
   archive.write(source/"SOURCE-OPERATOR.json","SOURCE-OPERATOR.json")
   archive.write(source/"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/OPERATING.md","OPERATING.md")
   archive.writestr("SOURCE.json",encoded({"repository":REPOSITORY,"commit":COMMIT,"operator":expected["operation"],
    "product":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study","journeySha256":expected["journeySha256"],"sourceRepair":SIGNER_SOURCE_REPAIR,"unpaidSourceRepair":UNPAID_SOURCE_REPAIR,"originalOperatorSource":SOURCE_OPERATOR_SELECTION}))
  temporary.chmod(0o600)
  data=temporary.read_bytes()
  if target.exists():
   if digest(target.read_bytes())!=digest(data):raise RuntimeError("ORIGINAL_PACKAGE_ALREADY_EXISTS")
   temporary.unlink()
  else:os.rename(temporary,target)
  package={"schema":"stellar-forge.openaq-buyer-native-package.v1","file":str(target),"bytes":len(data),"sha256":digest(data),
   "result":str(native/"NATIVE_RESULT.json"),"nativeDirectory":str(native),"sourceDirectory":str(source),
   "state":"COMPLETE","originalMode":"NO_PAYMENT_REQUIRED"}
  exact(CONTROL/"package.json",encoded(package));say(package)
 finally:os.close(fd)
if __name__=="__main__":
 source=Path(__file__).with_name("native-journey.mjs").read_bytes()
 if digest(source)!="f3940401de94c25b38f5f98e95a1066b6390597a384535f0d6e7ab0ba76cdb07":raise RuntimeError("ORIGINAL_JOURNEY_SOURCE_CHANGED")
 if sys.argv[1:] not in ([],["--source-stdin"]):raise RuntimeError("ORIGINAL_RECEIVER_ARGUMENT_INVALID")
 main(source,stream_source=bool(sys.argv[1:]),assets=Path(__file__).with_name("source-assets.json").read_bytes() if sys.argv[1:] else None,
  repairs=Path(__file__).with_name("source-unpaid-repairs.json").read_bytes(),
  operator_sources=Path(__file__).with_name("source-operator.json").read_bytes())
