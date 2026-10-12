#!/usr/bin/env python3
"""Assemble the complete frozen following-document kit. No public acquisition."""
import argparse,os,sys,json,hashlib,pathlib,stat,base64,gzip,tempfile,zipfile,subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--checkpoint',required=True,type=pathlib.Path)
parser.add_argument('--directory',required=True,type=pathlib.Path)
args=parser.parse_args()
where=pathlib.Path(__file__).resolve().parent
if not args.checkpoint.is_absolute() or not args.directory.is_absolute() or '..' in args.directory.parts:raise ValueError('Select absolute physical input and output paths')
if args.directory==where or args.directory in where.parents or where in args.directory.parents:raise ValueError('Keep the immutable source carrier separate from the assembled kit')
metadata=json.loads((where/'source-capsule.json').read_bytes())
if metadata['schema']!='commons.iati-document-following-source-transfer.v1':raise ValueError('Use the complete original source transfer')
chunks=[]
for item in metadata['parts']:
 name=item['name']
 if pathlib.PurePosixPath(name).name!=name or '/' in name or '\\' in name:raise ValueError('Invalid original source part')
 data=(where/name).read_bytes()
 if len(data)!=item['bytes'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Original source part differs: '+name)
 chunks.append(data)
encoded=b''.join(chunks)
compressed=base64.b64decode(encoded+b'='*((-len(encoded))%4),altchars=b'-_',validate=True)
if len(compressed)!=metadata['gzip']['bytes'] or hashlib.sha256(compressed).hexdigest()!=metadata['gzip']['sha256']:raise ValueError('Complete compressed source differs')
raw=gzip.decompress(compressed)
if len(raw)!=metadata['json']['bytes'] or hashlib.sha256(raw).hexdigest()!=metadata['json']['sha256']:raise ValueError('Complete decoded source differs')
p=json.loads(raw)
if p['schema']!='commons.iati-document-following-source-capsule.v1' or p['sourceManifest']['sourceSha256']!=metadata['sourceSha256']:raise ValueError('Source capsule selection differs')
p['checkpoint']['path']=str(args.checkpoint)
delivery=args.directory.parent
if not delivery.is_dir() or delivery.is_symlink():raise ValueError('Select an existing physical parent')
def sha(data):return hashlib.sha256(data).hexdigest()
def data_json(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()+b'\n'
def safe_name(name):
 x=pathlib.PurePosixPath(name)
 if not name or x.is_absolute() or x.as_posix()!=name or '\\' in name or any(z in ('','.','..') for z in x.parts):raise ValueError('Invalid selected relative member')
 return x
def read(path):
 before=path.lstat()
 if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode):raise ValueError('Preserve unexpected original file '+str(path))
 with path.open('rb') as f:data=f.read(before.st_size+1)
 after=path.lstat()
 fields=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_ctime_ns)
 if fields(before)!=fields(after) or len(data)!=before.st_size:raise ValueError('Source changed during exact read')
 return data
def exact(path,data,mode=0o600):
 path.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
 for parent in (path.parent,*path.parent.parents):
  if parent.is_symlink():raise ValueError('Preserve symlink parent')
 if path.exists() or path.is_symlink():
  if read(path)!=data or stat.S_IMODE(path.lstat().st_mode)!=mode:raise ValueError('Preserve different existing delivery member '+str(path))
  return
 fd,name=tempfile.mkstemp(prefix='.worker-file-',dir=path.parent)
 temporary=pathlib.Path(name)
 try:
  os.fchmod(fd,mode)
  with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
  os.link(temporary,path)
 finally:temporary.unlink(missing_ok=True)
original=p['originalManifest'];source=p['sourceManifest']
if len(original['files'])!=226 or len(source['files'])!=229 or len(source['installedBindings'])!=189:raise ValueError('Complete source selection changed')
selected={}
for item in p['sourceFiles']:
 name=item['path'];safe_name(name)
 if name in selected:raise ValueError('Repeated original source member')
 if item['encoding']=='utf-8':body=item['content'].encode()
 elif item['encoding']=='base64':body=base64.b64decode(item['content'],validate=True)
 else:raise ValueError('Unsupported original source representation')
 selected[name]=body
if set(selected)!={x['path'] for x in source['files']}:raise ValueError('Complete following source scope differs')
for item in source['files']:
 body=selected[item['path']]
 if len(body)!=item['bytes'] or sha(body)!=item['sha256']:raise ValueError('Following source body changed')
selection=''.join(x['path']+'\0'+str(x['bytes'])+'\0'+x['sha256']+'\n' for x in sorted(source['files'],key=lambda v:v['path'])).encode()
if sha(selection)!=source['sourceSha256']:raise ValueError('Following source inventory hash changed')
checkpoint=p['checkpoint'];checkpoint_body=read(pathlib.Path(checkpoint['path']))
if len(checkpoint_body)!=checkpoint['bytes'] or sha(checkpoint_body)!=checkpoint['sha256']:raise ValueError('Original saved checkpoint differs')
with zipfile.ZipFile(pathlib.Path(checkpoint['path'])) as archive:
 closed=json.loads(archive.read('checkpoint.json'))
 if closed['checkpointSha256']!=checkpoint['checkpointSha256'] or len(archive.infolist())!=80:raise ValueError('Wrong completed checkpoint')
 if {x.filename for x in archive.infolist()}!={'checkpoint.json'}|{x['name'] for x in closed['files']}:raise ValueError('Checkpoint member scope changed')
 for item in closed['files']:
  safe_name(item['name']);body=archive.read(item['name'])
  if len(body)!=item['bytes'] or sha(body)!=item['sha256']:raise ValueError('Original closed case member changed')
compile(p['helper'],'prepare_worker.py','exec')
members={'source/'+name:(body,0o644) for name,body in selected.items()}
members['source-manifest.json']=(data_json(source),0o600)
members['following-input.original.json']=(data_json(p['config']),0o600)
members['prepare_worker.py']=(p['helper'].encode(),0o644)
members['WORKER.md']=(p['guide'].encode(),0o644)
members['checkpoint/original-complete-case.zip']=(checkpoint_body,0o600)
manifest={
 'schema':'commons.iati-document-following-worker.v1',
 'operationId':p['config']['operationId'],'originalOperationId':p['config']['originalOperationId'],
 'receivingRequest':'1791846411.846109',
 'source':{'files':len(selected),'bytes':sum(len(v) for v in selected.values()),'sha256':source['sourceSha256'],'publicationCommit':source['followingCommit'],'baseSourceSha256':source['baseSourceSha256'],'installedBindings':189},
 'checkpoint':{'name':'checkpoint/original-complete-case.zip','bytes':checkpoint['bytes'],'sha256':checkpoint['sha256'],'identity':checkpoint['checkpointSha256'],'members':80},
 'configuration':'following-input.original.json',
 'files':[{'name':name,'bytes':len(body),'sha256':sha(body),'mode':mode} for name,(body,mode) in sorted(members.items())],
 'semantics':'Complete unchanged saved case and declared source for one explicitly acknowledged following observation. Package preparation makes no public request and does not open a workspace.'}
identity=sha(data_json(manifest));manifest['deliveryIdentitySha256']=identity
members['worker-delivery.json']=(data_json(manifest),0o600)
kit=args.directory
if kit.exists() and (not kit.is_dir() or kit.is_symlink()):raise ValueError('Preserve unexpected worker input directory')
kit.mkdir(mode=0o700,parents=True,exist_ok=True)
for name,(body,mode) in sorted(members.items()):exact(kit.joinpath(*safe_name(name).parts),body,mode)
verified=subprocess.run([sys.executable,'-B',str(kit/'prepare_worker.py'),'verify'],capture_output=True,text=True,timeout=60)
if verified.returncode!=0:raise RuntimeError('Whole worker kit verification failed: '+verified.stdout+'\n'+verified.stderr)
verification=json.loads(verified.stdout)
if verification['sourceFiles']!=229 or verification['checkpointMembers']!=80 or verification['publicRequestsMade']!=0:raise ValueError('Wrong worker verifier result')
target=delivery/(kit.name+'.zip')
def verify_zip(path):
 with zipfile.ZipFile(path) as z:
  if len(z.infolist())!=len(members) or set(z.namelist())!=set(members):raise ValueError('Incomplete outer worker delivery')
  for name,(body,mode) in members.items():
   if z.read(name)!=body:raise ValueError('Outer delivery member differs: '+name)
if not target.exists():
 fd,name=tempfile.mkstemp(prefix='.worker-package-',dir=delivery);os.close(fd);temporary=pathlib.Path(name)
 try:
  with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
   for name,(body,mode) in sorted(members.items()):
    info=zipfile.ZipInfo(name,(2026,10,12,0,0,0));info.external_attr=(stat.S_IFREG|mode)<<16
    info.compress_type=zipfile.ZIP_STORED if name.endswith('original-complete-case.zip') else zipfile.ZIP_DEFLATED
    z.writestr(info,body)
  with temporary.open('rb') as stream:os.fsync(stream.fileno())
  verify_zip(temporary);os.link(temporary,target);target.chmod(0o600)
 finally:temporary.unlink(missing_ok=True)
verify_zip(target);body=read(target)
result={'state':'SAVED_LOCALLY','path':str(target),'directory':str(kit),'bytes':len(body),'sha256':sha(body),'members':len(members),'sourceFiles':len(selected),'sourceBytes':sum(len(v) for v in selected.values()),'sourceSha256':source['sourceSha256'],'checkpointSha256':checkpoint['sha256'],'deliveryIdentitySha256':identity,'operationId':p['config']['operationId'],'verification':verification,'host':os.uname().nodename}
exact(delivery/(kit.name+'.receipt.json'),data_json(result))
print(json.dumps(result),flush=True)
