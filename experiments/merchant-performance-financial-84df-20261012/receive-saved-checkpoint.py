"""Receive a saved native04 workspace while preserving its original job and request history.

Call receive_saved_checkpoint from the existing private receiving programme with its
unchanged LibraryDownloadWorkflow.run callback and the selected complete checkpoint.
The receiving function retains the predecessor result, original foundation, exact
archive bytes and prior journal chain before the original application continues.
"""

def receive_saved_checkpoint(source, root, original, *, specification, download, emit, programme_path):
 import fcntl,re,hashlib,json,os,pathlib,runpy,stat,zipfile
 def digest(path):
  h=hashlib.sha256()
  with path.open('rb') as stream:
   for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
  return h.hexdigest()
 module=runpy.run_path(str(source/'continue-native04.py'),run_name='native04_original_source_for_receiving')
 original_root=module['ORIGINAL_ROOT'];work=module['WORK']
 read_regular=module['native_read_regular'];retain=module['native_retain']
 directory=module['native_directory'];encoded=module['native_encoded']
 expected_pricing=module['EXPECTED_PRICING'];operation='SCF-TARIFF-USAGE-PERFORMANCE-25FD-20261012'
 parent=pathlib.Path(specification['parentRecord'])
 parent_raw=read_regular(parent/'result.json');parent_value=json.loads(parent_raw)
 for key,expected in specification['parentResult'].items():
  if parent_value.get(key)!=expected:raise RuntimeError('Original terminal application result changed: '+key)
 parent_request=read_regular(parent/'request.json')
 parent_intent=json.loads(parent_request).get('intent',{})
 if parent_intent.get('operation_id')!=specification['parentOperationId']:
  raise RuntimeError('Continue the original native operation record')
 if hashlib.sha256(read_regular(parent/'native04-original-input/continue-saved-original.py')).hexdigest()!=specification['parentSourceSha256']:
  raise RuntimeError('Original registered receiving source changed')
 if module['live_native04_processes']():raise RuntimeError('The original native04 application is still active')
 received=download(json.dumps(specification['result']),'000','continued-checkpoint')
 if len(received['files'])!=1:raise RuntimeError('Receive the one complete saved native04 checkpoint')
 archive=pathlib.Path(received['files'][0])
 if archive.is_symlink() or archive.stat().st_size!=specification['bytes'] or digest(archive)!=specification['sha256']:
  raise RuntimeError('Saved updated native04 workspace identity differs')
 directory(original_root)
 lockfd=os.open(original_root/'84df-continuation.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
 with os.fdopen(lockfd,'a+') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  with zipfile.ZipFile(archive) as packet,zipfile.ZipFile(original) as initial:
   members=packet.infolist()
   if len(members)!=specification['entries'] or sum(row.file_size for row in members)>1024**3:
    raise RuntimeError('Saved updated workspace inventory differs')
   selected={};directories={''};inventory=[]
   for row in members:
    relative=pathlib.PurePosixPath(row.filename)
    if relative.is_absolute() or '..' in relative.parts or str(relative)!=row.filename or row.filename in selected:
     raise RuntimeError('Saved checkpoint member path differs')
    if row.is_dir() or stat.S_ISLNK(row.external_attr>>16) or row.flag_bits&1:
     raise RuntimeError('Saved checkpoint member type differs')
    selected[row.filename]=row
    for ancestor in relative.parents:
     if str(ancestor)!='.':directories.add(str(ancestor))
    inventory.append([row.filename,row.file_size,row.CRC])
   foundation_name='original-native/flow-result.json';origin_name='original-native/operation.json'
   foundation_raw=packet.read(foundation_name);origin_raw=packet.read(origin_name)
   if foundation_raw!=initial.read(foundation_name) or origin_raw!=initial.read(origin_name):
    raise RuntimeError('Keep the original completed foundation and request identities')
   foundation=json.loads(foundation_raw)
   if foundation.get('status')!='COMPLETE' or foundation.get('pricingVersion')!=expected_pricing or foundation.get('operationDirectory')!=str(work/'original-native'):
    raise RuntimeError('Saved checkpoint belongs to another foundation')
   journal_raw=packet.read('FINANCIAL_NATIVE_OPERATION.json');journal=json.loads(journal_raw)
   if journal.get('schema')!='commons.scf-performance-financial-native-operation.v1' or journal.get('operation')!=operation or journal.get('root')!=str(original_root):
    raise RuntimeError('Saved checkpoint belongs to another financial continuation')
   if journal.get('status')!='FAILED' or journal.get('startedAt')!=specification['startedAt']:
    raise RuntimeError('Receive the selected actual interrupted operation')
   checkpoint_sha=hashlib.sha256(journal_raw).hexdigest()
   target_receiving=original_root/'84df-saved-workspace-receiving'/specification['sha256']
   receipt_request={'schema':'commons.scf-native04-saved-workspace-receiving.v1','operation':operation,
    'root':str(original_root),'work':str(work),'archiveSha256':specification['sha256'],
    'archiveBytes':specification['bytes'],'entries':len(members),
    'inventorySha256':hashlib.sha256(encoded(inventory)).hexdigest(),
    'originalFoundationSha256':hashlib.sha256(foundation_raw).hexdigest(),
    'originalNativeOperationSha256':hashlib.sha256(origin_raw).hexdigest(),
    'checkpointJournalSha256':checkpoint_sha,
    'parentOperationId':specification['parentOperationId'],'parentRecord':str(parent),
    'parentOutcomeSha256':hashlib.sha256(encoded(specification['parentResult'])).hexdigest(),
    'libraryFileId':specification['result']['results'][0]['library_file_id'],
    'fileId':specification['result']['results'][0]['file_id']}
   request_raw=encoded(receipt_request)
   retain(target_receiving/'request.json',request_raw)
   later=False
   current_path=work/'FINANCIAL_NATIVE_OPERATION.json'
   if current_path.exists():
    current_raw=read_regular(current_path)
    if current_raw!=journal_raw and not journal_raw.startswith(current_raw):
     seen=set()
     while hashlib.sha256(current_raw).hexdigest()!=checkpoint_sha:
      current_sha=hashlib.sha256(current_raw).hexdigest()
      if current_sha in seen:raise RuntimeError('Original continuation journal history repeats')
      seen.add(current_sha);current=json.loads(current_raw)
      if current.get('schema')!='commons.scf-performance-financial-native-operation.v1' or current.get('operation')!=operation or current.get('root')!=str(original_root):
       raise RuntimeError('Current original workspace journal differs')
      previous=current.get('attempt',{}).get('previousJournal')
      if not isinstance(previous,dict):raise RuntimeError('Preserve the current workspace; its journal is not derived from this selected checkpoint')
      previous_path=pathlib.Path(previous['path'])
      expected_path=work/'financial-native-attempts'/('status-'+previous['sha256']+'.json')
      if previous_path!=expected_path:raise RuntimeError('Original preceding journal path differs')
      current_raw=read_regular(previous_path)
      if len(current_raw)!=previous['bytes'] or hashlib.sha256(current_raw).hexdigest()!=previous['sha256']:
       raise RuntimeError('Original preceding journal bytes differ')
     if read_regular(work/foundation_name)!=foundation_raw or read_regular(work/origin_name)!=origin_raw:
      raise RuntimeError('Current continuation foundation differs')
     later=True
   def own_receiving_file(relative,path):
    prefix='financial-native-recovery/'+specification['sha256']+'/'
    if relative.startswith('financial-native-recovery/source/'):
     match=re.fullmatch(r'continue-saved-([0-9a-f]{64})[.]py',path.name)
     return bool(match and hashlib.sha256(read_regular(path)).hexdigest()==match.group(1))
    if not relative.startswith(prefix):return False
    suffix=relative[len(prefix):];raw=read_regular(path)
    if suffix=='request.json':return raw==request_raw
    if suffix=='COMPLETE.json':
     value=json.loads(raw)
     return value.get('schema')=='commons.scf-native04-saved-workspace-received.v1' and value.get('requestSha256')==hashlib.sha256(request_raw).hexdigest()
    if suffix.startswith('parent-results/'):
     match=re.fullmatch(r'([0-9a-f]{64})[.]json',path.name)
     if not match or hashlib.sha256(raw).hexdigest()!=match.group(1):return False
     value=json.loads(raw)
     return all(value.get(key)==expected for key,expected in specification['parentResult'].items())
    return False
   extra_directories={'financial-native-recovery','financial-native-recovery/source',
    'financial-native-recovery/'+specification['sha256'],
    'financial-native-recovery/'+specification['sha256']+'/parent-results'}
   resumed=0
   if not later:
    if work.exists():
     if work.is_symlink() or not work.is_dir():raise RuntimeError('Keep the original canonical work directory')
     for current_dir,dirs,files in os.walk(work,followlinks=False):
      for name in dirs:
       path=pathlib.Path(current_dir)/name;relative=str(path.relative_to(work))
       if path.is_symlink() or (relative not in directories and relative not in extra_directories):
        raise RuntimeError('Preserve the current workspace directory outside this selected checkpoint: '+relative)
      for name in files:
       path=pathlib.Path(current_dir)/name;relative=str(path.relative_to(work));row=selected.get(relative)
       if row is None and not path.is_symlink() and path.is_file() and own_receiving_file(relative,path):continue
       if row is None or path.is_symlink() or not path.is_file():
        raise RuntimeError('Preserve the current workspace file outside this selected checkpoint: '+relative)
       old=read_regular(path)
       if len(old)>row.file_size or packet.read(row)[:len(old)]!=old:
        raise RuntimeError('Preserve the current changed workspace member: '+relative)
    directory(work)
    for row in members:
     path=work/pathlib.Path(*pathlib.PurePosixPath(row.filename).parts);directory(path.parent)
     try:fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_RDWR|os.O_NOFOLLOW,0o600)
     except FileExistsError:fd=os.open(path,os.O_RDWR|os.O_NOFOLLOW)
     try:
      info=os.fstat(fd)
      if not stat.S_ISREG(info.st_mode) or info.st_size>row.file_size:raise RuntimeError('Saved workspace member changed before receiving')
      retained=info.st_size;resumed+=retained;offset=0
      with os.fdopen(fd,'r+b',closefd=False) as target,packet.open(row) as incoming:
       for chunk in iter(lambda:incoming.read(1024*1024),b''):
        prefix=min(len(chunk),max(0,retained-offset))
        if prefix and target.read(prefix)!=chunk[:prefix]:raise RuntimeError('Saved workspace prefix changed during receiving')
        if prefix<len(chunk):target.write(chunk[prefix:])
        offset+=len(chunk)
       if offset!=row.file_size:raise RuntimeError('Saved workspace member length changed')
       target.flush();os.fsync(fd)
     finally:os.close(fd)
     module['native_sync_directory'](path.parent)
   if read_regular(work/foundation_name)!=foundation_raw or read_regular(work/origin_name)!=origin_raw:
    raise RuntimeError('The received original foundation differs')
   completed_path=target_receiving/'COMPLETE.json'
   if completed_path.exists():
    completion_raw=read_regular(completed_path);completion=json.loads(completion_raw)
    if completion.get('schema')!='commons.scf-native04-saved-workspace-received.v1' or completion.get('requestSha256')!=hashlib.sha256(request_raw).hexdigest():
     raise RuntimeError('Saved workspace receiving completion differs')
   else:
    completion={'schema':'commons.scf-native04-saved-workspace-received.v1',
     'requestSha256':hashlib.sha256(request_raw).hexdigest(),'completedAt':module['now'](),
     'archiveSha256':specification['sha256'],'entries':len(members),'resumedBytes':resumed,
     'reusedLaterOriginalJournal':later}
    completion_raw=encoded(completion);retain(completed_path,completion_raw)
   history=work/'financial-native-recovery'/specification['sha256']
   retain(history/'request.json',request_raw);retain(history/'COMPLETE.json',completion_raw)
   retain(history/'parent-results'/(hashlib.sha256(parent_raw).hexdigest()+'.json'),parent_raw)
   programme=read_regular(pathlib.Path(programme_path))
   programme_sha=hashlib.sha256(programme).hexdigest()
   retain(work/'financial-native-recovery/source'/('continue-saved-'+programme_sha+'.py'),programme)
   receipt={'sourceCheckpoint':specification['sha256'],'archive':str(archive),'entries':len(members),
    'work':str(work),'requestSha256':hashlib.sha256(request_raw).hexdigest(),
    'reusedLaterOriginalJournal':later,'previousNativeRecord':str(parent),'receiving':str(target_receiving)}
   (root/'UPDATED_CHECKPOINT_RECEIVING.json').write_text(json.dumps(receipt,indent=2)+'\n')
   emit('NATIVE04_UPDATED_WORKSPACE_RECEIVED',**receipt)
 return receipt
