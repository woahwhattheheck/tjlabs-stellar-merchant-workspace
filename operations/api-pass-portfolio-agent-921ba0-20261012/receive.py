from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from types import SimpleNamespace
from datetime import datetime,timezone
import os,sys,json,hashlib,urllib.request,tempfile,subprocess,threading,secrets,stat,signal,traceback,shutil,time,zipfile
os.umask(0o077)
meta=json.loads((Path(__file__).resolve().parent/'source-inputs.json').read_text())
root_parent=Path(os.environ.get('API_PORTFOLIO_WORK_ROOT','/dev'))
assert root_parent.is_dir() and os.access(root_parent,os.W_OK),'Select an existing writable API_PORTFOLIO_WORK_ROOT'
assert shutil.disk_usage(root_parent).free>=32*1024*1024,'Select a receiving volume with at least 32 MiB free'
root=Path(tempfile.mkdtemp(prefix='921ba0-api-portfolio-agent-',dir=root_parent))
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
agent_carrier=(Path(__file__).resolve().parent/meta['agentSource']['path']).read_bytes()
assert len(agent_carrier)==meta['agentSource']['bytes'] and digest(agent_carrier)==meta['agentSource']['sha256']
agent_family=json.loads(agent_carrier)
assert agent_family['sourceCommit']==meta['agentCommit'] and len(agent_family['files'])==20
for row in agent_family['files']:
 parts=Path(row['path']);assert not parts.is_absolute() and '..' not in parts.parts
 data=row['content'].encode('utf-8')
 assert git_blob(data)==row['gitBlob'] and len(data)==row['bytes'] and digest(data)==row['sha256'],row['path']
 target=source/parts;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o600)
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
agent_journey=root/'agent-journey.mjs'
agent_bytes=(Path(__file__).resolve().parent/meta['agentJourney']['path']).read_bytes()
assert len(agent_bytes)==meta['agentJourney']['bytes'] and digest(agent_bytes)==meta['agentJourney']['sha256']
agent_journey.write_bytes(agent_bytes)
for target in [agent_journey,*[source/row['path'] for row in agent_family['files'] if row['path'].endswith('.mjs')]]:
 checked=subprocess.run([node,'--check',str(target)],env=environment,text=True,capture_output=True)
 assert checked.returncode==0,checked.stderr
operation_source=root/'receiving-operation';operation_source.mkdir(mode=0o700)
for name in ['receive.py','customer-journey.mjs','agent-journey.mjs','source-inputs.json','agent-source-inputs.json','OPERATING.md']:
 shutil.copyfile(Path(__file__).resolve().parent/name,operation_source/name);(operation_source/name).chmod(0o600)
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
session=None;result=None;child=None;native_exit=1
previous_handlers={};received_signals=[]
def interrupted(signum,frame):
 received_signals.append(signum)
def active_child_group():
 if child is None:return False
 if os.name!='posix':return child.poll() is None
 for entry in Path('/proc').iterdir():
  if not entry.name.isdigit():continue
  try:
   raw_stat=(entry/'stat').read_text()
   fields=raw_stat[raw_stat.rfind(')')+2:].split()
  except (FileNotFoundError,ProcessLookupError,PermissionError):continue
  if len(fields)>=4 and int(fields[2])==child.pid and int(fields[3])==child.pid and fields[0]!='Z':
   return True
 return False
def signal_child_group(signum):
 if child is None:return
 try:
  if os.name=='posix':os.killpg(child.pid,signum)
  elif child.poll() is None:
   if signum==signal.SIGTERM:child.terminate()
   else:child.kill()
 except ProcessLookupError:pass
def retire_child():
 if child is None:return
 signal_child_group(signal.SIGTERM)
 deadline=time.monotonic()+20
 while active_child_group():
  if time.monotonic()>=deadline:signal_child_group(signal.SIGKILL)
  time.sleep(0.05)
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
 private_fixture=root/'fixture-private.json'
 private_fixture.write_text(json.dumps({'schema':'stellar-forge.sf101.api-pass-agent-fixture-private.v1','root':str(root),
  'gateway':session['apiUrl'],'upstreamPort':upstream.server_port,'claimEnvironment':{'SF101_CLAIM_TOKEN':token},
  'nodeModules':str(node_modules),'nodePath':environment['NODE_PATH'],'node':node,'python':sys.executable},indent=2));private_fixture.chmod(0o600)
 child=subprocess.Popen([node,str(agent_journey),str(context_file)],cwd=source,env=environment,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=(os.name=='posix'))
 deadline=time.monotonic()+180
 while True:
  if received_signals:
   retire_child()
   raise RuntimeError('Original native receiving stopped by signal '+str(received_signals[0]))
  remaining=deadline-time.monotonic()
  if remaining<=0:
   retire_child()
   raise RuntimeError('Original native journey timed out')
  try:
   out,err=child.communicate(timeout=min(1,remaining))
   break
  except subprocess.TimeoutExpired:pass
 print(out,flush=True)
 if err:print(json.dumps({'nativeStderr':err[-5000:]}),flush=True)
 customer_result=json.loads((root/'portfolio-journey-result.json').read_text()) if (root/'portfolio-journey-result.json').exists() else {'status':'NO_CUSTOMER_RESULT'}
 agent_result=json.loads((root/'portfolio-agent-journey-result.json').read_text()) if (root/'portfolio-agent-journey-result.json').exists() else {'status':'NO_AGENT_RESULT'}
 native_exit=child.returncode
 result={'schema':'stellar-forge.sf101.api-pass-portfolio-agent-receiving.v1','operation':meta['agentOperation'],
  'customerSourceCommit':meta['sourceCommit'],'agentSourceCommit':meta['agentCommit'],'nativeExitCode':native_exit,
  'upstreamExecutions':len(calls),'merchantAllowances':[pass_store.show_pass(state,row['reference'])['usage'] for row in orders],
  'customer':customer_result,'agent':agent_result}
 result['status']='PASS' if native_exit==0 and customer_result.get('status')=='PASS' and agent_result.get('status')=='PASS' and len(calls)==3 else 'FAILED'
 if result['status']!='PASS':native_exit=native_exit or 1
 result_file=root/'portfolio-agent-receiving-result.json'
 with result_file.open('xb') as stream:stream.write(json.dumps(result,indent=2).encode());stream.flush();os.fsync(stream.fileno())
 print(json.dumps({'stage':'NATIVE_COMPLETED','result':result}),flush=True)

finally:
 try:retire_child()
 finally:
  try:
   if session:gateway.stop(session)
  finally:
   upstream.shutdown();upstream.server_close();thread.join()
   for signum,handler in previous_handlers.items():signal.signal(signum,handler)

# All original writers and both HTTP servers have retired before this complete checkpoint.
manifest={'schema':'stellar-forge.sf101.api-pass-portfolio-agent-checkpoint.v1',
 'operation':meta['agentOperation'],'workspaceRoot':str(root),'status':result['status'],
 'customerSourceCommit':meta['sourceCommit'],'agentSourceCommit':meta['agentCommit'],
 'workspaceId':result['agent'].get('workspaceId'),'createdAt':datetime.now(timezone.utc).isoformat(),
 'dependencies':{'node':subprocess.check_output([node,'--version'],text=True).strip(),'nodeModules':str(node_modules),
  'nodePath':environment['NODE_PATH'],'python':sys.version},'files':[]}
for item in sorted(root.rglob('*')):
 relative=item.relative_to(root).as_posix()
 if item.is_symlink():manifest['files'].append({'path':relative,'kind':'symlink','target':os.readlink(item)})
 elif item.is_file():
  data=item.read_bytes();manifest['files'].append({'path':relative,'kind':'file','bytes':len(data),'sha256':digest(data),'mode':stat.S_IMODE(item.stat().st_mode)})
manifest_file=root/'complete-workspace-manifest.json'
manifest_file.write_text(json.dumps(manifest,indent=2));manifest_file.chmod(0o600)
checkpoint=root.parent/('SCF_API_Portfolio_Agent_Workspace_'+root.name.removeprefix('921ba0-api-portfolio-agent-')+'.zip')
with zipfile.ZipFile(checkpoint,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as archive:
 for item in sorted(root.rglob('*')):
  relative=root.name+'/'+item.relative_to(root).as_posix()
  if item.is_symlink():
   info=zipfile.ZipInfo(relative);info.create_system=3;info.external_attr=(stat.S_IFLNK|0o777)<<16
   archive.writestr(info,os.readlink(item).encode())
  elif item.is_file():archive.write(item,relative)
checkpoint.chmod(0o600)
checkpoint_pin={'path':str(checkpoint),'bytes':checkpoint.stat().st_size,'sha256':digest(checkpoint.read_bytes()),
 'files':len(manifest['files'])+1,'workspaceRoot':str(root),'result':result['status']}
retained=os.environ.get('API_PORTFOLIO_RESULT_DIRECTORY')
if retained:
 try:
  destination=Path(retained);destination.mkdir(mode=0o700,parents=True,exist_ok=True)
  for item in [checkpoint,result_file]:
   target=destination/item.name
   with target.open('xb') as stream:stream.write(item.read_bytes());stream.flush();os.fsync(stream.fileno())
  checkpoint_pin['sharedPath']=str(destination/checkpoint.name)
 except OSError as error:checkpoint_pin['sharedCopyError']={'errno':error.errno,'message':str(error)}
print(json.dumps({'stage':'COMPLETE_WORKSPACE_RETAINED','checkpoint':checkpoint_pin}),flush=True)
if __name__=='__main__':sys.exit(native_exit)
