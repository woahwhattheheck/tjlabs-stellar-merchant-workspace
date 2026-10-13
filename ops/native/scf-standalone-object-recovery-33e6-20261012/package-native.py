from pathlib import Path
import os,sys,json,hashlib,zipfile,uuid,shutil,stat
root=OWNER_ROOT
result_path=root/'records/customer-result.json'
result=json.loads(result_path.read_bytes())
if result.get('state')!='COMPLETE' or result.get('operationId')!='SCF-STANDALONE-OBJECT-RECOVERY-33E6-20261012':raise RuntimeError('COMPLETE_ORIGINAL_NATIVE_RESULT_REQUIRED')
def identity(p):
 h=hashlib.sha256();n=0
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b);n+=len(b)
 return {'bytes':n,'sha256':h.hexdigest()}
def sync_directory(p):
 fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
 try:os.fsync(fd)
 finally:os.close(fd)
def write(p,v,*,reuse=False):
 b=(json.dumps(v,indent=2,ensure_ascii=False)+'\n').encode()
 p.parent.mkdir(exist_ok=True,parents=True,mode=0o700)
 if p.exists() or p.is_symlink():
  if not reuse or p.is_symlink() or not p.is_file() or p.read_bytes()!=b:raise RuntimeError('RETAINED_PACKAGE_RECORD_CHANGED '+str(p))
  return {'path':str(p),**identity(p)}
 temporary=p.with_name(p.name+'.preparing-'+uuid.uuid4().hex)
 try:
  with temporary.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
  os.link(temporary,p)
  sync_directory(p.parent)
 finally:
  if temporary.exists():temporary.unlink()
 return {'path':str(p),**identity(p)}
guide=root/'RECEIVING_RESULT.md'
if not guide.exists():
 guide.write_text("""# Standalone Object session recovery: completed native receiving

This complete native acceptance package contains the exact PR787 source selection, the saved original 267-byte CSV, its new native free ObjectSession, the first quiesced state, the authenticated SF101 encrypted backup, the restored state with the later native assembly, and every original result.

The new session is a local reference receiving from the retained original CSV. It is distinct from the archived f269 session and the previously received a8 session; those original inputs were not modified. The native buyer made one actual local HTTPS GET through the configured original explicit CONNECT transport. Native accounting reports NO_PAYMENT_REQUIRED and the configured ledger remained absent.

Use records/customer-result.json for the actual session, record SHA and canonical paths. records/source-manifest.json binds every selected application source file to its original Git blob. The installed ObjectSessionRecovery SDK invokes the original object-cli.mjs commands. The existing shared SF88/SF101 engine owns capture, authentication, publication and native reopen.

The original native session directory was moved only after complete verification, into original-quiesced-state. Restore published to that session's original canonical state root. A later native assembly was then created; reopening the same backup retained every current state file unchanged. The complete before/after inventories and native assembly receipts are included.

The generated reference-only recovery passphrase is in acceptance-inputs/recovery-passphrase.txt. This acceptance archive also contains the complete unencrypted reference state and CSV, so it is not a secret-bearing production backup. For operational backups, follow application/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/OBJECT_SESSION_RECOVERY.md and retain the separate passphrase in private operator custody.

The host Python and Node executables are runtime inputs, not bundled binaries. All selected JavaScript modules for this free-session journey use the original Node runtime and built-in modules; no replacement payment ledger, buyer engine or recovery cryptography is included.
""",encoding='utf8')
members=[]
for top in ['application','input','reference-state','original-quiesced-state','object-session-backup','records']:
 for p in sorted((root/top).rglob('*')):
  if p.is_file():
   if p.is_symlink() or p.stat().st_nlink!=1:raise RuntimeError('UNSAFE_PACKAGE_MEMBER')
   members.append((p.relative_to(root).as_posix(),p))
for name in ['native-acceptance.mjs','prepare-native.py','package-native.py','RECEIVING_RESULT.md','source-input.json.gz','source-receiving.py']:
 p=root/name
 if p.exists():members.append((name,p))
members.append(('acceptance-inputs/recovery-passphrase.txt',root/'private/recovery-passphrase.txt'))
member_map=[{'path':name,**identity(p)} for name,p in sorted(members)]
manifest={'schema':'stellar-forge.standalone-object-recovery-package.v1','sourceRepository':'woahwhattheheck/tjlabs-stellar-merchant-workspace','sourceCommit':'b09765c47a6e71b552bfc7b38958d7b1b9750678',
 'operationId':result['operationId'],'customerResult':identity(result_path),'files':member_map}
mp=root/'PACKAGE_MANIFEST.json';write(mp,manifest,reuse=True);members.append(('PACKAGE_MANIFEST.json',mp))
delivery=root/'delivery';delivery.mkdir(exist_ok=True,mode=0o700)
archive=delivery/'Standalone_Object_SF101_Recovery_20261012.zip'
expected_members={row['path']:{'bytes':row['bytes'],'sha256':row['sha256']} for row in member_map}
expected_members['PACKAGE_MANIFEST.json']=identity(mp)
if len(expected_members)!=len(members):raise RuntimeError('PACKAGE_MEMBER_NAME_COLLISION')
def verify_archive(p):
 if p.is_symlink() or not p.is_file():raise RuntimeError('PACKAGE_REGULAR_FILE_REQUIRED')
 with zipfile.ZipFile(p) as z:
  infos=z.infolist()
  if len(infos)!=len(expected_members) or {i.filename for i in infos}!=set(expected_members):raise RuntimeError('PACKAGE_MEMBER_COVERAGE_CHANGED')
  if z.testzip() is not None:raise RuntimeError('PACKAGE_CRC_FAILED')
  for name,want in expected_members.items():
   b=z.read(name)
   if len(b)!=want['bytes'] or hashlib.sha256(b).hexdigest()!=want['sha256']:raise RuntimeError('PACKAGE_MEMBER_CHANGED')
 return identity(p)
if archive.exists() or archive.is_symlink():
 verify_archive(archive)
else:
 partial=delivery/(archive.name+'.partial-'+identity(mp)['sha256'])
 if partial.exists() or partial.is_symlink():
  if partial.is_symlink() or not partial.is_file():raise RuntimeError('PACKAGE_PARTIAL_REGULAR_FILE_REQUIRED')
  try:verify_archive(partial)
  except (zipfile.BadZipFile,RuntimeError,EOFError,KeyError) as exc:
   prior=partial.with_name(partial.name+'.incomplete-'+uuid.uuid4().hex)
   partial.rename(prior);sync_directory(delivery)
   OWNER_OUT({'state':'INCOMPLETE_PACKAGE_RETAINED','path':str(prior),'manifest':identity(mp),'reason':type(exc).__name__+': '+str(exc)})
 if not partial.exists():
  with zipfile.ZipFile(partial,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for name,p in sorted(members):
    body=p.read_bytes();want=expected_members[name]
    if len(body)!=want['bytes'] or hashlib.sha256(body).hexdigest()!=want['sha256']:raise RuntimeError('PACKAGE_SOURCE_CHANGED '+name)
    info=zipfile.ZipInfo(name,(2026,10,12,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=(0o100600<<16)
    z.writestr(info,body)
  with partial.open('rb') as f:os.fsync(f.fileno())
 verify_archive(partial)
 try:os.link(partial,archive)
 except FileExistsError:
  if verify_archive(archive)!=identity(partial):raise RuntimeError('PACKAGE_PUBLICATION_CONFLICT')
 sync_directory(delivery);partial.unlink();sync_directory(delivery)
package={'path':str(archive),**verify_archive(archive),'members':len(members),'manifest':identity(mp)}
persistent=Path(os.environ.get('SCF_RECOVERY_DELIVERY_DIRECTORY',str(root/'completed-delivery')))
try:
 persistent.mkdir(parents=True,exist_ok=True,mode=0o700)
 target=persistent/archive.name
 if target.exists() or target.is_symlink():
  if target.is_symlink() or not target.is_file() or identity(target)!=identity(archive):raise RuntimeError('PERSISTENT_PACKAGE_CONFLICT')
 else:
  temporary=target.with_name(target.name+'.preparing-'+uuid.uuid4().hex);owned=None
  try:
   with archive.open('rb') as src,temporary.open('xb') as dst:
    st=os.fstat(dst.fileno());owned=(st.st_dev,st.st_ino)
    shutil.copyfileobj(src,dst,1024*1024);dst.flush();os.fsync(dst.fileno())
   if identity(temporary)!=identity(archive):raise RuntimeError('PERSISTENT_COPY_MISMATCH')
   os.link(temporary,target);sync_directory(persistent)
  finally:
   if owned is not None:
    try:
     st=temporary.lstat()
     if (st.st_dev,st.st_ino)==owned and stat.S_ISREG(st.st_mode):temporary.unlink()
    except FileNotFoundError:pass
 if identity(target)!=identity(archive):raise RuntimeError('PERSISTENT_COPY_MISMATCH')
 archive=target;package['path']=str(archive);package['persistent']=True
except OSError as exc:
 package['persistent']=False;package['persistentError']=type(exc).__name__+': '+str(exc)
journal=root/'library-calls';journal.mkdir(exist_ok=True,mode=0o700)
if any(journal.iterdir()):raise RuntimeError('ORIGINAL_LIBRARY_DISPATCH_REQUIRES_RECONCILIATION')
helpers=Path(os.environ.get('SCF_RECOVERY_LIBRARY_HELPERS','/workspace/scratch/33e6fc23d61c/fleet_infra/recovered-runtime-20261012T2123/library-helpers'))
expected={'library_upload.py':'5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767','library_hosted_apps.py':'97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59','library_file_transfer.py':'5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378'}
for name,h in expected.items():
 if identity(helpers/name)['sha256']!=h:raise RuntimeError('ORIGINAL_LIBRARY_HELPER_CHANGED '+name)
sys.path.insert(0,str(helpers))
from library_upload import LibraryUploadWorkflow,HostedAppsClient,LibraryFileMaterializer,SignedUrlUploader
class RecordingHostedAppsClient:
 def __init__(self,inner):self.inner=inner
 def __getattr__(self,name):return getattr(self.inner,name)
 def call_tool(self,*args,**kwargs):
  call=uuid.uuid4().hex
  write(journal/(call+'-request.private.json'),{'state':'INVOKING','args':args,'kwargs':kwargs,'package':package})
  try:
   returned=self.inner.call_tool(*args,**kwargs)
   write(journal/(call+'-response.private.json'),{'state':'RETURNED','result':returned})
   return returned
  except BaseException as exc:
   write(journal/(call+'-uncertain.private.json'),{'state':'OUTCOME_UNCERTAIN','exception':type(exc).__name__,'message':str(exc)})
   raise
write(root/'package-dispatch.json',package,reuse=True)
OWNER_OUT({'state':'NATIVE_PACKAGE_VERIFIED','package':package})
returned=LibraryUploadWorkflow(apps_client=RecordingHostedAppsClient(HostedAppsClient()),materializer=LibraryFileMaterializer(),uploader=SignedUrlUploader(),state_parent=root).run({'uploads':[{'local_path':str(archive),'purpose':'create_library_file','library_artifact_type':'other'}]})
write(root/'library-result.private.json',returned)
items=returned.get('results') if isinstance(returned,dict) else None
if not isinstance(items,list) or len(items)!=1:raise RuntimeError('LIBRARY_ORDERED_RESULT_REQUIRED')
item=items[0]
if item.get('status')!='succeeded' or item.get('local_path')!=str(archive) or item.get('purpose')!='create_library_file' or not item.get('file_id') or not item.get('library_file_id'):raise RuntimeError('LIBRARY_SAVE_NOT_COMPLETE')
version=item.get('current_version_number')
if version is not None and (type(version)is not int or version<0):raise RuntimeError('LIBRARY_VERSION_INVALID')
delivery_result={'schema':'stellar-forge.standalone-object-recovery-delivery.v1','state':'COMPLETE','operationId':result['operationId'],'package':package,
 'nativeResult':{'path':str(result_path),**identity(result_path)},'library':{k:item[k] for k in ['file_id','library_file_id','current_version_number','file_name','local_metadata_applied'] if k in item}}
write(root/'delivery-result.json',delivery_result)
try:
 write(persistent/'customer-result.json',result)
 write(persistent/'delivery-result.json',delivery_result)
 write(persistent/'package-manifest.json',manifest)
 shutil.copytree(journal,persistent/'library-calls',dirs_exist_ok=False)
except OSError as exc:delivery_result['smallPersistentReceiptError']=type(exc).__name__+': '+str(exc)
OWNER_OUT({'state':'NATIVE_DELIVERY_COMPLETE','result':result,'delivery':delivery_result})
