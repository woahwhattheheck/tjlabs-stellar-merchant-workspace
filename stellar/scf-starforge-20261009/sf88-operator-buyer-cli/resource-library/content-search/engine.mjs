// MIT — Complete-file research, derived only from original verified library downloads.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {lstat,chmod} from 'node:fs/promises';
import {hostname} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {directory,digest,requireValue} from '../files.mjs';

const SCHEMA='stellar-forge.resource-content-search.v1';
const PAGE=24*1024, MAX_QUERY_BYTES=2048;
const word=/[\p{L}\p{N}\p{M}\p{Co}]/u;
const words=/[\p{L}\p{N}\p{M}\p{Co}]+/gu;
const json=JSON.stringify, parse=x=>x==null?null:JSON.parse(x), now=()=>new Date().toISOString();
const lines=s=>(s.match(/\r\n|\r|\n/g)||[]).length;
const normal=s=>s.normalize('NFC').toLowerCase();
const encoded=s=>'w'+Buffer.from(s).toString('hex');
const integer=(n,min,max,code)=>{requireValue(Number.isSafeInteger(n)&&n>=min&&n<=max,code);return n;};
function processStart(pid){try{const s=readFileSync(`/proc/${pid}/stat`,'utf8');return s.slice(s.lastIndexOf(')')+2).split(' ')[19];}catch{return null;}}
function dead(owner){
  if(!owner||owner.host!==hostname()||!Number.isInteger(owner.pid))return false;
  try{process.kill(owner.pid,0);}catch(e){return e.code==='ESRCH';}
  const start=processStart(owner.pid);return Boolean(start&&owner.start&&start!==owner.start);
}
function code(e){return typeof e?.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(e.code)?e.code:'CONTENT_READ_FAILED';}
export function queryTerms(q){
  requireValue(typeof q==='string'&&Buffer.byteLength(q)<=MAX_QUERY_BYTES,'QUERY_TOO_LONG');
  const terms=[...new Set([...q.matchAll(words)].map(m=>normal(m[0])))];
  requireValue(terms.length>=1&&terms.length<=24&&terms.every(t=>Buffer.byteLength(t)<=MAX_QUERY_BYTES),'QUERY_WORDS_REQUIRED');
  return terms;
}
function excerpt(row,terms){
  const wanted=new Set(terms),tokens=[];
  for(const m of row.text.matchAll(words)){
    if((row.left_fragment&&m.index===0)||(row.right_fragment&&m.index+m[0].length===row.text.length))continue;
    const term=normal(m[0]);if(wanted.has(term))tokens.push([term,m.index,m.index+m[0].length]);
  }
  const chosen=tokens[0];
  const focus=chosen?.[1]??0;
  let a=Math.max(0,focus-160),b=Math.min(row.text.length,focus+440);
  // Keep short-line excerpts useful without losing the exact source offsets.
  const preceding=[...row.text.slice(a,focus).matchAll(/\r\n|\r|\n/g)];
  if(preceding.length>2){const cut=preceding[preceding.length-2];a+=cut.index+cut[0].length;}
  const following=[...row.text.slice(focus,b).matchAll(/\r\n|\r|\n/g)];
  if(following.length>3)b=focus+following[2].index+following[2][0].length;
  if(a&&/[\uDC00-\uDFFF]/.test(row.text[a]))a--;
  if(b<row.text.length&&/[\uDC00-\uDFFF]/.test(row.text[b]))b++;
  const text=row.text.slice(a,b),before=row.text.slice(0,a);
  return {text,byteStart:row.byte_start+Buffer.byteLength(before),byteEnd:row.byte_start+Buffer.byteLength(row.text.slice(0,b)),
    lineStart:row.line_start+lines(before),lineEnd:row.line_start+lines(row.text.slice(0,b)),
    highlights:tokens.filter(t=>terms.includes(t[0])&&t[1]>=a&&t[2]<=b).map(t=>[t[1]-a,t[2]-a]),
    truncatedBefore:a>0,truncatedAfter:b<row.text.length};
}

/** Open an additional derived index; never write to the source files or buyer stores. */
export async function openContentSearch(library){
  requireValue(library&&typeof library.download==='function'&&typeof library.exportReview==='function','ORIGINAL_LIBRARY_REQUIRED');
  await directory(library.state,true);
  const path=join(library.state,'content-search.sqlite');
  try{const st=await lstat(path);requireValue(st.isFile()&&!st.isSymbolicLink()&&(process.platform==='win32'||(st.mode&0o077)===0),'PRIVATE_SEARCH_FILE_REQUIRED');}
  catch(e){if(e.code!=='ENOENT')throw e;}
  const db=new DatabaseSync(path);await chmod(path,0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS builds(id TEXT PRIMARY KEY,binding TEXT NOT NULL,state TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,error TEXT);
    CREATE TABLE IF NOT EXISTS lease(singleton INTEGER PRIMARY KEY CHECK(singleton=1),owner TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,state TEXT NOT NULL,bytes INTEGER NOT NULL DEFAULT 0,passages INTEGER NOT NULL DEFAULT 0,error TEXT,updated TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS documents_fingerprint ON documents(fingerprint,state);
    CREATE TABLE IF NOT EXISTS members(build TEXT NOT NULL,document TEXT NOT NULL,ordinal INTEGER NOT NULL,resource TEXT NOT NULL,PRIMARY KEY(build,document));
    CREATE INDEX IF NOT EXISTS members_document ON members(document,build);
    CREATE TABLE IF NOT EXISTS passages(id INTEGER PRIMARY KEY,document TEXT NOT NULL,ordinal INTEGER NOT NULL,byte_start INTEGER NOT NULL,byte_end INTEGER NOT NULL,line_start INTEGER NOT NULL,line_end INTEGER NOT NULL,text TEXT NOT NULL,left_fragment INTEGER NOT NULL,right_fragment INTEGER NOT NULL,UNIQUE(document,ordinal));
    CREATE VIRTUAL TABLE IF NOT EXISTS terms USING fts5(body);
    CREATE TABLE IF NOT EXISTS saved(id TEXT PRIMARY KEY,revision INTEGER NOT NULL,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts(operation TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL);`);
  const setting=k=>parse(db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value);
  const put=(k,v)=>db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,json(v));
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  let active=null,closed=false;
  function recover(){
    const held=parse(db.prepare('SELECT owner FROM lease WHERE singleton=1').get()?.owner);
    if(held&&dead(held))transaction(()=>{
      const current=parse(db.prepare('SELECT owner FROM lease WHERE singleton=1').get()?.owner);
      if(current&&current.nonce===held.nonce&&dead(current)){
        db.prepare("UPDATE builds SET state='INTERRUPTED',updated=?,error='OWNER_INTERRUPTED' WHERE id=? AND state='RUNNING'").run(now(),held.build);
        db.prepare('DELETE FROM lease WHERE singleton=1').run();
      }
    });
  }
  const selected=id=>{
    id=id??setting('current');requireValue(typeof id==='string','INDEX_REQUIRED',409);
    const r=db.prepare('SELECT * FROM builds WHERE id=?').get(id);requireValue(r,'INDEX_NOT_FOUND',404);return {...r,binding:parse(r.binding)};
  };
  function inspect(id){
    const b=selected(id),counts={TEXT:0,BINARY:0,UNAVAILABLE:0,PENDING:0,INDEXING:0},errors=[];
    for(const r of db.prepare('SELECT d.state,count(*) AS n FROM members m JOIN documents d ON d.id=m.document WHERE m.build=? GROUP BY d.state').all(b.id))counts[r.state]=(counts[r.state]??0)+r.n;
    const sums=db.prepare('SELECT coalesce(sum(d.bytes),0) AS bytes,coalesce(sum(d.passages),0) AS passages,count(*) AS files FROM members m JOIN documents d ON d.id=m.document WHERE m.build=?').get(b.id);
    for(const r of db.prepare("SELECT m.resource,d.state,d.error FROM members m JOIN documents d ON d.id=m.document WHERE m.build=? AND d.state IN ('BINARY','UNAVAILABLE') ORDER BY m.ordinal").all(b.id)){
      const resource=parse(r.resource);errors.push({resourceId:resource.id,name:resource.name,state:r.state,error:r.error});
    }
    return {...b,...sums,counts,completedFiles:counts.TEXT+counts.BINARY+counts.UNAVAILABLE,issues:errors};
  }
  function status(){
    requireValue(!closed,'SEARCH_CLOSED');recover();
    const currentId=setting('current'),lastId=setting('last'),scan=library.status().scan;
    const current=currentId?inspect(currentId):null,last=lastId?inspect(lastId):null;
    return {schema:SCHEMA,current,last,stale:Boolean(current&&current.binding.generation!==scan?.generation),
      sourceGeneration:scan?.generation??null,sourceCoverage:{jobs:scan?.jobCount??0,eligibleFiles:scan?.resourceCount??0,rejected:scan?.rejected??[],withoutFile:scan?.withoutFile??0},running:Boolean(db.prepare('SELECT 1 FROM lease').get()),
      query:{modes:['all','any'],maximumBytes:MAX_QUERY_BYTES,maximumWords:24,caseSensitive:false,accentSensitive:true},
      savedQueries:listSaved()};
  }
  function clearDocument(id){
    db.prepare('DELETE FROM terms WHERE rowid IN (SELECT id FROM passages WHERE document=?)').run(id);
    db.prepare('DELETE FROM passages WHERE document=?').run(id);
  }
  async function index({signal,onProgress}={}){
    requireValue(!closed&&!active,'INDEX_ALREADY_RUNNING',409);recover();
    const exported=library.exportReview(),scan=exported.scan;
    requireValue(scan?.generation,'LIBRARY_SCAN_REQUIRED',409);
    const binding={schema:SCHEMA,generation:scan.generation,sourceSha256:scan.sourceSha256,sourceKind:library.config.kind,source:library.config.source};
    const id=digest(json(binding)),controller=new AbortController();
    const abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const owner={host:hostname(),pid:process.pid,start:processStart(process.pid),nonce:randomUUID(),build:id};
    let acquired=false;
    try{
      const done=transaction(()=>{
        requireValue(!db.prepare('SELECT 1 FROM lease').get(),'INDEX_ALREADY_RUNNING',409);
        const existing=db.prepare('SELECT state FROM builds WHERE id=?').get(id);
        if(existing?.state==='COMPLETE'){put('current',id);put('last',id);return true;}
        db.prepare('INSERT INTO builds VALUES(?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated=excluded.updated,error=NULL').run(id,json(binding),'RUNNING',now(),now());
        db.prepare('INSERT INTO lease VALUES(1,?)').run(json(owner));acquired=true;
        for(const [ordinal,resource]of exported.resources.entries()){
          const fingerprint=digest(json([SCHEMA,resource.id,resource.sha256,resource.bytes]));
          const prior=db.prepare("SELECT document FROM members WHERE build=? AND json_extract(resource,'$.id')=?").get(id,resource.id);
          const reusable=db.prepare("SELECT id FROM documents WHERE fingerprint=? AND state IN ('TEXT','BINARY') ORDER BY updated DESC LIMIT 1").get(fingerprint);
          const doc=prior?.document??reusable?.id??digest(json([id,fingerprint]));
          db.prepare("INSERT OR IGNORE INTO documents(id,fingerprint,state,updated) VALUES(?,?,'PENDING',?)").run(doc,fingerprint,now());
          db.prepare('INSERT OR IGNORE INTO members VALUES(?,?,?,?)').run(id,doc,ordinal,json(resource));
        }
        put('last',id);return false;
      });
      if(done)return inspect(id);
      active=controller;
      const members=db.prepare('SELECT m.*,d.state FROM members m JOIN documents d ON d.id=m.document WHERE m.build=? ORDER BY m.ordinal').all(id);
      for(const m of members){
        controller.signal.throwIfAborted();
        if(['TEXT','BINARY'].includes(m.state)){if(onProgress)onProgress(inspect(id));continue;}
        const resource=parse(m.resource);let saved;
        transaction(()=>{clearDocument(m.document);db.prepare("UPDATE documents SET state='INDEXING',bytes=0,passages=0,error=NULL,updated=? WHERE id=?").run(now(),m.document);});
        try{
          requireValue(resource.status==='VERIFIED','RESOURCE_NOT_VERIFIED',409);
          saved=await library.download(resource.id,{signal:controller.signal});
          requireValue(saved.sha256===resource.sha256&&saved.bytes===resource.bytes,'INDEX_SOURCE_CHANGED',409);
          let pending='',byte=0,line=1,ordinal=0,leftFragment=false,readPosition=0;
          const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}),buffer=Buffer.allocUnsafe(128*1024);
          const flush=(text,rightFragment)=>{
            const terms=new Set();
            for(const match of text.matchAll(words)){
              if((leftFragment&&match.index===0)||(rightFragment&&match.index+match[0].length===text.length))continue;
              const term=normal(match[0]);if(Buffer.byteLength(term)<=MAX_QUERY_BYTES)terms.add(encoded(term));
            }
            const nextByte=byte+Buffer.byteLength(text),nextLine=line+lines(text);
            transaction(()=>{
              const r=db.prepare('INSERT INTO passages(document,ordinal,byte_start,byte_end,line_start,line_end,text,left_fragment,right_fragment) VALUES(?,?,?,?,?,?,?,?,?)').run(m.document,ordinal,byte,nextByte,line,nextLine,text,Number(leftFragment),Number(rightFragment));
              db.prepare('INSERT INTO terms(rowid,body) VALUES(?,?)').run(r.lastInsertRowid,[...terms].join(' '));
              db.prepare('UPDATE documents SET bytes=?,passages=?,updated=? WHERE id=?').run(nextByte,ordinal+1,now(),m.document);
            });
            byte=nextByte;line=nextLine;ordinal++;leftFragment=rightFragment;
          };
          const consume=(text,final=false)=>{
            requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text),'NON_TEXT_CONTENT',415);
            pending+=text;
            while(pending.length>PAGE||final&&pending.length){
              let cut=final&&pending.length<=PAGE?pending.length:PAGE;
              if(cut<pending.length&&/[\uDC00-\uDFFF]/.test(pending[cut]))cut--;
              if(cut<pending.length){
                let boundary=cut;while(boundary>PAGE/2&&word.test(pending[boundary-1]))boundary--;
                if(boundary>PAGE/2)cut=boundary;
                if(pending[cut-1]==='\r'&&pending[cut]==='\n')cut++;
              }
              const rightFragment=cut<pending.length&&word.test(pending[cut-1])&&word.test(pending[cut]);
              flush(pending.slice(0,cut),rightFragment);pending=pending.slice(cut);
            }
          };
          while(true){
            controller.signal.throwIfAborted();
            const {bytesRead}=await saved.file.read(buffer,0,buffer.length,readPosition);if(!bytesRead)break;
            readPosition+=bytesRead;
            try{consume(decoder.decode(buffer.subarray(0,bytesRead),{stream:true}));}
            catch(e){if(e instanceof TypeError)requireValue(false,'INVALID_UTF8_CONTENT',415);throw e;}
          }
          try{consume(decoder.decode(),true);}catch(e){if(e instanceof TypeError)requireValue(false,'INVALID_UTF8_CONTENT',415);throw e;}
          requireValue(byte===saved.bytes,'TEXT_BYTE_COVERAGE_MISMATCH',500);
          controller.signal.throwIfAborted();
          db.prepare("UPDATE documents SET state='TEXT',bytes=?,passages=?,updated=? WHERE id=?").run(byte,ordinal,now(),m.document);
        }catch(e){
          if(controller.signal.aborted)throw e;
          const error=code(e),state=['NON_TEXT_CONTENT','INVALID_UTF8_CONTENT'].includes(error)?'BINARY':'UNAVAILABLE';
          transaction(()=>{clearDocument(m.document);db.prepare('UPDATE documents SET state=?,bytes=?,passages=0,error=?,updated=? WHERE id=?').run(state,saved?.bytes??0,error,now(),m.document);});
        }finally{if(saved)await saved.dispose();}
        if(onProgress)onProgress(inspect(id));
      }
      controller.signal.throwIfAborted();
      transaction(()=>{db.prepare("UPDATE builds SET state='COMPLETE',updated=?,error=NULL WHERE id=?").run(now(),id);put('current',id);});
      return inspect(id);
    }catch(e){
      if(acquired)db.prepare('UPDATE builds SET state=?,updated=?,error=? WHERE id=?').run(controller.signal.aborted?'CANCELLED':'FAILED',now(),controller.signal.aborted?'INDEX_CANCELLED':code(e),id);
      throw e;
    }finally{
      if(acquired)transaction(()=>{const held=parse(db.prepare('SELECT owner FROM lease').get()?.owner);if(held?.nonce===owner.nonce)db.prepare('DELETE FROM lease WHERE singleton=1').run();});
      if(active===controller)active=null;signal?.removeEventListener('abort',abort);
    }
  }
  function plan({q,mode='all',build,resourceId}={}){
    const terms=queryTerms(q);requireValue(['all','any'].includes(mode),'QUERY_MODE_INVALID');
    const b=selected(build);requireValue(b.state==='COMPLETE','INDEX_NOT_COMPLETE',409);
    const args=[b.id],sql=[];
    if(resourceId!==undefined){requireValue(/^[a-f0-9]{64}$/.test(resourceId),'RESOURCE_ID_INVALID');sql.push("json_extract(m.resource,'$.id')=?");args.push(resourceId);}
    const predicates=terms.map(term=>{
      args.push('"'+encoded(term)+'"');
      return 'm.document IN (SELECT p.document FROM passages p JOIN terms ON terms.rowid=p.id WHERE terms MATCH ?)';
    });
    sql.push('('+predicates.join(mode==='all'?' AND ':' OR ')+')');
    return {terms,mode,build:b,where:'m.build=? AND '+sql.join(' AND '),args,match:terms.map(t=>'"'+encoded(t)+'"').join(' OR ')};
  }
  function currentAnnotation(resource){
    try{const r=library.resource(resource.id);if(r.sha256===resource.sha256)return {annotation:r.annotation,editable:true};}catch{}
    return {annotation:null,editable:false};
  }
  function search(options={}){
    requireValue(!closed,'SEARCH_CLOSED');const p=plan(options);
    const offset=integer(options.offset??0,0,Number.MAX_SAFE_INTEGER,'OFFSET_INVALID'),limit=integer(options.limit??25,1,100,'LIMIT_INVALID');
    const total=db.prepare(`SELECT count(*) AS n FROM members m WHERE ${p.where}`).get(...p.args).n;
    const rows=db.prepare(`SELECT m.* FROM members m WHERE ${p.where} ORDER BY m.ordinal,m.document LIMIT ? OFFSET ?`).all(...p.args,limit,offset);
    const items=rows.map(r=>{
      const resource=parse(r.resource),match=db.prepare('SELECT p.* FROM passages p JOIN terms ON terms.rowid=p.id WHERE p.document=? AND terms MATCH ? ORDER BY p.ordinal LIMIT 1').get(r.document,p.match);
      const matches=db.prepare('SELECT count(*) AS n FROM passages p JOIN terms ON terms.rowid=p.id WHERE p.document=? AND terms MATCH ?').get(r.document,p.match).n;
      return {document:r.document,resource:{id:resource.id,name:resource.name,bytes:resource.bytes,sha256:resource.sha256,contentType:resource.contentType},
        ...currentAnnotation(resource),passageCount:matches,excerpt:excerpt(match,p.terms)};
    });
    return {schema:SCHEMA,build:p.build.id,binding:p.build.binding,q:options.q,mode:p.mode,total,offset,limit,
      nextOffset:offset+items.length<total?offset+items.length:null,items};
  }
  function passages(options={}){
    const p=plan(options),offset=integer(options.offset??0,0,Number.MAX_SAFE_INTEGER,'OFFSET_INVALID'),limit=integer(options.limit??25,1,100,'LIMIT_INVALID');
    requireValue(typeof options.resourceId==='string','RESOURCE_ID_REQUIRED');
    const member=db.prepare(`SELECT m.* FROM members m WHERE ${p.where}`).get(...p.args);
    if(!member)return {build:p.build.id,total:0,offset,limit,nextOffset:null,items:[]};
    const total=db.prepare('SELECT count(*) AS n FROM passages p JOIN terms ON terms.rowid=p.id WHERE p.document=? AND terms MATCH ?').get(member.document,p.match).n;
    const rows=db.prepare('SELECT p.* FROM passages p JOIN terms ON terms.rowid=p.id WHERE p.document=? AND terms MATCH ? ORDER BY p.ordinal LIMIT ? OFFSET ?').all(member.document,p.match,limit,offset);
    return {build:p.build.id,total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null,
      items:rows.map(r=>({ordinal:r.ordinal,byteStart:r.byte_start,byteEnd:r.byte_end,lineStart:r.line_start,lineEnd:r.line_end,excerpt:excerpt(r,p.terms)}))};
  }
  function page({build,resourceId,ordinal}={}){
    const b=selected(build);requireValue(b.state==='COMPLETE','INDEX_NOT_COMPLETE',409);
    requireValue(/^[a-f0-9]{64}$/.test(resourceId??''),'RESOURCE_ID_INVALID');integer(ordinal,0,Number.MAX_SAFE_INTEGER,'PASSAGE_INVALID');
    const m=db.prepare("SELECT m.* FROM members m WHERE build=? AND json_extract(resource,'$.id')=?").get(b.id,resourceId);
    requireValue(m,'RESOURCE_NOT_IN_INDEX',404);
    const r=db.prepare('SELECT * FROM passages WHERE document=? AND ordinal=?').get(m.document,ordinal);requireValue(r,'PASSAGE_NOT_FOUND',404);
    const d=db.prepare('SELECT passages FROM documents WHERE id=?').get(m.document);
    return {build:b.id,resourceId,ordinal,passageCount:d.passages,text:r.text,byteStart:r.byte_start,byteEnd:r.byte_end,lineStart:r.line_start,lineEnd:r.line_end};
  }
  function listSaved(){return db.prepare("SELECT value FROM saved WHERE coalesce(json_extract(value,'$.deleted'),0)=0 ORDER BY lower(json_extract(value,'$.name')),id").all().map(r=>parse(r.value));}
  function saveQuery({id,name,q,mode='all',expectedRevision=0,operationId}={}){
    id=id??digest('saved-query:'+String(operationId));
    requireValue(typeof id==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(id),'SAVED_QUERY_ID_INVALID');
    requireValue(typeof name==='string'&&name.trim().length>0&&Buffer.byteLength(name)<=160,'SAVED_QUERY_NAME_REQUIRED');queryTerms(q);
    requireValue(['all','any'].includes(mode),'QUERY_MODE_INVALID');integer(expectedRevision,0,Number.MAX_SAFE_INTEGER,'REVISION_INVALID');
    requireValue(typeof operationId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(operationId),'OPERATION_ID_REQUIRED');
    // Include the requested id, not a generated response id, in the stable request digest.
    const request={id,name:name.trim(),q,mode,expectedRevision},hash=digest(json(request));
    return transaction(()=>{
      const receipt=db.prepare('SELECT * FROM receipts WHERE operation=?').get(operationId);
      if(receipt){requireValue(receipt.digest===hash,'OPERATION_ID_CONFLICT',409);return parse(receipt.result);}
      const prior=db.prepare('SELECT revision FROM saved WHERE id=?').get(id);requireValue((prior?.revision??0)===expectedRevision,'SAVED_QUERY_REVISION_CONFLICT',409);
      const result={...request,revision:expectedRevision+1,updatedAt:now()};delete result.expectedRevision;
      db.prepare('INSERT INTO saved VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,value=excluded.value').run(id,result.revision,json(result));
      db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(operationId,hash,json(result));return result;
    });
  }
  function deleteQuery({id,expectedRevision,operationId}={}){
    integer(expectedRevision,1,Number.MAX_SAFE_INTEGER,'REVISION_INVALID');
    requireValue(typeof operationId==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(operationId),'OPERATION_ID_REQUIRED');
    const hash=digest(json({action:'delete',id,expectedRevision}));
    return transaction(()=>{
      const receipt=db.prepare('SELECT * FROM receipts WHERE operation=?').get(operationId);
      if(receipt){requireValue(receipt.digest===hash,'OPERATION_ID_CONFLICT',409);return parse(receipt.result);}
      const r=db.prepare('SELECT revision FROM saved WHERE id=?').get(id);
      requireValue(r?.revision===expectedRevision,'SAVED_QUERY_REVISION_CONFLICT',409);
      const result={deleted:true,id,revision:expectedRevision+1,updatedAt:now()};
      db.prepare('UPDATE saved SET revision=?,value=? WHERE id=?').run(result.revision,json(result),id);
      db.prepare('INSERT INTO receipts VALUES(?,?,?)').run(operationId,hash,json(result));return result;
    });
  }
  function *findings(options={}){
    const p=plan(options),perPage=100;let offset=0;
    const review=library.exportReview(),annotations=new Map(review.annotations.map(a=>[a.id,a]));
    const current=new Map(review.resources.map(r=>[r.id,r]));
    while(true){
      const result=search({...options,build:p.build.id,offset,limit:perPage});
      for(const item of result.items){
        let passageOffset=0;
        while(true){
          const resultPassages=passages({...options,build:p.build.id,resourceId:item.resource.id,offset:passageOffset,limit:perPage});
          for(const passage of resultPassages.items)yield {resource:item.resource,annotation:annotations.get(item.resource.id)??null,editable:current.get(item.resource.id)?.sha256===item.resource.sha256,...passage};
          if(resultPassages.nextOffset===null)break;passageOffset=resultPassages.nextOffset;
        }
      }
      if(result.nextOffset===null)break;offset=result.nextOffset;
    }
  }
  return Object.freeze({library,path,status,inspect,index,search,passages,page,listSaved,saveQuery,deleteQuery,findings,
    cancel(){if(active)active.abort(new Error('INDEX_CANCELLED'));return {cancelled:Boolean(active)};},
    close(){requireValue(!active,'INDEX_STILL_RUNNING',409);if(!closed){closed=true;db.close();}}});
}
