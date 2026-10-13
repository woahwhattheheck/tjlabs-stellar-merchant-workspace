// SPDX-License-Identifier: MIT
// Browser drafts and original request intents only; the maintained Bank controller owns all source work.
export const DESK_SCHEMA='stellar-forge.bank-source-desk.v1';
const copy=value=>structuredClone(value);
const fail=(code,message,extra={})=>Object.assign(new Error(message),{code,...extra});
const ordered=v=>Array.isArray(v)?v.map(ordered):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const digest=value=>JSON.stringify(ordered(value));
export function openSourceDeskState({workspaceId,origin=location.origin,indexedDB=globalThis.indexedDB,namespace='source-preparation-desk',schema=DESK_SCHEMA}={}){
 const reviewNamespace=/^source-review:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(namespace);
 if(!((namespace==='source-preparation-desk'&&schema===DESK_SCHEMA)||(reviewNamespace&&schema==='stellar-forge.bank-source-review.v1.desk')))throw fail('STORAGE_NAMESPACE','Use the original desk or an explicitly separate source-review case.');
 const deskSchema=schema;
 if(!/^[a-f0-9]{64}$/.test(workspaceId))throw fail('WORKSPACE','Open the actual accounting workspace before retaining a request.');
 const prefix='merchant-bank:'+workspaceId+':'+namespace+':'+origin;
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
    const result=request.result??{schema:deskSchema,workspaceId,origin,revision:0,draft:null,pending:null,operations:[],selected:null};
    if(result.schema!==deskSchema||result.workspaceId!==workspaceId||result.origin!==origin||!Number.isSafeInteger(result.revision)){
     reject(fail('STORAGE_BINDING','The retained desk belongs to another workspace or source format.'));return;
    }resolve(copy(result));
   };request.onerror=()=>reject(request.error);
  });
 }
 async function save(value,expectedRevision){
  if(value.schema!==deskSchema||value.workspaceId!==workspaceId||value.origin!==origin)throw fail('STORAGE_BINDING','Retain the original desk identity.');
  const snapshot=copy(value),database=await db(),conflictId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const tx=database.transaction('records','readwrite'),store=tx.objectStore('records');let conflict,output;
   const request=store.get(prefix);
   request.onsuccess=()=>{
    const current=request.result,revision=current?.revision??0;
    if(revision!==expectedRevision){
     conflict={schema:deskSchema+'.conflict',workspaceId,origin,expectedRevision,actualRevision:revision,at:new Date().toISOString(),snapshot};
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
   const tx=database.transaction('records','readwrite');tx.objectStore('records').put({schema:deskSchema+'.conflict',workspaceId,origin,at:new Date().toISOString(),snapshot},prefix+':conflict:'+id);
   tx.oncomplete=()=>resolve(id);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 function conflictKey(id){if(typeof id!=='string'||!(/^[0-9a-f-]{36}$/).test(id))throw fail('CONFLICT_ID','Select the original retained conflict.');return prefix+':conflict:'+id;}
 function verifyConflict(value){
  if(!value||value.schema!==deskSchema+'.conflict'||value.workspaceId!==workspaceId||value.origin!==origin||value.snapshot?.schema!==deskSchema||value.snapshot.workspaceId!==workspaceId||value.snapshot.origin!==origin)throw fail('STORAGE_BINDING','This retained conflict belongs to another workspace or source format.');
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

/** Enumerate only the actual saved review cases at this origin; no replacement case index. */
export async function listSourceReviewDesks({origin=location.origin,indexedDB=globalThis.indexedDB,after=null,limit=20}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||after!==null&&typeof after!=='string')throw fail('PAGE','Use a bounded page of retained review cases.');
 if(!indexedDB)throw fail('STORAGE','IndexedDB is required for retained review cases.');
 const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('stellar-forge-bank-reconciliation-v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('records'))r.result.createObjectStore('records');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{
  const tx=database.transaction('records','readonly'),range=IDBKeyRange.bound(after??'merchant-bank:','merchant-bank:\uffff',after!==null,false),r=tx.objectStore('records').openCursor(range),items=[];let last=null,scanned=0,more=false;
  r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;const row=cursor.value;last=String(cursor.key);scanned++;
   if(row?.schema==='stellar-forge.bank-source-review.v1.desk'&&row.origin===origin&&row.package?.issue?.id===row.caseId&&/^[a-f0-9]{64}$/.test(row.workspaceId)&&last==='merchant-bank:'+row.workspaceId+':source-review:'+row.caseId+':'+origin)items.push({key:last,workspaceId:row.workspaceId,caseId:row.caseId,revision:row.revision,author:row.package.issue.author,recipient:row.package.issue.recipient,createdAt:row.package.issue.createdAt,purpose:row.package.issue.purpose,editions:row.package.editions?.length??0,returns:row.returns?.length??0,decisions:row.decisions?.length??0});
   if(items.length>=limit||scanned>=1000){more=true;return;}cursor.continue();
  };
  tx.oncomplete=()=>resolve({items,nextCursor:more?last:null});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{database.close();}
}
