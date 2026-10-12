#!/usr/bin/env python3
"""MIT. One original managed, direct, installed Applications and rollout receiving sequence."""
import os,sys,json,subprocess,hashlib,zipfile,stat,tempfile,shutil,time
from pathlib import Path
ROOT=Path(sys.argv[1]).resolve(); OUT=Path(sys.argv[2]).resolve()
NODE=sys.argv[3]; PYTHON=sys.argv[4]; MODULES=sys.argv[5]; CHROME=sys.argv[6]
OPERATION='SCF-MANAGED-SF98-DELIVERY-E49D-20261012'
PRODUCT='e316fc9db6ef67949938b560a36c4700bf38410b'
LIBRARY_HELPER_HASHES={"library_upload.py":"5bc473dadefe1f68ee8797baaed19d6662642d0ea4bcba128fa12938faa0d767","library_hosted_apps.py":"97d029b097ace62b744c82dfde20ef6921ed543a33a771ecf6452bd655d11b59","library_file_transfer.py":"5e1557817be17db06e2375f8c34ed83e948d520242e5ee4cb50a30c7a4c83378"}
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
 summary['complete']=len(summary['phases'])==4 and all(p.get('exitCode')==0
  and p.get('receipt',{}).get('state')=='PASS' for p in summary['phases'])
 report=OUT/'receiving-summary.json';write_json(report,summary)
 archive=OUT.parent/'merchant-delivery-continuation.zip'
 excluded={'tmp','browser-profile','chromium-profile','playwright-profile','node_modules','__pycache__'}
 entries=[]
 for path in sorted(OUT.rglob('*')):
  relative=path.relative_to(OUT)
  if not path.is_file() or path.is_symlink() or any(part in excluded for part in relative.parts):
   continue
  if path.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.pyc'}: continue
  entries.append((path,relative))
 continuation={'operation':OPERATION,'originalOutput':str(OUT),'originalSourceRoot':str(ROOT),
  'managedSource':summary['managedSource'],'directSource':summary['directSource'],
  'applicationsSource':summary['applicationsSource'],'applicationsProduct':summary['applicationsProduct'],
  'campaignProduct':PRODUCT,'campaignPhaseSource':summary['campaignPhaseSource'],
  'originalCampaignSourceRoot':str(OUT.parent/'campaign-source'/'bootstrap'),
  'sourceRetrieval':'Restore exact original Git sources separately before continuing at the same retained absolute paths.',
  'data':'Original local fixture signing values, stores, requests and customer receiving state. Browser images and temporary profiles are excluded.',
  'files':[{'path':str(Path('output')/relative),'bytes':path.stat().st_size,'sha256':sha(path.read_bytes())}
           for path,relative in entries]}
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as output:
  output.writestr('CONTINUATION.json',json.dumps(continuation,indent=2)+'\n')
  for path,relative in entries: output.write(path,str(Path('output')/relative))
 os.chmod(archive,0o600)
 emit({'phase':'saving-receiving-files','archive':str(archive),'bytes':archive.stat().st_size,'summary':str(report)})
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
 installed=ENV.get('DELIVERY_APPLICATIONS_INSTALLED_ROOT')
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
  summary['phases'].append({'name':'applications','state':'AWAITING_READY_INSTALLATION',
   'source':summary['applicationsSource'],'requiredEnvironment':'DELIVERY_APPLICATIONS_INSTALLED_ROOT'})
  emit({'phase':'applications-awaiting-ready-installation','source':summary['applicationsSource']})
  raise RuntimeError('The original Applications phase requires its selected READY installation.')
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
