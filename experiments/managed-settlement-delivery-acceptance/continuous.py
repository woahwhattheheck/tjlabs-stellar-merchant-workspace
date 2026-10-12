#!/usr/bin/env python3
import os,sys,json,subprocess,hashlib,zipfile,stat
from pathlib import Path
ROOT=Path(sys.argv[1]); OUT=Path(sys.argv[2]); NODE=sys.argv[3]; PYTHON=sys.argv[4]; MODULES=sys.argv[5]; CHROME=sys.argv[6]
OUT.mkdir(parents=True,exist_ok=True,mode=0o700)
TMP=OUT/'tmp'; TMP.mkdir(exist_ok=True,mode=0o700)
ENV=os.environ.copy(); ENV.update({'PYTHONDONTWRITEBYTECODE':'1','TMPDIR':str(TMP),'TMP':str(TMP),'TEMP':str(TMP),
'SF98_DELIVERY_SOURCE':str(ROOT),'SF98_DELIVERY_OUTPUT':str(OUT),'SF98_DELIVERY_PYTHON':PYTHON,
'SF98_DELIVERY_NODE_MODULES':MODULES,'SF98_DELIVERY_CHROMIUM':CHROME,
'SINGLE_DELIVERY_SOURCE':str(ROOT/'direct-source'),'SINGLE_DELIVERY_OUTPUT':str(OUT/'single-release-receiving')})
summary={'operation':'SCF-MANAGED-SF98-DELIVERY-E49D-20261012',
'managedSource':'525455c816a49de52e729a15f52d4f9adf9deeb6',
'directSource':'263248f386833637ab1cd8caf479904fb655cff6',
'applicationsSource':'0c135a41aa966d70ca38b95d8af5e122a2c9754f','phases':[]}
def emit(value): print(json.dumps(value,separators=(',',':')),flush=True)
def receipt(path):
 if not path.is_file(): return None
 body=path.read_bytes(); value=json.loads(body)
 return {'path':str(path),'sha256':hashlib.sha256(body).hexdigest(),'state':value.get('state'),
 'nativeComplete':value.get('nativeComplete'),'browserComplete':value.get('browserComplete'),
 'mcpComplete':value.get('mcpComplete'),'ownedProcessesClosed':value.get('ownedProcessesClosed'),
 'milestones':len(value.get('milestones',[])),'error':value.get('error')}
code=0
try:
 managed=subprocess.run([NODE,str(ROOT/'experiments/managed-settlement-delivery-acceptance/journey.mjs'),'all'],cwd=ROOT,env=ENV)
 record=receipt(OUT/'receipt.json')
 summary['phases'].append({'name':'managed','exitCode':managed.returncode,'receipt':record})
 emit({'phase':'managed-finished','exitCode':managed.returncode,'receipt':record})
 code=managed.returncode
 if code==0 and record and record['state']=='PASS' and all(record[k] is True for k in ['nativeComplete','browserComplete','mcpComplete','ownedProcessesClosed']):
  direct=subprocess.run([NODE,str(ROOT/'direct-source/experiments/single-release-delivery-acceptance/journey.mjs')],cwd=ROOT/'direct-source',env=ENV)
  record=receipt(OUT/'single-release-receiving/receipt.json')
  summary['phases'].append({'name':'direct','exitCode':direct.returncode,'receipt':record})
  emit({'phase':'direct-finished','exitCode':direct.returncode,'receipt':record})
  code=direct.returncode
  if code==0 and record and record['state']=='PASS' and record['browserComplete'] is True and record['ownedProcessesClosed'] is True:
   installed=ENV.get('DELIVERY_APPLICATIONS_INSTALLED_ROOT')
   if installed:
    context={'installedRoot':str(Path(installed).resolve()),'managedOutput':str(OUT),
    'directOutput':str(OUT/'single-release-receiving'),'output':str(OUT/'applications-receiving'),
    'operation':summary['operation'],'sourcePin':'8b08a9333af070df0e96b6f09f6612eb07eab1ad',
    'node':NODE,'python':PYTHON,'playwrightModules':MODULES,'chromium':CHROME}
    context_file=OUT/'applications-context.json'
    context_file.write_text(json.dumps(context,indent=2)+'\n');os.chmod(context_file,0o600)
    applications=subprocess.run([NODE,str(ROOT/'experiments/merchant-delivery-applications-receiving/journey.mjs'),
    '--context',str(context_file)],cwd=ROOT,env=ENV)
    record=receipt(OUT/'applications-receiving/receipt.json')
    summary['phases'].append({'name':'applications','exitCode':applications.returncode,'receipt':record})
    emit({'phase':'applications-finished','exitCode':applications.returncode,'receipt':record})
    code=applications.returncode
   else:
    summary['phases'].append({'name':'applications','state':'AWAITING_READY_INSTALLATION',
    'source':summary['applicationsSource'],'requiredEnvironment':'DELIVERY_APPLICATIONS_INSTALLED_ROOT'})
    emit({'phase':'applications-awaiting-ready-installation','source':summary['applicationsSource']})
  elif code==0: code=1
 elif code==0: code=1
except BaseException as error:
 summary['runnerError']={'type':type(error).__name__,'message':str(error)};code=1
finally:
 summary['exitCode']=code
 summary['complete']=len(summary['phases'])==3 and all(p.get('exitCode')==0 and p.get('receipt',{}).get('state')=='PASS' for p in summary['phases'])
 report=OUT/'receiving-summary.json'; report.write_text(json.dumps(summary,indent=2)+'\n');os.chmod(report,0o600)
 archive=OUT.parent/'merchant-delivery-continuation.zip'
 excluded={'tmp','browser-profile','chromium-profile','playwright-profile','node_modules','__pycache__'}
 with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  z.writestr('CONTINUATION.json',json.dumps({'operation':summary['operation'],'originalOutput':str(OUT),
  'originalSourceRoot':str(ROOT),'managedSource':summary['managedSource'],'directSource':summary['directSource'],
  'sourceRetrieval':'Restore exact Git sources separately; source code is retained in the original repositories.',
  'data':'This archive retains original local fixture data, generated fixture signing values and native request/receiving state. Browser images and temporary profiles are excluded.'},indent=2)+'\n')
  for p in sorted(OUT.rglob('*')):
   relative=p.relative_to(OUT)
   if not p.is_file() or p.is_symlink() or any(part in excluded for part in relative.parts) or p.suffix.lower() in {'.png','.jpg','.jpeg','.webp','.pyc'}: continue
   z.write(p,str(Path('output')/relative))
 os.chmod(archive,0o600)
 emit({'phase':'saving-receiving-files','archive':str(archive),'bytes':archive.stat().st_size,'summary':str(report)})
 helper=Path('/root/.codex/plugins/cache/openai-curated-remote/openai-library/0.1.62/skills/library/scripts/library_upload.py')
 if helper.is_file():
  upload=subprocess.run([PYTHON,str(helper)],input=json.dumps({'uploads':[
  {'local_path':str(archive),'purpose':'create_library_file','library_artifact_type':'other'},
  {'local_path':str(report),'purpose':'create_library_file','library_artifact_type':'other'}]}),
  text=True,capture_output=True,env=ENV)
  saved=OUT.parent/'library-upload-result.json'
  saved.write_text(json.dumps({'exitCode':upload.returncode,'stdout':upload.stdout,'stderr':upload.stderr},indent=2)+'\n');os.chmod(saved,0o600)
  emit({'phase':'library-finished','exitCode':upload.returncode,'receipt':str(saved),'stdout':upload.stdout,'stderr':upload.stderr[-4000:]})
 else: emit({'phase':'library-helper-unavailable','path':str(helper)})
sys.exit(code)
