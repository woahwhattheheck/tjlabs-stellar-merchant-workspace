import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, lstatSync, chmodSync, realpathSync, openSync, closeSync, unlinkSync, renameSync, readFileSync, writeFileSync, fsyncSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { VERSION, RozoError, assert, id, sha, canonical, jsonDigest, digest, clone, newId, integer, text } from './model.mjs';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema TEXT NOT NULL, workspace_id TEXT NOT NULL, origin_id TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,workspace_revision INTEGER NOT NULL,json TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(kind,id))',
  'CREATE TABLE IF NOT EXISTS editions (kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,workspace_revision INTEGER NOT NULL,request_id TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,json TEXT NOT NULL,sha256 TEXT NOT NULL,PRIMARY KEY(kind,id,version))',
  'CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,envelope TEXT NOT NULL,intent TEXT,state TEXT NOT NULL,result TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS attempts (request_id TEXT NOT NULL,number INTEGER NOT NULL,kind TEXT NOT NULL,state TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,details TEXT NOT NULL,PRIMARY KEY(request_id,number))',
  'CREATE TABLE IF NOT EXISTS objects (sha256 TEXT PRIMARY KEY,bytes INTEGER NOT NULL,type TEXT NOT NULL,body BLOB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY,request_id TEXT,profile_id TEXT NOT NULL,kind TEXT NOT NULL,recorded_at TEXT NOT NULL,request TEXT NOT NULL,status INTEGER,headers TEXT NOT NULL,body_sha256 TEXT,error TEXT,FOREIGN KEY(body_sha256) REFERENCES objects(sha256))',
  'CREATE TABLE IF NOT EXISTS observations (sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,profile_id TEXT NOT NULL,kind TEXT NOT NULL,identity TEXT NOT NULL,capture_id TEXT,recorded_at TEXT NOT NULL,sha256 TEXT NOT NULL,json TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS observation_profile_identity ON observations(profile_id,identity,sequence)',
  'CREATE TABLE IF NOT EXISTS callback_events (profile_id TEXT NOT NULL,event_id TEXT NOT NULL,body_sha256 TEXT NOT NULL,receipt TEXT NOT NULL,PRIMARY KEY(profile_id,event_id))',
  'CREATE TABLE IF NOT EXISTS audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT,workspace_revision INTEGER NOT NULL,request_id TEXT,kind TEXT NOT NULL,at TEXT NOT NULL,json TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS leases (name TEXT PRIMARY KEY,owner TEXT NOT NULL,host TEXT NOT NULL,pid INTEGER NOT NULL,process_start TEXT NOT NULL,boot_id TEXT NOT NULL,at TEXT NOT NULL)'
].join(';\n')+';';
const parse=value=>value===null || value===undefined?null:JSON.parse(value);
const nowIso=()=>new Date().toISOString();
function privateDirectory(directory,{create=false,readOnly=false}={}) {
  const absolute=resolve(directory);
  if(create)mkdirSync(absolute,{recursive:true,mode:0o700});
  assert(existsSync(absolute),'WORKSPACE_MISSING','Initialize this ROZO workspace first.',404);
  const stat=lstatSync(absolute);
  assert(stat.isDirectory()&&!stat.isSymbolicLink(),'WORKSPACE_PATH','The private workspace must be an actual directory.');
  if(!readOnly)chmodSync(absolute,0o700);
  return realpathSync(absolute);
}
export class RozoWorkspace {
  constructor(directory,{create=false,now=nowIso,readOnly=false,receivingActivation=null}={}) {
    this.directory=privateDirectory(directory,{create,readOnly});this.file=join(this.directory,'rozo.sqlite3');this.now=now;this.closed=false;this.readOnly=readOnly;
    const existed=existsSync(this.file);
    assert(existed||create,'WORKSPACE_MISSING','The original ROZO database is absent; initialization is explicit.',404);
    if(existed)assert(lstatSync(this.file).isFile()&&!lstatSync(this.file).isSymbolicLink(),'WORKSPACE_PATH','The database must be an actual private file.');
    const receivingMarker=join(this.directory,'RECEIVING.json');
    if(!readOnly&&existsSync(receivingMarker)){
      assert(lstatSync(receivingMarker).isFile()&&!lstatSync(receivingMarker).isSymbolicLink(),'RECEIVE_IDENTITY','Retain the original receiving marker.',409);
      const marker=JSON.parse(readFileSync(receivingMarker)),probe=new DatabaseSync(this.file,{readOnly:true,timeout:5000});
      try{
        const m=probe.prepare('SELECT workspace_id,origin_id FROM meta WHERE singleton=1').get(),control=parse(probe.prepare("SELECT json FROM records WHERE kind='control' AND id='operator'").get()?.json);
        assert(marker.schema==='stellar-forge.rozo-receiving-marker.v1'&&marker.workspaceId===m.workspace_id&&marker.originId===m.origin_id,'RECEIVE_IDENTITY','The receiving marker names another original workspace.',409);
        if(receivingActivation){
          assert(marker.mode==='handover'&&receivingActivation.deliveryId===marker.deliveryId&&control?.mode==='sealed'&&control.requestId===marker.requestId,'RECEIVE_SEAL','Activation needs this exact original sealed handover.',409);
        }else{
          const receipt=control?.activationRequestId?probe.prepare('SELECT state,envelope FROM requests WHERE id=?').get(control.activationRequestId):null;
          const request=parse(receipt?.envelope);
          assert(marker.mode==='handover'&&control?.mode==='active'&&control.sourceDelivery===marker.deliveryId&&receipt?.state==='accepted'&&request?.command==='workspace.receive'&&request.payload?.deliveryId===marker.deliveryId,'RECEIVE_REQUIRED','This received snapshot opens for review. Activate its original sealed handover before starting an operator.',409);
        }
      }finally{probe.close();}
    }
    this.db=new DatabaseSync(this.file,{readOnly,timeout:5000});
    try{
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
      if(!readOnly){
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
        this.db.exec(SCHEMA);
        if(!existed){
          const origin=newId('rozo');
          this.db.prepare('INSERT INTO meta VALUES(1,?,?,?,?,?)').run(VERSION,origin,origin,0,this.now());
        }
        chmodSync(this.file,0o600);
      }
      assert(this.meta().schema===VERSION,'WORKSPACE_VERSION','This is not the selected ROZO workspace schema.');
      const m=this.meta(),identity={schema:'stellar-forge.rozo-workspace.v1',workspaceId:m.workspaceId,originId:m.originId,createdAt:m.createdAt},marker=join(this.directory,'workspace.json');
      if(!existsSync(marker)&&create&&!readOnly){
        const fd=openSync(marker,'wx',0o600);try{writeFileSync(fd,canonical(identity)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
      }
      assert(existsSync(marker)&&lstatSync(marker).isFile()&&!lstatSync(marker).isSymbolicLink(),'WORKSPACE_IDENTITY','Retain the original immutable workspace.json marker.',409);
      assert(canonical(JSON.parse(readFileSync(marker,'utf8')))===canonical(identity),'WORKSPACE_IDENTITY','The native database and original workspace identity marker differ.',409);
      const check=this.db.prepare('PRAGMA quick_check').all();
      assert(check.length===1 && Object.values(check[0])[0]==='ok','WORKSPACE_INTEGRITY','The original ROZO database failed its integrity read; preserve its files.',409);
    }catch(error){this.db.close();this.closed=true;throw error;}
  }
  meta(){this.assertOpen();const row=this.db.prepare('SELECT * FROM meta WHERE singleton=1').get();assert(row,'WORKSPACE_METADATA','The original database metadata is absent.',409);return {schema:row.schema,workspaceId:row.workspace_id,originId:row.origin_id,revision:row.revision,createdAt:row.created_at};}
  assertOpen(){assert(!this.closed,'WORKSPACE_CLOSED','This workspace has closed.',409);}
  tx(fn){
    this.assertOpen();assert(!this.readOnly,'READ_ONLY','This workspace was opened for reading.',409);
    this.db.exec('BEGIN IMMEDIATE');
    try{const value=fn();assert(!value?.then,'ASYNC_TRANSACTION','A workspace transaction cannot contain network or asynchronous work.',500);this.db.exec('COMMIT');return value;}catch(error){try{this.db.exec('ROLLBACK');}catch{}throw error;}
  }
  advance(requestId,kind,details){
    this.db.prepare('UPDATE meta SET revision=revision+1 WHERE singleton=1').run();const revision=this.meta().revision;
    this.db.prepare('INSERT INTO audit(workspace_revision,request_id,kind,at,json) VALUES(?,?,?,?,?)').run(revision,requestId??null,kind,this.now(),canonical(details));
    return revision;
  }
  checkEnvelope(envelope){
    objectEnvelope(envelope);const m=this.meta();
    assert(envelope.workspaceId===m.workspaceId,'WORKSPACE_IDENTITY','The request belongs to another workspace.',409);
    return {fingerprint:jsonDigest(envelope),meta:m};
  }
  request(requestId,{includeIntent=true}={}){
    id(requestId,'requestId');const row=this.db.prepare('SELECT * FROM requests WHERE id=?').get(requestId);if(!row)return null;
    const attempts=this.db.prepare('SELECT * FROM attempts WHERE request_id=? ORDER BY number').all(requestId).map(a=>({number:a.number,kind:a.kind,state:a.state,startedAt:a.started_at,endedAt:a.ended_at,details:parse(a.details)}));
    return {id:row.id,fingerprint:row.fingerprint,envelope:parse(row.envelope),...(includeIntent?{intent:parse(row.intent)}:{}),state:row.state,result:parse(row.result),createdAt:row.created_at,updatedAt:row.updated_at,attempts};
  }
  requests({state,offset=0,limit=100}={}){
    integer(offset,'offset');integer(limit,'limit',1,200);
    const rows=state?this.db.prepare('SELECT id FROM requests WHERE state=? ORDER BY created_at DESC,id LIMIT ? OFFSET ?').all(state,limit,offset):this.db.prepare('SELECT id FROM requests ORDER BY created_at DESC,id LIMIT ? OFFSET ?').all(limit,offset);
    const total=(state?this.db.prepare('SELECT count(*) n FROM requests WHERE state=?').get(state):this.db.prepare('SELECT count(*) n FROM requests').get()).n;
    return {total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null,items:rows.map(r=>this.request(r.id,{includeIntent:false}))};
  }
  replay(envelope){
    const checked=this.checkEnvelope(envelope),old=this.request(envelope.requestId);
    if(old)assert(old.fingerprint===checked.fingerprint,'REQUEST_CONFLICT','This requestId already names different original input.',409);
    return old;
  }
  commit(envelope,handler){
    return this.tx(()=>{
      const old=this.replay(envelope);if(old){assert(old.state==='accepted','REQUEST_PENDING','This original request needs its retained continuation.',409,{requestId:old.id});return {...old.result,reused:true};}
      const m=this.meta();assert(envelope.expectedRevision===m.revision,'REVISION_CONFLICT','The workspace changed; review the current edition.',409,{revision:m.revision,requestState:'rejected'});
      const revision=m.revision+1,context={revision,requestId:envelope.requestId,actor:envelope.actor,at:this.now(),put:(kind,value)=>this.put(kind,value,{revision,requestId:envelope.requestId,actor:envelope.actor})};
      const value=handler(context);assert(!value?.then,'ASYNC_TRANSACTION','Only local synchronous work belongs in a commit.',500);
      this.advance(envelope.requestId,envelope.command,{actor:envelope.actor});
      const result={schema:VERSION+'.operation-result',workspaceId:m.workspaceId,requestId:envelope.requestId,fingerprint:jsonDigest(envelope),revision,result:value};
      this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?)').run(envelope.requestId,result.fingerprint,canonical(envelope),null,'accepted',canonical(result),context.at,context.at);
      return result;
    });
  }
  prepare(envelope,intent){
    return this.tx(()=>{
      const old=this.replay(envelope);if(old)return old;
      const m=this.meta();assert(envelope.expectedRevision===m.revision,'REVISION_CONFLICT','The workspace changed before the original intent was prepared.',409,{revision:m.revision,requestState:'rejected'});
      const at=this.now();
      this.db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?)').run(envelope.requestId,jsonDigest(envelope),canonical(envelope),canonical(intent),'prepared',null,at,at);
      this.advance(envelope.requestId,'intent_prepared',{command:envelope.command,intentSha256:jsonDigest(intent)});
      return this.request(envelope.requestId);
    });
  }
  beginAttempt(requestId,kind,details={}){
    return this.tx(()=>{
      const r=this.request(requestId);assert(r,'REQUEST_MISSING','The original request is absent.',404);
      assert(r.state!=='accepted','REQUEST_ACCEPTED','The original request is already accepted.',409);
      const number=r.attempts.length+1;
      this.db.prepare('INSERT INTO attempts VALUES(?,?,?,?,?,?,?)').run(requestId,number,kind,'started',this.now(),null,canonical(details));
      this.db.prepare('UPDATE requests SET state=?,updated_at=? WHERE id=?').run('pending',this.now(),requestId);
      this.advance(requestId,'attempt_started',{number,kind});
      return number;
    });
  }
  finishAttempt(requestId,number,{state,details={}}){
    assert(['returned','failed','uncertain','reconciled'].includes(state),'ATTEMPT_STATE','Select a retained attempt result.');
    return this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM attempts WHERE request_id=? AND number=?').get(requestId,number);assert(old,'ATTEMPT_MISSING','The original attempt is absent.',404);
      if(old.state!=='started'){assert(old.state===state && canonical(parse(old.details))===canonical(details),'ATTEMPT_CONFLICT','The original attempt result is immutable.',409);return;}
      this.db.prepare('UPDATE attempts SET state=?,ended_at=?,details=? WHERE request_id=? AND number=?').run(state,this.now(),canonical(details),requestId,number);
      this.advance(requestId,'attempt_returned',{number,state});
    });
  }
  complete(requestId,value,{records=[]}={}){
    return this.tx(()=>{
      const r=this.request(requestId);assert(r,'REQUEST_MISSING','The original request is absent.',404);
      if(r.state==='accepted')return {...r.result,reused:true};
      const revision=this.meta().revision+1;
      for(const [kind,record]of records)this.put(kind,record,{revision,requestId,actor:r.envelope.actor});
      this.advance(requestId,'request_accepted',{command:r.envelope.command});
      const result={schema:VERSION+'.operation-result',workspaceId:this.meta().workspaceId,requestId,fingerprint:r.fingerprint,revision,result:value};
      this.db.prepare('UPDATE requests SET state=?,result=?,updated_at=? WHERE id=?').run('accepted',canonical(result),this.now(),requestId);
      return result;
    });
  }
  put(kind,value,{revision,requestId,actor}){
    id(kind,'record kind');id(value.id,'record id');
    const old=this.db.prepare('SELECT version FROM records WHERE kind=? AND id=?').get(kind,value.id);
    const version=(old?.version??0)+1,body=canonical(value),hash=digest(body);
    this.db.prepare('INSERT INTO editions VALUES(?,?,?,?,?,?,?,?,?)').run(kind,value.id,version,revision,requestId,actor,this.now(),body,hash);
    this.db.prepare('INSERT INTO records VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET version=excluded.version,workspace_revision=excluded.workspace_revision,json=excluded.json,sha256=excluded.sha256').run(kind,value.id,version,revision,body,hash);
    return {value:clone(value),version,workspaceRevision:revision,sha256:hash};
  }
  get(kind,recordId,{version}={}){
    const row=version===undefined?this.db.prepare('SELECT * FROM records WHERE kind=? AND id=?').get(kind,recordId):this.db.prepare('SELECT * FROM editions WHERE kind=? AND id=? AND version=?').get(kind,recordId,version);
    return row?{value:parse(row.json),version:row.version,workspaceRevision:row.workspace_revision,sha256:row.sha256}:null;
  }
  list(kind,{offset=0,limit=100,all=false}={}){
    integer(offset,'offset');if(!all)integer(limit,'limit',1,200);
    const rows=all?this.db.prepare('SELECT * FROM records WHERE kind=? ORDER BY id').all(kind):this.db.prepare('SELECT * FROM records WHERE kind=? ORDER BY id LIMIT ? OFFSET ?').all(kind,limit,offset);
    const total=this.db.prepare('SELECT count(*) n FROM records WHERE kind=?').get(kind).n;
    return {total,offset,limit:all?total:limit,nextOffset:offset+rows.length<total?offset+rows.length:null,items:rows.map(row=>({value:parse(row.json),version:row.version,workspaceRevision:row.workspace_revision,sha256:row.sha256}))};
  }
  history(kind,recordId){
    return this.db.prepare('SELECT * FROM editions WHERE kind=? AND id=? ORDER BY version').all(kind,recordId).map(row=>({value:parse(row.json),version:row.version,workspaceRevision:row.workspace_revision,sha256:row.sha256,requestId:row.request_id,actor:row.actor,at:row.at}));
  }
  object(bytes,type='application/octet-stream'){
    assert(Buffer.isBuffer(bytes)||bytes instanceof Uint8Array,'INVALID_BYTES','Retain original binary bytes.');
    const body=Buffer.from(bytes),hash=digest(body);
    const old=this.db.prepare('SELECT bytes FROM objects WHERE sha256=?').get(hash);
    assert(!old||old.bytes===body.length,'OBJECT_IDENTITY','A retained object has conflicting byte identity.',409);
    if(!old)this.db.prepare('INSERT INTO objects VALUES(?,?,?,?)').run(hash,body.length,type,body);
    return {sha256:hash,bytes:body.length,type};
  }
  bytes(hash,{offset=0,length=1024*1024}={}){
    sha(hash);integer(offset,'offset');integer(length,'length',1,4*1024*1024);
    const descriptor=this.db.prepare('SELECT bytes,type FROM objects WHERE sha256=?').get(hash);assert(descriptor,'OBJECT_MISSING','The original source object is absent.',404);
    assert(offset<=descriptor.bytes,'RANGE','Offset is beyond the original file.',416);
    const size=Math.min(length,descriptor.bytes-offset);
    const row=this.db.prepare('SELECT substr(body,?,?) body FROM objects WHERE sha256=?').get(offset+1,size,hash);
    return {sha256:hash,bytes:descriptor.bytes,type:descriptor.type,offset,length:size,nextOffset:offset+size<descriptor.bytes?offset+size:null,data:Buffer.from(row.body??[])};
  }
  wholeObject(hash){
    sha(hash);const row=this.db.prepare('SELECT * FROM objects WHERE sha256=?').get(hash);assert(row,'OBJECT_MISSING','The original object is absent.',404);const body=Buffer.from(row.body);assert(body.length===row.bytes&&digest(body)===hash,'OBJECT_IDENTITY','The original object bytes changed.',409);return body;
  }
  capture({id:captureId=newId('capture'),requestId=null,profileId,kind,request,status=null,headers={},body=null,error=null,at=this.now()}){
    return this.tx(()=>{
      const descriptor=body===null?null:this.object(body,headers['content-type']??'application/octet-stream');
      const item={id:captureId,requestId,profileId,kind,recordedAt:at,request,status,headers,body:descriptor,error};
      const existing=this.db.prepare('SELECT id FROM captures WHERE id=?').get(captureId);
      assert(!existing,'CAPTURE_EXISTS','Use the original capture receipt instead of replacing its source.',409);
      this.db.prepare('INSERT INTO captures VALUES(?,?,?,?,?,?,?,?,?,?)').run(captureId,requestId,profileId,kind,at,canonical(request),status,canonical(headers),descriptor?.sha256??null,error?canonical(error):null);
      this.advance(requestId,'source_captured',{captureId,profileId,kind,bodySha256:descriptor?.sha256??null,status});
      return item;
    });
  }
  capturesFor(requestId){return this.db.prepare('SELECT id FROM captures WHERE request_id=? ORDER BY recorded_at,id').all(requestId).map(r=>this.getCapture(r.id));}
  putProgress(kind,value,requestId){
    return this.tx(()=>{const request=this.request(requestId);assert(request,'REQUEST_MISSING','Retain the original operation.',404);const revision=this.meta().revision+1;
      const result=this.put(kind,value,{revision,requestId,actor:request.envelope.actor});this.advance(requestId,'progress_saved',{kind,id:value.id});return result;});
  }
  captures({profileId,offset=0,limit=100}={}){
    integer(offset,'offset');integer(limit,'limit',1,200);
    const total=(profileId?this.db.prepare('SELECT count(*) n FROM captures WHERE profile_id=?').get(profileId):this.db.prepare('SELECT count(*) n FROM captures').get()).n;
    const rows=profileId?this.db.prepare('SELECT id FROM captures WHERE profile_id=? ORDER BY recorded_at DESC,id LIMIT ? OFFSET ?').all(profileId,limit,offset):this.db.prepare('SELECT id FROM captures ORDER BY recorded_at DESC,id LIMIT ? OFFSET ?').all(limit,offset);
    return {total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null,items:rows.map(r=>this.getCapture(r.id))};
  }
  getCapture(captureId){
    const r=this.db.prepare('SELECT c.*,o.bytes,o.type FROM captures c LEFT JOIN objects o ON o.sha256=c.body_sha256 WHERE c.id=?').get(captureId);if(!r)return null;
    return {id:r.id,requestId:r.request_id,profileId:r.profile_id,kind:r.kind,recordedAt:r.recorded_at,request:parse(r.request),status:r.status,headers:parse(r.headers),body:r.body_sha256?{sha256:r.body_sha256,bytes:r.bytes,type:r.type}:null,error:parse(r.error)};
  }
  observe({profileId,kind,identity,captureId=null,value,at=this.now()}){
    return this.tx(()=>this.observeInTransaction({profileId,kind,identity,captureId,value,at}));
  }
  observeInTransaction({profileId,kind,identity,captureId=null,value,at=this.now()}){
    const hash=jsonDigest(value),observationId='obs-'+jsonDigest({profileId,kind,identity,captureId,hash}),body=canonical(value);
    const old=this.db.prepare('SELECT sequence FROM observations WHERE id=?').get(observationId);
    if(!old){this.db.prepare('INSERT INTO observations(id,profile_id,kind,identity,capture_id,recorded_at,sha256,json) VALUES(?,?,?,?,?,?,?,?)').run(observationId,profileId,kind,identity,captureId,at,hash,body);this.advance(null,'observation_retained',{id:observationId,profileId,kind,identity});}
    return this.observation(observationId);
  }
  observation(observationId){const r=this.db.prepare('SELECT * FROM observations WHERE id=?').get(observationId);return r?{sequence:r.sequence,id:r.id,profileId:r.profile_id,kind:r.kind,identity:r.identity,captureId:r.capture_id,recordedAt:r.recorded_at,sha256:r.sha256,value:parse(r.json)}:null;}
  observations(profileId,{identity,kind,after=0,limit=null}={}){
    const where=['profile_id=?','sequence>?'],args=[profileId,after];if(identity!==undefined){where.push('identity=?');args.push(identity);}if(kind!==undefined){where.push('kind=?');args.push(kind);}let sql='SELECT id FROM observations WHERE '+where.join(' AND ')+' ORDER BY sequence';
    if(limit!==null){integer(limit,'limit',1,1000);sql+=' LIMIT ?';args.push(limit);}
    return this.db.prepare(sql).all(...args).map(r=>this.observation(r.id));
  }
  callback(profileId,event,rawSha256,captureId){
    return this.tx(()=>{
      const old=this.db.prepare('SELECT * FROM callback_events WHERE profile_id=? AND event_id=?').get(profileId,event.event_id);
      if(old){
        if(old.body_sha256!==rawSha256){this.advance(null,'callback_conflict',{profileId,eventId:event.event_id,originalSha256:old.body_sha256,receivedSha256:rawSha256,captureId});return {state:'conflict',eventId:event.event_id,originalSha256:old.body_sha256,receivedSha256:rawSha256};}
        return {...parse(old.receipt),reused:true};
      }
      const observation=this.observeInTransaction({profileId,kind:'callback',identity:event.data.id,captureId,value:event});
      const full=this.observeInTransaction({profileId,kind:'payment',identity:event.data.id,captureId,value:event.data});
      const receipt={schema:VERSION+'.callback-receipt',state:'accepted',profileId,eventId:event.event_id,paymentId:event.data.id,bodySha256:rawSha256,captureId,observationId:observation.id,fullPaymentObservationId:full.id,revision:this.meta().revision};
      this.db.prepare('INSERT INTO callback_events VALUES(?,?,?,?)').run(profileId,event.event_id,rawSha256,canonical(receipt));return receipt;
    });
  }
  callbackReceipt(profileId,eventId){const r=this.db.prepare('SELECT receipt FROM callback_events WHERE profile_id=? AND event_id=?').get(profileId,eventId);return parse(r?.receipt);}
  audit({offset=0,limit=100}={}){
    integer(offset,'offset');integer(limit,'limit',1,200);const total=this.db.prepare('SELECT count(*) n FROM audit').get().n;
    const rows=this.db.prepare('SELECT * FROM audit ORDER BY sequence DESC LIMIT ? OFFSET ?').all(limit,offset);
    return {total,offset,limit,nextOffset:offset+rows.length<total?offset+rows.length:null,items:rows.map(r=>({sequence:r.sequence,revision:r.workspace_revision,requestId:r.request_id,kind:r.kind,at:r.at,value:parse(r.json)}))};
  }
  async exportDatabase(destination){
    this.assertOpen();const target=resolve(destination);mkdirSync(dirname(target),{recursive:true,mode:0o700});
    const fd=openSync(target,'wx',0o600);closeSync(fd);
    const source=new DatabaseSync(this.file,{readOnly:true,timeout:5000});
    try{
      source.exec('BEGIN');const selected=source.prepare('SELECT * FROM meta WHERE singleton=1').get();
      await backup(source,target);source.exec('COMMIT');
      return {path:target,workspaceId:selected.workspace_id,originId:selected.origin_id,revision:selected.revision};
    }catch(error){try{unlinkSync(target);}catch{}throw error;}finally{try{source.close();}catch{}}
  }
  close(){if(this.closed)return;this.db.close();this.closed=true;}
}
function objectEnvelope(envelope){
  assert(envelope && typeof envelope==='object'&&!Array.isArray(envelope),'INVALID_REQUEST','Use the original request envelope.');
  const allowed=['workspaceId','requestId','expectedRevision','actor','command','payload'];
  assert(Object.keys(envelope).every(k=>allowed.includes(k))&&allowed.every(k=>Object.hasOwn(envelope,k)),'INVALID_REQUEST','Request fields are workspaceId, requestId, expectedRevision, actor, command and payload.');
  id(envelope.workspaceId,'workspaceId');id(envelope.requestId,'requestId');id(envelope.command,'command');text(envelope.actor,'actor');integer(envelope.expectedRevision,'expectedRevision');
  canonical(envelope.payload);
}

export function inspectRozoWorkspace(directory){
  const workspace=new RozoWorkspace(directory,{readOnly:true});
  try{const m=workspace.meta();return {schema:'stellar-forge.rozo-workspace.v1',workspaceId:m.workspaceId,originId:m.originId,createdAt:m.createdAt,revision:m.revision,databaseSchema:m.schema};}finally{workspace.close();}
}
