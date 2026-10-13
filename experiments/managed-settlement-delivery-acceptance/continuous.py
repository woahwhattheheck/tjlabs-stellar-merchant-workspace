#!/usr/bin/env python3
"""MIT. One original managed, direct, installed Applications and rollout receiving sequence."""
import os,sys,json,subprocess,hashlib,zipfile,stat,tempfile,shutil,time,shlex
from pathlib import Path
ROOT=Path(sys.argv[1]).resolve(); OUT=Path(sys.argv[2]).resolve()
NODE=sys.argv[3]; PYTHON=sys.argv[4]; MODULES=sys.argv[5]; CHROME=sys.argv[6]
OPERATION='SCF-MANAGED-SF98-DELIVERY-E49D-20261012'
PRODUCT='e316fc9db6ef67949938b560a36c4700bf38410b'
LIBRARY_HELPER_HASHES={"library_upload.py":"5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767","library_hosted_apps.py":"97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59","library_file_transfer.py":"5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378"}
RESTORE_HELPERS=json.loads("{\"RESTORE.py\":{\"sourcePath\":\"experiments/managed-settlement-delivery-acceptance/restore-continuation.py\",\"gitBlob\":\"af507fff9b11f7e3036c727074a3c2353f232a0c\",\"bytes\":21645,\"sha256\":\"2467272e261a7e9164429e995d607ea0ed6d739af26f69b9dcb462602e9079a9\"},\"RESTORE.md\":{\"sourcePath\":\"experiments/managed-settlement-delivery-acceptance/RESTORING.md\",\"gitBlob\":\"fc0e08781c579de1fe1f931bdae842df990797e5\",\"bytes\":5331,\"sha256\":\"269051d7f3f040685ede363c1f3ddcffd02554587422867c0d772d92c15e742d\"}}")
OUT.mkdir(parents=True,exist_ok=True,mode=0o700)
if OUT.is_symlink() or OUT.stat().st_mode & 0o077:
 raise ValueError('The original receiving output must stay private.')
TMP=OUT/'tmp'; TMP.mkdir(exist_ok=True,mode=0o700)
ENV=os.environ.copy(); ENV.update({'PYTHONDONTWRITEBYTECODE':'1','TMPDIR':str(TMP),'TMP':str(TMP),'TEMP':str(TMP),
'SF98_DELIVERY_SOURCE':str(ROOT),'SF98_DELIVERY_OUTPUT':str(OUT),'SF98_DELIVERY_PYTHON':PYTHON,
'SF98_DELIVERY_NODE_MODULES':MODULES,'SF98_DELIVERY_CHROMIUM':CHROME,
'SINGLE_DELIVERY_SOURCE':str(ROOT/'direct-source'),'SINGLE_DELIVERY_OUTPUT':str(OUT/'single-release-receiving')})
summary={'operation':OPERATION,'managedSource':'525455c816a49de52e729a15f52d4f9adf9deeb6',
'directSource':'263248f386833637ab1cd8caf479904fb655cff6',
'applicationsSource':'0c135a41aa966d70ca38b95d8af5e122a2c9754f',
'applicationsProduct':'8b08a9333af070df0e96b6f09f6612eb07eab1ad',
 'installationPhaseSource':'0c1dc9babe6adecc5d834a0a0afaffc92aa1837a',
'campaignProduct':PRODUCT,'campaignPhaseSource':'f72cbd237aa42d32ec3de6cb9d42b8fd879c0f48','phases':[]}
def emit(value): print(json.dumps(value,separators=(',',':')),flush=True)
def sha(value): return hashlib.sha256(value).hexdigest()
def write_json(path,value):
 path=Path(path); path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 raw=(json.dumps(value,indent=2)+'\n').encode()
 with tempfile.NamedTemporaryFile(dir=path.parent,prefix=path.name+'.',delete=False) as handle:
  temporary=Path(handle.name);os.chmod(temporary,0o600);handle.write(raw);handle.flush();os.fsync(handle.fileno())
 try:
  os.replace(temporary,path)
  descriptor=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
  try: os.fsync(descriptor)
  finally: os.close(descriptor)
 finally:
  if temporary.exists(): temporary.unlink()
def exact_context(path,value):
 path=Path(path)
 if path.exists() or path.is_symlink():
  if path.is_symlink() or not path.is_file() or json.loads(path.read_bytes())!=value:
   raise ValueError('Preserve the same original receiving context: '+str(path))
  return
 write_json(path,value)
def document(path):
 path=Path(path)
 if not path.exists(): return None
 if path.is_symlink() or not path.is_file() or path.stat().st_size>32*1024*1024:
  raise ValueError('Use a bounded original receipt: '+str(path))
 raw=path.read_bytes()
 return {'path':str(path),'sha256':sha(raw),'value':json.loads(raw)}
def compact(record):
 if not record: return None
 value=record['value']
 names=('state','nativeComplete','localComplete','browserComplete','mcpComplete',
        'customerReopenComplete','restorationComplete','reopenComplete','ownedProcessesClosed')
 return {'path':record['path'],'sha256':record['sha256'],**{k:value.get(k) for k in names},
         'milestones':len(value.get('milestones',[])),'error':value.get('error')}
def valid(record,schema,required):
 return bool(record and record['value'].get('schema')==schema
  and record['value'].get('operation')==OPERATION and record['value'].get('state')=='PASS'
  and all(record['value'].get(k) is True for k in required))
def run_phase(name,path,schema,required,command,cwd):
 before=document(path)
 reuse=valid(before,schema,required)
 if before and before['value'].get('operation')!=OPERATION:
  raise ValueError('The retained phase belongs to another operation.')
 result_code=0 if reuse else subprocess.run(command,cwd=cwd,env=ENV).returncode
 record=before if reuse else document(path)
 row={'name':name,'exitCode':result_code,'reusedCompletedPhase':reuse,'receipt':compact(record)}
 summary['phases'].append(row);emit({'phase':name+'-finished',**row})
 if result_code!=0 or not valid(record,schema,required):
  raise RuntimeError('The original '+name+' phase remains incomplete.')
 return record
def require_binding(condition,message):
 if not condition: raise ValueError(message)
def saved_items(payload):
 results=payload.get('results') if isinstance(payload,dict) else None
 if not isinstance(results,list): return None
 allowed=('index','local_path','library_file_id','file_id','id','version_id','version',
          'name','file_name','filename','path','library_path','success','status','error',
          'purpose','local_metadata_applied','current_version_number')
 output=[]
 for index,item in enumerate(results):
  if not isinstance(item,dict): output.append({'index':index,'error':'Unexpected helper result'});continue
  selected={k:item[k] for k in allowed if k in item};selected.setdefault('index',index)
  for wrapper in ('result','file','library_file'):
   nested=item.get(wrapper)
   if isinstance(nested,dict): selected[wrapper]={k:nested[k] for k in allowed if k in nested}
  output.append(selected)
 return output
def persist_outputs(code):
 summary['exitCode']=code
 summary['complete']=code==0 and len(summary['phases'])==4 and all(p.get('exitCode')==0
  and p.get('receipt',{}).get('state')=='PASS' for p in summary['phases'])
 report=OUT/'receiving-summary.json';write_json(report,summary)
 archive=OUT.parent/'merchant-delivery-continuation.zip'
 helper_bodies={}
 for name,entry in RESTORE_HELPERS.items():
  path=ROOT/entry['sourcePath']
  if path.is_symlink() or not path.is_file(): raise ValueError('Use the original selected restore helper: '+str(path))
  raw=path.read_bytes()
  blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
  if len(raw)!=entry['bytes'] or sha(raw)!=entry['sha256'] or blob!=entry['gitBlob']:
   raise ValueError('The selected restore helper changed: '+str(path))
  helper_bodies[name]=raw
 excluded={'tmp','browser-profile','chromium-profile','playwright-profile','node_modules','__pycache__'}
 retained_installation=OUT/'installation-receiving'
 entries=[(OUT,Path('.'),'directory',stat.S_IMODE(OUT.lstat().st_mode))]
 def retain_entry(path):
  observed=path.lstat();mode=stat.S_IMODE(observed.st_mode)
  if stat.S_ISLNK(observed.st_mode):
   if not path.is_relative_to(retained_installation): return
   target=os.readlink(path)
   resolved=(path.parent/target).resolve()
   if not resolved.is_relative_to(retained_installation.resolve()):
    raise ValueError('An installation link escapes its retained phase: '+str(path))
   entries.append((path,path.relative_to(OUT),'symlink',mode));return
  if stat.S_ISDIR(observed.st_mode):
   entries.append((path,path.relative_to(OUT),'directory',mode));return
  if not stat.S_ISREG(observed.st_mode): return
  if not path.is_relative_to(retained_installation) and path.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.pyc'}: return
  entries.append((path,path.relative_to(OUT),'file',mode))
 for current,directories,files in os.walk(OUT,topdown=True,followlinks=False):
  current=Path(current);kept=[]
  for name in sorted(directories):
   path=current/name
   if not path.is_relative_to(retained_installation) and name in excluded: continue
   retain_entry(path)
   if not path.is_symlink(): kept.append(name)
  directories[:]=kept
  for name in sorted(files): retain_entry(current/name)
 entries.sort(key=lambda item:str(item[1]))
 continuation={'format':'merchant-delivery-continuation/v2','operation':OPERATION,
  'originalOutput':str(OUT),'originalSourceRoot':str(ROOT),
  'managedSource':summary['managedSource'],'directSource':summary['directSource'],
  'applicationsSource':summary['applicationsSource'],'applicationsProduct':summary['applicationsProduct'],
  'installationPhaseSource':summary['installationPhaseSource'],
  'campaignProduct':PRODUCT,'campaignPhaseSource':summary['campaignPhaseSource'],
  'originalCampaignSourceRoot':str(OUT.parent/'campaign-source'/'bootstrap'),
  'sourceRetrieval':'Restore exact original Git sources separately before continuing at the same retained absolute paths.',
  'data':'Original local fixture signing values, stores, requests and customer receiving state. The phase-owned installation, dependencies, resources, links and modes are retained; unrelated browser images, profiles and shared dependencies are excluded.',
  'restoration':'Verify entry bytes and hashes, restore all regular files and directories with their retained modes, then restore the recorded internal symbolic links. Preserve the original absolute output paths and original request identities; inspect the selected runtime before continuing.',
  'helpers':RESTORE_HELPERS,'files':[]}
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as output:
  for path,relative,kind,mode in entries:
   name=str(Path('output')/relative)
   info=zipfile.ZipInfo(name+'/' if kind=='directory' else name)
   info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED
   entry={'path':name,'type':kind,'mode':mode}
   if kind=='directory':
    info.external_attr=((stat.S_IFDIR|mode)<<16)|0x10;raw=b''
    output.writestr(info,raw);entry.update(bytes=0,sha256=sha(raw))
   elif kind=='symlink':
    target=os.readlink(path);raw=target.encode('utf-8')
    if not (path.parent/target).resolve().is_relative_to(retained_installation.resolve()):
     raise ValueError('An installation link changed its retained scope: '+str(path))
    info.external_attr=(stat.S_IFLNK|mode)<<16
    output.writestr(info,raw);entry.update(bytes=len(raw),sha256=sha(raw),target=target)
   else:
    info.external_attr=(stat.S_IFREG|mode)<<16
    descriptor=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(descriptor,'rb') as original:
     before=os.fstat(original.fileno())
     if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode)!=mode:
      raise ValueError('An original continuation file changed type or mode: '+str(path))
     digest=hashlib.sha256();size=0
     with output.open(info,'w') as member:
      for chunk in iter(lambda:original.read(1024*1024),b''):
       member.write(chunk);digest.update(chunk);size+=len(chunk)
     after=os.fstat(original.fileno())
     if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns) or size!=before.st_size:
      raise ValueError('An original continuation file changed while being retained: '+str(path))
     entry.update(bytes=size,sha256=digest.hexdigest())
   continuation['files'].append(entry)
  for name,raw in helper_bodies.items():
   info=zipfile.ZipInfo(name);info.create_system=3;info.compress_type=zipfile.ZIP_DEFLATED
   info.external_attr=(stat.S_IFREG|0o600)<<16;output.writestr(info,raw)
  output.writestr('CONTINUATION.json',json.dumps(continuation,indent=2)+'\n')
 os.chmod(archive,0o600)
 with archive.open('rb') as original:
  os.fsync(original.fileno());archive_digest=hashlib.sha256()
  for chunk in iter(lambda:original.read(1024*1024),b''): archive_digest.update(chunk)
 archive_sha256=archive_digest.hexdigest()
 descriptor=os.open(archive.parent,os.O_RDONLY|os.O_DIRECTORY)
 try: os.fsync(descriptor)
 finally: os.close(descriptor)
 restore_command=[PYTHON,str(ROOT/RESTORE_HELPERS['RESTORE.py']['sourcePath']),
  '--archive',str(archive),'--expected-sha256',archive_sha256,'--output',str(OUT)]
 emit({'phase':'saving-receiving-files','archive':str(archive),'bytes':archive.stat().st_size,
  'archiveSha256':archive_sha256,'restoreCommand':shlex.join(restore_command),
  'restoreHelpers':RESTORE_HELPERS,'summary':str(report)})
 # Resolve the current locally available skill, then copy its three unchanged
 # helper bodies into one fresh private directory for this ordered upload.
 skill=Path(ENV.get('DELIVERY_LIBRARY_SKILL',
  '/root/.codex/plugins/cache/openai-curated-remote/openai-library/0.1.62/skills/library/SKILL.md'))
 scripts=skill.parent/'scripts'
 if not skill.is_file(): raise RuntimeError('The current local Library skill is unavailable.')
 fresh=Path(tempfile.mkdtemp(prefix='library-current-',dir=TMP))
 for name,digest in LIBRARY_HELPER_HASHES.items():
  original=scripts/name
  if not original.is_file(): raise RuntimeError('The current Library helper is unavailable: '+name)
  raw=original.read_bytes()
  if sha(raw)!=digest: raise RuntimeError('The current Library helper source changed: '+name)
  destination=fresh/name;destination.write_bytes(raw);os.chmod(destination,0o600)
 request={'uploads':[{'local_path':str(archive),'purpose':'create_library_file','library_artifact_type':'other'},
                     {'local_path':str(report),'purpose':'create_library_file','library_artifact_type':'other'}]}
 upload=subprocess.run([PYTHON,str(fresh/'library_upload.py')],input=json.dumps(request),
  text=True,capture_output=True,env=ENV)
 saved=OUT.parent/'library-upload-result.json'
 write_json(saved,{'exitCode':upload.returncode,'stdout':upload.stdout,'stderr':upload.stderr})
 try: payload=json.loads(upload.stdout)
 except (ValueError,TypeError): payload=None
 items=saved_items(payload)
 emit({'phase':'library-finished','exitCode':upload.returncode,'receipt':str(saved),'results':items,
       'archiveSha256':archive_sha256,'restoreCommand':shlex.join(restore_command),
       'orderedResultsAvailable':items is not None})
 ordered=payload.get('results') if isinstance(payload,dict) else None
 valid_results=isinstance(ordered,list) and len(ordered)==len(request['uploads'])
 if valid_results:
  for expected,result in zip(request['uploads'],ordered):
   if not isinstance(result,dict) or result.get('local_path')!=expected['local_path'] or result.get('purpose')!=expected['purpose']:
    valid_results=False
   elif result.get('status')!='succeeded' or not result.get('library_file_id') or not result.get('file_id'):
    valid_results=False
 if upload.returncode!=0 or items is None or not valid_results:
  raise RuntimeError('The original ordered artifact save needs its retained result reconciled.')
 return items


def require_installation(managed,direct,direct_output):
 donor=ENV.get('DELIVERY_CAMPAIGN_DONOR')
 dependencies=ENV.get('DELIVERY_CAMPAIGN_DEPENDENCIES')
 cache=ENV.get('DELIVERY_INSTALLATION_NPM_CACHE')
 if not donor or not dependencies or not cache:
  raise ValueError('Supply the existing original Git donor, dependency root and populated offline npm cache.')
 source_directory=OUT.parent/'installation-source'
 source_context={'operation':OPERATION,'sourcePin':summary['applicationsProduct'],
  'directory':str(source_directory),'repository':donor,'node':NODE,
  'bootstrapDependencies':dependencies,'offlineSource':False,
  'reuseSources':[str(ROOT/'direct-source'),str(ROOT)]}
 source_context_file=OUT/'installation-source-context.json';exact_context(source_context_file,source_context)
 source_code=subprocess.run([PYTHON,'-B',
  str(ROOT/'experiments/managed-settlement-delivery-acceptance/installation-source.py'),
  str(source_context_file)],cwd=ROOT,env=ENV).returncode
 if source_code: raise RuntimeError('The original selected installation source remains incomplete.')
 source_record=document(source_directory/'source-result.json')
 require_binding(source_record and source_record['value'].get('sourceCommit')==summary['applicationsProduct']
  and source_record['value'].get('status')=='MATERIALIZED',
  'Verify the actual selected source before its original workspace builds the installation.')
 repository=source_record['value'].get('sourceRepository')
 require_binding(isinstance(repository,str) and Path(repository).is_absolute(),
                 'The original source build must use its actual private Git repository.')
 write_json(OUT/'installation-source-result.json',source_record['value'])
 installation_output=OUT/'installation-receiving'
 context={'sourceRoot':str(source_directory/'bootstrap'),'repository':repository,
  'managedOutput':str(OUT),'directOutput':str(direct_output),'output':str(installation_output),
  'operation':OPERATION,'sourcePin':summary['applicationsProduct'],
  'installedRoot':ENV.get('DELIVERY_APPLICATIONS_INSTALLED_ROOT'),'node':NODE,'python':PYTHON,
  'npmCache':cache,'nodeHeaders':ENV.get('DELIVERY_INSTALLATION_NODE_HEADERS'),'offlineSource':False}
 context_file=OUT/'installation-context.json';exact_context(context_file,context)
 result_code=subprocess.run([NODE,
  str(ROOT/'experiments/merchant-delivery-installation-receiving/phase.mjs'),
  '--context',str(context_file)],cwd=ROOT,env=ENV).returncode
 record=document(installation_output/'receipt.json')
 row={'exitCode':result_code,'receipt':compact(record)}
 summary['installation']=row;emit({'phase':'original-installation-finished',**row})
 if result_code or not valid(record,'scratch.merchant-delivery-installation-receiving.v1',
                             ['ownedProcessesClosed']):
  raise RuntimeError('The original merchant-delivery installation remains incomplete.')
 value=record['value'];binding=value.get('binding')
 require_binding(isinstance(binding,dict) and binding.get('sourceCommit')==summary['applicationsProduct'],
                 'Preserve the actual selected installed source binding.')
 installed=binding.get('installedRoot')
 require_binding(isinstance(installed,str) and Path(installed).is_absolute()
  and Path(installed).is_dir(),'The original installation must return its actual READY runtime directory.')
 row['binding']=binding
 return installed

code=0
try:
 managed=run_phase('managed',OUT/'receipt.json','scratch.managed-settlement-delivery.v1',
  ['nativeComplete','browserComplete','mcpComplete','ownedProcessesClosed'],
  [NODE,str(ROOT/'experiments/managed-settlement-delivery-acceptance/journey.mjs'),'all'],ROOT)
 direct_output=OUT/'single-release-receiving'
 direct=run_phase('direct',direct_output/'receipt.json','scratch.single-release-delivery-receiving.v1',
  ['localComplete','browserComplete','mcpComplete','ownedProcessesClosed'],
  [NODE,str(ROOT/'direct-source/experiments/single-release-delivery-acceptance/journey.mjs')],ROOT/'direct-source')
 require_binding(direct['value'].get('managedReceiptSha256')==managed['sha256']
  and direct['value'].get('managedDirectory')==str(OUT)
  and direct['value'].get('releaseStore')==managed['value']['stores']['blue'],
  'The completed direct phase must use this exact original managed receipt and release store.')
 applications_output=OUT/'applications-receiving'
 prior_apps=document(applications_output/'receipt.json')
 apps_complete=valid(prior_apps,'scratch.merchant-delivery-applications-receiving.v1',
                     ['browserComplete','customerReopenComplete','ownedProcessesClosed'])
 installed=None
 if not apps_complete:
  installed=require_installation(managed,direct,direct_output)
 if apps_complete:
  apps=run_phase('applications',applications_output/'receipt.json',
   'scratch.merchant-delivery-applications-receiving.v1',
   ['browserComplete','customerReopenComplete','ownedProcessesClosed'],[],ROOT)
 elif installed:
  context={'installedRoot':str(Path(installed).resolve()),'managedOutput':str(OUT),
   'directOutput':str(direct_output),'output':str(applications_output),'operation':OPERATION,
   'sourcePin':summary['applicationsProduct'],'node':NODE,'python':PYTHON,
   'playwrightModules':MODULES,'chromium':CHROME}
  context_file=OUT/'applications-context.json';exact_context(context_file,context)
  apps=run_phase('applications',applications_output/'receipt.json',
   'scratch.merchant-delivery-applications-receiving.v1',
   ['browserComplete','customerReopenComplete','ownedProcessesClosed'],
   [NODE,str(ROOT/'experiments/merchant-delivery-applications-receiving/journey.mjs'),
    '--context',str(context_file)],ROOT)
 else:
  raise RuntimeError('The original installation did not return a selected READY runtime.')
 require_binding(apps['value'].get('product')==summary['applicationsProduct']
  and apps['value'].get('managedReceiptSha256')==managed['sha256']
  and apps['value'].get('directReceiptSha256')==direct['sha256']
  and apps['value'].get('managedOutput')==str(OUT)
  and apps['value'].get('directOutput')==str(direct_output),
  'Preserve the original installed Applications completion and its exact receiving bindings.')
 campaign_directory=OUT.parent/'campaign-source'
 donor=ENV.get('DELIVERY_CAMPAIGN_DONOR')
 modules=ENV.get('DELIVERY_CAMPAIGN_DEPENDENCIES')
 if not donor or not modules:
  raise ValueError('Supply the existing original standalone donor and native dependency root.')
 source_context={'operation':OPERATION,'sourcePin':PRODUCT,'directory':str(campaign_directory),
  'repository':donor,'node':NODE,'bootstrapDependencies':modules,
  'reuseSources':[str(ROOT/'direct-source'),str(ROOT)]}
 source_context_file=OUT/'campaign-source-context.json';exact_context(source_context_file,source_context)
 source_code=subprocess.run([PYTHON,'-B',
  str(ROOT/'experiments/managed-settlement-delivery-acceptance/campaign-source.py'),
  str(source_context_file)],cwd=ROOT,env=ENV).returncode
 if source_code: raise RuntimeError('The original selected rollout source remains incomplete.')
 source_record=document(campaign_directory/'source-result.json')
 require_binding(source_record and source_record['value'].get('sourceCommit')==PRODUCT,
                 'Verify the actual selected campaign source before opening its original fleet.')
 write_json(OUT/'campaign-source-result.json',source_record['value'])
 campaign_output=OUT/'campaign-receiving'
 context={'sourceRoot':str(campaign_directory/'bootstrap'),'sourcePin':PRODUCT,'operation':OPERATION,
  'managedOutput':str(OUT),'directOutput':str(direct_output),'applicationsOutput':str(applications_output),
  'output':str(campaign_output),'node':NODE,'python':PYTHON,'playwrightModules':MODULES,'chromium':CHROME}
 context_file=OUT/'campaign-context.json';exact_context(context_file,context)
 campaign=run_phase('campaigns',campaign_output/'receipt.json','scratch.fleet-campaign-receiving.v1',
  ['restorationComplete','reopenComplete','ownedProcessesClosed'],
  [NODE,str(ROOT/'experiments/fleet-campaign-receiving/journey.mjs'),'--context',str(context_file)],ROOT)
 require_binding(campaign['value'].get('product')==PRODUCT
  and campaign['value'].get('managedReceiptSha256')==managed['sha256']
  and campaign['value'].get('directReceiptSha256')==direct['sha256']
  and campaign['value'].get('applicationsReceiptSha256')==apps['sha256'],
  'The completed rollout must retain all three original receiving identities.')
except BaseException as error:
 summary['runnerError']={'type':type(error).__name__,'message':str(error)}
 code=1
finally:
 try: persist_outputs(code)
 except BaseException as error:
  emit({'phase':'receiving-artifacts-incomplete','error':{'type':type(error).__name__,'message':str(error)},
        'output':str(OUT),'complete':summary.get('complete',False)})
  code=1
sys.exit(code)
