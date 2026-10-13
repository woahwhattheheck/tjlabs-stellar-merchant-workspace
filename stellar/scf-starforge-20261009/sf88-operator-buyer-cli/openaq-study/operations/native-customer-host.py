import os,sys,json,base64,gzip,hashlib,pathlib,subprocess,shutil,time,zipfile,signal,resource,stat,re
C=json.loads(gzip.decompress(base64.b64decode(sys.argv[1])))
prepared=pathlib.Path(C['preparedRoot']);source=prepared/'source';root=pathlib.Path(C['runRoot']);outputs=root/'outputs'
sha=lambda b:hashlib.sha256(b).hexdigest()
def emit(phase,**data):print(json.dumps({'phase':phase,**data}),flush=True)
def private(p):
 p.mkdir(parents=True,exist_ok=True,mode=0o700)
 if p.is_symlink() or p.resolve()!=p:raise RuntimeError('Original private directory cannot contain symlink components')
 p.chmod(0o700);return p
def target(base,name):
 p=pathlib.PurePosixPath(name)
 if p.is_absolute() or '..' in p.parts:raise RuntimeError('Invalid original relative path')
 return base.joinpath(*p.parts)
def put(p,raw):
 private(p.parent)
 if p.exists():
  if p.read_bytes()!=raw:raise RuntimeError('Retained original input changed: '+str(p))
 else:
  with p.open('xb') as f:f.write(raw)
  p.chmod(0o600)
def restore_file(base,name,raw):
 destination=target(base,name);private(base);parent=base
 for part in pathlib.PurePosixPath(name).parts[:-1]:
  parent=parent/part;private(parent)
 put(destination,raw)
def write_json(p,v):
 private(p.parent);q=p.with_name(p.name+'.pending')
 q.write_text(json.dumps(v,indent=2)+'\n');q.chmod(0o600);q.replace(p)
private(root);private(outputs);private(root/'temporary')
record={'schema':C['schema'],'operationId':C['operationId'],'startedAt':time.time(),'sourceFiles':len(C['files']),
 'sourceManifestSha256':sha(json.dumps(C['files'],sort_keys=True,separators=(',',':')).encode()),
 'driverSha256':C['driver']['sha256'],'driverBytes':C['driver']['bytes'],
 'bootId':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'providerRequests':0,'payments':0}
process=None;reserve=root/'retained-output.reserve';saved=None
def terminate_owned():
 global process
 if process is None or process.poll() is not None:return
 try:os.killpg(process.pid,signal.SIGTERM)
 except ProcessLookupError:return
 try:process.wait(timeout=25)
 except subprocess.TimeoutExpired:
  os.killpg(process.pid,signal.SIGKILL);process.wait()
def interrupted(signum,frame):raise KeyboardInterrupt('Owned native host signal '+str(signum))
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
sys.path.insert(0,str(prepared/'helpers'))
from library_upload import LibraryUploadWorkflow,LibraryFileMaterializer,SignedUrlUploader
from library_hosted_apps import HostedAppsClient
from library_file_transfer import LibraryFileTransfer
os.environ['AZCOPY_CONCURRENCY_VALUE']='1'
try:
 resume=C.get('resume')
 if resume:
  recovery=private(root/'retained-recovery')
  recovered={}
  for item in resume['artifacts']:
   transfer=item['transfer'];dest=recovery/transfer['file_name']
   if not dest.exists():LibraryFileMaterializer().materialize(LibraryFileTransfer.parse(transfer),dest)
   raw=dest.read_bytes()
   if len(raw)!=item['bytes'] or sha(raw)!=item['sha256']:raise RuntimeError('Original saved recovery edition changed: '+item['kind'])
   recovered[item['kind']]=dest
  with zipfile.ZipFile(recovered['delivery']) as original_zip:original_record=json.loads(original_zip.read('operation/native-host.json'))
  if original_record.get('operationId')!=C['operationId'] or original_record.get('driverSha256')!=resume['previousDriverSha256']:raise RuntimeError('Original saved native lineage changed')
  original_app=original_record.get('application',{})
  if original_record.get('state')!='ERROR' or original_app.get('ownedResourcesClosed') is not True:raise RuntimeError('Original native outcome requires lifecycle reconciliation')
  if original_app.get('paidHttpRequests')!=0 or original_app.get('payments') or original_app.get('approvals'):raise RuntimeError('Original native payment outcome requires its retained Buyer recovery')
  with zipfile.ZipFile(recovered['private']) as z:
   descriptor=json.loads(z.read('PRIVATE_RECOVERY.json'))
   if descriptor.get('operationId')!=C['operationId'] or descriptor.get('nativeDirectory')!=str(root) or descriptor.get('originalProjectDirectory')!=C['originalProject']:raise RuntimeError('Original saved wallet/study custody changed')
   for name in z.namelist():
    if stat.S_ISLNK(z.getinfo(name).external_attr>>16):raise RuntimeError('Original recovery symlink refused')
    if name.endswith('/'):
     if name.startswith('native/'):base,tail=root,name[len('native/'):].rstrip('/')
     elif name.startswith('original-project/'):base,tail=pathlib.Path(C['originalProject']),name[len('original-project/'):].rstrip('/')
     else:continue
     target(base,tail);private(base);directory=base
     for part in pathlib.PurePosixPath(tail).parts:directory=private(directory/part)
     continue
    if name.startswith('native/'):restore_file(root,name[len('native/'):],z.read(name))
    elif name.startswith('original-project/'):restore_file(pathlib.Path(C['originalProject']),name[len('original-project/'):],z.read(name))
  with zipfile.ZipFile(recovered['delivery']) as z:
   for name in z.namelist():
    if name.startswith('operation/') and not name.endswith('/'):
     restore_file(outputs,name[len('operation/'):],z.read(name))
  for expected in resume['accounts']:
   wallet=json.loads((root/'private'/expected['role']/'wallet.json').read_bytes())
   if any(wallet.get(k)!=v for k,v in {'operationId':C['operationId'],'role':expected['role'],'network':'stellar:testnet','address':expected['address']}.items()):raise RuntimeError('Original funded wallet identity changed')
  history=private(root/'attempts'/resume['id'])
  for name in ['native-host.json','result.json','native.stdout.txt','native.stderr.txt']:
   p=outputs/name
   if p.exists():put(history/name,p.read_bytes())
  write_json(history/'continuation.json',{'operationId':C['operationId'],'previousDriverSha256':resume['previousDriverSha256'],'driverSha256':C['driver']['sha256'],'previousSourceCanvas':resume['previousSourceCanvas'],'artifactEditions':[{k:item['transfer'].get(k) for k in ['file_id','library_file_id','file_name','current_version_number']} for item in resume['artifacts']],'accounts':resume['accounts'],'reason':resume['reason']})
  record['continuation']={'id':resume['id'],'previousDriverSha256':resume['previousDriverSha256'],'previousFinishedAt':original_record.get('finishedAt'),'originalAccountsReconciled':True}
  write_json(root/'original-account-reconciliation.json',resume['accountReconciliation'])
 prior_path=outputs/'native-host.json'
 if prior_path.exists():
  prior=json.loads(prior_path.read_bytes())
  if prior.get('state')=='COMPLETE':
   if prior.get('operationId')!=C['operationId'] or prior.get('driverSha256')!=C['driver']['sha256']:raise RuntimeError('Original completed native operation changed')
   if (root/'library-save.json').exists():
    record=prior;saved=json.loads((root/'library-save.json').read_bytes());emit('REOPEN_ORIGINAL_SAVED_NATIVE_CUSTOMER',record=prior,saved=[{k:x.get(k) for k in ['status','file_id','library_file_id','file_name']} for x in saved.get('results',[])]);sys.exit(0)
 if not (prepared/'source-runtime-reconciliation.json').exists():raise RuntimeError('Original SDK receiving result missing')
 ready=json.loads((prepared/'source-runtime-reconciliation.json').read_bytes())
 if ready.get('state')!='SOURCE_READY':raise RuntimeError('Original SDK receiving not complete')
 for item in C['files']:
  p=target(source,item['path']);raw=p.read_bytes()
  if len(raw)!=item['bytes'] or sha(raw)!=item['sha256']:raise RuntimeError('Original runtime source changed: '+item['path'])
 record['sourceRuntime']=ready
 if not pathlib.Path(C['chrome']).is_file():raise RuntimeError('Original retained browser executable missing')
 archive=prepared/C['originalArchive']['file'];raw=archive.read_bytes()
 if len(raw)!=C['originalArchive']['bytes'] or sha(raw)!=C['originalArchive']['sha256']:raise RuntimeError('Original complete merchant archive changed')
 project=pathlib.Path(C['originalProject'])
 if not project.exists():
  private(project)
  with zipfile.ZipFile(archive) as z:
   for name in z.namelist():
    if not name.startswith('original-project/') or name.endswith('/'):continue
    tail=name[len('original-project/'):]
    info=z.getinfo(name)
    if stat.S_ISLNK(info.external_attr>>16):raise RuntimeError('Original project archive symlink refused')
    restore_file(project,tail,z.read(name))
  write_json(root/'original-project-recovery.json',{'archiveSha256':C['originalArchive']['sha256'],'directory':str(project),'operationId':C['operationId']})
 private(project)
 restored_roots=[]
 for name in ['captures','reviews','reports','operations','studies','publications','exports','imports']:
  directory=private(project/name);restored_roots.append({'path':str(directory),'mode':oct(stat.S_IMODE(directory.stat().st_mode))})
 record['originalProjectPrivateDirectories']=restored_roots
 original_workspace=json.loads((project/'workspace.json').read_bytes())
 if original_workspace.get('id')!='fc9c248b-3a8e-45b0-aacf-3a4f01620f52':raise RuntimeError('Original project identity changed')
 driver=root/'operate.mjs';raw=C['driver']['content'].encode()
 if len(raw)!=C['driver']['bytes'] or sha(raw)!=C['driver']['sha256']:raise RuntimeError('Original native driver source changed')
 if driver.exists() and driver.read_bytes()!=raw:
  if not resume or sha(driver.read_bytes())!=resume['previousDriverSha256']:raise RuntimeError('Unreviewed native driver amendment')
  put(root/'attempts'/resume['id']/'operate.previous.mjs',driver.read_bytes())
  pending=driver.with_name('operate.reviewed.pending');pending.write_bytes(raw);pending.chmod(0o600);pending.replace(driver)
 else:put(driver,raw)
 put(root/'source-manifest.json',(json.dumps({'operationId':C['operationId'],'files':C['files']},indent=2)+'\n').encode())
 tls=private(root/'tls')
 if not (tls/'key.pem').exists() and not (tls/'cert.pem').exists():
  cert=subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(tls/'key.pem'),'-out',str(tls/'cert.pem'),'-days','2',
   '-subj','/CN=openaq-merchant.example.com','-addext','subjectAltName=DNS:openaq-merchant.example.com'],capture_output=True,timeout=30)
  if cert.returncode:raise RuntimeError('Owned merchant TLS setup failed')
  (tls/'key.pem').chmod(0o600);(tls/'cert.pem').chmod(0o600)
 if not (tls/'key.pem').is_file() or not (tls/'cert.pem').is_file():raise RuntimeError('Original TLS custody is incomplete')
 node=os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
 env={**os.environ,'PATH':str(pathlib.Path(node).parent)+os.pathsep+os.environ.get('PATH',''),
  'NODE_EXTRA_CA_CERTS':str(tls/'cert.pem'),'SF36_OBSERVER_USE_SYSTEM_CA':'1',
  'NODE_OPTIONS':(os.environ.get('NODE_OPTIONS','')+' --max-old-space-size=256').strip(),
  'TMPDIR':str(root/'temporary'),'PYTHONDONTWRITEBYTECODE':'1','SF_FRICTIONLESS_PYTHON':sys.executable}
 no_proxy=set(filter(None,(env.get('NO_PROXY') or env.get('no_proxy') or '').split(',')));no_proxy.update(['127.0.0.1','localhost','::1'])
 env['NO_PROXY']=','.join(sorted(no_proxy));env['no_proxy']=env['NO_PROXY']
 parsed=subprocess.run([node,'--check',str(driver)],capture_output=True,text=True,env=env,timeout=30)
 if parsed.returncode:raise RuntimeError('Original native driver parse failed: '+parsed.stderr[-2000:])
 with reserve.open('wb') as f:os.posix_fallocate(f.fileno(),0,C['retainedOutputReserveBytes'])
 reserve.chmod(0o600)
 record['tlsCertificateSha256']=sha((tls/'cert.pem').read_bytes());record['nodeVersion']=subprocess.run([node,'--version'],capture_output=True,text=True,timeout=10).stdout.strip()
 write_json(outputs/'native-host.json',record)
 emit('ORIGINAL_NATIVE_CUSTOMER_READY',operationId=C['operationId'],sourceFiles=len(C['files']),driverSha256=C['driver']['sha256'],retainedOutputReserveBytes=C['retainedOutputReserveBytes'])
 began=time.monotonic()
 with (outputs/'native.stdout.txt').open('ab') as stdout,(outputs/'native.stderr.txt').open('ab') as stderr:
  process=subprocess.Popen([node,'--use-env-proxy','--use-system-ca',str(driver),str(root),str(source),sys.executable,C['chrome']],env=env,stdout=stdout,stderr=stderr,start_new_session=True)
  record['nativePid']=process.pid;write_json(outputs/'native-host.json',record);emit('ORIGINAL_NATIVE_CUSTOMER_STARTED',pid=process.pid,operationId=C['operationId'])
  offset=(outputs/'native.stdout.txt').stat().st_size
  while process.poll() is None:
   if time.monotonic()-began>C['maxSeconds']:record['timedOut']=True;terminate_owned();break
   time.sleep(.3)
   raw=(outputs/'native.stdout.txt').read_bytes()
   if len(raw)>offset:
    fresh=raw[offset:];last=fresh.rfind(b'\n')
    if last>=0:
     for line in fresh[:last].splitlines():
      try:
       v=json.loads(line)
       if isinstance(v,dict) and isinstance(v.get('phase'),str):emit('APPLICATION_PHASE',**{k:v[k] for k in ['operationId','state','rows','pages','snapshot','network','asset','consoleId','handoffSha256','approvedPages','providerRequests','paidHttpRequests','unsignedHttpRequests'] if k in v},applicationPhase=v['phase'])
      except (ValueError,TypeError):pass
     offset+=last+1
  process.wait()
 record['exitCode']=process.returncode;record['durationSeconds']=round(time.monotonic()-began,6)
 record['largestIndividualChildPeakRssBytes']=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss*1024
 result=outputs/'result.json'
 if result.is_file():record['application']=json.loads(result.read_bytes())
 app=record.get('application',{})
 record['state']='COMPLETE' if process.returncode==0 and app.get('state')=='COMPLETE' else 'ERROR'
 record['providerRequests']=app.get('providerRequests',0);record['paidHttpRequests']=app.get('paidHttpRequests',0);record['payments']=len(app.get('payments',[]))
except SystemExit:raise
except BaseException as error:
 record['state']='ERROR';record['error']={'type':type(error).__name__,'message':re.sub(r'\bS[A-Z2-7]{55}\b','[private-key]',str(error))[-2500:]}
finally:
 terminate_owned()
 if reserve.exists():reserve.unlink()
 if saved is None:record['finishedAt']=time.time()
 result=outputs/'result.json'
 if result.is_file():
  record['application']=json.loads(result.read_bytes());record['providerRequests']=record['application'].get('providerRequests',0)
  record['paidHttpRequests']=record['application'].get('paidHttpRequests',0);record['payments']=len(record['application'].get('payments',[]))
 write_json(outputs/'native-host.json',record)
 if saved is None:
  public=root/'OpenAQ_Native_Customer_Delivery_20261012.zip'
  with zipfile.ZipFile(public,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for p in sorted(outputs.rglob('*')):
    if p.is_file() and not p.is_symlink() and p.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:z.write(p,'operation/'+p.relative_to(outputs).as_posix())
   for p in sorted((root/'attempts').rglob('*')) if (root/'attempts').is_dir() else []:
    if p.is_file() and not p.is_symlink() and p.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:z.write(p,'attempts/'+p.relative_to(root/'attempts').as_posix())
   if (root/'original-account-reconciliation.json').is_file():z.write(root/'original-account-reconciliation.json','original-account-reconciliation.json')
   app=record.get('application',{});delivery=app.get('delivery',{}).get('directory')
   if delivery:
    selected=pathlib.Path(delivery)
    if not selected.is_relative_to(root):raise RuntimeError('Original customer delivery escaped owned operation')
    for p in sorted(selected.rglob('*')):
     if p.is_file() and not p.is_symlink():z.write(p,'customer-delivery/'+p.relative_to(selected).as_posix())
   z.write(root/'source-manifest.json','source-manifest.json') if (root/'source-manifest.json').is_file() else None
  public.chmod(0o600)
  custody=root/'OpenAQ_Native_Customer_Private_Recovery_20261012.zip'
  with zipfile.ZipFile(custody,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for name in ['private','customer-console','independent-receiver','native-handoff','tls']:
    base=root/name
    if not base.is_dir():continue
    for p in sorted(base.rglob('*')):
     if p.is_dir() and not p.is_symlink():z.write(p,'native/'+name+'/'+p.relative_to(base).as_posix()+'/')
     elif p.is_file() and not p.is_symlink() and p.name not in ['connection.json','lease.lock']:z.write(p,'native/'+name+'/'+p.relative_to(base).as_posix())
   project=pathlib.Path(C['originalProject'])
   if project.is_dir():
    for p in sorted(project.rglob('*')):
     if p.is_dir() and not p.is_symlink():z.write(p,'original-project/'+p.relative_to(project).as_posix()+'/')
     elif p.is_file() and not p.is_symlink():z.write(p,'original-project/'+p.relative_to(project).as_posix())
   for name in ['native-request.json','ports.json','facilitator-profile.json','reviewed-request.json','source-manifest.json','original-project-recovery.json']:
    p=root/name
    if p.is_file():z.write(p,'native/'+name)
   z.writestr('PRIVATE_RECOVERY.json',json.dumps({'operationId':C['operationId'],'private':True,'nativeDirectory':str(root),'originalProjectDirectory':C['originalProject'],'sourceDirectory':str(source),'purpose':'Original operator testnet wallet, approval journal and native customer recovery. Preserve these original identities; this custody archive is separate from the customer delivery.'},indent=2)+'\n')
  custody.chmod(0o600)
  artifacts=[{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes()),'private':p==custody} for p in [public,custody,outputs/'native-host.json']]
  write_json(root/'artifacts.json',artifacts)
  upload_paths=[public,custody,outputs/'native-host.json'];upload_requests=[]
  existing=C.get('outputFiles')
  if existing is not None and len(existing)!=len(upload_paths):raise RuntimeError('Original saved output identity count changed')
  for index,path in enumerate(upload_paths):
   item={'local_path':str(path),'purpose':'create_library_file'}
   if existing is not None:
    target_file=existing[index]
    item.update({'purpose':'replace_library_file','library_file_id':target_file['library_file_id'],'library_file_name':target_file['file_name'],'expected_current_version':target_file['current_version_number'],'version_reason':'Same original native customer operation after retained account reconciliation'})
   upload_requests.append(item)
  saved=LibraryUploadWorkflow(HostedAppsClient(),LibraryFileMaterializer(),SignedUrlUploader(),state_parent=root).run({'uploads':upload_requests})
  write_json(root/'library-save.json',saved);rows=saved.get('results',[])
  if len(rows)!=3 or any(x.get('status')!='succeeded' for x in rows):raise RuntimeError('Original native customer artifact save failed')
  summary={k:record.get(k) for k in ['schema','operationId','state','driverSha256','sourceFiles','continuation','exitCode','durationSeconds','largestIndividualChildPeakRssBytes','providerRequests','paidHttpRequests','payments','error','startedAt','finishedAt']};summary['application']={k:record.get('application',{}).get(k) for k in ['state','operationId','phases','accounts','accountSetup','accountObservations','error','cleanupErrors','ownedResourcesClosed','providerRequests','paidHttpRequests','unsignedHttpRequests','payments','delivery','receiving','accountsAfter','finishedAt']}
  emit('ORIGINAL_NATIVE_CUSTOMER_SAVED',record=summary,artifacts=artifacts,saved=[{k:x.get(k) for k in ['status','file_id','library_file_id','file_name','path','current_version_number']} for x in rows])
if record.get('state')!='COMPLETE':sys.exit(1)
