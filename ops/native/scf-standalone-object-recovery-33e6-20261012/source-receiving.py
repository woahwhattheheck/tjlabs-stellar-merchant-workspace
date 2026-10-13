import os,sys,json,gzip,base64,hashlib,tempfile,termios,signal,subprocess,time,traceback
from pathlib import Path
os.umask(0o077)
def _signal_exit(signum, _frame):
 raise SystemExit(128 + signum)
for _signal in (signal.SIGTERM, signal.SIGINT):
 signal.signal(_signal, _signal_exit)
import argparse
parser=argparse.ArgumentParser(description='Original complete standalone Object/SF101 receiving owner')
parser.add_argument('--source-input')
parser.add_argument('--expected-source-sha256')
parser.add_argument('--work-directory')
parser.add_argument('--original-object-archive')
parser.add_argument('--node')
parser.add_argument('--python')
parser.add_argument('--library-helpers')
parser.add_argument('--delivery-directory')
args=parser.parse_args()
if args.source_input and (not args.expected_source_sha256 or len(args.expected_source_sha256)!=64):
 parser.error('--source-input requires its complete published --expected-source-sha256')
for selected in ['source_input','original_object_archive','node','python','library_helpers','delivery_directory','work_directory']:
 value=getattr(args,selected)
 if value is not None and not Path(value).is_absolute():parser.error('--'+selected.replace('_','-')+' must be absolute')
if args.work_directory:
 root=Path(args.work_directory)
 if root.exists() or root.is_symlink():raise RuntimeError('EXISTING_ORIGINAL_WORK_REQUIRES_RECONCILIATION '+str(root))
 root.mkdir(mode=0o700)
else:
 root=Path(tempfile.mkdtemp(prefix='scf-object-sf101-33e6-',dir='/dev'))
for name,value in [('SCF_RECOVERY_ORIGINAL_ARCHIVE',args.original_object_archive),
 ('SCF_RECOVERY_NODE',args.node),('SCF_RECOVERY_PYTHON',args.python),
 ('SCF_RECOVERY_LIBRARY_HELPERS',args.library_helpers),('SCF_RECOVERY_DELIVERY_DIRECTORY',args.delivery_directory)]:
 if value is not None:os.environ[name]=value
application=root/'application';application.mkdir()
(root/'records').mkdir()
if sys.stdin.isatty():
 a=termios.tcgetattr(0);a[3]&=~(termios.ECHO|termios.ICANON);a[6][termios.VMIN]=1;a[6][termios.VTIME]=0;termios.tcsetattr(0,termios.TCSANOW,a)
def out(v):print(json.dumps(v,separators=(',',':')),flush=True)
def identity(b):return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'git_blob_sha':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()}
def once(p,b):
 p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.exists():
  if p.read_bytes()!=b:raise RuntimeError('RETAINED_BYTES_CHANGED '+str(p))
 else:
  with p.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
def memory():
 v={}
 for n in ['memory.current','memory.max','memory.events','memory.stat']:
  try:v[n]=(Path('/sys/fs/cgroup')/n).read_text().strip()
  except OSError:pass
 return v
def py(path):
 p=root/path
 if root not in p.parents or '..' in Path(path).parts:raise RuntimeError('OWNED_SCRIPT_REQUIRED')
 exec(compile(p.read_bytes(),str(p),'exec'),{'__name__':'__main__','__file__':str(p),'OWNER_ROOT':root,'OWNER_APPLICATION':application,'OWNER_OUT':out})
def node(path,label):
 p=root/path
 if root not in p.parents or '..' in Path(path).parts:raise RuntimeError('OWNED_SCRIPT_REQUIRED')
 log=root/'records'/label;before=memory();child=None;rc=None;reason=None
 with Path(str(log)+'.stdout').open('xb') as stdout,Path(str(log)+'.stderr').open('xb') as stderr:
  try:
   child=subprocess.Popen([os.environ.get('SCF_RECOVERY_NODE','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),str(p)],cwd=root,env={**os.environ,'TMPDIR':str(root),'SCF_ACCEPTANCE_ROOT':str(root)},stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,start_new_session=True)
   out({'state':'NATIVE_STARTED','pid':child.pid,'root':str(root),'label':label})
   until=time.monotonic()+360
   while time.monotonic()<until:
    if os.waitid(os.P_PID,child.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT):break
    time.sleep(.1)
   else:reason='TIMEOUT'
  finally:
   if child is not None:
    handlers={sig:signal.signal(sig,signal.SIG_IGN) for sig in (signal.SIGTERM,signal.SIGINT)}
    try:
     for sig in [signal.SIGTERM,signal.SIGKILL]:
      try:os.killpg(child.pid,sig)
      except ProcessLookupError:pass
      if sig==signal.SIGTERM:time.sleep(.2)
     rc=child.wait()
    finally:
     for sig,handler in handlers.items():signal.signal(sig,handler)
 receipt={'state':'NATIVE_RETURNED','label':label,'rc':rc,'reason':reason,'before':before,'after':memory(),'stdout':str(log)+'.stdout','stderr':str(log)+'.stderr'}
 once(Path(str(log)+'.result.json'),(json.dumps(receipt,indent=2)+'\n').encode())
 out({k:v for k,v in receipt.items() if k not in ['before','after']})
 out({'state':'NATIVE_OUTPUT','stdout':Path(str(log)+'.stdout').read_text(errors='replace')[-16000:],'stderr':Path(str(log)+'.stderr').read_text(errors='replace')[-10000:]})
 return rc
out({'state':'READY','root':str(root),'sourceInput':'ONE_COMPLETE_GZIP_JSON','sourceBytesLimit':16777216})
try:
 if args.source_input:
  source_file=Path(args.source_input)
  if source_file.is_symlink() or not source_file.is_file() or source_file.stat().st_size>2000000:raise RuntimeError('BOUNDED_REGULAR_SOURCE_REQUIRED')
  compressed=source_file.read_bytes()
  if hashlib.sha256(compressed).hexdigest()!=args.expected_source_sha256:raise RuntimeError('PUBLISHED_SOURCE_INPUT_CHANGED')
 else:
  line=sys.stdin.readline(2000001)
  if not line.endswith('\n') or len(line)>2000000:raise RuntimeError('COMPLETE_BOUNDED_SOURCE_LINE_REQUIRED')
  q=json.loads(line);compressed=base64.b64decode(q['base64'],validate=True)
 raw=gzip.decompress(compressed)
 if len(raw)>16777216:raise RuntimeError('SOURCE_INPUT_TOO_LARGE')
 packet=json.loads(raw)
 if packet.get('schema')!='stellar-forge.complete-native-source-input.v1' or packet.get('repository')!='woahwhattheheck/tjlabs-stellar-merchant-workspace' or packet.get('commit')!='b09765c47a6e71b552bfc7b38958d7b1b9750678':raise RuntimeError('EXACT_SOURCE_SELECTION_REQUIRED')
 if len(packet['files'])!=212:raise RuntimeError('COMPLETE_212_FILE_SOURCE_REQUIRED')
 rows=[];seen=set()
 for f in packet['files']:
  p=f['source_path']
  if p.startswith('/') or any(x in ['', '.', '..'] for x in p.split('/')) or p in seen:raise RuntimeError('SOURCE_PATH_INVALID')
  seen.add(p);b=f['content'].encode();i=identity(b)
  if i['git_blob_sha']!=f['git_blob_sha']:raise RuntimeError('SOURCE_GIT_BLOB_MISMATCH '+p)
  rows.append({'path':p,**i})
 for f in packet['files']:once(application/f['source_path'],f['content'].encode())
 for f in packet['programmes']:
  if f['path'] not in ['native-acceptance.mjs','prepare-native.py','package-native.py','source-receiving.py']:raise RuntimeError('PROGRAMME_SELECTION_INVALID')
  once(root/f['path'],f['content'].encode())
 once(root/'source-input.json.gz',compressed)
 once(root/'records/source-manifest.json',(json.dumps({'repository':packet['repository'],'commit':packet['commit'],'files':rows,'transport':identity(compressed),'sourceInput':identity(raw)},indent=2)+'\n').encode())
 out({'state':'SOURCE_COMPLETE','root':str(root),'files':len(rows),'bytes':sum(f['bytes'] for f in rows),'compressed':identity(compressed)})
 py('prepare-native.py')
 if node('native-acceptance.mjs','native-run')==0:
  py('package-native.py')
  out({'state':'FULL_NATIVE_COMPLETE','root':str(root)})
  sys.exit(0)
 raise RuntimeError('NATIVE_CUSTOMER_PARTIAL')
except SystemExit:raise
except BaseException as e:
 out({'state':'RECOVERY_REQUIRED','root':str(root),'type':type(e).__name__,'message':str(e),'trace':traceback.format_exc()})
for line in sys.stdin:
 try:
  q=json.loads(line);action=q['action']
  if action=='close':out({'state':'CLOSED','root':str(root)});break
  p=root/q.get('path','')
  if action=='read':
   if root not in p.parents or '..' in Path(q['path']).parts:raise RuntimeError('READ_SCOPE')
   b=p.read_bytes()
   if len(b)>q.get('maxBytes',150000):raise RuntimeError('READ_BOUND')
   out({'state':'READ','path':str(p),'identity':identity(b),'content':b.decode()})
  elif action=='write':
   if root not in p.parents or '..' in Path(q['path']).parts:raise RuntimeError('WRITE_SCOPE')
   b=q['content'].encode();once(p,b);out({'state':'WRITTEN','path':str(p),'identity':identity(b)})
  elif action=='python':py(q['path']);out({'state':'PYTHON_COMPLETE','path':q['path']})
  elif action=='node':node(q['path'],q['label'])
  else:raise RuntimeError('UNKNOWN_ACTION')
 except SystemExit:raise
 except BaseException as e:out({'state':'RECOVERY_REQUIRED','root':str(root),'type':type(e).__name__,'message':str(e),'trace':traceback.format_exc()})
sys.exit(1)
