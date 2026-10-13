// SPDX-License-Identifier: MIT
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {acquireStateLease} from '../../merchant-fleet-gateway/state-lease.mjs';
import {privateDirectory,privateSqliteFile} from '../open-meteo-operations/files.mjs';
import {need,encoded,sha,canonical,now,newId,verifyEnvelope,MAX_BODY,MAX_PACKAGE} from './contract.mjs';

export async function openStore(directory){
 await privateDirectory(directory,{create:true});const lease=await acquireStateLease(directory);let db;
 try{
  const path=join(directory,'airgradient.sqlite');await privateSqliteFile(path);db=new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);'+
   'CREATE TABLE IF NOT EXISTS objects (kind TEXT NOT NULL,id TEXT NOT NULL,sha256 TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id));'+
   'CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,body BLOB NOT NULL,metadata TEXT NOT NULL);'+
   'CREATE TABLE IF NOT EXISTS tasks (plan_id TEXT NOT NULL,task_key TEXT NOT NULL,status TEXT NOT NULL,capture_id TEXT,error TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(plan_id,task_key));'+
   'CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY,plan_id TEXT NOT NULL,task_key TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,status INTEGER,capture_id TEXT,error TEXT);'+
   'CREATE TABLE IF NOT EXISTS delivery_files (delivery_id TEXT NOT NULL,name TEXT NOT NULL,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,body BLOB,capture_id TEXT,PRIMARY KEY(delivery_id,name),CHECK((body IS NULL)!=(capture_id IS NULL)));');
  const get=db.prepare('SELECT value FROM metadata WHERE key=?'),set=db.prepare('INSERT INTO metadata(key,value)VALUES(?,?) ON CONFLICT(key)DO UPDATE SET value=excluded.value');
  if(!get.get('schema')){set.run('schema','stellar-forge.airgradient-store.v1');set.run('workspace_id',newId('workspace'));}
  need(get.get('schema').value==='stellar-forge.airgradient-store.v1','WORKSPACE_VERSION_UNSUPPORTED');
  db.prepare("UPDATE tasks SET status='INTERRUPTED',error='ACQUISITION_INTERRUPTED',updated_at=? WHERE status='RUNNING'").run(now());
  const assert=()=>lease.assertHeld();
  function transaction(fn){assert();db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  function object(kind,id){assert();const row=db.prepare('SELECT body FROM objects WHERE kind=? AND id=?').get(kind,id);return row?JSON.parse(row.body):null;}
  function put(kind,value){
   assert();verifyEnvelope(value,kind);const existing=object(kind,value.id);if(existing){need(existing.sha256===value.sha256,'IMMUTABLE_OBJECT_COLLISION');return existing;}
   db.prepare('INSERT INTO objects(kind,id,sha256,body)VALUES(?,?,?,?)').run(kind,value.id,value.sha256,canonical(value));return value;
  }
  function capture(id){
   assert();const row=db.prepare('SELECT body,metadata,sha256 FROM captures WHERE id=?').get(id);need(row,'CAPTURE_NOT_FOUND');
   const raw=Buffer.from(row.body),metadata=JSON.parse(row.metadata);need(sha(raw)===row.sha256&&raw.length===metadata.bytes&&metadata.rawSha256===row.sha256,'CAPTURE_BYTES_CHANGED');return {metadata,raw};
  }
  function putCapture(metadata,raw){
   assert();verifyEnvelope(metadata,'capture');need(raw.length<=MAX_BODY&&raw.length===metadata.bytes&&sha(raw)===metadata.rawSha256,'CAPTURE_BYTES_CHANGED');
   const previous=db.prepare('SELECT metadata FROM captures WHERE id=?').get(metadata.id);
   if(previous){need(JSON.parse(previous.metadata).sha256===metadata.sha256,'CAPTURE_ID_COLLISION');return metadata;}
   db.prepare('INSERT INTO captures(id,sha256,body,metadata)VALUES(?,?,?,?)').run(metadata.id,metadata.rawSha256,raw,canonical(metadata));return metadata;
  }
  function tasks(planId){assert();return db.prepare('SELECT * FROM tasks WHERE plan_id=? ORDER BY rowid').all(planId);}
  function task(planId,key){assert();return db.prepare('SELECT * FROM tasks WHERE plan_id=? AND task_key=?').get(planId,key);}
  function setTask(planId,key,status,{captureId=null,error=null,updatedAt=now()}={}){
   assert();db.prepare('INSERT INTO tasks(plan_id,task_key,status,capture_id,error,updated_at)VALUES(?,?,?,?,?,?) ON CONFLICT(plan_id,task_key)DO UPDATE SET status=excluded.status,capture_id=excluded.capture_id,error=excluded.error,updated_at=excluded.updated_at').run(planId,key,status,captureId,error,updatedAt);
  }
  function retainedDeliveryFiles(id){
   const request=verifyEnvelope(object('delivery-request',id),'delivery-request');
   const rows=db.prepare('SELECT * FROM delivery_files WHERE delivery_id=? ORDER BY rowid').all(id);
   need(Array.isArray(request.files)&&rows.length===request.files.length,'DELIVERY_SNAPSHOT_INCOMPLETE');
   return rows.map((row,i)=>{
    const selected=request.files[i];need(selected.name===row.name&&selected.bytes===row.bytes&&selected.sha256===row.sha256,'DELIVERY_SNAPSHOT_CHANGED');
    const bytes=row.capture_id===null?Buffer.from(row.body):capture(row.capture_id).raw;
    need(bytes.length===row.bytes&&sha(bytes)===row.sha256,'DELIVERY_SNAPSHOT_BYTES_CHANGED');return {name:row.name,bytes};
   });
  }
  function retainDeliveryFiles(request,files){
   verifyEnvelope(request,'delivery-request');
   return transaction(()=>{
    const existing=object('delivery-request',request.id);
    if(existing){
     need(existing.workspaceId===request.workspaceId&&existing.directory===request.directory&&existing.reportId===request.reportId&&existing.reportSha256===request.reportSha256,'DELIVERY_SELECTION_CHANGED');
     return existing;
    }
    need(request.workspaceId===get.get('workspace_id').value&&Array.isArray(request.files)&&request.files.length===files.length&&files.length>0&&files.length<=65534,'DELIVERY_SNAPSHOT_CHANGED');
    need(files.reduce((total,file)=>total+file.bytes.length,0)<=MAX_PACKAGE,'DELIVERY_TOO_LARGE');
    const names=new Set(),insert=db.prepare('INSERT INTO delivery_files(delivery_id,name,sha256,bytes,body,capture_id)VALUES(?,?,?,?,?,?)');
    put('delivery-request',request);
    for(let i=0;i<files.length;i++){
     const file=files[i],selected=request.files[i];
     need(/^(?:sources\/)?[A-Za-z0-9_.-]+$/.test(file.name)&&!file.name.split('/').some(x=>x==='.'||x==='..')&&!names.has(file.name),'INVALID_DELIVERY_PATH');names.add(file.name);
     need(selected.name===file.name&&selected.bytes===file.bytes.length&&selected.sha256===sha(file.bytes),'DELIVERY_SNAPSHOT_CHANGED');
     const source=/^sources\/([^/]+)\.(?:json|response)$/.exec(file.name),saved=source?db.prepare('SELECT sha256,length(body) AS bytes FROM captures WHERE id=?').get(source[1]):null;
     const captureId=saved&&saved.sha256===selected.sha256&&saved.bytes===selected.bytes?source[1]:null;
     if(captureId!==null)need(sha(capture(captureId).raw)===selected.sha256,'DELIVERY_SOURCE_CHANGED');
     insert.run(request.id,file.name,selected.sha256,selected.bytes,captureId===null?file.bytes:null,captureId);
    }
    return request;
   });
  }
  const result={directory,workspaceId:get.get('workspace_id').value,assert,transaction,object,put,capture,putCapture,tasks,task,setTask,retainDeliveryFiles,retainedDeliveryFiles,
   meta(key){assert();return get.get(key)?.value??null;},setMeta(key,value){assert();set.run(key,value);},
   objects(kind){assert();return db.prepare('SELECT body FROM objects WHERE kind=? ORDER BY rowid').all(kind).map(x=>JSON.parse(x.body));},
   startAttempt(planId,key){
    const id=newId('attempt');transaction(()=>{db.prepare('INSERT INTO attempts(id,plan_id,task_key,started_at)VALUES(?,?,?,?)').run(id,planId,key,now());setTask(planId,key,'RUNNING');});return id;
   },
   markAttemptResponse(id,{status,captureId}){assert();db.prepare('UPDATE attempts SET status=?,capture_id=? WHERE id=? AND finished_at IS NULL').run(status,captureId,id);},
   finishAttempt(id,{status=null,captureId=null,error=null}){assert();db.prepare('UPDATE attempts SET finished_at=?,status=?,capture_id=?,error=? WHERE id=?').run(now(),status,captureId,error,id);},
   attempts(planId){assert();return db.prepare('SELECT * FROM attempts WHERE plan_id=? ORDER BY started_at,id').all(planId);},
   importAttempt(value){
    assert();const old=db.prepare('SELECT * FROM attempts WHERE id=?').get(value.id);
    if(old){
     need(['id','plan_id','task_key','started_at'].every(k=>old[k]===value[k]),'ATTEMPT_HISTORY_COLLISION');
     if(old.capture_id!==null&&value.capture_id!==null)need(old.capture_id===value.capture_id&&old.status===value.status,'ATTEMPT_RESPONSE_COLLISION');
     if(old.finished_at!==null&&value.finished_at===null)return;
     if(old.finished_at===null&&value.finished_at!==null){
      need(old.capture_id===null||old.capture_id===value.capture_id,'ATTEMPT_RESPONSE_COLLISION');
      db.prepare('UPDATE attempts SET finished_at=?,status=?,capture_id=?,error=? WHERE id=?').run(value.finished_at,value.status,value.capture_id,value.error,value.id);return;
     }
     if(old.finished_at===null&&value.finished_at===null){
      if(old.capture_id===null&&value.capture_id!==null){db.prepare('UPDATE attempts SET status=?,capture_id=? WHERE id=?').run(value.status,value.capture_id,value.id);return;}
      if(old.capture_id!==null&&value.capture_id===null)return;
     }
     need(canonical(old)===canonical(value),'ATTEMPT_HISTORY_COLLISION');return;
    }
    db.prepare('INSERT INTO attempts(id,plan_id,task_key,started_at,finished_at,status,capture_id,error)VALUES(?,?,?,?,?,?,?,?)').run(value.id,value.plan_id,value.task_key,value.started_at,value.finished_at,value.status,value.capture_id,value.error);
   },
   async close(){try{db?.close();}finally{await lease.close();}}
  };return result;
 }catch(error){try{db?.close();}finally{await lease.close();}throw error;}
}
