#!/usr/bin/env python3
# Continue the original selected prepaid build/install/open from its genuine pinned Git checkout.
import os,pathlib,json,subprocess,sys,hashlib,signal,stat,urllib.request
REPO=pathlib.Path('/workspace/scratch/921ba0f574ac/prepaid-selected-source')
INPUTS=pathlib.Path('/dev/shm/921ba0-prepaid-installed-inputs-20261012')
OP=pathlib.Path('/dev/shm/921ba0-prepaid-installed-native-20261012')
SOURCE='6e4a2bebf22cf809587406087efbce9c11d4e449'
REMOTE='https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git'
CARRIER='7e30b299bd8d29fc076b0dc709365365d06b09f9'
active=None
requested=None
def private(path):
 path.mkdir(mode=0o700,parents=True,exist_ok=True)
 info=path.lstat()
 if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid() or path.resolve()!=path:raise RuntimeError('PREPAID_PRIVATE_SOURCE_REQUIRED')
def relay(signum,frame):
 global requested
 requested=signum
 if active is not None and active.poll() is None:
  try:active.send_signal(signum)
  except ProcessLookupError:pass
signal.signal(signal.SIGINT,relay)
signal.signal(signal.SIGTERM,relay)
def run(args,*,capture=False):
 global active
 if requested is not None:raise RuntimeError('PREPAID_SOURCE_RECEIVE_INTERRUPTED')
 active=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE if capture else None,stderr=None,env={**os.environ,'GIT_TERMINAL_PROMPT':'0'})
 if requested is not None:
  try:active.send_signal(requested)
  except ProcessLookupError:pass
 if capture:out=active.communicate()[0]
 else:active.wait();out=b''
 result=active.returncode;active=None
 if result!=0:raise RuntimeError('PREPAID_NATIVE_COMMAND_EXIT_'+str(result))
 return out
private(INPUTS)
if REPO.exists() and not (REPO/'.git').exists() and any(REPO.iterdir()):raise RuntimeError('PREPAID_SOURCE_DIRECTORY_IN_USE')
private(REPO)
git=['git','-c','pack.threads=1','-c','core.deltaBaseCacheLimit=8m','-c','pack.windowMemory=8m','-C',str(REPO)]
if not (REPO/'.git').exists():run(git+['init','--quiet'])
configured=subprocess.run(git+['config','--get','remote.origin.url'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False)
if configured.returncode==0:
 if configured.stdout.decode().strip()!=REMOTE:raise RuntimeError('PREPAID_ORIGINAL_GIT_REMOTE_CHANGED')
else:run(git+['remote','add','origin',REMOTE])
head=subprocess.run(git+['rev-parse','--verify','HEAD'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False)
if head.returncode==0 and head.stdout.decode().strip()!=SOURCE:raise RuntimeError('PREPAID_ORIGINAL_GIT_HEAD_CHANGED')
if head.returncode!=0:
 run(git+['fetch','--no-tags','--depth=1','origin',SOURCE])
 run(git+['sparse-checkout','init','--cone'])
 run(git+['sparse-checkout','set','stellar/scf-starforge-20261009/distribution','stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node','stellar/scf-starforge-20261009/merchant-fleet-gateway'])
 run(git+['checkout','--detach',SOURCE])
if run(git+['rev-parse','--verify','HEAD'],capture=True).decode().strip()!=SOURCE:raise RuntimeError('PREPAID_ORIGINAL_GIT_SOURCE_CHANGED')
if run(git+['status','--porcelain','--untracked-files=no'],capture=True):raise RuntimeError('PREPAID_SOURCE_WORKTREE_CHANGED')
print(json.dumps({'source':'ACTUAL_GIT_CHECKOUT','commit':SOURCE,'repository':str(REPO),'sparseWorkingTree':True}),flush=True)
url='https://raw.githubusercontent.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/'+CARRIER+'/operations/prepaid-api-installed-921ba0-20261012/operate.mjs'
with urllib.request.urlopen(url,timeout=30) as response:driver=response.read(40001)
if len(driver)>40000 or hashlib.sha1(b'blob '+str(len(driver)).encode()+b'\0'+driver).hexdigest()!='e0d0310a227d13c1b0c556b9367384a97a8666fb':raise RuntimeError('PREPAID_ORIGINAL_DRIVER_CHANGED')
storefile=REPO/'stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/store.mjs'
import base64
writer="import {readFile,lstat} from 'node:fs/promises';import {pathToFileURL} from 'node:url';const [module,file,b64]=process.argv.slice(1);const {writeBytes}=await import(pathToFileURL(module));const wanted=Buffer.from(b64,'base64');let old;try{const st=await lstat(file);if(!st.isFile()||st.isSymbolicLink())throw new Error('ORIGINAL_PREPAID_INPUT_CHANGED');old=await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;await writeBytes(file,wanted,{exclusive:true});old=await readFile(file);}if(!old.equals(wanted))throw new Error('ORIGINAL_PREPAID_INPUT_CHANGED');"
driverfile=INPUTS/'operate.mjs'
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
args=['node',str(driverfile),'--repo',str(REPO),'--directory',str(OP),'--request',str(request_file),'--python','python3']
if OP.exists():args.append('--resume')
run(args)
