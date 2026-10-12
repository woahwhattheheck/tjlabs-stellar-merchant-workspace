// MIT. Bind authenticated restored handover files to their new native file identities.
import { constants as C } from 'node:fs';
import { lstat, realpath, open, link, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  HASH, METADATA_LIMIT, absolute, childName, canonical, digest, encode, decode,
  exact, directory, bytes, present, syncDirectory, fail,
} from './handover-files.mjs';

export const CAPTURED_HANDOVER_RECOVERY_SCHEMA = 'stellar-forge.captured-handover-file-recovery.v1';
const BINDING_SCHEMA = 'stellar-forge.captured-handover-recovered-file.v1';
const APPLIED_SCHEMA = 'stellar-forge.captured-handover-file-recovery-applied.v1';
const ARCHIVE_OPERATION = 'stellar-forge.captured-api-handover-archive-operation.v1';
const ARCHIVE_COMPLETE = 'stellar-forge.captured-api-handover-archive-result.v1';
const UPLOAD_OPERATION = 'stellar-forge.captured-api-handover-upload.v1';
const UPLOAD_PAYLOAD = 'stellar-forge.captured-api-handover-upload-payload.v1';
const UPLOAD_COMPLETE = 'stellar-forge.captured-api-handover-upload-complete.v1';
const UPLOAD_CHUNK = 'stellar-forge.captured-api-handover-upload-chunk.v1';
const ARCHIVE = 'handover.sfhandover', PAYLOAD = 'payload.sfhandover';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const INPUT = 'CAPTURED_HANDOVER_RECOVERY_INPUT';
const CHANGED = 'CAPTURED_HANDOVER_RECOVERY_CHANGED';
function requireValue(condition, message) { if (!condition) fail(INPUT,message); }
function hash(value) { requireValue(typeof value === 'string' && HASH.test(value),'Retain the complete original SHA-256.'); return value; }
function count(value) { requireValue(Number.isSafeInteger(value) && value >= 0,'Retain an exact nonnegative file size.'); return value; }
function label(value) {
  requireValue(typeof value === 'string' && value.trim() && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value),
    'Retain the original recovery operation and logical root names.');
  return value;
}
function relativeName(value, empty = false) { if (empty && value === '') return value; return childName(value); }
function inRoot(prefix, name) { return prefix ? prefix + '/' + name : name; }
function parentName(name) { const at=name.lastIndexOf('/'); return at < 0 ? '' : name.slice(0,at); }
function captured(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { fail(INPUT,'Retain the complete plain JSON recovery input.'); }
}
function fileIdentity(value) {
  exact(value,['device','inode','bytes','mtimeNs','ctimeNs'],['device','inode','bytes','mtimeNs','ctimeNs']);
  count(value.bytes);
  for (const name of ['device','inode'])
    requireValue(typeof value[name] === 'string' && /^(0|[1-9][0-9]*)$/.test(value[name]) && value[name].length <= 40,
      'Retain the native device and inode identifiers.');
  for (const name of ['mtimeNs','ctimeNs'])
    requireValue(typeof value[name] === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value[name]) && value[name].length <= 40,
      'Retain the complete native file timestamps.');
  return value;
}
function rootsInput(value, requireEntries) {
  requireValue(Array.isArray(value),'Supply the original authenticated recovery roots.');
  const roots=new Map();
  for (const row of captured(value)) {
    exact(row,['name','directory','entries'],requireEntries?['name','directory','entries']:['name','directory']);
    label(row.name); requireValue(!roots.has(row.name),'A recovery root name is repeated.');
    const root={name:row.name,directory:absolute(row.directory),entries:new Map(),fileRoot:false};
    if (row.entries !== undefined) {
      requireValue(Array.isArray(row.entries),'Retain the complete original root entry roster.');
      for (const item of row.entries) {
        exact(item,['relative','kind','size','sha256'],['relative','kind']);
        relativeName(item.relative,true);
        requireValue(['file','directory'].includes(item.kind) && !root.entries.has(item.relative),
          'An original recovery entry is invalid or repeated.');
        if (item.kind === 'file') { count(item.size); hash(item.sha256); }
        root.entries.set(item.relative,item);
      }
      const first=root.entries.get('');
      requireValue(first && ['file','directory'].includes(first.kind),'Retain the original root entry.');
      root.fileRoot=first.kind === 'file';
      if (root.fileRoot) requireValue(root.entries.size === 1,'A standalone file root cannot contain descendants.');
      for (const item of root.entries.values()) {
        let parent=parentName(item.relative);
        while (item.relative && parent !== '') {
          requireValue(root.entries.get(parent)?.kind === 'directory','An original entry has no declared parent directory.');
          parent=parentName(parent);
        }
      }
    }
    roots.set(root.name,root);
  }
  return roots;
}
async function originalRoot(root) {
  const stat=await lstat(root.directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(root.directory) !== root.directory)
    fail(CHANGED,'The original placed recovery root changed: '+root.name);
}
async function declaredJSON(root, name) {
  const entry=root.entries.get(name);
  requireValue(entry?.kind === 'file' && entry.size <= METADATA_LIMIT,'Retain this complete original native record: '+name);
  const path=join(root.directory,name), content=await bytes(dirname(path),basename(path),METADATA_LIMIT);
  if (content.length !== entry.size || digest(content) !== entry.sha256)
    fail(CHANGED,'An authenticated original native record changed: '+name);
  return {content,value:decode(content),row:{name:basename(name),bytes:content.length,sha256:entry.sha256}};
}
function recordRow(value,name) { return {name,bytes:value.content.length,sha256:digest(value.content)}; }
function primaryName(kind) { return kind === 'archive' ? 'received.json' : 'records/payload.json'; }
function sidecarName(kind, primarySha256, identity) {
  fileIdentity(identity); hash(primarySha256);
  return 'records/recovery-'+kind+'-'+digest(Buffer.from(canonical({
    kind,recordSha256:primarySha256,device:identity.device,inode:identity.inode,
  })))+'.json';
}
function bindingValue(value) {
  exact(value,['schema','snapshotSha256','operationId','root','directory','kind','file','complete','records'],
    ['schema','snapshotSha256','operationId','root','directory','kind','file','complete','records']);
  requireValue(value.schema === BINDING_SCHEMA && ['archive','upload'].includes(value.kind),
    'Use the original recovered-file binding format.');
  hash(value.snapshotSha256); label(value.operationId); label(value.root); relativeName(value.directory,true);
  requireValue(typeof value.complete === 'boolean' && (value.kind !== 'archive' || value.complete),
    'Retain the original completed or growing-file state.');
  exact(value.file,['name','bytes','sha256','identity'],['name','bytes','sha256','identity']);
  requireValue(value.file.name === (value.kind === 'archive' ? ARCHIVE : PAYLOAD),'The binding names another native file.');
  count(value.file.bytes); hash(value.file.sha256); fileIdentity(value.file.identity);
  requireValue(value.file.bytes === value.file.identity.bytes,'The recovered file length differs from its pinned identity.');
  const expected=value.kind === 'archive'?['operation.json','received.json']:
    ['operation.json','records/payload.json',...(value.complete?['received.json']:[])];
  requireValue(Array.isArray(value.records) && value.records.length === expected.length,
    'Retain every original immutable record in the recovered binding.');
  for (const [index,row] of value.records.entries()) {
    exact(row,['name','bytes','sha256'],['name','bytes','sha256']);
    requireValue(row.name === expected[index] && count(row.bytes) <= METADATA_LIMIT,
      'The original immutable-record roster differs.');
    hash(row.sha256);
  }
  return value;
}
function recordPrimary(binding) { return binding.records.find(row=>row.name === primaryName(binding.kind)); }
function summary(binding,name,sha256) {
  return {root:binding.root,name,kind:binding.kind,file:inRoot(binding.directory,binding.file.name),
    bytes:binding.file.bytes,sha256:binding.file.sha256,identity:binding.file.identity,
    complete:binding.complete,sidecarSha256:sha256,
    records:binding.records.map(row=>({...row,name:inRoot(binding.directory,row.name)}))};
}
async function checkRecords(root,binding,expected={}) {
  for (const row of binding.records) {
    const content=await bytes(root,row.name,METADATA_LIMIT);
    if (content.length !== row.bytes || digest(content) !== row.sha256 ||
        Object.hasOwn(expected,row.name) && canonical(decode(content)) !== canonical(expected[row.name]))
      fail(CHANGED,'An original immutable handover record changed after recovery: '+row.name);
  }
}
function matchesIdentity(binding,identity,mode) {
  fileIdentity(identity);
  if (mode === 'complete' && !binding.complete) return false;
  if (binding.complete || mode === 'complete' || identity.bytes === binding.file.bytes)
    return canonical(binding.file.identity) === canonical(identity);
  return identity.device === binding.file.identity.device && identity.inode === binding.file.identity.inode &&
    identity.bytes > binding.file.bytes;
}
/** Fast native reopen: original records remain authoritative; a recovered prefix may only grow. */
export async function matchCapturedHandoverRecovery(root,{kind,file,identity,records,mode='complete'}) {
  requireValue(['archive','upload'].includes(kind) && ['payload','complete'].includes(mode) &&
    (mode !== 'payload' || kind === 'upload'),'Choose the original native recovered-file state.');
  requireValue(file === (kind === 'archive'?ARCHIVE:PAYLOAD),'Use the original native archive or payload name.');
  identity=captured(identity); records=captured(records);
  fileIdentity(identity); root=await directory(root);
  const primary=primaryName(kind), original=await bytes(root,primary,METADATA_LIMIT);
  requireValue(records && Object.hasOwn(records,primary),'Supply the original primary record for this native file.');
  if (canonical(decode(original)) !== canonical(records[primary]))
    fail(CHANGED,'The selected original handover record changed while reopening.');
  const name=sidecarName(kind,digest(original),identity);
  if (!await present(join(root,name))) return false;
  const binding=bindingValue(decode(await bytes(root,name,METADATA_LIMIT)));
  if (binding.kind !== kind || binding.file.name !== file ||
      sidecarName(kind,recordPrimary(binding).sha256,binding.file.identity) !== name ||
      !matchesIdentity(binding,identity,mode)) return false;
  for (const name of Object.keys(records))
    if (!binding.records.some(row=>row.name === name)) return false;
  await checkRecords(root,binding,records);
  return true;
}
function archiveRecords(operation,result,file) {
  requireValue(operation.schema === ARCHIVE_OPERATION && operation.mode === 'export' &&
    HASH.test(operation.manifestSha256 ?? '') && result.schema === ARCHIVE_COMPLETE && result.mode === 'export' &&
    result.manifestSha256 === operation.manifestSha256 && HASH.test(result.handoverId ?? '') &&
    result.file?.name === ARCHIVE && result.file.bytes === file.size && result.file.sha256 === file.sha256,
    'The authenticated archive completion differs from its complete original file.');
  fileIdentity(result.file.identity);
  requireValue(result.file.identity.bytes === file.size,'The original archive completion length differs.');
}
function uploadRecords(operation,payload,complete,file,operationDirectory) {
  exact(operation,['schema','id','name','totalBytes','expectedSha256'],['schema','id','name','totalBytes']);
  requireValue(operation.schema === UPLOAD_OPERATION && UUID.test(operation.id ?? '') &&
    operation.id === basename(operationDirectory) && count(operation.totalBytes) > 0 &&
    typeof operation.name === 'string' && operation.name === operation.name.trim() && operation.name &&
    Buffer.byteLength(operation.name) <= 255 && !/[\\/\x00-\x1f\x7f]/.test(operation.name) &&
    !operation.name.startsWith('.') && operation.name.toLowerCase().endsWith('.sfhandover') &&
    file.size <= operation.totalBytes,'Retain the complete original upload input and payload length.');
  if (operation.expectedSha256 !== undefined) hash(operation.expectedSha256);
  exact(payload,['schema','device','inode'],['schema','device','inode']);
  requireValue(payload.schema === UPLOAD_PAYLOAD && typeof payload.device === 'string' && typeof payload.inode === 'string' &&
    payload.device.length <= 40 && payload.inode.length <= 40 && /^(0|[1-9][0-9]*)$/.test(payload.device) &&
    /^(0|[1-9][0-9]*)$/.test(payload.inode),'Retain the original upload payload record.');
  if (complete) {
    requireValue(complete.schema === UPLOAD_COMPLETE && complete.id === operation.id &&
      complete.inputSha256 === digest(Buffer.from(canonical(operation))) &&
      complete.bytes === operation.totalBytes && complete.bytes === file.size && complete.sha256 === file.sha256 &&
      (operation.expectedSha256 === undefined || operation.expectedSha256 === complete.sha256),
      'The authenticated completed upload differs from its original input and payload.');
    fileIdentity(complete.identity);
    requireValue(complete.identity.bytes === file.size,'The original completed upload length differs.');
  }
}
function pendingRecord(value,metadata,size) {
  exact(value,['schema','offset','bytes','sha256'],['schema','offset','bytes','sha256']);
  count(value.offset); count(value.bytes); hash(value.sha256);
  requireValue(value.schema === UPLOAD_CHUNK && value.bytes > 0 && value.bytes <= 1024*1024 &&
    Number.isSafeInteger(value.offset+value.bytes) && value.offset+value.bytes <= metadata.totalBytes &&
    size >= value.offset && size <= value.offset+value.bytes,
    'Retain the original pending chunk and its complete placed prefix.');
}
function declaredDirectories(root,name,selected) {
  let parent=parentName(name);
  while (parent) {
    const entry=root.entries.get(parent), key=root.name+'\0'+parent;
    if (entry) requireValue(entry.kind === 'directory','A recovered sidecar parent conflicts with an original file.');
    else selected.set(key,{root:root.name,name:parent});
    parent=parentName(parent);
  }
}
async function existingSidecar(root,name,expected) {
  const entry=root.entries.get(name);
  if (!entry) {
    if (await present(join(root.directory,name)))
      fail(CHANGED,'A sidecar outside the original authenticated snapshot already exists: '+name);
    return false;
  }
  requireValue(entry.kind === 'file','The recovered sidecar path conflicts with an original directory.');
  const old=await declaredJSON(root,name), binding=bindingValue(old.value);
  if (binding.kind !== expected.kind || binding.directory !== expected.directory || binding.root !== expected.root ||
      canonical(binding.file) !== canonical(expected.file) || binding.complete !== expected.complete ||
      canonical(binding.records) !== canonical(expected.records))
    fail(CHANGED,'An existing original sidecar binds a different restored file.');
  return true;
}
/** Pure preparation reads authenticated placed bytes; it creates no files or directories. */
export async function prepareCapturedHandoverRecovery(input) {
  input=captured(input); exact(input,['snapshotSha256','operationId','roots'],['snapshotSha256','operationId','roots']);
  hash(input.snapshotSha256); label(input.operationId);
  const roots=rootsInput(input.roots,true), files=[], bindings=[], directories=new Map();
  const {openHandoverFile,hashHandoverFile,readHandoverRange}=await import('./handover-archive.mjs');
  for (const root of roots.values()) {
    if (root.fileRoot) continue;
    await originalRoot(root);
    const operations=[...root.entries.values()].filter(row=>row.kind === 'file' &&
      (row.relative === 'operation.json' || row.relative.endsWith('/operation.json'))).sort((a,b)=>a.relative.localeCompare(b.relative));
    for (const item of operations) {
      const prefix=parentName(item.relative), fileAt=name=>root.entries.get(inRoot(prefix,name));
      if (!fileAt(ARCHIVE) && !fileAt(PAYLOAD)) continue;
      const op=await declaredJSON(root,item.relative), metadata=op.value;
      if (metadata?.schema !== ARCHIVE_OPERATION && metadata?.schema !== UPLOAD_OPERATION) continue;
      const kind=metadata.schema === ARCHIVE_OPERATION?'archive':'upload', fileName=kind === 'archive'?ARCHIVE:PAYLOAD;
      if (kind === 'archive' && metadata.mode !== 'export') continue;
      const completionEntry=fileAt('received.json'), payloadEntry=fileAt('records/payload.json');
      if (kind === 'archive' && !completionEntry) continue;
      const file=fileAt(fileName);
      if (kind === 'upload' && !payloadEntry) {
        requireValue(!file || file.kind === 'file' && file.size === 0,
          'An original upload has nonempty bytes without its retained payload record.');
        continue;
      }
      requireValue(file?.kind === 'file','The original native file is absent from the authenticated snapshot.');
      const complete=completionEntry?await declaredJSON(root,inRoot(prefix,'received.json')):null;
      const payload=kind === 'upload'?await declaredJSON(root,inRoot(prefix,'records/payload.json')):null;
      if (kind === 'archive') archiveRecords(metadata,complete.value,file);
      else uploadRecords(metadata,payload.value,complete?.value,file,join(root.directory,prefix));
      const rows=[recordRow(op,'operation.json'),...(payload?[recordRow(payload,'records/payload.json')]:[]),
        ...(complete?[recordRow(complete,'received.json')]:[])];
      const held=await openHandoverFile(join(root.directory,prefix,fileName),{expectedBytes:file.size});
      try {
        if (await hashHandoverFile(held) !== file.sha256)
          fail(CHANGED,'The restored native file differs from the complete authenticated snapshot: '+inRoot(prefix,fileName));
        if (kind === 'upload' && fileAt('records/pending-chunk.json')) {
          requireValue(!complete,'A completed original upload still contains a pending chunk.');
          const pending=await declaredJSON(root,inRoot(prefix,'records/pending-chunk.json'));
          pendingRecord(pending.value,metadata,file.size);
          if (file.size === pending.value.offset+pending.value.bytes &&
              digest(await readHandoverRange(held,pending.value.offset,pending.value.bytes)) !== pending.value.sha256)
            fail(CHANGED,'The restored completed pending chunk differs from its original SHA-256.');
        }
        const normal=kind === 'archive'?canonical(held.identity) === canonical(complete.value.file.identity):
          payload.value.device === held.identity.device && payload.value.inode === held.identity.inode &&
          (!complete || canonical(held.identity) === canonical(complete.value.identity));
        if (normal) continue;
        const binding={schema:BINDING_SCHEMA,snapshotSha256:input.snapshotSha256,operationId:input.operationId,
          root:root.name,directory:prefix,kind,file:{name:fileName,bytes:file.size,sha256:file.sha256,identity:held.identity},
          complete:!!complete,records:rows};
        bindingValue(binding);
        const name=inRoot(prefix,sidecarName(kind,recordPrimary(binding).sha256,held.identity));
        if (await existingSidecar(root,name,binding)) continue;
        const content=encode(binding);
        requireValue(content.length <= METADATA_LIMIT,'The complete restored-file binding exceeds the native metadata limit.');
        const row={root:root.name,name,contentBase64:content.toString('base64'),bytes:content.length,sha256:digest(content)};
        files.push(row); bindings.push(summary(binding,name,row.sha256)); declaredDirectories(root,name,directories);
        await held.assertHeld({stable:true});
      } finally { await held.close(); }
    }
  }
  const plannedDirectories=[...directories.values()].sort((a,b)=>a.root.localeCompare(b.root) ||
    a.name.split('/').length-b.name.split('/').length || a.name.localeCompare(b.name));
  const result={schema:CAPTURED_HANDOVER_RECOVERY_SCHEMA,snapshotSha256:input.snapshotSha256,
    operationId:input.operationId,directories:plannedDirectories,files,bindings};
  requireValue(encode(result).length <= METADATA_LIMIT,'The complete original file-binding plan exceeds 64 MiB.');
  return result;
}
function completePlan(value) {
  value=captured(value);
  exact(value,['schema','snapshotSha256','operationId','directories','files','bindings'],
    ['schema','snapshotSha256','operationId','directories','files','bindings']);
  requireValue(value.schema === CAPTURED_HANDOVER_RECOVERY_SCHEMA,'Retain the original complete recovered-file plan.');
  hash(value.snapshotSha256); label(value.operationId);
  requireValue(Array.isArray(value.directories) && Array.isArray(value.files) && Array.isArray(value.bindings),
    'Retain the complete recovered directories, files and bindings.');
  const seen=new Set(), directories=new Set(), files=[];
  for (const row of value.directories) {
    exact(row,['root','name'],['root','name']); label(row.root); childName(row.name);
    const key=row.root+'\0'+row.name; requireValue(!seen.has(key),'A recovered directory is repeated.');
    seen.add(key); directories.add(key);
  }
  for (const row of value.files) {
    exact(row,['root','name','contentBase64','bytes','sha256'],['root','name','contentBase64','bytes','sha256']);
    label(row.root); childName(row.name); count(row.bytes); hash(row.sha256);
    const key=row.root+'\0'+row.name; requireValue(!seen.has(key),'A recovered sidecar path is repeated or conflicts.');
    seen.add(key);
    requireValue(typeof row.contentBase64 === 'string' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.contentBase64),
      'Retain the complete original base64 binding bytes.');
    const content=Buffer.from(row.contentBase64,'base64');
    requireValue(content.length === row.bytes && row.bytes > 0 && row.bytes <= METADATA_LIMIT &&
      content.toString('base64') === row.contentBase64 && digest(content) === row.sha256,
      'The original complete binding file bytes changed.');
    const binding=bindingValue(decode(content));
    requireValue(binding.snapshotSha256 === value.snapshotSha256 && binding.operationId === value.operationId &&
      binding.root === row.root && inRoot(binding.directory,sidecarName(binding.kind,recordPrimary(binding).sha256,binding.file.identity)) === row.name,
      'The retained sidecar differs from its original complete recovery plan.');
    files.push({row,content,binding});
  }
  requireValue(canonical(files.map(x=>summary(x.binding,x.row.name,x.row.sha256))) === canonical(value.bindings),
    'The complete recovered-file plan summary changed.');
  for (const row of value.directories)
    requireValue(files.some(file=>file.row.root === row.root && file.row.name.startsWith(row.name+'/')),
      'Create only a directory required by an original planned sidecar.');
  return {value,files,directories};
}
function sameFile(a,b) { return a.dev === b.dev && a.ino === b.ino; }
function linkedFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077n) && [1n,2n].includes(stat.nlink);
}
/** Complete only this planned sidecar's own exact stage; no other publication is touched. */
async function publishBinding(path,content) {
  const stage=path+'.'+digest(content)+'.recovery-partial', parent=await directory(dirname(path));
  const {openHandoverFile,readHandoverRange,writeHandoverBytes,syncAndCloseHandoverFile}=await import('./handover-archive.mjs');
  if (await present(stage) && await present(path)) {
    const a=await lstat(stage,{bigint:true}),b=await lstat(path,{bigint:true});
    if (linkedFile(a) && linkedFile(b) && sameFile(a,b) && a.nlink === 2n && b.nlink === 2n) {
      await unlink(stage); await syncDirectory(parent);
    }
  }
  if (await present(path)) {
    if (!(await bytes(parent,basename(path),METADATA_LIMIT)).equals(content))
      fail(CHANGED,'An existing recovered sidecar contains different original bytes.');
    if (await present(stage)) {
      const held=await openHandoverFile(stage);
      try {
        if (held.bytes > content.length || !(await readHandoverRange(held,0,held.bytes)).equals(content.subarray(0,held.bytes)))
          fail(CHANGED,'A retained sidecar stage belongs to another complete input.');
        await held.assertHeld({stable:true});
      } finally { await held.close(); }
      await unlink(stage);
    }
    await syncDirectory(parent); return;
  }
  if (!await present(stage)) {
    const created=await open(stage,C.O_CREAT|C.O_EXCL|C.O_RDWR|C.O_NOFOLLOW,0o600);
    await syncAndCloseHandoverFile(created); await syncDirectory(parent);
  }
  const held=await openHandoverFile(stage,{writable:true});
  try {
    if (held.bytes > content.length || !(await readHandoverRange(held,0,held.bytes)).equals(content.subarray(0,held.bytes)))
      fail(CHANGED,'The original sidecar prefix differs from its retained plan.');
    await writeHandoverBytes(held.handle,content.subarray(held.bytes),held.bytes);
    await held.handle.sync();
    const stat=await held.assertHeld({stable:false});
    if (Number(stat.size) !== content.length) fail(CHANGED,'The completed sidecar length changed.');
  } finally { await held.close(); }
  try { await link(stage,path); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await bytes(parent,basename(path),METADATA_LIMIT)).equals(content)) throw error;
  }
  await unlink(stage); await syncDirectory(parent);
  if (!(await bytes(parent,basename(path),METADATA_LIMIT)).equals(content))
    fail(CHANGED,'The original recovered sidecar publication changed.');
}
/** Apply only the exact persisted additions after full original SF101 placement. */
export async function applyCapturedHandoverRecovery(plan,{roots:providedRoots}) {
  const prepared=completePlan(plan), roots=rootsInput(providedRoots,false);
  const {openHandoverFile}=await import('./handover-archive.mjs');
  for (const row of prepared.value.directories) {
    const root=roots.get(row.root); requireValue(root && !root.fileRoot,'A planned recovery directory has no original directory root.');
    await originalRoot(root);
    const path=join(root.directory,row.name);
    await directory(dirname(path)); await directory(path,true);
  }
  for (const {row,content,binding} of prepared.files) {
    const root=roots.get(row.root); requireValue(root && !root.fileRoot,'A planned recovered file has no original directory root.');
    await originalRoot(root);
    const nativeRoot=join(root.directory,binding.directory), path=join(nativeRoot,binding.file.name);
    const held=await openHandoverFile(path,{expectedBytes:binding.file.bytes});
    try {
      if (canonical(held.identity) !== canonical(binding.file.identity))
        fail(CHANGED,'The placed native file changed after preparing its original recovery binding.');
      await checkRecords(nativeRoot,binding);
      await publishBinding(join(root.directory,row.name),content);
      await held.assertHeld({stable:true});
    } finally { await held.close(); }
  }
  return {schema:APPLIED_SCHEMA,snapshotSha256:prepared.value.snapshotSha256,
    operationId:prepared.value.operationId,directories:prepared.value.directories,
    files:prepared.value.files.map(({contentBase64,...row})=>row),bindings:prepared.value.bindings};
}
