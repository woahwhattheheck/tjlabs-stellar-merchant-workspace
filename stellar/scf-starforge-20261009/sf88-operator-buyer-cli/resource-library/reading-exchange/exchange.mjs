// MIT — Pinned research selections, original collection delivery, editable reading handover.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {open,readFile,mkdir,link,unlink,rm,stat,lstat} from 'node:fs/promises';
import {join,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hostname} from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {digest,requireValue,directory,readSnapshot} from '../files.mjs';
import {exportCollection,inspectCollectionArchive} from '../collection-package.mjs';
import {queryTerms} from '../content-search/engine.mjs';

export const CAPTURE_SCHEMA='stellar-forge.sf88.reading-capture.v1';
export const HANDOVER_SCHEMA='stellar-forge.sf88.reading-handover.v1';
const HASH=/^[a-f0-9]{64}$/,OP=/^[A-Za-z0-9._:-]{1,128}$/,MAX_METADATA=32*1024*1024;
const MAX_ITEMS=10000,MAX_SPAN=1024*1024;
const now=()=>new Date().toISOString();
export function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  requireValue(value===null||typeof value==='string'||typeof value==='boolean'||Number.isSafeInteger(value),'HANDOVER_VALUE_INVALID');
  return JSON.stringify(value);
}
function integer(n,min,code){requireValue(Number.isSafeInteger(n)&&n>=min,code);return n;}
function description(s,max,code,empty=false){requireValue(typeof s==='string'&&s.length<=max&&!s.includes('\0')&&(empty||s.trim()),code);return s;}
const withoutSourcePath=resource=>Object.fromEntries(['id','name','bytes','sha256','contentType','url','intentId','inboxId','annotation'].filter(k=>resource[k]!==undefined).map(k=>[k,resource[k]]));
function processStart(pid){try{const s=readFileSync('/proc/'+pid+'/stat','utf8');return s.slice(s.lastIndexOf(')')+2).split(' ')[19];}catch{return null;}}
function dead(owner){
  if(!owner||owner.host!==hostname()||!Number.isInteger(owner.pid))return false;
  try{process.kill(owner.pid,0);}catch(e){return e.code==='ESRCH';}
  const start=processStart(owner.pid);return Boolean(start&&owner.start&&start!==owner.start);
}
async function fileIdentity(path){
  const file=await open(path,'r');try{const before=await file.stat();requireValue(before.isFile(),'HANDOVER_FILE_REQUIRED');
    const hash=createHash('sha256'),buffer=Buffer.alloc(128*1024);let position=0;
    while(true){const r=await file.read(buffer,0,buffer.length,position);if(!r.bytesRead)break;hash.update(buffer.subarray(0,r.bytesRead));position+=r.bytesRead;}
    const after=await file.stat();requireValue(['size','mtimeMs','ctimeMs','ino','dev'].every(k=>before[k]===after[k]),'HANDOVER_FILE_CHANGED',409);
    return {bytes:position,sha256:hash.digest('hex')};
  }finally{await file.close();}
}
async function writeNew(path,value){
  const bytes=Buffer.from(canonical(value)+'\n'),tmp=path+'.'+randomUUID()+'.partial';
  requireValue(bytes.length<=MAX_METADATA,'HANDOVER_METADATA_LIMIT');
  const f=await open(tmp,'wx',0o600);try{await f.writeFile(bytes);await f.sync();await f.close();await link(tmp,path);}finally{await f.close().catch(()=>{});await unlink(tmp).catch(()=>{});}
}
async function maybeJson(path){
  try{return JSON.parse((await readSnapshot(path,MAX_METADATA)).toString('utf8'));}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}

/** Freeze the original query engine, exact range choices and current source annotations. */
export function captureReadingSelection(search,value={}){
  const name=description(value.name,160,'HANDOVER_NAME_REQUIRED');
  const note=description(value.note??'',32768,'HANDOVER_INTRODUCTION_INVALID',true);
  const selectionMode=value.selectionMode??'passage';
  requireValue(['passage','excerpt'].includes(selectionMode),'HANDOVER_SELECTION_MODE');
  let saved=null,query={...value.query};
  if(value.savedQueryId!==undefined){
    integer(value.savedQueryRevision,1,'SAVED_QUERY_REVISION_REQUIRED');
    saved=search.listSaved().find(s=>s.id===value.savedQueryId);
    requireValue(saved&&saved.revision===value.savedQueryRevision,'SAVED_QUERY_REVISION_CONFLICT',409);
    if(query.q!==undefined)requireValue(query.q===saved.q&&(query.mode??'all')===saved.mode,'SAVED_QUERY_SELECTION_CHANGED',409);
    query={...query,q:saved.q,mode:saved.mode};
  }
  const first=search.search({...query,offset:0,limit:1});
  query={q:first.q,mode:first.mode,build:first.build,...(query.resourceId?{resourceId:query.resourceId}:{})};
  const build=search.inspect(first.build),resources=new Map(),items=[],seen=new Set();
  const explicit=value.items;
  if(explicit!==undefined)requireValue(Array.isArray(explicit)&&explicit.length>0&&explicit.length<=MAX_ITEMS,'HANDOVER_ITEMS_REQUIRED');
  const requests=explicit?new Map(explicit.map(x=>{
    requireValue(x&&HASH.test(x.resourceId??'')&&Number.isSafeInteger(x.ordinal)&&x.ordinal>=0&&['passage','excerpt'].includes(x.kind??selectionMode),'HANDOVER_ITEM_INVALID');
    const key=x.resourceId+':'+x.ordinal+':'+(x.kind??selectionMode);
    requireValue(!seen.has(key),'HANDOVER_DUPLICATE_SELECTION');seen.add(key);return [key,x];
  })):null;
  seen.clear();
  for(const finding of search.findings(query)){
    const kinds=requests?['passage','excerpt'].filter(kind=>requests.has(finding.resource.id+':'+finding.ordinal+':'+kind)):[selectionMode];
    if(!kinds.length)continue;
    const original=search.library.resource(finding.resource.id);
    requireValue(original.sha256===finding.resource.sha256&&original.bytes===finding.resource.bytes&&original.status==='VERIFIED'&&original.deliveryStatus==='SAVED','HANDOVER_SOURCE_CHANGED',409);
    if(!resources.has(original.id))resources.set(original.id,withoutSourcePath(original));
    const page=search.page({build:query.build,resourceId:original.id,ordinal:finding.ordinal});
    for(const kind of kinds){
      const selection=requests?.get(original.id+':'+finding.ordinal+':'+kind);
      const range=kind==='passage'?{byteStart:page.byteStart,byteEnd:page.byteEnd,lineStart:page.lineStart,lineEnd:page.lineEnd,text:page.text}:finding.excerpt;
      const bytes=Buffer.from(range.text,'utf8');
      requireValue(range.byteEnd-range.byteStart===bytes.length&&bytes.length>0&&bytes.length<=MAX_SPAN,'HANDOVER_SOURCE_RANGE_INVALID');
      const key=original.id+':'+range.byteStart+':'+range.byteEnd;
      requireValue(!seen.has(key),'HANDOVER_DUPLICATE_SELECTION');seen.add(key);
      requireValue(items.length<MAX_ITEMS,'HANDOVER_SELECTION_LIMIT',413);
      const item={resourceId:original.id,sourceSha256:original.sha256,ordinal:finding.ordinal,kind,
        byteStart:range.byteStart,byteEnd:range.byteEnd,lineStart:range.lineStart,lineEnd:range.lineEnd,
        sha256:digest(bytes),note:description(selection?.note??'',10000,'HANDOVER_PASSAGE_NOTE_INVALID',true)};
      item.id=digest(canonical({resourceId:item.resourceId,sourceSha256:item.sourceSha256,kind:item.kind,byteStart:item.byteStart,byteEnd:item.byteEnd,sha256:item.sha256}));
      items.push(item);
    }
  }
  if(requests){requireValue(items.length===requests.size,'HANDOVER_SELECTION_NOT_IN_QUERY',409);
    const order=new Map([...requests.keys()].map((key,index)=>[key,index]));
    items.sort((a,b)=>order.get(a.resourceId+':'+a.ordinal+':'+a.kind)-order.get(b.resourceId+':'+b.ordinal+':'+b.kind));}
  requireValue(items.length>0,'HANDOVER_NO_SELECTED_PASSAGES',409);
  const capture={schema:CAPTURE_SCHEMA,createdAt:now(),name,note,
    query:{engine:'stellar-forge.resource-content-search.v1',q:query.q,mode:query.mode,terms:queryTerms(query.q),
      semantics:{scope:'whole-file',words:'Unicode NFC case-insensitive; accents retained',quotes:'punctuation',combine:query.mode==='all'?'AND':'OR'},
      build:query.build,resourceId:query.resourceId??null,savedQuery:saved},
    source:build.binding,coverage:{files:build.files,bytes:build.bytes,counts:build.counts,issues:build.issues,matchingFiles:first.total},
    lineConvention:'CRLF_OR_CR_OR_LF',selectionMode:requests?'explicit':selectionMode,resources:[...resources.values()],items};
  const encoded=Buffer.from(canonical(capture));
  requireValue(encoded.length<=MAX_METADATA,'HANDOVER_METADATA_LIMIT',413);
  return {captureSha256:digest(encoded),capture};
}

/** Reuses the maintained search database for small handover receipts, never its index rows. */
export async function openReadingExchange(search,{python=process.env.STARFORGE_READING_PYTHON||'python3'}={}){
  requireValue(search?.library&&typeof search.page==='function','ORIGINAL_RESEARCH_REQUIRED');
  const db=new DatabaseSync(search.path);
  db.exec("PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS reading_handover_captures(sha TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reading_handover_operations(id TEXT PRIMARY KEY,request TEXT NOT NULL,state TEXT NOT NULL,owner TEXT,result TEXT,error TEXT);");
  const root=join(search.library.state,'reading-handovers');await mkdir(root,{recursive:true,mode:0o700});await directory(root,true);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const out=fn();db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}};
  let closed=false;const running=new Map();
  const requireOpen=()=>requireValue(!closed,'READING_EXCHANGE_CLOSED',409);
  function capture(value){
    requireOpen();const result=captureReadingSelection(search,value);
    db.prepare('INSERT OR IGNORE INTO reading_handover_captures VALUES(?,?)').run(result.captureSha256,canonical(result.capture));
    return summary(result);
  }
  function show(sha){
    requireOpen();requireValue(HASH.test(sha??''),'HANDOVER_CAPTURE_SHA_REQUIRED');
    const row=db.prepare('SELECT value FROM reading_handover_captures WHERE sha=?').get(sha);
    requireValue(row,'HANDOVER_CAPTURE_NOT_FOUND',404);
    requireValue(digest(row.value)===sha,'HANDOVER_CAPTURE_CHANGED',409);
    return {captureSha256:sha,capture:JSON.parse(row.value)};
  }
  function summary({captureSha256,capture}){
    return {captureSha256,name:capture.name,note:capture.note,createdAt:capture.createdAt,query:capture.query,
      source:capture.source,coverage:capture.coverage,sourceFiles:capture.resources.length,sourceBytes:capture.resources.reduce((s,r)=>s+r.bytes,0),
      selectedPassages:capture.items.length,selectionMode:capture.selectionMode,
      sample:capture.items.slice(0,20).map(item=>({...item,name:capture.resources.find(r=>r.id===item.resourceId)?.name??'Source file'}))};
  }
  function status(){
    requireOpen();return {schema:HANDOVER_SCHEMA,workspaceId:digest(canonical({kind:search.library.config.kind,source:search.library.config.source,roots:search.library.config.roots})),captures:db.prepare('SELECT sha,value FROM reading_handover_captures ORDER BY rowid DESC LIMIT 50').all().map(r=>summary({captureSha256:r.sha,capture:JSON.parse(r.value)})),
      operations:db.prepare('SELECT id,request,state,result,error FROM reading_handover_operations ORDER BY rowid DESC LIMIT 100').all().map(r=>({...r,request:JSON.parse(r.request),result:r.result?JSON.parse(r.result):null}))};
  }
  function operation(id){
    requireOpen();requireValue(OP.test(id??''),'OPERATION_ID_REQUIRED');
    const row=db.prepare('SELECT id,request,state,result,error FROM reading_handover_operations WHERE id=?').get(id);
    requireValue(row,'HANDOVER_OPERATION_NOT_FOUND',404);
    return {...row,request:JSON.parse(row.request),result:row.result?JSON.parse(row.result):null};
  }
  async function pack(manifestPath,archivePath,outPath,signal){
    const pythonRoot=fileURLToPath(new URL('../../python/',import.meta.url));
    const args=['-m','stellar_forge_buyer.reading_exchange_cli','pack','--manifest',manifestPath,'--source-archive',archivePath,'--out',outPath];
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(python,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONPATH:pythonRoot+(process.env.PYTHONPATH?delimiter+process.env.PYTHONPATH:'')},windowsHide:true});
      let stdout='',stderr='',settled=false;
      const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      child.stdout.on('data',b=>{stdout+=b;if(stdout.length>1024*1024)child.kill('SIGTERM');});
      child.stderr.on('data',b=>{stderr=(stderr+b).slice(-16384);});
      child.once('error',e=>{if(!settled){settled=true;signal?.removeEventListener('abort',abort);const out=new Error('Python 3.11 or newer is required to prepare the complete reading ZIP.');out.code=e.code==='ENOENT'?'READING_PYTHON_REQUIRED':'READING_PACK_START_FAILED';reject(out);}});
      child.once('close',code=>{signal?.removeEventListener('abort',abort);if(settled)return;settled=true;
        if(signal?.aborted){reject(signal.reason??new Error('HANDOVER_CANCELLED'));return;}
        if(code!==0){let failure;try{failure=JSON.parse(stderr.trim());}catch{}const error=new Error(failure?.detail??'Reading archive packaging failed');error.code=failure?.error??'READING_PACK_FAILED';reject(error);}
        else try{resolve(JSON.parse(stdout));}catch{const error=new Error('Reading archive result is invalid');error.code='READING_PACK_RESULT_INVALID';reject(error);}
      });
    });
    const actual=await fileIdentity(outPath);
    requireValue(actual.bytes===output.bytes&&actual.sha256===output.sha256,'HANDOVER_OUTPUT_CHANGED',409);
    return actual;
  }
  async function prepare(value,{signal}={}){
    requireOpen();const {captureSha256,collectionId,expectedRevision,operationId}=value??{};
    requireValue(HASH.test(captureSha256??'')&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(collectionId??'')&&OP.test(operationId??''),'HANDOVER_REQUEST_INVALID');
    integer(expectedRevision,0,'COLLECTION_REVISION_REQUIRED');
    const request={captureSha256,collectionId,expectedRevision},requestText=canonical(request);
    const owner={host:hostname(),pid:process.pid,start:processStart(process.pid),nonce:randomUUID()};
    const completed=transaction(()=>{
      const old=db.prepare('SELECT * FROM reading_handover_operations WHERE id=?').get(operationId);
      if(old){requireValue(old.request===requestText,'OPERATION_ID_CONFLICT',409);if(old.state==='COMPLETE')return JSON.parse(old.result);
        if(old.owner)requireValue(dead(JSON.parse(old.owner)),'HANDOVER_OPERATION_BUSY',409);
        db.prepare("UPDATE reading_handover_operations SET state='PREPARING',owner=?,error=NULL WHERE id=?").run(canonical(owner),operationId);
      }else db.prepare("INSERT INTO reading_handover_operations VALUES(?,?,'PREPARING',?,NULL,NULL)").run(operationId,requestText,canonical(owner));
      return null;
    });
    if(completed){const actual=await fileIdentity(join(root,digest(operationId),'reading-handover.zip'));requireValue(actual.sha256===completed.sha256&&actual.bytes===completed.bytes,'HANDOVER_OUTPUT_CHANGED',409);return completed;}
    const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();running.set(operationId,controller);
    try{
      controller.signal.throwIfAborted();const {capture}=show(captureSha256);
      const work=join(root,digest(operationId));await mkdir(work,{recursive:true,mode:0o700});await directory(work,true);
      const collection=search.library.collections.save({id:collectionId,name:capture.name,note:capture.note,expectedRevision,
        operationId:'reading-exchange:'+digest(operationId),
        members:capture.resources.map(r=>({id:r.id,sha256:r.sha256,annotationRevision:r.annotation.revision,mode:'current'}))});
      const archivePath=join(work,'sources.tar');let original;
      try{
        await lstat(archivePath);
        const inspected=await inspectCollectionArchive(archivePath,{signal:controller.signal});
        requireValue(inspected.manifest.collectionSha256===digest(JSON.stringify(collection)),'HANDOVER_ARCHIVE_CONFLICT',409);
        original={bytes:inspected.bytes,sha256:inspected.sha256,manifestSha256:inspected.manifestSha256};
      }catch(e){if(e.code!=='ENOENT')throw e;original=await exportCollection(search.library,{id:collectionId,revision:collection.revision,destination:archivePath,signal:controller.signal});}
      const manifest={schema:HANDOVER_SCHEMA,captureSha256,capture,operationId,
        collection:{id:collection.id,revision:collection.revision,sha256:digest(JSON.stringify(collection)),memberCount:collection.members.length},
        sourceArchive:{name:'sources.tar',bytes:original.bytes,sha256:original.sha256,manifestSha256:original.manifestSha256},
        receiver:{python:'>=3.11 POSIX',node:'>=22.16 for original collection receiving',offline:'Python reading workspace after first receipt',capabilities:['source-ranges-v1']}};
      const manifestPath=join(work,'handover.json'),prior=await maybeJson(manifestPath);
      if(prior)requireValue(canonical(prior)===canonical(manifest),'HANDOVER_MANIFEST_CONFLICT',409);else await writeNew(manifestPath,manifest);
      const output=await pack(manifestPath,archivePath,join(work,'reading-handover.zip'),controller.signal);
      const result={schema:HANDOVER_SCHEMA,operationId,captureSha256,name:'reading-handover.zip',...output,
        collection:manifest.collection,sourceArchive:manifest.sourceArchive,selectedPassages:capture.items.length,
        sourceFiles:capture.resources.length,query:capture.query};
      db.prepare("UPDATE reading_handover_operations SET state='COMPLETE',owner=NULL,result=?,error=NULL WHERE id=?").run(canonical(result),operationId);
      return result;
    }catch(e){
      db.prepare("UPDATE reading_handover_operations SET state='INTERRUPTED',owner=NULL,error=? WHERE id=?").run(typeof e.code==='string'?e.code:'HANDOVER_INTERRUPTED',operationId);throw e;
    }finally{running.delete(operationId);signal?.removeEventListener('abort',abort);}
  }
  async function download(operationId,{signal}={}){
    const record=operation(operationId);requireValue(record.state==='COMPLETE','HANDOVER_NOT_COMPLETE',409);
    const path=join(root,digest(operationId),'reading-handover.zip'),identity=await fileIdentity(path);
    requireValue(identity.bytes===record.result.bytes&&identity.sha256===record.result.sha256,'HANDOVER_OUTPUT_CHANGED',409);
    signal?.throwIfAborted();const file=await open(path,'r');let disposed=false;
    return {file,...identity,resource:{id:digest(operationId),name:'reading-handover.zip'},async dispose(){if(!disposed){disposed=true;await file.close();}}};
  }
  return Object.freeze({capture,show,status,operation,prepare,download,
    async close(){if(closed)return;for(const controller of running.values())controller.abort(new Error('HANDOVER_CLOSED'));
      while(running.size)await new Promise(resolve=>setTimeout(resolve,20));closed=true;db.close();}});
}
