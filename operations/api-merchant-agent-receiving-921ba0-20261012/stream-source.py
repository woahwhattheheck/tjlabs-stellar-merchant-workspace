import os,sys,json,hashlib,tempfile,stat,subprocess,termios
from pathlib import Path
SOURCE=Path('/dev/921ba0-api-merchant-agent-source')
MAIN='68faef31c6b0bd94ac99715f53144aa5512c0672'
def need(v,c):
 if not v:raise RuntimeError(c)
def private(p):
 s=p.lstat();need(stat.S_ISDIR(s.st_mode) and not p.is_symlink() and s.st_uid==os.getuid() and not s.st_mode&0o077 and p.resolve()==p,'ORIGINAL_SOURCE_DIRECTORY_CHANGED')
def atomic(p,b):
 if p.exists():
  need(not p.is_symlink() and p.read_bytes()==b,'ORIGINAL_SOURCE_FILE_CHANGED');return
 fd,name=tempfile.mkstemp(prefix='.921ba0-source-',dir=p.parent)
 try:
  with os.fdopen(fd,'wb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.link(name,p)
 finally:os.unlink(name)
def report(v):print(json.dumps(v),flush=True)
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def digest(b):return hashlib.sha256(b).hexdigest()
SOURCE.mkdir(mode=0o700,exist_ok=True);private(SOURCE)
tty=termios.tcgetattr(sys.stdin);mode=termios.tcgetattr(sys.stdin);mode[3]&=~(termios.ECHO|termios.ICANON);mode[6][termios.VMIN]=1;mode[6][termios.VTIME]=0;termios.tcsetattr(sys.stdin,termios.TCSANOW,mode)
entries={};chunks=set();native_completed=False
report({'state':'SOURCE_INPUT_READY','directory':str(SOURCE),'privateStateFreeBytes':os.statvfs('/dev/shm').f_bavail*os.statvfs('/dev/shm').f_frsize})
try:
 for line in sys.stdin:
  value=json.loads(line)
  if value.get('kind')=='package':
   need(native_completed,'ORIGINAL_AGENT_COMPLETION_REQUIRED')
   package_source=value['source'].encode();need(blob(package_source)==value['blob'],'ORIGINAL_PACKAGE_BUILDER_CHANGED')
   env=dict(os.environ);env['SCF_MERCHANT_AGENT_SOURCE']=str(SOURCE)
   result=subprocess.run(['python3','-c',package_source.decode()],env=env,stdin=subprocess.DEVNULL)
   report({'state':'ORIGINAL_DELIVERY_PROCESS_EXITED','exitCode':result.returncode});sys.exit(result.returncode)
  if value.get('kind')=='chunk':
   i=value['index'];need(isinstance(i,int) and 0<=i<1000 and isinstance(value['parts'],list),'SOURCE_CHUNK_INDEX')
   for part in value['parts']:
    path=part['path'];need(isinstance(path,str) and not path.startswith('/') and all(p not in ('','.','..') for p in path.split('/')),'SOURCE_PATH_CHANGED')
    need(isinstance(part['index'],int) and isinstance(part['parts'],int) and 0<=part['index']<part['parts']<=1000 and isinstance(part['content'],str),'SOURCE_PART_INVALID')
    entry=entries.setdefault(path,{'sha':part['sha'],'parts':part['parts'],'pieces':{},'hashes':{},'mode':part['mode'],'complete':False})
    need(entry['sha']==part['sha'] and entry['parts']==part['parts'] and entry['mode']==part['mode'],'SOURCE_PART_CHANGED')
    key=part['index'];current=digest(part['content'].encode())
    if key in entry['hashes']:need(entry['hashes'][key]==current,'SOURCE_PART_CHANGED')
    else:
     need(not entry['complete'],'SOURCE_PART_CHANGED');entry['hashes'][key]=current;entry['pieces'][key]=part['content']
    if not entry['complete'] and len(entry['pieces'])==entry['parts']:
     need(set(entry['pieces'])==set(range(entry['parts'])),'SOURCE_PART_MISSING')
     body=''.join(entry['pieces'][j] for j in range(entry['parts'])).encode();need(blob(body)==entry['sha'],'SOURCE_BLOB_CHANGED')
     target=SOURCE/path;target.parent.mkdir(mode=0o700,parents=True,exist_ok=True);atomic(target,body)
     os.chmod(target,0o700 if entry['mode']=='100755' else 0o600)
     entry['complete']=True;entry['pieces'].clear()
   chunks.add(i);report({'chunk':i,'state':'RETAINED','completeFiles':sum(e['complete'] for e in entries.values())});continue
  need(value.get('kind')=='run','SOURCE_INPUT_INVALID')
  selection=value['selection'];need(selection['sourceCommit']==MAIN and chunks==set(range(selection['chunks'])),'SOURCE_SELECTION_CHANGED')
  need(set(entries)=={x['path'] for x in selection['files']},'SOURCE_INVENTORY_CHANGED')
  for item in selection['files']:
   entry=entries[item['path']];need(entry['complete'] and entry['sha']==item['gitBlob'] and entry['mode']==item['mode'],'SOURCE_SELECTION_CHANGED')
   need(blob((SOURCE/item['path']).read_bytes())==item['gitBlob'],'SOURCE_BLOB_CHANGED')
  atomic(SOURCE/'SOURCE-SELECTION.json',(json.dumps(selection,ensure_ascii=False,indent=2)+'\n').encode())
  modules=Path('/workspace/scratch/9345d3fc660b/native-runtime/node_modules')
  if modules.is_dir() and not os.path.lexists(SOURCE/'node_modules'):os.symlink(str(modules),SOURCE/'node_modules')
  package_source=None
  if value.get('packageSource') is not None:
   package_source=value['packageSource'].encode();need(blob(package_source)==value['packageBlob'],'ORIGINAL_PACKAGE_BUILDER_CHANGED')
   compile(package_source.decode(),'<original-delivery-builder>','exec')
  driver=SOURCE/'merchant-agent-native-journey.mjs'
  body=value['driver'].encode();need(blob(body)==value['driverBlob'],'ORIGINAL_AGENT_DRIVER_CHANGED');atomic(driver,body)
  env=dict(os.environ);env.update({'SCF_MERCHANT_AGENT_SOURCE':str(SOURCE),'NODE_OPTIONS':'--preserve-symlinks --preserve-symlinks-main','NODE_PATH':'/workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules','PYTHONDONTWRITEBYTECODE':'1'})
  report({'state':'ORIGINAL_SOURCE_READY','files':len(entries),'sourceCommit':MAIN,'driverBlob':value['driverBlob'],'privateStateFreeBytes':os.statvfs('/dev/shm').f_bavail*os.statvfs('/dev/shm').f_frsize})
  result=subprocess.run(['node',str(driver),'--resume'],env=env,stdin=subprocess.DEVNULL)
  report({'state':'ORIGINAL_AGENT_PROCESS_EXITED','exitCode':result.returncode})
  if result.returncode:sys.exit(result.returncode)
  native_completed=True;retired=0
  for name in entries:
   target=SOURCE/name;retired+=target.stat().st_size;target.unlink()
  driver.unlink()
  report({'state':'ORIGINAL_AGENT_COMPLETE_AWAITING_DELIVERY','retiredSourceBytes':retired,'privateStateFreeBytes':os.statvfs('/dev/shm').f_bavail*os.statvfs('/dev/shm').f_frsize})
  if package_source is not None:
   result=subprocess.run(['python3','-c',package_source.decode()],env=env,stdin=subprocess.DEVNULL)
   report({'state':'ORIGINAL_DELIVERY_PROCESS_EXITED','exitCode':result.returncode});sys.exit(result.returncode)
finally:
 termios.tcsetattr(sys.stdin,termios.TCSANOW,tty)
