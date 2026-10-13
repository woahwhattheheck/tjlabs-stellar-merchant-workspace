from pathlib import Path,PurePosixPath
import json,os,hashlib,subprocess,secrets,shutil,zipfile,stat
root=OWNER_ROOT
def sha(b):return hashlib.sha256(b).hexdigest()
def once(p,b):
 p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.exists():
  if p.read_bytes()!=b:raise RuntimeError('RETAINED_INPUT_CHANGED '+str(p))
  return
 with p.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
base=Path('/workspace/scratch/33e6fc23d61c/scf_engineering/session-recovery-20261012/local-object-receiving')
expected='80bc251619f969166dd39f60290b0450663fbf54ab2dc037a2635dbfb921c19a'
archive_path=os.environ.get('SCF_RECOVERY_ORIGINAL_ARCHIVE')
selected=[];archive_identity=None
if archive_path:
 original=Path(archive_path)
 if original.is_symlink() or not original.is_file():raise RuntimeError('ORIGINAL_ARCHIVE_REGULAR_FILE_REQUIRED')
 archive=original.read_bytes()
 if len(archive)!=291120 or sha(archive)!='33aad8127ff99514ed990607fea1e0ab908da3a6788029708cccc48239f03957':raise RuntimeError('COMPLETE_ORIGINAL_A8E_ARCHIVE_CHANGED')
 archive_identity={'path':str(original),'bytes':len(archive),'sha256':sha(archive)}
 with zipfile.ZipFile(original) as z:
  infos=z.infolist()
  if len(infos)!=102 or sum(i.file_size for i in infos)>33554432:raise RuntimeError('ORIGINAL_ARCHIVE_MEMBER_COVERAGE_CHANGED')
  names=set()
  for item in infos:
   name=item.filename
   if name in names or name.startswith('/') or '\\' in name or '\x00' in name or any(p in ('','.', '..') for p in name.rstrip('/').split('/')):raise RuntimeError('UNSAFE_ORIGINAL_ARCHIVE_MEMBER')
   names.add(name)
   mode=(item.external_attr>>16)&65535
   if stat.S_ISLNK(mode) or item.flag_bits&1 or item.file_size>16777216:raise RuntimeError('UNSAFE_ORIGINAL_ARCHIVE_ENTRY')
  candidates=[]
  for item in infos:
   if item.filename.endswith('state/sessions/events/session.json') and item.file_size<=2097152:
    raw=z.read(item)
    try:native=json.loads(raw)
    except (ValueError,UnicodeError):continue
    if native.get('sessionId')=='a8e6646c-a8ff-4545-9399-362f3e831bb4':candidates.append((item.filename,raw,native))
  if len(candidates)!=1:raise RuntimeError('ONE_COMPLETE_ORIGINAL_SESSION_REQUIRED')
  session_member,raw,native=candidates[0]
  prefix=session_member[:-len('state/sessions/events/session.json')]
  csv_member=prefix+'state/events.csv';data=z.read(csv_member)
  for name,value in [('policy.json',native['config']['operator']['policy']),('signer.mjs',native['config']['signerModule'])]:
   p=Path(value)
   if not p.is_absolute() or base not in p.parents:raise RuntimeError('ORIGINAL_OPERATOR_SOURCE_SCOPE')
   member=prefix+p.relative_to(base).as_posix();body=z.read(member)
   once(root/'input'/name,body);selected.append({'originalPath':str(p),'archiveMember':member,'bytes':len(body),'sha256':sha(body)})
  archive_identity.update({'sessionMember':session_member,'csvMember':csv_member})
 once(root/'input/original-object-recovery.zip',archive)
 source_csv={'archiveMember':csv_member,'bytes':len(data),'sha256':sha(data)}
else:
 session=base/'state/sessions/events';raw=(session/'session.json').read_bytes();native=json.loads(raw)
 data=(base/'state/events.csv').read_bytes()
 source_csv={'path':str(base/'state/events.csv'),'bytes':len(data),'sha256':sha(data)}
 for name,value in [('policy.json',native['config']['operator']['policy']),('signer.mjs',native['config']['signerModule'])]:
  p=Path(value)
  if base not in p.parents or p.is_symlink() or not p.is_file():raise RuntimeError('ORIGINAL_OPERATOR_SOURCE_SCOPE')
  body=p.read_bytes();once(root/'input'/name,body);selected.append({'path':str(p),'bytes':len(body),'sha256':sha(body)})
if native['sessionId']!='a8e6646c-a8ff-4545-9399-362f3e831bb4' or native['bytes']!=267 or native['expectedSha256']!=expected:raise RuntimeError('ORIGINAL_OBJECT_SOURCE_CHANGED')
if len(data)!=267 or sha(data)!=expected:raise RuntimeError('ORIGINAL_267_BYTE_DATA_CHANGED')
once(root/'input/original-events.csv',data)
once(root/'records/original-source.json',(json.dumps({'schema':'stellar-forge.original-local-object-source.v1','sessionId':native['sessionId'],'sessionJsonSha256':sha(raw),'sourceCsv':source_csv,'sourceArchive':archive_identity,'operatorSources':selected},indent=2)+'\n').encode())
private=root/'private';private.mkdir(exist_ok=True,mode=0o700)
password=private/'recovery-passphrase.txt'
if not password.exists():once(password,(secrets.token_urlsafe(48)+'\n').encode())
cert=private/'server-cert.pem';key=private/'server-key.pem'
if not cert.exists() or not key.exists():
 if cert.exists() or key.exists():raise RuntimeError('PARTIAL_REFERENCE_TLS_INPUT')
 exe=shutil.which('openssl')
 if not exe:raise RuntimeError('ORIGINAL_OPENSSL_RUNTIME_NOT_AVAILABLE')
 r=subprocess.run([exe,'req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=received-export.example','-addext','subjectAltName=DNS:received-export.example','-keyout',str(key),'-out',str(cert)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
 if r.returncode:raise RuntimeError('REFERENCE_TLS_INPUT_FAILED '+r.stderr.decode(errors='replace')[-1000:])
os.environ['NODE_EXTRA_CA_CERTS']=str(cert)
OWNER_OUT({'state':'NATIVE_INPUT_READY','root':str(root),'originalSessionId':native['sessionId'],'csvBytes':267,'csvSha256':expected,'sourceSessionUntouched':True,'sourceArchive':archive_identity})
skill=Path('/root/.codex/skills/remote-skills');view={'directory':str(skill),'isDirectory':skill.is_dir()}
if skill.is_dir():
 for label,args in [('worktree',['rev-parse','--is-inside-work-tree']),('branch',['symbolic-ref','--short','HEAD'])]:
  r=subprocess.run(['git','-C',str(skill),*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
  view[label]={'returncode':r.returncode,'stdout':r.stdout.decode().strip(),'stderr':r.stderr.decode().strip()[:300]}
OWNER_OUT({'state':'EXISTING_SKILL_CHECKOUT',**view})
