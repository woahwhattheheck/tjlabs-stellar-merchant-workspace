// SPDX-License-Identifier: MIT
// Browser drafts and original request intents only; the maintained Bank controller owns all source work.
export const DESK_SCHEMA='stellar-forge.bank-source-desk.v1';
const copy=value=>structuredClone(value);
const fail=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
const ordered=v=>Array.isArray(v)?v.map(ordered):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const digest=value=>JSON.stringify(ordered(value));
export function openSourceDeskState({workspaceId,origin=location.origin,indexedDB=globalThis.indexedDB}={}){
 if(!/^[a-f0-9]{64}$/.test(workspaceId))throw fail('WORKSPACE','Open the actual accounting workspace before retaining a request.');
 const prefix='merchant-bank:'+workspaceId+':source-preparation-desk:'+origin;
 let opening;
 function db(){
  if(!opening)opening=new Promise((resolve,reject)=>{
   if(!indexedDB){reject(fail('STORAGE','IndexedDB is required for original request recovery.'));return;}
   const request=indexedDB.open('stellar-forge-bank-reconciliation-v1',1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('records'))request.result.createObjectStore('records');};
   request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
  });return opening;
 }
 async function read(){
  const database=await db();return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readonly'),request=tx.objectStore('records').get(prefix);
   request.onsuccess=()=>{
    const result=request.result??{schema:DESK_SCHEMA,workspaceId,origin,revision:0,draft:null,pending:null,operations:[],selected:null};
    if(result.schema!==DESK_SCHEMA||result.workspaceId!==workspaceId||result.origin!==origin||!Number.isSafeInteger(result.revision)){
     reject(fail('STORAGE_BINDING','The retained desk belongs to another workspace or source format.'));return;
    }resolve(copy(result));
   };request.onerror=()=>reject(request.error);
  });
 }
 async function save(value,expectedRevision){
  if(value.schema!==DESK_SCHEMA||value.workspaceId!==workspaceId||value.origin!==origin)throw fail('STORAGE_BINDING','Retain the original desk identity.');
  const snapshot=copy(value),database=await db(),conflictId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readwrite'),store=tx.objectStore('records');let conflict,output;
   const request=store.get(prefix);
   request.onsuccess=()=>{
    const current=request.result,revision=current?.revision??0;
    if(revision!==expectedRevision){
     conflict={schema:DESK_SCHEMA+'.conflict',workspaceId,origin,expectedRevision,actualRevision:revision,at:new Date().toISOString(),snapshot};
     store.put(conflict,prefix+':conflict:'+conflictId);return;
    }
    output={...snapshot,revision:revision+1};store.put(output,prefix);
   };
   tx.oncomplete=()=>{if(conflict)reject(fail('DRAFT_CONFLICT','Another page saved this desk. Your complete local draft and request were retained separately. Download them before reopening the current saved desk.',{conflictId,snapshot}));else resolve(copy(output));};
   tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??fail('STORAGE','Draft saving was interrupted.'));
  });
 }
 async function preserveConflict(value){
  const database=await db(),id=crypto.randomUUID(),snapshot=copy(value);
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readwrite');tx.objectStore('records').put({schema:DESK_SCHEMA+'.conflict',workspaceId,origin,at:new Date().toISOString(),snapshot},prefix+':conflict:'+id);
   tx.oncomplete=()=>resolve(id);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 function conflictKey(id){if(typeof id!=='string'||!(/^[0-9a-f-]{36}$/).test(id))throw fail('CONFLICT_ID','Select the original retained conflict.');return prefix+':conflict:'+id;}
 function verifyConflict(value){
  if(!value||value.schema!==DESK_SCHEMA+'.conflict'||value.workspaceId!==workspaceId||value.origin!==origin||value.snapshot?.schema!==DESK_SCHEMA||value.snapshot.workspaceId!==workspaceId||value.snapshot.origin!==origin)throw fail('STORAGE_BINDING','This retained conflict belongs to another workspace or source format.');
  return value;
 }
 async function readConflict(id){
  const database=await db();return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readonly'),request=tx.objectStore('records').get(conflictKey(id));let value,error;
   request.onsuccess=()=>{try{value=copy(verifyConflict(request.result));}catch(e){error=e;}};
   tx.oncomplete=()=>error?reject(error):resolve({id,...value});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 async function listConflicts({after=null,limit=20}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw fail('PAGE','Use 1–100 retained conflicts per page.');
  const start=prefix+':conflict:',lower=after===null?start:conflictKey(after),database=await db();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readonly'),range=IDBKeyRange.bound(lower,start+'\uffff',after!==null,false),request=tx.objectStore('records').openCursor(range);let error;const items=[];
   request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;try{const value=verifyConflict(cursor.value);items.push({id:String(cursor.key).slice(start.length),at:value.at,expectedRevision:value.expectedRevision??null,actualRevision:value.actualRevision??null,requestId:value.snapshot.draft?.request?.requestId??null,pendingRequestId:value.snapshot.pending?.request?.requestId??null,operations:Array.isArray(value.snapshot.operations)?value.snapshot.operations.length:0});if(items.length<=limit)cursor.continue();}catch(e){error=e;}};
   tx.oncomplete=()=>error?reject(error):resolve({items:items.slice(0,limit),nextCursor:items.length>limit?items[limit-1].id:null});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 return {workspaceId,origin,read,save,preserveConflict,listConflicts,readConflict};
}
export async function requestSha256(value){
 const canonical=v=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])])):v;
 const bytes=new TextEncoder().encode(JSON.stringify(canonical(value)));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function retainOperation(state,pending){
 const existing=state.operations.find(row=>row.request.requestId===pending.request.requestId);
 if(existing&&digest(existing.request)!==digest(pending.request))throw fail('REQUEST_CONFLICT','This original request ID already retains different content. Make an explicit new request instead.');
 const row=existing??{request:copy(pending.request),requestSha256:pending.requestSha256,createdAt:pending.createdAt,observations:[]};
 if(row.requestSha256!==pending.requestSha256)throw fail('REQUEST_CONFLICT','The retained request digest changed.');
 return {...state,pending:copy(pending),operations:state.operations.filter(x=>x.request.requestId!==row.request.requestId).concat(row)};
}
export function observeOperation(state,pending,result){
 if(!state.pending||digest(state.pending)!==digest(pending))throw fail('REQUEST_CONFLICT','A different pending request is now selected. Preserve this reply and reopen its original request.');
 if(result.workspaceId!==state.workspaceId||result.preparationId!==pending.request.requestId)throw fail('REPLY_BINDING','The original request returned a different workspace or preparation.');
 if(result.state!=='NOT_FOUND'&&(result.requestSha256!==pending.requestSha256||result.actor!==pending.request.actor||result.kind!==pending.request.kind))throw fail('REPLY_BINDING','The saved result differs from the original request.');
 const previous=state.operations.find(x=>x.request.requestId===pending.request.requestId);
 if(result.state!=='NOT_FOUND'&&((previous?.sourceSha256&&previous.sourceSha256!==result.sourceSha256)||pending.sourceSha256!==result.sourceSha256))throw fail('SOURCE_CHANGED','The original operating source binding changed.');
 const completed=result.state==='COMPLETE'||(pending.action==='prepare'&&result.state==='PREPARED');
 const row={...previous,sourceSha256:result.sourceSha256??previous?.sourceSha256,observations:[...(previous?.observations??[]),{at:new Date().toISOString(),action:pending.action,result:copy(result)}]};
 const draft=state.draft&&['PREPARED','COMPLETE'].includes(result.state)&&!state.draft.rawDirty&&digest(state.draft.request)===digest(pending.request)?{...state.draft,frozen:true}:state.draft;
 return {...state,draft,operations:state.operations.filter(x=>x.request.requestId!==row.request.requestId).concat(row),pending:completed?null:{...pending,observed:copy(result)},selected:copy(result)};
}
