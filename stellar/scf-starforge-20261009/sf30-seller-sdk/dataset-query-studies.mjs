// MIT. Durable local operator studies; the original SF30 engine owns query semantics.
import { constants } from 'node:fs';
import { open, mkdir, lstat, readdir, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {openDatasetStudyComparisons} from './dataset-study-comparisons.mjs';
import { validateStudy, STUDY_MAX_BYTES, sameSource } from './dataset-study-core.mjs';
import { checkPage, checkCursor, MAX_DATASET_PAGE_BYTES, MAX_DATASET_PAGES } from '../sf100-buyer-dataset-delivery/deliver.mjs';

const MODE = 'LOCAL_OPERATOR_PREVIEW';
const MAX_EXPORT = 256 * 1024 * 1024;
const MAX_ARCHIVE = 256 * 1024 * 1024;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const json = value => Buffer.from(JSON.stringify(value) + '\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const fault = (message, code = 'DATASET_STUDY_INVALID', status = 400) => Object.assign(new Error(message), {code,status});
function need(ok,message,code,status) { if (!ok) throw fault(message,code,status); }
function identifier(value) { need(typeof value === 'string' && ID.test(value),'Choose an original study identifier.'); return value; }
const revisionName = n => String(n).padStart(8,'0') + '.json';
const pageName = n => 'page-' + String(n).padStart(5,'0') + '.json';
async function syncDirectory(path) { const f=await open(path,constants.O_RDONLY); try { await f.sync(); } finally { await f.close(); } }
async function directory(path) {
  let created=false;
  try { await mkdir(path,{mode:0o700}); created=true; }
  catch(error) { if(error.code !== 'EEXIST') throw error; }
  const info=await lstat(path);
  need(info.isDirectory() && !info.isSymbolicLink() && (process.platform==='win32' || !(info.mode&0o077)),
    'Select a private, real studies directory (0700).','DATASET_STUDY_DIRECTORY',400);
  if(created) { await syncDirectory(path); await syncDirectory(dirname(path)); }
  return path;
}
async function bytesAt(path,limit) {
  const f=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
  try {
    const info=await f.stat();
    need(info.isFile() && info.size<=limit && (process.platform==='win32' || !(info.mode&0o077)),
      'A retained study file is missing, non-private, or exceeds its declared limit.','DATASET_STUDY_CORRUPT',409);
    const b=await f.readFile();
    need(b.length<=limit,'Retained study file exceeds its byte limit.','DATASET_STUDY_CORRUPT',409);
    return b;
  } finally { await f.close(); }
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { throw fault('The retained study file is not complete UTF-8 JSON.','DATASET_STUDY_CORRUPT',409); }
}
async function maybeBytes(path,limit) {
  try { return await bytesAt(path,limit); }
  catch(error) { if(error.code==='ENOENT') return null; throw error; }
}
// A hard-link publishes a complete fsynced temporary file without replacing a winner.
// Existing identical bytes are synced again before a recovered success is acknowledged.
async function immutable(path,bytes) {
  const temporary=join(dirname(path),'.pending-'+randomUUID());
  const f=await open(temporary,'wx',0o600);
  try { await f.writeFile(bytes); await f.sync(); } finally { await f.close(); }
  try {
    try { await link(temporary,path); }
    catch(error) {
      if(error.code!=='EEXIST') throw error;
      const original=await bytesAt(path,Math.max(bytes.length,STUDY_MAX_BYTES+65536));
      need(original.equals(bytes),'Another saved operation already occupies this revision. Reopen it before continuing.',
        'DATASET_STUDY_CONFLICT',409);
    }
    await syncDirectory(dirname(path));
  } finally { await unlink(temporary).catch(error=>{ if(error.code!=='ENOENT') throw error; }); }
}
function descriptor(name,bytes) { return {name,bytes:bytes.length,sha256:sha(bytes)}; }
function csvCell(value) {
  if(value===null) return '';
  let text=String(value);
  return '"'+text.replaceAll('"','""')+'"';
}
function nativeCheck(page) {
  try { return checkPage(page); }
  catch(error) { throw fault('Original dataset response is invalid: '+error.message,'DATASET_STUDY_PAGE_INVALID',409); }
}
function continuation(state,page,requestCursor,definition) {
  const check=nativeCheck(page);
  need(check.snapshot===definition.snapshot && check.signature===definition.signature &&
    check.queryHash===definition.queryHash,'The original query, source meaning or snapshot changed.',
    'DATASET_STUDY_SOURCE_CHANGED',409);
  need(requestCursor===(state.pages.length ? state.nextCursor : null),
    'The response does not continue the retained original cursor.','DATASET_STUDY_PAGE_INVALID',409);
  need(!state.pages.length || state.nextCursor!==null,'The original result already ended.','DATASET_STUDY_PAGE_INVALID',409);
  const count=state.rows+page.rows.length;
  need(count<=check.total && page.rows.length===Math.min(page.page.limit,check.total-state.rows),
    'The original page skipped or repeated a row boundary.','DATASET_STUDY_PAGE_INVALID',409);
  if(page.page.nextCursor===null) need(count===check.total,'The original result ended before its declared total.','DATASET_STUDY_PAGE_INVALID',409);
  else {
    need(count<check.total && page.rows.length>0,'The original result cursor did not advance.','DATASET_STUDY_PAGE_INVALID',409);
    try { checkCursor(page.page.nextCursor,check.snapshot,check.queryHash,count); }
    catch(error) { throw fault('Original continuation cursor is invalid: '+error.message,'DATASET_STUDY_PAGE_INVALID',409); }
  }
  let exportBytes=state.exportBytes;
  if(!state.pages.length) {
    exportBytes+=Buffer.byteLength(check.fields.map(csvCell).join(',')+'\r\n');
    if(page.semantics) exportBytes+=json(page.semantics).length;
  }
  for(const row of page.rows) exportBytes+=Buffer.byteLength(JSON.stringify(row)+'\n')+
    Buffer.byteLength(check.fields.map(key=>csvCell(row[key])).join(',')+'\r\n');
  need(exportBytes<=MAX_EXPORT,'The complete CSV and JSONL exceed 256 MiB. Save a narrower original query.','DATASET_STUDY_EXPORT_LIMIT',413);
  return {check,rows:count,nextCursor:page.page.nextCursor,exportBytes};
}

export async function openDatasetQueryStudies({directory: selectedDirectory,schema,queryPage}={}) {
  need(typeof selectedDirectory==='string' && selectedDirectory.length>0,'Select a private studies directory.');
  const root=resolve(selectedDirectory);
  await directory(root);
  const identityPath=join(root,'workspace.json');
  let identityBytes=await maybeBytes(identityPath,4096);
  if(!identityBytes) {
    const created={schema:'stellar-forge.dataset-studies-workspace.v1',workspaceId:randomUUID()};
    try {await immutable(identityPath,json(created));}
    catch(error) {if(error.code!=='DATASET_STUDY_CONFLICT')throw error;}
    identityBytes=await bytesAt(identityPath,4096);
  }
  const identity=parse(identityBytes);
  need(identity?.schema==='stellar-forge.dataset-studies-workspace.v1'&&UUID.test(identity.workspaceId??'')&&
    Object.keys(identity).sort().join(',')==='schema,workspaceId','The original studies workspace identity changed.','DATASET_STUDY_CORRUPT',409);
  const studies=await directory(join(root,'studies')), exports=await directory(join(root,'exports'));
  const documents=await directory(join(root,'study-files'));
  const running=new Map(), cached=new Map();
  let closed=false;
  const home=async id=>{ identifier(id); return directory(join(studies,id)); };
  async function history(id) {
    identifier(id);
    let names;
    try {
      const info=await lstat(join(studies,id));
      need(info.isDirectory()&&!info.isSymbolicLink()&&(process.platform==='win32'||!(info.mode&0o077)),
        'The study history directory changed.','DATASET_STUDY_CORRUPT',409);
      names=(await readdir(join(studies,id))).filter(n=>!n.startsWith('.pending-')).sort();
    } catch(error) { if(error.code==='ENOENT') return []; throw error; }
    need(names.every((name,i)=>name===revisionName(i+1)),'The study revision history is incomplete.','DATASET_STUDY_CORRUPT',409);
    const records=[]; let previous=null;
    for(let i=0;i<names.length;i++) {
      const bytes=await bytesAt(join(studies,id,names[i]),STUDY_MAX_BYTES+65536),record=parse(bytes);
      need(record.schema==='stellar-forge.dataset-study-record.v1' && record.storageRevision===i+1 &&
        record.previousSha256===previous && record.study?.id===id &&
        record.studySha256===sha(json(record.study)),'The complete study revision chain differs.','DATASET_STUDY_CORRUPT',409);
      validateStudy(record.study);
      records.push({...record,recordSha256:sha(bytes)});
      previous=sha(bytes);
    }
    return records;
  }
  const response = record => ({storageRevision:record.storageRevision,study:clone(record.study)});
  async function get(id,{revision}={}) {
    const records=await history(id), record=revision===undefined?records.at(-1):records[revision-1];
    need(record && (revision===undefined || Number.isSafeInteger(revision)&&revision>0),'The selected study revision was not found.','DATASET_STUDY_NOT_FOUND',404);
    return response(record);
  }
  async function save({study,expectedRevision}) {
    need(!closed,'The original study workspace is closed.','DATASET_STUDY_CLOSED',409);
    validateStudy(study);
    need(expectedRevision===null || Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'Select the previously saved storage revision.');
    const id=identifier(study.id), records=await history(id), desired=expectedRevision===null?1:expectedRevision+1;
    const studySha256=sha(json(study));
    // Retry the exact former operation even after another client saved a later revision.
    const prior=records[desired-1];
    if(prior && prior.studySha256===studySha256) {
      await syncDirectory(join(studies,id)); await syncDirectory(studies); await syncDirectory(root);
      return {...response(prior),recovered:true};
    }
    need(records.length===(expectedRevision??0),'This study has a newer native revision. Reopen it or fork this working copy.',
      'DATASET_STUDY_CONFLICT',409);
    const path=await home(id),record={schema:'stellar-forge.dataset-study-record.v1',storageRevision:desired,
      previousSha256:records.at(-1)?.recordSha256??null,studySha256,study:clone(study)};
    await immutable(join(path,revisionName(desired)),json(record));
    await syncDirectory(path); await syncDirectory(studies); await syncDirectory(root);
    return response(record);
  }
  async function list() {
    const names=(await readdir(studies)).filter(n=>ID.test(n)).sort(), rows=[];
    for(const id of names) {
      const records=await history(id),r=records.at(-1); if(!r) continue;
      rows.push({id,title:r.study.title,storageRevision:r.storageRevision,updatedAt:r.study.updatedAt,editionCount:r.study.editions.length});
    }
    return {enabled:true,studies:rows};
  }
  function jobId(value) { need(typeof value==='string'&&DIGEST.test(value),'Choose the retained result identifier.');return value; }
  const jobHome=id=>join(exports,jobId(id));
  async function definition(id) {
    const d=parse(await bytesAt(join(jobHome(id),'request.json'),STUDY_MAX_BYTES+65536));
    need(d.schema==='stellar-forge.dataset-study-export.v1'&&d.mode===MODE&&d.id===id&&
      d.id===sha(json({studyId:d.studyId,requestId:d.requestId}))&&UUID.test(d.requestId)&&
      Number.isSafeInteger(d.storageRevision)&&d.storageRevision>=1&&DIGEST.test(d.studySha256)&&
      DIGEST.test(d.snapshot)&&typeof d.query==='string'&&d.query.length<=8192&&typeof d.firstQuery==='string',
      'The retained full-result request differs.','DATASET_STUDY_CORRUPT',409);
    const saved=await get(d.studyId,{revision:d.storageRevision});
    need(sha(json(saved.study))===d.studySha256&&eq(saved.study.working.source,d.source),
      'The full-result request no longer matches its original saved study.','DATASET_STUDY_CORRUPT',409);
    const last=saved.study.working.lastSuccess,check=nativeCheck(last?.result);
    need(last.query===d.query&&last.snapshot===d.snapshot&&check.signature===d.signature&&check.queryHash===d.queryHash,
      'The saved successful query differs from the full-result request.','DATASET_STUDY_CORRUPT',409);
    const q=new URLSearchParams(d.query); q.delete('cursor');
    if(d.source.mode==='service')q.set('snapshot',d.snapshot);
    need(q.toString()===d.firstQuery,'The retained original first-page query changed.','DATASET_STUDY_CORRUPT',409);
    return d;
  }
  async function scan(id) {
    if(running.has(id)&&cached.has(id))return cached.get(id);
    const d=await definition(id),path=jobHome(id);
    await directory(path); await directory(join(path,'pages'));
    const names=(await readdir(join(path,'pages'))).filter(n=>!n.startsWith('.pending-')).sort();
    need(names.length<=MAX_DATASET_PAGES&&names.every((n,i)=>n===pageName(i)),
      'The retained full-result page history is incomplete.','DATASET_STUDY_CORRUPT',409);
    const state={definition:d,pages:[],rows:0,nextCursor:null,chain:null,exportBytes:0,archiveBytes:0,total:null,complete:null,error:null};
    for(let i=0;i<names.length;i++) {
      const bytes=await bytesAt(join(path,'pages',names[i]),MAX_DATASET_PAGE_BYTES+32768),record=parse(bytes);
      need(record.schema==='stellar-forge.local-dataset-page.v1'&&record.index===i&&record.previousSha256===state.chain&&
        record.query===pageQuery(d,record.requestCursor),'The original page custody chain changed.','DATASET_STUDY_CORRUPT',409);
      accept(state,record,bytes);
    }
    const complete=await maybeBytes(join(path,'complete.json'),1024*1024);
    if(complete) {
      state.complete=parse(complete);
      need(state.pages.length>0&&state.nextCursor===null&&state.complete.schema==='stellar-forge.local-dataset-result.v1'&&
        state.complete.id===id&&state.complete.rows===state.rows&&state.complete.pageChain===state.chain&&
        state.complete.snapshot===d.snapshot&&state.complete.studySha256===d.studySha256&&
        Array.isArray(state.complete.files)&&state.complete.files.length>=4&&state.complete.files.length<=5&&
        new Set(state.complete.files.map(f=>f.name)).size===state.complete.files.length&&
        state.complete.files.every(f=>/^(dataset\.csv|dataset\.jsonl|study\.json|manifest\.json|semantics\.json)$/.test(f.name)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=MAX_EXPORT&&DIGEST.test(f.sha256)),
        'The completed export does not match its original page chain.','DATASET_STUDY_CORRUPT',409);
    }
    if(running.has(id)&&cached.has(id))return cached.get(id);
    cached.set(id,state);return state;
  }
  function pageQuery(d,cursor) {
    const q=new URLSearchParams(d.firstQuery);
    if(cursor!==null)q.set('cursor',cursor);
    return q.toString();
  }
  function accept(state,record,bytes) {
    need(state.pages.length<MAX_DATASET_PAGES,'The complete result exceeds 4096 original pages. Use a larger supported page size.','DATASET_STUDY_EXPORT_LIMIT',413);
    const next=continuation(state,record.result,record.requestCursor,state.definition);
    need(state.archiveBytes+bytes.length<=MAX_ARCHIVE,'The original page archive exceeds 256 MiB. Save a narrower original query.','DATASET_STUDY_EXPORT_LIMIT',413);
    const descriptor_={...descriptor(pageName(record.index),bytes),index:record.index,requestCursor:record.requestCursor,
      nextCursor:next.nextCursor,returned:record.result.rows.length};
    state.pages.push(descriptor_);state.rows=next.rows;state.nextCursor=next.nextCursor;
    state.chain=descriptor_.sha256;state.exportBytes=next.exportBytes;state.archiveBytes+=bytes.length;
    state.total=next.check.total;
  }
  function publicStatus(state) {
    const d=state.definition;
    return {id:d.id,mode:MODE,status:state.complete?'COMPLETE':running.has(d.id)?'RUNNING':state.error?'PAUSED':'READY',
      studyId:d.studyId,storageRevision:d.storageRevision,title:d.title,snapshot:d.snapshot,query:d.query,
      pages:state.pages.length,rows:state.rows,total:state.total,createdAt:d.createdAt,
      files:state.complete?.files??[],...(state.error?{error:state.error}:{})};
  }
  async function status(id) {
    const state=cached.get(jobId(id))??await scan(id);
    return {export:publicStatus(state)};
  }
  async function retainStream(path,produce) {
    const temporary=join(dirname(path),'.pending-'+randomUUID()),file=await open(temporary,'wx',0o600);
    const digest=createHash('sha256');let count=0;
    try {
      const write=async bytes=>{
        bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);count+=bytes.length;
        need(count<=MAX_EXPORT,'This complete export exceeds 256 MiB.','DATASET_STUDY_EXPORT_LIMIT',413);
        digest.update(bytes);await file.writeFile(bytes);
      };
      await produce(write);await file.sync();
    } catch(error) {await file.close();await unlink(temporary).catch(()=>{});throw error;}
    await file.close();
    const hash=digest.digest('hex');
    try {
      try {await link(temporary,path);}
      catch(error) {
        if(error.code!=='EEXIST')throw error;
        const existing=await hashFile(path,MAX_EXPORT);
        need(existing.bytes===count&&existing.sha256===hash,'An existing complete export has different bytes.','DATASET_STUDY_CORRUPT',409);
      }
      await syncDirectory(dirname(path));
    } finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    return {name:path.slice(path.lastIndexOf('/')+1),bytes:count,sha256:hash};
  }
  async function hashFile(path,limit) {
    const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const info=await file.stat();
      need(info.isFile()&&info.size<=limit&&(process.platform==='win32'||!(info.mode&0o077)),
        'The completed export is no longer a private regular file.','DATASET_STUDY_CORRUPT',409);
      const digest=createHash('sha256');let size=0;
      for await(const chunk of file.createReadStream({autoClose:false})) {
        size+=chunk.length;need(size<=limit,'Completed export exceeds its byte limit.','DATASET_STUDY_CORRUPT',409);digest.update(chunk);
      }
      return {bytes:size,sha256:digest.digest('hex')};
    } finally {await file.close();}
  }
  async function finish(state) {
    const d=state.definition,path=jobHome(d.id), files=[];
    const first=parse(await bytesAt(join(path,'pages',pageName(0)),MAX_DATASET_PAGE_BYTES+32768)).result;
    for(const name of ['dataset.csv','dataset.jsonl']) {
      files.push(await retainStream(join(path,name),async write=>{
        if(name==='dataset.csv')await write(first.fields.map(csvCell).join(',')+'\r\n');
        for(const item of state.pages) {
          const bytes=await bytesAt(join(path,'pages',item.name),MAX_DATASET_PAGE_BYTES+32768);
          need(sha(bytes)===item.sha256,'An original page changed during export.','DATASET_STUDY_CORRUPT',409);
          const record=parse(bytes);
          for(const row of record.result.rows)await write(name==='dataset.csv'
            ? first.fields.map(key=>csvCell(row[key])).join(',')+'\r\n' : JSON.stringify(row)+'\n');
        }
      }));
    }
    if(first.semantics) {
      const bytes=json(first.semantics);await immutable(join(path,'semantics.json'),bytes);files.push(descriptor('semantics.json',bytes));
    }
    const saved=await get(d.studyId,{revision:d.storageRevision}),studyBytes=json(saved.study);
    await immutable(join(path,'study.json'),studyBytes);files.push(descriptor('study.json',studyBytes));
    const manifest={schema:'stellar-forge.local-dataset-result-manifest.v1',mode:MODE,id:d.id,title:d.title,
      studyId:d.studyId,storageRevision:d.storageRevision,studySha256:d.studySha256,source:d.source,
      selectedSnapshot:d.snapshot,query:d.query,firstPageQuery:d.firstQuery,queryHash:d.queryHash,
      signature:d.signature,total:state.total,rows:state.rows,fields:first.fields,
      filters:first.filters,ranges:first.ranges??[],order:first.order??null,
      csv:{null:'empty cell',strings:'quoted with original values unchanged; do not execute imported cell text as spreadsheet formulas',exactTypedValues:'dataset.jsonl'},
      pages:state.pages,files:clone(files),pageChain:state.chain,createdAt:d.createdAt};
    const manifestBytes=json(manifest);await immutable(join(path,'manifest.json'),manifestBytes);
    files.push(descriptor('manifest.json',manifestBytes));
    const complete={schema:'stellar-forge.local-dataset-result.v1',mode:MODE,id:d.id,studySha256:d.studySha256,
      snapshot:d.snapshot,rows:state.rows,pageChain:state.chain,files};
    await immutable(join(path,'complete.json'),json(complete));state.complete=complete;
  }
  async function run(id) {
    const state=await scan(id),d=state.definition;
    if(state.complete)return publicStatus(state);
    state.error=null;
    try {
      need(typeof schema==='function'&&typeof queryPage==='function','Attach the original dataset source before resuming.','DATASET_STUDY_SOURCE_REQUIRED',409);
      const saved=await get(d.studyId,{revision:d.storageRevision});
      need(sameSource(saved.study,await schema()),'Attach the same original dataset source/resource before resuming this result.',
        'DATASET_STUDY_SOURCE_CHANGED',409);
      while(!state.pages.length||state.nextCursor!==null) {
        if(closed)throw fault('The workspace stopped; resume this exact retained result after reopening.','DATASET_STUDY_INTERRUPTED',409);
        need(state.pages.length<MAX_DATASET_PAGES,'The result exceeds 4096 original pages.','DATASET_STUDY_EXPORT_LIMIT',413);
        const cursor=state.pages.length?state.nextCursor:null,query=pageQuery(d,cursor);
        const result=await queryPage(query);
        const record={schema:'stellar-forge.local-dataset-page.v1',index:state.pages.length,
          previousSha256:state.chain,requestCursor:cursor,query,result};
        const bytes=json(record);
        need(bytes.length<=MAX_DATASET_PAGE_BYTES+32768,'The original response exceeds its retained page byte limit.','DATASET_STUDY_EXPORT_LIMIT',413);
        // Validate before publishing any page.
        continuation(state,result,cursor,d);
        need(state.archiveBytes+bytes.length<=MAX_ARCHIVE,'The original archive exceeds 256 MiB.','DATASET_STUDY_EXPORT_LIMIT',413);
        await immutable(join(jobHome(id),'pages',pageName(record.index)),bytes);
        accept(state,record,bytes);
      }
      await finish(state);return publicStatus(state);
    } catch(error) {
      state.error={code:typeof error.code==='string'&&error.code.startsWith('DATASET_')?error.code:'DATASET_STUDY_SOURCE_UNAVAILABLE',
        message:typeof error.code==='string'&&error.code.startsWith('DATASET_')?error.message:'The original dataset service could not complete this read. Retained pages are available; resume the same result.'};
      return publicStatus(state);
    }
  }
  function start(id) {
    if(!running.has(id)) {
      const promise=Promise.resolve().then(()=>run(id)).finally(()=>{
        if(running.get(id)===promise)running.delete(id);
      });
      running.set(id,promise);
      promise.catch(()=>{});
    }
  }
  async function begin({studyId,expectedRevision,query,snapshot,requestId}) {
    need(!closed,'The original study workspace is closed.','DATASET_STUDY_CLOSED',409);
    identifier(studyId);need(UUID.test(requestId??''),'A stable full-result request UUID is required.');
    need(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'Select the exact saved study revision.');
    need(typeof query==='string'&&query.length<=8192&&DIGEST.test(snapshot),'Select the exact successful query and snapshot.');
    const id=sha(json({studyId,requestId})),path=jobHome(id),existing=await maybeBytes(join(path,'request.json'),STUDY_MAX_BYTES+65536);
    if(existing) {
      const d=await definition(id);
      need(d.storageRevision===expectedRevision&&d.query===query&&d.snapshot===snapshot,'This request UUID already belongs to a different result.','DATASET_STUDY_CONFLICT',409);
      await scan(id);start(id);return status(id);
    }
    const saved=await get(studyId);
    need(saved.storageRevision===expectedRevision,'Save or reopen the current study revision before starting a full-result export.','DATASET_STUDY_CONFLICT',409);
    const last=saved.study.working.lastSuccess;
    need(last&&last.query===query&&last.snapshot===snapshot,'Export the exact successful page retained in this saved study.','DATASET_STUDY_SELECTION_CHANGED',409);
    const check=nativeCheck(last.result);
    need(typeof schema==='function'&&sameSource(saved.study,await schema()),'Attach this study’s original source before exporting.','DATASET_STUDY_SOURCE_CHANGED',409);
    const q=new URLSearchParams(query);q.delete('cursor');if(saved.study.working.source.mode==='service')q.set('snapshot',snapshot);
    const d={schema:'stellar-forge.dataset-study-export.v1',mode:MODE,id,requestId,studyId,storageRevision:expectedRevision,
      studySha256:sha(json(saved.study)),title:saved.study.title,createdAt:new Date().toISOString(),
      source:clone(saved.study.working.source),query,snapshot,firstQuery:q.toString(),signature:check.signature,queryHash:check.queryHash};
    await directory(path);await directory(join(path,'pages'));
    // Concurrent identical starts recover the first complete request including its original timestamp.
    try {await immutable(join(path,'request.json'),json(d));}
    catch(error) {
      if(error.code!=='DATASET_STUDY_CONFLICT')throw error;
      const winner=await definition(id);
      need(winner.storageRevision===expectedRevision&&winner.query===query&&winner.snapshot===snapshot,
        'This request UUID already belongs to a different result.','DATASET_STUDY_CONFLICT',409);
    }
    await scan(id);start(id);return status(id);
  }
  async function resume(id) {need(!closed,'The original study workspace is closed.','DATASET_STUDY_CLOSED',409);jobId(id);await scan(id);start(id);return status(id);}
  async function resultList({studyId}={}) {
    if(studyId!==undefined)identifier(studyId);
    const names=(await readdir(exports)).filter(n=>DIGEST.test(n)).sort(),rows=[];
    for(const id of names) {
      const state=cached.get(id)??await scan(id);
      if(studyId===undefined||state.definition.studyId===studyId)rows.push(publicStatus(state));
    }
    return {exports:rows};
  }
  async function verifiedHandle(filename,item,type) {
    const file=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const info=await file.stat();
      need(info.isFile()&&info.size===item.bytes&&(process.platform==='win32'||!(info.mode&0o077)),
        'The retained output file changed.','DATASET_STUDY_CORRUPT',409);
      const digest=createHash('sha256');let count=0;
      for await(const bytes of file.createReadStream({autoClose:false})) {
        count+=bytes.length;need(count<=item.bytes,'Output grew unexpectedly.','DATASET_STUDY_CORRUPT',409);digest.update(bytes);
      }
      need(count===item.bytes&&digest.digest('hex')===item.sha256,'The retained output bytes changed.','DATASET_STUDY_CORRUPT',409);
      return {readonlyFileHandle:file,name:item.name,bytes:item.bytes,sha256:item.sha256,type};
    } catch(error) {await file.close();throw error;}
  }
  async function openExportFile(id,name) {
    need(typeof name==='string'&&(/^(dataset\.csv|dataset\.jsonl|study\.json|manifest\.json|semantics\.json)$/.test(name)||/^page-[0-9]{5}\.json$/.test(name)),
      'Choose an original retained result filename.','DATASET_STUDY_FILE_NOT_FOUND',404);
    const state=cached.get(jobId(id))??await scan(id),path=jobHome(id);
    let item,filename;
    if(/^page-[0-9]{5}\.json$/.test(name)) {item=state.pages.find(p=>p.name===name);filename=join(path,'pages',name);}
    else {item=state.complete?.files.find(f=>f.name===name);filename=join(path,name);}
    need(item,'Choose a retained file from this result.','DATASET_STUDY_FILE_NOT_FOUND',404);
    const type=name.endsWith('.csv')?'text/csv; charset=utf-8':name.endsWith('.jsonl')?'application/x-ndjson; charset=utf-8':'application/json; charset=utf-8';
    return verifiedHandle(filename,item,type);
  }
  async function openStudyFile(id,{revision}={}) {
    const selected=await get(id,{revision}),bytes=json(selected.study),digest=sha(bytes);
    const name='study.json',path=join(documents,digest+'.json');
    await immutable(path,bytes);
    const opened=await verifiedHandle(path,{name,bytes:bytes.length,sha256:digest},'application/json; charset=utf-8');
    return {...opened,studyId:selected.study.id,storageRevision:selected.storageRevision};
  }
  async function readFile(id,name) {
    const opened=await openExportFile(id,name);
    try {
      return {descriptor:{name:opened.name,bytes:opened.bytes,sha256:opened.sha256},
        stream:opened.readonlyFileHandle.createReadStream({start:0,autoClose:true}),contentType:opened.type};
    } catch(error) {await opened.readonlyFileHandle.close();throw error;}
  }
  const comparisons=await openDatasetStudyComparisons({directory:root,workspaceId:identity.workspaceId,exportStatus:status,openExportFile});
  return {directory:root,workspaceId:identity.workspaceId,list,get,save,
    comparisonInspect:comparisons.inspect,comparisonList:comparisons.list,comparisonCreate:comparisons.create,
    comparisonRead:comparisons.read,comparisonMembers:comparisons.members,comparisonResume:comparisons.resume,
    openComparisonFile:comparisons.openFile,waitComparison:comparisons.wait,
    history:async id=>(await history(id)).map(r=>({
    storageRevision:r.storageRevision,recordSha256:r.recordSha256,studySha256:r.studySha256,title:r.study.title,
    updatedAt:r.study.updatedAt,editionCount:r.study.editions.length})),
    beginExport:begin,resumeExport:resume,exportStatus:status,listExports:resultList,readExportFile:readFile,openExportFile,openStudyFile,
    waitExport:async id=>{await running.get(jobId(id));return status(id);},
    close:async()=>{closed=true;await comparisons.close();await Promise.allSettled([...running.values()]);}};
}
