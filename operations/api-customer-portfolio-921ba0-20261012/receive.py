from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from types import SimpleNamespace
from datetime import datetime,timezone
import os,sys,json,hashlib,urllib.request,tempfile,subprocess,threading,secrets,stat,signal,traceback,shutil
os.umask(0o077)
meta=json.loads((Path(__file__).resolve().parent/'source-inputs.json').read_text())
root_parent=Path(os.environ.get('API_PORTFOLIO_WORK_ROOT','/dev'))
assert root_parent.is_dir() and os.access(root_parent,os.W_OK),'Select an existing writable API_PORTFOLIO_WORK_ROOT'
assert shutil.disk_usage(root_parent).free>=32*1024*1024,'Select a receiving volume with at least 32 MiB free'
root=Path(tempfile.mkdtemp(prefix='921ba0-api-portfolio-',dir=root_parent))
print(json.dumps({'stage':'RECEIVING_STARTED','operation':meta['operation'],'directory':str(root),'sourceCommit':meta['sourceCommit']}),flush=True)
source=root/'source';source.mkdir()
def digest(data):return hashlib.sha256(data).hexdigest()
def git_blob(data):return hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()
url='https://raw.githubusercontent.com/'+meta['repository']+'/72e196999c60927a8e211d0b31388c04ac803334/operations/api-merchant-agent-receiving-921ba0-20261012/source-inputs.json'
raw=urllib.request.urlopen(url,timeout=30).read()
assert len(raw)==5582383 and git_blob(raw)=='0c1df5bf8c20b8b534060d67399d9b0a9b751bc7'
bundle=json.loads(raw);assert len(bundle['files'])==671
for row in bundle['files']:
 parts=Path(row['path']);assert not parts.is_absolute() and '..' not in parts.parts
 data=row['content'].encode('utf-8');assert git_blob(data)==row['gitBlob'],row['path']
 target=source/parts;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 target.write_bytes(data);target.chmod(int(str(row.get('mode','100644')),8)&0o777)
def download(row):
 data=urllib.request.urlopen('https://raw.githubusercontent.com/'+meta['repository']+'/'+meta['sourceCommit']+'/'+row['path'],timeout=30).read()
 assert len(data)==row['bytes'] and digest(data)==row['sha256'],row['path']
 return row,data
with ThreadPoolExecutor(max_workers=4) as pool:
 for row,data in pool.map(download,meta['overlay']):
  target=source/row['path'];target.parent.mkdir(mode=0o700,parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o600)
node_modules=Path(os.environ.get('API_PORTFOLIO_NODE_MODULES','/workspace/scratch/9345d3fc660b/native-runtime/node_modules')).resolve()
assert node_modules.is_dir(),'Set API_PORTFOLIO_NODE_MODULES to the existing original runtime dependency directory'
node=shutil.which(os.environ.get('API_PORTFOLIO_NODE','node'))
assert node,'Select the existing Node executable with API_PORTFOLIO_NODE'
(source/'node_modules').symlink_to(node_modules,target_is_directory=True)
environment=dict(os.environ);environment.update(NODE_PATH=os.environ.get('API_PORTFOLIO_NODE_PATH',os.environ.get('NODE_PATH','/workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules')),
 STARFORGE_PYTHON=sys.executable,
 NODE_OPTIONS='--preserve-symlinks --preserve-symlinks-main',PYTHONDONTWRITEBYTECODE='1',TMPDIR=str(root))
for row in meta['overlay']:
 if row['path'].endswith('.mjs'):
  checked=subprocess.run([node,'--check',str(source/row['path'])],env=environment,text=True,capture_output=True)
  assert checked.returncode==0,checked.stderr
journey=root/'portfolio-journey.mjs'
journey_bytes=(Path(__file__).resolve().parent/meta['journey']['path']).read_bytes()
assert len(journey_bytes)==meta['journey']['bytes'] and digest(journey_bytes)==meta['journey']['sha256']
journey.write_bytes(journey_bytes)
checked=subprocess.run([node,'--check',str(journey)],env=environment,text=True,capture_output=True)
assert checked.returncode==0,checked.stderr
print(json.dumps({'stage':'SOURCE_READY','root':str(root),'files':671,'overlay':len(meta['overlay']),
 'sourceCommit':meta['sourceCommit'],'node':subprocess.check_output([node,'--version'],text=True).strip()}),flush=True)
sys.dont_write_bytecode=True
sys.path.insert(0,str(source/'stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access'))
import gateway,pass_store,receiver
state=root/'merchant';state.mkdir(mode=0o700);receiver.init_state(state)
token=secrets.token_urlsafe(40);os.environ['SF101_CLAIM_TOKEN']=token;environment['SF101_CLAIM_TOKEN']=token
orders=[]
for index,(units,label) in enumerate([(4,'Research pass'),(12,'Operations pass'),(20,'Replacement allowance')],1):
 reference='portfolio-921ba0-'+str(index)
 plan={'schema':pass_store.PLAN_SCHEMA,'title':label,'allowanceUnits':units,
  'routes':[{'id':'work','method':'GET','path':'/work','units':2}]}
 plan_file=root/('plan-'+str(index)+'.json');data=json.dumps(plan,separators=(',',':')).encode();plan_file.write_bytes(data)
 args=SimpleNamespace(ref=reference,route='checkout',method='GET',network='stellar:testnet',amount='100',
  asset_digest=digest(b'XLM'),recipient_digest=digest(b'LOCAL_RECEIVING_RECIPIENT'),claim_env='SF101_CLAIM_TOKEN',file=str(plan_file))
 receiver.enroll(args,state);pass_store.attach_pass(state,reference)
 if index<3:
  event={'schema':receiver.SCHEMA,'eventId':digest(('LOCAL_RECEIVING_'+reference).encode()),'occurredAt':datetime.now(timezone.utc).isoformat(),
   'routeId':'checkout','method':'GET','network':'stellar:testnet','amountAtomic':'100','assetDigest':args.asset_digest,
   'recipientDigest':args.recipient_digest,'orderReference':reference,'settlement':'ORIGINAL_NATIVE_SUCCESS'}
  receiver.validate_event(event);status,accepted=receiver.accept_event(state,event,json.dumps(event,separators=(',',':')).encode())
  assert status==200 and accepted['status']=='ENTITLED'
 orders.append({'reference':reference,'label':label,'manifestSha256':digest(data),'manifestBytes':len(data)})
calls=[];call_lock=threading.Lock()
class Upstream(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  with call_lock:calls.append({'method':'GET','path':self.path});number=len(calls)
  body=json.dumps({'operation':number,'path':self.path,'result':'native portfolio response'},separators=(',',':')).encode()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
upstream=ThreadingHTTPServer(('127.0.0.1',0),Upstream)
thread=threading.Thread(target=upstream.serve_forever,daemon=True);thread.start()
config_file=root/'gateway.json';config_file.write_text(json.dumps({'schema':gateway.CONFIG_SCHEMA,'state':str(state),'actor':'portfolio-native-921ba0',
 'routes':[{'id':'work','method':'GET','path':'/work','upstream':'http://127.0.0.1:'+str(upstream.server_port),'query':['q']}] }))
session=None;result=None;child=None
previous_handlers={}
def interrupted(signum,frame):
 raise KeyboardInterrupt('Receiving interrupted by signal '+str(signum))
def retire_child():
 if child is None or child.poll() is not None:return
 try:
  if os.name=='posix':os.killpg(child.pid,signal.SIGTERM)
  else:child.terminate()
 except ProcessLookupError:pass
 try:child.communicate(timeout=20)
 except subprocess.TimeoutExpired:
  try:
   if os.name=='posix':os.killpg(child.pid,signal.SIGKILL)
   else:child.kill()
  except ProcessLookupError:pass
  child.communicate()
for signum in (signal.SIGTERM,signal.SIGINT):
 previous_handlers[signum]=signal.signal(signum,interrupted)
try:
 session=gateway.start(gateway.load_config(config_file),api_port=0,console_port=0)
 replacement=orders[2]
 handoff={'schema':'stellar-forge.sf101.purchase-handoff.v1','orderReference':replacement['reference'],'routeId':'checkout','method':'GET',
  'purchaseUrl':'https://merchant.example/checkout?sf98_order='+replacement['reference'],
  'deliveryUrl':'https://merchant.example/deliver/'+replacement['reference'],
  'payment':{'scheme':'exact','network':'stellar:testnet','amount':'100','asset':'XLM','payTo':'LOCAL_RECEIVING_RECIPIENT','maxTimeoutSeconds':60},
  'file':{'sha256':replacement['manifestSha256'],'bytes':replacement['manifestBytes']}}
 context={**meta,'source':str(source),'root':str(root),'gateway':session['apiUrl'],'orders':orders,'handoff':handoff}
 context_file=root/'journey-input.json';context_file.write_text(json.dumps(context))
 child=subprocess.Popen([node,str(journey),str(context_file)],cwd=source,env=environment,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=(os.name=='posix'))
 try:out,err=child.communicate(timeout=180)
 except subprocess.TimeoutExpired:
  if os.name=='posix':os.killpg(child.pid,signal.SIGTERM)
  else:child.terminate()
  try:out,err=child.communicate(timeout=20)
  except subprocess.TimeoutExpired:
   if os.name=='posix':os.killpg(child.pid,signal.SIGKILL)
   else:child.kill()
   out,err=child.communicate()
  raise RuntimeError('Original native journey timed out: '+err[-2000:])
 print(out,flush=True)
 if err:print(json.dumps({'nativeStderr':err[-5000:]}),flush=True)
 result=json.loads((root/'portfolio-journey-result.json').read_text()) if (root/'portfolio-journey-result.json').exists() else {'status':'NO_NATIVE_RESULT'}
 result['nativeExitCode']=child.returncode;result['upstreamExecutions']=len(calls)
 result['merchantAllowances']=[pass_store.show_pass(state,row['reference'])['usage'] for row in orders]
 if result.get('status')=='PASS':assert child.returncode==0 and len(calls)==2
 print(json.dumps({'stage':'NATIVE_COMPLETED','result':result}),flush=True)
 # Preserve the complete native result and exported customer history.
 retained=Path(os.environ.get('API_PORTFOLIO_RESULT_DIRECTORY',str(Path(__file__).resolve().parent/'result')))
 try:
  retained.mkdir(mode=0o700,parents=True,exist_ok=True)
  history=root/'customer-history.json'
  if history.exists():
   history_bytes=history.read_bytes()
   assert len(history_bytes)==result['history']['bytes'] and digest(history_bytes)==result['history']['sha256']
   history_target=retained/'customer-history.json'
   if history_target.exists():assert history_target.read_bytes()==history_bytes
   else:
    with history_target.open('xb') as stream:stream.write(history_bytes);stream.flush();os.fsync(stream.fileno())
  target=retained/'portfolio-journey-result.json'
  content=json.dumps(result,indent=2).encode()
  with target.open('xb') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
  print(json.dumps({'retainedResult':str(target),'bytes':len(content),'sha256':digest(content)}),flush=True)
 except FileExistsError:
  previous=target.read_bytes();assert json.loads(previous)==result,'An original native result is already retained'
 except OSError as error:print(json.dumps({'resultPreservationError':str(error),'completeResultPrinted':True}),flush=True)
 if child.returncode:sys.exit(child.returncode)
finally:
 try:retire_child()
 finally:
  try:
   if session:gateway.stop(session)
  finally:
   upstream.shutdown();upstream.server_close();thread.join()
   for signum,handler in previous_handlers.items():signal.signal(signum,handler)
