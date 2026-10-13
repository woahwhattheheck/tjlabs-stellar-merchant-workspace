# MIT. Durable child execution for the original Invoice & Settlement receiving owner.
import os,sys,json,stat,hashlib,subprocess,time,signal,fcntl
from pathlib import Path
def sha(b): return hashlib.sha256(b).hexdigest()
def canonical(v): return (json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def read(p,limit=128*1024*1024):
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd)
  if not stat.S_ISREG(before.st_mode) or before.st_size>limit: raise RuntimeError('Invalid retained regular file: '+str(p))
  with os.fdopen(fd,'rb',closefd=False) as h: body=h.read(limit+1)
  after=os.fstat(fd)
  if len(body)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns): raise RuntimeError('Retained file changed: '+str(p))
  return body
 finally: os.close(fd)
def sync_dir(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
 try: os.fsync(fd)
 finally: os.close(fd)
def put(p,body):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.exists():
  if read(p)!=body: raise RuntimeError('Frozen original differs: '+str(p))
  return
 tmp=p.with_name(p.name+'.partial-'+str(os.getpid())+'-'+str(time.time_ns()))
 try:
  with tmp.open('xb') as f:f.write(body);f.flush();os.fsync(f.fileno())
  try: os.link(tmp,p)
  except FileExistsError:
   if read(p)!=body: raise RuntimeError('Frozen original differs: '+str(p))
  sync_dir(p.parent)
 finally:
  if tmp.exists():tmp.unlink();sync_dir(p.parent)
def host():
 return {'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'pidNamespace':os.readlink('/proc/self/ns/pid')}
def self_identity():
 text=Path('/proc/self/stat').read_text();proc_pid=int(text.split('(',1)[0].strip())
 link_pid=int(os.readlink('/proc/self'))
 if proc_pid!=link_pid:raise RuntimeError('Original child proc identity differs')
 return {**host(),'procPid':proc_pid,'namespacePid':os.getpid(),'namespacePgid':os.getpgrp(),'start':text.rsplit(')',1)[1].split()[19]}
def group_alive(proc_pgid):
 members=[]
 for entry in Path('/proc').iterdir():
  if not entry.name.isdigit():continue
  try:
   fields=(entry/'stat').read_text().rsplit(')',1)[1].split()
   if int(fields[2])==proc_pgid and fields[0]!='Z':members.append(int(entry.name))
  except(FileNotFoundError,ProcessLookupError,PermissionError):continue
 return members
def close_group(namespace_pgid,record):
 if record is None:
  # The child writes its own identity before exec. No record means no original
  # command was entered; close this exact namespace group without inventing a /proc PID.
  try:os.killpg(namespace_pgid,signal.SIGKILL)
  except ProcessLookupError:pass
  return
 proc_pgid=record['procPid']
 if not group_alive(proc_pgid):return
 try:os.killpg(namespace_pgid,signal.SIGTERM)
 except ProcessLookupError:
  if group_alive(proc_pgid):raise RuntimeError('Original child group is outside this namespace')
  return
 deadline=time.monotonic()+10
 while group_alive(proc_pgid)and time.monotonic()<deadline:time.sleep(.05)
 if group_alive(proc_pgid):
  try:os.killpg(namespace_pgid,signal.SIGKILL)
  except ProcessLookupError:pass
  deadline=time.monotonic()+5
  while group_alive(proc_pgid)and time.monotonic()<deadline:time.sleep(.05)
 if group_alive(proc_pgid):raise RuntimeError('Original child process group remains active')
def closed(record):
 if any(record.get(k)!=v for k,v in host().items()):raise RuntimeError('Original host closure requires reconciliation')
 if type(record.get('procPid'))is not int:raise RuntimeError('Original process has no self-reported proc PID; reconcile it')
 try:current=Path('/proc/'+str(record['procPid'])+'/stat').read_text().rsplit(')',1)[1].split()
 except FileNotFoundError:return not group_alive(record['procPid'])
 if current[19]!=record['start']:return True
 return current[0]=='Z'and not group_alive(record['procPid'])
def child_entry(request_path):
 path=Path(request_path);raw=read(path);request=json.loads(raw)
 fd=int(os.environ['INVOICE_RECEIVING_LOCK_FD']);fcntl.fcntl(fd,fcntl.F_GETFD)
 put(path.parent/'process.json',canonical({**self_identity(),'requestSha256':sha(raw)}))
 os.set_inheritable(fd,True)
 os.execvpe(request['argv'][0],request['argv'],os.environ.copy())
def interrupted(signum,frame): raise InterruptedError('Original child supervisor interrupted')
def execute(request_path,guard_fd):
 signal.signal(signal.SIGTERM,interrupted)
 fcntl.fcntl(guard_fd,fcntl.F_GETFD)
 request_path=Path(request_path);raw=read(request_path);request=json.loads(raw);root=request_path.parent
 if (root/'return.json').exists():
  returned=json.loads(read(root/'return.json'))
  if returned['requestSha256']!=sha(raw):raise RuntimeError('Original child request changed')
  return returned
 if (root/'entered.json').exists():raise RuntimeError('Original child entered without a durable return; reconcile this attempt')
 put(root/'entered.json',canonical({'requestSha256':sha(raw),'enteredAt':time.time(),**host()}))
 source=None;child=None
 def retained_child():
  p=root/'process.json'
  if not p.exists():return None
  record=json.loads(read(p))
  if record.get('requestSha256')!=sha(raw):raise RuntimeError('Original child process request changed')
  if any(record.get(k)!=v for k,v in host().items()):raise RuntimeError('Original child process host changed')
  if type(record.get('procPid'))is not int or type(record.get('namespacePgid'))is not int:raise RuntimeError('Original child process identity is incomplete')
  if child is not None and record['namespacePgid']!=child.pid:raise RuntimeError('Original child process group changed')
  return record
 try:
  if request.get('stdinPath'):source=open(request['stdinPath'],'rb')
  with (root/'stdout.log').open('xb') as out,(root/'stderr.log').open('xb') as err:
   child=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--child',str(request_path)],cwd=request['cwd'],env=os.environ.copy(),stdin=source or subprocess.DEVNULL,stdout=out,stderr=err,pass_fds=(guard_fd,),start_new_session=True)
   timed_out=False
   try: code=child.wait(timeout=request.get('timeoutSeconds',600))
   except subprocess.TimeoutExpired:
    timed_out=True;os.killpg(child.pid,signal.SIGTERM)
    try:code=child.wait(timeout=15)
    except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
   close_group(child.pid,retained_child())
   out.flush();os.fsync(out.fileno());err.flush();os.fsync(err.fileno())
  stdout=read(root/'stdout.log');stderr=read(root/'stderr.log')
  result={'requestSha256':sha(raw),'exitCode':code,'timedOut':timed_out,'groupClosed':True,'stdout':{'bytes':len(stdout),'sha256':sha(stdout)},'stderr':{'bytes':len(stderr),'sha256':sha(stderr)}}
  put(root/'return.json',canonical(result));return result
 finally:
  if source:source.close()
  if child is not None and child.poll() is None:
   # Only this exact still-owned process group is closed.
   try:os.killpg(child.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   try:child.wait(timeout=15)
   except subprocess.TimeoutExpired:
    try:os.killpg(child.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    child.wait()
  if child is not None:close_group(child.pid,retained_child())
if __name__=='__main__':
 os.umask(0o077)
 if len(sys.argv)==3 and sys.argv[1]=='--child':child_entry(sys.argv[2]);raise SystemExit(127)
 result=execute(sys.argv[1],int(os.environ['INVOICE_RECEIVING_LOCK_FD']))
 print(json.dumps(result,separators=(',',':')),flush=True)
