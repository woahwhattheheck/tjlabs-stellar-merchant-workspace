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
def run(args,cwd,environment=None,grace=180,terminal=False):
 global active
 if requested: raise RuntimeError("ORIGINAL_RECEIVING_INTERRUPTED")
 master=slave=None
 ownership={"start_new_session":not terminal}
 try:
  if terminal:
   master,slave=os.openpty()
   def control_terminal():
    os.setsid()
    fcntl.ioctl(slave,termios.TIOCSCTTY,0)
   ownership={"preexec_fn":control_terminal,"pass_fds":(slave,)}
  child=subprocess.Popen(args,cwd=cwd,env=environment,**ownership,
   stdin=slave if terminal else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 except BaseException:
  for descriptor in (master,slave):
   if descriptor is not None:os.close(descriptor)
  raise
 active=child
 selector=None;primary=None;tail=bytearray();eof=False;started_stop=None;killed=False
 try:
  if slave is not None:os.close(slave);slave=None
  if requested:group_signal(child,requested);started_stop=time.monotonic()
  selector=selectors.DefaultSelector()
  os.set_blocking(child.stdout.fileno(),False)
  selector.register(child.stdout,selectors.EVENT_READ)
  if master is not None:
   os.set_blocking(master,False);selector.register(master,selectors.EVENT_READ)
  while True:
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
def main(journey):
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
   if {k:v for k,v in prior.items() if k!="journeySha256"}!={k:v for k,v in expected.items() if k!="journeySha256"} or prior["journeySha256"] not in (predecessor,expected["journeySha256"]):raise RuntimeError("ORIGINAL_OPERATION_SELECTION_CHANGED")
   if prior["journeySha256"]!=expected["journeySha256"]:
    exact(CONTROL/("driver-"+expected["journeySha256"]+".json"),encoded({"previous":prior["journeySha256"],"current":expected["journeySha256"],"reason":"Explicitly select the original SF81 controlling-terminal channel in the allocated host PTY, after the browser socket is unavailable; retain all source, Buyer and native request identities."}))
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
  if driver.exists() and digest(driver.read_bytes())!=expected["journeySha256"]:
   old=driver.read_bytes()
   if digest(old) not in (predecessor,"0e3e0b98a86ccef0f891c9aba31d1eff95c615d9da8515094d1c1ba57e2b5544"):raise RuntimeError("ORIGINAL_JOURNEY_SOURCE_CHANGED")
   exact(native/("native-journey."+digest(old)+".mjs"),old)
   pending=native/("native-journey."+expected["journeySha256"]+".mjs")
   exact(pending,journey)
   os.replace(pending,driver)
  else:exact(driver,journey)
  if (native/"NATIVE_RESULT.json").exists():
   say({"state":"COMPLETE_REOPENED","result":json.loads((native/"NATIVE_RESULT.json").read_text()),"directory":str(native)})
  else:
   say({"phase":"ORIGINAL_SOURCE_ACQUISITION","bulk":str(bulk),"commit":COMMIT})
   if not source.exists():
    source.mkdir(mode=0o700);run(["git","init","--quiet",str(source)],str(bulk))
   owned(source)
   # Normal configured Git fetch; no authenticated REST or account replacement.
   head=subprocess.run(["git","rev-parse","HEAD"],cwd=source,capture_output=True,text=True)
   if head.returncode:
    run(["git","fetch","--no-tags","--depth=1",REPOSITORY,COMMIT],str(source))
    run(["git","checkout","--quiet","--detach","FETCH_HEAD"],str(source))
   selected_head=subprocess.check_output(["git","rev-parse","HEAD"],cwd=source,text=True).strip()
   if selected_head!=COMMIT:raise RuntimeError("ORIGINAL_SOURCE_COMMIT_CHANGED")
   dirty=subprocess.check_output(["git","status","--porcelain","--untracked-files=no"],cwd=source,text=True)
   if dirty:raise RuntimeError("ORIGINAL_TRACKED_SOURCE_CHANGED")
   # The exact original SF88 profile supplies all original buyer SDK versions.
   original=source/"stellar/scf-starforge-20261009/sf88-operator-buyer-cli"
   for name in ("package.json","package-lock.json"):exact(deps/name,(original/name).read_bytes())
   if not (deps/"node_modules/@x402/stellar/package.json").exists():
    npm=shutil.which("npm")
    if not npm:raise RuntimeError("ORIGINAL_NPM_REQUIRED")
    env=dict(os.environ);env["npm_config_cache"]=str(bulk/"npm-cache")
    run([npm,"ci","--ignore-scripts","--no-audit","--no-fund"],str(deps),env)
   link=source/"node_modules"
   if link.is_symlink():
    if link.resolve()!=(deps/"node_modules").resolve():raise RuntimeError("ORIGINAL_DEPENDENCY_SELECTION_CHANGED")
   elif link.exists():raise RuntimeError("ORIGINAL_DEPENDENCY_DESTINATION_EXISTS")
   else:link.symlink_to(deps/"node_modules",target_is_directory=True)
   tls=native/"tls";tls.mkdir(mode=0o700,exist_ok=True);owned(tls)
   if not (tls/"cert.pem").exists():
    if (tls/"key.pem").exists():raise RuntimeError("ORIGINAL_TLS_PREPARATION_INCOMPLETE")
    run(["openssl","req","-x509","-newkey","rsa:2048","-nodes","-days","2","-subj","/CN=openaq-native.example",
     "-addext","subjectAltName=DNS:openaq-native.example","-keyout",str(tls/"key.pem"),"-out",str(tls/"cert.pem")],str(native))
   for path in (tls/"key.pem",tls/"cert.pem"):path.chmod(0o600)
   node=os.environ.get("CODEX_PRIMARY_RUNTIME_NODE") or shutil.which("node")
   if not node or not Path(node).exists():raise RuntimeError("ORIGINAL_NODE_REQUIRED")
   environment=dict(os.environ);environment["NODE_EXTRA_CA_CERTS"]=str(tls/"cert.pem")
   environment["NODE_OPTIONS"]=environment.get("NODE_OPTIONS","")+" --max-old-space-size=384"
   say({"phase":"ORIGINAL_NATIVE_PROGRAMME","directory":str(native),"node":node,"python":sys.executable})
   run([node,str(native/"native-journey.mjs"),str(native),str(source),str(Path(sys.executable).resolve())],str(native),environment,terminal=True)
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
   for name in ("NATIVE_RESULT.json","native-journey.mjs","original-accounting.json"):
    archive.write(native/name,name)
   archive.write(source/"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/OPERATING.md","OPERATING.md")
   archive.writestr("SOURCE.json",encoded({"repository":REPOSITORY,"commit":COMMIT,"operator":expected["operation"],
    "product":"stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study","journeySha256":expected["journeySha256"]}))
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
 if digest(source)!="96ba6cf6fff8daa7afea3b9a4188840280114fec25e3f2836c43cbcbc97d8ab6":raise RuntimeError("ORIGINAL_JOURNEY_SOURCE_CHANGED")
 main(source)
