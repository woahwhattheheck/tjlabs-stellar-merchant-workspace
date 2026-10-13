// SPDX-License-Identifier: MIT
// Separate named PDF review custody; the original PDF/Bank stores remain their own authorities.
export const PDF_DESK_SCHEMA='stellar-forge.bank-pdf-review-desk.v1';
export const PDF_DESK_MAX_BYTES=768*1024*1024;
const copy=v=>structuredClone(v),error=(code,message,details={})=>Object.assign(new Error(message),{code,...details});
const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export function pdfDeskBytes(value){return new TextEncoder().encode(JSON.stringify(value)+'\n').length;}
export function checkPdfDesk(value){if(!value||value.schema!==PDF_DESK_SCHEMA||!validId(value.caseId)||value.record?.issue?.reviewId!==value.caseId||!/^[a-f0-9]{64}$/.test(value.record?.issue?.sha256||'')||!Number.isSafeInteger(value.storageRevision)||value.storageRevision<0||!Array.isArray(value.returns)||!Array.isArray(value.decisions)||!Array.isArray(value.priorRecords))throw error('PDF_DESK_FORMAT','Open the complete named PDF review desk.');const bytes=pdfDeskBytes(value);if(bytes>PDF_DESK_MAX_BYTES)throw error('PDF_DESK_CAPACITY','The whole desk exceeds 768 MiB. Preserve its full current download before creating a separate named review.',{bytes,limit:PDF_DESK_MAX_BYTES});return value;}
export function openPdfReviewStorage({origin=location.origin,indexedDB=globalThis.indexedDB}={}){
 let opening;
 function db(){if(!opening)opening=new Promise((resolve,reject)=>{if(!indexedDB){reject(error('PDF_REVIEW_STORAGE','IndexedDB is required for saved review custody'));return;}const r=indexedDB.open('stellar-forge-bank-pdf-named-review',1);r.onupgradeneeded=()=>{for(const name of['cases','metadata','conflicts','conflictMetadata'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(error('PDF_REVIEW_STORAGE','Close an older review tab to finish opening this database'));});return opening;}
 const key=id=>{if(!validId(id))throw error('PDF_REVIEW_ID','Select the exact named review');return origin+'|'+id;};
 function metadata(value){return {caseId:value.caseId,issueSha256:value.record.issue.sha256,author:value.record.issue.author,recipient:value.record.issue.recipient,purpose:value.record.issue.purpose,createdAt:value.record.issue.createdAt,storageRevision:value.storageRevision,editions:value.record.editions.length,returns:value.returns.length,decisions:value.decisions.length};}
 async function read(caseId){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('cases'),r=tx.objectStore('cases').get(key(caseId));r.onsuccess=()=>{try{resolve(r.result?copy(checkPdfDesk(r.result)):null);}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});}
 async function save(value,expectedRevision,{conflictOnly=false}={}){
  const snapshot=copy(checkPdfDesk(value)),database=await db(),conflictId=crypto.randomUUID(),caseKey=key(value.caseId);
  return new Promise((resolve,reject)=>{const tx=database.transaction(['cases','metadata','conflicts','conflictMetadata'],'readwrite'),cases=tx.objectStore('cases'),r=cases.get(caseKey);let conflict,output;
   r.onsuccess=()=>{const current=r.result;
    if(current&&current.record.issue.sha256!==snapshot.record.issue.sha256){tx.abort();return;}
    if(conflictOnly||(current?.storageRevision??0)!==expectedRevision){
     conflict={id:conflictId,caseId:snapshot.caseId,origin,at:new Date().toISOString(),expectedRevision,actualRevision:current?.storageRevision??0,snapshot};
     const ckey=caseKey+'|'+conflictId;tx.objectStore('conflicts').put(conflict,ckey);tx.objectStore('conflictMetadata').put({...metadata(snapshot),id:conflictId,at:conflict.at,expectedRevision,actualRevision:conflict.actualRevision},ckey);return;
    }
    output={...snapshot,storageRevision:expectedRevision+1};cases.put(output,caseKey);tx.objectStore('metadata').put(metadata(output),caseKey);
   };
   tx.oncomplete=()=>conflict?reject(error('PDF_REVIEW_CONFLICT','Another editor saved this review. This full local draft is retained as a separate conflict.',{conflictId,snapshot})):resolve(copy(output));
   tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||error('PDF_REVIEW_STORAGE','Save stopped; preserve this complete local working record.'));
  });
 }
 async function page(storeName,prefix,{after=null,limit=20}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||after!==null&&(typeof after!=='string'||!after.startsWith(prefix)))throw error('PDF_REVIEW_PAGE','Select a bounded original list page');
  const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(storeName),r=tx.objectStore(storeName).openCursor(IDBKeyRange.bound(after??prefix,prefix+'\uffff',after!==null,false)),items=[];let last=null,more=false;
   r.onsuccess=()=>{const c=r.result;if(!c)return;if(items.length===limit){more=true;return;}last=String(c.key);items.push({...c.value,key:last});c.continue();};
   tx.oncomplete=()=>resolve({items,nextCursor:more?last:null});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
 }
 async function conflict(caseId,id){
  if(!validId(id))throw error('PDF_REVIEW_ID','Choose the original retained conflict');
  const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('conflicts'),r=tx.objectStore('conflicts').get(key(caseId)+'|'+id);r.onsuccess=()=>{const row=r.result;if(!row||row.caseId!==caseId||row.origin!==origin){reject(error('PDF_REVIEW_CONFLICT','This retained conflict is unavailable in the original case'));return;}try{checkPdfDesk(row.snapshot);resolve(copy(row));}catch(e){reject(e);}};r.onerror=()=>reject(r.error);});
 }
 return {read,save,listCases:options=>page('metadata',origin+'|',options),listConflicts:(caseId,options)=>page('conflictMetadata',key(caseId)+'|',options),readConflict:conflict};
}
