// SPDX-License-Identifier: MIT
// Complete archive bytes and independent source-bound draft requests stay in IndexedDB.
const DB='starforge-bank-accountant-receiving-v1';
let selected,opening;
export async function openDatabase(){
 if(selected)return selected;if(opening)return opening;
 opening=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{for(const name of ['desks','archives','drafts'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:name==='archives'?'archiveId':'id'});};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);request.onblocked=()=>reject(new Error('Close an older accountant receiving tab before opening this desk.'));});
 try{selected=await opening;selected.onversionchange=()=>{selected.close();selected=null;};return selected;}finally{opening=null;}
}
function done(transaction){return new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onabort=()=>reject(transaction.error??Object.assign(new Error('The private desk changed in another tab. Reopen it before saving.'),{code:'DESK_CHANGED'}));transaction.onerror=()=>{};});}
function read(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
const draftKey=(id,requestId)=>id+':'+requestId;
export async function listDesks(){const db=await openDatabase(),tx=db.transaction('desks','readonly'),finished=done(tx),items=await read(tx.objectStore('desks').getAll());await finished;return items.map(x=>({id:x.id,name:x.review.name,generation:x.generation,revision:x.review.revision,archives:x.review.archives.length,updatedAt:x.updatedAt})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
export async function loadDesk(id){const db=await openDatabase(),tx=db.transaction(['desks','drafts'],'readonly'),finished=done(tx),[desk,all]=await Promise.all([read(tx.objectStore('desks').get(id)),read(tx.objectStore('drafts').getAll())]);await finished;return {desk,drafts:all.filter(x=>x.deskId===id&&x.value).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))};}
export async function loadArchive(archiveId){const db=await openDatabase(),tx=db.transaction('archives','readonly'),finished=done(tx),value=await read(tx.objectStore('archives').get(archiveId));await finished;if(!value)throw new Error('The complete original archive is missing from this private browser. Receive its saved review bundle.');return {filename:value.filename,raw:new Uint8Array(await value.raw.arrayBuffer())};}
export async function commitDesk(review,{expectedGeneration=null,archives=[],clearDraftId=null}={}){
 const db=await openDatabase(),tx=db.transaction(['desks','archives','drafts'],'readwrite'),finished=done(tx),store=tx.objectStore('desks');let failure=null;
 const request=store.get(review.id);request.onsuccess=()=>{const original=request.result;if((original?.generation??null)!==expectedGeneration){failure=Object.assign(new Error('Another tab saved this private desk. Your draft is retained; reopen the current desk before applying it.'),{code:'DESK_CHANGED'});tx.abort();return;}
 for(const archive of archives)tx.objectStore('archives').put({archiveId:archive.archiveId,filename:archive.filename,bytes:archive.bytes,raw:new Blob([archive.raw],{type:'application/x-tar'})});
 store.put({id:review.id,review,generation:(original?.generation??0)+1,updatedAt:new Date().toISOString()});if(clearDraftId)tx.objectStore('drafts').delete(draftKey(review.id,clearDraftId));};
 try{await finished;}catch(error){throw failure??error;}return loadDesk(review.id);
}
export async function saveDraft(id,value){if(!value?.requestId)throw new Error('Retain the original draft request identifier.');const db=await openDatabase(),tx=db.transaction('drafts','readwrite'),finished=done(tx);tx.objectStore('drafts').put({id:draftKey(id,value.requestId),deskId:id,requestId:value.requestId,value,updatedAt:new Date().toISOString()});await finished;}
export async function discardDraft(id,requestId){const db=await openDatabase(),tx=db.transaction('drafts','readwrite'),finished=done(tx);tx.objectStore('drafts').delete(draftKey(id,requestId));await finished;}
