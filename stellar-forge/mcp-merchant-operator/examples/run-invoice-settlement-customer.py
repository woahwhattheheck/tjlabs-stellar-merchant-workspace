# MIT. One original Invoice & Settlement receiving owner, full native run and durable save.
import os,sys,json,hashlib,stat,fcntl,subprocess,time,zipfile,importlib.util,traceback
from pathlib import Path
os.umask(0o077)
ROOT=Path('/dev/invoice-customer-6ba15-20261013')
OP='SCF-INVOICE-SETTLEMENT-MCP-CUSTOMER-20261013'
ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
if ROOT.resolve()!=ROOT or not stat.S_ISDIR(ROOT.lstat().st_mode):raise RuntimeError('Original canonical receiving root differs')
guard=(ROOT/'operation.lock').open('a+b')
try:fcntl.flock(guard.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise RuntimeError('Original Invoice receiving is already owned')
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return (json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n').encode()
def event(name,**v):print(json.dumps({'event':name,**v},separators=(',',':')),flush=True)
def raw_file(p,limit=64*1024*1024):
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  s=os.fstat(fd)
  if not stat.S_ISREG(s.st_mode)or s.st_size>limit:raise RuntimeError('Invalid original file: '+str(p))
  with os.fdopen(fd,'rb',closefd=False)as f:b=f.read(limit+1)
  after=os.fstat(fd)
  if len(b)!=s.st_size or(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns):raise RuntimeError('Original file changed')
  return b
 finally:os.close(fd)
def sync_dir(p):
 d=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(d)
 finally:os.close(d)
def put(p,b):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.exists():
  if raw_file(p)!=b:raise RuntimeError('Original immutable bytes differ: '+str(p))
  return
 tmp=p.with_name(p.name+'.partial-'+str(os.getpid())+'-'+str(time.time_ns()))
 try:
  with tmp.open('xb')as f:f.write(b);f.flush();os.fsync(f.fileno())
  try:os.link(tmp,p)
  except FileExistsError:
   if raw_file(p)!=b:raise RuntimeError('Original publication differs')
  sync_dir(p.parent)
 finally:
  if tmp.exists():tmp.unlink();sync_dir(p.parent)
def host():
 return {'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'pidNamespace':os.readlink('/proc/self/ns/pid')}
owner=ROOT/'owner-host.json';identity=host()
if owner.exists():
 if json.loads(raw_file(owner))!=identity:raise RuntimeError('Original host/namespace changed; reconcile or explicitly restore original saved custody before continuation')
else:put(owner,canonical(identity))
if len(sys.argv)==2:
 raw=raw_file(Path(sys.argv[1]),16*1024*1024)
else:
 if sys.stdin.isatty():
  import tty
  tty.setraw(sys.stdin.fileno())
 event('INVOICE_INPUT_READY',operationId=OP,root=str(ROOT))
 header=json.loads(sys.stdin.buffer.readline())
 n=header.get('bytes')
 if type(n)is not int or not 0<n<=16*1024*1024:raise RuntimeError('Original input size is invalid')
 body=bytearray()
 while len(body)<n:
  part=sys.stdin.buffer.read(min(1048576,n-len(body)))
  if not part:raise RuntimeError('Original source input was interrupted before materialization')
  body.extend(part)
 raw=bytes(body)
 if sha(raw)!=header.get('sha256'):raise RuntimeError('Complete original source input differs')
payload=json.loads(raw)
if payload.get('operationId')!=OP or payload.get('root')!=str(ROOT):raise RuntimeError('Original operation or root changed')
put(ROOT/'input.json',raw)
input_sha=sha(raw)
files=payload['files'];seen=set()
for row in files:
 p=Path(row['path'])
 if p.is_absolute()or any(x in('','.','..')for x in p.parts)or p.as_posix()in seen:raise RuntimeError('Invalid or repeated original source member')
 seen.add(p.as_posix());data=row['content'].encode()
 if len(data)!=row['bytes']or sha(data)!=row['sha256']:raise RuntimeError('Original source member differs: '+str(p))
 path=ROOT/'source'/p;put(path,data);os.chmod(path,0o755 if row.get('mode')=='100755'else 0o644)
put(ROOT/'run.mjs',payload['program'].encode())
put(ROOT/'invoice-receiving-supervisor.py',payload['supervisor'].encode())
helpers=payload['libraryHelpers']
if set(helpers)!={'library_upload.py','library_hosted_apps.py','library_file_transfer.py'}:raise RuntimeError('The complete maintained Library helper closure is required')
for name,source in helpers.items():
 data=source.encode()
 if sha(data)!=payload['libraryHelperSha256'][name]:raise RuntimeError('Original Library helper identity changed')
 put(ROOT/'helpers'/name,data)
spec=importlib.util.spec_from_file_location('invoice_receiving_supervisor',ROOT/'invoice-receiving-supervisor.py')
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
env=dict(os.environ,INVOICE_RECEIVING_LOCK_FD=str(guard.fileno()),NODE_OPTIONS='--max-old-space-size=192',OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1')
node=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE')or'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
def invoke_job(directory,request):
 directory.mkdir(parents=True,exist_ok=True,mode=0o700)
 request_path=directory/'request.json';put(request_path,canonical(request))
 if not(directory/'return.json').exists():
  if(directory/'entered.json').exists():raise RuntimeError('This original entered job lacks its own durable return; reconcile it without replay')
  process=subprocess.Popen([sys.executable,str(ROOT/'invoice-receiving-supervisor.py'),str(request_path)],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(guard.fileno(),))
  out,err=process.communicate()
  if not(directory/'return.json').exists():raise RuntimeError('Original supervisor returned no completed child record: '+err.decode(errors='replace')[-1200:])
 returned=json.loads(raw_file(directory/'return.json'))
 if returned['requestSha256']!=sha(raw_file(request_path)):raise RuntimeError('Original child return is paired with another request')
 for key in('stdout','stderr'):
  b=raw_file(directory/(key+'.log'))
  if len(b)!=returned[key]['bytes']or sha(b)!=returned[key]['sha256']:raise RuntimeError('Original child return bytes differ')
 return returned
def assure_closed():
 # Every inherited child retains the same permanent guard. Within this live owner,
 # also inspect each concrete child identity before archive reads.
 patterns=['native-attempts/*/process.json','receiving/commands/*/attempts/*/process.json']
 for pattern in patterns:
  for p in ROOT.glob(pattern):
   if not support.closed(json.loads(raw_file(p))):raise RuntimeError('An original child still owns native work: '+str(p))
def save_record(directory):
 request_raw=raw_file(directory/'request.json');request=json.loads(request_raw)
 returned=json.loads(raw_file(directory/'job'/'return.json'))
 if returned['requestSha256']!=sha(raw_file(directory/'job'/'request.json')):raise RuntimeError('Library return has another job request')
 for key in('stdout','stderr'):
  b=raw_file(directory/'job'/(key+'.log'))
  if len(b)!=returned[key]['bytes']or sha(b)!=returned[key]['sha256']:raise RuntimeError('Library output hash changed')
 if returned['exitCode']!=0:raise RuntimeError('Original Library invocation failed; retain its exact outcome for reconciliation')
 body=json.loads(raw_file(directory/'job'/'stdout.log'));rows=body.get('results',[])
 if len(rows)!=1:raise RuntimeError('Original Library row count changed')
 expected=request['uploads'][0];row=rows[0]
 for key in('local_path','purpose'):
  if row.get(key)!=expected[key]:raise RuntimeError('Library receipt does not match its original ordered row')
 if row.get('status')!='succeeded'or row.get('file_name')!=Path(expected['local_path']).name or not row.get('file_id')or not row.get('library_file_id'):raise RuntimeError('Original Library save did not acknowledge the exact archive')
 version=expected.get('expected_current_version',-1)+1
 if type(row.get('current_version_number'))is not int or row['current_version_number']!=version:raise RuntimeError('Original Library version differs')
 if expected['purpose']=='replace_library_file'and row['library_file_id']!=expected['library_file_id']:raise RuntimeError('Canonical archive Library identity changed')
 acknowledged={'requestSha256':sha(request_raw),'jobReturnSha256':sha(raw_file(directory/'job'/'return.json')),'result':row}
 # Preserve canonical provider identity even if local metadata requires its original materializer.
 put(directory/'acknowledged.json',canonical(acknowledged))
 if row.get('local_metadata_applied')is not True:raise RuntimeError('Original canonical archive is saved; repair local metadata without another upload')
 return acknowledged
def verify_save_archive(directory):
 request=json.loads(raw_file(directory/'request.json'));archive=Path(request['uploads'][0]['local_path']);descriptor=json.loads(raw_file(archive.parent/'artifact.json'));body=raw_file(archive)
 if str(archive)!=descriptor['path']or len(body)!=descriptor['bytes']or sha(body)!=descriptor['sha256']:raise RuntimeError('Original selected archive changed before its save')
 return descriptor
def prior_saves():
 rows=[]
 folder=ROOT/'delivery'/'saves'
 if not folder.exists():return rows
 for path in sorted(folder.iterdir()):
  if not path.is_dir():raise RuntimeError('Unexpected save history member')
  if not(path/'request.json').exists():raise RuntimeError('Original save directory has no immutable request')
  if not(path/'job'/'return.json').exists():
   # A selected request before dispatch can continue only if no entered effect exists.
   if(path/'job'/'entered.json').exists()or(path/'dispatch.json').exists():raise RuntimeError('Original Library invocation is unresolved; no new native run or upload')
   descriptor=verify_save_archive(path)
   put(path/'dispatch.json',canonical({'requestSha256':sha(raw_file(path/'request.json')),'artifact':descriptor,'inputSha256':input_sha}))
   invoke_job(path/'job',{'argv':[sys.executable,str(ROOT/'helpers'/'library_upload.py')],'cwd':str(ROOT),'stdinPath':str(path/'request.json'),'timeoutSeconds':900})
  rows.append({'directory':path,'ack':save_record(path)})
 return rows
event('INVOICE_MATERIALIZED',root=str(ROOT),files=len(files),inputSha256=input_sha,pid=os.getpid())
history=prior_saves()
assure_closed()
complete=ROOT/'receiving'/'COMPLETE.json'
native_code=0;native_error=None
try:
 if not complete.exists():
  attempts=ROOT/'native-attempts';attempts.mkdir(mode=0o700,exist_ok=True)
  names=sorted(p.name for p in attempts.iterdir()if p.is_dir())
  for name in names:
   old=attempts/name
   if(old/'entered.json').exists()and not(old/'return.json').exists():
    process_record=old/'process.json'
    if not process_record.exists()or not support.closed(json.loads(raw_file(process_record))):raise RuntimeError('Original native attempt closure remains unresolved')
  number=f'{(int(names[-1])+1)if names else 1:06d}'
  job=attempts/number
  returned=invoke_job(job,{'argv':[node,'--max-old-space-size=192',str(ROOT/'run.mjs'),str(ROOT)],'cwd':str(ROOT),'timeoutSeconds':1800})
  native_code=returned['exitCode'];event('INVOICE_NATIVE_EXIT',exitCode=native_code,attempt=number,stdout=returned['stdout'],stderr=returned['stderr'])
 else:
  # Node's completed path verifies every frozen phase without reopening any provider.
  reopened=ROOT/'completed-reopen'
  returned=invoke_job(reopened,{'argv':[node,'--max-old-space-size=192',str(ROOT/'run.mjs'),str(ROOT)],'cwd':str(ROOT),'timeoutSeconds':120})
  if returned['exitCode']!=0:raise RuntimeError('Original completed phase inventory failed verification')
  event('INVOICE_COMPLETE_REOPENED',networkRequests=0)
except BaseException as error:
 native_code=2;native_error=str(error);event('INVOICE_NATIVE_INTERRUPTED',error=native_error)
assure_closed()
# Freeze exact complete current native/source state; all earlier save records remain available.
state_files=[]
for p in sorted((ROOT/'receiving').rglob('*'))if(ROOT/'receiving').exists()else []:
 if p.is_symlink():raise RuntimeError('Unexpected source/native symlink')
 if p.is_file()and not p.name.endswith('.lock'):
  raw_state=raw_file(p);state_files.append({'path':p.relative_to(ROOT).as_posix(),'bytes':len(raw_state),'sha256':sha(raw_state)})
state_key=sha(canonical({'inputSha256':input_sha,'nativeExitCode':native_code,'nativeError':native_error,'state':state_files}))
edition=ROOT/'delivery'/'editions'/state_key;edition.mkdir(parents=True,exist_ok=True,mode=0o700)
archive=edition/'Invoice_Settlement_Customer_Receiving.zip';recipe_path=edition/'recipe.json'
if recipe_path.exists():recipe=json.loads(raw_file(recipe_path))
else:
 members={}
 for folder in('source','receiving','distribution','installed','helpers','native-attempts','completed-reopen'):
  base=ROOT/folder
  if not base.exists():continue
  for p in sorted(base.rglob('*')):
   relative=p.relative_to(ROOT).as_posix()
   if '.git'in p.parts or p.name.endswith('.lock')or'.partial-'in p.name:continue
   if p.is_symlink():raise RuntimeError('Unexpected package symlink: '+relative)
   if p.is_file():
    b=raw_file(p);members[relative]={'bytes':len(b),'sha256':sha(b),'mode':stat.S_IMODE(p.stat().st_mode)}
 for name in('input.json','run.mjs','invoice-receiving-supervisor.py','owner-host.json'):
  b=raw_file(ROOT/name);members[name]={'bytes':len(b),'sha256':sha(b),'mode':0o600}
 # Earlier exact helper requests and returns travel with following editions.
 saves=ROOT/'delivery'/'saves'
 if saves.exists():
  for p in sorted(saves.rglob('*')):
   if p.is_file()and'.partial-'not in p.name:
    b=raw_file(p);members[p.relative_to(ROOT).as_posix()]={'bytes':len(b),'sha256':sha(b),'mode':0o600}
 recipe={'schema':'commons.invoice-customer-complete-archive.v2','operationId':OP,'inputSha256':input_sha,'stateSha256':state_key,'nativeExitCode':native_code,'nativeError':native_error,'files':members}
 put(recipe_path,canonical(recipe))
if not archive.exists():
 temp=archive.with_name(archive.name+'.partial-'+str(time.time_ns()))
 try:
  with zipfile.ZipFile(temp,'x',zipfile.ZIP_DEFLATED,compresslevel=6)as z:
   for relative,item in sorted(recipe['files'].items()):
    data=raw_file(ROOT/relative)
    if len(data)!=item['bytes']or sha(data)!=item['sha256']:raise RuntimeError('Original archive source changed: '+relative)
    info=zipfile.ZipInfo(relative,(2026,10,13,0,0,0));info.external_attr=(stat.S_IFREG|item['mode'])<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
   info=zipfile.ZipInfo('DELIVERY_MEMBERS.json',(2026,10,13,0,0,0));info.external_attr=0o100600<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,canonical(recipe))
  with temp.open('rb')as f:os.fsync(f.fileno())
  os.link(temp,archive);sync_dir(edition)
 finally:
  if temp.exists():temp.unlink();sync_dir(edition)
with zipfile.ZipFile(archive)as z:
 if set(z.namelist())!=set(recipe['files'])|{'DELIVERY_MEMBERS.json'}or len(z.namelist())!=len(recipe['files'])+1:raise RuntimeError('Original archive member set differs')
 if z.read('DELIVERY_MEMBERS.json')!=canonical(recipe):raise RuntimeError('Original archive recipe differs')
 for relative,item in recipe['files'].items():
  data=z.read(relative)
  if len(data)!=item['bytes']or sha(data)!=item['sha256']:raise RuntimeError('Original archived member differs')
artifact=raw_file(archive);descriptor={'path':str(archive),'bytes':len(artifact),'sha256':sha(artifact),'stateSha256':state_key,'nativeExitCode':native_code}
put(edition/'artifact.json',canonical(descriptor));event('INVOICE_ARTIFACT_READY',**descriptor)
save_root=ROOT/'delivery'/'saves';save_root.mkdir(parents=True,exist_ok=True,mode=0o700)
matching=sorted(save_root.glob('*-'+state_key))
if len(matching)>1:raise RuntimeError('Original state has more than one selected save batch')
if matching:batch=matching[0]
else:
 all_batches=sorted(p.name for p in save_root.iterdir()if p.is_dir())
 ordinal=(int(all_batches[-1].split('-',1)[0])+1)if all_batches else 1
 batch=save_root/(f'{ordinal:06d}-'+state_key)
if not(batch/'request.json').exists():
 previous=next((x['ack']['result']for x in reversed(history)if'ack'in x),None)
 row={'local_path':str(archive),'purpose':'replace_library_file'if previous else'create_library_file'}
 if previous:row.update(library_file_id=previous['library_file_id'],expected_current_version=previous['current_version_number'])
 else:row['library_artifact_type']='other'
 put(batch/'request.json',canonical({'uploads':[row]}))
if not(batch/'job'/'return.json').exists():
 if(batch/'dispatch.json').exists():raise RuntimeError('Original archive save dispatch is unresolved; reconcile without upload replay')
 verify_save_archive(batch)
 put(batch/'dispatch.json',canonical({'requestSha256':sha(raw_file(batch/'request.json')),'artifact':descriptor,'inputSha256':input_sha}))
 event('INVOICE_LIBRARY_BATCH_STARTED',requestSha256=sha(raw_file(batch/'request.json')),artifact=descriptor)
 invoke_job(batch/'job',{'argv':[sys.executable,str(ROOT/'helpers'/'library_upload.py')],'cwd':str(ROOT),'stdinPath':str(batch/'request.json'),'timeoutSeconds':900})
ack=save_record(batch)
event('INVOICE_SAVED',artifact=descriptor,result=ack['result'],requestSha256=ack['requestSha256'])
event('INVOICE_CONTROLLER_DRAINED',operationId=OP,nativeExitCode=native_code)
sys.exit(0 if native_code==0 else 2)
