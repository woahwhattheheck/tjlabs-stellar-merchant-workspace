#!/usr/bin/env python3
# Continue the original selected prepaid build/install/open from its genuine pinned Git checkout.
import os,pathlib,json,subprocess,sys,hashlib,signal,stat,urllib.request,argparse,ctypes,selectors,select,time
parser=argparse.ArgumentParser(description='Continue the original selected prepaid product from its genuine pinned Git source')
parser.add_argument('--repository',default='/workspace/scratch/921ba0f574ac/prepaid-selected-source')
parser.add_argument('--dependencies')
parser.add_argument('--npm-cache')
parser.add_argument('--bulk-directory')
selected=parser.parse_args()
for value in (selected.repository,selected.dependencies,selected.npm_cache,selected.bulk_directory):
 if value is not None and (not pathlib.Path(value).is_absolute() or os.path.normpath(value)!=value):raise RuntimeError('PREPAID_ABSOLUTE_SELECTED_PATH_REQUIRED')
REPO=pathlib.Path(selected.repository)
INPUTS=pathlib.Path('/dev/shm/921ba0-prepaid-installed-inputs-20261012')
OP=pathlib.Path('/dev/shm/921ba0-prepaid-installed-native-20261012')
SOURCE='6e4a2bebf22cf809587406087efbce9c11d4e449'
REMOTE='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git'
CARRIER='74f40464c2aa0c012c50cfef2fb287fd15d469bf'
# This invocation owns every child it starts. Linux subreaper adoption keeps
# orphaned descendants within the same retained lifetime as their original leader.
libc=ctypes.CDLL(None,use_errno=True)
libc.prctl.argtypes=[ctypes.c_int,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong,ctypes.c_ulong]
libc.prctl.restype=ctypes.c_int
if libc.prctl(36,1,0,0,0)!=0:raise OSError(ctypes.get_errno(),'PREPAID_CHILD_SUBREAPER_REQUIRED')
signal.signal(signal.SIGCHLD,signal.SIG_DFL)
active=None
requested=None
def private(path):
 path.mkdir(mode=0o700,parents=True,exist_ok=True)
 info=path.lstat()
 if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid() or path.resolve()!=path:raise RuntimeError('PREPAID_PRIVATE_SOURCE_REQUIRED')
def relay(signum,frame):
 global requested
 # Record even a signal delivered while Popen is returning its original handle.
 # Deliver from the owner loop, never during a waitpid/reap boundary.
 if requested is None:requested=signum
signal.signal(signal.SIGINT,relay)
signal.signal(signal.SIGTERM,relay)
def owned_group(owner):
 if owner.poll() is None:return True
 # Popen has collected its exact leader. Only now reap this subreaper's adopted
 # descendants in that same namespace-local group; never steal Popen's result.
 while True:
  try:pid,status=os.waitpid(-owner.pid,os.WNOHANG)
  except ChildProcessError:return False
  except InterruptedError:continue
  if pid==0:return True
def send_group(owner,signum):
 # A live leader or an unreaped adopted child anchors the original group ID.
 # Namespace-local killpg avoids any comparison with the mounted host /proc.
 try:os.killpg(owner.pid,signum)
 except ProcessLookupError:pass
def retire(owner,grace):
 # This fallback does not depend on successful selector creation/registration.
 # It returns only after the original leader and adopted group have retired.
 cleanup_error=None
 sent=False
 killed=False
 deadline=None
 streams=[stream for stream in (owner.stdout,owner.stderr) if stream is not None]
 readable=list(streams)
 while True:
  try:group_owned=owned_group(owner)
  except BaseException as error:
   if cleanup_error is None:cleanup_error=error
   time.sleep(0.1)
   continue
  if group_owned:
   try:
    if not sent:
     send_group(owner,requested if requested is not None else signal.SIGTERM)
     sent=True
     deadline=time.monotonic()+grace
    elif not killed and time.monotonic()>=deadline:
     send_group(owner,signal.SIGKILL)
     killed=True
   except BaseException as error:
    if cleanup_error is None:cleanup_error=error
  if not group_owned and not readable:break
  # Keep draining original pipes without the failed epoll selector. An actual
  # pipe error is retained; it never permits release of a still-running child.
  try:
   ready=select.select(readable,[],[],0.1)[0] if readable else []
   if not readable:time.sleep(0.1)
  except BaseException as error:
   if cleanup_error is None:cleanup_error=error
   readable=[]
   time.sleep(0.1)
   continue
  for stream in ready:
   try:
    data=os.read(stream.fileno(),65536)
    if not data:readable.remove(stream)
   except (BlockingIOError,InterruptedError):pass
   except BaseException as error:
    if cleanup_error is None:cleanup_error=error
    readable.remove(stream)
 # owner.wait() reads Popen's already collected status; it cannot reap a peer.
 while True:
  try:owner.wait();break
  except BaseException as error:
   if cleanup_error is None:cleanup_error=error
   time.sleep(0.1)
 return cleanup_error
def run(args,*,capture=False,allowed=(0,),with_status=False,quiet_stderr=False):
 global active
 if requested is not None:raise RuntimeError('PREPAID_SOURCE_RECEIVE_INTERRUPTED')
 if active is not None:raise RuntimeError('PREPAID_NATIVE_OWNER_STILL_ACTIVE')
 selector=selectors.DefaultSelector()
 output=bytearray()
 owner=None
 retired=False
 primary=None
 # The original Node operator may need its complete 135-second gateway drain.
 grace=180 if pathlib.Path(str(args[0])).name in ('node','nodejs') else 10
 try:
  owner=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
   bufsize=0,start_new_session=True,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
  active=owner
  for stream,kind in ((owner.stdout,'out'),(owner.stderr,'err')):
   os.set_blocking(stream.fileno(),False)
   selector.register(stream,selectors.EVENT_READ,kind)
  while True:
   if requested is not None:raise RuntimeError('PREPAID_SOURCE_RECEIVE_INTERRUPTED')
   group_owned=owned_group(owner)
   if owner.returncode is not None and group_owned:raise RuntimeError('PREPAID_NATIVE_DESCENDANTS_OUTLIVED_LEADER')
   if not group_owned and not selector.get_map():break
   for key,events in selector.select(0.1):
    try:data=os.read(key.fd,65536)
    except (BlockingIOError,InterruptedError):continue
    if not data:
     selector.unregister(key.fileobj)
     continue
    if key.data=='out' and capture:
     if len(output)+len(data)>1048576:raise RuntimeError('PREPAID_NATIVE_CAPTURE_TOO_LARGE')
     output.extend(data)
    elif key.data!='err' or not quiet_stderr:
     destination=sys.stdout.buffer if key.data=='out' else sys.stderr.buffer
     destination.write(data);destination.flush()
  owner.wait()
  retired=True
 except BaseException as error:
  primary=error
  if owner is not None:
   cleanup_error=retire(owner,grace)
   retired=True
   if cleanup_error is not None:primary.cleanup_error=cleanup_error
 finally:
  # No acquired owner can be discarded by setup, monitoring or output failure.
  # The streams and selector close only after actual retirement.
  if owner is None or retired:
   for stream in (() if owner is None else (owner.stdout,owner.stderr)):
    try:stream.close()
    except BaseException as error:
     if primary is None:primary=error
   try:selector.close()
   except BaseException as error:
    if primary is None:primary=error
   if retired:active=None
 if primary is not None:raise primary
 if requested is not None:raise RuntimeError('PREPAID_SOURCE_RECEIVE_INTERRUPTED')
 result=owner.returncode
 if result not in allowed:raise RuntimeError('PREPAID_NATIVE_COMMAND_EXIT_'+str(result))
 return (result,bytes(output)) if with_status else bytes(output)
private(INPUTS)
if REPO.exists() and not (REPO/'.git').exists() and any(REPO.iterdir()):raise RuntimeError('PREPAID_SOURCE_DIRECTORY_IN_USE')
private(REPO)
git=['git','-c','protocol.version=2','-c','gc.auto=0','-c','pack.threads=1','-c','core.deltaBaseCacheLimit=8m','-c','pack.windowMemory=8m','-C',str(REPO)]
if not (REPO/'.git').exists():run(git+['init','--quiet'])
configured,remote_bytes=run(git+['config','--get','remote.origin.url'],capture=True,allowed=(0,1),with_status=True,quiet_stderr=True)
if configured==0:
 if remote_bytes.decode().strip()!=REMOTE:raise RuntimeError('PREPAID_ORIGINAL_GIT_REMOTE_CHANGED')
else:run(git+['remote','add','origin',REMOTE])
for key,value in [('remote.origin.promisor','true'),('remote.origin.partialclonefilter','blob:none')]:
 observed,config_bytes=run(git+['config','--get',key],capture=True,allowed=(0,1),with_status=True,quiet_stderr=True)
 if observed==0:
  if config_bytes.decode().strip()!=value:raise RuntimeError('PREPAID_ORIGINAL_GIT_FILTER_CHANGED')
 else:run(git+['config',key,value])
head,head_bytes=run(git+['rev-parse','--verify','HEAD'],capture=True,allowed=(0,128),with_status=True,quiet_stderr=True)
if head==0 and head_bytes.decode().strip()!=SOURCE:raise RuntimeError('PREPAID_ORIGINAL_GIT_HEAD_CHANGED')
if head!=0:
 run(git+['fetch','--no-tags','--depth=1','--filter=blob:none','--no-auto-maintenance','origin',SOURCE])
 run(git+['sparse-checkout','init','--cone'])
 run(git+['sparse-checkout','set','stellar/scf-starforge-20261009/distribution','stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node','stellar/scf-starforge-20261009/merchant-fleet-gateway'])
 run(git+['checkout','--detach',SOURCE])
if run(git+['rev-parse','--verify','HEAD'],capture=True).decode().strip()!=SOURCE:raise RuntimeError('PREPAID_ORIGINAL_GIT_SOURCE_CHANGED')
if run(git+['status','--porcelain','--untracked-files=no'],capture=True):raise RuntimeError('PREPAID_SOURCE_WORKTREE_CHANGED')
print(json.dumps({'source':'ACTUAL_GIT_CHECKOUT','commit':SOURCE,'repository':str(REPO),'sparseWorkingTree':True,'sourceAcquisition':'ORIGINAL_BATCHED_PROMISOR_FETCH'}),flush=True)
url='https://raw.githubusercontent.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/'+CARRIER+'/operations/prepaid-api-installed-921ba0-20261012/operate.mjs'
with urllib.request.urlopen(url,timeout=30) as response:driver=response.read(131073)
if len(driver)>131072 or hashlib.sha1(b'blob '+str(len(driver)).encode()+b'\0'+driver).hexdigest()!='4a3b092e065e8bb9ff5debe627e6e76b0f398bc0':raise RuntimeError('PREPAID_ORIGINAL_DRIVER_CHANGED')
storefile=REPO/'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs'
import base64
writer="import {readFile,lstat} from 'node:fs/promises';import {pathToFileURL} from 'node:url';const [module,file,b64]=process.argv.slice(1);const {writeBytes}=await import(pathToFileURL(module));const wanted=Buffer.from(b64,'base64');let old;try{const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink())throw new Error('ORIGINAL_PREPAID_INPUT_CHANGED');old=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;await writeBytes(file,wanted,{exclusive:true});old=await readFile(file);}if(!old.equals(wanted))throw new Error('ORIGINAL_PREPAID_INPUT_CHANGED');"
driverfile=INPUTS/'operate-bulk-workspace.mjs'
run(['node','--input-type=module','-e',writer,str(storefile),str(driverfile),base64.b64encode(driver).decode()])
checkout_path=pathlib.Path('/dev/shm/921ba0-api-native-20261011/checkout.json')
checkout=json.loads(checkout_path.read_bytes())
if checkout.get('schema')!='stellar-forge.sf101.checkout-service.v1' or not isinstance(checkout.get('payment'),dict) or checkout['payment'].get('network')!='stellar:testnet':raise RuntimeError('ORIGINAL_TESTNET_CHECKOUT_REQUIRED')
request={"schema":"stellar-forge.prepaid-api-starter.v1","title":"Installed prepaid API operation","serviceName":"Prepaid number analysis","publicOrigin":None,"gatewayBaseUrl":"http://127.0.0.1:43882","payment":None,"checkoutPath":"/purchase-access","checkoutRouteId":"prepaid-api","functionPath":"/analyze","allowanceUnits":8,"requestUnits":2,"workerPort":43881,"apiPort":43882,"timeoutSeconds":60,"actor":"original-prepaid-installed-921ba0","python":"python3","backupPassEnv":"SF101_BACKUP_PASSPHRASE"}
request['publicOrigin']=checkout['publicOrigin']
request['payment']=checkout['payment']
request_bytes=(json.dumps(request,ensure_ascii=False,indent=2)+'\n').encode()
request_file=INPUTS/'request.json'
run(['node','--input-type=module','-e',writer,str(storefile),str(request_file),base64.b64encode(request_bytes).decode()])
print(json.dumps({'request':str(request_file),'requestSha256':hashlib.sha256(request_bytes).hexdigest(),'originalTermsSource':str(checkout_path),'paymentDispatch':False}),flush=True)
args=['node',str(driverfile),'--repo',str(REPO),'--directory',str(OP),'--request',str(request_file),'--python','python3','--source-online']
if selected.dependencies:args.extend(['--dependencies',selected.dependencies])
if selected.npm_cache:args.extend(['--npm-cache',selected.npm_cache])
if selected.bulk_directory:args.extend(['--bulk-directory',selected.bulk_directory])
if OP.exists():args.append('--resume')
run(args)
