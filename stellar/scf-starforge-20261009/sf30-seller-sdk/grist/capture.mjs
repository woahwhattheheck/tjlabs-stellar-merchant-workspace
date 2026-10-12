// MIT. Exact, resumable Grist reads and complete immutable capture portability.
import { dirname, join, resolve } from 'node:path';
import { mkdir, readdir, rename, lstat, unlink, rmdir, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { object, bytes, digest, identity, readPrivate, privateDirectory, syncDirectory, acquireWorkspace, fault, stamp } from '../postgres/publisher/files.mjs';
import { MAX_CAPTURE_BYTES, MAX_PAGE_BYTES, HASH, SCALAR_TYPES, binding, sourceSelection, compileQueries, integer, only, identifier, restOptions } from './declaration.mjs';
import { createGristReader, documentRequest, stateRequest, metadataRequest, recordsRequest, checkedHeaders,
  inspectTableBytes, inspectDocumentBytes, inspectStateBytes, responseKind } from './http.mjs';
import { parseGristRecords, recordIdentity, identityDigest, projectedGristValue } from './values.mjs';

const MANIFEST_LIMIT = 16777216;
const STEPS=['document-before','state-before','table-before','records','records-after','table-after','state-after','document-after'];
const requests=s=>[documentRequest(s),stateRequest(s),metadataRequest(s),recordsRequest(s),recordsRequest(s),metadataRequest(s),stateRequest(s),documentRequest(s)];
const FILE = name => 'resources/' + name + '/body.json';
const json = content => {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
  catch { throw fault('GRIST_CAPTURE_JSON_INVALID'); }
};
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
async function exists(path) { try { await lstat(path); return true; } catch (issue) { if (issue.code === 'ENOENT') return false; throw issue; } }
async function completeFile(path, content) {
  if (await exists(path)) {
    const old = await readPrivate(path, Math.max(content.length, MANIFEST_LIMIT));
    if (!old.equals(content)) throw fault('GRIST_RETAINED_MEMBER_CHANGED', 'An existing private member belongs to different bytes; it was preserved.');
    return;
  }
  const temp = join(dirname(path), '.write-' + randomUUID());
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  // All callers hold the directory's original kernel lease. A complete temporary
  // file becomes visible in one rename; incomplete writes never occupy the member.
  if (await exists(path)) {
    const old = await readPrivate(path, Math.max(content.length, MANIFEST_LIMIT));
    if (!old.equals(content)) throw fault('GRIST_RETAINED_MEMBER_CHANGED');
    await unlink(temp); return;
  }
  await rename(temp, path); await syncDirectory(dirname(path));
}
async function discardUnpublished(dir) {
  // Only this writer's unpublished names are eligible, under its exclusive lease.
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (/^\.write-[a-f0-9-]{36}$/.test(entry.name) && entry.isFile()) await unlink(join(dir, entry.name));
    if (/^\.step-[a-z0-9-]+-[a-f0-9-]{36}$/.test(entry.name) && entry.isDirectory()) {
      const stage = join(dir, entry.name), leaves = await readdir(stage, { withFileTypes: true });
      if (leaves.some(item => !item.isFile() || !['body.json', 'receipt.json'].includes(item.name))) throw fault('GRIST_UNPUBLISHED_STAGE_CHANGED');
      // A complete receipt is the durable result of this original request. Leave
      // it for that exact step's request/size/hash reconciliation before reading.
      // A crash during the receipt write has no complete binding and can resume.
      if (leaves.length === 2) {
        let completeReceipt = true;
        try { json(await readPrivate(join(stage, 'receipt.json'), MANIFEST_LIMIT)); }
        catch (issue) {
          if (issue.code !== 'GRIST_CAPTURE_JSON_INVALID') throw issue;
          completeReceipt = false;
        }
        if (completeReceipt) continue;
      }
      for (const item of leaves) await unlink(join(stage, item.name));
      await rmdir(stage);
    }
  }
}
async function reconcileStagedStep(root, name, request) {
  const prefix = '.step-' + name + '-', target = join(root, name);
  const candidates = (await readdir(root, { withFileTypes: true })).filter(entry =>
    entry.name.startsWith(prefix) && /^[a-f0-9-]{36}$/.test(entry.name.slice(prefix.length)));
  let accepted = null;
  if (await exists(target)) {
    await privateDirectory(target);
    const receipt = json(await readPrivate(join(target, 'receipt.json'), MANIFEST_LIMIT));
    checkedDescriptor(receipt, name, request);
    const content = await readPrivate(join(target, 'body.json'), MAX_PAGE_BYTES);
    if (content.length !== receipt.bytes || digest(content) !== receipt.sha256) throw fault('GRIST_RETAINED_STEP_CHANGED');
    accepted = { receipt, content };
  }
  for (const entry of candidates) {
    if (!entry.isDirectory()) throw fault('GRIST_UNPUBLISHED_STAGE_CHANGED');
    const stage = join(root, entry.name); await privateDirectory(stage);
    const leaves = await readdir(stage, { withFileTypes: true });
    if (leaves.length !== 2 || leaves.some(item => !item.isFile() || !['body.json', 'receipt.json'].includes(item.name)))
      throw fault('GRIST_UNPUBLISHED_STAGE_CHANGED');
    const receipt = json(await readPrivate(join(stage, 'receipt.json'), MANIFEST_LIMIT));
    checkedDescriptor(receipt, name, request);
    const content = await readPrivate(join(stage, 'body.json'), MAX_PAGE_BYTES);
    if (content.length !== receipt.bytes || digest(content) !== receipt.sha256) throw fault('GRIST_RETAINED_STEP_CHANGED');
    if (accepted) {
      if (identity(receipt) !== identity(accepted.receipt) || !content.equals(accepted.content))
        throw fault('GRIST_STAGED_STEP_CONFLICT', 'Different retained observations occupy this step. All bytes were preserved; no new provider request was made.');
      await unlink(join(stage, 'body.json')); await unlink(join(stage, 'receipt.json')); await rmdir(stage);
    } else {
      // The original kernel lease excludes another capture writer. Publish only
      // this exact already-received step; a later resume reads the same target.
      await rename(stage, target);
      accepted = { receipt, content };
    }
    await syncDirectory(root);
  }
}

function selectionShape(value) {
  only(value,['server','apiVersion','docId','tableId','filter','sourceOrder','fields'],'GRIST_CAPTURE_SELECTION_INVALID');
  if(!Array.isArray(value.fields)||!value.fields.length||value.fields.length>2048)throw fault('GRIST_CAPTURE_FIELDS_INVALID');
  const ids=new Set();
  for(const field of value.fields){only(field,['id','type'],'GRIST_CAPTURE_FIELDS_INVALID');identifier(field.id,'FIELD_ID');
    if(!SCALAR_TYPES.has(field.type)||ids.has(field.id)||field.id==='id')throw fault('GRIST_CAPTURE_FIELDS_INVALID');ids.add(field.id);}
  if(identity({...binding(value),fields:value.fields})!==identity(value))throw fault('GRIST_CAPTURE_SELECTION_INVALID');
  return value;
}
function descriptor(name,observed) {
  return{file:FILE(name),bytes:observed.content.length,sha256:digest(observed.content),
    receivedAt:observed.receivedAt,request:observed.request,headers:observed.headers};
}
function checkedDescriptor(value,name,request) {
  only(value,['file','bytes','sha256','receivedAt','request','headers'],'GRIST_CAPTURE_RESOURCE_INVALID');
  if(value.file!==FILE(name)||!HASH.test(value.sha256??'')||!validTime(value.receivedAt)||identity(value.request)!==identity(request))
    throw fault('GRIST_CAPTURE_REQUEST_CHANGED');
  integer(value.bytes,1,MAX_PAGE_BYTES,'GRIST_CAPTURE_RESOURCE_SIZE_INVALID');checkedHeaders(value.headers);
}
function validateRows(response,selection,table,maximum) {
  const fields=new Set(table.fields.map(x=>x.id)),selected=new Set(selection.fields.map(x=>x.id));
  if(response.records.length>maximum)throw fault('GRIST_CAPTURE_TOO_MANY_ROWS');
  for(const row of response.records){
    for(const key of selected)if(!Object.hasOwn(row.fields,key))throw fault('GRIST_SELECTED_FIELD_MISSING');
    if(Object.keys(row.fields).some(key=>!fields.has(key)))throw fault('GRIST_UNDECLARED_RESPONSE_FIELD');
  }
  if(selection.sourceOrder.length===1){
    const desc=selection.sourceOrder[0].direction==='desc';
    for(let i=1;i<response.records.length;i++){
      const a=BigInt(response.records[i-1].id),b=BigInt(response.records[i].id);
      if(desc?a<=b:a>=b)throw fault('GRIST_NATIVE_ID_ORDER_CHANGED');
    }
  }
  return response.records;
}
function compareObservations(selection,contents,maximum) {
  const firstDoc=inspectDocumentBytes(contents[0],selection),firstState=inspectStateBytes(contents[1]);
  const firstTable=inspectTableBytes(contents[2],selection,selection.fields);
  const records=validateRows(parseGristRecords(contents[3]),selection,firstTable.table,maximum);
  const repeated=validateRows(parseGristRecords(contents[4]),selection,firstTable.table,maximum);
  const lastTable=inspectTableBytes(contents[5],selection,selection.fields),lastState=inspectStateBytes(contents[6]);
  const lastDoc=inspectDocumentBytes(contents[7],selection);
  if(identity(firstDoc)!==identity(lastDoc))throw fault('GRIST_DOCUMENT_CHANGED_DURING_CAPTURE');
  if(identity(firstState)!==identity(lastState))throw fault('GRIST_DOCUMENT_STATE_CHANGED_DURING_CAPTURE');
  if(firstTable.schemaSha256!==lastTable.schemaSha256)throw fault('GRIST_SCHEMA_CHANGED_DURING_CAPTURE');
  // Both complete native responses are retained. Exact original response bytes
  // distinguish numeric lexemes, encoded errors, ordering, and every visible field.
  if(digest(contents[3])!==digest(contents[4])||repeated.length!==records.length)
    throw fault('GRIST_RECORDS_CHANGED_DURING_CAPTURE','The two complete typed responses differ. Preserve this read and explicitly capture again after the source settles.');
  return{document:firstDoc,documentState:firstState,table:firstTable.table,schemaSha256:firstTable.schemaSha256,records};
}
const manifestDescriptors=manifest=>manifest.resources;
async function validateCapture(manifestBytes,readResource,manifestFile=null,expectedHash) {
  if(!Buffer.isBuffer(manifestBytes)||manifestBytes.length>MANIFEST_LIMIT)throw fault('GRIST_CAPTURE_MANIFEST_TOO_LARGE');
  if(expectedHash!==undefined&&digest(manifestBytes)!==expectedHash)throw fault('GRIST_CAPTURE_MANIFEST_CHANGED');
  const m=json(manifestBytes);
  only(m,['schema','provider','apiVersion','transport','method','readOnly','complete','responseKind','atomicSourceSnapshot',
    'selection','selectionSha256','startedAt','completedAt','resources','schemaSha256','document','documentState',
    'authorization','visibility','documentStateVerified','repeatReadVerified','countVerified',
    'rowCount','pageCount','sourceBytes','recordIdentitiesSha256','recordsSha256'],'GRIST_CAPTURE_MANIFEST_INVALID');
  if(m.schema!=='stellar-forge.grist-capture.v1'||m.provider!=='grist'||m.apiVersion!=='unversioned'||m.transport!=='grist-rest'||
      m.method!=='GET'||m.readOnly!==true||m.complete!==true||m.responseKind!==responseKind()||m.atomicSourceSnapshot!==false||
      m.documentStateVerified!==true||m.repeatReadVerified!==true||m.countVerified!==false||m.visibility!=='credential-visible-table-records'||
      !['anonymous','bearer'].includes(m.authorization)||!HASH.test(m.schemaSha256??'')||!HASH.test(m.recordsSha256??'')||
      !HASH.test(m.recordIdentitiesSha256??'')||!validTime(m.startedAt)||!validTime(m.completedAt)||Date.parse(m.startedAt)>Date.parse(m.completedAt))
    throw fault('GRIST_CAPTURE_MANIFEST_INVALID');
  const selection=selectionShape(m.selection);
  if(identity(selection)!==m.selectionSha256||m.pageCount!==1||!Array.isArray(m.resources)||m.resources.length!==STEPS.length)throw fault('GRIST_CAPTURE_SELECTION_CHANGED');
  integer(m.rowCount,0,1000000,'GRIST_CAPTURE_ROW_COUNT_INVALID');integer(m.sourceBytes,1,MAX_CAPTURE_BYTES,'GRIST_CAPTURE_BYTES_INVALID');
  const expected=requests(selection),resources=new Map(),contents=[];let total=0,lastTime=Date.parse(m.startedAt);
  for(let i=0;i<STEPS.length;i++){
    const item=m.resources[i];checkedDescriptor(item,STEPS[i],expected[i]);
    const time=Date.parse(item.receivedAt);
    if(time<lastTime||time>Date.parse(m.completedAt))throw fault('GRIST_CAPTURE_TIME_ORDER_INVALID');lastTime=time;
    const content=await readResource(item.file);
    if(!Buffer.isBuffer(content)||content.length!==item.bytes||digest(content)!==item.sha256)throw fault('GRIST_CAPTURE_RESOURCE_CHANGED');
    total+=content.length;if(total>m.sourceBytes)throw fault('GRIST_CAPTURE_BYTES_CHANGED');
    resources.set(item.file,content);contents.push(content);
  }
  const checked=compareObservations(selection,contents,m.rowCount);
  if(total!==m.sourceBytes||checked.records.length!==m.rowCount||checked.schemaSha256!==m.schemaSha256||
      identity(checked.document)!==identity(m.document)||identity(checked.documentState)!==identity(m.documentState)||
      identityDigest(checked.records)!==m.recordIdentitiesSha256||digest(contents[3])!==m.recordsSha256)throw fault('GRIST_CAPTURE_CONTENT_CHANGED');
  return{manifest:m,manifestBytes,manifestFile,manifestSha256:digest(manifestBytes),resources,records:checked.records,table:checked.table};
}
export async function readGristCapture(filename,expectedHash) {
  return validateCapture(await readPrivate(filename,MANIFEST_LIMIT),file=>readPrivate(join(dirname(filename),file),MAX_PAGE_BYTES),filename,expectedHash);
}
export function bindGristCapture(capture,config) {
  if(identity(sourceSelection(config))!==capture.manifest.selectionSha256)throw fault('GRIST_CAPTURE_SELECTION_MISMATCH','Retain exact site, document, table, native filter/order and field/type union. Public aliases and encodings may change after full review.');
  return capture.records;
}
export async function captureGristSource(config,directory,{resume=false,...options}={}) {
  const queries=compileQueries(config.queries),selection=sourceSelection(config,queries),limits=restOptions(config);
  await privateDirectory(dirname(directory));const present=await exists(directory);
  if(present&&!resume)throw fault('GRIST_CAPTURE_EXISTS','Resume the original capture directory, or choose a new explicit observation.');
  if(!present)await mkdir(directory,{mode:0o700});await privateDirectory(directory);const release=await acquireWorkspace(directory);
  const intentFile=join(directory,'intent.json');let startedAt=stamp(),sourceBytes=0,completedSteps=0;
  try{
    const baseIntent={schema:'stellar-forge.grist-capture-intent.v1',selection,limits:{...limits,tokenEnv:undefined}};
    let saved=null;
    if(await exists(intentFile)){
      saved=json(await readPrivate(intentFile));
      if(identity(saved.intent)!==identity(baseIntent)||!validTime(saved.startedAt))throw fault('GRIST_CAPTURE_INTENT_CHANGED');
      startedAt=saved.startedAt;
    }else{
      if(present&&(await readdir(directory)).some(name=>name!=='publisher.lock'&&!/^\.write-[a-f0-9-]{36}$/.test(name)))
        throw fault('GRIST_CAPTURE_DIRECTORY_NOT_OWNED');
      await discardUnpublished(directory);
    }
    if(await exists(join(directory,'capture.json'))){
      if(!saved)throw fault('GRIST_CAPTURE_INTENT_REQUIRED');
      const retained=await readGristCapture(join(directory,'capture.json'));bindGristCapture(retained,config);
      for(const row of retained.records)for(const query of Object.values(queries))for(const spec of Object.values(query.projection))projectedGristValue(row,spec);
      return retained;
    }
    const reader=createGristReader(config,options);
    if(saved){
      if(saved.credentialBinding!==reader.credentialBinding)throw fault('GRIST_CAPTURE_AUTHORITY_CHANGED','An interrupted capture cannot mix credentials. Preserve it and explicitly begin a fresh read with the new account or token.');
    }else{
      await completeFile(intentFile,bytes({intent:baseIntent,startedAt,credentialBinding:reader.credentialBinding}));
    }
    await discardUnpublished(directory);
    const resourcesRoot=join(directory,'resources');await privateDirectory(resourcesRoot,true);await discardUnpublished(resourcesRoot);
    const resources=new Map(),receipts=[],contents=[];
    const requested=requests(selection);
    for(let index=0;index<STEPS.length;index++){
      const name=STEPS[index],request=requested[index];await reconcileStagedStep(resourcesRoot,name,request);
      const target=join(resourcesRoot,name);let receipt,content;
      if(await exists(target)){
        await privateDirectory(target);receipt=json(await readPrivate(join(target,'receipt.json'),MANIFEST_LIMIT));checkedDescriptor(receipt,name,request);
        content=await readPrivate(join(target,'body.json'),MAX_PAGE_BYTES);
        if(content.length!==receipt.bytes||digest(content)!==receipt.sha256)throw fault('GRIST_RETAINED_STEP_CHANGED');
      }else{
        const observed=await reader.read(request);content=observed.content;
        if(sourceBytes+content.length>limits.maxCaptureBytes)throw fault('GRIST_CAPTURE_TOO_LARGE');
        receipt=descriptor(name,observed);
        const stage=join(resourcesRoot,'.step-'+name+'-'+randomUUID());await mkdir(stage,{mode:0o700});
        for(const[filename,body]of[['body.json',content],['receipt.json',bytes(receipt)]]){
          const handle=await open(join(stage,filename),'wx',0o600);try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}
        }
        await syncDirectory(stage);
        if(await exists(target))throw fault('GRIST_STEP_ALREADY_PRESENT');
        await rename(stage,target);await syncDirectory(resourcesRoot);
      }
      sourceBytes+=content.length;if(sourceBytes>limits.maxCaptureBytes)throw fault('GRIST_CAPTURE_TOO_LARGE');
      resources.set(receipt.file,content);receipts.push(receipt);contents.push(content);completedSteps++;
      if(index===0)inspectDocumentBytes(content,selection);
      if(index===1)inspectStateBytes(content);
      if(index===2)inspectTableBytes(content,selection,selection.fields);
      if(index===3||index===4)validateRows(parseGristRecords(content),selection,inspectTableBytes(contents[2],selection,selection.fields).table,limits.maxRows);
    }
    const checked=compareObservations(selection,contents,limits.maxRows);
    for(const row of checked.records)for(const query of Object.values(queries))for(const spec of Object.values(query.projection))projectedGristValue(row,spec);
    const manifest={schema:'stellar-forge.grist-capture.v1',provider:'grist',apiVersion:'unversioned',transport:'grist-rest',method:'GET',
      readOnly:true,complete:true,responseKind:responseKind(),atomicSourceSnapshot:false,
      selection,selectionSha256:identity(selection),startedAt,completedAt:stamp(),resources:receipts,
      schemaSha256:checked.schemaSha256,document:checked.document,documentState:checked.documentState,
      authorization:reader.authorization,visibility:'credential-visible-table-records',documentStateVerified:true,repeatReadVerified:true,countVerified:false,
      rowCount:checked.records.length,pageCount:1,sourceBytes,recordIdentitiesSha256:identityDigest(checked.records),recordsSha256:digest(contents[3])};
    const manifestBytes=bytes(manifest),completed=await validateCapture(manifestBytes,file=>Promise.resolve(resources.get(file)),join(directory,'capture.json'));
    await completeFile(join(directory,'capture.json'),manifestBytes);await syncDirectory(dirname(directory));return completed;
  }catch(issue){
    try{if(await exists(intentFile))await completeFile(join(directory,'failure-'+randomUUID()+'.json'),bytes({
      schema:'stellar-forge.grist-incomplete-capture.v1',complete:false,startedAt,stoppedAt:stamp(),completedSteps,
      completedPages:completedSteps>=4?1:0,retainedBytes:sourceBytes,code:issue.code??'GRIST_CAPTURE_FAILED',
      providerStatus:issue.providerStatus??null,requestId:issue.requestId??null,retryAfter:issue.retryAfter??null}));}catch{}
    throw issue;
  }finally{await release();}
}
export async function copyGristCapture(capture, directory, { resume = false } = {}) {
  // Validate the supplied object through exactly the same full original capture reader.
  const verified = await validateCapture(capture.manifestBytes, file => Promise.resolve(capture.resources.get(file)), null, capture.manifestSha256);
  await privateDirectory(dirname(directory));
  const present = await exists(directory);
  if (present && !resume) throw fault('GRIST_CAPTURE_COPY_EXISTS');
  if (!present) await mkdir(directory, { mode: 0o700 });
  await privateDirectory(directory); const release = await acquireWorkspace(directory);
  try {
    const intent = bytes({ schema: 'stellar-forge.grist-capture-copy.v1', manifestSha256: verified.manifestSha256 });
    const intentFile = join(directory, 'copy-intent.json');
    if (!await exists(intentFile) && (await readdir(directory)).some(name => name !== 'publisher.lock' && !/^\.write-[a-f0-9-]{36}$/.test(name)))
      throw fault('GRIST_CAPTURE_COPY_DIRECTORY_NOT_OWNED');
    await discardUnpublished(directory); await completeFile(intentFile, intent);
    for (const item of manifestDescriptors(verified.manifest)) {
      const target = join(directory, item.file); await privateDirectory(dirname(target), true);
      await discardUnpublished(dirname(target));
      await completeFile(target, verified.resources.get(item.file));
    }
    await completeFile(join(directory, 'capture.json'), verified.manifestBytes); await syncDirectory(dirname(directory));
    return await readGristCapture(join(directory, 'capture.json'), verified.manifestSha256);
  } finally { await release(); }
}
export async function importGristCapture(filename, directory, config, options = {}) {
  const capture = await readGristCapture(filename); bindGristCapture(capture, config);
  return copyGristCapture(capture, directory, options);
}
export async function exportGristCapturePacket(capture) {
  const verified = await validateCapture(capture.manifestBytes, file => Promise.resolve(capture.resources.get(file)), null, capture.manifestSha256);
  return bytes({ schema: 'stellar-forge.grist-capture-packet.v1',
    manifest: { bytes: verified.manifestBytes.length, sha256: verified.manifestSha256, base64: verified.manifestBytes.toString('base64') },
    resources: manifestDescriptors(verified.manifest).map(item => ({ path: item.file, bytes: item.bytes, sha256: item.sha256,
      base64: verified.resources.get(item.file).toString('base64') })) });
}
export async function readGristCapturePacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > Math.ceil(MAX_CAPTURE_BYTES * 4 / 3) + MANIFEST_LIMIT * 2)
    throw fault('GRIST_CAPTURE_PACKET_TOO_LARGE');
  const packet = json(buffer); only(packet, ['schema', 'manifest', 'resources'], 'GRIST_CAPTURE_PACKET_INVALID');
  if (packet.schema !== 'stellar-forge.grist-capture-packet.v1' || !Array.isArray(packet.resources) || packet.resources.length !== STEPS.length)
    throw fault('GRIST_CAPTURE_PACKET_INVALID');
  const decode = (value, maximum) => {
    if (!object(value) || !HASH.test(value.sha256 ?? '') || typeof value.base64 !== 'string' ||
        !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > maximum ||
        value.base64.length !== 4 * Math.ceil(value.bytes / 3)) throw fault('GRIST_PACKET_MEMBER_INVALID');
    const content = Buffer.from(value.base64, 'base64');
    if (content.toString('base64') !== value.base64 || content.length !== value.bytes || digest(content) !== value.sha256)
      throw fault('GRIST_PACKET_MEMBER_CHANGED');
    return content;
  };
  only(packet.manifest, ['bytes', 'sha256', 'base64'], 'GRIST_CAPTURE_PACKET_INVALID');
  const manifestBytes = decode(packet.manifest, MANIFEST_LIMIT), resources = new Map(); let size = 0;
  for (const item of packet.resources) {
    only(item, ['path', 'bytes', 'sha256', 'base64'], 'GRIST_PACKET_RESOURCE_INVALID');
    if (typeof item.path !== 'string' || !/^resources\/(?:document-before|document-after|table-before|table-after|state-before|state-after|records|records-after)\/body\.json$/.test(item.path) ||
        resources.has(item.path)) throw fault('GRIST_PACKET_RESOURCE_INVALID');
    const content = decode(item, MAX_PAGE_BYTES); size += content.length;
    if (size > MAX_CAPTURE_BYTES) throw fault('GRIST_CAPTURE_PACKET_TOO_LARGE');
    resources.set(item.path, content);
  }
  const capture = await validateCapture(manifestBytes, file => Promise.resolve(resources.get(file)), null, packet.manifest.sha256);
  if (capture.resources.size !== resources.size) throw fault('GRIST_PACKET_EXTRA_RESOURCE');
  return capture;
}
export async function importGristCapturePacket(buffer, directory, config, options = {}) {
  const capture = await readGristCapturePacket(buffer); bindGristCapture(capture, config);
  return copyGristCapture(capture, directory, options);
}

/** Read-only progress from committed original step receipts; never exposes tokens or row bodies. */
export async function inspectGristCaptureAttempt(directory) {
  if (!await exists(directory)) return { schema: 'stellar-forge.grist-capture-attempt.v1', state: 'NOT_STARTED', complete: false };
  await privateDirectory(directory);
  if (await exists(join(directory, 'capture.json'))) {
    const capture = await readGristCapture(join(directory, 'capture.json'));
    return { schema: 'stellar-forge.grist-capture-attempt.v1', state: 'COMPLETE', complete: true,
      manifestFile: capture.manifestFile, manifestSha256: capture.manifestSha256, responseKind: capture.manifest.responseKind,
      countVerified: capture.manifest.countVerified, rowCount: capture.manifest.rowCount, pageCount: capture.manifest.pageCount,
      sourceBytes: capture.manifest.sourceBytes, startedAt: capture.manifest.startedAt, completedAt: capture.manifest.completedAt };
  }
  const intentFile = join(directory, 'intent.json');
  const saved = await exists(intentFile) ? json(await readPrivate(intentFile)) : null;
  if (saved && (saved.intent?.schema !== 'stellar-forge.grist-capture-intent.v1' || !validTime(saved.startedAt)))
    throw fault('GRIST_CAPTURE_INTENT_INVALID');
  let steps = 0, pages = 0, sourceBytes = 0, lastReceivedAt = null;
  const resourcesRoot = join(directory, 'resources');
  if (await exists(resourcesRoot)) {
    await privateDirectory(resourcesRoot);
    for (const entry of await readdir(resourcesRoot, { withFileTypes: true })) {
      if (entry.name.startsWith('.step-')) continue;
      if (!entry.isDirectory() || !/^(?:document-before|document-after|table-before|table-after|state-before|state-after|records|records-after)$/.test(entry.name))
        throw fault('GRIST_CAPTURE_STEP_INVENTORY_CHANGED');
      const receipt = json(await readPrivate(join(resourcesRoot, entry.name, 'receipt.json'), MANIFEST_LIMIT));
      if (receipt.file !== FILE(entry.name) || !HASH.test(receipt.sha256 ?? '') || !Number.isSafeInteger(receipt.bytes) ||
          receipt.bytes < 1 || receipt.bytes > MAX_PAGE_BYTES || !validTime(receipt.receivedAt)) throw fault('GRIST_CAPTURE_STEP_RECEIPT_INVALID');
      steps++; if (entry.name === 'records') pages++; sourceBytes += receipt.bytes;
      if (lastReceivedAt === null || receipt.receivedAt > lastReceivedAt) lastReceivedAt = receipt.receivedAt;
    }
  }
  let failure = null;
  for (const name of await readdir(directory)) {
    if (!/^failure-[a-f0-9-]{36}\.json$/.test(name)) continue;
    const value = json(await readPrivate(join(directory, name)));
    if (value.schema !== 'stellar-forge.grist-incomplete-capture.v1' || !validTime(value.stoppedAt)) throw fault('GRIST_CAPTURE_FAILURE_INVALID');
    if (!failure || value.stoppedAt > failure.stoppedAt) failure = value;
  }
  const code = failure?.code ?? null;
  const freshReadRequired = ['GRIST_DOCUMENT_CHANGED_DURING_CAPTURE','GRIST_DOCUMENT_STATE_CHANGED_DURING_CAPTURE','GRIST_SCHEMA_CHANGED_DURING_CAPTURE','GRIST_RECORDS_CHANGED_DURING_CAPTURE','GRIST_DUPLICATE_RECORD_ID','GRIST_CAPTURE_AUTHORITY_CHANGED'].includes(code);
  return { schema: 'stellar-forge.grist-capture-attempt.v1', state: 'INCOMPLETE', complete: false,
    responseKind: saved ? responseKind(saved.intent.selection) : null, startedAt: saved?.startedAt ?? null,
    completedSteps: steps, completedPages: pages, retainedBytes: sourceBytes, lastReceivedAt, failure,
    freshReadRequired, resume: freshReadRequired ? 'Retain this original read and select a new capture after source changes settle.' :
      'Explicitly resume the same request and directory; completed original response receipts are reused without new reads.' };
}
